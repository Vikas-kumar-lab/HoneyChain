import React, { useState } from 'react';
import Modal from '../common/Modal';
import { FiTruck, FiClock } from 'react-icons/fi';

export default function LogisticsDispatchModal({
  isOpen,
  onClose,
  batch,
  onSubmit,
  loading = false
}) {
  const [transitRoute, setTransitRoute] = useState('NH-44 Express Corridor (Refrigerated 18°C)');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      batchId: batch?.batchId,
      transitRoute: transitRoute.trim()
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dispatch Batch via Cold-Chain Logistics" maxWidth="520px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '10px', padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#6d28d9' }}>
            Batch: {batch?.batchCode || `HC-BATCH-${batch?.batchId}`}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#7c3aed', marginTop: '2px' }}>
            Target: <strong>{batch?.targetDestination || 'KVIC Retail Network'}</strong>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
            Transit Route & Vehicle Telemetry:
          </label>
          <input
            type="text"
            required
            value={transitRoute}
            onChange={(e) => setTransitRoute(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }}
          />
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            Logs temperature-controlled custody handoff on blockchain.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '9px 20px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#7c3aed',
              color: '#ffffff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading
              ? <><FiClock size={13} /> Mining Dispatch...</>
              : <><FiTruck size={13} /> Confirm &amp; Dispatch</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
