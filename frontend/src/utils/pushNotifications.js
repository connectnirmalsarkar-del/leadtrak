import axios from 'axios';
import { API } from '@/context/AuthContext';

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getCurrentPushSubscription() {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Request permission, subscribe via PushManager, persist on the backend. */
export async function enablePushNotifications() {
  if (!isPushSupported()) {
    throw new Error('Your browser does not support push notifications. On iOS, add Leadtrak to your Home Screen first.');
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('Push notifications are not configured yet — please contact support.');
  }
  // Ask for permission
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error('Notification permission was denied. Enable it from your browser settings to receive alerts.');
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const json = sub.toJSON();
  await axios.post(`${API}/push/subscribe`, {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    expirationTime: json.expirationTime || null,
    user_agent: navigator.userAgent,
  });
  return sub;
}

export async function disablePushNotifications() {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch (e) { /* ignore */ }
  try { await axios.post(`${API}/push/unsubscribe`, { endpoint }); } catch (e) { /* ignore */ }
}

export async function sendTestPush() {
  await axios.post(`${API}/push/test`);
}
