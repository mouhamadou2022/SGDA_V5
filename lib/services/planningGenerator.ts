// lib/services/planningGenerator.ts
// Générateur centralisé de planning — consolide profil + carry-over + certification
// Intégration des 6 modèles mathématiques : HMM, Survival, EVT, Negative Binomial, Copulas, Thompson Sampling

import type { Planning, ProfilRisque, Ecart, Certification, Homologation } from '@/lib/store'
import { computeFinalFrequency, suggestMissionType } from '@/lib/risque/frequency'
import { modelCache } from '@/lib/risque/modelCache'

export interface PlanningSource {
  type: 'profil_risque' | 'carryover_ecart' | 'carryover_pac' | 'certification_renouvellement' | 'injection'
  raison: string
  details?: string[]
}

export interface PlanningProposal extends Partial<Planning> {
  source: PlanningSource
  sort_order: number
}

export interface PlanningGeneratorParams {
  aerodromeId: string
  annee: number
  profilRisque?: ProfilRisque
  ecartsActifs?: Ecart[]
  certifications?: Certification[]
  homologations?: Homologation[]
  inspecteurs?: { id: string; prenom: string; nom: string; competences?: any[] }[]
  historiqueSurveillances?: { type: string; date: string; domaines: string[]; score?: number }[]
}

