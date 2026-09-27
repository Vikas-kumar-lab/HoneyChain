import React, { useState, useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { submitApplication, getApplications, fetchApplicationsFromServer } from '../applicationRegistry';
import { getContractInstance } from '../web3Utils';
import { getStoredBatches } from '../hiveBatchRegistry';
import { verifyBottleSecurityCode } from '../bottleSecurity';
import honeyLogo from '../assets/honey-logo.png';
import {
    LoginForm,
    ApprovedRolesQuickSwitch,
    OnboardingApplicationForm,
    DirectPinVerification
} from '../components';
import { FiLock, FiFileText, FiSearch, FiTruck, FiUser } from 'react-icons/fi';
import { FaFlask, FaCogs, FaStore, FaBuilding } from 'react-icons/fa';
import { GiBee } from 'react-icons/gi';

const ROLE_APPLY_DEFAULTS = {
    BEEKEEPER: {
        primaryName: 'Ramesh Kumar',
        orgName: 'Ramesh Kumar Apiary Collective',
        location: 'Pulwama Cluster',
        stateName: 'Jammu & Kashmir',
        phone: '+91 7979797979'
    },
    LAB: {
        primaryName: 'Dr. Sunita Rao',
        orgName: 'Apex Food Quality & Purity Lab',
        location: 'Srinagar, Jammu & Kashmir',
        stateName: 'Jammu & Kashmir',
        phone: '+91 8989898989'
    },
    PROCESSOR: {
        primaryName: 'Amit Verma',
        orgName: 'Himalayan Pure Honey Processing Unit',
        location: 'SIDCO Industrial Complex, Bari Brahmana',
        stateName: 'Jammu & Kashmir',
        phone: '+91 7878787878'
    },
    DISTRIBUTOR: {
        primaryName: 'Gurpeet Singh',
        orgName: 'Northern Cold-Chain Logistics',
        location: 'Delhi - Chandigarh - Kashmir Corridor',
        stateName: 'Delhi NCR',
        phone: '+91 8080808080'
    },
    RETAILER: {
        primaryName: 'Meenakshi Sharma',
        orgName: 'KVIC Khadi Gramodyog Bhavan',
        location: 'Regal Building, Connaught Place, New Delhi',
        stateName: 'Delhi',
        phone: '+91 6868686868'
    }
};

function Login({ initialTab = 'login' }) {
    const history = useHistory();
    const routerLocation = useLocation();
    const { login } = useAuth();

    const searchParams = new URLSearchParams(routerLocation.search);
    const urlTab = searchParams.get('tab');

    const getInitialActiveTab = () => {
        if (urlTab === 'verify' || routerLocation.pathname.includes('verify')) return 'verify';
        if (urlTab === 'apply' || routerLocation.pathname === '/apply') return 'apply';
        if (initialTab === 'verify') return 'verify';
        if (initialTab === 'apply') return 'apply';
        return 'login';
    };

    const [activeTab, setActiveTab] = useState(getInitialActiveTab);

    // Login state
    const [username, setUsername] = useState('admin');
    const [password, setPassword] = useState('123');
    const [loginError, setLoginError] = useState(null);
    const [loginLoading, setLoginLoading] = useState(false);

    // Apply state
    const [applyRole, setApplyRole] = useState('BEEKEEPER');
    const [primaryName, setPrimaryName] = useState(ROLE_APPLY_DEFAULTS.BEEKEEPER.primaryName);
    const [orgName, setOrgName] = useState(ROLE_APPLY_DEFAULTS.BEEKEEPER.orgName);
    const [location, setLocation] = useState(ROLE_APPLY_DEFAULTS.BEEKEEPER.location);
    const [stateName, setStateName] = useState(ROLE_APPLY_DEFAULTS.BEEKEEPER.stateName);
    const [phone, setPhone] = useState(ROLE_APPLY_DEFAULTS.BEEKEEPER.phone);
    const [applySuccess, setApplySuccess] = useState(null);
    const [applyError, setApplyError] = useState(null);
    const [applyLoading, setApplyLoading] = useState(false);

    // Direct PIN Verification state
    const [verifyBatchId, setVerifyBatchId] = useState('1');
    const [verifyPin, setVerifyPin] = useState('');
    const [verifyLoading, setVerifyLoading] = useState(false);
    const [verifyError, setVerifyError] = useState(null);
    const [verifiedData, setVerifiedData] = useState(null);

    // Available applications for quick access
    const [availableApplications, setAvailableApplications] = useState(() => getApplications());

    useEffect(() => {
        const params = new URLSearchParams(routerLocation.search);
        const b = params.get('batch');
        const c = params.get('code') || params.get('token');
        if (b) setVerifyBatchId(b);
        if (c) setVerifyPin(c);

        if (routerLocation.pathname.includes('verify') || params.get('tab') === 'verify' || initialTab === 'verify') {
            const batchQuery = b ? `?batch=${b}${c ? `&token=${c}` : ''}` : '';
            history.replace(`/consumer-verify${batchQuery}`);
        } else if (routerLocation.pathname === '/apply' || params.get('tab') === 'apply' || initialTab === 'apply') {
            setActiveTab('apply');
        } else if (routerLocation.pathname === '/login' || initialTab === 'login') {
            setActiveTab('login');
        }
    }, [routerLocation.pathname, routerLocation.search, initialTab, history]);

    useEffect(() => {
        const handleUpdate = () => {
            setAvailableApplications(getApplications());
        };
        fetchApplicationsFromServer().then(apps => {
            if (apps && Array.isArray(apps)) setAvailableApplications(apps);
        });
        window.addEventListener('honeychain_applications_updated', handleUpdate);
        window.addEventListener('storage', handleUpdate);
        return () => {
            window.removeEventListener('honeychain_applications_updated', handleUpdate);
            window.removeEventListener('storage', handleUpdate);
        };
    }, []);

    const handleApplyRoleChange = (newRole) => {
        setApplyRole(newRole);
        const def = ROLE_APPLY_DEFAULTS[newRole] || ROLE_APPLY_DEFAULTS.BEEKEEPER;
        setPrimaryName(def.primaryName);
        setOrgName(def.orgName);
        setLocation(def.location);
        setStateName(def.stateName);
        setPhone(def.phone);
    };

    const allQuickAccounts = [
        {
            id: 'admin',
            username: 'admin',
            name: 'KVIC National Admin',
            role: 'ADMIN',
            status: 'APPROVED',
            badge: 'National Admin (All Tabs)',
            phone: '9999999999',
            color: '#B45309',
            icon: <FaBuilding size={15} color="#B45309" />
        },
        ...availableApplications.filter(a => (a.username || '').toLowerCase() !== 'admin').map(app => {
            const roleMeta = {
                'BEEKEEPER': { icon: <GiBee size={16} color="#D97706" />, color: '#D97706', label: 'Beekeeper' },
                'LAB': { icon: <FaFlask size={14} color="#2563EB" />, color: '#2563EB', label: 'Testing Lab' },
                'PROCESSOR': { icon: <FaCogs size={14} color="#7C3AED" />, color: '#7C3AED', label: 'Processing Unit' },
                'DISTRIBUTOR': { icon: <FiTruck size={15} color="#0891B2" />, color: '#0891B2', label: 'Distributor' },
                'RETAILER': { icon: <FaStore size={14} color="#059669" />, color: '#059669', label: 'Retailer' }
            }[app.role] || { icon: <FiUser size={15} color="#64748B" />, color: '#64748B', label: app.role };

            return {
                id: app.id,
                username: app.username,
                name: app.name || app.orgName || app.username,
                role: app.role,
                status: app.status || 'PENDING',
                badge: roleMeta.label,
                phone: app.phone,
                color: roleMeta.color,
                icon: roleMeta.icon,
                govId: app.govId
            };
        })
    ];

    const handleLoginSubmit = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setLoginError(null);
        setLoginLoading(true);
        const res = login(username, password);
        setLoginLoading(false);
        if (res.success) {
            history.push(res.user.portalPath || '/');
        } else {
            setLoginError(res.message);
        }
    };

    const handleSelectQuickAccount = (acc, loginIdentifier) => {
        setUsername(loginIdentifier);
        setPassword('123');
        setLoginError(null);
        if (acc.status === 'APPROVED') {
            const res = login(loginIdentifier, '123');
            if (res.success) {
                history.push(res.user.portalPath || '/');
            } else {
                setLoginError(res.message);
            }
        }
    };

    const handleApplySubmit = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        setApplyError(null);
        setApplySuccess(null);
        setApplyLoading(true);

        try {
            const newApp = await submitApplication({
                name: primaryName.trim(),
                orgName: orgName.trim() || primaryName.trim(),
                role: applyRole,
                location: location.trim() || 'Rural Apiary Cluster',
                state: stateName.trim() || 'India',
                phone: phone.trim()
            });

            setApplySuccess(`Application ID: ${newApp.id}. Assigned username: "${newApp.username}". Awaiting KVIC Admin approval.`);
            const def = ROLE_APPLY_DEFAULTS[applyRole] || ROLE_APPLY_DEFAULTS.BEEKEEPER;
            setPrimaryName(def.primaryName);
            setOrgName(def.orgName);
            setLocation(def.location);
            setStateName(def.stateName);
            setPhone(def.phone);
        } catch (err) {
            setApplyError(err.message || 'Failed to submit application. Please try again.');
        } finally {
            setApplyLoading(false);
        }
    };

    const handleVerifyHoney = async () => {
        if (!verifyBatchId || !String(verifyBatchId).trim()) {
            setVerifyError('Please enter a Batch Number.');
            return;
        }
        if (!verifyPin || !String(verifyPin).trim()) {
            setVerifyError('Please enter the Security PIN or Serial Code from the bottle.');
            return;
        }

        setVerifyLoading(true);
        setVerifyError(null);
        setVerifiedData(null);

        try {
            let readContract = null;
            try {
                const inst = await getContractInstance();
                readContract = inst.readContract;
            } catch (e) {}

            let totalBatches = 0;
            if (readContract && readContract.methods) {
                totalBatches = parseInt(await readContract.methods.batchCount().call().catch(() => 0));
            }

            const storedBatches = getStoredBatches();
            const cleanInput = String(verifyBatchId).trim();
            const cleanUpper = cleanInput.toUpperCase();

            const matchedStored = storedBatches.find(b => 
                String(b.batchId) === cleanInput || 
                (b.batchCode && b.batchCode.trim().toUpperCase() === cleanUpper)
            );

            let targetId = null;
            if (/^\d+$/.test(cleanInput)) {
                const num = parseInt(cleanInput, 10);
                if (num >= 1 && (num <= totalBatches || (matchedStored && matchedStored.batchId === num))) {
                    targetId = num;
                }
            }

            if (!targetId && matchedStored) {
                targetId = matchedStored.batchId;
            }

            if (!targetId) {
                setVerifyError(`Batch "${cleanInput}" does not exist on blockchain ledger.`);
                setVerifyLoading(false);
                return;
            }

            let batchData = matchedStored;
            if (!batchData && readContract) {
                const basic = await readContract.methods.getBatchBasic(targetId).call().catch(() => null);
                const lab = await readContract.methods.getBatchLab(targetId).call().catch(() => null);
                const status = await readContract.methods.getBatchStatus(targetId).call().catch(() => null);
                if (basic) {
                    batchData = {
                        batchId: targetId,
                        batchCode: basic.batchCode,
                        floraName: basic.floraName,
                        floraType: basic.floraName,
                        harvestTimestamp: Number(basic.harvestTimestamp) || 0,
                        yieldWeightKg: status ? Number(status.yieldWeightKg) : 25,
                        jarsTotal: status ? Number(status.jarsTotal) : 50,
                        labPassed: lab ? lab.labPassed : false
                    };
                }
            }

            const totalJars = Math.max(1, Math.round((parseFloat(batchData?.yieldWeightKg || batchData?.totalQuantityKg || 25)) * 2));
            const secResult = verifyBottleSecurityCode(
                verifyPin.trim(),
                totalJars,
                targetId,
                batchData?.harvestTimestamp || 0,
                batchData?.batchCode || cleanInput
            );
            if (!secResult.valid) {
                setVerifyError(secResult.error || 'Invalid Security PIN for this batch.');
                setVerifyLoading(false);
                return;
            }

            setVerifiedData({
                batchId: targetId,
                token: verifyPin.trim().toUpperCase(),
                unit: secResult.unit || 1,
                totalJars: totalJars,
                floraName: batchData?.floraName || batchData?.floraType || 'Multifloral Honey'
            });
        } catch (err) {
            setVerifyError(err.message || 'Verification failed. Please check credentials.');
        } finally {
            setVerifyLoading(false);
        }
    };

    return (
        <div style={{
            flex: 1,
            width: '100%',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '24px 16px',
            boxSizing: 'border-box'
        }}>
            <div style={{ width: '100%', maxWidth: '480px', margin: 'auto', transition: 'max-width 0.2s ease' }}>
                <div className="clean-card" style={{ padding: '28px 24px', borderRadius: '12px', boxShadow: '0 4px 20px -2px rgba(0,0,0,0.06)' }}>
                    {/* Header Branding */}
                    <div style={{ textAlign: 'center', marginBottom: '22px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '6px' }}>
                            <img 
                                src={honeyLogo} 
                                alt="HoneyChain" 
                                style={{ width: '40px', height: '40px', objectFit: 'contain' }} 
                            />
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink-900)', lineHeight: 1.1 }}>
                                    HoneyChain
                                    <span style={{ 
                                        marginLeft: '8px', 
                                        fontSize: '0.68rem', 
                                        padding: '2px 7px', 
                                        background: 'var(--primary-honey-light)', 
                                        color: 'var(--primary-honey-hover)', 
                                        border: '1px solid var(--primary-honey-border)',
                                        borderRadius: '4px',
                                        fontWeight: 800
                                    }}>
                                        KVIC
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--ink-500)', fontWeight: 500 }}>
                                    National Honey Mission Gateway
                                </div>
                            </div>
                        </div>
                        <p style={{ color: 'var(--ink-500)', fontSize: '0.82rem', margin: '6px 0 0', lineHeight: 1.4 }}>
                            {activeTab === 'apply' 
                                ? 'Submit accreditation application to join the HoneyChain network'
                                : activeTab === 'verify'
                                ? 'Instant cryptographic verification of bottle seal & NMR purity certificate'
                                : 'Enterprise access portal for accredited supply chain participants'}
                        </p>
                    </div>

                    {/* Integrated In-Card Navigation Tabs */}
                    <div style={{
                        display: 'flex',
                        background: 'var(--bg-app)',
                        padding: '4px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        marginBottom: '20px',
                        gap: '4px'
                    }}>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('login');
                                if (routerLocation.pathname !== '/login') history.replace('/login');
                            }}
                            style={{
                                flex: 1,
                                padding: '8px',
                                fontSize: '0.80rem',
                                fontWeight: activeTab === 'login' ? 700 : 500,
                                borderRadius: '6px',
                                background: activeTab === 'login' ? '#FFFFFF' : 'transparent',
                                color: activeTab === 'login' ? 'var(--ink-900)' : 'var(--ink-500)',
                                boxShadow: activeTab === 'login' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                            }}
                        >
                            <FiLock size={14} />
                            <span>Login</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('apply');
                                if (routerLocation.pathname !== '/apply') history.replace('/apply');
                            }}
                            style={{
                                flex: 1,
                                padding: '8px',
                                fontSize: '0.80rem',
                                fontWeight: activeTab === 'apply' ? 700 : 500,
                                borderRadius: '6px',
                                background: activeTab === 'apply' ? '#FFFFFF' : 'transparent',
                                color: activeTab === 'apply' ? 'var(--ink-900)' : 'var(--ink-500)',
                                boxShadow: activeTab === 'apply' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                            }}
                        >
                            <FiFileText size={14} />
                            <span>Apply for Role</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                history.push('/consumer-verify');
                            }}
                            style={{
                                flex: 1,
                                padding: '8px',
                                fontSize: '0.80rem',
                                fontWeight: 500,
                                borderRadius: '6px',
                                background: 'transparent',
                                color: 'var(--ink-500)',
                                border: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                            }}
                        >
                            <FiSearch size={14} />
                            <span>QR Verify</span>
                        </button>
                    </div>

                    {/* TAB 1: Account Login */}
                    {activeTab === 'login' && (
                        <div>
                            <LoginForm
                                username={username}
                                onUsernameChange={setUsername}
                                password={password}
                                onPasswordChange={setPassword}
                                onSubmit={handleLoginSubmit}
                                loading={loginLoading}
                                error={loginError}
                            />

                            <ApprovedRolesQuickSwitch
                                accounts={allQuickAccounts}
                                selectedIdentifier={username}
                                onSelectAccount={handleSelectQuickAccount}
                            />
                        </div>
                    )}

                    {/* TAB 2: Apply for Role */}
                    {activeTab === 'apply' && (
                        <OnboardingApplicationForm
                            role={applyRole}
                            onRoleChange={handleApplyRoleChange}
                            primaryName={primaryName}
                            onPrimaryNameChange={setPrimaryName}
                            orgName={orgName}
                            onOrgNameChange={setOrgName}
                            location={location}
                            onLocationChange={setLocation}
                            stateName={stateName}
                            onStateNameChange={setStateName}
                            phone={phone}
                            onPhoneChange={setPhone}
                            onSubmit={handleApplySubmit}
                            loading={applyLoading}
                            successMessage={applySuccess}
                            errorMessage={applyError}
                            onGoToLogin={() => setActiveTab('login')}
                        />
                    )}

                    {/* TAB 3: Direct Verification */}
                    {activeTab === 'verify' && (
                        <DirectPinVerification
                            batchId={verifyBatchId}
                            onBatchIdChange={setVerifyBatchId}
                            pin={verifyPin}
                            onPinChange={setVerifyPin}
                            onVerify={handleVerifyHoney}
                            loading={verifyLoading}
                            error={verifyError}
                            verifiedData={verifiedData}
                            onViewPassport={() => history.push(`/consumer-verify?batch=${verifiedData?.batchId}&token=${verifiedData?.token}`)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default Login;
