import React from 'react';
import { STAGE_CONFIG } from '../common/StatusBadge';
import { FiCheck, FiX, FiLock } from 'react-icons/fi';

export default function PipelineStageStepper({ 
  currentStage = 0, 
  isFlagged = false, 
  quarantinedStage = null, 
  flagLabel = 'Quarantined' 
}) {
  const stageIdx = typeof currentStage === 'number' ? currentStage : parseInt(currentStage, 10) || 0;
  const stages = [0, 1, 2, 3, 4, 5];
  const qStage = quarantinedStage !== null ? quarantinedStage : (stageIdx >= 2 ? stageIdx : 1);

  return (
    <div className="stepper-card" style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 14px', marginBottom: '20px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', minWidth: '520px' }}>
        {/* Connecting Line */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '30px',
            right: '30px',
            height: '3px',
            backgroundColor: '#e2e8f0',
            zIndex: 1
          }}
        >
          <div
            style={{
              height: '100%',
              backgroundColor: isFlagged ? '#ef4444' : '#10b981',
              width: `${Math.min(100, ((isFlagged ? qStage : stageIdx) / 5) * 100)}%`,
              transition: 'width 0.4s ease'
            }}
          />
        </div>

        {stages.map((s) => {
          const config = STAGE_CONFIG[s] || { label: `Stage ${s}`, icon: null, color: '#64748b' };
          
          let circleBg = '#f1f5f9';
          let circleColor = '#94a3b8';
          let border = '2px solid #cbd5e1';
          let icon = config.icon;
          let label = config.label;
          let labelColor = '#64748b';
          let isCurrent = false;

          if (isFlagged) {
            if (s < qStage) {
              circleBg = '#10b981';
              circleColor = '#ffffff';
              border = '2px solid #059669';
              icon = <FiCheck size={16} />;
              labelColor = '#059669';
            } else if (s === qStage) {
              circleBg = '#ef4444';
              circleColor = '#ffffff';
              border = '2px solid #dc2626';
              icon = <FiX size={16} />;
              label = flagLabel;
              labelColor = '#dc2626';
              isCurrent = true;
            } else {
              circleBg = '#f8fafc';
              circleColor = '#cbd5e1';
              border = '2px solid #e2e8f0';
              icon = <FiLock size={13} />;
              label = 'Halted';
              labelColor = '#94a3b8';
            }
          } else {
            const isPassed = s < stageIdx;
            isCurrent = s === stageIdx;

            if (isPassed) {
              circleBg = '#10b981';
              circleColor = '#ffffff';
              border = '2px solid #059669';
              icon = <FiCheck size={16} />;
              labelColor = '#059669';
            } else if (isCurrent) {
              circleBg = config.color;
              circleColor = '#ffffff';
              border = `3px solid #ffffff`;
              labelColor = '#0f172a';
            }
          }

          return (
            <div
              key={s}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 2,
                position: 'relative',
                flex: 1
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: circleBg,
                  color: circleColor,
                  border,
                  boxShadow: isCurrent ? (isFlagged ? '0 0 0 3px rgba(239, 68, 68, 0.2)' : `0 0 0 3px ${config.color}25`) : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  transition: 'all 0.2s ease'
                }}
              >
                {icon}
              </div>
              <div
                style={{
                  marginTop: '8px',
                  fontSize: '0.74rem',
                  fontWeight: isCurrent ? 700 : 500,
                  color: labelColor,
                  textAlign: 'center',
                  maxWidth: '90px',
                  lineHeight: '1.2'
                }}
              >
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

