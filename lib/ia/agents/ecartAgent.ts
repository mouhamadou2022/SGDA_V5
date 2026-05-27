// lib/ia/agents/ecartAgent.ts
// Agent 3 — Écarts & PAC
// Libellés réglementaires générés par LLM + évaluation PAC intelligente

'use client'

import { useAppStore, Ecart, SoumissionPAC, SoumissionPreuves, ProfilRisque, Aerodrome } from '@/lib/store'
import { plansActionsUtils } from '@/lib/plansActionsUtils'
import { computeHawkesContagion } from '@/lib/risque'
import { aiClient } from '@/lib/ia/aiClient'
import { ECART_SYSTEM_PROMPT, SGS_ECART_SYSTEM_PROMPT, PAC_SYSTEM_PROMPT } from '@/lib/ia/prompts'

export interface GenerateEcartRequest {
  itemsNSNV: Array<{
    id: string
    numero: string
    point_verification: string
    reference_reglementaire: string
    observation?: string
    domaine: string
    resultat?: 'NS' | 'NV'
  }>
  aerodromeId: string
  surveillanceId?: string
  profil?: ProfilRisque
}

export type NiveauGraviteOACI = 'A' | 'B' | 'C' | 'D' | 'E'
export type NiveauProbabiliteOACI = 1 | 2 | 3 | 4 | 5

export interface GenerateEcartResult {
  libelle: string
  ref_reglementaire: string
  niveau_risque: 'critique' | 'eleve' | 'moyen' | 'faible'
  cellule: string
  probabilite: NiveauProbabiliteOACI
  gravite: NiveauGraviteOACI
  justification: string
  delai_pac_propose: number
  delai_regularisation_propose: number
  domaine: string
  confiance: number
  items_lies: string[]
}

export interface EvaluatePACRequest {
  ecartId: string
  pac: SoumissionPAC
}

export interface EvaluatePACResult {
  note_globale: number
  notes_detail: {
    pertinence: number
    exhaustivite: number
    precision: number
    specificite: number
    realisme: number
    coherence: number
  }
  decision: 'accepte' | 'refuse'
  commentaire: string
  ameliorations_suggestions: string[]
  confiance: number
}

export interface VerifyPreuvesRequest {
  ecartId: string
  preuves: SoumissionPreuves
}

export interface VerifyPreuvesResult {
  conforme: boolean
  niveauConfiance: number
  elementsManquants: string[]
  commentaire: string
  preuvesSuffisantes: boolean
}

export interface SuggestActionsRequest {
  ecart: Ecart
  profil?: ProfilRisque
}

export interface ActionSuggestion {
  id: string
  description: string
  responsable: string
  delaiPropose: number
  priorite: 'haute' | 'moyenne' | 'basse'
  impactEstime: number
  probabiliteSucces: number
}

type PACAction = SoumissionPAC['actions'][number]

const NOTES_SEUILS = { ACCEPTE: 70, REFUSE: 40 }

// ============================================================
// MATRICE OACI — calcul cellule (probabilité × gravité)
// ============================================================

const MATRICE_OACI: Record<string, 'critique' | 'eleve' | 'moyen' | 'faible'> = {
  '5A': 'critique', '5B': 'critique', '5C': 'critique', '4A': 'critique',
  '4B': 'critique', '3A': 'critique',
  '5D': 'eleve', '4C': 'eleve', '3B': 'eleve', '2A': 'eleve',
  '5E': 'moyen', '4D': 'moyen', '3C': 'moyen', '2B': 'moyen', '1A': 'moyen',
  '1B': 'faible', '1C': 'faible', '1D': 'faible', '1E': 'faible',
  '2C': 'faible', '2D': 'faible', '2E': 'faible', '3D': 'faible',
  '3E': 'faible', '4E': 'faible',
}

