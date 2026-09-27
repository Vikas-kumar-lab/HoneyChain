import React, { useState, useEffect } from 'react';
import { 
    executeBlockchainRelayer,
    resolveEnterpriseAddress,
    getContractInstance
} from '../web3Utils';
import { useAuth, ENTERPRISE_USERS } from '../context/AuthContext';
import { 
    FiCheckCircle, 
    FiAlertCircle, 
    FiShield, 
    FiFileText, 
    FiX, 
    FiUsers 
} from 'react-icons/fi';
import { saveEntityToDirectory, getSavedEntityDirectory, fetchDirectoryFromServer } from '../entityRegistry';
import { getApplications, updateApplicationStatus, fetchApplicationsFromServer } from '../applicationRegistry';

function AssignRoles() {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [notification, setNotification] = useState(null);

    // Navigation tab: 'applications' (default to manage pending onboarding) | 'directory'
    const [activeTab, setActiveTab] = useState('applications');

    // Applications & Directory states
    const [applications, setApplications] = useState(() => getApplications());
    const [assignedEntities, setAssignedEntities] = useState(() => getSavedEntityDirectory());
    const [onChainEntities, setOnChainEntities] = useState([]);

    useEffect(() => {
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const init = async () => {
        try {
            setAssignedEntities(getSavedEntityDirectory());
            setApplications(getApplications());

            // 1. Sync from backend server across Incognito / all browser windows
            const [serverApps, serverDir] = await Promise.all([
                fetchApplicationsFromServer().catch(() => getApplications()),
                fetchDirectoryFromServer().catch(() => getSavedEntityDirectory())
            ]);
            if (serverApps && Array.isArray(serverApps)) setApplications(serverApps);
            if (serverDir && Array.isArray(serverDir)) setAssignedEntities(serverDir);

            // 2. Discover verified on-chain beekeepers directly from smart contract
            try {
                const { readContract } = await getContractInstance();
                const bkpCount = parseInt(await readContract.methods.beekeeperCount().call().catch(() => 0));
                const onChain = [];
                for (let i = 1; i <= bkpCount; i++) {
                    const b = await readContract.methods.beekeepers(i).call().catch(() => null);
                    if (b && b.name && b.wallet && b.wallet !== '0x0000000000000000000000000000000000000000') {
                        onChain.push({
                            username: `beekeeper_${b.id || i}`,
                            role: 'BEEKEEPER',
                            name: b.name,
                            address: b.wallet,
                            facility: `${b.clusterLocation || 'Cluster'}, ${b.state || 'India'} (KVIC: ${b.kvicRegNumber || b.id})`
                        });
                    }
                }
                if (onChain.length > 0) {
                    setOnChainEntities(onChain);
                }
            } catch (err) {
                console.warn("On-chain beekeeper discovery warning:", err);
            }

            const handleDirUpdate = () => setAssignedEntities(getSavedEntityDirectory());
            const handleAppUpdate = () => setApplications(getApplications());

            window.addEventListener('honeychain_directory_updated', handleDirUpdate);
            window.addEventListener('honeychain_applications_updated', handleAppUpdate);

            return () => {
                window.removeEventListener('honeychain_directory_updated', handleDirUpdate);
                window.removeEventListener('honeychain_applications_updated', handleAppUpdate);
            };
        } catch (err) {
            console.error("Initialization error:", err);
        }
    };

    const handleApproveApplication = async (app) => {
        if (currentUser?.roleKey !== 'ADMIN') {
            setNotification({
                type: 'danger',
                message: 'Access Denied: Only KVIC National Administrator can approve entity applications.'
            });
            return;
        }
        setLoading(true);
        const entityLabel = app.orgName || app.name || 'Applicant';
        const targetUsername = (app.username || app.name || app.id)
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '');

        setNotification({
            type: 'info',
            message: `⏳ Transmitting on-chain authorization for "${entityLabel}" (${app.role})...`
        });

        try {
            const cleanAddr = resolveEnterpriseAddress(targetUsername);
            let res;

            const formatFacility = (loc, st) => {
                if (!loc) return st || 'India';
                if (!st) return loc;
                return loc.toLowerCase().includes(st.toLowerCase()) ? loc : `${loc}, ${st}`;
            };

            if (app.role === 'BEEKEEPER') {
                res = await executeBlockchainRelayer('register-beekeeper', {
                    wallet: cleanAddr,
                    name: entityLabel,
                    clusterLocation: app.location || 'Rural Apiary Cluster',
                    state: app.state || 'India',
                    kvicRegNumber: app.govId || `KVIC-BKP-${Date.now().toString().slice(-4)}`
                });

                saveEntityToDirectory({
                    username: targetUsername,
                    address: cleanAddr,
                    role: 'BEEKEEPER',
                    name: entityLabel,
                    facility: formatFacility(app.location, app.state),
                    location: app.location || '',
                    state: app.state || '',
                    phone: app.phone || '',
                    govId: app.govId || ''
                });
            } else {
                res = await executeBlockchainRelayer('set-role', {
                    entity: cleanAddr,
                    role: app.role,
                    active: true
                });

                saveEntityToDirectory({
                    username: targetUsername,
                    address: cleanAddr,
                    role: app.role,
                    name: entityLabel,
                    facility: formatFacility(app.location, app.state),
                    location: app.location || '',
                    state: app.state || '',
                    phone: app.phone || '',
                    govId: app.govId || ''
                });
            }

            updateApplicationStatus(app.id, 'APPROVED', {
                txHash: res.transactionHash,
                blockNumber: res.blockNumber
            });

            setApplications(getApplications());
            setAssignedEntities(getSavedEntityDirectory());

            setNotification({
                type: 'success',
                message: `Approved & Committed "${entityLabel}" [ID: ${targetUsername}] as ${app.role} on Blockchain! Tx: ${res.transactionHash ? res.transactionHash.slice(0, 10) + '...' : 'Confirmed'}`
            });
        } catch (err) {
            console.error("Approval error:", err);
            setNotification({
                type: 'danger',
                message: `Approval failed: ${err.message || "Relayer error."}`
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRejectApplication = (app) => {
        updateApplicationStatus(app.id, 'REJECTED');
        setApplications(getApplications());
        setNotification({
            type: 'info',
            message: `Application ${app.id} (${app.name}) has been marked as Rejected.`
        });
    };

    // Combine standard 6 roles with newly approved entities and on-chain beekeepers
    const directoryList = [...ENTERPRISE_USERS];
    [...assignedEntities, ...onChainEntities].forEach(saved => {
        if (!saved) return;
        const exists = directoryList.some(u => 
            (saved.address && u.address && u.address.toLowerCase() === saved.address.toLowerCase()) ||
            (saved.username && u.username && u.username.toLowerCase() === saved.username.toLowerCase()) ||
            (saved.name && u.name && u.name.toLowerCase() === saved.name.toLowerCase())
        );
        if (!exists) {
            directoryList.push({
                username: saved.username || (saved.role ? `${saved.role.toLowerCase()}_partner` : 'enterprise_user'),
                roleKey: saved.role || 'BEEKEEPER',
                roleName: saved.role || 'Beekeeper',
                name: saved.name,
                badge: saved.facility || 'Authorized Facility',
                color: saved.role === 'BEEKEEPER' ? '#D97706' : '#475569',
                address: saved.address || ''
            });
        }
    });

    const pendingCount = applications.filter(a => a.status === 'PENDING').length;

    return (
        <div className="container">
            {/* Header Banner matching Overview.js */}
            <div className="clean-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ maxWidth: '640px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-honey-hover)', background: 'var(--primary-honey-light)', border: '1px solid var(--primary-honey-border)', padding: '2px 8px', borderRadius: '9999px', marginBottom: '10px' }}>
                            <FiShield size={12} /> Ministry of MSME • KVIC National Governance
                        </div>
                        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.25, color: 'var(--ink-900)', margin: '0 0 8px' }}>
                            Participant Governance & Directory
                        </h2>
                        <p style={{ color: 'var(--ink-600)', fontSize: '0.88rem', lineHeight: '1.6', margin: 0 }}>
                            Review onboarding applications submitted across India's honey supply chain. Authorize accredited participants and commit cryptographically signed permissions directly to the Ethereum blockchain.
                        </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-500)', marginBottom: '4px' }}>Logged in Administrator</div>
                        <div style={{ fontWeight: 700, fontSize: '0.90rem', color: 'var(--ink-900)', background: 'var(--primary-honey-light)', padding: '6px 14px', borderRadius: '6px', border: '1px solid var(--primary-honey-border)' }}>
                            {currentUser?.name || 'Admin'}
                        </div>
                        <div style={{ marginTop: '6px' }}>
                            <span className="badge-purity">
                                <FiCheckCircle size={11} /> Smart Contract Authority
                            </span>
                        </div>
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

            {/* Tab Navigation */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                marginBottom: '18px',
                borderBottom: '1px solid var(--border)',
                paddingBottom: '8px'
            }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('applications')}
                    style={{
                        padding: '8px 16px',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: activeTab === 'applications' ? '1px solid var(--primary-honey)' : '1px solid var(--border)',
                        background: activeTab === 'applications' ? 'var(--primary-honey)' : 'var(--bg-card)',
                        color: activeTab === 'applications' ? '#FFFFFF' : 'var(--ink-700)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <FiFileText size={14} />
                    <span>Review Onboarding Applications</span>
                    {pendingCount > 0 && (
                        <span style={{
                            background: activeTab === 'applications' ? '#FFFFFF' : 'var(--alert-red)',
                            color: activeTab === 'applications' ? 'var(--alert-red)' : '#FFFFFF',
                            fontSize: '0.70rem',
                            fontWeight: 800,
                            padding: '1px 7px',
                            borderRadius: '9999px',
                            marginLeft: '4px'
                        }}>
                            {pendingCount}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('directory')}
                    style={{
                        padding: '8px 16px',
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: activeTab === 'directory' ? '1px solid var(--primary-honey)' : '1px solid var(--border)',
                        background: activeTab === 'directory' ? 'var(--primary-honey)' : 'var(--bg-card)',
                        color: activeTab === 'directory' ? '#FFFFFF' : 'var(--ink-700)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    <FiUsers size={14} />
                    <span>Active Participants Directory ({directoryList.length})</span>
                </button>
            </div>

            {/* TAB 1: Review Onboarding Applications */}
            {activeTab === 'applications' && (
                <div className="clean-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <h3 style={{ fontSize: '1.20rem', fontWeight: 700, margin: 0, color: 'var(--ink-900)' }}>
                                Incoming Onboarding Applications
                            </h3>
                            <p style={{ fontSize: '0.82rem', color: 'var(--ink-500)', margin: '4px 0 0' }}>
                                Prospective participants apply via the portal. Review their credentials and approve to commit on-chain.
                            </p>
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', background: 'var(--bg-app)', color: 'var(--ink-700)', border: '1px solid var(--border)' }}>
                            {applications.length} Total Applications
                        </span>
                    </div>

                    {applications.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px 20px',
                            background: 'var(--bg-app)',
                            borderRadius: '8px',
                            border: '1px dashed var(--border)'
                        }}>
                            <div style={{ color: 'var(--ink-400)', marginBottom: '8px' }}>
                                <FiFileText size={32} />
                            </div>
                            <div style={{ fontWeight: 600, color: 'var(--ink-800)', fontSize: '0.95rem', marginBottom: '4px' }}>
                                No Pending Onboarding Applications
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--ink-500)', maxWidth: '460px', margin: '0 auto' }}>
                                When beekeepers, labs, processors, distributors, or retailers apply for onboarding from the portal, their requests will appear here for Admin review and blockchain commitment.
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {applications.map((app) => (
                                <div 
                                    key={app.id} 
                                    style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        background: app.status === 'APPROVED' ? 'var(--forest-green-light)' : app.status === 'REJECTED' ? 'var(--alert-red-light)' : 'var(--bg-card)',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    background: app.role === 'BEEKEEPER' ? '#FEF3C7' : app.role === 'LAB' ? '#E0F2FE' : '#F3E8FF',
                                                    color: app.role === 'BEEKEEPER' ? '#B45309' : app.role === 'LAB' ? '#0369A1' : '#7E22CE'
                                                }}>
                                                    {app.role}
                                                </span>
                                                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink-900)' }}>
                                                    {app.orgName || app.name}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--ink-500)', marginTop: '4px' }}>
                                                Contact Person: <strong>{app.name}</strong> • Auto-Assigned Unique ID: <code style={{ fontWeight: 700, color: 'var(--primary-honey-hover)', background: 'var(--primary-honey-light)', padding: '2px 6px', borderRadius: '4px' }}>{app.username || app.id}</code> • {app.submittedAt}
                                            </div>
                                        </div>

                                        <div>
                                            {app.status === 'PENDING' && (
                                                <span className="badge-pending" style={{ padding: '3px 10px' }}>
                                                    Pending Review
                                                </span>
                                            )}
                                            {app.status === 'APPROVED' && (
                                                <span className="badge-purity" style={{ padding: '3px 10px' }}>
                                                    <FiCheckCircle size={11} /> Approved On-Chain
                                                </span>
                                            )}
                                            {app.status === 'REJECTED' && (
                                                <span className="badge-flagged" style={{ padding: '3px 10px' }}>
                                                    <FiX size={11} /> Rejected
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '0.80rem', color: 'var(--ink-700)', background: 'var(--bg-app)', padding: '10px 12px', borderRadius: '6px', marginBottom: '12px' }}>
                                        <div><strong>Location:</strong> {app.location}, {app.state || 'India'}</div>
                                        <div><strong>Contact Phone:</strong> {app.phone || 'N/A'}</div>
                                        <div><strong>Official Ref / License:</strong> <code style={{ color: 'var(--ink-800)' }}>{app.govId || 'Auto'}</code></div>
                                        <div><strong>Login Password:</strong> <code style={{ color: 'var(--forest-green)', fontWeight: 700 }}>123</code></div>
                                        <div><strong>Status:</strong> {app.status}</div>
                                    </div>

                                    {app.status === 'PENDING' && (
                                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                onClick={() => handleRejectApplication(app)}
                                                className="btn-outline"
                                                style={{
                                                    padding: '6px 14px',
                                                    fontSize: '0.78rem'
                                                }}
                                            >
                                                Reject
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                disabled={loading}
                                                onClick={() => handleApproveApplication(app)}
                                                style={{
                                                    padding: '6px 16px',
                                                    fontSize: '0.78rem'
                                                }}
                                            >
                                                <FiCheckCircle size={13} /> Approve & Commit to Blockchain
                                            </button>
                                        </div>
                                    )}

                                    {app.status === 'APPROVED' && app.txHash && (
                                        <div style={{ fontSize: '0.74rem', color: 'var(--forest-green)', fontFamily: 'monospace' }}>
                                            Blockchain Tx: {app.txHash} (Block #{app.blockNumber || 'Live'})
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: Active Participants Directory */}
            {activeTab === 'directory' && (
                <div className="clean-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                        <div>
                            <h3 style={{ fontSize: '1.20rem', fontWeight: 700, margin: 0, color: 'var(--ink-900)' }}>
                                Active Ecosystem Participants Directory
                            </h3>
                            <p style={{ fontSize: '0.80rem', color: 'var(--ink-500)', margin: '3px 0 0' }}>
                                Authorized supply chain entities cryptographically registered on the Ethereum blockchain.
                            </p>
                        </div>
                        <span className="badge-purity">
                            <FiCheckCircle size={11} /> {directoryList.length} Total Registered
                        </span>
                    </div>

                    <div className="table-responsive">
                        <table className="honey-table">
                            <thead>
                                <tr>
                                    <th>Role</th>
                                    <th>Entity / Organization</th>
                                    <th>Unique ID / Username</th>
                                    <th>Facility / Cluster</th>
                                    <th>Blockchain Ledger Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {directoryList.map((ent, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <span style={{ 
                                                fontSize: '0.72rem', 
                                                fontWeight: 700, 
                                                padding: '2px 8px', 
                                                borderRadius: '4px', 
                                                background: `${ent.color || '#475569'}15`, 
                                                color: ent.color || '#475569', 
                                                border: `1px solid ${ent.color || '#475569'}30` 
                                            }}>
                                                {ent.roleKey}
                                            </span>
                                        </td>
                                        <td style={{ fontWeight: 600, color: 'var(--ink-900)' }}>
                                            {ent.name}
                                        </td>
                                        <td>
                                            <code style={{ fontSize: '0.82rem', color: 'var(--primary-honey-hover)', fontWeight: 700, background: 'var(--primary-honey-light)', padding: '2px 8px', borderRadius: '4px' }}>
                                                {ent.username}
                                            </code>
                                        </td>
                                        <td style={{ fontSize: '0.80rem', color: 'var(--ink-600)' }}>
                                            {ent.badge}
                                        </td>
                                        <td>
                                            <span className="badge-purity">
                                                <FiCheckCircle size={10} /> Verified On-Chain
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default AssignRoles;
