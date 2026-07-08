// lib/ia/decisionEngine.ts
// Orchestrateur central — coordonne les engines spécialisés et expose une API unifiée

import type { Aerodrome, ProfilRisque, Ecart, Surveillance, Utilisateur, Planning, Formation } from '@/lib/store'

import { riskProfileEngine, type RiskProfileAnalysis } from './engines/riskProfileEngine'
import { complianceEngine, type ComplianceAnalysis } from './engines/complianceEngine'
import { certificateEngine, type DecisionCertificat } from './engines/certificateEngine'
import { teamOptimizer, type TeamProposal } from './engines/teamOptimizer'
import { recommendationEngine, type Recommendation } from './engines/recommendationEngine'
import { llmFormatter, type FormattedOutput } from './adapters/llmFormatter'
import { suggestionMLAgent, type SurveillanceType } from '@/lib/ia/agents/suggestionMLAgent'
import { thresholdController } from '@/lib/ia/thresholdController'
import { genererRapportHTML } from './rapportGenerator'
import { decisionTracker } from './decisionTracker'
import { orchestrerDecisions } from './orchestrateurConfiance'

// ─── Types publics ───────────────────────────────────────

export type { DecisionCertificat, FormattedOutput }

export interface AnalysePreparation {
  profil: RiskProfileAnalysis
  conformite: ComplianceAnalysis
  certificat: DecisionCertificat
  equipe: TeamProposal
  recommandations: Recommendation[]
  portee: {
    domaines: string[]
    objectifs: string[]
    justification: string
  }
  declencheurs: Array<{ type: string; description: string; urgence: 'faible' | 'moyenne' | 'elevee' }>
  decisionsOrchestrees?: ReturnType<typeof orchestrerDecisions>
}

export interface AnalyseContexte {
  aerodrome: {
    id: string
    nom: string
    code_oaci: string
  }
  historiqueSurveillances: Array<{
    id: string
    type: string
    date: string
    statut: string
    domaines: string[]
  }>
  derniereMission: {
    date: string
    conclusion: string
    ecartsRestants: number
  } | null
  analyseGlobale: string
}

// ─── Orchestrateur ───────────────────────────────────────

