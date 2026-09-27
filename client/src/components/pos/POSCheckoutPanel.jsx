import React from 'react';
import { FiShoppingCart, FiArrowRight } from 'react-icons/fi';
import { FiClock, FiZap } from 'react-icons/fi';

export default function POSCheckoutPanel({
  selectedBatch,
  selectedBottleNum,
  customerName,
  customerPhone,
  paymentMethod,
  onCustomerNameChange,
  onCustomerPhoneChange,
  onPaymentMethodChange,
  onCheckout,
  loading = false
}) {
  const msrp = 450.0;
  const isReady = Boolean(selectedBatch && selectedBottleNum);

  return (
    <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '20px' }}>
      <h4 style={{ margin: '0 0 14px 0', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FiShoppingCart size={18} color="#d97706" />
        POS Customer Checkout &amp; Bill Generation
      </h4>

      {/* Selected Item Summary */}
      <div
        style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '12px 16px',
          marginBottom: '16px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>
              {selectedBatch?.floraName || 'Kashmir Acacia Honey'} (500g Glass Jar)
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Batch: <code>{selectedBatch?.batchCode || 'Select a batch'}</code> • Unit Number: <strong>#{selectedBottleNum || 'None selected'}</strong>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#d97706' }}>
              ₹{msrp.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Includes 5% GST</div>
          </div>
        </div>
      </div>

      {/* Customer Form */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
            Customer Full Name:
          </label>
          <input
            type="text"
            value={customerName}
            onChange={(e) => onCustomerNameChange && onCustomerNameChange(e.target.value)}
            placeholder="e.g. Ramesh Kumar"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              fontSize: '0.85rem'
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '4px' }}>
            Mobile Number (Optional):
          </label>
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => onCustomerPhoneChange && onCustomerPhoneChange(e.target.value)}
            placeholder="e.g. 9876543210"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: '8px',
              border: '1.5px solid #cbd5e1',
              fontSize: '0.85rem'
            }}
          />
        </div>
      </div>

      {/* Payment Method */}
      <div style={{ marginBottom: '18px' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem', color: '#334155', marginBottom: '6px' }}>
          Payment Tender:
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['UPI / QR', 'Cash', 'Credit/Debit Card'].map((pm) => (
            <button
              key={pm}
              type="button"
              onClick={() => onPaymentMethodChange && onPaymentMethodChange(pm)}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: '8px',
                border: `1.5px solid ${paymentMethod === pm ? '#d97706' : '#cbd5e1'}`,
                backgroundColor: paymentMethod === pm ? '#fef3c7' : '#ffffff',
                color: paymentMethod === pm ? '#92400e' : '#475569',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              {pm}
            </button>
          ))}
        </div>
      </div>

      {/* Checkout Submit Button */}
      <button
        type="button"
        disabled={!isReady || loading}
        onClick={onCheckout}
        style={{
          width: '100%',
          padding: '13px 20px',
          borderRadius: '10px',
          border: 'none',
          backgroundColor: isReady ? '#16a34a' : '#94a3b8',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: '0.95rem',
          cursor: isReady && !loading ? 'pointer' : 'not-allowed',
          boxShadow: isReady ? '0 4px 6px -1px rgba(22, 163, 74, 0.3)' : 'none',
          transition: 'all 0.15s ease',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
      >
        {loading ? (
          <><FiClock size={16} /> Recording POS Sale on Blockchain...</>
        ) : !isReady ? (
          <><FiArrowRight size={16} /> Select a Batch &amp; Bottle to Complete Sale</>
        ) : (
          <><FiZap size={16} /> Complete Sale for Bottle #{selectedBottleNum} &amp; Print Tax Invoice</>
        )}
      </button>
    </div>
  );
}
