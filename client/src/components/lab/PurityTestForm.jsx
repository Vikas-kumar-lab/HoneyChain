import React, { useState } from 'react';
import Modal from '../common/Modal';
import { FiCheck, FiAlertTriangle, FiClock } from 'react-icons/fi';

export default function PurityTestForm({
  isOpen,
  onClose,
  batch,
  onSubmit,
  loading = false
}) {
  const [moisture, setMoisture] = useState('17.8'); // Standard <= 20%
  const [c4Sugar, setC4Sugar] = useState('0.0'); // Standard <= 7%
  const [pollenScore, setPollenScore] = useState('95');
  const [antibioticFree, setAntibioticFree] = useState(true);

  // Auto-computed FSSAI compliance
  const moistureNum = parseFloat(moisture) || 0;
  const c4Num = parseFloat(c4Sugar) || 0;
  const isCompliant = moistureNum <= 20.0 && c4Num <= 7.0 && antibioticFree;

  const handleSubmit = (e) => {
    e.preventDefault();
    const moistureX100 = Math.round(moistureNum * 100);
    const c4X100 = Math.round(c4Num * 100);
    const labHash = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');

    onSubmit({
      batchId: batch?.batchId,
      moisturePercentX100: moistureX100,
      c4SugarPercentX100: c4X100,
      pollenPurityScore: parseInt(pollenScore, 10) || 95,
      antibioticFree,
      labCertHash: labHash
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="KVIC / NABL Accredited Lab Testing" maxWidth="560px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#166534' }}>
            Testing Batch: {batch?.batchCode || `HC-BATCH-${batch?.batchId}`}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#15803d', marginTop: '2px' }}>
            Origin: <strong>{batch?.beekeeperName || 'Registered Apiary'}</strong> • Botanical: {batch?.floraName || 'Kashmir Acacia'}
          </div>
        </div>

        {/* Moisture Content */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
            Moisture Content % (FSSAI Standard: &le; 20.0%):
          </label>
          <input
            type="number"
            step="0.1"
            required
            value={moisture}
            onChange={(e) => setMoisture(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }}
          />
        </div>

        {/* C4 Sugar Adulteration */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
            C4 Carbon Isotope Sugar Adulteration % (Standard: &le; 7.0%):
          </label>
          <input
            type="number"
            step="0.1"
            required
            value={c4Sugar}
            onChange={(e) => setC4Sugar(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }}
          />
        </div>

        {/* Pollen Purity Score */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
            Microscopic Pollen Purity Score (0 - 100):
          </label>
          <input
            type="number"
            min="0"
            max="100"
            required
            value={pollenScore}
            onChange={(e) => setPollenScore(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #cbd5e1', fontSize: '0.85rem' }}
          />
        </div>

        {/* Antibiotic Residue */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="antibioticFree"
            checked={antibioticFree}
            onChange={(e) => setAntibioticFree(e.target.checked)}
            style={{ width: '18px', height: '18px' }}
          />
          <label htmlFor="antibioticFree" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', cursor: 'pointer' }}>
            Antibiotic & Chemical Residue Free (Certified NABL Standard)
          </label>
        </div>

        {/* Compliance Pill */}
        <div
          style={{
            backgroundColor: isCompliant ? '#dcfce7' : '#fee2e2',
            border: `1px solid ${isCompliant ? '#86efac' : '#fca5a5'}`,
            borderRadius: '8px',
            padding: '10px 14px',
            color: isCompliant ? '#166534' : '#991b1b',
            fontSize: '0.82rem',
            fontWeight: 700
          }}
        >
          {isCompliant
            ? <><FiCheck size={13} /> Purity Standards Satisfied: Eligible for 100% KVIC Pure Certification.</>
            : <><FiAlertTriangle size={13} /> Adulteration Warning: Batch will be flagged on-chain and blocked from distribution.</>}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
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
              backgroundColor: isCompliant ? '#16a34a' : '#dc2626',
              color: '#ffffff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading
              ? <><FiClock size={13} /> Mining Lab Certification...</>
              : <><FiCheck size={13} /> Submit Official Lab Certificate</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
