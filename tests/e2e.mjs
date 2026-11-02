// Drives the app in headless Edge with real touch input, against tests/serve.mjs and its stand-in for GitHub.
// Run the server, then: node tests/e2e.mjs [folder for screenshots]
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333, W = 390, H = 844;
const APP = 'http://localhost:8787/?api=http://localhost:8788';
const API = 'http://localhost:8788';
const SHOTS = process.argv[2] || join(tmpdir(), 'riffle-shots');
mkdirSync(SHOTS, { recursive: true });

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

const rect = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}})()`);
const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
const tapAt = async (x, y) => { await touch('touchStart', [[x, y]]); await sleep(40); await touch('touchEnd', []); await sleep(120); };
const tap = async sel => {
  const r = await rect(sel);
  if (!r) throw new Error(`nothing to tap: ${sel}`);
  await tapAt(r.x, r.y);
};
const drag = async (dx, dy, { ms = 180, steps = 8, hold = 0, before = null, end = true } = {}) => {
  const c = await rect('#table');
  const x = c.x, y = c.y + 30;
  await touch('touchStart', [[x, y]]);
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    await touch('touchMove', [[x + (dx * i) / steps, y + (dy * i) / steps]]);
  }
  if (hold) await sleep(hold);
  if (before) await before();
  if (end) { await touch('touchEnd', []); await sleep(140); }
};
const pinch = async () => {
  const c = await rect('#table');
  await touch('touchStart', [[c.x, c.y - 120]]);
  await sleep(30);
  await touch('touchStart', [[c.x, c.y - 120], [c.x, c.y + 120]]);
  for (let i = 1; i <= 8; i++) {
    await sleep(25);
    await touch('touchMove', [[c.x, c.y - 120 + i * 13], [c.x, c.y + 120 - i * 13]]);
  }
  await touch('touchEnd', []);
  await sleep(200);
};
const deck = () => ev(`(()=>{const c=__riffle.current;return c?{top:c.topId(),order:c.s.order,answers:c.s.answers,composing:c.composing,flipped:c.flipped,notes:c.s.notes,log:c.s.log.length,ended:c.root.classList.contains('ended'),overview:!c.overview.hidden,notesOpen:!c.notesSheet.hidden,verdict:c.s.verdict}:null})()`);
const queue = () => ev('__riffle.store.queueAll().then(q=>q.map(i=>i.event))');
const typeText = t => send('Input.insertText', { text: t });
const api = p => fetch(API + p).then(r => r.json());
const openDeckRow = title => ev(`(()=>{const b=[...document.querySelectorAll('.deckrow')].find(x=>x.innerText.includes(${JSON.stringify(title)}));const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`).then(p => tapAt(p.x, p.y)).then(() => sleep(300));
const throwCard = dir => drag(...{ right: [190, 4], left: [-190, 4], down: [4, 190], up: [4, -190] }[dir]);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

console.log('First screen');
await go(APP);
ok((await text()).includes('Feel test'), 'the test pack is on the first screen');
ok(!(await text()).includes('Add Riffle'), 'no install steps outside iPhone Safari');
await shot('01-home');
await tap('.pack');
await sleep(200);
const packText = await text();
ok(packText.includes('The basics') && packText.includes('Big calls') && packText.includes('Misc'), "the pack's page shows its topics and Misc");
await shot('02-pack');

console.log('Swipes');
await openDeckRow('What this is');
let d = await deck();
ok(d && d.top === 'start', 'the first card is on top');
await drag(190, 4, { end: false, before: async () => {
  const st = await ev(`(()=>{const s=document.querySelector('.card[data-pos="0"] .stamp');return {word:s.textContent,op:+s.style.opacity,armed:s.classList.contains('armed')}})()`);
  ok(st.word === 'GOOD' && st.op > 0.9 && st.armed, 'a report card shows GOOD going right', JSON.stringify(st));
  await shot('03-report-right');
} });
await touch('touchEnd', []);
await sleep(150);
d = await deck();
ok(d.answers.start?.swipe === 'right' && d.top === 'stacked', 'right answers it and the next card is up');
await throwCard('left');
await sleep(150);
d = await deck();
ok(d.answers.stacked?.swipe === 'left' && d.ended, 'left answers it, and the deck ends');
await shot('04-deck-end');
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
const undoneEvents = (await queue()).filter(e => e.type === 'undo');
ok(!d.answers.distance && d.top === 'distance' && undoneEvents.length === 1, 'Undo brings it back and tells the queue');
await throwCard('right');
await drag(4, 190, { end: false, before: async () => shot('05-question-down') });
await touch('touchEnd', []);
await sleep(150);
d = await deck();
ok(d.answers.stamps?.swipe === 'down', 'down is IDK');

console.log('Comments');
ok((await deck()).top === 'comment', 'the comment card is up');
await throwCard('up');
d = await deck();
ok(d.composing && !d.answers.comment, 'up opens the comment box without sending');
ok(await ev(`document.activeElement.id==='comment'`), 'the box has the cursor');
await typeText('A test comment');
await sleep(200);
await ev(`document.documentElement.style.setProperty('--vvh','500px')`); // about what an iPhone keyboard leaves
await sleep(150);
await shot('06-composer');
await drag(150, 3);
await sleep(150);
await ev(`document.documentElement.style.setProperty('--vvh',innerHeight+'px')`);
d = await deck();
ok(d.answers.comment?.swipe === 'right' && d.answers.comment?.comment === 'A test comment' && !d.composing, 'right sends the comment with the swipe');
const sent = (await queue()).find(e => e.card === 'comment' && e.type === 'answer');
ok(sent && sent.comment === 'A test comment' && sent.stamp === 'GOOD' && sent.topic === 'basics', 'the queued answer holds all of it', JSON.stringify(sent));

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
await tapAt(c0.x, c0.y + 30);
await sleep(450);
d = await deck();
ok(d.flipped, 'a tap flips the card');
await shot('07-details');
const sc0 = await ev(`document.querySelector('.card[data-pos="0"] .back-scroll').scrollTop`);
await touch('touchStart', [[c0.x, c0.y + 120]]);
for (let i = 1; i <= 10; i++) { await sleep(20); await touch('touchMove', [[c0.x, c0.y + 120 - i * 24]]); }
await touch('touchEnd', []);
await sleep(300);
const sc1 = await ev(`document.querySelector('.card[data-pos="0"] .back-scroll').scrollTop`);
d = await deck();
ok(sc1 > sc0 && !d.answers.flip, 'the back scrolls and swipes are off', `${sc0} -> ${sc1}`);
await tap('.card[data-pos="0"] .back-hint');
await sleep(450);
d = await deck();
ok(!d.flipped, 'flipping back works');
await throwCard('up');
await typeText('Comment alone');
await sleep(100);
await drag(3, -120);
await sleep(150);
d = await deck();
ok(d.answers.flip?.swipe === 'up' && d.answers.flip?.comment === 'Comment alone', 'up again sends the comment alone');

console.log('Notes');
ok((await deck()).top === 'notes', 'the notes card is up');
await tap('#notesbtn');
await sleep(150);
d = await deck();
ok(d.notesOpen && d.top === 'notes', 'Notes opens over the table');
await typeText('A stray thought');
await sleep(150);
await shot('08-notes');
await tap('#notesbtn');
await sleep(150);
d = await deck();
ok(!d.notesOpen && d.top === 'notes' && d.notes === 'A stray thought', 'Notes again returns to the same card, and the text is kept');
ok((await queue()).some(e => e.type === 'notes' && e.text === 'A stray thought'), 'the notes are queued');
await throwCard('right');

console.log('Overview');
ok((await deck()).top === 'pinch', 'the pinch card is up');
await pinch();
d = await deck();
ok(d.overview, 'a pinch opens the overview');
await shot('09-overview');
const tiles = await ev(`[...document.querySelectorAll('.tile')].map(t=>t.innerText.replace(/\\s+/g,' '))`);
ok(tiles.length === 8 && tiles.some(t => t.includes('Stamps') && t.includes('IDK')), 'each tile has its title and answer', JSON.stringify(tiles));
await tap('.tile[data-id=stamps]');
await sleep(300);
d = await deck();
ok(d.top === 'stamps' && !d.overview, 'tapping a tile goes to that card');
await shot('10-reviewing');
await throwCard('right');
await sleep(150);
d = await deck();
ok(d.answers.stamps?.swipe === 'right' && d.top === 'pinch', 'throwing it again changes the answer and returns to where you were');
await tap('[data-act=grid]');
await sleep(700);
ok((await deck()).overview, 'the Grid button opens it too, and its tap lands on nothing else');
await tap('[data-act=closegrid]');
await sleep(100);
await throwCard('right');
await throwCard('right');
ok((await deck()).top === 'skip', 'the skipped card comes round again at the end');
await throwCard('right');
await sleep(250);
d = await deck();
ok(d.ended, 'the deck ends');
ok((await ev(`document.getElementById('endnotes').value`)) === 'A stray thought', 'the same notes are on the end screen');
await shot('11-deck-end');
await tap('[data-act=done]');
await sleep(600);
ok((await text()).includes('CLEARED') && (await text()).includes('The basics'), 'finishing every deck in a topic gives the topic reward');
await shot('12-topic-reward');
await tap('[data-go=pack]');
await sleep(300);

console.log('Rarity and breaking through');
await openDeckRow('Breaking through');
await shot('13-uncommon');
await throwCard('right');
await sleep(200);
await shot('14-rare');
await throwCard('right');
await sleep(120);
await shot('15-epic-arrives');
await sleep(800);
d = await deck();
ok(d.top === 'epic', 'the epic card is up');
await drag(200, 3, { ms: 60, steps: 4 });
await sleep(100);
d = await deck();
ok(!d.answers.epic, 'a fast right flick on an epic does nothing');
await drag(170, 3, { ms: 120, hold: 480, end: false, before: async () => {
  ok(await ev(`+getComputedStyle(document.querySelector('.card[data-pos="0"]')).getPropertyValue('--charge') > .25`), 'something builds while holding');
  await shot('16-epic-holding-half');
} });
await touch('touchEnd', []);
await sleep(80);
d = await deck();
ok(!d.answers.epic && d.top === 'epic', 'letting go early sends nothing');
await sleep(500);
ok(await ev(`+getComputedStyle(document.querySelector('.card[data-pos="0"]')).getPropertyValue('--charge') === 0 && document.querySelector('.card[data-pos="0"] .cracks path').style.strokeDashoffset == 1`), 'the cracks heal again');
await drag(-70, 40, { ms: 120, end: false, before: async () => {
  ok(await ev(`document.querySelector('.card[data-pos="0"] .stamp').textContent === 'WORKSHOP'`), 'left is not held back on an epic');
} });
await touch('touchEnd', []);
await sleep(120);
ok(!(await deck()).answers.epic, 'that short left drag sprang back');
const q0 = (await queue()).length;
await drag(170, 3, { ms: 120, hold: 0, end: false });
await sleep(780);
await shot('17-epic-nearly');
await sleep(260);
d = await deck();
ok(d.answers.epic?.swipe === 'right', 'holding for a second breaks through, with the finger still down');
await ev('document.getAnimations().forEach(a=>{if(a.effect.target.classList.contains("shard")){a.pause();a.currentTime=150}})');
await sleep(60);
await shot('18-epic-burst');
await ev('document.getAnimations().forEach(a=>a.play())');
await sleep(120);
await shot('19-epic-burst-later');
await touch('touchEnd', []);
await sleep(600);
d = await deck();
ok(d.top === 'legendary' && !d.answers.legendary, 'lifting the finger afterwards does nothing to the next card');
ok((await queue()).length === q0 + 1, 'exactly one answer was sent');
await shot('20-legendary');
await throwCard('down');
await sleep(150);
ok((await deck()).answers.legendary?.swipe === 'down', 'down stays free on a legendary');
await tap('#undo');
await sleep(350);
await drag(170, 3, { ms: 120, end: false, before: async () => {} });
await sleep(900);
await shot('21-legendary-nearly');
await sleep(180);
await shot('22-legendary-burst');
await touch('touchEnd', []);
await sleep(700);
d = await deck();
ok(d.answers.legendary?.swipe === 'right' && d.ended, 'a legendary breaks through too');
await tap('[data-act=done]');
await sleep(600);
ok((await text()).includes('Big calls'), 'the second topic gets its reward');
await tap('[data-go=pack]');
await sleep(300);
await openDeckRow('Misc');
await throwCard('right');
await sleep(200);
await tap('[data-act=done]');
await sleep(800);
ok((await text()).includes('PACK CLEARED'), 'clearing everything gives the pack reward');
await shot('23-pack-reward');
await tap('[data-go=pack]');
await sleep(300);
ok((await text()).includes('Cleared'), 'the first screen shows the pack as cleared');

console.log('Connecting');
await tap('[data-go=settings]');
await sleep(200);
await shot('24-settings');
for (const look of ['table', 'quiet', 'foil']) {
  await tap(`[data-look-pick=${look}]`);
  await sleep(120);
  ok((await ev('document.documentElement.dataset.look')) === look, `the ${look} look can be picked`);
}
await tap('[data-go=connect]');
await sleep(200);
await shot('25-connect');
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
ok((await tryKey('test-read-only')).includes("can't write"), 'a read-only key says so');
ok(!(await ev(`__riffle.store.get('gh-key')`)), 'none of those were kept');
const waitingBefore = (await queue()).length;
ok(waitingBefore > 0, `${waitingBefore} answers were waiting before connecting`);
ok((await tryKey('test-good')).includes('Connected'), 'a good key connects');
await sleep(1900);
const names = await api('/__files');
const batches = names.filter(n => n.startsWith('answers/') && !n.includes('connect-check'));
ok(names.some(n => n.includes('connect-check')), 'the check wrote a file');
ok(batches.length >= 1, 'the waiting answers were sent as a batch file', JSON.stringify(names));
const batch = JSON.parse(await (await fetch(`${API}/__file?path=${encodeURIComponent(batches[0])}`)).text());
ok(batch.events.length === waitingBefore && batch.events.some(e => e.comment === 'A test comment'), 'the batch holds every answer, comments and all');
ok((await queue()).length === 0, 'nothing left waiting');
ok((await text()).includes('Test pack'), 'decks pulled from the repo show on the first screen');

console.log('No signal');
await tap('.pack');
await sleep(250);
ok((await text()).includes('Topic one'), "the pulled pack's topic shows");
await api('/__down?on=1');
await openDeckRow('Pulled deck');
await drag(190, 4);
await sleep(300);
await tap('[data-act=done]');
await sleep(500);
await tap('[data-go=pack]').catch(() => {});
await ev('__riffle.showHome()');
await sleep(16500);
const waitingNow = (await queue()).length;
ok(waitingNow >= 2, 'with no signal the answers wait', String(waitingNow));
ok((await text()).includes('waiting to send'), 'the first screen counts them', await text());
await shot('26-waiting');
const w0 = (await api('/__writes'));
await api('/__down?on=0');
await sleep(19000); // a try every 15 s, checked every 3 s
ok((await queue()).length === 0, 'they send when signal returns');
const w1 = await api('/__writes');
ok(w1.writes === w0.writes + 1, 'in one batch', JSON.stringify([w0, w1]));

console.log('Coming back');
await ev(`__riffle.showPack('feel-test')`);
await sleep(200);
await tap('[data-go=reset]');
await sleep(250);
await openDeckRow('What this is');
await throwCard('right');
await sleep(300);
await go(APP);
await ev(`__riffle.showPack('feel-test')`);
await sleep(250);
await openDeckRow('What this is');
d = await deck();
ok(d.top === 'stacked' && d.answers.start, 'closing and reopening keeps your place');

console.log('Small phones');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
await go(APP);
const cutOff = await ev(`(async()=>{
  const out=[];
  const card_is_epic=c=>c.deck.cards.some(x=>x.id==='epic');
  await __riffle.showPack('feel-test');
  const pack=[...document.querySelectorAll('.deckrow')];
  for(let i=0;i<pack.length;i++){
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
    if(card_is_epic(c)){c.jump('epic');return out;}
    c.close();
  }
  return out;
})()`);
ok(cutOff.length === 0, 'every card fits on a small iPhone', JSON.stringify(cutOff));
await sleep(900);
await shot('28-small-epic');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });

console.log('iPhone Safari');
await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await go(APP);
ok((await text()).includes('Add Riffle to your Home Screen'), 'Safari shows the Home Screen steps');
await shot('27-safari');
await ev('__riffle.showConnect()');
await sleep(150);
ok((await text()).includes('Do this from the Home Screen icon'), 'connecting in Safari warns first');

ok(errors.length === 0, 'no errors in the console', JSON.stringify(errors.slice(0, 5)));
console.log(`\n${passed} passed, ${failed} failed. Pictures in ${SHOTS}`);
await send('Browser.close').catch(() => {});
process.exit(failed ? 1 : 0);
