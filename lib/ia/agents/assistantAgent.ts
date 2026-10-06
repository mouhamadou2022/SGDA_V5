// lib/ia/agents/assistantAgent.ts
// Agent Assistant Conversationnel — version LLM hybride
// Architecture : données locales (store) + Groq LLM (Llama 3.3 70B gratuit)
// Fallback local si API indisponible

'use client'

import { useAppStore, ProfilRisque } from '@/lib/store'
import { normaliserRecherche } from '@/lib/domaines'

// ============================================================
// TYPES
// ============================================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  actions?: ActionSuggestion[]
  sources?: SourceReference[]
}

export interface ActionSuggestion {
  id: string
  label: string
  description: string
  type: 'navigate' | 'action' | 'query' | 'generate'
  target?: string
  params?: Record<string, unknown>
}

export interface SourceReference {
  type: 'reglementation' | 'procedure' | 'donnee' | 'historique'
  title: string
  reference: string
  url?: string
}

export interface ChatRequest {
  message: string
  contexte?: {
    module?: string
    aerodromeId?: string
    surveillanceId?: string
    ecartId?: string
    userId?: string
    historiqueMessages?: ChatMessage[]
  }
  userRole: string
}

export interface ChatResponse {
  message: string
  actions: ActionSuggestion[]
  sources: SourceReference[]
  confidence: number
}

export interface ContextualHelpRequest {
  module: string
  currentPage?: string
  userRole: string
  userLevel?: 'debutant' | 'confirme' | 'expert'
}

export interface ContextualHelpResponse {
  titre: string
  description: string
  etapes: string[]
  raccourcis: { action: string; shortcut?: string }[]
  tips: string[]
}

export interface ProactiveSuggestion {
  id: string
  type: 'alerte' | 'rappel' | 'opportunite' | 'action'
  titre: string
  description: string
  priorite: 'haute' | 'moyenne' | 'basse'
  action: ActionSuggestion
  declencheur: string
}

// ============================================================
// RACCOURCIS CLAVIER
// ============================================================

const RACCOURCIS: Record<string, { action: string; shortcut?: string }> = {
  'profil_risque': { action: 'Ouvrir le module Profil de Risque', shortcut: 'G+P' },
  'certification': { action: 'Ouvrir le module Certification', shortcut: 'G+C' },
  'planning': { action: 'Ouvrir le module Planning', shortcut: 'G+L' },
  'surveillance': { action: 'Ouvrir le module Surveillance', shortcut: 'G+S' },
  'ecarts': { action: 'Ouvrir le module Écarts et PAC', shortcut: 'G+E' },
  'recherche': { action: 'Ouvrir la recherche globale', shortcut: 'Ctrl+K' },
  'aide': { action: 'Afficher l\'aide contextuelle', shortcut: 'F1' },
}

// ============================================================
// RÉSOLUTION DE SITE NOMMÉ (testable)
// ============================================================

export interface AerodromeMinimal {
  id: string
  code_oaci?: string
  nom?: string
}

export function normaliserNomSite(s: string): string {
  return normaliserRecherche(s)
}

/** Initiales d'un nom (« Aéroport International Blaise Diagne » → « aibd »). */
export function initialesNomSite(nom: string): string {
  return normaliserNomSite(nom || '')
    .split(' ')
    .filter((w) => w.length > 2)
    .map((w) => w[0])
    .join('')
}

/**
 * Résout un site nommé dans une question vers l'aérodrome du référentiel,
 * SANS rien hardcoder (ni codes, ni alias) : code OACI exact, initiales
 * (AIBD…), nom complet, mot significatif. Retourne undefined si ambigu/absent.
 */
export function resoudreSiteNomme<T extends AerodromeMinimal>(question: string, aerodromes: T[] | undefined): T | undefined {
  if (!aerodromes || aerodromes.length === 0) return undefined
  const q = ` ${normaliserNomSite(question)} `
  const codeMatch = /[^a-z]([a-z]{4})[^a-z]/.exec(q)
  if (codeMatch) {
    const parCode = aerodromes.find((a) => (a.code_oaci || '').toLowerCase() === codeMatch[1])
    if (parCode) return parCode
  }
  const mots = q.split(' ').filter((w) => w.length >= 3)
  for (const w of mots) {
    const parInitiales = aerodromes.find((a) => {
      const ini = initialesNomSite(a.nom || '')
      return ini.length >= 3 && ini === w
    })
    if (parInitiales) return parInitiales
  }
  const candidats = aerodromes.filter((a) => {
    const nom = normaliserNomSite(a.nom || '')
    return nom.length >= 4 && q.includes(` ${nom} `)
  })
  if (candidats.length > 0) return candidats[0]
  const significatifs = q.split(' ').filter((w) => w.length >= 5)
  for (const w of significatifs) {
    const trouve = aerodromes.find((a) => normaliserNomSite(a.nom || '').includes(w))
    if (trouve) return trouve
  }
  return undefined
}

// ============================================================
// AGENT ASSISTANT
// ============================================================

export class AssistantAgent {
  private responseCache = new Map<string, { timestamp: number; response: ChatResponse }>()
  private initialized: boolean = false
  private conversationHistory: Map<string, ChatMessage[]> = new Map()
  private llmAvailable: boolean | null = null // null = non testé encore

  async init(_storeData: unknown): Promise<void> {
    this.initialized = true
  }

  // ============================================================
  // MÉTHODE PRINCIPALE
  // ============================================================

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const message = request.message.toLowerCase().trim()
    const contexte = request.contexte || {}

    this.addToHistory(contexte, {
      id: this.generateId(),
      role: 'user',
      content: request.message,
      timestamp: new Date().toISOString(),
    })

    let response: ChatResponse