const GRAVITE_LABELS: Record<NiveauGraviteOACI, string> = {
  A: 'Catastrophique (perte de vie ou aéronef)',
  B: 'Grave (blessures graves, dommages importants)',
  C: 'Majeure (incident sérieux, blessures légères)',
  D: 'Mineure (procédures d\'urgence requises)',
  E: 'Négligeable (nuisance sans impact opérationnel)',
}
const PROBABILITE_LABELS: Record<NiveauProbabiliteOACI, string> = {
  5: 'Fréquent (survient souvent)',
  4: 'Probable (survient plusieurs fois)',
  3: 'Occasionnel (survient parfois)',
  2: 'Rare (peu probable mais possible)',
  1: 'Improbable (très peu probable)',
}

function computeCelluleOACI(
  nsCount: number,
  nvCount: number,
  profil?: ProfilRisque
): { probabilite: NiveauProbabiliteOACI; gravite: NiveauGraviteOACI; cellule: string; justification: string } {
  const score = profil?.score_global ?? 100
  const c4 = profil?.c4 ?? 100
  const totalNS = nsCount
  const totalNV = nvCount

  // Probabilité — fréquence d'occurrence du type de défaillance
  let probabilite: NiveauProbabiliteOACI
  if (score < 20 || totalNS >= 5) probabilite = 5
  else if (score < 35 || totalNS >= 3) probabilite = 4
  else if (score < 50 || totalNS >= 2) probabilite = 3
  else if (score < 65 || totalNS >= 1) probabilite = 2
  else probabilite = 1

  // Gravité — conséquence potentielle sur la sécurité des opérations
  let gravite: NiveauGraviteOACI
  if (c4 < 20 || (totalNS >= 3 && score < 30)) gravite = 'A'
  else if (c4 < 35 || (totalNS >= 2 && score < 45)) gravite = 'B'
  else if (c4 < 55 || totalNS >= 2 || totalNV >= 3) gravite = 'C'
  else if (totalNS >= 1 || totalNV >= 1) gravite = 'D'
  else gravite = 'E'

  const cellule = `${probabilite}${gravite}`

  const justification =
    `Probabilité ${probabilite} (${PROBABILITE_LABELS[probabilite]}) : ${totalNS} item(s) NS, ${totalNV} NV` +
    (profil ? `, score global ${score}/100, charge critique C4 ${c4}/100` : '') +
    `. Gravité ${gravite} (${GRAVITE_LABELS[gravite]}). ` +
    `Cellule matrice OACI : ${cellule} → niveau ${MATRICE_OACI[cellule] ?? 'moyen'}.`

  return { probabilite, gravite, cellule, justification }
}

const NIVEAUX_DELAI: Record<string, { pac: number; regularisation: number }> = {
  critique: { pac: 3, regularisation: 7 },
  eleve: { pac: 7, regularisation: 30 },
  moyen: { pac: 15, regularisation: 90 },
  faible: { pac: 30, regularisation: 180 },
}

export class EcartAgent {
  private initialized = false
  private evaluationCache = new Map<string, EvaluatePACResult>()
  private verificationCache = new Map<string, VerifyPreuvesResult>()

  async init(_storeData: unknown): Promise<void> {
    this.initialized = true
  }

  // ============================================================
  // GÉNÉRATION D'ÉCART — libellé officiel par LLM
  // ============================================================