class DecisionEngine {
  /**
   * Analyse complète d'un aérodrome : profil, conformité, certificat, équipe, recommandations
   */
  analyserPreparation(
    aerodrome: Aerodrome | null,
    profil: ProfilRisque | null,
    ecarts: Ecart[],
    surveillances: Surveillance[],
    utilisateurs: Utilisateur[],
    plannings: Planning[],
    formations: Formation[],
  ): AnalysePreparation {
    const riskAnalysis = riskProfileEngine.analyser(profil, aerodrome)
    const compliance = complianceEngine.analyser(ecarts, surveillances, aerodrome?.id ?? '')
    const certificat = certificateEngine.evaluer(aerodrome, profil, ecarts)

    // Domaines à cibler basés sur le profil et la conformité
    const domainesCibles = [
      ...riskAnalysis.domainesFaibles.map(d => d.code),
      ...Object.entries(compliance.ecartsParDomaine)
        .filter(([_, v]) => v.total >= 2)
        .map(([k]) => k),
    ]
    const domainesUniques = [...new Set(domainesCibles.slice(0, 6))]

    const equipe = teamOptimizer.proposer(utilisateurs, plannings, domainesUniques, formations)
    const recommandations = recommendationEngine.generer(riskAnalysis, compliance, certificat, ecarts)

    // Suggestion ML : type de surveillance le plus adapté
    const ecartsActifs = ecarts.filter(e => e.statut !== 'cloture')
    const predictionML = ecartsActifs.length > 0 && profil
      ? suggestionMLAgent.predictSurveillanceType(ecartsActifs[0], profil, ecartsActifs)
      : null
    if (predictionML && predictionML.confiance >= 50) {
      const typeLabels: Record<SurveillanceType, string> = {
        mise_oeuvre_pac: 'Vérification PAC',
        suivi_ecarts: 'Suivi écarts',
        audit_complet: 'Audit complet',
        programmee: 'Surveillance programmée',
        incident_critique: 'Incident critique',
        incident_majeur: 'Incident majeur',
      }
      recommandations.unshift({
        type: 'strategique',
        action: `Type de surveillance suggéré : ${typeLabels[predictionML.type]}`,
        justification: `ML (confiance ${predictionML.confiance}%) — ${predictionML.recommandation.replace(/\n/g, ' — ')}`,
        urgence: 'prochaine_mission',
      })
    }

    // Suggestion de timing optimal
    const timing = suggestionMLAgent.predictTiming(profil, ecartsActifs, surveillances, domainesUniques)
    if (timing) {
      const plage = timing.fenetreDebut === timing.fenetreFin
        ? `à J+${timing.joursRecommande}`
        : `entre J+${timing.fenetreDebut} et J+${timing.fenetreFin}`
      recommandations.unshift({
        type: 'strategique',
        action: `Meilleur moment pour programmer : ${plage} (J+${timing.joursRecommande} recommandé)`,
        justification: `${timing.facteurs.join('; ')} — confiance ${timing.confiance}%`,
        urgence: 'prochaine_mission',
      })
    }

    const objectifs: string[] = []
    const justifications: string[] = []

    if (riskAnalysis.alertes.length > 0) {
      justifications.push(...riskAnalysis.alertes)
    }

    for (const df of riskAnalysis.domainesFaibles) {
      objectifs.push(`Évaluer la conformité du domaine ${df.code} (score ${df.valeur})`)
    }

    for (const [domaine, data] of Object.entries(compliance.ecartsParDomaine)) {
      if (data.critiques > 0) {
        objectifs.push(`Vérifier la résorption des écarts critiques ${domaine}`)
      }
      if (data.enRetard > 0) {
        objectifs.push(`Suivre les ecarts en retard dans ${domaine}`)
      }
    }

    if (profil?.tendance === 'baisse') {
      objectifs.push('Analyser les causes de la dégradation récente')
    }

    if (surveillances.length > 0) {
      const derniere = surveillances[surveillances.length - 1]
      justifications.push(`Dernière surveillance: ${derniere.type} le ${new Date(derniere.created_at).toLocaleDateString()}`)
    }

    const declencheurs: AnalysePreparation['declencheurs'] = []
    if (profil && profil.score_global < 30) {
      declencheurs.push({ type: 'score_critique', description: `Score global ${profil.score_global}/100`, urgence: 'elevee' })
    }
    if (profil?.tendance === 'baisse') {
      declencheurs.push({ type: 'tendance_baisse', description: 'Dégradation du profil de risque', urgence: 'elevee' })
    }
    if (compliance.ecartsCritiques >= 2) {
      declencheurs.push({ type: 'ecarts_critiques', description: `${compliance.ecartsCritiques} écarts critiques`, urgence: 'elevee' })
    }
    if (compliance.ecartsOuverts >= 5) {
      declencheurs.push({ type: 'ecarts_multiples', description: `${compliance.ecartsOuverts} écarts ouverts`, urgence: 'moyenne' })
    }
    if (certificat.action === 'suspendre' || certificat.action === 'retirer') {
      declencheurs.push({ type: 'certificat', description: `Risque de ${certificat.action}`, urgence: 'elevee' })
    }

    if (riskAnalysis.signauxAvances?.hmm?.transition) {
      declencheurs.push({ type: 'transition_hmm', description: 'Transition de régime HMM en cours', urgence: 'elevee' })
    }
    if (riskAnalysis.signauxAvances?.extreme?.queueLourde) {
      declencheurs.push({ type: 'risque_extreme', description: `Risque extrême (tail risk ${(riskAnalysis.signauxAvances.extreme.risqueQueue * 100).toFixed(0)}%)`, urgence: 'moyenne' })
    }
    if (riskAnalysis.signauxAvances?.copule && riskAnalysis.signauxAvances.copule.probabilitePireCas > 0.25) {
      declencheurs.push({ type: 'scenario_degrade', description: `Scénario dégradé à ${(riskAnalysis.signauxAvances.copule.probabilitePireCas * 100).toFixed(0)}%`, urgence: 'moyenne' })
    }

    // Auto-ajustement des seuils basé sur le feedback historisé
    const ajustements = thresholdController.autoAjuster()
    if (ajustements.length > 0) {
      declencheurs.push({
        type: 'auto_calibration',
        description: `${ajustements.length} seuil(s) ajusté(s): ${ajustements.map(a => `${a.parametre} ${a.ancien}→${a.nouveau}`).join(', ')}`,
        urgence: 'faible',
      })
    }

    // Tracker les décisions pour le tableau de bord
    const aerodromeId = aerodrome?.id || ''
    if (aerodromeId) {
      for (const rec of recommandations.slice(0, 5)) {
        decisionTracker.enregistrerDecision(aerodromeId, 'recommendation', { recommendation: rec })
      }
      decisionTracker.enregistrerDecision(aerodromeId, 'certificat', { certificatAction: certificat.action })
      for (const dec of declencheurs.filter(d => d.urgence === 'elevee').slice(0, 3)) {
        decisionTracker.enregistrerDecision(aerodromeId, 'declencheur', { declencheurType: dec.type })
      }
      if (predictionML && predictionML.confiance >= 50) {
        decisionTracker.enregistrerDecision(aerodromeId, 'type_suggestion', { suggestionType: predictionML.type, suggestionConfiance: predictionML.confiance })
      }
    }

    // Orchestrer les décisions par niveau d'autonomie
    const analyseComplete: AnalysePreparation = {
      profil: riskAnalysis,
      conformite: compliance,
      certificat,
      equipe,
      recommandations,
      portee: {
        domaines: domainesUniques,
        objectifs,
        justification: justifications.join('; ') || `Score ${profil?.score_global ?? 'N/A'}, ${compliance.ecartsOuverts} écarts ouverts`,
      },
      declencheurs,
    }
    analyseComplete.decisionsOrchestrees = orchestrerDecisions(analyseComplete)
    return analyseComplete
  }

