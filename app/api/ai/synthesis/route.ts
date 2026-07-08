// app/api/ai/synthesis/route.ts
// Genere l'interpretation, la recommandation et les elements clefs pour la SyntheseTab
// via Groq LLM à partir des donnees brutes du profil
// Recoit : { profil: ProfilRisque }
// Retourne : { interpretation, recommandation, elementsClefs }

import { NextRequest, NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'

const SYSTEM_PROMPT = `Tu es un expert en securite aeroportuaire pour l'ANACIM. À partir des données de profil de risque d'un aérodrome, tu génères une synthèse concise pour l'inspecteur.

Analyse les donnees fournies et produit:
1. INTERPRETATION : une phrase courte (15-25 mots) decrivant le niveau global et la tendance. Utilise "satisfaisant", "modere", "degrade" ou "critique" selon les donnees. Ex: "Niveau degrade en legere degradation — 8 modeles concordent."
2. RECOMMANDATION : 1-2 phrases operationnelles disant à l'inspecteur quoi faire (mission inopinee, surveillance programmee, etc.)
3. ELEMENTS_CLEFS : 2-4 points clefs qui justifient le diagnostic, tires des donnees (pas de generalites)

Regles:
- Utilise les VRAIS scores et indicateurs fournis dans les donnees pour justifier
- Ne repete pas des generalites — cite des valeurs concretes
- Ne genere pas de contenu si les donnees sont absentes
- Ecris en francais technique, operationnel
- Pas de jargon LLM, pas d'emojis

Reponds UNIQUEMENT un objet JSON avec la structure:
{
  "interpretation": "une phrase concise",
  "recommandation": "recommandation operationnelle",
  "elementsClefs": ["point 1", "point 2", "point 3"]
}`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const profil = body.profil

    if (!profil) {
      return NextResponse.json({ interpretation: '', recommandation: '', elementsClefs: [], error: 'Missing profil data' }, { status: 400 })
    }

    const signalData = {
      score_global: profil.score_global,
      c1: profil.c1, c2: profil.c2, c3: profil.c3, c4: profil.c4, c5: profil.c5,
      tendance: profil.tendance,
      prediction_3m: profil.prediction_3m,
      prediction_6m: profil.prediction_6m,
      ensemble_confidence: profil.ensemble_confidence,
      nb_modeles_disponibles: [
        profil.hmm_state ? 'HMM' : null,
        profil.survival_metrics ? 'Survie' : null,
        profil.extreme_risk ? 'EVT' : null,
        profil.negbin_metrics ? 'NegBin' : null,
        profil.copula_metrics ? 'Copule' : null,
        profil.bayesian_posterior !== undefined ? 'Bayesien' : null,
        profil.hawkes_intensity !== undefined ? 'Hawkes' : null,
        profil.system_stress ? 'StressSysteme' : null,
        profil.velocity_metrics ? 'Velocite' : null,
        profil.proactive_alert ? 'AlerteProactive' : null,
      ].filter(Boolean),
      hmm: profil.hmm_state ? {
        transition: profil.hmm_state.isTransitioning,
        risqueTransition: profil.hmm_state.transitionRisk,
      } : null,
      survie: profil.survival_metrics ? {
        hazard90j: profil.survival_metrics.hazard90d,
        medianeJours: profil.survival_metrics.medianDays,
      } : null,
      extreme: profil.extreme_risk ? {
        tailRisk: profil.extreme_risk.tailRisk,
        queueLourde: profil.extreme_risk.isHeavyTailed,
      } : null,
      predictions_incidents: {
        '3m': profil.incident_prediction_3m,
        '6m': profil.incident_prediction_6m,
      },
    }

    const userPrompt = `Analyse ces donnees de profil de risque et genere la synthese :

${JSON.stringify(signalData, null, 2)}

Genere interpretation, recommandation et elementsClefs.`

    const { content: raw } = await callWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    })

    const parsed = JSON.parse(raw)
    const interpretation = parsed.interpretation || 'Analyse non disponible'
    const recommandation = parsed.recommandation || 'Poursuivre la surveillance programmee'
    const elementsClefs = Array.isArray(parsed.elementsClefs) ? parsed.elementsClefs.slice(0, 4) : []

    return NextResponse.json({ interpretation, recommandation, elementsClefs })
  } catch (err) {
    console.error('AI synthesis error:', err)
    return NextResponse.json({
      interpretation: 'Synthèse IA indisponible',
      recommandation: 'Consulter les indicateurs directement pour evaluer le niveau de risque.',
      elementsClefs: ['Service IA momentanement indisponible'],
    }, { status: 500 })
  }
}
