import React from 'react';
import { FaWifi } from 'react-icons/fa';
import { FiAlertTriangle, FiCheck, FiAlertOctagon } from 'react-icons/fi';

/**
 * HiveTelemetryCard
 * Displays edge IoT telemetry: temperature, acoustics, varroa warning, health score.
 */
export default function HiveTelemetryCard({
  hive,
  healthScore = 95,
  activeAlert = false,
  alertMessage = '',
  temperature = '34.8°C',
  humidity = '58%',
  soundFrequency = '220 Hz (Calm Queen)'
}) {
  const isHealthy = healthScore >= 80;

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        border: `1.5px solid ${activeAlert ? '#fca5a5' : '#e2e8f0'}`,
        padding: '18px 22px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        marginBottom: '18px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FaWifi size={20} color="#0284c7" />
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              Edge IoT Telemetry &amp; Hive Health
            </h4>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '9999px',
                backgroundColor: activeAlert ? '#fee2e2' : '#dcfce7',
                color: activeAlert ? '#991b1b' : '#166534',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {activeAlert ? <><FiAlertTriangle size={11} /> ALERT ACTIVE</> : <><FiCheck size={11} /> HEALTHY COLONY</>}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '3px' }}>
            Box: <strong>{hive?.boxCode || 'HIVE-JK-01'}</strong> • Flora: {hive?.flora || 'Kashmir Acacia'}
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: isHealthy ? '#16a34a' : '#dc2626' }}>
            {healthScore}%
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>AI Colony Score</div>
        </div>
      </div>

      {activeAlert && (
        <div
          style={{
            backgroundColor: '#fee2e2',
            border: '1px solid #f87171',
            borderRadius: '8px',
            padding: '10px 14px',
            color: '#991b1b',
            fontSize: '0.85rem',
            fontWeight: 600,
            marginTop: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <FiAlertOctagon size={16} /> Alert: {alertMessage || 'Unusual acoustic vibration detected. Possible swarming or pest anomaly.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '14px' }}>
        <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Brood Temp</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{temperature}</div>
        </div>
        <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Internal Humidity</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{humidity}</div>
        </div>
        <div style={{ backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Acoustic Frequency</div>
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', marginTop: '2px' }}>{soundFrequency}</div>
        </div>
      </div>
    </div>
  );
}
