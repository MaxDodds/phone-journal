// IndexedDB storage. Videos live in their own store so listing entries stays light.
const DB_NAME = 'journal';
const VERSION = 1;
let dbp;

function open() {
  return (dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const entries = db.createObjectStore('entries', { keyPath: 'id' });
      entries.createIndex('section', 'section');
      db.createObjectStore('videos');
      db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const complete = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });

export async function allEntries() {
  const db = await open();
  return done(db.transaction('entries').objectStore('entries').getAll());
}

async function put(entry, blob) {
  const db = await open();
  const tx = db.transaction(['entries', 'videos'], 'readwrite');
  tx.objectStore('videos').put(blob, entry.id);
  tx.objectStore('entries').put(entry);
  return complete(tx);
}

export async function addEntry(entry, file) {
  try {
    await put(entry, file);
  } catch (err) {
    // Older Safari builds can refuse File objects from <input>; copy into a plain Blob and retry.
    const copy = new Blob([await file.arrayBuffer()], { type: file.type });
    await put(entry, copy);
  }
}

export async function getVideo(id) {
  const db = await open();
  return done(db.transaction('videos').objectStore('videos').get(id));
}

export async function deleteEntry(id) {
  const db = await open();
  const tx = db.transaction(['entries', 'videos'], 'readwrite');
  tx.objectStore('videos').delete(id);
  tx.objectStore('entries').delete(id);
  return complete(tx);
}

export async function getMeta(key) {
  const db = await open();
  return done(db.transaction('meta').objectStore('meta').get(key));
}

export async function setMeta(key, value) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(value, key);
  return complete(tx);
}