  async generateEcart(request: GenerateEcartRequest, _storeData: unknown): Promise<GenerateEcartResult> {
    const store = useAppStore.getState()
    const aerodrome = store.aerodromes.find((a: Aerodrome) => a.id === request.aerodromeId)

    // Calcul du niveau de risque (local — rapide)
    const nsCount = request.itemsNSNV.filter(i => i.resultat === 'NS').length
    const nvCount = request.itemsNSNV.filter(i => i.resultat === 'NV').length
    let niveau_risque: 'critique' | 'eleve' | 'moyen' | 'faible' = 'moyen'
    let confiance = 70

    if (request.profil) {
      const p = request.profil
      if (p.score_global < 30) { niveau_risque = 'critique'; confiance = 92 }
      else if (p.score_global < 50 || p.c4 < 40) { niveau_risque = 'eleve'; confiance = 82 }
      else if (nsCount >= 3) { niveau_risque = 'eleve'; confiance = 78 }
      else if (nsCount >= 1) { niveau_risque = 'moyen'; confiance = 72 }
      else { niveau_risque = 'faible'; confiance = 62 }
    } else {
      if (nsCount >= 3) niveau_risque = 'eleve'
      else if (nsCount >= 1) niveau_risque = 'moyen'
      else niveau_risque = 'faible'
    }

    const domaine = request.itemsNSNV[0]?.domaine ?? 'Général'
    const isSGS = domaine === 'SGS'
    const delais = NIVEAUX_DELAI[niveau_risque]
    const refs = [...new Set(request.itemsNSNV.map(i => i.reference_reglementaire).filter(Boolean))]

    // Calcul de la cellule OACI (matrice probabilité × gravité) — non applicable SGS
    const { probabilite, gravite, cellule, justification } = isSGS
      ? { probabilite: 2 as NiveauProbabiliteOACI, gravite: 'B' as NiveauGraviteOACI, cellule: '2B', justification: 'SGS — matrice OACI non applicable' }
      : computeCelluleOACI(nsCount, nvCount, request.profil)

    // Génération du libellé officiel par IA
    let userMessage: string
    if (isSGS) {
      // Message SGS : maturité PAOE, Annexe 19, sans risque OACI
      const itemsContext = request.itemsNSNV.map(i => {
        const paoeLabel = (i as any).paoeLevel === 'absent' ? 'Absent (—)'
          : (i as any).paoeLevel === 'present' ? 'Présent (P)'
          : (i as any).paoeLevel === 'approprie' ? 'Approprié (A)'
          : 'Non conforme'
        return `- [${paoeLabel}] ${i.point_verification}${i.reference_reglementaire ? ` [Réf: ${i.reference_reglementaire}]` : ''}`
      }).join('\n')

      userMessage = `Génère le libellé officiel d'un écart SGS selon le modèle PAOE (Annexe 19 OACI) pour :
Aérodrome : ${aerodrome?.code_oaci ?? ''} — ${aerodrome?.nom ?? ''}
Éléments SGS non conformes constatés (avec niveau PAOE) :
${itemsContext}

Retourne UNIQUEMENT le libellé officiel de l'écart SGS (1-3 phrases, style réglementaire ANACIM, références Annexe 19 / Doc 9859).
Ne mentionne pas de matrice de risque, de probabilité ni de gravité OACI.
Ne retourne pas de JSON ni d'explications supplémentaires.`
    } else {
      const itemsContext = request.itemsNSNV.map(i =>
        `- [${i.resultat ?? 'NS'}] ${i.point_verification}${i.observation ? ` (Observation: ${i.observation})` : ''}${i.reference_reglementaire ? ` [Réf: ${i.reference_reglementaire}]` : ''}`
      ).join('\n')

      userMessage = `Génère le libellé officiel d'un écart de surveillance pour :
Aérodrome : ${aerodrome?.code_oaci ?? ''} — ${aerodrome?.nom ?? ''}
Domaine : ${domaine}
Niveau de risque calculé : ${niveau_risque} (matrice OACI cellule ${cellule})
Items non-satisfaisants constatés :
${itemsContext}
${request.profil ? `Profil de risque : score global ${request.profil.score_global}/100, C4 (charge critique) : ${request.profil.c4}/100` : ''}

Retourne UNIQUEMENT le libellé officiel de l'écart (1-3 phrases, style réglementaire ANACIM).
Ne retourne pas de JSON ni d'explications supplémentaires.`
    }

    const aiResult = await aiClient.call({
      systemPrompt: isSGS ? SGS_ECART_SYSTEM_PROMPT : ECART_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.2,
      maxTokens: 300,
    })

    const libelle = aiResult.ok && aiResult.content.trim()
      ? aiResult.content.trim()
      : this.buildFallbackLibelle(request.itemsNSNV, niveau_risque)

    return {
      libelle,
      ref_reglementaire: refs.join(' ; ') || 'RAS 14 / Annexe 14 OACI',
      niveau_risque,
      cellule,
      probabilite,
      gravite,
      justification,
      delai_pac_propose: delais.pac,
      delai_regularisation_propose: delais.regularisation,
      domaine,
      confiance,
      items_lies: request.itemsNSNV.map(i => i.id),
    }
  }

