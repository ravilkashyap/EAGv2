// IndexedDB wrapper for items and vectors

const DB_NAME = 'universal_search_db';
const DB_VERSION = 1;
const STORE_ITEMS = 'items';
const STORE_VECTORS = 'vectors';

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        const items = db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
        items.createIndex('type', 'type', { unique: false });
        items.createIndex('hash', 'hash', { unique: false });
        items.createIndex('pinned', 'pinned', { unique: false });
        items.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_VECTORS)) {
        db.createObjectStore(STORE_VECTORS, { keyPath: 'itemId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putItem(item) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readwrite');
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_ITEMS).put(item);
  });
}

export async function getItem(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readonly');
    tx.onerror = () => reject(tx.error);
    const req = tx.objectStore(STORE_ITEMS).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllItems() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readonly');
    tx.onerror = () => reject(tx.error);
    const req = tx.objectStore(STORE_ITEMS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getPinnedItems() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readonly');
    tx.onerror = () => reject(tx.error);
    const req = tx.objectStore(STORE_ITEMS).getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      resolve(all.filter((it) => it && it.pinned === true));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getItemsByType(type) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readonly');
    tx.onerror = () => reject(tx.error);
    const index = tx.objectStore(STORE_ITEMS).index('type');
    const req = index.getAll(IDBKeyRange.only(type));
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getItemByHash(hash) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ITEMS, 'readonly');
    tx.onerror = () => reject(tx.error);
    const index = tx.objectStore(STORE_ITEMS).index('hash');
    const req = index.getAll(IDBKeyRange.only(hash));
    req.onsuccess = () => resolve((req.result && req.result[0]) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function setPinned(id, pinned) {
  const existing = await getItem(id);
  if (!existing) return null;
  existing.pinned = Boolean(pinned);
  await putItem(existing);
  return existing;
}

export async function upsertVector(itemId, embedding) {
  const db = await openDatabase();
  const vector = { itemId, dim: embedding.length, embedding: Array.from(embedding) };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VECTORS, 'readwrite');
    tx.oncomplete = () => resolve(vector);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_VECTORS).put(vector);
  });
}

export async function getVectorsForItemIds(itemIds) {
  const db = await openDatabase();
  const vectors = [];
  await Promise.all(itemIds.map((itemId) => new Promise((resolve) => {
    const tx = db.transaction(STORE_VECTORS, 'readonly');
    const req = tx.objectStore(STORE_VECTORS).get(itemId);
    req.onsuccess = () => {
      if (req.result) vectors.push(req.result);
      resolve();
    };
    req.onerror = () => resolve();
  })));
  return vectors;
}

export async function deleteItem(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ITEMS, STORE_VECTORS], 'readwrite');
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.objectStore(STORE_ITEMS).delete(id);
    tx.objectStore(STORE_VECTORS).delete(id);
  });
}

export async function computeHashHex(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function nowIso() {
  return new Date().toISOString();
}

export function buildItemId(prefix, unique) {
  return `${prefix}:${unique}`;
}

export async function ensureStoredItem(base) {
  const id = base.id;
  const existing = await getItem(id);
  if (existing) return existing;
  await putItem(base);
  return base;
}

// Danger: wipe the entire IndexedDB used by Chronos (items and vectors)
export async function wipeDatabase() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(true);
  });
}
