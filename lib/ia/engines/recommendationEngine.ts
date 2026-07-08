// lib/ia/engines/recommendationEngine.ts
// Génère des recommandations actionnables basées sur l'analyse

import type { RiskProfileAnalysis } from './riskProfileEngine'
import type { ComplianceAnalysis } from './complianceEngine'
import type { DecisionCertificat } from './certificateEngine'
import type { Ecart, ProfilRisque, EvenementSecurite } from '@/lib/store'
import { analyserSousZones } from '@/lib/ia/subDomainAnalyzer'
import { thresholdController } from '@/lib/ia/thresholdController'
import { engineFeedback } from './engineFeedback'
import { modelOrchestrator, type ModelSelection } from './modelOrchestrator'
import { getRegulatoryRefByDim, formatRegulatoryRef, type RegulatoryRef } from '@/lib/ia/regulatoryRefs'

export interface Recommendation {
  type: 'prioritaire' | 'preventif' | 'correctif' | 'strategique'
  domaine?: string
  sousZone?: string
  zoneDetail?: string
  action: string
  justification: string
  urgence: 'immediate' | '3_mois' | '6_mois' | 'prochaine_mission'
  confiance?: number
  validationRequise?: boolean
}

export interface PointMotivation {
  source: 'profil_risque' | 'pac' | 'evenement' | 'hmm' | 'extreme' | 'scenario' | 'tendance' | 'alerte_proactive' | 'survie' | 'orchestrateur'
  label: string
  valeur: string
  impact: 'positif' | 'negatif' | 'neutre'
  ref?: RegulatoryRef
}

export interface RecommandationDuJour {
  titre: string
  priorite: 'critique' | 'haute' | 'moyenne' | 'basse'
  action: string
  delai: string
  motivations: PointMotivation[]
  synthese: string
  modelSelection?: ModelSelection
  confianceOrchestrateur: number
}

const DIM_LABELS: Record<string, string> = {
  c1: 'Maturité SGS', c2: 'Efficacité PAC',
  c3: 'Conformité', c4: 'Charge critique', c5: 'Résilience',
}

