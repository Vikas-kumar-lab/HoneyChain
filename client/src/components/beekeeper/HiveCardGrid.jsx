import React from 'react';
import { GiBee } from 'react-icons/gi';
import { FiMapPin } from 'react-icons/fi';
import { GiFlowerPot, GiHoneyJar } from 'react-icons/gi';

export default function HiveCardGrid({
  hives = [],
  selectedHiveId,
  onSelectHive,
  onOpenHarvestModal
}) {
  if (!hives || hives.length === 0) {
    return (
      <div
        style={{
          padding: '32px',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          borderRadius: '12px',
          border: '1.5px dashed #cbd5e1',
          color: '#64748b'
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '8px', display: 'flex', justifyContent: 'center' }}><GiBee size={36} color="#d97706" /></div>
        <div style={{ fontWeight: 600, color: '#334155' }}>No Smart Hives Registered Yet</div>
        <div style={{ fontSize: '0.85rem', marginTop: '4px' }}>
          Click "Register Smart Bee Box" above to add your first smart hive to HoneyChain.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }}
    >
      {hives.map((hive) => {
        const isSelected = String(hive.id) === String(selectedHiveId);
        const healthScore = hive.healthScore || 95;
        const isHealthy = healthScore >= 80;

        return (
          <div
            key={hive.id || hive.boxCode}
            onClick={() => onSelectHive && onSelectHive(String(hive.id))}
            style={{
              backgroundColor: '#ffffff',
              border: `2px solid ${isSelected ? '#d97706' : '#e2e8f0'}`,
              borderRadius: '14px',
              padding: '16px 18px',
              cursor: 'pointer',
              boxShadow: isSelected
                ? '0 10px 15px -3px rgba(217, 119, 6, 0.15)'
                : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
              transition: 'all 0.15s ease',
              position: 'relative'
            }}
          >
            {isSelected && (
              <div
                style={{
                  position: 'absolute',
                  top: '-10px',
                  right: '14px',
                  backgroundColor: '#d97706',
                  color: '#ffffff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  textTransform: 'uppercase'
                }}
              >
                Selected Active
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a', fontFamily: 'monospace' }}>
                {hive.boxCode || `HIVE-#${hive.id}`}
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: isHealthy ? '#166534' : '#991b1b',
                  backgroundColor: isHealthy ? '#dcfce7' : '#fee2e2',
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}
              >
                Health: {healthScore}%
              </span>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#334155', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <GiFlowerPot size={14} color="#d97706" /> <strong>{hive.flora || 'Acacia Floral Honey'}</strong>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <FiMapPin size={13} /> {hive.location || hive.clusterLocation || 'Apiary Cluster'}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onSelectHive) onSelectHive(String(hive.id));
                  if (onOpenHarvestModal) onOpenHarvestModal(hive);
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isSelected ? '#d97706' : '#f1f5f9',
                  color: isSelected ? '#ffffff' : '#334155',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <GiHoneyJar size={14} /> Harvest Raw Honey
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
