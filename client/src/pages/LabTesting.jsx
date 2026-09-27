import React, { useState, useEffect } from 'react';
import { 
    getContractInstance, 
    executeBlockchainRelayer,
    cachedCall,
    invalidateContractCache
} from '../web3Utils';
import { 
    getStoredBatches, 
    saveStoredBatches, 
    updateStoredBatchStage,
    fetchBatchesFromServer
} from '../hiveBatchRegistry';
import { useAuth } from '../context/AuthContext';
import { 
    FiCheckCircle, 
    FiAlertCircle,
    FiShield,
    FiLock
} from 'react-icons/fi';
import { FaFlask } from 'react-icons/fa';
import { API_BASE_URL } from '../config';
import { captureDeviceCoordinates } from '../geoUtils';

const KVIC_ADMIN_ADDRESS = '0x556FCE98dC5b75C5097eEf0581BC17f771944EbB';

function LabTesting() {
    const { roleInfo, account: authAccount, currentUser } = useAuth();
    const userRoleTypes = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
    const isAdmin = userRoleTypes.includes('ADMIN') || 
        currentUser?.roleKey === 'ADMIN' ||
        Boolean(authAccount && authAccount.toLowerCase() === KVIC_ADMIN_ADDRESS.toLowerCase());
    const isInitiallyLabAuth = (userRoleTypes.includes('LAB') || currentUser?.roleKey === 'LAB') && !isAdmin;

    const initialBatches = getStoredBatches();
    const [batches, setBatches] = useState(initialBatches);
    const [selectedBatchId, setSelectedBatchId] = useState(initialBatches[0]?.batchId || '');
    
    // Lab parameters
    const [moisture, setMoisture] = useState(17.8);
    const [c4Sugar, setC4Sugar] = useState(0.0);
    const [pollenScore, setPollenScore] = useState(95);
    const [antibioticFree, setAntibioticFree] = useState(true);
    
    const [aiPreScreen, setAiPreScreen] = useState(null);
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState(null);
    const [isLabAuthorized, setIsLabAuthorized] = useState(isInitiallyLabAuth);
    const [confirmRejectPending, setConfirmRejectPending] = useState(false);

    useEffect(() => {
        const types = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
        const isAdm = types.includes('ADMIN') || 
            currentUser?.roleKey === 'ADMIN' ||
            Boolean(authAccount && authAccount.toLowerCase() === KVIC_ADMIN_ADDRESS.toLowerCase());
        const isLab = (types.includes('LAB') || currentUser?.roleKey === 'LAB') && !isAdm;
        setIsLabAuthorized(isLab);
    }, [roleInfo, authAccount, currentUser]);

    useEffect(() => {
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const init = async () => {
        try {
            const { readContract: rContract } = await getContractInstance();
            await loadBatches(rContract);
        } catch (e) {
            console.log("Lab init error:", e);
        }
    };

    const loadBatches = async (c) => {
        try {
            const list = await cachedCall(
                async () => {
                    const count = parseInt(await c.methods.batchCount().call().catch(() => 0));
                    if (!count || count === 0) return [];
                    const promises = Array.from({ length: count }, (_, idx) => {
                        const i = idx + 1;
                        return Promise.all([
                            c.methods.getBatchBasic(i).call(),
                            c.methods.getBatchStatus(i).call(),
                            c.methods.getBatchLabReport(i).call().catch(() => null)
                        ]).then(([basic, status, lab]) => ({ ...basic, ...status, labReport: lab })).catch(() => null);
                    });
                    const rawList = await Promise.all(promises);
                    return rawList.filter(Boolean);
                },
                'lab_batches',
                60000
            );

            const serverBatches = await fetchBatchesFromServer().catch(() => []);
            const stored = (serverBatches && serverBatches.length > 0) ? serverBatches : getStoredBatches();
            const map = new Map();
            list.forEach(b => {
                const k = (b.batchCode || b.batchId || '').toString().toUpperCase();
                if (k) map.set(k, b);
            });
            stored.forEach(b => {
                const k = (b.batchCode || b.batchId || '').toString().toUpperCase();
                if (!map.has(k)) map.set(k, b);
            });
            const merged = Array.from(map.values()).sort((a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0));
            setBatches(merged);
            saveStoredBatches(merged);
            if (merged.length > 0 && !selectedBatchId) {
                setSelectedBatchId(merged[0].batchId);
            }
        } catch (e) {
            console.log("Error loading batches for lab:", e);
            const stored = getStoredBatches();
            if (stored.length > 0) {
                const sorted = [...stored].sort((a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0));
                setBatches(sorted);
                if (!selectedBatchId) setSelectedBatchId(sorted[0].batchId);
            }
        }
    };

    const currentBatch = batches.find(b => String(b.batchId) === String(selectedBatchId));

    // Purity vs Flagged status
    const isFlagged = Boolean(
        currentBatch && (
            currentBatch.isFlagged === true ||
            (currentBatch.labReport && currentBatch.labReport.testTimestamp > 0 && !currentBatch.labReport.passed)
        )
    );

    const isAlreadyCertified = Boolean(
        currentBatch && !isFlagged && (
            currentBatch.isCertifiedPure === true ||
            (currentBatch.labReport && currentBatch.labReport.testTimestamp > 0 && currentBatch.labReport.passed) ||
            (currentBatch.currentStage && !currentBatch.currentStage.toLowerCase().includes('harvest'))
        )
    );

    const isAlreadyDecided = isAlreadyCertified || isFlagged;
    const isHarvested = Boolean(currentBatch && !isAlreadyDecided);

    const handleRunAiPrescreen = async () => {
        if (!currentBatch) {
            setNotification({ type: 'warning', message: '⚠️ No honey batch selected.' });
            return;
        }
        if (isAlreadyDecided) {
            setNotification({ type: 'warning', message: `⚠️ Batch #${currentBatch.batchId} has already been tested on the blockchain.` });
            return;
        }

        try {
            const res = await fetch(`${API_BASE_URL}/api/lab/evaluate-purity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    moisturePercent: moisture,
                    c4SugarPercent: c4Sugar,
                    pollenCount: pollenScore * 500,
                    antibioticDetected: !antibioticFree
                })
            });
            const data = await res.json();
            if (data.success) {
                setAiPreScreen(data.evaluation);
            }
        } catch (e) {
            setNotification({ type: 'warning', message: 'AI pre-screen error: ' + e.message });
        }
    };

    // Pass / Certify Lab Purity
    const handleCertifyBatch = async (e) => {
        e.preventDefault();
        setLoading(true);
        setNotification(null);

        try {
            if (isAdmin) {
                throw new Error("Administrator Read-Only Mode: KVIC Administrator role is strictly restricted to system audit and governance. Only certified Laboratory personnel can commit purity certifications to the blockchain.");
            }

            const types = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
            if (!types.includes('LAB') && currentUser?.roleKey !== 'LAB') {
                throw new Error("Access Denied: Only certified KVIC Laboratory personnel can certify honey batches.");
            }

            if (!currentBatch) throw new Error("No honey batch selected.");
            if (isAlreadyDecided) {
                throw new Error(`Batch #${currentBatch.batchId} has already completed laboratory evaluation.`);
            }

            setNotification({
                type: 'info',
                message: '📍 Capturing lab device GPS coordinates & transmitting purity certification...'
            });

            const labGps = await captureDeviceCoordinates('LAB');
            const moistureX100 = Math.round(parseFloat(moisture) * 100);
            const c4X100 = Math.round(parseFloat(c4Sugar) * 100);
            const pScore = parseInt(pollenScore);
            const labCertHash = `KVIC-LAB-PASS-${selectedBatchId}-M${moistureX100}-C4${c4X100}-${Date.now()}`;

            const historyEvent = {
                stage: 1,
                stageName: 'QualityTested',
                actor: authAccount || (window.ethereum && window.ethereum.selectedAddress) || 'KVIC Central Quality Testing Lab',
                location: 'KVIC Central Quality Testing Lab',
                timestamp: Math.floor(Date.now() / 1000),
                notes: `Certified Pure: Moisture ${(moistureX100 / 100)}%, C4 Sugar ${(c4X100 / 100)}%, Pollen Purity Score ${pScore}%. Lab Cert: ${labCertHash.slice(0, 12)}...`,
                coordinates: labGps
            };

            const res = await executeBlockchainRelayer('certify-lab', {
                batchId: selectedBatchId,
                moisturePercentX100: moistureX100,
                c4SugarPercentX100: c4X100,
                pollenPurityScore: pScore,
                antibioticFree,
                labCertHash,
                coordinates: labGps,
                historyEvent
            });

            const labReport = {
                testTimestamp: Math.floor(Date.now() / 1000),
                moisturePercentX100: moistureX100,
                c4SugarPercentX100: c4X100,
                pollenPurityScore: pScore,
                antibioticFree,
                labCertHash,
                coordinates: labGps,
                passed: true
            };
            const updates = {
                isCertifiedPure: true,
                isFlagged: false,
                currentStage: 'QualityTested',
                stageName: 'QualityTested',
                stageIdx: 1,
                labReport,
                labCoordinates: labGps,
                historyEvent
            };
            updateStoredBatchStage(selectedBatchId, updates);
            setBatches(prev => prev.map(b => String(b.batchId) === String(selectedBatchId) ? { ...b, ...updates } : b));

            invalidateContractCache('lab_batches');
            invalidateContractCache('pipeline_batches');
            invalidateContractCache('beekeeper_batches');

            setNotification({
                type: 'success',
                message: `Batch #${selectedBatchId} successfully certified pure and signed on Blockchain! (Block #${res.blockNumber || 'Live'}, Tx: ${res.transactionHash ? res.transactionHash.slice(0, 10) + '...' : 'Confirmed'})`
            });

            const { readContract: rContract } = await getContractInstance();
            await loadBatches(rContract);
        } catch (err) {
            console.error("Lab test error:", err);
            setNotification({
                type: 'danger',
                message: err.message || "Lab transaction failed."
            });
        } finally {
            setLoading(false);
        }
    };

    // Reject / Flag Batch for Adulteration — step 1: show inline confirm
    const handleRejectBatch = () => {
        if (!currentBatch) {
            setNotification({ type: 'warning', message: '⚠️ No honey batch selected.' });
            return;
        }
        if (isAlreadyDecided) {
            setNotification({ type: 'warning', message: `⚠️ Batch #${currentBatch.batchId} has already been evaluated on the blockchain.` });
            return;
        }
        if (isAdmin) {
            setNotification({ type: 'warning', message: '🔒 Administrator Read-Only Mode: Only certified Laboratory personnel can evaluate and reject batches.' });
            return;
        }
        const types = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
        if (!types.includes('LAB') && currentUser?.roleKey !== 'LAB') {
            setNotification({ type: 'error', message: '⛔ Access Denied: Only certified KVIC Laboratory personnel can evaluate batches.' });
            return;
        }
        // Show inline confirm banner
        setConfirmRejectPending(true);
    };

    // Reject / Flag Batch for Adulteration — step 2: execute after user confirms
    const executeReject = async () => {
        setConfirmRejectPending(false);
        setLoading(true);
        setNotification(null);

        try {
            setNotification({
                type: 'info',
                message: '📍 Capturing lab device GPS coordinates & submitting rejection to Blockchain...'
            });

            const labGps = await captureDeviceCoordinates('LAB');
            const moistureX100 = Math.max(Math.round(parseFloat(moisture) * 100), 2250);
            const c4X100 = Math.max(Math.round(parseFloat(c4Sugar) * 100), 1200);
            const pScore = parseInt(pollenScore) || 25;
            const labCertHash = `KVIC-LAB-REJECT-${selectedBatchId}-${Date.now()}`;

            const rejectEvent = {
                stage: 1,
                stageName: 'QualityTested (Rejected)',
                actor: authAccount || (window.ethereum && window.ethereum.selectedAddress) || 'KVIC Central Quality Testing Lab',
                location: 'KVIC Central Quality Testing Lab',
                timestamp: Math.floor(Date.now() / 1000),
                notes: `REJECTED / QUARANTINED: High moisture or C4 sugar adulteration detected. Lab Cert: ${labCertHash.slice(0, 12)}...`,
                coordinates: labGps
            };

            const res = await executeBlockchainRelayer('certify-lab', {
                batchId: selectedBatchId,
                moisturePercentX100: moistureX100,
                c4SugarPercentX100: c4X100,
                pollenPurityScore: pScore,
                antibioticFree: false,
                labCertHash,
                coordinates: labGps,
                historyEvent: rejectEvent
            });

            const labReport = {
                testTimestamp: Math.floor(Date.now() / 1000),
                moisturePercentX100: moistureX100,
                c4SugarPercentX100: c4X100,
                pollenPurityScore: pScore,
                antibioticFree: false,
                labCertHash,
                coordinates: labGps,
                passed: false
            };
            const updates = {
                isFlagged: true,
                flagReason: 'Failed KVIC purity test: High moisture or C4 sugar adulteration detected',
                labReport,
                labCoordinates: labGps,
                historyEvent: rejectEvent
            };
            updateStoredBatchStage(selectedBatchId, updates);
            setBatches(prev => prev.map(b => String(b.batchId) === String(selectedBatchId) ? { ...b, ...updates } : b));

            invalidateContractCache('lab_batches');
            invalidateContractCache('pipeline_batches');
            invalidateContractCache('beekeeper_batches');

            setNotification({
                type: 'danger',
                message: `Batch #${selectedBatchId} has been REJECTED and FLAGGED for Adulteration on Blockchain! Downstream processing is permanently blocked. (Tx: ${res.transactionHash ? res.transactionHash.slice(0, 10) + '...' : 'Confirmed'})`
            });

            const { readContract: rContract } = await getContractInstance();
            await loadBatches(rContract);
        } catch (err) {
            console.error("Lab rejection error:", err);
            setNotification({
                type: 'danger',
                message: err.message || "Failed to submit rejection to blockchain."
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container">
            {/* Clean Header Banner matching Overview.js */}
            <div className="clean-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ maxWidth: '640px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-honey-hover)', background: 'var(--primary-honey-light)', border: '1px solid var(--primary-honey-border)', padding: '2px 8px', borderRadius: '9999px', marginBottom: '10px' }}>
                            <FaFlask size={12} /> Ministry of MSME • KVIC Quality Assurance
                        </div>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.25, color: 'var(--ink-900)', margin: '0 0 8px' }}>
                            Honey Quality Certification & Purity Testing
                        </h2>
                        <p style={{ color: 'var(--ink-600)', fontSize: '0.88rem', lineHeight: '1.6', margin: 0 }}>
                            FSSAI & KVIC standards testing: C4 sugar syrup adulteration detection, moisture spectrometry, and antibiotic screening. Certified batches advance to processing; adulterated batches are permanently locked on blockchain.
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className={isLabAuthorized ? "badge-purity" : "badge-flagged"}>
                            {isLabAuthorized ? <><FiCheckCircle size={12} /> Authorized Lab</> : <><FiAlertCircle size={12} /> Public / Read Only</>}
                        </span>
                        <span className="badge-purity">
                            <FiCheckCircle size={12} /> ISO/IEC 17025 Compliant
                        </span>
                    </div>
                </div>
            </div>

            {/* Notification Banner */}
            {notification && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    fontSize: '0.86rem',
                    fontWeight: 500,
                    background: notification.type === 'success' ? 'var(--forest-green-light)' : notification.type === 'info' ? '#eff6ff' : 'var(--alert-red-light)',
                    border: `1px solid ${notification.type === 'success' ? 'var(--forest-green-border)' : notification.type === 'info' ? '#bfdbfe' : 'var(--alert-red-border)'}`,
                    color: notification.type === 'success' ? 'var(--forest-green)' : notification.type === 'info' ? '#1d4ed8' : 'var(--alert-red)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    {notification.type === 'success' ? <FiCheckCircle size={16} /> : notification.type === 'info' ? <FiShield size={16} /> : <FiAlertCircle size={16} />}
                    <span>{notification.message}</span>
                </div>
            )}

            {/* Admin Read-Only Notice */}
            {(roleInfo?.types || []).includes('ADMIN') && (
                <div style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '8px',
                    padding: '10px 16px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: '#1e40af',
                    fontSize: '0.84rem'
                }}>
                    <FiShield size={16} />
                    <span><strong>Administrator Read-Only Audit Mode:</strong> Reviewing lab spectrometry and testing reports. Batch certification and rejection require certified KVIC Laboratory personnel credentials.</span>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '18px', marginBottom: '20px' }}>
                {/* Lab Certification Form */}
                <div className="clean-card">
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '14px', color: 'var(--ink-900)' }}>
                        Chemical & Spectrometry Data
                    </h3>
                    
                    {batches.length === 0 ? (
                        <div style={{
                            background: 'var(--bg-app)',
                            border: '1px dashed var(--border)',
                            borderRadius: '8px',
                            padding: '32px 20px',
                            textAlign: 'center',
                            color: 'var(--ink-500)'
                        }}>
                            <div style={{ color: 'var(--ink-400)', marginBottom: '8px' }}>
                                <FiAlertCircle size={32} />
                            </div>
                            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--ink-800)', marginBottom: '4px' }}>
                                No Honey Batches Pending Testing
                            </div>
                            <div style={{ fontSize: '0.82rem', maxWidth: '380px', margin: '0 auto', lineHeight: 1.5 }}>
                                Zero honey batches recorded on blockchain yet. Once a registered beekeeper harvests raw honey from a smart hive, the batch will appear here for FSSAI/KVIC lab spectrometry and purity certification.
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleCertifyBatch}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
                                    Select Honey Batch *
                                </label>
                                <select
                                    className="form-control"
                                    value={selectedBatchId}
                                    onChange={(e) => setSelectedBatchId(e.target.value)}
                                    required
                                >
                                    {batches.map(b => (
                                        <option key={b.batchId} value={b.batchId}>
                                            Batch #{b.batchId} — {b.batchCode} ({b.floraName || 'Flora'} • {b.isFlagged ? 'Flagged / Rejected' : b.isCertifiedPure ? 'Certified Pure' : 'Pending Lab'})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Batch Status Alert */}
                            {isFlagged ? (
                                <div style={{
                                    padding: '12px 14px',
                                    borderRadius: '6px',
                                    marginBottom: '14px',
                                    background: 'var(--alert-red-light)',
                                    border: '1px solid var(--alert-red-border)',
                                    color: 'var(--alert-red)',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <FiAlertCircle size={16} />
                                    <div>
                                        <strong>Batch #{currentBatch.batchId} is FLAGGED & REJECTED on Blockchain!</strong>
                                        <div style={{ fontSize: '0.74rem', marginTop: '2px', color: 'var(--ink-700)' }}>
                                            Reason: High moisture or C4 syrup adulteration detected. Downstream supply chain processing is permanently blocked.
                                        </div>
                                    </div>
                                </div>
                            ) : isAlreadyCertified ? (
                                <div style={{
                                    padding: '12px 14px',
                                    borderRadius: '6px',
                                    marginBottom: '14px',
                                    background: 'var(--forest-green-light)',
                                    border: '1px solid var(--forest-green-border)',
                                    color: 'var(--forest-green)',
                                    fontSize: '0.82rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <FiCheckCircle size={16} />
                                    <div>
                                        <strong>Batch #{currentBatch.batchId} is Certified Pure (100% Pure Honey)</strong>
                                        <div style={{ fontSize: '0.74rem', marginTop: '2px', color: 'var(--ink-700)' }}>
                                            Stage: {currentBatch.currentStage || 'KVIC Lab Quality Certified'} • Duplicate lab certification blocked.
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
                                        Moisture % (&le; 20.0%)
                                    </label>
                                    <input
                                        className="form-control"
                                        type="number"
                                        step="0.1"
                                        min="10"
                                        max="35"
                                        value={moisture}
                                        onChange={(e) => setMoisture(e.target.value)}
                                        disabled={isAlreadyDecided}
                                        required
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
                                        C4 Sugar % (&le; 7.0%)
                                    </label>
                                    <input
                                        className="form-control"
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="50"
                                        value={c4Sugar}
                                        onChange={(e) => setC4Sugar(e.target.value)}
                                        disabled={isAlreadyDecided}
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
                                        Pollen Density Score (0 - 100)
                                    </label>
                                    <input
                                        className="form-control"
                                        type="number"
                                        min="0"
                                        max="100"
                                        value={pollenScore}
                                        onChange={(e) => setPollenScore(e.target.value)}
                                        disabled={isAlreadyDecided}
                                        required
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '4px' }}>
                                        Antibiotic Residue
                                    </label>
                                    <select
                                        className="form-control"
                                        value={antibioticFree ? "true" : "false"}
                                        onChange={(e) => setAntibioticFree(e.target.value === "true")}
                                        disabled={isAlreadyDecided}
                                    >
                                        <option value="true">Free of Residue</option>
                                        <option value="false">Residue Detected</option>
                                    </select>
                                </div>
                            </div>

                            {/* Action Buttons: AI Check, Pass, and Reject */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button 
                                    type="button" 
                                    className="btn-outline" 
                                    onClick={handleRunAiPrescreen}
                                    disabled={!isHarvested}
                                    style={{ opacity: !isHarvested ? 0.5 : 1, cursor: !isHarvested ? 'not-allowed' : 'pointer', fontSize: '0.80rem' }}
                                >
                                    Run AI Pre-Screen
                                </button>

                                {/* Inline Reject Confirm Banner */}
                                {confirmRejectPending && (
                                    <div style={{
                                        background: 'rgba(239,68,68,0.08)',
                                        border: '1.5px solid rgba(239,68,68,0.35)',
                                        borderRadius: '10px',
                                        padding: '12px 14px',
                                        marginBottom: '10px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>
                                            ⚠️ Confirm Rejection: Flag Batch #{currentBatch?.batchId} for adulteration?
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                            This will permanently block downstream processing on the blockchain.
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={executeReject}
                                                style={{ padding: '6px 14px', borderRadius: '7px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                                            >
                                                Yes, Flag &amp; Reject
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setConfirmRejectPending(false)}
                                                style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <button 
                                    type="submit" 
                                    className="btn-primary" 
                                    disabled={loading || !isHarvested || !isLabAuthorized}
                                    style={{ opacity: (!isHarvested || !isLabAuthorized) ? 0.5 : 1, cursor: (!isHarvested || !isLabAuthorized) ? 'not-allowed' : 'pointer', fontSize: '0.80rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {!isLabAuthorized ? <FiLock size={13} /> : <FiCheckCircle size={13} />}
                                    {loading ? 'Submitting...' : !isLabAuthorized ? (isAdmin ? 'Locked: Admin Read-Only' : 'Locked: Lab Role Required') : isAlreadyDecided ? 'Evaluated' : 'Certify Purity (Pass)'}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleRejectBatch}
                                    disabled={loading || !isHarvested || !isLabAuthorized}
                                    style={{
                                        padding: '8px 14px',
                                        fontSize: '0.80rem',
                                        fontWeight: 600,
                                        borderRadius: '8px',
                                        border: '1px solid var(--alert-red-border)',
                                        background: 'var(--alert-red-light)',
                                        color: 'var(--alert-red)',
                                        cursor: (!isHarvested || !isLabAuthorized) ? 'not-allowed' : 'pointer',
                                        opacity: (!isHarvested || !isLabAuthorized) ? 0.5 : 1,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    {!isLabAuthorized ? <FiLock size={13} /> : <FiAlertCircle size={13} />}
                                    {!isLabAuthorized ? (isAdmin ? 'Locked: Admin Read-Only' : 'Locked: Lab Role Required') : 'Reject Batch (Fail)'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                {/* AI Adulteration Diagnostics */}
                <div className="clean-card">
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px', color: 'var(--ink-900)' }}>
                        AI Adulteration & Purity Diagnostics
                    </h3>
                    <p style={{ fontSize: '0.80rem', color: 'var(--ink-500)', marginBottom: '14px' }}>
                        Evaluates sample against KVIC benchmark thresholds before committing gas fees on-chain.
                    </p>

                    {batches.length === 0 ? (
                        <div style={{ background: 'var(--bg-app)', border: '1px dashed var(--border)', borderRadius: '8px', padding: '30px 20px', textAlign: 'center' }}>
                            <div style={{ color: 'var(--ink-400)', marginBottom: '6px' }}>
                                <FaFlask size={30} />
                            </div>
                            <div style={{ fontWeight: 600, color: 'var(--ink-800)', fontSize: '0.9rem', marginBottom: '2px' }}>Awaiting Harvested Honey Data</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--ink-500)' }}>
                                AI pre-screen diagnostics require spectrometry readings from an active harvested honey batch.
                            </div>
                        </div>
                    ) : aiPreScreen ? (
                        <div style={{
                            background: aiPreScreen.isSafe ? 'var(--forest-green-light)' : 'var(--alert-red-light)',
                            border: `1px solid ${aiPreScreen.isSafe ? 'var(--forest-green-border)' : 'var(--alert-red-border)'}`,
                            borderRadius: '8px',
                            padding: '16px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <div>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: aiPreScreen.isSafe ? 'var(--forest-green)' : 'var(--alert-red)' }}>
                                        {aiPreScreen.classification}
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--ink-600)' }}>
                                        Adulteration Risk: {aiPreScreen.riskScore}/100
                                    </div>
                                </div>
                                <span className={aiPreScreen.isSafe ? "badge-purity" : "badge-flagged"}>
                                    {aiPreScreen.isSafe ? "Export Grade" : "High Risk"}
                                </span>
                            </div>

                            {aiPreScreen.reasons.length > 0 && (
                                <ul style={{ paddingLeft: '16px', fontSize: '0.78rem', color: 'var(--alert-red)', margin: '6px 0 0' }}>
                                    {aiPreScreen.reasons.map((r, i) => (
                                        <li key={i} style={{ marginBottom: '2px' }}>{r}</li>
                                    ))}
                                </ul>
                            )}
                            {aiPreScreen.isSafe && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--forest-green)', marginTop: '6px' }}>
                                    Moisture within limit. Zero C4 cane sugar adulteration. Botanical pollen density confirms natural floral foraging.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ background: 'var(--bg-app)', border: '1px dashed var(--border)', borderRadius: '8px', padding: '24px', textAlign: 'center' }}>
                            <div style={{ color: 'var(--primary-honey)', marginBottom: '6px' }}>
                                <FaFlask size={28} />
                            </div>
                            <div style={{ fontWeight: 600, color: 'var(--ink-900)', fontSize: '0.9rem', marginBottom: '2px' }}>
                                {isHarvested ? 'AI Pre-Screen Ready' : 'Batch Testing Complete'}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--ink-500)' }}>
                                {isHarvested ? 'Click "Run AI Pre-Screen" to evaluate chemical ratios against KVIC purity standards.' : 'This batch has already been processed on blockchain.'}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Tested Batches Registry */}
            <div className="clean-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                        <h3 style={{ fontSize: '1.20rem', fontWeight: 700, margin: 0, color: 'var(--ink-900)' }}>
                            Tested Batches Registry
                        </h3>
                        <p style={{ fontSize: '0.80rem', color: 'var(--ink-500)', margin: '3px 0 0' }}>
                            Permanent on-chain lab evaluation ledger for all harvested honey batches.
                        </p>
                    </div>
                    <span className="badge-purity">
                        <FiCheckCircle size={11} /> {batches.length} Batches Tracked
                    </span>
                </div>

                <div className="table-responsive">
                    <table className="honey-table">
                        <thead>
                            <tr>
                                <th>Batch Code</th>
                                <th>Flora</th>
                                <th>Moisture %</th>
                                <th>C4 Sugar %</th>
                                <th>Pollen Score</th>
                                <th>Antibiotic Residue</th>
                                <th>Blockchain Verdict</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--ink-400)', fontSize: '0.88rem' }}>
                                        No lab evaluation reports recorded yet. Harvested honey batches will appear here once submitted.
                                    </td>
                                </tr>
                            ) : (
                                batches.map((b, idx) => (
                                <tr key={idx}>
                                    <td><strong style={{ color: 'var(--ink-900)' }}>{b.batchCode}</strong></td>
                                    <td>{b.floraName}</td>
                                    <td>
                                        {b.labReport && b.labReport.testTimestamp > 0
                                            ? `${(parseInt(b.labReport.moisturePercentX100) / 100).toFixed(1)}%`
                                            : '—'}
                                    </td>
                                    <td>
                                        {b.labReport && b.labReport.testTimestamp > 0
                                            ? `${(parseInt(b.labReport.c4SugarPercentX100) / 100).toFixed(1)}%`
                                            : '—'}
                                    </td>
                                    <td>
                                        {b.labReport && b.labReport.testTimestamp > 0
                                            ? `${b.labReport.pollenPurityScore}/100`
                                            : '—'}
                                    </td>
                                    <td>
                                        {b.labReport && b.labReport.testTimestamp > 0
                                            ? (b.labReport.antibioticFree ? 'Zero Residue' : 'Detected')
                                            : '—'}
                                    </td>
                                    <td>
                                        {b.isFlagged || (b.labReport && b.labReport.testTimestamp > 0 && !b.labReport.passed) ? (
                                            <span className="badge-flagged">
                                                <FiAlertCircle size={11} /> Rejected / Flagged
                                            </span>
                                        ) : b.isCertifiedPure || (b.labReport && b.labReport.testTimestamp > 0 && b.labReport.passed) ? (
                                            <span className="badge-purity">
                                                <FiCheckCircle size={11} /> Certified Pure
                                            </span>
                                        ) : (
                                            <span className="badge-pending">Pending Lab</span>
                                        )}
                                    </td>
                                </tr>
                            )))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default LabTesting;
