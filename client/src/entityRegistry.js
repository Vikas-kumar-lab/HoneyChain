import { cachedCall, resolveEnterpriseAddress } from './web3Utils';
import { API_BASE_URL } from './config';

export const DEFAULT_ENTITY_DIRECTORY = [];

export const getSavedEntityDirectory = () => {
    try {
        const raw = localStorage.getItem('honeychain_entity_directory');
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
};

export const fetchDirectoryFromServer = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/api/directory`);
        const data = await res.json();
        if (data.success && Array.isArray(data.directory)) {
            try {
                localStorage.setItem('honeychain_entity_directory', JSON.stringify(data.directory));
                window.dispatchEvent(new Event('honeychain_directory_updated'));
            } catch (err) {}
            return data.directory;
        }
    } catch (e) {}
    return getSavedEntityDirectory();
};

if (typeof window !== 'undefined') {
    fetchDirectoryFromServer();
}

export const saveEntityToDirectory = (entity) => {
    if (!entity?.address) return;
    try {
        const existing = getSavedEntityDirectory();
        const clean = entity.address.toLowerCase();
        const filtered = existing.filter(e => e.address.toLowerCase() !== clean);
        const newEntity = {
            address: entity.address,
            username: entity.username || '',
            role: entity.role,
            name: entity.name || entity.shortName || entity.address,
            facility: entity.facility || '',
            location: entity.location || '',
            state: entity.state || '',
            phone: entity.phone || '',
            govId: entity.govId || '',
            timestamp: Date.now(),
        };
        filtered.push(newEntity);
        localStorage.setItem('honeychain_entity_directory', JSON.stringify(filtered));
        window.dispatchEvent(new Event('honeychain_directory_updated'));

        // Sync with backend server
        fetch(`${API_BASE_URL}/api/directory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newEntity)
        }).catch(() => {});
    } catch (e) {
        console.warn('Failed to persist entity to directory:', e);
    }
};

export const getEntityFriendlyName = (address, role) => {
    if (!address || address === '0x0000000000000000000000000000000000000000') return '';
    const clean = address.toLowerCase();
    const short = `${address.substring(0, 6)}...${address.slice(-4)}`;

    const saved = getSavedEntityDirectory().find(e => e.address && e.address.toLowerCase() === clean);
    if (saved?.name) return saved.name;

    try {
        const rawApps = localStorage.getItem('honeychain_onboarding_applications');
        if (rawApps) {
            const apps = JSON.parse(rawApps);
            const foundApp = apps.find(a => {
                const aAddr = (a.address || resolveEnterpriseAddress(a.username || a.name || a.id)).toLowerCase();
                return aAddr === clean;
            });
            if (foundApp?.name || foundApp?.orgName) return foundApp.orgName || foundApp.name;
        }
    } catch (e) {}

    return role ? `${role} (${short})` : short;
};

