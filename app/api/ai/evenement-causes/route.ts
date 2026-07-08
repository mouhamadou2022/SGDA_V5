// app/api/ai/evenement-causes/route.ts
// Suggere causes et facteurs contributifs via Groq
// Recoit : { description, analyse_preliminaire, type, gravite }
// Retourne : { causes: string[], facteurs_contributifs: { humain, technique, environnemental, organisationnel } }

import { NextRequest, NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'
import { safeParseJSON } from '@/lib/safeParseJSON'

const SYSTEM_PROMPT = `Tu es un expert en analyse causale d'evenements de securite aeroportuaire pour l'ANACIM.

À partir de la description d'un evenement et de son analyse preliminaire, tu identifies :
1. Les causes profondes (2-6 causes)
2. Les facteurs contributifs (humain, technique, environnemental, organisationnel)

Regles :
- Les causes doivent être specifiques, pas generiques
- Distingue cause immediate et cause profonde
- Base-toi UNIQUEMENT sur les informations fournies
- Si pas assez d'info pour une cause, ne l'invente pas
- Facteurs contributifs : ne coche que ceux reellement presents

Reponds UNIQUEMENT un objet JSON avec la structure :
{
  "causes": ["Cause 1", "Cause 2", ...],
  "facteurs_contributifs": {
    "humain": true/false,
    "technique": true/false,
    "environnemental": true/false,
    "organisationnel": true/false
  }
}`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { description, analyse_preliminaire, type, gravite } = body

    if (!description || description.trim().length < 10) {
      return NextResponse.json({ causes: [], facteurs_contributifs: null, error: 'Description trop courte' }, { status: 400 })
    }

    const userPrompt = `Analyse cet evenement et suggere les causes et facteurs contributifs :\n\nType : ${type || 'Non specifie'}\nGravite : ${gravite || 'Non specifiee'}\nDescription : ${description}\nAnalyse preliminaire : ${analyse_preliminaire || 'Non disponible'}`

    const { content: raw } = await callWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    })

    const parsed = safeParseJSON<{ causes?: string[]; facteurs_contributifs?: any }>(raw) || { causes: [], facteurs_contributifs: null }
    const causes: string[] = Array.isArray(parsed?.causes) ? parsed.causes : []
    const facteurs = parsed?.facteurs_contributifs || null

    return NextResponse.json({
      causes,
      facteurs_contributifs: facteurs,
      meta: { source: 'groq_llm', modele: 'llama-3.3-70b', timestamp: new Date().toISOString() },
    })
  } catch (err) {
    console.error('AI evenement-causes error:', err)
    return NextResponse.json({ causes: [], facteurs_contributifs: null, error: 'AI generation failed' }, { status: 200 })
  }
}
