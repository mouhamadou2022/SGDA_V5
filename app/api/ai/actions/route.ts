// app/api/ai/actions/route.ts
// Genere le plan d'action inspecteur via Groq LLM à partir des données brutes du profil
// Recoit : { profil: ProfilRisque (champs sélectionnés) }
// Retourne : { actions: ActionConcrete[] }

import { NextRequest, NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'

interface ActionOutput {
  titre: string
  constat: string
  verification: string
  priorite: 'immediate' | 'haute' | 'moyenne' | 'basse'
  echeance: string
  impactAttendu: string
}

const SYSTEM_PROMPT = `Tu es un expert en securite aeroportuaire pour l'ANACIM. À partir des données de profil de risque d'un aérodrome, tu génères un plan d'action concret pour l'inspecteur.

Analyse les données fournies et genere 2 à 8 actions de verification. Chaque action doit être :
1. Utile — basée sur les vrais signaux dans les données
2. Concrete — vérification que l'inspecteur peut exécuter chez l'exploitant
3. Priorisee — selon la gravite réelle des indicateurs
4. Contextuelle — ne répète pas des généralités

Regles :
- Ne génère JAMAIS d'action pour un critère dont le score est ≥ 70 (pas de faux positif)
- Utilise les vrais scores C1-C5, les vrais signaux HMM/survival/EVT pour décider
- Si tous les indicateurs sont bons (< 2 signaux faibles), génère 1 action "surveillance de routine" ou moins
- Si plusieurs signaux sont liés (ex: C1 faible + HMM transition), combine-les en une action
- La priorite "immediate" est reservee aux cas graves (score < 30 ou HMM transition risque > 60 ou hazard > 0.6)
- N'invente PAS de donnees qui ne sont pas fournies
- Écris en français technique mais operationnel, 2-3 phrases max par champ
- Pour "verification", dis à l'inspecteur CE QU'IL DOIT VERIFIER chez l'exploitant (documents, registres, equipements, processus)
- "echeance" doit être realiste : "48 heures", "7 jours", "30 jours", "60 jours", "prochaine mission programmee"
- "impactAttendu" doit être mesurable et lie aux donnees

Reponds UNIQUEMENT un objet JSON avec la structure :
{
  "actions": [
    {
      "titre": "...",
      "constat": "...",
      "verification": "...",
      "priorite": "immediate|haute|moyenne|basse",
      "echeance": "...",
      "impactAttendu": "..."
    }
  ]
}`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const profil = body.profil

    if (!profil) {
      return NextResponse.json({ actions: [], error: 'Missing profil data' }, { status: 400 })
    }

    // Extraire les signaux pertinents pour le LLM
    const signaux = {
      score_global: profil.score_global,
      c1: profil.c1, c2: profil.c2, c3: profil.c3, c4: profil.c4, c5: profil.c5,
      tendance: profil.tendance,
      prediction_3m: profil.prediction_3m,
      prediction_6m: profil.prediction_6m,
      prediction_12m: profil.prediction_12m,
      ensemble_confidence: profil.ensemble_confidence,
      hmm: profil.hmm_state ? {
        etat: profil.hmm_state.currentStateName,
        transition: profil.hmm_state.isTransitioning,
        risqueTransition: profil.hmm_state.transitionRisk,
        joursAvantCritique: profil.hmm_state.daysToCritical,
      } : null,
      survie: profil.survival_metrics ? {
        hazard90j: profil.survival_metrics.hazard90d,
        hazard180j: profil.survival_metrics.hazard180d,
        medianeJours: profil.survival_metrics.medianDays,
      } : null,
      extreme: profil.extreme_risk ? {
        tailRisk: profil.extreme_risk.tailRisk,
        queueLourde: profil.extreme_risk.isHeavyTailed,
        maxAttendu12m: profil.extreme_risk.maxExpected12m,
      } : null,
      negbin: profil.negbin_metrics ? {
        dispersion: profil.negbin_metrics.dispersion,
        surdispersion: profil.negbin_metrics.isOverdispersed,
      } : null,
      copules: profil.copula_metrics ? {
        dependanceQueue: profil.copula_metrics.maxTailDependence,
      } : null,
      accelerationTendance: profil.event_trend_acceleration,
      predictionsIncidents: {
        '3m': profil.incident_prediction_3m,
        '6m': profil.incident_prediction_6m,
        '12m': profil.incident_prediction_12m,
      },
    }

    const userPrompt = `Analyse ces donnees de profil de risque et genere le plan d'action inspecteur :

${JSON.stringify(signaux, null, 2)}

Genere les actions de verification concretes pour cet aerodrome. Rappelle-toi : pas d'action si score ≥ 70.`

    const { content: raw } = await callWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    })

    const parsed = JSON.parse(raw)
    const actions: ActionOutput[] = Array.isArray(parsed?.actions) ? parsed.actions : []

    // Associer les donnees pour tracabilite
    const enriched = actions.map(a => ({
      ...a,
      donnees: { source: 'groq_llm', modele: 'llama-3.3-70b', timestamp: new Date().toISOString() },
    }))

    return NextResponse.json({ actions: enriched })
  } catch (err) {
    console.error('AI actions error:', err)
    return NextResponse.json({ actions: [], error: 'AI generation failed' }, { status: 500 })
  }
}
