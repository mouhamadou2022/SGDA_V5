// lib/persistence/idbStorage.ts
// Wrapper IndexedDB pour remplacer localStorage — permet de stocker
// de gros volumes (échantillons ML, historiques) sans limite des 5-10 MB

const DB_NAME = 'sgda_models'
const DB_VERSION = 1
const STORE_NAME = 'ml_data'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const idbStorage = {
  async get<T>(key: string): Promise<T | null> {
    if (typeof indexedDB === 'undefined') return null
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.get(key)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => reject(req.error)
        tx.oncomplete = () => db.close()
      })
    } catch {
      return null
    }
  },

  async set(key: string, value: any): Promise<void> {
    if (typeof indexedDB === 'undefined') return
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.put(value, key)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      })
    } catch (err) {
      console.warn('[IDB] set error:', err)
    }
  },

  async remove(key: string): Promise<void> {
    if (typeof indexedDB === 'undefined') return
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.delete(key)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      // ignore
    }
  },

  async clear(): Promise<void> {
    if (typeof indexedDB === 'undefined') return
    try {
      const db = await openDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.clear()
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      })
    } catch {
      // ignore
    }
  },
}
