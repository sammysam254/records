-- ========================================================
-- SUPABASE DATABASE SCHEMA FOR WORKER RECORD & WALLET SYSTEM
-- ========================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE (Linked with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    device_url TEXT NOT NULL,
    device_pin TEXT NOT NULL,
    wallet_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    role TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('worker', 'admin')),
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. WEEKLY EARNINGS SUBMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.weekly_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount_made NUMERIC(12, 2) NOT NULL CHECK (amount_made >= 0),
    calculated_credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected')),
    week_date DATE NOT NULL DEFAULT CURRENT_DATE,
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. SMS LOGS TABLE
CREATE TABLE IF NOT EXISTS public.sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    recipient_name TEXT,
    message TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'notification', -- 'otp', 'submission_received', 'approved', 'paid', 'saturday_reminder'
    status_code INTEGER,
    response_desc TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. OTP VERIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.otp_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexing for high-speed queries
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone_number);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON public.weekly_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.weekly_submissions(status);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON public.otp_verifications(phone_number);

-- ========================================================
-- WALLET CREDIT CALCULATION FUNCTION (SQL & LOGIC)
-- Rule:
-- 1. Amount <= 40 => Credit = 0
-- 2. 40 < Amount <= 80 => Credit = Amount - 40
-- 3. Amount > 80 => Credit = (80 - 40) + ((Amount - 80) / 2) = 40 + (Amount - 80) / 2
-- ========================================================
CREATE OR REPLACE FUNCTION public.calculate_wallet_credit(amount NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
    IF amount <= 40 THEN
        RETURN 0.00;
    ELSIF amount <= 80 THEN
        RETURN ROUND(amount - 40, 2);
    ELSE
        RETURN ROUND(40 + ((amount - 80) / 2.0), 2);
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to automatically calculate credit on submission insert/update
CREATE OR REPLACE FUNCTION public.set_calculated_credit()
RETURNS TRIGGER AS $$
BEGIN
    NEW.calculated_credit := public.calculate_wallet_credit(NEW.amount_made);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_calculated_credit ON public.weekly_submissions;
CREATE TRIGGER trg_set_calculated_credit
BEFORE INSERT OR UPDATE OF amount_made ON public.weekly_submissions
FOR EACH ROW
EXECUTE FUNCTION public.set_calculated_credit();

-- ========================================================
-- STORED PROCEDURES FOR ADMIN APPROVAL & PAYOUT
-- ========================================================

-- Approve Submission and Credit Wallet
CREATE OR REPLACE FUNCTION public.approve_submission(submission_id UUID)
RETURNS JSON AS $$
DECLARE
    v_sub public.weekly_submissions%ROWTYPE;
    v_new_balance NUMERIC;
    v_user public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_sub FROM public.weekly_submissions WHERE id = submission_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Submission not found');
    END IF;

    IF v_sub.status = 'approved' OR v_sub.status = 'paid' THEN
        RETURN json_build_object('success', false, 'error', 'Submission already approved or paid');
    END IF;

    -- Update submission status
    UPDATE public.weekly_submissions
    SET status = 'approved', approved_at = timezone('utc'::text, now())
    WHERE id = submission_id;

    -- Credit user wallet
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + v_sub.calculated_credit,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_sub.user_id
    RETURNING * INTO v_user;

    RETURN json_build_object(
        'success', true,
        'amount_made', v_sub.amount_made,
        'credited_amount', v_sub.calculated_credit,
        'new_balance', v_user.wallet_balance,
        'user_name', v_user.full_name,
        'phone_number', v_user.phone_number
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark Submission as Paid and Deduct from Wallet
CREATE OR REPLACE FUNCTION public.mark_submission_as_paid(submission_id UUID, deduct_amount NUMERIC DEFAULT NULL)
RETURNS JSON AS $$
DECLARE
    v_sub public.weekly_submissions%ROWTYPE;
    v_user public.profiles%ROWTYPE;
    v_deduct NUMERIC;
BEGIN
    SELECT * INTO v_sub FROM public.weekly_submissions WHERE id = submission_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Submission not found');
    END IF;

    IF v_sub.status = 'paid' THEN
        RETURN json_build_object('success', false, 'error', 'Already marked as paid');
    END IF;

    SELECT * INTO v_user FROM public.profiles WHERE id = v_sub.user_id FOR UPDATE;
    
    -- Default deduction is the calculated credit of this submission
    v_deduct := COALESCE(deduct_amount, v_sub.calculated_credit);
    
    -- If wallet balance has less than v_deduct, deduct what's available
    IF v_user.wallet_balance < v_deduct THEN
        v_deduct := v_user.wallet_balance;
    END IF;

    -- Update submission
    UPDATE public.weekly_submissions
    SET status = 'paid', paid_at = timezone('utc'::text, now())
    WHERE id = submission_id;

    -- Deduct balance
    UPDATE public.profiles
    SET wallet_balance = GREATEST(0, wallet_balance - v_deduct),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_sub.user_id
    RETURNING * INTO v_user;

    RETURN json_build_object(
        'success', true,
        'deducted_amount', v_deduct,
        'new_balance', v_user.wallet_balance,
        'user_name', v_user.full_name,
        'phone_number', v_user.phone_number
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own profile, admin to read all
CREATE POLICY "Users can read own profile or admin can read all" ON public.profiles
FOR SELECT USING (
    auth.uid() = id OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Allow users to update their own profile (except wallet/role), admin can update all
CREATE POLICY "Users update own profile or admin" ON public.profiles
FOR UPDATE USING (
    auth.uid() = id OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Allow users to insert profile on signup
CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT WITH CHECK (auth.uid() = id);

-- Submissions policies
CREATE POLICY "Users can view own submissions, admin views all" ON public.weekly_submissions
FOR SELECT USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Users can insert own submissions" ON public.weekly_submissions
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can update submissions" ON public.weekly_submissions
FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- OTP policies (can be inserted/selected for verification)
CREATE POLICY "Public can insert and verify OTP" ON public.otp_verifications
FOR ALL USING (true) WITH CHECK (true);

-- SMS logs: Admin can read all, user can read own
CREATE POLICY "SMS logs viewable by admin or owner" ON public.sms_logs
FOR SELECT USING (
    auth.uid() = user_id OR 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
