import React from 'react';
import { FiCheckCircle, FiAlertCircle, FiTruck } from 'react-icons/fi';
import { FaFlask, FaCogs, FaStore } from 'react-icons/fa';
import { GiBee } from 'react-icons/gi';

export function OnboardingApplicationForm({
  role,
  onRoleChange,
  primaryName,
  onPrimaryNameChange,
  orgName,
  onOrgNameChange,
  location,
  onLocationChange,
  stateName,
  onStateNameChange,
  phone,
  onPhoneChange,
  onSubmit,
  loading = false,
  successMessage = null,
  errorMessage = null,
  onGoToLogin
}) {
  const roleOptions = [
    { key: 'BEEKEEPER', label: 'Beekeeper Collective', icon: <GiBee size={22} color="#D97706" />, desc: 'Apiary clusters & comb extraction' },
    { key: 'LAB', label: 'Testing & Quality Lab', icon: <FaFlask size={20} color="#2563EB" />, desc: 'FSSAI/NABL moisture & purity certification' },
    { key: 'PROCESSOR', label: 'Processing Facility', icon: <FaCogs size={20} color="#7C3AED" />, desc: 'Hygienic moisture reduction & packaging' },
    { key: 'DISTRIBUTOR', label: 'Cold-Chain Logistics', icon: <FiTruck size={20} color="#0891B2" />, desc: 'Temperature-monitored fleet dispatch' },
    { key: 'RETAILER', label: 'Retail Store / POS', icon: <FaStore size={20} color="#059669" />, desc: 'KVIC Emporium & authorized retail sales' },
  ];

  return (
    <form onSubmit={onSubmit} style={{ marginBottom: '16px' }}>
      {successMessage && (
        <div style={{
          padding: '14px',
          background: 'var(--forest-green-light)',
          color: 'var(--forest-green)',
          border: '1px solid var(--forest-green-border)',
          borderRadius: '8px',
          fontSize: '0.82rem',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, marginBottom: '6px' }}>
            <FiCheckCircle size={16} />
            <span>Application Submitted to KVIC Admin!</span>
          </div>
          <div style={{ color: 'var(--ink-700)', lineHeight: 1.5, marginBottom: '10px' }}>
            {successMessage}
          </div>
          <button
            type="button"
            onClick={onGoToLogin}
            className="btn-primary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
          >
            Go to Quick Login →
          </button>
        </div>
      )}

      {errorMessage && (
        <div style={{
          padding: '10px 14px',
          background: 'var(--alert-red-light)',
          color: 'var(--alert-red)',
          border: '1px solid var(--alert-red-border)',
          borderRadius: '6px',
          fontSize: '0.82rem',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <FiAlertCircle size={15} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Role Picker Radio Cards */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '8px' }}>
          Select Enterprise Participant Role *
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
          {roleOptions.map((r) => {
            const isSelected = role === r.key;
            return (
              <div
                key={r.key}
                onClick={() => onRoleChange(r.key)}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid var(--primary-honey)' : '1px solid #E2E8F0',
                  background: isSelected ? 'var(--primary-honey-light)' : '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.icon}</div>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: isSelected ? 'var(--primary-honey-hover)' : 'var(--ink-800)' }}>
                  {r.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
            Authorized Contact Name *
          </label>
          <input
            type="text"
            className="form-control"
            value={primaryName}
            onChange={(e) => onPrimaryNameChange(e.target.value)}
            placeholder="e.g. Ramesh Kumar"
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
            Organization / Entity Name *
          </label>
          <input
            type="text"
            className="form-control"
            value={orgName}
            onChange={(e) => onOrgNameChange(e.target.value)}
            placeholder="e.g. Ramesh Kumar Apiary Collective"
            required
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
            Cluster / Facility Location *
          </label>
          <input
            type="text"
            className="form-control"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            placeholder="e.g. Pulwama Cluster"
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
            State / UT *
          </label>
          <input
            type="text"
            className="form-control"
            value={stateName}
            onChange={(e) => onStateNameChange(e.target.value)}
            placeholder="e.g. Jammu & Kashmir"
            required
          />
        </div>
      </div>

      <div style={{ marginBottom: '18px' }}>
        <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
          Mobile Phone Number *
        </label>
        <input
          type="tel"
          className="form-control"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="e.g. 7979797979"
          required
        />
      </div>

      <button
        type="submit"
        className="btn-primary"
        disabled={loading}
        style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
      >
        {loading ? "Submitting Application..." : "Submit Onboarding Application"}
      </button>
    </form>
  );
}

export default OnboardingApplicationForm;
