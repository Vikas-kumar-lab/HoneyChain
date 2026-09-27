import React, { useState, useEffect } from 'react';
import { 
    getContractInstance, 
    checkIsAdmin, 
    executeBlockchainRelayer,
    cachedCall,
    resolveEnterpriseAddress,
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
    FiCheck,
    FiCheckCircle, 
    FiAlertCircle, 
    FiAlertTriangle,
    FiTruck, 
    FiShield,
    FiLock,
    FiX,
    FiPackage,
    FiInbox,
    FiZap,
    FiRadio
} from 'react-icons/fi';
import { FaFlask } from 'react-icons/fa';
import { PipelineStageStepper, NFCCustodyAuditModal } from '../components';
import BatchHandoffQRSheet from '../components/pipeline/BatchHandoffQRSheet';
import { fetchAuthorizedEntities, getEntityFriendlyName } from '../entityRegistry';
import { getBottleSecurityToken, getUniqueBottleSerial } from '../bottleSecurity';
import { captureDeviceCoordinates, formatCoordinates, REGIONAL_FALLBACK_COORDINATES } from '../geoUtils';
import { API_BASE_URL } from '../config';

const KVIC_ADMIN_ADDR = '0x556FCE98dC5b75C5097eEf0581BC17f771944EbB';

const getFormattedCoordinates = (coords, fallbackStage) => {
    let c = coords;
    if (!c && fallbackStage !== undefined) {
        const stageKeys = ['BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER'];
        const key = stageKeys[Number(fallbackStage)];
        if (key && REGIONAL_FALLBACK_COORDINATES[key]) {
            c = REGIONAL_FALLBACK_COORDINATES[key];
        }
    }
    if (!c) return null;
    if (typeof c === 'string') return c;
    if (c.formatted) return c.formatted;

    const lat = c.lat !== undefined ? c.lat : c.latitude;
    const lng = c.lng !== undefined ? c.lng : c.longitude;
    if (lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
        return formatCoordinates(lat, lng);
    }
    return null;
};

const getDeviceSource = (coords) => {
    if (!coords) return 'Device GPS';
    if (coords.deviceSource) return coords.deviceSource;
    if (coords.isLiveGPS) return 'Live Device GPS';
    return 'Device GPS';
};

