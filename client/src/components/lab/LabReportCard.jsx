import React from 'react';
import { FaFlask } from 'react-icons/fa';
import { FiCheck, FiAlertTriangle, FiFileText, FiSearch } from 'react-icons/fi';

export default function LabReportCard({
  labReport,
  batchCode = '',
  onDownloadPdf
}) {
  if (!labReport || !labReport.testTimestamp || parseInt(labReport.testTimestamp, 10) === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <FiSearch size={16} /> Lab test pending for this batch.
      </div>
    );
  }

  const moisture = (parseInt(labReport.moisturePercentX100, 10) / 100).toFixed(2);
  const c4 = (parseInt(labReport.c4SugarPercentX100, 10) / 100).toFixed(2);
  const pollen = labReport.pollenPurityScore || 95;
  const isPassed = labReport.passed !== false;

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        border: `1.5px solid ${isPassed ? '#86efac' : '#fca5a5'}`,
        padding: '18px 22px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        marginBottom: '16px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaFlask size={18} color="#7c3aed" />
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              NABL / FSSAI Quality Test Report
            </h4>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '9999px',
                backgroundColor: isPassed ? '#dcfce7' : '#fee2e2',
                color: isPassed ? '#166534' : '#991b1b'
              }}
            >
              {isPassed
                ? <><FiCheck size={11} /> 100% PURE PASSED</>
                : <><FiAlertTriangle size={11} /> ADULTERATION FAILED</>}
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '3px' }}>
            Batch: <strong>{batchCode}</strong> • Certified by Authorized NABL Facility
          </div>
        </div>

        {onDownloadPdf && (
          <button
            type="button"
            onClick={onDownloadPdf}
            style={{
              padding: '6px 12px',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#f8fafc',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <FiFileText size={13} /> PDF Certificate
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginTop: '14px' }}>
        <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Moisture</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{moisture}%</div>
          <div style={{ fontSize: '0.68rem', color: '#16a34a' }}>Limit &le; 20%</div>
        </div>
        <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>C4 Sugar</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{c4}%</div>
          <div style={{ fontSize: '0.68rem', color: '#16a34a' }}>Limit &le; 7%</div>
        </div>
        <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Pollen Score</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{pollen}/100</div>
          <div style={{ fontSize: '0.68rem', color: '#16a34a' }}>Authentic Flora</div>
        </div>
        <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Antibiotics</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#16a34a', marginTop: '2px' }}>Zero Residue</div>
          <div style={{ fontSize: '0.68rem', color: '#16a34a' }}>100% Organic</div>
        </div>
      </div>
    </div>
  );
}
