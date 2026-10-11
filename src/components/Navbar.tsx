import React, { useState } from 'react';
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
  LogOut,
  Menu,
  X,
  LogIn,
  Lock,
  UserPlus
} from 'lucide-react';

interface NavbarProps {
  currentUser: UserProfile | null;
  onOpenSettings: () => void;
  onSwitchUser: (role: 'worker' | 'admin' | 'new') => void;
  onLogout: () => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onOpenSettings,
  onSwitchUser,
  onLogout,
  onOpenAuth
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isAuthorizedAdmin = Boolean(
    currentUser && currentUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  return (
    <>
      <header className="glass-panel" style={{
        borderRadius: 0,
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        padding: '0.75rem 1rem'
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem'
        }}>

          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              background: 'var(--gradient-brand)',
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow-cyan)',
              flexShrink: 0
            }}>
              <Database size={20} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{
                  fontWeight: 800,
                  fontSize: '1.15rem',
                  letterSpacing: '-0.02em',
                  background: 'var(--gradient-brand)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  VertextPay
                </span>
                <span className="badge" style={{
                  background: 'rgba(6, 182, 212, 0.15)',
                  color: '#38bdf8',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                  padding: '0.15rem 0.45rem',
                  fontSize: '0.65rem'
                }}>
                  v2.0
                </span>
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.2 }}>
                Worker Weekly Ledger &amp; SMS
              </p>
            </div>
          </div>

          {/* Desktop Live Status Indicators — ADMIN ONLY */}
          {isAuthorizedAdmin && (
            <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div className="badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: '0.72rem' }}>
                <Zap size={12} /> Redis Active
              </div>
              <div className="badge" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.72rem' }}>
                <MessageSquare size={12} /> TextSMS Ready
              </div>
              <div className="badge" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.25)', fontSize: '0.72rem' }}>
                <ShieldCheck size={12} /> Supabase DB
              </div>
            </div>
          )}

          {/* Desktop Right Actions */}
          <div className="hide-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            
            {/* If Not Logged In: Show Sign In & Admin Login buttons */}
            {!currentUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={onOpenAuth}
                  className="btn-primary"
                  style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                >
                  <LogIn size={15} /> Worker Sign In
                </button>
                <button
                  onClick={onOpenAuth}
                  className="btn-secondary"
                  style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                  title="Admin login requires phone SMS verification"
                >
                  <Lock size={14} color="#a78bfa" /> Admin Login
                </button>
              </div>
            ) : (
              <>
                {/* Admin Mode toggle — ADMIN ONLY */}
                {isAuthorizedAdmin && (
                  <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => onSwitchUser('worker')}
                      style={{
                        padding: '0.35rem 0.7rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '7px',
                        border: 'none',
                        cursor: 'pointer',
                        background: currentUser.role === 'worker' ? 'var(--accent-cyan)' : 'transparent',
                        color: currentUser.role === 'worker' ? '#0a0d14' : 'var(--text-muted)'
                      }}
                    >
                      Worker Mode
                    </button>
                    <button
                      onClick={() => onSwitchUser('admin')}
                      style={{
                        padding: '0.35rem 0.7rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        borderRadius: '7px',
                        border: 'none',
                        cursor: 'pointer',
                        background: currentUser.role === 'admin' ? 'var(--accent-violet)' : 'transparent',
                        color: currentUser.role === 'admin' ? '#ffffff' : 'var(--text-muted)'
                      }}
                    >
                      Admin Panel
                    </button>
                  </div>
                )}

                {/* Current user chip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.04)', padding: '0.35rem 0.65rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: isAuthorizedAdmin ? 'var(--accent-violet)' : 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isAuthorizedAdmin ? <ShieldCheck size={14} color="#fff" /> : <User size={14} color="#000" />}
                  </div>
                  <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>{currentUser.full_name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {isAuthorizedAdmin ? 'Administrator' : currentUser.email}
                    </div>
                  </div>
                </div>

                {/* Register New Worker — ADMIN ONLY */}
                {isAuthorizedAdmin && (
                  <button
                    onClick={() => onSwitchUser('new')}
                    className="btn-secondary"
                    style={{ padding: '0.45rem 0.7rem', borderRadius: '9px', fontSize: '0.78rem' }}
                    title="Register New Worker"
                  >
                    <Users size={15} />
                    <span>Register</span>
                  </button>
                )}

                {/* Settings — ADMIN ONLY */}
                {isAuthorizedAdmin && (
                  <button
                    onClick={onOpenSettings}
                    className="btn-secondary"
                    style={{ padding: '0.45rem 0.65rem', borderRadius: '9px' }}
                    title="System Settings"
                  >
                    <Settings size={15} />
                  </button>
                )}

                {/* Logout */}
                <button
                  onClick={onLogout}
                  className="btn-secondary"
                  style={{ padding: '0.45rem 0.65rem', borderRadius: '9px' }}
                  title="Logout"
                >
                  <LogOut size={15} />
                </button>
              </>
            )}
          </div>

          {/* Mobile Right Controls */}
          <div className="show-on-mobile" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {!currentUser ? (
              <button
                onClick={onOpenAuth}
                className="btn-primary"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', minHeight: 'auto' }}
              >
                <LogIn size={13} /> Sign In
              </button>
            ) : (
              <div style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.25rem 0.55rem',
                borderRadius: '8px',
                background: isAuthorizedAdmin ? 'rgba(139, 92, 246, 0.2)' : 'rgba(6, 182, 212, 0.2)',
                color: isAuthorizedAdmin ? '#c4b5fd' : '#38bdf8',
                border: isAuthorizedAdmin ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid rgba(6, 182, 212, 0.35)'
              }}>
                {isAuthorizedAdmin ? 'Admin' : 'Worker'}
              </div>
            )}

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="btn-secondary"
              style={{ padding: '0.45rem 0.65rem', borderRadius: '9px' }}
              aria-label="Toggle mobile navigation menu"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <div
            className="mobile-drawer-content"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: isAuthorizedAdmin ? 'var(--accent-violet)' : currentUser ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {isAuthorizedAdmin ? <ShieldCheck size={18} color="#fff" /> : currentUser ? <User size={18} color="#000" /> : <LogIn size={18} color="#fff" />}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {currentUser?.full_name || 'Guest Visitor'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {isAuthorizedAdmin ? 'Administrator' : currentUser ? currentUser.email : 'Not signed in'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* If NOT logged in: Direct Login options */}
            {!currentUser ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Account Access
                </span>
                <button
                  onClick={() => { onOpenAuth(); setIsMobileMenuOpen(false); }}
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.85rem' }}
                >
                  <LogIn size={16} /> Worker Sign In
                </button>
                <button
                  onClick={() => { onOpenAuth(); setIsMobileMenuOpen(false); }}
                  className="btn-secondary"
                  style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.85rem' }}
                >
                  <UserPlus size={16} /> Register as New Worker
                </button>
                <button
                  onClick={() => { onOpenAuth(); setIsMobileMenuOpen(false); }}
                  className="btn-secondary"
                  style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.85rem', borderColor: 'rgba(139, 92, 246, 0.3)' }}
                >
                  <Lock size={16} color="#c4b5fd" /> Administrator Portal Sign In
                </button>
              </div>
            ) : (
              <>
                {/* Role Mode Switcher (ADMIN ONLY) */}
                {isAuthorizedAdmin && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      Switch Workspace
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                      <button
                        onClick={() => { onSwitchUser('worker'); setIsMobileMenuOpen(false); }}
                        style={{
                          padding: '0.55rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          background: currentUser.role === 'worker' ? 'var(--accent-cyan)' : 'transparent',
                          color: currentUser.role === 'worker' ? '#0a0d14' : 'var(--text-muted)'
                        }}
                      >
                        Worker Mode
                      </button>
                      <button
                        onClick={() => { onSwitchUser('admin'); setIsMobileMenuOpen(false); }}
                        style={{
                          padding: '0.55rem',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          background: currentUser.role === 'admin' ? 'var(--accent-violet)' : 'transparent',
                          color: currentUser.role === 'admin' ? '#ffffff' : 'var(--text-muted)'
                        }}
                      >
                        Admin Panel
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick Actions List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                    Navigation &amp; Actions
                  </span>

                  {isAuthorizedAdmin && (
                    <button
                      onClick={() => { onSwitchUser('new'); setIsMobileMenuOpen(false); }}
                      className="btn-primary"
                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.85rem' }}
                    >
                      <Users size={16} /> Register New Worker
                    </button>
                  )}

                  {isAuthorizedAdmin && (
                    <button
                      onClick={() => { onOpenSettings(); setIsMobileMenuOpen(false); }}
                      className="btn-secondary"
                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.85rem' }}
                    >
                      <Settings size={16} /> System &amp; API Settings
                    </button>
                  )}

                  <button
                    onClick={() => { onLogout(); setIsMobileMenuOpen(false); }}
                    className="btn-secondary"
                    style={{ width: '100%', justifyContent: 'flex-start', fontSize: '0.85rem', color: '#fb7185' }}
                  >
                    <LogOut size={16} /> Sign Out
                  </button>
                </div>

                {/* Live System Gateways Status (ADMIN ONLY) */}
                {isAuthorizedAdmin && (
                  <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      System Health
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#10b981' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Zap size={13} /> Upstash Redis
                      </span>
                      <span className="badge badge-approved" style={{ fontSize: '0.65rem' }}>Connected</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#38bdf8' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <MessageSquare size={13} /> TextSMS Kenya
                      </span>
                      <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>Ready</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#c4b5fd' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <ShieldCheck size={13} /> Supabase DB
                      </span>
                      <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(139, 92, 246, 0.15)', color: '#c4b5fd' }}>Active</span>
                    </div>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      )}
    </>
  );
};
