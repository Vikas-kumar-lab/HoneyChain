import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { FiZap, FiClock, FiCheck } from 'react-icons/fi';
import { FaWifi } from 'react-icons/fa';

export const FLORA_OPTIONS = [
  { value: 0, label: 'Mustard Flower Honey' },
  { value: 1, label: 'Kashmir Acacia Honey' },
  { value: 2, label: 'Eucalyptus Honey' },
  { value: 3, label: 'Wild Sidr Honey' },
  { value: 4, label: 'Himalayan Multifloral Honey' },
  { value: 5, label: 'Sundarbans Forest Wild' }
];

export default function HiveRegistrationModal({
  isOpen,
  onClose,
  beekeeperProfile,
  existingHives = [],
  onSubmit,
  loading = false
}) {
  const [boxCode, setBoxCode] = useState('');
  const [flora, setFlora] = useState(1);
  const [beekeeperName, setBeekeeperName] = useState(() => beekeeperProfile?.name || 'Registered Apiary');
  const [state, setState] = useState(() => beekeeperProfile?.state || 'India');
  const [clusterLocation, setClusterLocation] = useState(() => beekeeperProfile?.location || 'Apiary Cluster');
  const [isSmartIot, setIsSmartIot] = useState(false); // Zero-Hardware toggle

  useEffect(() => {
    if (beekeeperProfile?.name) setBeekeeperName(beekeeperProfile.name);
    if (beekeeperProfile?.state) setState(beekeeperProfile.state);
    if (beekeeperProfile?.location) setClusterLocation(beekeeperProfile.location);
  }, [beekeeperProfile]);

  const resolvePrefix = () => {
    const s = (state || '').toLowerCase();
    const l = (clusterLocation || '').toLowerCase();
    if (s.includes('kashmir') || l.includes('kashmir')) return 'JK';
    if (s.includes('uttar pradesh') || l.includes('agra') || l.includes('lucknow')) return 'UP';
    if (s.includes('himachal')) return 'HP';
    if (s.includes('uttarakhand')) return 'UK';
    if (s.includes('punjab')) return 'PB';
    if (s.includes('delhi')) return 'DL';
    if (s.includes('rajasthan')) return 'RJ';
    if (s.includes('bengal')) return 'WB';
    return 'IND';
  };

  // Automatically generate collision-free unique box code
  const handleAutoGenerate = () => {
    const prefix = resolvePrefix();
    const randSuffix = Math.floor(10 + Math.random() * 89);
    const timeSuffix = Date.now().toString().slice(-4);
    const generated = `HIVE-${prefix}-${randSuffix}${timeSuffix}`;
    setBoxCode(generated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const prefix = resolvePrefix();
    const effectiveCode = boxCode.trim() || `HIVE-${prefix}-${Date.now().toString().slice(-6)}`;
    onSubmit({
      boxIdentifier: effectiveCode,
      flora: parseInt(flora, 10),
      beekeeperName: beekeeperName.trim(),
      state: state.trim(),
      clusterLocation: clusterLocation.trim(),
      isSmartIot
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register New Smart Hive Box" maxWidth="560px">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Zero-Hardware vs Smart IoT Toggle */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isSmartIot ? <><FaWifi size={14} color="#0284c7" /> Smart IoT Hive Telemetry</> : 'Standard QR Mode (Zero-Hardware)'}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              {isSmartIot
                ? 'Automated temperature, weight & varroa edge detection enabled'
                : '100% Mobile QR Traceability (Zero hardware cost for beekeeper)'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsSmartIot(!isSmartIot)}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #94a3b8',
              backgroundColor: isSmartIot ? '#0284c7' : '#ffffff',
              color: isSmartIot ? '#ffffff' : '#334155',
              cursor: 'pointer'
            }}
          >
            {isSmartIot ? 'Switch to QR Mode' : 'Enable IoT Telemetry'}
          </button>
        </div>

        {/* Box Identifier with Auto-Generate */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: '6px' }}>
            Smart Bee Box Identifier / Tag Code:
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              required
              placeholder="e.g. HIVE-JK-02"
              value={boxCode}
              onChange={(e) => setBoxCode(e.target.value)}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.9rem',
                fontFamily: 'monospace'
              }}
            />
            <button
              type="button"
              onClick={handleAutoGenerate}
              style={{
                padding: '10px 14px',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                color: '#334155',
                whiteSpace: 'nowrap'
              }}
            >
              <FiZap size={13} /> Auto Generate
            </button>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
            Guaranteed unique identifier permanently recorded on HoneyChain Core.
          </div>
        </div>

        {/* Flora Source */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#334155', marginBottom: '6px' }}>
            Flora & Botanical Honey Type:
          </label>
          <select
            value={flora}
            onChange={(e) => setFlora(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              fontSize: '0.9rem',
              backgroundColor: '#ffffff'
            }}
          >
            {FLORA_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Beekeeper Name & Location */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
              Apiary / Beekeeper Name:
            </label>
            <input
              type="text"
              required
              value={beekeeperName}
              onChange={(e) => setBeekeeperName(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.85rem'
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
              Cluster Location:
            </label>
            <input
              type="text"
              required
              value={clusterLocation}
              onChange={(e) => setClusterLocation(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '0.85rem'
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
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
              backgroundColor: '#d97706',
              color: '#ffffff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px -1px rgba(217, 119, 6, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {loading
              ? <><FiClock size={14} /> Mining on Blockchain...</>
              : <><FiCheck size={14} /> Register Smart Hive</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}