  /**
   * Analyse contextuelle d'une surveillance spécifique
   */
  analyserContexte(
    surveillance: Surveillance | null,
    aerodrome: Aerodrome | null,
    historique: Surveillance[],
    ecarts: Ecart[],
  ): AnalyseContexte {
    const ecartsSurveillance = surveillance
      ? ecarts.filter(e => e.surveillance_id === surveillance.id)
      : []

    const historiqueFormatted = historique.slice(-5).map(s => ({
      id: s.id,
      type: s.type,
      date: s.created_at,
      statut: s.statut,
      domaines: s.portee || [],
    }))

    let derniereMission: AnalyseContexte['derniereMission'] = null
    if (historique.length > 0) {
      const derniere = historique[historique.length - 1]
      derniereMission = {
        date: derniere.created_at,
        conclusion: 'Mission terminée',
        ecartsRestants: ecarts.filter(e => e.aerodrome_id === aerodrome?.id && e.statut === 'ouvert').length,
      }
    }

    const analyseGlobale = [
      aerodrome ? `Aérodrome: ${aerodrome.nom} (${aerodrome.code_oaci})` : '',
      `Surveillances précédentes: ${historique.length}`,
      `Écarts liés: ${ecartsSurveillance.length} (${ecartsSurveillance.filter(e => e.statut === 'ouvert').length} ouverts)`,
    ].filter(Boolean).join(' — ')

    return {
      aerodrome: aerodrome ? { id: aerodrome.id, nom: aerodrome.nom, code_oaci: aerodrome.code_oaci || '' } : { id: '', nom: 'Inconnu', code_oaci: '' },
      historiqueSurveillances: historiqueFormatted,
      derniereMission,
      analyseGlobale,
    }
  }

  /**
   * Reformule l'analyse via LLM (ou fallback texte structuré)
   */
  async formulerAnalyse(analyse: AnalysePreparation): Promise<FormattedOutput> {
    return llmFormatter.formaterAvecLlm(analyse)
  }

  /**
   * Génère le rapport d'inspection structuré (HTML, sans LLM)
   */
  genererRapport(analyse: AnalysePreparation, params: {
    aerodrome: { nom: string; code_oaci: string }
    typeSurveillance: string
    equipeNom: string
  }): string {
    return genererRapportHTML({
      ...params,
      dateGeneration: new Date().toISOString(),
      analyse,
    })
  }
}

export const decisionEngine = new DecisionEngine()
