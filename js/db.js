/* Momentjes — datalaag (IndexedDB)
   Alles blijft lokaal op het toestel. Geen server, geen account. */

const DB = (() => {
  const NAME = 'momentjes';
  const VERSION = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('memories')) {
          const m = db.createObjectStore('memories', { keyPath: 'id' });
          m.createIndex('date', 'date');
          m.createIndex('childId', 'childId');
        }
        if (!db.objectStoreNames.contains('children')) db.createObjectStore('children', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
    }));
  }

  function getAll(store) {
    return open().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }));
  }

  function get(store, key) {
    return open().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }));
  }

  const put = (store, value) => tx(store, 'readwrite', s => s.put(value));
  const del = (store, key) => tx(store, 'readwrite', s => s.delete(key));

  // ---- Instellingen ----
  const getSetting = (key, fallback = null) =>
    get('settings', key).then(r => (r ? r.value : fallback));
  const setSetting = (key, value) => put('settings', { key, value });

  // ---- Standaarddata ----
  const DEFAULT_CATEGORIES = [
    { id: 'cat-uitspraak', name: 'Uitspraak', icon: 'quote',    color: '#4D99E6', sortOrder: 0, isDefault: true },
    { id: 'cat-vraag',     name: 'Vraag',     icon: 'question', color: '#E6992D', sortOrder: 1, isDefault: true },
    { id: 'cat-ervaring',  name: 'Ervaring',  icon: 'leaf',     color: '#66BB6A', sortOrder: 2, isDefault: true },
    { id: 'cat-mijlpaal',  name: 'Mijlpaal',  icon: 'flag',     color: '#E6667F', sortOrder: 3, isDefault: true },
  ];

  const CHILD_COLORS = ['#E6667F', '#4D99E6', '#E6992D', '#66BB6A', '#9B7ED9', '#4DB6AC'];

  async function ensureDefaults() {
    const cats = await getAll('categories');
    if (cats.length === 0) {
      for (const c of DEFAULT_CATEGORIES) await put('categories', c);
    }
  }

  const uuid = () =>
    (crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }));

  // Vraag de browser om opslag te beschermen tegen automatisch opruimen
  async function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        return await navigator.storage.persist();
      }
    } catch (_) { /* geen probleem */ }
    return false;
  }

  async function storageEstimate() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        return await navigator.storage.estimate();
      }
    } catch (_) {}
    return null;
  }

  return {
    open, getAll, get, put, del,
    getSetting, setSetting,
    ensureDefaults, uuid,
    requestPersistence, storageEstimate,
    DEFAULT_CATEGORIES, CHILD_COLORS,
  };
})();
