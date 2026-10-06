// lib/ia/coursDuSoir.ts
// « Cours du soir » d'AERORISQ : entretien autonome du Kit Inspecteur quand
// personne ne travaille — réchauffe Ollama, extrait le texte des documents
// sans contenu, rapporte. Idempotent (extraireTexteDocument ne refait jamais
// un doc déjà extrait sauf changement de version), borné (maxDocs, séquentiel
// pour ne pas saturer le CPU), non réentrant (onglet + pilote peuvent appeler
// en même temps sans doublon). Déclenché : outil pilote `cours_du_soir`,
// onglet caché (ollamaWarmup).

'use client'

import { useAppStore } from '@/lib/store'
import { prechaufferOllama } from './ollamaWarmup'

export interface RapportCoursDuSoir {
  /** Ollama réchauffé (modèle en RAM). */
  chaud: boolean
  /** Vrai si une session tournait déjà (appel ignoré, sans doublon). */
  dejaEnCours: boolean
  examines: number
  extraits: number
  caracteresAjoutes: number
  echecs: string[]
  /** Docs restant sans texte après cette passe (0 = kit à jour). */
  reste: number
  /** OCR vision : pages transcrites cette passe + docs terminés. */
  ocrPages: number
  ocrTermines: number
  /** § citables créés cette passe (docs avec texte mais sans extraits). */
  extraitsCrees: number
  dureeMs: number
}

let enCours = false

/** Docs à jour/en révision sans texte extractible à relire. */
export function docsSansTexte(): Array<{ id: string; nom: string; fichier_nom: string }> {
  const docs = useAppStore.getState().kitDocuments || []
  return docs
    .filter(d =>
      (d.etat === 'a_jour' || d.etat === 'en_revision') &&
      (!d.contenu_complet || d.contenu_complet.length < 50) &&
      !!d.fichier_url,
    )
    .map(d => ({ id: d.id, nom: d.nom, fichier_nom: d.fichier_nom || '' }))
}

export async function coursDuSoir(opts?: {
  maxDocs?: number
  /** OCR vision des PDF scannés toujours sans texte (défaut false : passe rapide). */
  ocr?: boolean
  /** Pages vision max par passe OCR (défaut 50 : un gros scanné passe d'un coup). */
  ocrPagesMax?: number
  onEtape?: (message: string) => void
}): Promise<RapportCoursDuSoir> {
  const debut = Date.now()
  const maxDocs = Math.min(10, Math.max(1, opts?.maxDocs ?? 3))
  const ocrPagesMax = Math.min(200, Math.max(1, opts?.ocrPagesMax ?? 50))
  if (enCours) {
    return {
      chaud: false, dejaEnCours: true, examines: 0, extraits: 0,
      caracteresAjoutes: 0, echecs: [], reste: docsSansTexte().length,
      ocrPages: 0, ocrTermines: 0, extraitsCrees: 0, dureeMs: Date.now() - debut,
    }
  }
  enCours = true
  try {
    const dire = opts?.onEtape ?? (() => {})
    let chaud = false
    try {
      chaud = await prechaufferOllama()
    } catch { /* Ollama éteint : on extrait quand même (PDF.js, pas de LLM) */ }
    dire(chaud ? '🔥 Ollama chaud.' : '⚠️ Ollama injoignable — extraction sans LLM.')

    const cibles = docsSansTexte().slice(0, maxDocs)
    const { kitDocAgent } = await import('@/lib/ia/agents/kitDocAgent')
    let extraits = 0
    let caracteresAjoutes = 0
    const echecs: string[] = []
    for (const cible of cibles) {
      try {
        const avant = (useAppStore.getState().kitDocuments.find(d => d.id === cible.id)?.contenu_complet || '').length
        dire(`📖 Lecture : ${cible.nom}…`)
        await kitDocAgent.extraireTexteDocument(cible.id)
        const apres = (useAppStore.getState().kitDocuments.find(d => d.id === cible.id)?.contenu_complet || '').length
        if (apres >= 50 && avant < 50) extraits++
        caracteresAjoutes += Math.max(0, apres - avant)
      } catch (err) {
        echecs.push(`${cible.nom} (${(err as Error)?.message || 'échec'})`)
      }
    }
    // Phase 2 — OCR vision des PDF scannés toujours sans texte (avec reprise).
    // Seule cette phase lit les scans ; la génération des items/checklists
    // utilisera le texte aux prochains besoins (l'IA « apprend » sans coût
    // immédiat : pas de génération LLM en fond).
    let ocrPages = 0
    let ocrTermines = 0
    if (opts?.ocr) {
      const { kitDocAgent: agent } = await import('@/lib/ia/agents/kitDocAgent')
      for (const cible of docsSansTexte().filter(d => /\.pdf$/i.test(d.fichier_nom))) {
        if (ocrPages >= ocrPagesMax) break
        try {
          dire(`👁 OCR : ${cible.nom}…`)
          const r = await agent.ocrVisionIntegral(cible.id, {
            maxPages: ocrPagesMax - ocrPages,
            onEtape: dire,
          })
          ocrPages += r.pagesLues
          if (r.termine) ocrTermines++
        } catch (err) {
          echecs.push(`${cible.nom} (OCR : ${(err as Error)?.message || 'échec'})`)
        }
      }
    }
    // Phase 3 — § citables : tout doc avec texte mais sans extraits (dont les
    // 10 extraits en passe 1) en reçoit depuis ses chapitres. Rapide, local,
    // sans LLM ; les existants manuels sont préservés.
    let extraitsCrees = 0
    try {
      const { kitDocAgent: agentExtraits } = await import('@/lib/ia/agents/kitDocAgent')
      const avecTexte = (useAppStore.getState().kitDocuments || []).filter(d =>
        (d.contenu_complet || '').trim().length >= 200 && (d.extraits || []).length === 0,
      ).slice(0, 10)
      for (const d of avecTexte) {
        try {
          if (await agentExtraits.synchroniserExtraits(d.id)) {
            extraitsCrees++
            dire(`§ Extraits créés : ${d.nom}`)
          }
        } catch { /* doc suivant */ }
      }
    } catch { /* RAG inchangé si échec */ }
    const reste = docsSansTexte().length
    dire(reste === 0 ? '✅ Kit à jour.' : `⏳ Reste ${reste} document(s) sans texte.`)
    return {
      chaud, dejaEnCours: false, examines: cibles.length, extraits,
      caracteresAjoutes, echecs, reste, ocrPages, ocrTermines, extraitsCrees,
      dureeMs: Date.now() - debut,
    }
  } finally {
    enCours = false
  }
}