export function genererPlanning(params: PlanningGeneratorParams): PlanningProposal[] {
  const { aerodromeId, annee, profilRisque, ecartsActifs = [], certifications = [], homologations = [], inspecteurs = [], historiqueSurveillances = [] } = params
  const propositions: PlanningProposal[] = []

  // ── Modèles mathématiques (calculés une fois, réutilisés) ──
  const scoresHistoriques = historiqueSurveillances.filter(h => h.score !== undefined).map(h => h.score!)
  const modelOverrides: {
    hmm?: { currentStateName: string; isTransitioning: boolean; transitionRisk: number; daysToCritical: number }
    survival?: { hazard90d: number; hazard180d: number; medianDays: number }
    evt?: { tailRisk: number; isHeavyTailed: boolean; maxExpected12m: number }
    nb?: { overdispersion: number; dispersionAdjustedMean: number }
    copula?: { kendallTau: number; tailDependence: number; copulaType: string }
    ts?: { recommendedAction: string; successProbability: number }
    modelReason: string[]
  } = { modelReason: [] }

  if (scoresHistoriques.length >= 3 && profilRisque) {
    // Utilise le ModelCache partagé (1 seul calcul pour riskAgent + planningGen)
    try {
      const cached = modelCache.computeAll(aerodromeId, scoresHistoriques, profilRisque)

      if (cached.hmm) {
        modelOverrides.hmm = {
          currentStateName: cached.hmm.currentStateName,
          isTransitioning: cached.hmm.isTransitioning,
          transitionRisk: cached.hmm.transitionRisk,
          daysToCritical: cached.hmm.daysToCritical,
        }
        if (cached.hmm.isTransitioning) modelOverrides.modelReason.push(`HMM: transition silencieuse détectée (risque ${cached.hmm.transitionRisk}%, J-${cached.hmm.daysToCritical})`)
      }

      if (cached.survival) {
        modelOverrides.survival = { hazard90d: cached.survival.hazard90days, hazard180d: cached.survival.hazard180days, medianDays: cached.survival.medianSurvivalDays || 999 }
        if (cached.survival.hazard90days > 0.5) modelOverrides.modelReason.push(`Survival: risque incident à 90j = ${Math.round(cached.survival.hazard90days * 100)}%`)
      }

      if (cached.evt) {
        modelOverrides.evt = { tailRisk: cached.evt.probabilityExtreme, isHeavyTailed: cached.evt.isHeavyTailed, maxExpected12m: cached.evt.maxExpected12m }
        if (cached.evt.isHeavyTailed || cached.evt.probabilityExtreme > 0.1) modelOverrides.modelReason.push(`EVT: distribution à queue lourde, risque extrême ${Math.round(cached.evt.probabilityExtreme * 100)}%`)
      }

      if (cached.nb) {
        modelOverrides.nb = { overdispersion: cached.nb.isOverdispersed ? 2 : 1, dispersionAdjustedMean: cached.nb.mean }
        if (cached.nb.isOverdispersed) modelOverrides.modelReason.push(`NB: surdispersion détectée (variance/moyenne = ${(cached.nb.variance / cached.nb.mean).toFixed(1)})`)
      }

      if (cached.copula) {
        const maxTail = Math.max(...cached.copula.tailDependence.lower.flat())
        modelOverrides.copula = { kendallTau: maxTail, tailDependence: maxTail, copulaType: 'detected' }
        if (maxTail > 0.3) modelOverrides.modelReason.push(`Copulas: dépendance de queue ${maxTail.toFixed(2)}`)
      }

      if (cached.ts) {
        const recommended = cached.ts.recommend(`${aerodromeId}_${annee}`)
        modelOverrides.ts = { recommendedAction: recommended.id, successProbability: cached.ts.bestProbability }
        modelOverrides.modelReason.push(`TS: action recommandée = ${recommended.name} (${Math.round(cached.ts.bestProbability * 100)}%)`)
      }
    } catch { /* Modèles indisponibles */ }
  }

  // ── SOURCE 1 : Profil de risque → maintien / périodique / audit ──
  if (profilRisque) {
    const nbEcartsCritiques = ecartsActifs.filter(e => e.niveau_risque === 'critique').length
    const hasPendingPac = ecartsActifs.some(e => e.pac && ['pac_attendu', 'pac_soumis'].includes(e.statut))
    const isCertPhase = historiqueSurveillances.some(h => h.type === 'certification')

    const riskLevel = profilRisque.niveau === 'critique' ? 'critique'
      : profilRisque.niveau === 'eleve' ? 'élevé'
      : profilRisque.niveau === 'moyen' ? 'moyen'
      : 'faible'

    const freqResult = computeFinalFrequency({ riskLevel: riskLevel as any })
    let frequence = typeof freqResult === 'number' ? freqResult : (freqResult as any).frequencyPerYear || 2
    const freqLabel = typeof freqResult === 'object' ? (freqResult as any).label || '' : ''

    // NB → ajustement fréquence si surdispersion
    if (modelOverrides.nb && modelOverrides.nb.overdispersion > 1) {
      frequence = Math.min(12, Math.round(frequence * modelOverrides.nb.overdispersion))
    }

    // Mission type — Thompson Sampling override si confiance > 70%
    let missionType = suggestMissionType({
      riskLevel: (riskLevel as any),
      hasCriticalEcarts: nbEcartsCritiques > 0,
      hasPacInProgress: hasPendingPac,
      isCertificationPhase: isCertPhase,
    })
    if (modelOverrides.ts && modelOverrides.ts.successProbability > 0.7) {
      missionType = modelOverrides.ts.recommendedAction
    }

    // Domaines — Copulas override (élargir si dépendance de queue)
    let domainesPrioritaires: string[]
    if (modelOverrides.copula && modelOverrides.copula.tailDependence > 0.3) {
      // Forte dépendance → tous les domaines sont liés, inspecter large
      domainesPrioritaires = ['SGS', 'SLI', 'PHY', 'OLS', 'ELEC', 'MFP', 'RA', 'COP', 'OPS']
    } else {
      domainesPrioritaires = profilRisque.c3 < 50
        ? ['PHY', 'OLS', 'ELEC', 'MFP']
        : profilRisque.c2 < 50
          ? ['SLI', 'RA', 'COP', 'OPS']
          : ['SLI', 'PHY', 'OLS', 'ELEC', 'MFP', 'RA', 'COP', 'OPS']
    }

    // Priorité — HMM + EVT override
    let priorite: Planning['priorite']
    if (modelOverrides.hmm?.isTransitioning || (modelOverrides.evt?.tailRisk ?? 0) > 0.15) {
      priorite = 'critique'
    } else {
      priorite = profilRisque.score_global < 30 ? 'critique'
        : profilRisque.score_global < 50 ? 'haute'
        : profilRisque.score_global < 70 ? 'moyenne'
        : 'basse'
    }

    // Dates — Survival override (placer plus tôt si risque élevé)
    let startMonth = 0
    if (modelOverrides.survival && modelOverrides.survival.hazard90d > 0.5) {
      startMonth = 0 // janvier immédiat
    } else if (modelOverrides.survival && modelOverrides.survival.hazard90d > 0.3) {
      startMonth = 2 // mars
    }

    const intervalle = Math.floor(12 / Math.max(frequence, 1))

    for (let i = 0; i < frequence; i++) {
      const mois = (startMonth + i * intervalle) % 12
      const debut = new Date(annee, mois, 1)
      const fin = new Date(annee, mois, 3)
      const domaines = domainesPrioritaires.slice(0, Math.min(3 + i, 9))

      const objectifs = buildObjectifsProfil(missionType, domaines, profilRisque, freqLabel, '', modelOverrides.modelReason)

      propositions.push({
        aerodrome_id: aerodromeId,
        type: missionType as Planning['type'],
        date_debut: debut.toISOString(),
        date_fin: fin.toISOString(),
        portee: domaines,
        equipe_ids: [],
        chef_id: '',
        statut: 'planifiee',
        priorite,
        objectifs,
        est_proposition: true,
        annee_cible: annee,
        source: {
          type: 'profil_risque',
          raison: `Fréquence ${freqLabel || `${frequence}/an`} — Score ${profilRisque.score_global}/100 (${profilRisque.niveau})${modelOverrides.modelReason.length > 0 ? ' + Modèles ML' : ''}`,
          details: [...domaines.map(d => `Domaine ${d} : C1=${profilRisque.c1} C2=${profilRisque.c2} C3=${profilRisque.c3} C5=${profilRisque.c5}`), ...modelOverrides.modelReason],
        },
        sort_order: priorite === 'critique' ? 0 : priorite === 'haute' ? 1 : 3,
      })
    }
  }

  // ── SOURCE 2 : Carry-over écarts → suivi_ecarts ──
  const ecartsASuivre = ecartsActifs.filter(e => e.statut !== 'cloture' && ['ouvert', 'pac_attendu', 'pac_soumis', 'pac_refuse', 'en_retard'].includes(e.statut))
  if (ecartsASuivre.length > 0) {
    const debut = new Date(annee, 0, 15)
    const fin = new Date(annee, 0, 16)
    const ecartsDetails = ecartsASuivre.map(e => `Écart ${e.reference} : ${e.libelle?.substring(0, 80) || 'sans libellé'} (${e.niveau_risque}, statut: ${e.statut})`)
    propositions.push({
      aerodrome_id: aerodromeId, type: 'suivi_ecarts', date_debut: debut.toISOString(), date_fin: fin.toISOString(),
      portee: [...new Set(ecartsASuivre.map(e => e.domaine).filter(Boolean))] as string[],
      equipe_ids: [], chef_id: '', statut: 'planifiee',
      priorite: ecartsASuivre.some(e => e.niveau_risque === 'critique') ? 'critique' : 'haute',
      objectifs: `[CARRY-OVER] Suivi de ${ecartsASuivre.length} écart(s).\n${ecartsDetails.join('\n')}`,
      est_proposition: true, annee_cible: annee,
      source: { type: 'carryover_ecart', raison: `${ecartsASuivre.length} écart(s) nécessitent un suivi`, details: ecartsASuivre.map(e => e.reference) },
      sort_order: 1,
    })
  }

  // ── SOURCE 3 : Carry-over PAC → mise_oeuvre_pac ──
  const pacsASuivre = ecartsActifs.filter(e => e.statut !== 'cloture' && e.pac && ['pac_accepte', 'preuves_soumises', 'preuves_evaluees'].includes(e.statut))
  if (pacsASuivre.length > 0) {
    const debut = new Date(annee, 1, 1)
    const fin = new Date(annee, 1, 2)
    const pacDetails = pacsASuivre.map(e => {
      const actions = (e.pac?.actions || []).map(a => `  → ${a.description?.substring(0, 60)} (resp: ${a.responsable})`).join('\n')
      return `Écart ${e.reference} — PAC v${e.pac?.version || '?'} :\n${actions}`
    })
    propositions.push({
      aerodrome_id: aerodromeId, type: 'mise_oeuvre_pac', date_debut: debut.toISOString(), date_fin: fin.toISOString(),
      portee: [...new Set(pacsASuivre.map(e => e.domaine).filter(Boolean))] as string[],
      equipe_ids: [], chef_id: '', statut: 'planifiee', priorite: 'haute',
      objectifs: `[CARRY-OVER] Vérification ${pacsASuivre.length} PAC.\n${pacDetails.join('\n\n')}`,
      est_proposition: true, annee_cible: annee,
      source: { type: 'carryover_pac', raison: `${pacsASuivre.length} PAC sans preuves validées`, details: pacsASuivre.map(e => e.reference) },
      sort_order: 2,
    })
  }

  // ── SOURCE 4 : Certification → renouvellement ──
  const certsExpirant = (certifications || []).filter(c => {
    if (!c.date_expiration || c.statut_global !== 'certifie') return false
    const expireAt = new Date(c.date_expiration)
    return expireAt >= new Date(annee, 0, 1) && expireAt < new Date(annee + 1, 0, 1)
  })
  for (const cert of certsExpirant) {
    const expireDate = new Date(cert.date_expiration!)
    const debut = new Date(expireDate.getTime() - 120 * 24 * 60 * 60 * 1000)
    const fin = new Date(debut.getTime() + 5 * 24 * 60 * 60 * 1000)
    propositions.push({
      aerodrome_id: aerodromeId, type: 'certification', date_debut: debut.toISOString(), date_fin: fin.toISOString(),
      portee: ['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS'],
      equipe_ids: [], chef_id: '', statut: 'planifiee', priorite: 'haute',
      objectifs: `[RENOUVELLEMENT] Certification expire le ${expireDate.toLocaleDateString('fr-FR')}.\nPhase 1 sautée → Phase 2.\nTous domaines + SGS.`,
      est_proposition: true, annee_cible: annee, declencheur: 'renouvellement',
      source: { type: 'certification_renouvellement', raison: `Certificat expire le ${expireDate.toLocaleDateString('fr-FR')}`, details: [`Numéro: ${cert.numero_cert || 'N/A'}`] },
      sort_order: 1,
    })
  }

  return propositions.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return new Date(a.date_debut || '').getTime() - new Date(b.date_debut || '').getTime()
  })
}

