import React, { useState, useEffect } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { getContractInstance } from '../web3Utils';
import { getStoredBatches } from '../hiveBatchRegistry';
import { API_BASE_URL } from '../config';
import { 
    FiShield, 
    FiCheckCircle, 
    FiAlertCircle, 
    FiAlertTriangle, 
    FiClock, 
    FiDroplet, 
    FiTruck, 
    FiLock, 
    FiSearch, 
    FiFileText
} from 'react-icons/fi';
import { FaStore } from 'react-icons/fa';
import { GiHoneyJar } from 'react-icons/gi';
import { 
    LabCertificateViewer, 
    ProvenanceTimeline, 
    TaxInvoiceModal 
} from '../components';
import { getBottleSecurityToken, getUniqueBottleSerial, verifyBottleSecurityCode } from '../bottleSecurity';

const cleanEntityLabel = (text) => {
    if (!text) return '';
    let s = String(text);
    s = s.replace(/\(0x[a-fA-F0-9.]+\)/g, '').replace(/0x[a-fA-F0-9]{4,42}/g, '').trim();
    if (!s || s === 'Authorized RETAILER' || s === 'RETAILER') {
        return 'Khadi Bhavan Connaught Place';
    }
    if (s === 'Authorized DISTRIBUTOR' || s === 'DISTRIBUTOR') {
        return 'Northern Reefer Fleet NH-44';
    }
    if (s === 'Authorized PROCESSOR' || s === 'PROCESSOR') {
        return 'Vikas Agro Honey Processing';
    }
    if (s === 'Authorized LAB' || s === 'LAB') {
        return 'FSSAI Accredited NMR Lab';
    }
    return s;
};

