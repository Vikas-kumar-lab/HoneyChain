import React, { useState } from 'react';
import Modal from '../common/Modal';
import { FaStore } from 'react-icons/fa';
import { FiClock } from 'react-icons/fi';

export default function RetailStockingModal({
  isOpen,
  onClose,
  batch,
  onSubmit,
  loading = false
}) {
  const [storeLocation, setStoreLocation] = useState('KVIC Khadi Bhavan, Connaught Place, New Delhi');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      batchId: batch?.batchId,
      storeLocation: storeLocation.trim()
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stock Batch at KVIC Retail Store" maxWidth="520px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ backgroundColor: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '10px', padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#9d174d' }}>
            Batch: {batch?.batchCode || `HC-BATCH-${batch?.batchId}`}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#be185d', marginTop: '2px' }}>
            Total Stock: <strong>{batch?.jarsTotal || 50} Bottles</strong> • Tamper seals verified
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
            Retail Emporium / Shelf Location:
          </label>
          <input
            type="text"
            required
            value={storeLocation}
            onChange={(e) => setStoreLocation(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }}
          />
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
              backgroundColor: '#db2777',
              color: '#ffffff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <FiClock size={14} /> Updating Retail Stage...
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <FaStore size={14} /> Stock at Retail Shelf
              </span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
