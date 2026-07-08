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
  CHECKLIST_HIERARCHY: 'idb_checklist_hierarchy',
  CHECKLIST_TEMPLATES: 'idb_checklist_templates',
} as const

export type IDBStoreName = (typeof IDB_STORES)[keyof typeof IDB_STORES]
