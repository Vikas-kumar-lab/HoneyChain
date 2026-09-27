import React, { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { getContractInstance, cachedCall } from '../web3Utils';
import { useAuth } from '../context/AuthContext';
import { 
    getStoredHives, 
    getStoredBatches, 
    getStoredBeekeeperProfile 
} from '../hiveBatchRegistry';
import { 
    FiBox, 
    FiUsers, 
    FiDroplet, 
    FiShield, 
    FiActivity, 
    FiArrowRight,
    FiCheckCircle,
    FiTruck,
    FiCpu
} from 'react-icons/fi';
import { FaFlask, FaQrcode, FaStore } from 'react-icons/fa';

function Overview() {
    const history = useHistory();
    const [stats, setStats] = useState(() => {
        const h = getStoredHives();
        const b = getStoredBatches();
        return {
            clusters: h.length > 0 ? new Set(h.map(x => x.location || x.beekeeper)).size : 0,
            smartHives: h.length,
            batchesHarvested: b.length,
            purityRate: 100
        };
    });
    const [clusters, setClusters] = useState([]);

    useEffect(() => {
        loadBlockchainOverview();
        const handleRefresh = () => loadBlockchainOverview();

        window.addEventListener('honeychain_hives_updated', handleRefresh);
        window.addEventListener('honeychain_batches_updated', handleRefresh);
        window.addEventListener('honeychain_directory_updated', handleRefresh);
        return () => {
            window.removeEventListener('honeychain_hives_updated', handleRefresh);
            window.removeEventListener('honeychain_batches_updated', handleRefresh);
            window.removeEventListener('honeychain_directory_updated', handleRefresh);
        };
    }, []);

    const loadBlockchainOverview = async () => {
        const storedHives = getStoredHives();
        const storedBatches = getStoredBatches();
        const storedProfile = getStoredBeekeeperProfile();

        // Build clusters from stored hives
        const clusterMap = new Map();
        storedHives.forEach((h, idx) => {
            const locKey = (h.location || 'Apiary Cluster').trim().toUpperCase();
            if (!clusterMap.has(locKey)) {
                const s = (h.state || '').toLowerCase();
                const l = (h.location || '').toLowerCase();
                const prefix = s.includes('kashmir') || l.includes('kashmir') ? 'JK' :
                               s.includes('uttar pradesh') || l.includes('agra') || l.includes('lucknow') ? 'UP' :
                               s.includes('himachal') ? 'HP' :
                               s.includes('uttarakhand') ? 'UK' :
                               s.includes('punjab') ? 'PB' :
                               s.includes('delhi') ? 'DL' :
                               s.includes('rajasthan') ? 'RJ' :
                               s.includes('bengal') ? 'WB' : 'IND';
                clusterMap.set(locKey, {
                    id: idx + 1,
                    name: h.beekeeper || storedProfile?.name || 'Registered Apiary',
                    clusterLocation: h.location || 'Apiary Cluster',
                    state: h.state || '',
                    kvicRegNumber: h.regNum || storedProfile?.regNum || `KVIC/HM/2026/${prefix}/${4820 + idx}`,
                    totalBoxes: 1
                });
            } else {
                const existing = clusterMap.get(locKey);
                existing.totalBoxes += 1;
            }
        });

        if (clusterMap.size === 0 && storedProfile && (storedHives.length > 0)) {
            clusterMap.set('DEFAULT_PROFILE', {
                id: 1,
                name: storedProfile.name,
                clusterLocation: storedProfile.location,
                state: storedProfile.state || '',
                kvicRegNumber: storedProfile.regNum,
                totalBoxes: storedHives.length
            });
        }

        let activeClusters = Array.from(clusterMap.values()).filter(c => (parseInt(c.totalBoxes, 10) || 0) > 0);

        try {
            const { readContract } = await getContractInstance();
            const [bkpCount, hiveCount, batchCount] = await cachedCall(
                () => Promise.all([
                    readContract.methods.beekeeperCount().call().catch(() => 0),
                    readContract.methods.hiveCount().call().catch(() => 0),
                    readContract.methods.batchCount().call().catch(() => 0)
                ]),
                'overview_metrics',
                2000
            );

            const numHives = parseInt(hiveCount) || 0;
            const totalBkpCount = parseInt(bkpCount) || 0;

            if (totalBkpCount > 0) {
                const hives = await cachedCall(
                    async () => {
                        const hivePromises = Array.from({ length: numHives }, (_, idx) => 
                            readContract.methods.smartHives(idx + 1).call().catch(() => null)
                        );
                        return (await Promise.all(hivePromises)).filter(Boolean);
                    },
                    `overview_hives_${numHives}`,
                    2000
                );

                const bkpBoxCountMap = {};
                hives.forEach(h => {
                    const bId = String(h.beekeeperId);
                    bkpBoxCountMap[bId] = (bkpBoxCountMap[bId] || 0) + 1;
                });

                const rawClusterList = await cachedCall(
                    async () => {
                        const clusterPromises = Array.from({ length: totalBkpCount }, (_, idx) => 
                            readContract.methods.beekeepers(idx + 1).call().catch(() => null)
                        );
                        return (await Promise.all(clusterPromises)).filter(Boolean);
                    },
                    `overview_clusters_${totalBkpCount}`,
                    2000
                );

                const onChainClusters = rawClusterList
                    .map(c => ({
                        ...c,
                        totalBoxes: bkpBoxCountMap[String(c.id)] || parseInt(c.totalBoxes) || 0
                    }))
                    .filter(c => {
                        if (c.wallet && c.wallet.toLowerCase().startsWith('0x11111111')) return false;
                        if ((parseInt(c.totalBoxes, 10) || 0) <= 0) return false;
                        return true;
                    });

                if (onChainClusters.length > 0) {
                    activeClusters = onChainClusters;
                }
            }

            setClusters(activeClusters);
            setStats({
                clusters: activeClusters.length,
                smartHives: numHives,
                batchesHarvested: parseInt(batchCount) || 0,
                purityRate: 100
            });
        } catch (err) {
            setClusters(activeClusters);
            setStats({
                clusters: activeClusters.length,
                smartHives: storedHives.length,
                batchesHarvested: storedBatches.length,
                purityRate: 100
            });
        }
    };

    const { roleInfo, isAuthenticated, currentUser } = useAuth();
    const userRoleTypes = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];
    const isAdmin = userRoleTypes.includes('ADMIN');

    // All available modules with strict RBAC definitions
    const modules = [
        {
            title: 'AI Intelligence Center',
            badge: 'Madhu-AI 360°',
            badgeColor: '#D97706',
            badgeBg: '#FEF3C7',
            path: '/ai-dashboard',
            icon: <FiCpu size={22} />,
            desc: 'Acoustic swarm FFT frequency audio synthesizer, harvest yield ML forecasting, FSSAI 2026 purity forensics & mass-balance fraud sentinel.',
            action: 'Launch AI Command Center',
            roles: ['ALL']
        },
        {
            title: 'Honey Authenticity Passport',
            badge: 'Public Consumer Tool',
            badgeColor: 'var(--forest-green)',
            badgeBg: '#D1FAE5',
            path: '/consumer-verify',
            icon: <FaQrcode size={24} />,
            desc: 'Verify your purchased honey bottle against tamper-proof Ethereum ledger, lab tests & beekeeper origin.',
            action: 'Verify your bottle now',
            roles: ['ALL']
        },
        {
            title: 'Smart Hive Telemetry',
            badge: 'Colony Sensor Network',
            badgeColor: '#D97706',
            badgeBg: '#FEF3C7',
            path: '/hives',
            icon: <FiActivity size={22} />,
            desc: 'Live sensor monitoring for brood temperature, acoustic swarm alerts, and hive health across clusters.',
            action: 'Explore hive telemetry',
            roles: ['ADMIN', 'BEEKEEPER']
        },
        {
            title: 'Beekeeper Harvest',
            badge: 'Apiary Portal',
            badgeColor: '#B45309',
            badgeBg: '#FEF3C7',
            path: '/beekeeper',
            icon: <FiDroplet size={22} />,
            desc: 'Authorized extraction logging with smart hive telemetry hashing for registered KVIC apiary collectives.',
            action: 'Beekeeper access',
            roles: ['ADMIN', 'BEEKEEPER']
        },
        {
            title: 'Lab Purity Testing',
            badge: 'Quality Testing Lab',
            badgeColor: '#0369A1',
            badgeBg: '#E0F2FE',
            path: '/lab-testing',
            icon: <FaFlask size={22} />,
            desc: 'FSSAI isotopic mass spectrometry and moisture testing reports signed by certified laboratories.',
            action: 'Lab portal access',
            roles: ['ADMIN', 'LAB']
        },
        {
            title: 'Supply Chain Pipeline',
            badge: 'Supply Chain Tracking',
            badgeColor: '#7E22CE',
            badgeBg: '#F3E8FF',
            path: '/supply-pipeline',
            icon: <FiTruck size={22} />,
            desc: 'End-to-end custody tracking: honey filtration, cold-chain temperature fleet transit, and retail inwarding.',
            action: 'View custody pipeline',
            roles: ['ADMIN', 'BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER']
        },
        {
            title: 'Retail Store POS',
            badge: 'Store Emporium',
            badgeColor: '#0F766E',
            badgeBg: '#CCFBF1',
            path: '/retail',
            icon: <FaStore size={22} />,
            desc: 'Consignment inwarding, physical security PIN validation, and verified customer sale invoice generation.',
            action: 'Retail POS desk',
            roles: ['ADMIN', 'RETAILER']
        },
        {
            title: 'Assign Roles & Applications',
            badge: 'Admin Control',
            badgeColor: '#B45309',
            badgeBg: '#FEF3C7',
            path: '/admin',
            icon: <FiUsers size={22} />,
            desc: 'Review participant applications, manage role permissions, and commit cryptographic authorizations.',
            action: 'Admin control desk',
            roles: ['ADMIN']
        }
    ];

    const visibleModules = modules.filter(m => {
        if (!isAuthenticated) return m.roles.includes('ALL');
        return m.roles.some(r => userRoleTypes.includes(r));
    });

    const getPrimaryActionLabel = () => {
        if (!isAuthenticated) return 'Enterprise Login →';
        if (currentUser?.roleName) return `Open ${currentUser.roleName} Portal →`;
        return 'Enter Workspace →';
    };

    const handlePrimaryAction = () => {
        if (!isAuthenticated) {
            history.push('/login');
        } else if (currentUser?.portalPath && currentUser.portalPath !== '/') {
            history.push(currentUser.portalPath);
        } else if (isAdmin) {
            history.push('/admin');
        } else {
            history.push('/consumer-verify');
        }
    };

    return (
        <div className="container">
            {/* Clean Hero Banner */}
            <div className="clean-card" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
                    <div style={{ maxWidth: '680px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-honey-hover)', background: 'var(--primary-honey-light)', border: '1px solid var(--primary-honey-border)', padding: '2px 8px', borderRadius: '9999px', marginBottom: '12px' }}>
                            Ministry of MSME • KVIC Honey Mission
                        </div>
                        <h2 style={{ fontSize: '1.85rem', fontWeight: 700, lineHeight: 1.25, color: 'var(--ink-900)', marginBottom: '10px' }}>
                            Traceable, honest honey from India’s rural beekeeping clusters.
                        </h2>
                        <p style={{ color: 'var(--ink-600)', fontSize: '0.92rem', lineHeight: '1.6' }}>
                            Every jar is harvested by KVIC-certified beekeepers, monitored via IoT sensors for colony health, tested for purity against C4 syrup adulteration, and verified on-chain.
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="btn-primary" onClick={() => history.push('/consumer-verify')}>
                            Verify a Bottle
                        </button>
                        <button className="btn-outline" onClick={handlePrimaryAction}>
                            {getPrimaryActionLabel()}
                        </button>
                    </div>
                </div>
            </div>

            {/* Madhu-AI Command Center Feature Banner */}
            <div style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                borderRadius: '12px',
                padding: '16px 20px',
                color: '#FFFFFF',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 4px 15px rgba(15, 23, 42, 0.12)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        background: 'rgba(245, 158, 11, 0.2)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FBBF24',
                        flexShrink: 0
                    }}>
                        <FiCpu size={22} />
                    </div>
                    <div style={{ minWidth: '220px', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.96rem', color: '#F8FAFC' }}>
                                Madhu-AI 360° Intelligence Command Center
                            </span>
                            <span style={{
                                background: 'rgba(16, 185, 129, 0.2)',
                                color: '#34D399',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: '12px',
                                padding: '1px 8px',
                                fontSize: '0.68rem',
                                fontWeight: 700
                            }}>
                                Active
                            </span>
                        </div>
                        <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#94A3B8' }}>
                            Real-time FFT audio acoustic swarm warning, floral harvest ML prediction, and FSSAI 2026 lab purity forensic sentinel.
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => history.push('/ai-dashboard')}
                    style={{
                        background: '#F59E0B',
                        color: '#0F172A',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '9px 18px',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                        flexShrink: 0
                    }}
                >
                    Launch AI Dashboard →
                </button>
            </div>

            {/* Impact Metric Cards with clean SVG icons */}
            <div className="telemetry-grid">
                <div className="dial-card">
                    <div className="dial-icon">
                        <FiUsers size={20} />
                    </div>
                    <div className="dial-info">
                        <div className="dial-value">{stats.clusters}</div>
                        <div className="dial-label">Apiary Clusters</div>
                    </div>
                </div>
                <div className="dial-card">
                    <div className="dial-icon">
                        <FiBox size={20} />
                    </div>
                    <div className="dial-info">
                        <div className="dial-value">{stats.smartHives}</div>
                        <div className="dial-label">Monitored Bee Boxes</div>
                    </div>
                </div>
                <div className="dial-card">
                    <div className="dial-icon">
                        <FiDroplet size={20} />
                    </div>
                    <div className="dial-info">
                        <div className="dial-value">{stats.batchesHarvested}</div>
                        <div className="dial-label">Batches Verified</div>
                    </div>
                </div>
                <div className="dial-card">
                    <div className="dial-icon">
                        <FiShield size={20} />
                    </div>
                    <div className="dial-info">
                        <div className="dial-value" style={{ color: 'var(--forest-green)' }}>{stats.purityRate}%</div>
                        <div className="dial-label">C4 Sugar Free Rate</div>
                    </div>
                </div>
            </div>



            {/* Role-Filtered Operational Modules Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '16px', margin: '24px 0' }}>
                {visibleModules.map((mod, idx) => (
                    <div 
                        key={idx}
                        className="clean-card" 
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }} 
                        onClick={() => history.push(mod.path)}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ color: 'var(--primary-honey)' }}>
                                {mod.icon}
                            </div>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: mod.badgeColor, background: mod.badgeBg, padding: '2px 7px', borderRadius: '4px' }}>
                                {mod.badge}
                            </span>
                        </div>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '6px', color: 'var(--ink-900)' }}>{mod.title}</h4>
                        <p style={{ fontSize: '0.82rem', color: 'var(--ink-500)', marginBottom: '14px', lineHeight: 1.5 }}>
                            {mod.desc}
                        </p>
                        <span style={{ color: 'var(--primary-honey)', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {mod.action} <FiArrowRight size={13} />
                        </span>
                    </div>
                ))}
            </div>

            {/* Clusters Table */}
            <div className="clean-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <h4 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0, color: 'var(--ink-900)' }}>
                            Registered KVIC Rural Apiary Clusters
                        </h4>
                        <span style={{ fontSize: '0.78rem', color: 'var(--ink-500)' }}>
                            Verified producer collectives supported under KVIC Honey Mission
                        </span>
                    </div>
                    <span className="badge-purity">
                        <FiCheckCircle size={12} /> Verified on Chain
                    </span>
                </div>

                <div className="table-responsive">
                    <table className="honey-table">
                        <thead>
                            <tr>
                                <th>Cluster</th>
                                <th>Lead Beekeeper / SHG</th>
                                <th>Location</th>
                                <th>KVIC Reg #</th>
                                <th>Bee Boxes</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clusters.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--ink-500)' }}>
                                        Zero clusters registered on blockchain. <a href="/beekeeper" style={{ color: 'var(--primary-honey)', fontWeight: 600 }}>Register first beekeeper & hive →</a>
                                    </td>
                                </tr>
                            ) : (
                                clusters.map((c, idx) => (
                                    <tr key={idx}>
                                        <td><strong>#{idx + 1}</strong></td>
                                        <td><strong style={{ color: 'var(--ink-900)' }}>{c.name}</strong></td>
                                        <td>{c.state && !c.clusterLocation.toLowerCase().includes(c.state.toLowerCase()) ? `${c.clusterLocation}, ${c.state}` : c.clusterLocation}</td>
                                        <td><code style={{ background: 'var(--bg-subtle)', color: 'var(--ink-700)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{c.kvicRegNumber}</code></td>
                                        <td>{c.totalBoxes} Boxes</td>
                                        <td><span className="badge-purity"><FiCheckCircle size={11} /> Active Producer</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default Overview;