export class RecommendationEngine {
  generer(
    riskProfile: RiskProfileAnalysis,
    compliance: ComplianceAnalysis,
    certificat: DecisionCertificat | null,
    ecarts?: Ecart[],
  ): Recommendation[] {
    const recommendations: Recommendation[] = []
    const seuilImmediate = thresholdController.scoreAlerteImmediate
    const seuilCorrectif = thresholdController.scoreAlerteCorrectif

    if (ecarts && ecarts.length > 0) {
      for (const df of riskProfile.domainesFaibles) {
        const sousZones = analyserSousZones(df.code, ecarts)
        if (sousZones.sousZones.length > 0 && sousZones.sousZones[0].nom !== 'Général') {
          const pire = sousZones.sousZones.reduce((a, b) => a.nbEcarts > b.nbEcarts ? a : b)
          const detail = pire.sousZonesFilles?.length
            ? ` (notamment ${pire.sousZonesFilles[0].nom})`
            : ''
          if (df.valeur < seuilImmediate) {
            recommendations.push({
              type: 'prioritaire', domaine: df.code,
              sousZone: pire.nom,
              action: `Inspection approfondie ${sousZones.domaineLabel} — ${pire.nom}${detail}`,
              justification: `Score ${df.valeur} < ${seuilImmediate}, ${pire.nbEcarts} écart(s) dans ${pire.nom}`,
              urgence: 'immediate',
            })
          } else if (df.valeur < seuilCorrectif) {
            recommendations.push({
              type: 'correctif', domaine: df.code,
              sousZone: pire.nom,
              action: `Plan de redressement ${sousZones.domaineLabel} — ${pire.nom}${detail}`,
              justification: `Score ${df.valeur} sous le seuil ${df.seuil}, ${pire.nbEcarts} écart(s) dans ${pire.nom}`,
              urgence: '3_mois',
            })
          }
        } else {
          if (df.valeur < seuilImmediate) {
            recommendations.push({
              type: 'prioritaire', domaine: df.code,
              action: `Inspection approfondie du domaine ${df.code}`,
              justification: `Score ${df.valeur} < ${seuilImmediate}`,
              urgence: 'immediate',
            })
          } else if (df.valeur < seuilCorrectif) {
            recommendations.push({
              type: 'correctif', domaine: df.code,
              action: `Plan de redressement pour ${df.code}`,
              justification: `Score ${df.valeur} sous le seuil ${df.seuil}`,
              urgence: '3_mois',
            })
          }
        }
      }
    } else {
      for (const df of riskProfile.domainesFaibles) {
        if (df.valeur < seuilImmediate) {
          recommendations.push({
            type: 'prioritaire', domaine: df.code,
            action: `Inspection approfondie du domaine ${df.code}`,
            justification: `Score ${df.valeur} < ${seuilImmediate}`,
            urgence: 'immediate',
          })
        } else if (df.valeur < seuilCorrectif) {
          recommendations.push({
            type: 'correctif', domaine: df.code,
            action: `Plan de redressement pour ${df.code}`,
            justification: `Score ${df.valeur} sous le seuil ${df.seuil}`,
            urgence: '3_mois',
          })
        }
      }
    }

    if (riskProfile.tendance === 'baisse') {
      recommendations.push({
        type: 'strategique',
        action: 'Analyse des causes de la dégradation',
        justification: 'Tendance baissière détectée',
        urgence: '3_mois',
      })
      recommendations.push({
        type: 'correctif',
        action: 'Renforcer la fréquence des surveillances',
        justification: 'Tendance baissière',
        urgence: 'prochaine_mission',
      })
    }

    if (compliance.ecartsCritiques >= 2) {
      recommendations.push({
        type: 'prioritaire',
        action: 'Réunion exceptionnelle pour résorber les écarts critiques',
        justification: `${compliance.ecartsCritiques} écarts critiques ouverts`,
        urgence: 'immediate',
      })
    }

    for (const pb of compliance.pointsBloquants) {
      recommendations.push({
        type: 'correctif',
        action: `Traiter: ${pb}`,
        justification: 'Point bloquant identifié',
        urgence: '3_mois',
      })
    }

    if (compliance.tauxResolution < 50) {
      recommendations.push({
        type: 'strategique',
        action: 'Améliorer le taux de résolution des écarts',
        justification: `Taux actuel: ${compliance.tauxResolution}%`,
        urgence: '6_mois',
      })
    }

    if (certificat) {
      const certConfiance = engineFeedback.getConfiance('certificate')
      if (certificat.action === 'retirer' || certificat.action === 'suspendre') {
        recommendations.push({
          type: 'prioritaire',
          action: `${certificat.action === 'retirer' ? 'Retrait' : 'Suspension'} du certificat — validation humaine requise`,
          justification: certificat.justification,
          urgence: 'immediate',
          confiance: certConfiance,
          validationRequise: true,
        })
      }
      if (certificat.conditions) {
        for (const c of certificat.conditions) {
          recommendations.push({
            type: 'prioritaire', action: c,
            justification: `Condition liée au certificat: ${certificat.action}`,
            urgence: '3_mois',
            confiance: certConfiance,
            validationRequise: certConfiance < 50,
          })
        }
      }
    }

    if (riskProfile.signauxAvances?.hmm?.transition) {
      recommendations.push({
        type: 'prioritaire',
        action: 'Inspection préventive urgente — risque de transition de régime',
        justification: `Risque de passage en état critique dans ${riskProfile.signauxAvances.hmm.risqueTransition > 0 ? 'les prochains cycles' : 'un avenir proche'}`,
        urgence: 'immediate',
      })
    }
    if (riskProfile.signauxAvances?.extreme?.queueLourde) {
      recommendations.push({
        type: 'preventif',
        action: 'Renforcer les barrières de sécurité — risque extrême détecté',
        justification: `Queue lourde (tail risk ${(riskProfile.signauxAvances.extreme.risqueQueue * 100).toFixed(0)}%)`,
        urgence: '3_mois',
      })
    }
    if (riskProfile.signauxAvances?.copule && riskProfile.signauxAvances.copule.probabilitePireCas > 0.25) {
      recommendations.push({
        type: 'strategique',
        action: `Audit ciblé — scénario dégradé probable`,
        justification: `${(riskProfile.signauxAvances.copule.probabilitePireCas * 100).toFixed(0)}% de risque : ${riskProfile.signauxAvances.copule.description}`,
        urgence: '3_mois',
      })
    }
    if (riskProfile.signauxAvances?.survie && riskProfile.signauxAvances.survie.danger90j > 0.4) {
      recommendations.push({
        type: 'preventif',
        action: 'Plan de prévention renforcé — probabilité de défaillance élevée',
        justification: `Risque de défaillance à 90j: ${(riskProfile.signauxAvances.survie.danger90j * 100).toFixed(0)}%, médiane: ${riskProfile.signauxAvances.survie.joursMedians}j`,
        urgence: '3_mois',
      })
    }
    if (riskProfile.signauxAvances?.dispersion?.surdispersion) {
      recommendations.push({
        type: 'strategique',
        action: 'Analyse de stabilité — variance anormale dans l\'historique',
        justification: 'Instabilité détectée via le modèle de dispersion',
        urgence: '6_mois',
      })
    }

    const confiance = engineFeedback.getConfiance('recommendation')
    for (const r of recommendations) {
      r.confiance = confiance
      if (confiance < 50 && r.type === 'prioritaire') {
        r.validationRequise = true
        r.justification += ` (confiance ${confiance}% — validation humaine requise)`
      }
      if (confiance < 30 && r.urgence === 'immediate') {
        r.urgence = '3_mois'
      }
    }

    return recommendations.sort((a, b) => {
      const ordre = { immediate: 0, '3_mois': 1, '6_mois': 2, prochaine_mission: 3 }
      return ordre[a.urgence] - ordre[b.urgence]
    })
  }