  private buildFallbackLibelle(items: GenerateEcartRequest['itemsNSNV'], niveau: string): string {
    const isSGS = items[0]?.domaine === 'SGS'
    const desc = items.map(i => i.point_verification)
    if (isSGS) {
      if (desc.length === 1) return `Non-conformité SGS constatée en regard de l'Annexe 19 OACI : ${desc[0]}`
      return `Non-conformités SGS constatées en regard de l'Annexe 19 OACI : ${desc.slice(0, 3).join(' ; ')}${desc.length > 3 ? ` et ${desc.length - 3} autre(s)` : ''}`
    }
    if (desc.length === 1) return `Non-conformité constatée : ${desc[0]}`
    if (desc.length <= 3) return `Non-conformités constatées : ${desc.join(' ; ')}`
    return `Non-conformités multiples constatées : ${desc.slice(0, 3).join(' ; ')} et ${desc.length - 3} autre(s)`
  }

  // ============================================================
  // ÉVALUATION PAC — scoring + commentaire IA
  // ============================================================

  async evaluatePAC(request: EvaluatePACRequest, storeData: any): Promise<EvaluatePACResult> {
    const cached = this.evaluationCache.get(request.ecartId)
    if (cached) return cached

    const store = useAppStore.getState()
    const ecart = store.ecarts.find((e: Ecart) => e.id === request.ecartId)

    if (!ecart) {
      return {
        note_globale: 0,
        notes_detail: { pertinence: 0, exhaustivite: 0, precision: 0, specificite: 0, realisme: 0, coherence: 0 },
        decision: 'refuse',
        commentaire: 'Écart introuvable dans le système.',
        ameliorations_suggestions: ['Vérifiez que l\'écart existe'],
        confiance: 0,
      }
    }

    const actions = request.pac.actions ?? []

    // Scores quantitatifs (locaux)
    const notes_detail = {
      pertinence: this.evaluatePertinence(actions, ecart),
      exhaustivite: this.evaluateExhaustivite(actions),
      precision: this.evaluatePrecision(actions),
      specificite: this.evaluateSpecificite(actions),
      realisme: this.evaluateRealisme(actions),
      coherence: this.evaluateCohérence(actions, ecart),
    }

    const note_globale = Math.round(plansActionsUtils.calculerNoteGlobale({
      note_pertinence: notes_detail.pertinence,
      note_exhaustivite: notes_detail.exhaustivite,
      note_precision: notes_detail.precision,
      note_specificite: notes_detail.specificite,
      note_coherence: notes_detail.coherence,
      note_tracabilite: notes_detail.realisme,
    }) * 10) / 10

    const decision: 'accepte' | 'refuse' = note_globale >= NOTES_SEUILS.ACCEPTE ? 'accepte' : 'refuse'

    // Commentaire et suggestions par IA
    const contextPAC = {
      ecart_libelle: ecart.libelle?.substring(0, 200),
      ecart_niveau: ecart.niveau_risque,
      note_globale,
      decision,
      notes_detail,
      nb_actions: actions.length,
      actions_resume: actions.slice(0, 3).map((a: SoumissionPAC['actions'][number]) => ({
        description: a.description?.substring(0, 100),
        responsable: a.responsable,
        date_prevue: a.date_prevue,
        livrables: a.livrables?.length ?? 0,
      })),
    }

    type PACFeedbackJSON = { commentaire: string; suggestions: string[] }
    const fallback: PACFeedbackJSON = {
      commentaire: decision === 'accepte'
        ? `PAC ${decision === 'accepte' ? 'accepté' : 'refusé'} avec une note de ${note_globale}/100.`
        : `PAC refusé (${note_globale}/100). Améliorations requises.`,
      suggestions: this.buildFallbackSuggestions(notes_detail),
    }

    const aiResult = await aiClient.callJSON<PACFeedbackJSON>(
      {
        systemPrompt: PAC_SYSTEM_PROMPT,
        userMessage: `Évalue ce PAC et retourne JSON {"commentaire": "...", "suggestions": ["...", "..."]}:
${JSON.stringify(contextPAC, null, 2)}`,
        temperature: 0.3,
        maxTokens: 512,
        responseFormat: 'json_object',
      },
      fallback
    )

    const result: EvaluatePACResult = {
      note_globale,
      notes_detail,
      decision,
      commentaire: aiResult.commentaire,
      ameliorations_suggestions: aiResult.suggestions ?? [],
      confiance: decision === 'accepte' ? note_globale : 100 - note_globale,
    }

    this.evaluationCache.set(request.ecartId, result)
    return result
  }

