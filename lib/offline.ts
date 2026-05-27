// lib/offline.ts — SGDA V5
// Couche IndexedDB pour le mode hors-ligne.
// Toutes les données de travail hors-ligne passent par ces fonctions.

const DB_NAME = 'sgda_offline'
const DB_VERSION = 3 // Incrémenté pour ajouter les nouveaux stores (checklist hierarchy + templates)

export const IDB_STORES = {
  CHECKLISTS: 'idb_checklists',
  SURVEILLANCES: 'idb_surveillances',
  ECARTS: 'idb_ecarts',
  RAPPORTS: 'idb_rapports',
  PAC: 'idb_pac',
  EVENEMENTS: 'idb_evenements',
  DOSSIERS: 'idb_dossiers',
  MESSAGES: 'idb_messages',
  SIGNATURES: 'idb_signatures',
  SYNC_QUEUE: 'idb_sync_queue',
  DELEGATIONS: 'idb_delegations',
  ALERTES: 'idb_alertes',
  FICHES_PRESENCE: 'idb_fiches_presence',
  RISK_INDEX_FEEDBACKS: 'idb_risk_index_feedbacks',
  // NOUVEAUX STORES POUR L'ARBORESCENCE
  CHECKLIST_HIERARCHY: 'idb_checklist_hierarchy',
  CHECKLIST_TEMPLATES: 'idb_checklist_templates',
} as const

export type IDBStoreName = (typeof IDB_STORES)[keyof typeof IDB_STORES]

export interface SyncQueueItem {
  id: string
  store: IDBStoreName
  operation: 'create' | 'update' | 'delete'
  recordId: string
  payload: unknown
  createdAt: string
  retries: number
  error?: string
}

// Types pour les stores existants
export interface DelegationOffline {
  id: string
  surveillance_id: string
  aerodrome_id: string
  chef_id: string
  domaine: string
  assigne_a: string
  assigne_par: string
  items_ids: string[]
  progression: number
  statut: 'en_cours' | 'termine' | 'bloque'
  assigne_le: string
  derniere_activite: string
  derniere_sync: string
}

export interface AlerteSecuriteOffline {
  id: string
  surveillance_id: string
  delegation_id?: string
  item_id: string
  item_numero: string
  item_description: string
  domaine: string
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
  message: string
  declenchee_par: string
  declencheur_nom: string
  declenchee_le: string
  statut: 'active' | 'traitee' | 'cloturee'
  preuves: { id: string; nom: string; url: string; dateUpload: string }[]
  commentaire_traitement?: string
  traitee_par?: string
  traitee_le?: string
  notifie_chef: boolean
  notifie_chef_le?: string
  notifie_dg: boolean
  notifie_dg_le?: string
}

export interface PresenceEntryOffline {
  id: string
  surveillance_id: string
  prenom_nom: string
  structure: 'ANACIM' | 'EXPLOITANT' | 'AUTRE'
  fonction: string
  telephone: string
  email: string
  signature_url: string
  signature_date: string
  heure_arrivee?: string
  heure_depart?: string
  observations?: string
  ordre: number
}

export interface RiskIndexFeedbackOffline {
  id: string
  aerodrome_id: string
  date: string
  contexte: {
    score_global: number
    c1: number
    c2: number
    c3: number
    c4: number
    c5: number
    velocity: number
    nb_ecarts_critiques: number
    nb_nv: number
    nb_ns: number
  }
  suggestion_systeme: {
    probabilite: 1 | 2 | 3 | 4 | 5
    gravite: 'A' | 'B' | 'C' | 'D' | 'E'
    niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
  }
  choix_inspecteur: {
    probabilite: 1 | 2 | 3 | 4 | 5
    gravite: 'A' | 'B' | 'C' | 'D' | 'E'
    niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
  }
  ecart: number
  commentaire?: string
}

// ============================================================
// TYPES POUR L'ARBORESCENCE (NOUVEAUX)
// ============================================================

export interface ChecklistItemOffline {
  id: string
  numero: string
  reference_reglementaire: string
  point_verification: string
  directive_preuve: string
  resultat?: 'SA' | 'NS' | 'NA' | 'NV'
  observation?: string
  fichiers?: { id: string; nom: string; url: string; dateUpload: string }[]
  ordre: number
}

