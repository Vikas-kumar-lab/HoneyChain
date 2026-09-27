import React, { useState } from 'react';
import Modal from '../common/Modal';
import { FiCheck, FiClock } from 'react-icons/fi';

export default function ProcessingHandoffModal({
  isOpen,
  onClose,
  batch,
  onSubmit,
  distributors = [],
  retailers = [],
  loading = false
}) {
  const [facilityLocation, setFacilityLocation] = useState('KVIC Central Processing Unit, SIDCO Industrial Complex');
  const [assignedDistributor, setAssignedDistributor] = useState(distributors[0]?.address || '');
  const [assignedRetailer, setAssignedRetailer] = useState(retailers[0]?.address || '');
  const [targetDestination, setTargetDestination] = useState('KVIC Khadi Gramodyog Bhavan, Connaught Place');

  const yieldKg = batch?.yieldWeightKg || 25;
  const lockedBottles = yieldKg * 2; // Volume locking formula

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      batchId: batch?.batchId,
      facilityLocation: facilityLocation.trim(),
      assignedDistributor,
      assignedRetailer,
      targetDestination: targetDestination.trim()
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Processor Handoff & Bottle Packaging" maxWidth="600px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Batch Info */}
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#166534' }}>
            Batch: {batch?.batchCode || `HC-BATCH-${batch?.batchId}`}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '2px' }}>
            Yield: <strong>{yieldKg} kg Raw Honey</strong> • Smart Contract Volume Lock: <strong>{lockedBottles} standard 500g jars</strong>
          </div>
        </div>

        {/* Processing Facility */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
            Processing & Packaging Facility Location:
          </label>
          <input
            type="text"
            required
            value={facilityLocation}
            onChange={(e) => setFacilityLocation(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }}
          />
        </div>

        {/* Destination Retail Store */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
            Target Retail Destination:
          </label>
          <input
            type="text"
            required
            value={targetDestination}
            onChange={(e) => setTargetDestination(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }}
          />
        </div>

        {/* Assigned Partners */}
        <div className="form-grid-2col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
              Assign Distributor:
            </label>
            <select
              value={assignedDistributor}
              onChange={(e) => setAssignedDistributor(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem', backgroundColor: '#fff' }}
            >
              {distributors.length > 0 ? (
                distributors.map((d) => (
                  <option key={d.address} value={d.address}>
                    {d.name || d.address.slice(0, 10)}
                  </option>
                ))
              ) : (
                <option value="0x4d75682a4d75682A4d75682a4d75682a4D75682a">KVIC Cold Chain Logistics</option>
              )}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
              Assign Retail Store:
            </label>
            <select
              value={assignedRetailer}
              onChange={(e) => setAssignedRetailer(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem', backgroundColor: '#fff' }}
            >
              {retailers.length > 0 ? (
                retailers.map((r) => (
                  <option key={r.address} value={r.address}>
                    {r.name || r.address.slice(0, 10)}
                  </option>
                ))
              ) : (
                <option value="0x199c7759199c7759199c7759199c7759199c7759">KVIC Khadi Bhavan Flagship</option>
              )}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
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
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading
              ? <><FiClock size={13} /> Recording Handoff on-chain...</>
              : <><FiCheck size={13} /> Complete Processing &amp; Bottle Lock</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
