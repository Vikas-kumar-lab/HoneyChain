import React, { useState, useEffect, useRef } from "react";
import {
  getContractInstance,
  checkIsAdmin,
  executeBlockchainRelayer,
  cachedCall,
  invalidateContractCache,
} from "../web3Utils";
import { 
  getStoredBatches, 
  saveStoredBatches,
  fetchBatchesFromServer,
  updateStoredBatchStage
} from "../hiveBatchRegistry";
import { useAuth } from "../context/AuthContext";
import {
  FiBox,
  FiTruck,
  FiShield,
  FiX,
  FiShoppingBag,
  FiCheck,
  FiCheckCircle,
  FiZap,
  FiInbox,
  FiPackage,
  FiCheckSquare,
  FiLock,
  FiAlertTriangle,
  FiSearch
} from "react-icons/fi";
import { FaStore } from "react-icons/fa";
import { TaxInvoiceModal } from "../components";
import {
  getBottleSecurityToken,
  getUniqueBottleSerial,
  resolveBottleUnit,
} from "../bottleSecurity";
import { fetchAuthorizedEntities, getEntityFriendlyName } from "../entityRegistry";
import { API_BASE_URL } from "../config";

const KVIC_ADMIN_ADDR = '0x556FCE98dC5b75C5097eEf0581BC17f771944EbB';

// Module-level so it can be used in useState lazy initializers (arrow fns are NOT hoisted)
const STAGE_MAP = {
  "Harvested & Sourced": 0,
  "Lab Tested & Quality Certified": 1,
  "Processed & Sealed": 2,
  "In Transit Distribution": 3,
  "Available at KVIC Retail": 4,
  "Delivered to Verified Consumer": 5,
};

const parseStageIndex = (stageStr) => {
  if (stageStr === undefined || stageStr === null) return 0;
  // If already a number, return it directly
  const n = parseInt(stageStr, 10);
  if (!isNaN(n) && String(stageStr).trim() === String(n)) return n;
  if (STAGE_MAP[stageStr] !== undefined) return STAGE_MAP[stageStr];
  const s = String(stageStr).toLowerCase();
  if (s.includes("consumer") || s.includes("sold") || s.includes("deliver")) return 5;
  if (s.includes("retail") || s.includes("avail") || s.includes("shelf")) return 4;
  if (s.includes("transit") || s.includes("distribut") || s.includes("stocked at retail")) return 3;
  if (s.includes("process") || s.includes("seal") || s.includes("packag")) return 2;
  if (s.includes("qual") || s.includes("certif") || /\blab\b/.test(s)) return 1;
  if (s.includes("harvest")) return 0;
  return 0;
};

const isQuarantinedBatch = (b) => {
  if (!b) return true;
  if (b.isFlagged === true) return true;
  if (b.status === 'Quarantined') return true;
  if (b.stageName && /failed|quarantin|reject/i.test(b.stageName)) return true;
  if (b.testResult && /fail|reject|quarantin/i.test(b.testResult)) return true;
  return false;
};

const getStoredInwardBottles = (batchId, totalJars, stageIdx = 4) => {
  try {
    const raw = localStorage.getItem(`honeychain_inwarded_${batchId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (e) {}
  return [];
};

const getStoredSoldBottles = (batchId) => {
  try {
    const raw = localStorage.getItem(`honeychain_sold_${batchId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
  } catch (e) {}
  return {};
};

const syncSoldBottles = (batchId, soldMap) => {
  if (!batchId) return;
  try {
    localStorage.setItem(`honeychain_sold_${batchId}`, JSON.stringify(soldMap));
  } catch (_) {}
  try {
    const list = Object.entries(soldMap || {}).map(([k, v]) => ({
      bottleNumber: Number(k),
      ...v
    })).filter(x => x.isSold && x.bottleNumber > 0);

    fetch(`${API_BASE_URL}/api/pos/sold-bottles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, soldBottles: list })
    }).catch(() => {});
  } catch (_) {}
};

const syncInwardBottles = (batchId, bottles) => {
  if (!batchId) return;
  try {
    localStorage.setItem(`honeychain_inwarded_${batchId}`, JSON.stringify(bottles));
  } catch (_) {}
  try {
    fetch(`${API_BASE_URL}/api/pos/inward-bottles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, inwardedBottles: bottles })
    }).catch(() => {});
  } catch (_) {}
};

