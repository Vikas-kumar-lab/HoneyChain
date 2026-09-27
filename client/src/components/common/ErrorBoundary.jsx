import React from 'react';
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('HoneyChain View Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '60vh',
          padding: '24px'
        }}>
          <div style={{
            background: 'var(--card-bg, #ffffff)',
            borderRadius: '12px',
            border: '1px solid var(--border-color, #e2e8f0)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            padding: '32px 28px',
            maxWidth: '520px',
            width: '100%',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#FEF2F2',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#DC2626',
              marginBottom: '16px'
            }}>
              <FiAlertTriangle size={28} />
            </div>

            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--ink-900, #0f172a)',
              marginBottom: '8px'
            }}>
              View Temporarily Unavailable
            </h3>

            <p style={{
              fontSize: '0.88rem',
              color: 'var(--ink-600, #64748b)',
              lineHeight: 1.6,
              marginBottom: '20px'
            }}>
              {this.state.error?.message || 'An unexpected error occurred while loading this blockchain view. State has been safely preserved.'}
            </p>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="btn-primary"
                onClick={this.handleReset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <FiRefreshCw size={14} /> Refresh View
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
