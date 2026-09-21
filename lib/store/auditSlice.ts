// lib/store/auditSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Journal d'audit extraite du store monolithique, comportement identique.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string
  date: string
  utilisateur_id: string
  utilisateur_nom: string
  utilisateur_role: string
  action: 'connexion' | 'deconnexion' | 'creation' | 'modification' | 'suppression' | 'consultation' | 'signature' | 'transmission' | 'generation_code' | 'revocation'
  module: string
  entite_type: string
  entite_id: string
  entite_nom?: string
  details?: Record<string, unknown>
  ip?: string
  user_agent?: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface AuditSlice {
  auditLogs: AuditLog[]
  setAuditLogs: (logs: AuditLog[]) => void
  addAuditLog: (log: Omit<AuditLog, 'id' | 'date'>) => void
  getLogsByUtilisateur: (utilisateurId: string) => AuditLog[]
  getLogsByModule: (module: string) => AuditLog[]
  getLogsByPeriode: (debut: string, fin: string) => AuditLog[]
  exporterLogsCSV: (logs: AuditLog[]) => string
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createAuditSlice)
// ─────────────────────────────────────────────────────────────

export const createAuditSlice: StateCreator<AppStore, [], [], AuditSlice> = (set, get) => ({
  auditLogs: [],

  setAuditLogs: (logs) => set({ auditLogs: logs }),

  addAuditLog: (log) => set((state) => ({
    auditLogs: [...state.auditLogs, { ...log, id: crypto.randomUUID(), date: new Date().toISOString() } as AuditLog]
  })),

  getLogsByUtilisateur: (utilisateurId) => get().auditLogs.filter(l => l.utilisateur_id === utilisateurId),

  getLogsByModule: (module) => get().auditLogs.filter(l => l.module === module),

  getLogsByPeriode: (debut, fin) => get().auditLogs.filter(l => l.date >= debut && l.date <= fin),

  exporterLogsCSV: (logs) => {
    const header = 'Date,Utilisateur,Module,Action,Détail\n'
    const rows = logs.map(l => `${l.date},${l.utilisateur_id},${l.module},${l.action},"${l.details || ''}"`)
    return header + rows.join('\n')
  },
})
