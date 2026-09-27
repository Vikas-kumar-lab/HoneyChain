import React, { useState, useEffect, useRef } from "react";
import { 
  getContractInstance, 
  ensureCorrectNetwork, 
  executeBlockchainRelayer,
  cachedCall, 
  clearWeb3Cache,
  invalidateContractCache
} from "../web3Utils";
import { 
  getStoredHives, 
  saveStoredHive, 
  saveStoredHives, 
  getStoredBatches, 
  saveStoredBatch, 
  saveStoredBatches,
  fetchBatchesFromServer,
  getStoredBeekeeperProfile,
  saveStoredBeekeeperProfile
} from "../hiveBatchRegistry";
import { useAuth } from "../context/AuthContext";
import { 
    FiCheckCircle, 
    FiAlertCircle, 
    FiBox, 
    FiX, 
    FiLock, 
    FiZap, 
    FiRefreshCw,
    FiMapPin,
    FiExternalLink
} from "react-icons/fi";
import { HarvestedBatchesTable } from "../components";
import { 
  captureDeviceCoordinates, 
  captureHiveCoordinates, 
  formatCoordinates, 
  getGoogleMapsUrl, 
  getRegionalHiveCoordinates,
  resolveCoordinateArea
} from "../geoUtils";

const KVIC_ADMIN_ADDR = '0x556FCE98dC5b75C5097eEf0581BC17f771944EbB';

const generateBatchTrackingCode = (targetHive) => {
  let boxClean = 'IND01';
  if (targetHive && targetHive.boxCode) {
    boxClean = targetHive.boxCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (boxClean.startsWith('HIVE')) boxClean = boxClean.slice(4) || 'IND01';
  }
  const year = new Date().getFullYear();
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  return `HC-${year}-${boxClean}-${randSuffix}`;
};

const getRegionalPrefix = (st, loc) => {
  const s = (st || "").toLowerCase().trim();
  const l = (loc || "").toLowerCase().trim();
  if (s.includes("kashmir") || l.includes("kashmir") || l.includes("pampore")) return "JK";
  if (s.includes("uttar pradesh") || l.includes("agra") || l.includes("lucknow") || l.includes("varanasi")) return "UP";
  if (s.includes("uttar")) return s.includes("khand") ? "UK" : "UP";
  if (s.includes("himachal") || l.includes("kangra") || l.includes("kullu") || l.includes("shimla")) return "HP";
  if (s.includes("uttarakhand") || l.includes("dehradun") || l.includes("nainital")) return "UK";
  if (s.includes("punjab")) return "PB";
  if (s.includes("delhi")) return "DL";
  if (s.includes("rajasthan")) return "RJ";
  if (s.includes("bengal") || l.includes("sundarban")) return "WB";
  if (s.includes("gujarat")) return "GJ";
  if (s.includes("maharashtra")) return "MH";
  if (s.includes("madhya pradesh")) return "MP";
  if (s.includes("bihar")) return "BR";
  if (s.includes("assam")) return "AS";
  if (s.includes("kerala")) return "KL";
  if (s.length >= 2) return s.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase();
  if (l.length >= 2) return l.replace(/[^a-zA-Z]/g, "").substring(0, 3).toUpperCase();
  return "IND";
};

const generateAutoBoxCode = (st, loc, existingHives = []) => {
  const prefix = getRegionalPrefix(st, loc);
  const existing = new Set((existingHives || []).map(h => (h.boxCode || "").toUpperCase()));
  try {
    const raw = localStorage.getItem('honeychain_registered_hives');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(h => existing.add((h.boxCode || "").toUpperCase()));
      }
    }
  } catch (_) {}

  for (let i = 1; i <= 99; i++) {
    const code = `HIVE-${prefix}-${String(i).padStart(2, "0")}`;
    if (!existing.has(code.toUpperCase())) {
      return code;
    }
  }
  return `HIVE-${prefix}-${Date.now().toString().slice(-4)}`;
};

