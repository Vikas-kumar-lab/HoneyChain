import React, { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

const STAGE_LABELS = {
  1: { text: 'Harvested', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  2: { text: 'Processed & Packaged', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  3: { text: 'Dispatched in Transit', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  4: { text: 'Stocked at Retail', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  5: { text: 'Sold to Consumer', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' }
};

export default function BatchHandoffQRSheet({ isOpen, onClose, data }) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !data) return null;

  const batchId = data.batchId ?? data.id;
  const stage = STAGE_LABELS[data.stageIdx] || { text: `Stage ${data.stageIdx}`, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  const verifyUrl = `${window.location.origin}/consumer-verify?batch=${batchId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(verifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 15, 29, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(145deg, #111827 0%, #0b0f19 100%)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(245, 158, 11, 0.15)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '520px',
          padding: '24px',
          position: 'relative',
          color: '#f3f4f6',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#9ca3af',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.color = '#ef4444'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#9ca3af'; }}
        >
          ✕
        </button>

        {/* Header Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <span style={{ fontSize: '24px' }}>🏷️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f9fafb' }}>
              Supply Chain Handoff Sheet
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#9ca3af' }}>
              Cryptographic Batch Verification & Quality Passport
            </p>
          </div>
        </div>

        {/* Stage Status Pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: stage.bg,
          border: `1px solid ${stage.color}55`,
          color: stage.color,
          padding: '6px 14px',
          borderRadius: '9999px',
          fontSize: '0.82rem',
          fontWeight: 600,
          marginBottom: '18px'
        }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: stage.color, display: 'inline-block' }}></span>
          Current Stage: {stage.text}
        </div>

        {/* QR Code Container */}
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 18px',
          width: 'fit-content',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
        }}>
          <QRCodeCanvas
            value={verifyUrl}
            size={180}
            level="H"
            includeMargin={true}
          />
          <span style={{
            color: '#111827',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            marginTop: '6px',
            textTransform: 'uppercase'
          }}>
            Batch #{batchId} • Scan to Inspect
          </span>
        </div>

        {/* Details Grid */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '12px 14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '10px',
          fontSize: '0.82rem',
          marginBottom: '16px'
        }}>
          <div>
            <div style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Batch Identifier</div>
            <div style={{ fontWeight: 600, color: '#fbbf24', wordBreak: 'break-all' }}>
              {data.batchCode || `HC-B${batchId}`}
            </div>
          </div>
          <div>
            <div style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Flora / Honey Type</div>
            <div style={{ fontWeight: 600, color: '#f3f4f6' }}>
              {data.floraName || 'Raw Organic Forest'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Yield / Jars</div>
            <div style={{ fontWeight: 600, color: '#f3f4f6' }}>
              {data.yieldWeightKg ? `${data.yieldWeightKg} kg` : ''} {data.jarsTotal ? `(${data.jarsTotal} Jars)` : ''}
              {!data.yieldWeightKg && !data.jarsTotal && 'Standard Batch'}
            </div>
          </div>
          <div>
            <div style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Purity & Lab Grade</div>
            <div style={{ fontWeight: 600, color: data.isCertifiedPure !== false ? '#10b981' : '#f59e0b' }}>
              {data.isCertifiedPure !== false ? '✅ 100% Certified Pure' : '⚠️ Pending Lab'}
            </div>
          </div>
          {data.targetDestination && (
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Transfer Target / Node</div>
              <div style={{ fontWeight: 500, color: '#38bdf8', fontSize: '0.78rem', wordBreak: 'break-all' }}>
                📍 {data.targetDestination}
              </div>
            </div>
          )}
          {data.txHash && (
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ color: '#9ca3af', fontSize: '0.72rem' }}>Latest Ledger Tx</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                🔗 {data.txHash}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleCopyLink}
            style={{
              flex: 1,
              background: copied ? '#10b981' : 'rgba(245, 158, 11, 0.15)',
              border: `1px solid ${copied ? '#10b981' : 'rgba(245, 158, 11, 0.4)'}`,
              color: copied ? '#ffffff' : '#fbbf24',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            {copied ? '✓ Link Copied!' : '📋 Copy Verify Link'}
          </button>

          <button
            onClick={handlePrint}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#e5e7eb',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
          >
            🖨️ Print Label
          </button>
        </div>
      </div>
    </div>
  );
}
