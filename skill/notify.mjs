// Sends one Web Push notification to every phone subscribed in the data repo, with nothing but
// Node's built-in crypto. The signing key lives in ~/.riffle/vapid.json, outside every repo.
//
//   node notify.mjs <data repo> --title "New deck" --body "Water: 9 cards" [--badge 12] [--tag new-deck] [--url ./#open=pack/deck]
//
// A tap on it opens `url` in the app, relative to where the app lives.
//
// Payload encryption is RFC 8291 (aes128gcm), and the signature is RFC 8292 (VAPID).
import { createECDH, createCipheriv, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const b64 = buf => Buffer.from(buf).toString('base64url');
const unb64 = text => Buffer.from(text, 'base64url');
const hkdf = (salt, ikm, info, len) => Buffer.from(hkdfSync('sha256', ikm, salt, info, len));

// Encrypts a payload for one subscription. The last argument is only for the published test vector.
export function encrypt(payload, p256dh, auth, fixed = null) {
  const uaPublic = unb64(p256dh);
  const secret = unb64(auth);
  const as = createECDH('prime256v1');
  if (fixed) as.setPrivateKey(unb64(fixed.asPrivate)); else as.generateKeys();
  const asPublic = as.getPublicKey();
  const salt = fixed ? unb64(fixed.salt) : randomBytes(16);
  const shared = as.computeSecret(uaPublic);
  const ikm = hkdf(secret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// The signature that says this push came from the holder of the key the phone subscribed with.
export function vapidHeader(endpoint, keys, subject = 'https://stippo47.github.io') {
  const header = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = createPrivateKey({ key: keys.privateJwk, format: 'jwk' });
  const sig = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64(sig)}, k=${keys.publicKey}`;
}

export async function pushOne(subscription, payload, keys) {
  const body = encrypt(payload, subscription.keys.p256dh, subscription.keys.auth);
  const r = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      Urgency: 'normal',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: vapidHeader(subscription.endpoint, keys),
    },
    body,
  });
  return r;
}

// The newest record per phone. A phone that has turned notifications off has `off` on its newest one.
export function subscriptions(dataRepo) {
  const dir = join(dataRepo, 'push');
  if (!existsSync(dir)) return [];
  const newest = new Map();
  for (const name of readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    try {
      const rec = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      if (rec.device) newest.set(rec.device, rec);
    } catch { /* not one of ours */ }
  }
  return [...newest.values()].filter(r => !r.off && r.subscription);
}

async function main() {
  const [dataRepo, ...rest] = process.argv.slice(2);
  const arg = name => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const keyFile = join(homedir(), '.riffle', 'vapid.json');
  if (!existsSync(keyFile)) { console.log(`No signing key at ${keyFile}, so nothing was sent. It only exists on the machine that made it.`); process.exit(1); }
  const keys = JSON.parse(readFileSync(keyFile, 'utf8'));
  const subs = subscriptions(dataRepo);
  if (!subs.length) { console.log('No phone has notifications turned on, so nothing was sent.'); return; }
  const payload = JSON.stringify({ title: arg('title') || 'Riffle', body: arg('body') || '', tag: arg('tag') || 'riffle', ...(arg('badge') !== undefined ? { badge: +arg('badge') } : {}), ...(arg('url') ? { url: arg('url') } : {}) });
  for (const rec of subs) {
    try {
      const r = await pushOne(rec.subscription, payload, keys);
      if (r.ok) console.log(`Sent to ${rec.device}.`);
      else if (r.status === 404 || r.status === 410) console.log(`${rec.device}'s subscription has ended (${r.status}). It needs turning on again in the app's settings.`);
      else console.log(`${rec.device}: the push service said ${r.status}: ${(await r.text()).slice(0, 200)}`);
    } catch (e) {
      console.log(`${rec.device}: couldn't reach the push service (${e.message}).`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