  // ============================================================
  // SUGGESTION D'ACTIONS CORRECTIVES — par IA
  // ============================================================

  async suggestActions(request: SuggestActionsRequest, _storeData?: unknown): Promise<ActionSuggestion[]> {
    const { ecart, profil } = request

    type ActionJSON = { description: string; responsable: string; delai_jours: number; priorite: 'haute' | 'moyenne' | 'basse'; impact: number; probabilite: number }
    type ActionsJSON = { actions: ActionJSON[] }
    const fallback: ActionsJSON = {
      actions: [
        { description: `Corriger : ${ecart.libelle?.substring(0, 100)}`, responsable: 'Responsable à désigner', delai_jours: NIVEAUX_DELAI[ecart.niveau_risque]?.pac ?? 15, priorite: 'haute', impact: 80, probabilite: 70 },
        { description: 'Mettre en place une vérification périodique pour éviter la récurrence', responsable: 'Responsable qualité', delai_jours: 30, priorite: 'moyenne', impact: 60, probabilite: 65 },
      ],
    }

    const contextEcart = {
      libelle: ecart.libelle?.substring(0, 200),
      domaine: ecart.domaine,
      niveau_risque: ecart.niveau_risque,
      ref_reglementaire: ecart.ref_reglementaire,
      profil_score_global: profil?.score_global,
      profil_c1_sgs: profil?.c1,
    }

    const aiResult = await aiClient.callJSON<ActionsJSON>(
      {
        systemPrompt: ECART_SYSTEM_PROMPT,
        userMessage: `Propose 3-4 actions correctives concrètes pour cet écart. Retourne JSON:
{"actions": [{"description": "...", "responsable": "...", "delai_jours": 30, "priorite": "haute|moyenne|basse", "impact": 85, "probabilite": 80}]}
Écart: ${JSON.stringify(contextEcart, null, 2)}`,
        temperature: 0.4,
        maxTokens: 600,
        responseFormat: 'json_object',
      },
      fallback
    )

    return (aiResult.actions ?? fallback.actions).map((a: ActionJSON, idx: number) => ({
      id: `action_${Date.now()}_${idx}`,
      description: a.description,
      responsable: a.responsable,
      delaiPropose: a.delai_jours ?? 15,
      priorite: a.priorite ?? 'moyenne',
      impactEstime: a.impact ?? 70,
      probabiliteSucces: a.probabilite ?? 65,
    }))
  }

  // ============================================================
  // VÉRIFICATION DES PREUVES
  // ============================================================

