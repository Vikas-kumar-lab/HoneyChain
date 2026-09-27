import React, { createContext, useContext, useState } from 'react';
import { resolveEnterpriseAddress } from '../web3Utils';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const KVIC_ADMIN_ADDRESS = '0x556FCE98dC5b75C5097eEf0581BC17f771944EbB';

export const ENTERPRISE_USERS = [
    {
        id: 'admin',
        username: 'admin',
        phone: '9999999999',
        password: '123',
        roleKey: 'ADMIN',
        roleName: 'KVIC National Admin',
        name: 'KVIC Admin',
        badge: 'KVIC National Admin',
        color: '#B45309',
        portalPath: '/admin',
        address: '0x556FCE98dC5b75C5097eEf0581BC17f771944EbB'
    }
];

export function AuthProvider({ children }) {
    const getStoredUser = () => {
        if (typeof localStorage === 'undefined') return null;
        try {
            const raw = localStorage.getItem('honeychain2_user');
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return null;
    };

    const [currentUser, setCurrentUser] = useState(getStoredUser);
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        if (typeof localStorage === 'undefined') return false;
        return localStorage.getItem('honeychain2_is_auth') === 'true';
    });

    const login = (identifier, password) => {
        const cleanUser = (identifier || '').trim().toLowerCase();
        const cleanPass = (password || '').trim();
        const cleanDigits = (identifier || '').replace(/[^0-9]/g, '');
        const last10Digits = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits;

        const isPhoneMatch = (storedPhone) => {
            if (!storedPhone || !cleanDigits) return false;
            const storedDigits = String(storedPhone).replace(/[^0-9]/g, '');
            const storedLast10 = storedDigits.length >= 10 ? storedDigits.slice(-10) : storedDigits;
            if (last10Digits.length >= 7 && storedLast10.length >= 7 && last10Digits === storedLast10) return true;
            if (cleanDigits.length >= 4 && (storedDigits.endsWith(cleanDigits) || cleanDigits.endsWith(storedDigits))) return true;
            return false;
        };

        // 1. Check primary admin credentials (by 'admin' or phone or username)
        let matched = ENTERPRISE_USERS.find(
            u => (u.username.toLowerCase() === cleanUser || u.id.toLowerCase() === cleanUser || isPhoneMatch(u.phone)) && u.password === cleanPass
        );

        // 2. Allow any approved applicant from application registry or entity directory to log in with phone or username + password 123
        if (!matched && (cleanPass === '123' || cleanPass === 'password')) {
            try {
                const apps = JSON.parse(localStorage.getItem('honeychain_onboarding_applications') || '[]');
                const foundApp = apps.find(a => {
                    if (a.status !== 'APPROVED') return false;
                    const aUser = (a.username || '').toLowerCase();
                    const aId = (a.id || '').toLowerCase();
                    const aName = (a.name || '').toLowerCase();
                    return (
                        aUser === cleanUser ||
                        aId === cleanUser ||
                        aName === cleanUser ||
                        isPhoneMatch(a.phone)
                    );
                });

                const rolePathMap = {
                    'BEEKEEPER': '/hives',
                    'LAB': '/lab-testing',
                    'PROCESSOR': '/supply-pipeline',
                    'DISTRIBUTOR': '/supply-pipeline',
                    'RETAILER': '/retail'
                };

                if (foundApp) {
                    matched = {
                        id: foundApp.username,
                        username: foundApp.username,
                        password: '123',
                        roleKey: foundApp.role,
                        roleName: foundApp.name || foundApp.role,
                        name: foundApp.name || foundApp.username,
                        orgName: foundApp.orgName || foundApp.name,
                        phone: foundApp.phone,
                        location: foundApp.location || '',
                        state: foundApp.state || '',
                        govId: foundApp.govId || '',
                        badge: `Certified ${foundApp.role}`,
                        color: foundApp.role === 'BEEKEEPER' ? '#D97706' : 
                               foundApp.role === 'LAB' ? '#2563EB' : 
                               foundApp.role === 'PROCESSOR' ? '#7C3AED' : 
                               foundApp.role === 'DISTRIBUTOR' ? '#0891B2' : '#059669',
                        portalPath: rolePathMap[foundApp.role] || '/',
                        address: foundApp.address || resolveEnterpriseAddress(foundApp.username)
                    };
                } else {
                    const dir = JSON.parse(localStorage.getItem('honeychain_entity_directory') || '[]');
                    const foundDir = dir.find(e => 
                        (e.username && e.username.toLowerCase() === cleanUser) ||
                        (e.name && e.name.toLowerCase() === cleanUser) ||
                        isPhoneMatch(e.phone)
                    );
                    if (foundDir) {
                        matched = {
                            id: foundDir.username || foundDir.name,
                            username: foundDir.username || foundDir.name,
                            password: '123',
                            roleKey: foundDir.role,
                            roleName: foundDir.name || foundDir.role,
                            name: foundDir.name,
                            orgName: foundDir.orgName || foundDir.name,
                            phone: foundDir.phone || '',
                            location: foundDir.location || '',
                            state: foundDir.state || '',
                            govId: foundDir.govId || '',
                            badge: `Authorized ${foundDir.role}`,
                            color: '#059669',
                            portalPath: rolePathMap[foundDir.role] || '/',
                            address: foundDir.address || resolveEnterpriseAddress(foundDir.username || foundDir.name)
                        };
                    }
                }
            } catch (e) {
                console.warn("Login lookup error:", e);
            }
        }

        if (matched) {
            setCurrentUser(matched);
            setIsAuthenticated(true);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('honeychain2_user', JSON.stringify(matched));
                localStorage.setItem('honeychain2_is_auth', 'true');
            }
            return { success: true, user: matched };
        } else {
            // Check if user credentials match a pending or rejected account to give specific helpful feedback
            try {
                const apps = JSON.parse(localStorage.getItem('honeychain_onboarding_applications') || '[]');
                const foundOther = apps.find(a => {
                    const aUser = (a.username || '').toLowerCase();
                    const aId = (a.id || '').toLowerCase();
                    const aName = (a.name || '').toLowerCase();
                    return (
                        aUser === cleanUser ||
                        aId === cleanUser ||
                        aName === cleanUser ||
                        isPhoneMatch(a.phone)
                    );
                });

                if (foundOther) {
                    if (foundOther.status === 'PENDING') {
                        return {
                            success: false,
                            message: `Account for ${foundOther.name} (${foundOther.phone || foundOther.username}) is pending KVIC Admin approval. Please log in as Admin to approve it under 'Assign Roles' first.`
                        };
                    }
                    if (foundOther.status === 'REJECTED') {
                        return {
                            success: false,
                            message: `Application for "${foundOther.name}" (${foundOther.phone || foundOther.username}) was rejected by KVIC Admin.`
                        };
                    }
                }
            } catch (e) {}

            return { success: false, message: 'Invalid Mobile Number, Unique ID or Password. Default password is 123.' };
        }
    };

    const quickLoginAs = (userId) => {
        const matched = ENTERPRISE_USERS.find(u => u.id === userId);
        if (matched) {
            setCurrentUser(matched);
            setIsAuthenticated(true);
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('honeychain2_user', JSON.stringify(matched));
                localStorage.setItem('honeychain2_is_auth', 'true');
            }
            return matched;
        } else {
            const res = login(userId, '123');
            if (res.success) return res.user;
        }
    };

    const logout = () => {
        setCurrentUser(null);
        setIsAuthenticated(false);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('honeychain2_is_auth', 'false');
            localStorage.removeItem('honeychain2_user');
        }
    };

    const roleInfo = {
        type: currentUser?.roleKey || 'PUBLIC',
        types: [currentUser?.roleKey || 'PUBLIC'],
        name: currentUser?.roleName || 'Enterprise User',
        shortName: currentUser?.roleKey || 'User',
        color: currentUser?.color || '#B45309'
    };

    return (
        <AuthContext.Provider
            value={{
                currentUser,
                isAuthenticated,
                roleInfo,
                currentRoleKey: currentUser?.roleKey || 'ADMIN',
                account: currentUser?.address || KVIC_ADMIN_ADDRESS,
                isEnterpriseUser: isAuthenticated,
                login,
                quickLoginAs,
                switchRole: (roleKey) => {
                    const found = ENTERPRISE_USERS.find(u => u.roleKey === roleKey || u.id === roleKey.toLowerCase());
                    if (found) quickLoginAs(found.id);
                },
                logout,
                connectWallet: () => {},
                detectRole: () => {}
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
