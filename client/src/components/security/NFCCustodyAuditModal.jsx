import React, { useState, useEffect } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiXCircle,
  FiRadio,
  FiMapPin,
  FiClock,
  FiX,
  FiExternalLink
} from 'react-icons/fi';
import { FaQrcode } from 'react-icons/fa';
import { QRCodeCanvas } from 'qrcode.react';
import { getBottleSecurityToken, getUniqueBottleSerial } from '../../bottleSecurity';
import { captureDeviceCoordinates } from '../../geoUtils';

/**
 * NFCCustodyAuditModal
 * Physical-to-digital twin NFC gatekeeper audit dialog.
 * Requires verifying tamper-evident cap-to-neck antenna loops on consignment jars
 * before legal and on-chain custody can be transferred.
 */
export default function NFCCustodyAuditModal({
  isOpen,
  onClose,
  batch,
  stageTitle = 'Inward Custody Audit',
  fromActor = 'Previous Custodian',
  toActor = 'Incoming Custodian',
  roleContext = 'DISTRIBUTOR',
  onAuditPassed,
  onAuditFailed,
  onAuditPass,
  onAuditReject
}) {
  const totalJars = parseInt(batch?.jarsTotal || batch?.totalQuantityKg * 2 || 50, 10);
  const [auditState, setAuditState] = useState('IDLE'); // 'IDLE' | 'SCANNING' | 'PASSED' | 'FAILED'
  const [tamperedUnits, setTamperedUnits] = useState([]);
  const [gpsData, setGpsData] = useState(null);
  const [loadingGps, setLoadingGps] = useState(true);
  const [scanProgress, setScanProgress] = useState(0);
  const [showBottleQrs, setShowBottleQrs] = useState(false);
  const [selectedBottleNum, setSelectedBottleNum] = useState(1);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setAuditState('IDLE');
      setTamperedUnits([]);
      setScanProgress(0);
      setLoadingGps(true);
      captureDeviceCoordinates(roleContext).then((data) => {
        setGpsData(data);
        setLoadingGps(false);
      });
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, roleContext]);

  if (!isOpen) return null;

  const runAuditSimulation = (hasTamper = false) => {
    setAuditState('SCANNING');
    setScanProgress(0);
    setTamperedUnits([]);

    let current = 0;
    const interval = setInterval(() => {
      current += 10;
      setScanProgress(current);
      if (current >= 100) {
        clearInterval(interval);
        if (hasTamper) {
          const badUnit = 14; // Fixed or simulated unit for reproducible verification
          setTamperedUnits([badUnit]);
          setAuditState('FAILED');
        } else {
          setTamperedUnits([]);
          setAuditState('PASSED');
        }
      }
    }, 70);
  };

  const handleConfirmAcceptance = () => {
    if (auditState !== 'PASSED') return;
    const auditSummary = {
      timestamp: Math.floor(Date.now() / 1000),
      totalUnits: totalJars,
      totalJars: totalJars,
      verifiedCount: totalJars,
      intactUnits: totalJars,
      tamperedUnits: [],
      passed: true,
      gps: gpsData,
      certHash: `NFC-AUDIT-OK-${batch?.batchId}-${Date.now()}`
    };
    const cb = onAuditPass || onAuditPassed;
    if (cb) cb(auditSummary);
    onClose();
  };

  const handleConfirmRejection = () => {
    if (auditState !== 'FAILED') return;
    const brokenId = (tamperedUnits && tamperedUnits.length > 0) ? tamperedUnits[0] : 14;
    const breachReport = {
      timestamp: Math.floor(Date.now() / 1000),
      batchId: batch?.batchId,
      batchCode: batch?.batchCode,
      failedJarId: brokenId,
      compromisedUnits: tamperedUnits.length > 0 ? tamperedUnits : [brokenId],
      liableActor: fromActor,
      rejectedBy: toActor,
      gps: gpsData,
      passed: false,
      reason: `NTAG 424 DNA physical antenna loop severed on Jar #${brokenId}. Tampered prior to custody acceptance.`
    };
    const cb = onAuditReject || onAuditFailed;
    if (cb) cb(breachReport);
    onClose();
  };

  return (
    <div
      className="app-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px'
      }}
    >
      <div
        className="app-modal-dialog nfc-audit-modal"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
          position: 'relative',
          padding: '24px'
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#64748b'
          }}
        >
          <FiX size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: auditState === 'FAILED' ? '#fef2f2' : '#ecfdf5',
              border: `1.5px solid ${auditState === 'FAILED' ? '#f87171' : '#34d399'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: auditState === 'FAILED' ? '#dc2626' : '#059669'
            }}
          >
            {auditState === 'FAILED' ? <FiAlertTriangle size={24} /> : <FiRadio size={24} />}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
              {stageTitle}
            </h3>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
              Batch <code>{batch?.batchCode || `#${batch?.batchId}`}</code> • Handover: <strong>{fromActor}</strong> ➔ <strong>{toActor}</strong>
            </div>
          </div>
        </div>

        {/* Live GPS & Timestamp Bar */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            padding: '10px 14px',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '0.78rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155' }}>
            <FiMapPin size={14} color="#d97706" />
            <span>
              Device GPS: <strong>{loadingGps ? 'Detecting coordinates...' : gpsData?.formatted || 'Active Dispatch Hub'}</strong>
            </span>
            {gpsData?.isLiveGPS && (
              <span style={{ fontSize: '0.68rem', backgroundColor: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                Live Satellite GPS (±{gpsData.accuracy}m)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b' }}>
            <FiClock size={13} />
            <span>{new Date().toLocaleTimeString()} • Verified Timestamp</span>
          </div>
        </div>

        {/* Audit Instructions */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: '#eff6ff',
            border: '1px solid #bfdbfe',
            color: '#1e40af',
            fontSize: '0.82rem',
            marginBottom: '18px',
            lineHeight: 1.5
          }}
        >
          <strong>Non-Repudiation Gatekeeper Protocol:</strong> NTAG 424 DNA tamper loops on all <strong>{totalJars} jars</strong> must be intact. If any seal is broken, custody transfer will be aborted and liability will be irrevocably pinned on <strong>{fromActor}</strong>.
        </div>

        {/* Scanner Simulation Controls */}
        <div style={{ marginBottom: '18px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Interactive NFC Sensor Scan Simulation & Consignment Passport
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => { setShowBottleQrs(false); runAuditSimulation(false); }}
              disabled={auditState === 'SCANNING'}
              style={{
                backgroundColor: '#059669',
                borderColor: '#059669',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '11px 12px',
                fontSize: '0.83rem'
              }}
            >
              <FiCheckCircle size={16} />
              <span>⚡ Audit (100% Intact)</span>
            </button>

            <button
              type="button"
              className="btn-outline"
              onClick={() => { setShowBottleQrs(false); runAuditSimulation(true); }}
              disabled={auditState === 'SCANNING'}
              style={{
                color: '#dc2626',
                borderColor: '#fca5a5',
                backgroundColor: '#fff5f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '11px 12px',
                fontSize: '0.83rem',
                fontWeight: 600
              }}
            >
              <FiAlertTriangle size={16} />
              <span>⚠️ Simulate Broken Seal</span>
            </button>

            <button
              type="button"
              onClick={() => setShowBottleQrs(!showBottleQrs)}
              style={{
                color: showBottleQrs ? '#b45309' : '#1e293b',
                borderColor: showBottleQrs ? '#f59e0b' : '#cbd5e1',
                backgroundColor: showBottleQrs ? '#fef3c7' : '#f8fafc',
                border: '1.5px solid',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '11px 12px',
                fontSize: '0.83rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <FaQrcode size={16} color={showBottleQrs ? '#b45309' : '#d97706'} />
              <span>{showBottleQrs ? '✓ Showing Bottle QRs' : '📦 View All Bottle QRs'}</span>
            </button>
          </div>
        </div>

        {/* Consignment Bottle QR Codes Gallery */}
        {showBottleQrs && (
          <div style={{
            background: '#ffffff',
            border: '1.5px solid #f59e0b',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '20px',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.12)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FaQrcode color="#d97706" /> Consignment Bottle QR Passports ({totalJars} Jars)
                </h4>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748b' }}>
                  Each individual bottle is cryptographically mapped with its unique NTAG DNA token & verify URL
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                🖨️ Print Bottle QR Sheet
              </button>
            </div>

            {/* Selected Bottle Spotlight QR Display */}
            {(() => {
              const bNum = selectedBottleNum || 1;
              const token = getBottleSecurityToken(batch?.batchId, bNum, batch?.harvestTimestamp || 0, batch?.batchCode || 'HONEY');
              const serial = getUniqueBottleSerial(batch?.batchCode || 'HONEY', bNum, token);
              const verifyUrl = `${window.location.origin}/consumer-verify?batch=${batch?.batchId}&code=${token}`;

              return (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '14px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{
                    background: '#ffffff',
                    padding: '8px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.06)'
                  }}>
                    <QRCodeCanvas value={verifyUrl} size={110} level="M" />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                      Jar #{String(bNum).padStart(2, '0')}
                    </span>
                  </div>

                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                      Jar #{String(bNum).padStart(2, '0')} • Cryptographic Digital Twin
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>
                      Serial: <code style={{ color: '#2563eb', fontWeight: 700 }}>{serial}</code>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                      Security PIN: <code style={{ color: '#16a34a', fontWeight: 700 }}>{token}</code>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '4px' }}>
                      Purity Status: <strong>{batch?.isCertifiedPure !== false ? '✅ Certified 100% Pure' : '⚠️ Pending Lab'}</strong> • Flora: <strong>{batch?.floraName || 'Natural Flora'}</strong>
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                      <a
                        href={verifyUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: '0.72rem',
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#b45309',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontWeight: 600,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <FiExternalLink size={12} /> Test Scan URL →
                      </a>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Quick Bottle Selector */}
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
              Select Any Bottle to View Its QR ({totalJars} Jars in Batch):
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
              gap: '6px',
              maxHeight: '160px',
              overflowY: 'auto',
              padding: '6px',
              background: '#f1f5f9',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              {Array.from({ length: totalJars }, (_, i) => i + 1).map(num => {
                const isSelected = selectedBottleNum === num;
                const token = getBottleSecurityToken(batch?.batchId, num, batch?.harvestTimestamp || 0, batch?.batchCode || 'HONEY');
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSelectedBottleNum(num)}
                    style={{
                      padding: '6px 4px',
                      borderRadius: '6px',
                      border: isSelected ? '2px solid #d97706' : '1px solid #cbd5e1',
                      background: isSelected ? '#fef3c7' : '#ffffff',
                      color: isSelected ? '#92400E' : '#334155',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px'
                    }}
                  >
                    <span>Jar #{String(num).padStart(2, '0')}</span>
                    <span style={{ fontSize: '0.62rem', fontFamily: 'monospace', color: '#2563eb' }}>{token.split('-')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scanning Progress Bar */}
        {auditState === 'SCANNING' && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px', color: '#475569' }}>
              <span>Reading NTAG 424 Cryptographic Loops...</span>
              <span><strong>{scanProgress}%</strong></span>
            </div>
            <div style={{ height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${scanProgress}%`,
                  backgroundColor: '#d97706',
                  transition: 'width 0.1s linear'
                }}
              />
            </div>
          </div>
        )}

        {/* Visual Consignment Jar Grid */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
              Consignment Units ({totalJars} Jars) — Click any unit to view its QR
            </span>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
              {auditState === 'PASSED' && <span style={{ color: '#059669', fontWeight: 700 }}>✓ All {totalJars} Intact</span>}
              {auditState === 'FAILED' && <span style={{ color: '#dc2626', fontWeight: 700 }}>✗ Unit #{tamperedUnits.join(', #')} Compromised</span>}
              {auditState === 'IDLE' && 'Awaiting NFC Scan'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(46px, 1fr))',
              gap: '6px',
              maxHeight: '140px',
              overflowY: 'auto',
              padding: '10px',
              backgroundColor: '#f8fafc',
              borderRadius: '10px',
              border: '1px solid #e2e8f0'
            }}
          >
            {Array.from({ length: totalJars }, (_, idx) => {
              const unitNum = idx + 1;
              const isCompromised = tamperedUnits.includes(unitNum);
              const isChecked = auditState === 'PASSED' || (auditState === 'FAILED' && !isCompromised);

              return (
                <div
                  key={unitNum}
                  onClick={() => {
                    setSelectedBottleNum(unitNum);
                    setShowBottleQrs(true);
                  }}
                  title={`Jar #${unitNum}: ${isCompromised ? 'SEAL SEVERED' : isChecked ? 'SEAL INTACT' : 'Unscanned'} (Click to view QR)`}
                  style={{
                    padding: '6px 2px',
                    textAlign: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    borderRadius: '6px',
                    backgroundColor: isCompromised ? '#fee2e2' : isChecked ? '#dcfce7' : '#ffffff',
                    border: `1px solid ${isCompromised ? '#ef4444' : isChecked ? '#86efac' : '#cbd5e1'}`,
                    color: isCompromised ? '#b91c1c' : isChecked ? '#15803d' : '#64748b',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  #{unitNum}
                </div>
              );
            })}
          </div>
        </div>

        {/* PASSED Result Banner */}
        {auditState === 'PASSED' && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: '#ecfdf5',
              border: '1.5px solid #10b981',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontWeight: 700, fontSize: '0.92rem' }}>
              <FiCheckCircle size={18} color="#059669" />
              <span>NFC Audit Succeeded: 100% Intact ({totalJars}/{totalJars} Verified)</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#047857', marginTop: '4px' }}>
              All cryptographic antenna loops intact. No physical tampering detected in transit. You can safely accept legal custody of this consignment.
            </div>
          </div>
        )}

        {/* FAILED Result Banner */}
        {auditState === 'FAILED' && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: '#fef2f2',
              border: '1.5px solid #ef4444',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', fontWeight: 800, fontSize: '0.92rem' }}>
              <FiAlertTriangle size={18} color="#dc2626" />
              <span>SECURITY BREACH: Tampered Seal on Jar #{tamperedUnits.join(', #')}!</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#b91c1c', marginTop: '4px', lineHeight: 1.4 }}>
              Conductive loop broken — jar cap was twisted or opened in transit prior to custody delivery. 
              <strong> Custody handover aborted.</strong> An on-chain breach incident will pin liability on <strong>{fromActor}</strong>.
            </div>
          </div>
        )}

        {/* Decision Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-outline"
            onClick={onClose}
            style={{ padding: '9px 18px', fontSize: '0.84rem' }}
          >
            Cancel
          </button>

          {auditState === 'PASSED' && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmAcceptance}
              style={{
                padding: '9px 20px',
                fontSize: '0.85rem',
                backgroundColor: '#059669',
                borderColor: '#059669',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <FiCheckCircle size={15} />
              <span>Accept Custody & Commit to Blockchain</span>
            </button>
          )}

          {auditState === 'FAILED' && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmRejection}
              style={{
                padding: '9px 20px',
                fontSize: '0.85rem',
                backgroundColor: '#dc2626',
                borderColor: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <FiXCircle size={15} />
              <span>Reject Consignment & Report Breach</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
