// lib/ia/orchestrateurConfiance.ts
// Orchestrateur confidence-aware : décide du niveau d'autonomie pour chaque recommandation
// auto-apply si confiance > 80% (sauf certificat critique)
// suggestion si confiance 50–80%
// validation humaine obligatoire si confiance < 50% ou certificat retirer/suspendre

import type { AnalysePreparation } from './decisionEngine'
import type { Recommendation } from './engines/recommendationEngine'

export type NiveauAutonomie = 'auto_appliquer' | 'suggestion' | 'validation_humaine'

export interface DecisionAvecAutonomie {
  recommandation: Recommendation
  niveau: NiveauAutonomie
  raison: string
}

export interface AnalyseOrchestree {
  original: AnalysePreparation
  decisions: DecisionAvecAutonomie[]
  resume: {
    autoAppliquees: number
    suggestions: number
    validationRequise: number
  }
}

export function orchestrerDecisions(analyse: AnalysePreparation): AnalyseOrchestree {
  const decisions: DecisionAvecAutonomie[] = []

  for (const rec of analyse.recommandations) {
    let niveau: NiveauAutonomie
    let raison: string

    // Règle 1: Certificat retirer/suspendre → toujours validation humaine
    if (rec.validationRequise && rec.action.toLowerCase().includes('certificat')) {
      niveau = 'validation_humaine'
      raison = 'Action certificat critique — validation humaine obligatoire'
    }
    // Règle 2: validationRequise flag → validation humaine
    else if (rec.validationRequise) {
      niveau = 'validation_humaine'
      raison = 'Validation humaine requise par l\'engine'
    }
    // Règle 3: Confiance > 80% → auto-appliquer
    else if (rec.confiance !== undefined && rec.confiance > 80) {
      niveau = 'auto_appliquer'
      raison = `Confiance élevée (${rec.confiance}%) — application automatique`
    }
    // Règle 4: Confiance 50–80% → suggestion
    else if (rec.confiance !== undefined && rec.confiance >= 50) {
      niveau = 'suggestion'
      raison = `Confiance modérée (${rec.confiance}%) — soumis à validation`
    }
    // Règle 5: Confiance basse ou inconnue → validation humaine
    else {
      niveau = 'validation_humaine'
      raison = rec.confiance !== undefined
        ? `Confiance insuffisante (${rec.confiance}%) — validation humaine requise`
        : 'Confiance non évaluée — validation humaine requise'
    }

    decisions.push({ recommandation: rec, niveau, raison })
  }

  return {
    original: analyse,
    decisions,
    resume: {
      autoAppliquees: decisions.filter(d => d.niveau === 'auto_appliquer').length,
      suggestions: decisions.filter(d => d.niveau === 'suggestion').length,
      validationRequise: decisions.filter(d => d.niveau === 'validation_humaine').length,
    },
  }
}
