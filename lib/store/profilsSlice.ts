// lib/store/profilsSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Profils de risque extraite du store monolithique, comportement identique.
// Inclut assainirProfilRisque (garde anti-NaN) et les types de métriques.
// Appels inter-slices via get() (store composé) : ecarts, surveillances,
// aerodromes, evenements, amdecAnalyses, ftaAnalyses, addScoreHistoryPoint,
// computeFullRiskProfile, addNotification, getUtilisateur, updateExemption...

import type { StateCreator } from 'zustand'
import type { AppStore, Ecart, EvenementSecurite, ReponseEnquete } from '../store'
import type { Surveillance } from './surveillancesSlice'
import type { BowTieModele } from '../risque/types'
import type { NiveauRisque, ScoreHistoryPoint } from '../risque/types'
import type { TypeEntiteAerodrome } from '../store'
import { toFiniteNumber } from '../utils'
import { risqueUtils } from '../risque'
import * as datastore from '../datastore'
import { supabase } from '../supabase'

export function assainirProfilRisque(profil: ProfilRisque): ProfilRisque {
  const nb = (v: unknown, def: number, min = -Infinity, max = Infinity) => toFiniteNumber(v, def, min, max)
  const scoreGlobal = nb(profil.score_global, 50, 0, 100)
  const historySaine = (profil.historical_scores || []).map(h => ({
    ...h,
    score: nb(h.score, 50, 0, 100),
    c1: h.c1 != null ? nb(h.c1, 50, 0, 100) : undefined,
    c2: h.c2 != null ? nb(h.c2, 50, 0, 100) : undefined,
    c3: h.c3 != null ? nb(h.c3, 50, 0, 100) : undefined,
    c4: h.c4 != null ? nb(h.c4, 50, 0, 100) : undefined,
    c5: h.c5 != null ? nb(h.c5, 50, 0, 100) : undefined,
  }))
  return {
    ...profil,
    score_global: scoreGlobal,
    c1: nb(profil.c1, 50, 0, 100),
    c2: nb(profil.c2, 50, 0, 100),
    c3: nb(profil.c3, 50, 0, 100),
    c4: nb(profil.c4, 50, 0, 100),
    c5: nb(profil.c5, 50, 0, 100),
    prediction_3m: nb(profil.prediction_3m, scoreGlobal, 0, 100),
    prediction_6m: nb(profil.prediction_6m, scoreGlobal, 0, 100),
    prediction_12m: profil.prediction_12m != null ? nb(profil.prediction_12m, scoreGlobal, 0, 100) : undefined,
    ensemble_confidence: nb(profil.ensemble_confidence, 30, 0, 100),
    hawkes_intensity: profil.hawkes_intensity != null ? nb(profil.hawkes_intensity, 0, 0, Infinity) : undefined,
    effectiveness_score: profil.effectiveness_score != null ? nb(profil.effectiveness_score, 50, 0, 100) : undefined,
    incident_prediction_3m: profil.incident_prediction_3m != null ? nb(profil.incident_prediction_3m, 0, 0, 100) : undefined,
    incident_prediction_6m: profil.incident_prediction_6m != null ? nb(profil.incident_prediction_6m, 0, 0, 100) : undefined,
    incident_prediction_12m: profil.incident_prediction_12m != null ? nb(profil.incident_prediction_12m, 0, 0, 100) : undefined,
    event_frequency: profil.event_frequency != null ? nb(profil.event_frequency, 0, 0, Infinity) : undefined,
    event_trend_acceleration: profil.event_trend_acceleration != null ? nb(profil.event_trend_acceleration, 0) : undefined,
    days_since_last_event: profil.days_since_last_event != null ? nb(profil.days_since_last_event, 0, 0, Infinity) : undefined,
    bayesian_posterior: profil.bayesian_posterior != null ? nb(profil.bayesian_posterior, 0.3, 0, 1) : undefined,
    bayesian_prior: profil.bayesian_prior != null ? nb(profil.bayesian_prior, 0.3, 0, 1) : undefined,
    qualityScore: profil.qualityScore != null ? nb(profil.qualityScore, 50, 0, 100) : undefined,
    historical_scores: historySaine,
    velocity_metrics: profil.velocity_metrics ? {
      ...profil.velocity_metrics,
      vitesse: nb(profil.velocity_metrics.vitesse, 0),
      acceleration: nb(profil.velocity_metrics.acceleration, 0),
      volatilite: nb(profil.velocity_metrics.volatilite, 0, 0, Infinity),
      temps_avant_seuil_critique: profil.velocity_metrics.temps_avant_seuil_critique != null
        ? nb(profil.velocity_metrics.temps_avant_seuil_critique, 999, 0, Infinity)
        : null,
    } : undefined,
    system_stress: profil.system_stress ? {
      ...profil.system_stress,
      score: nb(profil.system_stress.score, 50, 0, 100),
      stressIndicators: {
        velocityStress: nb(profil.system_stress.stressIndicators?.velocityStress, 0, 0, 100),
        ecartsStress: nb(profil.system_stress.stressIndicators?.ecartsStress, 0, 0, 100),
        c4Stress: nb(profil.system_stress.stressIndicators?.c4Stress, 0, 0, 100),
        resilienceStress: nb(profil.system_stress.stressIndicators?.resilienceStress, 0, 0, 100),
      },
    } : undefined,
    proactive_alert: profil.proactive_alert ? {
      ...profil.proactive_alert,
      probabilite_degradation_3m: nb(profil.proactive_alert.probabilite_degradation_3m, 0, 0, 100),
      probabilite_seuil30_3m: nb(profil.proactive_alert.probabilite_seuil30_3m, 0, 0, 100),
      probabilite_seuil30_6m: nb(profil.proactive_alert.probabilite_seuil30_6m, 0, 0, 100),
      delai_estime_jours: profil.proactive_alert.delai_estime_jours != null
        ? nb(profil.proactive_alert.delai_estime_jours, 0, 0, Infinity)
        : null,
    } : undefined,
    hmm_state: profil.hmm_state ? {
      ...profil.hmm_state,
      transitionRisk: nb(profil.hmm_state.transitionRisk, 30, 0, 100),
      daysToCritical: nb(profil.hmm_state.daysToCritical, 999, 0, Infinity),
    } : undefined,
    survival_metrics: profil.survival_metrics ? {
      ...profil.survival_metrics,
      hazard90d: nb(profil.survival_metrics.hazard90d, 0.1, 0, 1),
      hazard180d: nb(profil.survival_metrics.hazard180d, 0.1, 0, 1),
      medianDays: nb(profil.survival_metrics.medianDays, 999, 0, Infinity),
    } : undefined,
    extreme_risk: profil.extreme_risk ? {
      ...profil.extreme_risk,
      tailRisk: nb(profil.extreme_risk.tailRisk, 0.05, 0, 1),
      maxExpected12m: nb(profil.extreme_risk.maxExpected12m, 1, 0, Infinity),
    } : undefined,
    negbin_metrics: profil.negbin_metrics ? {
      ...profil.negbin_metrics,
      dispersion: nb(profil.negbin_metrics.dispersion, 1, 0, Infinity),
      mean: nb(profil.negbin_metrics.mean, 0),
      variance: nb(profil.negbin_metrics.variance, 0, 0, Infinity),
    } : undefined,
    copula_metrics: profil.copula_metrics ? {
      ...profil.copula_metrics,
      maxTailDependence: nb(profil.copula_metrics.maxTailDependence, 0.1, 0, 1),
      worstCaseProbability: nb(profil.copula_metrics.worstCaseProbability, 0.05, 0, 1),
    } : undefined,
    ts_metrics: profil.ts_metrics ? {
      ...profil.ts_metrics,
      bestProbability: nb(profil.ts_metrics.bestProbability, 0.5, 0, 1),
    } : undefined,
  }
}

