import { API_BASE_URL } from './config';

export const HIVES_STORAGE_KEY = 'honeychain_stored_hives';
export const BATCHES_STORAGE_KEY = 'honeychain_stored_batches';
export const BEEKEEPER_PROFILE_KEY = 'honeychain_beekeeper_profile';

export const DEFAULT_BEEKEEPER_PROFILE = null;
export const DEFAULT_SMART_HIVES = [];

export const getStoredHives = () => {
  try {
    const raw = localStorage.getItem(HIVES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    let maxId = 0;
    return parsed.map((h, idx) => {
      let nid = parseInt(h.id, 10);
      if (isNaN(nid) || nid <= 0 || seen.has(nid)) {
        nid = maxId + 1;
      }
      seen.add(nid);
      if (nid > maxId) maxId = nid;
      return { ...h, id: nid };
    });
  } catch (e) {
    return [];
  }
};

export const saveStoredHives = (hivesList) => {
  try {
    if (!Array.isArray(hivesList)) return;
    localStorage.setItem(HIVES_STORAGE_KEY, JSON.stringify(hivesList));
    window.dispatchEvent(new Event('honeychain_hives_updated'));
  } catch (e) {
    console.warn('Failed to save hives to localStorage:', e);
  }
};

export const saveStoredHive = (hive) => {
  if (!hive) return;
  const list = getStoredHives();
  const boxMatch = (hive.boxCode || '').toUpperCase().trim();
  const filtered = list.filter(h => {
    if (boxMatch && (h.boxCode || '').toUpperCase().trim() === boxMatch) return false;
    return true;
  });
  const maxId = filtered.reduce((m, h) => Math.max(m, parseInt(h.id, 10) || 0), 0);
  const safeId = (typeof hive.id === 'number' && hive.id > 0 && !filtered.some(h => h.id === hive.id))
    ? hive.id
    : maxId + 1;
  const hiveToSave = { ...hive, id: safeId };
  const updated = [...filtered, hiveToSave];
  saveStoredHives(updated);

  // Sync with backend if reachable
  fetch(`${API_BASE_URL}/api/registered-hives`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(hive)
  }).catch(() => {});

  return updated;
};

export const getStoredBatches = () => {
  try {
    const raw = localStorage.getItem(BATCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

export const saveStoredBatches = (batchesList) => {
  try {
    if (!Array.isArray(batchesList)) return;
    localStorage.setItem(BATCHES_STORAGE_KEY, JSON.stringify(batchesList));
    window.dispatchEvent(new Event('honeychain_batches_updated'));
  } catch (e) {
    console.warn('Failed to save batches to localStorage:', e);
  }
};

export const saveStoredBatch = (batch) => {
  if (!batch) return;
  const list = getStoredBatches();
  const idMatch = String(batch.batchId || '');
  const codeMatch = (batch.batchCode || '').toUpperCase().trim();

  // Ensure initial custody history exists
  if (!Array.isArray(batch.history) || batch.history.length === 0) {
    batch.history = [
      {
        stage: 0,
        stageName: 'Harvested',
        actor: batch.beekeeperName || 'Registered Beekeeper',
        location: batch.clusterLocation || 'Apiary Colony',
        timestamp: batch.harvestTimestamp || Math.floor(Date.now() / 1000),
        notes: `Harvested ${batch.yieldWeightKg || 25}kg floral honey directly from smart bee box`
      }
    ];
  }

  const filtered = list.filter(b => {
    if (idMatch && String(b.batchId) === idMatch) return false;
    if (codeMatch && (b.batchCode || '').toUpperCase().trim() === codeMatch) return false;
    return true;
  });
  const updated = [...filtered, batch].sort((a, b) => (parseInt(a.batchId) || 0) - (parseInt(b.batchId) || 0));
  saveStoredBatches(updated);

  // Sync with backend if reachable
  fetch(`${API_BASE_URL}/api/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch)
  }).catch(() => {});

  return updated;
};

export const updateStoredBatchStage = (batchId, updates) => {
  if (!batchId) return null;
  const list = getStoredBatches();
  const idx = list.findIndex(b => String(b.batchId) === String(batchId));
  if (idx >= 0) {
    const prevHistory = Array.isArray(list[idx].history) ? list[idx].history : [];
    let newHistory = [...prevHistory];
    if (updates.historyEvent) {
      newHistory.push(updates.historyEvent);
    }
    const { historyEvent, ...cleanUpdates } = updates;
    list[idx] = { 
      ...list[idx], 
      ...cleanUpdates,
      history: newHistory
    };
    saveStoredBatches(list);

    // Sync with backend if reachable
    fetch(`${API_BASE_URL}/api/batches/${batchId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list[idx])
    }).catch(() => {});
    return list[idx];
  }
  return null;
};

export const getStoredBeekeeperProfile = () => {
  try {
    const raw = localStorage.getItem(BEEKEEPER_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.name) return parsed;
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const saveStoredBeekeeperProfile = (profile) => {
  try {
    if (!profile) return;
    localStorage.setItem(BEEKEEPER_PROFILE_KEY, JSON.stringify(profile));
  } catch (e) {}
};

// Async background sync with backend
export const fetchRegisteredHivesFromServer = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/registered-hives`);
    const data = await res.json();
    if (data.success && Array.isArray(data.hives)) {
      saveStoredHives(data.hives);
      return data.hives;
    }
  } catch (e) {}
  return getStoredHives();
};

export const fetchBatchesFromServer = async () => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/batches`);
    const data = await res.json();
    if (data.success && Array.isArray(data.batches)) {
      saveStoredBatches(data.batches);
      return data.batches;
    }
  } catch (e) {}
  return getStoredBatches();
};

if (typeof window !== 'undefined') {
  fetchRegisteredHivesFromServer();
  fetchBatchesFromServer();
}
