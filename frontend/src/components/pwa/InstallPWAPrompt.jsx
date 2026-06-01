import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API, useAuth } from '@/context/AuthContext';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'leadtrak_pwa_dismissed_v1';
const DISMISS_DAYS = 7;

export default function InstallPWAPrompt() {
  const { user } = useAuth();
  const [installEvent, setInstallEvent] = useState(null);
  const [show, setShow] = useState(false);
  const [orgName, setOrgName] = useState('your CRM');

  // Swap the manifest <link> to point at the tenant-aware backend endpoint once logged in.
  useEffect(() => {
    if (!user) return;
    const apiBase = process.env.REACT_APP_BACKEND_URL;
    const link = document.querySelector('link[rel="manifest"]');
    if (link && apiBase) {
      link.setAttribute('href', `${apiBase}/api/pwa/manifest`);
      link.setAttribute('crossorigin', 'use-credentials');
    }
    // Update theme-color from /auth/me terminology
    axios.get(`${API}/organization/settings`).then(({ data }) => {
      const branding = data?.branding || {};
      const color = branding.primary_color || '#7C3AED';
      let themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) themeMeta.setAttribute('content', color);
      if (data?.name) setOrgName(data.name);
    }).catch(() => {});
  }, [user]);

  // Listen for the beforeinstallprompt event (Chromium / Edge / Samsung Internet)
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallEvent(e);
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const ts = parseInt(dismissed, 10);
        if (!isNaN(ts) && Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
      }
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setShow(false);
      setInstallEvent(null);
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 z-[200]" data-testid="pwa-install-prompt">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/50 p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-700 flex items-center justify-center flex-shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-slate-900" style={{ fontFamily: 'Sora' }}>Install {orgName}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">Add to your home screen for a faster, app-like experience. No download from App Store needed.</p>
          <div className="flex items-center gap-2 mt-2.5">
            <Button size="sm" onClick={handleInstall} className="bg-violet-700 hover:bg-violet-800 text-white h-8 px-3 text-xs" data-testid="pwa-install-btn">
              <Download className="w-3.5 h-3.5 mr-1" /> Install
            </Button>
            <button onClick={dismiss} className="text-xs text-slate-500 hover:text-slate-700 font-medium" data-testid="pwa-dismiss-btn">
              Maybe later
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="text-slate-300 hover:text-slate-500" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
