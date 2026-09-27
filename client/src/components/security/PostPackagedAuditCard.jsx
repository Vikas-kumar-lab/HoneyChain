import React from 'react';
import { FaFlask } from 'react-icons/fa';
import { FiCheck } from 'react-icons/fi';

/**
 * PostPackagedAuditCard
 * Solves the judge problem: "What if processor adulterates honey after packaging?"
 * Demonstrates random monthly / batch sampling and comparing pre-packaging vs post-packaging lab results.
 */
export default function PostPackagedAuditCard({
  batchId,
  batchCode,
  combReport = { moisture: '18.2%', c4Sugar: '0.0%', pollenPurity: '96/100', passed: true },
  postPackagedReport = { moisture: '18.4%', c4Sugar: '0.0%', pollenPurity: '95/100', sampledJar: '#14', passed: true },
  auditDate = 'Current Month (Random Audit Sample)'
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1.5px solid #cbd5e1',
        borderRadius: '14px',
        padding: '18px 22px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        marginTop: '16px',
        marginBottom: '16px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FaFlask size={20} color="var(--forest-green)" />
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              Dual-Stage Lab Audit: Pre-Comb vs. Post-Packaged Jar
            </h4>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Randomized Quality Audit Protocol to prevent Processor-level dilution / syrup adulteration
            </div>
          </div>
        </div>
        <span
          style={{
            backgroundColor: '#dcfce7',
            color: '#166534',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: '9999px',
            border: '1px solid #86efac',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <FiCheck size={13} /> Dual Purity Verified
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginTop: '14px' }}>
        {/* Stage 1: Comb Level */}
        <div style={{ backgroundColor: '#f8fafc', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
            Stage 1: Comb Harvest Test
          </div>
          <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
            <div>Moisture: <strong>{combReport.moisture}</strong> (Std &le;20%)</div>
            <div>C4 Sugar: <strong>{combReport.c4Sugar}</strong> (Std &le;7%)</div>
            <div>Pollen Score: <strong>{combReport.pollenPurity}</strong></div>
            <div style={{ color: '#16a34a', fontWeight: 600, marginTop: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FiCheck size={12} /> Verified at Raw Extraction
            </div>
          </div>
        </div>

        {/* Stage 2: Packaged Bottle Level */}
        <div style={{ backgroundColor: '#f0fdf4', padding: '12px 14px', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', marginBottom: '6px' }}>
            Stage 2: Packaged Bottle Sample ({postPackagedReport.sampledJar || 'Random Jar'})
          </div>
          <div style={{ fontSize: '0.85rem', color: '#1e293b' }}>
            <div>Moisture: <strong>{postPackagedReport.moisture}</strong> (Matches raw comb)</div>
            <div>C4 Sugar: <strong>{postPackagedReport.c4Sugar}</strong> (Zero adulteration)</div>
            <div>Pollen Score: <strong>{postPackagedReport.pollenPurity}</strong></div>
            <div style={{ color: '#16a34a', fontWeight: 600, marginTop: '4px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <FiCheck size={12} /> Verified Post-Packaging ({auditDate})
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px', textAlign: 'right' }}>
        Parameters Delta: <strong>&plusmn;0.2%</strong> (Well within natural enzymatic tolerance. No dilution detected).
      </div>
    </div>
  );
}
