import React, { useState } from 'react';
import type { UserProfile, WeeklySubmission, SMSLog } from '../types';
import { DataService } from '../services/dataService';
import { SMSService } from '../services/smsService';
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
  Coins
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface AdminViewProps {
  workers: UserProfile[];
  submissions: WeeklySubmission[];
  smsLogs: SMSLog[];
  onRefresh: () => void;
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
  const [activeTab, setActiveTab] = useState<'submissions' | 'workers' | 'reminders' | 'sms_logs'>('submissions');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [balanceInfo, setBalanceInfo] = useState<string | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  // Quick metrics
  const pendingCount = submissions.filter(s => s.status === 'pending').length;
  const paidCount = submissions.filter(s => s.status === 'paid').length;
  const totalWalletLiability = workers.reduce((acc, w) => acc + w.wallet_balance, 0);

  // Filter submissions
  const filteredSubmissions = submissions.filter(s => {
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
    const workerName = s.user?.full_name?.toLowerCase() || '';
    const phone = s.user?.phone_number || '';
    const matchesSearch = workerName.includes(searchTerm.toLowerCase()) || phone.includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  // Filter workers
  const filteredWorkers = workers.filter(w => {
    return w.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           w.phone_number.includes(searchTerm) ||
           w.email.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Approve submission
  const handleApprove = async (sub: WeeklySubmission) => {
    setIsProcessing(sub.id);
    try {
      const res = await DataService.approveSubmission(sub.id);
      if (res.success) {
        confetti({ particleCount: 40, spread: 50 });
        onShowToast(`Approved! $${sub.calculated_credit.toFixed(2)} credited to ${sub.user?.full_name}'s wallet. SMS sent.`);
        onRefresh();
      } else {
        alert(res.error || 'Failed to approve');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(null);
    }
  };

  // Mark as paid
  const handleMarkAsPaid = async (sub: WeeklySubmission) => {
    setIsProcessing(sub.id);
    try {
      const res = await DataService.markSubmissionAsPaid(sub.id);
      if (res.success) {
        confetti({ particleCount: 60, spread: 70 });
        onShowToast(`Marked as Paid! $${sub.calculated_credit.toFixed(2)} deducted from ${sub.user?.full_name}'s wallet. SMS sent.`);
        onRefresh();
      } else {
        alert(res.error || 'Failed to mark as paid');
      }
    } catch (err: any) {
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
    <div style={{ maxWidth: '1400px', margin: '2rem auto', padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Top Admin Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem' }}>
        
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>REGISTERED WORKERS</span>
            <Users size={18} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.5rem', color: '#f8fafc' }}>
            {workers.length}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Active assigned workstations</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', borderColor: pendingCount > 0 ? 'rgba(245, 158, 11, 0.4)' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>PENDING APPROVALS</span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.5rem', color: pendingCount > 0 ? '#fbbf24' : '#f8fafc' }}>
            {pendingCount}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Requires verification & credit</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL WALLET BALANCES</span>
            <Coins size={18} color="var(--accent-emerald)" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.5rem', color: '#34d399' }}>
            ${totalWalletLiability.toFixed(2)}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Ready for payout deduction</span>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>PAID DISBURSEMENTS</span>
            <DollarSign size={18} color="#3b82f6" />
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.5rem', color: '#60a5fa' }}>
            {paidCount}
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Marked as paid and deducted</span>
        </div>

      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setActiveTab('submissions')}
            className={activeTab === 'submissions' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.85rem' }}
          >
            <Clock size={16} /> Submissions Approval Hub ({pendingCount} Pending)
          </button>
          <button
            onClick={() => setActiveTab('workers')}
            className={activeTab === 'workers' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.85rem' }}
          >
            <Users size={16} /> Workers Directory ({workers.length})
          </button>
          <button
            onClick={() => setActiveTab('reminders')}
            className={activeTab === 'reminders' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.85rem' }}
          >
            <Send size={16} /> Saturday SMS Reminders
          </button>
          <button
            onClick={() => setActiveTab('sms_logs')}
            className={activeTab === 'sms_logs' ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '0.85rem' }}
          >
            <MessageSquare size={16} /> SMS Transmission Logs ({smsLogs.length})
          </button>
        </div>

        <button
          onClick={onRefresh}
          className="btn-secondary"
          style={{ fontSize: '0.8rem' }}
          title="Refresh Data from Supabase & Redis"
        >
          <RefreshCw size={14} /> Sync Now
        </button>
      </div>

      {/* TAB 1: SUBMISSIONS MANAGEMENT & APPROVAL */}
      {activeTab === 'submissions' && (
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Weekly Earnings Approvals & Payouts</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Verify submitted amounts, calculate and credit wallets, and mark as paid to deduct wallet balance.
              </p>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {['all', 'pending', 'approved', 'paid'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className="btn-secondary"
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'capitalize',
                    background: filterStatus === status ? 'var(--accent-cyan)' : undefined,
                    color: filterStatus === status ? '#0a0d14' : undefined,
                    fontWeight: filterStatus === status ? 700 : 500
                  }}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
              <Clock size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <p>No submissions matching filter '{filterStatus}'.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Worker Name & Phone</th>
                    <th>Week Date</th>
                    <th>Submitted Amount</th>
                    <th>Calculated Credit Rule</th>
                    <th>Status</th>
                    <th>Admin Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map(sub => (
                    <tr key={sub.id}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{sub.user?.full_name || 'Worker'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {sub.user?.phone_number}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{sub.week_date}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
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
                            {sub.amount_made <= 40 ? '≤$40 ($0)' : sub.amount_made <= 80 ? '$40-$80' : '>$80 Tier'}
                          </span>
                        </div>
                      </td>
                      <td>
                        {sub.status === 'pending' && <span className="badge badge-pending">Pending Approval</span>}
                        {sub.status === 'approved' && <span className="badge badge-approved">Approved (Credited)</span>}
                        {sub.status === 'paid' && <span className="badge badge-paid">Paid (Deducted)</span>}
                        {sub.status === 'rejected' && <span className="badge badge-rejected">Rejected</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {sub.status === 'pending' && (
                            <button
                              onClick={() => handleApprove(sub)}
                              disabled={isProcessing === sub.id}
                              className="btn-success"
                              style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}
                              title="Approves amount, credits wallet, and sends approval SMS"
                            >
                              <CheckCircle2 size={14} /> Approve & Credit
                            </button>
                          )}

                          {sub.status === 'approved' && (
                            <button
                              onClick={() => handleMarkAsPaid(sub)}
                              disabled={isProcessing === sub.id}
                              className="btn-primary"
                              style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem' }}
                              title="Marks as paid, deducts wallet balance, and sends paid SMS"
                            >
                              <DollarSign size={14} /> Mark as Paid
                            </button>
                          )}

                          {sub.status === 'paid' && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <CheckCircle2 size={14} /> Payout Completed
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WORKERS DIRECTORY */}
      {activeTab === 'workers' && (
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Workers Directory & Assigned Devices</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Registered workers with active phone verification, assigned device URLs, and device PINs.
              </p>
            </div>

            <div style={{ position: 'relative', minWidth: '260px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="text"
                placeholder="Search by name, phone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '2.5rem', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Worker Full Name</th>
                  <th>Verified Phone Number</th>
                  <th>Assigned Device URL</th>
                  <th>Assigned PIN</th>
                  <th>Current Wallet Balance</th>
                  <th>Quick Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkers.map(w => (
                  <tr key={w.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{w.full_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{w.email}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                        {w.phone_number}
                        {w.phone_verified && (
                          <span title="Verified via SMS">
                            <CheckCircle2 size={14} color="#10b981" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <a
                        href={w.device_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#38bdf8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem' }}
                      >
                        {w.device_url.replace(/^https?:\/\//, '').slice(0, 28)}...
                        <ExternalLink size={12} />
                      </a>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', background: 'rgba(255, 255, 255, 0.05)', padding: '0.2rem 0.5rem', borderRadius: '4px', letterSpacing: '0.1em' }}>
                        {w.device_pin}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: w.wallet_balance > 0 ? '#34d399' : 'var(--text-dim)' }}>
                        ${w.wallet_balance.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={async () => {
                          const msg = `Hello ${w.full_name}, this is a test notification from ApexRecords Admin.`;
                          const res = await SMSService.sendSMS({
                            mobile: w.phone_number,
                            recipientName: w.full_name,
                            message: msg,
                            messageType: 'custom',
                            userId: w.id
                          });
                          onShowToast(`SMS sent to ${w.full_name}: ${res.description}`);
                          onRefresh();
                        }}
                        className="btn-secondary"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem' }}
                      >
                        <MessageSquare size={12} /> Test SMS
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SATURDAY SMS REMINDERS */}
      {activeTab === 'reminders' && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Send size={20} color="var(--accent-cyan)" />
                Saturday Automated Weekly Earnings Reminders
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Every Saturday, workers receive an automated SMS reminding them to submit the money made that week.
              </p>
            </div>

            <button
              onClick={handleSendSaturdayReminders}
              disabled={isProcessing === 'reminders'}
              className="btn-primary"
              style={{ padding: '0.75rem 1.25rem' }}
            >
              <Send size={16} />
              {isProcessing === 'reminders' ? 'Sending Reminders...' : `Trigger Saturday SMS to All (${workers.length}) Workers`}
            </button>
          </div>

          <div style={{ background: 'rgba(10, 13, 20, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Standard Message Template (TextSMS Gateway)
            </span>
            <div style={{ marginTop: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: '#38bdf8', background: 'rgba(0, 0, 0, 0.4)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
              "Hello Samson Matata Mwinzi, it's Saturday! This is a reminder to submit your weekly earnings through your dashboard."
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
              * The user's registered full name is dynamically injected into each message as required.
            </p>
          </div>

          {/* TextSMS Balance Check */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '10px' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>TextSMS Kenya Balance Checker</div>
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
              <RefreshCw size={14} /> Check Balance
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: SMS AUDIT LOGS */}
      {activeTab === 'sms_logs' && (
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>TextSMS Kenya Transmission Audit Log</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Verified audit trail for all OTP, Submission, Approval, Payout, and Reminder messages.
              </p>
            </div>
            <span className="badge badge-approved">{smsLogs.length} Dispatched</span>
          </div>

          {smsLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
              <MessageSquare size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <p>No SMS logs yet. Dispatch an action to see logs appear here.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Recipient & Mobile</th>
                    <th>Type</th>
                    <th>SMS Message Body (Starts with Name)</th>
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
                        <span className="badge" style={{ fontSize: '0.65rem' }}>
                          {log.message_type}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#f8fafc', maxWidth: '420px' }}>
                        {log.message}
                      </td>
                      <td>
                        <span className="badge badge-approved">
                          {log.status_code} OK
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
