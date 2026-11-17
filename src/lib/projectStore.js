const META_KEY = 'lumina-project';
const DB_NAME = 'lumina';
const STORE = 'media';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function readMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw);
    if (!meta || typeof meta !== 'object') return null;
    return meta;
  } catch {
    return null;
  }
}

export function writeMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

function blobFrom(source) {
  if (!source) return Promise.resolve(null);
  if (source instanceof Blob) return Promise.resolve(source);
  const canvas = source instanceof HTMLCanvasElement ? source : document.createElement('canvas');
  if (!(source instanceof HTMLCanvasElement)) {
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

export async function saveMedia({ audio, images, audioBlob }) {
  const db = await openDb();
  const storedImages = [];
  for (const image of images) {
    const blob = await blobFrom(image.file || image.source);
    if (!blob) continue;
    storedImages.push({ key: image.key, name: image.name, blob });
  }
  const payload = {
    audio: audio && audioBlob ? { name: audio.name, blob: audioBlob, demo: Boolean(audio.demo) } : null,
    images: storedImages,
  };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(payload, 'bin');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadMedia() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get('bin');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function clearProject() {
  localStorage.removeItem(META_KEY);
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
