// app/api/ai/evenement-predictions/route.ts
// Analyse les donnees brutes d'evenements et genere des predictions contextualisees via Groq
// Recoit : { evenements: [...], aerodrome_id, scoreC5 }
// Retourne : { predictions: PredictionMois[], meta }

import { NextRequest, NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'
import { safeParseJSON } from '@/lib/safeParseJSON'

interface EvenementBrut {
  date: string
  gravite: string
  type: string
}

const SYSTEM_PROMPT = `Tu es un expert en analyse de securite aeroportuaire pour l'ANACIM. À partir des donnees brutes d'evenements de securite sur un aerodrome, tu generes des predictions contextualisees pour les 3 prochains mois.

Analyse :
1. La répartition des événements par mois (saisonnalite)
2. Les types d'evenements dominants
3. Les tendances (hausse, baisse, stable)
4. Les risques specifiques lies au calendrier saisonnier senegalais

Pour chaque mois (3 mois consecutifs à partir du mois prochain), fournis :
- "mois" : nom complet du mois en français (ex: "Janvier")
- "critiques" : nombre estimé d'evenements critiques (arrondi)
- "tendance" : une phrase courte decrivant la tendance (ex: "→ Stable", "⬆ Legere hausse attendue", etc.)
- "risquesContextuels" : 1-3 risques specifiques bases sur les donnees + saison
- "saisons" : 1-2 observations saisonnieres pertinentes

Regles :
- Base-toi UNIQUEMENT sur les donnees fournies + connaissance saisonnière du Senegal
- Si donnees insuffisantes (< 5 evenements), indique-le dans la tendance
- Sois prudent : ne fais pas de predictions trop agressives
- Ne mentionne JAMAIS le score C5 ni les métriques internes
- Écris en français operationnel pour un inspecteur ANACIM
- Chaque prediction mois doit etre coherente avec les donnees

Reponds UNIQUEMENT un objet JSON avec la structure :
{
  "predictions": [
    {
      "mois": "...",
      "critiques": 0,
      "tendance": "...",
      "risquesContextuels": ["...", "..."],
      "saisons": ["...", "..."]
    }
  ],
  "noteGlobale": "phrase de synthese sur la tendance generale (1 phrase)"
}`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { evenements, aerodrome_code } = body
    const evts: EvenementBrut[] = Array.isArray(evenements) ? evenements : []

    if (evts.length === 0) {
      return NextResponse.json({
        predictions: [],
        noteGlobale: 'Données insuffisantes pour générer des prédictions.',
        meta: { source: 'fallback', timestamp: new Date().toISOString() },
      })
    }

    // Aggréger les données pour le LLM (ne pas envoyer 1000 événements bruts)
    const now = new Date()
    const parMois: Record<string, { total: number; critiques: number; types: Record<string, number> }> = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      parMois[key] = { total: 0, critiques: 0, types: {} }
    }
    evts.forEach(e => {
      const ed = new Date(e.date)
      const key = `${ed.getFullYear()}-${String(ed.getMonth()).padStart(2, '0')}`
      if (parMois[key]) {
        parMois[key].total++
        if (e.gravite === 'CRITIQUE') parMois[key].critiques++
        const t = e.type || 'autre'
        parMois[key].types[t] = (parMois[key].types[t] || 0) + 1
      }
    })

    const resumeMensuel = Object.entries(parMois).map(([mois, data]) => {
      const topTypes = Object.entries(data.types)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t, c]) => `${t}(${c})`)
        .join(', ')
      return `${mois}: ${data.total} evts (${data.critiques} critiques)${topTypes ? ' — ' + topTypes : ''}`
    })

    const totalCritiques = evts.filter(e => e.gravite === 'CRITIQUE').length
    const resumeStat = `Total: ${evts.length} evenements (${totalCritiques} critiques) sur ${aerodrome_code || 'aerodrome'}.
Moyenne mensuelle: ${(evts.length / 12).toFixed(1)} evts, ${(totalCritiques / 12).toFixed(1)} critiques.
Types observes: ${[...new Set(evts.map(e => e.type))].slice(0, 8).join(', ') || 'aucun'}`

    const userPrompt = `Analyse ces donnees d'evenements de securite pour l'aerodrome ${aerodrome_code || 'non specifie'} et genere les predictions pour les 3 prochains mois.\n\n${resumeStat}\n\nDetail par mois (12 derniers mois):\n${resumeMensuel.join('\n')}`

    const { content: raw } = await callWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    })

    const parsed = safeParseJSON<{ predictions?: any[]; noteGlobale?: string }>(raw) || { predictions: [], noteGlobale: '' }
    const predictions = Array.isArray(parsed?.predictions) ? parsed.predictions : []

    return NextResponse.json({
      predictions,
      noteGlobale: parsed?.noteGlobale || '',
      meta: { source: 'groq_llm', modele: 'llama-3.3-70b', timestamp: new Date().toISOString(), evenements_count: evts.length },
    })
  } catch (err) {
    console.error('AI evenement-predictions error:', err)
    return NextResponse.json({
      predictions: [],
      noteGlobale: 'Analyse des predictions temporairement indisponible.',
      meta: { source: 'error_fallback', timestamp: new Date().toISOString() },
    }, { status: 200 })
  }
}
