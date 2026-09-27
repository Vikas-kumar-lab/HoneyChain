import React from 'react';
import { FiAlertCircle } from 'react-icons/fi';

export function LoginForm({
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  onSubmit,
  loading = false,
  error = null
}) {
  return (
    <form onSubmit={onSubmit} style={{ marginBottom: '16px' }}>
      {error && (
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
          <span>{error}</span>
        </div>
      )}

      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
          Mobile Phone Number or Unique ID / Username
        </label>
        <input
          type="text"
          className="form-control"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          placeholder="e.g. 7979797979, Mobile No, or admin"
          required
          autoFocus
        />
      </div>

      <div style={{ marginBottom: '18px' }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
          Password
        </label>
        <input
          type="password"
          className="form-control"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Enter password (default: 123)"
          required
        />
      </div>

      <button 
        type="submit" 
        className="btn-primary" 
        disabled={loading}
        style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
      >
        {loading ? "Verifying Credentials..." : "Sign In"}
      </button>
    </form>
  );
}

export default LoginForm;
