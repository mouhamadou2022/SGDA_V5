// lib/ia/rag/reglementaireRagClient.ts
// Variante CLIENT du RAG réglementaire : lit le Kit Inspecteur depuis le store
// Zustand (lib/store). À utiliser uniquement côté client (agents IA).
// Ne PAS importer dans une route API serveur (le store est un module lourd
// client ; les routes serveur doivent utiliser reglementaireRag + Supabase).

import { useAppStore } from '@/lib/store'
import {
  recupererExtraitsAvecDocs,
  construireContexteAvecDocs,
  formaterContexteReglementaire,
} from '@/lib/ia/rag/reglementaireRag'

export { formaterContexteReglementaire } from '@/lib/ia/rag/reglementaireRag'
export type { TypeEntiteRag, ExtraitCite, RecuperationParams } from '@/lib/ia/rag/reglementaireRag'

// Lit les documents du Kit Inspecteur depuis le store (client uniquement).
function kitDocumentsDuStore() {
  return useAppStore.getState().kitDocuments || []
}

// API rétro-compatible : équivalents de recupererExtraitsReglementaires /
// construireContexteReglementaire (fondaient sur le store).
export function recupererExtraitsReglementaires(params: Parameters<typeof recupererExtraitsAvecDocs>[1] = {}) {
  return recupererExtraitsAvecDocs(kitDocumentsDuStore(), params)
}

export function construireContexteReglementaire(params: Parameters<typeof construireContexteAvecDocs>[1]) {
  return construireContexteAvecDocs(kitDocumentsDuStore(), params)
}