  async verifyPreuves(request: VerifyPreuvesRequest, _storeData: unknown): Promise<VerifyPreuvesResult> {
    const cached = this.verificationCache.get(request.ecartId)
    if (cached) return cached

    const store = useAppStore.getState()
    const ecart = store.ecarts.find((e: Ecart) => e.id === request.ecartId)

    if (!ecart) {
      return { conforme: false, niveauConfiance: 0, elementsManquants: ['Écart non trouvé'], commentaire: 'Écart introuvable', preuvesSuffisantes: false }
    }

    const preuves = request.preuves.fichiers ?? []
    const commentaire = request.preuves.commentaire ?? ''
    const elementsManquants: string[] = []

    if (preuves.length === 0) {
      elementsManquants.push('Aucun fichier justificatif joint')
    } else {
      const hasPDF = preuves.some((f: SoumissionPreuves['fichiers'][number]) => f.nom?.endsWith('.pdf'))
      const hasImage = preuves.some((f: SoumissionPreuves['fichiers'][number]) => f.nom?.match(/\.(jpg|jpeg|png)$/i))
      const hasDoc = preuves.some((f: SoumissionPreuves['fichiers'][number]) => f.nom?.match(/\.(doc|docx|xls|xlsx)$/i))
      if (!hasPDF && !hasImage && !hasDoc) {
        elementsManquants.push('Format de fichier non reconnu (PDF, image ou document attendu)')
      }
    }

    if (!commentaire || commentaire.length < 10) {
      elementsManquants.push('Commentaire explicatif insuffisant')
    }

    let niveauConfiance = 50
    if (preuves.length >= 2 && commentaire.length >= 20) niveauConfiance = 85
    else if (preuves.length >= 1 && commentaire.length >= 10) niveauConfiance = 70
    else if (preuves.length >= 1) niveauConfiance = 55

    if (ecart.niveau_risque === 'critique' && preuves.length < 3) {
      niveauConfiance -= 20
      elementsManquants.push('Écart critique : minimum 3 pièces justificatives requises')
    }

    const conforme = elementsManquants.length === 0
    const preuvesSuffisantes = niveauConfiance >= 70

    const result: VerifyPreuvesResult = {
      conforme,
      niveauConfiance: Math.max(0, Math.min(100, niveauConfiance)),
      elementsManquants,
      commentaire: conforme ? 'Preuves complètes et conformes aux exigences.' : `Preuves insuffisantes : ${elementsManquants.join(' ; ')}`,
      preuvesSuffisantes,
    }

    this.verificationCache.set(request.ecartId, result)
    return result
  }

  // ============================================================
  // ANALYSE RISQUE CASCADE
  // ============================================================

  async getCascadeRisk(aerodromeId: string) {
    const store = useAppStore.getState()
    const ecarts = store.ecarts.filter((e: Ecart) => e.aerodrome_id === aerodromeId)
    const hawkes = computeHawkesContagion(
      ecarts.map((e: Ecart) => ({ createdAt: e.created_at, niveau: e.niveau_risque }))
    )
    let niveau: 'critique' | 'eleve' | 'moyen' | 'faible' = 'faible'
    if (hawkes.riskNext30Days >= 70) niveau = 'critique'
    else if (hawkes.riskNext30Days >= 50) niveau = 'eleve'
    else if (hawkes.riskNext30Days >= 30) niveau = 'moyen'
    return { riskNext30Days: hawkes.riskNext30Days, currentIntensity: hawkes.currentIntensity, expectedNewEcarts: hawkes.expectedNewEcarts, niveau }
  }

  async prioritizeEcarts(ecarts: Ecart[]): Promise<Ecart[]> {
    const store = useAppStore.getState()
    const avecScore = await Promise.all(ecarts.map(async ecart => {
      let score = 0
      const niveauScore: Record<string, number> = { critique: 40, eleve: 25, moyen: 15, faible: 5 }
      score += niveauScore[ecart.niveau_risque] ?? 5
      const { jours, depasse } = plansActionsUtils.getDelaiRestant(ecart)
      if (depasse) score += 30
      else if (jours < 7) score += 20
      else if (jours < 15) score += 10
      const profil = store.profilsRisque[ecart.aerodrome_id]
      if (profil) {
        if (profil.score_global < 30) score += 25
        else if (profil.score_global < 50) score += 15
        else if (profil.tendance === 'baisse') score += 10
        if (profil.c4 < 40) score += 15
      }
      const cascadeRisk = await this.getCascadeRisk(ecart.aerodrome_id)
      if (cascadeRisk.riskNext30Days > 50) score += 20
      return { ecart, score }
    }))
    return avecScore.sort((a, b) => b.score - a.score).map(x => x.ecart)
  }