function BeekeeperPortal() {
  const { roleInfo, account: authAccount, currentUser } = useAuth();
  const userRoleTypes = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
  const isAdminInit = userRoleTypes.includes('ADMIN') || Boolean(authAccount && authAccount.toLowerCase() === KVIC_ADMIN_ADDR);

  const [account, setAccount] = useState(authAccount || "");
  const [contract, setContract] = useState(null);
  const initialHives = getStoredHives();
  const initialBatches = getStoredBatches();
  const initialProfile = getStoredBeekeeperProfile();
  const [hives, setHives] = useState(initialHives);
  const [batches, setBatches] = useState(initialBatches);
  const [selectedHiveId, setSelectedHiveId] = useState(() => String(initialHives[0]?.id || ''));
  const [selectedHiveBoxCode, setSelectedHiveBoxCode] = useState(() => initialHives[0]?.boxCode || '');
  const [yieldKg, setYieldKg] = useState(25);
  const [batchCode, setBatchCode] = useState(() =>
    initialHives[0] ? generateBatchTrackingCode(initialHives[0]) : ''
  );
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Registration form states
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [beekeeperProfile, setBeekeeperProfile] = useState(initialProfile);
  const [isAdmin, setIsAdmin] = useState(isAdminInit);

  // Sync from global AuthContext (instant, zero RPC delay)
  useEffect(() => {
    const types = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
    const isAdm = types.includes('ADMIN') || Boolean(authAccount && authAccount.toLowerCase() === KVIC_ADMIN_ADDR);
    setIsAdmin(isAdm);
  }, [roleInfo, authAccount]);

  // Dynamically update Batch Tracking Code whenever selected Hive changes
  useEffect(() => {
    if (hives.length > 0) {
      const currentHive = 
        (selectedHiveBoxCode && hives.find(h => String(h.boxCode).toUpperCase() === String(selectedHiveBoxCode).toUpperCase())) ||
        (selectedHiveId && hives.find(h => String(h.id) === String(selectedHiveId))) ||
        hives[0];
      if (currentHive) {
        setBatchCode(generateBatchTrackingCode(currentHive));
      }
    }
  }, [selectedHiveBoxCode, selectedHiveId, hives]);
  const [regName, setRegName] = useState(() => currentUser?.name || beekeeperProfile?.name || "Registered Apiary");
  const [regLocation, setRegLocation] = useState(() => beekeeperProfile?.location || currentUser?.location || "Apiary Cluster");
  const [regState, setRegState] = useState(() => beekeeperProfile?.state || currentUser?.state || "India");
  const [regBoxCode, setRegBoxCode] = useState(() => generateAutoBoxCode(beekeeperProfile?.state || currentUser?.state || "India", beekeeperProfile?.location || currentUser?.location || "Apiary Cluster", initialHives));
  const [regFlora, setRegFlora] = useState(1);

  // Hive GPS Coordinates State
  const initialDefaultCoords = getRegionalHiveCoordinates(beekeeperProfile?.state || currentUser?.state || "India", beekeeperProfile?.location || currentUser?.location || "Apiary Cluster");
  const [hiveCoords, setHiveCoords] = useState(initialDefaultCoords);
  const [manualLat, setManualLat] = useState(() => String(initialDefaultCoords.latitude || initialDefaultCoords.lat || 33.9982));
  const [manualLng, setManualLng] = useState(() => String(initialDefaultCoords.longitude || initialDefaultCoords.lng || 74.9189));
  const isCoordsManuallyEdited = useRef(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsDetectionMsg, setGpsDetectionMsg] = useState("");

  const detectHiveLocation = async (st = regState, loc = regLocation) => {
    setIsDetectingGps(true);
    setGpsDetectionMsg("Acquiring GPS fix & resolving area...");
    try {
      const coords = await captureHiveCoordinates(st, loc);
      setHiveCoords(coords);
      setManualLat(String(coords.latitude || coords.lat));
      setManualLng(String(coords.longitude || coords.lng));
      if (coords.locationName) {
        setRegLocation(coords.locationName);
      }
      if (coords.state) {
        setRegState(coords.state);
      }
      setGpsDetectionMsg(coords.isLiveGPS ? `Live GPS Locked: ${coords.locationName} (±${coords.accuracy}m)` : `Cluster baseline loaded`);
      return coords;
    } catch (e) {
      const fb = getRegionalHiveCoordinates(st, loc);
      setHiveCoords(fb);
      setManualLat(String(fb.lat));
      setManualLng(String(fb.lng));
      setGpsDetectionMsg(`Cluster baseline loaded`);
      return fb;
    } finally {
      setIsDetectingGps(false);
    }
  };

  const openRegisterHiveModal = (initialSt, initialLoc) => {
    isCoordsManuallyEdited.current = false;
    const defName = beekeeperProfile?.name || currentUser?.name || "Registered Beekeeper";
    const defLoc = initialLoc || beekeeperProfile?.location || currentUser?.location || "Apiary Cluster";
    const defSt = initialSt || beekeeperProfile?.state || currentUser?.state || "India";
    setRegName(defName);
    setRegLocation(defLoc);
    setRegState(defSt);
    setRegBoxCode(generateAutoBoxCode(defSt, defLoc, hives));
    setRegFlora(1);
    detectHiveLocation(defSt, defLoc);
    setShowRegisterModal(true);
  };

  const handleLocationOrStateChange = (newLoc, newSt) => {
    const loc = newLoc !== undefined ? newLoc : regLocation;
    const st = newSt !== undefined ? newSt : regState;
    setRegBoxCode(generateAutoBoxCode(st, loc, hives));
    // Only update baseline coordinates if the user hasn't typed custom testing coordinates
    if (!isCoordsManuallyEdited.current) {
      const regional = getRegionalHiveCoordinates(st, loc);
      setHiveCoords(regional);
      setManualLat(String(regional.lat));
      setManualLng(String(regional.lng));
    }
  };

  useEffect(() => {
    let contractRef = null;
    const onAccountsChanged = async (accs) => {
      const newAcc = accs[0] || "";
      setAccount(newAcc);
      if (contractRef) {
        await checkBeekeeperProfile(contractRef, newAcc);
        await loadHivesFromContract(contractRef);
      }
    };

    const runInit = async () => {
      try {
        const { readContract, writeContract, userAccount } = await getContractInstance();
        contractRef = readContract;
        const activeUser = (window.ethereum && window.ethereum.selectedAddress) || userAccount || "";
        if (activeUser) setAccount(activeUser);
        setContract(writeContract);

        await Promise.all([
          activeUser ? checkBeekeeperProfile(readContract, activeUser) : Promise.resolve(),
          loadHivesFromContract(readContract),
          loadBatches(readContract)
        ]);
      } catch (e) {
        console.log("Blockchain init error:", e);
      }
    };

    runInit();

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", onAccountsChanged);
    }
    return () => {
      if (window.ethereum && window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line no-unused-vars
  const ensureAccount = async () => {
    let cur = account;
    if (window.ethereum) {
      try {
        await ensureCorrectNetwork();
        const accs = await window.ethereum.request({
          method: "eth_requestAccounts",
        });
        if (accs && accs.length > 0) {
          cur = accs[0];
          setAccount(cur);
          if (contract) checkBeekeeperProfile(contract, cur);
        }
      } catch (err) {
        console.error("Wallet connection error:", err);
      }
    }
    return cur;
  };

  const checkBeekeeperProfile = async (c, userAddr) => {
    if (!c) return;
    try {
      const isAdm = roleInfo?.types?.includes('ADMIN') || currentUser?.roleKey === 'ADMIN';
      setIsAdmin(isAdm);

      const isBkp = roleInfo?.types?.includes('BEEKEEPER') || currentUser?.roleKey === 'BEEKEEPER';
      if (isBkp) {
        let bkpId = 0;
        if (userAddr) {
          bkpId = await c.methods.beekeeperIdByWallet(userAddr).call().catch(() => '0');
        }
        if (parseInt(bkpId) === 0 && currentUser?.address) {
          bkpId = await c.methods.beekeeperIdByWallet(currentUser.address).call().catch(() => '0');
        }

        const bkpCount = parseInt(await c.methods.beekeeperCount().call().catch(() => 0));
        if (parseInt(bkpId) === 0 && bkpCount > 0) {
          for (let i = 1; i <= bkpCount; i++) {
            const bData = await c.methods.beekeepers(i).call().catch(() => null);
            if (bData && (
              (bData.name && currentUser?.name && (
                bData.name.toLowerCase().includes(currentUser.name.toLowerCase()) || 
                currentUser.name.toLowerCase().includes(bData.name.toLowerCase())
              )) ||
              (bData.wallet && currentUser?.address && bData.wallet.toLowerCase() === currentUser.address.toLowerCase())
            )) {
              bkpId = i;
              break;
            }
          }
        }

        if (parseInt(bkpId) === 0 && bkpCount > 0) {
          bkpId = 1;
        }

        if (parseInt(bkpId) > 0) {
          const bkpData = await c.methods.beekeepers(bkpId).call().catch(() => null);
          if (bkpData) {
            const profile = {
              id: parseInt(bkpId),
              name: bkpData.name || currentUser?.name || 'Certified Beekeeper',
              location: bkpData.clusterLocation || 'Apiary Cluster',
              state: bkpData.state || 'Jammu & Kashmir',
              regNum: bkpData.kvicRegNumber || currentUser?.username || 'KVIC-BKP',
              totalBoxes: parseInt(bkpData.totalBoxes || 1),
              wallet: bkpData.wallet || currentUser?.address
            };
            setBeekeeperProfile(profile);
            saveStoredBeekeeperProfile(profile);
            setRegName(profile.name);
            setRegLocation(profile.location);
            setRegState(profile.state);
            setRegBoxCode(generateAutoBoxCode(profile.state, profile.location));
            return;
          }
        }

        const fallbackProfile = {
          id: 1,
          name: currentUser?.name || 'Certified Beekeeper',
          location: 'Apiary Cluster',
          state: 'Jammu & Kashmir',
          regNum: currentUser?.username || 'KVIC-BKP',
          totalBoxes: 1,
          wallet: currentUser?.address
        };
        setBeekeeperProfile(fallbackProfile);
        saveStoredBeekeeperProfile(fallbackProfile);
        setRegName(fallbackProfile.name);
        setRegLocation(fallbackProfile.location);
        setRegState(fallbackProfile.state);
        setRegBoxCode(generateAutoBoxCode(fallbackProfile.state, fallbackProfile.location));
      } else {
        setBeekeeperProfile(null);
      }
    } catch (e) {
      console.log("Error checking beekeeper profile:", e);
    }
  };

  const loadHivesFromContract = async (c) => {
    try {
      const list = await cachedCall(async () => {
        const hCount = parseInt(await c.methods.hiveCount().call());
        if (hCount === 0) return [];
        const hiveIndices = Array.from({ length: hCount }, (_, i) => i + 1);
        return await Promise.all(
          hiveIndices.map(async (i) => {
            const h = await c.methods.smartHives(i).call();
            const [bkp, floraStr] = await Promise.all([
              c.methods.beekeepers(h.beekeeperId).call().catch(() => ({ name: 'Registered Beekeeper', clusterLocation: '' })),
              c.methods.getFloraString(h.flora).call().catch(() => 'Pure Honey')
            ]);
            return {
              id: parseInt(h.hiveId),
              boxCode: h.boxIdentifier,
              beekeeper: bkp.name,
              location: bkp.clusterLocation,
              flora: floraStr,
              beekeeperId: parseInt(h.beekeeperId),
              wallet: bkp.wallet
            };
          })
        );
      }, 'cached_hives_list', 1500);

      if (list.length === 0) {
        setHives([]);
        saveStoredHives([]);
        setSelectedHiveId('');
        setSelectedHiveBoxCode('');
        setBatchCode('');
        return;
      }

      const stored = getStoredHives();
      const map = new Map();
      list.forEach(h => {
        const k = (h.boxCode || h.id || '').toString().toUpperCase();
        if (k) {
          const prev = stored.find(s => (s.boxCode || s.id || '').toString().toUpperCase() === k);
          const fallbackGeo = getRegionalHiveCoordinates('', h.location);
          const mergedH = {
            ...h,
            coordinates: prev?.coordinates || h.coordinates || fallbackGeo,
            latitude: prev?.latitude ?? h.latitude ?? prev?.coordinates?.latitude ?? fallbackGeo.latitude,
            longitude: prev?.longitude ?? h.longitude ?? prev?.coordinates?.longitude ?? fallbackGeo.longitude,
            formattedCoordinates: prev?.formattedCoordinates || h.formattedCoordinates || prev?.coordinates?.formatted || fallbackGeo.formatted
          };
          map.set(k, mergedH);
        }
      });
      let merged = Array.from(map.values());
      setHives(merged);
      saveStoredHives(merged);

      if (merged.length > 0) {
        setSelectedHiveBoxCode(prevBox => {
          const match = prevBox ? merged.find(h => String(h.boxCode).toUpperCase() === String(prevBox).toUpperCase()) : null;
          const chosen = match || merged[0];
          setSelectedHiveId(String(chosen.id));
          setBatchCode(generateBatchTrackingCode(chosen));
          return chosen.boxCode;
        });
      } else {
        setSelectedHiveId('');
        setSelectedHiveBoxCode('');
        setBatchCode('');
      }
      if ((roleInfo?.types?.includes('BEEKEEPER') || currentUser?.roleKey === 'BEEKEEPER') && !beekeeperProfile) {
        checkBeekeeperProfile(c, account);
      }
    } catch (e) {
      console.log("Error loading hives:", e);
      const stored = getStoredHives();
      setHives(stored);
      if (stored.length > 0) {
        const hiveStillExists = selectedHiveId && stored.some(h => String(h.id) === String(selectedHiveId));
        const nextId = hiveStillExists ? selectedHiveId : String(stored[0].id);
        setSelectedHiveId(String(nextId));
      } else {
        setSelectedHiveId('');
        setBatchCode('');
      }
    }
  };

  const loadBatches = async (c) => {
    try {
      const list = await cachedCall(async () => {
        const count = parseInt(await c.methods.batchCount().call());
        if (count === 0) return [];
        const batchIndices = Array.from({ length: count }, (_, i) => i + 1);
        return await Promise.all(
          batchIndices.map(async (i) => {
            const [basic, status] = await Promise.all([
              c.methods.getBatchBasic(i).call(),
              c.methods.getBatchStatus(i).call()
            ]);
            return { ...basic, ...status };
          })
        );
      }, 'cached_beekeeper_batches', 1500);

      const serverBatches = await fetchBatchesFromServer().catch(() => []);
      const stored = (serverBatches && serverBatches.length > 0) ? serverBatches : getStoredBatches();
      const map = new Map();
      (list || []).forEach(b => {
        const k = (b.batchCode || b.batchId || '').toString().toUpperCase();
        if (k) map.set(k, b);
      });
      stored.forEach(b => {
        const k = (b.batchCode || b.batchId || '').toString().toUpperCase();
        if (!map.has(k)) map.set(k, b);
      });
      const merged = Array.from(map.values()).sort((a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0));
      setBatches(merged);
      if (merged.length > 0) {
        saveStoredBatches(merged);
      } else {
        saveStoredBatches([]);
      }
    } catch (e) {
      console.log("Error loading batches:", e);
      const stored = getStoredBatches();
      if (stored.length > 0) {
        const sorted = [...stored].sort((a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0));
        setBatches(sorted);
      }
    }
  };

  const handleRegisterHive = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNotification(null);

    try {
      const isAuthorized = userRoleTypes.includes('BEEKEEPER') || userRoleTypes.includes('ADMIN') || currentUser?.roleKey === 'BEEKEEPER' || currentUser?.roleKey === 'ADMIN';
      if (!isAuthorized) {
        throw new Error("Access Denied: Please sign in as a Beekeeper or Administrator to register smart bee boxes.");
      }

      const effectiveState = (regState || beekeeperProfile?.state || currentUser?.state || "India").trim();
      const effectiveLocation = (regLocation || beekeeperProfile?.location || currentUser?.location || "Apiary Cluster").trim();
      let cleanBoxCode = (regBoxCode.trim() || generateAutoBoxCode(effectiveState, effectiveLocation, hives)).trim();
      if (!cleanBoxCode) {
        const pfx = getRegionalPrefix(effectiveState, effectiveLocation);
        cleanBoxCode = `HIVE-${pfx}-${Date.now().toString().slice(-4)}`;
      }
      // Ensure unique code on blockchain to prevent duplicate hash revert
      if (hives.some(h => (h.boxCode || '').toUpperCase() === cleanBoxCode.toUpperCase())) {
        const pfx = getRegionalPrefix(effectiveState, effectiveLocation);
        cleanBoxCode = `HIVE-${pfx}-${Math.floor(10 + Math.random() * 89)}${Date.now().toString().slice(-3)}`;
      }

      const { readContract: rContract } = await getContractInstance();
      setNotification({ type: 'info', message: '⏳ Transmitting registration to Blockchain Relayer Gateway...' });

      // If beekeeper not yet registered, register beekeeper first via relayer
      let activeBkpId = beekeeperProfile?.id || 0;
      if (activeBkpId === 0) {
        const prefix = getRegionalPrefix(effectiveState, effectiveLocation);
        const randNum = Math.floor(1000 + Math.random() * 9000);
        const regNum = `KVIC/HM/2026/${prefix}/${randNum}`;

        const bkpRes = await executeBlockchainRelayer('register-beekeeper', {
          name: (regName || currentUser?.name || "Certified Apiary").trim(),
          clusterLocation: effectiveLocation || "Apiary Cluster",
          state: effectiveState || "India",
          kvicRegNumber: regNum
        });
        activeBkpId = bkpRes.beekeeperId || 1;
      }

      // Authoritative hive coordinates calculation - strictly respect manualLat / manualLng
      const numLat = parseFloat(manualLat);
      const numLng = parseFloat(manualLng);
      const validManual = !isNaN(numLat) && !isNaN(numLng) && numLat !== 0 && numLng !== 0;
      const finalLat = validManual ? numLat : (hiveCoords?.latitude ? Number(hiveCoords.latitude) : 33.9982);
      const finalLng = validManual ? numLng : (hiveCoords?.longitude ? Number(hiveCoords.longitude) : 74.9189);
      const finalFormatted = formatCoordinates(finalLat, finalLng);
      
      // Strictly preserve the user's explicitly entered location string (e.g. "Pampore")
      const rawUserLoc = (regLocation || effectiveLocation || "").trim();
      const authoritativeLocation = (rawUserLoc && rawUserLoc !== "Apiary Cluster" && rawUserLoc !== "Apiary Zone")
        ? rawUserLoc
        : (hiveCoords?.locationName || resolveCoordinateArea(finalLat, finalLng, effectiveLocation));

      const hiveCoordinatesObj = {
        lat: finalLat,
        lng: finalLng,
        latitude: finalLat,
        longitude: finalLng,
        accuracy: hiveCoords?.accuracy || 15,
        formatted: finalFormatted,
        locationName: authoritativeLocation,
        isLiveGPS: Boolean(hiveCoords?.isLiveGPS),
        timestamp: Math.floor(Date.now() / 1000)
      };

      // Register Smart Hive Box linked to activeBkpId
      const hiveRes = await executeBlockchainRelayer('register-hive', {
        beekeeperId: activeBkpId,
        boxIdentifier: cleanBoxCode,
        flora: parseInt(regFlora),
        beekeeperName: (regName || beekeeperProfile?.name || currentUser?.name || "Registered Beekeeper").trim(),
        clusterLocation: authoritativeLocation,
        coordinates: hiveCoordinatesObj,
        latitude: finalLat,
        longitude: finalLng,
        formattedCoordinates: finalFormatted
      });

      const floraMap = {
        0: "Mustard Flower Honey",
        1: "Kashmir Acacia Honey",
        2: "Eucalyptus Honey",
        3: "Wild Sidr Honey",
        4: "Himalayan Multifloral Honey",
        5: "Sundarbans Forest Wild"
      };
      const maxExistingId = hives.reduce((max, h) => {
        const num = parseInt(h.id, 10);
        return !isNaN(num) && num > max ? num : max;
      }, 0);
      const assignedHiveId = (hiveRes && typeof hiveRes.hiveId === 'number' && hiveRes.hiveId > 0 && !hives.some(h => Number(h.id) === Number(hiveRes.hiveId)))
        ? hiveRes.hiveId 
        : (maxExistingId + 1);
      const newlyAddedHive = {
        id: assignedHiveId,
        boxCode: cleanBoxCode,
        beekeeper: (regName || beekeeperProfile?.name || currentUser?.name || "Registered Beekeeper").trim(),
        location: authoritativeLocation,
        flora: floraMap[parseInt(regFlora)] || "Natural Flora Honey",
        beekeeperId: activeBkpId || 1,
        wallet: account || (currentUser?.address || '0x0000000000000000000000000000000000000000'),
        coordinates: hiveCoordinatesObj,
        latitude: finalLat,
        longitude: finalLng,
        formattedCoordinates: finalFormatted
      };

      // Optimistically update hives immediately so the harvest form and hive cards show up instantly!
      setHives(prev => {
        const filtered = prev.filter(h => (h.boxCode || '').toUpperCase() !== cleanBoxCode.toUpperCase());
        return [...filtered, newlyAddedHive];
      });
      saveStoredHive(newlyAddedHive);
      setSelectedHiveId(String(assignedHiveId));
      setSelectedHiveBoxCode(cleanBoxCode);
      setBatchCode(generateBatchTrackingCode(newlyAddedHive));

      if (!beekeeperProfile || beekeeperProfile.id === 0) {
        const newProf = {
          id: activeBkpId || 1,
          name: (regName || currentUser?.name || "Registered Beekeeper").trim(),
          location: effectiveLocation,
          state: effectiveState,
          regNum: `KVIC-BKP-${Math.floor(1000 + Math.random() * 9000)}`,
          totalBoxes: 1,
          wallet: account || (currentUser?.address || '0x0000000000000000000000000000000000000000')
        };
        setBeekeeperProfile(newProf);
        saveStoredBeekeeperProfile(newProf);
      }

      clearWeb3Cache();
      invalidateContractCache('cached_hives_list');
      setNotification({
        type: "success",
        message: `Smart Bee Box "${cleanBoxCode}" registered on Blockchain! Tx: ${hiveRes.transactionHash ? hiveRes.transactionHash.slice(0, 10) + '...' : 'Confirmed'}`,
      });
      setShowRegisterModal(false);

      if (rContract) {
        loadHivesFromContract(rContract).catch(() => {});
        checkBeekeeperProfile(rContract, account).catch(() => {});
        loadBatches(rContract).catch(() => {});
      }
    } catch (err) {
      console.error("Registration error:", err);
      setNotification({
        type: "danger",
        message: "Registration failed: " + (err.message || "Blockchain transaction failed."),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleHarvestSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setNotification(null);

    try {
      if (userRoleTypes.includes('ADMIN') || currentUser?.roleKey === 'ADMIN') {
        throw new Error("Administrator Read-Only Mode: KVIC Administrator role is strictly restricted to system audit and governance. Only certified Beekeepers can record honey extractions on the blockchain.");
      }

      const isAuthorized = userRoleTypes.includes('BEEKEEPER') || currentUser?.roleKey === 'BEEKEEPER';
      if (!isAuthorized) {
        throw new Error("Access Denied: Please sign in as a certified Beekeeper to record comb extractions.");
      }

      if (!selectedHiveId) throw new Error("Please select a registered smart hive to harvest from.");
      if (batches.some(b => (b.batchCode || '').toLowerCase() === batchCode.trim().toLowerCase())) {
        throw new Error(`Batch code "${batchCode}" has already been recorded on blockchain. Please generate a unique code.`);
      }

      const { readContract: rContract } = await getContractInstance();
      const telemetryHash =
        "0x" +
        Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      setNotification({
        type: 'info',
        message: '⏳ Transmitting harvest to Blockchain Relayer Gateway...',
      });

      const currentHive = 
        (selectedHiveBoxCode && hives.find(h => String(h.boxCode).toUpperCase() === String(selectedHiveBoxCode).toUpperCase())) ||
        (selectedHiveId && hives.find(h => String(h.id) === String(selectedHiveId))) ||
        hives[0];

      const res = await executeBlockchainRelayer('harvest', {
        hiveId: currentHive?.id || selectedHiveId,
        batchCode,
        yieldWeightKg: parseInt(yieldKg),
        iotTelemetryHash: telemetryHash
      });
      let beeGps = currentHive?.coordinates || null;
      if (!beeGps) {
        try {
          beeGps = await captureDeviceCoordinates('BEEKEEPER');
        } catch (e) {
          console.warn("Beekeeper GPS capture fallback:", e);
        }
      }

      const assignedBatchId = batches.length > 0 
        ? Math.max(...batches.map(b => parseInt(b.batchId) || 0)) + 1 
        : 1;
      const newlyHarvestedBatch = {
        batchId: assignedBatchId,
        batchCode,
        beekeeperName: currentHive?.beekeeper || beekeeperProfile?.name || currentUser?.name || "Registered Beekeeper",
        clusterLocation: currentHive?.location || beekeeperProfile?.location || "Regional Apiary Cluster",
        floraName: currentHive?.flora || "Natural Flora Honey",
        harvestTimestamp: Math.floor(Date.now() / 1000),
        yieldWeightKg: parseInt(yieldKg),
        stageName: "Harvested from Smart Hive",
        currentStage: "Harvested",
        stageIdx: 0,
        isCertifiedPure: false,
        isFlagged: false,
        flagReason: "",
        coordinates: beeGps,
        history: [
          {
            stage: 0,
            stageName: 'Harvested',
            actor: currentHive?.wallet || account || currentUser?.address || 'Registered Beekeeper',
            location: currentHive?.location || beekeeperProfile?.location || 'Apiary Colony',
            timestamp: Math.floor(Date.now() / 1000),
            notes: `Harvested ${parseInt(yieldKg)}kg ${currentHive?.flora || 'floral honey'} directly from smart box ${currentHive?.boxCode || ''}`,
            coordinates: beeGps
          }
        ]
      };
      setBatches(prev => {
        const filtered = prev.filter(b => (b.batchCode || '').toLowerCase() !== batchCode.toLowerCase());
        return [...filtered, newlyHarvestedBatch].sort((a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0));
      });
      saveStoredBatch(newlyHarvestedBatch);

      clearWeb3Cache();
      setNotification({
        type: "success",
        message: `Batch #${batchCode} recorded on Blockchain! (Block #${res.blockNumber || 'Live'}, Tx: ${res.transactionHash ? res.transactionHash.slice(0, 10) + '...' : 'Confirmed'})`,
      });
      setBatchCode(generateBatchTrackingCode(currentHive));
      if (rContract) {
        loadBatches(rContract).catch(() => {});
      }
    } catch (err) {
      console.error("Harvest error:", err);
      setNotification({
        type: "danger",
        message: "Blockchain transaction failed: " + (err.message || "Relayer error."),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1.65rem",
              fontWeight: 700,
              margin: 0,
              color: "var(--ink-900)",
            }}
          >
            Rural Beekeeper Harvest Logger
          </h2>
          <p
            style={{ color: "var(--ink-500)", margin: "4px 0 0", fontSize: "0.86rem" }}
          >
            Record fresh comb extractions from registered smart bee boxes
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          {beekeeperProfile && userRoleTypes.includes('BEEKEEPER') && (
            <button
              className="btn-primary"
              onClick={() => openRegisterHiveModal()}
            >
              + Add Smart Bee Box
            </button>
          )}
        </div>
      </div>

      {notification && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            marginBottom: "16px",
            background: notification.type === "success" ? "var(--forest-green-light)" : "var(--alert-red-light)",
            color: notification.type === "success" ? "var(--forest-green)" : "var(--alert-red)",
            border: `1px solid ${notification.type === "success" ? "var(--forest-green-border)" : "var(--alert-red-border)"}`,
            fontSize: "0.86rem",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {notification.type === "success" ? <FiCheckCircle size={16} /> : <FiAlertCircle size={16} />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Administrator Audit Notice */}
      {isAdmin && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          background: '#EFF6FF',
          color: '#1E40AF',
          border: '1px solid #BFDBFE',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <FiAlertCircle size={18} />
          <div>
            <strong>Administrator Read-Only Audit Mode:</strong> As KVIC Administrator, your function is governance, reviewing role applications, and auditing on-chain integrity. Operational harvest logging and hive registration are strictly restricted to certified Beekeepers.
          </div>
        </div>
      )}

      {/* Consumer / Read-Only Role Notice */}
      {!beekeeperProfile && !isAdmin && !userRoleTypes.includes('BEEKEEPER') && currentUser?.roleKey !== 'BEEKEEPER' && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          background: 'var(--amber-honey-light, #fffbeb)',
          color: '#92400e',
          border: '1px solid #fde68a',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <FiAlertCircle size={16} />
          <span>
            Account is in <strong>Public Consumer (Read-Only)</strong> mode. Only registered KVIC Beekeepers and KVIC Admin can log honey extractions or register smart hive boxes on blockchain.
          </span>
        </div>
      )}

      {/* Certified Beekeeper Profile Card */}
      {beekeeperProfile && (
        <div
          className="clean-card"
          style={{
            marginBottom: "20px",
            background: "var(--bg-card)",
            border: "1px solid var(--primary-honey-border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px",
            padding: "16px 20px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "var(--radius-sm)",
                background: "var(--primary-honey-light)",
                color: "var(--primary-honey)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid var(--primary-honey-border)"
              }}
            >
              <FiCheckCircle size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--ink-900)" }}>
                  {beekeeperProfile.name}
                </span>
                <span className="badge-purity" style={{ fontSize: "0.72rem" }}>
                  Certified Beekeeper #{beekeeperProfile.id}
                </span>
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--ink-500)", marginTop: "3px" }}>
                Cluster: <strong>{beekeeperProfile.location}, {beekeeperProfile.state}</strong> | KVIC Reg: <code>{beekeeperProfile.regNum}</code> | Registered Hives: <strong>{hives.filter(h => h.beekeeperId === beekeeperProfile.id).length}</strong>
              </div>
            </div>
          </div>

          {(userRoleTypes.includes('BEEKEEPER') || userRoleTypes.includes('ADMIN') || currentUser?.roleKey === 'BEEKEEPER' || currentUser?.roleKey === 'ADMIN') && (
            <button
              className="btn-primary"
              onClick={() => openRegisterHiveModal()}
            >
              + Add Smart Bee Box
            </button>
          )}
        </div>
      )}

      {/* Dynamic Registration Modal */}
      {showRegisterModal && (
        <div
          className="clean-card"
          style={{
            marginBottom: "20px",
            border: "1px solid var(--primary-honey-border)",
            background: "var(--bg-card)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <h4 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--ink-900)" }}>
              {beekeeperProfile 
                ? `Install Smart Bee Box for ${beekeeperProfile.name}` 
                : "Register Real Beekeeper & Smart Hive Box"}
            </h4>
            <button
              className="btn-outline"
              onClick={() => setShowRegisterModal(false)}
              style={{ padding: "4px 8px", fontSize: "0.76rem" }}
            >
              <FiX size={14} /> Cancel
            </button>
          </div>

          {beekeeperProfile && (
            <div style={{
              marginBottom: "12px",
              padding: "8px 12px",
              borderRadius: "6px",
              background: "var(--forest-green-light)",
              color: "var(--forest-green)",
              border: "1px solid var(--forest-green-border)",
              fontSize: "0.78rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}>
              <FiCheckCircle size={14} />
              <span>Connected as Certified Beekeeper #{beekeeperProfile.id}. The new smart bee box will be attached directly to your blockchain record.</span>
            </div>
          )}

          <form onSubmit={handleRegisterHive}>
            {beekeeperProfile ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "14px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "var(--ink-700)",
                        margin: 0
                      }}
                    >
                      Smart Bee Box Code *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextCode = generateAutoBoxCode(beekeeperProfile?.state || regState, beekeeperProfile?.location || regLocation, hives);
                        setRegBoxCode(nextCode);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#d97706",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        padding: 0
                      }}
                    >
                      <FiZap size={11} style={{ display: 'inline', marginRight: '3px' }} /> Next Box Code
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    className="form-control"
                    value={regBoxCode}
                    onChange={(e) => setRegBoxCode(e.target.value.toUpperCase())}
                    placeholder="e.g. HIVE-JK-02"
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: "var(--primary-honey-hover)",
                      fontSize: "0.85rem"
                    }}
                  />
                  <span style={{ fontSize: "0.68rem", color: "var(--ink-500)", marginTop: "2px", display: "block" }}>
                    Type any custom Box ID or click "Next Box Code" to auto-increment.
                  </span>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      marginBottom: "4px",
                    }}
                  >
                    Floral Flora Type *
                  </label>
                  <select
                    className="form-control"
                    value={regFlora}
                    onChange={(e) => setRegFlora(e.target.value)}
                  >
                    <option value={0}>Mustard Flower</option>
                    <option value={1}>Acacia Flower</option>
                    <option value={2}>Eucalyptus</option>
                    <option value={3}>Wild Sidr</option>
                    <option value={4}>Multifloral Wild</option>
                    <option value={5}>ForestWild</option>
                  </select>
                  <span style={{ fontSize: "0.68rem", color: "var(--ink-500)", marginTop: "2px", display: "block" }}>
                    Botanical nectar source for this colony
                  </span>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      marginBottom: "4px",
                    }}
                  >
                    Beekeeper / SHG Name *
                  </label>
                  <input
                    className="form-control"
                    type="text"
                    placeholder="Enter Beekeeper / SHG Name"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      marginBottom: "4px",
                    }}
                  >
                    Apiary Cluster Location *
                  </label>
                  <input
                    className="form-control"
                    type="text"
                    placeholder="Enter Cluster Location"
                    value={regLocation}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRegLocation(val);
                      handleLocationOrStateChange(val, undefined);
                    }}
                    required
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      marginBottom: "4px",
                    }}
                  >
                    State *
                  </label>
                  <input
                    className="form-control"
                    type="text"
                    placeholder="Enter State"
                    value={regState}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRegState(val);
                      handleLocationOrStateChange(undefined, val);
                    }}
                    required
                  />
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "var(--ink-700)",
                        margin: 0
                      }}
                    >
                      Smart Bee Box Code *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextCode = generateAutoBoxCode(regState, regLocation, hives);
                        setRegBoxCode(nextCode);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#d97706",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        padding: 0
                      }}
                    >
                      <FiZap size={11} style={{ display: 'inline', marginRight: '3px' }} /> Next Box Code
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    className="form-control"
                    value={regBoxCode}
                    onChange={(e) => setRegBoxCode(e.target.value.toUpperCase())}
                    placeholder="e.g. HIVE-JK-02"
                    style={{
                      fontFamily: "monospace",
                      fontWeight: 700,
                      color: "var(--primary-honey-hover)",
                      fontSize: "0.85rem"
                    }}
                  />
                  <span style={{ fontSize: "0.68rem", color: "var(--ink-500)", marginTop: "2px", display: "block" }}>
                    Type any custom Box ID or click "Next Box Code" to auto-increment.
                  </span>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      marginBottom: "4px",
                    }}
                  >
                    Floral Flora *
                  </label>
                  <select
                    className="form-control"
                    value={regFlora}
                    onChange={(e) => setRegFlora(e.target.value)}
                  >
                    <option value={0}>Mustard Flower</option>
                    <option value={1}>Acacia Flower</option>
                    <option value={2}>Eucalyptus</option>
                    <option value={3}>Wild Sidr</option>
                    <option value={4}>Multifloral Wild</option>
                    <option value={5}>ForestWild</option>
                  </select>
                </div>
              </div>
            )}

            {/* Hive GPS Location & Coordinates Section */}
            <div
              style={{
                background: "var(--bg-app, #f8fafc)",
                border: "1px solid var(--border, #e2e8f0)",
                borderRadius: "8px",
                padding: "14px 16px",
                marginBottom: "16px"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "10px",
                  flexWrap: "wrap",
                  gap: "8px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "6px",
                      background: "var(--primary-honey-light, #fef3c7)",
                      color: "var(--primary-honey-hover, #d97706)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    <FiMapPin size={16} />
                  </div>
                  <div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--ink-900)" }}>
                      Hive Apiary Geolocation & GPS Coordinates
                    </span>
                    <span style={{ display: "block", fontSize: "0.7rem", color: gpsDetectionMsg ? "var(--primary-honey-hover)" : "var(--ink-500)", fontWeight: gpsDetectionMsg ? 600 : 400 }}>
                      {gpsDetectionMsg || "Geotags this smart box to verify geographical origin & GI integrity"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => detectHiveLocation(regState, regLocation)}
                    disabled={isDetectingGps}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      background: "white",
                      border: "1px solid var(--border, #cbd5e1)",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      cursor: isDetectingGps ? "not-allowed" : "pointer"
                    }}
                  >
                    <FiRefreshCw size={12} className={isDetectingGps ? "spin" : ""} />
                    {isDetectingGps ? "Acquiring Fix..." : "Detect Live GPS"}
                  </button>

                  {hiveCoords?.isLiveGPS ? (
                    <span className="badge-purity" style={{ fontSize: "0.7rem", padding: "3px 8px" }}>
                      <FiCheckCircle size={11} /> Live GPS Locked (±{hiveCoords?.accuracy || 10}m)
                    </span>
                  ) : (
                    <span style={{
                      fontSize: "0.7rem",
                      padding: "3px 8px",
                      borderRadius: "12px",
                      background: "#fef3c7",
                      color: "#92400e",
                      fontWeight: 600,
                      border: "1px solid #fde68a"
                    }}>
                      📍 Regional Cluster Baseline
                    </span>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "10px",
                  marginBottom: "8px"
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.74rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      marginBottom: "3px"
                    }}
                  >
                    Latitude (° N/S) *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control"
                    value={manualLat}
                    onChange={(e) => {
                      isCoordsManuallyEdited.current = true;
                      setManualLat(e.target.value);
                    }}
                    placeholder="e.g. 33.9982"
                    required
                    style={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 600 }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.74rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      marginBottom: "3px"
                    }}
                  >
                    Longitude (° E/W) *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control"
                    value={manualLng}
                    onChange={(e) => {
                      isCoordsManuallyEdited.current = true;
                      setManualLng(e.target.value);
                    }}
                    placeholder="e.g. 74.9189"
                    required
                    style={{ fontFamily: "monospace", fontSize: "0.82rem", fontWeight: 600 }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "7px 10px",
                      background: "white",
                      border: "1px solid var(--border, #e2e8f0)",
                      borderRadius: "6px",
                      minHeight: "36px"
                    }}
                  >
                    <span style={{ fontSize: "0.74rem", fontFamily: "monospace", fontWeight: 700, color: "var(--primary-honey-hover)" }}>
                      {formatCoordinates(manualLat, manualLng) || "Coordinates Pending"}
                    </span>
                    {manualLat && manualLng && (
                      <a
                        href={getGoogleMapsUrl(manualLat, manualLng)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          color: "#2563eb",
                          textDecoration: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "3px"
                        }}
                      >
                        <FiExternalLink size={11} /> Map
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? "Registering on Blockchain..." : beekeeperProfile ? "+ Commit Smart Bee Box on Blockchain" : "Register Beekeeper & Bee Box on Blockchain"}
            </button>
          </form>
        </div>
      )}

      {/* Zero State Alert when no hives exist */}
      {hives.length === 0 && !showRegisterModal && (
        <div
          className="clean-card"
          style={{ textAlign: "center", padding: "36px 20px", marginBottom: "20px" }}
        >
          <div style={{ color: "var(--primary-honey)", marginBottom: "8px" }}>
            <FiBox size={32} />
          </div>
          <h3
            style={{
              fontSize: "1.2rem",
              fontWeight: 600,
              color: "var(--ink-900)",
              marginBottom: "4px",
            }}
          >
            {beekeeperProfile
              ? `Welcome, ${beekeeperProfile.name}!`
              : isAdmin
                ? "No Beekeepers or Hives Registered Yet"
                : !account
                  ? "Sign In Required"
                  : "No Hives Registered on Blockchain"}
          </h3>
          <p
            style={{
              color: "var(--ink-500)",
              fontSize: "0.86rem",
              maxWidth: "480px",
              margin: "0 auto 14px",
            }}
          >
            {beekeeperProfile
              ? `You are verified as Certified Beekeeper #${beekeeperProfile.id}. Install your smart bee box sensor to begin logging comb extractions on the blockchain.`
              : isAdmin
                ? "As KVIC Admin, you can register the first verified rural beekeeper and allocate a smart hive box."
                : "No registered bee boxes found on this smart contract. Hives must be registered by KVIC Admin or verified beekeepers."}
          </p>
          {isAdmin ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--ink-600)', padding: '8px 14px', background: 'var(--bg-app)', border: 'var(--border)', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <FiLock size={14} />
              <span>Administrator Read-Only Mode: Hive registration and comb harvesting are restricted to certified beekeepers.</span>
            </div>
          ) : beekeeperProfile ? (
            <button
              className="btn-primary"
              onClick={() => openRegisterHiveModal()}
            >
              + Install Smart Bee Box
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => openRegisterHiveModal(currentUser?.state, currentUser?.location)}
            >
              + Register as Certified Beekeeper & Add Hive
            </button>
          )}
        </div>
      )}

      {/* Active Apiary Smart Bee Boxes & Geolocation Registry */}
      {hives.length > 0 && (
        <div className="clean-card" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <h4 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0, color: "var(--ink-900)" }}>
                Active Smart Bee Boxes & Geolocation Registry
              </h4>
              <p style={{ margin: "2px 0 0", fontSize: "0.78rem", color: "var(--ink-500)" }}>
                Geographical coordinate tags recorded on blockchain for apicultural traceability
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="badge-purity" style={{ fontSize: "0.74rem" }}>
                <FiMapPin size={12} /> {hives.length} Geotagged {hives.length === 1 ? 'Box' : 'Boxes'}
              </span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "12px"
            }}
          >
            {hives.map((h, idx) => {
              const hLat = h.latitude ?? h.coordinates?.latitude ?? h.coordinates?.lat;
              const hLng = h.longitude ?? h.coordinates?.longitude ?? h.coordinates?.lng;
              const coordsStr = h.formattedCoordinates || (h.coordinates?.formatted) || formatCoordinates(hLat, hLng) || '33.9982° N, 74.9189° E';
              const mapsUrl = getGoogleMapsUrl(hLat || 33.9982, hLng || 74.9189);
              const isChosen = (selectedHiveBoxCode && String(h.boxCode).toUpperCase() === String(selectedHiveBoxCode).toUpperCase()) ||
                (!selectedHiveBoxCode && selectedHiveId && String(h.id) === String(selectedHiveId));

              return (
                <div
                  key={h.boxCode || h.id || idx}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "8px",
                    border: isChosen ? "2px solid var(--primary-honey)" : "1px solid var(--border)",
                    background: isChosen ? "var(--primary-honey-light, #fef3c7)" : "var(--bg-app, #f8fafc)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "8px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--ink-900)", fontFamily: "monospace" }}>
                        {h.boxCode || `HIVE-${h.id}`}
                      </span>
                      <span className="badge-purity" style={{ fontSize: "0.68rem" }}>
                        {h.flora || "Pure Honey"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "var(--ink-600)", marginBottom: "6px" }}>
                      {h.beekeeper} • {h.location}
                    </div>

                    {/* Coordinates Badge & Maps link */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "5px 8px",
                        background: "white",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        marginTop: "4px"
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.74rem", fontFamily: "monospace", fontWeight: 600, color: "var(--primary-honey-hover)" }}>
                        <FiMapPin size={11} /> {coordsStr}
                      </span>
                      {mapsUrl && (
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontSize: "0.7rem",
                            color: "#2563eb",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "2px",
                            fontWeight: 600
                          }}
                        >
                          <FiExternalLink size={10} /> Map
                        </a>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedHiveId(String(h.id));
                      setSelectedHiveBoxCode(h.boxCode);
                      setBatchCode(generateBatchTrackingCode(h));
                    }}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: "5px",
                      border: isChosen ? "1px solid var(--primary-honey)" : "1px solid var(--border)",
                      background: isChosen ? "var(--primary-honey)" : "white",
                      color: isChosen ? "white" : "var(--ink-700)",
                      fontWeight: 600,
                      fontSize: "0.74rem",
                      cursor: "pointer"
                    }}
                  >
                    {isChosen ? "✓ Selected for Harvest" : "Select for Harvest"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Harvest Form when hives exist */}
      {hives.length > 0 && (() => {
        const currentHiveObj = 
          (selectedHiveBoxCode && hives.find((h) => String(h.boxCode).toUpperCase() === String(selectedHiveBoxCode).toUpperCase())) ||
          (selectedHiveId && hives.find((h) => String(h.id) === String(selectedHiveId))) ||
          hives[0];
        const isBeekeeper = userRoleTypes.includes('BEEKEEPER') || currentUser?.roleKey === 'BEEKEEPER';
        const isAdm = userRoleTypes.includes('ADMIN') || currentUser?.roleKey === 'ADMIN';
        const canHarvestSelectedHive = isBeekeeper;

        return (
          <div className="clean-card" style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
              <h4
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  color: "var(--ink-900)",
                  margin: 0,
                }}
              >
                Log New Extraction
              </h4>
              <span className={canHarvestSelectedHive ? "badge-purity" : "badge-flagged"} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {canHarvestSelectedHive ? "Authorized Apiary Logger" : <><FiLock size={12} /> Restricted: Beekeeper Role Required</>}
              </span>
            </div>

            {!canHarvestSelectedHive && (
              <div style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: "var(--amber-honey-light, #fffbeb)",
                border: "1px solid #fde68a",
                color: "#92400e",
                fontSize: "0.78rem",
                marginBottom: "14px",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}>
                <FiAlertCircle size={14} />
                <span>
                  <strong>Apiary Security Lock:</strong> Hive <code>{currentHiveObj?.boxCode}</code> belongs to <strong>{currentHiveObj?.beekeeper}</strong>. Only the registered certified beekeeper can log comb extractions to the blockchain. Administrators and other roles are limited to read-only audit monitoring.
                </span>
              </div>
            )}

            <form onSubmit={handleHarvestSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "14px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      marginBottom: "4px",
                    }}
                  >
                    Smart Bee Box (Apiary)
                  </label>
                  <select
                    className="form-control"
                    value={currentHiveObj?.boxCode || ''}
                    onChange={(e) => {
                      const chosenCode = e.target.value;
                      const target = hives.find(h => String(h.boxCode).toUpperCase() === String(chosenCode).toUpperCase());
                      if (target) {
                        setSelectedHiveId(String(target.id));
                        setSelectedHiveBoxCode(target.boxCode);
                        setBatchCode(generateBatchTrackingCode(target));
                      }
                    }}
                    required
                  >
                    {hives.map((h, idx) => (
                      <option key={h.boxCode || h.id || idx} value={h.boxCode}>
                        {h.boxCode} — {h.beekeeper} ({h.flora})
                      </option>
                    ))}
                  </select>
                  <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "0.74rem" }}>
                    <span style={{ color: "var(--ink-600)" }}>Apiary Origin GPS:</span>
                    <span className="badge-purity" style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
                      <FiMapPin size={11} /> {currentHiveObj?.formattedCoordinates || (currentHiveObj?.coordinates?.formatted) || formatCoordinates(currentHiveObj?.latitude ?? currentHiveObj?.coordinates?.latitude, currentHiveObj?.longitude ?? currentHiveObj?.coordinates?.longitude) || '33.9982° N, 74.9189° E'}
                    </span>
                    {getGoogleMapsUrl(currentHiveObj?.latitude ?? currentHiveObj?.coordinates?.latitude ?? 33.9982, currentHiveObj?.longitude ?? currentHiveObj?.coordinates?.longitude ?? 74.9189) && (
                      <a
                        href={getGoogleMapsUrl(currentHiveObj?.latitude ?? currentHiveObj?.coordinates?.latitude ?? 33.9982, currentHiveObj?.longitude ?? currentHiveObj?.coordinates?.longitude ?? 74.9189)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "#2563eb", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "2px", textDecoration: "none" }}
                      >
                        <FiExternalLink size={10} /> Map
                      </a>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        color: "var(--ink-700)",
                        margin: 0,
                      }}
                    >
                      Batch Tracking Code
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const currentHive = hives.find(h => String(h.id) === String(selectedHiveId));
                        setBatchCode(generateBatchTrackingCode(currentHive));
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--primary-honey-hover)",
                        fontSize: "0.72rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "0 4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                      title="Generate fresh unique tracking code"
                    >
                      <FiRefreshCw size={12} />
                      <span>Auto-Generate</span>
                    </button>
                  </div>
                  <input
                    className="form-control"
                    type="text"
                    value={batchCode}
                    onChange={(e) => setBatchCode(e.target.value)}
                    placeholder="e.g. HC-2026-IND01-8492"
                    required
                  />
                  <span style={{ fontSize: "0.68rem", color: "var(--ink-500)", marginTop: "2px", display: "block" }}>
                    Collision-free cryptographic tracking code linked to this specific hive box
                  </span>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "var(--ink-700)",
                      marginBottom: "4px",
                    }}
                  >
                    Harvest Yield (Kilograms)
                  </label>
                  <input
                    className="form-control"
                    type="number"
                    min="1"
                    value={yieldKg}
                    onChange={(e) => setYieldKg(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "0.78rem", color: "var(--ink-500)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <FiZap size={12} /> Sponsored directly by KVIC National Gateway
                </div>
                <button 
                  className="btn-primary" 
                  type="submit" 
                  disabled={loading || !canHarvestSelectedHive}
                  style={{ opacity: !canHarvestSelectedHive ? 0.6 : 1, cursor: !canHarvestSelectedHive ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {loading
                    ? "Submitting..."
                    : !canHarvestSelectedHive
                      ? isAdm
                        ? <><FiLock size={13} /> Locked: Admin Read-Only (Beekeeper Required)</>
                        : <><FiLock size={13} /> Restricted: Beekeeper Role Required</>
                      : "Record Harvest on Blockchain"}
                </button>
              </div>
            </form>
          </div>
        );
      })()}

      {/* Blockchain Batches Table */}
      <HarvestedBatchesTable batches={batches} />
    </div>
  );
}

export default BeekeeperPortal;
