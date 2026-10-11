import React from 'react';
import type { UserProfile } from '../types';
import { ADMIN_EMAIL } from '../services/dataService';
import { 
  ShieldCheck, 
  User, 
  Settings, 
  Zap, 
  Database, 
  MessageSquare,
  Users,
  LogOut
} from 'lucide-react';

interface NavbarProps {
  currentUser: UserProfile | null;
  onOpenSettings: () => void;
  onSwitchUser: (role: 'worker' | 'admin' | 'new') => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onOpenSettings,
  onSwitchUser,
  onLogout
}) => {
  const isAuthorizedAdmin = currentUser?.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  return (
    <header className="glass-panel" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none', position: 'sticky', top: 0, zIndex: 50, padding: '0.85rem 1.5rem' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            background: 'var(--gradient-brand)',
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow-cyan)'
          }}>
            <Database size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                VertextPay
              </span>
              <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                v2.0
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Worker Weekly Ledger & SMS Disbursement
            </p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <div className="badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <Zap size={12} /> Upstash Redis Active
          </div>
          <div className="badge" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
            <MessageSquare size={12} /> TextSMS Kenya Ready
          </div>
          <div className="badge" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
            <ShieldCheck size={12} /> Supabase DB
          </div>
        </div>

        {/* User / Role & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          
          {/* Admin Mode is ONLY shown for sammyseth260@gmail.com */}
          {isAuthorizedAdmin && (
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => onSwitchUser('worker')}
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  background: currentUser?.role === 'worker' ? 'var(--accent-cyan)' : 'transparent',
                  color: currentUser?.role === 'worker' ? '#0a0d14' : 'var(--text-muted)'
                }}
                title="View as Worker"
              >
                Worker Mode
              </button>
              <button
                onClick={() => onSwitchUser('admin')}
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  background: currentUser?.role === 'admin' ? 'var(--accent-violet)' : 'transparent',
                  color: currentUser?.role === 'admin' ? '#ffffff' : 'var(--text-muted)'
                }}
                title="Administrator Panel (sammyseth260@gmail.com)"
              >
                Admin Panel
              </button>
            </div>
          )}

          {/* Current profile info */}
          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.04)', padding: '0.35rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: isAuthorizedAdmin ? 'var(--accent-violet)' : 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isAuthorizedAdmin ? <ShieldCheck size={16} color="#fff" /> : <User size={16} color="#000" />}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{currentUser.full_name}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  {isAuthorizedAdmin ? 'Admin (sammyseth260)' : currentUser.email}
                </div>
              </div>
            </div>
          )}

          {/* Settings Modal Trigger */}
          <button 
            onClick={onOpenSettings} 
            className="btn-secondary" 
            style={{ padding: '0.5rem 0.75rem', borderRadius: '9px' }}
            title="System & API Settings"
          >
            <Settings size={16} />
          </button>

          {/* Register New Worker */}
          <button
            onClick={() => onSwitchUser('new')}
            className="btn-secondary"
            style={{ padding: '0.5rem 0.75rem', borderRadius: '9px' }}
            title="Register Worker"
          >
            <Users size={16} />
          </button>

          {/* Logout Button */}
          <button
            onClick={onLogout}
            className="btn-secondary"
            style={{ padding: '0.5rem 0.75rem', borderRadius: '9px' }}
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>

      </div>
    </header>
  );
};
