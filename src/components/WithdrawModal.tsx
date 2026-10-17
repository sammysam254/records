import React, { useState, useEffect } from 'react';
import type { UserProfile } from '../types';
import { DataService } from '../services/dataService';
import { isValidKenyanPhone, formatKenyanPhone } from '../services/smsService';
import {
  X,
  Wallet,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface WithdrawModalProps {
  isOpen: boolean;
  worker: UserProfile | null;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (msg: string) => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  worker,
  onClose,
  onSuccess,
  onShowToast
}) => {
  const [step, setStep] = useState<'form' | 'otp' | 'success'>('form');
  const [amountUsd, setAmountUsd] = useState<string>('');
  const [mpesaPhone, setMpesaPhone] = useState<string>('');
  const [otpCode, setOtpCode] = useState<string>('');
  
  // Loading & State flags
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [resendTimer, setResendTimer] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success transaction details
  const [txDetails, setTxDetails] = useState<{
    amount: number;
    fee: number;
    net: number;
    mpesaPhone: string;
    reference: string;
    newBalance: number;
  } | null>(null);

  // Transfer fee in USD ($0.83, equivalent to 100 KES internal fee)
  const FEE_USD = 0.83;

  // Initialize M-Pesa phone when modal opens
  useEffect(() => {
    if (isOpen && worker) {
      setStep('form');
      setAmountUsd('');
      setOtpCode('');
      setErrorMessage(null);
      setTxDetails(null);
      // Pre-fill with worker phone if valid Kenyan number
      const phone = worker.phone_number || '';
      if (phone.startsWith('254') && phone.length === 12) {
        setMpesaPhone('0' + phone.substring(3));
      } else if (phone.startsWith('0') && phone.length === 10) {
        setMpesaPhone(phone);
      } else {
        setMpesaPhone(phone);
      }
    }
  }, [isOpen, worker]);

  // Resend Countdown Timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendTimer]);

  if (!isOpen || !worker) return null;

  const numericAmount = parseFloat(amountUsd) || 0;
  const isMicro = numericAmount > 0 && numericAmount <= FEE_USD;
  const feeDisplay = isMicro ? 0.00 : (numericAmount > FEE_USD ? FEE_USD : 0.00);
  const netAmount = Math.max(0, Number((numericAmount - feeDisplay).toFixed(2)));
  const availableBalance = worker.wallet_balance || 0;

  // Quick Max button
  const handleSetMax = () => {
    if (availableBalance > 0) {
      setAmountUsd(availableBalance.toFixed(2));
      setErrorMessage(null);
    } else {
      setErrorMessage(`Your wallet balance is $0.00.`);
    }
  };

  // Step 1: Request OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (numericAmount <= 0) {
      setErrorMessage('Please enter a valid withdrawal amount.');
      return;
    }

    if (numericAmount > availableBalance) {
      setErrorMessage(`Insufficient wallet balance. You have $${availableBalance.toFixed(2)} available.`);
      return;
    }

    if (!isValidKenyanPhone(mpesaPhone)) {
      setErrorMessage('Please enter a valid Kenyan M-Pesa phone number (e.g. 0712345678 or 0112345678).');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await DataService.requestWithdrawalOtp(worker, numericAmount, mpesaPhone);
      if (res.success) {
        setStep('otp');
        setResendTimer(60);
        onShowToast(`Verification code sent via SMS to your registered account phone (${worker.phone_number})`);
      } else {
        setErrorMessage(res.error || 'Failed to dispatch verification code.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error sending verification code');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Step 2: Verify OTP & Process Withdrawal
  const handleVerifyAndWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length < 6) {
      setErrorMessage('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsVerifying(true);
    try {
      // 1. Verify OTP against account phone
      const isOtpValid = await DataService.verifyWithdrawalOtp(worker.phone_number, cleanOtp);
      if (!isOtpValid) {
        setErrorMessage('Invalid or expired verification code. Please check and try again.');
        setIsVerifying(false);
        return;
      }

      // 2. Process Paystack transfer
      const res = await DataService.processWithdrawal({
        worker,
        amountUsd: numericAmount,
        mpesaPhone
      });

      if (res.success && res.newBalance !== undefined) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });

        setTxDetails({
          amount: numericAmount,
          fee: FEE_USD,
          net: netAmount,
          mpesaPhone: formatKenyanPhone(mpesaPhone),
          reference: res.reference || `TRF_${Date.now()}`,
          newBalance: res.newBalance
        });

        setStep('success');
        onShowToast(`Withdrawal of $${numericAmount.toFixed(2)} disbursed to M-Pesa ${mpesaPhone}!`);
        onSuccess();
      } else {
        setErrorMessage(res.error || 'Failed to complete withdrawal.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Withdrawal processing failed');
    } finally {
      setIsVerifying(false);
    }
  };

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setIsSendingOtp(true);
    setErrorMessage(null);
    try {
      const res = await DataService.requestWithdrawalOtp(worker, numericAmount, mpesaPhone);
      if (res.success) {
        setResendTimer(60);
        onShowToast(`New verification code sent via SMS to ${worker.phone_number}`);
      } else {
        setErrorMessage(res.error || 'Failed to resend verification code.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error resending code');
    } finally {
      setIsSendingOtp(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div
        className="modal-container glass-panel"
        style={{
          maxWidth: '480px',
          width: '94%',
          padding: '1.75rem',
          position: 'relative',
          border: '1px solid var(--border-accent)',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96) 0%, rgba(10, 13, 20, 0.98) 100%)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: 'none',
            borderRadius: '8px',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '0.4rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          title="Close"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <Wallet size={22} color="var(--accent-cyan)" />
          </div>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              {step === 'form' && 'Withdraw to M-Pesa'}
              {step === 'otp' && 'Authorize Withdrawal'}
              {step === 'success' && 'Transfer Dispatched!'}
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
              {step === 'form' && 'Direct mobile money transfer to your M-Pesa wallet'}
              {step === 'otp' && `Verify OTP sent to your account number (${worker.phone_number})`}
              {step === 'success' && 'Funds have been disbursed to your M-Pesa account'}
            </p>
          </div>
        </div>

        {/* Error Message Alert */}
        {errorMessage && (
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: '10px',
              padding: '0.75rem 0.9rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              marginBottom: '1.25rem',
              color: '#fca5a5',
              fontSize: '0.82rem'
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ─── STEP 1: WITHDRAWAL FORM ─── */}
        {step === 'form' && (
          <form onSubmit={handleRequestOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Balance Badge Box */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Available Wallet Balance
                </span>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>
                  ${availableBalance.toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                onClick={handleSetMax}
                className="btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
              >
                Max Amount
              </button>
            </div>

            {/* Withdrawal Amount Input */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.35rem' }}>
                Withdrawal Amount ($ USD) *
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '0.9rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    fontWeight: 700,
                    fontSize: '1.1rem'
                  }}
                >
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  max={availableBalance}
                  required
                  placeholder="0.00"
                  value={amountUsd}
                  onChange={e => {
                    setAmountUsd(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="form-input"
                  style={{ paddingLeft: '2.4rem', fontSize: '1.15rem', fontWeight: 700 }}
                  autoFocus
                />
              </div>
            </div>

            {/* Target M-Pesa Phone Number */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.35rem' }}>
                Destination M-Pesa Phone Number *
              </label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '0.9rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)'
                  }}
                >
                  <Smartphone size={16} />
                </span>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 0712345678 or 0112345678"
                  value={mpesaPhone}
                  onChange={e => {
                    setMpesaPhone(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="form-input"
                  style={{ paddingLeft: '2.4rem' }}
                />
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.25rem', display: 'block' }}>
                Funds will be deposited directly to this registered M-Pesa line.
              </span>
            </div>

            {/* Transparent Fee Summary in USD (No exchange rate shown to worker) */}
            <div
              style={{
                background: 'rgba(10, 13, 20, 0.7)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                fontSize: '0.82rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Withdrawal Amount:</span>
                <strong style={{ color: '#f8fafc' }}>${numericAmount.toFixed(2)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                <span>Transfer Processing Fee:</span>
                {isMicro ? (
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>$0.00 (Waived)</span>
                ) : (
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>-${FEE_USD.toFixed(2)}</span>
                )}
              </div>
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '0.45rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline'
                }}
              >
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>Net Disbursed:</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                  ${netAmount.toFixed(2)}
                </div>
              </div>
            </div>

            {/* OTP Notice */}
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.2)',
                borderRadius: '10px',
                padding: '0.65rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                fontSize: '0.75rem',
                color: '#38bdf8'
              }}
            >
              <ShieldCheck size={16} style={{ flexShrink: 0 }} />
              <span>
                A 6-digit OTP will be sent to your account line <strong>{worker.phone_number}</strong> to authorize this disbursement.
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSendingOtp || numericAmount <= 0 || numericAmount > availableBalance}
              className="btn-primary"
              style={{ padding: '0.85rem', justifyContent: 'center', fontSize: '0.95rem' }}
            >
              {isSendingOtp ? (
                <>
                  <RefreshCw size={16} className="spin" /> Sending Verification Code...
                </>
              ) : (
                <>
                  Proceed to Verification <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}

        {/* ─── STEP 2: OTP VERIFICATION ─── */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyAndWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Payout Preview Card */}
            <div
              style={{
                background: 'rgba(10, 13, 20, 0.7)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block' }}>Destination M-Pesa</span>
                <strong style={{ fontSize: '0.95rem', color: '#f8fafc' }}>{mpesaPhone}</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block' }}>Net Disbursed</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--accent-emerald)' }}>${netAmount.toFixed(2)}</strong>
              </div>
            </div>

            {/* OTP Input */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc', marginBottom: '0.35rem', textAlign: 'center' }}>
                Enter 6-Digit Verification Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="••••••"
                value={otpCode}
                onChange={e => {
                  setOtpCode(e.target.value.replace(/\D/g, ''));
                  setErrorMessage(null);
                }}
                className="form-input"
                style={{
                  textAlign: 'center',
                  fontSize: '1.6rem',
                  letterSpacing: '0.45em',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  padding: '0.75rem'
                }}
                autoFocus
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.35rem', display: 'block', textAlign: 'center' }}>
                Code delivered via SMS to {worker.phone_number}
              </span>
            </div>

            {/* Resend Code Button & Timer */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
              {resendTimer > 0 ? (
                <span style={{ color: 'var(--text-dim)' }}>
                  Resend code in <strong style={{ color: 'var(--accent-cyan)' }}>{resendTimer}s</strong>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isSendingOtp}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-cyan)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    textDecoration: 'underline',
                    padding: 0
                  }}
                >
                  {isSendingOtp ? 'Resending...' : 'Resend Verification Code'}
                </button>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setStep('form')}
                className="btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                disabled={isVerifying}
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isVerifying || otpCode.length < 6}
                className="btn-primary"
                style={{ flex: 2, justifyContent: 'center', padding: '0.85rem' }}
              >
                {isVerifying ? (
                  <>
                    <RefreshCw size={16} className="spin" /> Disbursing Funds...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} /> Confirm &amp; Withdraw
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ─── STEP 3: SUCCESS CONFIRMATION ─── */}
        {step === 'success' && txDetails && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'center' }}>
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto'
              }}
            >
              <CheckCircle2 size={34} color="#10b981" />
            </div>

            <div>
              <h4 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f8fafc', marginBottom: '0.25rem' }}>
                Transfer Completed!
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Your withdrawal has been successfully executed via Paystack. Funds are deposited into your M-Pesa account.
              </p>
            </div>

            {/* Receipt Summary Box */}
            <div
              style={{
                background: 'rgba(10, 13, 20, 0.7)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '1rem',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                fontSize: '0.82rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>M-Pesa Number:</span>
                <strong style={{ color: '#f8fafc' }}>{txDetails.mpesaPhone}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Gross Withdrawn:</span>
                <span style={{ color: '#f8fafc', fontWeight: 600 }}>${txDetails.amount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Transfer Fee:</span>
                <span style={{ color: '#fbbf24', fontWeight: 600 }}>-${txDetails.fee.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Transaction Reference:</span>
                <span style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                  {txDetails.reference}
                </span>
              </div>
              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '0.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>New Wallet Balance:</span>
                <strong style={{ fontSize: '1.15rem', color: 'var(--accent-cyan)' }}>
                  ${txDetails.newBalance.toFixed(2)}
                </strong>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn-primary"
              style={{ width: '100%', padding: '0.85rem', justifyContent: 'center' }}
            >
              <Sparkles size={16} /> Return to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
