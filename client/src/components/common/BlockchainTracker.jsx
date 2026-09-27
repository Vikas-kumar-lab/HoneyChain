import React from 'react';

export default function BlockchainTracker({
  network = 'Local Ganache (Port 8546)',
  contractAddress = '0x...',
  lastTxHash = '',
  status = 'ONLINE',
  relayMode = 'KVIC Gasless Relayer Gateway'
}) {
  const isOnline = status === 'ONLINE';

  return (
    <div
      style={{
        backgroundColor: '#0f172a',
        color: '#f8fafc',
        borderRadius: '12px',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        fontSize: '0.8rem',
        marginTop: '16px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: isOnline ? '#10b981' : '#ef4444',
            boxShadow: `0 0 8px ${isOnline ? '#10b981' : '#ef4444'}`
          }}
        />
        <div>
          <span style={{ fontWeight: 700, color: '#e2e8f0' }}>HoneyChain Node:</span>{' '}
          <span style={{ color: '#38bdf8' }}>{network}</span>
        </div>
        <div style={{ color: '#64748b' }}>•</div>
        <div style={{ color: '#94a3b8' }}>
          Mode: <strong style={{ color: '#a7f3d0' }}>{relayMode}</strong>
        </div>
      </div>

      {lastTxHash && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#94a3b8' }}>Last Mined Tx:</span>
          <code
            style={{
              backgroundColor: '#1e293b',
              padding: '2px 8px',
              borderRadius: '6px',
              color: '#fde047',
              fontFamily: 'monospace'
            }}
          >
            {lastTxHash.slice(0, 10)}...{lastTxHash.slice(-8)}
          </code>
        </div>
      )}
    </div>
  );
}
