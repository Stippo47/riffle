// Small shared helpers: card kinds and their stamps, escaping, the tick, and confetti.
import { ICON } from './icons.js';

// What each direction means on each kind of card. To change a stamp's word, change it here.
export const KINDS = {
  question: { label: 'Question', pickLabel: 'My pick', right: 'GO', left: 'WORKSHOP', down: 'IDK', up: 'NOTE' },
  report: { label: 'Report', right: 'GOOD', left: 'PROBLEM', down: 'HUH?', up: 'NOTE' },
  design: { label: 'Design', pickLabel: 'My design', right: 'YES', left: 'RETHINK', down: 'IDK', up: 'NOTE' },
};
export const kindOf = card => KINDS[card.kind] || KINDS.question;
export const stampWord = (card, dir) => kindOf(card)[dir];

// Five levels in the usual game rarity colours. The tints live in style.css.
export const RARITY = {
  common: { label: '' },
  uncommon: { label: 'Uncommon' },
  rare: { label: 'Rare · matters, can change later' },
  epic: { label: "Epic · can't be undone", breaks: true, burst: ['#ffffff', '#e7d6ff', '#c79bff', '#9a5be0', '#ff8ae2'] },
  legendary: { label: 'Legendary · shapes everything after', breaks: true, burst: ['#ffffff', '#ffe98a', '#ffc847', '#ffaa00', '#ff7a18'] },
};

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icon = name => ICON[name] || '';
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Turns plain text with blank lines into paragraphs.
export const paras = text => String(text || '').split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('');

// Pack icons from the data repo are SVG text. Only shapes get through.
export function safeIcon(text) {
  if (!text) return '';
  if (ICON[text]) return ICON[text];
  try {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName !== 'svg') return '';
    const box = svg.getAttribute('viewBox') || '0 0 512 512';
    const paths = [...svg.querySelectorAll('path')].map(p => `<path d="${esc(p.getAttribute('d'))}" fill="currentColor"/>`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(box)}">${paths.join('')}</svg>`;
  } catch { return ''; }
}

// A tick for the thumb. iPhones let web pages tick only through this switch trick, and only on
// recent versions. Android vibrates. If neither works, nothing happens.
let hap = null;
export function tick() {
  if (navigator.vibrate) { navigator.vibrate(8); return; }
  if (!hap) {
    hap = document.createElement('label');
    hap.className = 'hap';
    hap.innerHTML = '<input type="checkbox" switch tabindex="-1">';
    document.body.append(hap);
  }
  hap.click();
}

// A short burst of bits, from the top middle of the screen unless told where.
export function confetti(host, { count = 70, origin = null, force = 1, colors = ['#ff8ae2', '#ffe98a', '#9dffc8', '#8ad8ff', '#c79bff', '#ffffff'] } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = host.clientWidth, H = host.clientHeight;
  c.width = W * dpr; c.height = H * dpr;
  host.append(c);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const bits = Array.from({ length: count }, () => {
    const a = Math.random() * Math.PI * 2, v = (3 + Math.random() * 8) * force;
    return { x: origin ? origin[0] : W / 2, y: origin ? origin[1] : H * 0.34, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, r: Math.random() * 6,
      vr: (Math.random() - .5) * .4, w: 5 + Math.random() * 5, h: 9 + Math.random() * 7,
      col: colors[Math.floor(Math.random() * colors.length)] };
  });
  const start = performance.now();
  const step = now => {
    const t = now - start;
    g.clearRect(0, 0, W, H);
    for (const b of bits) {
      b.vy += .24; b.vx *= .985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      g.save();
      g.globalAlpha = clamp(1.6 - t / 1100, 0, 1);
      g.translate(b.x, b.y); g.rotate(b.r);
      g.fillStyle = b.col;
      g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      g.restore();
    }
    if (t < 1800) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}
