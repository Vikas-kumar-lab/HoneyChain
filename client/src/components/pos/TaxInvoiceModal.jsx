import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { downloadInvoicePDF, formatMaskedPhone } from '../../pdfUtils';
import { FiCheckCircle, FiX, FiDownload, FiPrinter } from 'react-icons/fi';

export default function TaxInvoiceModal({ isOpen, onClose, billData }) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !billData) return null;

  const invoiceNumber = billData.invoiceNumber || 'KVIC-eBill';
  const customerName = billData.customerName || 'Walk-in Consumer';
  const customerPhone = billData.customerPhone || '';
  const maskedPhone = formatMaskedPhone(customerPhone);
  const floraName = billData.floraName || 'Kashmir Acacia Honey';
  const batchCode = billData.batchCode || 'HONEY-JK01';
  const bottleNumber = billData.bottleNumber || billData.unit || 1;
  const bottleSerial = billData.bottleSerial || `${batchCode}-JAR-${String(bottleNumber).padStart(4, '0')}`;
  const securityToken = billData.securityToken || billData.token || '9F4B-3E7A';
  const storeName = billData.storeName || billData.storeLocation || 'KVIC Khadi Bhavan Flagship';
  const timestamp = billData.timestamp || (billData.saleTimestamp ? new Date(parseInt(billData.saleTimestamp) * 1000).toLocaleString() : new Date().toLocaleString());
  const paymentMethod = billData.paymentMethod || 'UPI / QR Payment';
  const basePrice = billData.basePrice || '428.57';
  const cgst = billData.cgst || '10.71';
  const sgst = billData.sgst || '10.71';
  const totalAmount = billData.totalAmount || '450.00';
  const txHash = billData.txHash || '';
  const verifyUrl = billData.verifyUrl || `${window.location.origin}/consumer-verify?batch=${billData.batchId}&token=${securityToken}`;

  const handleDownload = async () => {
    setIsGeneratingPdf(true);
    try {
      await downloadInvoicePDF('kvic-universal-ebill', invoiceNumber);
    } catch (e) {
      console.warn('PDF generation fallback to direct browser print:', e);
      window.print();
    } finally {
      setIsGeneratingPdf(false);
    }
  };


  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(5px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      className="print-modal-overlay"
      onClick={onClose}
    >
      <div
        className="print-modal-dialog"
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          maxWidth: '580px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #CBD5E1',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Controls (No-Print) */}
        <div
          className="no-print"
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#F8FAFC'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiCheckCircle size={18} color="var(--forest-green)" />
            <span style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0F172A' }}>
              Official Tax Invoice & E-Bill
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              padding: '4px'
            }}
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Printable Invoice Body */}
        <div id="kvic-universal-ebill" style={{ padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #0F172A', paddingBottom: '12px', marginBottom: '14px' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', color: '#64748B', textTransform: 'uppercase' }}>
              Government of India • Ministry of MSME
            </div>
            <div style={{ fontSize: '1.22rem', fontWeight: 800, color: '#0F172A', margin: '2px 0' }}>
              KHADI & VILLAGE INDUSTRIES COMMISSION
            </div>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#D97706', letterSpacing: '0.04em' }}>
              National Honey Mission • Official Tax Invoice & Cryptographic Purity Deed
            </div>
            <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '4px' }}>
              Store: <strong>{storeName}</strong>
            </div>
          </div>

          {/* Meta Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '14px',
              fontSize: '0.78rem',
              background: '#F8FAFC',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0'
            }}
          >
            <div>
              <div style={{ color: '#64748B', fontSize: '0.70rem' }}>Tax Invoice No:</div>
              <strong style={{ color: '#0F172A', fontFamily: 'monospace', fontSize: '0.86rem' }}>{invoiceNumber}</strong>
              <div style={{ color: '#64748B', fontSize: '0.70rem', marginTop: '4px' }}>Date & Time:</div>
              <div style={{ color: '#1E293B', fontWeight: 500 }}>{timestamp}</div>
            </div>
            <div>
              <div style={{ color: '#64748B', fontSize: '0.70rem' }}>Customer Name:</div>
              <strong style={{ color: '#0F172A' }}>{customerName}</strong>
              <div style={{ color: '#64748B', fontSize: '0.70rem', marginTop: '4px' }}>Customer Contact:</div>
              <div style={{ color: '#1E293B', fontWeight: 500 }}>{maskedPhone}</div>
              <div style={{ color: '#64748B', fontSize: '0.70rem', marginTop: '4px' }}>Payment Mode:</div>
              <div style={{ color: '#166534', fontWeight: 600 }}>{paymentMethod}</div>
            </div>
          </div>

          {/* Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '14px' }}>
            <thead>
              <tr style={{ background: '#F1F5F9', borderBottom: '1.5px solid #CBD5E1' }}>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: '#475569', fontWeight: 700 }}>Description</th>
                <th style={{ textAlign: 'center', padding: '8px 6px', color: '#475569', fontWeight: 700 }}>Unit</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#475569', fontWeight: 700 }}>Price</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#475569', fontWeight: 700 }}>GST (5%)</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: '#475569', fontWeight: 700 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #E2E8F0' }}>
                <td style={{ padding: '8px 6px' }}>
                  <strong style={{ color: '#0F172A' }}>{floraName}</strong>
                  <div style={{ fontSize: '0.70rem', color: '#64748B' }}>
                    Batch: <code>{batchCode}</code> • 500g Jar
                  </div>
                </td>
                <td style={{ textAlign: 'center', padding: '8px 6px', fontWeight: 700 }}>
                  #{bottleNumber}
                </td>
                <td style={{ textAlign: 'right', padding: '8px 6px' }}>₹{basePrice}</td>
                <td style={{ textAlign: 'right', padding: '8px 6px' }}>₹{(parseFloat(cgst) + parseFloat(sgst)).toFixed(2)}</td>
                <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 800, color: '#0F172A' }}>
                  ₹{totalAmount}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Cryptographic Verification Box */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '8px',
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.80rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <FiCheckCircle size={14} /> Cryptographically Certified Authentic
              </div>
              <div style={{ fontSize: '0.72rem', color: '#14532D', marginTop: '3px' }}>
                Serial: <strong style={{ fontFamily: 'monospace' }}>{bottleSerial}</strong>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#14532D' }}>
                Security PIN: <code style={{ fontWeight: 700, color: '#D97706' }}>{securityToken}</code>
              </div>
              {txHash && (
                <div style={{ fontSize: '0.66rem', color: '#64748B', marginTop: '2px', wordBreak: 'break-all' }}>
                  Tx: {txHash.slice(0, 16)}...
                </div>
              )}
            </div>
            <div style={{ background: '#FFFFFF', padding: '6px', borderRadius: '6px', border: '1px solid #E2E8F0', flexShrink: 0 }}>
              <QRCodeCanvas value={verifyUrl} size={64} />
            </div>
          </div>
        </div>

        {/* Action Buttons (No-Print) */}
        <div
          className="no-print"
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end',
            background: '#F8FAFC',
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={() => window.print()}
            style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <FiPrinter size={13} /> Print
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleDownload}
            disabled={isGeneratingPdf}
            style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <FiDownload size={13} /> {isGeneratingPdf ? 'Saving...' : 'Download PDF'}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
            style={{ fontSize: '0.78rem', padding: '6px 12px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
