import React, { useState, useEffect, useRef } from 'react';
import { FiGlobe, FiChevronDown, FiCheck } from 'react-icons/fi';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', flag: '🇮🇳' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', flag: '🇮🇳' },
  { code: 'mr', label: 'Marathi', native: 'मराठी', flag: '🇮🇳' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'ur', label: 'Urdu', native: 'اردو', flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', flag: '🇮🇳' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', flag: '🇮🇳' }
];

const STORAGE_KEY = 'honeychain_selected_lang';

const getInitialLanguage = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.some(l => l.code === saved)) return saved;

    const cookieMatch = document.cookie.match(/(?:^|;\s*)googtrans=([^;]*)/);
    if (cookieMatch && cookieMatch[1]) {
      const parts = cookieMatch[1].split('/');
      const code = parts[parts.length - 1];
      if (code && SUPPORTED_LANGUAGES.some(l => l.code === code)) return code;
    }
  } catch (e) {}
  return 'en';
};

function LanguageSelector() {
  const [selectedLang, setSelectedLang] = useState(getInitialLanguage);
  const [isOpen, setIsOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ right: 0, left: 'auto' });
  const dropdownRef = useRef(null);
  const btnRef = useRef(null);

  // Recalculate dropdown position whenever it opens
  useEffect(() => {
    if (!isOpen || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropW = 200;
    const vw = window.innerWidth;
    const margin = 8;

    // Default: align right edge of dropdown to right edge of button
    let rightPos = vw - rect.right;
    // If that would push left edge off screen, left-anchor instead
    if (rect.right - dropW < margin) {
      setDropPos({ left: Math.max(margin, rect.left), right: 'auto' });
    } else {
      setDropPos({ right: Math.max(margin, rightPos), left: 'auto' });
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const purgeGoogleBanner = () => {
    try {
      if (document.body && document.body.style.top && document.body.style.top !== '0px') {
        document.body.style.top = '0px';
      }
      if (document.documentElement && document.documentElement.style.top && document.documentElement.style.top !== '0px') {
        document.documentElement.style.top = '0px';
      }
      const bannerElements = document.querySelectorAll(
        '.goog-te-banner-frame, iframe.skiptranslate, iframe[id^=":"], .VIpgJd-ZVi9C-OR9Qfe, .VIpgJd-ZVi9C-bvh2rc'
      );
      bannerElements.forEach(el => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('height', '0px', 'important');
        el.style.setProperty('width', '0px', 'important');
      });
    } catch (e) {}
  };

  useEffect(() => {
    purgeGoogleBanner();
    const timer = setInterval(purgeGoogleBanner, 250);
    return () => clearInterval(timer);
  }, [selectedLang]);

  const handleLanguageSelect = (langCode) => {
    setSelectedLang(langCode);
    setIsOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, langCode);

      // Set Google Translate cookie
      const cookieValue = `/en/${langCode}`;
      document.cookie = `googtrans=${cookieValue}; path=/;`;
      if (window.location.hostname) {
        document.cookie = `googtrans=${cookieValue}; domain=${window.location.hostname}; path=/;`;
      }

      // If Google Translate combo box is in DOM, trigger change event
      const combo = document.querySelector('.goog-te-combo');
      if (combo) {
        combo.value = langCode;
        combo.dispatchEvent(new Event('change'));
        setTimeout(purgeGoogleBanner, 50);
        setTimeout(purgeGoogleBanner, 200);
        setTimeout(purgeGoogleBanner, 500);
      } else {
        // Reload to let Google Translate initialize with the new cookie
        window.location.reload();
      }
    } catch (err) {
      console.warn('Language switch notice:', err);
    }
  };

  const currentLangObj = SUPPORTED_LANGUAGES.find(l => l.code === selectedLang) || SUPPORTED_LANGUAGES[0];

  return (
    <div 
      className="notranslate" 
      ref={dropdownRef} 
      style={{ position: 'relative', display: 'inline-block' }}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 10px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '7px',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: 'var(--ink-800)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
        title="Select Language / भाषा चुनें"
      >
        <FiGlobe size={14} style={{ color: 'var(--primary-honey)' }} />
        <span style={{ fontSize: '0.8rem' }}>{currentLangObj.flag}</span>
        <span style={{ fontWeight: 700 }}>{currentLangObj.native}</span>
        <FiChevronDown size={12} style={{ color: 'var(--ink-400)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: btnRef.current
              ? btnRef.current.getBoundingClientRect().bottom + 6
              : 'auto',
            left: dropPos.left,
            right: dropPos.right,
            width: '200px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            boxShadow: '0 12px 32px -4px rgba(0,0,0,0.14), 0 4px 12px -2px rgba(0,0,0,0.08)',
            zIndex: 99999,
            padding: '6px 0',
            maxHeight: '70vh',
            overflowY: 'auto'
          }}
        >
          <div style={{ padding: '4px 12px 6px', borderBottom: '1px solid #F1F5F9', fontSize: '0.68rem', fontWeight: 700, color: 'var(--ink-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Select Language / भाषा
          </div>
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isCurrent = lang.code === selectedLang;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleLanguageSelect(lang.code)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isCurrent ? '#FEF3C7' : 'transparent',
                  color: isCurrent ? 'var(--primary-honey-hover)' : 'var(--ink-800)',
                  fontSize: '0.78rem',
                  fontWeight: isCurrent ? 700 : 500,
                  cursor: 'pointer',
                  border: 'none',
                  transition: 'background 0.12s'
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = '#F8FAFC'; }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{lang.flag}</span>
                  <div>
                    <span style={{ display: 'block', lineHeight: 1.2 }}>{lang.native}</span>
                    <span style={{ fontSize: '0.66rem', color: 'var(--ink-400)', display: 'block' }}>{lang.label}</span>
                  </div>
                </div>
                {isCurrent && <FiCheck size={14} color="var(--primary-honey)" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LanguageSelector;
