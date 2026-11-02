// Drives the app in headless Edge with real touch input, against tests/serve.mjs and its stand-in for GitHub.
// Run the server, then: node tests/e2e.mjs [folder for screenshots]
// Runs at device scale 1: at scale 2 a screenshot re-sends a held touch at half its coordinates.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333, W = 390, H = 844, SAT = 59, SAB = 34;
const APP = `http://localhost:8787/?api=http://localhost:8788&insets=${SAT},${SAB}`;
const API = 'http://localhost:8788';
const SHOTS = process.argv[2] || join(tmpdir(), 'riffle-shots');
mkdirSync(SHOTS, { recursive: true });
const LAYOUTS = ['rows', 'one', 'story', 'under'];
const LOOKS = ['plain', 'paper', 'table', 'foil', 'inventory'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const ok = (cond, what, extra = '') => {
  if (cond) { passed++; console.log(`  ok   ${what}`); }
  else { failed++; console.log(`  FAIL ${what} ${extra}`); }
};

// Closes a test browser left over from a run that stopped early.
async function closeLeftover() {
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    const old = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise(r => { old.onopen = r; });
    old.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(800);
  } catch { /* nothing there */ }
}
await closeLeftover();
process.on('uncaughtException', e => { console.log(e); closeLeftover().finally(() => process.exit(1)); });

const profile = mkdtempSync(join(tmpdir(), 'riffle-edge-'));
spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], { stdio: 'ignore', detached: true }).unref();

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(300);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* not up yet */ }
}
if (!target) { console.log('Edge did not start'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let nextId = 1;
const waiting = new Map();
const errors = [];
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) {
    const { res, rej } = waiting.get(d.id);
    waiting.delete(d.id);
    if (d.error) rej(new Error(d.error.message)); else res(d.result);
  }
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value || a.description).join(' '));
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = nextId++;
  waiting.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expression}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
};
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, captureBeyondViewport: false });
  writeFileSync(join(SHOTS, `${name}.jpg`), Buffer.from(r.data, 'base64'));
};
const go = async url => { await send('Page.navigate', { url }); await sleep(700); };
const text = () => ev('document.getElementById("app").innerText');

