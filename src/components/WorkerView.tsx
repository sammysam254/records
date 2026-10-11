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
    <div style={{ maxWidth: '1280px', margin: '2rem auto', padding: '0 1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Saturday Reminder Banner */}
      <div className="glass-panel" style={{
        background: isSaturday 
          ? 'linear-gradient(90deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.15))' 
          : 'linear-gradient(90deg, rgba(245, 158, 11, 0.1), rgba(139, 92, 246, 0.1))',
        borderColor: isSaturday ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',
        padding: '1rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            background: isSaturday ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            padding: '0.65rem',
            borderRadius: '10px'
          }}>
            <Calendar size={24} color={isSaturday ? '#10b981' : '#f59e0b'} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>
              {isSaturday ? '🌟 Today is Saturday: Weekly Earnings Submission Day!' : '📅 Weekly Earnings Schedule (Every Saturday)'}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Workers submit their weekly earnings every Saturday. Credit is approved by admin and paid directly to your wallet.
            </p>
          </div>
        </div>
        <div className="badge" style={{ background: isSaturday ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: isSaturday ? '#34d399' : '#fbbf24' }}>
          {isSaturday ? 'Submission Active' : 'Saturday Window'}
        </div>
      </div>

      {/* Top Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
        
        {/* Wallet Balance Hero Card */}
        <div className="glass-panel" style={{
          padding: '1.75rem',
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(59, 130, 246, 0.05) 100%)',
          border: '1px solid var(--border-accent)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ background: 'rgba(6, 182, 212, 0.2)', padding: '0.5rem', borderRadius: '10px' }}>
                <Wallet size={20} color="#06b6d4" />
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Worker Wallet</span>
            </div>
            <span className="badge badge-approved">
              <CheckCircle2 size={12} /> Phone Verified
            </span>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available Balance</span>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '1.5rem', color: 'var(--accent-cyan)' }}>$</span>
              {worker.wallet_balance.toFixed(2)}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <div>
              <strong>{worker.full_name}</strong>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{worker.phone_number}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div>{mySubmissions.length} Submissions</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Active Account</div>
            </div>
          </div>
        </div>

        {/* Assigned Device & PIN Card */}
        <div className="glass-panel" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ background: 'rgba(139, 92, 246, 0.2)', padding: '0.5rem', borderRadius: '10px' }}>
                <Smartphone size={20} color="#a78bfa" />
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Assigned Device Workstation</span>
            </div>
            <span className="badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c4b5fd' }}>
              Direct Launch
            </span>
          </div>

          {/* Assigned Device URL Box */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              Assigned Device URL
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                readOnly
                value={worker.device_url}
                className="form-input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#38bdf8' }}
              />
              <button
                type="button"
                onClick={handleOpenDevice}
                className="btn-primary"
                style={{ padding: '0.65rem 1rem', whiteSpace: 'nowrap' }}
                title="Open assigned device URL in new window"
              >
                <ExternalLink size={16} /> Open Device
              </button>
            </div>
          </div>

          {/* Assigned Device PIN Box */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              Assigned Device PIN
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{
                flex: 1,
                background: 'rgba(10, 13, 20, 0.8)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '0.65rem 1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                letterSpacing: showPin ? '0.2em' : '0.4em'
              }}>
                <span>{showPin ? worker.device_pin : '••••'}</span>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  {showPin ? 'Hide' : 'Show'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyPin}
                className="btn-secondary"
                style={{ padding: '0.65rem 1rem', whiteSpace: 'nowrap' }}
                title="Copy PIN"
              >
                {copiedPin ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                <span>{copiedPin ? 'Copied' : 'Copy PIN'}</span>
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.4rem' }}>
              Enter this PIN after clicking Open Device to authenticate your session.
            </p>
          </div>
        </div>

      </div>

      {/* Saturday Earnings Submission Card with Live Tier Calculator */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <DollarSign size={22} color="var(--accent-cyan)" />
              Submit Weekly Earnings (Every Saturday)
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Enter the exact amount of money made this week. The system calculates your wallet credit automatically based on company rules.
            </p>
          </div>

          <div className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8' }}>
            <Sparkles size={14} /> Automated Credit Calculator
          </div>
        </div>

        <form onSubmit={handleSubmitEarnings}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
            
            {/* Input Column */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                Amount Made This Week ($)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '1.1rem' }}>
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="e.g. 110.00"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '2.5rem', fontSize: '1.25rem', fontWeight: 700 }}
                />
              </div>

              {/* Quick Preset Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', alignSelf: 'center' }}>Test presets:</span>
                {[35, 60, 80, 100, 120].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmountInput(val.toString())}
                    className="btn-secondary"
                    style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
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
                style={{ width: '100%', marginTop: '1.5rem', padding: '0.9rem', justifyContent: 'center', fontSize: '1rem' }}
              >
                <Send size={18} />
                {isSubmitting ? 'Submitting & Dispatching SMS...' : `Submit $${numericAmount.toFixed(2)} for Approval`}
              </button>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'center', marginTop: '0.5rem' }}>
                You will receive an instant SMS confirming your submission is received for admin approval.
              </p>
            </div>

            {/* Live Calculation Preview Card (Visualizing the 3 rules in Dollars) */}
            <div style={{
              background: 'rgba(10, 13, 20, 0.6)',
              borderRadius: '14px',
              border: '1px solid var(--border-subtle)',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Credit Calculation Preview
                </span>
                <span className="badge" style={{
                  background: breakdown.tier === 1 ? 'rgba(244, 63, 94, 0.15)' : breakdown.tier === 2 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: breakdown.tier === 1 ? '#fb7185' : breakdown.tier === 2 ? '#fbbf24' : '#34d399'
                }}>
                  Tier {breakdown.tier} Rule Applied
                </span>
              </div>

              {/* 3 Rule Indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
                <div style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  background: breakdown.tier === 1 && numericAmount > 0 ? 'rgba(244, 63, 94, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: breakdown.tier === 1 && numericAmount > 0 ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>Rule 1: Amount ≤ $40</span>
                  <strong>$0.00 Credited</strong>
                </div>

                <div style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  background: breakdown.tier === 2 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: breakdown.tier === 2 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>Rule 2: $40 &lt; Amount ≤ $80</span>
                  <strong>Amount - $40 Credited</strong>
                </div>

                <div style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: '8px',
                  background: breakdown.tier === 3 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: breakdown.tier === 3 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>Rule 3: Amount &gt; $80</span>
                  <strong>$40.00 + (Excess / 2) Credited</strong>
                </div>
              </div>

              {/* Estimated Total */}
              <div style={{
                marginTop: '0.5rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Estimated Wallet Credit:</span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Credited once approved by admin</div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-emerald)' }}>
                  +${breakdown.totalCredit.toFixed(2)}
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.02)', padding: '0.5rem', borderRadius: '6px' }}>
                <Info size={12} style={{ display: 'inline', marginRight: '4px' }} />
                {breakdown.summary}
              </div>
            </div>

          </div>
        </form>
      </div>

      {/* Submissions History Table */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>My Weekly Submissions & Payouts</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Complete audit log of your weekly reports, approval status, and wallet credits.</p>
          </div>
          <span className="badge badge-paid">{mySubmissions.length} Total Records</span>
        </div>

        {mySubmissions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
            <Clock size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <p>No earnings submitted yet. Use the form above to submit your Saturday earnings.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date / Week</th>
                  <th>Submitted Amount</th>
                  <th>Wallet Credit</th>
                  <th>Status</th>
                  <th>Approval / Paid Notes</th>
                </tr>
              </thead>
              <tbody>
                {mySubmissions.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{sub.week_date}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{new Date(sub.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
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
                          <DollarSign size={12} /> Paid & Disbursed
                        </span>
                      )}
                      {sub.status === 'rejected' && (
                        <span className="badge badge-rejected">Rejected</span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {sub.status === 'pending' && 'Awaiting administrator verification'}
                      {sub.status === 'approved' && `Approved at ${new Date(sub.approved_at || '').toLocaleDateString()}`}
                      {sub.status === 'paid' && `Paid and deducted from wallet on ${new Date(sub.paid_at || '').toLocaleDateString()}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
