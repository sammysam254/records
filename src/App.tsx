import { useState, useEffect } from 'react';
import type { UserProfile, WeeklySubmission, SMSLog } from './types';
import { DataService, ADMIN_EMAIL } from './services/dataService';
import { SMSService } from './services/smsService';
import { Navbar } from './components/Navbar';
import { WorkerView } from './components/WorkerView';
import { AdminView } from './components/AdminView';
import { AuthModal } from './components/AuthModal';
import { SettingsModal } from './components/SettingsModal';
import { Toast } from './components/Toast';

export function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentRoleView, setCurrentRoleView] = useState<'worker' | 'admin'>('worker');
  const [workers, setWorkers] = useState<UserProfile[]>([]);
  const [submissions, setSubmissions] = useState<WeeklySubmission[]>([]);
  const [smsLogs, setSmsLogs] = useState<SMSLog[]>([]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Initialize and load data
  const loadData = async (forceFresh: boolean = false) => {
    await DataService.init();
    const loadedWorkers = await DataService.getWorkers(forceFresh);
    const loadedSubmissions = await DataService.getSubmissions(forceFresh);
    const active = DataService.getCurrentUser(); // No auto-login fallback for strangers
    
    setWorkers(loadedWorkers);
    setSubmissions(loadedSubmissions);
    setCurrentUser(active);
    if (active && active.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      setCurrentRoleView('admin');
    } else {
      setCurrentRoleView('worker');
    }
    setSmsLogs(SMSService.getLogs());
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 4500);
  };

  const handleSwitchUser = (target: 'worker' | 'admin' | 'new') => {
    if (target === 'new') {
      if (!currentUser || currentUser.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        showToast('Admin access required to register workers.');
        setIsAuthOpen(true);
        return;
      }
      setIsAuthOpen(true);
      return;
    }

    if (target === 'admin') {
      if (!currentUser || currentUser.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        showToast('Administrative task restricted: You must be logged in as Administrator (sammyseth260@gmail.com).');
        setIsAuthOpen(true);
        return;
      }
      setCurrentRoleView('admin');
      showToast('Switched to Administrator Control Hub');
    } else {
      setCurrentRoleView('worker');
      showToast('Switched to Worker Dashboard');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        onOpenSettings={() => {
          if (!currentUser || currentUser.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
            showToast('Admin credentials required to view settings.');
            setIsAuthOpen(true);
            return;
          }
          setIsSettingsOpen(true);
        }}
        onSwitchUser={handleSwitchUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={() => {
          DataService.setCurrentUser(null);
          setCurrentUser(null);
          setCurrentRoleView('worker');
          showToast('You have been signed out.');
        }}
      />

      {/* Main Content Area */}
      <main style={{ flex: 1, paddingBottom: '3rem' }}>
        {currentRoleView === 'admin' && currentUser?.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() ? (
          <AdminView
            workers={workers}
            submissions={submissions}
            smsLogs={smsLogs}
            onRefresh={loadData}
            onShowToast={showToast}
          />
        ) : (
          <WorkerView
            worker={currentUser}
            submissions={submissions}
            onRefresh={loadData}
            onShowToast={showToast}
            onOpenAuth={() => setIsAuthOpen(true)}
          />
        )}
      </main>

      {/* Footer Info */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '1.25rem 1rem',
        textAlign: 'center',
        fontSize: '0.78rem',
        color: 'var(--text-dim)',
        background: 'rgba(10, 13, 20, 0.7)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ width: '100%', textAlign: 'center' }} className="show-on-mobile">
            <strong>VertextPay</strong> &copy; 2026. Worker Weekly Records &amp; SMS Disbursement.
          </div>
          <div className="hide-on-mobile">
            <strong>VertextPay</strong> &copy; 2026. Worker Weekly Records &amp; SMS Disbursement Platform.
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', width: '100%', maxWidth: 'none' }}>
            <span>Powered by <strong>TextSMS Kenya</strong> &amp; <strong>Upstash Redis</strong></span>
            <span>•</span>
            <button
              onClick={() => setIsSettingsOpen(true)}
              style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline' }}
            >
              Configure Netlify &amp; Supabase Keys
            </button>
          </div>
        </div>
      </footer>

      {/* Modals & Toasts */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(newUser) => {
          loadData();
          setCurrentUser(newUser);
          if (newUser.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
            setCurrentRoleView('admin');
          } else {
            setCurrentRoleView('worker');
          }
        }}
        onShowToast={showToast}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onShowToast={showToast}
      />

      <Toast
        message={toastMessage}
        onClose={() => setToastMessage(null)}
      />
    </div>
  );
}

export default App;
