import React from 'react';
import { STAGE_CONFIG } from '../common/StatusBadge';
import { FiLink, FiMapPin } from 'react-icons/fi';
import { formatCoordinates } from '../../geoUtils';

const resolveCoordinateStr = (evt) => {
  const coords = evt.coordinates;
  if (coords?.formatted) return coords.formatted;
  const lat = coords?.lat ?? coords?.latitude ?? evt.lat ?? evt.latitude;
  const lng = coords?.lng ?? coords?.longitude ?? evt.lng ?? evt.longitude;
  if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
    return formatCoordinates(lat, lng);
  }
  return null;
};

export default function ProvenanceTimeline({ history = [] }) {
  if (!history || history.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
        No supply chain handoff events recorded yet.
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px 24px', marginBottom: '20px' }}>
      <h4 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FiLink size={18} color="var(--forest-green)" /> Immutable Blockchain Provenance Journey
      </h4>

      <div style={{ position: 'relative', paddingLeft: '28px' }}>
        {/* Left vertical timeline line */}
        <div
          style={{
            position: 'absolute',
            top: '8px',
            bottom: '8px',
            left: '11px',
            width: '2px',
            backgroundColor: '#e2e8f0'
          }}
        />

        {history.map((evt, idx) => {
          const stageIdx = parseInt(evt.stage, 10) || 0;
          const config = STAGE_CONFIG[stageIdx] || STAGE_CONFIG[0];
          const timeStr = evt.timestamp ? new Date(parseInt(evt.timestamp, 10) * 1000).toLocaleString() : 'Recent';

          return (
            <div key={idx} style={{ position: 'relative', marginBottom: idx === history.length - 1 ? 0 : '20px' }}>
              {/* Dot */}
              <div
                style={{
                  position: 'absolute',
                  left: '-24px',
                  top: '2px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: config.color,
                  border: '3px solid #ffffff',
                  boxShadow: '0 0 0 2px ' + config.color + '40'
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {config.icon} {config.label}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{timeStr}</span>
              </div>

              <div style={{ fontSize: '0.82rem', color: '#334155', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                <FiMapPin size={13} color="#64748b" /> Location: <strong>{evt.location || 'KVIC Center'}</strong>
                {(() => {
                  const coordStr = resolveCoordinateStr(evt);
                  if (!coordStr) return null;
                  return (
                    <span
                      style={{
                        fontSize: '0.70rem',
                        fontFamily: 'monospace',
                        backgroundColor: '#f1f5f9',
                        border: '1px solid #cbd5e1',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        color: '#475569',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      📍 {coordStr}
                    </span>
                  );
                })()}
              </div>

              {stageIdx >= 2 && evt.sealAudit && (() => {
                const totalJars = evt.sealAudit.totalJars || evt.sealAudit.totalUnits || 50;
                const verified = evt.sealAudit.verifiedCount ?? evt.sealAudit.intactUnits ?? totalJars;
                const isPassed = evt.sealAudit.passed === true || 
                                 evt.sealAudit.status === 'SEALED_INTACT' || 
                                 ((evt.sealAudit.tamperedCount === 0 || !evt.sealAudit.tamperedCount) && evt.sealAudit.status !== 'TAMPER_BREACH_REJECTED');

                return (
                  <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.70rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor: isPassed ? '#ecfdf5' : '#fef2f2',
                        color: isPassed ? '#059669' : '#dc2626',
                        border: `1px solid ${isPassed ? '#a7f3d0' : '#fecaca'}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {isPassed ? '🔒 100% Tamper-Evident Seals Intact' : '⚠️ Seal Breach Detected'}
                      {' '}({verified}/{totalJars} Jars)
                    </span>
                  </div>
                );
              })()}

              {evt.notes && (
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', fontStyle: 'italic' }}>
                  "{evt.notes}"
                </div>
              )}

              {evt.actor && (
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px', fontFamily: 'monospace' }}>
                  Actor: {evt.actor.slice(0, 8)}...{evt.actor.slice(-6)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
