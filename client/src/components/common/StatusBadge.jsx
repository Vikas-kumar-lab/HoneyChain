import React from 'react';
import { FiTruck, FiCheckCircle, FiCheck, FiAlertTriangle } from 'react-icons/fi';
import { FaFlask, FaCogs, FaStore } from 'react-icons/fa';
import { GiHoneyJar } from 'react-icons/gi';

export const STAGE_CONFIG = {
  0: { label: 'Harvested', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', icon: <GiHoneyJar size={14} /> },
  1: { label: 'Quality Tested', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', icon: <FaFlask size={13} /> },
  2: { label: 'Processed', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', icon: <FaCogs size={13} /> },
  3: { label: 'Distributed', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', icon: <FiTruck size={13} /> },
  4: { label: 'Retail Stocked', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)', icon: <FaStore size={13} /> },
  5: { label: 'Sold to Consumer', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)', icon: <FiCheckCircle size={13} /> }
};

export const FLORA_NAMES = {
  0: 'Mustard Flower Honey',
  1: 'Kashmir Acacia Honey',
  2: 'Eucalyptus Honey',
  3: 'Wild Sidr Honey',
  4: 'Himalayan Multifloral Honey',
  5: 'Sundarbans Forest Wild'
};

export default function StatusBadge({ stage, isCertifiedPure, isFlagged, size = 'medium', className = '' }) {
  const stageNum = typeof stage === 'number' ? stage : parseInt(stage, 10) || 0;
  const config = STAGE_CONFIG[stageNum] || STAGE_CONFIG[0];

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: size === 'small' ? '3px 8px' : size === 'large' ? '8px 16px' : '5px 12px',
    borderRadius: '9999px',
    fontSize: size === 'small' ? '0.75rem' : size === 'large' ? '0.95rem' : '0.825rem',
    fontWeight: 600,
    backgroundColor: isFlagged ? 'rgba(239, 68, 68, 0.15)' : config.bg,
    color: isFlagged ? '#ef4444' : config.color,
    border: `1px solid ${isFlagged ? 'rgba(239, 68, 68, 0.3)' : config.color + '40'}`,
    whiteSpace: 'nowrap'
  };

  return (
    <span style={badgeStyle} className={`honey-status-badge ${className}`}>
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {isFlagged ? <FiAlertTriangle size={13} /> : config.icon}
      </span>
      <span>{isFlagged ? 'Adulteration Flagged' : config.label}</span>
      {isCertifiedPure && !isFlagged && (
        <span style={{ marginLeft: 2, color: '#10b981', fontSize: '0.85em', display: 'inline-flex', alignItems: 'center', gap: '2px' }} title="100% Purity Certified">
          <FiCheck size={11} /> PURE
        </span>
      )}
    </span>
  );
}
