import { useEffect, useRef } from 'react';
import axios from 'axios';
import { API } from '@/context/AuthContext';

/**
 * usePWABadge — keep the PWA home-screen icon badge in sync with the user's
 * unread count (new leads + unread notifications). Uses the Badging API
 * (`navigator.setAppBadge` / `clearAppBadge`).
 *
 * Platform behavior:
 *   • Android Chrome (PWA) + Desktop Chrome/Edge: full numeric badge
 *   • iOS PWA: silently no-op (Safari doesn't expose the API yet)
 *   • Firefox: silently no-op
 *
 * Polls /api/badge/count every `intervalMs` (default 30s). Also runs
 * immediately on mount and whenever the tab becomes visible again.
 */
export function usePWABadge(intervalMs = 30000, enabled = true) {
  const lastCountRef = useRef(-1);

  useEffect(() => {
    if (!enabled) return undefined;
    // Feature-detect — bail silently if the browser doesn't support it
    const supported = typeof navigator !== 'undefined' && typeof navigator.setAppBadge === 'function';
    if (!supported) return undefined;

    let cancelled = false;
    let timer = null;

    const apply = (count) => {
      if (cancelled) return;
      if (count === lastCountRef.current) return;
      lastCountRef.current = count;
      try {
        if (count > 0) {
          navigator.setAppBadge(count).catch(() => {});
        } else {
          navigator.clearAppBadge?.().catch(() => {});
        }
      } catch (_) {
        /* ignore — best-effort */
      }
    };

    const fetchCount = async () => {
      try {
        const { data } = await axios.get(`${API}/badge/count`);
        apply(Number(data?.count) || 0);
      } catch (_) {
        // not signed-in / network error — clear the badge so it doesn't get stuck
        apply(0);
      }
    };

    const start = () => {
      fetchCount();
      timer = setInterval(fetchCount, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    start();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Refresh immediately when the user comes back
        fetchCount();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, intervalMs]);
}
