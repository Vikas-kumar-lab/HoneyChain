import React from 'react';
import { FiShield, FiAlertTriangle, FiCheck, FiClock } from 'react-icons/fi';

export default function ConsumerBanner({
  batchCode = '',
  floraName = 'Certified Pure Honey',
  beekeeperName = 'Certified Producer',
  clusterLocation = 'Rural Apiary Cluster',
  isCertifiedPure = true,
  isFlagged = false
}) {
  return (
    <div
      style={{
        background: isFlagged
          ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
          : 'linear-gradient(135deg, #d97706 0%, #92400e 100%)',
        color: '#ffffff',
        borderRadius: '16px',
        padding: '24px 28px',
        boxShadow: '0 10px 25px -5px rgba(217, 119, 6, 0.3)',
        marginBottom: '20px',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', position: 'relative', zIndex: 2 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: '4px 10px', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px' }}>
            {isFlagged ? (
              <>
                <FiAlertTriangle size={14} />
                <span>ADULTERATION ALERT</span>
              </>
            ) : (
              <>
                <FiShield size={14} />
                <span>OFFICIAL KVIC VERIFIED</span>
              </>
            )}
          </div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '1.6rem', fontWeight: 800 }}>
            {floraName}
          </h2>
          <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
            Origin: <strong>{beekeeperName}</strong> • {clusterLocation}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>Batch Identifier:</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.5px' }}>
            {batchCode}
          </div>
          <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
            {isCertifiedPure ? (
              <>
                <FiCheck size={12} />
                <span>100% Raw Comb Honey</span>
              </>
            ) : (
              <>
                <FiClock size={12} />
                <span>Verification In Progress</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
