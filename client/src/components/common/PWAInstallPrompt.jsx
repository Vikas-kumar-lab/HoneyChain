import React, { useState, useEffect } from 'react';
import { FiDownload, FiWifiOff, FiWifi, FiX, FiSmartphone, FiShare } from 'react-icons/fi';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showReconnectedAlert, setShowReconnectedAlert] = useState(false);

  useEffect(() => {
    // 1. Check if already installed as standalone PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone ||
      document.referrer.includes('android-app://');

    if (isStandalone) {
      setShowInstallBanner(false);
      return;
    }

    // 2. Detect iOS Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
    const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);

    if (isAppleDevice && isSafari && !isStandalone) {
      setIsIOS(true);
      // Check if dismissed before in this session
      const dismissed = sessionStorage.getItem('honeychain_pwa_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    }

    // 3. Android / Chrome / Edge beforeinstallprompt listener
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = sessionStorage.getItem('honeychain_pwa_dismissed');
      if (!dismissed) {
        setShowInstallBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 4. Online / Offline Network Monitoring
    const handleOnline = () => {
      setIsOffline(false);
      setShowReconnectedAlert(true);
      const timer = setTimeout(() => setShowReconnectedAlert(false), 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setShowReconnectedAlert(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    setShowIOSInstructions(false);
    sessionStorage.setItem('honeychain_pwa_dismissed', 'true');
  };

  return (
    <>
      {/* Offline Status Alert */}
      {isOffline && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: '#d97706',
            color: '#ffffff',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            zIndex: 99999,
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          }}
        >
          <FiWifiOff size={16} />
          <span>Offline Mode Active • Browsing cached data & offline certificates</span>
        </div>
      )}

      {/* Online Reconnected Alert */}
      {showReconnectedAlert && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: '#059669',
            color: '#ffffff',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            zIndex: 99999,
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            animation: 'fadeIn 0.3s ease-in',
          }}
        >
          <FiWifi size={16} />
          <span>Back Online • Live Blockchain Sync Restored</span>
        </div>
      )}

      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div
          className="pwa-install-banner"
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: '460px',
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            borderRadius: '16px',
            padding: '14px 18px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            zIndex: 9998,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                  flexShrink: 0,
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)',
                }}
              >
                🍯
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#fbbf24', letterSpacing: '0.3px' }}>
                  Install HoneyChain App
                </div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.3, marginTop: '2px' }}>
                  Fast mobile access, works offline & fullscreen
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={handleInstallClick}
                style={{
                  backgroundColor: '#f59e0b',
                  color: '#1e1b4b',
                  border: 'none',
                  padding: '7px 14px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'background-color 0.2s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#fbbf24')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#f59e0b')}
              >
                <FiDownload size={14} />
                <span>Install</span>
              </button>
              <button
                onClick={handleDismiss}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                }}
                title="Dismiss"
              >
                <FiX size={18} />
              </button>
            </div>
          </div>

          {/* iOS Safari Specific Instructions Popover */}
          {showIOSInstructions && (
            <div
              style={{
                marginTop: '12px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: 1.4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#fbbf24', marginBottom: '4px' }}>
                <FiSmartphone size={14} />
                <span>How to Install on iPhone / iPad:</span>
              </div>
              <ol style={{ margin: 0, paddingLeft: '18px' }}>
                <li>
                  Tap the <FiShare size={12} style={{ display: 'inline', margin: '0 2px' }} /> <strong>Share</strong> button at bottom of Safari.
                </li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
              </ol>
            </div>
          )}
        </div>
      )}
    </>
  );
}
