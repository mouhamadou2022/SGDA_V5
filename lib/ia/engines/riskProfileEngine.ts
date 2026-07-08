import type { ProfilRisque, Aerodrome, Ecart, Surveillance } from '@/lib/store'
import { synthetiserModeles } from '@/lib/risque/modelSynthesis'
import { thresholdController } from '@/lib/ia/thresholdController'

export interface RiskProfileAnalysis {
  score: number
  niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
  tendance: string
  domainesFaibles: Array<{ code: string; valeur: number; seuil: number }>
  domainesEnAmelioration: Array<{ code: string; valeur: number }>
  prioriteGlobale: 'critique' | 'haute' | 'moyenne' | 'basse'
  alertes: string[]
  signauxAvances?: {
    hmm?: { etat: string; transition: boolean; risqueTransition: number }
    survie?: { danger90j: number; joursMedians: number }
    extreme?: { risqueQueue: number; queueLourde: boolean; maxAttendu12m: number }
    dispersion?: { surdispersion: boolean; moyenne: number }
    copule?: { probabilitePireCas: number; description: string }
    ts?: { actionRecommendee: string; probabilite: number }
  }
  synthese?: {
    indiceGlobal: number
    interpretation: string
    confianceGlobale: number
    tendance: 'amelioration' | 'stable' | 'degradation_legere' | 'degradation_rapide'
  }
}

export class RiskProfileEngine {
  analyser(profil: ProfilRisque | null, aerodrome: Aerodrome | null): RiskProfileAnalysis {
    if (!profil) {
      return {
        score: 0, niveau: 'faible', tendance: 'stable',
        domainesFaibles: [], domainesEnAmelioration: [],
        prioriteGlobale: 'basse', alertes: ['Profil de risque non disponible'],
      }
    }

    const scores = { C1: profil.c1, C2: profil.c2, C3: profil.c3, C4: profil.c4, C5: profil.c5 }
    const score = profil.score_global
    const seuils = thresholdController.cSeuils

    const domainesFaibles = Object.entries(scores)
      .filter(([k, v]) => v < seuils[k as keyof typeof seuils])
      .map(([k, v]) => ({ code: k, valeur: v, seuil: seuils[k as keyof typeof seuils] }))

    const domainesEnAmelioration: Array<{ code: string; valeur: number }> = []

    const alertes: string[] = []
    if (profil.tendance === 'baisse') alertes.push('Tendance globale à la baisse')
    if (profil.c4 < 40) alertes.push('Charge critique élevée, priorité haute recommandée')
    if (profil.c4 < 30) alertes.push('Surcharge critique, inspection urgente')
    if (profil.c1 < 40) alertes.push('Maturité SGS insuffisante')

    if (profil.hmm_state?.isTransitioning) {
      alertes.push(`Transition de régime détectée — risque de passage en état critique dans ${profil.hmm_state.daysToCritical} jours`)
    }
    if (profil.survival_metrics && profil.survival_metrics.hazard90d > 0.4) {
      alertes.push(`Probabilité de défaillance à 90j élevée (${(profil.survival_metrics.hazard90d * 100).toFixed(0)}%)`)
    }
    if (profil.extreme_risk?.tailRisk && profil.extreme_risk.tailRisk > 0.3) {
      alertes.push(`Risque extrême détecté — queue lourde (tail risk ${(profil.extreme_risk.tailRisk * 100).toFixed(0)}%)`)
    }
    if (profil.copula_metrics && profil.copula_metrics.worstCaseProbability > 0.25) {
      alertes.push(`Scénario dégradé probable (${(profil.copula_metrics.worstCaseProbability * 100).toFixed(0)}%) — ${profil.copula_metrics.worstCaseDescription}`)
    }
    if (profil.negbin_metrics?.isOverdispersed) {
      alertes.push('Instabilité détectée — variance anormale dans l\'historique des incidents')
    }

    // Synthèse multi-modèles (modelSynthesis)
    const synthese = synthetiserModeles(profil)
    if (synthese.indiceGlobal >= 70) {
      alertes.push(`Synthèse modèles: dégradation confirmée (indice ${synthese.indiceGlobal}/100, confiance ${synthese.confianceGlobale}%)`)
    }
    if (synthese.tendance === 'degradation_rapide') {
      alertes.push('Synthèse modèles: dégradation rapide — toutes les courbes sont orientées à la baisse')
    }
    if (synthese.signauxContradictoires.length > 0) {
      for (const sc of synthese.signauxContradictoires.slice(0, 2)) {
        alertes.push(`Signal contradictoire: ${sc}`)
      }
    }

    const niveau = score < 30 ? 'critique' : score < 50 ? 'eleve' : score < 70 ? 'moyen' : 'faible'

    let prioriteGlobale: RiskProfileAnalysis['prioriteGlobale'] = 'basse'
    if (score < 30 || profil.c4 < 30) prioriteGlobale = 'critique'
    else if (score < 50 || profil.tendance === 'baisse' || profil.c4 < 40) prioriteGlobale = 'haute'
    else if (score < 70) prioriteGlobale = 'moyenne'

    if (profil.hmm_state?.isTransitioning && prioriteGlobale !== 'critique') {
      const niveaux: RiskProfileAnalysis['prioriteGlobale'][] = ['basse', 'moyenne', 'haute', 'critique']
      const idx = niveaux.indexOf(prioriteGlobale)
      prioriteGlobale = niveaux[Math.min(idx + 1, niveaux.length - 1)]
    }
    if (profil.extreme_risk?.tailRisk && profil.extreme_risk.tailRisk > 0.3 && prioriteGlobale !== 'critique') {
      const niveaux: RiskProfileAnalysis['prioriteGlobale'][] = ['basse', 'moyenne', 'haute', 'critique']
      const idx = niveaux.indexOf(prioriteGlobale)
      prioriteGlobale = niveaux[Math.min(idx + 1, niveaux.length - 1)]
    }

    return {
      score, niveau, tendance: profil.tendance,
      domainesFaibles, domainesEnAmelioration,
      prioriteGlobale, alertes,
      signauxAvances: {
        hmm: profil.hmm_state ? {
          etat: profil.hmm_state.currentStateName,
          transition: profil.hmm_state.isTransitioning,
          risqueTransition: profil.hmm_state.transitionRisk,
        } : undefined,
        survie: profil.survival_metrics ? {
          danger90j: profil.survival_metrics.hazard90d,
          joursMedians: profil.survival_metrics.medianDays,
        } : undefined,
        extreme: profil.extreme_risk ? {
          risqueQueue: profil.extreme_risk.tailRisk,
          queueLourde: profil.extreme_risk.isHeavyTailed,
          maxAttendu12m: profil.extreme_risk.maxExpected12m,
        } : undefined,
        dispersion: profil.negbin_metrics ? {
          surdispersion: profil.negbin_metrics.isOverdispersed,
          moyenne: profil.negbin_metrics.mean,
        } : undefined,
        copule: profil.copula_metrics ? {
          probabilitePireCas: profil.copula_metrics.worstCaseProbability,
          description: profil.copula_metrics.worstCaseDescription,
        } : undefined,
        ts: profil.ts_metrics ? {
          actionRecommendee: profil.ts_metrics.recommendedAction,
          probabilite: profil.ts_metrics.bestProbability,
        } : undefined,
      },
      synthese: {
        indiceGlobal: synthese.indiceGlobal,
        interpretation: synthese.interpretation,
        confianceGlobale: synthese.confianceGlobale,
        tendance: synthese.tendance,
      },
    }
  }
}

export const riskProfileEngine = new RiskProfileEngine()
