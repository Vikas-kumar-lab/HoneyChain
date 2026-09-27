import React, { useState, useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
    FiDroplet, 
    FiUsers, 
    FiActivity, 
    FiTruck, 
    FiFileText, 
    FiMenu, 
    FiX,
    FiCompass,
    FiLogOut
} from 'react-icons/fi';
import { FaFlask, FaStore, FaQrcode } from 'react-icons/fa';
import honeyLogo from '../assets/honey-logo.png';
import LanguageSelector from './common/LanguageSelector';

function Header() {
    const history = useHistory();
    const location = useLocation();
    const { roleInfo, currentUser, isAuthenticated, logout } = useAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [mobileMenuOpen]);

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    const navItems = [
        { path: '/', label: 'Overview', shortLabel: 'Overview', icon: <FiFileText size={16} />, roles: ['ADMIN', 'BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER'] },
        { path: '/ai-dashboard', label: 'AI Geo-Radar', shortLabel: 'AI Radar', icon: <FiCompass size={16} />, roles: ['ADMIN', 'BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER'] },
        { path: '/admin', label: 'Assign Roles', shortLabel: 'Roles', icon: <FiUsers size={16} />, roles: ['ADMIN'] },
        { path: '/hives', label: 'IoT Hives', shortLabel: 'Hives', icon: <FiActivity size={16} />, roles: ['ADMIN', 'BEEKEEPER'] },
        { path: '/beekeeper', label: 'Harvest', shortLabel: 'Harvest', icon: <FiDroplet size={16} />, roles: ['ADMIN', 'BEEKEEPER'] },
        { path: '/lab-testing', label: 'Lab Purity', shortLabel: 'Lab', icon: <FaFlask size={16} />, roles: ['ADMIN', 'LAB'] },
        { path: '/supply-pipeline', label: 'Pipeline', shortLabel: 'Pipeline', icon: <FiTruck size={16} />, roles: ['ADMIN', 'BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER'] },
        { path: '/retail', label: 'Retail POS', shortLabel: 'POS', icon: <FaStore size={16} />, roles: ['ADMIN', 'RETAILER'] },
        { path: '/consumer-verify', label: 'QR Verify', shortLabel: 'Verify', icon: <FaQrcode size={16} />, roles: ['ADMIN', 'BEEKEEPER', 'LAB', 'PROCESSOR', 'DISTRIBUTOR', 'RETAILER'] }
    ];

    const userRoleTypes = roleInfo?.types || [roleInfo?.type || 'PUBLIC'];

    // Tab visibility:
    const visibleNavItems = !isAuthenticated
        ? []
        : navItems.filter(item => {
            if (userRoleTypes.includes('ADMIN')) return true;
            return item.roles.some(r => userRoleTypes.includes(r));
        });

    const getPrimaryRolePortal = () => {
        if (userRoleTypes.includes('ADMIN')) return { path: '/admin', label: 'Roles', icon: <FiUsers size={17} /> };
        if (userRoleTypes.includes('BEEKEEPER')) return { path: '/hives', label: 'Hives', icon: <FiActivity size={17} /> };
        if (userRoleTypes.includes('LAB')) return { path: '/lab-testing', label: 'Lab', icon: <FaFlask size={17} /> };
        if (userRoleTypes.includes('RETAILER')) return { path: '/retail', label: 'POS', icon: <FaStore size={17} /> };
        return { path: '/supply-pipeline', label: 'Pipeline', icon: <FiTruck size={17} /> };
    };

    const primaryPortal = getPrimaryRolePortal();

    const bottomNavItems = [
        { path: '/', label: 'Home', icon: <FiFileText size={17} /> },
        primaryPortal,
        { path: '/supply-pipeline', label: 'Pipeline', icon: <FiTruck size={17} /> },
        { path: '/consumer-verify', label: 'Verify', icon: <FaQrcode size={17} /> },
    ];

    const handleNavigate = (path) => {
        history.push(path);
        setMobileMenuOpen(false);
    };

    const handleLogout = () => {
        setMobileMenuOpen(false);
        logout();
        history.push('/login');
    };

    const handleBrandClick = () => {
        handleNavigate(isAuthenticated ? '/' : '/consumer-verify');
    };

    const isPathActive = (path) => {
        return location.pathname === path || 
            (path === '/consumer-verify' && location.pathname.startsWith('/verify')) ||
            (path === '/retail' && (location.pathname === '/retail' || location.pathname === '/pos'));
    };

    return (
        <>
            <header className="site-header">
                <div className="header-inner">
                    {/* Brand */}
                    <div 
                        className="brand" 
                        onClick={handleBrandClick} 
                        style={{ cursor: 'pointer' }}
                    >
                        <div className="brand-badge">
                            <img src={honeyLogo} alt="HoneyChain Honey Jar Logo" className="brand-logo-img" />
                        </div>
                        <div className="brand-meta">
                            <div className="brand-title">
                                HoneyChain
                                <span className="gov-tag">KVIC</span>
                            </div>
                            <div className="brand-desc">Honey Mission</div>
                        </div>
                    </div>

                    {/* Desktop Nav */}
                    <nav className="desktop-nav">
                        {visibleNavItems.map((item) => {
                            const isActive = isPathActive(item.path);
                            return (
                                <button
                                    key={item.path}
                                    className={`nav-link-btn ${isActive ? 'active' : ''}`}
                                    onClick={() => handleNavigate(item.path)}
                                    title={item.label}
                                >
                                    <span className="nav-icon">{item.icon}</span>
                                    <span className="nav-label-full">{item.label}</span>
                                    <span className="nav-label-short">{item.shortLabel}</span>
                                </button>
                            );
                        })}
                    </nav>

                    {/* Right Side: Language Selector, User Profile & Mobile Toggle */}
                    <div className="header-actions">
                        {/* Desktop Language Selector */}
                        <div className="header-lang-desktop">
                            <LanguageSelector />
                        </div>

                        {isAuthenticated ? (
                            <>
                                {/* Desktop User Info & Logout Button */}
                                <div className="header-user-desktop">
                                    <div className="role-pill">
                                        <span className="role-dot"></span>
                                        <span>{currentUser?.roleKey || 'ADMIN'}</span>
                                    </div>

                                    <button
                                        onClick={handleLogout}
                                        className="header-logout-btn"
                                        title="Logout from enterprise portal"
                                    >
                                        Logout
                                    </button>

                                </div>

                                {/* Mobile Compact Role Badge (fits cleanly next to hamburger) */}
                                <div className="header-role-mobile">
                                    <span className="role-dot"></span>
                                    <span>{currentUser?.roleKey || 'ADMIN'}</span>
                                </div>
                            </>
                        ) : null}

                        {/* Hamburger Button (Always visible and responsive on mobile/tablet) */}
                        <button 
                            className={`mobile-toggle ${mobileMenuOpen ? 'open' : ''}`}
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label="Toggle Navigation"
                            aria-expanded={mobileMenuOpen}
                        >
                            {mobileMenuOpen ? <FiX size={20} /> : <FiMenu size={20} />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Navigation Drawer with Overlay Backdrop */}
            {mobileMenuOpen && (
                <div className="mobile-drawer-overlay" onClick={() => setMobileMenuOpen(false)}>
                    <div className="mobile-drawer-content" onClick={(e) => e.stopPropagation()}>
                        {/* Drawer Header */}
                        <div className="drawer-header">
                            <div className="drawer-brand">
                                <img src={honeyLogo} alt="Logo" className="drawer-logo" />
                                <div>
                                    <div className="drawer-title">
                                        HoneyChain <span className="gov-tag">KVIC</span>
                                    </div>
                                    <div className="drawer-subtitle">
                                        {currentUser?.name || 'Authorized Portal'} • <strong style={{ color: 'var(--forest-green)' }}>{currentUser?.roleKey || 'ADMIN'}</strong>
                                    </div>
                                </div>
                            </div>
                            <button 
                                className="drawer-close-btn" 
                                onClick={() => setMobileMenuOpen(false)}
                                aria-label="Close navigation"
                            >
                                <FiX size={18} />
                            </button>
                        </div>

                        {/* Language Selector in Drawer */}
                        <div className="drawer-lang-bar">
                            <span className="drawer-section-label">Select Interface Language:</span>
                            <LanguageSelector />
                        </div>

                        {/* Navigation Links */}
                        <div className="drawer-links-container">
                            <span className="drawer-section-label" style={{ padding: '4px 6px 6px' }}>
                                Enterprise Portals
                            </span>
                            {visibleNavItems.map((item) => {
                                const isActive = isPathActive(item.path);
                                return (
                                    <button
                                        key={item.path}
                                        className={`drawer-nav-item ${isActive ? 'active' : ''}`}
                                        onClick={() => handleNavigate(item.path)}
                                    >
                                        <span className="drawer-item-icon">{item.icon}</span>
                                        <span className="drawer-item-label">{item.label}</span>
                                        {isActive && <span className="drawer-active-badge">Active</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Drawer Footer with Logout & Reset */}
                        {isAuthenticated && (
                            <div className="drawer-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button className="drawer-logout-btn" onClick={handleLogout}>
                                    <FiLogOut size={16} />
                                    <span>Sign Out ({currentUser?.roleKey || 'ADMIN'})</span>
                                </button>

                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Mobile Bottom Navigation Bar (1-tap quick access on mobile devices) */}
            {isAuthenticated && (
                <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
                    {bottomNavItems.map((item) => {
                        const isActive = isPathActive(item.path);
                        return (
                            <button
                                key={item.path}
                                className={`mobile-bottom-tab ${isActive ? 'active' : ''}`}
                                onClick={() => handleNavigate(item.path)}
                            >
                                <span className="mobile-tab-icon">{item.icon}</span>
                                <span className="mobile-tab-label">{item.label}</span>
                            </button>
                        );
                    })}
                    <button 
                        className={`mobile-bottom-tab ${mobileMenuOpen ? 'active' : ''}`}
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    >
                        <span className="mobile-tab-icon"><FiMenu size={17} /></span>
                        <span className="mobile-tab-label">Menu</span>
                    </button>
                </nav>
            )}
        </>
    );
}

export default Header;