    // Commandes purement structurelles — pas besoin du LLM
    if (this.matches(message, ['raccourci', 'touche', 'keyboard', 'shortcut'])) {
      response = this.handleShortcuts()
    } else if (this.estDemandePdf(request.message)) {
      // Fichier PDF demandé : réponse déterministe (le LLM nie
      // systématiquement cette capacité par habitude — on ne lui demande pas).
      response = this.handlePdfIntent()
    } else if (this.estSalutation(message)) {
      // « bonjour » seul : réponse brève SANS appel LLM ni déballage du contexte
      // (sinon le LLM disserte sur les écarts critiques pour un simple salut).
      response = this.handleGreeting()
    } else if (this.matches(message, ['merci', 'thanks', 'ok', 'super', 'parfait'])) {
      response = this.handleThanks()
    } else {
      // Toutes les autres questions → LLM avec contexte riche du store
      response = await this.handleWithLLM(request)
    }

    this.addToHistory(contexte, {
      id: this.generateId(),
      role: 'assistant',
      content: response.message,
      timestamp: new Date().toISOString(),
      actions: response.actions,
      sources: response.sources,
    })

    return response
  }

  // ============================================================
  // APPEL LLM — cœur du nouveau système
  // ============================================================

  private async handleWithLLM(request: ChatRequest): Promise<ChatResponse> {
    const store = useAppStore.getState()
    const contexte = request.contexte || {}

    // 1. Construire le contexte riche depuis le store
    const aerodromeCtx = contexte.aerodromeId
      ? store.aerodromes?.find((a) => a.id === contexte.aerodromeId)
      : undefined

    // Site nommé dans la question (« Blaise Diagne », « GOOY », « AIBD »…) :
    // on le résout depuis le référentiel et on recentre le contexte dessus,
    // même depuis le dashboard (aucun aérodrome sélectionné).
    const siteNomme = resoudreSiteNomme(request.message, store.aerodromes)
    // Identifiant de site effectif : question explicite > sélection courante.
    const siteIdEffectif = siteNomme?.id || contexte.aerodromeId
    const aeroEffectif = siteNomme || aerodromeCtx
    const profilEffectif = siteIdEffectif ? store.profilsRisque?.[siteIdEffectif] : undefined

    const ecartsOuvertsSite = store.ecarts
      ? store.ecarts
          .filter((e) => !siteIdEffectif || e.aerodrome_id === siteIdEffectif)
          .filter((e) => e.statut !== 'cloture')
      : []
    const totalEcartsOuverts = ecartsOuvertsSite.length
    const ecartsCtx = ecartsOuvertsSite
          .slice(0, 10)
          .map((e) => {
            const aeroEcart = store.aerodromes?.find((a) => a.id === e.aerodrome_id)
            return {
              reference: e.reference,
              site: aeroEcart?.code_oaci,
              libelle: e.libelle?.substring(0, 140),
              niveau_risque: e.niveau_risque,
              statut: e.statut,
              jours_restants: e.delai_pac
                ? Math.ceil((new Date(e.delai_pac).getTime() - Date.now()) / 86400000)
                : undefined,
            }
          })

    // Fiche du site demandé : identité + risque + écarts + certification,
    // pour répondre « donne-moi des informations sur X » sans inventer.
    const siteFocus = siteNomme
      ? (() => {
          const p = store.profilsRisque?.[siteNomme.id]
          const ouverts = (store.ecarts || []).filter((e) => e.aerodrome_id === siteNomme.id && e.statut !== 'cloture')
          const critiques = ouverts.filter((e) => e.niveau_risque === 'critique').map((e) => ({
            reference: e.reference,
            libelle: e.libelle?.substring(0, 140),
            statut: e.statut,
            ref_reglementaire: e.ref_reglementaire || null,
            delai_regularisation: (e as any).delai_regularisation || null,
          }))
          const cert = (store.certifications || []).find((c) => c.aerodrome_id === siteNomme.id)
          const dernieres = (store.surveillances || [])
            .filter((s) => s.aerodrome_id === siteNomme.id)
            .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())
            .slice(0, 3)
          return {
            code_oaci: siteNomme.code_oaci,
            nom: siteNomme.nom,
            type: siteNomme.type,
            region: siteNomme.region,
            sgs: siteNomme.statut_sgs || 'complet',
            score: p != null ? Math.round(p.score_global) : null,
            niveau: (p as any)?.niveau ?? null,
            certification: (cert as any)?.statut_global || 'aucun dossier',
            nb_ecarts_ouverts: ouverts.length,
            critiques: critiques.slice(0, 5),
            dernieres_surveillances: dernieres.map((s) => ({ type: s.type, date: s.date_debut, statut: s.statut, score: s.score_global ?? null })),
          }
        })()
      : undefined

    const surveillanceCtx = contexte.surveillanceId
      ? store.surveillances?.find((s) => s.id === contexte.surveillanceId)
      : undefined

    // Ancrage ciblé : si la question vise un objet précis, on l'injecte en
    // intégralité pour que le LLM n'ait pas à l'inventer.
    const qLower = request.message.toLowerCase()
    const refEcartMatch = /ECA-\d{4}-\d+/i.exec(request.message)
    const ecartVise = refEcartMatch
      ? store.ecarts?.find((e) => e.reference?.toUpperCase() === refEcartMatch[0].toUpperCase())
      : undefined
    const ecartDetail = ecartVise
      ? (() => {
          const aeroEcart = store.aerodromes?.find((a) => a.id === ecartVise.aerodrome_id)
          const survLiee = ecartVise.surveillance_id
            ? store.surveillances?.find((s) => s.id === ecartVise.surveillance_id)
            : undefined
          return {
            reference: ecartVise.reference,
            site: aeroEcart?.code_oaci,
            libelle: ecartVise.libelle?.substring(0, 300),
            domaine: ecartVise.domaine,
            ref_reglementaire: ecartVise.ref_reglementaire,
            niveau_risque: ecartVise.niveau_risque,
            statut: ecartVise.statut,
            delai_pac: ecartVise.delai_pac,
            delai_regularisation: ecartVise.delai_regularisation,
            surveillance_liee: survLiee
              ? { type: survLiee.type, date: survLiee.date_debut, statut: survLiee.statut }
              : undefined,
            pac: ecartVise.pac
              ? {
                  nb_actions: ecartVise.pac.actions?.length || 0,
                  actions: (ecartVise.pac.actions || []).slice(0, 5).map((a) => ({
                    description: a.description?.substring(0, 120),
                    responsable: a.responsable,
                    date_prevue: a.date_prevue,
                  })),
                  soumis_le: ecartVise.pac.soumis_le,
                  version: ecartVise.pac.version,
                }
              : undefined,
            evaluation_pac: ecartVise.evaluation_pac
              ? {
                  note_globale: ecartVise.evaluation_pac.note_globale,
                  decision: ecartVise.evaluation_pac.decision,
                  commentaire: ecartVise.evaluation_pac.commentaire_refus?.substring(0, 200),
                }
              : undefined,
            preuves: ecartVise.preuves
              ? {
                  nb_fichiers: ecartVise.preuves.fichiers?.length || 0,
                  validation: ecartVise.validation_preuves?.decision,
                }
              : undefined,
          }
        })()
      : undefined

    // Détails PAC : question PAC sans référence → focus sur les PAC en jeu du site.
    const veutPac = /pac\b|plan d.action|corrective/.test(qLower)
    const pacsCtx = !ecartDetail && veutPac && siteIdEffectif
      ? (store.ecarts || [])
          .filter((e) => e.aerodrome_id === siteIdEffectif && e.statut !== 'cloture' && (e.pac || e.evaluation_pac))
          .slice(0, 3)
          .map((e) => ({
            reference: e.reference,
            statut: e.statut,
            nb_actions: e.pac?.actions?.length || 0,
            note_globale: e.evaluation_pac?.note_globale,
            decision: e.evaluation_pac?.decision,
          }))
      : undefined

    // Surveillances récentes : question rapport/surveillance → 3 dernières du site.
    const veutSurv = /rapport|surveillance|inspection|checklist|conformit/.test(qLower)
    const survsCtx = !surveillanceCtx && veutSurv && siteIdEffectif
      ? (store.surveillances || [])
          .filter((s) => s.aerodrome_id === siteIdEffectif)
          .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())
          .slice(0, 3)
          .map((s) => ({
            type: s.type,
            date: s.date_debut,
            statut: s.statut,
            score: s.score_global ?? null,
            nb_ecarts: (store.ecarts || []).filter((e) => e.surveillance_id === s.id).length,
            rapport_disponible: !!(s.rapport_html || s.rapport_type || s.rapport_fichier_url),
          }))
      : undefined

    // Autres modules : résumés compacts quand la question les vise (mode conseil
    // = le LLM ne voit QUE ce qu'on lui injecte — sans ça, il invente).
    const blocsModules: string[] = []
    if (/formation|competence|inspecteur/.test(qLower)) {
      const forms = (store.formations || []) as any[]
      const parStatut: Record<string, number> = {}
      for (const f of forms) parStatut[f.statut || '?'] = (parStatut[f.statut || '?'] || 0) + 1
      const recentes = [...forms]
        .sort((a, b) => new Date(b.date || '-').getTime() - new Date(a.date || '-').getTime())
        .slice(0, 3)
      blocsModules.push(
        `FORMATIONS : ${forms.length} total (${Object.entries(parStatut).map(([k, v]) => `${v} ${k}`).join(', ') || 'aucune'}).` +
        (recentes.length > 0 ? `\nDernières :\n` + recentes.map((f) => `- ${f.titre || '?'} — ${f.date || '?'} — ${f.statut || ''}`).join('\n') : '')
      )
    }
    if (/dossier/.test(qLower)) {
      const doss = ((store as any).dossiers || []).filter((d: any) => d.statut !== 'archive')
        .filter((d: any) => !siteIdEffectif || !d.aerodrome_id || d.aerodrome_id === siteIdEffectif)
        .slice(0, 5)
      blocsModules.push(
        `DOSSIERS (${doss.length} affichés) :\n` +
        (doss.map((d: any) => `- ${d.reference || '?'} — ${(d.titre || '').substring(0, 70)} — ${d.statut} — ${d.progression || 0}% — limite ${d.date_limite || '—'}`).join('\n') || 'Aucun dossier en cours.')
      )
    }
    if (/evenement|incident|accident/.test(qLower)) {
      const evts = (store.evenements || [])
        .filter((e) => !siteIdEffectif || e.aerodrome_id === siteIdEffectif)
        .sort((a, b) => new Date(b.date || '-').getTime() - new Date(a.date || '-').getTime())
        .slice(0, 3)
      blocsModules.push(
        `ÉVÉNEMENTS RÉCENTS :\n` +
        (evts.map((e) => `- ${(e.type || '').replace(/_/g, ' ')} — ${e.gravite || ''} — ${e.date || '?'} (${e.statut || ''})`).join('\n') || 'Aucun événement récent.')
      )
    }
    if (/enquete|sondage|questionnaire/.test(qLower)) {
      const enqs = [...(store.enquetes || [])].slice(0, 5)
      blocsModules.push(
        `ENQUÊTES (${(store.enquetes || []).length} total) :\n` +
        (enqs.map((e: any) => {
          const nb = ((store as any).reponsesEnquetes || []).filter((r: any) => r.enquete_id === e.id).length
          return `- ${e.reference || '?'} — ${(e.titre || '').substring(0, 70)} — ${e.statut} — ${nb} réponse(s)`
        }).join('\n') || 'Aucune enquête.')
      )
    }
    if (/registre|archive/.test(qLower)) {
      const regs = [...((store as any).registreEntries || [])]
        .filter((e: any) => !siteIdEffectif || !e.aerodrome_id || e.aerodrome_id === siteIdEffectif)
        .sort((a: any, b: any) => new Date(b.date_entree || '-').getTime() - new Date(a.date_entree || '-').getTime())
        .slice(0, 5)
      blocsModules.push(
        `REGISTRE (${((store as any).registreEntries || []).length} entrées) :\n` +
        (regs.map((e: any) => `- ${e.reference || '?'} — ${(e.titre || '').substring(0, 70)} — ${e.type} — ${e.date_entree || '?'}`).join('\n') || 'Registre vide.')
      )
    }
    if (/kit\b|document|oaci|reglementaire/.test(qLower)) {
      const docs = (store.kitDocuments || []) as any[]
      const obsoletes = docs.filter((d) => d.etat === 'obsolete').length
      const enRevision = docs.filter((d) => d.etat === 'en_revision').length
      blocsModules.push(`KIT INSPECTEUR : ${docs.length} document(s) — ${obsoletes} obsolète(s), ${enRevision} en révision.`)
    }
    if (/charge|tache|surcharge|workload/.test(qLower)) {
      const survsEnCours = (store.surveillances || []).filter((s) => s.statut === 'en_cours').length
      const pacASuivre = (store.ecarts || []).filter((e) => ['pac_soumis', 'preuves_soumises'].includes(e.statut)).length
      const dossEnCours = ((store as any).dossiers || []).filter((d: any) => d.statut === 'en_cours').length
      const nbInsp = (store.inspecteurs || []).filter((i) => !i.deleted_at).length
      blocsModules.push(`CHARGE : ${nbInsp} inspecteur(s) — ${survsEnCours} surveillance(s) en cours, ${pacASuivre} PAC/preuves à évaluer, ${dossEnCours} dossier(s) en cours.`)
    }
    if (/\bml\b|modele|apprentissage|recalibrage|intelligence artificielle/.test(qLower)) {
      const st = store as any
      const alertes = (st.recalibrationAlerts || []).filter((a: any) => !a.traitee).length
      blocsModules.push(`ML : modèle ${st.activeModelName || 'non défini'} — échantillons RF ${st.rfSamplesCount || 0} — ${alertes} alerte(s) de recalibrage en attente — ${(st.learningFeedbacks || []).length} feedback(s).`)
    }
    if (/message|messagerie|mail|courrier|non.lu/.test(qLower) && (contexte as any).userId) {
      const uid = (contexte as any).userId as string
      const recus = ((store as any).messages || []).filter((m: any) =>
        (Array.isArray(m.to_id) ? m.to_id.includes(uid) : m.to_id === uid) ||
        (Array.isArray(m.cc_id) && m.cc_id.includes(uid)))
      const nonLus = recus.filter((m: any) => !(m.read_by || []).includes(uid))
      blocsModules.push(
        `MESSAGERIE (utilisateur connecté) : ${nonLus.length} non-lu(s) / ${recus.length} reçu(s).` +
        (nonLus.slice(0, 3).map((m: any) => `\n- ${m.from_nom || '?'} : ${m.subject || '(sans objet)'}`).join('') || '')
      )
    }

    // Plannings : question planning/mission → 5 prochains + en retard du site.
    const veutPlanning = /planning|mission|programm|année|annee/.test(qLower)
    const planningsCtx = veutPlanning && siteIdEffectif
      ? (store.plannings || [])
          .filter((p) => p.aerodrome_id === siteIdEffectif && !['archivee', 'terminee'].includes(p.statut))
          .sort((a, b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime())
          .slice(0, 5)
          .map((p) => ({
            type: p.type,
            date_debut: p.date_debut,
            date_fin: p.date_fin,
            statut: p.statut,
            proposition: !!p.est_proposition,
          }))
      : undefined

    const checklistCtx = contexte.surveillanceId
      ? (() => {
          const items = store.checklistItems?.[contexte.surveillanceId] || []
          const sa = items.filter((i) => i.resultat === 'SA').length
          const ns = items.filter((i) => i.resultat === 'NS').length
          const nv = items.filter((i) => i.resultat === 'NV').length
          return items.length > 0
            ? { total: items.length, sa, ns, nv, progression: Math.round(((sa + ns) / items.length) * 100) }
            : undefined
        })()
      : undefined

    // 2. Construire l'historique pour la continuité de la conversation
    const sessionId = contexte.module || 'default'
    const localHistory = this.conversationHistory.get(sessionId) || []
    const recentHistory = localHistory
      .slice(-8)
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    // 3. Appel API avec cache 5 minutes (clé = message + périmètre, jamais
    // le message seul : sinon une réponse d'un site fuit vers un autre).
    const cacheKey = `${contexte.module || ''}|${contexte.aerodromeId || ''}|${contexte.surveillanceId || ''}|${request.message.substring(0, 100)}`
    const cached = this.responseCache?.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < 300_000) {
      return cached.response
    }

    try {
      const apiResponse = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: request.message,
          contexte: {
            aerodrome: aeroEffectif
              ? { code_oaci: aeroEffectif.code_oaci, nom: aeroEffectif.nom, categorie: aeroEffectif.categorie_sslia, type: aeroEffectif.type }
              : undefined,
            profil_risque: profilEffectif
              ? {
                  score_global: profilEffectif.score_global,
                  niveau: profilEffectif.niveau,
                  tendance: profilEffectif.tendance,
                  c1: profilEffectif.c1, c2: profilEffectif.c2, c3: profilEffectif.c3,
                  c4: profilEffectif.c4, c5: profilEffectif.c5,
                  alerte: profilEffectif.proactive_alert?.message_court,
                  statut_sgs: aeroEffectif?.statut_sgs,
                }
              : undefined,
            site_focus: siteFocus,
            ecarts_actifs: ecartsCtx.length > 0 ? ecartsCtx : undefined,
            total_ecarts_ouverts: totalEcartsOuverts,
            surveillance_en_cours: surveillanceCtx
              ? {
                  type: surveillanceCtx.type,
                  date: surveillanceCtx.date_debut,
                  statut: surveillanceCtx.statut,
                  taux_conformite: checklistCtx?.progression,
                }
              : undefined,
            ecart_detail: ecartDetail,
            pacs_en_jeu: pacsCtx && pacsCtx.length > 0 ? pacsCtx : undefined,
            surveillances_recentes: survsCtx && survsCtx.length > 0 ? survsCtx : undefined,
            plannings: planningsCtx && planningsCtx.length > 0 ? planningsCtx : undefined,
            blocs_modules: blocsModules.length > 0 ? blocsModules : undefined,
            historique: recentHistory,
            module: contexte.module,
          },
        }),
      })

      if (apiResponse.ok) {
        this.llmAvailable = true
        const data = await apiResponse.json()
        const result = this.wrapLLMResponse(data.message, request.message, {
          aerodromeId: siteIdEffectif,
          surveillanceId: contexte.surveillanceId,
          hasCriticalEcarts: ecartsCtx.some((e) => e.niveau_risque === 'critique'),
          profilScore: profilEffectif?.score_global,
          refs: [
            ...(siteFocus ? [{ type: 'donnee' as const, title: `Fiche site ${siteFocus.code_oaci} — ${siteFocus.nom}`, reference: `${siteFocus.niveau ? `risque ${siteFocus.niveau}` : 'risque non calculé'} · ${siteFocus.nb_ecarts_ouverts} écart(s) ouvert(s)` }] : []),
            ...(ecartDetail ? [{ type: 'donnee' as const, title: `Écart ${ecartDetail.reference}`, reference: `${ecartDetail.site || ''} · ${ecartDetail.domaine} · ${ecartDetail.statut}` }] : []),
            ...(surveillanceCtx ? [{ type: 'donnee' as const, title: `Surveillance ${surveillanceCtx.type} du ${surveillanceCtx.date_debut}`, reference: `Statut ${surveillanceCtx.statut}` }] : []),
            ...(profilEffectif && aeroEffectif && !siteFocus ? [{ type: 'donnee' as const, title: `Profil de risque ${aeroEffectif.code_oaci}`, reference: `Score ${Math.round(profilEffectif.score_global)}/100 (${profilEffectif.niveau})` }] : []),
          ],
        })
        this.responseCache.set(cacheKey, { timestamp: Date.now(), response: result })
        return result
      }

      if (apiResponse.status === 503) {
        const err = await apiResponse.json()
        if (err.code === 'NO_API_KEY') {
          this.llmAvailable = false
          return this.handleNoApiKey()
        }
      }

      throw new Error(`API ${apiResponse.status}`)
    } catch (error) {
      // Fallback local si l'API est indisponible (ne marque pas comme définitivement indisponible — retry possible)
      console.warn('[AssistantAgent] LLM indisponible, fallback local:', error)
      return this.localFallback(request.message, contexte, {
        aerodrome: aeroEffectif,
        profil: profilEffectif,
        ecarts: ecartsCtx,
        checklist: checklistCtx,
      })
    }
  }

  // Ajoute les boutons d'action contextuels à une réponse LLM
  private wrapLLMResponse(
    message: string,
    originalQuestion: string,
    context: {
      aerodromeId?: string
      surveillanceId?: string
      hasCriticalEcarts?: boolean
      profilScore?: number
      refs?: SourceReference[]
    }
  ): ChatResponse {
    const actions: ActionSuggestion[] = []
    const q = originalQuestion.toLowerCase()

    if (q.includes('risque') || q.includes('score') || q.includes('profil') || q.includes('c1') || q.includes('c2')) {
      actions.push({ id: '1', label: 'Voir profil de risque', description: 'Module profil de risque', type: 'navigate', target: 'risque' })
      if (context.aerodromeId) {
        actions.push({ id: '2', label: 'Voir tendances', description: 'Tendances et prédictions', type: 'navigate', target: 'risque', params: { tab: 'tendances' } })
      }
    } else if (q.includes('écart') || q.includes('pac') || q.includes('non-conformité') || q.includes('nc')) {
      actions.push({ id: '1', label: 'Voir les écarts', description: 'Module écarts et PAC', type: 'navigate', target: 'plans-actions' })
      if (context.hasCriticalEcarts) {
        actions.push({ id: '2', label: 'Filtrer critiques', description: 'Écarts critiques uniquement', type: 'navigate', target: 'plans-actions', params: { filter: 'critique' } })
      }
    } else if (q.includes('checklist') || q.includes('item') || q.includes('sa') || q.includes('ns')) {
      if (context.surveillanceId) {
        actions.push({ id: '1', label: 'Ouvrir la checklist', description: 'Voir les items', type: 'navigate', target: 'checklist', params: { surveillanceId: context.surveillanceId } })
      } else {
        actions.push({ id: '1', label: 'Voir surveillances', description: 'Liste des surveillances', type: 'navigate', target: 'surveillance' })
      }
    } else if (q.includes('planning') || q.includes('mission') || q.includes('inspection')) {
      actions.push({ id: '1', label: 'Voir planning', description: 'Module planning', type: 'navigate', target: 'planning' })
    } else if (q.includes('certification') || q.includes('homologation')) {
      actions.push({ id: '1', label: 'Voir certifications', description: 'Module certification', type: 'navigate', target: 'certification' })
    } else if (q.includes('dossier')) {
      actions.push({ id: '1', label: 'Voir dossiers', description: 'Dossiers techniques', type: 'navigate', target: 'dossiers' })
    } else if (q.includes('formation') || q.includes('compétence') || q.includes('competence') || q.includes('inspecteur')) {
      actions.push({ id: '1', label: 'Voir formations', description: 'Formations et compétences', type: 'navigate', target: 'formation' })
    } else if (q.includes('message') || q.includes('messagerie') || q.includes('mail') || q.includes('courrier')) {
      actions.push({ id: '1', label: 'Voir messagerie', description: 'Messagerie interne', type: 'navigate', target: 'messagerie' })
    } else if (q.includes('événement') || q.includes('evenement') || q.includes('incident') || q.includes('accident')) {
      actions.push({ id: '1', label: 'Voir événements', description: 'Événements de sécurité', type: 'navigate', target: 'evenements' })
    } else if (q.includes('aérodrome') || q.includes('aerodrome') || q.includes('site')) {
      actions.push({ id: '1', label: 'Voir aérodromes', description: 'Réseau des aérodromes', type: 'navigate', target: 'aerodromes' })
    } else if (q.includes('registre') || q.includes('archive')) {
      actions.push({ id: '1', label: 'Voir registres', description: 'Archives et registres', type: 'navigate', target: 'registres' })
    } else if (q.includes('kit') || q.includes('document') || q.includes('oaci') || q.includes('réglementaire') || q.includes('reglementaire')) {
      actions.push({ id: '1', label: 'Voir kit inspecteur', description: 'Documentation et référentiels', type: 'navigate', target: 'kit' })
    } else if (q.includes('enquête') || q.includes('enquete') || q.includes('sondage') || q.includes('questionnaire')) {
      actions.push({ id: '1', label: 'Voir enquêtes', description: 'Enquêtes et réponses', type: 'navigate', target: 'enquetes' })
    } else if (q.includes('charge') || q.includes('tâche') || q.includes('tache') || q.includes('surcharge') || q.includes('workload')) {
      actions.push({ id: '1', label: 'Voir charge de travail', description: 'Charge des inspecteurs', type: 'navigate', target: 'charge' })
    } else if (q.includes('signature')) {
      actions.push({ id: '1', label: 'Voir signatures', description: 'Signatures DG', type: 'navigate', target: 'signatures' })
    } else if (q.includes('rapport') || q.includes('génère') || q.includes('genere')) {
      if (context.surveillanceId) {
        actions.push({ id: '1', label: 'Générer rapport', description: 'Générer le rapport de surveillance', type: 'generate', target: 'report', params: { surveillanceId: context.surveillanceId } })
      }
    }

    // Toujours proposer une aide si le score est critique
    if (context.profilScore !== undefined && context.profilScore < 30) {
      actions.push({ id: 'alert', label: 'Voir alertes', description: 'Alertes proactives', type: 'navigate', target: 'risque', params: { tab: 'alertes' } })
    }

    return { message, actions, sources: context.refs || [], confidence: 90 }
  }

  // ============================================================
  // FALLBACK LOCAL — si API non configurée ou indisponible
  // ============================================================

  private localFallback(
    message: string,
    contexte: ChatRequest['contexte'],
    data: {
      aerodrome?: { code_oaci?: string; nom?: string; categorie_sslia?: string; type?: string; statut_sgs?: string }
      profil?: ProfilRisque
      ecarts?: Array<{ reference: string; libelle?: string; niveau_risque: string; statut: string; jours_restants?: number }>
      checklist?: unknown
    }
  ): ChatResponse {
    const msg = message.toLowerCase()

    if (this.matches(msg, ['bonjour', 'salut', 'hello'])) {
      return {
        message: `Bonjour ! Je suis l'assistant SGDA. Pour activer mes capacités IA complètes, configurez la clé GROQ_API_KEY dans votre fichier .env.local.\n\nEn attendant, je peux vous donner des informations de base sur vos données.`,
        actions: [
          { id: '1', label: 'Voir profil de risque', description: '', type: 'navigate', target: 'risque' },
          { id: '2', label: 'Voir les écarts', description: '', type: 'navigate', target: 'plans-actions' },
        ],
        sources: [],
        confidence: 60,
      }
    }

    if (data.profil && this.matches(msg, ['profil', 'risque', 'score', 'c1', 'c2', 'c3', 'c4', 'c5'])) {
      const p = data.profil
      return {
        message: `**Profil de risque — ${data.aerodrome?.code_oaci || ''}**\n\nScore global : **${p.score_global}/100** (${p.niveau})\nTendance : ${p.tendance === 'hausse' ? '↗ Hausse' : p.tendance === 'baisse' ? '↘ Baisse' : '→ Stable'}\n\n${data.aerodrome?.statut_sgs === 'non_applicable' ? '- SGS : non applicable (exclu du score global)\n' : `- C1 Maturité SGS : ${p.c1}/100\n`}- C2 Efficacité PAC : ${p.c2}/100\n- C3 Conformité : ${p.c3}/100\n- C4 Charge critique : ${p.c4}/100\n- C5 Résilience : ${p.c5}/100`,
        actions: [{ id: '1', label: 'Voir détails', description: '', type: 'navigate', target: 'risque' }],
        sources: [],
        confidence: 80,
      }
    }

    if (data.ecarts && data.ecarts.length > 0 && this.matches(msg, ['écart', 'pac', 'non-conformité'])) {
      const critiques = data.ecarts.filter((e) => e.niveau_risque === 'critique')
      return {
        message: `**Écarts actifs : ${data.ecarts.length}**\n\nCritiques : ${critiques.length}\n${critiques.slice(0, 3).map((e) => `- ${e.reference} : ${e.libelle}`).join('\n')}`,
        actions: [{ id: '1', label: 'Voir les écarts', description: '', type: 'navigate', target: 'plans-actions' }],
        sources: [],
        confidence: 80,
      }
    }

    return {
      message: `L'assistant IA complet nécessite la clé GROQ_API_KEY (gratuite sur console.groq.com).\n\nAjoutez dans .env.local :\n\`\`\`\nGROQ_API_KEY=gsk_votre_cle_ici\n\`\`\`\n\nSans IA, je peux afficher vos données mais ne peux pas répondre à vos questions métier.`,
      actions: [
        { id: '1', label: 'Voir profil de risque', description: '', type: 'navigate', target: 'risque' },
        { id: '2', label: 'Voir les écarts', description: '', type: 'navigate', target: 'plans-actions' },
      ],
      sources: [],
      confidence: 40,
    }
  }

  private handleNoApiKey(): ChatResponse {
    return {
      message: `**Configuration requise**\n\nPour activer l'assistant IA, vous devez configurer une clé API Groq (gratuite).\n\n**Étapes :**\n1. Créez un compte sur [console.groq.com](https://console.groq.com)\n2. Générez une clé API (gratuit)\n3. Ajoutez dans votre fichier \`.env.local\` :\n\`\`\`\nGROQ_API_KEY=gsk_votre_cle_ici\n\`\`\`\n4. Redémarrez le serveur Next.js\n\n**Limites gratuites :** 14 400 requêtes/jour — largement suffisant pour l'usage SGDA.`,
      actions: [],
      sources: [],
      confidence: 100,
    }
  }

  // ============================================================
  // RÉPONSES LOCALES SIMPLES
  // ============================================================

  private handleShortcuts(): ChatResponse {
    return {
      message: `**Raccourcis clavier SGDA**

| Action | Raccourci |
|--------|-----------|
| Profil de Risque | G+P |
| Certification | G+C |
| Planning | G+L |
| Surveillance | G+S |
| Écarts et PAC | G+E |
| Recherche globale | Ctrl+K |
| Aide contextuelle | F1 |

**Commandes :**
- \`@module\` — Aller directement à un module
- \`/search terme\` — Rechercher dans SGDA`,
      actions: [],
      sources: [],
      confidence: 100,
    }
  }

  private handleThanks(): ChatResponse {
    return {
      message: `Je vous en prie ! N'hésitez pas si vous avez d'autres questions sur vos missions ou la réglementation.`,
      actions: [{ id: '1', label: 'Suggestions intelligentes', description: 'Voir les alertes proactives', type: 'action', target: 'suggestions' }],
      sources: [],
      confidence: 100,
    }
  }

  /**
   * Intention fichier PDF : l'utilisateur veut TÉLÉCHARGER (pas seulement lire).
   * Exige un marqueur explicite de fichier (pdf, télécharger, fichier, générer+pdf…),
   * sinon « fais un rapport sur X » reste une demande de contenu textuel.
   */
  private estDemandePdf(messageBrut: string): boolean {
    const m = messageBrut.toLowerCase()
    if (!m.includes('pdf') && !m.includes('télécharg') && !m.includes('telecharg')) return false
    return /pdf|télécharg|telecharg|fichier|export/.test(m)
  }

  private handlePdfIntent(): ChatResponse {
    return {
      message: `Pour un **fichier PDF téléchargeable** (vrai document ANACIM, jamais de contenu factice), cliquez ci-dessous : cela rebascule en **Mode action** et régénère le document depuis les données réelles — fiche briefing ou checklist par site, rapport national de certification/homologation. Chaque étape reste confirmée par vous.\n\nSi vous vouliez seulement *lire* le contenu ici, reformulez sans « pdf » (ex. « situation détaillée de Tambacounda »).`,
      actions: [{ id: 'pdf', label: 'Générer le PDF (Mode action)', description: 'Télécharge le vrai document via le pilote', type: 'generate', target: 'report' }],
      sources: [],
      confidence: 100,
    }
  }

  /** Vrai seulement pour un salut isolé (« bonjour », « salut ! »…), pas « bonjour, détaille l'écart X ». */
  private estSalutation(messageNormalise: string): boolean {
    const t = messageNormalise.trim()
    if (t.length > 28) return false
    return ['bonjour', 'bonsoir', 'salut', 'hello', 'coucou', 'slt', 'yo', 'hey'].some(
      (g) => t === g || t.startsWith(`${g} `) || t.startsWith(`${g},`) || t.startsWith(`${g}!`),
    )
  }

  private handleGreeting(): ChatResponse {
    return {
      message: `Bonjour ! Je suis AERORISQ, l'assistant SGDA. Posez votre question en langage naturel : un écart par sa référence, un site (ex. « situation de GOBD »), un rapport, une planification… Je réponds depuis les données réelles des modules.`,
      actions: [],
      sources: [],
      confidence: 100,
    }
  }

  // ============================================================
  // AIDE CONTEXTUELLE
  // ============================================================

  async getContextualHelp(request: ContextualHelpRequest): Promise<ContextualHelpResponse> {
    const helpConfig: Record<string, ContextualHelpResponse> = {
      'profil-risque': {
        titre: 'Module Profil de Risque',
        description: 'Analyse le risque des aérodromes selon 5 critères (C1-C5) avec prédictions et alertes proactives.',
        etapes: [
          '1. Sélectionnez un aérodrome dans la liste',
          '2. Consultez le score global et le niveau de risque',
          '3. Analysez les 5 critères détaillés',
          '4. Visualisez les tendances et prédictions',
          '5. Explorez les suggestions intelligentes',
        ],
        raccourcis: [
          { action: 'Recalculer le profil', shortcut: 'Ctrl+R' },
          { action: 'Exporter les données', shortcut: 'Ctrl+E' },
          { action: 'Aide contextuelle', shortcut: 'F1' },
        ],
        tips: [
          'Les prédictions N+1 et N+2 sont basées sur l\'historique',
          'Les alertes proactives s\'affichent automatiquement',
          'Cliquez sur un domaine pour voir les détails',
        ],
      },
      'planning': {
        titre: 'Module Planning',
        description: 'Gérez les plannings de surveillance et les assignations d\'inspecteurs.',
        etapes: [
          '1. Filtrez par aérodrome, type ou statut',
          '2. Créez un nouveau planning',
          '3. Assignez les inspecteurs',
          '4. Lancez la surveillance',
        ],
        raccourcis: [
          { action: 'Nouveau planning', shortcut: 'Ctrl+N' },
          { action: 'Génération N+1', shortcut: 'Ctrl+G' },
          { action: 'Vue calendrier', shortcut: 'Ctrl+D' },
        ],
        tips: [
          'La génération N+1 utilise le profil de risque',
          'Les conflits de dates sont détectés automatiquement',
          'Les inspecteurs sont suggérés par IA',
        ],
      },
      'plans-actions': {
        titre: 'Module Écarts et PAC',
        description: 'Gérez les non-conformités et les plans d\'actions correctives.',
        etapes: [
          '1. Identifiez les écarts prioritaires',
          '2. Analysez le niveau de risque',
          '3. Soumettez un PAC',
          '4. Suivez l\'avancement',
        ],
        raccourcis: [
          { action: 'Nouvel écart', shortcut: 'Ctrl+E' },
          { action: 'Voir statistiques', shortcut: 'Ctrl+S' },
        ],
        tips: [
          'Les écarts critiques ont priorité',
          'Les délais sont calculés automatiquement',
          'L\'IA peut aider à rédiger les libellés',
        ],
      },
    }

    return helpConfig[request.module] || helpConfig['profil-risque']
  }

  // ============================================================
  // SUGGESTIONS PROACTIVES
  // ============================================================

  async getProactiveSuggestions(aerodromeId?: string): Promise<ProactiveSuggestion[]> {
    const store = useAppStore.getState()
    const suggestions: ProactiveSuggestion[] = []

    if (aerodromeId) {
      const profil = store.profilsRisque?.[aerodromeId]
      if (profil && profil.score_global < 30) {
        suggestions.push({
          id: 'risk_critical',
          type: 'alerte',
          titre: '⚠️ Profil de risque critique',
          description: `Score ${profil.score_global}/100 — action immédiate requise.`,
          priorite: 'haute',
          action: { id: 'view_risk', label: 'Voir analyse', description: '', type: 'navigate', target: 'risque' },
          declencheur: `Score ${profil.score_global} < 30`,
        })
      }
    }

    const ecartsCritiques = store.ecarts?.filter((e) => e.niveau_risque === 'critique' && e.statut !== 'cloture') || []
    if (ecartsCritiques.length > 0) {
      suggestions.push({
        id: 'ecarts_critiques',
        type: 'alerte',
        titre: `🔴 ${ecartsCritiques.length} écart(s) critique(s)`,
        description: `Nécessitent une attention immédiate.`,
        priorite: 'haute',
        action: { id: 'view_ecarts', label: 'Voir les écarts', description: '', type: 'navigate', target: 'plans-actions' },
        declencheur: `${ecartsCritiques.length} écarts critiques actifs`,
      })
    }

    const today = new Date()
    const upcomingPlannings = store.plannings?.filter((p) => {
      const diffDays = Math.ceil((new Date(p.date_debut).getTime() - today.getTime()) / 86400000)
      return diffDays <= 7 && diffDays >= 0 && p.statut === 'planifiee'
    }) || []

    if (upcomingPlannings.length > 0) {
      suggestions.push({
        id: 'upcoming_plannings',
        type: 'rappel',
        titre: `📅 ${upcomingPlannings.length} surveillance(s) cette semaine`,
        description: `${upcomingPlannings.length} mission(s) dans les 7 prochains jours.`,
        priorite: 'moyenne',
        action: { id: 'view_planning', label: 'Voir planning', description: '', type: 'navigate', target: 'planning' },
        declencheur: `${upcomingPlannings.length} plannings dans les 7 jours`,
      })
    }

    return suggestions.slice(0, 5)
  }

  // ============================================================
  // SUGGEST ACTION — requis par l'orchestrateur
  // ============================================================

  async suggestAction(data: { aerodromeId?: string; context?: string }): Promise<ActionSuggestion[]> {
    const suggestions = await this.getProactiveSuggestions(data?.aerodromeId)
    return suggestions.map(s => ({
      id: s.id,
      label: s.titre,
      description: s.description,
      type: 'action' as const,
      target: s.action?.target,
      params: s.action?.params,
    }))
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  private matches(message: string, patterns: string[]): boolean {
    return patterns.some(pattern => message.includes(pattern))
  }

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  }

  private addToHistory(contexte: ChatRequest['contexte'], message: ChatMessage): void {
    const sessionId = contexte?.module || 'default'
    const history = this.conversationHistory.get(sessionId) || []
    history.push(message)
    if (history.length > 50) history.shift()
    this.conversationHistory.set(sessionId, history)
  }

  getHistory(sessionId: string): ChatMessage[] {
    return this.conversationHistory.get(sessionId) || []
  }

  clearHistory(sessionId: string): void {
    this.conversationHistory.delete(sessionId)
  }

  isReady(): boolean {
    return this.initialized
  }

  isLLMAvailable(): boolean | null {
    return this.llmAvailable
  }
}

export const assistantAgent = new AssistantAgent()
