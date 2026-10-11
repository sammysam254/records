import React, { useState } from 'react';
import { DataService, ADMIN_EMAIL, ADMIN_PROFILE } from '../services/dataService';
import { SMSService, SMSTemplates } from '../services/smsService';
import { RedisService } from '../services/redisService';
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
  X,
  ShieldCheck,
  MessageSquare
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
  onShowToast: (msg: string) => void;
}

// Admin phone number — OTP is sent here for admin login
const ADMIN_PHONE = '254786499848';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onShowToast
}) => {
  const [mode, setMode] = useState<'register' | 'login'>('login');
  
  // Registration Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [deviceUrl, setDeviceUrl] = useState('');
  const [devicePin, setDevicePin] = useState('');
  
  // OTP Verification State (Registration)
  const [otpCode, setOtpCode] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Admin OTP Login State
  const [adminOtpSent, setAdminOtpSent] = useState(false);
  const [adminOtpCode, setAdminOtpCode] = useState('');
  const [isSendingAdminOtp, setIsSendingAdminOtp] = useState(false);
  const [isVerifyingAdminOtp, setIsVerifyingAdminOtp] = useState(false);
  const [pendingAdminLogin, setPendingAdminLogin] = useState(false);

  if (!isOpen) return null;

  const resetAll = () => {
    setFullName(''); setPhone(''); setEmail(''); setPassword('');
    setDeviceUrl(''); setDevicePin(''); setOtpCode('');
    setIsOtpSent(false); setIsPhoneVerified(false);
    setLoginEmail(''); setLoginPassword('');
    setAdminOtpSent(false); setAdminOtpCode('');
    setPendingAdminLogin(false);
  };

  // ─── REGISTRATION: Step 1 — Send OTP to phone ───
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
        onShowToast(`Verification code sent via SMS to your phone. Check your messages.`);
      } else {
        alert(res.message);
      }
    } catch (err: any) {
      alert(err.message || 'Error sending OTP');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // ─── REGISTRATION: Step 2 — Verify OTP ───
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
        alert('Invalid or expired verification code. Please check SMS on your phone or resend.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // ─── REGISTRATION: Complete ───
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
        resetAll();
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

  // ─── LOGIN: Step 1 — Check credentials & trigger OTP for admin ───
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const cleanEmail = loginEmail.trim().toLowerCase();

      if (cleanEmail === ADMIN_EMAIL.toLowerCase()) {
        // Admin login requires SMS OTP to admin phone
        setPendingAdminLogin(true);
        setIsSubmitting(false);
        return;
      }

      // Worker login — email lookup
      const workers = await DataService.getWorkers();
      const found = workers.find(w => w.email.toLowerCase() === cleanEmail);
      if (found) {
        DataService.setCurrentUser(found);
        onShowToast(`Welcome back, ${found.full_name}!`);
        onSuccess(found);
        resetAll();
        onClose();
      } else {
        alert('No registered worker account found with this email address.');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── ADMIN OTP: Send OTP to admin's phone ───
  const handleSendAdminOtp = async () => {
    setIsSendingAdminOtp(true);
    try {
      // Generate OTP and store in Redis (10 min TTL)
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await RedisService.storeOTP(ADMIN_PHONE, code);

      // Send REAL SMS to admin's phone
      const message = SMSTemplates.otp('Sammy Seth', code);
      const smsRes = await SMSService.sendSMS({
        mobile: ADMIN_PHONE,
        recipientName: 'Sammy Seth',
        message,
        messageType: 'otp'
      });

      if (smsRes.success) {
        setAdminOtpSent(true);
        onShowToast('Admin verification code sent via SMS to your registered phone.');
      } else {
        alert(`Failed to send admin OTP: ${smsRes.description}`);
      }
    } catch (err: any) {
      alert(err.message || 'Error sending admin OTP');
    } finally {
      setIsSendingAdminOtp(false);
    }
  };

  // ─── ADMIN OTP: Verify code & grant access ───
  const handleVerifyAdminOtp = async () => {
    if (!adminOtpCode.trim()) {
      alert('Please enter the 6-digit code received on admin phone.');
      return;
    }

    setIsVerifyingAdminOtp(true);
    try {
      const ok = await RedisService.verifyOTP(ADMIN_PHONE, adminOtpCode);
      if (ok) {
        DataService.setCurrentUser(ADMIN_PROFILE);
        onShowToast('Welcome, Administrator (Sammy Seth)! Access granted.');
        onSuccess(ADMIN_PROFILE);
        resetAll();
        onClose();
      } else {
        alert('Invalid or expired admin verification code. Please resend or check your phone.');
      }
    } catch (err: any) {
      alert(err.message || 'Error verifying admin OTP');
    } finally {
      setIsVerifyingAdminOtp(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 8, 14, 0.88)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '1rem'
    }}>
      <div className="glass-panel" style={{
        maxWidth: '560px',
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '2rem',
        position: 'relative'
      }}>
        {/* Close Button */}
        <button
          onClick={() => { resetAll(); onClose(); }}
          style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        {/* Header Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.75rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem' }}>
          <button
            onClick={() => { setMode('login'); setPendingAdminLogin(false); setAdminOtpSent(false); }}
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
            Account Login
          </button>
          <button
            onClick={() => { setMode('register'); setPendingAdminLogin(false); }}
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
        </div>

        {/* ═══════════════════════════════════════════
            LOGIN FORM
        ═══════════════════════════════════════════ */}
        {mode === 'login' && !pendingAdminLogin && (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{
                  width: '56px', height: '56px',
                  borderRadius: '16px',
                  background: 'var(--gradient-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 0.75rem'
                }}>
                  <LogIn size={26} color="#fff" />
                </div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>Sign In</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.3rem' }}>
                  Workers: enter your registered email.<br />
                  Admin: enter <span style={{ color: '#a78bfa' }}>sammyseth260@gmail.com</span> to receive an SMS code.
                </p>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
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
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.3rem' }}>
                Admin login does not require a password — a verification code will be sent to the registered phone.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
              style={{ width: '100%', padding: '0.85rem', justifyContent: 'center' }}
            >
              <LogIn size={18} />
              {isSubmitting ? 'Authenticating...' : 'Continue'}
            </button>
          </form>
        )}

        {/* ═══════════════════════════════════════════
            ADMIN OTP VERIFICATION PANEL
        ═══════════════════════════════════════════ */}
        {mode === 'login' && pendingAdminLogin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px', height: '64px',
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1rem',
                boxShadow: '0 0 24px rgba(124, 58, 237, 0.4)'
              }}>
                <ShieldCheck size={30} color="#fff" />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#a78bfa' }}>
                Admin Verification Required
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem', lineHeight: 1.6 }}>
                To protect the administrator panel, a one-time verification code will be sent to the admin's registered phone via SMS.
              </p>
            </div>

            {/* Step 1: Send OTP */}
            {!adminOtpSent && (
              <div style={{ 
                background: 'rgba(124, 58, 237, 0.08)',
                border: '1px solid rgba(124, 58, 237, 0.25)',
                borderRadius: '12px',
                padding: '1.25rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <MessageSquare size={20} color="#a78bfa" />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Send SMS Verification Code</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      A code will be sent to the admin's registered phone number.
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleSendAdminOtp}
                  disabled={isSendingAdminOtp}
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                >
                  <MessageSquare size={16} />
                  {isSendingAdminOtp ? 'Sending SMS...' : 'Send Verification Code via SMS'}
                </button>
              </div>
            )}

            {/* Step 2: Enter OTP */}
            {adminOtpSent && (
              <div style={{
                background: 'rgba(124, 58, 237, 0.08)',
                border: '1px solid rgba(124, 58, 237, 0.3)',
                borderRadius: '12px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <CheckCircle2 size={18} color="#10b981" />
                  <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 600 }}>
                    Verification code sent to admin's phone
                  </span>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    Enter the 6-digit code from your SMS
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="• • • • • •"
                    value={adminOtpCode}
                    onChange={e => setAdminOtpCode(e.target.value.replace(/\D/g, ''))}
                    className="form-input"
                    style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.4em', textAlign: 'center', fontSize: '1.2rem' }}
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleVerifyAdminOtp}
                  disabled={isVerifyingAdminOtp || adminOtpCode.length < 6}
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
                >
                  <ShieldCheck size={16} />
                  {isVerifyingAdminOtp ? 'Verifying...' : 'Verify & Access Admin Panel'}
                </button>

                <button
                  onClick={() => { setAdminOtpSent(false); setAdminOtpCode(''); }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline' }}
                >
                  Resend code
                </button>
              </div>
            )}

            {/* Back button */}
            <button
              onClick={() => { setPendingAdminLogin(false); setAdminOtpSent(false); setAdminOtpCode(''); }}
              style={{ background: 'none', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem' }}
            >
              ← Back to Login
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════
            REGISTRATION FORM
        ═══════════════════════════════════════════ */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

            <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
              <div style={{
                width: '52px', height: '52px',
                borderRadius: '14px',
                background: 'var(--gradient-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 0.6rem'
              }}>
                <UserPlus size={24} color="#fff" />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Register New Worker</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                Phone verification via SMS is required
              </p>
            </div>
            
            {/* Full Name */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Full Name *
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe Kamau"
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
                    {isSendingOtp ? 'Sending...' : isOtpSent ? 'Resend' : 'Send Code'}
                  </button>
                )}
              </div>

              {/* OTP Code Input — code is ONLY sent to the phone, never shown on screen */}
              {isOtpSent && !isPhoneVerified && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter 6-digit code from SMS"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
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
                    {isVerifyingOtp ? 'Checking...' : 'Verify'}
                  </button>
                </div>
              )}
            </div>

            {/* Assigned Device URL & PIN */}
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
                    placeholder="https://..."
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
                    placeholder="worker@email.com"
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
                ⚠️ You must verify your phone number via SMS before registering.
              </p>
            )}
          </form>
        )}

      </div>
    </div>
  );
};
