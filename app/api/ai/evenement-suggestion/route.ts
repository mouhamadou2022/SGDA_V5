// app/api/ai/evenement-suggestion/route.ts
// Suggere type, gravite, classification, actions_immediates, services_alertes via Groq
// Recoit : { description, localisation, aerodrome_id, aerodrome_code }
// Retourne : { suggestion: { type, gravite, classification, actions_immediates, services_alertes } }

import { NextRequest, NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'

const SYSTEM_PROMPT = `Tu es un expert en securite aeroportuaire pour l'ANACIM. À partir de la description brute d'un evenement de securite, tu aides l'inspecteur à qualifier rapidement l'evenement.

Analyse la description fournie et genere une suggestion structuree avec :
1. **type** : le type d'evenement le plus pertinent parmi la liste officielle ANACIM
2. **gravite** : la gravite preliminaire ('CRITIQUE', 'ORANGE', 'JAUNE', 'GRIS', 'BLEU')
3. **classification** : accident, incident, ou incident_grave
4. **actions_immediates** : 2-4 actions immediates concretes à mener
5. **services_alertes** : liste des services à alerter

Types disponibles :
- Incursion sur piste, Peril animalier, Contamination de la piste, FOD, Marchandises dangereuses
- Facteurs humains, Non mise en oeuvre des procedures, Infrastructures inadaptees
- Avitaillement en carburant, Souffle cause par un aeronef, Emission lasers
- Travaux sur aire de mouvement, Travaux de maintenance, Presence indesirable
- Placement et stationnement, Mise en route/roulage non conforme
- Defaillance interfaces sol-bord, Utilisation materiels de piste
- Evenement de surete, Autre

Regles de gravite :
- CRITIQUE : incursion piste, surete impact securite, travaux proximite piste
- ORANGE : perils, contamination, marchandises dangereuses, non mise en oeuvre procedures, avitaillement
- JAUNE : facteurs humains, FOD, travaux, infrastructures, souffle, stationnement
- BLEU : autre

Classification :
- accident : blesses graves/mortels ou dommages importants
- incident_grave : quasi-collision, incursion evitee de justesse
- incident : tout autre evenement

Gravite et classification sont PRELIMINAIRES — l'inspecteur confirme.

Reponds UNIQUEMENT un objet JSON avec la structure :
{
  "suggestion": {
    "type": "..." ,
    "gravite": "CRITIQUE|ORANGE|JAUNE|GRIS|BLEU",
    "classification": "accident|incident|incident_grave",
    "actions_immediates": "...",
    "services_alertes": ["Pompiers", "ANACIM", ...]
  }
}`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { description, localisation, aerodrome_code } = body

    if (!description || description.trim().length < 10) {
      return NextResponse.json({ suggestion: null, error: 'Description trop courte (min 10 car.)' }, { status: 400 })
    }

    const userPrompt = `Analyse cet evenement de securite et suggere les champs de qualification :\n\nDescription : ${description}\nLocalisation : ${localisation || 'Non specifiee'}\nAerodrome : ${aerodrome_code || 'Non specifie'}`

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
    const suggestion = parsed?.suggestion || null

    return NextResponse.json({
      suggestion,
      meta: { source: 'groq_llm', modele: 'llama-3.3-70b', timestamp: new Date().toISOString() },
    })
  } catch (err) {
    console.error('AI evenement-suggestion error:', err)
    return NextResponse.json({ suggestion: null, error: 'AI generation failed' }, { status: 500 })
  }
}