  getPACStatistics(aerodromeId?: string) {
    const store = useAppStore.getState()
    return plansActionsUtils.getStatistiquesPAC(store.ecarts, aerodromeId)
  }

  // ============================================================
  // SCORES QUANTITATIFS (inchangés)
  // ============================================================

  private evaluatePertinence(actions: PACAction[], ecart: Ecart): number {
    if (actions.length === 0) return 0
    let score = 0
    for (const a of actions) {
      if (a.description?.toLowerCase().includes(ecart.libelle?.toLowerCase() ?? '')) score += 20
      else if (a.description) score += 10
    }
    return Math.min(100, Math.max(0, score))
  }

  private evaluateExhaustivite(actions: PACAction[]): number {
    if (actions.length === 0) return 0
    let score = 0
    for (const a of actions) {
      if (a.description) score += 15
      if (a.responsable) score += 15
      if (a.date_prevue) score += 10
      if (a.livrables?.length > 0) score += 10
    }
    return Math.min(100, score)
  }

  private evaluatePrecision(actions: PACAction[]): number {
    if (actions.length === 0) return 0
    let score = 0
    for (const a of actions) {
      if (a.description?.length > 50) score += 15
      if (a.responsable?.includes(' ')) score += 15
      if (a.livrables?.some((l: string) => l.includes('.'))) score += 20
    }
    return Math.min(100, score)
  }

  private evaluateSpecificite(actions: PACAction[]): number {
    if (actions.length === 0) return 0
    const vagueTerms = ['à faire', 'à voir', 'peut-être', 'si possible', 'envisager', 'essayer']
    let score = 0
    for (const a of actions) {
      if (a.description && !vagueTerms.some(t => a.description.toLowerCase().includes(t))) score += 20
      if (a.responsable && a.responsable !== 'À définir') score += 15
      if (a.date_prevue) score += 15
    }
    return Math.min(100, score)
  }

  private evaluateRealisme(actions: PACAction[]): number {
    if (actions.length === 0) return 0
    let score = 0
    const now = new Date()
    for (const a of actions) {
      if (a.date_prevue) {
        const diff = (new Date(a.date_prevue).getTime() - now.getTime()) / 86400000
        if (diff >= 7 && diff <= 90) score += 20
        else if (diff > 0) score += 10
      } else score += 5
    }
    return Math.min(100, score)
  }

  private evaluateCohérence(actions: PACAction[], ecart: Ecart): number {
    if (actions.length === 0) return 0
    let score = 50
    if (ecart.niveau_risque === 'critique' && actions.length >= 2) score += 20
    else if (ecart.niveau_risque === 'critique' && actions.length === 1) score -= 20
    const responsables = actions.map((a: PACAction) => a.responsable).filter(Boolean)
    if (new Set(responsables).size === responsables.length && responsables.length > 1) score += 15
    return Math.min(100, Math.max(0, score))
  }

  private buildFallbackSuggestions(notes: Record<string, number>): string[] {
    const s: string[] = []
    if (notes.pertinence < 70) s.push('Renforcez le lien explicite entre les actions et l\'écart constaté')
    if (notes.exhaustivite < 70) s.push('Complétez les informations : description, responsable, date prévue et livrables pour chaque action')
    if (notes.precision < 70) s.push('Détaillez les livrables attendus (documents, rapports, preuves)')
    if (notes.specificite < 70) s.push('Remplacez les formulations vagues par des engagements concrets et mesurables')
    if (notes.realisme < 70) s.push('Ajustez les délais : ils doivent être compris entre 7 et 90 jours pour être réalistes')
    return s
  }

  clearCache(): void {
    this.evaluationCache.clear()
    this.verificationCache.clear()
  }

  isReady(): boolean { return this.initialized }
}

export const ecartAgent = new EcartAgent()