function buildObjectifsProfil(type: string, domaines: string[], profil: ProfilRisque, freqJust: string, typeJust: string, mlReasons: string[]): string {
  const details: string[] = []
  details.push(`[PROFIL] Score: ${profil.score_global}/100 (${profil.niveau})`)
  details.push(`C1=${profil.c1} C2=${profil.c2} C3=${profil.c3} C4=${profil.c4} C5=${profil.c5}`)
  details.push(`Domaines: ${domaines.join(', ')}`)
  if (freqJust) details.push(`Fréquence: ${freqJust}`)
  if (typeJust) details.push(`Type: ${type}`)
  if (mlReasons.length > 0) details.push(`[ML] ${mlReasons.join(' | ')}`)
  return details.join('\n')
}

export function genererResumeExploitant(propositions: PlanningProposal[], aerodromeNom: string, annee: number): string {
  if (propositions.length === 0) return `Aucune inspection planifiée pour ${aerodromeNom} en ${annee}.`
  const parType: Record<string, PlanningProposal[]> = {}
  for (const p of propositions) { const t = p.type || 'autre'; if (!parType[t]) parType[t] = []; parType[t].push(p) }
  const lignes: string[] = []
  lignes.push(`Plan de surveillance ${annee} — ${aerodromeNom}`)
  lignes.push(`Total : ${propositions.length} inspection(s)\n`)
  for (const [type, props] of Object.entries(parType)) {
    const label = type === 'suivi_ecarts' ? 'Suivi des écarts' : type === 'mise_oeuvre_pac' ? 'Mise en œuvre PAC' : type === 'certification' ? 'Certification' : type === 'maintien' ? 'Maintien' : type === 'audit_complet' ? 'Audit complet' : 'Périodique'
    lignes.push(`${label} (${props.length}) :`)
    for (const p of props) {
      const debut = p.date_debut ? new Date(p.date_debut).toLocaleDateString('fr-FR') : '?'
      const fin = p.date_fin ? new Date(p.date_fin).toLocaleDateString('fr-FR') : '?'
      lignes.push(`  ${debut} → ${fin} — ${p.source.raison}`)
    }
    lignes.push('')
  }
  return lignes.join('\n')
}
