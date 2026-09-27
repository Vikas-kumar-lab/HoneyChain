import React from 'react';
import { FiZap, FiUser } from 'react-icons/fi';

export function ApprovedRolesQuickSwitch({
  accounts = [],
  selectedIdentifier,
  onSelectAccount
}) {
  return (
    <div style={{
      marginTop: '20px',
      paddingTop: '16px',
      borderTop: '1px solid #F1F5F9'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FiZap size={14} color="var(--primary-honey)" />
          <span style={{ fontSize: '0.74rem', fontWeight: 600, color: '#475569', letterSpacing: '0.02em' }}>
            1-Click Quick Access Credentials
          </span>
          <span style={{
            fontSize: '0.66rem',
            background: '#F1F5F9',
            color: '#64748B',
            borderRadius: '10px',
            padding: '1px 7px',
            fontWeight: 500
          }}>
            {accounts.length}
          </span>
        </div>
        <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
          Click to prefill & test
        </span>
      </div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
        maxHeight: '270px',
        overflowY: 'auto',
        paddingRight: '2px'
      }}>
        {accounts.map((acc) => {
          const isApproved = acc.status === 'APPROVED';
          const loginIdentifier = acc.role === 'ADMIN' ? 'admin' : (acc.phone || acc.username);
          const isSelected = selectedIdentifier === loginIdentifier || selectedIdentifier === acc.username || (acc.phone && selectedIdentifier === acc.phone);

          return (
            <div
              key={acc.username || acc.id}
              onClick={() => onSelectAccount(acc, loginIdentifier)}
              style={{
                padding: '8px 11px',
                background: isSelected ? '#F8FAFC' : '#FFFFFF',
                border: isSelected ? '1px solid #CBD5E1' : '1px solid #E2E8F0',
                borderRadius: '7px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: `${acc.color || '#B45309'}14`,
                  color: acc.color || '#B45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.90rem',
                  flexShrink: 0
                }}>
                  {acc.icon || <FiUser size={14} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#1E293B' }}>
                      {acc.name}
                    </span>
                    <span style={{
                      fontSize: '0.63rem',
                      fontWeight: 500,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: isApproved ? 'var(--forest-green-light)' : '#FEF3C7',
                      color: isApproved ? 'var(--forest-green)' : '#92400E'
                    }}>
                      {isApproved ? (acc.badge || 'Approved') : '⏳ Pending Approval'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.70rem', color: '#64748B', display: 'flex', gap: '8px', marginTop: '1px' }}>
                    <span>ID: <code>{loginIdentifier}</code></span>
                    <span>Pass: <code>123</code></span>
                  </div>
                </div>
              </div>

              <div style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: isSelected ? 'var(--primary-honey-hover)' : '#94A3B8',
                flexShrink: 0
              }}>
                {isSelected ? 'Selected' : 'Use →'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ApprovedRolesQuickSwitch;
