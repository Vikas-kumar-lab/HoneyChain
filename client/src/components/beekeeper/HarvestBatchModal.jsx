import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { FiLock, FiClock, FiCheck } from 'react-icons/fi';

export default function HarvestBatchModal({
  isOpen,
  onClose,
  selectedHive,
  onSubmit,
  loading = false
}) {
  const [yieldKg, setYieldKg] = useState('25');
  const [batchCode, setBatchCode] = useState('');

  useEffect(() => {
    if (selectedHive) {
      const boxClean = (selectedHive.boxCode || 'JK01').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      const yr = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      setBatchCode(`HC-${yr}-${boxClean}-${rand}`);
    }
  }, [selectedHive, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const kg = parseFloat(yieldKg) || 20;
    onSubmit({
      hiveId: selectedHive?.id || 1,
      batchCode: batchCode.trim(),
      yieldWeightKg: kg
    });
  };

  const kgNum = parseFloat(yieldKg) || 0;
  const lockedBottles = Math.round(kgNum * 2); // 500g standard jars = 2x kg

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Harvest Raw Comb Honey Batch" maxWidth="560px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Active Hive Summary */}
        <div style={{ backgroundColor: '#fef3c7', borderRadius: '10px', padding: '12px 16px', border: '1px solid #fde68a' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e' }}>
            Origin Source: {selectedHive?.boxCode || `HIVE-#${selectedHive?.id}`}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '2px' }}>
            Flora: <strong>{selectedHive?.flora || 'Acacia Floral Honey'}</strong> • Location: {selectedHive?.location || selectedHive?.clusterLocation || 'Apiary Cluster'}
          </div>
        </div>

        {/* Batch Tracking Code */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: '6px' }}>
            Unique Batch Tracking Code:
          </label>
          <input
            type="text"
            required
            value={batchCode}
            onChange={(e) => setBatchCode(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              fontSize: '0.9rem',
              fontFamily: 'monospace',
              fontWeight: 600
            }}
          />
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            Immutable identification registered across all supply chain handoffs.
          </div>
        </div>

        {/* Yield Weight & Mathematical Volume Lock Preview */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: '6px' }}>
            Comb Harvest Yield Weight (in Kg):
          </label>
          <input
            type="number"
            required
            min="1"
            max="10000"
            step="0.5"
            value={yieldKg}
            onChange={(e) => setYieldKg(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              fontSize: '1rem',
              fontWeight: 700
            }}
          />
        </div>

        {/* Mathematical Volume Lock Preview */}
        <div
          style={{
            backgroundColor: '#f0fdf4',
            border: '1.5px solid #86efac',
            borderRadius: '10px',
            padding: '14px 16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 700, fontSize: '0.9rem' }}>
            <FiLock size={15} />
            <span>Mathematical Volume-Lock Guarantee</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#14532d', marginTop: '4px' }}>
            Smart contract will strictly lock: <strong>{lockedBottles} standard 500g bottles</strong>.
            The processor cannot mint or package more than this recorded quantity.
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#475569',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 22px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#16a34a',
              color: '#ffffff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {loading
              ? <><FiClock size={14} /> Recording Batch on-chain...</>
              : <><FiCheck size={14} /> Record Harvest &amp; Lock Volume</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