function RetailPOS() {
  const { roleInfo, account: authAccount, currentUser } = useAuth();
  const userRoleTypes = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
  const isAdminInit = userRoleTypes.includes('ADMIN') || Boolean(authAccount && authAccount.toLowerCase() === KVIC_ADMIN_ADDR.toLowerCase()) || currentUser?.roleKey === 'ADMIN';
  const isRetailerInit = userRoleTypes.includes('RETAILER') || currentUser?.roleKey === 'RETAILER';
  const isAuthInit = Boolean(isRetailerInit || isAdminInit);

  const [account, setAccount] = useState(authAccount || "");
  const [contract, setContract] = useState(null);
  const [readContract, setReadContract] = useState(null);
  const readContractRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Active store identity
  const [storeName, setStoreName] = useState("");
  const [editingBranch, setEditingBranch] = useState(false);
  const [branchInputVal, setBranchInputVal] = useState("");
  const [authStatus, setAuthStatus] = useState({
    isAuthorized: isAuthInit,
    isAdmin: isAdminInit,
    isRetailer: Boolean(isRetailerInit || isAdminInit),
  });

  // Sync auth from global context (instant, no RPC needed)
  useEffect(() => {
    const types = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
    const isAdm = types.includes('ADMIN') || Boolean(authAccount && authAccount.toLowerCase() === KVIC_ADMIN_ADDR.toLowerCase()) || currentUser?.roleKey === 'ADMIN';
    const isRet = types.includes('RETAILER') || currentUser?.roleKey === 'RETAILER';
    setAuthStatus(prev => ({
      ...prev,
      isAuthorized: Boolean(isRet || isAdm),
      isAdmin: isAdm,
      isRetailer: Boolean(isRet || isAdm),
    }));
  }, [roleInfo, authAccount, currentUser]);

  // Admin: View-as-Retailer mode
  const [availableRetailers, setAvailableRetailers] = useState([]);
  const [viewAsRetailer, setViewAsRetailer] = useState(null); // { address, name, facility }

  // Batches with Instant Persistent Storage Hydration - strictly excluding quarantined batches
  const cachedInitialBatches = getStoredBatches().filter(b => !isQuarantinedBatch(b));
  // eslint-disable-next-line no-unused-vars
  const [allBatches, setAllBatches] = useState(cachedInitialBatches);
  const [incomingBatches, setIncomingBatches] = useState(() => {
    return cachedInitialBatches.filter(b => {
      if (isQuarantinedBatch(b)) return false;
      const sIdx = parseStageIndex(b.stageIdx !== undefined ? b.stageIdx : b.currentStage);
      if (sIdx < 3) return false;
      const total = parseInt(b.jarsTotal, 10) || 50;
      const inwarded = getStoredInwardBottles(b.batchId, total, sIdx);
      return sIdx === 3 || inwarded.length < total;
    });
  });
  const [inventoryBatches, setInventoryBatches] = useState(() => {
    return cachedInitialBatches.filter(b => {
      if (isQuarantinedBatch(b)) return false;
      const sIdx = parseStageIndex(b.stageIdx !== undefined ? b.stageIdx : b.currentStage);
      const total = parseInt(b.jarsTotal, 10) || 50;
      const inwarded = getStoredInwardBottles(b.batchId, total, sIdx);
      return inwarded.length > 0;
    });
  });
  const [selectedBatchId, setSelectedBatchId] = useState(() => {
    const valid = cachedInitialBatches.filter(b => !isQuarantinedBatch(b));
    const inv = valid.filter(b => {
      const sIdx = parseStageIndex(b.stageIdx !== undefined ? b.stageIdx : b.currentStage);
      return sIdx >= 4;
    });
    return inv.length > 0 ? inv[0].batchId : (valid.length > 0 ? valid[0].batchId : null);
  });
  const [selectedBatchData, setSelectedBatchData] = useState(() => {
    const valid = cachedInitialBatches.filter(b => !isQuarantinedBatch(b));
    const inv = valid.filter(b => {
      const sIdx = parseStageIndex(b.stageIdx !== undefined ? b.stageIdx : b.currentStage);
      return sIdx >= 4;
    });
    return inv.length > 0 ? inv[0] : (valid.length > 0 ? valid[0] : null);
  });
  const [soldBottlesMap, setSoldBottlesMap] = useState({});

  // Active Tab: 'INVENTORY' or 'POS'
  const [activeTab, setActiveTab] = useState("POS");

  // Inwarding Desk State (Simplified: 1. Code Inward, 2. Bulk Inward)
  const [inwardActiveBatchId, setInwardActiveBatchId] = useState(null);
  const [inwardCodeInput, setInwardCodeInput] = useState("");
  const [scannedInwardBottles, setScannedInwardBottles] = useState({});
  const [inwardFeedback, setInwardFeedback] = useState(null);
  const [selectedJarsToInward, setSelectedJarsToInward] = useState([]);

  // POS Checkout Form
  const [qrScanInput, setQrScanInput] = useState("");
  const [selectedBottleNum, setSelectedBottleNum] = useState("");
  const [customerName, setCustomerName] = useState("Rajesh Sharma");
  const [customerPhone, setCustomerPhone] = useState("9876543210");
  const [paymentMethod, setPaymentMethod] = useState("UPI");
  const [scannerFeedback, setScannerFeedback] = useState(null);

  // E-Bill Modal
  const [generatedBill, setGeneratedBill] = useState(null);
  const [showBillModal, setShowBillModal] = useState(false);

  useEffect(() => {
    let isMounted = true;
    init(isMounted);

    const handleUpdate = () => {
      invalidateContractCache('retailpos_all_batches');
      const activeContract = readContractRef.current || readContract;
      if (activeContract && isMounted) {
        loadAllBatches(activeContract, isMounted);
      }
    };

    window.addEventListener("honeychain_batch_updated", handleUpdate);
    window.addEventListener("honeychain_directory_updated", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    const handleAccounts = async (newAccs) => {
      if (!isMounted) return;
      const acc = newAccs[0] || "";
      setAccount(acc);
      let activeContract = readContractRef.current;
      if (!activeContract) {
        try {
          const inst = await getContractInstance();
          activeContract = inst.readContract;
          readContractRef.current = activeContract;
          setReadContract(activeContract);
          setContract(inst.writeContract);
        } catch (e) {}
      }
      if (activeContract) {
        const [authResult, entities] = await Promise.all([
          checkAuth(acc, activeContract),
          fetchAuthorizedEntities(activeContract).catch(() => ({
            retailers: [],
          })),
        ]);
        const rList = entities.retailers || [];
        setAvailableRetailers(rList);
        await loadAllBatches(
          activeContract,
          isMounted,
          undefined,
          acc,
          authResult,
          rList,
        );
      }
    };

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccounts);
    }

    return () => {
      isMounted = false;
      window.removeEventListener("honeychain_batch_updated", handleUpdate);
      window.removeEventListener("honeychain_directory_updated", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
      if (window.ethereum && window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccounts);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuth = async (acc, rContract) => {
    const isAdmFallback = Boolean(roleInfo?.types?.includes('ADMIN') || currentUser?.roleKey === 'ADMIN');
    const isRetFallback = Boolean(roleInfo?.types?.includes('RETAILER') || currentUser?.roleKey === 'RETAILER');
    if (!acc || !rContract) {
      const res = { isAuthorized: Boolean(isRetFallback || isAdmFallback), isAdmin: isAdmFallback, isRetailer: isRetFallback };
      setAuthStatus(res);
      return res;
    }
    try {
      const cleanAcc = acc.toLowerCase().trim();
      const isAdm = Boolean((await checkIsAdmin(rContract, cleanAcc)) || (cleanAcc === KVIC_ADMIN_ADDR.toLowerCase()) || isAdmFallback);
      const isRet = await rContract.methods
        .authorizedRetailers(cleanAcc)
        .call()
        .catch(() => false);
      const isRetFinal = Boolean(isRet || isRetFallback);
      const result = {
        isAuthorized: Boolean(isRetFinal || isAdm),
        isAdmin: Boolean(isAdm),
        isRetailer: Boolean(isRetFinal),
      };
      setAuthStatus(result);
      return result;
    } catch (e) {
      console.warn("Auth check error:", e);
      const res = { isAuthorized: Boolean(isRetFallback || isAdmFallback), isAdmin: isAdmFallback, isRetailer: isRetFallback };
      setAuthStatus(res);
      return res;
    }
  };

  const init = async (isMounted = true) => {
    // Only show full loading spinner if we don't have any cached batches yet
    const hasCachedData = (cachedInitialBatches && cachedInitialBatches.length > 0);
    if (!hasCachedData) {
      setLoading(true);
    }
    try {
      const {
        readContract: rContract,
        writeContract,
        userAccount,
      } = await getContractInstance();
      if (!isMounted) return;
      setContract(writeContract);
      setReadContract(rContract);
      readContractRef.current = rContract;

      // Prioritize authenticated role account
      let curAccount = currentUser?.address || authAccount;
      if (!curAccount && window.ethereum?.selectedAddress) {
        curAccount = window.ethereum.selectedAddress;
      }
      if (!curAccount) curAccount = userAccount;
      if (curAccount && isMounted) {
        setAccount(curAccount);
      }

      // 1. Fetch authorized entities FIRST so retailers are available before filtering batches
      const entities = await fetchAuthorizedEntities(rContract).catch(() => ({
        retailers: [],
      }));
      const rList = entities?.retailers || [];
      if (isMounted) {
        setAvailableRetailers(rList);
      }

      const isAdmRole = Boolean(
        currentUser?.roleKey === 'ADMIN' || 
        roleInfo?.types?.includes('ADMIN') || 
        isAdminInit ||
        (curAccount && curAccount.toLowerCase() === KVIC_ADMIN_ADDR.toLowerCase())
      );
      const isRetRole = Boolean(
        currentUser?.roleKey === 'RETAILER' || 
        roleInfo?.type === 'RETAILER' ||
        roleInfo?.types?.includes('RETAILER')
      );
      const curAuthStatus = {
        isAuthorized: Boolean(isRetRole || isAdmRole),
        isAdmin: isAdmRole,
        isRetailer: isRetRole,
      };
      if (isMounted) {
        setAuthStatus(curAuthStatus);
      }

      let activeRetailerAddr = undefined;
      if (isRetRole) {
        activeRetailerAddr = (currentUser?.address || curAccount || '').toLowerCase().trim();
        const matched = rList.find(
          (r) => (r.address || "").toLowerCase().trim() === activeRetailerAddr
        );
        if (matched) {
          setStoreName(matched.name || matched.facility || 'Retail Store');
        } else if (currentUser?.name) {
          setStoreName(currentUser.name);
        }
      } else if (isAdmRole) {
        if (rList.length > 0) {
          activeRetailerAddr = rList[0].address.toLowerCase().trim();
          if (isMounted) {
            setViewAsRetailer(rList[0]);
            setStoreName(rList[0].name || rList[0].facility || 'KVIC Khadi Gramodyog Bhavan');
          }
        } else {
          setStoreName('KVIC Khadi Gramodyog Bhavan (Central Audit)');
        }
      }

      // 2. Now load all batches with retailer entities already populated!
      await loadAllBatches(
        rContract,
        isMounted,
        activeRetailerAddr,
        curAccount,
        curAuthStatus,
        rList,
      );

      fetch(`${API_BASE_URL}/api/pos/inward-bottles`)
        .then(r => r.json())
        .then(data => {
          if (data?.success && data?.inwardedBottles && isMounted) {
            setScannedInwardBottles(prev => ({ ...data.inwardedBottles, ...prev }));
            Object.entries(data.inwardedBottles).forEach(([bId, arr]) => {
              try {
                localStorage.setItem(`honeychain_inwarded_${bId}`, JSON.stringify(arr));
              } catch (_) {}
            });
          }
        })
        .catch(() => {});
    } catch (err) {
      console.error("RetailPOS init error:", err);
      if (isMounted && !hasCachedData) {
        setNotification({
          type: "danger",
          message: "Initialization notice: " + err.message,
        });
      }
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  // parseStageIndex, STAGE_MAP, isQuarantinedBatch, and getStoredInwardBottles are defined at module level above

  const loadAllBatches = async (
    rContract,
    isMounted = true,
    overrideRetailer = undefined,
    overrideAccount = undefined,
    overrideAuth = undefined,
    overrideRetailerList = undefined,
  ) => {
    try {
      const curContract = rContract || readContract;
      if (!curContract) return;

      const { list } = await cachedCall(async () => {
        let totalBatches = 0;
        try {
          totalBatches = parseInt(await curContract.methods.batchCount().call());
        } catch (chainErr) {
          console.warn(
            'Chain unreachable — rendering local records only:',
            chainErr.message,
          );
          return { list: [], chainReachable: false, failedReads: 0 };
        }
        if (!totalBatches || totalBatches === 0) {
          return { list: [], chainReachable: true, failedReads: 0 };
        }

        const batchPromises = [];
        for (let i = 1; i <= totalBatches; i++) {
          batchPromises.push(
            (async (batchId) => {
              try {
                const [basic, status, custody, soldIds] = await Promise.all([
                  curContract.methods.getBatchBasic(batchId).call(),
                  curContract.methods.getBatchStatus(batchId).call(),
                  curContract.methods
                    .getBatchCustody(batchId)
                    .call()
                    .catch(() => ({
                      assignedDistributor: "",
                      assignedRetailer: "",
                      targetDestination: "",
                    })),
                  curContract.methods
                    .getSoldBottles(batchId)
                    .call()
                    .catch(() => []),
                ]);

                const stageName = status.currentStage;
                const stageIdx = parseStageIndex(stageName);

                const onChainSoldCount = (soldIds || []).length;
                const counterSold = parseInt(status.jarsSold) || 0;
                if (counterSold !== onChainSoldCount) {
                  console.warn(
                    `Batch #${batchId}: jarsSold counter (${counterSold}) disagrees with ` +
                      `per-bottle on-chain sale records (${onChainSoldCount}). Showing on-chain records.`,
                  );
                }

                // Resolve assigned retailer address
                let assignedRet = (custody.assignedRetailer || "")
                  .toLowerCase()
                  .trim();

                return {
                  batchId,
                  batchCode: basic.batchCode,
                  beekeeperName: basic.beekeeperName,
                  clusterLocation: basic.clusterLocation,
                  floraName: basic.floraName,
                  harvestTimestamp: basic.harvestTimestamp,
                  yieldWeightKg: status.yieldWeightKg,
                  jarsTotal:
                    parseInt(status.jarsTotal) ||
                    parseInt(status.yieldWeightKg) * 2,
                  // On-chain per-bottle sale records are the ONLY source of truth for "sold".
                  // The aggregate jarsSold counter can drift, so it must never be able to
                  // report sold bottles that the shelf grid cannot actually show.
                  jarsSold: onChainSoldCount,
                  soldBottleIds: (soldIds || []).map(Number),
                  chainVerified: true,
                  stageName,
                  stageIdx,
                  isCertifiedPure: status.isCertifiedPure,
                  isFlagged: status.isFlagged,
                  assignedRetailer: assignedRet,
                  targetDestination: custody.targetDestination,
                };
              } catch (bErr) {
                console.warn(`Error loading batch #${batchId}:`, bErr);
                return null;
              }
            })(i),
          );
        }

        const rawResults = await Promise.all(batchPromises);
        const results = rawResults.filter(Boolean);
        // Track transient per-batch read failures — they must never cause local data loss
        return {
          list: results,
          chainReachable: true,
          failedReads: rawResults.length - results.length,
        };
      }, 'retailpos_all_batches', 1500);

      const normalizeBatch = (raw) => {
        if (!raw) return null;
        const total = parseInt(raw.jarsTotal, 10) || (parseInt(raw.yieldWeightKg, 10) ? parseInt(raw.yieldWeightKg, 10) * 2 : 50);
        const sold = parseInt(raw.jarsSold, 10) || 0;
        const sIdx = parseStageIndex(raw.stageIdx !== undefined ? raw.stageIdx : raw.currentStage || raw.stageName);
        return {
          ...raw,
          jarsTotal: total,
          jarsSold: sold,
          soldBottleIds: raw.soldBottleIds || (Array.isArray(raw.soldBottles) ? raw.soldBottles.map(s => Number(s.bottleNumber)) : []),
          stageIdx: sIdx,
          isFlagged: Boolean(raw.isFlagged),
          isCertifiedPure: Boolean(raw.isCertifiedPure),
        };
      };

      const serverBatches = await fetchBatchesFromServer().catch(() => []);
      const stored = (serverBatches && serverBatches.length > 0) ? serverBatches : getStoredBatches();
      const map = new Map();
      list.forEach((b) => {
        const k = (b.batchCode || b.batchId || '').toString().toUpperCase();
        if (k) map.set(k, { ...normalizeBatch(b), chainVerified: true });
      });
      stored.forEach((b) => {
        const k = (b.batchCode || b.batchId || '').toString().toUpperCase();
        const norm = normalizeBatch(b);
        if (k && !map.has(k)) {
          map.set(k, { ...norm, chainVerified: false });
        } else if (k && map.has(k)) {
          const existing = map.get(k);
          map.set(k, {
            ...norm,
            ...existing,
            soldBottles: (norm && norm.soldBottles) || existing.soldBottles,
            inwardedBottles: (norm && norm.inwardedBottles) || existing.inwardedBottles,
            chainVerified: true
          });
        }
      });
      const merged = Array.from(map.values()).sort(
        (a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0),
      );

      saveStoredBatches(
        merged.map(({ chainVerified: _chainVerified, ...rest }) => rest),
      );

      if (!isMounted) return;
      setAllBatches(merged);

      // Determine active retailer wallet for filtering
      const curAccount = (
        overrideAccount !== undefined
          ? overrideAccount
          : currentUser?.address || account || ""
      )
        .toLowerCase()
        .trim();
      const curAuth = overrideAuth !== undefined ? overrideAuth : authStatus;
      const isAdm = Boolean(curAuth.isAdmin);
      const isRet = Boolean(
        curAuth.isRetailer ||
        currentUser?.roleKey === 'RETAILER' ||
        roleInfo?.type === 'RETAILER'
      );
      const rList = overrideRetailerList || availableRetailers;

      let activeRetailerAddr = "";
      if (overrideRetailer !== undefined) {
        activeRetailerAddr = overrideRetailer
          ? overrideRetailer.toLowerCase().trim()
          : "";
      } else if (isRet) {
        activeRetailerAddr = (currentUser?.address || curAccount || "").toLowerCase().trim();
      } else if (isAdm && viewAsRetailer) {
        activeRetailerAddr = (viewAsRetailer.address || "")
          .toLowerCase()
          .trim();
      } else if (isAdm) {
        if (rList && rList.length > 0) {
          activeRetailerAddr = rList[0].address.toLowerCase().trim();
          setViewAsRetailer(rList[0]);
        }
      } else {
        activeRetailerAddr = curAccount;
      }

      // Sync active store name
      if (activeRetailerAddr && rList && rList.length > 0) {
        const matched = rList.find(
          (r) => (r.address || "").toLowerCase().trim() === activeRetailerAddr,
        );
        if (matched) {
          setStoreName(
            matched.name ||
              matched.facility ||
              `Retail Store (${matched.address.substring(0, 8)}...)`,
          );
        } else if (currentUser?.name && isRet) {
          setStoreName(currentUser.name);
        } else {
          setStoreName(
            activeRetailerAddr
              ? `Retail Store (${activeRetailerAddr.substring(0, 8)}...)`
              : "Retail Store",
          );
        }
      } else if (currentUser?.name && isRet) {
        setStoreName(currentUser.name);
      }

      // FILTER INCOMING: Only batches dispatched to transit (Stage 3) or at retail (Stage 4) with pending jars.
      // Quarantined / Flagged batches (e.g. failed lab purity) MUST NEVER appear in retail inwarding!
      const incoming = merged.filter((b) => {
        if (b.isFlagged || b.status === 'Quarantined' || (b.stageName && /failed|quarantin|reject/i.test(b.stageName))) {
          return false;
        }
        const sIdx = parseStageIndex(b.stageIdx !== undefined ? b.stageIdx : b.currentStage);
        if (sIdx < 3) return false;

        const total = parseInt(b.jarsTotal, 10) || 50;
        const inwarded = getStoredInwardBottles(b.batchId, total, sIdx);
        const isPartiallyInwarded = inwarded.length < total;

        if (sIdx === 3) return true;
        return isPartiallyInwarded;
      });
      setIncomingBatches(incoming);

      // FILTER INVENTORY: Only batches that have ACTUAL inwarded bottles in store stock
      let inventory = merged.filter((b) => {
        if (b.isFlagged || b.status === 'Quarantined' || (b.stageName && /failed|quarantin|reject/i.test(b.stageName))) {
          return false;
        }
        const sIdx = parseStageIndex(b.stageIdx !== undefined ? b.stageIdx : b.currentStage);
        const total = parseInt(b.jarsTotal, 10) || 50;
        const inwarded = getStoredInwardBottles(b.batchId, total, sIdx);
        return inwarded.length > 0;
      });

      setInventoryBatches(inventory);

      // Auto-select first inventory batch if current selection is invalid or null
      const currentSelected = inventory.find(
        (b) => String(b.batchId) === String(selectedBatchId),
      );
      const targetBatch = currentSelected || (inventory.length > 0 ? inventory[0] : null);
      if (targetBatch) {
        await selectBatch(targetBatch.batchId, curContract, isMounted, targetBatch);
      } else {
        setSelectedBatchId(null);
        setSelectedBatchData(null);
      }
    } catch (err) {
      console.error("loadAllBatches error:", err);
    }
  };

  const selectBatch = async (batchId, rContractInstance, isMounted = true, preloadedBatch = null) => {
    setSelectedBatchId(batchId);
    const storedSold = getStoredSoldBottles(batchId);

    // Hydrate immediately from preloadedBatch.soldBottleIds (from blockchain getSoldBottles) or soldBottles
    const initialMapping = { ...storedSold };
    if (preloadedBatch && Array.isArray(preloadedBatch.soldBottleIds)) {
      preloadedBatch.soldBottleIds.forEach(bNum => {
        const n = Number(bNum);
        if (n > 0) {
          initialMapping[n] = {
            isSold: true,
            bottleNumber: n,
            customerName: "Verified Consumer",
            invoiceNumber: "",
            saleTimestamp: Math.floor(Date.now() / 1000)
          };
        }
      });
    }
    if (preloadedBatch && Array.isArray(preloadedBatch.soldBottles)) {
      preloadedBatch.soldBottles.forEach(sb => {
        const bNum = Number(sb.bottleNumber);
        if (bNum > 0) {
          initialMapping[bNum] = {
            isSold: true,
            bottleNumber: bNum,
            customerName: sb.customerName || initialMapping[bNum]?.customerName || "Verified Consumer",
            invoiceNumber: sb.invoiceNumber || initialMapping[bNum]?.invoiceNumber || "",
            saleTimestamp: sb.saleTimestamp || initialMapping[bNum]?.saleTimestamp
          };
        }
      });
    }
    setSoldBottlesMap(prev => ({ ...prev, ...initialMapping }));

    // Fetch server sold-bottles asynchronously right away (doesn't gate on contract)
    fetch(`${API_BASE_URL}/api/pos/sold-bottles/${batchId}`)
      .then(r => r.json())
      .then(srvRes => {
        if (srvRes && Array.isArray(srvRes.soldBottles) && isMounted) {
          setSoldBottlesMap(prev => {
            const upd = { ...prev };
            srvRes.soldBottles.forEach(sb => {
              const bNum = Number(sb.bottleNumber);
              if (bNum > 0) {
                upd[bNum] = {
                  isSold: true,
                  bottleNumber: bNum,
                  customerName: sb.customerName || upd[bNum]?.customerName || "Verified Consumer",
                  invoiceNumber: sb.invoiceNumber || upd[bNum]?.invoiceNumber || "",
                  saleTimestamp: sb.saleTimestamp || upd[bNum]?.saleTimestamp,
                };
              }
            });
            syncSoldBottles(batchId, upd);
            return upd;
          });
        }
      })
      .catch(() => {});

    const cleanPreloaded = preloadedBatch ? {
      ...preloadedBatch,
      jarsTotal: parseInt(preloadedBatch.jarsTotal, 10) || (parseInt(preloadedBatch.yieldWeightKg, 10) ? parseInt(preloadedBatch.yieldWeightKg, 10) * 2 : 50),
      jarsSold: parseInt(preloadedBatch.jarsSold, 10) || 0
    } : null;

    if (cleanPreloaded) {
      setSelectedBatchData(cleanPreloaded);
    }
    const rContract = rContractInstance || readContract;
    if (!rContract) {
      if (cleanPreloaded && isMounted) {
        setSelectedBatchData(cleanPreloaded);
      }
      return;
    }

    try {
      let bData = cleanPreloaded;
      let soldIds = [];

      if (!bData) {
        const [basic, status, custody, sIds] = await Promise.all([
          rContract.methods.getBatchBasic(batchId).call(),
          rContract.methods.getBatchStatus(batchId).call(),
          rContract.methods
            .getBatchCustody(batchId)
            .call()
            .catch(() => ({
              assignedDistributor: "",
              assignedRetailer: "",
              targetDestination: "",
            })),
          rContract.methods
            .getSoldBottles(batchId)
            .call()
            .catch(() => []),
        ]);
        soldIds = sIds;
        const total = parseInt(status.jarsTotal) || (parseInt(status.yieldWeightKg) ? parseInt(status.yieldWeightKg) * 2 : 50);
        const sold = parseInt(status.jarsSold) || (sIds || []).length || 0;
        bData = {
          batchId,
          batchCode: basic.batchCode,
          floraName: basic.floraName,
          beekeeperName: basic.beekeeperName,
          clusterLocation: basic.clusterLocation,
          harvestTimestamp: basic.harvestTimestamp,
          yieldWeightKg: status.yieldWeightKg,
          jarsTotal: total,
          jarsSold: sold,
          stageName: status.currentStage,
          targetDestination: custody.targetDestination,
          assignedRetailer: custody.assignedRetailer,
        };
      } else {
        soldIds = await rContract.methods
          .getSoldBottles(batchId)
          .call()
          .catch(() => []);
      }

      const mapping = { ...storedSold };
      await Promise.all(
        (soldIds || []).map(async (id) => {
          const s = parseInt(id);
          try {
            const saleInfo = await rContract.methods
              .getBottleSale(batchId, s)
              .call();
            mapping[s] = {
              isSold: true,
              customerName: saleInfo.customerName || mapping[s]?.customerName || "Verified Consumer",
              invoiceNumber: saleInfo.invoiceNumber || mapping[s]?.invoiceNumber || "",
              saleTimestamp: saleInfo.saleTimestamp || mapping[s]?.saleTimestamp,
            };
          } catch (sErr) {
            mapping[s] = { isSold: true, ...mapping[s] };
          }
        }),
      );

      // Merge server-side sold records if available
      try {
        const srvRes = await fetch(`${API_BASE_URL}/api/pos/sold-bottles/${batchId}`).then(r => r.json()).catch(() => null);
        if (srvRes && Array.isArray(srvRes.soldBottles)) {
          srvRes.soldBottles.forEach(sb => {
            const bNum = Number(sb.bottleNumber);
            mapping[bNum] = {
              isSold: true,
              bottleNumber: bNum,
              customerName: sb.customerName || mapping[bNum]?.customerName || "Verified Consumer",
              invoiceNumber: sb.invoiceNumber || mapping[bNum]?.invoiceNumber || "",
              saleTimestamp: sb.saleTimestamp || mapping[bNum]?.saleTimestamp,
            };
          });
        }
      } catch (_) {}

      syncSoldBottles(batchId, mapping);

      if (!isMounted) return;

      const safeTotal = parseInt(bData.jarsTotal, 10) || (parseInt(bData.yieldWeightKg, 10) ? parseInt(bData.yieldWeightKg, 10) * 2 : 50);
      const totalSoldKnown = Object.keys(mapping).length;
      const safeSold = Math.max(parseInt(bData.jarsSold, 10) || 0, (soldIds || []).length || 0, totalSoldKnown);

      setSelectedBatchData({
        ...bData,
        jarsTotal: safeTotal,
        jarsSold: safeSold,
      });
      setSoldBottlesMap(prev => ({ ...prev, ...mapping }));
      setScannerFeedback(null);
      setQrScanInput("");
      setSelectedBottleNum("");
      setSelectedJarsToInward([]);
    } catch (err) {
      console.error("Error selecting batch:", err);
    }
  };


  const handleInwardSingleBottle = async (targetBatch, rawInput) => {
    if (!authStatus.isRetailer && !authStatus.isAdmin) {
      setInwardFeedback({
        type: "error",
        message: `Unauthorized Role: Certified Retailer Required!`,
        detail: `Please connect with a verified Retail Store account to inward inventory.`,
      });
      return;
    }
    if (!rawInput || !rawInput.trim()) return;
    const trimmed = rawInput.trim();
    setInwardFeedback(null);

    const bId = targetBatch.batchId;
    const hTime = targetBatch.harvestTimestamp || 0;
    const bCode = targetBatch.batchCode || "HONEY";
    const total = targetBatch.jarsTotal || 50;

    let bottleNum = null;
    let matchedPin = "";

    // If input is a plain jar number (e.g. "1", "#1", "25"), resolve it directly for this batch
    const numMatch = trimmed.match(/^#?(\d+)$/);
    if (numMatch) {
      const parsedNum = parseInt(numMatch[1], 10);
      if (parsedNum >= 1 && parsedNum <= total) {
        bottleNum = parsedNum;
        matchedPin = getBottleSecurityToken(bId, bottleNum, hTime, bCode);
      }
    }

    // Authenticate against cryptographic Security PIN or Unique Serial
    const cleanUpper = trimmed.toUpperCase().replace(/\s+/g, "");
    const stripped = cleanUpper.replace(/-/g, "");

    for (let u = 1; u <= total; u++) {
      const token = getBottleSecurityToken(bId, u, hTime, bCode);
      const serial = getUniqueBottleSerial(bCode, u, token);
      const tokenStripped = token.replace(/-/g, "");
      const serialStripped = serial.replace(/-/g, "");
      const jarSerial = `${bCode}-JAR-${String(u).padStart(4, "0")}`.toUpperCase();

      if (
        cleanUpper === token ||
        stripped === tokenStripped ||
        cleanUpper === serial ||
        stripped === serialStripped ||
        cleanUpper === jarSerial ||
        cleanUpper.includes(`JAR-${String(u).padStart(4, "0")}`) ||
        cleanUpper.includes(`JAR-${u}`)
      ) {
        bottleNum = u;
        matchedPin = token;
        break;
      }
    }

    if (!bottleNum || bottleNum < 1 || bottleNum > total) {
      // Check if this Security PIN or Serial belongs to ANOTHER batch in the ecosystem!
      let foreignMatch = null;
      const otherBatches = (allBatches || []).filter(
        (b) => String(b.batchId) !== String(bId),
      );

      for (const ob of otherBatches) {
        const obTotal =
          parseInt(ob.jarsTotal) ||
          parseInt(ob.yieldWeightKg || 25) * 2 ||
          50;
        const obHTime = ob.harvestTimestamp || 0;
        const obCode = ob.batchCode || "HONEY";

        for (let u = 1; u <= obTotal; u++) {
          const obToken = getBottleSecurityToken(
            ob.batchId,
            u,
            obHTime,
            obCode,
          );
          const obSerial = getUniqueBottleSerial(obCode, u, obToken);
          const obTokenStripped = obToken.replace(/-/g, "");
          const obSerialStripped = obSerial.replace(/-/g, "");
          const obJarSerial =
            `${obCode}-JAR-${String(u).padStart(4, "0")}`.toUpperCase();

          if (
            cleanUpper === obToken ||
            stripped === obTokenStripped ||
            cleanUpper === obSerial ||
            stripped === obSerialStripped ||
            cleanUpper === obJarSerial ||
            cleanUpper.includes(`JAR-${String(u).padStart(4, "0")}`)
          ) {
            foreignMatch = {
              batch: ob,
              bottleNum: u,
              token: obToken,
              serial: obSerial,
            };
            break;
          }
        }
        if (foreignMatch) break;
      }

      if (foreignMatch) {
        const foreignStore =
          foreignMatch.batch.targetDestination ||
          (foreignMatch.batch.assignedRetailer &&
          foreignMatch.batch.assignedRetailer !==
            "0x0000000000000000000000000000000000000000"
            ? getEntityFriendlyName(
                foreignMatch.batch.assignedRetailer,
                "RETAILER",
              )
            : "Another Authorized Retailer");
        const foreignBatchCode =
          foreignMatch.batch.batchCode ||
          `Batch #${foreignMatch.batch.batchId}`;
        const foreignInwardedList = getStoredInwardBottles(
          foreignMatch.batch.batchId,
          foreignMatch.batch.jarsTotal || 50,
          foreignMatch.batch.stageIdx,
        );
        const isAlreadyInwarded =
          foreignInwardedList.includes(foreignMatch.bottleNum) ||
          foreignMatch.batch.stageIdx >= 4;

        setInwardFeedback({
          type: "error",
          message: `Cross-Store Inventory Diversion Detected!`,
          detail: `Bottle Security PIN "${trimmed}" (Jar #${foreignMatch.bottleNum}) belongs to ${foreignBatchCode}, which was assigned exclusively to "${foreignStore}"${isAlreadyInwarded ? " and has already been inwarded into their store stock" : ""}! You cannot inward inventory assigned to another retail store.`,
        });
        return;
      }

      setInwardFeedback({
        type: "error",
        message: `Counterfeit / Unverified Code Rejection!`,
        detail: `Security code "${trimmed}" could not be authenticated against Batch #${bId} (${bCode}) or any authorized consignment. Verify the bottle seal or click the jar in the consignment grid below.`,
      });
      return;
    }

    const currentStoreWallet = (account || "").toLowerCase().trim();
    const assignedWallet = (targetBatch.assignedRetailer || "")
      .toLowerCase()
      .trim();
    const isAssigned =
      !assignedWallet ||
      assignedWallet === currentStoreWallet ||
      (viewAsRetailer &&
        viewAsRetailer.address.toLowerCase().trim() === assignedWallet);

    if (!isAssigned) {
      const assignedName =
        targetBatch.targetDestination ||
        (targetBatch.assignedRetailer
          ? `${targetBatch.assignedRetailer.substring(0, 8)}...`
          : "Another Authorized Retailer");
      setInwardFeedback({
        type: "error",
        message: `Theft / Cross-Store Rejection: Unauthorized Store!`,
        detail: `Bottle #${bottleNum} (PIN: ${matchedPin}, Batch: ${bCode}) is assigned exclusively to "${assignedName}". Your active store counter is unauthorized to inward this batch inventory!`,
      });
      return;
    }

    // Check if bottle has already been sold on blockchain!
    const activeC = readContractRef.current || readContract || contract;
    if (activeC && activeC.methods.getBottleSale) {
      try {
        const saleInfo = await activeC.methods
          .getBottleSale(bId, bottleNum)
          .call();
        if (
          saleInfo &&
          (saleInfo.isSold ||
            (saleInfo.bottleNumber && String(saleInfo.bottleNumber) !== "0"))
        ) {
          const saleDate =
            saleInfo.saleTimestamp && parseInt(saleInfo.saleTimestamp) > 0
              ? new Date(
                  parseInt(saleInfo.saleTimestamp) * 1000,
                ).toLocaleDateString()
              : "";
          setInwardFeedback({
            type: "error",
            message: `Fraud Rejection: Bottle #${bottleNum} is already sold!`,
            detail: `This bottle was already purchased on-chain by ${saleInfo.customerName || "Consumer"} (Invoice: ${saleInfo.invoiceNumber || "N/A"}${saleDate ? ` on ${saleDate}` : ""}). Cannot inward already sold or consumed inventory!`,
          });
          return;
        }
      } catch (err) {
        console.warn("getBottleSale check error in POS:", err);
      }
    }
    const currentScanned =
      scannedInwardBottles[bId] !== undefined
        ? scannedInwardBottles[bId]
        : getStoredInwardBottles(
            bId,
            targetBatch.jarsTotal,
            targetBatch.stageIdx,
          );

    if (currentScanned.includes(bottleNum)) {
      setInwardFeedback({
        type: "warning",
        message: `Bottle #${bottleNum} is already inwarded in store inventory.`,
        detail: `Stock: ${currentScanned.length} of ${targetBatch.jarsTotal} bottles inwarded.`,
      });
      return;
    }

    // If batch is at Stage 3 on-chain, commit stockAtRetail
    if (targetBatch.stageIdx === 3) {
      try {
        setLoading(true);
        await executeBlockchainRelayer('stock-retail', {
          batchId: bId,
          storeLocation: targetBatch.targetDestination || storeName
        });
      } catch (err) {
        console.error("stockAtRetail error:", err);
        setInwardFeedback({
          type: "error",
          message:
            "Stock inwarding failed: " +
            (err.message || "Ensure you are the assigned retailer or admin."),
        });
        setLoading(false);
        return;
      } finally {
        setLoading(false);
      }
    }

    const updated = [...currentScanned, bottleNum].sort((a, b) => a - b);
    setScannedInwardBottles((prev) => ({ ...prev, [bId]: updated }));
    syncInwardBottles(bId, updated);
    setInwardCodeInput("");

    updateStoredBatchStage(bId, {
      stageIdx: 4,
      currentStage: "Stocked at Retail",
      stageName: "Stocked at Retail",
      storeLocation: targetBatch.targetDestination || storeName || "KVIC Retail Store",
      historyEvent: {
        stage: 4,
        stageName: "At Retail",
        actor: storeName || currentUser?.name || "KVIC Retail Store",
        location: targetBatch.targetDestination || "KVIC Retail Store",
        timestamp: Math.floor(Date.now() / 1000),
        notes: `Bottle #${bottleNum} inwarded into store shelf stock (${updated.length}/${targetBatch.jarsTotal || 50} stocked).`
      }
    });
    window.dispatchEvent(new Event('honeychain_batch_updated'));
    window.dispatchEvent(new Event('honeychain_batches_updated'));

    setInwardFeedback({
      type: "success",
      message: `Bottle #${bottleNum} (PIN: ${matchedPin}) Inwarded & Stocked!`,
      detail: `Cryptographic seal verified. Active store shelf stock: ${updated.length} of ${targetBatch.jarsTotal} bottles inwarded.`,
    });

    const activeContract = readContractRef.current || readContract;
    await loadAllBatches(activeContract);
    selectBatch(bId, activeContract);
  };

  // Helper for single-by-single bottle inwarding until all are stocked
  const handleInwardNextSingle = async (targetBatch) => {
    if (!authStatus.isRetailer && !authStatus.isAdmin) {
      setInwardFeedback({
        type: "error",
        message: "Access Denied: Please log in with a certified Retailer or Admin account to inward inventory."
      });
      return;
    }
    if (!targetBatch) return;
    const bId = targetBatch.batchId;
    const total = targetBatch.jarsTotal || (targetBatch.yieldWeightKg ? parseInt(targetBatch.yieldWeightKg) * 2 : 50);
    const currentScanned =
      scannedInwardBottles[bId] !== undefined
        ? scannedInwardBottles[bId]
        : getStoredInwardBottles(bId, total, targetBatch.stageIdx);
    const pending = Array.from({ length: total }, (_, i) => i + 1).filter(n => !currentScanned.includes(n));
    if (pending.length === 0) {
      setInwardFeedback({
        type: "success",
        message: `All ${total} bottles in Batch #${bId} are already stocked!`,
        detail: "Consignment is 100% stocked in store shelf inventory."
      });
      return;
    }
    const nextJar = pending[0];
    const hTime = targetBatch.harvestTimestamp || 0;
    const bCode = targetBatch.batchCode || "HONEY";
    const token = getBottleSecurityToken(bId, nextJar, hTime, bCode);
    await handleInwardSingleBottle(targetBatch, token);
  };

  const handleInwardAllBottles = async (targetBatch) => {
    if (!authStatus.isRetailer && !authStatus.isAdmin) {
      setInwardFeedback({
        type: "error",
        message: `Unauthorized Role: Certified Retailer or Administrator Required!`,
        detail: `Please connect with a verified Retail Store account to inward inventory.`,
      });
      return;
    }
    setLoading(true);
    setInwardFeedback(null);
    try {
      const bId = targetBatch.batchId;
      if (targetBatch.stageIdx === 3) {
        await executeBlockchainRelayer('stock-retail', {
          batchId: bId,
          storeLocation: targetBatch.targetDestination || storeName
        });
      }

      const allNums = Array.from(
        { length: targetBatch.jarsTotal },
        (_, i) => i + 1,
      );
      setScannedInwardBottles((prev) => ({ ...prev, [bId]: allNums }));
      syncInwardBottles(bId, allNums);

      updateStoredBatchStage(bId, {
        stageIdx: 4,
        currentStage: "Stocked at Retail",
        stageName: "Stocked at Retail",
        storeLocation: targetBatch.targetDestination || storeName || "KVIC Retail Store",
        historyEvent: {
          stage: 4,
          stageName: "At Retail",
          actor: storeName || currentUser?.name || "KVIC Retail Store",
          location: targetBatch.targetDestination || "KVIC Retail Store",
          timestamp: Math.floor(Date.now() / 1000),
          notes: `All ${targetBatch.jarsTotal} bottles inwarded into store shelf stock.`
        }
      });
      window.dispatchEvent(new Event('honeychain_batch_updated'));
      window.dispatchEvent(new Event('honeychain_batches_updated'));

      setInwardFeedback({
        type: "success",
        message: `All ${targetBatch.jarsTotal} Bottles Inwarded!`,
        detail: `Consignment #${bId} is now 100% stocked in store shelf inventory.`,
      });

      const activeContract = readContractRef.current || readContract;
      await loadAllBatches(activeContract);
      selectBatch(bId, activeContract);
      setActiveTab("INVENTORY");
      setInwardActiveBatchId(null);
    } catch (err) {
      console.error("Inward all error:", err);
      setInwardFeedback({
        type: "error",
        message:
          "Bulk inwarding failed: " +
          (err.message || "Check transaction status."),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInwardMultipleBottles = async (targetBatch, jarNums) => {
    if (!authStatus.isRetailer && !authStatus.isAdmin) {
      setInwardFeedback({
        type: "error",
        message: "Access Denied: Please log in with a certified Retailer or Admin account to inward inventory."
      });
      return;
    }
    if (!targetBatch || !jarNums || jarNums.length === 0) {
      setInwardFeedback({
        type: "warning",
        message: "Please select at least one bottle to inward."
      });
      return;
    }
    setLoading(true);
    setInwardFeedback(null);
    try {
      const bId = targetBatch.batchId;
      const total = targetBatch.jarsTotal || 50;

      // Commit on-chain stock custody if stage is 3
      if (targetBatch.stageIdx === 3) {
        await executeBlockchainRelayer('stock-retail', {
          batchId: bId,
          storeLocation: targetBatch.targetDestination || storeName
        });
      }

      const currentScanned =
        scannedInwardBottles[bId] !== undefined
          ? scannedInwardBottles[bId]
          : getStoredInwardBottles(bId, total, targetBatch.stageIdx);

      const newlyInwarded = jarNums.filter((n) => !currentScanned.includes(n));
      const updated = [...new Set([...currentScanned, ...newlyInwarded])].sort(
        (a, b) => a - b,
      );

      setScannedInwardBottles((prev) => ({ ...prev, [bId]: updated }));
      syncInwardBottles(bId, updated);

      updateStoredBatchStage(bId, {
        stageIdx: 4,
        currentStage: "Stocked at Retail",
        stageName: "Stocked at Retail",
        storeLocation: targetBatch.targetDestination || storeName || "KVIC Retail Store",
        historyEvent: {
          stage: 4,
          stageName: "At Retail",
          actor: storeName || currentUser?.name || "KVIC Retail Store",
          location: targetBatch.targetDestination || "KVIC Retail Store",
          timestamp: Math.floor(Date.now() / 1000),
          notes: `${newlyInwarded.length} bottles inwarded into store shelf stock (${updated.length}/${total} stocked).`
        }
      });
      window.dispatchEvent(new Event('honeychain_batch_updated'));
      window.dispatchEvent(new Event('honeychain_batches_updated'));

      setSelectedJarsToInward([]);
      setInwardFeedback({
        type: "success",
        message: `${newlyInwarded.length} Selected Bottles Inwarded & Stocked!`,
        detail: `Cryptographic seals authenticated. Store shelf stock is now ${updated.length} of ${total} bottles.`,
      });

      const activeContract = readContractRef.current || readContract;
      await loadAllBatches(activeContract);
      selectBatch(bId, activeContract);
    } catch (err) {
      console.error("Multi-inward error:", err);
      setInwardFeedback({
        type: "error",
        message:
          "Inwarding failed: " + (err.message || "Check transaction status."),
      });
    } finally {
      setLoading(false);
    }
  };

  // Auto-pick next available unsold bottle in current batch (must be inwarded in store stock)
  const handlePickNextAvailable = () => {
    if (!selectedBatchData) return;
    const batchInwardedList =
      scannedInwardBottles[selectedBatchData.batchId] !== undefined
        ? scannedInwardBottles[selectedBatchData.batchId]
        : getStoredInwardBottles(
            selectedBatchData.batchId,
            selectedBatchData.jarsTotal,
            selectedBatchData.stageIdx,
          );
    for (let i = 1; i <= selectedBatchData.jarsTotal; i++) {
      if (
        batchInwardedList.includes(i) &&
        (!soldBottlesMap[i] || !soldBottlesMap[i].isSold)
      ) {
        const token = getBottleSecurityToken(
          selectedBatchData.batchId,
          i,
          selectedBatchData.harvestTimestamp,
          selectedBatchData.batchCode,
        );
        handleSelectBottleDirect(i, token);
        return;
      }
    }
    setScannerFeedback({
      type: "warning",
      message: `No available in-stock bottles found in Batch #${selectedBatchId}! If bottles are Pending Inward, inward them first via "Verify & Inward Consignment".`,
    });
  };

  // Direct selection when clicking a bottle cell in the shelf grid
  const handleSelectBottleDirect = (bottleNum, token) => {
    if (!selectedBatchData) return;
    const bToken = token || getBottleSecurityToken(
      selectedBatchData.batchId,
      bottleNum,
      selectedBatchData.harvestTimestamp,
      selectedBatchData.batchCode,
    );
    setQrScanInput(bToken);
    setSelectedBottleNum(bottleNum);
    setScannerFeedback({
      type: "success",
      message: `Verified Genuine: Bottle #${bottleNum} of ${selectedBatchData.jarsTotal} (${selectedBatchData.floraName}) is selected and ready for POS checkout!`,
    });
  };

  // Parse scanned bottle barcode / input / QR
  const handleScanBottle = (inputVal) => {
    setQrScanInput(inputVal);
    if (!inputVal.trim()) {
      setScannerFeedback(null);
      setSelectedBottleNum("");
      return;
    }

    const trimmed = inputVal.trim();
    let bottleNum = null;

    // Auto-detect batch switch if barcode/URL contains a batch ID
    const batchMatch =
      trimmed.match(/\/verify\/(\d+)/i) ||
      trimmed.match(/batch[=-](\d+)/i) ||
      trimmed.match(/B(\d+)-JAR/i);
    if (batchMatch && batchMatch[1]) {
      const extractedBatchId = parseInt(batchMatch[1]);
      if (extractedBatchId && extractedBatchId !== selectedBatchId) {
        const found = inventoryBatches.find(
          (b) => b.batchId === extractedBatchId,
        );
        if (found) {
          selectBatch(extractedBatchId, readContract);
        } else {
          setScannerFeedback({
            type: "error",
            message: `Consignment #${extractedBatchId} is not in current retail store shelf inventory. Inward this batch first.`,
          });
          setSelectedBottleNum("");
          return;
        }
      }
    }

    // Pattern 1: Raw integer (e.g. "1")
    if (/^\d+$/.test(trimmed)) {
      bottleNum = parseInt(trimmed);
    }
    // Pattern 2: "HONEY-xxxx-JAR-0001" or "B1-JAR-1"
    else if (trimmed.includes("JAR-")) {
      const parts = trimmed.split("JAR-");
      if (parts[1] && /^\d+$/.test(parts[1])) {
        bottleNum = parseInt(parts[1]);
      }
    }
    // Pattern 3: URL containing unit=X
    else if (trimmed.includes("unit=")) {
      const match = trimmed.match(/unit=(\d+)/);
      if (match && match[1]) {
        bottleNum = parseInt(match[1]);
      }
    }
    // Pattern 4: Resolve token or serial via cryptographic resolver
    else if (selectedBatchData) {
      bottleNum = resolveBottleUnit(
        trimmed,
        selectedBatchData.jarsTotal,
        selectedBatchData.batchId,
        selectedBatchData.harvestTimestamp,
        selectedBatchData.batchCode,
      );
    }

    if (!bottleNum || !selectedBatchData) {
      setScannerFeedback({
        type: "error",
        message:
          "Unrecognized bottle format. Enter bottle number (e.g. 1) or scan QR label.",
      });
      setSelectedBottleNum("");
      return;
    }

    const totalJars = selectedBatchData.jarsTotal;
    if (bottleNum < 1 || bottleNum > totalJars) {
      setScannerFeedback({
        type: "error",
        message: `Bottle #${bottleNum} out of range! Batch #${selectedBatchId} contains ${totalJars} jars (1 to ${totalJars}).`,
      });
      setSelectedBottleNum("");
      return;
    }

    // Check if already sold
    if (soldBottlesMap[bottleNum] && soldBottlesMap[bottleNum].isSold) {
      const sale = soldBottlesMap[bottleNum];
      setScannerFeedback({
        type: "error",
        message: `Duplicate / Tamper Alert: Bottle #${bottleNum} was already sold to ${sale.customerName || "Customer"} on ${sale.saleTimestamp ? new Date(parseInt(sale.saleTimestamp) * 1000).toLocaleDateString() : "earlier"} (Invoice: ${sale.invoiceNumber})! Cannot resell.`,
      });
      setSelectedBottleNum("");
      return;
    }

    // Check if bottle is inwarded into store inventory
    const batchInwardedList =
      scannedInwardBottles[selectedBatchData.batchId] !== undefined
        ? scannedInwardBottles[selectedBatchData.batchId]
        : getStoredInwardBottles(
            selectedBatchData.batchId,
            selectedBatchData.jarsTotal,
            selectedBatchData.stageIdx,
          );

    if (!batchInwardedList.includes(bottleNum)) {
      setScannerFeedback({
        type: "warning",
        message: `Bottle #${bottleNum} is Pending Inward!`,
        detail: `This bottle cannot be sold at POS because it has not yet been inwarded into store shelf stock. Open "Verify & Inward Consignment" above to inward it.`,
      });
      setSelectedBottleNum("");
      return;
    }

    // Available!
    setSelectedBottleNum(bottleNum);
    setScannerFeedback({
      type: "success",
      message: `Verified Genuine: Bottle #${bottleNum} of ${totalJars} (${selectedBatchData.floraName}) is sealed and ready for checkout!`,
    });
  };

  // Execute POS Sale & E-Bill Generation
  const handleSellBottle = async (e) => {
    e.preventDefault();
    if (!authStatus.isRetailer && !authStatus.isAdmin) {
      setNotification({
        type: "error",
        message: "Access Denied: Please log in with a certified Retailer account to process sales and issue e-Bills."
      });
      return;
    }
    if (!selectedBottleNum) {
      setNotification({
        type: "warning",
        message: "Please scan or select an available bottle first."
      });
      return;
    }
    const effectiveCustName = customerName.trim() || "Rajesh Sharma";
    const effectiveCustPhone = customerPhone.trim() || "9876543210";

    setLoading(true);
    setNotification(null);

    try {
      if (!contract) throw new Error("Contract not initialized.");
      if (
        soldBottlesMap[selectedBottleNum] &&
        soldBottlesMap[selectedBottleNum].isSold
      ) {
        throw new Error(
          `Bottle #${selectedBottleNum} has already been sold to ${soldBottlesMap[selectedBottleNum].customerName || "a customer"}. Resale is strictly prevented.`,
        );
      }
      const curInwardList =
        scannedInwardBottles[selectedBatchData.batchId] !== undefined
          ? scannedInwardBottles[selectedBatchData.batchId]
          : getStoredInwardBottles(
              selectedBatchData.batchId,
              selectedBatchData.jarsTotal,
              selectedBatchData.stageIdx,
            );

      // Verify bottle is in active store shelf stock (inwarded)
      if (!curInwardList.includes(selectedBottleNum)) {
        throw new Error(
          `Bottle #${selectedBottleNum} is not in active store shelf stock (Pending Inward). Please verify and inward it at the Inward Desk first before customer checkout.`,
        );
      }

      // Generate unique Tax Invoice Number
      const invoiceNum = `KVIC-INV-${new Date().getFullYear()}-B${selectedBatchId}-${String(selectedBottleNum).padStart(4, "0")}`;
      const securityToken = getBottleSecurityToken(
        selectedBatchId,
        selectedBottleNum,
        selectedBatchData.harvestTimestamp,
        selectedBatchData.batchCode,
      );
      const bottleSerial = getUniqueBottleSerial(
        selectedBatchData.batchCode,
        selectedBottleNum,
        securityToken,
      );

      setNotification({ type: 'info', message: 'Transmitting POS sale to Blockchain Relayer Gateway...' });

      const tx = await executeBlockchainRelayer('sell-bottle', {
        batchId: selectedBatchId,
        bottleNumber: selectedBottleNum,
        customerName: effectiveCustName,
        customerPhone: effectiveCustPhone,
        invoiceNumber: invoiceNum
      });

      if (!tx || !tx.transactionHash) {
        throw new Error(
          'No transaction hash returned — the sale was not recorded on-chain. Please retry.',
        );
      }

      // Re-verify on-chain sale with brief polling to avoid RPC race condition
      const verifyContract = readContractRef.current || readContract;
      let onChainSale = null;
      if (verifyContract) {
        for (let attempt = 0; attempt < 3; attempt++) {
          onChainSale = await verifyContract.methods
            .getBottleSale(selectedBatchId, selectedBottleNum)
            .call()
            .catch(() => null);
          if (onChainSale && onChainSale.isSold) break;
          await new Promise(r => setTimeout(r, 300));
        }
      }

      const txHash = tx.transactionHash;
      setNotification({
        type: "info",
        message: `Confirmed on Blockchain! (Block #${tx.blockNumber || "Live"}). Generating bill...`,
      });

      // Compute invoice finances
      const msrpTotal = 450.0;
      const basePrice = (msrpTotal / 1.05).toFixed(2);
      const cgst = ((msrpTotal - parseFloat(basePrice)) / 2).toFixed(2);
      const sgst = cgst;

      const billData = {
        invoiceNumber: invoiceNum,
        timestamp: new Date().toLocaleString(),
        customerName: effectiveCustName,
        customerPhone: effectiveCustPhone,
        paymentMethod,
        storeName: selectedBatchData.targetDestination || storeName,
        retailerWallet: account || '0x556FCE98dC5b75C5097eEf0581BC17f771944EbB',
        batchId: selectedBatchId,
        batchCode: selectedBatchData.batchCode,
        bottleNumber: selectedBottleNum,
        bottleSerial,
        securityToken,
        floraName: selectedBatchData.floraName,
        beekeeperName: selectedBatchData.beekeeperName,
        clusterLocation: selectedBatchData.clusterLocation,
        basePrice,
        cgst,
        sgst,
        totalAmount: msrpTotal.toFixed(2),
        txHash,
        verifyUrl: `${window.location.origin}/verify?batch=${selectedBatchId}&unit=${selectedBottleNum}&token=${securityToken}`,
      };

      setGeneratedBill(billData);
      setShowBillModal(true);

      setNotification({
        type: "success",
        message: `Bottle #${selectedBottleNum} successfully sold! Official KVIC Tax Invoice #${invoiceNum} generated.`,
      });

      // ── Optimistic & persistent UI update: mark sold immediately ──
      const soldBottleEntry = {
        isSold: true,
        bottleNumber: selectedBottleNum,
        customerName: effectiveCustName,
        customerPhone: effectiveCustPhone,
        invoiceNumber: invoiceNum,
        saleTimestamp: Math.floor(Date.now() / 1000),
        transactionHash: txHash
      };
      setSoldBottlesMap(prev => {
        const updated = {
          ...prev,
          [selectedBottleNum]: soldBottleEntry,
        };
        syncSoldBottles(selectedBatchId, updated);
        return updated;
      });
      setSelectedBatchData(prev =>
        prev ? { ...prev, jarsSold: (parseInt(prev.jarsSold, 10) || 0) + 1 } : prev
      );

      // Also persist to local cache and server batch
      const currentStoredSold = getStoredSoldBottles(selectedBatchId) || {};
      const updatedSoldList = Object.values({
        ...currentStoredSold,
        [selectedBottleNum]: soldBottleEntry
      });
      updateStoredBatchStage(selectedBatchId, {
        jarsSold: (parseInt(selectedBatchData?.jarsSold, 10) || 0) + 1,
        soldBottles: updatedSoldList
      });

      // Explicitly post to POS server sold-bottles endpoint
      fetch(`${API_BASE_URL}/api/pos/sold-bottles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: selectedBatchId,
          soldBottle: soldBottleEntry,
          soldBottles: updatedSoldList
        })
      }).catch(() => {});

      // Background: Refresh batch state & sold bottles from chain (async, no await spinner)
      invalidateContractCache('retailpos_all_batches');
      selectBatch(selectedBatchId, readContractRef.current || readContract).catch(() => {});
      loadAllBatches(readContractRef.current || readContract).catch(() => {});

      // Reset form
      setQrScanInput("");
      setSelectedBottleNum("");
      setCustomerName("");
      setCustomerPhone("");
      setScannerFeedback(null);
    } catch (err) {
      console.error("Sale error:", err);
      const rawMsg = err.message || "Ensure the bottle is in stock and your account is authorized.";
      let friendlyMsg = rawMsg;
      if (/must be in retail stage/i.test(rawMsg)) {
        friendlyMsg =
          `Batch #${selectedBatchId} is not marked "Available at KVIC Retail" on-chain yet. ` +
          'Inward the consignment (Verify & Inward Consignment) so the batch is stocked at retail, then retry the sale.';
      } else if (/unauthorized retailer|not assigned retailer/i.test(rawMsg)) {
        friendlyMsg =
          'This store account is not the assigned retailer for the batch on-chain. Switch to the assigned retail store account or ask the admin to reassign the consignment.';
      } else if (/already sold|duplicate sale/i.test(rawMsg)) {
        friendlyMsg = `Bottle #${selectedBottleNum} is already sold on-chain. Resale is strictly prevented.`;
      } else if (/NOT recorded on the blockchain|could not be recorded/i.test(rawMsg)) {
        friendlyMsg =
          'The sale could not be written to the blockchain, so the bottle was NOT marked sold. ' +
          'Start the local chain (npm run chain) and the relayer gateway (npm run hive-service), then retry. Details: ' +
          rawMsg;
      }
      setNotification({ type: "danger", message: "Sale execution failed: " + friendlyMsg });
    } finally {
      setLoading(false);
    }
  };

  // Open existing bill for a sold bottle
  const handleViewExistingBill = async (bottleNum) => {
    try {
      const sale = await readContract.methods
        .getBottleSale(selectedBatchId, bottleNum)
        .call();
      if (!sale || !sale.isSold) return;

      const msrpTotal = 450.0;
      const basePrice = (msrpTotal / 1.05).toFixed(2);
      const cgst = ((msrpTotal - parseFloat(basePrice)) / 2).toFixed(2);
      const sgst = cgst;

      const securityToken = getBottleSecurityToken(
        selectedBatchId,
        bottleNum,
        selectedBatchData?.harvestTimestamp,
        selectedBatchData?.batchCode,
      );
      const bottleSerial = getUniqueBottleSerial(
        selectedBatchData?.batchCode,
        bottleNum,
        securityToken,
      );

      setGeneratedBill({
        invoiceNumber: sale.invoiceNumber,
        timestamp: new Date(
          parseInt(sale.saleTimestamp) * 1000,
        ).toLocaleString(),
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        paymentMethod: "UPI / POS",
        storeName: selectedBatchData?.targetDestination || storeName,
        retailerWallet: sale.soldByRetailer,
        batchId: selectedBatchId,
        batchCode: selectedBatchData?.batchCode || `HONEY-${selectedBatchId}`,
        bottleNumber: bottleNum,
        bottleSerial,
        securityToken,
        floraName: selectedBatchData?.floraName || "Raw Honey",
        beekeeperName: selectedBatchData?.beekeeperName || "KVIC Beekeeper",
        clusterLocation: selectedBatchData?.clusterLocation || "India",
        basePrice,
        cgst,
        sgst,
        totalAmount: msrpTotal.toFixed(2),
        txHash: "Confirmed On-Chain",
        verifyUrl: `${window.location.origin}/verify?batch=${selectedBatchId}&unit=${bottleNum}&token=${securityToken}`,
      });
      setShowBillModal(true);
    } catch (err) {
      console.warn("Error viewing existing bill:", err);
    }
  };

  // Accurate real-time sold count for any batch by combining batch counters, storage, and live session
  const getBatchSoldCount = (b) => {
    if (!b) return 0;
    let count = parseInt(b.jarsSold, 10) || 0;
    try {
      const stored = getStoredSoldBottles(b.batchId);
      const storedCount = Object.values(stored || {}).filter(v => v && v.isSold).length;
      if (storedCount > count) count = storedCount;
    } catch (_) {}
    if (String(b.batchId) === String(selectedBatchId)) {
      const activeMapCount = Object.values(soldBottlesMap || {}).filter(v => v && v.isSold).length;
      if (activeMapCount > count) count = activeMapCount;
    }
    return count;
  };

  const totalInventoryJars = inventoryBatches.reduce(
    (acc, b) => acc + (parseInt(b.jarsTotal, 10) || 0),
    0,
  );
  const totalSoldJars = inventoryBatches.reduce(
    (acc, b) => acc + getBatchSoldCount(b),
    0,
  );
  const totalAvailableJars = Math.max(0, totalInventoryJars - totalSoldJars);
  const totalRevenue = totalSoldJars * 450;

  return (
    <div className="container">
      {/* Header & Store Profile */}
      <div className="clean-card" style={{ marginBottom: "20px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "4px",
                flexWrap: "wrap",
              }}
            >
              <h2
                style={{
                  fontSize: "1.45rem",
                  fontWeight: 700,
                  margin: 0,
                  color: "var(--ink-900)",
                }}
              >
                Retail POS & Store Inventory
              </h2>
              <span className="badge-purity">
                <FaStore size={12} /> Retail Operations
              </span>
            </div>
            <p
              style={{
                color: "var(--ink-500)",
                fontSize: "0.84rem",
                margin: 0,
              }}
            >
              Manage incoming consignments, live bottle shelf inventory, POS
              checkout, and verified e-Bills
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.76rem",
                color: "var(--ink-600)",
                marginTop: "4px",
                flexWrap: "wrap",
              }}
            >
              <FaStore size={13} />
              <span>
                Branch: <strong>{storeName || "Retail Store"}</strong>
              </span>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "1px 6px", fontSize: "0.68rem" }}
                onClick={() => { setBranchInputVal(storeName); setEditingBranch(true); }}
              >
                Edit Branch
              </button>
            </div>
            {editingBranch && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', alignItems: 'center' }}>
                <input
                  autoFocus
                  value={branchInputVal}
                  onChange={e => setBranchInputVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { if (branchInputVal.trim()) setStoreName(branchInputVal.trim()); setEditingBranch(false); } if (e.key === 'Escape') setEditingBranch(false); }}
                  placeholder="Retail Store / Branch Name"
                  style={{ flex: 1, padding: '5px 10px', borderRadius: '7px', border: '1px solid #d1d5db', fontSize: '0.80rem', outline: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => { if (branchInputVal.trim()) setStoreName(branchInputVal.trim()); setEditingBranch(false); }}
                  style={{ padding: '5px 12px', borderRadius: '7px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                >Save</button>
                <button
                  type="button"
                  onClick={() => setEditingBranch(false)}
                  style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid #d1d5db', background: '#f9fafb', color: '#374151', fontSize: '0.78rem', cursor: 'pointer' }}
                >Cancel</button>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              className={`btn-primary ${activeTab === "POS" ? "" : "btn-secondary"}`}
              style={{
                padding: "7px 14px",
                fontSize: "0.82rem",
                background:
                  activeTab === "POS" ? "var(--primary-honey)" : "transparent",
                color: activeTab === "POS" ? "#FFFFFF" : "var(--ink-700)",
                border: activeTab === "POS" ? "none" : "var(--border)",
              }}
              onClick={() => setActiveTab("POS")}
            >
              <FiShoppingBag size={14} /> Point of Sale (POS)
            </button>
            <button
              className={`btn-primary ${activeTab === "INVENTORY" ? "" : "btn-secondary"}`}
              style={{
                padding: "7px 14px",
                fontSize: "0.82rem",
                background:
                  activeTab === "INVENTORY"
                    ? "var(--primary-honey)"
                    : "transparent",
                color: activeTab === "INVENTORY" ? "#FFFFFF" : "var(--ink-700)",
                border: activeTab === "INVENTORY" ? "none" : "var(--border)",
              }}
              onClick={() => setActiveTab("INVENTORY")}
            >
              <FiBox size={14} /> Store Inventory ({inventoryBatches.length})
            </button>
          </div>
        </div>
      </div>

      {/* Role Access Guard: Only Retailer and Admin can access POS operations */}
      {!authStatus.isAuthorized && !loading ? (
        <div
          className="clean-card"
          style={{
            textAlign: "center",
            padding: "50px 24px",
            maxWidth: "620px",
            margin: "30px auto",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "#FEF3C7",
              color: "#B45309",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <FaStore size={28} />
          </div>
          <h3
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--ink-900)",
              marginBottom: "8px",
            }}
          >
            Authorized Retail Store Access Required
          </h3>
          <p
            style={{
              color: "var(--ink-500)",
              fontSize: "0.88rem",
              lineHeight: "1.5",
              margin: "0 0 20px",
            }}
          >
            Store shelf inventory, point-of-sale checkout, and verified tax
            e-Bill issuance are restricted to authorized KVIC Retail Stores and
            Admin. Please log in with an authorized Retailer or Admin account.
          </p>
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <a
              href="/supply-pipeline"
              className="btn-secondary"
              style={{ textDecoration: "none" }}
            >
              View Supply Pipeline
            </a>
            <a
              href="/consumer-verify"
              className="btn-primary"
              style={{ textDecoration: "none" }}
            >
              Verify Honey Passport
            </a>
          </div>
        </div>
      ) : (
        <>
          {/* Admin: View-as-Retailer Banner */}
          {authStatus.isAdmin && availableRetailers.length > 0 && (
            <div
              style={{
                background: "var(--bg-card)",
                border: "var(--border)",
                borderLeft: "4px solid #D97706",
                borderRadius: "10px",
                padding: "12px 18px",
                marginBottom: "20px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
                boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              }}
            >
              {/* Icon + Label */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flex: "0 0 auto",
                }}
              >
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "#FEF3C7",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#B45309"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "var(--ink-800)",
                      lineHeight: 1.2,
                    }}
                  >
                    Admin Oversight View
                  </div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--ink-400)",
                      marginTop: "1px",
                    }}
                  >
                    Read-only · Sales &amp; inward disabled
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div
                style={{
                  width: "1px",
                  height: "32px",
                  background: "var(--ink-200)",
                  flex: "0 0 auto",
                }}
              />

              {/* Store Selector */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flex: 1,
                  minWidth: "200px",
                }}
              >
                <span
                  style={{
                    fontSize: "0.74rem",
                    fontWeight: 600,
                    color: "var(--ink-500)",
                    whiteSpace: "nowrap",
                  }}
                >
                  Viewing Store:
                </span>
                <select
                  style={{
                    flex: 1,
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    color: "var(--ink-800)",
                    padding: "6px 32px 6px 10px",
                    border: "1.5px solid var(--ink-300)",
                    borderRadius: "7px",
                    background: "var(--bg-app)",
                    cursor: "pointer",
                    outline: "none",
                    appearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 10px center",
                  }}
                  value={viewAsRetailer ? viewAsRetailer.address : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    const selected = availableRetailers.find(
                      (r) => r.address.toLowerCase() === val.toLowerCase(),
                    );
                    setViewAsRetailer(selected || null);
                    if (readContract) {
                      loadAllBatches(
                        readContract,
                        true,
                        selected ? selected.address : "",
                      );
                    }
                  }}
                >
                  <option value="">All Retail Stores (Global KVIC View)</option>
                  {availableRetailers.map((r) => (
                    <option key={r.address} value={r.address}>
                      {r.name ||
                        r.shortName ||
                        `${r.address.substring(0, 8)}...`}
                      {r.facility ? ` — ${r.facility}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Read-only pill */}
              <div
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  color: "#B45309",
                  background: "#FEF3C7",
                  border: "1px solid #FDE68A",
                  borderRadius: "20px",
                  padding: "4px 12px",
                  flex: "0 0 auto",
                  letterSpacing: "0.02em",
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <FiLock size={11} /> READ ONLY
                </span>
              </div>
            </div>
          )}

          {/* Notification Banner */}
          {notification && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "20px",
                fontSize: "0.86rem",
                fontWeight: 500,
                background:
                  notification.type === "success"
                    ? "var(--forest-green-light)"
                    : "var(--alert-red-light)",
                color:
                  notification.type === "success"
                    ? "var(--forest-green)"
                    : "var(--alert-red)",
                border: `1px solid ${notification.type === "success" ? "var(--forest-green-border)" : "var(--alert-red-border)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>{notification.message}</span>
              <button
                onClick={() => setNotification(null)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                }}
              >
                <FiX size={14} />
              </button>
            </div>
          )}

          {/* Top KPI Metrics Bar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "14px",
              marginBottom: "20px",
            }}
          >
            <div className="clean-card" style={{ padding: "16px" }}>
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "var(--ink-500)",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FiBox size={14} /> Total Inwarded Jars
              </div>
              <div
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  color: "var(--ink-900)",
                  marginTop: "4px",
                }}
              >
                {loading && totalInventoryJars === 0
                  ? "..."
                  : totalInventoryJars}
              </div>
              <div
                style={{
                  fontSize: "0.74rem",
                  color: "var(--ink-500)",
                  marginTop: "2px",
                }}
              >
                Across {inventoryBatches.length} inwarded {inventoryBatches.length === 1 ? 'batch' : 'batches'}
              </div>
            </div>

            <div className="clean-card" style={{ padding: "16px" }}>
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "var(--ink-500)",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FiShoppingBag size={14} /> Bottles Sold
              </div>
              <div
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  color: "var(--forest-green)",
                  marginTop: "4px",
                }}
              >
                {loading && totalSoldJars === 0 ? "..." : totalSoldJars}
              </div>
              <div
                style={{
                  fontSize: "0.74rem",
                  color: "var(--ink-500)",
                  marginTop: "2px",
                }}
              >
                With verified tax e-bills issued
              </div>
            </div>

            <div className="clean-card" style={{ padding: "16px" }}>
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "var(--ink-500)",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FaStore size={14} /> Jars Available on Shelf
              </div>
              <div
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  color: "var(--primary-honey)",
                  marginTop: "4px",
                }}
              >
                {loading && totalAvailableJars === 0
                  ? "..."
                  : totalAvailableJars}
              </div>
              <div
                style={{
                  fontSize: "0.74rem",
                  color: "var(--ink-500)",
                  marginTop: "2px",
                }}
              >
                Sealed units in store stock
              </div>
            </div>

            <div className="clean-card" style={{ padding: "16px" }}>
              <div
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "var(--ink-500)",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <FiShield size={14} /> Total Retail Sales
              </div>
              <div
                style={{
                  fontSize: "1.6rem",
                  fontWeight: 800,
                  color: "var(--ink-900)",
                  marginTop: "4px",
                }}
              >
                {loading && totalRevenue === 0
                  ? "..."
                  : `₹${totalRevenue.toLocaleString()}`}
              </div>
              <div
                style={{
                  fontSize: "0.74rem",
                  color: "var(--ink-500)",
                  marginTop: "2px",
                }}
              >
                MSRP ₹450 / 500g Jar (5% GST)
              </div>
            </div>
          </div>

          {/* INCOMING SHIPMENTS NOTIFICATION & INTERACTIVE INWARDING DESK */}
          {incomingBatches.length > 0 && (
            <div
              className="clean-card"
              style={{
                marginBottom: "24px",
                borderLeft: "4px solid var(--primary-honey)",
                background: "#FFFFFF",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <h4
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      margin: 0,
                      color: "var(--ink-900)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <FiTruck size={18} color="var(--primary-honey)" />{" "}
                    Incoming Consignments &amp; Digital Inward Desk (
                    {incomingBatches.length})
                  </h4>
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--ink-500)",
                      margin: "3px 0 0",
                    }}
                  >
                    Cryptographic custody verification: Scan bottles one-by-one
                    or inward full consignments to lock them into active shelf
                    stock.
                  </p>
                </div>
              </div>

              <div
                className="table-responsive"
                style={{ marginBottom: "16px" }}
              >
                <table className="honey-table">
                  <thead>
                    <tr>
                      <th>Batch ID</th>
                      <th>Flora &amp; Origin</th>
                      <th>Total Jars</th>
                      <th>Designated Retailer</th>
                      <th>Custody Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomingBatches.map((b) => {
                      const isAssigned =
                        (account &&
                          b.assignedRetailer &&
                          b.assignedRetailer.toLowerCase() ===
                            account.toLowerCase()) ||
                        (authStatus.isAdmin &&
                          (!viewAsRetailer ||
                            (b.assignedRetailer &&
                              viewAsRetailer.address &&
                              b.assignedRetailer.toLowerCase() ===
                                viewAsRetailer.address.toLowerCase())));
                      const isExpanded = inwardActiveBatchId === b.batchId;
                      const verifiedCount = (
                        scannedInwardBottles[b.batchId] || []
                      ).length;

                      return (
                        <React.Fragment key={b.batchId}>
                          <tr
                            style={{
                              background: isExpanded
                                ? "var(--primary-honey-light)"
                                : "transparent",
                            }}
                          >
                            <td>
                              <strong>#{b.batchId}</strong> ({b.batchCode})
                            </td>
                            <td>
                              <span className="badge-purity">
                                {b.floraName}
                              </span>
                              <div
                                style={{
                                  fontSize: "0.72rem",
                                  color: "var(--ink-500)",
                                  marginTop: "2px",
                                }}
                              >
                                {b.clusterLocation}
                              </div>
                            </td>
                            <td>
                              <strong>{b.jarsTotal} Bottles</strong> (
                              {b.yieldWeightKg} kg)
                              {verifiedCount > 0 && (
                                <div
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "#16A34A",
                                    fontWeight: 600,
                                  }}
                                >
                                  {verifiedCount} of {b.jarsTotal} scanned
                                </div>
                              )}
                            </td>
                            <td>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  color: "var(--ink-800)",
                                }}
                              >
                                {b.targetDestination || "Open Retail Store"}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.68rem",
                                  color: "var(--ink-500)",
                                  fontFamily: "monospace",
                                }}
                              >
                                {b.assignedRetailer
                                  ? `${b.assignedRetailer.substring(0, 10)}...`
                                  : "Unassigned"}
                              </div>
                            </td>
                            <td>
                              {isAssigned ? (
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "#166534",
                                    background: "#DCFCE7",
                                    padding: "3px 8px",
                                    borderRadius: "4px",
                                    fontWeight: 600,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  <FiCheck size={12} /> Authorized Store
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: "0.72rem",
                                    color: "#991B1B",
                                    background: "#FEE2E2",
                                    padding: "3px 8px",
                                    borderRadius: "4px",
                                    fontWeight: 600,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                  }}
                                >
                                  <FiLock size={12} /> Locked to {b.targetDestination || (b.assignedRetailer ? getEntityFriendlyName(b.assignedRetailer, "RETAILER") : "Other Store")}
                                </span>
                              )}
                            </td>
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "6px",
                                  flexWrap: "wrap",
                                }}
                              >
                                {isAssigned ? (
                                  <>
                                    <button
                                      className="btn-primary"
                                      style={{
                                        padding: "5px 11px",
                                        fontSize: "0.76rem",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                      onClick={() => {
                                        setInwardActiveBatchId(
                                          isExpanded ? null : b.batchId,
                                        );
                                        setInwardFeedback(null);
                                        setSelectedJarsToInward([]);
                                      }}
                                    >
                                      <FiSearch size={12} />
                                      {isExpanded ? "Close Inward Desk" : "Verify & Inward"}
                                    </button>
                                    <button
                                      className="btn-outline"
                                      style={{
                                        padding: "5px 10px",
                                        fontSize: "0.76rem",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                      }}
                                      disabled={loading}
                                      onClick={() => handleInwardAllBottles(b)}
                                      title="Direct 1-Click Inward All"
                                    >
                                      <FiZap size={12} /> Inward All
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className="btn-outline"
                                    style={{
                                      padding: "5px 10px",
                                      fontSize: "0.76rem",
                                      opacity: 0.6,
                                      cursor: "not-allowed",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                    disabled
                                    title="Custody locked to designated store"
                                  >
                                    <FiLock size={12} /> Restricted
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* EXPANDABLE INWARDING & VERIFICATION DESK */}
                          {isExpanded && (
                            <tr>
                              <td
                                colSpan="6"
                                style={{
                                  padding: "16px",
                                  background: "#F8FAFC",
                                  borderBottom:
                                    "2px solid var(--primary-honey)",
                                }}
                              >
                                {!isAssigned ? (
                                  <div
                                    style={{
                                      padding: "24px",
                                      textAlign: "center",
                                      background: "#FFFBEB",
                                      border: "1px solid #FDE68A",
                                      borderRadius: "8px",
                                      maxWidth: "600px",
                                      margin: "0 auto",
                                    }}
                                  >
                                    <div style={{ marginBottom: "6px", color: "#D97706" }}>
                                      <FiLock size={22} />
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.92rem",
                                        fontWeight: 700,
                                        color: "#92400E",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Restricted to Authorized Store
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.78rem",
                                        color: "#B45309",
                                        marginBottom: "6px",
                                      }}
                                    >
                                      Consignment #{b.batchId} ({b.batchCode}) is assigned exclusively to{" "}
                                      <strong>
                                        {b.targetDestination ||
                                          (b.assignedRetailer
                                            ? getEntityFriendlyName(b.assignedRetailer, "RETAILER")
                                            : "another retailer")}
                                      </strong>
                                      .
                                    </div>
                                    <div style={{ fontSize: "0.72rem", color: "#78350F" }}>
                                      Cryptographic bottle security PINs and inwarding controls are strictly hidden to prevent inventory diversion.
                                    </div>
                                  </div>
                                ) : (
                                <div style={{ maxWidth: "820px" }}>
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      marginBottom: "12px",
                                    }}
                                  >
                                    <h5
                                      style={{
                                        margin: 0,
                                        fontSize: "0.92rem",
                                        fontWeight: 700,
                                        color: "var(--ink-900)",
                                      }}
                                    >
                                      Digital Inwarding Desk — Consignment #
                                      {b.batchId} ({b.batchCode})
                                    </h5>
                                    <span
                                      style={{
                                        fontSize: "0.74rem",
                                        fontWeight: 700,
                                        color:
                                          verifiedCount >= b.jarsTotal
                                            ? "var(--forest-green)"
                                            : "var(--primary-honey-hover)",
                                      }}
                                    >
                                      {verifiedCount} of {b.jarsTotal} Bottles
                                      Inwarded
                                    </span>
                                  </div>

                                  {/* Administrator Read-Only Notice Banner */}
                                  {authStatus.isAdmin && (
                                    <div
                                      style={{
                                        padding: "10px 14px",
                                        borderRadius: "7px",
                                        marginBottom: "12px",
                                        fontSize: "0.82rem",
                                        background: "#EFF6FF",
                                        border: "1px solid #BFDBFE",
                                        color: "#1E40AF",
                                        fontWeight: 600,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                      }}
                                    >
                                      <FiLock size={15} />
                                      <span>Administrator Read-Only Audit Mode: Physical consignment inwarding, PIN verification, and shelf stocking are strictly restricted to certified retail store personnel.</span>
                                    </div>
                                  )}

                                  {/* FEEDBACK BANNER */}
                                  {inwardFeedback && (
                                    <div
                                      style={{
                                        padding: "10px 14px",
                                        borderRadius: "7px",
                                        marginBottom: "12px",
                                        fontSize: "0.82rem",
                                        background:
                                          inwardFeedback.type === "error"
                                            ? "#FEE2E2"
                                            : inwardFeedback.type === "warning"
                                              ? "#FEF3C7"
                                              : "#DCFCE7",
                                        border: `1px solid ${inwardFeedback.type === "error" ? "#EF4444" : inwardFeedback.type === "warning" ? "#F59E0B" : "#22C55E"}`,
                                        color:
                                          inwardFeedback.type === "error"
                                            ? "#991B1B"
                                            : inwardFeedback.type === "warning"
                                              ? "#92400E"
                                              : "#166534",
                                      }}
                                    >
                                      <div style={{ fontWeight: 700 }}>
                                        {inwardFeedback.message}
                                      </div>
                                      {inwardFeedback.detail && (
                                        <div
                                          style={{
                                            fontSize: "0.76rem",
                                            marginTop: "3px",
                                          }}
                                        >
                                          {inwardFeedback.detail}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* OPTION 1: INWARD BY BOTTLE SECURITY PIN / CONSIGNMENT GRID */}
                                  <div
                                    style={{
                                      background: "#FFFFFF",
                                      padding: "14px",
                                      borderRadius: "8px",
                                      border: "1px solid var(--ink-200)",
                                      marginBottom: "10px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "0.82rem",
                                        fontWeight: 700,
                                        color: "var(--ink-800)",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Option 1: Inward Individual Bottle by Cryptographic Security PIN
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.74rem",
                                        color: "var(--ink-500)",
                                        marginBottom: "8px",
                                      }}
                                    >
                                      Enter the bottle's 8-character Security PIN or click [Inward Jar] on any bottle in the consignment grid below:
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "8px",
                                        marginBottom: "10px",
                                      }}
                                    >
                                      <input
                                        type="text"
                                        className="form-control"
                                        placeholder={`Scan QR code or enter Security PIN (e.g. ${getBottleSecurityToken(b.batchId, 1, b.harvestTimestamp || 0, b.batchCode || "HONEY")})`}
                                        value={inwardCodeInput}
                                        disabled={loading}
                                        onChange={(e) =>
                                          setInwardCodeInput(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleInwardSingleBottle(
                                              b,
                                              inwardCodeInput,
                                            );
                                          }
                                        }}
                                        style={{ flex: 1, fontSize: "0.84rem" }}
                                      />
                                      <button
                                        type="button"
                                        className="btn-primary"
                                        style={{
                                          padding: "6px 14px",
                                          fontSize: "0.8rem",
                                          whiteSpace: "nowrap",
                                        }}
                                        disabled={loading}
                                        title="Inward PIN"
                                        onClick={() =>
                                          handleInwardSingleBottle(
                                            b,
                                            inwardCodeInput,
                                          )
                                        }
                                      >
                                        Inward PIN
                                      </button>
                                    </div>

                                    {/* Interactive Consignment Bottle Security PINs Grid */}
                                    <div
                                      style={{
                                        borderTop: "1px solid var(--ink-200)",
                                        paddingTop: "10px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          marginBottom: "8px",
                                          flexWrap: "wrap",
                                          gap: "6px",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: "0.82rem",
                                            fontWeight: 700,
                                            color: "var(--ink-800)",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                          }}
                                        >
                                          <FiPackage size={16} color="var(--primary-honey)" />
                                          Consignment Shelf Stocking ({verifiedCount} of {b.jarsTotal} Inwarded):
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "0.72rem",
                                            color: "var(--ink-500)",
                                          }}
                                        >
                                          Click "Inward Next Jar" or individual jar buttons below until all jars are stocked
                                        </div>
                                      </div>

                                      {(() => {
                                        const currentInwarded =
                                          scannedInwardBottles[b.batchId] || [];
                                        const pendingJarsList = Array.from(
                                          { length: b.jarsTotal },
                                          (_, i) => i + 1,
                                        ).filter(
                                          (n) => !currentInwarded.includes(n),
                                        );
                                        const selectedPendingCount =
                                          selectedJarsToInward.filter((n) =>
                                            pendingJarsList.includes(n),
                                          ).length;

                                        return (
                                          <>
                                            {/* Visual Inward Completion Bar */}
                                            <div style={{ margin: "6px 0 10px", width: "100%" }}>
                                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--ink-600)", marginBottom: "3px" }}>
                                                <span><strong>{verifiedCount}</strong> / {b.jarsTotal} Jars Stocked in Shelf Inventory</span>
                                                <span>{pendingJarsList.length > 0 ? `${pendingJarsList.length} Pending Inward` : "All 100% Inwarded"}</span>
                                              </div>
                                              <div style={{ height: "6px", width: "100%", background: "#E2E8F0", borderRadius: "3px", overflow: "hidden" }}>
                                                <div style={{ height: "100%", width: `${Math.round((verifiedCount / (b.jarsTotal || 50)) * 100)}%`, background: verifiedCount >= b.jarsTotal ? "#16A34A" : "var(--primary-honey)", transition: "width 0.3s ease" }}></div>
                                              </div>
                                            </div>

                                            {/* Batch selection controls */}
                                            <div
                                              style={{
                                                display: "flex",
                                                gap: "6px",
                                                flexWrap: "wrap",
                                                alignItems: "center",
                                                marginBottom: "8px",
                                              }}
                                            >
                                              {/* 1-Click Single-by-single Inward Button */}
                                              <button
                                                type="button"
                                                className="btn-primary"
                                                style={{
                                                  padding: "6px 14px",
                                                  fontSize: "0.78rem",
                                                  fontWeight: 700,
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: "6px",
                                                  background: authStatus.isAdmin ? "#94A3B8" : "#0284C7",
                                                  borderColor: authStatus.isAdmin ? "#94A3B8" : "#0284C7",
                                                  ...(authStatus.isAdmin ? { cursor: "not-allowed" } : {})
                                                }}
                                                disabled={pendingJarsList.length === 0 || loading}
                                                onClick={() => handleInwardNextSingle(b)}
                                                title="Click repeatedly to inward jars one by one until all are stocked"
                                              >
                                                <FiZap size={14} />
                                                {pendingJarsList.length > 0 ? `Inward Next Jar (#${pendingJarsList[0]})` : "All Jars Stocked"}
                                              </button>

                                              <button
                                                type="button"
                                                className="btn-honey"
                                                style={{
                                                  padding: "5px 12px",
                                                  fontSize: "0.76rem",
                                                  fontWeight: 700,
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: "5px",
                                                  opacity:
                                                    selectedPendingCount === 0 || authStatus.isAdmin
                                                      ? 0.5
                                                      : 1,
                                                  ...(authStatus.isAdmin ? { cursor: "not-allowed" } : {})
                                                }}
                                                disabled={
                                                  selectedPendingCount === 0 ||
                                                  loading ||
                                                  authStatus.isAdmin
                                                }
                                                onClick={() =>
                                                  handleInwardMultipleBottles(
                                                    b,
                                                    selectedJarsToInward.filter(
                                                      (n) =>
                                                        pendingJarsList.includes(
                                                          n,
                                                        ),
                                                    ),
                                                  )
                                                }
                                              >
                                                <FiInbox size={14} />
                                                Inward Selected (
                                                {selectedPendingCount}) Jars
                                              </button>

                                              <button
                                                type="button"
                                                className="btn-outline"
                                                style={{
                                                  padding: "5px 10px",
                                                  fontSize: "0.74rem",
                                                  fontWeight: 600,
                                                  display: "inline-flex",
                                                  alignItems: "center",
                                                  gap: "5px",
                                                  
                                                }}
                                                disabled={
                                                  pendingJarsList.length === 0 || loading
                                                }
                                                onClick={() => handleInwardMultipleBottles(b, pendingJarsList)}
                                                title="Inward all remaining pending jars at once"
                                              >
                                                <FiCheckCircle size={13} color="#16A34A" />
                                                Inward All Remaining ({pendingJarsList.length})
                                              </button>

                                              <button
                                                type="button"
                                                className="btn-outline"
                                                style={{
                                                  padding: "5px 10px",
                                                  fontSize: "0.74rem",
                                                  fontWeight: 600,
                                                  ...(authStatus.isAdmin ? { cursor: "not-allowed", opacity: 0.5 } : {})
                                                }}
                                                disabled={pendingJarsList.length === 0}
                                                onClick={() => {
                                                  if (
                                                    selectedPendingCount ===
                                                      pendingJarsList.length &&
                                                    pendingJarsList.length > 0
                                                  ) {
                                                    setSelectedJarsToInward([]);
                                                  } else {
                                                    setSelectedJarsToInward(
                                                      pendingJarsList,
                                                    );
                                                  }
                                                }}
                                              >
                                                {selectedPendingCount ===
                                                  pendingJarsList.length &&
                                                pendingJarsList.length > 0
                                                  ? "Deselect All"
                                                  : `Select All Pending (${pendingJarsList.length})`}
                                              </button>
                                            </div>

                                            <div
                                              style={{
                                                display: "grid",
                                                gridTemplateColumns:
                                                  "repeat(auto-fill, minmax(135px, 1fr))",
                                                gap: "6px",
                                                maxHeight: "180px",
                                                overflowY: "auto",
                                                padding: "6px",
                                                background: "var(--bg-app)",
                                                borderRadius: "6px",
                                                border: "1px solid var(--ink-200)",
                                              }}
                                            >
                                              {Array.from(
                                                { length: b.jarsTotal },
                                                (_, i) => i + 1,
                                              ).map((num) => {
                                                const isInwarded =
                                                  currentInwarded.includes(num);
                                                const isJarSelected =
                                                  selectedJarsToInward.includes(
                                                    num,
                                                  );
                                                const token =
                                                  getBottleSecurityToken(
                                                    b.batchId,
                                                    num,
                                                    b.harvestTimestamp || 0,
                                                    b.batchCode || "HONEY",
                                                  );
                                                const serial =
                                                  getUniqueBottleSerial(
                                                    b.batchCode || "HONEY",
                                                    num,
                                                    token,
                                                  );
                                                return (
                                                  <div
                                                    key={num}
                                                    onClick={() => {
                                                      if (authStatus.isAdmin) return;
                                                      if (!isInwarded) {
                                                        setSelectedJarsToInward(
                                                          (prev) =>
                                                            prev.includes(num)
                                                              ? prev.filter(
                                                                  (x) =>
                                                                    x !== num,
                                                                )
                                                              : [...prev, num],
                                                        );
                                                      }
                                                    }}
                                                    style={{
                                                      display: "flex",
                                                      flexDirection: "column",
                                                      alignItems: "flex-start",
                                                      padding: "5px 7px",
                                                      borderRadius: "5px",
                                                      border: isInwarded
                                                        ? "1px solid #86EFAC"
                                                        : isJarSelected
                                                          ? "2px solid #F59E0B"
                                                          : "1px solid #CBD5E1",
                                                      background: isInwarded
                                                        ? "#DCFCE7"
                                                        : isJarSelected
                                                          ? "#FEF3C7"
                                                          : "#FFFFFF",
                                                      color: isInwarded
                                                        ? "#166534"
                                                        : isJarSelected
                                                          ? "#92400E"
                                                          : "var(--ink-800)",
                                                      cursor: (isInwarded || authStatus.isAdmin)
                                                        ? "default"
                                                        : "pointer",
                                                      textAlign: "left",
                                                      transition:
                                                        "all 0.15s ease",
                                                      boxShadow: isJarSelected
                                                        ? "0 0 0 1px #F59E0B"
                                                        : "none",
                                                    }}
                                                    title={
                                                      isInwarded
                                                        ? `Bottle #${num} is already stocked`
                                                        : isJarSelected
                                                          ? `Jar #${num} selected. Click to unselect.`
                                                          : `Click to select Bottle #${num} (PIN: ${token})`
                                                    }
                                                  >
                                                    <div
                                                      style={{
                                                        display: "flex",
                                                        justifyContent:
                                                          "space-between",
                                                        width: "100%",
                                                        alignItems: "center",
                                                      }}
                                                    >
                                                      <div
                                                        style={{
                                                          display: "flex",
                                                          alignItems: "center",
                                                          gap: "4px",
                                                        }}
                                                      >
                                                        {!isInwarded && (
                                                          <input
                                                            type="checkbox"
                                                            checked={
                                                              isJarSelected
                                                            }
                                                            onChange={() => {}}
                                                            style={{
                                                              cursor: "pointer",
                                                              margin: 0,
                                                            }}
                                                          />
                                                        )}
                                                        <span
                                                          style={{
                                                            fontWeight: 700,
                                                            fontSize: "0.72rem",
                                                          }}
                                                        >
                                                          Jar #
                                                          {String(num).padStart(
                                                            2,
                                                            "0",
                                                          )}
                                                        </span>
                                                      </div>
                                                      <span
                                                        style={{
                                                          fontSize: "0.62rem",
                                                          fontWeight: 600,
                                                          color: isInwarded
                                                            ? "#16A34A"
                                                            : isJarSelected
                                                              ? "#D97706"
                                                              : "#64748B",
                                                          display: "inline-flex",
                                                          alignItems: "center",
                                                          gap: "2px",
                                                        }}
                                                      >
                                                        {isInwarded ? (
                                                          <>
                                                            <FiCheck size={11} /> Stocked
                                                          </>
                                                        ) : isJarSelected ? (
                                                          <>
                                                            <FiCheckSquare size={11} /> Selected
                                                          </>
                                                        ) : (
                                                          "Pending"
                                                        )}
                                                      </span>
                                                    </div>
                                                    <div
                                                      style={{
                                                        fontSize: "0.66rem",
                                                        color: isInwarded
                                                          ? "#15803D"
                                                          : isJarSelected
                                                            ? "#B45309"
                                                            : "#2563EB",
                                                        fontFamily: "monospace",
                                                        fontWeight: 700,
                                                        marginTop: "2px",
                                                      }}
                                                    >
                                                      PIN: {token}
                                                    </div>
                                                    <div
                                                      style={{
                                                        fontSize: "0.59rem",
                                                        color: "var(--ink-400)",
                                                        marginTop: "1px",
                                                      }}
                                                    >
                                                      {serial}
                                                    </div>
                                                    {!isInwarded && !authStatus.isAdmin && (
                                                      <button
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleInwardSingleBottle(
                                                            b,
                                                            token,
                                                          );
                                                        }}
                                                        disabled={loading}
                                                        style={{
                                                          marginTop: "4px",
                                                          width: "100%",
                                                          padding: "2px 0",
                                                          fontSize: "0.62rem",
                                                          fontWeight: 600,
                                                          borderRadius: "3px",
                                                          border:
                                                            "1px solid #F59E0B",
                                                          background: "#FFFBEB",
                                                          color: "#92400E",
                                                          cursor: "pointer",
                                                          display: "inline-flex",
                                                          alignItems: "center",
                                                          justifyContent: "center",
                                                          gap: "3px",
                                                        }}
                                                        title={`Inward Bottle #${num} directly`}
                                                      >
                                                        <FiInbox size={10} /> Inward Jar #{num}
                                                      </button>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>

                                  {/* OPTION 2: ONE-CLICK QUICK BULK ALL */}
                                  <div
                                    style={{
                                      background: "#FFFFFF",
                                      padding: "12px 14px",
                                      borderRadius: "8px",
                                      border: "1px solid var(--ink-200)",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "0.8rem",
                                        fontWeight: 700,
                                        color: "var(--ink-800)",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Option 2: Inward All Bottles Together
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.74rem",
                                        color: "var(--ink-500)",
                                        marginBottom: "8px",
                                      }}
                                    >
                                      Directly verify and inward all{" "}
                                      <strong>{b.jarsTotal} Bottles</strong> of
                                      Consignment #{b.batchId} into active
                                      inventory in a single on-chain
                                      transaction:
                                    </div>
                                      <button
                                        type="button"
                                        className="btn-honey"
                                        style={{
                                          width: "100%",
                                          justifyContent: "center",
                                          padding: "8px 16px",
                                          fontSize: "0.82rem",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "6px",
                                          
                                        }}
                                        disabled={loading}
                                        onClick={() => handleInwardAllBottles(b)}
                                      >
                                        {verifiedCount >= b.jarsTotal ? (
                                          <>
                                            <FiCheckCircle size={13} />
                                            <span>All {b.jarsTotal} Bottles Inwarded (Click to Re-sync)</span>
                                          </>
                                        ) : (
                                          <>
                                            <FiZap size={13} />
                                            <span>Inward All {verifiedCount > 0 ? `Remaining (${b.jarsTotal - verifiedCount})` : `${b.jarsTotal}`} Bottles Immediately</span>
                                        </>
                                        )}
                                      </button>
                                  </div>

                                  {/* Return to POS Counter button */}
                                  <div
                                    style={{
                                      marginTop: "12px",
                                      display: "flex",
                                      justifyContent: "flex-end",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="btn-outline"
                                      style={{
                                        padding: "6px 14px",
                                        fontSize: "0.78rem",
                                        color: "var(--ink-700)",
                                        borderColor: "var(--ink-300)",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                      }}
                                      onClick={() => {
                                        selectBatch(b.batchId);
                                        setActiveTab("POS");
                                      }}
                                    >
                                      <FiShoppingBag size={14} /> Go to POS Sales Counter →
                                    </button>
                                  </div>
                                </div>
                              )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 1: POINT OF SALE (POS) CHECKOUT */}
          {activeTab === "POS" && (
            <div>
              {loading && inventoryBatches.length === 0 ? (
                <div
                  className="clean-card"
                  style={{ textAlign: "center", padding: "60px 20px" }}
                >
                  <div
                    className="spinner"
                    style={{
                      margin: "0 auto 16px",
                      width: "36px",
                      height: "36px",
                    }}
                  ></div>
                  <h4
                    style={{
                      fontSize: "1.05rem",
                      fontWeight: 600,
                      color: "var(--ink-800)",
                      margin: "0 0 6px",
                    }}
                  >
                    Loading Store Inventory & Shelf Matrix...
                  </h4>
                  <p
                    style={{
                      color: "var(--ink-500)",
                      fontSize: "0.82rem",
                      margin: 0,
                    }}
                  >
                    Querying decentralized ledger and shelf inventory
                  </p>
                </div>
              ) : inventoryBatches.length === 0 ? (
                <div
                  className="clean-card"
                  style={{ textAlign: "center", padding: "40px 20px" }}
                >
                  <div
                    style={{
                      color: "var(--primary-honey)",
                      marginBottom: "12px",
                    }}
                  >
                    <FaStore size={36} />
                  </div>
                  <h3
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: 700,
                      color: "var(--ink-900)",
                      marginBottom: "6px",
                    }}
                  >
                    No Batches Inwarded in Store Inventory Yet
                  </h3>
                  <p
                    style={{
                      color: "var(--ink-500)",
                      fontSize: "0.88rem",
                      maxWidth: "480px",
                      margin: "0 auto 16px",
                    }}
                  >
                    To begin selling, inward a dispatched consignment above or
                    advance a batch to Stage 4 (Distributed) in the Supply
                    Pipeline.
                  </p>
                  <a
                    href="/supply-pipeline"
                    className="btn-primary"
                    style={{ textDecoration: "none", display: "inline-flex" }}
                  >
                    View Supply Pipeline →
                  </a>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
                    gap: "20px",
                  }}
                >
                  {/* LEFT COLUMN: Batch Selection & Visual Bottle Shelf Matrix */}
                  <div className="clean-card">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "12px",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      <div>
                        <h4
                          style={{
                            fontSize: "1.1rem",
                            fontWeight: 700,
                            margin: 0,
                            color: "var(--ink-900)",
                          }}
                        >
                          Store Shelf Inventory Matrix
                        </h4>
                        <div
                          style={{
                            fontSize: "0.74rem",
                            color: "var(--ink-500)",
                            marginTop: "2px",
                          }}
                        >
                          Click an available bottle to scan, or click a sold
                          bottle to inspect e-Bill
                        </div>
                      </div>

                      {/* Batch Selector Dropdown */}
                      {inventoryBatches.length > 0 && (
                        <select
                          className="form-control"
                          style={{
                            width: "auto",
                            minWidth: "180px",
                            fontSize: "0.8rem",
                            padding: "5px 10px",
                          }}
                          value={selectedBatchId || ""}
                          onChange={(e) => selectBatch(parseInt(e.target.value))}
                        >
                          {inventoryBatches.map((b) => {
                            const total = parseInt(b.jarsTotal, 10) || 50;
                            const sold = getBatchSoldCount(b);
                            const left = Math.max(0, total - sold);
                            return (
                              <option key={b.batchId} value={b.batchId}>
                                Batch #{b.batchId} ({b.floraName} - {left} left)
                              </option>
                            );
                          })}
                        </select>
                      )}
                    </div>

                    {inventoryBatches.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "36px 20px",
                          background: "var(--bg-app)",
                          borderRadius: "10px",
                          border: "1px dashed var(--ink-300)",
                          margin: "14px 0",
                        }}
                      >
                        <div style={{ fontSize: "2.2rem", marginBottom: "8px" }}>📦</div>
                        <h4 style={{ margin: "0 0 6px 0", color: "var(--ink-800)", fontWeight: 700 }}>
                          No Inwarded Stock on Store Shelves
                        </h4>
                        <p style={{ fontSize: "0.82rem", color: "var(--ink-500)", maxWidth: "460px", margin: "0 auto 16px auto" }}>
                          Consignments assigned to this store must be physically verified and inwarded jar-by-jar at the Inward Desk before appearing on store shelves for customer checkout.
                        </p>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{
                            padding: "8px 18px",
                            fontSize: "0.82rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                          onClick={() => {
                            const inc = incomingBatches[0];
                            if (inc) setInwardActiveBatchId(inc.batchId);
                            window.scrollTo({ top: 300, behavior: "smooth" });
                          }}
                        >
                          <FiSearch size={14} /> Open Inward Desk to Verify & Inward Consignment →
                        </button>
                      </div>
                    ) : selectedBatchData ? (
                      (() => {
                        const totalJarsCount = parseInt(selectedBatchData.jarsTotal, 10) || 50;
                        const soldJarsCount = getBatchSoldCount(selectedBatchData);
                        const availableStock = Math.max(0, totalJarsCount - soldJarsCount);

                        const batchInwardedList =
                          scannedInwardBottles[selectedBatchData.batchId] !==
                          undefined
                            ? scannedInwardBottles[selectedBatchData.batchId]
                            : getStoredInwardBottles(
                                selectedBatchData.batchId,
                                totalJarsCount,
                                selectedBatchData.stageIdx,
                              );
                        const batchInwardedCount = batchInwardedList.length;
                        const isBatchFullyInwarded =
                          batchInwardedCount >= totalJarsCount;
                        const batchRemainingCount = Math.max(
                          0,
                          totalJarsCount - batchInwardedCount,
                        );

                        return (
                          <>
                            {/* Batch Info Snippet */}
                            <div
                              style={{
                                background: "var(--bg-app)",
                                border: "var(--border)",
                                borderRadius: "8px",
                                padding: "10px 14px",
                                marginBottom: "10px",
                                display: "flex",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: "8px",
                                fontSize: "0.78rem",
                              }}
                            >
                              <div>
                                <span style={{ color: "var(--ink-500)" }}>
                                  Batch:
                                </span>{" "}
                                <strong>{selectedBatchData.batchCode}</strong>
                                <span
                                  style={{
                                    margin: "0 8px",
                                    color: "var(--ink-300)",
                                  }}
                                >
                                  •
                                </span>
                                <span style={{ color: "var(--ink-500)" }}>
                                  Flora:
                                </span>{" "}
                                <strong>{selectedBatchData.floraName}</strong>
                              </div>
                              <div>
                                <span style={{ color: "var(--ink-500)" }}>
                                  Stock:
                                </span>{" "}
                                <strong
                                  style={{ color: "var(--primary-honey)" }}
                                >
                                  {availableStock}
                                </strong>{" "}
                                / {totalJarsCount} Jars
                              </div>
                            </div>

                            {/* Consignment Inward Status Banner (Clean, Redirects to Inward Desk) */}
                            <div
                              style={{
                                background: isBatchFullyInwarded
                                  ? "#F0FDF4"
                                  : "#FFFBEB",
                                border: `1px solid ${isBatchFullyInwarded ? "#BBF7D0" : "#FDE68A"}`,
                                borderRadius: "8px",
                                padding: "10px 14px",
                                marginBottom: "14px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                flexWrap: "wrap",
                                gap: "8px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  fontWeight: 600,
                                  color: isBatchFullyInwarded
                                    ? "var(--forest-green)"
                                    : "var(--primary-honey-hover)",
                                }}
                              >
                                {isBatchFullyInwarded ? (
                                  <>
                                    <FiCheckCircle size={13} />
                                    <span>Consignment Inwarded (All {totalJarsCount} Bottles In Store Stock)</span>
                                  </>
                                ) : (
                                  <>
                                    <FiAlertTriangle size={13} />
                                    <span>Inward Pending: {batchInwardedCount} of {totalJarsCount} Bottles Inwarded ({batchRemainingCount} Pending)</span>
                                  </>
                                )}
                              </div>

                              <button
                                type="button"
                                className="btn-outline"
                                style={{
                                  padding: "5px 12px",
                                  fontSize: "0.76rem",
                                  color: "var(--ink-800)",
                                  borderColor: "var(--ink-300)",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                }}
                                onClick={() => {
                                  setInwardActiveBatchId(
                                    selectedBatchData.batchId,
                                  );
                                  window.scrollTo({
                                    top: 300,
                                    behavior: "smooth",
                                  });
                                }}
                                title="Open Digital Inward Desk in Incoming Consignments"
                              >
                                <FiSearch size={12} />
                                {isBatchFullyInwarded
                                  ? "Audit Inward Desk →"
                                  : `Verify & Inward Consignment (${batchRemainingCount} Pending) →`}
                              </button>
                            </div>

                            {/* Bottle Grid Matrix - Shelf Inventory (Selling / In-Stock Only) */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fill, minmax(75px, 1fr))",
                                gap: "6px",
                                maxHeight: "340px",
                                overflowY: "auto",
                                padding: "4px",
                                border: "var(--border)",
                                borderRadius: "8px",
                                background: "var(--bg-card)",
                              }}
                            >
                              {Array.from(
                                { length: selectedBatchData.jarsTotal },
                                (_, i) => i + 1,
                              ).map((num) => {
                                const isSold =
                                  soldBottlesMap[num] &&
                                  soldBottlesMap[num].isSold;
                                const isInwarded =
                                  batchInwardedList.includes(num);
                                const isSelected = selectedBottleNum === num;
                                const bToken = getBottleSecurityToken(
                                  selectedBatchData.batchId,
                                  num,
                                  selectedBatchData.harvestTimestamp,
                                  selectedBatchData.batchCode,
                                );

                                return (
                                  <div
                                    key={num}
                                    onClick={() => {
                                      if (isSold) {
                                        handleViewExistingBill(num);
                                      } else if (!isInwarded) {
                                        setScannerFeedback({
                                          type: "warning",
                                          message: `Bottle #${num} cannot be sold yet!`,
                                          detail: `This jar is Pending Inward and is not in active store shelf stock. Click "Verify & Inward Consignment" above to inward bottles in the Inward Desk.`,
                                        });
                                      } else {
                                        handleSelectBottleDirect(num, bToken);
                                      }
                                    }}
                                    style={{
                                      padding: "6px 3px",
                                      borderRadius: "6px",
                                      textAlign: "center",
                                      cursor: isSold
                                        ? "pointer"
                                        : !isInwarded
                                          ? "not-allowed"
                                          : "pointer",
                                      fontSize: "0.68rem",
                                      fontWeight: 600,
                                      transition: "all 0.15s ease",
                                      background: isSold
                                        ? "var(--bg-app)"
                                        : !isInwarded
                                          ? "#F8FAFC"
                                          : isSelected
                                            ? "var(--primary-honey)"
                                            : "var(--forest-green-light)",
                                      color: isSold
                                        ? "var(--ink-400)"
                                        : !isInwarded
                                          ? "#94A3B8"
                                          : isSelected
                                            ? "#FFFFFF"
                                            : "var(--forest-green)",
                                      border: isSold
                                        ? "1px solid var(--ink-200)"
                                        : !isInwarded
                                          ? "1px dashed #CBD5E1"
                                          : isSelected
                                            ? "2px solid var(--primary-honey-dark)"
                                            : "1px solid var(--forest-green-border)",
                                      opacity: !isInwarded ? 0.7 : 1,
                                    }}
                                    title={
                                      isSold
                                        ? `Bottle #${num} [PIN: ${bToken}] Sold. Click to view e-Bill.`
                                        : !isInwarded
                                          ? `Bottle #${num} [PIN: ${bToken}] Pending Inward (Cannot sell). Open 'Verify & Inward' above to inward.`
                                          : `Bottle #${num} Available in Stock (PIN: ${bToken}). Click to scan for POS sale.`
                                    }
                                  >
                                    <div>#{num}</div>
                                    <div
                                      style={{
                                        fontSize: "0.58rem",
                                        fontFamily: "monospace",
                                        fontWeight: 700,
                                        opacity: !isInwarded ? 0.5 : 0.9,
                                        marginTop: "1px",
                                      }}
                                    >
                                      {bToken}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "0.6rem",
                                        marginTop: "1px",
                                        fontWeight: 700,
                                        color: isSold
                                          ? "var(--ink-400)"
                                          : !isInwarded
                                            ? "#B45309"
                                            : isSelected
                                              ? "#FFFFFF"
                                              : "var(--forest-green)",
                                      }}
                                    >
                                      {isSold
                                        ? "Sold"
                                        : !isInwarded
                                          ? "Pending"
                                          : "In Stock"}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: "14px",
                                marginTop: "10px",
                                fontSize: "0.72rem",
                                color: "var(--ink-500)",
                                justifyContent: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <span
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: "var(--forest-green)",
                                  }}
                                ></span>{" "}
                                In Stock
                              </span>
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <span
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "2px",
                                    background: "#F59E0B",
                                    border: "1px dashed #B45309",
                                  }}
                                ></span>{" "}
                                Pending Inward (Click to inward)
                              </span>
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <span
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: "var(--ink-400)",
                                  }}
                                ></span>{" "}
                                Sold (Click to view e-Bill)
                              </span>
                            </div>
                          </>
                        );
                      })()
                    ) : null}
                  </div>

                  {/* RIGHT COLUMN: POS Scanner & Checkout Form */}
                  {(
                    <div className="clean-card">
                      <h4
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 700,
                          margin: 0,
                          color: "var(--ink-900)",
                          marginBottom: "4px",
                        }}
                      >
                        Point of Sale (POS) Checkout
                      </h4>
                      <p
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--ink-500)",
                          marginBottom: "14px",
                        }}
                      >
                        Scan bottle serial, enter customer credentials, and
                        issue verified blockchain e-Bill
                      </p>

                      <form onSubmit={handleSellBottle}>
                        {/* Scan / Serial Input */}
                        <div style={{ marginBottom: "14px" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "4px",
                            }}
                          >
                            <label
                              style={{
                                fontSize: "0.76rem",
                                fontWeight: 600,
                                color: "var(--ink-700)",
                                margin: 0,
                              }}
                            >
                              Scan Bottle Barcode / QR / Enter Serial:
                            </label>
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{
                                fontSize: "0.72rem",
                                padding: "3px 8px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              onClick={handlePickNextAvailable}
                              title="Auto-select next unsold bottle in this batch"
                            >
                              <FiBox size={12} /> Auto-Select Next
                            </button>
                          </div>
                          <input
                            type="text"
                            className="form-control"
                            placeholder={`e.g. 1, JAR-1, or scan QR`}
                            value={qrScanInput}
                            onChange={(e) => handleScanBottle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleScanBottle(e.target.value);
                              }
                            }}
                          />

                          {/* Scanner Live Validation Alert */}
                          {scannerFeedback && (
                            <div
                              style={{
                                marginTop: "8px",
                                padding: "8px 10px",
                                borderRadius: "6px",
                                fontSize: "0.76rem",
                                fontWeight: 500,
                                background:
                                  scannerFeedback.type === "error"
                                    ? "var(--alert-red-light)"
                                    : "var(--forest-green-light)",
                                color:
                                  scannerFeedback.type === "error"
                                    ? "var(--alert-red)"
                                    : "var(--forest-green)",
                                border: `1px solid ${scannerFeedback.type === "error" ? "var(--alert-red-border)" : "var(--forest-green-border)"}`,
                              }}
                            >
                              {scannerFeedback.message}
                            </div>
                          )}
                        </div>

                        {/* Customer Full Name */}
                        <div style={{ marginBottom: "12px" }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.76rem",
                              fontWeight: 600,
                              color: "var(--ink-700)",
                              marginBottom: "4px",
                            }}
                          >
                            Customer Full Name:
                          </label>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="e.g. Vikas Kumar"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            required
                          />
                        </div>

                        {/* Customer Mobile Number */}
                        <div style={{ marginBottom: "12px" }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.76rem",
                              fontWeight: 600,
                              color: "var(--ink-700)",
                              marginBottom: "4px",
                            }}
                          >
                            Customer Mobile (for e-Bill WhatsApp/SMS):
                          </label>
                          <input
                            type="tel"
                            className="form-control"
                            placeholder="e.g. +91 9876543210"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            required
                          />
                        </div>

                        {/* Payment Mode */}
                        <div style={{ marginBottom: "16px" }}>
                          <label
                            style={{
                              display: "block",
                              fontSize: "0.76rem",
                              fontWeight: 600,
                              color: "var(--ink-700)",
                              marginBottom: "4px",
                            }}
                          >
                            Payment Method:
                          </label>
                          <select
                            className="form-control"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                          >
                            <option value="UPI">
                              UPI (BHIM / Google Pay / PhonePe)
                            </option>
                            <option value="Cash">Cash Payment</option>
                            <option value="Debit Card">
                              Debit / Credit Card
                            </option>
                            <option value="Net Banking">Net Banking</option>
                          </select>
                        </div>

                        {/* Financial Tax Summary Card */}
                        <div
                          style={{
                            background: "var(--bg-app)",
                            border: "var(--border)",
                            borderRadius: "8px",
                            padding: "12px 14px",
                            marginBottom: "16px",
                            fontSize: "0.78rem",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "4px",
                            }}
                          >
                            <span style={{ color: "var(--ink-500)" }}>
                              Unit Price (500g Jar):
                            </span>
                            <span>₹428.57</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "4px",
                            }}
                          >
                            <span style={{ color: "var(--ink-500)" }}>
                              CGST (2.5%):
                            </span>
                            <span>₹10.71</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: "6px",
                            }}
                          >
                            <span style={{ color: "var(--ink-500)" }}>
                              SGST (2.5%):
                            </span>
                            <span>₹10.71</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              borderTop: "1px solid var(--ink-200)",
                              paddingTop: "6px",
                              fontWeight: 700,
                              fontSize: "0.88rem",
                              color: "var(--ink-900)",
                            }}
                          >
                            <span>Total Amount Payable:</span>
                            <span style={{ color: "var(--forest-green)" }}>
                              ₹450.00
                            </span>
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="btn-honey"
                          style={{
                            width: "100%",
                            justifyContent: "center",
                            padding: "10px",
                            opacity: !authStatus.isAuthorized ? 0.6 : 1,
                            cursor: !authStatus.isAuthorized ? "not-allowed" : "pointer"
                          }}
                          disabled={loading || !selectedBottleNum || !authStatus.isAuthorized}
                        >
                          {loading
                            ? "Confirming Sale on Blockchain..."
                            : !authStatus.isAuthorized
                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><FiLock size={13} /> Locked: Retailer or Admin Role Required</span>
                              : `Complete Sale & Generate e-Bill (${selectedBottleNum ? `Bottle #${selectedBottleNum}` : "Select Bottle"})`}
                        </button>
                      </form>
                    </div>
                  )}

                  
                </div>
              )}
            </div>
          )}

          {/* TAB 2: STORE INVENTORY TABLE */}
          {activeTab === "INVENTORY" && (
            <div className="clean-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "14px",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <div>
                  <h4
                    style={{
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      margin: 0,
                      color: "var(--ink-900)",
                    }}
                  >
                    Active Store Inventory Batches
                  </h4>
                  <div
                    style={{
                      fontSize: "0.76rem",
                      color: "var(--ink-500)",
                      marginTop: "2px",
                    }}
                  >
                    All cryptographic consignments stocked in this retail store
                  </div>
                </div>
              </div>

              <div className="table-responsive">
                <table className="honey-table">
                  <thead>
                    <tr>
                      <th>Batch ID</th>
                      <th>Flora Type</th>
                      <th>Harvest Cluster</th>
                      <th>Harvest Date</th>
                      <th>Total Jars</th>
                      <th>Sold</th>
                      <th>Available</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryBatches.length === 0 ? (
                      <tr>
                        <td
                          colSpan="9"
                          style={{
                            textAlign: "center",
                            padding: "24px",
                            color: "var(--ink-400)",
                          }}
                        >
                          No active inventory batches yet. Accept incoming
                          shipments above.
                        </td>
                      </tr>
                    ) : (
                      inventoryBatches.map((b) => (
                        <tr key={b.batchId}>
                          <td>
                            <strong>#{b.batchId}</strong> ({b.batchCode})
                          </td>
                          <td>
                            <span className="badge-purity">{b.floraName}</span>
                          </td>
                          <td>{b.clusterLocation}</td>
                          <td style={{ color: "var(--ink-500)" }}>
                            {new Date(
                              parseInt(b.harvestTimestamp) * 1000,
                            ).toLocaleDateString()}
                          </td>
                          <td>{parseInt(b.jarsTotal, 10) || 50}</td>
                          <td
                            style={{
                              color: "var(--forest-green)",
                              fontWeight: 600,
                            }}
                          >
                            {getBatchSoldCount(b)}
                          </td>
                          <td>
                            <strong
                              style={{
                                color:
                                  (parseInt(b.jarsTotal, 10) || 50) - getBatchSoldCount(b) > 0
                                    ? "var(--primary-honey)"
                                    : "var(--ink-400)",
                              }}
                            >
                              {Math.max(0, (parseInt(b.jarsTotal, 10) || 50) - getBatchSoldCount(b))}
                            </strong>
                          </td>
                          <td>
                            <span
                              className={
                                getBatchSoldCount(b) >= (parseInt(b.jarsTotal, 10) || 50)
                                  ? "badge-pending"
                                  : "badge-purity"
                              }
                            >
                              {getBatchSoldCount(b) >= (parseInt(b.jarsTotal, 10) || 50)
                                ? "Sold Out"
                                : "Active on Shelf"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn-primary"
                              style={{
                                padding: "4px 10px",
                                fontSize: "0.74rem",
                              }}
                              onClick={() => {
                                selectBatch(b.batchId);
                                setActiveTab("POS");
                              }}
                            >
                              Open POS Matrix →
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* OFFICIAL KVIC DIGITAL E-BILL & TAX INVOICE MODAL */}
      <TaxInvoiceModal
        isOpen={showBillModal && Boolean(generatedBill)}
        onClose={() => setShowBillModal(false)}
        billData={generatedBill}
      />
    </div>
  );
}

export default RetailPOS;
