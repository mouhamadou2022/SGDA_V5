// lib/ia/engines/certificateEngine.ts
// Évalue l'état du certificat : reconduction, suspension, retrait

import type { Aerodrome, ProfilRisque, Ecart } from '@/lib/store'

export interface DecisionCertificat {
  action: 'reconduire' | 'suspendre' | 'retirer' | 'inspection_approfondie' | 'conditionnel'
  conditions?: string[]
  justification: string
}

export class CertificateEngine {
  evaluer(
    aerodrome: Aerodrome | null,
    profil: ProfilRisque | null,
    ecarts: Ecart[],
  ): DecisionCertificat {
    if (!aerodrome) {
      return { action: 'inspection_approfondie', justification: 'Aérodrome inconnu' }
    }

    const score = profil?.score_global ?? 50
    const ecartsOuverts = ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.statut === 'ouvert')
    const ecartsCritiques = ecartsOuverts.filter(e => (e.niveau_risque || 'moyen') === 'critique')

    const hmmTransition = profil?.hmm_state?.isTransitioning
    const tailRisk = (profil?.extreme_risk?.tailRisk ?? 0) > 0.3

    if (ecartsCritiques.length >= 5 || score < 30 || (hmmTransition && tailRisk)) {
      return {
        action: 'retirer',
        justification: `Risque critique : ${ecartsCritiques.length} écarts critiques, score ${score}/100${hmmTransition ? ', transition HMM en cours' : ''}${tailRisk ? ', risque extrême' : ''}`,
      }
    }

    if (ecartsCritiques.length >= 2 || score < 50 || hmmTransition) {
      return {
        action: 'suspendre',
        conditions: [
          'Résorber les écarts critiques sous 3 mois',
          'Soumettre un plan d\'action correctif approuvé par la DG',
          'Inspection de contrôle dans les 90 jours',
        ],
        justification: `Risque élevé : ${ecartsCritiques.length} écarts critiques, score ${score}/100${hmmTransition ? ', régime instable' : ''}`,
      }
    }

    if (ecartsOuverts.length <= 3 && score >= 70) {
      return {
        action: 'reconduire',
        justification: `Conformité satisfaisante : score ${score}/100, ${ecartsOuverts.length} écarts ouverts`,
      }
    }

    return {
      action: 'inspection_approfondie',
      justification: `Situation intermédiaire : score ${score}/100, ${ecartsOuverts.length} écarts dont ${ecartsCritiques.length} critiques`,
    }
  }
}

export const certificateEngine = new CertificateEngine()
