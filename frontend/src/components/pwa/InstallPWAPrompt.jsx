import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { Download, X, Smartphone, Share, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'leadtrak_pwa_dismissed_v2';
const DISMISS_DAYS = 30;

// Detect TRUE iOS Safari only (not Mac desktop with touch support)
const isIos = () => {
  const ua = window.navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return true;
  // iPadOS 13+ reports as Macintosh — disambiguate by maxTouchPoints
  if (ua.includes('macintosh') && navigator.maxTouchPoints > 1) return true;
  return false;
};

const isInStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isDismissedRecently = () => {
  try {
    const ts = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    if (!ts || Number.isNaN(ts)) return false;
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch (e) {
    return false;
  }
};

export default function InstallPWAPrompt() {
  const { user } = useAuth();
  const [installEvent, setInstallEvent] = useState(null);
  const [show, setShow] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  // Swap the manifest <link> to point at the tenant-aware backend endpoint once logged in.
  useEffect(() => {
    if (!user) return;
    const apiBase = process.env.REACT_APP_BACKEND_URL;
    const link = document.querySelector('link[rel="manifest"]');
    if (link && apiBase) {
      link.setAttribute('href', `${apiBase}/api/pwa/manifest`);
      link.setAttribute('crossorigin', 'use-credentials');
    }
    axios.get(`${API}/organization/settings`).then(({ data }) => {
      const branding = data?.branding || {};
      const color = branding.primary_color || '#7C3AED';
      let themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) themeMeta.setAttribute('content', color);
    }).catch(() => {});
  }, [user]);

  // Listen for the beforeinstallprompt event (Chromium / Edge / Samsung Internet)
  useEffect(() => {
    if (isInStandalone()) return; // Already installed
    if (isDismissedRecently()) return; // User said no within 30 days

    const handler = (e) => {
      e.preventDefault();
      setInstallEvent(e);
      if (!isDismissedRecently()) setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS Safari only — show manual instructions card
    if (isIos() && user) {
      setIosMode(true);
      setShow(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [user]);

  const handleInstall = async () => {
    if (!installEvent) return;
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') {
        // User accepted — hide and don't ask again for 30 days
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      }
    } catch (e) {
      // user closed the system prompt — still hide our card
    } finally {
      setShow(false);
      setInstallEvent(null);
    }
  };

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* ignore */ }
    setShow(false);
    setInstallEvent(null);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 z-[200]" data-testid="pwa-install-prompt">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/50 p-4 flex items-start gap-3 relative">
        <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <p className="font-bold text-sm text-slate-900" style={{ fontFamily: 'Sora' }}>Install Leadtrak</p>
          {iosMode ? (
            <>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                On iPhone/iPad Safari, tap the <Share className="inline w-3.5 h-3.5 mx-0.5 -mt-0.5" /><strong>Share</strong> button below, then <strong>"Add to Home Screen"</strong> <Plus className="inline w-3.5 h-3.5 -mt-0.5" />.
              </p>
              <button onClick={dismiss} className="text-xs text-violet-700 hover:text-violet-900 font-semibold mt-2" data-testid="pwa-ios-got-it">
                Got it
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Add to your home screen for a faster, app-like experience. No download from App Store needed.</p>
              <div className="flex items-center gap-2 mt-2.5">
                <Button size="sm" onClick={handleInstall} className="bg-violet-700 hover:bg-violet-800 text-white h-8 px-3 text-xs" data-testid="pwa-install-btn">
                  <Download className="w-3.5 h-3.5 mr-1" /> Install
                </Button>
                <button onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-700 font-medium" data-testid="pwa-dismiss-btn">
                  Maybe later
                </button>
              </div>
            </>
          )}
        </div>
        <button
          onClick={dismiss}
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-md transition-colors"
          aria-label="Close install prompt"
          data-testid="pwa-close-btn"
          type="button"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
