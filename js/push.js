// Notifications, from the Home Screen icon on recent iPhones. Asked for only from a tap in settings.
// The phone writes its subscription to the data repo, and the writer's machine signs and sends.
import * as store from './store.js';
import * as sync from './sync.js';

// The public half of the signing key. The private half stays on the writer's machine.
const VAPID_PUBLIC = 'BFb0mnkn8Yy1TvSlqH4plVgWtnKo2_n_C2w0agCqPtDJJhpD7XUKWZFSJ-p_dREpFd6e9GfibcMDaiX-lVXL0As';

const bytes = b64 => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};

export const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isOn = async () => !!(await store.get('notify-on').catch(() => false));

export async function turnOn() {
  const key = await sync.connected();
  if (!key) return { ok: false, message: 'Connect first, from this page. The subscription goes in your data repo.' };
  const answer = await Notification.requestPermission();
  if (answer !== 'granted') return { ok: false, message: answer === 'denied' ? "iOS says no. Turn notifications on for Riffle in the phone's Settings, then try again." : "You didn't allow them, so nothing changed." };
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(VAPID_PUBLIC) });
  const r = await sync.writeRecord('push', { subscription: sub.toJSON() }, 'Phone turned notifications on');
  if (!r.ok) return { ok: false, message: `They're allowed, but the subscription didn't reach your repo: ${r.message}` };
  await store.set('notify-on', true);
  await store.set('notify-endpoint', sub.endpoint);
  return { ok: true, message: "On. You'll get one when a new deck is ready." };
}

export async function turnOff() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
  } catch { /* the record below still says it's off */ }
  await store.set('notify-on', false);
  if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  const r = await sync.writeRecord('push', { off: true }, 'Phone turned notifications off');
  return { ok: true, message: r.ok ? 'Off.' : `Off on this phone. The note to your repo didn't go: ${r.message}` };
}

// A phone can change its subscription by itself, so each start checks it's the one on file.
export async function refresh() {
  if (!supported() || Notification.permission !== 'granted' || !(await isOn())) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(VAPID_PUBLIC) }));
  if (sub.endpoint === (await store.get('notify-endpoint'))) return;
  const r = await sync.writeRecord('push', { subscription: sub.toJSON() }, 'Phone renewed its notifications');
  if (r.ok) await store.set('notify-endpoint', sub.endpoint);
}

// The number on the icon: cards owed.
export async function setBadge(count) {
  if (!navigator.setAppBadge || !(await isOn())) return;
  (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
}
