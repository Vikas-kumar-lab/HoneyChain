// Manages enterprise onboarding applications submitted by beekeepers, labs, processors, etc.
// Synchronized with backend service for cross-window / Incognito consistency
import { API_BASE_URL } from './config';

const STORAGE_KEY = 'honeychain_onboarding_applications';

export const getApplications = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
};

export const fetchApplicationsFromServer = async () => {
    try {
        const res = await fetch(`${API_BASE_URL}/api/applications`);
        const data = await res.json();
        if (data.success && Array.isArray(data.applications)) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data.applications));
                window.dispatchEvent(new Event('honeychain_applications_updated'));
            } catch (e) {}
            return data.applications;
        }
    } catch (e) {
        // Fallback to localStorage
    }
    return getApplications();
};

// Initial background sync
if (typeof window !== 'undefined') {
    fetchApplicationsFromServer();
}

export const submitApplication = (data) => {
    const apps = getApplications();
    const newId = `APP-KVIC-2026-${Math.floor(100 + Math.random() * 900)}`;
    
    // Auto-generate unguessable official Unique KVIC ID based on role
    const roleCode = {
        'BEEKEEPER': 'BKP',
        'LAB': 'LAB',
        'PROCESSOR': 'PROC',
        'DISTRIBUTOR': 'DIST',
        'RETAILER': 'RET'
    }[data.role] || 'MBR';

    const randCode = Math.floor(100000 + Math.random() * 900000);
    const username = `KVIC-${roleCode}-${randCode}`;

    // Auto-generate official license / accreditation numbers based on role
    let autoGovId = data.govId;
    if (!autoGovId) {
        if (data.role === 'LAB') {
            autoGovId = `NABL-KVIC-${Math.floor(1000 + Math.random() * 9000)}`;
        } else if (data.role === 'RETAILER') {
            autoGovId = `KVIC-RET-${Math.floor(10000 + Math.random() * 90000)}`;
        } else if (data.role === 'BEEKEEPER') {
            autoGovId = `KVIC-BKP-${Math.floor(1000 + Math.random() * 9000)}`;
        } else if (data.role === 'PROCESSOR') {
            autoGovId = `FSSAI-PROC-${Math.floor(10000 + Math.random() * 90000)}`;
        } else if (data.role === 'DISTRIBUTOR') {
            autoGovId = `KVIC-LOG-${Math.floor(1000 + Math.random() * 9000)}`;
        } else {
            autoGovId = `KVIC-REG-${Date.now().toString().slice(-4)}`;
        }
    }

    const newApp = {
        id: newId,
        username,
        name: data.name?.trim(),
        orgName: data.orgName?.trim() || data.name?.trim(),
        role: data.role || 'BEEKEEPER',
        location: data.location?.trim() || 'Rural Apiary Cluster',
        state: data.state?.trim() || 'India',
        phone: data.phone?.trim() || '',
        email: data.email?.trim() || '',
        govId: autoGovId,
        extraDetails: data.extraDetails || '',
        details: data.details?.trim() || '',
        status: 'PENDING',
        submittedAt: 'Just now'
    };

    apps.unshift(newApp);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
        window.dispatchEvent(new Event('honeychain_applications_updated'));
    } catch (e) {
        console.warn('Failed to save application locally:', e);
    }

    // Sync to backend server
    fetch(`${API_BASE_URL}/api/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newApp)
    }).catch(err => console.warn('Could not sync app to server:', err));

    return newApp;
};

export const updateApplicationStatus = (appId, newStatus, txInfo = null) => {
    const apps = getApplications();
    let updatedApp = null;
    const updated = apps.map(app => {
        if (app.id === appId) {
            updatedApp = {
                ...app,
                status: newStatus,
                decisionAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                txHash: txInfo?.txHash || null,
                blockNumber: txInfo?.blockNumber || null
            };
            return updatedApp;
        }
        return app;
    });

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        window.dispatchEvent(new Event('honeychain_applications_updated'));
    } catch (e) {
        console.warn('Failed to update application locally:', e);
    }

    // Sync to backend server
    if (updatedApp) {
        fetch(`${API_BASE_URL}/api/applications/${encodeURIComponent(appId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedApp)
        }).catch(err => console.warn('Could not sync app status update to server:', err));
    }

    return updated;
};
