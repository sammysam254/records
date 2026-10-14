import React, { useState } from 'react';
import type { UserProfile, WeeklySubmission, SMSLog } from '../types';
import { DataService } from '../services/dataService';
import { SMSService } from '../services/smsService';
import { extractDeviceSerial, getDeviceOpenUrl } from '../utils/deviceHelper';
import {
  Users,
  CheckCircle2,
  DollarSign,
  Clock,
  Send,
  ExternalLink,
  MessageSquare,
  Search,
  RefreshCw,
  Coins,
  Wallet,
  LayoutGrid,
  Table as TableIcon,
  Copy,
  Check,
  Edit3,
  X,
  Filter,
  ArrowUpDown,
  Smartphone
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface AdminViewProps {
  workers: UserProfile[];
  submissions: WeeklySubmission[];
  smsLogs: SMSLog[];
  onRefresh: (forceFresh?: boolean) => void;
  onShowToast: (message: string) => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  workers,
  submissions,
  smsLogs,
  onRefresh,
  onShowToast
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'users' | 'submissions' | 'reminders' | 'sms_logs'>('users');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [balanceInfo, setBalanceInfo] = useState<string | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  // Users Tab Filters & View Mode
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'worker' | 'admin'>('all');
  const [userBalanceFilter, setUserBalanceFilter] = useState<'all' | 'positive' | 'zero'>('all');
  const [userSortBy, setUserSortBy] = useState<'balance-desc' | 'balance-asc' | 'name' | 'newest'>('balance-desc');
  const [userViewMode, setUserViewMode] = useState<'cards' | 'table'>('cards');

  // Copied PIN tracker
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Balance Adjustment Modal State
  const [adjustingUser, setAdjustingUser] = useState<UserProfile | null>(null);
  const [adjustMode, setAdjustMode] = useState<'set' | 'add' | 'deduct'>('set');
  const [adjustAmount, setAdjustAmount] = useState<string>('');
  const [adjustReason, setAdjustReason] = useState<string>('');
  const [adjustNotifySms, setAdjustNotifySms] = useState<boolean>(true);
  const [isSavingBalance, setIsSavingBalance] = useState<boolean>(false);

  // Status Overrides for Instant Zero-Lag UI updates
  const [statusOverrides, setStatusOverrides] = useState<Record<string, 'approved' | 'paid'>>({});

  // Active submissions with real-time optimistic overrides
  const activeSubmissions = submissions.map(s => {
    const overridden = statusOverrides[s.id];
    return overridden ? { ...s, status: overridden } : s;
  });

  // Quick metrics
  const pendingCount = activeSubmissions.filter(s => s.status === 'pending').length;
  const paidCount = activeSubmissions.filter(s => s.status === 'paid').length;
  const totalWalletLiability = workers.reduce((acc, w) => acc + (w.wallet_balance || 0), 0);
  const positiveBalanceUsers = workers.filter(w => (w.wallet_balance || 0) > 0).length;
  const averageBalance = workers.length > 0 ? totalWalletLiability / workers.length : 0;

  // Filter Submissions
  const filteredSubmissions = activeSubmissions.filter(s => {
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
    const workerName = s.user?.full_name?.toLowerCase() || '';
    const phone = s.user?.phone_number || '';
    const matchesSearch = workerName.includes(searchTerm.toLowerCase()) || phone.includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  // Filter & Sort Registered Users
  const filteredUsers = workers
    .filter(u => {
      // Role filter
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;

      // Balance filter
      if (userBalanceFilter === 'positive' && (u.wallet_balance || 0) <= 0) return false;
      if (userBalanceFilter === 'zero' && (u.wallet_balance || 0) > 0) return false;

      // Search term
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        u.full_name?.toLowerCase().includes(term) ||
        u.phone_number?.includes(term) ||
        u.email?.toLowerCase().includes(term) ||
        u.device_pin?.includes(term) ||
        u.device_url?.toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      if (userSortBy === 'balance-desc') return (b.wallet_balance || 0) - (a.wallet_balance || 0);
      if (userSortBy === 'balance-asc') return (a.wallet_balance || 0) - (b.wallet_balance || 0);
      if (userSortBy === 'name') return a.full_name.localeCompare(b.full_name);
      if (userSortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return 0;
    });

  // Copied Serial tracker
  const [copiedSerialId, setCopiedSerialId] = useState<string | null>(null);

  // Copy PIN helper
  const handleCopyPin = (pin: string, id: string) => {
    navigator.clipboard.writeText(pin);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    onShowToast(`PIN ${pin} copied to clipboard!`);
  };

  // Copy Serial helper
  const handleCopySerial = (serial: string, id: string) => {
    navigator.clipboard.writeText(serial);
    setCopiedSerialId(id);
    setTimeout(() => setCopiedSerialId(null), 2000);
    onShowToast(`Device Serial ${serial} copied to clipboard!`);
  };

  // Open Balance Adjustment Modal
  const handleOpenAdjustModal = (user: UserProfile) => {
    setAdjustingUser(user);
    setAdjustMode('set');
    setAdjustAmount(user.wallet_balance.toString());
    setAdjustReason('');
    setAdjustNotifySms(true);
  };

  // Save Balance Adjustment
  const handleSaveBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingUser) return;

    const num = parseFloat(adjustAmount);
    if (isNaN(num) || num < 0) {
      alert('Please enter a valid amount.');
      return;
    }

    let targetBalance = num;
    if (adjustMode === 'add') {
      targetBalance = adjustingUser.wallet_balance + num;
    } else if (adjustMode === 'deduct') {
      targetBalance = Math.max(0, adjustingUser.wallet_balance - num);
    }

    setIsSavingBalance(true);
    try {
      const res = await DataService.updateUserBalance(
        adjustingUser.id,
        targetBalance,
        adjustNotifySms,
        adjustReason || undefined
      );

      if (res.success) {
        confetti({ particleCount: 40, spread: 60 });
        onShowToast(`Updated balance for ${adjustingUser.full_name} to $${targetBalance.toFixed(2)}`);
        setAdjustingUser(null);
        onRefresh();
      } else {
        alert(res.error || 'Failed to update balance');
      }
    } catch (err: any) {
      alert(err.message || 'Balance update failed');
    } finally {
      setIsSavingBalance(false);
    }
  };

  // Approve submission
  const handleApprove = async (sub: WeeklySubmission) => {
    // 1. Instantly update UI with zero lag
    setStatusOverrides(prev => ({ ...prev, [sub.id]: 'approved' }));
    setIsProcessing(sub.id);
    try {
      const res = await DataService.approveSubmission(sub.id);
      if (res.success) {
        confetti({ particleCount: 40, spread: 50 });
        onShowToast(`Approved! $${sub.calculated_credit.toFixed(2)} credited to ${sub.user?.full_name || 'Worker'}'s wallet. SMS sent.`);
        onRefresh(true);
      } else {
        // Rollback override if failed
        setStatusOverrides(prev => {
          const next = { ...prev };
          delete next[sub.id];
          return next;
        });
        alert(res.error || 'Failed to approve');
      }
    } catch (err: any) {
      setStatusOverrides(prev => {
        const next = { ...prev };
        delete next[sub.id];
        return next;
      });
      alert(err.message);
    } finally {
      setIsProcessing(null);
    }
  };

  // Mark as paid
  const handleMarkAsPaid = async (sub: WeeklySubmission) => {
    // 1. Instantly update UI with zero lag
    setStatusOverrides(prev => ({ ...prev, [sub.id]: 'paid' }));
    setIsProcessing(sub.id);
    try {
      const res = await DataService.markSubmissionAsPaid(sub.id);
      if (res.success) {
        confetti({ particleCount: 60, spread: 70 });
        onShowToast(`Marked as Paid! $${sub.calculated_credit.toFixed(2)} deducted from ${sub.user?.full_name || 'Worker'}'s wallet. SMS sent.`);
        onRefresh(true);
      } else {
        // Rollback override if failed
        setStatusOverrides(prev => {
          const next = { ...prev };
          delete next[sub.id];
          return next;
        });
        alert(res.error || 'Failed to mark as paid');
      }
    } catch (err: any) {
      setStatusOverrides(prev => {
        const next = { ...prev };
        delete next[sub.id];
        return next;
      });
      alert(err.message);
    } finally {
      setIsProcessing(null);
    }
  };

  // Send Saturday Reminder SMS
  const handleSendSaturdayReminders = async () => {
    if (!confirm('Send Saturday earnings reminder SMS to all registered workers now?')) {
      return;
    }

    setIsProcessing('reminders');
    try {
      const res = await DataService.sendSaturdayReminders();
      onShowToast(`Saturday SMS reminders sent to ${res.sentCount} workers!`);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error sending reminders');
    } finally {
      setIsProcessing(null);
    }
  };

  // Check TextSMS account balance
  const handleCheckSMSBalance = async () => {
    setIsCheckingBalance(true);
    try {
      const res = await SMSService.checkBalance();
      setBalanceInfo(res.balance || JSON.stringify(res.raw));
    } catch (err: any) {
      setBalanceInfo('Failed to check balance: ' + err.message);
    } finally {
      setIsCheckingBalance(false);
    }
  };

  return (
    <div className="page-container">

      {/* Top Admin Summary Cards (Mobile-friendly 2x2 grid) */}
      <div className="stats-grid">

        {/* Card 1: Registered Users & Balances */}
        <div
          className="glass-panel"
          onClick={() => setActiveTab('users')}
          style={{ padding: '1.25rem', cursor: 'pointer', border: activeTab === 'users' ? '1px solid var(--accent-cyan)' : undefined }}
          title="Click to view all registered users and their balances"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="stat-label" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>
              REGISTERED USERS
            </span>
            <Users size={18} color="var(--accent-cyan)" />
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.4rem', color: '#f8fafc' }}>
            {workers.length}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--accent-cyan)' }}>
            View all users &amp; balances &rarr;
          </span>
        </div>

        {/* Card 2: Total Wallet Balances */}
        <div
          className="glass-panel"
          onClick={() => setActiveTab('users')}
          style={{ padding: '1.25rem', cursor: 'pointer', border: '1px solid rgba(16, 185, 129, 0.3)' }}
          title="Total balance across all registered accounts"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="stat-label" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>
              TOTAL USER BALANCES
            </span>
            <Coins size={18} color="var(--accent-emerald)" />
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.4rem', color: '#34d399' }}>
            ${totalWalletLiability.toFixed(2)}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Across {positiveBalanceUsers} account(s) with funds
          </span>
        </div>

        {/* Card 3: Pending Approvals */}
        <div
          className="glass-panel"
          onClick={() => setActiveTab('submissions')}
          style={{ padding: '1.25rem', cursor: 'pointer', borderColor: pendingCount > 0 ? 'rgba(245, 158, 11, 0.5)' : undefined }}
          title="Click to view submissions awaiting verification"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="stat-label" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>
              PENDING APPROVALS
            </span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.4rem', color: pendingCount > 0 ? '#fbbf24' : '#f8fafc' }}>
            {pendingCount}
          </div>
          <span style={{ fontSize: '0.72rem', color: pendingCount > 0 ? '#fbbf24' : 'var(--text-dim)' }}>
            {pendingCount > 0 ? 'Action required: credit wallets' : 'All submissions processed'}
          </span>
        </div>

        {/* Card 4: Paid Disbursements */}
        <div
          className="glass-panel"
          onClick={() => setActiveTab('submissions')}
          style={{ padding: '1.25rem', cursor: 'pointer' }}
          title="Total completed payout disbursements"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="stat-label" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>
              PAID DISBURSEMENTS
            </span>
            <DollarSign size={18} color="#3b82f6" />
          </div>
          <div className="stat-value" style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.4rem', color: '#60a5fa' }}>
            {paidCount}
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            Completed payout records
          </span>
        </div>

      </div>

      {/* Navigation Tabs (Smooth horizontally scrollable on mobile) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '0.65rem',
        flexWrap: 'wrap'
      }}>
        <div className="tabs-scroll-bar">
          <button
            onClick={() => setActiveTab('users')}
            className={activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
          >
            <Users size={15} />
            Registered Users &amp; Balances ({workers.length})
          </button>

          <button
            onClick={() => setActiveTab('submissions')}
            className={activeTab === 'submissions' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
          >
            <Clock size={15} />
            Submissions Hub {pendingCount > 0 && `(${pendingCount} Pending)`}
          </button>

          <button
            onClick={() => setActiveTab('reminders')}
            className={activeTab === 'reminders' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
          >
            <Send size={15} />
            Saturday SMS
          </button>

          <button
            onClick={() => setActiveTab('sms_logs')}
            className={activeTab === 'sms_logs' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
          >
            <MessageSquare size={15} />
            SMS Logs ({smsLogs.length})
          </button>
        </div>

        <button
          onClick={() => onRefresh(true)}
          className="btn-secondary"
          style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}
          title="Force Fresh Sync from Supabase and Reconcile Redis Cache"
        >
          <RefreshCw size={13} /> Sync Now
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TAB 1: ALL REGISTERED USERS & THEIR BALANCES (PRIMARY)
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'users' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>

          {/* Header & Users Summary Metrics */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Users size={22} color="var(--accent-cyan)" />
                  Registered Users &amp; Live Balances
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  View all registered users with their verified phone numbers, assigned workstations, and real-time wallet balances.
                </p>
              </div>

              {/* View Switcher: Cards vs Table */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setUserViewMode('cards')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    background: userViewMode === 'cards' ? 'var(--accent-cyan)' : 'transparent',
                    color: userViewMode === 'cards' ? '#0a0d14' : 'var(--text-muted)'
                  }}
                  title="Card View (Mobile Optimized)"
                >
                  <LayoutGrid size={13} /> Cards
                </button>
                <button
                  onClick={() => setUserViewMode('table')}
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    background: userViewMode === 'table' ? 'var(--accent-cyan)' : 'transparent',
                    color: userViewMode === 'table' ? '#0a0d14' : 'var(--text-muted)'
                  }}
                  title="Table View (Full Data)"
                >
                  <TableIcon size={13} /> Table
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
              background: 'rgba(10, 13, 20, 0.5)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '0.85rem 1.25rem'
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Total Users</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>{workers.length}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Combined Balance</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399' }}>${totalWalletLiability.toFixed(2)}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Funded Accounts</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>{positiveBalanceUsers}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Average Balance</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c4b5fd' }}>${averageBalance.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Search, Filter & Sort Bar */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginBottom: '1.25rem'
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="text"
                placeholder="Search by name, phone, email, PIN, or device URL..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem', fontSize: '0.85rem' }}
              />
            </div>

            {/* Filter Pills & Sorter Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>

              {/* Balance Filter Pills */}
              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 600, marginRight: '0.2rem' }}>
                  <Filter size={12} style={{ display: 'inline', marginRight: '3px' }} /> Balance:
                </span>
                {(['all', 'positive', 'zero'] as const).map(b => (
                  <button
                    key={b}
                    onClick={() => setUserBalanceFilter(b)}
                    className="btn-secondary"
                    style={{
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.72rem',
                      background: userBalanceFilter === b ? 'var(--accent-cyan)' : undefined,
                      color: userBalanceFilter === b ? '#0a0d14' : undefined,
                      fontWeight: userBalanceFilter === b ? 700 : 500
                    }}
                  >
                    {b === 'all' ? 'All Balances' : b === 'positive' ? 'With Balance (> $0)' : 'Zero Balance ($0)'}
                  </button>
                ))}
              </div>

              {/* Sort By Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ArrowUpDown size={13} color="var(--text-dim)" />
                <select
                  value={userSortBy}
                  onChange={e => setUserSortBy(e.target.value as any)}
                  className="form-input"
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    width: 'auto',
                    minHeight: 'auto',
                    background: 'rgba(10, 13, 20, 0.8)'
                  }}
                >
                  <option value="balance-desc">Sort: Highest Balance First</option>
                  <option value="balance-asc">Sort: Lowest Balance First</option>
                  <option value="name">Sort: Name (A-Z)</option>
                  <option value="newest">Sort: Newest Registered</option>
                </select>
              </div>

            </div>
          </div>

          {/* User Results */}
          {filteredUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
              <Users size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <p style={{ fontWeight: 600 }}>No users found matching your search or filters.</p>
              <button
                onClick={() => { setSearchTerm(''); setUserBalanceFilter('all'); setUserRoleFilter('all'); }}
                className="btn-secondary"
                style={{ marginTop: '0.75rem', fontSize: '0.75rem' }}
              >
                Clear all filters
              </button>
            </div>
          ) : userViewMode === 'cards' ? (
            /* ─── CARDS VIEW (Clean & Mobile First) ─── */
            <div className="cards-grid">
              {filteredUsers.map(u => {
                const userSubs = submissions.filter(s => s.user_id === u.id);
                const userPending = userSubs.filter(s => s.status === 'pending').length;

                return (
                  <div key={u.id} className="user-card">
                    {/* User Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '12px',
                          background: u.role === 'admin' ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' : 'var(--gradient-brand)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1rem',
                          color: '#fff',
                          flexShrink: 0
                        }}>
                          {u.full_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc' }}>
                            {u.full_name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {u.email || 'No email registered'}
                          </div>
                        </div>
                      </div>

                      <span className="badge" style={{
                        fontSize: '0.65rem',
                        background: u.role === 'admin' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(6, 182, 212, 0.15)',
                        color: u.role === 'admin' ? '#c4b5fd' : '#38bdf8'
                      }}>
                        {u.role}
                      </span>
                    </div>

                    {/* Prominent Wallet Balance Card */}
                    <div className="user-card-balance">
                      <div>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                          Wallet Balance
                        </span>
                        <div style={{ fontSize: '1.65rem', fontWeight: 800, color: (u.wallet_balance || 0) > 0 ? '#34d399' : '#94a3b8', lineHeight: 1.1 }}>
                          ${(u.wallet_balance || 0).toFixed(2)}
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenAdjustModal(u)}
                        className="btn-secondary"
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                        title="Directly edit or credit/deduct balance"
                      >
                        <Edit3 size={13} /> Adjust
                      </button>
                    </div>

                    {/* Phone & Verification */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.5rem 0.75rem', borderRadius: '8px' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Phone Number:</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                        <strong>{u.phone_number}</strong>
                        {u.phone_verified && (
                          <span title="SMS Verified">
                            <CheckCircle2 size={14} color="#10b981" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Assigned Device Workstation, Serial & PIN */}
                    {(() => {
                      const deviceSerial = u.device_serial || extractDeviceSerial(u.device_url);
                      const openUrl = getDeviceOpenUrl(u.device_url);
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.78rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.65rem 0.75rem', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Smartphone size={12} color="#38bdf8" /> Device Serial:
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '4px', letterSpacing: '0.05em' }}>
                                {deviceSerial || 'NO-SERIAL'}
                              </span>
                              {deviceSerial && (
                                <button
                                  onClick={() => handleCopySerial(deviceSerial, `usr_card_${u.id}`)}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                                  title="Copy Device Serial"
                                >
                                  {copiedSerialId === `usr_card_${u.id}` ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                                </button>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Workstation:</span>
                            {openUrl ? (
                              <a
                                href={openUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: '#38bdf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}
                              >
                                Open Workstation <ExternalLink size={11} />
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-dim)' }}>None</span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Assigned PIN:</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span style={{ fontFamily: 'var(--font-mono)', background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.45rem', borderRadius: '4px', letterSpacing: '0.1em' }}>
                                {u.device_pin || '----'}
                              </span>
                              <button
                                onClick={() => handleCopyPin(u.device_pin, u.id)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem' }}
                                title="Copy PIN"
                              >
                                {copiedId === u.id ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Submissions count badge & Quick Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.75rem', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {userSubs.length} submissions {userPending > 0 && <span style={{ color: '#fbbf24' }}>({userPending} pending)</span>}
                      </span>

                      <button
                        onClick={async () => {
                          const msg = `Hello ${u.full_name}, this is an admin alert from VertextPay. Your current wallet balance is $${u.wallet_balance.toFixed(2)}.`;
                          const res = await SMSService.sendSMS({
                            mobile: u.phone_number,
                            recipientName: u.full_name,
                            message: msg,
                            messageType: 'custom',
                            userId: u.id
                          });
                          onShowToast(`SMS sent to ${u.full_name}: ${res.description}`);
                          onRefresh();
                        }}
                        className="btn-secondary"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem' }}
                        title="Send balance reminder SMS"
                      >
                        <MessageSquare size={12} /> SMS Balance
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          ) : (
            /* ─── TABLE VIEW (Desktop Full Table with Responsive Scroll) ─── */
            <div className="table-responsive">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Registered User</th>
                    <th>Verified Phone</th>
                    <th>Role</th>
                    <th>Current Balance</th>
                    <th>Device Serial &amp; Workstation</th>
                    <th>Assigned PIN</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => {
                    const deviceSerial = u.device_serial || extractDeviceSerial(u.device_url);
                    const openUrl = getDeviceOpenUrl(u.device_url);

                    return (
                      <tr key={u.id}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{u.full_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{u.email}</div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-mono)' }}>
                            {u.phone_number}
                            {u.phone_verified && (
                              <span title="Phone verified via SMS">
                                <CheckCircle2 size={13} color="#10b981" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="badge" style={{
                            fontSize: '0.65rem',
                            background: u.role === 'admin' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(6, 182, 212, 0.15)',
                            color: u.role === 'admin' ? '#c4b5fd' : '#38bdf8'
                          }}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            fontWeight: 800,
                            fontSize: '1.05rem',
                            color: (u.wallet_balance || 0) > 0 ? '#34d399' : 'var(--text-dim)'
                          }}>
                            ${(u.wallet_balance || 0).toFixed(2)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <Smartphone size={12} color="#38bdf8" />
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#38bdf8', fontSize: '0.8rem', background: 'rgba(56, 189, 248, 0.12)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                                {deviceSerial || 'NO-SERIAL'}
                              </span>
                              {deviceSerial && (
                                <button
                                  onClick={() => handleCopySerial(deviceSerial, `usr_tbl_${u.id}`)}
                                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                                  title="Copy Serial"
                                >
                                  {copiedSerialId === `usr_tbl_${u.id}` ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                                </button>
                              )}
                            </div>
                            {openUrl ? (
                              <a
                                href={openUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{ color: '#38bdf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.74rem', fontWeight: 600 }}
                              >
                                Open Workstation <ExternalLink size={10} />
                              </a>
                            ) : (
                              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>None</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', background: 'rgba(255, 255, 255, 0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px', letterSpacing: '0.1em' }}>
                            {u.device_pin || '----'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              onClick={() => handleOpenAdjustModal(u)}
                              className="btn-secondary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem' }}
                              title="Adjust wallet balance"
                            >
                              <Edit3 size={12} /> Balance
                            </button>
                            <button
                              onClick={async () => {
                                const msg = `Hello ${u.full_name}, your VertextPay wallet balance is $${u.wallet_balance.toFixed(2)}.`;
                                const res = await SMSService.sendSMS({
                                  mobile: u.phone_number,
                                  recipientName: u.full_name,
                                  message: msg,
                                  messageType: 'custom',
                                  userId: u.id
                                });
                                onShowToast(`SMS sent to ${u.full_name}: ${res.description}`);
                                onRefresh();
                              }}
                              className="btn-secondary"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem' }}
                              title="Send SMS"
                            >
                              <MessageSquare size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 2: SUBMISSIONS APPROVAL HUB
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'submissions' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.85rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Weekly Earnings Approvals &amp; Payouts</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Verify submitted weekly earnings, automatically credit worker wallets via 3-tier rules, and mark as paid.
              </p>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {['all', 'pending', 'approved', 'paid'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'capitalize',
                    padding: '0.35rem 0.75rem',
                    background: filterStatus === status ? 'var(--accent-cyan)' : undefined,
                    color: filterStatus === status ? '#0a0d14' : undefined,
                    fontWeight: filterStatus === status ? 700 : 500
                  }}
                >
                  {status} {status === 'pending' && pendingCount > 0 && `(${pendingCount})`}
                </button>
              ))}
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
              <Clock size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <p>No submissions matching filter '{filterStatus}'.</p>
            </div>
          ) : (
            <>
              {/* Responsive Cards on Mobile */}
              <div className="show-on-mobile" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {filteredSubmissions.map(sub => {
                  const worker = sub.user || workers.find(u => u.id === sub.user_id);
                  const rawDeviceUrl = worker?.device_url || '';
                  const deviceSerial = worker?.device_serial || extractDeviceSerial(rawDeviceUrl);
                  const openUrl = getDeviceOpenUrl(rawDeviceUrl);
                  const devicePin = worker?.device_pin || '';

                  return (
                    <div key={sub.id} className="user-card" style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '1rem' }}>{worker?.full_name || 'Worker'}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {worker?.phone_number || 'No Phone'} • Week of {sub.week_date}
                          </div>
                        </div>

                        {sub.status === 'pending' && <span className="badge badge-pending">Pending</span>}
                        {sub.status === 'approved' && <span className="badge badge-approved">Approved</span>}
                        {sub.status === 'paid' && <span className="badge badge-paid">Paid</span>}
                        {sub.status === 'rejected' && <span className="badge badge-rejected">Rejected</span>}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '10px' }}>
                        <div>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Submitted Amount</span>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
                            ${sub.amount_made.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Calculated Credit</span>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                            +${sub.calculated_credit.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Device Verification Panel */}
                      <div style={{
                        background: 'rgba(56, 189, 248, 0.05)',
                        border: '1px solid rgba(56, 189, 248, 0.18)',
                        borderRadius: '10px',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.35rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Smartphone size={13} color="#38bdf8" />
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Device Serial:</span>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 800,
                              color: '#38bdf8',
                              fontSize: '0.8rem',
                              background: 'rgba(56, 189, 248, 0.15)',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px'
                            }}>
                              {deviceSerial || 'NO-SERIAL'}
                            </span>
                            {deviceSerial && (
                              <button
                                onClick={() => handleCopySerial(deviceSerial, `sub_mob_${sub.id}`)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.1rem' }}
                                title="Copy Serial"
                              >
                                {copiedSerialId === `sub_mob_${sub.id}` ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                              </button>
                            )}
                          </div>

                          {devicePin && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                              PIN: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f8fafc' }}>{devicePin}</span>
                            </div>
                          )}
                        </div>

                        {openUrl ? (
                          <a
                            href={openUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.45rem',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              background: 'rgba(56, 189, 248, 0.12)',
                              padding: '0.45rem 0.75rem',
                              borderRadius: '7px',
                              textDecoration: 'none'
                            }}
                          >
                            <ExternalLink size={13} /> Open Device ({deviceSerial || 'Stream'}) to Verify Claim
                          </a>
                        ) : (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                            No device stream URL registered for this worker
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.15rem' }}>
                        {sub.status === 'pending' && (
                          <button
                            onClick={() => handleApprove(sub)}
                            disabled={isProcessing === sub.id}
                            className="btn-success"
                            style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem' }}
                          >
                            <CheckCircle2 size={15} /> Approve &amp; Credit Wallet
                          </button>
                        )}

                        {sub.status === 'approved' && (
                          <button
                            onClick={() => handleMarkAsPaid(sub)}
                            disabled={isProcessing === sub.id}
                            className="btn-primary"
                            style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem' }}
                          >
                            <DollarSign size={15} /> Mark as Paid (Deduct)
                          </button>
                        )}

                        {sub.status === 'paid' && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: '0 auto' }}>
                            <CheckCircle2 size={16} /> Disbursed &amp; Deducted
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table on Tablet / Desktop */}
              <div className="table-responsive hide-on-mobile">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Worker &amp; Phone</th>
                      <th>Device &amp; Verification</th>
                      <th>Week Date</th>
                      <th>Submitted Amount</th>
                      <th>Calculated Credit</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map(sub => {
                      const worker = sub.user || workers.find(u => u.id === sub.user_id);
                      const rawDeviceUrl = worker?.device_url || '';
                      const deviceSerial = worker?.device_serial || extractDeviceSerial(rawDeviceUrl);
                      const openUrl = getDeviceOpenUrl(rawDeviceUrl);
                      const devicePin = worker?.device_pin || '';

                      return (
                        <tr key={sub.id}>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{worker?.full_name || 'Worker'}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                              {worker?.phone_number || 'No phone'}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Smartphone size={12} color="#38bdf8" />
                                <span style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 800,
                                  color: '#38bdf8',
                                  fontSize: '0.8rem',
                                  background: 'rgba(56, 189, 248, 0.12)',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '4px'
                                }}>
                                  {deviceSerial || 'NO-SERIAL'}
                                </span>
                                {deviceSerial && (
                                  <button
                                    onClick={() => handleCopySerial(deviceSerial, `sub_tbl_${sub.id}`)}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
                                    title="Copy Device Serial"
                                  >
                                    {copiedSerialId === `sub_tbl_${sub.id}` ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                                  </button>
                                )}
                              </div>

                              {openUrl ? (
                                <a
                                  href={openUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    color: '#38bdf8',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    background: 'rgba(56, 189, 248, 0.08)',
                                    border: '1px solid rgba(56, 189, 248, 0.22)',
                                    padding: '0.2rem 0.45rem',
                                    borderRadius: '5px',
                                    width: 'fit-content'
                                  }}
                                  title="Open real device stream in new tab to verify claim"
                                >
                                  <ExternalLink size={11} /> Open Device <span style={{ opacity: 0.7, fontSize: '0.68rem' }}>({devicePin ? `PIN: ${devicePin}` : 'Stream'})</span>
                                </a>
                              ) : (
                                <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>No URL</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{sub.week_date}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                              {new Date(sub.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#f8fafc' }}>
                              ${sub.amount_made.toFixed(2)}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontWeight: 800, color: 'var(--accent-emerald)', fontSize: '1rem' }}>
                                +${sub.calculated_credit.toFixed(2)}
                              </span>
                              <span className="badge" style={{ fontSize: '0.65rem' }}>
                                {sub.amount_made <= 40 ? '≤$40 ($0)' : sub.amount_made <= 80 ? '$40-$80' : '>$80'}
                              </span>
                            </div>
                          </td>
                          <td>
                            {sub.status === 'pending' && <span className="badge badge-pending">Pending</span>}
                            {sub.status === 'approved' && <span className="badge badge-approved">Approved</span>}
                            {sub.status === 'paid' && <span className="badge badge-paid">Paid</span>}
                            {sub.status === 'rejected' && <span className="badge badge-rejected">Rejected</span>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.45rem' }}>
                              {sub.status === 'pending' && (
                                <button
                                  onClick={() => handleApprove(sub)}
                                  disabled={isProcessing === sub.id}
                                  className="btn-success"
                                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                                >
                                  <CheckCircle2 size={13} /> Approve
                                </button>
                              )}

                              {sub.status === 'approved' && (
                                <button
                                  onClick={() => handleMarkAsPaid(sub)}
                                  disabled={isProcessing === sub.id}
                                  className="btn-primary"
                                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                                >
                                  <DollarSign size={13} /> Mark Paid
                                </button>
                              )}

                              {sub.status === 'paid' && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                  <CheckCircle2 size={13} /> Paid
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 3: SATURDAY REMINDERS
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'reminders' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Send size={20} color="var(--accent-cyan)" />
                Saturday Automated Weekly Earnings Reminders
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Every Saturday, workers receive an automated SMS reminding them to submit the money made that week.
              </p>
            </div>

            <button
              onClick={handleSendSaturdayReminders}
              disabled={isProcessing === 'reminders'}
              className="btn-primary"
              style={{ padding: '0.65rem 1.15rem' }}
            >
              <Send size={15} />
              {isProcessing === 'reminders' ? 'Sending Reminders...' : `Dispatch SMS to All (${workers.length}) Workers`}
            </button>
          </div>

          <div style={{ background: 'rgba(10, 13, 20, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Standard Message Template (TextSMS Gateway)
            </span>
            <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color: '#38bdf8', background: 'rgba(0, 0, 0, 0.4)', padding: '0.75rem 1rem', borderRadius: '8px', wordBreak: 'break-word' }}>
              "Hello Samson Matata Mwinzi, it's Saturday! This is a reminder to submit your weekly earnings through your dashboard."
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
              * Registered worker's full name is automatically inserted into each personalized message.
            </p>
          </div>

          {/* TextSMS Balance Check */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '10px', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>TextSMS Kenya Balance Checker</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {balanceInfo || 'Click to verify remaining SMS credits on TextSMS'}
              </div>
            </div>
            <button
              onClick={handleCheckSMSBalance}
              disabled={isCheckingBalance}
              className="btn-secondary"
              style={{ fontSize: '0.75rem' }}
            >
              <RefreshCw size={13} /> Check Balance
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 4: SMS AUDIT LOGS
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'sms_logs' && (
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>TextSMS Kenya Transmission Audit Log</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Real-time delivery confirmation for OTPs, Submissions, Approvals, Payouts, and Reminders.
              </p>
            </div>
            <span className="badge badge-approved">{smsLogs.length} Dispatched</span>
          </div>

          {smsLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
              <MessageSquare size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <p>No SMS logs yet. Dispatch an action to see logs appear here.</p>
            </div>
          ) : (
            <>
              {/* Mobile View */}
              <div className="show-on-mobile" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {smsLogs.map(log => (
                  <div key={log.id} style={{ background: 'rgba(10, 13, 20, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{log.recipient_name}</span>
                      <span className="badge" style={{ fontSize: '0.62rem' }}>{log.message_type}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>
                      {log.phone_number} • {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#f8fafc', background: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
                      {log.message}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="table-responsive hide-on-mobile">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Recipient &amp; Mobile</th>
                      <th>Type</th>
                      <th>SMS Message Body</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smsLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{log.recipient_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            {log.phone_number}
                          </div>
                        </td>
                        <td>
                          <span className="badge" style={{ fontSize: '0.65rem' }}>{log.message_type}</span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#f8fafc', maxWidth: '380px' }}>
                          {log.message}
                        </td>
                        <td>
                          <span className="badge badge-approved">{log.status_code} OK</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          ADMIN BALANCE ADJUSTMENT MODAL
          ═══════════════════════════════════════════════════════════ */}
      {adjustingUser && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5, 8, 14, 0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{
            maxWidth: '500px',
            width: '100%',
            padding: '1.75rem',
            position: 'relative'
          }}>
            <button
              onClick={() => setAdjustingUser(null)}
              style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Wallet size={20} color="var(--accent-emerald)" />
              Adjust Wallet Balance
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Modifying balance for <strong>{adjustingUser.full_name}</strong> ({adjustingUser.phone_number})
            </p>

            <form onSubmit={handleSaveBalance} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>

              {/* Current Balance Display */}
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Current Wallet Balance:</span>
                <strong style={{ fontSize: '1.25rem', color: '#34d399' }}>${adjustingUser.wallet_balance.toFixed(2)}</strong>
              </div>

              {/* Adjustment Mode Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Adjustment Type
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    onClick={() => { setAdjustMode('set'); setAdjustAmount(adjustingUser.wallet_balance.toString()); }}
                    style={{
                      padding: '0.45rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      background: adjustMode === 'set' ? 'var(--accent-cyan)' : 'transparent',
                      color: adjustMode === 'set' ? '#0a0d14' : 'var(--text-muted)'
                    }}
                  >
                    Set Exact
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdjustMode('add'); setAdjustAmount('10'); }}
                    style={{
                      padding: '0.45rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      background: adjustMode === 'add' ? 'var(--accent-emerald)' : 'transparent',
                      color: adjustMode === 'add' ? '#ffffff' : 'var(--text-muted)'
                    }}
                  >
                    + Add Credit
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAdjustMode('deduct'); setAdjustAmount('10'); }}
                    style={{
                      padding: '0.45rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      borderRadius: '7px',
                      border: 'none',
                      cursor: 'pointer',
                      background: adjustMode === 'deduct' ? '#f43f5e' : 'transparent',
                      color: adjustMode === 'deduct' ? '#ffffff' : 'var(--text-muted)'
                    }}
                  >
                    - Deduct
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  {adjustMode === 'set' ? 'New Exact Balance ($)' : adjustMode === 'add' ? 'Credit Amount to Add ($)' : 'Amount to Deduct ($)'}
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', fontWeight: 700, color: 'var(--text-muted)' }}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={adjustAmount}
                    onChange={e => setAdjustAmount(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '2.2rem', fontSize: '1.15rem', fontWeight: 700 }}
                    autoFocus
                  />
                </div>
              </div>

              {/* Reason / Note */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                  Admin Reason / Audit Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Saturday bonus or Cash withdrawal deduction"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              {/* SMS Notification Checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer', fontSize: '0.82rem', color: '#f8fafc' }}>
                <input
                  type="checkbox"
                  checked={adjustNotifySms}
                  onChange={e => setAdjustNotifySms(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-cyan)' }}
                />
                <span>Send SMS notification to {adjustingUser.full_name} via TextSMS</span>
              </label>

              {/* Save Button */}
              <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setAdjustingUser(null)}
                  className="btn-secondary"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBalance}
                  className="btn-primary"
                  style={{ flex: 2, justifyContent: 'center' }}
                >
                  {isSavingBalance ? 'Updating...' : 'Confirm & Save Balance'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