export const fetchAuthorizedEntities = async (contract) => {
    if (!contract) {
        return {
            distributors: [],
            retailers:    [],
            processors:   [],
            labs:         [],
            beekeepers:   []
        };
    }

    return await cachedCall(async () => {
        try {
            const candidates = new Map();

            const resolveName = (address, role) => {
                const clean = (address || '').toLowerCase();
                const fromDir = getSavedEntityDirectory().find(e => (e.address || '').toLowerCase() === clean);
                if (fromDir?.name) return { name: fromDir.name, facility: fromDir.facility || '' };
                return { name: getEntityFriendlyName(address, role), facility: '' };
            };

            // PRIMARY: Scan RoleUpdated events from block 0
            try {
                const pastEvents = await contract.getPastEvents('RoleUpdated', { fromBlock: 0, toBlock: 'latest' });
                if (Array.isArray(pastEvents)) {
                    pastEvents.forEach(evt => {
                        const vals = evt.returnValues;
                        if (vals?.entity && vals?.role && vals?.active) {
                            const key = `${vals.role}_${vals.entity.toLowerCase()}`;
                            const { name, facility } = resolveName(vals.entity, vals.role);
                            candidates.set(key, { role: vals.role, address: vals.entity, name, facility });
                        }
                    });
                }
            } catch (evtErr) {
                console.warn('RoleUpdated event scan failed:', evtErr.message);
            }

            // ALWAYS merge saved directory + localStorage applications so registered entities are available
            getSavedEntityDirectory().forEach(item => {
                if (item?.address && item?.role) {
                    const key = `${item.role}_${(item.address || '').toLowerCase()}`;
                    if (!candidates.has(key)) candidates.set(key, item);
                }
            });
            try {
                const rawApps = localStorage.getItem('honeychain_onboarding_applications');
                if (rawApps) {
                    JSON.parse(rawApps).forEach(app => {
                        if (app?.role) {
                            const addr = app.address || resolveEnterpriseAddress(app.username || app.id);
                            const key = `${app.role}_${(addr || '').toLowerCase()}`;
                            if (!candidates.has(key))
                                candidates.set(key, { role: app.role, address: addr, name: app.orgName || app.name || app.username, facility: '' });
                        }
                    });
                }
            } catch (e) {}

            const candidateList = Array.from(candidates.values());

            // Parallel verification of on-chain roles while preserving registered candidate entities
            const [distributors, retailers, processors, labs] = await Promise.all([
                Promise.all(candidateList.filter(c => c.role === 'DISTRIBUTOR').map(async item => {
                    const ok = await contract.methods.authorizedDistributors(item.address).call().catch(() => false);
                    return {
                        ...item,
                        name: item.name || getEntityFriendlyName(item.address, 'DISTRIBUTOR'),
                        isOnChain: Boolean(ok)
                    };
                })),

                Promise.all(candidateList.filter(c => c.role === 'RETAILER').map(async item => {
                    const ok = await contract.methods.authorizedRetailers(item.address).call().catch(() => false);
                    return {
                        ...item,
                        name: item.name || getEntityFriendlyName(item.address, 'RETAILER'),
                        isOnChain: Boolean(ok)
                    };
                })),

                Promise.all(candidateList.filter(c => c.role === 'PROCESSOR').map(async item => {
                    const ok = await contract.methods.authorizedProcessors(item.address).call().catch(() => false);
                    return {
                        ...item,
                        name: item.name || getEntityFriendlyName(item.address, 'PROCESSOR'),
                        isOnChain: Boolean(ok)
                    };
                })),

                Promise.all(candidateList.filter(c => c.role === 'LAB').map(async item => {
                    const ok = await contract.methods.authorizedLabs(item.address).call().catch(() => false);
                    return {
                        ...item,
                        name: item.name || getEntityFriendlyName(item.address, 'LAB'),
                        isOnChain: Boolean(ok)
                    };
                })),
            ]);

            // Query real registered beekeepers from blockchain
            let beekeepers = [];
            try {
                const bkpCount = parseInt(await contract.methods.beekeeperCount().call().catch(() => 0));
                if (bkpCount > 0) {
                    const bkpPromises = Array.from({ length: bkpCount }, (_, idx) => 
                        contract.methods.beekeepers(idx + 1).call().catch(() => null)
                    );
                    const bkpData = await Promise.all(bkpPromises);
                    beekeepers = bkpData.filter(Boolean).map(b => ({
                        id: parseInt(b.id),
                        name: b.name,
                        address: b.wallet,
                        facility: `${b.clusterLocation}, ${b.state}`,
                        role: 'BEEKEEPER',
                        regNum: b.kvicRegNumber,
                        totalBoxes: parseInt(b.totalBoxes || 0)
                    }));
                }
            } catch (e) {
                console.warn('Error querying on-chain beekeepers:', e);
            }

            const dedupeEntities = (list) => {
                const seenMap = new Map();
                (list || []).forEach(item => {
                    const cleanAddr = (item.address || '').toLowerCase().trim();
                    const cleanName = (item.name || item.orgName || '').toLowerCase().trim();
                    const key = (cleanName && !cleanName.startsWith('0x') && !cleanName.includes('...'))
                        ? cleanName
                        : cleanAddr;
                    if (key && !seenMap.has(key)) {
                        seenMap.set(key, item);
                    } else if (key && seenMap.has(key)) {
                        const existing = seenMap.get(key);
                        if ((!existing.isOnChain && item.isOnChain) || (!existing.address && item.address)) {
                            seenMap.set(key, item);
                        }
                    }
                });
                return Array.from(seenMap.values());
            };

            return {
                distributors: dedupeEntities(distributors),
                retailers:    dedupeEntities(retailers),
                processors:   dedupeEntities(processors),
                labs:         dedupeEntities(labs),
                beekeepers:   dedupeEntities(beekeepers)
            };
        } catch (err) {
            console.warn('Error fetching authorized entities from chain:', err);
            return {
                distributors: [],
                retailers:    [],
                processors:   [],
                labs:         [],
                beekeepers:   []
            };
        }
    }, 'cached_authorized_entities_v3', 2000);
};
