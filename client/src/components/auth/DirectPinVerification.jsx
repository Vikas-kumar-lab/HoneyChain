import React from 'react';
import { FiAlertCircle, FiCheckCircle } from 'react-icons/fi';

export function DirectPinVerification({
  batchId,
  onBatchIdChange,
  pin,
  onPinChange,
  onVerify,
  loading = false,
  error = null,
  verifiedData = null,
  onViewPassport
}) {
  return (
    <div>
      <div style={{
        padding: '12px 14px',
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: '8px',
        marginBottom: '16px',
        fontSize: '0.80rem',
        color: 'var(--ink-600)',
        lineHeight: 1.5
      }}>
        Verify bottle authenticity against the Ethereum blockchain ledger without logging in. Enter the Batch Number and 8-character Security PIN from the physical tamper seal.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onVerify(); }} style={{ marginBottom: '16px' }}>
        {error && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--alert-red-light)',
            color: 'var(--alert-red)',
            border: '1px solid var(--alert-red-border)',
            borderRadius: '6px',
            fontSize: '0.82rem',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <FiAlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
            Batch Number or Tracking Code
          </label>
          <input
            type="text"
            className="form-control"
            value={batchId}
            onChange={(e) => onBatchIdChange(e.target.value)}
            placeholder="e.g. 1 or HC-2026-JK01-1257"
            required
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
            Bottle Security PIN (8-Character Hex Code)
          </label>
          <input
            type="text"
            className="form-control"
            value={pin}
            onChange={(e) => onPinChange(e.target.value)}
            placeholder="e.g. 4B8F9A2C"
            style={{ textTransform: 'uppercase', fontFamily: 'monospace', letterSpacing: '0.08em' }}
            required
          />
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
        >
          {loading ? "Querying Ethereum Ledger..." : "Authenticate Bottle Seal"}
        </button>
      </form>

      {verifiedData && (
        <div style={{
          padding: '14px',
          background: 'var(--forest-green-light)',
          border: '1px solid var(--forest-green-border)',
          borderRadius: '8px',
          marginTop: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--forest-green)', fontWeight: 700, marginBottom: '6px' }}>
            <FiCheckCircle size={18} />
            <span>Tamper-Proof Authenticity Verified!</span>
          </div>
          <div style={{ fontSize: '0.80rem', color: 'var(--ink-700)', marginBottom: '10px' }}>
            Batch #{verifiedData.batchId} • {verifiedData.floraName || 'Kashmir Acacia Honey'} • {verifiedData.beekeeperName || 'Registered Apiary'}
          </div>
          <button
            onClick={onViewPassport}
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '8px', fontSize: '0.80rem' }}
          >
            View Full Digital Passport →
          </button>
        </div>
      )}
    </div>
  );
}

export default DirectPinVerification;
