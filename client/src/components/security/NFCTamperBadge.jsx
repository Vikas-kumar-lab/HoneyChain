import React, { useState } from 'react';
import { FiShield, FiAlertTriangle, FiZap, FiCheck } from 'react-icons/fi';
import { FaFlask } from 'react-icons/fa';

/**
 * NFCTamperBadge
 * Demonstrates the Physical-to-Digital Twin link using Cryptographic Tamper-Evident NFC seals.
 * Cap-to-neck physical antenna loop integrity is verified digitally.
 */
export default function NFCTamperBadge({
  token,
  serial,
  initialStatus = 'INTACT',
  interactive = true,
  onStatusChange
}) {
  const [status, setStatus] = useState(initialStatus);

  const handleToggle = (newStatus) => {
    setStatus(newStatus);
    if (onStatusChange) onStatusChange(newStatus);
  };

  const isIntact = status === 'INTACT';

  return (
    <div
      style={{
        background: isIntact
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.04) 100%)'
          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(220, 38, 38, 0.05) 100%)',
        border: `1.5px solid ${isIntact ? '#10b981' : '#ef4444'}`,
        borderRadius: '14px',
        padding: '16px 20px',
        marginTop: '12px',
        marginBottom: '12px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              backgroundColor: isIntact ? '#10b98120' : '#ef444420',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isIntact
              ? <FiShield size={20} color="#10b981" />
              : <FiAlertTriangle size={20} color="#ef4444" />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ color: isIntact ? '#065f46' : '#991b1b', fontSize: '0.95rem' }}>
                {isIntact ? 'TAMPER-EVIDENT SEAL: INTACT & SECURE' : 'WARNING: SEAL OPENED / REFILL ATTEMPT'}
              </strong>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '6px',
                  backgroundColor: isIntact ? '#10b981' : '#ef4444',
                  color: '#ffffff'
                }}
              >
                {isIntact ? '100% PURE' : 'COMPROMISED'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '3px' }}>
              NTAG 424 DNA Cryptographic Twin • Physical Cap Loop: <strong>{isIntact ? 'UNBROKEN' : 'CIRCUIT SEVERED'}</strong>
            </div>
          </div>
        </div>

        {serial && (
          <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#334155' }}>
            <div>Serial: <code style={{ fontWeight: 700 }}>{serial}</code></div>
            <div>PIN: <code style={{ color: '#d97706', fontWeight: 700 }}>{token || 'E1FC-2178'}</code></div>
          </div>
        )}
      </div>

      {interactive && (
        <div
          style={{
            marginTop: '14px',
            paddingTop: '10px',
            borderTop: `1px dashed ${isIntact ? '#a7f3d0' : '#fecaca'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px'
          }}
        >
          <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FaFlask size={13} color="#7c3aed" /> Judge / Demo Simulation: Test how physical opening breaks the cryptographic seal state.
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              onClick={() => handleToggle('INTACT')}
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #10b981',
                backgroundColor: isIntact ? '#10b981' : '#ffffff',
                color: isIntact ? '#ffffff' : '#10b981',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <FiCheck size={12} /> Sealed (Intact)
            </button>
            <button
              type="button"
              onClick={() => handleToggle('BROKEN')}
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #ef4444',
                backgroundColor: !isIntact ? '#ef4444' : '#ffffff',
                color: !isIntact ? '#ffffff' : '#ef4444',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <FiZap size={12} /> Twist Cap (Break Seal)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
