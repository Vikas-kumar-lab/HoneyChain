import Web3 from 'web3';

// this salt is what makes tokens unique per-deployment; change it if you fork
const SALT = 'KVIC-HONEYCHAIN-TAMPER-PROOF-SEED-2026';

// produces an 8-char hex token (e.g. "9F4B-3E7A") that's deterministic but unguessable
export function getBottleSecurityToken(batchId, unitNumber, harvestTimestamp = 0, batchCode = '') {
    const raw = `${SALT}:${batchId}:${batchCode}:${harvestTimestamp}:${unitNumber}`;
    let hash = '';

    try {
        hash = Web3.utils.sha3(raw) || '';
    } catch (_) {
        // sha3 not available — fall back to a simple deterministic murmur-like hash
        let h1 = 0xdeadbeef;
        let h2 = 0x41c6ce57;
        for (let i = 0; i < raw.length; i++) {
            const c = raw.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 2654435761);
            h2 = Math.imul(h2 ^ c, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        hash = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(8, '0');
    }

    const hex = hash.replace('0x', '').toUpperCase();
    return `${hex.substring(0, 4)}-${hex.substring(4, 8)}`;
}

// e.g. "HONEY-1731-U01-9F4B"
export function getUniqueBottleSerial(batchCode, unitNumber, token) {
    const unit = String(unitNumber).padStart(2, '0');
    const short = (token || '').replace(/[^A-Z0-9]/gi, '').substring(0, 4).toUpperCase() || 'XXXX';
    return `${batchCode || 'HONEY'}-U${unit}-${short}`;
}

// used by the consumer verify page — requires the actual security token (not a plain number)
export function verifyBottleSecurityCode(input, jarsTotal, batchId, harvestTimestamp = 0, batchCode = '') {
    if (!input?.trim()) {
        return { unit: null, valid: false, error: 'Enter the Security PIN from your bottle seal or tax invoice.' };
    }

    const clean = String(input).trim().toUpperCase().replace(/\s+/g, '');

    // block plain integers — consumers must supply the real token
    if (/^(\d+)(,\s*\d+)?$/.test(clean)) {
        return {
            unit: null,
            valid: false,
            error: 'Plain numbers are not accepted. Enter the Security PIN (e.g. E1FC-2178) or Serial Number from your invoice.',
        };
    }

    const total = jarsTotal || 100;
    const stripped = clean.replace(/-/g, '');

    for (let u = 1; u <= total; u++) {
        const token = getBottleSecurityToken(batchId, u, harvestTimestamp, batchCode);
        const serial = getUniqueBottleSerial(batchCode, u, token);
        const tokenStripped = token.replace(/-/g, '');
        const serialStripped = serial.replace(/-/g, '');

        if ([token, tokenStripped, serial, serialStripped].includes(clean) || stripped === tokenStripped) {
            return { unit: u, valid: true, error: null, token, serial };
        }
    }

    return { unit: null, valid: false, error: `Security code not found in Batch #${batchId}. Check your bottle seal.` };
}

// used internally by POS scanner — allows plain integers from barcode readers
export function resolveBottleUnit(input, jarsTotal, batchId, harvestTimestamp = 0, batchCode = '', allowPlain = true) {
    if (!input) return null;
    const clean = String(input).trim().toUpperCase();

    // Only accept plain numbers if the entire string is strictly digits
    if (allowPlain && /^\d+$/.test(clean)) {
        const n = parseInt(clean, 10);
        if (!isNaN(n) && n >= 1 && n <= (jarsTotal || 1000)) return n;
    }

    const total = jarsTotal || 50;
    const stripped = clean.replace(/-/g, '');

    for (let u = 1; u <= total; u++) {
        const token = getBottleSecurityToken(batchId, u, harvestTimestamp, batchCode);
        const serial = getUniqueBottleSerial(batchCode, u, token);
        const tStrip = token.replace(/-/g, '');
        const sStrip = serial.replace(/-/g, '');
        const jarSerial = `${batchCode || 'HONEY'}-JAR-${String(u).padStart(4, '0')}`.toUpperCase();
        if ([token, tStrip, serial, sStrip, jarSerial].includes(clean) || stripped === tStrip || stripped === sStrip) {
            return u;
        }
    }

    return null;
}
