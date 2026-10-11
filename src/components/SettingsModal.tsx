import React, { useState } from 'react';
import { RedisService } from '../services/redisService';
import { saveSupabaseConfig, getSupabaseConfig } from '../services/supabaseClient';
import { SMSService } from '../services/smsService';
import { X, Save, Zap, Database, MessageSquare } from 'lucide-react';

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
  // TextSMS config
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('textsms_apikey') || '');
  const [partnerId, setPartnerId] = useState(() => localStorage.getItem('textsms_partnerid') || '');
  const [shortcode, setShortcode] = useState(() => localStorage.getItem('textsms_shortcode') || 'TextSMS');

  // Upstash Redis config
  const [redisUrl, setRedisUrl] = useState(() => localStorage.getItem('upstash_redis_url') || '');
  const [redisToken, setRedisToken] = useState(() => localStorage.getItem('upstash_redis_token') || '');

  // Supabase config
  const supabaseConfig = getSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(supabaseConfig.url);
  const [supabaseAnonKey, setSupabaseAnonKey] = useState(supabaseConfig.anonKey);

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

    onShowToast('Settings saved successfully! Caching and SMS gateways refreshed.');
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
      setTestResult(`TextSMS balance: ${res.balance || JSON.stringify(res.raw)}`);
    } catch (err: any) {
      setTestResult(`Balance check error: ${err.message}`);
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
        maxWidth: '640px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '2rem',
        position: 'relative'
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>

        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '0.4rem' }}>
          System Configuration & API Keys
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          Configure Upstash Redis, TextSMS Kenya gateway, and Supabase database. You can also specify these in Netlify Environment Variables.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
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
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
              When configured, worker records, wallet balances, and submissions are served directly from Upstash Redis.
            </p>
          </div>

          {/* TEXTSMS KENYA SECTION */}
          <div style={{ background: 'rgba(6, 182, 212, 0.05)', border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: '12px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                <MessageSquare size={18} /> TextSMS Kenya API Integration
              </div>
              <button
                type="button"
                onClick={handleTestBalance}
                className="btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
              >
                Check Balance
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  API KEY (apikey)
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
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  PARTNER ID (partnerID)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1234"
                  value={partnerId}
                  onChange={e => setPartnerId(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
                  SENDER ID / SHORTCODE (shortcode)
                </label>
                <input
                  type="text"
                  placeholder="e.g. TextSMS or Your Approved Sender ID"
                  value={shortcode}
                  onChange={e => setShortcode(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}
                />
              </div>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
              Dispatches SMS OTPs, submission receipts, approval alerts, payouts, and Saturday reminders.
            </p>
          </div>

          {/* SUPABASE DATABASE SECTION */}
          <div style={{ background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '12px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--accent-violet)', marginBottom: '0.75rem' }}>
              <Database size={18} /> Supabase Database & Auth
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
            <div style={{ background: 'rgba(0, 0, 0, 0.5)', padding: '0.75rem', borderRadius: '8px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#38bdf8' }}>
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
