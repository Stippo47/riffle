// Checks the push sending without a phone: the published RFC 8291 test vector, then a full send to a
// local stand-in for a push service, which decrypts the message and checks the signature.
// Run: node tests/push.mjs
import { createDecipheriv, createECDH, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { encrypt, pushOne, vapidHeader } from '../skill/notify.mjs';

let failed = 0;
const ok = (cond, what, extra = '') => {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${what} ${cond ? '' : extra}`);
  if (!cond) failed++;
};
const unb64 = t => Buffer.from(t, 'base64url');
const hkdf = (salt, ikm, info, len) => Buffer.from(hkdfSync('sha256', ikm, salt, info, len));

// RFC 8291, appendix A
const got = encrypt('When I grow up, I want to be a watermelon',
  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  'BTBZMqHH6r4Tts7J_aSIgg',
  { asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', salt: 'DGv6ra1nlYgDCS1FRnbzlw' });
const want = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
ok(got.toString('base64url') === want, 'encryption matches the RFC 8291 test vector', got.toString('base64url'));

// A made-up phone and signing key, used only here.
const phone = createECDH('prime256v1');
phone.generateKeys();
const auth = randomBytes(16);
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const keys = { privateJwk: jwk, publicKey: Buffer.concat([Buffer.from([4]), unb64(jwk.x), unb64(jwk.y)]).toString('base64url') };

let seen = null;
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  seen = { headers: req.headers, body: Buffer.concat(chunks) };
  res.writeHead(201);
  res.end();
});
await new Promise(r => server.listen(8799, r));
const endpoint = 'http://localhost:8799/push/abc';
const payload = JSON.stringify({ title: 'New deck', body: 'Water: 9 cards', badge: 12 });
const r = await pushOne({ endpoint, keys: { p256dh: phone.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } }, payload, keys);
server.close();
ok(r.status === 201, 'the push service accepts it');
ok(seen.headers['content-encoding'] === 'aes128gcm' && seen.headers.ttl === '86400', 'with the headers push services require');

// Decrypt it as the phone would.
const b = seen.body;
const salt = b.subarray(0, 16);
const idlen = b[20];
const asPublic = b.subarray(21, 21 + idlen);
const ct = b.subarray(21 + idlen);
const shared = phone.computeSecret(asPublic);
const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from('WebPush: info\0'), phone.getPublicKey(), asPublic]), 32);
const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
const d = createDecipheriv('aes-128-gcm', cek, nonce);
d.setAuthTag(ct.subarray(ct.length - 16));
const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
ok(plain[plain.length - 1] === 2 && plain.subarray(0, plain.length - 1).toString() === payload, 'the phone can decrypt it');

// Check the signature as a push service would.
const m = seen.headers.authorization.match(/^vapid t=([^,]+), k=(.+)$/);
ok(!!m, 'it carries a VAPID signature');
const [h, c, s] = m[1].split('.');
const pub = unb64(m[2]);
const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
ok(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, unb64(s)), 'the signature checks out against the public key');
const claims = JSON.parse(unb64(c).toString());
ok(claims.aud === 'http://localhost:8799' && claims.exp > Date.now() / 1000 && claims.exp < Date.now() / 1000 + 24 * 3600 && claims.sub.startsWith('https://'), 'with the claims push services require', JSON.stringify(claims));
ok(vapidHeader('https://web.push.apple.com/x', keys).includes(keys.publicKey), "Apple's endpoint gets the same form of header");

console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
