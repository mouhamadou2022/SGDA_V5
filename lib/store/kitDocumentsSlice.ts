// lib/store/kitDocumentsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Kit Inspecteur extraite du store monolithique, comportement identique.
// Lectures inter-slices via get() (store composé) : aerodromes, user.
// Envoi de message via ÉVÉNEMENT 'message:envoyer' (plus d'appel direct).

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import { storeEvents } from './eventBus'
import type {
  TypeDocumentOACI,
  FormatDocument,
  KitDocExtrait,
  KitChecklistItemGenere,
} from './kitTypes'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface KitDocument {
  id: string
  nom: string
  type_document: 'reglementation' | 'procedure' | 'checklist' | 'modele_rapport' | 'guide' | 'autre'
  type_document_oaci?: TypeDocumentOACI
  format?: FormatDocument
  version: string
  date_revision: string
  etat: 'a_jour' | 'en_revision' | 'obsolete'
  domaines: string[]
  fichier_url: string
  fichier_nom: string
  fichier_taille: number
  mots_cles: string[]
  resume?: string
  accessible_exploitant: boolean
  telechargements: number
  reference_base?: string
  extraits?: KitDocExtrait[]
  ia_analyse_at?: string
  ia_impact?: 'majeur' | 'modere' | 'mineur' | 'aucun'
  shared_aerodrome_ids?: string[]
  partage_exploitant?: {
    id: string
    aerodrome_id: string
    partage_par: string
    partage_le: string
    message?: string
    actif: boolean
  }[]
  contenu_complet?: string
  texte_extrait_le?: string
  texte_extrait_version?: string
  items_generes?: KitChecklistItemGenere[]
  items_generes_le?: string
  items_generes_version?: string
  created_at: string
  updated_at: string
  created_by: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface KitSlice {
  kitDocuments: KitDocument[]
  setKitDocuments: (documents: KitDocument[]) => void
  addKitDocument: (document: Omit<KitDocument, 'id' | 'created_at' | 'updated_at' | 'telechargements'> & { id?: string }) => Promise<KitDocument>
  updateKitDocument: (id: string, data: Partial<KitDocument>) => void
  deleteKitDocument: (id: string) => void
  getDocumentsByDomaine: (domaine: string) => KitDocument[]
  getDocumentsExploitant: (aerodromeId?: string) => KitDocument[]
  partagerKitDocumentExploitant: (documentId: string, aerodromeId: string, message?: string) => void
  revoquerPartageKitDocument: (documentId: string, aerodromeId: string) => void
  incrementerTelechargement: (id: string) => void
  kitPreviewDoc: KitDocument | null
  kitPreviewData: any[] | null
  kitAnalyseIA: any | null
  setKitPreview: (doc: KitDocument | null, data: any[] | null, analyse: any | null) => void
  clearKitPreview: () => void
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createKitDocumentsSlice)
// ─────────────────────────────────────────────────────────────

export const createKitDocumentsSlice: StateCreator<AppStore, [], [], KitSlice> = (set, get) => ({
  kitDocuments: [],

  setKitDocuments: (documents) => set({ kitDocuments: documents }),

  addKitDocument: async (document) => {
    const id = document.id || crypto.randomUUID();
    const newDoc = { ...document, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), telechargements: 0 } as KitDocument;
    const { data, error } = await import('@/lib/datastore').then(m => m.createKitDocument(newDoc));
    if (error) { console.error('[store] createKitDocument error:', error); return newDoc; }
    if (data) set((state) => ({ kitDocuments: [...state.kitDocuments.filter(k => k.id !== id), data] }));
    else set((state) => ({ kitDocuments: [...state.kitDocuments, newDoc] }));
    return data || newDoc;
  },

  updateKitDocument: async (id, data) => {
    set((state) => ({ kitDocuments: state.kitDocuments.map(k => k.id === id ? { ...k, ...data, updated_at: new Date().toISOString() } : k) }));
    const { data: result, error } = await import('@/lib/datastore').then(m => m.updateKitDocument(id, data as any));
    if (error) console.error('[store] updateKitDocument error:', error);
    if (result) set((state) => ({ kitDocuments: state.kitDocuments.map(k => k.id === id ? result : k) }));
  },

  deleteKitDocument: async (id) => {
    set((state) => ({ kitDocuments: state.kitDocuments.filter(k => k.id !== id) }));
    const { error } = await import('@/lib/datastore').then(m => m.deleteKitDocument(id));
    if (error) console.error('[store] deleteKitDocument error:', error);
  },

  getDocumentsByDomaine: (domaine) => get().kitDocuments.filter(k => k.domaines?.includes(domaine)),

  getDocumentsExploitant: (aerodromeId) => get().kitDocuments.filter(k => {
    if (!k.accessible_exploitant) return false
    if (!aerodromeId) return true
    const partagesActifs = k.partage_exploitant?.filter(p => p.actif).map(p => p.aerodrome_id) || []
    const cibles = k.shared_aerodrome_ids || []
    return partagesActifs.length === 0 && cibles.length === 0
      ? true
      : partagesActifs.includes(aerodromeId) || cibles.includes(aerodromeId)
  }),

  partagerKitDocumentExploitant: (documentId, aerodromeId, message) => {
    const doc = get().kitDocuments.find(k => k.id === documentId)
    if (!doc || !aerodromeId) return

    const now = new Date().toISOString()
    const user = get().user
    const aerodrome = get().aerodromes.find(a => a.id === aerodromeId)
    const partageId = `kit-share-${documentId}-${aerodromeId}`

    set((state) => ({
      kitDocuments: state.kitDocuments.map(k => {
        if (k.id !== documentId) return k
        const autresPartages = (k.partage_exploitant || []).filter(p => p.aerodrome_id !== aerodromeId)
        return {
          ...k,
          accessible_exploitant: true,
          shared_aerodrome_ids: Array.from(new Set([...(k.shared_aerodrome_ids || []), aerodromeId])),
          partage_exploitant: [
            ...autresPartages,
            {
              id: partageId,
              aerodrome_id: aerodromeId,
              partage_par: user?.id || 'system',
              partage_le: now,
              message,
              actif: true,
            },
          ],
          updated_at: now,
        }
      }),
    }))

    // Sync partage vers Supabase (best-effort)
    import('@/lib/datastore').then(m => {
      const updatedDoc = get().kitDocuments.find(k => k.id === documentId)
      if (updatedDoc) m.updateKitDocument(documentId, {
        accessible_exploitant: updatedDoc.accessible_exploitant,
        shared_aerodrome_ids: updatedDoc.shared_aerodrome_ids,
        partage_exploitant: updatedDoc.partage_exploitant,
      } as any)
    })

    storeEvents.emit('message:envoyer', {
      canal: 'exploitant',
      from_id: user?.id || 'system',
      from_nom: user ? `${user.prenom} ${user.nom}` : 'ANACIM',
      from_role: user?.role || 'system',
      to_id: aerodromeId,
      aerodrome_id: aerodromeId,
      subject: `Document partagé : ${doc.nom}`,
      body: message?.trim() || `Un document du kit inspecteur a été partagé avec ${aerodrome?.code_oaci || "l'exploitant"}.`,
      attachments: [{
        nom: doc.fichier_nom || doc.nom,
        url: doc.fichier_url,
        taille: doc.fichier_taille || 0,
        type: doc.format || doc.type_document || 'application/octet-stream',
      }],
    })

    // Notification exploitant
    import('@/lib/services/notificationService').then(({ notificationService }) => {
      notificationService.notify('document_partage', {
        aerodrome_id: aerodromeId,
        nom_document: doc.nom,
        partage_par: user ? `${user.prenom} ${user.nom}` : "L'inspecteur",
        message: message?.trim(),
      })
    })
  },

  revoquerPartageKitDocument: (documentId, aerodromeId) => {
    set((state) => ({
      kitDocuments: state.kitDocuments.map(k => {
        if (k.id !== documentId) return k
        const partages = (k.partage_exploitant || []).map(p =>
          p.aerodrome_id === aerodromeId ? { ...p, actif: false } : p
        )
        const sharedIds = (k.shared_aerodrome_ids || []).filter(id => id !== aerodromeId)
        const resteActif = partages.some(p => p.actif)
        return {
          ...k,
          shared_aerodrome_ids: sharedIds,
          partage_exploitant: partages,
          accessible_exploitant: resteActif || (k.accessible_exploitant && (k.partage_exploitant || []).length === 0),
          updated_at: new Date().toISOString(),
        }
      }),
    }))
    // Sync vers Supabase (best-effort)
    import('@/lib/datastore').then(m => {
      const updatedDoc = get().kitDocuments.find(k => k.id === documentId)
      if (updatedDoc) m.updateKitDocument(documentId, {
        accessible_exploitant: updatedDoc.accessible_exploitant,
        shared_aerodrome_ids: updatedDoc.shared_aerodrome_ids,
        partage_exploitant: updatedDoc.partage_exploitant,
      } as any)
    })
  },

  incrementerTelechargement: (id) => set((state) => ({
    kitDocuments: state.kitDocuments.map(k => k.id === id ? { ...k, telechargements: (k.telechargements || 0) + 1 } : k)
  })),

  kitPreviewDoc: null,
  kitPreviewData: null,
  kitAnalyseIA: null,
  setKitPreview: (doc, data, analyse) => set({ kitPreviewDoc: doc, kitPreviewData: data, kitAnalyseIA: analyse }),
  clearKitPreview: () => set({ kitPreviewDoc: null, kitPreviewData: null, kitAnalyseIA: null }),
})
