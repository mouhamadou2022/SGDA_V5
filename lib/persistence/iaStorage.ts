// lib/persistence/iaStorage.ts
// IndexedDB durable pour les modules IA (remplace sessionStorage/localStorage)

const DB_NAME = 'sgda_ia_state'
const DB_VERSION = 1
const STORES = ['decisions', 'feedbacks', 'thresholds', 'ml_weights', 'bayes_cpts'] as const
export type IaStoreName = typeof STORES[number]

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store)
        }
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function get<T>(storeName: IaStoreName, key: string): Promise<T | null> {
  if (typeof indexedDB === 'undefined') { console.warn(`[iaStorage] indexedDB indisponible, get(${storeName}, ${key}) ignoré`); return null }
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error)
      tx.oncomplete = () => db.close()
    })
  } catch (e) {
    console.warn(`[iaStorage] get(${storeName}, ${key}) a échoué:`, e)
    return null
  }
}

async function set<T>(storeName: IaStoreName, key: string, value: T): Promise<void> {
  if (typeof indexedDB === 'undefined') { console.warn(`[iaStorage] indexedDB indisponible, set(${storeName}, ${key}) ignoré`); return }
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.put(value, key)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn(`[iaStorage] set(${storeName}, ${key}) a échoué:`, e)
  }
}

async function remove(storeName: IaStoreName, key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') { console.warn(`[iaStorage] indexedDB indisponible, remove(${storeName}, ${key}) ignoré`); return }
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.delete(key)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn(`[iaStorage] remove(${storeName}, ${key}) a échoué:`, e)
  }
}

async function clear(storeName: IaStoreName): Promise<void> {
  if (typeof indexedDB === 'undefined') { console.warn(`[iaStorage] indexedDB indisponible, clear(${storeName}) ignoré`); return }
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.clear()
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn(`[iaStorage] clear(${storeName}) a échoué:`, e)
  }
}

/** Fusionne deux tableaux d'objets avec id, dédoublonnés.
 *  Les éléments du tableau `incoming` remplacent ceux de `existing` ayant le même id.
 *  Réutilisé par decisionTracker et engineFeedback. */
export function mergeArrayById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of existing) map.set(item.id, item)
  for (const item of incoming) map.set(item.id, item)
  return Array.from(map.values())
}

export const iaStorage = { get, set, remove, clear }