  genererRecommandationDuJour(
    profil: ProfilRisque,
    ecarts: Ecart[],
    evenements: EvenementSecurite[],
    aerodromeCode: string,
    aerodromeNom: string,
  ): RecommandationDuJour {
    const motivations: PointMotivation[] = []
    const scores: { priorite: number; motif: string; delai: string }[] = []

    // 0. Orchestrateur — quel modèle est le plus pertinent ?
    const modelSelection = modelOrchestrator.selectModel({ profil })
    const confBoost = Math.round(modelSelection.confidence / 10) // 0-10
    motivations.push({
      source: 'orchestrateur',
      label: `Modèle sélectionné : ${modelSelection.selected} (confiance ${modelSelection.confidence}%)`,
      valeur: modelSelection.selected,
      impact: modelSelection.confidence >= 70 ? 'positif' : 'neutre',
    })

    // Appliquer le boost de l'orchestrateur sur les scores des signaux
    function applyOrchestratorBoost(motif: string, basePriorite: number): number {
      if (modelSelection.selected === 'hmm' && motif === 'transition_hmm') return basePriorite + confBoost
      if (modelSelection.selected === 'survival' && motif === 'defaillance_90j') return basePriorite + confBoost
      if (modelSelection.selected === 'evt' && motif === 'risque_extreme') return basePriorite + confBoost
      if (modelSelection.selected === 'linear_regression' && motif === 'dégradation') return basePriorite + confBoost
      if (modelSelection.selected === 'bayesian_network_causal' && motif === 'scenario_barriere') return basePriorite + confBoost
      return basePriorite
    }

    // 1. Profil risque
    motivations.push({
      source: 'profil_risque',
      label: `Score global : ${profil.score_global}/100 (${profil.niveau})`,
      valeur: `${profil.score_global}/100`,
      impact: profil.score_global < 40 ? 'negatif' : profil.score_global >= 70 ? 'positif' : 'neutre',
      ref: getRegulatoryRefByDim('default')[0],
    })

    // 2. Tendance
    if (profil.tendance === 'baisse') {
      const delta = profil.prediction_3m - profil.score_global
      motivations.push({
        source: 'tendance',
        label: `Tendance baissière : -${Math.abs(Math.round(delta))} pts prévus sur 3 mois`,
        valeur: `-${Math.abs(Math.round(delta))} pts/3m`,
        impact: 'negatif',
      })
      scores.push({ priorite: applyOrchestratorBoost('dégradation', 8), motif: 'dégradation', delai: '3 mois' })
    } else if (profil.tendance === 'hausse') {
      motivations.push({
        source: 'tendance',
        label: 'Tendance à l\'amélioration',
        valeur: 'hausse',
        impact: 'positif',
      })
    }

    // 3. PAC en retard / critiques
    const ecartsAerodrome = ecarts.filter(e => e.aerodrome_id === profil.aerodrome_id)
    const pacEnRetard = ecartsAerodrome.filter(e => e.statut === 'en_retard')
    const pacCritiques = ecartsAerodrome.filter(e => e.niveau_risque === 'critique' && e.statut !== 'cloture')
    const domainesPac = [...new Set(pacEnRetard.map(e => e.domaine))]

    if (pacEnRetard.length > 0) {
      motivations.push({
        source: 'pac',
        label: `${pacEnRetard.length} PAC en retard (${domainesPac.join(', ')})`,
        valeur: `${pacEnRetard.length} en retard`,
        impact: 'negatif',
        ref: getRegulatoryRefByDim('c2')[1],
      })
      scores.push({ priorite: applyOrchestratorBoost('pac_retard', 10), motif: 'pac_retard', delai: 'immédiat' })
    }
    if (pacCritiques.length > 0) {
      motivations.push({
        source: 'pac',
        label: `${pacCritiques.length} écart(s) critique(s) non résolu(s)`,
        valeur: `${pacCritiques.length} critiques`,
        impact: 'negatif',
        ref: getRegulatoryRefByDim('c2')[0],
      })
      scores.push({ priorite: applyOrchestratorBoost('ecart_critique', 9), motif: 'ecart_critique', delai: 'immédiat' })
    }

    // 4. Événements sécurité
    const evtsAerodrome = evenements.filter(e => e.aerodrome_id === profil.aerodrome_id)
    const evtsRecents = evtsAerodrome.filter(e => {
      const d = new Date(e.date)
      return !isNaN(d.getTime()) && (Date.now() - d.getTime()) < 90 * 86400000
    })
    if (evtsRecents.length > 0) {
      const graves = evtsRecents.filter(e => e.gravite === 'CRITIQUE' || e.gravite === 'ORANGE')
      motivations.push({
        source: 'evenement',
        label: `${evtsRecents.length} événement(s) dans les 90 jours${graves.length > 0 ? ` dont ${graves.length} grave(s)` : ''}`,
        valeur: `${evtsRecents.length} évts/90j`,
        impact: graves.length > 0 ? 'negatif' : 'neutre',
      })
      if (graves.length > 0) scores.push({ priorite: applyOrchestratorBoost('evenement_grave', 7), motif: 'evenement_grave', delai: '3 mois' })
    }

    // 5. HMM
    if (profil.hmm_state?.isTransitioning) {
      motivations.push({
        source: 'hmm',
        label: `Transition silencieuse vers un état critique (J-${profil.hmm_state.daysToCritical})`,
        valeur: `transition J-${profil.hmm_state.daysToCritical}`,
        impact: 'negatif',
      })
      scores.push({ priorite: applyOrchestratorBoost('transition_hmm', 10), motif: 'transition_hmm', delai: `${profil.hmm_state.daysToCritical} jours` })
    }

    // 6. Risque extrême (EVT)
    if (profil.extreme_risk?.isHeavyTailed) {
      motivations.push({
        source: 'extreme',
        label: `Risque extrême : queue lourde (tail risk ${(profil.extreme_risk.tailRisk * 100).toFixed(0)}%)`,
        valeur: `tail risk ${(profil.extreme_risk.tailRisk * 100).toFixed(0)}%`,
        impact: 'negatif',
      })
      scores.push({ priorite: applyOrchestratorBoost('risque_extreme', 6), motif: 'risque_extreme', delai: '3 mois' })
    }

    // 7. Survie
    if (profil.survival_metrics && profil.survival_metrics.hazard90d > 0.4) {
      motivations.push({
        source: 'survie',
        label: `Risque de défaillance à 90j : ${(profil.survival_metrics.hazard90d * 100).toFixed(0)}%`,
        valeur: `${(profil.survival_metrics.hazard90d * 100).toFixed(0)}%`,
        impact: 'negatif',
      })
      scores.push({ priorite: applyOrchestratorBoost('defaillance_90j', 5), motif: 'defaillance_90j', delai: '3 mois' })
    }

    // 8. Scénario bayésien
    if (profil.scenarios && profil.scenarios.length > 0) {
      const pire = [...profil.scenarios].sort((a, b) => a.scoreProjecte - b.scoreProjecte)[0]
      motivations.push({
        source: 'scenario',
        label: `Scénario pire cas : ${pire.nom} (${pire.scoreProjecte}/100, proba ${(pire.probabilite * 100).toFixed(0)}%)`,
        valeur: `${pire.scoreProjecte}/100`,
        impact: pire.scoreProjecte < 40 ? 'negatif' : 'neutre',
      })
    }

    // 8b. Réseau bayésien causal (bow-tie) — propagation des dégradations de barrières
    if (profil.bowtie_metrics && profil.bowtie_metrics.length > 0) {
      const domainesDegrades = profil.bowtie_metrics
        .filter(bt => {
          const preventivesDegradees = bt.barrieresPreventives.filter(b => !b.efficace).length
          const correctivesDegradees = bt.barrieresCorrectives.filter(b => !b.efficace).length
          return preventivesDegradees + correctivesDegradees >= 2
        })
        .map(bt => `${bt.domaine} (${bt.barrieresPreventives.filter(b => !b.efficace).length + bt.barrieresCorrectives.filter(b => !b.efficace).length} barrières)`)
      if (domainesDegrades.length > 0) {
        motivations.push({
          source: 'scenario',
          label: `Barrières dégradées détectées par réseau bayésien causal : ${domainesDegrades.join(', ')}`,
          valeur: `${domainesDegrades.length} domaine(s)`,
          impact: 'negatif',
        })
        scores.push({ priorite: applyOrchestratorBoost('scenario_barriere', 8), motif: 'scenario_barriere', delai: '3 mois' })
      } else {
        motivations.push({
          source: 'scenario',
          label: 'Réseau bayésien causal : toutes les barrières sont intactes',
          valeur: 'OK',
          impact: 'positif',
        })
      }
    }

    // 9. Alerte proactive
    if (profil.proactive_alert) {
      motivations.push({
        source: 'alerte_proactive',
        label: profil.proactive_alert.message_court,
        valeur: profil.proactive_alert.niveau_urgence,
        impact: 'negatif',
      })
    }

    // 10. Dimension la plus faible
    const dims = ['c1', 'c2', 'c3', 'c4', 'c5'] as const
    const plusFaible = dims.map(k => ({ key: k, val: (profil[k] as number) ?? 0 })).sort((a, b) => a.val - b.val)[0]
    if (plusFaible.val < 40) {
      motivations.push({
        source: 'profil_risque',
        label: `Dimension critique : ${DIM_LABELS[plusFaible.key] || plusFaible.key} (${plusFaible.val}/100)`,
        valeur: `${DIM_LABELS[plusFaible.key] || plusFaible.key} ${plusFaible.val}/100`,
        impact: 'negatif',
        ref: getRegulatoryRefByDim(plusFaible.key)[0],
      })
    }

    // Priorité
    const prioriteMax = Math.max(...scores.map(s => s.priorite), 0)
    const priorite: RecommandationDuJour['priorite'] =
      prioriteMax >= 9 ? 'critique' : prioriteMax >= 6 ? 'haute' : prioriteMax >= 3 ? 'moyenne' : 'basse'

    const delaiPire = scores.find(s => s.priorite === prioriteMax)?.delai ?? 'prochaine mission'
    const signalFort = scores.find(s => s.priorite === prioriteMax)
    let action = ''
    let titre = ''

    if (signalFort?.motif === 'transition_hmm') {
      titre = `Transition silencieuse détectée — ${aerodromeNom}`
      action = `Programmer une inspection complète dans les ${profil.hmm_state!.daysToCritical} jours. L'analyse HMM montre un glissement silencieux vers un état critique. Vérifier les barrières de sécurité et les PAC en souffrance.`
    } else if (signalFort?.motif === 'pac_retard') {
      const domaines = domainesPac.join(', ')
      titre = `${pacEnRetard.length} PAC en retard — ${aerodromeNom}`
      action = `Relancer les ${pacEnRetard.length} PAC en retard (${domaines}) et fixer une deadline sous 15 jours. ${pacCritiques.length > 0 ? `${pacCritiques.length} écart(s) critique(s) nécessitent une attention prioritaire.` : ''}`
    } else if (signalFort?.motif === 'ecart_critique') {
      titre = `${pacCritiques.length} écart(s) critique(s) — ${aerodromeNom}`
      action = `Traiter en priorité les ${pacCritiques.length} écarts critiques ouverts. Chaque écart critique non résolu dégrade le score C2 (efficacité PAC) de 15 à 25 points.`
    } else if (signalFort?.motif === 'evenement_grave') {
      titre = `Événements graves récents — ${aerodromeNom}`
      action = `Analyser les causes profondes des ${evtsRecents.filter(e => e.gravite === 'CRITIQUE' || e.gravite === 'ORANGE').length} événements graves des 90 derniers jours. Renforcer les barrières de sécurité et mettre à jour l'analyse de risques.`
    } else if (signalFort?.motif === 'dégradation') {
      titre = `Dégradation continue — ${aerodromeNom}`
      action = `Inverser la tendance baissière en priorisant la résolution des écarts et le renforcement du SGS. Le score pourrait passer sous ${profil.score_global - 20} dans 6 mois si rien n'est fait.`
    } else if (signalFort?.motif === 'risque_extreme') {
      titre = `Risque extrême identifié — ${aerodromeNom}`
      action = `Préparer un plan d'urgence. Le modèle EVT détecte une queue lourde : la probabilité d'un événement majeur est anormalement élevée. Renforcer les inspections préventives.`
    } else if (signalFort?.motif === 'defaillance_90j') {
      titre = `Risque de défaillance élevé — ${aerodromeNom}`
      action = `Programmer une inspection préventive. Le modèle de survie estime un risque de défaillance à ${(profil.survival_metrics!.hazard90d * 100).toFixed(0)}% dans les 90 jours.`
    } else if (signalFort?.motif === 'scenario_barriere') {
      titre = `Dégradation en chaîne des barrières — ${aerodromeNom}`
      action = `Le réseau bayésien causal détecte une propagation de dégradations sur ${profil.bowtie_metrics?.filter(bt => {
        const p = bt.barrieresPreventives.filter(b => !b.efficace).length
        const c = bt.barrieresCorrectives.filter(b => !b.efficace).length
        return p + c >= 2
      }).length ?? 0} domaine(s). Réaliser une inspection transverse pour vérifier l'intégrité des barrières de sécurité avant défaillance multiple.`
    } else {
      titre = `Aucun signal critique — ${aerodromeNom}`
      action = `Maintenir la vigilance. Aucun signal nécessitant une action immédiate. Prochaine inspection planifiée selon le cycle normal.`
    }

    const negatifs = motivations.filter(m => m.impact === 'negatif')
    const synthese = negatifs.length > 0
      ? `${negatifs.length} point(s) d'attention : ${negatifs.map(m => m.label.toLowerCase()).join(' ; ')}.`
      : 'Tous les indicateurs sont stables ou en amélioration.'

    if (pacEnRetard.length > 0 && !motivations.find(m => m.source === 'profil_risque' && m.label.includes('C2'))) {
      motivations.push({
        source: 'profil_risque',
        label: `C2 (${DIM_LABELS.c2}) à ${profil.c2}/100`,
        valeur: `C2=${profil.c2}`,
        impact: profil.c2 < 40 ? 'negatif' : 'neutre',
        ref: getRegulatoryRefByDim('c2')[0],
      })
    }

    return {
      titre, priorite, action, delai: delaiPire,
      motivations, synthese,
      modelSelection,
      confianceOrchestrateur: modelSelection.confidence,
    }
  }
}

export const recommendationEngine = new RecommendationEngine()
