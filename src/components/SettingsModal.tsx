import React, { useState } from 'react';
import { RedisService } from '../services/redisService';
import { saveSupabaseConfig, getSupabaseConfig } from '../services/supabaseClient';
import { SMSService } from '../services/smsService';
import { X, Save, Zap, Database, MessageSquare, Send } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onShowToast
}) => {
  // TextSMS config (Hardcoded for Vertex Digital / TextSMS)
  const [apiKey, setApiKey] = useState(() => {
    const saved = localStorage.getItem('textsms_apikey');
    if (!saved || saved === 'eebf1d2e1d9df231eec7e63687dc1975') {
      localStorage.setItem('textsms_apikey', 'f2cd8d3d47237030b36034a24b7b3b2b');
      return 'f2cd8d3d47237030b36034a24b7b3b2b';
    }
    return saved;
  });
  const [partnerId, setPartnerId] = useState(() => localStorage.getItem('textsms_partnerid') || import.meta.env.VITE_TEXTSMS_PARTNER_ID || '16450');
  const [shortcode, setShortcode] = useState(() => localStorage.getItem('textsms_shortcode') || import.meta.env.VITE_TEXTSMS_SHORTCODE || 'TextSMS');

  // Test SMS phone
  const [testPhone, setTestPhone] = useState('0786499848');
  const [isSendingTestSms, setIsSendingTestSms] = useState(false);

  // Upstash Redis config
  const [redisUrl, setRedisUrl] = useState(() => localStorage.getItem('upstash_redis_url') || import.meta.env.VITE_UPSTASH_REDIS_REST_URL || 'https://destined-spider-220274.upstash.io');
  const [redisToken, setRedisToken] = useState(() => localStorage.getItem('upstash_redis_token') || import.meta.env.VITE_UPSTASH_REDIS_REST_TOKEN || 'gQAAAAAAA1xyAAIgcDJmNjlhM2M2NWU3ZTc0NTg2OTNjNmY1MjFiMWYxZGQ4ZQ');

  // Supabase config
  const supabaseConfig = getSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(supabaseConfig.url || 'https://etgyilosivcxfyjenyfc.supabase.co');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(supabaseConfig.anonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Z3lpbG9zaXZjeGZ5amVueWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2ODQ5NzgsImV4cCI6MjEwNzI2MDk3OH0.2XDm3kLf_dragIqykv3Y7J3YtU0t8zlXjAzIGRJ-4cw');

  const [testResult, setTestResult] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = () => {
    // Save TextSMS
    localStorage.setItem('textsms_apikey', apiKey.trim());
    localStorage.setItem('textsms_partnerid', partnerId.trim());
    localStorage.setItem('textsms_shortcode', shortcode.trim() || 'TextSMS');

    // Save Upstash Redis
    RedisService.setCredentials(redisUrl.trim(), redisToken.trim());

    // Save Supabase
    saveSupabaseConfig(supabaseUrl.trim(), supabaseAnonKey.trim());

    onShowToast('Settings saved successfully!');
    onClose();
  };

  const handleTestRedis = async () => {
    try {
      RedisService.setCredentials(redisUrl.trim(), redisToken.trim());
      const res = await RedisService.command(['PING']);
      setTestResult(`Redis Ping response: ${JSON.stringify(res || 'PONG')}`);
    } catch (err: any) {
      setTestResult(`Redis test failed: ${err.message}`);
    }
  };

  const handleTestBalance = async () => {
    try {
      localStorage.setItem('textsms_apikey', apiKey.trim());
      localStorage.setItem('textsms_partnerid', partnerId.trim());
      const res = await SMSService.checkBalance();
      setTestResult(`TextSMS response: ${res.balance || JSON.stringify(res.raw || res.error)}`);
    } catch (err: any) {
      setTestResult(`Balance check error: ${err.message}`);
    }
  };

  const handleSendTestSms = async () => {
    if (!apiKey.trim() || !partnerId.trim()) {
      alert('Please enter both TextSMS API Key AND Partner ID before sending a test message.');
      return;
    }

    setIsSendingTestSms(true);
    setTestResult('Dispatching live test SMS to TextSMS Kenya gateway...');
    try {
      localStorage.setItem('textsms_apikey', apiKey.trim());
      localStorage.setItem('textsms_partnerid', partnerId.trim());
      localStorage.setItem('textsms_shortcode', shortcode.trim() || 'TextSMS');

      const res = await SMSService.sendSMS({
        mobile: testPhone,
        recipientName: 'Sammy Seth',
        message: 'Hello Sammy Seth, this is a live test SMS from your VertextPay platform.',
        messageType: 'custom'
      });

      if (res.success) {
        setTestResult(`✅ TextSMS Success: ${res.description} (Message ID: ${res.messageId || 'Delivered'})`);
        onShowToast(`SMS sent to ${testPhone}!`);
      } else {
        setTestResult(`❌ TextSMS Error: ${res.description}`);
      }
    } catch (err: any) {
      setTestResult(`Error: ${err.message}`);
    } finally {
      setIsSendingTestSms(false);
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
      padding: '0.75rem'
    }}>
      <div className="glass-panel" style={{
        maxWidth: '680px',
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        padding: '1.5rem',
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.35rem' }}>
          System Configuration &amp; Live Gateways
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Configure your TextSMS Kenya credentials, Upstash Redis endpoints, and Supabase database.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* TEXTSMS KENYA SECTION */}
          <div style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.25)', borderRadius: '12px', padding: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                <MessageSquare size={18} /> TextSMS Kenya API Integration
              </div>
              <button
                type="button"
                onClick={handleTestBalance}
                className="btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              >
                Check Credits
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  API KEY (apikey) *
                </label>
                <input
                  type="text"
                  placeholder="Your TextSMS API Key"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.3rem' }}>
                  PARTNER ID (partnerID) * Required
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1234 (from TextSMS dashboard)"
                  value={partnerId}
                  onChange={e => setPartnerId(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', borderColor: !partnerId ? 'rgba(245, 158, 11, 0.6)' : undefined }}
                />
              </div>

              <div style={{ width: '100%' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  SENDER ID / SHORTCODE (shortcode)
                </label>
                <input
                  type="text"
                  placeholder="TextSMS"
                  value={shortcode}
                  onChange={e => setShortcode(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>

            {/* Live Test SMS Trigger */}
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem' }}>
                Dispatch Real Test SMS
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="0786499848"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  className="form-input"
                  style={{ flex: 1, minWidth: '180px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
                <button
                  type="button"
                  onClick={handleSendTestSms}
                  disabled={isSendingTestSms}
                  className="btn-primary"
                  style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', padding: '0.5rem 0.85rem' }}
                >
                  <Send size={14} /> {isSendingTestSms ? 'Sending...' : 'Send Live Test SMS'}
                </button>
              </div>
            </div>

            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
              💡 In your TextSMS Kenya account, click the button <strong>“GET API KEY &amp; PARTNER ID”</strong> to find your Partner ID number.
            </p>
          </div>

          {/* UPSTASH REDIS SECTION */}
          <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                <Zap size={18} /> Upstash Redis (Ultra-Speed Caching)
              </div>
              <button
                type="button"
                onClick={handleTestRedis}
                className="btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              >
                Test Ping
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  UPSTASH_REDIS_REST_URL
                </label>
                <input
                  type="text"
                  placeholder="https://your-upstash-redis.upstash.io"
                  value={redisUrl}
                  onChange={e => setRedisUrl(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  UPSTASH_REDIS_REST_TOKEN
                </label>
                <input
                  type="password"
                  placeholder="AXc1ASQg..."
                  value={redisToken}
                  onChange={e => setRedisToken(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>
          </div>

          {/* SUPABASE DATABASE SECTION */}
          <div style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '12px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--accent-violet)', marginBottom: '0.75rem' }}>
              <Database size={18} /> Supabase Database &amp; Auth
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  SUPABASE_URL
                </label>
                <input
                  type="text"
                  placeholder="https://xyz.supabase.co"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  SUPABASE_ANON_KEY
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOi..."
                  value={supabaseAnonKey}
                  onChange={e => setSupabaseAnonKey(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>
          </div>

          {testResult && (
            <div style={{ background: 'rgba(0, 0, 0, 0.6)', border: '1px solid var(--border-subtle)', padding: '0.75rem', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#38bdf8' }}>
              {testResult}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={handleSave} className="btn-primary">
              <Save size={16} /> Save Settings
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
