import React, { useState, useEffect } from 'react';
import { FaQrcode } from 'react-icons/fa';
import { FiX, FiZap, FiCheckCircle } from 'react-icons/fi';

export function BarcodeScannerModal({ isOpen, onClose, onDetected, mode = 'pos-checkout' }) {
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setManualCode('');
      setError(null);
      setSimulating(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      setError('Please enter a barcode, Security PIN, or Batch Number');
      return;
    }
    onDetected(manualCode.trim().toUpperCase());
    onClose();
  };

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  const handleSimulateScan = (samplePin) => {
    playBeep();
    setSimulating(true);
    setTimeout(() => {
      onDetected(samplePin);
      onClose();
    }, 400);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '460px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15)',
        overflow: 'hidden',
        animation: 'modalSlideUp 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 18px',
          borderBottom: '1px solid #E2E8F0',
          background: '#F8FAFC'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ color: 'var(--primary-honey)', display: 'flex' }}>
              <FaQrcode size={20} />
            </div>
            <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink-900)' }}>
              {mode === 'pos-checkout' ? 'Scan Bottle Barcode / NFC' : 'Inward Consignment Scanner'}
            </h4>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Viewfinder simulation */}
        <div style={{ padding: '20px' }}>
          <div style={{
            position: 'relative',
            height: '220px',
            background: '#0F172A',
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94A3B8',
            overflow: 'hidden'
          }}>
            {/* Corner Targeting Box */}
            <div style={{
              width: '180px',
              height: '140px',
              border: '2px dashed var(--primary-honey)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '2px',
                background: 'var(--primary-honey)',
                boxShadow: '0 0 8px var(--primary-honey)',
                animation: 'scanLine 2s infinite ease-in-out'
              }} />
              <span style={{ fontSize: '0.74rem', color: '#CBD5E1', textAlign: 'center', padding: '10px' }}>
                Position bottle barcode or NFC seal inside this frame
              </span>
            </div>

            {simulating && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '1.1rem',
                gap: '8px'
              }}>
                <FiCheckCircle size={20} /> Barcode Captured!
              </div>
            )}
          </div>

          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleSimulateScan('SIMULATED-SCAN-CODE')}
              style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <FiZap size={12} /> Simulated Hardware Scanner Trigger
            </button>
          </div>

          {/* Manual PIN / Code fallback */}
          <form onSubmit={handleManualSubmit} style={{ marginTop: '14px' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
              Or Enter Security PIN / Bottle Code Manually
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 8-char PIN or #1"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                style={{ textTransform: 'uppercase' }}
                autoFocus
              />
              <button type="submit" className="btn-primary" style={{ flexShrink: 0, padding: '8px 16px' }}>
                Verify & Add
              </button>
            </div>
            {error && (
              <div style={{ color: '#DC2626', fontSize: '0.74rem', marginTop: '4px' }}>
                {error}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default BarcodeScannerModal;
