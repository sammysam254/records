import React from 'react';
import { MessageSquare } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      maxWidth: 'calc(100vw - 2rem)',
      width: 'max-content',
      background: 'rgba(16, 22, 35, 0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(56, 189, 248, 0.3)',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 15px rgba(6, 182, 212, 0.25)',
      borderRadius: '12px',
      padding: '0.85rem 1.15rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      zIndex: 200,
      color: '#f8fafc',
      fontSize: '0.875rem'
    }} className="animate-slide-down">
      <div style={{ background: 'rgba(6, 182, 212, 0.2)', padding: '0.4rem', borderRadius: '8px' }}>
        <MessageSquare size={18} color="var(--accent-cyan)" />
      </div>
      <div style={{ flex: 1 }}>{message}</div>
      <button
        onClick={onClose}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem', padding: '0.2rem' }}
      >
        ×
      </button>
    </div>
  );
};
