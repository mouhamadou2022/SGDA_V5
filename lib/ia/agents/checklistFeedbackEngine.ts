// lib/ia/agents/checklistFeedbackEngine.ts
// Boucle de feedback : résultats de checklist → recalibrage AERORISQ
// Appelé quand une surveillance passe à "checklist_signee"

'use client'

import { useAppStore } from '@/lib/store'
import {
  computeDomaineConformite,
  mapConformiteToEffectiveness,
  type DomaineConformiteResult,
} from '@/lib/ia/bridge/kitAerorisqBridge'
import { decisionTracker } from '@/lib/ia/decisionTracker'
import { weightController } from '@/lib/ia/weightController'
import type { DecisionOutcome } from '@/lib/ia/evaluateOutcomes'

export interface ChecklistFeedbackReport {
  surveillanceId: string
  aerodromeId: string
  domaines: DomaineConformiteResult[]
  effectivenessParDomaine: Array<{
    domaine: string
    taux: number
    effectiveness: 'efficace' | 'partiel' | 'inefficace'
  }>
  weightAdjustments: number
  decisionsCrees: number
  processedAt: string
}

export class ChecklistFeedbackEngine {
  private initialized = false

  async init(): Promise<void> {
    await decisionTracker.initFromIDB()
    await weightController.initFromIDB()
    this.initialized = true
  }

  isReady(): boolean {
    return this.initialized
  }

  async ingestSurveillanceResults(surveillanceId: string): Promise<ChecklistFeedbackReport | null> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find(s => s.id === surveillanceId)
    if (!surveillance) {
      console.warn(`[ChecklistFeedback] Surveillance ${surveillanceId} introuvable`)
      return null
    }

    const aerodromeId = surveillance.aerodrome_id
    if (!aerodromeId) {
      console.warn(`[ChecklistFeedback] Surveillance ${surveillanceId} sans aerodrome_id`)
      return null
    }

    const records = store.checklistMemoryRecords.filter(
      r => r.dernier_resultat && r.historique_resultats.some(h => h.surveillance_id === surveillanceId)
    )

    if (records.length === 0) {
      console.log(`[ChecklistFeedback] Aucun résultat pour surveillance ${surveillanceId}`)
      return null
    }

    const items = records.map(r => ({
      resultat: r.dernier_resultat || 'NV',
      domaine: r.domaine,
    }))

    const domaines = computeDomaineConformite(items)
    console.log(`[ChecklistFeedback] ${surveillanceId}: ${records.length} items, ${domaines.length} domaines`)

    let decisionsCrees = 0
    const effectivenessParDomaine: ChecklistFeedbackReport['effectivenessParDomaine'] = []

    for (const d of domaines) {
      const effectiveness = mapConformiteToEffectiveness(d.tauxConformite)
      effectivenessParDomaine.push({ domaine: d.domaine, taux: d.tauxConformite, effectiveness })

      const record = decisionTracker.enregistrerDecision(aerodromeId, 'type_suggestion', {
        suggestionType: 'resultat_checklist',
        suggestionConfiance: Math.round(d.tauxConformite),
        recommendation: {
          type: 'correctif',
          domaine: d.domaine,
          action: `Conformité ${d.domaine} : ${d.saCount}/${d.saCount + d.nsCount} SA (${d.tauxConformite}%)`,
          justification: d.nsCount > 0
            ? `${d.nsCount} non-conformité(s) sur ${d.saCount + d.nsCount} — taux ${d.tauxConformite}%`
            : `Tous conformes — taux ${d.tauxConformite}%`,
          urgence: d.tauxConformite < 50 ? 'immediate' : d.tauxConformite < 80 ? '3_mois' : 'prochaine_mission',
          confiance: Math.max(50, d.tauxConformite),
        },
      })

      decisionTracker.appliquer(record.id)
      decisionTracker.evaluer(record.id, effectiveness, `Évaluation automatique depuis résultats checklist ${surveillanceId}`)
      decisionsCrees++
    }

    // Recalibrer les poids C1-C5
    const outcomes: DecisionOutcome[] = domaines.map(d => ({
      decision_id: `checklist-${surveillanceId}-${d.domaine}`,
      aerodrome_id: aerodromeId,
      score_before: null,
      score_after_6m: null,
      delta: null,
      effectiveness: mapConformiteToEffectiveness(d.tauxConformite),
      evaluated_at: new Date().toISOString(),
      auto_evaluated: true,
    }))

    const dimensions = new Map<string, Record<string, number>>()
    dimensions.set(aerodromeId, { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 })

    let weightAdjustments = 0
    try {
      const adjustments = weightController.recalibrateFromOutcomes(outcomes, dimensions)
      weightAdjustments = adjustments.length
    } catch (err) {
      console.warn('[ChecklistFeedback] Erreur recalibrage poids:', err)
    }

    // Recalculer le profil risque
    try {
      const storeNow = useAppStore.getState()
      if (storeNow.recalculerProfilRisque) {
        storeNow.recalculerProfilRisque(aerodromeId)
      }
    } catch {
      // Silently fail
    }

    const report: ChecklistFeedbackReport = {
      surveillanceId,
      aerodromeId,
      domaines,
      effectivenessParDomaine,
      weightAdjustments,
      decisionsCrees,
      processedAt: new Date().toISOString(),
    }

    console.log(`[ChecklistFeedback] Rapport : ${JSON.stringify({
      aerodromeId,
      domaines: domaines.length,
      decisionsCrees,
      weightAdjustments,
    })}`)

    return report
  }
}

export const checklistFeedbackEngine = new ChecklistFeedbackEngine()