function SupplyPipeline() {
    const { roleInfo, account: authAccount, currentUser } = useAuth();
    const userRoleTypes = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
    const isAdminInit = userRoleTypes.includes('ADMIN') || 
        Boolean(authAccount && authAccount.toLowerCase() === KVIC_ADMIN_ADDR);

    const [account, setAccount] = useState(authAccount || '');
    const [contract, setContract] = useState(null);
    const [readContract, setReadContract] = useState(null);
    const initialBatches = getStoredBatches();
    const [batches, setBatches] = useState(initialBatches);
    const [selectedBatchId, setSelectedBatchId] = useState(initialBatches[0]?.batchId || '');
    const [batchHistory, setBatchHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState(null);

    // Form inputs (dynamic entity dropdowns & custody binding)
    const [processorLocation, setProcessorLocation] = useState('KVIC Honey Processing & Micro-Filtration Plant, Srinagar, J&K');
    const [selectedDistributorAddr, setSelectedDistributorAddr] = useState('');
    const [selectedRetailerAddr, setSelectedRetailerAddr] = useState('');
    const [targetDestinationText, setTargetDestinationText] = useState('');
    const [transitRoute, setTransitRoute] = useState('Route NH-44: Srinagar - Jammu - Delhi (Temperature-Controlled Fleet #DL-1A-9821)');
    const [retailStore, setRetailStore] = useState('');

    const [authorizedDistributorsList, setAuthorizedDistributorsList] = useState([]);
    const [authorizedRetailersList, setAuthorizedRetailersList] = useState([]);
    const [isCustomDistributor, setIsCustomDistributor] = useState(false);
    const [isCustomRetailer, setIsCustomRetailer] = useState(false);

    const [userRoles, setUserRoles] = useState({
        isAdmin: isAdminInit,
        isProcessor: userRoleTypes.includes('PROCESSOR'),
        isDistributor: userRoleTypes.includes('DISTRIBUTOR'),
        isRetailer: userRoleTypes.includes('RETAILER')
    });

    useEffect(() => {
        const types = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
        const isAdm = types.includes('ADMIN') || 
            Boolean(authAccount && authAccount.toLowerCase() === KVIC_ADMIN_ADDR);
        setUserRoles({
            isAdmin: isAdm,
            isProcessor: types.includes('PROCESSOR'),
            isDistributor: types.includes('DISTRIBUTOR'),
            isRetailer: types.includes('RETAILER')
        });
    }, [roleInfo, authAccount]);

    // Inward Desk State for Step 5 (Simplified: 1. Code Inward, 2. Bulk Inward)
    const [inwardCodeInput, setInwardCodeInput] = useState('');
    const [scannedInwardBottles, setScannedInwardBottles] = useState({});
    const [inwardFeedback, setInwardFeedback] = useState(null);

    // Tamper-Evident NFC Gatekeeper Audit & Live GPS Tracking State
    const [auditModalConfig, setAuditModalConfig] = useState({
        isOpen: false,
        batch: null,
        fromActor: '',
        toActor: '',
        actionType: '',
        onAuditPass: null,
        onAuditReject: null
    });
    const [custodyBreachAlert, setCustodyBreachAlert] = useState(null);
    const [qrSheetData, setQrSheetData] = useState(null);

    useEffect(() => {
        init();
        fetch(`${API_BASE_URL}/api/pos/inward-bottles`)
            .then(r => r.json())
            .then(data => {
                if (data?.success && data?.inwardedBottles) {
                    setScannedInwardBottles(prev => ({ ...data.inwardedBottles, ...prev }));
                    Object.entries(data.inwardedBottles).forEach(([bId, arr]) => {
                        try {
                            localStorage.setItem(`honeychain_inwarded_${bId}`, JSON.stringify(arr));
                        } catch (_) {}
                    });
                }
            })
            .catch(() => {});
        const handleDirectoryUpdate = () => {
            if (readContract || contract) {
                loadEntities(readContract || contract);
            }
        };
        window.addEventListener('honeychain_directory_updated', handleDirectoryUpdate);
        window.addEventListener('honeychain_applications_updated', handleDirectoryUpdate);
        window.addEventListener('honeychain_role_changed', handleDirectoryUpdate);
        window.addEventListener('storage', handleDirectoryUpdate);
        return () => {
            window.removeEventListener('honeychain_directory_updated', handleDirectoryUpdate);
            window.removeEventListener('honeychain_applications_updated', handleDirectoryUpdate);
            window.removeEventListener('honeychain_role_changed', handleDirectoryUpdate);
            window.removeEventListener('storage', handleDirectoryUpdate);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    const checkRoles = async (c, userAddr) => {
        if (!c || !userAddr) return;
        try {
            const cleanAddr = userAddr.toLowerCase().trim();
            const [isAdminOnChain, isProc, isDist, isRet] = await Promise.all([
                checkIsAdmin(c, cleanAddr),
                c.methods.authorizedProcessors(cleanAddr).call().catch(() => false),
                c.methods.authorizedDistributors(cleanAddr).call().catch(() => false),
                c.methods.authorizedRetailers(cleanAddr).call().catch(() => false)
            ]);
            const isAdm = Boolean(isAdminOnChain);
            setUserRoles({
                isAdmin: isAdm,
                isProcessor: Boolean(isProc),
                isDistributor: Boolean(isDist),
                isRetailer: Boolean(isRet)
            });
        } catch (e) {
            console.log("Check roles error in pipeline:", e);
        }
    };

    const loadEntities = async (c) => {
        try {
            const ents = await fetchAuthorizedEntities(c);
            const dedupe = (list) => {
                const map = new Map();
                (list || []).forEach(item => {
                    const cleanName = (item.name || item.orgName || '').toLowerCase().trim();
                    const cleanAddr = (item.address || '').toLowerCase().trim();
                    const k = (cleanName && !cleanName.startsWith('0x') && !cleanName.includes('...')) ? cleanName : cleanAddr;
                    if (k && !map.has(k)) {
                        map.set(k, item);
                    } else if (k && map.has(k)) {
                        const existing = map.get(k);
                        if (!existing.isOnChain && item.isOnChain) {
                            map.set(k, item);
                        }
                    }
                });
                return Array.from(map.values());
            };
            const dists = dedupe(ents.distributors || []);
            const rets = dedupe(ents.retailers || []);
            setAuthorizedDistributorsList(dists);
            setAuthorizedRetailersList(rets);

            if (dists.length > 0) {
                setSelectedDistributorAddr(prev => {
                    if (!prev || prev === '__CUSTOM__') return dists[0].address;
                    return prev;
                });
            }

            if (rets.length > 0) {
                setSelectedRetailerAddr(prev => {
                    if (!prev || prev === '__CUSTOM__') return rets[0].address;
                    return prev;
                });
                setTargetDestinationText(prev => prev || rets[0].name);
                setRetailStore(prev => prev || rets[0].name);
            }
        } catch (e) {
            console.warn("Could not load authorized entities:", e);
        }
    };

    const init = async () => {
        try {
            const { readContract: rContract, writeContract, userAccount } = await getContractInstance();
            const activeUser = userAccount || (window.ethereum && window.ethereum.selectedAddress) || '';
            if (activeUser) setAccount(activeUser);
            setContract(writeContract);
            setReadContract(rContract);

            if (window.ethereum) {
                window.ethereum.on('accountsChanged', async (accs) => {
                    const newAcc = accs[0] || '';
                    setAccount(newAcc);
                    if (rContract) {
                        await checkRoles(rContract, newAcc);
                        await loadBatches(rContract);
                        await loadEntities(rContract);
                    }
                });
            }

            await Promise.all([
                loadBatches(rContract),
                loadEntities(rContract),
                activeUser ? checkRoles(rContract, activeUser) : Promise.resolve()
            ]);
        } catch (e) {
            console.log("Pipeline init error:", e);
        }
    };

    const loadBatches = async (c) => {
        try {
            const list = await cachedCall(async () => {
                // Use null sentinel: null = call FAILED, 0 = genuinely no batches
                const rawCount = await c.methods.batchCount().call().catch(() => null);
                if (rawCount === null) return null; // RPC failed — preserve localStorage
                const count = parseInt(rawCount);
                if (!count || count === 0) return [];
                const promises = Array.from({ length: count }, (_, idx) => {
                    const i = idx + 1;
                    return Promise.all([
                        c.methods.getBatchBasic(i).call(),
                        c.methods.getBatchStatus(i).call(),
                        c.methods.getBatchCustody(i).call().catch(() => ({ assignedDistributor: '', assignedRetailer: '', targetDestination: '' }))
                    ]).then(([basic, status, custody]) => ({ ...basic, ...status, ...custody })).catch(() => null);
                });
                const rawList = await Promise.all(promises);
                return rawList.filter(Boolean);
            }, 'pipeline_batches', 1500);

            const serverBatches = await fetchBatchesFromServer().catch(() => []);
            const stored = (serverBatches && serverBatches.length > 0) ? serverBatches : getStoredBatches();
            const map = new Map();
            (list || []).forEach(b => {
                const k = (b.batchCode || b.batchId || '').toString().toUpperCase();
                if (k) {
                    const localMatch = stored.find(s => (s.batchCode || s.batchId || '').toString().toUpperCase() === k);
                    map.set(k, {
                        ...(localMatch || {}),
                        ...b,
                        isFlagged: (localMatch?.isFlagged !== undefined ? localMatch.isFlagged : b.isFlagged),
                        flagReason: localMatch?.flagReason || b.flagReason,
                        currentStage: localMatch?.isFlagged ? (localMatch.currentStage || 'Quarantined / Rejected') : b.currentStage,
                        distributorRejected: localMatch?.distributorRejected || false,
                        retailerRejected: localMatch?.retailerRejected || false,
                        brokenJarId: localMatch?.brokenJarId || null,
                        liableParty: localMatch?.liableParty || null,
                        history: (localMatch?.history && localMatch.history.length > 0) ? localMatch.history : (b.history || [])
                    });
                }
            });
            stored.forEach(b => {
                const k = (b.batchCode || b.batchId || '').toString().toUpperCase();
                if (!map.has(k)) map.set(k, b);
            });
            const merged = Array.from(map.values()).sort((a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0));
            setBatches(merged);
            if (merged.length > 0) {
                saveStoredBatches(merged);
                const activeId = selectedBatchId || merged[0].batchId;
                if (!selectedBatchId) setSelectedBatchId(merged[0].batchId);
                loadHistory(c, activeId, merged.find(b => String(b.batchId) === String(activeId)));
            } else {
                saveStoredBatches([]);
                setSelectedBatchId('');
            }
        } catch (e) {
            // Any exception: preserve existing localStorage data
            console.log("Error loading batches for pipeline:", e);
            const stored = getStoredBatches();
            if (stored.length > 0) {
                const sorted = [...stored].sort((a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0));
                setBatches(sorted);
                if (!selectedBatchId) setSelectedBatchId(sorted[0].batchId);
            }
        }
    };

    const loadHistory = async (c, id, batchObj = null) => {
        const target = batchObj || batches.find(b => String(b.batchId) === String(id));
        let onChainHist = [];
        if (c && c.methods && c.methods.getBatchHistory && id) {
            try {
                const res = await c.methods.getBatchHistory(id).call();
                if (Array.isArray(res) && res.length > 0) {
                    onChainHist = res;
                }
            } catch (e) {}
        }

        if (onChainHist.length > 0) {
            if (target && Array.isArray(target.history) && target.history.length > 0) {
                const enriched = onChainHist.map((ev) => {
                    const localMatch = target.history.find(h => Number(h.stage) === Number(ev.stage));
                    const isStageMatch = localMatch && Number(localMatch.stage) === Number(ev.stage);
                    return {
                        ...ev,
                        coordinates: (isStageMatch && localMatch.coordinates) || ev.coordinates || null,
                        sealAudit: (isStageMatch && Number(ev.stage) >= 2 && localMatch.sealAudit) || (Number(ev.stage) >= 2 ? ev.sealAudit : null)
                    };
                });
                setBatchHistory(enriched);
                return;
            }
            setBatchHistory(onChainHist);
            return;
        }

        // Fallback: If on-chain query returned empty, build full verifiable custody audit trail from batch history & milestones
        if (target) {
            if (Array.isArray(target.history) && target.history.length > 0) {
                setBatchHistory(target.history);
                return;
            }

            // Synthesize custody audit trail from batch milestones
            const synth = [];
            if (target.harvestTimestamp) {
                synth.push({
                    timestamp: target.harvestTimestamp,
                    stage: 0,
                    stageName: 'Harvested',
                    actor: target.beekeeperName || 'Registered Beekeeper',
                    location: target.clusterLocation || 'Apiary Colony',
                    notes: `Extracted ${target.yieldWeightKg || 25}kg raw comb honey (${target.floraName || 'Floral Honey'})`
                });
            }
            if (target.isCertifiedPure || target.labReport) {
                const labTime = target.labReport?.testTimestamp || (parseInt(target.harvestTimestamp || Date.now() / 1000) + 3600);
                synth.push({
                    timestamp: labTime,
                    stage: 1,
                    stageName: 'QualityTested',
                    actor: target.labReport?.labCertHash ? `Lab Cert: ${target.labReport.labCertHash.slice(0, 10)}...` : 'KVIC Quality Testing Lab',
                    location: 'KVIC Central Quality Testing Lab',
                    notes: target.isFlagged 
                        ? `Quarantined: ${target.flagReason || 'Purity violation detected'}` 
                        : `Certified Pure: Moisture ${(target.labReport?.moisturePercentX100 || 1850) / 100}%, C4 Sugar ${(target.labReport?.c4SugarPercentX100 || 120) / 100}%, Pollen Score ${target.labReport?.pollenPurityScore || 95}%`
                });
            }
            if (target.assignedDistributor || target.jarsTotal || target.stageIdx >= 2) {
                const procTime = parseInt(target.harvestTimestamp || Date.now() / 1000) + 7200;
                synth.push({
                    timestamp: procTime,
                    stage: 2,
                    stageName: 'Processed and Packaged',
                    actor: getEntityFriendlyName(target.assignedDistributor, 'DISTRIBUTOR') || 'Processing Unit',
                    location: target.targetDestination || 'KVIC Honey Processing Plant',
                    notes: `Micro-filtered & packaged into ${target.jarsTotal || 50} sealed retail jars (500g). Consigned to distributor.`
                });
            }
            if (target.currentStage === 'In Transit / Logistics' || target.stageIdx >= 3) {
                const transitTime = parseInt(target.harvestTimestamp || Date.now() / 1000) + 14400;
                synth.push({
                    timestamp: transitTime,
                    stage: 3,
                    stageName: 'In Transit',
                    actor: getEntityFriendlyName(target.assignedDistributor, 'DISTRIBUTOR') || 'Reefer Cold-Chain Fleet',
                    location: target.transitRoute || 'Cold-Chain Reefer Corridor',
                    notes: `Cold-chain transit active. Temperature monitored (<22°C). GPS Route tracking active.`
                });
            }
            if (target.currentStage === 'Stocked at Retail' || target.stageIdx >= 4) {
                const retailTime = parseInt(target.harvestTimestamp || Date.now() / 1000) + 28800;
                synth.push({
                    timestamp: retailTime,
                    stage: 4,
                    stageName: 'At Retail',
                    actor: getEntityFriendlyName(target.assignedRetailer, 'RETAILER') || 'KVIC Retail Store',
                    location: target.targetDestination || 'KVIC Khadi Gramodyog Bhavan',
                    notes: `Consignment inwarded into inventory. Tamper-evident seals and cryptographic security PINs verified.`
                });
            }
            setBatchHistory(synth);
        } else {
            setBatchHistory([]);
        }
    };

    const handleSelectBatch = (id) => {
        setSelectedBatchId(id);
        const target = batches.find(b => String(b.batchId) === String(id));
        if (target) {
            if (target.assignedDistributor && target.assignedDistributor !== '0x0000000000000000000000000000000000000000') {
                setSelectedDistributorAddr(target.assignedDistributor);
                setIsCustomDistributor(false);
            }
            if (target.assignedRetailer && target.assignedRetailer !== '0x0000000000000000000000000000000000000000') {
                setSelectedRetailerAddr(target.assignedRetailer);
                setIsCustomRetailer(false);
            }
            if (target.targetDestination) {
                setTargetDestinationText(target.targetDestination);
                setRetailStore(target.targetDestination);
            }
            loadHistory(readContract || contract, id, target);
        } else if (contract || readContract) {
            loadHistory(contract || readContract, id);
        }
    };

    const executeStageTransition = async (actionType, payload, successMessage) => {
        setLoading(true);
        setNotification({
            type: 'info',
            message: '⏳ Transmitting stage update to Blockchain Relayer Gateway...'
        });
        try {
            if (actionType === 'process-batch' && (!isProcessorRole || userRoleTypes.includes('ADMIN') || currentUser?.roleKey === 'ADMIN')) {
                throw new Error("Access Denied: Only certified Processor personnel can process and seal honey batches. Administrator role is limited to system audit.");
            }
            if (actionType === 'dispatch-batch' && (!isDistributorRole || userRoleTypes.includes('ADMIN') || currentUser?.roleKey === 'ADMIN')) {
                throw new Error("Access Denied: Only certified Logistics/Fleet Distributor personnel can dispatch shipments. Administrator role is limited to system audit.");
            }
            if (actionType === 'stock-batch' && (!isRetailerRole || userRoleTypes.includes('ADMIN') || currentUser?.roleKey === 'ADMIN')) {
                throw new Error("Access Denied: Only certified Retail Store personnel can inward and stock shipments. Administrator role is limited to system audit.");
            }

            const res = await executeBlockchainRelayer(actionType, payload);

            let stageUpdates = {};
            if (actionType === 'process-batch') {
                let procCoordinates = payload.coordinates;
                if (!procCoordinates) {
                    try {
                        procCoordinates = await captureDeviceCoordinates('PROCESSOR');
                    } catch (e) {
                        console.warn("Processor GPS capture fallback:", e);
                    }
                }
                const totalUnits = parseInt(payload.jarsTotal) || 50;
                stageUpdates = {
                    stageIdx: 2,
                    currentStage: 'Processed and Packaged',
                    stageName: 'Processed and Packaged',
                    assignedDistributor: payload.assignedDistributor,
                    assignedRetailer: payload.assignedRetailer,
                    targetDestination: payload.targetDestination,
                    jarsTotal: totalUnits,
                    coordinates: procCoordinates,
                    historyEvent: {
                        stage: 2,
                        stageName: 'Processed and Packaged',
                        actor: account || currentUser?.address || 'Processing Facility',
                        location: payload.facilityLocation || payload.processorLocation || 'KVIC Honey Processing Plant',
                        timestamp: Math.floor(Date.now() / 1000),
                        notes: `Moisture reduction (<20%) completed. Sealed into ${totalUnits} retail jars (500g). Tamper-evident NTAG 424 NFC seals applied. Consigned to distributor.`,
                        coordinates: procCoordinates,
                        sealAudit: {
                            status: 'SEALED_INTACT',
                            verifiedCount: totalUnits,
                            totalJars: totalUnits,
                            tamperedCount: 0,
                            auditedBy: 'KVIC Processing Line QA',
                            timestamp: Math.floor(Date.now() / 1000)
                        }
                    }
                };
            } else if (actionType === 'dispatch-batch') {
                let distCoordinates = payload.coordinates;
                if (!distCoordinates) {
                    try {
                        distCoordinates = await captureDeviceCoordinates('DISTRIBUTOR');
                    } catch (e) {
                        console.warn("Distributor GPS capture fallback:", e);
                    }
                }
                stageUpdates = {
                    stageIdx: 3,
                    currentStage: 'In Transit / Logistics',
                    stageName: 'In Transit / Logistics',
                    transitRoute: payload.transitRoute,
                    coordinates: distCoordinates,
                    historyEvent: {
                        stage: 3,
                        stageName: 'In Transit',
                        actor: account || currentUser?.address || 'Cold-Chain Fleet Logistics',
                        location: payload.transitRoute || 'Cold-Chain Reefer Corridor',
                        timestamp: Math.floor(Date.now() / 1000),
                        notes: `Reefer cold-chain transit dispatched. Handover audit: ${payload.sealAudit?.verifiedCount || 50}/${payload.sealAudit?.totalJars || 50} NFC seals verified intact. IoT temperature monitoring active (<22°C). GPS route logged.`,
                        coordinates: distCoordinates,
                        sealAudit: payload.sealAudit || {
                            status: 'SEALED_INTACT',
                            verifiedCount: 50,
                            totalJars: 50,
                            tamperedCount: 0,
                            auditedBy: 'Distributor Fleet Inward Inspection'
                        }
                    }
                };
            } else if (actionType === 'stock-retail') {
                let retCoordinates = payload.coordinates;
                if (!retCoordinates) {
                    try {
                        retCoordinates = await captureDeviceCoordinates('RETAILER');
                    } catch (e) {
                        console.warn("Retailer GPS capture fallback:", e);
                    }
                }
                stageUpdates = {
                    stageIdx: 4,
                    currentStage: 'Stocked at Retail',
                    stageName: 'Stocked at Retail',
                    storeLocation: payload.storeLocation,
                    coordinates: retCoordinates,
                    historyEvent: {
                        stage: 4,
                        stageName: 'At Retail',
                        actor: account || currentUser?.address || 'KVIC Retail Store Manager',
                        location: payload.storeLocation || 'KVIC Khadi Gramodyog Bhavan',
                        timestamp: Math.floor(Date.now() / 1000),
                        notes: `Consignment inwarded into inventory. Gatekeeper NFC seal audit passed (${payload.sealAudit?.verifiedCount || 50}/${payload.sealAudit?.totalJars || 50} verified intact). Cryptographic security PINs registered.`,
                        coordinates: retCoordinates,
                        sealAudit: payload.sealAudit || {
                            status: 'SEALED_INTACT',
                            verifiedCount: 50,
                            totalJars: 50,
                            tamperedCount: 0,
                            auditedBy: 'Retail Receiving Desk Inspection'
                        }
                    }
                };
            }
            if (Object.keys(stageUpdates).length > 0) {
                updateStoredBatchStage(selectedBatchId, stageUpdates);
                setBatches(prev => prev.map(b => String(b.batchId) === String(selectedBatchId) ? { ...b, ...stageUpdates } : b));
            }

            setNotification({ 
                type: 'success', 
                message: `${successMessage} (Block #${res.blockNumber || 'Live'}, Tx: ${res.transactionHash ? res.transactionHash.slice(0, 10) + '...' : 'Confirmed'})` 
            });
            invalidateContractCache();
            window.dispatchEvent(new Event('honeychain_batch_updated'));
            const { readContract: rContract } = await getContractInstance();
            await loadBatches(rContract);
            await loadHistory(rContract, selectedBatchId);
        } catch (err) {
            console.error("Stage transition error:", err);
            setNotification({
                type: 'danger',
                message: "Action failed: " + (err.message || "Ensure prerequisites are met.")
            });
        } finally {
            setLoading(false);
        }
    };

    // Step 5 Inward Verification & Anti-Counterfeit Handlers (Only 2 options: One-by-one & Inward All)
    const getBatchInwardedList = (bId, totalJarsCount, stageIdx) => {
        try {
            const raw = localStorage.getItem(`honeychain_inwarded_${bId}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (e) {}
        return [];
    };

    const handleInwardSingleBottle = async (targetBatch, rawInput, totalJarsCount, isAllowedRetailer, assignedStoreLabel) => {
        if (!rawInput || !rawInput.trim()) return;
        const trimmed = rawInput.trim();
        setInwardFeedback(null);

        const bId = targetBatch?.batchId || selectedBatchId;
        const bCode = targetBatch?.batchCode || 'HONEY';
        const hTime = targetBatch?.harvestTimestamp || 0;
        const total = totalJarsCount || 50;

        let bottleNum = null;
        let matchedPin = '';

        // 1. Authenticate against cryptographic Security PIN or Serial
        const cleanUpper = trimmed.toUpperCase().replace(/\s+/g, '');
        const stripped = cleanUpper.replace(/-/g, '');

        for (let u = 1; u <= total; u++) {
            const token = getBottleSecurityToken(bId, u, hTime, bCode);
            const serial = getUniqueBottleSerial(bCode, u, token);
            const tokenStripped = token.replace(/-/g, '');
            const serialStripped = serial.replace(/-/g, '');

            if ([token, tokenStripped, serial, serialStripped].includes(cleanUpper) || stripped === tokenStripped) {
                bottleNum = u;
                matchedPin = token;
                break;
            }
        }

        // Explicitly reject plain numbers (e.g. "1", "2", "#1") to prevent cross-batch collisions
        if (/^#?\d+$/.test(trimmed)) {
            const samplePin = getBottleSecurityToken(bId, 1, hTime, bCode);
            setInwardFeedback({
                type: 'error',
                message: `Plain bottle number "${trimmed}" is not accepted for inwarding`,
                detail: `Plain numbers (1, 2, 3...) cause cross-batch collisions and cannot prove seal authenticity. Every physical jar has a unique 8-character Cryptographic Security PIN (e.g., "${samplePin}"). Enter the PIN or click [Inward Jar] on any bottle in the Consignment Grid below.`
            });
            return;
        }

        // 2. Fallback to jar serial barcode format (e.g. HONEY-8492-JAR-0001)
        if (!bottleNum) {
            const cleanUpperJar = trimmed.toUpperCase().replace(/\s+/g, '');
            for (let u = 1; u <= total; u++) {
                const jarCode = `${bCode}-JAR-${String(u).padStart(4, '0')}`;
                if (cleanUpperJar === jarCode || cleanUpperJar.includes(`JAR-${String(u).padStart(4, '0')}`) || cleanUpperJar.includes(`JAR-${u}`)) {
                    bottleNum = u;
                    matchedPin = getBottleSecurityToken(bId, u, hTime, bCode);
                    break;
                }
            }
        }

        if (!bottleNum || bottleNum < 1 || bottleNum > total) {
            // Check if this Security PIN or Serial belongs to ANOTHER batch in the blockchain ecosystem!
            let foreignMatch = null;
            const otherBatches = (batches || []).filter(b => String(b.batchId) !== String(bId));

            for (const ob of otherBatches) {
                const obTotal = parseInt(ob.jarsTotal) || (parseInt(ob.yieldWeightKg || 25) * 2) || 50;
                const obHTime = ob.harvestTimestamp || 0;
                const obCode = ob.batchCode || 'HONEY';

                for (let u = 1; u <= obTotal; u++) {
                    const obToken = getBottleSecurityToken(ob.batchId, u, obHTime, obCode);
                    const obSerial = getUniqueBottleSerial(obCode, u, obToken);
                    const obTokenStripped = obToken.replace(/-/g, '');
                    const obSerialStripped = obSerial.replace(/-/g, '');
                    const obJarSerial = `${obCode}-JAR-${String(u).padStart(4, '0')}`.toUpperCase();

                    if (
                        cleanUpper === obToken ||
                        stripped === obTokenStripped ||
                        cleanUpper === obSerial ||
                        stripped === obSerialStripped ||
                        cleanUpper === obJarSerial ||
                        cleanUpper.includes(`JAR-${String(u).padStart(4, '0')}`)
                    ) {
                        foreignMatch = {
                            batch: ob,
                            bottleNum: u,
                            token: obToken,
                            serial: obSerial
                        };
                        break;
                    }
                }
                if (foreignMatch) break;
            }

            if (foreignMatch) {
                const foreignStore = foreignMatch.batch.targetDestination || 
                    (foreignMatch.batch.assignedRetailer && foreignMatch.batch.assignedRetailer !== '0x0000000000000000000000000000000000000000'
                        ? getEntityFriendlyName(foreignMatch.batch.assignedRetailer, 'RETAILER') 
                        : 'Another Authorized Retailer');
                const foreignBatchCode = foreignMatch.batch.batchCode || `Batch #${foreignMatch.batch.batchId}`;
                const foreignStage = parseInt(foreignMatch.batch.currentStage !== undefined ? foreignMatch.batch.currentStage : (foreignMatch.batch.stageIdx !== undefined ? foreignMatch.batch.stageIdx : 0));
                const foreignInwardedList = getBatchInwardedList(foreignMatch.batch.batchId, foreignMatch.batch.jarsTotal || 50, foreignStage);
                const isAlreadyInwarded = foreignInwardedList.includes(foreignMatch.bottleNum) || foreignStage >= 4;

                setInwardFeedback({
                    type: 'error',
                    message: `Cross-Store Inventory Diversion Detected!`,
                    detail: `Bottle Security PIN "${trimmed}" (Jar #${foreignMatch.bottleNum}) belongs to ${foreignBatchCode}, which was assigned exclusively to "${foreignStore}"${isAlreadyInwarded ? ' and has already been inwarded into their store stock' : ''}! You cannot inward inventory assigned to another retail store.`
                });
                return;
            }

            setInwardFeedback({
                type: 'error',
                message: `Counterfeit / Unverified Code Rejection!`,
                detail: `Security code "${trimmed}" could not be authenticated against Batch #${bId} (${bCode}) or any authorized consignment. Verify the seal or click the bottle in the Consignment Grid below.`
            });
            return;
        }

        if (!isRetailerRole && !isAdminRole) {
            setInwardFeedback({
                type: 'error',
                message: `Unauthorized Role: Retail Store Only!`,
                detail: `Only certified Retail Store personnel or Administrators can inward bottles into store inventory.`
            });
            return;
        }

        // Check 1: Cross-store theft / unauthorized store rejection
        if (!isAllowedRetailer && !isAdminRole) {
            setInwardFeedback({
                type: 'error',
                message: `Theft / Cross-Store Rejection: Unauthorized Store!`,
                detail: `Bottle #${bottleNum} (${bCode}) is assigned exclusively to "${assignedStoreLabel}". Current store is UNAUTHORIZED to claim or inward this inventory!`
            });
            return;
        }

        // Check 2: Check if bottle has already been sold on blockchain!
        if (contract && contract.methods.getBottleSale) {
            try {
                const saleInfo = await contract.methods.getBottleSale(bId, bottleNum).call();
                if (saleInfo && (saleInfo.isSold || (saleInfo.bottleNumber && String(saleInfo.bottleNumber) !== '0'))) {
                    const saleDate = saleInfo.saleTimestamp && parseInt(saleInfo.saleTimestamp) > 0
                        ? new Date(parseInt(saleInfo.saleTimestamp) * 1000).toLocaleDateString()
                        : '';
                    setInwardFeedback({
                        type: 'error',
                        message: `Fraud Rejection: Bottle #${bottleNum} is already sold!`,
                        detail: `This bottle was already purchased on-chain by ${saleInfo.customerName || 'Consumer'} (Invoice: ${saleInfo.invoiceNumber || 'N/A'}${saleDate ? ` on ${saleDate}` : ''}). Cannot inward already sold or consumed inventory!`
                    });
                    return;
                }
            } catch (err) {
                console.warn("getBottleSale check error:", err);
            }
        }

        // Check 3: Check if already inwarded in store inventory
        const currentScanned = scannedInwardBottles[bId] !== undefined
            ? scannedInwardBottles[bId]
            : getBatchInwardedList(bId, total, currentStageIdx);

        if (currentScanned.includes(bottleNum)) {
            setInwardFeedback({
                type: 'warning',
                message: `Bottle #${bottleNum} (PIN: ${matchedPin}) is already inwarded.`,
                detail: `Current stock: ${currentScanned.length} of ${total} bottles inwarded.`
            });
            return;
        }

        // If batch on blockchain is still in transit (Stage 3), transition custody to store on-chain
        if (currentStageIdx === 3) {
            try {
                setLoading(true);
                const gps = await captureDeviceCoordinates('RETAILER');
                await executeStageTransition(
                    'stock-retail',
                    {
                        batchId: bId,
                        storeLocation: targetBatch?.targetDestination || currentBatch?.targetDestination || retailStore || 'Retail Store',
                        coordinates: gps,
                    },
                    `Batch #${bId} arrived at store. Retail custody established; inwarding started with Bottle #${bottleNum}.`
                );
            } catch (err) {
                console.warn("Stock transition notice:", err);
            } finally {
                setLoading(false);
            }
        }

        const updated = [...currentScanned, bottleNum].sort((a, b) => a - b);
        setScannedInwardBottles(prev => ({ ...prev, [bId]: updated }));
        try {
            localStorage.setItem(`honeychain_inwarded_${bId}`, JSON.stringify(updated));
            fetch(`${API_BASE_URL}/api/pos/inward-bottles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId: bId, inwardedBottles: updated })
            }).catch(() => {});
            invalidateContractCache();
            window.dispatchEvent(new Event('honeychain_batch_updated'));
        } catch (e) {}
        setInwardCodeInput('');

        setInwardFeedback({
            type: 'success',
            message: `Bottle #${bottleNum} (PIN: ${matchedPin}) Authenticated & Inwarded!`,
            detail: `Registered in active store shelf inventory (${updated.length} of ${total} bottles inwarded).`
        });
    };

    const handleInwardAllBottles = async (targetBatch, totalJarsCount, isAllowedRetailer, assignedStoreLabel) => {
        setInwardFeedback(null);
        const bId = targetBatch?.batchId || selectedBatchId;

        if (!isRetailerRole && !isAdminRole) {
            setInwardFeedback({
                type: 'error',
                message: `Unauthorized Role: Retail Store Only!`,
                detail: `Only certified Retail Store personnel or Administrators can inward bottles into store inventory.`
            });
            return;
        }

        // Check cross-store permission
        if (!isAllowedRetailer && !isAdminRole) {
            setInwardFeedback({
                type: 'error',
                message: `Cross-Store Rejection: Unauthorized Store!`,
                detail: `Entire shipment of ${totalJarsCount} bottles (${targetBatch?.batchCode || 'Batch'}) is consigned exclusively to "${assignedStoreLabel}". Current store is UNAUTHORIZED to inward it.`
            });
            return;
        }

        // Gatekeeper NFC Audit when accepting custody from transit fleet
        if (currentStageIdx === 3) {
            setCustodyBreachAlert(null);
            setAuditModalConfig({
                isOpen: true,
                batch: targetBatch || currentBatch,
                fromActor: targetBatch?.transitRoute || currentBatch?.transitRoute || 'Northern Reefer Fleet NH-44 (Logistics Carrier)',
                toActor: targetBatch?.targetDestination || currentBatch?.targetDestination || retailStore || 'KVIC Khadi Gramodyog Bhavan',
                actionType: 'retail',
                onAuditPass: async (auditReport) => {
                    setAuditModalConfig(prev => ({ ...prev, isOpen: false }));
                    setNotification({
                        type: 'info',
                        message: '📍 Capturing retailer GPS coordinates and recording verified custody on blockchain...'
                    });
                    const gps = await captureDeviceCoordinates('RETAILER');
                    await executeStageTransition(
                        'stock-retail',
                        {
                            batchId: bId,
                            storeLocation: targetBatch?.targetDestination || currentBatch?.targetDestination || retailStore || 'Retail Store',
                            coordinates: gps,
                            sealAudit: auditReport
                        },
                        `Consignment #${bId} delivery accepted at retail store (${totalJarsCount} bottles). Pending inward verification at Inward Desk.`
                    );

                    // Ensure jars start clean/pending at retail store custody until individually inwarded
                    const existingInward = scannedInwardBottles[bId] || [];
                    setScannedInwardBottles(prev => ({ ...prev, [bId]: existingInward }));
                    invalidateContractCache();
                    window.dispatchEvent(new Event('honeychain_batch_updated'));

                    setInwardFeedback({
                        type: 'success',
                        message: `Consignment Delivery Verified & Accepted!`,
                        detail: `Carrier seal audit passed 100%. Custody transferred to retail store. Bottles are now ready for individual inwarding at the Inward Desk below.`
                    });
                },
                onAuditReject: (auditReport) => {
                    const brokenId = auditReport?.failedJarId || auditReport?.compromisedUnits?.[0] || 14;
                    setAuditModalConfig(prev => ({ ...prev, isOpen: false }));
                    const liableParty = 'Cold-Chain Reefer Logistics Carrier (NH-44 Fleet)';
                    const rejectEvent = {
                        stage: 4,
                        stageName: 'Quarantined / Rejected',
                        actor: account || currentUser?.address || 'KVIC Retail Store Receiving Gatekeeper',
                        location: targetBatch?.targetDestination || currentBatch?.targetDestination || retailStore || 'KVIC Khadi Gramodyog Bhavan',
                        timestamp: Math.floor(Date.now() / 1000),
                        notes: `FINAL REJECTION: Retail store gatekeeper inspected consignment and REJECTED delivery. Jar #${brokenId} NFC tamper-evident seal was severed/tampered during transit. Consignment permanently quarantined on blockchain ledger. Legal liability attributed to ${liableParty}.`,
                        coordinates: auditReport?.gps || null,
                        sealAudit: {
                            status: 'TAMPER_BREACH_REJECTED',
                            verifiedCount: (parseInt(totalJarsCount) || 50) - 1,
                            totalJars: parseInt(totalJarsCount) || 50,
                            tamperedCount: 1,
                            failedJarId: brokenId,
                            auditedBy: 'Retail Store Gatekeeper Inspection'
                        }
                    };

                    updateStoredBatchStage(bId, {
                        isFlagged: true,
                        flagReason: `NFC Tamper Seal Severed on Unit #${brokenId}. Delivery permanently rejected at retail gatekeeper.`,
                        currentStage: 'Quarantined / Rejected',
                        stageName: 'Quarantined / Rejected',
                        quarantineType: 'NFC_TAMPER_BREACH',
                        retailerRejected: true,
                        brokenJarId: brokenId,
                        liableParty: liableParty,
                        historyEvent: rejectEvent
                    });

                    setBatches(prev => prev.map(b => String(b.batchId) === String(bId) ? {
                        ...b,
                        isFlagged: true,
                        flagReason: `NFC Tamper Seal Severed on Unit #${brokenId}. Delivery permanently rejected at retail gatekeeper.`,
                        currentStage: 'Quarantined / Rejected',
                        stageName: 'Quarantined / Rejected',
                        quarantineType: 'NFC_TAMPER_BREACH',
                        retailerRejected: true,
                        brokenJarId: brokenId,
                        liableParty: liableParty,
                        history: [...(b.history || []), rejectEvent]
                    } : b));

                    setBatchHistory(prev => [...prev, rejectEvent]);

                    setCustodyBreachAlert({
                        active: true,
                        stage: 'Retail Consignment Inwarding',
                        title: `Consignment Delivery Rejected — Tamper Seal Breach (Unit #${brokenId})`,
                        message: `Consignment gatekeeper audit failed on Jar #${brokenId} (severed NFC tamper loop). Retail manager refused delivery. The consignment has been permanently quarantined on the blockchain ledger.`,
                        liabilityPin: liableParty,
                        brokenJarId: brokenId,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    });

                    invalidateContractCache();
                    window.dispatchEvent(new Event('honeychain_batch_updated'));
                }
            });
            return;
        }

        const allNums = Array.from({ length: totalJarsCount }, (_, i) => i + 1);
        setScannedInwardBottles(prev => ({ ...prev, [bId]: allNums }));
        try {
            localStorage.setItem(`honeychain_inwarded_${bId}`, JSON.stringify(allNums));
            fetch(`${API_BASE_URL}/api/pos/inward-bottles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId: bId, inwardedBottles: allNums })
            }).catch(() => {});
            invalidateContractCache();
            window.dispatchEvent(new Event('honeychain_batch_updated'));
        } catch (e) {}

        setInwardFeedback({
            type: 'success',
            message: `All ${totalJarsCount} Bottles Inwarded Together!`,
            detail: `Full consignment registered in store inventory for customer checkout.`
        });
    };

    const currentBatch = batches.find(b => String(b.batchId) === String(selectedBatchId)) || null;
    const isDistributorCustodyAccepted = Boolean(
        currentBatch?.distributorCustodyAccepted || 
        (currentBatch && currentBatch.stageIdx >= 3)
    );

    // 1. Distributor Physical NFC Seal Audit & Custody Acceptance
    const handleDistributorNfcAudit = () => {
        if (isBatchFlagged || currentStageIdx !== 2) return;
        setCustodyBreachAlert(null);
        setAuditModalConfig({
            isOpen: true,
            batch: currentBatch,
            fromActor: processorLocation || 'KVIC Honey Processing & Micro-Filtration Plant, Srinagar',
            toActor: transitRoute || 'Northern Reefer Fleet NH-44 (Cold-Chain Logistics)',
            actionType: 'distributor-custody',
            onAuditPass: async (auditReport) => {
                setAuditModalConfig(prev => ({ ...prev, isOpen: false }));
                setNotification({
                    type: 'info',
                    message: '📍 Capturing driver device GPS coordinates and accepting consignment custody...'
                });
                const gps = await captureDeviceCoordinates('DISTRIBUTOR');
                const custodyEvent = {
                    stage: 2,
                    stageName: 'Custody Handover',
                    actor: account || currentUser?.address || 'Northern Reefer Fleet Logistics',
                    location: processorLocation || 'KVIC Honey Processing Plant',
                    timestamp: Math.floor(Date.now() / 1000),
                    notes: `Physical custody verified & accepted by Distributor Fleet. All ${auditReport.verifiedCount || 50}/${auditReport.totalJars || 50} tamper-evident NFC seals verified intact.`,
                    coordinates: gps,
                    sealAudit: auditReport
                };

                updateStoredBatchStage(selectedBatchId, {
                    distributorCustodyAccepted: true,
                    distributorAuditReport: auditReport,
                    distributorGps: gps,
                    historyEvent: custodyEvent
                });

                setBatches(prev => prev.map(b => String(b.batchId) === String(selectedBatchId) ? {
                    ...b,
                    distributorCustodyAccepted: true,
                    distributorAuditReport: auditReport,
                    distributorGps: gps,
                    history: [...(b.history || []), custodyEvent]
                } : b));

                setNotification({
                    type: 'success',
                    message: `✅ Physical Custody Accepted! 50/50 NFC Seals Verified Intact. Package is now in Distributor custody. Ready to dispatch.`
                });
                invalidateContractCache();
                window.dispatchEvent(new Event('honeychain_batch_updated'));
            },
            onAuditReject: (auditReport) => {
                const brokenId = auditReport?.failedJarId || auditReport?.compromisedUnits?.[0] || 14;
                setAuditModalConfig(prev => ({ ...prev, isOpen: false }));
                const liableParty = 'Processor Packaging Facility (Last Verified Custodian)';
                const rejectEvent = {
                    stage: 2,
                    stageName: 'Quarantined / Rejected',
                    actor: account || currentUser?.address || 'Northern Reefer Fleet Logistics',
                    location: processorLocation || 'KVIC Honey Processing Plant, Srinagar',
                    timestamp: Math.floor(Date.now() / 1000),
                    notes: `FINAL REJECTION: Distributor inspected consignment and REJECTED handover custody. Jar #${brokenId} NFC tamper-evident seal was severed prior to handover. Consignment permanently quarantined on blockchain ledger. Legal liability pinned on ${liableParty}.`,
                    coordinates: auditReport?.gps || null,
                    sealAudit: {
                        status: 'TAMPER_BREACH_REJECTED',
                        verifiedCount: (parseInt(currentBatch?.jarsTotal) || 50) - 1,
                        totalJars: parseInt(currentBatch?.jarsTotal) || 50,
                        tamperedCount: 1,
                        failedJarId: brokenId,
                        auditedBy: 'Distributor Fleet Inward Inspection'
                    }
                };

                updateStoredBatchStage(selectedBatchId, {
                    isFlagged: true,
                    flagReason: `NFC Tamper Seal Severed on Unit #${brokenId}. Consignment permanently quarantined on ledger.`,
                    currentStage: 'Quarantined / Rejected',
                    stageName: 'Quarantined / Rejected',
                    quarantineType: 'NFC_TAMPER_BREACH',
                    distributorCustodyAccepted: false,
                    distributorRejected: true,
                    brokenJarId: brokenId,
                    liableParty: liableParty,
                    historyEvent: rejectEvent
                });

                setBatches(prev => prev.map(b => String(b.batchId) === String(selectedBatchId) ? {
                    ...b,
                    isFlagged: true,
                    flagReason: `NFC Tamper Seal Severed on Unit #${brokenId}. Consignment permanently quarantined on ledger.`,
                    currentStage: 'Quarantined / Rejected',
                    stageName: 'Quarantined / Rejected',
                    quarantineType: 'NFC_TAMPER_BREACH',
                    distributorCustodyAccepted: false,
                    distributorRejected: true,
                    brokenJarId: brokenId,
                    liableParty: liableParty,
                    history: [...(b.history || []), rejectEvent]
                } : b));

                setBatchHistory(prev => [...prev, rejectEvent]);

                setCustodyBreachAlert({
                    active: true,
                    stage: 'Distributor Handover Audit',
                    title: `Consignment Custody Rejected — Tamper Seal Breach (Unit #${brokenId})`,
                    message: `Consignment inspection failed on Jar #${brokenId} (severed NTAG 424 DNA tamper loop). Fleet driver refused physical custody. Consignment permanently quarantined on the blockchain ledger.`,
                    liabilityPin: liableParty,
                    brokenJarId: brokenId,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                });

                invalidateContractCache();
                window.dispatchEvent(new Event('honeychain_batch_updated'));
            }
        });
    };

    // 2. Distributor Dispatch to Retail Store
    const handleDistributorDispatch = async () => {
        if (isBatchFlagged || currentStageIdx !== 2) return;
        setLoading(true);
        try {
            await executeStageTransition(
                'dispatch-batch',
                {
                    batchId: selectedBatchId,
                    transitRoute: transitRoute.trim() || 'Route NH-44: Srinagar - Jammu - Delhi (Temperature-Controlled Fleet #DL-1A-9821)',
                    coordinates: currentBatch?.distributorGps || await captureDeviceCoordinates('DISTRIBUTOR'),
                    sealAudit: currentBatch?.distributorAuditReport || {
                        status: 'SEALED_INTACT',
                        verifiedCount: parseInt(currentBatch?.jarsTotal) || 50,
                        totalJars: parseInt(currentBatch?.jarsTotal) || 50
                    }
                },
                `Batch #${selectedBatchId} dispatched in transit towards retail store!`
            );
        } catch (e) {
            console.error("Dispatch error:", e);
        } finally {
            setLoading(false);
        }
    };

    const isBatchFlagged = Boolean(
        currentBatch && (
            currentBatch.isFlagged === true || 
            currentBatch.isFlagged === 'true' ||
            currentBatch.distributorRejected === true ||
            currentBatch.retailerRejected === true ||
            (currentBatch.currentStage && String(currentBatch.currentStage).toLowerCase().includes('quarantin')) ||
            (currentBatch.flagReason && currentBatch.flagReason.length > 0)
        )
    );
    const isBatchCertified = Boolean(currentBatch && currentBatch.isCertifiedPure && !isBatchFlagged);

    const isAdminRole = Boolean(
        userRoleTypes.includes('ADMIN') ||
        userRoles.isAdmin ||
        currentUser?.roleKey === 'ADMIN' ||
        Boolean(account && account.toLowerCase() === KVIC_ADMIN_ADDR.toLowerCase())
    );

    const isProcessorRole = !isAdminRole && Boolean(
        userRoleTypes.includes('PROCESSOR') ||
        userRoles.isProcessor ||
        currentUser?.roleKey === 'PROCESSOR'
    );

    const isDistributorRole = !isAdminRole && Boolean(
        userRoleTypes.includes('DISTRIBUTOR') ||
        userRoles.isDistributor ||
        currentUser?.roleKey === 'DISTRIBUTOR'
    );

    const isRetailerRole = !isAdminRole && Boolean(
        userRoleTypes.includes('RETAILER') ||
        userRoles.isRetailer ||
        currentUser?.roleKey === 'RETAILER'
    );

    const stages = [
        "Harvested",
        "Lab Certified",
        "Processed & Sealed",
        "In Transit",
        "At KVIC Retail",
        "Sold to Consumer"
    ];

    const STAGE_MAP = {
        "Harvested from Smart Hive": 0,
        "KVIC Lab Quality Certified": 1,
        "Processed & Sealed": 2,
        "In Transit Distribution": 3,
        "Available at KVIC Retail": 4,
        "Delivered to Verified Consumer": 5
    };

    const getCurrentStageIndex = (stageStr) => {
        if (!stageStr) return 0;
        if (STAGE_MAP[stageStr] !== undefined) return STAGE_MAP[stageStr];
        const lower = stageStr.toLowerCase();
        if (lower.includes("harvest")) return 0;
        if (lower.includes("lab") || lower.includes("quality")) return 1;
        if (lower.includes("process")) return 2;
        if (lower.includes("transit") || lower.includes("distribut")) return 3;
        if (lower.includes("retail")) return 4;
        if (lower.includes("consumer") || lower.includes("sold") || lower.includes("deliver")) return 5;
        return 0;
    };

    const currentStageIdx = currentBatch ? getCurrentStageIndex(currentBatch.currentStage) : 0;
    const totalJars = currentBatch ? parseInt(currentBatch.jarsTotal) || (parseInt(currentBatch.yieldWeightKg || 25) * 2) : 0;

    return (
        <div className="container">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ fontSize: '1.65rem', fontWeight: 700, margin: 0, color: 'var(--ink-900)' }}>
                        Supply Chain Custody Pipeline
                    </h2>
                    <p style={{ color: 'var(--ink-500)', margin: '4px 0 0', fontSize: '0.86rem' }}>
                        Cryptographic custody handover: Processing, Cold-Chain Transit, and Retail Store Inwarding
                    </p>
                </div>
                {batches.length > 0 && (
                    <div style={{ width: '100%', maxWidth: '340px' }}>
                        <select
                            className="form-control"
                            value={selectedBatchId}
                            onChange={(e) => handleSelectBatch(e.target.value)}
                        >
                            {batches.map(b => {
                                const flagged = Boolean(b.isFlagged === true || b.isFlagged === 'true' || (b.flagReason && b.flagReason.length > 0));
                                const certified = Boolean(b.isCertifiedPure && !flagged);
                                return (
                                    <option key={b.batchId} value={b.batchId}>
                                        Batch #{b.batchId}: {b.batchCode} ({b.floraName || 'Flora'}) {flagged ? '— [Flagged / Quarantined]' : certified ? '— [Certified Pure]' : '— [Pending Lab]'}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                )}
            </div>

            {notification && !custodyBreachAlert && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    background: notification.type === 'success' ? 'var(--forest-green-light)' : 'var(--alert-red-light)',
                    color: notification.type === 'success' ? 'var(--forest-green)' : 'var(--alert-red)',
                    border: `1px solid ${notification.type === 'success' ? 'var(--forest-green-border)' : 'var(--alert-red-border)'}`,
                    fontSize: '0.86rem',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    {notification.type === 'success' ? <FiCheckCircle size={16} /> : <FiAlertCircle size={16} />}
                    <span>{notification.message}</span>
                </div>
            )}

            {/* Admin Read-Only Notice */}
            {userRoleTypes.includes('ADMIN') && (
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
                    <span><strong>Administrator Read-Only Audit Mode:</strong> You are monitoring end-to-end custody and tracking records. Custody state changes (processing, fleet dispatch, store inwarding) are strictly restricted to certified operational roles.</span>
                </div>
            )}

            {batches.length === 0 && (
                <div className="clean-card" style={{ textAlign: 'center', padding: '48px 24px', margin: '20px 0' }}>
                    <div style={{ color: 'var(--primary-honey)', marginBottom: '12px' }}>
                        <FiTruck size={38} />
                    </div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-900)', marginBottom: '6px' }}>
                        No Batches in Custody Pipeline Yet
                    </h3>
                    <p style={{ color: 'var(--ink-500)', fontSize: '0.86rem', maxWidth: '480px', margin: '0 auto 16px', lineHeight: '1.5' }}>
                        The decentralized ledger is reset and active. Once an authorized Beekeeper logs a honey harvest from a Smart Hive, it will appear here for Lab Purity Certification, Processing, and Cold-Chain Transit.
                    </p>
                    <a href="/beekeeper" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex' }}>
                        Go to Beekeeper Harvest →
                    </a>
                </div>
            )}

            {/* Custody Breach Non-Repudiation Liability Alert - Clean Enterprise Styling */}
            {custodyBreachAlert && (
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid #FECDD3',
                    borderLeft: '4px solid #E11D48',
                    borderRadius: '8px',
                    padding: '16px 20px',
                    marginBottom: '20px',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1, minWidth: '280px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                background: '#FFF1F2',
                                border: '1px solid #FECDD3',
                                color: '#E11D48',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <FiAlertTriangle size={18} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                    <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#9F1239', margin: 0 }}>
                                        {custodyBreachAlert.title}
                                    </h4>
                                    <span style={{
                                        background: '#FFF1F2',
                                        color: '#E11D48',
                                        border: '1px solid #FECDD3',
                                        borderRadius: '4px',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        padding: '1px 6px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.04em'
                                    }}>
                                        Permanent Quarantine
                                    </span>
                                </div>
                                <p style={{ fontSize: '0.84rem', color: '#475569', margin: '0 0 10px', lineHeight: 1.5 }}>
                                    {custodyBreachAlert.message}
                                </p>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '8px',
                                    fontSize: '0.75rem',
                                    color: '#64748B'
                                }}>
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        background: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '5px',
                                        padding: '3px 8px',
                                        color: '#0F172A',
                                        fontWeight: 600
                                    }}>
                                        <span style={{ color: '#94A3B8', fontWeight: 500 }}>Attributed Liability:</span>
                                        <span>{custodyBreachAlert.liabilityPin}</span>
                                    </div>
                                    <span style={{ color: '#CBD5E1' }}>•</span>
                                    <span>Logged at {custodyBreachAlert.timestamp}</span>
                                    <span style={{ color: '#CBD5E1' }}>•</span>
                                    <span style={{ color: '#E11D48', fontWeight: 600 }}>Ledger: Permanently Quarantined</span>
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setCustodyBreachAlert(null)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94A3B8',
                                cursor: 'pointer',
                                padding: '4px',
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            title="Dismiss Notice"
                        >
                            <FiX size={18} />
                        </button>
                    </div>
                </div>
            )}

            {currentBatch && (
                <>
                    {/* Pipeline Stage Card */}
                    <div className="clean-card" style={{ marginBottom: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                                <h4 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--ink-900)' }}>
                                    Batch #{currentBatch.batchId}: {currentBatch.batchCode}
                                </h4>
                                <span style={{ fontSize: '0.8rem', color: 'var(--ink-500)' }}>
                                    {currentBatch.floraName} • Harvested {new Date(parseInt(currentBatch.harvestTimestamp) * 1000).toLocaleDateString()} • Apiary: {currentBatch.clusterLocation}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {isBatchFlagged ? (
                                    <span style={{
                                        background: '#FFF1F2',
                                        color: '#BE123C',
                                        border: '1px solid #FECDD3',
                                        padding: '4px 12px',
                                        borderRadius: '20px',
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}>
                                        <FiAlertCircle size={14} color="#E11D48" /> {currentBatch?.brokenJarId ? `Quarantined (Tamper Breach: Unit #${currentBatch.brokenJarId})` : 'Quarantined (Quality Failed)'}
                                    </span>
                                ) : (
                                    <span className="badge-purity">
                                        <FiCheckCircle size={12} /> {currentBatch.currentStage}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Responsive Progress Stepper */}
                        <PipelineStageStepper 
                            currentStage={currentStageIdx} 
                            isFlagged={isBatchFlagged}
                            quarantinedStage={currentBatch?.brokenJarId ? (currentBatch?.retailerRejected ? 4 : 2) : 1}
                            flagLabel={currentBatch?.brokenJarId ? `Tamper Breached (#${currentBatch.brokenJarId})` : 'Quality Failed'}
                        />
                    </div>

                    {/* Quarantine Report: NFC Tamper Breach OR Laboratory Quality Quarantine */}
                    {isBatchFlagged && (
                        currentBatch?.brokenJarId ? (
                            <div className="clean-card" style={{
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderLeft: '4px solid #E11D48',
                                borderRadius: '12px',
                                padding: '20px 24px',
                                marginBottom: '22px',
                                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', maxWidth: '780px' }}>
                                        <div style={{
                                            width: '42px',
                                            height: '42px',
                                            borderRadius: '10px',
                                            background: '#FFF1F2',
                                            border: '1px solid #FECDD3',
                                            color: '#E11D48',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            <FiAlertTriangle size={22} />
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--ink-900)' }}>
                                                    Consignment Custody Quarantined — NFC Tamper Seal Breach Detected
                                                </h4>
                                                <span style={{
                                                    background: '#FFF1F2',
                                                    color: '#BE123C',
                                                    border: '1px solid #FECDD3',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px'
                                                }}>
                                                    Unit #{currentBatch.brokenJarId} Tamper Loop Severed
                                                </span>
                                            </div>

                                            <p style={{ margin: '0 0 10px', fontSize: '0.84rem', color: 'var(--ink-600)', lineHeight: 1.55 }}>
                                                Consignment handover inspection failed on Unit #{currentBatch.brokenJarId}. Physical tamper-evident antenna loop was breached prior to custody acceptance. In accordance with food safety traceability standards and decentralized ledger non-repudiation rules, this consignment is permanently locked against further downstream distribution.
                                            </p>

                                            <div style={{
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                                gap: '8px',
                                                background: '#F8FAFC',
                                                border: '1px solid #E2E8F0',
                                                borderRadius: '8px',
                                                padding: '8px 12px',
                                                fontSize: '0.78rem',
                                                color: 'var(--ink-700)'
                                            }}>
                                                <strong style={{ color: '#BE123C' }}>Forensic Finding:</strong>
                                                <span>{currentBatch.flagReason || `Tamper-evident seal severed on Jar #${currentBatch.brokenJarId}`}</span>
                                                <span style={{ color: '#CBD5E1' }}>•</span>
                                                <span style={{ color: '#64748B' }}>Attributed Liable Custodian: <strong>{currentBatch.liableParty || 'Processor Packaging Facility'}</strong></span>
                                                <span style={{ color: '#CBD5E1' }}>•</span>
                                                <span style={{ color: '#E11D48', fontWeight: 600 }}>Ledger: Final Rejection Recorded</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="clean-card" style={{
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderLeft: '4px solid #E11D48',
                                borderRadius: '12px',
                                padding: '20px 24px',
                                marginBottom: '22px',
                                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', maxWidth: '720px' }}>
                                        <div style={{
                                            width: '42px',
                                            height: '42px',
                                            borderRadius: '10px',
                                            background: '#FFF1F2',
                                            border: '1px solid #FECDD3',
                                            color: '#E11D48',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            <FiShield size={22} />
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--ink-900)' }}>
                                                    Laboratory Quality Quarantine Notice
                                                </h4>
                                                <span style={{
                                                    background: '#FFF1F2',
                                                    color: '#BE123C',
                                                    border: '1px solid #FECDD3',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 600,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px'
                                                }}>
                                                    Adulteration Threshold Exceeded
                                                </span>
                                            </div>

                                            <p style={{ margin: '0 0 10px', fontSize: '0.84rem', color: 'var(--ink-600)', lineHeight: 1.55 }}>
                                                Batch #{currentBatch.batchId} did not satisfy KVIC / FSSAI purity standards. Per food safety protocol and immutable smart contract rules, downstream custody handoffs (Processing, Transit Dispatch, and Retail Inwarding) are permanently locked on the blockchain.
                                            </p>

                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                background: '#F8FAFC',
                                                border: '1px solid #E2E8F0',
                                                borderRadius: '8px',
                                                padding: '8px 12px',
                                                fontSize: '0.78rem',
                                                color: 'var(--ink-700)'
                                            }}>
                                                <strong style={{ color: '#BE123C' }}>Forensic Finding:</strong>
                                                <span>{currentBatch.flagReason || "Failed KVIC purity test: High moisture or C4 sugar adulteration detected"}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <a
                                            href="/lab-testing"
                                            className="btn-outline"
                                            style={{
                                                padding: '8px 16px',
                                                fontSize: '0.8rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                textDecoration: 'none',
                                                color: 'var(--ink-800)',
                                                borderColor: '#CBD5E1'
                                            }}
                                        >
                                            <FaFlask size={13} color="var(--primary-honey)" /> View Lab Test Record
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )
                    )}

                    {/* Notice if Stage 0 & Not Flagged: Freshly Harvested awaiting lab certification */}
                    {!isBatchFlagged && currentStageIdx === 0 && (
                        <div style={{
                            background: 'var(--primary-honey-light)',
                            border: '1px solid var(--primary-honey-border)',
                            borderRadius: '8px',
                            padding: '14px 16px',
                            marginBottom: '16px',
                            fontSize: '0.84rem',
                            color: 'var(--primary-honey-hover)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '10px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FaFlask size={18} />
                                <div>
                                    <strong>Lab Testing Required First:</strong> Batch #{currentBatch.batchId} must pass KVIC Lab Quality Certification before distribution.
                                </div>
                            </div>
                            <a href="/lab-testing" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.78rem', textDecoration: 'none' }}>
                                Certify in Lab Purity →
                            </a>
                        </div>
                    )}

                    {/* Custody Actions (Steps 3, 4, 5) */}
                    {(() => {
                        const hasAssignedDistributor = currentBatch?.assignedDistributor && currentBatch.assignedDistributor !== '0x0000000000000000000000000000000000000000';
                        // Resolve current user's enterprise address for username-based auth
                        const myEnterpriseAddr = resolveEnterpriseAddress(currentUser?.id || currentUser?.username || '');
                        const myAddrs = [account, currentUser?.address, myEnterpriseAddr].filter(Boolean).map(a => a.toLowerCase());
                        const isMyDistributor = isDistributorRole || !hasAssignedDistributor || 
                            myAddrs.some(a => a === (currentBatch.assignedDistributor || '').toLowerCase());
                        const assignedDistributorLabel = currentBatch?.assignedDistributor && currentBatch.assignedDistributor !== '0x0000000000000000000000000000000000000000'
                            ? getEntityFriendlyName(currentBatch.assignedDistributor, 'DISTRIBUTOR')
                            : 'Open Fleet';

                        const hasAssignedRetailer = currentBatch?.assignedRetailer && currentBatch.assignedRetailer !== '0x0000000000000000000000000000000000000000';
                        const isMyRetailer = isRetailerRole || !hasAssignedRetailer || 
                            myAddrs.some(a => a === (currentBatch.assignedRetailer || '').toLowerCase());
                        const isRetailerAuthorized = isMyRetailer && isRetailerRole;
                        const assignedRetailerLabel = currentBatch?.targetDestination || (currentBatch?.assignedRetailer && currentBatch.assignedRetailer !== '0x0000000000000000000000000000000000000000'
                            ? getEntityFriendlyName(currentBatch.assignedRetailer, 'RETAILER')
                            : 'Open Store');

                        if (isBatchFlagged) {
                            return null;
                        }

                        return (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 310px), 1fr))',
                                gap: '16px',
                                marginBottom: '20px',
                                width: '100%',
                                maxWidth: '100%',
                                boxSizing: 'border-box'
                            }}>
                                
                                {/* Step 3: Process */}
                                <div className="clean-card" style={{ opacity: isBatchFlagged ? 0.6 : currentStageIdx === 1 ? 1 : 0.75, border: isBatchFlagged ? '1px solid #FCA5A5' : undefined, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <h5 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--ink-900)' }}>
                                            3. Processing & Sealing
                                        </h5>
                                        <span className={isBatchFlagged ? "badge-danger" : currentStageIdx > 1 ? "badge-purity" : "badge-pending"} style={isBatchFlagged ? { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' } : undefined}>
                                            {isBatchFlagged ? <><FiAlertCircle size={11} /> Quarantined</> : currentStageIdx > 1 ? 'Completed' : 'Role: Processor'}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-500)', marginBottom: '8px' }}>
                                        Moisture reduction (&lt;20%) and dedicated custody allocation.
                                    </p>

                                    {isBatchFlagged && (
                                        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '6px', padding: '6px 10px', fontSize: '0.74rem', color: '#991B1B', marginBottom: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <FiAlertCircle size={13} /> Quarantined: Processing prohibited due to failed purity lab test.
                                        </div>
                                    )}

                                    <div style={{ background: 'var(--bg-app)', border: 'var(--border)', borderRadius: '6px', padding: '6px 8px', fontSize: '0.74rem', color: 'var(--ink-700)', marginBottom: '8px' }}>
                                        <strong>Packaging Output:</strong> {parseInt(currentBatch.yieldWeightKg) * 2} Retail Jars (500g each)
                                    </div>

                                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '3px' }}>
                                        Processing Facility / Location:
                                    </label>
                                    <input
                                        type="text"
                                        className="form-control"
                                        style={{ marginBottom: '8px' }}
                                        placeholder="Enter processing facility name / location"
                                        value={processorLocation}
                                        onChange={(e) => setProcessorLocation(e.target.value)}
                                        disabled={isBatchFlagged || currentStageIdx !== 1}
                                    />

                                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '3px' }}>
                                        Assign Logistics Partner:
                                    </label>
                                    <select
                                        className="form-control"
                                        style={{ marginBottom: '8px' }}
                                        value={isCustomDistributor ? '__CUSTOM__' : (authorizedDistributorsList.find(d => (d.address || '').toLowerCase() === (selectedDistributorAddr || '').toLowerCase())?.address || selectedDistributorAddr)}
                                        onChange={(e) => {
                                            if (e.target.value === '__CUSTOM__') {
                                                setIsCustomDistributor(true);
                                                setSelectedDistributorAddr('');
                                            } else {
                                                setIsCustomDistributor(false);
                                                setSelectedDistributorAddr(e.target.value);
                                            }
                                        }}
                                        disabled={isBatchFlagged || currentStageIdx !== 1}
                                    >
                                        {authorizedDistributorsList.map(d => (
                                            <option key={d.address} value={d.address}>
                                                {d.name}
                                            </option>
                                        ))}
                                        <option value="__CUSTOM__">Custom Logistics Fleet / Driver...</option>
                                    </select>
                                    {isCustomDistributor && (
                                        <input
                                            className="form-control"
                                            placeholder="Enter fleet name (e.g. Northern Reefer NH-44)"
                                            style={{ marginBottom: '8px' }}
                                            value={selectedDistributorAddr.startsWith('0x') ? '' : selectedDistributorAddr}
                                            onChange={(e) => setSelectedDistributorAddr(resolveEnterpriseAddress(e.target.value))}
                                            disabled={isBatchFlagged || currentStageIdx !== 1}
                                            required
                                        />
                                    )}

                                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '3px' }}>
                                        Designate Target Retailer:
                                    </label>
                                    <select
                                        className="form-control"
                                        style={{ marginBottom: '10px' }}
                                        value={isCustomRetailer ? '__CUSTOM__' : (authorizedRetailersList.find(r => (r.address || '').toLowerCase() === (selectedRetailerAddr || '').toLowerCase())?.address || selectedRetailerAddr)}
                                        onChange={(e) => {
                                            if (e.target.value === '__CUSTOM__') {
                                                setIsCustomRetailer(true);
                                                setSelectedRetailerAddr('');
                                                setTargetDestinationText('');
                                                setRetailStore('');
                                            } else {
                                                setIsCustomRetailer(false);
                                                setSelectedRetailerAddr(e.target.value);
                                                const found = authorizedRetailersList.find(r => r.address.toLowerCase() === e.target.value.toLowerCase());
                                                if (found && found.name) {
                                                    setTargetDestinationText(found.name);
                                                    setRetailStore(found.name);
                                                }
                                            }
                                        }}
                                        disabled={isBatchFlagged || currentStageIdx !== 1}
                                    >
                                        {authorizedRetailersList.map(r => (
                                            <option key={r.address} value={r.address}>
                                                {r.name}
                                            </option>
                                        ))}
                                        <option value="__CUSTOM__">Custom Retail Outlet / Store...</option>
                                    </select>
                                    {isCustomRetailer && (
                                        <div style={{ marginBottom: '10px' }}>
                                            <input
                                                className="form-control"
                                                placeholder="Enter retail store name (e.g. Khadi Bhavan Jaipur)"
                                                value={targetDestinationText}
                                                onChange={(e) => {
                                                    setTargetDestinationText(e.target.value);
                                                    setRetailStore(e.target.value);
                                                    setSelectedRetailerAddr(resolveEnterpriseAddress(e.target.value));
                                                }}
                                                disabled={isBatchFlagged || currentStageIdx !== 1}
                                                required
                                            />
                                        </div>
                                    )}

                                    {/* Step 3: Process Button */}
                                    {isBatchFlagged ? (
                                        <button
                                            className="btn-honey"
                                            style={{ width: '100%', justifyContent: 'center', background: '#DC2626', borderColor: '#DC2626', color: '#fff', cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                            disabled={true}
                                        >
                                            <FiLock size={13} /> Blocked: Batch Quarantined
                                        </button>
                                    ) : !isBatchCertified && currentStageIdx === 0 ? (
                                        <button
                                            className="btn-honey"
                                            style={{ width: '100%', justifyContent: 'center', opacity: 0.6, cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                            disabled={true}
                                        >
                                            <FiLock size={13} /> Awaiting Step 2: Lab Certification
                                        </button>
                                    ) : (
                                        <button
                                            className="btn-honey"
                                            style={{ width: '100%', justifyContent: 'center', opacity: !isProcessorRole && currentStageIdx === 1 ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                            disabled={currentStageIdx !== 1 || loading || (!isProcessorRole && currentStageIdx === 1)}
                                            onClick={() => executeStageTransition(
                                                'process-batch',
                                                {
                                                    batchId: selectedBatchId,
                                                    facilityLocation: processorLocation.trim() || 'KVIC Honey Processing & Micro-Filtration Plant, Srinagar, J&K',
                                                    assignedDistributor: selectedDistributorAddr,
                                                    assignedRetailer: selectedRetailerAddr,
                                                    targetDestination: targetDestinationText
                                                },
                                                `Batch #${selectedBatchId} processed and custody bound successfully!`
                                            )}
                                        >
                                            {currentStageIdx > 1 ? <><FiCheck size={13} /> Processed & Assigned</> : !isProcessorRole ? <><FiLock size={13} /> Locked: Processor Role Required</> : 'Process & Bind Custody'}
                                        </button>
                                    )}
                                </div>

                                {/* Step 4: Distributor Custody & Transit */}
                                <div className="clean-card" style={{ opacity: isBatchFlagged ? 0.6 : currentStageIdx === 2 ? 1 : 0.75, border: isBatchFlagged ? '1px solid #FCA5A5' : undefined, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <h5 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--ink-900)' }}>
                                            4. Distributor Custody & Transit
                                        </h5>
                                        <span className={isBatchFlagged ? "badge-danger" : currentStageIdx > 2 ? "badge-purity" : isDistributorCustodyAccepted ? "badge-purity" : "badge-pending"} style={isBatchFlagged ? { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' } : undefined}>
                                            {isBatchFlagged ? <><FiAlertCircle size={11} /> Quarantined</> : currentStageIdx > 2 ? 'In Transit' : isDistributorCustodyAccepted ? 'Custody Accepted' : 'Custody Pending'}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-500)', marginBottom: '8px' }}>
                                        Distributor audits all NFC seals to accept package, then dispatches fleet to retail store.
                                    </p>

                                    {isBatchFlagged && (
                                        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '6px', padding: '6px 10px', fontSize: '0.74rem', color: '#991B1B', marginBottom: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <FiAlertCircle size={13} /> Quarantined: Logistics dispatch prohibited for adulterated batch.
                                        </div>
                                    )}

                                    {hasAssignedDistributor && !isBatchFlagged && (
                                        <div style={{
                                            background: isMyDistributor ? 'var(--forest-green-light)' : 'var(--primary-honey-light)',
                                            border: `1px solid ${isMyDistributor ? 'var(--forest-green-border)' : 'var(--primary-honey-border)'}`,
                                            borderRadius: '6px',
                                            padding: '6px 8px',
                                            fontSize: '0.72rem',
                                            color: isMyDistributor ? 'var(--forest-green)' : 'var(--primary-honey-hover)',
                                            marginBottom: '8px'
                                        }}>
                                            {isMyDistributor ? (
                                                 <span><strong>Custody Verified:</strong> Assigned to your fleet ({assignedDistributorLabel}).</span>
                                            ) : (
                                                <span><strong>Custody Lock:</strong> Designated for <strong>{assignedDistributorLabel}</strong>. Switch account to take custody.</span>
                                            )}
                                        </div>
                                    )}

                                     {/* REJECTION PERMANENT STATUS */}
                                     {(currentBatch?.distributorRejected || (isBatchFlagged && currentBatch?.brokenJarId)) ? (
                                         <div style={{
                                             background: '#FFF1F2',
                                             border: '1px solid #FECDD3',
                                             borderRadius: '8px',
                                             padding: '12px 14px',
                                             marginBottom: '10px'
                                         }}>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#9F1239', fontWeight: 700, fontSize: '0.82rem', marginBottom: '3px' }}>
                                                 <FiAlertTriangle size={15} color="#E11D48" />
                                                 <span>Consignment Custody Permanently Rejected</span>
                                             </div>
                                             <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: '1.45' }}>
                                                 Gatekeeper inspection rejected handover due to severed NFC tamper seal on <strong>Unit #{currentBatch?.brokenJarId || 14}</strong>. Consignment is permanently quarantined on the blockchain ledger. Downstream fleet dispatch is locked.
                                             </div>
                                         </div>
                                     ) : (
                                         /* PHASE 4A: NFC SEAL AUDIT & PACKAGE ACCEPTANCE */
                                         <div style={{
                                             background: isDistributorCustodyAccepted || currentStageIdx > 2 ? '#F0FDF4' : '#FFFBEB',
                                             border: `1px solid ${isDistributorCustodyAccepted || currentStageIdx > 2 ? '#86EFAC' : '#FDE68A'}`,
                                             borderRadius: '7px',
                                             padding: '10px 12px',
                                             marginBottom: '10px'
                                         }}>
                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                 <span style={{ fontSize: '0.76rem', fontWeight: 700, color: isDistributorCustodyAccepted || currentStageIdx > 2 ? '#166534' : '#92400E' }}>
                                                     Step 4A: Scan NFC Seals & Take Custody
                                                 </span>
                                                 <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isDistributorCustodyAccepted || currentStageIdx > 2 ? '#16A34A' : '#D97706' }}>
                                                     {isDistributorCustodyAccepted || currentStageIdx > 2 ? '✅ Verified Intact' : 'Audit Required'}
                                                 </span>
                                             </div>
                                             <p style={{ fontSize: '0.72rem', color: isDistributorCustodyAccepted || currentStageIdx > 2 ? '#15803D' : '#78350F', margin: '0 0 8px', lineHeight: '1.4' }}>
                                                 {isDistributorCustodyAccepted || currentStageIdx > 2
                                                     ? 'Package custody officially verified & accepted from Processor. 100% NFC tamper seals intact.'
                                                     : 'Scan all 50 jars to verify intact tamper seals before accepting physical custody from Processor facility.'}
                                             </p>
                                             {currentStageIdx === 2 && !isDistributorCustodyAccepted && (
                                                 <button
                                                     type="button"
                                                     className="btn-primary"
                                                     style={{ width: '100%', justifyContent: 'center', padding: '7px 12px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                     disabled={loading || !isMyDistributor || !isDistributorRole}
                                                     onClick={handleDistributorNfcAudit}
                                                 >
                                                     <FiRadio size={14} /> Scan NFC Seals & Accept Package
                                                 </button>
                                             )}
                                             {(isDistributorCustodyAccepted || currentStageIdx > 2) && (
                                                 <div style={{ fontSize: '0.72rem', color: '#15803D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                     <FiCheckCircle size={13} /> Custody in Fleet Hands ({assignedDistributorLabel})
                                                 </div>
                                             )}
                                         </div>
                                     )}

                                    {/* PHASE 4B: DISPATCH TOWARDS RETAILER */}
                                    <div style={{
                                        opacity: isDistributorCustodyAccepted || currentStageIdx > 2 ? 1 : 0.65,
                                        background: '#FFFFFF',
                                        border: '1px solid var(--ink-200)',
                                        borderRadius: '7px',
                                        padding: '10px 12px'
                                    }}>
                                        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--ink-800)', marginBottom: '6px' }}>
                                            Step 4B: Dispatch to Retail Store
                                        </div>
                                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--ink-700)', marginBottom: '3px' }}>
                                            Transit Route / Logistics Carrier:
                                        </label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            style={{ marginBottom: '8px', fontSize: '0.76rem' }}
                                            placeholder="Enter transit route / dispatch logistics details"
                                            value={transitRoute}
                                            onChange={(e) => setTransitRoute(e.target.value)}
                                            disabled={isBatchFlagged || currentStageIdx !== 2 || !isDistributorCustodyAccepted}
                                        />

                                        {isBatchFlagged ? (
                                            <button
                                                className="btn-honey"
                                                style={{ width: '100%', justifyContent: 'center', background: '#DC2626', borderColor: '#DC2626', color: '#fff', cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                disabled={true}
                                            >
                                                <FiLock size={13} /> Blocked: Batch Quarantined
                                            </button>
                                        ) : (
                                            <button
                                                className="btn-honey"
                                                style={{ width: '100%', justifyContent: 'center', opacity: (!isDistributorRole || !isMyDistributor || !isDistributorCustodyAccepted) && currentStageIdx === 2 ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                disabled={currentStageIdx !== 2 || loading || !isDistributorRole || !isMyDistributor || !isDistributorCustodyAccepted}
                                                onClick={handleDistributorDispatch}
                                            >
                                                {currentStageIdx > 2 ? <><FiCheck size={13} /> Dispatched in Transit</> : currentStageIdx < 2 ? <><FiLock size={13} /> Locked: Prior Stages Incomplete</> : !isDistributorCustodyAccepted ? <><FiLock size={13} /> Locked: Complete Step 4A First</> : 'Dispatch Package to Retail Store'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Step 5: Retail Inward & Shelf Stocking */}
                                <div className="clean-card" style={{ opacity: isBatchFlagged ? 0.6 : currentStageIdx === 3 ? 1 : 0.75, border: isBatchFlagged ? '1px solid #FCA5A5' : undefined, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <h5 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--ink-900)' }}>
                                            5. Retail Store Inward & Stocking
                                        </h5>
                                        <span className={isBatchFlagged ? "badge-danger" : currentStageIdx > 3 ? "badge-purity" : "badge-pending"} style={isBatchFlagged ? { background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' } : undefined}>
                                            {isBatchFlagged ? <><FiAlertCircle size={11} /> Quarantined</> : currentStageIdx > 3 ? 'Inwarded & Stocked' : 'Retailer'}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-500)', marginBottom: '8px' }}>
                                        Scan shipment upon arrival & register all {totalJars} bottles into store inventory.
                                    </p>

                                    {isBatchFlagged && (
                                        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '6px', padding: '10px 12px', fontSize: '0.78rem', color: '#991B1B', marginBottom: '8px', fontWeight: 600, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <FiAlertCircle size={14} /> Quarantined: Inwarding and shelf stocking prohibited for adulterated honey.
                                        </div>
                                    )}

                                    {hasAssignedRetailer && !isBatchFlagged && (
                                        <div style={{
                                            background: isRetailerAuthorized ? 'var(--forest-green-light)' : 'var(--primary-honey-light)',
                                            border: `1px solid ${isRetailerAuthorized ? 'var(--forest-green-border)' : 'var(--primary-honey-border)'}`,
                                            borderRadius: '6px',
                                            padding: '6px 8px',
                                            fontSize: '0.72rem',
                                            color: isRetailerAuthorized ? 'var(--forest-green)' : 'var(--primary-honey-hover)',
                                            marginBottom: '8px'
                                        }}>
                                            {isRetailerAuthorized ? (
                                                <div>
                                                    <strong>Destination Match:</strong> Destined for your store ({assignedRetailerLabel}).
                                                </div>
                                            ) : (
                                                <div>
                                                    <strong>Custody Lock:</strong> Destined exclusively for <strong>{assignedRetailerLabel}</strong>. Switch to designated store account to inward.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div style={{
                                        background: 'var(--bg-app)',
                                        border: 'var(--border)',
                                        borderRadius: '6px',
                                        padding: '8px 10px',
                                        fontSize: '0.78rem',
                                        marginBottom: '10px',
                                        color: 'var(--ink-800)'
                                    }}>
                                        <strong>Receiving Store:</strong> {currentBatch?.targetDestination || retailStore || 'Not Assigned'}
                                    </div>

                                    {/* INTERACTIVE INWARDING DESK */}
                                    {isBatchFlagged ? (
                                        <button
                                            className="btn-primary"
                                            style={{ width: '100%', justifyContent: 'center', background: '#DC2626', borderColor: '#DC2626', color: '#fff', cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                            disabled={true}
                                        >
                                            <FiLock size={13} /> Blocked: Batch Quarantined
                                        </button>
                                    ) : currentStageIdx >= 3 ? (() => {
                                        if (!isRetailerRole) {
                                            return (
                                                <div style={{
                                                    marginTop: '12px',
                                                    padding: '16px',
                                                    background: '#FFFBEB',
                                                    border: '1px solid #FDE68A',
                                                    borderRadius: '8px',
                                                    textAlign: 'center'
                                                }}>
                                                    <div style={{ marginBottom: '6px', color: '#D97706' }}><FiLock size={22} /></div>
                                                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#92400E', marginBottom: '4px' }}>
                                                        Restricted to Authorized Retail Store
                                                    </div>
                                                    <div style={{ fontSize: '0.76rem', color: '#B45309', maxWidth: '480px', margin: '0 auto' }}>
                                                        Inward controls are restricted to certified KVIC retail store personnel.
                                                    </div>
                                                </div>
                                            );
                                        }

                                        if (!isRetailerAuthorized) {
                                            return (
                                                <div style={{
                                                    marginTop: '12px',
                                                    padding: '16px',
                                                    background: '#FFFBEB',
                                                    border: '1px solid #FDE68A',
                                                    borderRadius: '8px',
                                                    textAlign: 'center'
                                                }}>
                                                    <div style={{ marginBottom: '6px', color: '#D97706' }}><FiLock size={22} /></div>
                                                    <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#92400E', marginBottom: '4px' }}>
                                                        Restricted to Designated Store
                                                    </div>
                                                    <div style={{ fontSize: '0.76rem', color: '#B45309', maxWidth: '480px', margin: '0 auto' }}>
                                                        Consignment #{currentBatch?.batchId} is assigned exclusively to <strong>{assignedRetailerLabel}</strong>. Cryptographic bottle security PINs and inward controls are restricted to the authorized recipient store.
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const inwardedList = scannedInwardBottles[selectedBatchId] !== undefined
                                            ? scannedInwardBottles[selectedBatchId]
                                            : getBatchInwardedList(selectedBatchId, totalJars, currentStageIdx);
                                        const inwardedCount = inwardedList.length;
                                        const isComplete = inwardedCount >= totalJars;
                                        const remainingCount = Math.max(0, totalJars - inwardedCount);

                                        if (currentStageIdx === 3) {
                                            return (
                                                <div style={{
                                                    marginTop: '12px',
                                                    padding: '18px 14px',
                                                    background: '#F0FDF4',
                                                    border: '1.5px solid #86EFAC',
                                                    borderRadius: '10px',
                                                    textAlign: 'center',
                                                    boxShadow: '0 2px 8px rgba(34, 197, 94, 0.08)',
                                                    width: '100%',
                                                    maxWidth: '100%',
                                                    boxSizing: 'border-box'
                                                }}>
                                                    <div style={{
                                                        width: '42px',
                                                        height: '42px',
                                                        borderRadius: '50%',
                                                        background: '#DCFCE7',
                                                        color: '#15803D',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        margin: '0 auto 10px'
                                                    }}>
                                                        <FiRadio size={20} />
                                                    </div>
                                                    <h5 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#14532D', marginBottom: '6px' }}>
                                                        Mandatory Gatekeeper NFC Seal Audit
                                                    </h5>
                                                    <p style={{ fontSize: '0.78rem', color: '#166534', maxWidth: '380px', margin: '0 auto 12px', lineHeight: '1.45' }}>
                                                        Consignment #{currentBatch?.batchId} has arrived from transit fleet. Verify carrier tamper-evident NFC seals to accept custody and unlock bottle-by-bottle inwarding.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        className="btn-primary"
                                                        style={{
                                                            width: '100%',
                                                            maxWidth: '100%',
                                                            padding: '10px 14px',
                                                            fontSize: '0.82rem',
                                                            fontWeight: 700,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            textAlign: 'center',
                                                            gap: '8px',
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word',
                                                            lineHeight: 1.35,
                                                            boxSizing: 'border-box'
                                                        }}
                                                        disabled={loading}
                                                        onClick={() => handleInwardAllBottles(currentBatch, totalJars, isRetailerAuthorized, assignedRetailerLabel)}
                                                    >
                                                        <FiRadio size={16} style={{ flexShrink: 0 }} />
                                                        <span>Audit Carton Seals & Accept Consignment Delivery</span>
                                                    </button>
                                                    <div style={{
                                                        fontSize: '0.71rem',
                                                        color: '#15803D',
                                                        marginTop: '10px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: '5px',
                                                        textAlign: 'center',
                                                        lineHeight: 1.35,
                                                        flexWrap: 'wrap'
                                                    }}>
                                                        <FiShield size={13} style={{ flexShrink: 0 }} />
                                                        <span>Non-Repudiation Policy: Broken seal detection pins liability on the carrier fleet.</span>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div style={{ marginTop: '10px' }}>
                                                {/* SUCCESS ALERT FOR UNLOCKED INVENTORY */}
                                                <div style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '6px',
                                                    background: '#ECFDF5',
                                                    border: '1px solid #A7F3D0',
                                                    color: '#065F46',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 600,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    marginBottom: '10px'
                                                }}>
                                                    <FiCheckCircle size={14} />
                                                    <span>Delivery Verified & Custody Accepted: 100% Tamper-evident NFC seals intact. Store shelf inventory active.</span>
                                                </div>
                                                {/* FEEDBACK ALERT */}
                                                {inwardFeedback && (
                                                    <div style={{
                                                        padding: '10px 12px',
                                                        borderRadius: '6px',
                                                        marginBottom: '10px',
                                                        fontSize: '0.78rem',
                                                        background: inwardFeedback.type === 'error' ? '#FEE2E2' : inwardFeedback.type === 'warning' ? '#FEF3C7' : '#DCFCE7',
                                                        border: `1px solid ${inwardFeedback.type === 'error' ? '#EF4444' : inwardFeedback.type === 'warning' ? '#F59E0B' : '#22C55E'}`,
                                                        color: inwardFeedback.type === 'error' ? '#991B1B' : inwardFeedback.type === 'warning' ? '#92400E' : '#166534'
                                                    }}>
                                                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {inwardFeedback.type === 'error' ? <FiAlertCircle size={15} /> : inwardFeedback.type === 'warning' ? <FiAlertTriangle size={15} /> : <FiCheckCircle size={15} />}
                                                            <span>{inwardFeedback.message}</span>
                                                        </div>
                                                        {inwardFeedback.detail && <div style={{ fontSize: '0.72rem', marginTop: '3px', paddingLeft: '21px' }}>{inwardFeedback.detail}</div>}
                                                    </div>
                                                )}

                                                {/* INWARD STATUS & COUNTER */}
                                                <div style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    marginBottom: '10px', padding: '7px 10px', background: 'var(--bg-app)',
                                                    borderRadius: '6px', border: 'var(--border)'
                                                }}>
                                                    <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--ink-700)' }}>
                                                        Store Inventory Inward Status:
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.76rem', fontWeight: 700,
                                                        color: isComplete ? 'var(--forest-green)' : 'var(--primary-honey-hover)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        {isComplete ? <><FiCheckCircle size={13} /> All {totalJars} Bottles Inwarded</> : `${inwardedCount} of ${totalJars} Bottles Inwarded`}
                                                    </span>
                                                </div>

                                                {/* OPTION 1: INWARD BY BOTTLE SECURITY PIN / SERIAL / GRID */}
                                                <div style={{ background: '#FFFFFF', padding: '12px', borderRadius: '7px', border: '1px solid var(--ink-200)', marginBottom: '10px' }}>
                                                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--ink-800)', marginBottom: '6px' }}>
                                                        Option 1: Inward Individual Bottle by Cryptographic Security PIN
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                                                        <input
                                                            type="text"
                                                            className="form-control"
                                                            placeholder={`Scan QR or enter Security PIN (e.g. ${getBottleSecurityToken(selectedBatchId, 1, currentBatch?.harvestTimestamp || 0, currentBatch?.batchCode || 'HONEY')})`}
                                                            value={inwardCodeInput}
                                                            onChange={(e) => setInwardCodeInput(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    handleInwardSingleBottle(currentBatch, inwardCodeInput, totalJars, isRetailerAuthorized, assignedRetailerLabel);
                                                                }
                                                            }}
                                                            style={{ flex: 1, fontSize: '0.78rem', padding: '6px 8px' }}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="btn-primary"
                                                            style={{ padding: '6px 14px', fontSize: '0.74rem', whiteSpace: 'nowrap' }}
                                                            disabled={loading}
                                                            onClick={() => handleInwardSingleBottle(currentBatch, inwardCodeInput, totalJars, isRetailerAuthorized, assignedRetailerLabel)}
                                                        >
                                                            Inward PIN
                                                        </button>
                                                    </div>

                                                    {/* Interactive Consignment Bottle Security PINs Grid */}
                                                    <div style={{ borderTop: '1px solid var(--ink-200)', paddingTop: '8px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink-700)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                                <FiPackage size={13} /> Consignment Bottle PINs ({inwardedCount} of {totalJars} Inwarded):
                                                            </div>
                                                            <div style={{ fontSize: '0.68rem', color: 'var(--ink-500)' }}>
                                                                Click any bottle PIN to authenticate & inward it
                                                            </div>
                                                        </div>
                                                        <div style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                                                            gap: '6px',
                                                            maxHeight: '140px',
                                                            overflowY: 'auto',
                                                            padding: '4px',
                                                            background: 'var(--bg-app)',
                                                            borderRadius: '6px',
                                                            border: '1px solid var(--ink-200)'
                                                        }}>
                                                            {Array.from({ length: totalJars }, (_, i) => i + 1).map(num => {
                                                                const isInwarded = inwardedList.includes(num);
                                                                const token = getBottleSecurityToken(selectedBatchId, num, currentBatch?.harvestTimestamp || 0, currentBatch?.batchCode || 'HONEY');
                                                                const serial = getUniqueBottleSerial(currentBatch?.batchCode || 'HONEY', num, token);
                                                                return (
                                                                    <button
                                                                        key={num}
                                                                        type="button"
                                                                        onClick={() => !isInwarded && handleInwardSingleBottle(currentBatch, token, totalJars, isRetailerAuthorized, assignedRetailerLabel)}
                                                                        disabled={isInwarded || loading}
                                                                        style={{
                                                                            display: 'flex',
                                                                            flexDirection: 'column',
                                                                            alignItems: 'flex-start',
                                                                            padding: '5px 7px',
                                                                            borderRadius: '5px',
                                                                            border: isInwarded ? '1px solid #86EFAC' : '1px solid var(--ink-200)',
                                                                            background: isInwarded ? '#F0FDF4' : '#FFFFFF',
                                                                            color: isInwarded ? '#166534' : 'var(--ink-800)',
                                                                            cursor: isInwarded ? 'default' : 'pointer',
                                                                            textAlign: 'left'
                                                                        }}
                                                                        title={isInwarded ? `Bottle #${num} is already stocked` : `Click to inward Bottle #${num} (PIN: ${token})`}
                                                                    >
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                                            <span style={{ fontWeight: 700, fontSize: '0.72rem' }}>Jar #{String(num).padStart(2, '0')}</span>
                                                                            <span style={{ fontSize: '0.62rem', fontWeight: 600, color: isInwarded ? '#16A34A' : '#D97706', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                {isInwarded ? <><FiCheck size={10} /> Stocked</> : <><FiInbox size={10} /> Inward</>}
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ fontSize: '0.65rem', color: isInwarded ? '#15803D' : '#2563EB', fontFamily: 'monospace', fontWeight: 600, marginTop: '2px' }}>
                                                                            PIN: {token}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.6rem', color: 'var(--ink-400)', marginTop: '1px' }}>
                                                                            {serial}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* OPTION 2: INSTANT BULK ALL */}
                                                <div style={{ background: '#FFFFFF', padding: '10px 12px', borderRadius: '7px', border: '1px solid var(--ink-200)' }}>
                                                    <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--ink-800)', marginBottom: '4px' }}>
                                                        Option 2: Inward All Bottles Together (Full Crate Inward)
                                                    </div>
                                                    <button
                                                        className="btn-primary"
                                                        style={{ width: '100%', justifyContent: 'center', padding: '8px 12px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                        disabled={loading}
                                                        onClick={() => handleInwardAllBottles(currentBatch, totalJars, isRetailerAuthorized, assignedRetailerLabel)}
                                                    >
                                                        {isComplete
                                                            ? <><FiCheckCircle size={13} /> All {totalJars} Bottles Already Inwarded into Store Stock</>
                                                            : <><FiZap size={13} /> Inward All {remainingCount > 0 && remainingCount < totalJars ? `Remaining (${remainingCount})` : `${totalJars}`} Bottles Together</>}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })() : (
                                        <button
                                            className="btn-primary"
                                            style={{ width: '100%', justifyContent: 'center', opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                            disabled={true}
                                        >
                                            <FiLock size={13} /> Locked: Prior Stages Incomplete
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Blockchain Custody Audit Trail */}
                    <div className="clean-card">
                        <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '12px', color: 'var(--ink-900)' }}>
                            Blockchain Custody Audit Trail (Batch #{currentBatch.batchId})
                        </h4>
                        <div className="table-responsive">
                            <table className="honey-table">
                                <thead>
                                    <tr>
                                        <th>Timestamp</th>
                                        <th>Stage</th>
                                        <th>Certified Participant</th>
                                        <th>Location</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {batchHistory.map((ev, idx) => {
                                        const isTamperBreach = Boolean(
                                            (ev.sealAudit && ev.sealAudit.tamperedCount > 0) ||
                                            ev.sealAudit?.status === 'TAMPER_BREACH_REJECTED' ||
                                            (ev.notes && (
                                                ev.notes.toLowerCase().includes('tampered') ||
                                                ev.notes.toLowerCase().includes('tamper breach') ||
                                                ev.notes.toLowerCase().includes('severed') ||
                                                ev.notes.toLowerCase().includes('breached')
                                            ))
                                        );
                                        const isFailed = Boolean(
                                            isTamperBreach ||
                                            (ev.notes && (
                                                ev.notes.toLowerCase().includes('failed') || 
                                                ev.notes.toLowerCase().includes('adulterat') || 
                                                ev.notes.toLowerCase().includes('reject') ||
                                                ev.notes.toLowerCase().includes('quarantin')
                                            )) ||
                                            (ev.stageName && (
                                                ev.stageName.toLowerCase().includes('reject') ||
                                                ev.stageName.toLowerCase().includes('quarantin') ||
                                                ev.stageName.toLowerCase().includes('breach')
                                            ))
                                        );
                                        return (
                                            <tr key={idx} style={isFailed ? { background: '#FFF1F2' } : undefined}>
                                                <td style={{ color: 'var(--ink-500)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                    {new Date(parseInt(ev.timestamp) * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                </td>
                                                <td>
                                                    {isFailed ? (
                                                        <span style={{
                                                            background: '#FFE4E6',
                                                            color: '#BE123C',
                                                            border: '1px solid #FECDD3',
                                                            padding: '3px 9px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.74rem',
                                                            fontWeight: 600,
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px'
                                                        }}>
                                                            <FiAlertCircle size={12} color="#E11D48" /> {isTamperBreach ? 'Tamper Breached' : 'Quality Failed'}
                                                        </span>
                                                    ) : (
                                                        <span className="badge-purity">{stages[parseInt(ev.stage)] || ev.stageName || ev.stage}</span>
                                                    )}
                                                </td>
                                                <td><code style={{ fontSize: '0.75rem' }}>{ev.actor}</code></td>
                                                <td><strong style={{ color: isFailed ? '#9F1239' : 'var(--ink-900)' }}>{ev.location}</strong></td>
                                                <td style={{ color: isFailed ? '#9F1239' : 'var(--ink-600)', fontWeight: isFailed ? 500 : 'normal' }}>
                                                    <div style={{ lineHeight: 1.45 }}>{ev.notes}</div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                                        {(() => {
                                                            const coordsStr = getFormattedCoordinates(ev.coordinates, ev.stage);
                                                            if (!coordsStr) return null;
                                                            return (
                                                                <div style={{ fontSize: '0.72rem', color: '#0284C7', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                                                                    <span>📍</span>
                                                                    <span>{coordsStr}</span>
                                                                    <span style={{ color: 'var(--ink-400)', fontWeight: 400 }}>({getDeviceSource(ev.coordinates)})</span>
                                                                </div>
                                                            );
                                                        })()}
                                                        {Number(ev.stage) >= 2 && ev.sealAudit && (
                                                            <div style={{
                                                                fontSize: '0.72rem',
                                                                color: ev.sealAudit.tamperedCount > 0 ? '#DC2626' : '#16A34A',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                fontWeight: 600,
                                                                background: ev.sealAudit.tamperedCount > 0 ? '#FEF2F2' : '#F0FDF4',
                                                                border: `1px solid ${ev.sealAudit.tamperedCount > 0 ? '#FCA5A5' : '#86EFAC'}`,
                                                                padding: '1px 6px',
                                                                borderRadius: '4px'
                                                            }}>
                                                                <span>{ev.sealAudit.tamperedCount > 0 ? '⚠️' : '🔒'}</span>
                                                                <span>
                                                                    {ev.sealAudit.tamperedCount > 0
                                                                        ? `Unit #${ev.sealAudit.failedJarId || 14} Severed (${ev.sealAudit.verifiedCount || 49}/${ev.sealAudit.totalJars || 50} Intact)`
                                                                        : `NFC Seals: ${ev.sealAudit.verifiedCount}/${ev.sealAudit.totalJars || 50} Intact`}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
            {/* NFC Tamper-Evident Custody Audit Modal */}
            <NFCCustodyAuditModal
                isOpen={auditModalConfig.isOpen}
                onClose={() => setAuditModalConfig(prev => ({ ...prev, isOpen: false }))}
                batch={auditModalConfig.batch || currentBatch}
                fromActor={auditModalConfig.fromActor}
                toActor={auditModalConfig.toActor}
                actionType={auditModalConfig.actionType}
                onAuditPass={auditModalConfig.onAuditPass}
                onAuditReject={auditModalConfig.onAuditReject}
                onAuditPassed={auditModalConfig.onAuditPass}
                onAuditFailed={auditModalConfig.onAuditReject}
            />

            {/* Supply Chain Handoff QR Sheet (Processor -> Distributor -> Retailer) */}
            <BatchHandoffQRSheet
                isOpen={Boolean(qrSheetData)}
                onClose={() => setQrSheetData(null)}
                data={qrSheetData}
            />
        </div>
    );
}

export default SupplyPipeline;
