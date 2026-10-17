import type { UserProfile, WeeklySubmission, WithdrawalRecord } from '../types';
import { calculateWalletCredit } from '../utils/calculator';
import { extractDeviceSerial } from '../utils/deviceHelper';
import { SMSService, SMSTemplates, formatKenyanPhone, isValidKenyanPhone } from './smsService';
import { RedisService } from './redisService';
import { getSupabase } from './supabaseClient';

export const ADMIN_EMAIL = 'sammyseth260@gmail.com';

export const ADMIN_PROFILE: UserProfile = {
  id: 'admin_sammyseth',
  email: ADMIN_EMAIL,
  full_name: 'Administrator (Sammy Seth)',
  phone_number: '254706499848',
  device_url: 'https://admin.internal',
  device_serial: 'ADMIN-CONTROL-01',
  device_pin: '0000',
  wallet_balance: 0.0,
  role: 'admin',
  phone_verified: true,
  created_at: new Date().toISOString()
};

// ─── Storage Keys ───────────────────────────────────────────
const KEY_WORKERS     = 'records_workers_db';
const KEY_SUBMISSIONS = 'records_submissions_db';
const KEY_CURRENT     = 'records_active_user';
const KEY_WITHDRAWALS = 'records_withdrawals_db';

// ─── Helpers ─────────────────────────────────────────────────
export function isFakeWorker(w: Partial<UserProfile> | null | undefined): boolean {
  if (!w) return true;
  const email = (w.email || '').toLowerCase().trim();
  const id = (w.id || '').toLowerCase().trim();
  const phone = (w.phone_number || '').trim();
  // Filter out any legacy fake/seed users
  if (email.endsWith('@records.io')) return true;
  if (id.startsWith('usr_samson') || id.startsWith('usr_faith') || id.startsWith('usr_kevin')) return true;
  if (phone === '254712345678' || phone === '254722998877' || phone === '254799112233') return true;
  return false;
}

function localWorkers(): UserProfile[] {
  try {
    const raw = localStorage.getItem(KEY_WORKERS);
    if (!raw) return [];
    const list: UserProfile[] = JSON.parse(raw);
    const cleaned = list.filter(w => !isFakeWorker(w));
    if (cleaned.length !== list.length) {
      saveLocalWorkers(cleaned);
    }
    return cleaned;
  } catch { return []; }
}

function saveLocalWorkers(list: UserProfile[]) {
  const cleaned = list.filter(w => !isFakeWorker(w));
  localStorage.setItem(KEY_WORKERS, JSON.stringify(cleaned));
}

function localSubmissions(): WeeklySubmission[] {
  try {
    const raw = localStorage.getItem(KEY_SUBMISSIONS);
    if (!raw) return [];
    const list: WeeklySubmission[] = JSON.parse(raw);
    const cleaned = list.filter(s => {
      const id = (s.id || '').toLowerCase();
      const uid = (s.user_id || '').toLowerCase();
      if (id === 'sub_001' || id === 'sub_002' || id === 'sub_003') return false;
      if (uid.startsWith('usr_samson') || uid.startsWith('usr_faith') || uid.startsWith('usr_kevin')) return false;
      if (s.user && isFakeWorker(s.user)) return false;
      return true;
    });
    if (cleaned.length !== list.length) {
      saveLocalSubmissions(cleaned);
    }
    return cleaned;
  } catch { return []; }
}

function saveLocalSubmissions(list: WeeklySubmission[]) {
  localStorage.setItem(KEY_SUBMISSIONS, JSON.stringify(list));
}

export class DataService {
  // ─── Session ──────────────────────────────────────────────
  public static getCurrentUser(): UserProfile | null {
    try {
      const raw = localStorage.getItem(KEY_CURRENT);
      if (!raw) return null;
      const user: UserProfile = JSON.parse(raw);
      if (isFakeWorker(user)) {
        localStorage.removeItem(KEY_CURRENT);
        return null;
      }
      return user;
    } catch { return null; }
  }

  public static setCurrentUser(user: UserProfile | null): void {
    if (user && !isFakeWorker(user)) {
      localStorage.setItem(KEY_CURRENT, JSON.stringify(user));
    } else {
      localStorage.removeItem(KEY_CURRENT);
    }
  }

