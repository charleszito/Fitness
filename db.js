// Minimal promise-based IndexedDB wrapper.
const DB_NAME = 'gymtracker';
const DB_VERSION = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('workoutLogs')) {
        const s = db.createObjectStore('workoutLogs', { keyPath: 'id', autoIncrement: true });
        s.createIndex('byDate', 'date');
        s.createIndex('byExercise', 'exerciseId');
        s.createIndex('byDateExercise', ['date', 'exerciseId']);
      }
      if (!db.objectStoreNames.contains('warmupLogs')) {
        const s = db.createObjectStore('warmupLogs', { keyPath: 'id', autoIncrement: true });
        s.createIndex('byDate', 'date');
      }
      if (!db.objectStoreNames.contains('stretchLogs')) {
        const s = db.createObjectStore('stretchLogs', { keyPath: 'id', autoIncrement: true });
        s.createIndex('byDate', 'date');
      }
      if (!db.objectStoreNames.contains('dailyLogs')) {
        db.createObjectStore('dailyLogs', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('mealLogs')) {
        db.createObjectStore('mealLogs', { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains('exerciseNotes')) {
        db.createObjectStore('exerciseNotes', { keyPath: 'exerciseId' });
      }
      if (!db.objectStoreNames.contains('exerciseSettings')) {
        db.createObjectStore('exerciseSettings', { keyPath: 'exerciseId' });
      }
      if (!db.objectStoreNames.contains('blocks')) {
        db.createObjectStore('blocks', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, storeNames, mode) {
  return db.transaction(storeNames, mode);
}

export async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = tx(db, [store], 'readonly');
    const req = t.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll(store, query, count) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = tx(db, [store], 'readonly');
    const req = t.objectStore(store).getAll(query, count);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAllByIndex(store, indexName, query) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = tx(db, [store], 'readonly');
    const idx = t.objectStore(store).index(indexName);
    const req = idx.getAll(query);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbPut(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = tx(db, [store], 'readwrite');
    const req = t.objectStore(store).put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbPutMany(store, values) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = tx(db, [store], 'readwrite');
    const os = t.objectStore(store);
    values.forEach((v) => os.put(v));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function dbDelete(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = tx(db, [store], 'readwrite');
    const req = t.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbClearAll() {
  const db = await openDB();
  const names = Array.from(db.objectStoreNames);
  return new Promise((resolve, reject) => {
    const t = tx(db, names, 'readwrite');
    names.forEach((n) => t.objectStore(n).clear());
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// meta helpers (simple key/value)
export async function metaGet(key, fallback) {
  const row = await dbGet('meta', key);
  return row ? row.value : fallback;
}
export async function metaSet(key, value) {
  return dbPut('meta', { key, value });
}
