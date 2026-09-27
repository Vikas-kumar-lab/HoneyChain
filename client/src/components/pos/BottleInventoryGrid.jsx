import React from 'react';
import { FiPackage } from 'react-icons/fi';

/**
 * BottleInventoryGrid
 * Interactive grid representing all bottles in the consignment.
 * Allows instant selection, inwarding, and displays on-chain sold status.
 */
export default function BottleInventoryGrid({
  jarsTotal = 50,
  soldBottleNumbers = [],
  inwardBottles = [],
  selectedBottleNum,
  onSelectBottle,
  onInwardAll
}) {
  const total = parseInt(jarsTotal, 10) || 50;
  const soldSet = new Set((soldBottleNumbers || []).map((n) => parseInt(n, 10)));
  const inwardSet = new Set((inwardBottles || []).map((n) => parseInt(n, 10)));

  const bottleList = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            Consignment Bottle Matrix ({total} Serialized Bottles)
          </h4>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Click an available bottle to load into the POS checkout scanner.
          </div>
        </div>

        {onInwardAll && inwardSet.size < total && (
          <button
            type="button"
            onClick={onInwardAll}
            style={{
              padding: '6px 14px',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: '8px',
              backgroundColor: '#e0f2fe',
              color: '#0369a1',
              border: '1px solid #7dd3fc',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FiPackage size={13} /> Inward All {total} Bottles to Store Stock
          </button>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '14px', fontSize: '0.78rem', color: '#475569', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#dcfce7', border: '1px solid #86efac' }} />
          <span>In Stock / Ready to Sell</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#d97706' }} />
          <span>Selected for POS Sale</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5' }} />
          <span>Sold on Blockchain</span>
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))',
          gap: '8px',
          maxHeight: '260px',
          overflowY: 'auto',
          padding: '4px'
        }}
      >
        {bottleList.map((num) => {
          const isSold = soldSet.has(num);
          const isInward = inwardSet.has(num);
          const isSelected = selectedBottleNum === num;

          let bg = '#dcfce7';
          let border = '#86efac';
          let color = '#166534';
          let cursor = 'pointer';

          if (isSold) {
            bg = '#fee2e2';
            border = '#fca5a5';
            color = '#991b1b';
            cursor = 'not-allowed';
          } else if (isSelected) {
            bg = '#d97706';
            border = '#b45309';
            color = '#ffffff';
          } else if (!isInward) {
            bg = '#f1f5f9';
            border = '#cbd5e1';
            color = '#64748b';
          }

          return (
            <button
              key={num}
              type="button"
              disabled={isSold}
              onClick={() => onSelectBottle && onSelectBottle(num)}
              title={isSold ? `Bottle #${num} is SOLD` : `Select Bottle #${num}`}
              style={{
                height: '42px',
                borderRadius: '8px',
                border: `1.5px solid ${border}`,
                backgroundColor: bg,
                color,
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor,
                transition: 'all 0.1s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isSelected ? '0 0 0 2px #fde68a' : 'none'
              }}
            >
              #{num}
            </button>
          );
        })}
      </div>
    </div>
  );
}