export interface SousSousDomaineOffline {
  id: string
  nom: string
  items: ChecklistItemOffline[]
  isExpanded: boolean
  ordre: number
}

export interface SousDomaineOffline {
  id: string
  nom: string
  sousSousDomaines: SousSousDomaineOffline[]
  isExpanded: boolean
  ordre: number
}

export interface DomaineChecklistOffline {
  id: string
  nom: string
  description: string
  sousDomaines: SousDomaineOffline[]
  isExpanded: boolean
  assigne_a?: string
  assigne_nom?: string
  progression: number
  ordre: number
}

export interface ChecklistTemplateOffline {
  id: string
  nom: string
  description: string
  type: 'sous-domaine' | 'sous-sous-domaine'
  structure: {
    nom: string
    items?: { numero: string; point_verification: string; directive_preuve: string }[]
  }
  created_at: string
  created_by: string
}

// ─────────────────────────────────────────────────────────────
// INITIALISATION DB
// ─────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null

export function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available (SSR context)'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)

    request.onsuccess = () => {
      _db = request.result
      resolve(_db)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result

      Object.values(IDB_STORES).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' })

          // Index existants
          if (storeName === IDB_STORES.CHECKLISTS) {
            store.createIndex('by_surveillance', 'surveillance_id', { unique: false })
          }
          if (storeName === IDB_STORES.ECARTS) {
            store.createIndex('by_surveillance', 'surveillance_id', { unique: false })
            store.createIndex('by_aerodrome', 'aerodrome_id', { unique: false })
          }
          if (storeName === IDB_STORES.SURVEILLANCES) {
            store.createIndex('by_aerodrome', 'aerodrome_id', { unique: false })
            store.createIndex('by_statut', 'statut', { unique: false })
          }
          if (storeName === IDB_STORES.SYNC_QUEUE) {
            store.createIndex('by_store', 'store', { unique: false })
            store.createIndex('by_created', 'createdAt', { unique: false })
          }
          if (storeName === IDB_STORES.DELEGATIONS) {
            store.createIndex('by_surveillance', 'surveillance_id', { unique: false })
            store.createIndex('by_inspecteur', 'assigne_a', { unique: false })
            store.createIndex('by_domaine', 'domaine', { unique: false })
          }
          if (storeName === IDB_STORES.ALERTES) {
            store.createIndex('by_surveillance', 'surveillance_id', { unique: false })
            store.createIndex('by_statut', 'statut', { unique: false })
            store.createIndex('by_niveau', 'niveau', { unique: false })
          }
          if (storeName === IDB_STORES.FICHES_PRESENCE) {
            store.createIndex('by_surveillance', 'surveillance_id', { unique: false })
            store.createIndex('by_structure', 'structure', { unique: false })
          }
          if (storeName === IDB_STORES.RISK_INDEX_FEEDBACKS) {
            store.createIndex('by_aerodrome', 'aerodrome_id', { unique: false })
            store.createIndex('by_date', 'date', { unique: false })
          }
          // NOUVEAUX INDEX pour CHECKLIST_HIERARCHY
          if (storeName === IDB_STORES.CHECKLIST_HIERARCHY) {
            store.createIndex('by_surveillance', 'surveillance_id', { unique: false })
            store.createIndex('by_updated_at', 'updated_at', { unique: false })
          }
          // NOUVEAUX INDEX pour CHECKLIST_TEMPLATES
          if (storeName === IDB_STORES.CHECKLIST_TEMPLATES) {
            store.createIndex('by_type', 'type', { unique: false })
            store.createIndex('by_created_by', 'created_by', { unique: false })
            store.createIndex('by_created_at', 'created_at', { unique: false })
          }
        }
      })
    }
  })
}

// ─────────────────────────────────────────────────────────────
// OPÉRATIONS GÉNÉRIQUES
// ─────────────────────────────────────────────────────────────

export async function idbGetAll<T>(storeName: IDBStoreName): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

export async function idbGet<T>(storeName: IDBStoreName, id: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).get(id)
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