export interface VelocityMetricsStored {
  vitesse: number
  acceleration: number
  volatilite: number
  temps_avant_seuil_critique: number | null
  niveau_vigilance: 'normal' | 'surveillance' | 'alerte' | 'critique'
}

export interface SystemStressStored {
  score: number
  niveau_stress: 'faible' | 'modere' | 'eleve' | 'critique'
  facteurs_contributeurs: string[]
  recommandation: string
  stressIndicators: {
    velocityStress: number
    ecartsStress: number
    c4Stress: number
    resilienceStress: number
  }
}

export interface ProactiveAlertStored {
  niveau_urgence: 'info' | 'vigilance' | 'alerte' | 'critique'
  probabilite_degradation_3m: number
  probabilite_seuil30_3m: number
  probabilite_seuil30_6m: number
  message_court: string
  message_long: string
  action_suggerer: string
  delai_estime_jours: number | null
}

export interface ProfilRisque {
  aerodrome_id: string
  score_global: number
  niveau: NiveauRisque
  c1: number
  c2: number
  c3: number
  c4: number
  c5: number
  prediction_3m: number
  prediction_6m: number
  prediction_12m?: number
  prediction_interval_3m?: { lower: number; upper: number }
  prediction_interval_6m?: { lower: number; upper: number }
  tendance: 'stable' | 'hausse' | 'baisse'
  computed_at: string
  // NOUVEAUX CHAMPS POUR MODÈLES AVANCÉS
  historical_scores?: ScoreHistoryPoint[]
  velocity_metrics?: VelocityMetricsStored
  system_stress?: SystemStressStored
  proactive_alert?: ProactiveAlertStored
  hawkes_intensity?: number
  effectiveness_score?: number
  last_change_point?: string
  // PRÉDICTION D'INCIDENTS ET TENDANCE ÉVÉNEMENTS
  incident_prediction_3m?: number
  incident_prediction_6m?: number
  incident_prediction_12m?: number
  event_frequency?: number
  event_severity_trend?: string
  days_since_last_event?: number
  event_trend_acceleration?: number
  // BAYESIEN ET SCÉNARIOS
  bayesian_posterior?: number
  bayesian_prior?: number
  bayesian_black_swan?: boolean
  scenarios?: Array<{ nom: string; description: string; probabilite: number; scoreProjecte: number; intervalleConfiance: [number, number]; actionsRecommandees: string[] }>
  ensemble_confidence?: number
  // MODÈLES AVANCÉS Phase 3 — persistés dans le profil
  hmm_state?: { currentStateName: string; isTransitioning: boolean; transitionRisk: number; daysToCritical: number }
  survival_metrics?: { hazard90d: number; hazard180d: number; medianDays: number }
  extreme_risk?: { tailRisk: number; isHeavyTailed: boolean; maxExpected12m: number }
  negbin_metrics?: { isOverdispersed: boolean; dispersion: number; mean: number; variance: number }
  copula_metrics?: { maxTailDependence: number; worstCaseProbability: number; worstCaseDescription: string }
  ts_metrics?: { recommendedAction: string; bestProbability: number }
  // Fiabilité des données (qualityScore)
  qualityScore?: number
  qualite?: 'excellente' | 'bonne' | 'moyenne' | 'faible'
  // Bow-Tie HIRM — modèles Bow-Tie enrichis par domaine
  bowtie_metrics?: import('../risque/types').BowTieModele[]
  // Chaîne qualitative — diagnostic combiné AMDEC + BowTie + FTA + Bayésien
  qualitative_metrics?: import('../risque/qualitativeChain').DiagnosticQualitatif
  // SNAPSHOT INFRASTRUCTURE (au moment du calcul)
  // Permet aux décisions (type surveillance, filtrage checklist) de refléter
  // les caractéristiques réelles de l'entité sans re-calculer le score numérique.
  infrastructure?: {
    type_entite: TypeEntiteAerodrome
    horaires?: 'jour' | 'h24'
    aides_visuelles?: string[]
    revetement?: string
    type_approche?: string
    categorie_sslia: string
    type: 'international' | 'national'
  }
}


// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface ProfilRisqueSlice {
  profilsRisque: Record<string, ProfilRisque>
  setProfilRisque: (aerodromeId: string, profil: ProfilRisque) => Promise<void>
  getProfilRisque: (aerodromeId: string) => ProfilRisque | null
  recalculerProfilRisque: (aerodromeId: string) => Promise<void>
  getProfilRisqueWithAiInsights?: (aerodromeId: string) => Promise<{
    profil: ProfilRisque | null;
    predictions: Record<string, unknown> | null | undefined;
    recommendations: string[];
    confidence: number;
  }>;
  }

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createProfilsSlice)
// ─────────────────────────────────────────────────────────────

export const createProfilsSlice: StateCreator<AppStore, [], [], ProfilRisqueSlice> = (set, get) => ({
      profilsRisque: {},
      setProfilRisque: async (aerodromeId, profil) => {
  // 1. Assainir NaN / hors bornes avant stockage (ne jamais propager de NaN)
  const profilSain = assainirProfilRisque(profil)
  // 2. Mettre à jour le store local
  set((state) => ({
    profilsRisque: { ...state.profilsRisque, [aerodromeId]: profilSain },
  }));
  
  // 3. Persister dans Supabase via datastore
  try {
    await datastore.upsertProfilRisque(profilSain)
  } catch (error) {
    console.error('[Store] Erreur sauvegarde profil:', error)
  }
},
      getProfilRisque: (aerodromeId) => get().profilsRisque?.[aerodromeId] || null,
      
      recalculerProfilRisque: async (aerodromeId) => {
        const { ecarts, surveillances, aerodromes, evenements, reponsesEnquetes, historiqueScores, addScoreHistoryPoint } = get()
        const ecartsAerodrome = ecarts.filter(e => e.aerodrome_id === aerodromeId)
        const surveillancesAerodrome = surveillances.filter(s => s.aerodrome_id === aerodromeId)
        const evenementsAerodrome = (evenements || []).filter((e: EvenementSecurite) => e.aerodrome_id === aerodromeId)
        const existingHistory = historiqueScores[aerodromeId] || []
        // Fallback : si le store n'a pas (encore) d'historique, le recharger depuis le profil persisté
        const historiquePersiste = existingHistory.length === 0
          ? (get().profilsRisque?.[aerodromeId]?.historical_scores || [])
          : []
        const historyFusionne = existingHistory.length > 0
          ? existingHistory
          : historiquePersiste
        const lastScore = historyFusionne.length > 0 ? historyFusionne[historyFusionne.length - 1].score : null
        const aerodrome = aerodromes.find(a => a.id === aerodromeId)
        const reponsesEnquetesAerodrome = (reponsesEnquetes || []).filter((r: ReponseEnquete) => r.aerodrome_id === aerodromeId)

        // C1 : SGS non applicable → pas de donnée (0), sera exclu du score global.
        // Le garde anti-NaN vit dans le moteur (saniC) et assainirProfilRisque.
        const scoreEnquetes = reponsesEnquetesAerodrome.length > 0
          ? reponsesEnquetesAerodrome.reduce((sum: number, r: ReponseEnquete) => sum + (r.score_c1 || 0), 0) / reponsesEnquetesAerodrome.length
          : undefined

        // Pondération harmonisée : poids appris depuis ia_thresholds (comme le cron)
        const { fetchLearnedWeights } = await import('../ia/weightController')
        const poidsAppris = await fetchLearnedWeights()
        // Moteur partagé avec le cron : C1-C5, ajustements C3 (exemptions,
        // AMDEC), score global et niveau sont calculés UNE fois dans le
        // moteur — le store ne recalcule plus rien localement (convergence).
        const { computeProfilScore } = await import('../risque/profilScoreEngine')
        const { deriverTendance } = await import('../config')
        const exemptionsActives = get().getExemptionsActives(aerodromeId)
        const analysesAmdec = get().amdecAnalyses?.filter(a => a.aerodrome_id === aerodromeId) || []
        const moteur = computeProfilScore({
          aerodrome,
          ecarts: ecartsAerodrome,
          surveillances: surveillancesAerodrome,
          evenements: evenementsAerodrome,
          scoreC1Enquetes: scoreEnquetes,
          exemptionsActives: exemptionsActives.map(e => ({
            id: e.id,
            domaines_concerne: e.domaines_concerne || [],
            mesures: e.mesures.map(m => ({
              statut: m.statut,
              efficacite_validee: m.efficacite_validee,
            })),
          })),
          analysesAmdec,
          weights: poidsAppris,
          now: Date.now(),
        })
        const c1 = moteur.c1
        const c2 = moteur.c2
        const c3Final = moteur.c3
        const c4 = moteur.c4
        const c5 = moteur.c5
        const scoreGlobal = moteur.scoreGlobal
        const niveau = moteur.niveau

        // Traçabilité côté exemptions (enrichissement store uniquement,
        // sans effet sur le score déjà calculé par le moteur).
        if (moteur.c3Ajuste && exemptionsActives.length > 0) {
          const now = new Date().toISOString()
          exemptionsActives.forEach(ex => {
            get().updateExemption(ex.id, {
              dernier_recalcul_risque: now,
              dernier_score_c3_ajuste: c3Final,
            })
          })
        }

        // Tendance : règle unique partagée avec le cron (vs dernier score).
        // Les prédictions 3m/6m restent calculées ci-dessous mais ne
        // l'écrasent plus (c'était une 2e règle divergente).
        const tendance = deriverTendance(scoreGlobal, lastScore)
        let prediction3m = scoreGlobal
        let prediction6m = scoreGlobal
        let ensembleConfidence = 30
        if (historyFusionne.length >= 2) {
          const { predictRiskScore } = await import('../risque')
          const predictions = predictRiskScore(historyFusionne.map(h => ({ date: h.date, score: h.score })))
          prediction3m = predictions.score3m
          prediction6m = predictions.score6m
        }
        // Ensemble EWMA + régression si assez de données
        if (historyFusionne.length >= 3) {
          const { predictWithEnsemble } = await import('../risque')
          const ensemble = predictWithEnsemble(historyFusionne.map(h => ({ date: h.date, score: h.score })))
          prediction3m = Math.round((prediction3m + ensemble.score3m) / 2)
          prediction6m = Math.round((prediction6m + ensemble.score6m) / 2)
          ensembleConfidence = ensemble.confidence
        }
        // ── IA Ensemble (LSTM + BayesianDynamic + XGBoost + RF) ──
        // S'active automatiquement quand assez de données historiques
        // Fallback → régression actuelle si insuffisant
        if (historyFusionne.length >= 6) {
          try {
            const { ensembleModel } = await import('../ia/models/ensemble')
            const iaEnsemble = await ensembleModel.predict(historyFusionne, 1)
            if (iaEnsemble.metadata.nModels >= 2 && iaEnsemble.confidence > ensembleConfidence) {
              prediction3m = iaEnsemble.point
              prediction6m = iaEnsemble.point
              ensembleConfidence = iaEnsemble.confidence
            }
          } catch { /* IA ensemble indisponible — fallback régression */ }
        }
        // ── Phase 3 : Modèles avancés (HMM, Survival, EVT, NB, Copulas, TS) ──
        // Procrastiné après construction de nouveauProfil car Copulas en a besoin

        // Prédiction d'incidents et tendance événements
        const { computeIncidentPrediction, computeEventTrendAnalysis, computeBayesianPosterior } = await import('../risque')
        const evenementsAvecDate = evenementsAerodrome.map((e: EvenementSecurite) => ({
          gravite: e.gravite,
          date: e.date || e.created_at,
        }))
        const incidentPred = computeIncidentPrediction(evenementsAvecDate)
        const eventTrend = computeEventTrendAnalysis(evenementsAvecDate)

        // Scénarios (optimiste, réaliste, pessimiste, catastrophe)
        let scenarios: ProfilRisque['scenarios'] = []
        if (historyFusionne.length >= 3) {
          try {
            const { generateAllScenarios } = await import('@/lib/risque/scenarios')
            const scores = historyFusionne.map(h => h.score)
            const existingProfil = get().profilsRisque?.[aerodromeId]
            const hasBlackSwan = existingProfil?.proactive_alert?.niveau_urgence === 'critique'
            scenarios = generateAllScenarios(scores, 1, hasBlackSwan)
          } catch { console.warn('[computeRiskProfile] generateAllScenarios indisponible') }
        }

        // Mise à jour bayésienne : prior par défaut à 0.3
        let bayesianUpdate = await computeBayesianPosterior(get().profilsRisque?.[aerodromeId] || null, evenementsAerodrome)

        // Bayesian Dynamic — prior évolutif (remplace le bayésien statique si assez de données)
        if (historyFusionne.length >= 5) {
          try {
            const { bayesianDynamicModel } = await import('../ia/models/bayesianDynamic')
            const priors = get().profilsRisque?.[aerodromeId]?.bayesian_prior ?? 0.3
            const { posterior } = bayesianDynamicModel.computePosterior(priors, [priors])
            const dynBlackSwan = bayesianDynamicModel.detectBlackSwan(priors, posterior)
            bayesianUpdate = {
              posteriorProbability: posterior,
              priorProbability: priors,
              estBlackSwan: dynBlackSwan || bayesianUpdate?.estBlackSwan || false,
            }
          } catch { /* bayesianDynamic indisponible */ }
        }

        // Bow-Tie HIRM — analyse complète par domaine (danger, barrières, conséquences)
        let bowtieMetrics: ProfilRisque['bowtie_metrics'] = []
        try {
          const { generateDomaineBowTie } = await import('../risque/bowTieEngine')
          const DOMAINES_BT = ['SGS', 'PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']
          const existingProfil = get().profilsRisque?.[aerodromeId]
          bowtieMetrics = DOMAINES_BT.map(domaine => {
            const ecartsDom = ecartsAerodrome.filter((e: Ecart) => e.domaine === domaine)
            const surveillancesDom = surveillancesAerodrome.filter((s: Surveillance) => (s.portee || []).includes(domaine))
            const evenementsDom = evenementsAerodrome.filter((e: EvenementSecurite) => {
              const typeMatch = e.type?.toLowerCase().includes(domaine.toLowerCase())
              return typeMatch
            })
            return generateDomaineBowTie({
              c1, c2: c2, c3: c3Final, c5,
              scoreGlobal,
              ecartsDom, surveillancesDom, evenementsDom,
              domaine,
              lastAssessed: existingProfil?.computed_at,
              statut_sgs: aerodrome?.statut_sgs,
            })
          }).filter((b: BowTieModele) => b.barrieresPreventives.some((p) => p.efficacite < 80) || b.probabiliteResiduelle > 30)
        } catch { console.warn('[computeRiskProfile] generateDomaineBowTie échoué') }

        // Chaîne qualitative — combine AMDEC + BowTie + FTA + Bayésien par domaine
        let qualitativeMetrics: ProfilRisque['qualitative_metrics'] = undefined
        if (bowtieMetrics?.length) {
          try {
            const { chainerModelesQualitatifs } = await import('../risque/qualitativeChain')
            // computeBarrierEfficacite câble les evidences par id de nœud du réseau
            // (barriere_<id>) à partir de C1/C2/C3/C5 — le réseau répond alors à
            // « comment la probabilité évolue à chaque indice ? ».
            const { computeBarrierEfficacite } = await import('../risque/bayesianNetwork')
            const ftaAnalysesAerodrome = (get().ftaAnalyses || []).filter((a: { aerodromeId: string }) => a.aerodromeId === aerodromeId)
            const bayesParDomaine: Record<string, { probabiliteResiduelle: number; barrieresCritiques: string[]; confiance: number }> = {}
            for (const bt of bowtieMetrics) {
              const bayes = computeBarrierEfficacite(bt, c1, c2, c3Final, c5, undefined, aerodrome?.statut_sgs)
              const barrieresBayes = [...bayes.barrieresPreventives, ...bayes.barrieresCorrectives]
                .filter((b) => b.efficacite < 60)
                .map((b) => b.id)
              bayesParDomaine[bt.domaine] = {
                probabiliteResiduelle: bayes.probabiliteResiduelle,
                barrieresCritiques: barrieresBayes,
                confiance: bayes.confiance,
              }
            }
            qualitativeMetrics = chainerModelesQualitatifs({
              bowties: bowtieMetrics,
              amdecAnalyses: analysesAmdec,
              ftaArbres: ftaAnalysesAerodrome,
              bayesParDomaine: Object.keys(bayesParDomaine).length > 0 ? bayesParDomaine : undefined,
            })
          } catch { console.warn('[computeRiskProfile] chaîne qualitative échouée') }
        }

        const nouveauProfil: ProfilRisque = {
          aerodrome_id: aerodromeId,
          score_global: scoreGlobal,
          niveau,
          c1, c2, c3: c3Final, c4, c5,
          prediction_3m: Number.isFinite(prediction3m) ? prediction3m : scoreGlobal,
          prediction_6m: Number.isFinite(prediction6m) ? prediction6m : scoreGlobal,
          tendance,
          computed_at: new Date().toISOString(),
          historical_scores: historyFusionne,
          incident_prediction_3m: incidentPred.probability3m,
          incident_prediction_6m: incidentPred.probability6m,
          incident_prediction_12m: incidentPred.probability12m,
          event_frequency: incidentPred.expectedEventsPerMonth,
          event_severity_trend: incidentPred.severityTrend,
          days_since_last_event: incidentPred.daysSinceLastIncident,
          event_trend_acceleration: eventTrend.recentAcceleration,
          bayesian_posterior: bayesianUpdate?.posteriorProbability,
          bayesian_prior: bayesianUpdate?.priorProbability,
          bayesian_black_swan: bayesianUpdate?.estBlackSwan,
          scenarios,
          ...risqueUtils.computeQualityScore(ecartsAerodrome),
          bowtie_metrics: bowtieMetrics?.length ? bowtieMetrics : undefined,
          qualitative_metrics: qualitativeMetrics,
          ensemble_confidence: ensembleConfidence,
          infrastructure: aerodrome ? {
            type_entite: aerodrome.type_entite,
            horaires: aerodrome.horaires,
            aides_visuelles: aerodrome.aides_visuelles,
            revetement: aerodrome.piste_principale?.revetement,
            type_approche: aerodrome.piste_principale?.type_approche,
            categorie_sslia: aerodrome.categorie_sslia,
            type: aerodrome.type,
          } : undefined,
        }
        // ── Phase 3 : computation et stockage modèles avancés ──
        if (historyFusionne.length >= 3) {
          const scoresHist = historyFusionne.map(h => h.score)
          try {
            const { modelCache } = await import('../risque/modelCache')
            const cached = modelCache.computeAll(aerodromeId, scoresHist, nouveauProfil)
            if (cached.hmm) nouveauProfil.hmm_state = {
              currentStateName: cached.hmm.currentStateName, isTransitioning: cached.hmm.isTransitioning,
              transitionRisk: cached.hmm.transitionRisk, daysToCritical: cached.hmm.daysToCritical,
            }
            if (cached.survival) nouveauProfil.survival_metrics = {
              hazard90d: cached.survival.hazard90days, hazard180d: cached.survival.hazard180days,
              medianDays: cached.survival.medianSurvivalDays || 999,
            }
            if (cached.evt) nouveauProfil.extreme_risk = {
              tailRisk: cached.evt.probabilityExtreme, isHeavyTailed: cached.evt.isHeavyTailed,
              maxExpected12m: cached.evt.maxExpected12m,
            }
            if (cached.nb) nouveauProfil.negbin_metrics = {
              isOverdispersed: cached.nb.isOverdispersed, dispersion: cached.nb.dispersion,
              mean: cached.nb.mean, variance: cached.nb.variance,
            }
            if (cached.copula) nouveauProfil.copula_metrics = {
              maxTailDependence: Math.max(...cached.copula.tailDependence.lower.flat()),
              worstCaseProbability: cached.copula.worstCaseScenario.probability,
              worstCaseDescription: cached.copula.worstCaseScenario.description,
            }
            if (cached.ts) nouveauProfil.ts_metrics = {
              recommendedAction: cached.ts.recommend(`${aerodromeId}_${new Date().getFullYear()}`).id,
              bestProbability: cached.ts.bestProbability,
            }
          } catch { /* Modèles avancés indisponibles */ }
        }
        // ── Fin Phase 3 ──
        const now = new Date().toISOString()
        const profilFinal = assainirProfilRisque(nouveauProfil)
        // Dédup : ne pas polluer score_history (client + supabase) si le score n'a pas changé
        const scoreChange = lastScore === null || profilFinal.score_global !== lastScore
        if (scoreChange) {
          addScoreHistoryPoint(aerodromeId, {
            date: now,
            score: profilFinal.score_global,
            c1: profilFinal.c1, c2: profilFinal.c2, c3: profilFinal.c3, c4: profilFinal.c4, c5: profilFinal.c5
          })
        }
        set((state) => ({
          profilsRisque: { ...state.profilsRisque, [aerodromeId]: profilFinal }
        }))
        if (scoreChange) {
          try {
            await supabase.from('score_history').insert({
              aerodrome_id: aerodromeId,
              score_global: profilFinal.score_global,
              c1: profilFinal.c1, c2: profilFinal.c2, c3: profilFinal.c3, c4: profilFinal.c4, c5: profilFinal.c5,
              niveau: profilFinal.niveau,
              tendance: profilFinal.tendance,
              computed_at: now,
            })
          } catch { /* Échec insert score_history — non bloquant */ }
        }
        await get().computeFullRiskProfile(aerodromeId)
      },


     // Après la fonction getProfilRisque existante, ajouter :
getProfilRisqueWithAiInsights: async (aerodromeId) => {
  const state = get();
  const profil = state.profilsRisque[aerodromeId] || null;
  
  if (!profil) {
    return { profil: null, predictions: null, recommendations: [], confidence: 0 };
  }
  
  // Importer dynamiquement l'agent IA
  const { riskAgent } = await import('@/lib/ia/agents/riskAgent');
  
  try {
    const analysis = await riskAgent.analyzeRisk({
      aerodromeId,
      includePredictions: true,
      includeSuggestions: true
    }, {});
    
    return {
      profil,
      predictions: analysis.predictions,
      recommendations: analysis.suggestions?.map(s => s.description) || [],
      confidence: analysis.confidence
    };
  } catch (error) {
    console.error('[Store] Erreur IA:', error);
    return { profil, predictions: null, recommendations: [], confidence: 50 };
  }
},
})