  public static isAdmin(user: UserProfile | null): boolean {
    return Boolean(user && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  }

  // ─── Init ─────────────────────────────────────────────────
  public static async init(): Promise<void> {
    // Purge any legacy fake/seed data from localStorage
    try {
      localWorkers();
      localSubmissions();
      const current = this.getCurrentUser();
      if (current && isFakeWorker(current)) {
        this.setCurrentUser(null);
      }
    } catch {
      // ignore
    }
  }

  // ─── GET WORKERS (Ultra-Fast Redis Cache + Auto DB Sync) ─────
  private static isRefreshingWorkers = false;

  public static async getWorkers(forceFresh: boolean = false): Promise<UserProfile[]> {
    // 1. Ultra-fast Redis Cache Check (sub-millisecond instant return)
    if (!forceFresh) {
      try {
        const cached = await RedisService.getCachedWorkers();
        if (cached && cached.length > 0) {
          saveLocalWorkers(cached);
          // Trigger asynchronous background refresh from database to keep cache completely synchronized
          this.refreshWorkersFromDbInBackground();
          return cached;
        }
      } catch (err) {
        console.warn('Redis workers cache check skipped:', err);
      }
    }

    // 2. Authoritative Database Fetch & Redis Self-Cleaning Reconciliation
    return await this.fetchAndSyncWorkersFromDb();
  }

  private static async refreshWorkersFromDbInBackground(): Promise<void> {
    if (this.isRefreshingWorkers) return;
    this.isRefreshingWorkers = true;
    try {
      await this.fetchAndSyncWorkersFromDb();
    } catch {
      // Background sync non-blocking
    } finally {
      this.isRefreshingWorkers = false;
    }
  }

  // Fetch from database, update Redis cache, and purge all stale keys
  public static async fetchAndSyncWorkersFromDb(): Promise<UserProfile[]> {
    // 1. Try serverless function (bypasses RLS using Supabase Admin)
    try {
      const resp = await fetch('/.netlify/functions/workers');
      if (resp.ok) {
        const workers: UserProfile[] = await resp.json();
        if (Array.isArray(workers)) {
          const realWorkers = workers.filter(w => !isFakeWorker(w));
          saveLocalWorkers(realWorkers);
          // Redis auto-cleans stale keys and caches the authoritative worker list
          await RedisService.syncAndCleanWorkers(realWorkers);
          return realWorkers;
        }
      }
    } catch {
      // Offline / local fallback
    }

    // 2. Direct Supabase query
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data) {
          const realWorkers: UserProfile[] = data
            .map((r: any) => ({
              id: r.id,
              email: r.email || '',
              full_name: r.full_name,
              phone_number: r.phone_number,
              device_url: r.device_url,
              device_serial: r.device_serial || extractDeviceSerial(r.device_url),
              device_pin: r.device_pin,
              wallet_balance: parseFloat(r.wallet_balance) || 0,
              role: r.role || 'worker',
              phone_verified: r.phone_verified,
              created_at: r.created_at
            }))
            .filter(w => !isFakeWorker(w));

          saveLocalWorkers(realWorkers);
          // Redis auto-cleans stale keys and caches the authoritative worker list
          await RedisService.syncAndCleanWorkers(realWorkers);
          return realWorkers;
        }
      } catch (err) {
        console.warn('Supabase getWorkers query error:', err);
      }
    }

    // 3. Fallback to localStorage cache
    return localWorkers();
  }

  // ─── UPDATE USER BALANCE DIRECTLY (ADMIN ACTION) ───────────
  public static async updateUserBalance(
    userId: string,
    newBalance: number,
    notifyUser: boolean = true,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const cleanBalance = Number(Math.max(0, newBalance).toFixed(2));
    const worker = await this.getWorkerById(userId);
    if (!worker) return { success: false, error: 'User profile not found' };

    // 1. Authoritative serverless update (bypasses RLS with Supabase Admin)
    try {
      await fetch('/.netlify/functions/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-balance', userId, balance: cleanBalance })
      });
    } catch {
      // offline / local fallback
    }

    const supabase = getSupabase();
    if (supabase) {
      try {
        await supabase
          .from('profiles')
          .update({ wallet_balance: cleanBalance, updated_at: new Date().toISOString() })
          .eq('id', userId);
      } catch (err: any) {
        console.warn('Supabase updateUserBalance error:', err);
      }
    }

    // Update localStorage cache
    const localWrks = localWorkers();
    const widx = localWrks.findIndex(w => w.id === userId);
    if (widx !== -1) {
      localWrks[widx].wallet_balance = cleanBalance;
      saveLocalWorkers(localWrks);
    }

    await RedisService.updateWalletBalance(userId, cleanBalance);

    const current = this.getCurrentUser();
    if (current && current.id === userId) {
      this.setCurrentUser({ ...current, wallet_balance: cleanBalance });
    }

    // Optionally notify user via SMS
    if (notifyUser && worker.phone_number) {
      const msg = `Hello ${worker.full_name}, your VertextPay wallet balance has been updated by administrator to $${cleanBalance.toFixed(2)}${reason ? ` (${reason})` : ''}.`;
      await SMSService.sendSMS({
        mobile: worker.phone_number,
        recipientName: worker.full_name,
        message: msg,
        messageType: 'custom',
        userId: worker.id
      });
    }

    return { success: true };
  }

  // ─── GET SINGLE WORKER ────────────────────────────────────
  public static async getWorkerById(id: string): Promise<UserProfile | null> {
    if (id === ADMIN_PROFILE.id) return ADMIN_PROFILE;

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();

        if (!error && data) {
          return {
            id: data.id,
            email: data.email || '',
            full_name: data.full_name,
            phone_number: data.phone_number,
            device_url: data.device_url,
            device_serial: data.device_serial || extractDeviceSerial(data.device_url),
            device_pin: data.device_pin,
            wallet_balance: parseFloat(data.wallet_balance) || 0,
            role: data.role,
            phone_verified: data.phone_verified,
            created_at: data.created_at
          };
        }
      } catch (err) {
        console.warn('Supabase getWorkerById failed:', err);
      }
    }

    const cached = await RedisService.getCachedProfile(id);
    if (cached) return cached;
    return localWorkers().find(w => w.id === id) || null;
  }

  // ─── SEND REGISTRATION OTP ────────────────────────────────
  public static async sendRegistrationOTP(phoneNumber: string, fullName: string): Promise<{ success: boolean; message: string }> {
    if (!isValidKenyanPhone(phoneNumber)) {
      return {
        success: false,
        message: `Invalid phone number: "${phoneNumber}". Please enter a valid Kenyan number like 0706499848.`
      };
    }

    const formatted = formatKenyanPhone(phoneNumber);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await RedisService.storeOTP(formatted, code);

    const message = SMSTemplates.otp(fullName || 'User', code);
    const smsRes = await SMSService.sendSMS({
      mobile: formatted,
      recipientName: fullName || 'User',
      message,
      messageType: 'otp'
    });

    if (!smsRes.success) {
      return { success: false, message: smsRes.description || 'Failed to send verification SMS.' };
    }

    return { success: true, message: `Verification code sent to ${formatted}.` };
  }

  // ─── VERIFY REGISTRATION OTP ──────────────────────────────
  public static async verifyRegistrationOTP(phoneNumber: string, code: string): Promise<boolean> {
    const formatted = formatKenyanPhone(phoneNumber);
    return await RedisService.verifyOTP(formatted, code);
  }

  // ─── REGISTER WORKER (Supabase Auth + Profile) ────────────
  public static async registerWorker(data: {
    fullName: string;
    phoneNumber: string;
    email: string;
    password?: string;
    deviceUrl: string;
    devicePin: string;
    isPhoneVerified: boolean;
  }): Promise<{ success: boolean; worker?: UserProfile; error?: string }> {
    const supabase = getSupabase();
    const formattedPhone = formatKenyanPhone(data.phoneNumber);
    const cleanEmail = data.email.toLowerCase().trim();
    const password = data.password || 'password123';

    const deviceSerial = extractDeviceSerial(data.deviceUrl);

    // 1. Try serverless function registration (securely registers via Supabase Admin)
    try {
      const resp = await fetch('/.netlify/functions/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          email: cleanEmail,
          password: password,
          fullName: data.fullName.trim(),
          phoneNumber: formattedPhone,
          deviceUrl: data.deviceUrl.trim(),
          deviceSerial: deviceSerial,
          devicePin: data.devicePin.trim(),
          isPhoneVerified: data.isPhoneVerified
        })
      });

      if (resp.ok) {
        const result = await resp.json();
        if (result.success && result.worker) {
          const worker: UserProfile = {
            ...result.worker,
            device_serial: result.worker.device_serial || deviceSerial
          };
          const workers = localWorkers();
          workers.unshift(worker);
          saveLocalWorkers(workers);
          await RedisService.cacheProfile(worker);
          this.setCurrentUser(worker);
          return { success: true, worker };
        }
      }
    } catch {
      // Fall through to direct Supabase registration
    }

    if (!supabase) {
      return { success: false, error: 'Database is not configured. Cannot register worker.' };
    }

    // 2. Direct Supabase Auth user creation
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: cleanEmail,
      password: password,
      options: {
        data: {
          full_name: data.fullName.trim(),
          phone_number: formattedPhone,
          device_url: data.deviceUrl.trim(),
          device_serial: deviceSerial,
          device_pin: data.devicePin.trim(),
          role: 'worker'
        }
      }
    });

    if (authError || !authData.user) {
      return { success: false, error: authError?.message || 'Failed to create account in Supabase.' };
    }

    const userId = authData.user.id;

    // 3. Insert profile into profiles table (ONLY valid columns)
    const { error: profileError } = await supabase.from('profiles').upsert([{
      id: userId,
      full_name: data.fullName.trim(),
      phone_number: formattedPhone,
      device_url: data.deviceUrl.trim(),
      device_pin: data.devicePin.trim(),
      wallet_balance: 0,
      role: 'worker',
      phone_verified: data.isPhoneVerified
    }]);

    if (profileError) {
      console.warn('Profile insert warning:', profileError.message);
    }

    const newWorker: UserProfile = {
      id: userId,
      email: cleanEmail,
      full_name: data.fullName.trim(),
      phone_number: formattedPhone,
      device_url: data.deviceUrl.trim(),
      device_serial: deviceSerial,
      device_pin: data.devicePin.trim(),
      wallet_balance: 0,
      role: 'worker',
      phone_verified: data.isPhoneVerified,
      created_at: new Date().toISOString()
    };

    // 4. Cache in localStorage + Redis
    const workers = localWorkers();
    workers.unshift(newWorker);
    saveLocalWorkers(workers);
    await RedisService.cacheProfile(newWorker);

    this.setCurrentUser(newWorker);
    return { success: true, worker: newWorker };
  }

  // ─── LOGIN (Supabase Auth) ─────────────────────────────────
  public static async loginWorker(email: string, password?: string): Promise<{ success: boolean; worker?: UserProfile; error?: string }> {
    const cleanEmail = email.toLowerCase().trim();
    const supabase = getSupabase();

    // 1. If password provided, authenticate against Supabase Auth
    if (supabase && password) {
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: password.trim()
        });

        if (!authError && authData.user) {
          const u = authData.user;
          const meta = u.user_metadata || {};

          let profileFromDb: any = null;
          try {
            const { data: pData } = await supabase.from('profiles').select('*').eq('id', u.id).single();
            if (pData) profileFromDb = pData;
          } catch {
            // ignore RLS error
          }

          const cached = await RedisService.getCachedProfile(u.id);

          const rawUrl = profileFromDb?.device_url || meta.device_url || cached?.device_url || '';
          const deviceSerial = profileFromDb?.device_serial || meta.device_serial || cached?.device_serial || extractDeviceSerial(rawUrl);

          const worker: UserProfile = {
            id: u.id,
            email: u.email || cleanEmail,
            full_name: profileFromDb?.full_name || meta.full_name || cached?.full_name || 'Worker',
            phone_number: profileFromDb?.phone_number || meta.phone_number || cached?.phone_number || '',
            device_url: rawUrl,
            device_serial: deviceSerial,
            device_pin: profileFromDb?.device_pin || meta.device_pin || cached?.device_pin || '',
            wallet_balance: parseFloat(profileFromDb?.wallet_balance ?? cached?.wallet_balance ?? 0) || 0,
            role: 'worker',
            phone_verified: true,
            created_at: profileFromDb?.created_at || u.created_at || new Date().toISOString()
          };

          this.setCurrentUser(worker);
          await RedisService.cacheProfile(worker);
          return { success: true, worker };
        }
      } catch (err) {
        console.warn('Supabase signInWithPassword error:', err);
      }
    }

    // 2. Query Netlify workers function (server-side Supabase admin lookup)
    try {
      const resp = await fetch('/.netlify/functions/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lookup', email: cleanEmail })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.worker) {
          this.setCurrentUser(data.worker);
          await RedisService.cacheProfile(data.worker);
          return { success: true, worker: data.worker };
        }
      }
    } catch {
      // offline / local fallback
    }

    // 3. Check Upstash Redis cache (by email)
    const redisWorker = await RedisService.getProfileByEmail(cleanEmail);
    if (redisWorker) {
      this.setCurrentUser(redisWorker);
      return { success: true, worker: redisWorker };
    }

    // 4. Fallback: check localStorage cache
    const cached = localWorkers().find(w => w.email.toLowerCase() === cleanEmail);
    if (cached) {
      this.setCurrentUser(cached);
      return { success: true, worker: cached };
    }

    return { success: false, error: 'No account found with this email. Please check your credentials or register first.' };
  }

  // ─── SUBMIT WEEKLY EARNINGS ───────────────────────────────
  public static async submitWeeklyEarnings(userId: string, amount: number): Promise<{ success: boolean; submission?: WeeklySubmission; error?: string }> {
    const worker = await this.getWorkerById(userId);
    if (!worker) return { success: false, error: 'Worker profile not found.' };

    const calculatedCredit = calculateWalletCredit(amount);
    let submissionId = 'sub_' + Math.random().toString(36).substring(2, 9);

    // 1. Authoritative serverless insert (bypasses RLS with Supabase Admin)
    try {
      const resp = await fetch('/.netlify/functions/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create-submission',
          userId,
          amountMade: amount,
          calculatedCredit,
          weekDate: new Date().toISOString().split('T')[0]
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        if (d.success && d.submission?.id) {
          submissionId = d.submission.id;
        }
      }
    } catch {
      // offline / local fallback
    }

    // Direct client fallback if serverless did not assign UUID
    if (submissionId.startsWith('sub_')) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data, error } = await supabase.from('weekly_submissions').insert([{
            user_id: userId,
            amount_made: Number(amount.toFixed(2)),
            calculated_credit: calculatedCredit,
            status: 'pending',
            week_date: new Date().toISOString().split('T')[0]
          }]).select().single();

          if (!error && data) {
            submissionId = data.id;
          }
        } catch (err) {
          console.warn('Supabase submission insert error:', err);
        }
      }
    }

    const newSub: WeeklySubmission = {
      id: submissionId,
      user_id: userId,
      amount_made: Number(amount.toFixed(2)),
      calculated_credit: calculatedCredit,
      status: 'pending',
      week_date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      user: worker
    };

    // Local cache
    const subs = localSubmissions();
    subs.unshift(newSub);
    saveLocalSubmissions(subs);
    await RedisService.cacheSubmissions(subs);

    // 1. Worker SMS confirmation
    const message = SMSTemplates.submissionReceived(worker.full_name, amount);
    await SMSService.sendSMS({
      mobile: worker.phone_number,
      recipientName: worker.full_name,
      message,
      messageType: 'submission_received',
      userId: worker.id
    });

    // 2. Admin SMS notification to 0706499848
    try {
      const serial = worker.device_serial || extractDeviceSerial(worker.device_url) || 'N/A';
      const adminMessage = SMSTemplates.adminPendingSubmissionAlert(
        'Administrator',
        worker.full_name,
        amount,
        calculatedCredit,
        serial,
        worker.phone_number
      );
      await SMSService.sendSMS({
        mobile: '254706499848',
        recipientName: 'Administrator',
        message: adminMessage,
        messageType: 'notification'
      });
    } catch (adminSmsErr) {
      console.warn('Failed to send admin submission notification SMS:', adminSmsErr);
    }

    return { success: true, submission: newSub };
  }

  // ─── GET SUBMISSIONS (Ultra-Fast Redis Cache + Auto DB Sync) ──
  private static isRefreshingSubmissions = false;

  public static async getSubmissions(forceFresh: boolean = false): Promise<WeeklySubmission[]> {
    // 1. Ultra-fast Redis Cache Check
    if (!forceFresh) {
      try {
        const cached = await RedisService.getCachedSubmissions();
        if (cached && cached.length > 0) {
          saveLocalSubmissions(cached);
          this.refreshSubmissionsFromDbInBackground();
          return cached;
        }
      } catch (err) {
        console.warn('Redis submissions cache check skipped:', err);
      }
    }

    // 2. Fetch fresh from Database and sync Redis
    return await this.fetchAndSyncSubmissionsFromDb();
  }

  private static async refreshSubmissionsFromDbInBackground(): Promise<void> {
    if (this.isRefreshingSubmissions) return;
    this.isRefreshingSubmissions = true;
    try {
      await this.fetchAndSyncSubmissionsFromDb();
    } catch {
      // Non-blocking
    } finally {
      this.isRefreshingSubmissions = false;
    }
  }

  public static async fetchAndSyncSubmissionsFromDb(): Promise<WeeklySubmission[]> {
    const supabase = getSupabase();

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('weekly_submissions')
          .select(`
            *,
            profiles:user_id (
              id, full_name, phone_number, email,
              device_url, device_pin, wallet_balance, role, phone_verified, created_at
            )
          `)
          .order('created_at', { ascending: false });

        if (!error && data) {
          const subs: WeeklySubmission[] = data
            .filter((s: any) => {
              if (s.id === 'sub_001' || s.id === 'sub_002' || s.id === 'sub_003') return false;
              if (s.profiles && isFakeWorker(s.profiles)) return false;
              return true;
            })
            .map((s: any) => ({
              id: s.id,
              user_id: s.user_id,
              amount_made: parseFloat(s.amount_made),
              calculated_credit: parseFloat(s.calculated_credit),
              status: s.status,
              week_date: s.week_date,
              created_at: s.created_at,
              approved_at: s.approved_at,
              paid_at: s.paid_at,
              user: s.profiles ? {
                id: s.profiles.id,
                email: s.profiles.email || '',
                full_name: s.profiles.full_name,
                phone_number: s.profiles.phone_number,
                device_url: s.profiles.device_url,
                device_serial: s.profiles.device_serial || extractDeviceSerial(s.profiles.device_url),
                device_pin: s.profiles.device_pin,
                wallet_balance: parseFloat(s.profiles.wallet_balance) || 0,
                role: s.profiles.role,
                phone_verified: s.profiles.phone_verified,
                created_at: s.profiles.created_at
              } : undefined
            }));

          saveLocalSubmissions(subs);
          // Sync & Clean Redis submissions cache
          await RedisService.syncAndCleanSubmissions(subs);
          return subs;
        }
      } catch (err) {
        console.warn('Supabase getSubmissions failed, using cache:', err);
      }
    }

    // Fallback: localStorage
    const local = localSubmissions();
    const workers = localWorkers();
    return local.map(s => ({ ...s, user: workers.find(w => w.id === s.user_id) }));
  }

  // ─── APPROVE SUBMISSION ───────────────────────────────────
  public static async approveSubmission(submissionId: string): Promise<{ success: boolean; error?: string }> {
    const subs = await this.getSubmissions();
    const sub = subs.find(s => s.id === submissionId);
    if (!sub) return { success: false, error: 'Submission not found' };
    if (sub.status !== 'pending') return { success: false, error: `Submission is already ${sub.status}` };

    const worker = await this.getWorkerById(sub.user_id);
    if (!worker) return { success: false, error: 'Worker profile not found' };

    const newBalance = Number((worker.wallet_balance + sub.calculated_credit).toFixed(2));

    // 1. First attempt authoritative serverless approval (bypasses RLS with Supabase Admin)
    let serverOk = false;
    try {
      const resp = await fetch('/.netlify/functions/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve-submission',
          submissionId,
          userId: worker.id,
          credit: sub.calculated_credit
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        if (d.success) serverOk = true;
      }
    } catch {
      // offline / local fallback
    }

    // 2. Direct client fallback if serverless was unavailable
    if (!serverOk) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase.from('weekly_submissions')
            .update({ status: 'approved', approved_at: new Date().toISOString() })
            .eq('id', submissionId);

          await supabase.from('profiles')
            .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
            .eq('id', worker.id);
        } catch (err) {
          console.warn('Supabase approve error:', err);
        }
      }
    }

    // 3. Update localStorage cache immediately
    const localSubs = localSubmissions();
    const idx = localSubs.findIndex(s => s.id === submissionId);
    if (idx !== -1) {
      localSubs[idx].status = 'approved';
      localSubs[idx].approved_at = new Date().toISOString();
      saveLocalSubmissions(localSubs);
    }

    const localWrks = localWorkers();
    const widx = localWrks.findIndex(w => w.id === worker.id);
    if (widx !== -1) {
      localWrks[widx].wallet_balance = newBalance;
      saveLocalWorkers(localWrks);
    }

    // 4. CRITICAL: Synchronize Redis submissions cache immediately so it never serves stale 'pending'
    await RedisService.syncAndCleanSubmissions(localSubs);
    await RedisService.updateWalletBalance(worker.id, newBalance);

    const current = this.getCurrentUser();
    if (current && current.id === worker.id) {
      this.setCurrentUser({ ...current, wallet_balance: newBalance });
    }

    // 5. SMS Notification
    const message = SMSTemplates.approvedAndCredited(
      worker.full_name, sub.amount_made, sub.calculated_credit, newBalance
    );
    await SMSService.sendSMS({
      mobile: worker.phone_number,
      recipientName: worker.full_name,
      message,
      messageType: 'approved',
      userId: worker.id
    });

    return { success: true };
  }

  // ─── MARK AS PAID ─────────────────────────────────────────
  public static async markSubmissionAsPaid(submissionId: string): Promise<{ success: boolean; error?: string }> {
    const subs = await this.getSubmissions();
    const sub = subs.find(s => s.id === submissionId);
    if (!sub) return { success: false, error: 'Submission not found' };
    if (sub.status === 'paid') return { success: false, error: 'Already marked as paid' };

    const worker = await this.getWorkerById(sub.user_id);
    if (!worker) return { success: false, error: 'Worker profile not found' };

    const deduction = sub.calculated_credit;
    const newBalance = Math.max(0, Number((worker.wallet_balance - deduction).toFixed(2)));

    // 1. Authoritative serverless mark-paid (bypasses RLS with Supabase Admin)
    let serverOk = false;
    try {
      const resp = await fetch('/.netlify/functions/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark-paid',
          submissionId,
          userId: worker.id,
          deductAmount: deduction
        })
      });
      if (resp.ok) {
        const d = await resp.json();
        if (d.success) serverOk = true;
      }
    } catch {
      // offline / local fallback
    }

    // 2. Direct client fallback
    if (!serverOk) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase.from('weekly_submissions')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', submissionId);

          await supabase.from('profiles')
            .update({ wallet_balance: newBalance, updated_at: new Date().toISOString() })
            .eq('id', worker.id);
        } catch (err) {
          console.warn('Supabase markAsPaid error:', err);
        }
      }
    }

    // 3. Update localStorage cache immediately
    const localSubs = localSubmissions();
    const idx = localSubs.findIndex(s => s.id === submissionId);
    if (idx !== -1) {
      localSubs[idx].status = 'paid';
      localSubs[idx].paid_at = new Date().toISOString();
      saveLocalSubmissions(localSubs);
    }

    const localWrks = localWorkers();
    const widx = localWrks.findIndex(w => w.id === worker.id);
    if (widx !== -1) {
      localWrks[widx].wallet_balance = newBalance;
      saveLocalWorkers(localWrks);
    }

    // 4. CRITICAL: Synchronize Redis submissions cache immediately
    await RedisService.syncAndCleanSubmissions(localSubs);
    await RedisService.updateWalletBalance(worker.id, newBalance);

    const current = this.getCurrentUser();
    if (current && current.id === worker.id) {
      this.setCurrentUser({ ...current, wallet_balance: newBalance });
    }

    // 5. SMS Notification
    const message = SMSTemplates.markedAsPaid(worker.full_name, deduction, newBalance);
    await SMSService.sendSMS({
      mobile: worker.phone_number,
      recipientName: worker.full_name,
      message,
      messageType: 'paid',
      userId: worker.id
    });

    return { success: true };
  }

  // ─── SATURDAY REMINDERS ───────────────────────────────────
  public static async sendSaturdayReminders(): Promise<{ sentCount: number; results: string[] }> {
    const workers = await this.getWorkers();
    const results: string[] = [];
    let sentCount = 0;

    for (const worker of workers) {
      if (worker.role !== 'worker') continue;
      const message = SMSTemplates.saturdayReminder(worker.full_name);
      const res = await SMSService.sendSMS({
        mobile: worker.phone_number,
        recipientName: worker.full_name,
        message,
        messageType: 'saturday_reminder',
        userId: worker.id
      });
      if (res.success) sentCount++;
      results.push(`${worker.full_name} (${worker.phone_number}): ${res.description}`);
    }

    return { sentCount, results };
  }

  // ─── WITHDRAWALS (Paystack M-Pesa + OTP Verification) ───────
  
  // Request 6-digit OTP sent to the worker's registered account phone
  public static async requestWithdrawalOtp(
    worker: UserProfile,
    amountUsd: number,
    mpesaPhone: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!worker) return { success: false, error: 'Worker profile is required' };

    if (amountUsd <= 0) {
      return { success: false, error: 'Please enter a valid withdrawal amount.' };
    }

    if (worker.wallet_balance < amountUsd) {
      return { success: false, error: `Insufficient wallet balance. You have $${worker.wallet_balance.toFixed(2)} available.` };
    }

    if (!isValidKenyanPhone(mpesaPhone)) {
      return { success: false, error: 'Please enter a valid Kenyan M-Pesa phone number (e.g. 07XXXXXXXX).' };
    }

    try {
      // 6-digit OTP
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const accountPhone = formatKenyanPhone(worker.phone_number);

      // Store in Redis (10 minutes TTL)
      await RedisService.storeOTP(`withdraw:${accountPhone}`, code);
      // Backup in localStorage
      localStorage.setItem(`otp_withdraw_${accountPhone}`, JSON.stringify({ code, expiresAt: Date.now() + 10 * 60 * 1000 }));

      // Dispatch SMS to account phone
      const smsMsg = SMSTemplates.withdrawalOtp(worker.full_name, code, amountUsd, mpesaPhone);
      const res = await SMSService.sendSMS({
        mobile: accountPhone,
        recipientName: worker.full_name,
        message: smsMsg,
        messageType: 'withdrawal_otp',
        userId: worker.id
      });

      if (!res.success) {
        return { success: false, error: res.description || 'Failed to dispatch verification OTP via SMS.' };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error sending withdrawal verification code' };
    }
  }

  // Verify the OTP code entered by the worker
  public static async verifyWithdrawalOtp(
    accountPhone: string,
    enteredCode: string
  ): Promise<boolean> {
    const formatted = formatKenyanPhone(accountPhone);
    const cleanCode = enteredCode.trim();

    // 1. Try Redis verification
    try {
      const ok = await RedisService.verifyOTP(`withdraw:${formatted}`, cleanCode);
      if (ok) return true;
    } catch {
      // fallback
    }

    // 2. Try generic Redis OTP
    try {
      const ok = await RedisService.verifyOTP(formatted, cleanCode);
      if (ok) return true;
    } catch {
      // fallback
    }

    // 3. Fallback localStorage check
    try {
      const local = localStorage.getItem(`otp_withdraw_${formatted}`);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed.code === cleanCode && Date.now() <= parsed.expiresAt) {
          localStorage.removeItem(`otp_withdraw_${formatted}`);
          return true;
        }
      }
    } catch {
      // ignore
    }

    return false;
  }

  // Process authorized withdrawal via Paystack transfer
  public static async processWithdrawal(params: {
    worker: UserProfile;
    amountUsd: number;
    mpesaPhone: string;
  }): Promise<{ success: boolean; newBalance?: number; reference?: string; error?: string }> {
    const { worker, amountUsd, mpesaPhone } = params;

    if (worker.wallet_balance < amountUsd) {
      return { success: false, error: `Insufficient wallet balance.` };
    }

    try {
      // Call Netlify serverless Paystack Transfer endpoint (keys read from Netlify environment variables)
      const resp = await fetch('/.netlify/functions/paystack-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: worker.id,
          amountUsd,
          mpesaPhone,
          workerName: worker.full_name,
          workerPhone: worker.phone_number
        })
      });

      const data = await resp.json();

      if (!resp.ok || !data.success) {
        return { success: false, error: data.error || 'Withdrawal processing failed' };
      }

      const newBalance = Number(data.newBalance.toFixed(2));
      const reference = data.reference;

      // Update worker wallet in local cache & Redis
      const localWrks = localWorkers();
      const widx = localWrks.findIndex(w => w.id === worker.id);
      if (widx !== -1) {
        localWrks[widx].wallet_balance = newBalance;
        saveLocalWorkers(localWrks);
      }

      await RedisService.updateWalletBalance(worker.id, newBalance);

      const current = this.getCurrentUser();
      if (current && current.id === worker.id) {
        this.setCurrentUser({ ...current, wallet_balance: newBalance });
      }

      // Record withdrawal in local storage
      const withdrawalRecord: WithdrawalRecord = {
        id: 'wth_' + Math.random().toString(36).substring(2, 9),
        user_id: worker.id,
        amount_usd: amountUsd,
        fee_usd: data.feeUsd || 0.83,
        mpesa_phone: data.mpesaPhone || mpesaPhone,
        paystack_ref: reference,
        paystack_status: data.status || 'completed',
        created_at: new Date().toISOString(),
        user: worker
      };

      try {
        const stored = JSON.parse(localStorage.getItem(KEY_WITHDRAWALS) || '[]');
        stored.unshift(withdrawalRecord);
        localStorage.setItem(KEY_WITHDRAWALS, JSON.stringify(stored));
      } catch {
        // ignore
      }

      // Send confirmation SMS to worker
      const successMsg = SMSTemplates.withdrawalSuccess(worker.full_name, amountUsd, mpesaPhone, newBalance);
      await SMSService.sendSMS({
        mobile: worker.phone_number,
        recipientName: worker.full_name,
        message: successMsg,
        messageType: 'withdrawal_success',
        userId: worker.id
      });

      return { success: true, newBalance, reference };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error processing withdrawal' };
    }
  }

  // Get withdrawal history for user or all
  public static async getWithdrawals(userId?: string): Promise<WithdrawalRecord[]> {
    // 1. Try serverless function
    try {
      const url = userId ? `/.netlify/functions/paystack-transfer?userId=${encodeURIComponent(userId)}` : '/.netlify/functions/paystack-transfer';
      const resp = await fetch(url);
      if (resp.ok) {
        const d = await resp.json();
        if (d.success && Array.isArray(d.withdrawals)) {
          return d.withdrawals.map((w: any) => ({
            id: w.id,
            user_id: w.user_id,
            amount_usd: parseFloat(w.amount_usd) || 0,
            fee_usd: parseFloat(w.fee_usd) || 0.83,
            mpesa_phone: w.mpesa_phone,
            paystack_ref: w.paystack_ref,
            paystack_status: w.paystack_status || 'completed',
            created_at: w.created_at,
            user: w.profiles ? {
              id: w.profiles.id,
              email: w.profiles.email || '',
              full_name: w.profiles.full_name,
              phone_number: w.profiles.phone_number,
              device_url: '',
              device_pin: '',
              wallet_balance: 0,
              role: 'worker',
              phone_verified: true,
              created_at: ''
            } : undefined
          }));
        }
      }
    } catch {
      // offline fallback
    }

    // 2. Local fallback
    try {
      const list: WithdrawalRecord[] = JSON.parse(localStorage.getItem(KEY_WITHDRAWALS) || '[]');
      if (userId) {
        return list.filter(w => w.user_id === userId);
      }
      return list;
    } catch {
      return [];
    }
  }
}