export async function idbPut<T extends { id: string }>(storeName: IDBStoreName, record: T): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbPutMany<T extends { id: string }>(storeName: IDBStoreName, records: T[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    records.forEach((r) => store.put(r))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbDelete(storeName: IDBStoreName, id: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbClear(storeName: IDBStoreName): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function idbGetByIndex<T>(
  storeName: IDBStoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const index = store.index(indexName)
    const request = index.getAll(value)
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

// ─────────────────────────────────────────────────────────────
// FILE D'ATTENTE DE SYNCHRONISATION
// ─────────────────────────────────────────────────────────────

export async function enqueueSync(
  store: IDBStoreName,
  operation: SyncQueueItem['operation'],
  recordId: string,
  payload: unknown,
): Promise<void> {
  const item: SyncQueueItem = {
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    store,
    operation,
    recordId,
    payload,
    createdAt: new Date().toISOString(),
    retries: 0,
  }
  await idbPut(IDB_STORES.SYNC_QUEUE, item)
}

export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  return idbGetAll<SyncQueueItem>(IDB_STORES.SYNC_QUEUE)
}

export async function removeSyncItem(id: string): Promise<void> {
  await idbDelete(IDB_STORES.SYNC_QUEUE, id)
}

export async function incrementSyncRetry(item: SyncQueueItem, error: string): Promise<void> {
  await idbPut(IDB_STORES.SYNC_QUEUE, { ...item, retries: item.retries + 1, error })
}

export async function getPendingSyncCount(): Promise<number> {
  const items = await getPendingSyncItems()
  return items.length
}

// ─────────────────────────────────────────────────────────────
// CACHE DONNÉES PRINCIPALES (snapshot pour travail hors-ligne)
// ─────────────────────────────────────────────────────────────

export async function cacheForOffline<T extends { id: string }>(
  storeName: IDBStoreName,
  records: T[],
): Promise<void> {
  await idbClear(storeName)
  await idbPutMany(storeName, records)
}

export async function getOfflineSurveillances() {
  return idbGetAll(IDB_STORES.SURVEILLANCES)
}

export async function getOfflineChecklistItems(surveillanceId: string) {
  return idbGetByIndex(IDB_STORES.CHECKLISTS, 'by_surveillance', surveillanceId)
}

export async function saveChecklistItemOffline(item: { id: string; surveillance_id: string; [key: string]: unknown }) {
  await idbPut(IDB_STORES.CHECKLISTS, item)
  await enqueueSync(IDB_STORES.CHECKLISTS, 'update', item.id, item)
}

// ─────────────────────────────────────────────────────────────
// FONCTIONS POUR LES STORES EXISTANTS
// ─────────────────────────────────────────────────────────────

// === Delegations ===
export async function getOfflineDelegations(surveillanceId?: string): Promise<DelegationOffline[]> {
  if (surveillanceId) {
    return idbGetByIndex<DelegationOffline>(IDB_STORES.DELEGATIONS, 'by_surveillance', surveillanceId)
  }
  return idbGetAll<DelegationOffline>(IDB_STORES.DELEGATIONS)
}

export async function saveDelegationOffline(delegation: DelegationOffline): Promise<void> {
  await idbPut(IDB_STORES.DELEGATIONS, delegation)
  await enqueueSync(IDB_STORES.DELEGATIONS, 'update', delegation.id, delegation)
}

export async function deleteDelegationOffline(id: string): Promise<void> {
  await idbDelete(IDB_STORES.DELEGATIONS, id)
  await enqueueSync(IDB_STORES.DELEGATIONS, 'delete', id, { id })
}

// === Alertes ===
export async function getOfflineAlertes(surveillanceId?: string): Promise<AlerteSecuriteOffline[]> {
  if (surveillanceId) {
    return idbGetByIndex<AlerteSecuriteOffline>(IDB_STORES.ALERTES, 'by_surveillance', surveillanceId)
  }
  return idbGetAll<AlerteSecuriteOffline>(IDB_STORES.ALERTES)
}

export async function saveAlerteOffline(alerte: AlerteSecuriteOffline): Promise<void> {
  await idbPut(IDB_STORES.ALERTES, alerte)
  await enqueueSync(IDB_STORES.ALERTES, 'update', alerte.id, alerte)
}

export async function deleteAlerteOffline(id: string): Promise<void> {
  await idbDelete(IDB_STORES.ALERTES, id)
  await enqueueSync(IDB_STORES.ALERTES, 'delete', id, { id })
}

// === Fiches de présence ===
export async function getOfflineFichesPresence(surveillanceId?: string): Promise<PresenceEntryOffline[]> {
  if (surveillanceId) {
    return idbGetByIndex<PresenceEntryOffline>(IDB_STORES.FICHES_PRESENCE, 'by_surveillance', surveillanceId)
  }
  return idbGetAll<PresenceEntryOffline>(IDB_STORES.FICHES_PRESENCE)
}

export async function saveFichePresenceOffline(fiche: PresenceEntryOffline): Promise<void> {
  await idbPut(IDB_STORES.FICHES_PRESENCE, fiche)
  await enqueueSync(IDB_STORES.FICHES_PRESENCE, 'update', fiche.id, fiche)
}

export async function deleteFichePresenceOffline(id: string): Promise<void> {
  await idbDelete(IDB_STORES.FICHES_PRESENCE, id)
  await enqueueSync(IDB_STORES.FICHES_PRESENCE, 'delete', id, { id })
}

// === Risk Index Feedbacks ===
export async function getOfflineRiskIndexFeedbacks(aerodromeId?: string): Promise<RiskIndexFeedbackOffline[]> {
  if (aerodromeId) {
    return idbGetByIndex<RiskIndexFeedbackOffline>(IDB_STORES.RISK_INDEX_FEEDBACKS, 'by_aerodrome', aerodromeId)
  }
  return idbGetAll<RiskIndexFeedbackOffline>(IDB_STORES.RISK_INDEX_FEEDBACKS)
}

export async function saveRiskIndexFeedbackOffline(feedback: RiskIndexFeedbackOffline): Promise<void> {
  await idbPut(IDB_STORES.RISK_INDEX_FEEDBACKS, feedback)
  await enqueueSync(IDB_STORES.RISK_INDEX_FEEDBACKS, 'update', feedback.id, feedback)
}

export async function deleteRiskIndexFeedbackOffline(id: string): Promise<void> {
  await idbDelete(IDB_STORES.RISK_INDEX_FEEDBACKS, id)
  await enqueueSync(IDB_STORES.RISK_INDEX_FEEDBACKS, 'delete', id, { id })
}

// === Cache des données pour une surveillance spécifique ===
export async function cacheSurveillanceDataForOffline(
  surveillanceId: string,
  data: {
    delegations?: DelegationOffline[]
    alertes?: AlerteSecuriteOffline[]
    fichesPresence?: PresenceEntryOffline[]
    riskIndexFeedbacks?: RiskIndexFeedbackOffline[]
  }
): Promise<void> {
  if (data.delegations && data.delegations.length > 0) {
    await idbPutMany(IDB_STORES.DELEGATIONS, data.delegations)
  }
  if (data.alertes && data.alertes.length > 0) {
    await idbPutMany(IDB_STORES.ALERTES, data.alertes)
  }
  if (data.fichesPresence && data.fichesPresence.length > 0) {
    await idbPutMany(IDB_STORES.FICHES_PRESENCE, data.fichesPresence)
  }
  if (data.riskIndexFeedbacks && data.riskIndexFeedbacks.length > 0) {
    await idbPutMany(IDB_STORES.RISK_INDEX_FEEDBACKS, data.riskIndexFeedbacks)
  }
}

// === Nettoyage des données offline pour une surveillance ===
export async function clearSurveillanceOfflineData(surveillanceId: string): Promise<void> {
  const delegations = await getOfflineDelegations(surveillanceId)
  for (const del of delegations) {
    await deleteDelegationOffline(del.id)
  }

  const alertes = await getOfflineAlertes(surveillanceId)
  for (const alerte of alertes) {
    await deleteAlerteOffline(alerte.id)
  }

  const fiches = await getOfflineFichesPresence(surveillanceId)
  for (const fiche of fiches) {
    await deleteFichePresenceOffline(fiche.id)
  }
}

// ============================================================
// NOUVELLES FONCTIONS POUR CHECKLIST_HIERARCHY
// ============================================================

/**
 * Sauvegarder toute la hiérarchie d'une surveillance
 */
export async function saveChecklistHierarchyOffline(
  surveillanceId: string,
  hierarchy: DomaineChecklistOffline[]
): Promise<void> {
  const data = {
    id: `hierarchy_${surveillanceId}`,
    surveillance_id: surveillanceId,
    hierarchy: hierarchy,
    updated_at: new Date().toISOString(),
  }
  await idbPut(IDB_STORES.CHECKLIST_HIERARCHY, data)
  await enqueueSync(IDB_STORES.CHECKLIST_HIERARCHY, 'update', data.id, data)
}

/**
 * Récupérer la hiérarchie d'une surveillance
 */
export async function getChecklistHierarchyOffline(
  surveillanceId: string
): Promise<DomaineChecklistOffline[] | null> {
  const data = await idbGet<{
    id: string
    surveillance_id: string
    hierarchy: DomaineChecklistOffline[]
    updated_at: string
  }>(IDB_STORES.CHECKLIST_HIERARCHY, `hierarchy_${surveillanceId}`)
  return data?.hierarchy || null
}

/**
 * Mettre à jour un domaine spécifique
 */
export async function updateDomaineInHierarchyOffline(
  surveillanceId: string,
  domaineId: string,
  updatedDomaine: DomaineChecklistOffline
): Promise<void> {
  const hierarchy = await getChecklistHierarchyOffline(surveillanceId)
  if (hierarchy) {
    const newHierarchy = hierarchy.map(d => d.id === domaineId ? updatedDomaine : d)
    await saveChecklistHierarchyOffline(surveillanceId, newHierarchy)
  }
}

/**
 * Mettre à jour un sous-domaine spécifique
 */
export async function updateSousDomaineInHierarchyOffline(
  surveillanceId: string,
  domaineId: string,
  sousDomaineId: string,
  updatedSousDomaine: SousDomaineOffline
): Promise<void> {
  const hierarchy = await getChecklistHierarchyOffline(surveillanceId)
  if (hierarchy) {
    const newHierarchy = hierarchy.map(domaine => {
      if (domaine.id !== domaineId) return domaine
      return {
        ...domaine,
        sousDomaines: domaine.sousDomaines.map(sd => sd.id === sousDomaineId ? updatedSousDomaine : sd),
      }
    })
    await saveChecklistHierarchyOffline(surveillanceId, newHierarchy)
  }
}

/**
 * Mettre à jour un sous-sous-domaine spécifique
 */
export async function updateSousSousDomaineInHierarchyOffline(
  surveillanceId: string,
  domaineId: string,
  sousDomaineId: string,
  sousSousDomaineId: string,
  updatedSousSousDomaine: SousSousDomaineOffline
): Promise<void> {
  const hierarchy = await getChecklistHierarchyOffline(surveillanceId)
  if (hierarchy) {
    const newHierarchy = hierarchy.map(domaine => {
      if (domaine.id !== domaineId) return domaine
      return {
        ...domaine,
        sousDomaines: domaine.sousDomaines.map(sd => {
          if (sd.id !== sousDomaineId) return sd
          return {
            ...sd,
            sousSousDomaines: sd.sousSousDomaines.map(ssd => ssd.id === sousSousDomaineId ? updatedSousSousDomaine : ssd),
          }
        }),
      }
    })
    await saveChecklistHierarchyOffline(surveillanceId, newHierarchy)
  }
}

/**
 * Mettre à jour un item spécifique
 */
export async function updateItemInHierarchyOffline(
  surveillanceId: string,
  domaineId: string,
  sousDomaineId: string,
  sousSousDomaineId: string,
  itemId: string,
  updatedItem: ChecklistItemOffline
): Promise<void> {
  const hierarchy = await getChecklistHierarchyOffline(surveillanceId)
  if (hierarchy) {
    const newHierarchy = hierarchy.map(domaine => {
      if (domaine.id !== domaineId) return domaine
      return {
        ...domaine,
        sousDomaines: domaine.sousDomaines.map(sd => {
          if (sd.id !== sousDomaineId) return sd
          return {
            ...sd,
            sousSousDomaines: sd.sousSousDomaines.map(ssd => {
              if (ssd.id !== sousSousDomaineId) return ssd
              return {
                ...ssd,
                items: ssd.items.map(item => item.id === itemId ? updatedItem : item),
              }
            }),
          }
        }),
      }
    })
    await saveChecklistHierarchyOffline(surveillanceId, newHierarchy)
  }
}

/**
 * Ajouter un sous-domaine dans la hiérarchie
 */
export async function addSousDomaineToHierarchyOffline(
  surveillanceId: string,
  domaineId: string,
  nouveauSousDomaine: SousDomaineOffline
): Promise<void> {
  const hierarchy = await getChecklistHierarchyOffline(surveillanceId)
  if (hierarchy) {
    const newHierarchy = hierarchy.map(domaine => {
      if (domaine.id !== domaineId) return domaine
      return {
        ...domaine,
        sousDomaines: [...domaine.sousDomaines, nouveauSousDomaine],
      }
    })
    await saveChecklistHierarchyOffline(surveillanceId, newHierarchy)
  }
}

/**
 * Supprimer un sous-domaine de la hiérarchie
 */
export async function deleteSousDomaineFromHierarchyOffline(
  surveillanceId: string,
  domaineId: string,
  sousDomaineId: string
): Promise<void> {
  const hierarchy = await getChecklistHierarchyOffline(surveillanceId)
  if (hierarchy) {
    const newHierarchy = hierarchy.map(domaine => {
      if (domaine.id !== domaineId) return domaine
      return {
        ...domaine,
        sousDomaines: domaine.sousDomaines.filter(sd => sd.id !== sousDomaineId),
      }
    })
    await saveChecklistHierarchyOffline(surveillanceId, newHierarchy)
  }
}

// ============================================================
// NOUVELLES FONCTIONS POUR CHECKLIST_TEMPLATES
// ============================================================

/**
 * Sauvegarder un template
 */
export async function saveChecklistTemplateOffline(
  template: ChecklistTemplateOffline
): Promise<void> {
  await idbPut(IDB_STORES.CHECKLIST_TEMPLATES, template)
  await enqueueSync(IDB_STORES.CHECKLIST_TEMPLATES, 'update', template.id, template)
}

/**
 * Sauvegarder plusieurs templates
 */
export async function saveChecklistTemplatesOffline(
  templates: ChecklistTemplateOffline[]
): Promise<void> {
  await idbPutMany(IDB_STORES.CHECKLIST_TEMPLATES, templates)
  for (const template of templates) {
    await enqueueSync(IDB_STORES.CHECKLIST_TEMPLATES, 'update', template.id, template)
  }
}

/**
 * Récupérer tous les templates
 */
export async function getAllChecklistTemplatesOffline(): Promise<ChecklistTemplateOffline[]> {
  return idbGetAll<ChecklistTemplateOffline>(IDB_STORES.CHECKLIST_TEMPLATES)
}

/**
 * Récupérer les templates par type
 */
export async function getChecklistTemplatesByTypeOffline(
  type: 'sous-domaine' | 'sous-sous-domaine'
): Promise<ChecklistTemplateOffline[]> {
  return idbGetByIndex<ChecklistTemplateOffline>(
    IDB_STORES.CHECKLIST_TEMPLATES,
    'by_type',
    type
  )
}

/**
 * Récupérer un template par son ID
 */
export async function getChecklistTemplateOffline(id: string): Promise<ChecklistTemplateOffline | undefined> {
  return idbGet<ChecklistTemplateOffline>(IDB_STORES.CHECKLIST_TEMPLATES, id)
}

/**
 * Supprimer un template
 */
export async function deleteChecklistTemplateOffline(id: string): Promise<void> {
  await idbDelete(IDB_STORES.CHECKLIST_TEMPLATES, id)
  await enqueueSync(IDB_STORES.CHECKLIST_TEMPLATES, 'delete', id, { id })
}

// ============================================================
// FONCTION DE PRÉPARATION D'UNE SURVEILLANCE OFFLINE
// ============================================================

/**
 * Préparer toutes les données d'une surveillance pour le mode offline
 * (À appeler au moment du lancement de la surveillance)
 */
export async function prepareSurveillanceForOffline(
  surveillanceId: string,
  data: {
    hierarchy: DomaineChecklistOffline[]
    domaineIds: string[]
    templates?: ChecklistTemplateOffline[]
  }
): Promise<void> {
  // Sauvegarder la hiérarchie
  await saveChecklistHierarchyOffline(surveillanceId, data.hierarchy)
  
  // Sauvegarder les templates si fournis
  if (data.templates && data.templates.length > 0) {
    await saveChecklistTemplatesOffline(data.templates)
  }
}

/**
 * Vérifier si une surveillance est prête pour le mode offline
 */
export async function isSurveillanceReadyForOffline(
  surveillanceId: string
): Promise<boolean> {
  const hierarchy = await getChecklistHierarchyOffline(surveillanceId)
  return hierarchy !== null && hierarchy.length > 0
}

/**
 * Synchroniser la hiérarchie d'une surveillance
 */
export async function syncChecklistHierarchy(
  surveillanceId: string,
  remoteHierarchy: DomaineChecklistOffline[]
): Promise<void> {
  const localHierarchy = await getChecklistHierarchyOffline(surveillanceId)
  
  if (!localHierarchy) {
    // Pas de données locales, on prend les données distantes
    await saveChecklistHierarchyOffline(surveillanceId, remoteHierarchy)
    return
  }
  
  // Fusionner les données (la version distante prévaut pour la structure,
  // mais on conserve les résultats locaux si présents)
  const mergedHierarchy = remoteHierarchy.map(remoteDomaine => {
    const localDomaine = localHierarchy.find(d => d.id === remoteDomaine.id)
    if (!localDomaine) return remoteDomaine
    
    return {
      ...remoteDomaine,
      sousDomaines: remoteDomaine.sousDomaines.map(remoteSd => {
        const localSd = localDomaine.sousDomaines.find(sd => sd.id === remoteSd.id)
        if (!localSd) return remoteSd
        
        return {
          ...remoteSd,
          sousSousDomaines: remoteSd.sousSousDomaines.map(remoteSsd => {
            const localSsd = localSd.sousSousDomaines.find(ssd => ssd.id === remoteSsd.id)
            if (!localSsd) return remoteSsd
            
            return {
              ...remoteSsd,
              items: remoteSsd.items.map(remoteItem => {
                const localItem = localSsd.items.find(item => item.id === remoteItem.id)
                if (!localItem) return remoteItem
                
                // Conserver le résultat local
                return {
                  ...remoteItem,
                  resultat: localItem.resultat,
                  observation: localItem.observation,
                  fichiers: localItem.fichiers,
                }
              }),
            }
          }),
        }
      }),
    }
  })
  
  await saveChecklistHierarchyOffline(surveillanceId, mergedHierarchy)
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRES RÉSEAU
// ─────────────────────────────────────────────────────────────

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function onNetworkChange(callback: (online: boolean) => void): () => void {
  const onOnline = () => callback(true)
  const onOffline = () => callback(false)
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORT DES FONCTIONS UTILITAIRES
// ─────────────────────────────────────────────────────────────

export const offlineUtils = {
  // Opérations génériques
  openDB,
  idbGetAll,
  idbGet,
  idbPut,
  idbPutMany,
  idbDelete,
  idbClear,
  idbGetByIndex,
  
  // File d'attente
  enqueueSync,
  getPendingSyncItems,
  removeSyncItem,
  incrementSyncRetry,
  getPendingSyncCount,
  
  // Cache général
  cacheForOffline,
  getOfflineSurveillances,
  getOfflineChecklistItems,
  saveChecklistItemOffline,
  
  // Delegations
  getOfflineDelegations,
  saveDelegationOffline,
  deleteDelegationOffline,
  
  // Alertes
  getOfflineAlertes,
  saveAlerteOffline,
  deleteAlerteOffline,
  
  // Fiches de présence
  getOfflineFichesPresence,
  saveFichePresenceOffline,
  deleteFichePresenceOffline,
  
  // Risk Index Feedbacks
  getOfflineRiskIndexFeedbacks,
  saveRiskIndexFeedbackOffline,
  deleteRiskIndexFeedbackOffline,
  
  // Cache par surveillance
  cacheSurveillanceDataForOffline,
  clearSurveillanceOfflineData,
  
  // NOUVELLES FONCTIONS POUR L'ARBORESCENCE
  saveChecklistHierarchyOffline,
  getChecklistHierarchyOffline,
  updateDomaineInHierarchyOffline,
  updateSousDomaineInHierarchyOffline,
  updateSousSousDomaineInHierarchyOffline,
  updateItemInHierarchyOffline,
  addSousDomaineToHierarchyOffline,
  deleteSousDomaineFromHierarchyOffline,
  
  // Templates
  saveChecklistTemplateOffline,
  saveChecklistTemplatesOffline,
  getAllChecklistTemplatesOffline,
  getChecklistTemplatesByTypeOffline,
  getChecklistTemplateOffline,
  deleteChecklistTemplateOffline,
  
  // Utilitaires de synchronisation
  prepareSurveillanceForOffline,
  isSurveillanceReadyForOffline,
  syncChecklistHierarchy,
  
  // Réseau
  isOnline,
  onNetworkChange,
}