// lib/persistence/iaStorage.ts
// IndexedDB durable pour les modules IA (remplace sessionStorage/localStorage)

const DB_NAME = 'sgda_ia_state'
// v1 → v2 : ajout du store `bayes_cpts`. Incrémenter DB_VERSION à chaque ajout
// de store : sans bump, onupgradeneeded ne se redéclenche pas pour les
// utilisateurs existants et le store manquant n'est jamais créé.
const DB_VERSION = 2
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
    req.onsuccess = () => {
      const db = req.result
      // Si on a étendu STORES sans bump de DB_VERSION, onupgradeneeded ne se
      // redéclenche pas pour les utilisateurs existants : le store manquant
      // n'existe pas. On prévient clairement dès l'ouverture plutôt que de
      // laisser un NotFoundError cryptique au premier get/set.
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          console.error(
            `[iaStorage] Le store "${store}" est absent de la base existante. ` +
            `Ajout à STORES sans incrémenter DB_VERSION ? Sans ce bump, ` +
            `onupgradeneeded ne se redéclenche pas pour les utilisateurs actuels.`
          )
        }
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Échec d'accès au stockage côté serveur (Node) : indexedDB n'existe pas.
 *  IndexedDB est une API navigateur — le code serveur ne doit pas l'appeler.
 *  En dev on lève un error log bruyant pour que le bug soit repéré immédiatement
 *  (au lieu de disparaître en silence) ; en prod on se contente d'avertir pour
 *  ne pas faire planter une requête utilisateur qui n'a pas besoin de ça. */
function serverSideGuard(fnLabel: string): boolean {
  if (typeof indexedDB !== 'undefined') return true
  const msg = `[iaStorage] indexedDB indisponible (appel côté serveur ?) — ${fnLabel} ignoré. ` +
    `Le code serveur ne doit pas appeler iaStorage ; utilisez l'accès Supabase direct.`
  if (process.env.NODE_ENV !== 'production') {
    console.error(msg)
  } else {
    console.warn(msg)
  }
  return false
}

async function get<T>(storeName: IaStoreName, key: string): Promise<T | null> {
  if (!serverSideGuard(`get(${storeName}, ${key})`)) return null
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      let settled = false
      const close = () => { if (!settled) db.close() }
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.get(key)
      req.onsuccess = () => { settled = true; resolve(req.result ?? null) }
      req.onerror = () => { settled = true; reject(req.error) }
      tx.oncomplete = close
      tx.onabort = () => { settled = true; reject(tx.error) }
      tx.onerror = () => { settled = true; reject(tx.error) }
    })
  } catch (e) {
    console.warn(`[iaStorage] get(${storeName}, ${key}) a échoué:`, e)
    return null
  }
}

async function set<T>(storeName: IaStoreName, key: string, value: T): Promise<void> {
  if (!serverSideGuard(`set(${storeName}, ${key})`)) return
  // Garde-fou : structuredClone pré-valide la valeur avant son écriture en
  // IndexedDB. Un objet non-clonable (ex. un évènement DOM PointerEvent stocké
  // par erreur dans un record IA) provoquait un DataCloneError asynchrone non
  // géré qui faisait planter le workflow sans stack utilisable.
  try {
    structuredClone(value)
  } catch (cloneErr) {
    console.error(`[iaStorage] set(${storeName}, ${key}) rejeté : valeur contenant un objet non-clonable (${(cloneErr as Error).name})`, cloneErr)
    return
  }
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      let settled = false
      const close = () => { if (!settled) db.close() }
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.put(value, key)
      tx.oncomplete = () => { close(); resolve() }
      tx.onabort = () => { console.error(`[iaStorage] set(${storeName}, ${key}) transaction annulée:`, tx.error); close(); reject(tx.error) }
      tx.onerror = (ev) => { console.error(`[iaStorage] set(${storeName}, ${key}) échec store.put:`, tx.error, ev); close(); reject(tx.error) }
    })
  } catch (e) {
    console.warn(`[iaStorage] set(${storeName}, ${key}) a échoué:`, e)
  }
}

async function remove(storeName: IaStoreName, key: string): Promise<void> {
  if (!serverSideGuard(`remove(${storeName}, ${key})`)) return
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      let settled = false
      const close = () => { if (!settled) db.close() }
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.delete(key)
      tx.oncomplete = () => { close(); resolve() }
      tx.onabort = () => { settled = true; reject(tx.error) }
      tx.onerror = () => { settled = true; reject(tx.error) }
    })
  } catch (e) {
    console.warn(`[iaStorage] remove(${storeName}, ${key}) a échoué:`, e)
  }
}

async function clear(storeName: IaStoreName): Promise<void> {
  if (!serverSideGuard(`clear(${storeName})`)) return
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      let settled = false
      const close = () => { if (!settled) db.close() }
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)
      store.clear()
      tx.oncomplete = () => { close(); resolve() }
      tx.onabort = () => { settled = true; reject(tx.error) }
      tx.onerror = () => { settled = true; reject(tx.error) }
    })
  } catch (e) {
    console.warn(`[iaStorage] clear(${storeName}) a échoué:`, e)
  }
}

/** Fusionne deux tableaux d'objets avec id, dédoublonnés.
 *  Les éléments du tableau `incoming` remplacent ceux de `existing` ayant le même id.
 *
 *  ⚠️ À appeler explicitement par tout module qui recharge un état depuis
 *  iaStorage au montage (decisionTracker, engineFeedback, ...) : faire
 *  `iaStorage.get(...)` puis écraser l'état en mémoire sans passer par
 *  mergeArrayById reproduit la race condition replace-vs-merge (deux onglets /
 *  deux sessions qui se marchent dessus au lieu de fusionner). */
export function mergeArrayById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of existing) map.set(item.id, item)
  for (const item of incoming) map.set(item.id, item)
  return Array.from(map.values())
}

export const iaStorage = { get, set, remove, clear }