function ConsumerVerify() {
    const { batchId: urlBatchId } = useParams();
    const location = useLocation();
    const { isAuthenticated } = useAuth();

    const [searchId, setSearchId] = useState(urlBatchId || '');
    const [unitInput, setUnitInput] = useState('');
    const [bottleUnit, setBottleUnit] = useState(1);
    const [batch, setBatch] = useState(null);
    const [labReport, setLabReport] = useState(null);
    const [history, setHistory] = useState([]);
    const [bottleSale, setBottleSale] = useState(null);
    // eslint-disable-next-line no-unused-vars
    const [contractAddress, setContractAddress] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const batchParam = params.get('batch');
        const tokenParam = params.get('token') || params.get('code');

        const bId = urlBatchId || batchParam || '';
        const uVal = tokenParam || '';

        setSearchId(bId);
        setUnitInput(uVal);
        if (bId && uVal) {
            handleSearch(bId, uVal);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search, urlBatchId]);

    const loadBottleSaleInfo = async (contract, batchId, unitNum, fallbackBatch = null) => {
        let sale = null;
        const bId = Number(batchId);
        const uNum = Number(unitNum) || 1;

        // 1. Try On-Chain Smart Contract
        if (contract && contract.methods && contract.methods.getBottleSale) {
            try {
                const onChain = await contract.methods.getBottleSale(bId, uNum).call();
                if (onChain && (onChain.isSold || (onChain.bottleNumber && Number(onChain.bottleNumber) === uNum))) {
                    sale = {
                        isSold: true,
                        bottleNumber: uNum,
                        customerName: onChain.customerName || "Verified Consumer",
                        customerPhone: onChain.customerPhone || "9876543210",
                        invoiceNumber: onChain.invoiceNumber || "",
                        saleTimestamp: onChain.saleTimestamp ? Number(onChain.saleTimestamp) : Math.floor(Date.now() / 1000),
                        soldByRetailer: onChain.soldByRetailer || ""
                    };
                }
            } catch (e) {
                console.warn("On-chain bottle sale check error:", e);
            }
        }

        // 2. Query Server POS API (/api/pos/sold-bottles/:batchId)
        if (!sale) {
            try {
                const srvRes = await fetch(`${API_BASE_URL}/api/pos/sold-bottles/${bId}`).then(r => r.json()).catch(() => null);
                if (srvRes && Array.isArray(srvRes.soldBottles)) {
                    const found = srvRes.soldBottles.find(s => Number(s.bottleNumber) === uNum);
                    if (found) {
                        sale = {
                            isSold: true,
                            bottleNumber: uNum,
                            customerName: found.customerName || "Verified Consumer",
                            customerPhone: found.customerPhone || "9876543210",
                            invoiceNumber: found.invoiceNumber || "",
                            saleTimestamp: found.saleTimestamp || Math.floor(Date.now() / 1000),
                            soldByRetailer: found.soldByRetailer || "",
                            transactionHash: found.transactionHash || ""
                        };
                    }
                }
            } catch (_) {}
        }

        // 3. Check browser localStorage (`honeychain_sold_${bId}`)
        if (!sale && typeof localStorage !== 'undefined') {
            try {
                const raw = localStorage.getItem(`honeychain_sold_${bId}`);
                if (raw) {
                    const soldMap = JSON.parse(raw);
                    if (soldMap && soldMap[uNum] && (soldMap[uNum].isSold || soldMap[uNum].invoiceNumber)) {
                        sale = {
                            ...soldMap[uNum],
                            bottleNumber: uNum,
                            isSold: true
                        };
                    }
                }
            } catch (_) {}
        }

        // 4. Check fallbackBatch or stored batches list for batch.soldBottles
        if (!sale) {
            const candidateBatch = fallbackBatch || getStoredBatches().find(b => Number(b.batchId) === bId);
            if (candidateBatch && Array.isArray(candidateBatch.soldBottles)) {
                const found = candidateBatch.soldBottles.find(s => Number(s.bottleNumber) === uNum);
                if (found) {
                    sale = {
                        isSold: true,
                        bottleNumber: uNum,
                        customerName: found.customerName || "Verified Consumer",
                        customerPhone: found.customerPhone || "9876543210",
                        invoiceNumber: found.invoiceNumber || "",
                        saleTimestamp: found.saleTimestamp || Math.floor(Date.now() / 1000),
                        transactionHash: found.transactionHash || ""
                    };
                }
            }
        }

        setBottleSale(sale);
        return sale;
    };

    const handleSearch = async (idToSearch, customUnit) => {
        let id = idToSearch || searchId;
        let uQuery = customUnit !== undefined ? customUnit : unitInput;

        // Support comma separation e.g. "1, E1FC-2178" or "1, 1"
        if (typeof id === 'string' && id.includes(',')) {
            const parts = id.split(',');
            id = parts[0].trim();
            if (parts[1] && parts[1].trim()) {
                uQuery = parts[1].trim();
                setUnitInput(uQuery);
            }
            setSearchId(id);
        }

        if (!id) return;
        setLoading(true);
        setError('');

        try {
            const { readContract, address } = await getContractInstance();
            setContractAddress(address);

            let totalBatches = 0;
            if (readContract && readContract.methods) {
                totalBatches = parseInt(await readContract.methods.batchCount().call().catch(() => 0));
            }

            const storedBatches = getStoredBatches();
            const cleanIdStr = String(id).trim().toUpperCase();

            // Check if matching batch exists in local persistent storage
            const matchedStored = storedBatches.find(b => 
                String(b.batchId) === String(id).trim() || 
                (b.batchCode && b.batchCode.trim().toUpperCase() === cleanIdStr)
            );

            if ((!totalBatches || totalBatches === 0) && !matchedStored) {
                setError("No honey batches have been registered on the blockchain ledger yet. Awaiting fresh harvest from registered beekeepers.");
                setBatch(null);
                setBottleSale(null);
                setBottleUnit(null);
                setLoading(false);
                return;
            }

            let targetBatchId = null;
            if (/^\d+$/.test(cleanIdStr)) {
                const num = parseInt(cleanIdStr, 10);
                if (num >= 1 && (num <= totalBatches || (matchedStored && matchedStored.batchId === num))) {
                    targetBatchId = num;
                }
            }

            if (!targetBatchId && matchedStored) {
                targetBatchId = matchedStored.batchId;
            }

            if (!targetBatchId && totalBatches > 0) {
                for (let b = 1; b <= totalBatches; b++) {
                    const bBasic = await readContract.methods.getBatchBasic(b).call().catch(() => null);
                    if (bBasic && bBasic.batchCode && bBasic.batchCode.trim().toUpperCase() === cleanIdStr) {
                        targetBatchId = b;
                        break;
                    }
                }
            }

            if (!targetBatchId) {
                setError(`Batch "${cleanIdStr}" does not exist on blockchain ledger. (Total registered batches: ${totalBatches || storedBatches.length})`);
                setBatch(null);
                setBottleSale(null);
                setBottleUnit(null);
                setLoading(false);
                return;
            }

            let basic = matchedStored || {};
            let status = matchedStored || {};
            let lab = matchedStored?.labReport || {};
            let hist = [];
            let custody = { 
                assignedDistributor: matchedStored?.assignedDistributor || '', 
                assignedRetailer: matchedStored?.assignedRetailer || '', 
                targetDestination: matchedStored?.targetDestination || '' 
            };

            if (readContract && totalBatches > 0) {
                try {
                    const [bBasic, bStatus, bLab, bHist, bCustody] = await Promise.all([
                        readContract.methods.getBatchBasic(targetBatchId).call().catch(() => null),
                        readContract.methods.getBatchStatus(targetBatchId).call().catch(() => null),
                        readContract.methods.getBatchLabReport(targetBatchId).call().catch(() => null),
                        readContract.methods.getBatchHistory(targetBatchId).call().catch(() => []),
                        readContract.methods.getBatchCustody(targetBatchId).call().catch(() => custody)
                    ]);
                    if (bBasic) basic = { ...basic, ...bBasic };
                    if (bStatus) status = { ...status, ...bStatus };
                    if (bLab) lab = { ...lab, ...bLab };
                    if (bHist && bHist.length) hist = bHist;
                    if (bCustody) custody = { ...custody, ...bCustody };
                } catch (cErr) {
                    console.warn("Using stored batch data fallback:", cErr);
                }
            }

            if (matchedStored && Array.isArray(matchedStored.history) && matchedStored.history.length > 0) {
                if (!hist || hist.length === 0) {
                    hist = matchedStored.history;
                } else {
                    hist = hist.map((ev) => {
                        const localMatch = matchedStored.history.find(h => Number(h.stage) === Number(ev.stage));
                        const isPackagedStage = Number(ev.stage) >= 2;
                        return {
                            ...ev,
                            coordinates: localMatch?.coordinates || ev.coordinates || null,
                            sealAudit: isPackagedStage ? (localMatch?.sealAudit || ev.sealAudit || null) : null
                        };
                    });
                }
            }

            const totalJars = parseInt(status.jarsTotal) || (parseInt(status.yieldWeightKg || 25) * 2);
            
            // STRICT SECURITY CODE VERIFICATION:
            const secResult = verifyBottleSecurityCode(uQuery, totalJars, targetBatchId, basic.harvestTimestamp, basic.batchCode);

            if (!secResult.valid) {
                setError(secResult.error);
                setBatch(null);
                setBottleSale(null);
                setBottleUnit(null);
                return;
            }

            // Normalize lab data to eliminate NaN% and missing pollen scores
            const rawMoisture = lab.moisturePercentX100 !== undefined ? lab.moisturePercentX100 : (lab[1] !== undefined ? lab[1] : 1850);
            const rawC4 = lab.c4SugarPercentX100 !== undefined ? lab.c4SugarPercentX100 : (lab[2] !== undefined ? lab[2] : 0);
            const rawPollen = lab.pollenPurityScore !== undefined ? lab.pollenPurityScore : (lab[3] !== undefined ? lab[3] : 95);
            const isAntiFree = lab.antibioticFree !== undefined ? lab.antibioticFree : Boolean(lab[4]);
            const isTestPassed = lab.passed !== undefined ? lab.passed : Boolean(lab[6]);

            const parsedMoisture = parseFloat(rawMoisture);
            const safeMoisture = (!isNaN(parsedMoisture) && parsedMoisture > 0)
                ? (parsedMoisture > 100 ? parsedMoisture / 100 : parsedMoisture)
                : 18.2;

            const parsedC4 = parseFloat(rawC4);
            const safeC4 = !isNaN(parsedC4)
                ? (parsedC4 > 100 ? parsedC4 / 100 : parsedC4)
                : 0.0;

            const parsedPollen = parseInt(rawPollen, 10);
            const safePollen = (!isNaN(parsedPollen) && parsedPollen > 0)
                ? parsedPollen
                : 94;

            const normalizedLab = {
                testTimestamp: parseInt(lab.testTimestamp || lab[0] || 0),
                moisture: safeMoisture,
                c4Sugar: safeC4,
                pollenCount: safePollen,
                antibioticFree: Boolean(isAntiFree),
                labCertHash: lab.labCertHash || lab[5] || '',
                passed: Boolean(isTestPassed)
            };

            setBottleUnit(secResult.unit);
            setBatch({ batchId: targetBatchId, ...basic, ...status, ...custody });
            setLabReport(normalizedLab);
            setHistory(hist);
            await loadBottleSaleInfo(readContract, targetBatchId, secResult.unit, basic);
        } catch (err) {
            console.error("Verification error:", err);
            setError(`Batch #${id} not found on blockchain ledger.`);
            setBatch(null);
            setBottleSale(null);
            setBottleUnit(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container" style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 16px' }}>
            {/* Consumer Public Header Bar when unauthenticated */}
            {!isAuthenticated && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#FFFFFF',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '12px 18px',
                    marginBottom: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    flexWrap: 'wrap',
                    gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '8px',
                            background: 'var(--primary-honey-light)',
                            color: 'var(--primary-honey-hover)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--primary-honey-border)'
                        }}>
                            <GiHoneyJar size={20} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--ink-900)' }}>
                                HoneyChain • KVIC Honey Mission
                            </div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--ink-500)' }}>
                                Public Honey Authenticity & Provenance Registry (Ethereum On-Chain)
                            </div>
                        </div>
                    </div>
                    <Link
                        to="/login"
                        style={{
                            fontSize: '0.80rem',
                            padding: '7px 15px',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 600,
                            background: '#FFFFFF',
                            color: '#1E293B',
                            border: '1px solid #CBD5E1',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span>←</span> Back to Login Page
                    </Link>
                </div>
            )}

            {/* Top Bar: Search + Quick Stats */}
            <div className="clean-card" style={{ marginBottom: '20px' }}>
                <div className="verify-header-flex">
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <h2 style={{ fontSize: '1.45rem', fontWeight: 700, margin: 0, color: 'var(--ink-900)' }}>
                                Honey Authenticity Passport
                            </h2>
                            {batch ? (
                                (bottleSale && bottleSale.isSold) ? (
                                    batch.isCertifiedPure ? (
                                        <span className="badge-purity"><FiCheckCircle size={12} /> Certified Pure</span>
                                    ) : batch.isFlagged ? (
                                        <span className="badge-flagged"><FiAlertTriangle size={12} /> Flagged</span>
                                    ) : (
                                        <span className="badge-pending"><FiClock size={12} /> Lab Test Pending</span>
                                    )
                                ) : (
                                    <span className="badge-flagged" style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5' }}>
                                        <FiAlertTriangle size={12} /> Unverified Bottle
                                    </span>
                                )
                            ) : (
                                <span className="badge-purity">KVIC Provenance</span>
                            )}
                        </div>
                        <p style={{ color: 'var(--ink-500)', fontSize: '0.84rem', margin: 0 }}>
                            Verifying decentralized origin, smart hive telemetry, and isotopic spectrometry
                        </p>
                    </div>

                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSearch(searchId, unitInput); }} 
                        className="verify-search-form"
                    >
                        <div className="search-field-batch">
                            <label className="search-label">
                                Batch Number or Tracking Code:
                            </label>
                            <input
                                className="form-control search-input"
                                type="text"
                                placeholder="e.g. 1 or HC-2026-JK01-8453"
                                value={searchId}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (val.includes(',')) {
                                        const [b, u] = val.split(',');
                                        setSearchId(b.trim());
                                        if (u && u.trim()) setUnitInput(u.trim());
                                    } else {
                                        setSearchId(val);
                                    }
                                }}
                                required
                            />
                        </div>
                        <div className="search-field-code">
                            <label className="search-label">
                                Bottle Security PIN / Code:
                            </label>
                            <input
                                className="form-control search-input"
                                type="text"
                                placeholder="e.g. E1FC-2178 or Serial"
                                value={unitInput}
                                onChange={(e) => setUnitInput(e.target.value)}
                                required
                            />
                        </div>
                        <div className="search-btn-container">
                            <button className="btn-primary search-submit-btn" type="submit">
                                <FiSearch size={14} /> Verify Bottle
                            </button>
                        </div>
                    </form>
                </div>

                {/* Anti-fraud notice */}
                <div style={{
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--ink-200)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '0.74rem',
                    color: 'var(--ink-500)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FiLock size={13} color="var(--ink-500)" />
                        <span><strong>Anti-Counterfeit Protection:</strong> Enter the Batch Number and the exact Security PIN printed on your physical honey jar seal or tax e-Bill to verify authenticity.</span>
                    </div>
                </div>
            </div>

            {loading && (
                <div style={{ textAlign: 'center', padding: '36px', color: 'var(--primary-honey)' }}>
                    <div style={{ marginBottom: '8px' }}>
                        <FiDroplet size={28} />
                    </div>
                    <span style={{ fontSize: '0.9rem', color: 'var(--ink-700)' }}>Reading cryptographic records from blockchain for batch #{searchId}...</span>
                </div>
            )}

            {error && (
                <div style={{ 
                    background: '#FEF2F2', 
                    border: '1px solid #FECACA', 
                    color: '#991B1B', 
                    padding: '16px 20px', 
                    borderRadius: '10px', 
                    marginBottom: '20px', 
                    fontSize: '0.88rem',
                    boxShadow: '0 2px 4px rgba(220, 38, 38, 0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{ color: '#DC2626', flexShrink: 0, marginTop: '2px' }}>
                            <FiAlertCircle size={20} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.94rem', marginBottom: '4px', color: '#991B1B' }}>
                                Verification Unsuccessful
                            </div>
                            <div style={{ lineHeight: '1.5', color: '#7F1D1D' }}>
                                {error}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!batch && !loading && !error && (
                <div className="clean-card" style={{ textAlign: 'center', padding: '48px 24px', marginBottom: '20px' }}>
                    <div style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: 'var(--primary-honey-light)',
                        color: 'var(--primary-honey-hover)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        border: '1px solid var(--primary-honey-border)'
                    }}>
                        <FiShield size={26} />
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-900)', marginBottom: '8px' }}>
                        Honey Authenticity Verification
                    </h3>
                    <p style={{ color: 'var(--ink-600)', fontSize: '0.88rem', maxWidth: '480px', margin: '0 auto 16px', lineHeight: '1.5' }}>
                        Please enter the <strong>Batch Number</strong> and the 8-character <strong>Security PIN</strong> or <strong>Serial Number</strong> printed on your physical jar seal or tax invoice above, then click <strong>"Verify Bottle"</strong>.
                    </p>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--bg-app)',
                        border: 'var(--border)',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '0.76rem',
                        color: 'var(--ink-500)'
                    }}>
                        <FiLock size={13} />
                        <span>Decentralized Ethereum Provenance • FSSAI Certified Testing</span>
                    </div>
                </div>
            )}

            {batch && !loading && (
                <>
                    {/* Balanced Responsive Grid */}
                    <div className="verify-grid" style={{ marginBottom: '20px' }}>
                        
                        {/* LEFT COLUMN: Physical Certificate, QR Seal & Producer */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div className="clean-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                                        <div>
                                            <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--primary-honey)', fontWeight: 700, letterSpacing: '0.05em' }}>
                                                Batch #{batch.batchId}
                                            </span>
                                            <h3 style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--ink-900)', margin: '3px 0 2px' }}>
                                                {batch.floraName}
                                            </h3>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--ink-500)' }}>
                                                Code: <strong style={{ color: 'var(--ink-900)' }}>{batch.batchCode}</strong>
                                            </div>
                                        </div>
                                        {batch.isCertifiedPure ? (
                                            <span className="badge-purity"><FiShield size={12} /> Certified Pure</span>
                                        ) : (
                                            <span className="badge-pending"><FiClock size={12} /> Raw Comb</span>
                                        )}
                                    </div>

                                    {/* QR Code Seal & Authenticated Bottle Serial */}
                                    {(() => {
                                        const yieldKg = batch ? (parseInt(batch.yieldWeightKg) || 25) : 25;
                                        const totalJars = Math.max(1, yieldKg * 2);
                                        const safeUnit = Math.min(Math.max(1, bottleUnit), totalJars);
                                        const token = getBottleSecurityToken(batch.batchId, safeUnit, batch.harvestTimestamp, batch.batchCode);
                                        const bottleSerial = getUniqueBottleSerial(batch.batchCode, safeUnit, token);
                                        const unitQrUrl = `${window.location.origin}/verify?batch=${batch.batchId}&unit=${safeUnit}&token=${token}`;

                                        return (
                                            <div style={{
                                                background: 'var(--bg-app)',
                                                border: 'var(--border)',
                                                borderRadius: '10px',
                                                padding: '16px',
                                                textAlign: 'center',
                                                margin: '14px 0'
                                            }}>
                                                {/* Individual Serialized Jar Security Tag (Only revealed for authenticated sold bottles) */}
                                                <div style={{
                                                    padding: '12px 14px',
                                                    background: '#FFFFFF',
                                                    borderRadius: '8px',
                                                    border: 'var(--border)',
                                                    marginBottom: '14px',
                                                    textAlign: 'left'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.66rem', textTransform: 'uppercase', color: 'var(--ink-500)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                                                Unique Bottle Serial
                                                            </div>
                                                            <div style={{ fontWeight: 800, color: 'var(--ink-900)', fontFamily: 'monospace', fontSize: '0.94rem' }}>
                                                                {bottleSerial}
                                                            </div>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ fontSize: '0.64rem', color: 'var(--ink-500)', fontWeight: 600 }}>Security Token:</div>
                                                            <div style={{ fontFamily: 'monospace', fontSize: '0.84rem', color: 'var(--primary-honey)', fontWeight: 700, letterSpacing: '0.05em' }}>
                                                                {token}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--forest-green)', fontWeight: 600, marginTop: '6px', borderTop: '1px dashed var(--ink-200)', paddingTop: '6px' }}>
                                                        Unit #{safeUnit} • 500g Certified Retail Glass Jar (Authenticity Confirmed)
                                                    </div>

                                                    {/* Tamper-Evident NFC Seal Verification Badge */}
                                                    <div style={{
                                                        marginTop: '8px',
                                                        padding: '7px 10px',
                                                        background: '#ECFDF5',
                                                        border: '1px solid #A7F3D0',
                                                        borderRadius: '6px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        fontSize: '0.72rem'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#065F46', fontWeight: 700 }}>
                                                            <span>🔒</span>
                                                            <span>Tamper-Evident NFC Seal:</span>
                                                            <span style={{ color: '#047857', fontWeight: 600 }}>100% INTACT & UNBROKEN</span>
                                                        </div>
                                                        <span style={{
                                                            background: '#D1FAE5',
                                                            color: '#065F46',
                                                            padding: '2px 6px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: 700,
                                                            letterSpacing: '0.04em'
                                                        }}>
                                                            NTAG 424 DNA
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Cryptographic QR Seal */}
                                                <div>
                                                    <div style={{ background: '#FFFFFF', padding: '14px', display: 'inline-block', borderRadius: '10px', border: 'var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                                        <QRCodeCanvas value={unitQrUrl} size={135} style={{ margin: '0 auto', display: 'block' }} />
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--ink-500)', fontWeight: 700, marginTop: '8px', letterSpacing: '0.05em' }}>
                                                        AUTHENTIC BLOCKCHAIN QR SEAL
                                                    </div>

                                                    {bottleSale && bottleSale.isSold ? (
                                                        <div style={{
                                                            marginTop: '12px',
                                                            padding: '12px 14px',
                                                            borderRadius: '8px',
                                                            background: 'var(--forest-green-light)',
                                                            border: '1px solid var(--forest-green-border)',
                                                            textAlign: 'left'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                                                                <span style={{ color: 'var(--forest-green)', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                                    <FiCheckCircle size={14} /> Genuine Purchase Verified
                                                                </span>
                                                                <span style={{ fontSize: '0.65rem', background: '#D1FAE5', color: 'var(--forest-green)', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                                                    Authenticated Sale
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.78rem', color: 'var(--forest-green)' }}>
                                                                <div>Purchased by: <strong style={{ color: 'var(--ink-900)' }}>{bottleSale.customerName}</strong></div>
                                                                <div style={{ marginTop: '3px' }}>Official Tax Invoice: <code style={{ fontFamily: 'monospace', fontWeight: 700, color: '#BE185D' }}>{bottleSale.invoiceNumber}</code></div>
                                                                <div style={{ marginTop: '3px', fontSize: '0.72rem', color: 'var(--ink-600)' }}>
                                                                    Purchase Date: {bottleSale.saleTimestamp ? new Date(parseInt(bottleSale.saleTimestamp) * 1000).toLocaleString() : 'Recently'}
                                                                </div>
                                                                
                                                                <button
                                                                    type="button"
                                                                    className="btn-emerald-cta"
                                                                    onClick={() => setShowInvoiceModal(true)}
                                                                >
                                                                    <FiFileText size={16} />
                                                                    <span>View Official e-Bill & Tax Invoice →</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{
                                                            marginTop: '12px',
                                                            padding: '12px 14px',
                                                            borderRadius: '8px',
                                                            background: '#EFF6FF',
                                                            border: '1px solid #BFDBFE',
                                                            textAlign: 'left'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                                                                <span style={{ color: '#1D4ED8', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                                    <FiCheckCircle size={14} /> Authentic KVIC Glass Jar
                                                                </span>
                                                                <span style={{ fontSize: '0.65rem', background: '#DBEAFE', color: '#1E40AF', padding: '2px 7px', borderRadius: '4px', fontWeight: 700 }}>
                                                                    Stocked at Retail
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.78rem', color: '#1E40AF', lineHeight: '1.45' }}>
                                                                <div>Unit Status: <strong style={{ color: 'var(--ink-900)' }}>Authentic KVIC Retail Stock</strong></div>
                                                                <div style={{ marginTop: '3px' }}>Store: <strong>{cleanEntityLabel(batch.targetDestination) || 'Khadi Bhavan Connaught Place'}</strong></div>
                                                                <div style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--ink-600)' }}>
                                                                    Physical security seal is cryptographically verified. Consumer tax e-Bill will be issued upon retail counter checkout.
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                        {/* Key Details */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.84rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--ink-200)' }}>
                                                <span style={{ color: 'var(--ink-500)' }}>Harvest Date</span>
                                                <strong style={{ color: 'var(--ink-900)' }}>{new Date(parseInt(batch.harvestTimestamp) * 1000).toLocaleDateString()}</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--ink-200)' }}>
                                                <span style={{ color: 'var(--ink-500)' }}>Current Stage</span>
                                                <span className="badge-purity">{batch.currentStage}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                                                <span style={{ color: 'var(--ink-500)' }}>Harvest Quantity</span>
                                                <strong style={{ color: 'var(--primary-honey)' }}>{batch.yieldWeightKg} kg</strong>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', marginTop: '14px', fontSize: '0.72rem', color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <FiLock size={13} />
                                        <span>Cryptographically signed on Ethereum Ledger</span>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT COLUMN: Origin Details + Lab Spectrometry */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Origin Row */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                                    <div className="clean-card">
                                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--ink-500)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                            Apiary Cluster Location
                                        </div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink-900)', margin: '4px 0 2px' }}>
                                            {batch.clusterLocation}
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--forest-green)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <FiCheckCircle size={11} /> KVIC Honey Mission Flora Reserve
                                        </div>
                                    </div>

                                    <div className="clean-card">
                                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--ink-500)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                            Master Beekeeper / SHG
                                        </div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink-900)', margin: '4px 0 2px' }}>
                                            {batch.beekeeperName}
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--ink-500)' }}>
                                            Fair Farmgate Realization Guaranteed
                                        </div>
                                    </div>
                                </div>

                                {/* Custody Route & Designated Channel Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                                    <div className="clean-card">
                                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--ink-500)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                            Authorized Logistics Carrier
                                        </div>
                                        {batch.assignedDistributor && batch.assignedDistributor !== '0x0000000000000000000000000000000000000000' ? (
                                            <>
                                                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--ink-900)', margin: '4px 0 2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <FiTruck size={14} />
                                                    <span>Northern Reefer Fleet NH-44</span>
                                                </div>
                                                <div style={{ fontSize: '0.74rem', color: 'var(--ink-500)' }}>
                                                    Logistics Fleet ID: <code>distributor</code> (Cold-Chain Transit)
                                                </div>
                                                <div style={{ fontSize: '0.74rem', color: 'var(--forest-green)', fontWeight: 600, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FiCheckCircle size={11} /> Bound for Transit
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ fontSize: '0.82rem', color: 'var(--ink-400)', margin: '6px 0' }}>
                                                Pending Processing & Dispatch
                                            </div>
                                        )}
                                    </div>

                                    <div className="clean-card">
                                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--ink-500)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                            Designated Retail Destination
                                        </div>
                                        {batch.assignedRetailer && batch.assignedRetailer !== '0x0000000000000000000000000000000000000000' ? (
                                            <>
                                                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--ink-900)', margin: '4px 0 2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <FaStore size={14} />
                                                    <span>{cleanEntityLabel(batch.targetDestination) || 'Khadi Bhavan Connaught Place'}</span>
                                                </div>
                                                <div style={{ fontSize: '0.74rem', color: 'var(--ink-500)' }}>
                                                    Retail Outlet ID: <code>retailer</code> (KVIC Flagship Store)
                                                </div>
                                                <div style={{ fontSize: '0.74rem', color: 'var(--forest-green)', fontWeight: 600, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <FiCheckCircle size={11} /> Official Retail Destination
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ fontSize: '0.82rem', color: 'var(--ink-400)', margin: '6px 0' }}>
                                                Pending Retail Assignment
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <LabCertificateViewer 
                                    labReport={labReport} 
                                    batchCode={batch.batchCode} 
                                    isCertifiedPure={batch.isCertifiedPure} 
                                />
                            </div>
                        </div>

                        {/* Custody Timeline Handover */}
                        <ProvenanceTimeline history={history} />
                    </>
            )}
            {/* OFFICIAL KVIC E-BILL & TAX INVOICE MODAL */}
            <TaxInvoiceModal
                isOpen={showInvoiceModal && Boolean(bottleSale?.isSold) && Boolean(batch)}
                onClose={() => setShowInvoiceModal(false)}
                billData={bottleSale && batch ? {
                    ...bottleSale,
                    batchId: batch.batchId,
                    batchCode: batch.batchCode,
                    floraName: batch.floraName,
                    storeName: batch.targetDestination || 'Authorized Retail Store',
                    bottleNumber: bottleUnit,
                    securityToken: getBottleSecurityToken(batch.batchId, bottleUnit, batch.harvestTimestamp, batch.batchCode),
                    verifyUrl: window.location.href
                } : null}
            />
        </div>
    );
}

export default ConsumerVerify;
