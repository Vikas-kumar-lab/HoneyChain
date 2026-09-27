import React from 'react';
import { FiAlertCircle, FiCheckCircle, FiAlertTriangle, FiInfo, FiX } from 'react-icons/fi';

export default function NotificationToast({ notification, onClose }) {
  if (!notification || !notification.message) return null;

  const isError = notification.type === 'error' || notification.type === 'danger';
  const isSuccess = notification.type === 'success';
  const isWarning = notification.type === 'warning';

  const bgColor = isError ? '#fee2e2' : isSuccess ? '#dcfce7' : isWarning ? '#fef3c7' : '#e0f2fe';
  const textColor = isError ? '#991b1b' : isSuccess ? '#166534' : isWarning ? '#92400e' : '#075985';
  const borderColor = isError ? '#f87171' : isSuccess ? '#4ade80' : isWarning ? '#fcd34d' : '#38bdf8';

  const IconComponent = isError ? FiAlertCircle : isSuccess ? FiCheckCircle : isWarning ? FiAlertTriangle : FiInfo;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 99999,
        maxWidth: '480px',
        minWidth: '320px',
        padding: '14px 18px',
        borderRadius: '12px',
        backgroundColor: bgColor,
        color: textColor,
        border: `1.5px solid ${borderColor}`,
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        animation: 'slideUp 0.25s ease-out'
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, marginTop: '2px' }}>
        <IconComponent size={18} />
      </span>
      <div style={{ flex: 1, fontSize: '0.9rem', lineHeight: 1.4, fontWeight: 500 }}>
        {notification.message}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: textColor,
            cursor: 'pointer',
            padding: '0 4px',
            opacity: 0.7,
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
            flexShrink: 0
          }}
          title="Dismiss"
        >
          <FiX size={16} />
        </button>
      )}
    </div>
  );
}
