// Local test server: the app on port 8787, and a small stand-in for GitHub on port 8788.
// The stand-in only knows made-up test values, listed in VALUES below.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let swBump = 0;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.endsWith('\\') || path.endsWith('/')) path = join(path, 'index.html');
  try {
    let data = await readFile(join(ROOT, path));
    if (path.endsWith('sw.js') && swBump) data = Buffer.concat([data, Buffer.from(`\n// bump ${swBump}\n`)]); // stands in for a new release
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
  'test-all-repos': { others: ['some-other-private-repo', 'another-private-repo'], open: true },
  'test-listed-only': { others: ['listed-but-closed'], open: false }, // lists a repo it can't really open
};
const REPO = '/repos/Stippo47/riffle-data';
const startFiles = [
  ['packs/test-pack/pack.json', JSON.stringify({ title: 'Test pack', color: '#2f8fe0', icon: 'card-random', topics: [{ id: 't1', title: 'Topic one', order: 1 }] })],
  ['packs/test-pack/decks/d1.json', JSON.stringify({
    topic: 't1', title: 'Pulled deck', cards: [
      { id: 'c1', kind: 'question', title: 'First', text: 'Did this come from the stand-in?', pick: 'Yes.' },
      { id: 'c2', kind: 'question', title: 'Second', text: 'A second card, for a comment.', pick: 'Yes.' },
      { id: 'c3', kind: 'report', title: 'Third', text: 'A third card.' },
      { id: 'c4', kind: 'report', title: 'Fourth', text: 'A fourth card.' },
      { id: 'c5', kind: 'report', title: 'Fifth', text: 'A fifth card, with a picture on its back.', images: ['img/dot.png'] },
    ],
  })],
  // A two-pixel picture, to prove pictures come down and show.
  ['packs/test-pack/img/dot.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGM8YWPDwMAAAAbaAUIi0kNIAAAAAElFTkSuQmCC', 'base64')],
  ['packs/test-pack/decks/h1.json', JSON.stringify({
    topic: 't1', title: 'Handled deck', cards: [
      { id: 'h0', kind: 'question', title: 'Owed', text: 'A card still owed.', pick: 'Yes.' },
      { id: 'h1', kind: 'question', title: 'Handled one', text: 'What should the door do?', handled: { how: 'It stays shut, because of what came up in another deck.', at: '2026-01-01T00:00:00.000Z' } },
      { id: 'h2', kind: 'question', rarity: 'epic', title: 'Handled epic', text: 'A big one I settled.', handled: { how: 'Settled this way, for good.', at: '2026-01-01T00:00:00.000Z' } },
    ],
  })],
  ['packs/test-pack/decks/o1.json', JSON.stringify({
    topic: 't1', title: 'Options deck', cards: [
      { id: 'o0', kind: 'options', title: 'With a pick', text: 'Which of these?', pick: 'b', options: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }, { id: 'c', label: 'Third' }] },
      { id: 'o1', kind: 'options', title: 'Tapped', text: 'Which of these again?', pick: 'a', options: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }, { id: 'c', label: 'Third' }] },
      { id: 'o2', kind: 'options', title: 'Left', text: 'And these?', options: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }] },
      { id: 'o3', kind: 'options', title: 'No pick', text: 'No pick marked here.', options: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }] },
    ],
  })],
  ['packs/test-pack/decks/p1.json', JSON.stringify({
    topic: 't1', title: 'Photo deck', cards: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => ({ id, kind: 'question', title: id.toUpperCase(), text: `Card ${id}.`, pick: 'Yes.' })),
  })],
  ['packs/test-pack/decks/s1.json', JSON.stringify({
    topic: 't1', title: 'Start over deck', cards: [
      { id: 's0', kind: 'question', title: 'One', text: 'First card.', pick: 'Yes.' },
      { id: 's1', kind: 'question', title: 'Two', text: 'Second card.', pick: 'Yes.' },
      { id: 's2', kind: 'question', title: 'Three', text: 'Third card.', pick: 'Yes.' },
    ],
  })],
];
const files = new Map(startFiles);
const shaOf = path => createHash('sha1').update(path + files.get(path)).digest('hex');
let down = false;
let fail = null;
let failImg = 0;
let slowImg = 0;
let writes = 0;

createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  };
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json', ...headers });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
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
  if (url.pathname === '/__failimg') { failImg = +url.searchParams.get('code'); send(200, { failImg }); return; }
  if (url.pathname === '/__slowimg') { slowImg = +url.searchParams.get('ms'); send(200, { slowImg }); return; }
  if (url.pathname === '/__fail') { // makes every write refused with this status and message
    const code = +url.searchParams.get('code');
    fail = code ? { code, message: url.searchParams.get('message') || 'Refused' } : null;
    send(200, { fail });
    return;
  }
  if (url.pathname === '/__reset') { // back to how it started
    files.clear();
    for (const [k, v] of startFiles) files.set(k, v);
    down = false; fail = null; writes = 0; failImg = 0; slowImg = 0;
    send(200, { files: files.size });
    return;
  }
  if (url.pathname === '/__put') { // adds or changes one file
    files.set(url.searchParams.get('path'), url.searchParams.get('bin') ? Buffer.concat(chunks) : body);
    send(200, { files: files.size });
    return;
  }
  if (url.pathname === '/__swbump') {
    swBump++;
    send(200, { swBump });
    return;
  }
  if (url.pathname === '/__seed') { // replaces the decks, to make pictures with
    const seed = JSON.parse(body);
    for (const k of [...files.keys()]) if (k.startsWith('packs/')) files.delete(k);
    for (const [k, v] of Object.entries(seed)) files.set(k, v);
    send(200, { files: files.size });
    return;
  }
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
  const other = url.pathname.match(/^\/repos\/Stippo47\/([^/]+)$/);
  if (other) {
    if ((who.others || []).includes(other[1]) && who.open) send(200, { full_name: `Stippo47/${other[1]}`, private: true });
    else send(404, { message: 'Not Found' });
    return;
  }
  if (url.pathname.startsWith(`${REPO}/contents/`) && req.method === 'PUT') {
    if (who.readOnly) { send(403, { message: 'Resource not accessible by personal access token' }); return; }
    if (fail) { send(fail.code, { message: fail.message }); return; }
    const path = decodeURIComponent(url.pathname.slice(`${REPO}/contents/`.length));
    const { content } = JSON.parse(body);
    if (files.has(path)) { send(422, { message: '"sha" wasn\'t supplied.' }); return; } // as GitHub does
    if (path.startsWith('answers/img/')) {
      if (slowImg) await new Promise(r => setTimeout(r, slowImg));
      if (failImg) { send(failImg, { message: 'Refused the picture' }); return; }
      files.set(path, Buffer.from(content, 'base64'));
      writes++;
      send(201, { content: { path } });
      return;
    }
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
