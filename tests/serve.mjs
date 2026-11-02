// Local test server: the app on port 8787, and a small stand-in for GitHub on port 8788.
// The stand-in only knows made-up test values, listed in VALUES below.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.endsWith('\\') || path.endsWith('/')) path = join(path, 'index.html');
  try {
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(8787);

// ---------- the stand-in for GitHub

const VALUES = {
  'test-good': {},
  'test-wrong-repo': { noRepo: true },
  'test-read-only': { readOnly: true },
  'test-all-repos': { others: ['some-other-private-repo', 'another-private-repo'] },
};
const REPO = '/repos/Stippo47/riffle-data';
const files = new Map([
  ['packs/test-pack/pack.json', JSON.stringify({ title: 'Test pack', color: '#2f8fe0', icon: 'card-random', topics: [{ id: 't1', title: 'Topic one', order: 1 }] })],
  ['packs/test-pack/decks/d1.json', JSON.stringify({ topic: 't1', title: 'Pulled deck', cards: [{ id: 'c1', kind: 'question', title: 'Pulled', text: 'Did this come from the stand-in?', pick: 'Yes.' }] })],
]);
const shaOf = path => `sha-${Buffer.from(path + files.get(path)).toString('base64url').slice(-24)}`;
let down = false;
let writes = 0;

createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  };
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json', ...headers });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const url = new URL(req.url, 'http://x');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();

  // Controls for the tests: no key needed, and they never see a key.
  if (url.pathname === '/__files') { send(200, [...files.keys()]); return; }
  if (url.pathname === '/__file') { send(200, files.get(url.searchParams.get('path')) ?? 'null'); return; }
  if (url.pathname === '/__writes') { send(200, { writes }); return; }
  if (url.pathname === '/__down') { down = url.searchParams.get('on') === '1'; send(200, { down }); return; }
  if (down) { req.socket.destroy(); return; }

  const who = VALUES[(req.headers.authorization || '').replace('Bearer ', '')];
  if (!who) { send(401, { message: 'Bad credentials' }); return; }
  if (who.noRepo && url.pathname.startsWith(REPO)) { send(404, { message: 'Not Found' }); return; }

  if (url.pathname === REPO) { send(200, { full_name: 'Stippo47/riffle-data', private: true }); return; }
  if (url.pathname === '/user/repos') {
    const list = [{ name: 'riffle-data', full_name: 'Stippo47/riffle-data', private: true }, { name: 'riffle', full_name: 'Stippo47/riffle', private: false }];
    for (const n of who.others || []) list.push({ name: n, full_name: `Stippo47/${n}`, private: true });
    send(200, list);
    return;
  }
  if (url.pathname.startsWith(`${REPO}/contents/`) && req.method === 'PUT') {
    if (who.readOnly) { send(403, { message: 'Resource not accessible by personal access token' }); return; }
    const path = decodeURIComponent(url.pathname.slice(`${REPO}/contents/`.length));
    const { content } = JSON.parse(body);
    files.set(path, Buffer.from(content, 'base64').toString());
    writes++;
    send(201, { content: { path } });
    return;
  }
  if (url.pathname === `${REPO}/git/trees/main`) {
    send(200, { tree: [...files.keys()].map(path => ({ path, type: 'blob', sha: shaOf(path) })) });
    return;
  }
  if (url.pathname.startsWith(`${REPO}/git/blobs/`)) {
    const sha = url.pathname.split('/').pop();
    const path = [...files.keys()].find(p => shaOf(p) === sha);
    if (!path) { send(404, { message: 'Not Found' }); return; }
    send(200, files.get(path), { 'Content-Type': 'application/vnd.github.raw+json' });
    return;
  }
  send(404, { message: 'Not Found' });
}).listen(8788);

console.log('app http://localhost:8787  stand-in http://localhost:8788');
