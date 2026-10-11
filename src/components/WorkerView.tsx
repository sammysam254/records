import React, { useState } from 'react';
import type { UserProfile, WeeklySubmission } from '../types';
import { getCalculationBreakdown } from '../utils/calculator';
import { DataService } from '../services/dataService';
import { 
  Wallet, 
  ExternalLink, 
  Copy, 
  Check, 
  Send, 
  Sparkles, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  Smartphone,
  Info,
  DollarSign
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface WorkerViewProps {
  worker: UserProfile;
  submissions: WeeklySubmission[];
  onRefresh: () => void;
  onShowToast: (message: string) => void;
}

export const WorkerView: React.FC<WorkerViewProps> = ({
  worker,
  submissions,
  onRefresh,
  onShowToast
}) => {
  const [amountInput, setAmountInput] = useState<string>('');
  const [showPin, setShowPin] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter submissions for this worker
  const mySubmissions = submissions.filter(s => s.user_id === worker.id);

  // Parse numeric amount
  const numericAmount = parseFloat(amountInput) || 0;
  const breakdown = getCalculationBreakdown(numericAmount);

  // Copy PIN helper
  const handleCopyPin = () => {
    navigator.clipboard.writeText(worker.device_pin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
    onShowToast(`PIN ${worker.device_pin} copied to clipboard!`);
  };

  // Open Assigned Device URL in a new tab
  const handleOpenDevice = () => {
    let url = worker.device_url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    onShowToast(`Launching assigned device URL in new tab...`);
  };

  // Submit Saturday earnings
  const handleSubmitEarnings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numericAmount <= 0) {
      alert('Please enter a valid weekly earnings amount greater than 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await DataService.submitWeeklyEarnings(worker.id, numericAmount);
      if (res.success) {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.7 }
        });
        onShowToast(`Weekly earnings of $${numericAmount.toFixed(2)} submitted! SMS confirmation sent to ${worker.phone_number}`);
        setAmountInput('');
        onRefresh();
      } else {
        alert(res.error || 'Failed to submit earnings');
      }
    } catch (err: any) {
      alert(err.message || 'Submission error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if today is Saturday (6)
  const isSaturday = new Date().getDay() === 6;

  return (
    <div className="page-container">
      
      {/* Saturday Reminder Banner (Responsive Flex Stack) */}
      <div className="glass-panel" style={{
        background: isSaturday 
          ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15))' 
          : 'linear-gradient(90deg, rgba(245, 158, 11, 0.1), rgba(139, 92, 246, 0.1))',
        borderColor: isSaturday ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.85rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            background: isSaturday ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            padding: '0.6rem',
            borderRadius: '10px',
            flexShrink: 0
          }}>
            <Calendar size={22} color={isSaturday ? '#10b981' : '#f59e0b'} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {isSaturday ? '🌟 Today is Saturday: Submission Day!' : '📅 Weekly Earnings Schedule (Saturdays)'}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Submit your weekly earnings. Once approved by admin, funds are credited to your wallet.
            </p>
          </div>
        </div>
        <div className="badge" style={{
          background: isSaturday ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
          color: isSaturday ? '#34d399' : '#fbbf24',
          alignSelf: 'flex-start'
        }}>
          {isSaturday ? 'Window Active' : 'Every Saturday'}
        </div>
      </div>

      {/* Top Cards Grid (Responsive 1-2 columns) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
        gap: '1.25rem',
        width: '100%'
      }}>
        
        {/* Wallet Balance Hero Card */}
        <div className="glass-panel" style={{
          padding: '1.5rem',
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(59, 130, 246, 0.05) 100%)',
          border: '1px solid var(--border-accent)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ background: 'rgba(6, 182, 212, 0.2)', padding: '0.45rem', borderRadius: '10px' }}>
                <Wallet size={18} color="#06b6d4" />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>My Wallet</span>
            </div>
            <span className="badge badge-approved" style={{ fontSize: '0.68rem' }}>
              <CheckCircle2 size={12} /> Phone Verified
            </span>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Available Balance
            </span>
            <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
              <span style={{ fontSize: '1.4rem', color: 'var(--accent-cyan)' }}>$</span>
              {worker.wallet_balance.toFixed(2)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <div>
              <strong style={{ color: '#f8fafc' }}>{worker.full_name}</strong>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{worker.phone_number}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>{mySubmissions.length} Submissions</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)' }}>Active Account</div>
            </div>
          </div>
        </div>

        {/* Assigned Device & PIN Card */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ background: 'rgba(139, 92, 246, 0.2)', padding: '0.45rem', borderRadius: '10px' }}>
                <Smartphone size={18} color="#a78bfa" />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Assigned Device Workstation</span>
            </div>
            <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c4b5fd', fontSize: '0.68rem' }}>
              Workstation
            </span>
          </div>

          {/* Assigned Device URL Box */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Device URL
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                readOnly
                value={worker.device_url}
                className="form-input"
                style={{ flex: 1, minWidth: '180px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#38bdf8' }}
              />
              <button
                type="button"
                onClick={handleOpenDevice}
                className="btn-primary"
                style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}
                title="Launch assigned workstation"
              >
                <ExternalLink size={15} /> Open Device
              </button>
            </div>
          </div>

          {/* Assigned Device PIN Box */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Device PIN
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{
                flex: 1,
                background: 'rgba(10, 13, 20, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '0.6rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                letterSpacing: showPin ? '0.2em' : '0.35em'
              }}>
                <span>{showPin ? worker.device_pin : '••••'}</span>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem' }}
                >
                  {showPin ? 'Hide' : 'Show'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyPin}
                className="btn-secondary"
                style={{ padding: '0.6rem 0.85rem', whiteSpace: 'nowrap', fontSize: '0.82rem' }}
                title="Copy PIN"
              >
                {copiedPin ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                <span>{copiedPin ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Saturday Earnings Submission Card with Live Tier Calculator */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <DollarSign size={20} color="var(--accent-cyan)" />
              Submit Weekly Earnings (Every Saturday)
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Enter the amount made this week. Credit is calculated automatically based on company rules.
            </p>
          </div>

          <div className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', fontSize: '0.7rem' }}>
            <Sparkles size={13} /> Auto Credit Calculator
          </div>
        </div>

        <form onSubmit={handleSubmitEarnings}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
            gap: '1.25rem',
            alignItems: 'start'
          }}>
            
            {/* Input Column */}
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                Amount Made This Week ($) *
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '1.1rem' }}>
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  required
                  placeholder="e.g. 110.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.4rem', fontSize: '1.2rem', fontWeight: 700 }}
                />
              </div>

              {/* Quick Preset Buttons */}
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Presets:</span>
                {[35, 60, 80, 100, 120].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmountInput(val.toString())}
                    className="btn-secondary"
                    style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', minHeight: 'auto' }}
                  >
                    ${val}
                  </button>
                ))}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || numericAmount <= 0}
                className="btn-primary"
                style={{ width: '100%', marginTop: '1.25rem', padding: '0.85rem', justifyContent: 'center', fontSize: '0.95rem' }}
              >
                <Send size={16} />
                {isSubmitting ? 'Submitting & Dispatching SMS...' : `Submit $${numericAmount.toFixed(2)} for Approval`}
              </button>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: '0.4rem' }}>
                You will receive an SMS confirmation on your phone once submitted.
              </p>
            </div>

            {/* Live Calculation Preview Card (Visualizing the 3 rules in Dollars) */}
            <div style={{
              background: 'rgba(10, 13, 20, 0.6)',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              padding: '1.15rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Credit Preview
                </span>
                <span className="badge" style={{
                  fontSize: '0.68rem',
                  background: breakdown.tier === 1 ? 'rgba(244, 63, 94, 0.15)' : breakdown.tier === 2 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: breakdown.tier === 1 ? '#fb7185' : breakdown.tier === 2 ? '#fbbf24' : '#34d399'
                }}>
                  Tier {breakdown.tier} Rule
                </span>
              </div>

              {/* 3 Rule Indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem' }}>
                <div style={{
                  padding: '0.45rem 0.65rem',
                  borderRadius: '7px',
                  background: breakdown.tier === 1 && numericAmount > 0 ? 'rgba(244, 63, 94, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: breakdown.tier === 1 && numericAmount > 0 ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>Rule 1: Amount ≤ $40</span>
                  <strong>$0.00 Credit</strong>
                </div>

                <div style={{
                  padding: '0.45rem 0.65rem',
                  borderRadius: '7px',
                  background: breakdown.tier === 2 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: breakdown.tier === 2 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>Rule 2: $40 &lt; Amount ≤ $80</span>
                  <strong>Amount - $40</strong>
                </div>

                <div style={{
                  padding: '0.45rem 0.65rem',
                  borderRadius: '7px',
                  background: breakdown.tier === 3 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: breakdown.tier === 3 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>Rule 3: Amount &gt; $80</span>
                  <strong>$40 + (Excess / 2)</strong>
                </div>
              </div>

              {/* Estimated Total */}
              <div style={{
                marginTop: '0.25rem',
                paddingTop: '0.65rem',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Estimated Wallet Credit:</span>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>Credited once approved</div>
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                  +${breakdown.totalCredit.toFixed(2)}
                </div>
              </div>

              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.02)', padding: '0.45rem 0.65rem', borderRadius: '6px' }}>
                <Info size={11} style={{ display: 'inline', marginRight: '4px' }} />
                {breakdown.summary}
              </div>
            </div>

          </div>
        </form>
      </div>

      {/* Submissions History (Cards on mobile, Table on Desktop) */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>My Weekly Submissions</h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Records of your submitted earnings, approval status, and credited amounts.</p>
          </div>
          <span className="badge badge-paid" style={{ fontSize: '0.68rem' }}>{mySubmissions.length} Records</span>
        </div>

        {mySubmissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-dim)' }}>
            <Clock size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <p>No earnings submitted yet. Use the form above to submit your Saturday earnings.</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards View */}
            <div className="show-on-mobile" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {mySubmissions.map(sub => (
                <div key={sub.id} style={{
                  background: 'rgba(10, 13, 20, 0.7)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Week of {sub.week_date}</div>
                    {sub.status === 'pending' && <span className="badge badge-pending">Pending</span>}
                    {sub.status === 'approved' && <span className="badge badge-approved">Approved</span>}
                    {sub.status === 'paid' && <span className="badge badge-paid">Paid</span>}
                    {sub.status === 'rejected' && <span className="badge badge-rejected">Rejected</span>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.6rem 0.75rem', borderRadius: '8px' }}>
                    <div>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Submitted</span>
                      <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>${sub.amount_made.toFixed(2)}</strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>Wallet Credit</span>
                      <strong style={{ fontSize: '1rem', color: 'var(--accent-emerald)' }}>+${sub.calculated_credit.toFixed(2)}</strong>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    {sub.status === 'pending' && 'Awaiting admin verification'}
                    {sub.status === 'approved' && `Approved at ${new Date(sub.approved_at || '').toLocaleDateString()}`}
                    {sub.status === 'paid' && `Paid and disbursed on ${new Date(sub.paid_at || '').toLocaleDateString()}`}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="table-responsive hide-on-mobile">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Date / Week</th>
                    <th>Submitted Amount</th>
                    <th>Wallet Credit</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {mySubmissions.map((sub) => (
                    <tr key={sub.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{sub.week_date}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                          {new Date(sub.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                          ${sub.amount_made.toFixed(2)}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontSize: '0.95rem' }}>
                          +${sub.calculated_credit.toFixed(2)}
                        </span>
                      </td>
                      <td>
                        {sub.status === 'pending' && (
                          <span className="badge badge-pending">
                            <Clock size={12} /> Pending Approval
                          </span>
                        )}
                        {sub.status === 'approved' && (
                          <span className="badge badge-approved">
                            <CheckCircle2 size={12} /> Approved (Credited)
                          </span>
                        )}
                        {sub.status === 'paid' && (
                          <span className="badge badge-paid">
                            <DollarSign size={12} /> Paid &amp; Disbursed
                          </span>
                        )}
                        {sub.status === 'rejected' && (
                          <span className="badge badge-rejected">Rejected</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {sub.status === 'pending' && 'Awaiting administrator verification'}
                        {sub.status === 'approved' && `Approved at ${new Date(sub.approved_at || '').toLocaleDateString()}`}
                        {sub.status === 'paid' && `Paid and deducted from wallet on ${new Date(sub.paid_at || '').toLocaleDateString()}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </div>
  );
};
