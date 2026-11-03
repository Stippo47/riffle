// Photos on the comment box, notes and thoughts. A plain file input, so iPhones offer Take Photo and
// Photo Library. Each one is shrunk here and saved to the phone first. It's uploaded apart from the
// text, so a large file never holds words back, and only once what it's attached to has been sent.
import { esc, icon } from './ui.js';
import * as store from './store.js';
import { newId } from './sync.js';

const LONG_SIDE = 1600;
const QUALITY = 0.82;
const urls = new Map();

export const photoButton = where =>
  `<label class="photobtn" aria-label="Add a photo">${icon('camera')}<input type="file" accept="image/*" data-photo="${esc(where)}"></label>`;

export const countWords = n => `${n} picture${n === 1 ? '' : 's'}`;

// Reads the picture, whatever the phone's camera made, and draws it into a JPEG of a sensible size.
// Drawing it also leaves behind anything else in the file, such as where it was taken.
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("it couldn't be read"));
      img.src = url;
    });
    const scale = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(resolve => c.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) throw new Error("it couldn't be shrunk");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Returns the new photo's id once it's safely on the phone.
export async function savePhoto(file) {
  const blob = await shrink(file);
  const id = newId();
  await store.photos.set(id, { id, type: blob.type, bytes: await blob.arrayBuffer(), at: Date.now() });
  return id;
}

async function thumb(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await store.photos.get(id).catch(() => null);
  if (!rec) return null;
  const url = URL.createObjectURL(new Blob([rec.bytes], { type: rec.type }));
  urls.set(id, url);
  return url;
}

// Draws the small pictures. With `where`, each has a way to remove it.
export async function drawStrip(el, ids, where = null) {
  if (!el) return;
  el.hidden = !ids.length;
  const parts = await Promise.all(ids.map(async id => {
    const src = await thumb(id);
    return `<span class="photothumb">${src ? `<img src="${esc(src)}" alt="">` : ''}${where ? `<button data-act="rmphoto" data-where="${esc(where)}" data-photo-id="${esc(id)}" aria-label="Remove this photo">${icon('x')}</button>` : ''}</span>`;
  }));
  el.innerHTML = parts.join('');
}

export function stripError(el, e) {
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `<span class="photoerror">Couldn't add that picture: ${esc(e && e.message ? e.message : 'unknown error')}.</span>`;
}

// Removes it from the phone, unless what it's attached to has already gone.
export async function discardPhoto(id) {
  const due = await store.get(`photo-due:${id}`).catch(() => true);
  const rec = await store.photos.get(id).catch(() => null);
  if (rec && !due && !rec.uploaded) await store.photos.del(id).catch(() => {});
  const url = urls.get(id);
  if (url) { URL.revokeObjectURL(url); urls.delete(id); }
}