const rect = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right}})()`);
const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const tapAt = async (x, y) => { await touch('touchStart', [[x, y]]); await sleep(40); await touch('touchEnd', []); await sleep(120); };
const tap = async sel => {
  const r = await rect(sel);
  if (!r || !r.w) throw new Error(`nothing to tap: ${sel}`);
  await tapAt(r.x, r.y);
};
const dragFrom = async (x, y, dx, dy, { ms = 180, steps = 8, hold = 0, before = null, end = true } = {}) => {
  await touch('touchStart', [[x, y]]);
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    await touch('touchMove', [[x + (dx * i) / steps, y + (dy * i) / steps]]);
  }
  if (hold) await sleep(hold);
  if (before) await before();
  if (end) { await touch('touchEnd', []); await sleep(140); }
};
const drag = async (dx, dy, opts) => {
  const c = await rect('#table');
  await dragFrom(c.x, c.top + c.h * 0.55, dx, dy, opts);
};
const pinch = async () => {
  const c = await rect('#table');
  const y = c.top + c.h * 0.55;
  await touch('touchStart', [[c.x, y - 120]]);
  await sleep(30);
  await touch('touchStart', [[c.x, y - 120], [c.x, y + 120]]);
  for (let i = 1; i <= 8; i++) {
    await sleep(25);
    await touch('touchMove', [[c.x, y - 120 + i * 13], [c.x, y + 120 - i * 13]]);
  }
  await touch('touchEnd', []);
  await sleep(200);
};
const deck = () => ev(`(()=>{const c=__riffle.current;return c?{top:c.topId(),order:c.s.order,answers:c.s.answers,drafts:c.s.drafts,composing:c.composing,flipped:c.flipped,notes:c.s.notes,log:c.s.log.length,ended:c.root.classList.contains('ended'),overview:!c.overview.hidden,notesOpen:!c.notesSheet.hidden,verdict:c.s.verdict}:null})()`);
const queue = () => ev('__riffle.store.queueAll().then(q=>q.map(i=>i.event))');
const typeText = t => send('Input.insertText', { text: t });
const api = p => fetch(API + p).then(r => r.json());
const openDeckRow = title => ev(`(()=>{const b=[...document.querySelectorAll('.deckrow')].find(x=>x.innerText.includes(${JSON.stringify(title)}));const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`).then(p => tapAt(p.x, p.y)).then(() => sleep(300));
const throwCard = dir => drag(...{ right: [190, 4], left: [-190, 4], down: [4, 190], up: [4, -190] }[dir]);
const setStyle = s => ev(`__riffle.setStyle(${JSON.stringify(s)})`);
const resetFeel = async () => {
  await ev(`__riffle.showPack('feel-test')`);
  await sleep(200);
  await tap('[data-go=reset]');
  await sleep(250);
};
const openFeel = async title => { await resetFeel(); await openDeckRow(title); };
const seenBox = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;const s=getComputedStyle(e);const r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0})()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

await api('/__reset');

console.log('First screen');
await go(APP);
ok((await text()).includes('Feel test'), 'the test pack is on the first screen');
ok(!(await text()).includes('Add Riffle'), 'no install steps outside iPhone Safari');
const appTitle = await rect('.apptitle');
ok(appTitle.top >= SAT && appTitle.top - SAT <= 12, 'the title starts right under the safe area, not twice below it', String(appTitle.top));
await shot('01-home');

console.log('Style screen');
await tap('[data-go=settings]');
await sleep(150);
await shot('02-settings');
await tap('[data-go=style]');
await sleep(250);
await shot('03-style');
ok((await ev(`document.querySelectorAll('[data-layout-pick]').length`)) >= 4, 'at least four layouts');
ok((await ev(`document.querySelectorAll('[data-look-pick]').length`)) >= 4, 'at least four looks');
ok((await ev(`document.querySelectorAll('.pvphone .card').length`)) > 0, 'the preview has a real card');
const cardBoxInPreview = () => ev(`(()=>{const t=document.querySelector('.pvphone .tools').getBoundingClientRect(),c=document.querySelector('.pvphone .card[data-pos="0"]').getBoundingClientRect();return {toolsTop:t.top,cardTop:c.top,cardBottom:c.bottom,toolsW:t.width}})()`);
await ev(`document.querySelector('[data-layout-pick=rows]').scrollIntoView()`);
await tap('[data-layout-pick=rows]');
const pv0 = await cardBoxInPreview();
ok(pv0.toolsTop < pv0.cardTop, 'two rows: the preview has the buttons above the card');
await tap('[data-layout-pick=under]');
const pv1 = await cardBoxInPreview();
ok(pv1.toolsTop > pv1.cardTop + 10 && (await ev('document.documentElement.dataset.layout')) === 'under', 'tapping a layout changes the preview at once: buttons under the card');
await shot('04-style-under');
await tap('[data-layout-pick=one]');
const pv2 = await cardBoxInPreview();
ok(pv2.toolsW < pv0.toolsW * 0.6, 'one line: the preview has the buttons sharing the row');
await tap('[data-layout-pick=story]');
const homePreview = await ev(`getComputedStyle(document.querySelector('.pvphone .packs')).gridTemplateColumns.split(' ').length`);
ok(homePreview === 1, 'the home preview follows the same choice');
await ev(`document.querySelector('[data-look-pick=paper]').scrollIntoView()`);
const bgOf = () => ev(`getComputedStyle(document.querySelector('.pvphone')).backgroundColor`);
const bgs = new Set();
for (const look of LOOKS) {
  await tap(`[data-look-pick=${look}]`);
  await sleep(40);
  bgs.add(await bgOf());
}
ok(bgs.size === LOOKS.length, 'tapping a look changes the preview at once', JSON.stringify([...bgs]));
await tap('[data-look-pick=paper]');
await tap('[data-layout-pick=under]').catch(() => {});
await go(APP);
ok((await ev('document.documentElement.dataset.look')) === 'paper' && (await ev('document.documentElement.dataset.layout')) === 'under', 'the choice survives closing the app');
await setStyle({ layout: 'rows', look: 'plain' });

console.log('No dead space, in every layout and look');
for (const layout of LAYOUTS) {
  await setStyle({ layout, look: 'plain' });
  await openFeel('What this is');
  const m = await ev(`(()=>{
    const box=s=>{const e=document.querySelector(s);return e?e.getBoundingClientRect():null};
    const c=box('.card[data-pos="0"]'),bar=box('.deckbar'),t=box('.tools'),h2=box('.card[data-pos="0"] h2');
    return {cardTop:c.top,cardBottom:c.bottom,cardH:c.height,barTop:bar.top,barBottom:bar.bottom,toolsTop:t.top,toolsBottom:t.bottom,h2Top:h2.top};
  })()`);
  const top = Math.min(m.barTop, m.toolsTop);
  ok(top - SAT <= 10, `${layout}: nothing but the safe area above the first row`, JSON.stringify(m));
  if (layout === 'story') {
    ok(m.cardTop === 0 && m.cardBottom === H, `${layout}: the card is the whole screen`, JSON.stringify(m));
    ok(m.h2Top >= m.toolsBottom, `${layout}: the row doesn't sit on the card's words`, JSON.stringify(m));
  } else if (layout === 'under') {
    ok(m.cardTop - m.barBottom <= 16, `${layout}: the card starts right under the title`, JSON.stringify(m));
    ok(m.toolsBottom <= H - SAB && m.toolsTop > m.cardBottom, `${layout}: the row sits under the card and above the home bar`, JSON.stringify(m));
  } else {
    ok(m.cardTop - Math.max(m.barBottom, m.toolsBottom) <= 16, `${layout}: the card starts right under the rows`, JSON.stringify(m));
    ok(m.cardBottom <= H - SAB, `${layout}: the card stops above the home bar`, JSON.stringify(m));
  }
  ok(m.cardH >= 480, `${layout}: the card fills the room`, String(m.cardH));
  await throwCard('right');
  ok((await deck()).answers.start?.swipe === 'right', `${layout}: a throw works`);
  await tap('#undo');
  await sleep(200);
  ok((await deck()).top === 'start', `${layout}: Undo works`);
  await pinch();
  ok((await deck()).overview, `${layout}: a pinch works`);
  await tap('[data-act=closegrid]');
  await sleep(100);
  await tap('[data-act=grid]');
  await sleep(700);
  ok((await deck()).overview, `${layout}: Grid works`);
  await tap('[data-act=closegrid]');
  await sleep(100);
  await ev(`__riffle.setNotice({text:'Update ready · tap',act:()=>{window.__noticeTapped=true}})`);
  const n = await ev(`(()=>{const e=document.querySelector('[data-slot=notice]'),r=e.getBoundingClientRect(),t=document.querySelector('.tools').getBoundingClientRect(),h=document.querySelector('.card[data-pos="0"] h2').getBoundingClientRect();const hit=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;return {text:e.textContent,hitsTools:hit(r,t),hitsText:hit(r,h),w:r.width,right:r.right}})()`);
  ok(n.text.startsWith('Update ready') && !n.hitsTools && !n.hitsText && n.w > 0 && n.right <= W, `${layout}: a notice sits in the title line and covers nothing`, JSON.stringify(n));
  ok(!(await ev(`!!document.querySelector('.toast')`)), `${layout}: no toast`);
  await shot(`05-notice-${layout}`);
  await tap('[data-slot=notice]');
  ok(await ev('window.__noticeTapped===true'), `${layout}: the notice can be tapped`);
  await ev('window.__noticeTapped=false;__riffle.setNotice(null)');
  ok((await ev(`document.querySelector('[data-slot=notice]').textContent`)).includes('/'), `${layout}: the count comes back`);
  await shot(`06-deck-${layout}`);
  await ev('__riffle.current.close()');
}
for (const look of LOOKS) {
  await setStyle({ layout: 'rows', look });
  await openFeel('Swipes');
  await shot(`07-look-${look}`);
  const c = await ev(`getComputedStyle(document.querySelector('.card[data-pos="0"] .face')).backgroundColor`);
  ok(c === 'rgb(255, 255, 255)', `${look}: a common card stays white`, c);
  await ev('__riffle.current.close()');
}
await setStyle({ layout: 'rows', look: 'plain' });

console.log('Swipes');
await openFeel('What this is');
let d = await deck();
ok(d && d.top === 'start', 'the first card is on top');
await drag(190, 4, { end: false, before: async () => {
  const st = await ev(`(()=>{const s=document.querySelector('.card[data-pos="0"] .stamp');return {word:s.textContent,op:+s.style.opacity,armed:s.classList.contains('armed')}})()`);
  ok(st.word === 'GOOD' && st.op > 0.9 && st.armed, 'a report card shows GOOD going right', JSON.stringify(st));
  await shot('10-report-right');
} });
await touch('touchEnd', []);
await sleep(150);
d = await deck();
ok(d.answers.start?.swipe === 'right' && d.top === 'stacked', 'right answers it and the next card is up');
await throwCard('left');
await sleep(150);
d = await deck();
ok(d.answers.stacked?.swipe === 'left' && d.ended, 'left answers it, and the deck ends');
ok(!(await ev(`!!document.querySelector('canvas.confetti')`)), 'no confetti at the end of a deck');
await shot('11-deck-end');
await tap('[data-act=done]');
await sleep(500);
d = await deck();
ok(d && d.top === 'distance', "Deck's done opens the next deck in the stack");

await drag(40, 3, { ms: 300 });
d = await deck();
ok(!d.answers.distance && d.top === 'distance', 'a short slow drag springs back and sends nothing');
await drag(-100, 2, { ms: 30, steps: 3 });
d = await deck();
ok(d.answers.distance?.swipe === 'left', 'a quick flick counts');
await tap('#undo');
await sleep(150);
d = await deck();
ok(!d.answers.distance && d.top === 'distance', 'Undo brings it back');
await throwCard('right');
await drag(4, 190, { end: false, before: async () => shot('12-question-down') });
await touch('touchEnd', []);
await sleep(150);
d = await deck();
ok(d.answers.stamps?.swipe === 'down', 'down is IDK');
ok((await queue()).length === 0, "the Feel test's answers are never queued");

console.log('Comment box');
ok((await deck()).top === 'comment', 'the comment card is up');
await throwCard('up');
d = await deck();
ok(d.composing && !d.answers.comment, 'up opens the comment box without sending');
ok(await ev(`document.activeElement.id==='comment'`), 'the box has the cursor');
ok(await ev(`document.getElementById('comment').tagName==='DIV'&&document.getElementById('comment').getAttribute('contenteditable')==='plaintext-only'`), 'the box is contenteditable plaintext-only, not a form field');
ok(!(await seenBox('.topline')) && !(await seenBox('.deckbar')) && !(await seenBox('.tools')), 'the title and buttons are hidden while composing');
ok(!(await ev(`!!document.querySelector('.composer-hint,.composer-row,[data-act=closecomment]')`)), 'no hint line and no X row');
await typeText('A test comment');
await sleep(100);
ok((await deck()).drafts.comment === 'A test comment', 'typing saves a draft');
// about what an iPhone keyboard and its bar leave
await ev(`document.documentElement.style.setProperty('--vvh','464px')`);
await sleep(200);
const room = await ev(`(()=>{const c=document.querySelector('.card[data-pos="0"]').getBoundingClientRect(),p=document.getElementById('comment').getBoundingClientRect();return {cardTop:c.top,cardH:c.height,padH:p.height,padBottom:p.bottom}})()`);
ok(room.cardTop - SAT <= 10 && room.padBottom <= 464 && room.padBottom >= 450 && room.cardH >= 150 && room.padH >= 150, 'with the keyboard up, the card and box take all the height', JSON.stringify(room));
await shot('13-composer-keyboard');
await drag(3, 90);
await sleep(150);
d = await deck();
ok(!d.composing && !d.answers.comment, 'dragging the card down closes the box and sends nothing');
ok(!(await ev(`document.activeElement&&document.activeElement.id==='comment'`)), 'and drops the keyboard');
ok((await ev(`(()=>{const a=document.querySelector('.card[data-pos="0"] .attached');return a.hidden?'':a.innerText})()`)) === 'A test comment', 'and keeps the text as a chip');
await ev(`document.documentElement.style.setProperty('--vvh',innerHeight+'px')`);
await sleep(100);
await shot('14-chip');
await throwCard('down');
await sleep(150);
d = await deck();
ok(d.answers.comment?.swipe === 'down' && d.answers.comment?.comment === 'A test comment', 'a normal down swipe afterwards is IDK with the comment');
await tap('#undo');
await sleep(250);
d = await deck();
ok(d.top === 'comment' && d.drafts.comment === 'A test comment', 'Undo brings the card and its comment back');
await throwCard('up');
ok((await ev(`document.getElementById('comment').innerText`)) === 'A test comment', 'reopening has the text');
const pad0 = await rect('#comment');
await dragFrom(pad0.x, pad0.top + 30, 2, 110);
await sleep(200);
d = await deck();
ok(!d.composing, 'dragging down on the box closes it too');
await throwCard('up');
await drag(190, 3);
await sleep(150);
d = await deck();
ok(d.answers.comment?.swipe === 'right' && d.answers.comment?.comment === 'A test comment' && !d.composing, 'right sends the comment with the swipe');
await tap('#undo');
await sleep(250);
await throwCard('up');
await drag(-190, 3);
await sleep(150);
d = await deck();
ok(d.answers.comment?.swipe === 'left' && d.answers.comment?.comment === 'A test comment', 'left does too');
await tap('#undo');
await sleep(250);
await throwCard('up');
await drag(3, -120);
await sleep(150);
d = await deck();
ok(d.answers.comment?.swipe === 'up' && d.answers.comment?.comment === 'A test comment', 'up again sends the comment alone');
await tap('#undo');
await sleep(250);
await ev(`__riffle.current.s.drafts={}`);
await throwCard('up');
await ev(`(()=>{const p=document.getElementById('comment');p.textContent='';p.dispatchEvent(new Event('input'))})()`);
await sleep(50);
await drag(3, -120);
await sleep(150);
d = await deck();
ok(!d.composing && !d.answers.comment, 'up with nothing typed just closes it');
await throwCard('right');

console.log('Skip');
ok((await deck()).top === 'skip', 'the skip card is up');
await tap('#skip');
await sleep(250);
d = await deck();
ok(d.order[d.order.length - 1] === 'skip' && d.top === 'flip', 'Skip sends it to the bottom');
await tap('#undo');
await sleep(250);
d = await deck();
ok(d.top === 'skip', 'Undo brings it straight back');
await tap('#skip');
await sleep(250);

console.log('Details');
const c0 = await rect('#table');
await tapAt(c0.x, c0.top + c0.h * 0.55);
await sleep(450);
d = await deck();
ok(d.flipped, 'a tap flips the card');
await shot('15-details');
const sc0 = await ev(`document.querySelector('.card[data-pos="0"] .back-scroll').scrollTop`);
const cy = c0.top + c0.h * 0.7;
await touch('touchStart', [[c0.x, cy]]);
for (let i = 1; i <= 10; i++) { await sleep(20); await touch('touchMove', [[c0.x, cy - i * 24]]); }
await touch('touchEnd', []);
await sleep(300);
const sc1 = await ev(`document.querySelector('.card[data-pos="0"] .back-scroll').scrollTop`);
d = await deck();
ok(sc1 > sc0 && !d.answers.flip, 'the back scrolls and swipes are off', `${sc0} -> ${sc1}`);
await tap('.card[data-pos="0"] .back-hint');
await sleep(450);
d = await deck();
ok(!d.flipped, 'flipping back works');
await throwCard('right');

console.log('Notes');
ok((await deck()).top === 'notes', 'the notes card is up');
await tap('#notesbtn');
await sleep(150);
d = await deck();
ok(d.notesOpen && d.top === 'notes', 'Notes opens');
ok(!(await ev(`!!document.querySelector('.sheet-sub')`)), 'with no hint line');
await typeText('A stray thought');
await sleep(150);
await ev(`document.documentElement.style.setProperty('--vvh','464px')`);
await sleep(100);
await shot('16-notes-keyboard');
await ev(`document.documentElement.style.setProperty('--vvh',innerHeight+'px')`);
await sleep(100);
await tap('.sheet-head');
await sleep(150);
d = await deck();
ok(!d.notesOpen && d.top === 'notes' && d.notes === 'A stray thought', 'tapping its head returns to the same card, and the text is kept');
await tap('#notesbtn');
await sleep(150);
const pad1 = await rect('#notestext');
await dragFrom(pad1.x, pad1.top + 40, 2, 120);
await sleep(250);
ok(!(await deck()).notesOpen, 'dragging down on the pad closes it');
await tap('#notesbtn');
await sleep(150);
const head = await rect('.sheet-head');
await dragFrom(head.x, head.y, 2, 120);
await sleep(250);
ok(!(await deck()).notesOpen, 'dragging down on its head closes it');
ok(!(await ev(`document.activeElement&&document.activeElement.id==='notestext'`)), 'and the keyboard drops');
await throwCard('right');

console.log('Overview');
ok((await deck()).top === 'pinch', 'the pinch card is up');
await pinch();
d = await deck();
ok(d.overview, 'a pinch opens the overview');
await shot('17-overview');
const tiles = await ev(`[...document.querySelectorAll('.tile')].map(t=>t.innerText.replace(/\\s+/g,' '))`);
ok(tiles.length === 8 && tiles.some(t => t.includes('Stamps') && t.includes('IDK')), 'each tile has its title and answer', JSON.stringify(tiles));
await tap('.tile[data-id=stamps]');
await sleep(300);
d = await deck();
ok(d.top === 'stamps' && !d.overview, 'tapping a tile goes to that card');
await throwCard('right');
await sleep(150);
d = await deck();
ok(d.answers.stamps?.swipe === 'right' && d.top === 'pinch', 'throwing it again changes the answer and returns to where you were');
await throwCard('right');
await throwCard('right');
ok((await deck()).top === 'skip', 'the skipped card comes round again at the end');
await throwCard('right');
await sleep(250);
d = await deck();
ok(d.ended, 'the deck ends');
ok((await ev(`document.getElementById('endnotes').innerText`)) === 'A stray thought', 'the same notes are on the end screen');
await tap('[data-act=done]');
await sleep(150);
const pop = await ev(`(()=>{const c=document.querySelector('canvas.confetti');return !!c})()`);
ok(pop, 'a topic gets a small pop');
await sleep(1100);
ok(!(await ev(`!!document.querySelector('canvas.confetti')`)), 'gone within about a second');
ok((await text()).includes('The basics cleared'), 'with quiet words');
await shot('18-topic-reward');
await tap('[data-go=pack]');
await sleep(300);

console.log('Rarity and breaking through');
await openDeckRow('Breaking through');
await shot('19-uncommon');
await throwCard('right');
await sleep(200);
await shot('20-rare');
await throwCard('right');
await sleep(800);
d = await deck();
ok(d.top === 'epic', 'the epic card is up');
ok(!(await ev(`!!document.querySelector('.cracks,.shard')`)), 'no crack lines and no shards');
await drag(200, 3, { ms: 60, steps: 4 });
await sleep(100);
d = await deck();
ok(!d.answers.epic, 'a fast right flick on an epic does nothing');
await drag(170, 3, { ms: 120, hold: 480, end: false, before: async () => {
  ok(await ev(`+getComputedStyle(document.querySelector('.card[data-pos="0"]')).getPropertyValue('--charge') > .25`), 'something builds while holding');
  await shot('21-epic-holding-half');
} });
await touch('touchEnd', []);
await sleep(80);
d = await deck();
ok(!d.answers.epic && d.top === 'epic', 'letting go early sends nothing');
await sleep(500);
ok(await ev(`+getComputedStyle(document.querySelector('.card[data-pos="0"]')).getPropertyValue('--charge') === 0`), 'the glow drains away');
await drag(-70, 40, { ms: 120, end: false, before: async () => {
  ok(await ev(`document.querySelector('.card[data-pos="0"] .stamp').textContent === 'WORKSHOP'`), 'left is not held back on an epic');
} });
await touch('touchEnd', []);
await sleep(120);
ok(!(await deck()).answers.epic, 'that short left drag sprang back');
await drag(170, 3, { ms: 120, hold: 0, end: false });
await sleep(760);
await shot('22-epic-nearly');
await sleep(260);
d = await deck();
ok(d.answers.epic?.swipe === 'right', 'holding for a second breaks through, with the finger still down');
ok(!(await ev(`!!document.querySelector('canvas.confetti')`)), 'with no confetti');
await touch('touchEnd', []);
await sleep(500);
d = await deck();
ok(d.top === 'legendary' && !d.answers.legendary, 'lifting the finger afterwards does nothing to the next card');
await shot('23-legendary');
await throwCard('down');
await sleep(150);
ok((await deck()).answers.legendary?.swipe === 'down', 'down stays free on a legendary');
await tap('#undo');
await sleep(350);
await drag(170, 3, { ms: 120, end: false });
await sleep(1150);
await touch('touchEnd', []);
await sleep(500);
d = await deck();
ok(d.answers.legendary?.swipe === 'right' && d.ended, 'a legendary breaks through too');
await tap('[data-act=done]');
await sleep(600);
ok((await text()).includes('Big calls cleared'), 'the second topic gets its reward');
await sleep(600);
await tap('[data-go=pack]');
await sleep(300);
await openDeckRow('Misc');
await throwCard('right');
await sleep(200);
await tap('[data-act=done]');
await sleep(120);
ok(await ev(`!!document.querySelector('canvas.confetti')`), 'clearing the pack gives one modest burst');
await shot('24-pack-burst');
await sleep(1100);
ok(!(await ev(`!!document.querySelector('canvas.confetti')`)), 'gone within about a second');
ok((await text()).includes('Feel test cleared'), 'with quiet words');
await shot('25-pack-reward');
await tap('[data-go=pack]');
await sleep(300);
ok((await text()).includes('Cleared'), 'the first screen shows the pack as cleared');

console.log('Old Feel test answers');
await ev(`__riffle.store.queueAdd({v:1,eid:'old-1',demo:true,type:'answer',card:'x'})`);
ok((await queue()).length === 1, 'an older version left one queued');
await go(APP);
await sleep(300);
ok((await queue()).length === 0, 'it gets cleared on start and can never send');

console.log('Connecting');
await tap('[data-go=settings]');
await sleep(200);
await tap('[data-go=connect]');
await sleep(200);
await shot('26-connect');
const link = await ev(`document.querySelector('.linkbtn').href`);
ok(link.includes('target_name=Stippo47') && link.includes('expires_in=none') && link.includes('contents=write') && link.includes('name=Riffle'), "the key page's link is filled in", link);
const tryKey = async value => {
  await ev(`document.getElementById('key').value=${JSON.stringify(value)}`);
  await tap('#check');
  await sleep(500);
  return ev(`document.getElementById('result').textContent`);
};
ok((await tryKey('made-up-wrong')).includes("didn't accept"), 'a wrong key is refused');
ok((await tryKey('test-wrong-repo')).includes("can't see riffle-data"), 'a key without the repo says so');
const broad = await tryKey('test-all-repos');
ok(broad.includes('2 other private repos') && broad.includes("didn't keep"), 'a key that sees other repos is refused and says so', broad);
const ro = await tryKey('test-read-only');
ok(ro.includes("can't write") && ro.includes('403'), 'a read-only key says so, with the reason', ro);
ok(!(await ev(`__riffle.store.get('gh-key')`)), 'none of those were kept');
await api('/__down?on=1');
const noNet = await tryKey('test-good');
ok(noNet.includes("couldn't reach GitHub"), 'no signal says so', noNet);
ok((await ev(`document.getElementById('key').value`)) === 'test-good', "and keeps what's pasted, to try again");
await api('/__down?on=0');
const listed = await tryKey('test-listed-only');
ok(listed.includes('Connected'), "a list that says too much doesn't turn away a good key", listed);
await sleep(1900);
const names0 = await api('/__files');
ok(names0.some(n => n.includes('connect-check')), 'connecting writes a test file');
ok(!names0.some(n => n.startsWith('answers/') && !n.includes('connect-check')), 'and no Feel test answers go with it');
ok((await text()).includes('Test pack'), 'decks pulled from the repo show on the first screen');

console.log('A real send');
await tap('.pack');
await sleep(250);
ok((await text()).includes('Topic one'), "the pulled pack's topic shows");
await openDeckRow('Pulled deck');
await throwCard('right');
await throwCard('up');
await typeText('A real comment');
await sleep(80);
await drag(190, 3);
await sleep(200);
await tap('#notesbtn');
await sleep(100);
await typeText('Real notes');
await sleep(100);
await tap('.sheet-head');
await sleep(200);
ok((await queue()).length >= 3, 'answers wait in the queue', JSON.stringify(await queue()));
await sleep(18500);
ok((await queue()).length === 0, 'they send by themselves within about 15 seconds');
const names1 = await api('/__files');
const batches = names1.filter(n => n.startsWith('answers/') && !n.includes('connect-check'));
ok(batches.length === 1, 'as one batch file', JSON.stringify(batches));
const batch = JSON.parse(await (await fetch(`${API}/__file?path=${encodeURIComponent(batches[0])}`)).text());
ok(batch.events.some(e => e.comment === 'A real comment' && e.swipe === 'right') && batch.events.some(e => e.type === 'notes' && e.text === 'Real notes') && batch.events.every(e => !e.demo), 'holding the answers, comment and notes', JSON.stringify(batch.events));

console.log('When sending fails, it says why');
const failThen = async (code, message, expect) => {
  await api(`/__fail?code=${code}&message=${encodeURIComponent(message)}`);
  await throwCard('down');
  await sleep(80);
  const r = await ev('__riffle.sync.flush()');
  await sleep(120);
  const st = await ev('__riffle.sync.status()');
  ok(st.problem && st.problem.includes(expect) && r.message.includes(expect), `a ${code} says so in plain words`, JSON.stringify(st.problem));
  const note = await ev(`document.querySelector('[data-slot=notice]').textContent`);
  ok(note.includes('Not sending'), `and the title line shows it (${code})`, note);
  await tap('#undo');
  await sleep(200);
};
await failThen(401, 'Bad credentials', "isn't accepting your key");
await shot('27-not-sending');
await failThen(403, 'Resource not accessible by personal access token', "isn't allowed to write");
await failThen(404, 'Not Found', "can't find riffle-data");
await failThen(500, 'Oops', 'having trouble');
await failThen(422, 'Invalid request', 'Invalid request');
await tap('[data-slot=notice]');
await sleep(250);
const setText = await text();
ok(setText.includes('Invalid request'), 'tapping it shows the whole reason in settings');
await shot('28-settings-problem');
await api('/__fail?code=0');
await tap('[data-go=send]');
await sleep(500);
const after = await text();
ok(!(await ev('__riffle.sync.status()')).problem && /Sent \d+ answer/.test(after), 'Send now works and clears it', after);
ok(/\d+ sent so far/.test(after) && (after.match(/Sent \d+ answer/g) || []).length === 1, 'and settings shows what has been sent, once');
await shot('29-settings-good');

console.log('No signal');
await api('/__down?on=1');
await ev(`__riffle.showPack('test-pack')`);
await sleep(200);
await openDeckRow('Pulled deck');
await throwCard('down');
await sleep(100);
await ev('__riffle.sync.flush()');
await sleep(150);
let st = await ev('__riffle.sync.status()');
ok(st.noSignal && !st.problem && st.waiting >= 1, 'one miss counts as no signal, and the answers wait', JSON.stringify(st));
await ev(`__riffle.current.close();__riffle.showHome()`);
await sleep(300);
ok((await text()).includes('when there is signal'), 'the first screen counts them', await text());
await ev('__riffle.sync.flush()');
await sleep(100);
await ev('__riffle.sync.flush()');
await sleep(150);
st = await ev('__riffle.sync.status()');
ok(st.problem && st.problem.includes("aren't getting through"), 'three misses while the phone says it is online says so', JSON.stringify(st.problem));
ok((await text()).includes("aren't getting through"), 'on the first screen too');
const w0 = await api('/__writes');
await api('/__down?on=0');
await ev('__riffle.sync.flush()');
await sleep(200);
ok((await queue()).length === 0 && !(await ev('__riffle.sync.status()')).problem, 'they send when signal returns, and the message goes');
ok((await api('/__writes')).writes === w0.writes + 1, 'in one batch');

console.log('Coming back');
await openFeel('What this is');
await throwCard('right');
await sleep(300);
await go(APP);
await ev(`__riffle.showPack('feel-test')`);
await sleep(250);
await openDeckRow('What this is');
d = await deck();
ok(d.top === 'stacked' && d.answers.start, 'closing and reopening keeps your place');
await ev('__riffle.current.close()');

console.log('Small phones');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
for (const layout of LAYOUTS) {
  await go(`http://localhost:8787/?api=http://localhost:8788&insets=20,0`);
  await setStyle({ layout, look: 'plain' });
  const cutOff = await ev(`(async()=>{
    const out=[];
    await __riffle.showPack('feel-test');
    const count=document.querySelectorAll('.deckrow').length;
    for(let i=0;i<count;i++){
      await __riffle.showPack('feel-test');
      document.querySelectorAll('.deckrow')[i].click();
      await new Promise(r=>setTimeout(r,250));
      const c=__riffle.current;
      for(const card of c.deck.cards){
        c.jump(card.id);
        await new Promise(r=>setTimeout(r,30));
        const f=c.topNode().querySelector('.face');
        if(f.scrollHeight>f.clientHeight+1)out.push(card.id+' '+f.scrollHeight+'>'+f.clientHeight);
      }
      c.close();
    }
    return out;
  })()`);
  ok(cutOff.length === 0, `${layout}: every card fits on a small iPhone`, JSON.stringify(cutOff));
}
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
await setStyle({ layout: 'rows', look: 'plain' });

console.log('iPhone Safari');
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await go(APP);
ok((await text()).includes('Add Riffle to your Home Screen'), 'Safari shows the Home Screen steps');
await shot('30-safari');
await ev('__riffle.showConnect()');
await sleep(150);
ok((await text()).includes('Do this from the Home Screen icon'), 'connecting in Safari warns first');

ok(errors.length === 0, 'no errors in the console', JSON.stringify(errors.slice(0, 5)));
console.log(`\n${passed} passed, ${failed} failed. Pictures in ${SHOTS}`);
await send('Browser.close').catch(() => {});
process.exit(failed ? 1 : 0);
