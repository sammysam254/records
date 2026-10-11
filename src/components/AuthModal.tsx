import React, { useState } from 'react';
import { DataService } from '../services/dataService';
import type { UserProfile } from '../types';
import { 
  UserPlus, 
  LogIn, 
  CheckCircle2, 
  Phone, 
  Mail, 
  Lock, 
  Globe, 
  KeyRound, 
  User, 
  X
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  onShowToast: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast
}) => {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  
  // Registration Form State
  const [fullName, setFullName] = useState('Samson Matata Mwinzi');
  const [phone, setPhone] = useState('0712345678');
  const [email, setEmail] = useState('samson@records.io');
  const [password, setPassword] = useState('pass12345');
  const [deviceUrl, setDeviceUrl] = useState('https://workstation.cloud/device/sm-7701');
  const [devicePin, setDevicePin] = useState('8492');
  
  // OTP Verification State
  const [otpCode, setOtpCode] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [lastSentCode, setLastSentCode] = useState<string | null>(null);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Step 1: Send SMS OTP
  const handleSendOtp = async () => {
    if (!fullName.trim() || !phone.trim()) {
      alert('Please enter your full name and phone number first.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await DataService.sendRegistrationOTP(phone, fullName);
      if (res.success) {
        setIsOtpSent(true);
        if (res.code) setLastSentCode(res.code);
        onShowToast(`Verification SMS dispatched to ${phone}! Code: ${res.code || 'Sent via SMS'}`);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(err.message || 'Error sending OTP');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Step 2: Verify SMS OTP
  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) {
      alert('Please enter the 6-digit code received via SMS.');
      return;
    }

    setIsVerifyingOtp(true);
    try {
      const ok = await DataService.verifyRegistrationOTP(phone, otpCode);
      if (ok) {
        setIsPhoneVerified(true);
        onShowToast(`Phone number verified successfully!`);
      } else {
        alert('Invalid or expired verification code. Please check SMS or resend.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Complete Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneVerified) {
      alert('Please verify your phone number via SMS code before registering.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await DataService.registerWorker({
        fullName,
        phoneNumber: phone,
        email,
        password,
        deviceUrl,
        devicePin,
        isPhoneVerified: true
      });

      if (res.success && res.worker) {
        onShowToast(`Account created for ${res.worker.full_name}!`);
        onSuccess(res.worker);
        onClose();
      } else {
        alert(res.error || 'Registration failed');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const workers = await DataService.getWorkers();
      const found = workers.find(w => w.email.toLowerCase() === loginEmail.toLowerCase());
      if (found) {
        DataService.setCurrentUser(found);
        onShowToast(`Welcome back, ${found.full_name}!`);
        onSuccess(found);
        onClose();
      } else {
        alert('Worker account not found with this email.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 8, 14, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1rem'
    }}>
      <div className="glass-panel" style={{
        maxWidth: '560px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '2rem',
        position: 'relative'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        {/* Header Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
          <button
            onClick={() => setMode('register')}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: 700,
              fontSize: '0.95rem',
              background: 'none',
              border: 'none',
              borderBottom: mode === 'register' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              color: mode === 'register' ? 'var(--accent-cyan)' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <UserPlus size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Worker Registration
          </button>
          <button
            onClick={() => setMode('login')}
            style={{
              padding: '0.5rem 1rem',
              fontWeight: 700,
              fontSize: '0.95rem',
              background: 'none',
              border: 'none',
              borderBottom: mode === 'login' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              color: mode === 'login' ? 'var(--accent-cyan)' : 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <LogIn size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Worker Login
          </button>
        </div>

        {/* REGISTRATION FORM */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            
            {/* Full Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Full Name (Appears in SMS: Hello [Full Name]) *
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  required
                  placeholder="e.g. Samson Matata Mwinzi"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            {/* Active Phone Number with SMS Verification */}
            <div style={{ background: 'rgba(6, 182, 212, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8' }}>
                  Active Phone Number (SMS Verification Required) *
                </label>
                {isPhoneVerified && (
                  <span className="badge badge-approved" style={{ fontSize: '0.7rem' }}>
                    <CheckCircle2 size={12} /> Verified
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Phone size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    type="tel"
                    required
                    disabled={isPhoneVerified}
                    placeholder="0712345678 or 254712345678"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem', fontFamily: 'var(--font-mono)' }}
                  />
                </div>
                {!isPhoneVerified && (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={isSendingOtp}
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}
                  >
                    {isSendingOtp ? 'Sending...' : isOtpSent ? 'Resend SMS' : 'Send Code'}
                  </button>
                )}
              </div>

              {/* OTP Code Input */}
              {isOtpSent && !isPhoneVerified && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value)}
                    className="form-input"
                    style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.2em', textAlign: 'center' }}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={isVerifyingOtp}
                    className="btn-success"
                    style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}
                  >
                    {isVerifyingOtp ? 'Checking...' : 'Verify Code'}
                  </button>
                </div>
              )}

              {lastSentCode && !isPhoneVerified && (
                <div style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)', marginTop: '0.4rem' }}>
                  💡 Test simulation helper: Verification code is <strong>{lastSentCode}</strong>
                </div>
              )}
            </div>

            {/* Assigned Device URL & PIN in Separate Boxes */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Assigned Device URL *
                </label>
                <div style={{ position: 'relative' }}>
                  <Globe size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    type="url"
                    required
                    placeholder="https://workstation.cloud/device/..."
                    value={deviceUrl}
                    onChange={e => setDeviceUrl(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Device PIN *
                </label>
                <div style={{ position: 'relative' }}>
                  <KeyRound size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    type="text"
                    required
                    placeholder="e.g. 8492"
                    value={devicePin}
                    onChange={e => setDevicePin(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem', fontFamily: 'var(--font-mono)' }}
                  />
                </div>
              </div>
            </div>

            {/* Email & Password */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Email Address *
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    type="email"
                    required
                    placeholder="worker@records.io"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Account Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>
            </div>

            {/* Submit Registration */}
            <button
              type="submit"
              disabled={isSubmitting || !isPhoneVerified}
              className="btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.85rem', justifyContent: 'center' }}
            >
              <UserPlus size={18} />
              {isSubmitting ? 'Registering Worker...' : 'Complete Worker Registration'}
            </button>

            {!isPhoneVerified && (
              <p style={{ fontSize: '0.75rem', color: '#fbbf24', textAlign: 'center' }}>
                ⚠️ You must verify your phone number via SMS OTP code before completing registration.
              </p>
            )}
          </form>
        )}

        {/* LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="email"
                  required
                  placeholder="samson@records.io"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
              style={{ width: '100%', padding: '0.85rem', justifyContent: 'center' }}
            >
              <LogIn size={18} />
              {isSubmitting ? 'Authenticating...' : 'Sign In to Dashboard'}
            </button>

            {/* Quick Demo Logins */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginBottom: '0.5rem' }}>
                Quick Demo Accounts:
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setLoginEmail('samson@records.io');
                    setLoginPassword('pass12345');
                  }}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem' }}
                >
                  Samson (Worker)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginEmail('faith@records.io');
                    setLoginPassword('pass12345');
                  }}
                  className="btn-secondary"
                  style={{ fontSize: '0.75rem' }}
                >
                  Faith (Worker)
                </button>
              </div>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
