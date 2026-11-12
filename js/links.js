// Links in words: [Label](riffle:pack/deck/card/part) to a card or part in Riffle, and plain web
// addresses. Both show as tappable labels wherever words are shown. A link is plain text, so it can
// be typed, pasted and kept like any other words, and the writer reads it as it is.
import { esc, icon } from './ui.js';

// The link button in a box to type in, beside its photo button.
export const linkButton = where => `<button class="padlink" data-act="linkcard" data-where="${esc(where)}" aria-label="Link a card">${icon('link')}</button>`;

const LINK = /\[([^\]\n]{1,120})\]\(riffle:([^)\s]{1,400})\)|(https?:\/\/[^\s<>"'()[\]]+[^\s<>"'()[\].,;:!?])/g;

// One address part each for the pack, the deck, the card and the part. Empty ones drop off the end.
export const addressOf = (...parts) => parts.filter(Boolean).map(p => encodeURIComponent(p)).join('/');
export const splitAddress = address => String(address || '').split('/').map(x => { try { return decodeURIComponent(x); } catch { return x; } });

// The text a link is typed as. Square brackets in a label would end it early, so they go.
export const linkText = (label, address) => `[${String(label || '').replace(/[[\]\n]/g, ' ').replace(/\s+/g, ' ').trim() || 'a card'}](riffle:${address})`;

const shortUrl = url => {
  const bare = url.replace(/^https?:\/\/(www\.)?/, '');
  return bare.length > 38 ? `${bare.slice(0, 36)}…` : bare;
};

// Words as HTML, escaped, with their links as tappable labels. `fill` changes the words between links.
export function linkify(text, fill = t => t) {
  const s = String(text ?? '');
  let out = '', last = 0;
  for (const m of s.matchAll(LINK)) {
    out += esc(fill(s.slice(last, m.index)));
    if (m[3]) out += `<a class="weblink" href="${esc(m[3])}" target="_blank" rel="noopener">${esc(shortUrl(m[3]))}</a>`;
    else out += `<span class="rlink" role="link" data-addr="${esc(m[2])}">${esc(m[1].trim())}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(fill(s.slice(last)));
}

// The same words as plain text, each link only its label: for a line too small for a tap target.
export const plainLinks = text => String(text ?? '').replace(LINK, (all, label, address, url) => (url ? shortUrl(url) : label.trim()));

// Paragraphs, like ui.js paras, with links.
export const paraLinks = (text, fill = t => t) => String(text || '').split(/\n{2,}/).map(p => `<p>${linkify(p, fill)}</p>`).join('');

export const hasLinks = text => { LINK.lastIndex = 0; return LINK.test(String(text || '')); };

// The links in some words, in order: { label, address } for cards, { url } for the web.
export function linksIn(text) {
  return [...String(text || '').matchAll(LINK)].map(m => (m[3] ? { url: m[3] } : { label: m[1].trim(), address: m[2] }));
}
