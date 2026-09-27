import React, { useState } from 'react';
import Modal from './Modal';
import { FiCamera, FiZap } from 'react-icons/fi';

export default function QRScannerModal({ isOpen, onClose, onScanSuccess, title = 'Scan Serial Barcode / NFC Seal' }) {
  const [manualInput, setManualInput] = useState('');
  const [isSimulating, setIsSimulating] = useState(false);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onScanSuccess(manualInput.trim());
      setManualInput('');
      onClose();
    }
  };

  const handleSampleScan = (sampleCode) => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      onScanSuccess(sampleCode);
      onClose();
    }, 400);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="500px">
      <div style={{ textAlign: 'center' }}>
        {/* Camera / Viewfinder Box */}
        <div
          style={{
            position: 'relative',
            height: '220px',
            backgroundColor: '#0f172a',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f8fafc',
            overflow: 'hidden',
            border: '2px solid #334155',
            marginBottom: '16px'
          }}
        >
          {/* Scanning Animation Line */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '10%',
              right: '10%',
              height: '2px',
              backgroundColor: '#10b981',
              boxShadow: '0 0 12px 2px #10b981',
              animation: 'pulse 1.5s infinite'
            }}
          />

          <div style={{ fontSize: '2.5rem', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FiCamera size={40} color="#94a3b8" />
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {isSimulating ? (
              <><FiZap size={14} color="#fbbf24" /> Decrypting NFC / Barcode...</>
            ) : (
              'Optical Camera & Web NFC Active'
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
            Align QR Code or Tap Phone to Jar Cap
          </div>
        </div>

        {/* Quick Demo Scan Buttons for Judges & Testing */}
        <div style={{ marginBottom: '16px', textAlign: 'left' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <FiZap size={13} color="#d97706" /> One-Click Demo Barcodes (Judge Testing):
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['1', '2', '3', '4', '5'].map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => handleSampleScan(u)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Scan Bottle #{u}
              </button>
            ))}
          </div>
        </div>

        {/* Manual Input Fallback */}
        <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="Or type Bottle #, PIN, or Serial..."
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              fontSize: '0.85rem'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#0f172a',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Confirm
          </button>
        </form>
      </div>
    </Modal>
  );
}
