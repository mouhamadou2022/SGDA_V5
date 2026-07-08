// app/api/ai/recommendations/route.ts
// API route qui enrichit les recommandations via Groq LLM
// Recoit : { profil, recommandations } — retourne : { enriched: [{ constat, verification }] }

import { NextRequest, NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'

const SYSTEM_PROMPT = `Tu es un expert en securite aeroportuaire travaillant pour l'ANACIM (Agence Nationale de l'Aviation Civile et de la Meteorologie du Senegal). Tu aides les inspecteurs de securite a comprendre les signaux de risque et a planifier leurs actions de verification.

Pour chaque point de vigilance, tu dois produire deux textes en francais:
1. CONSTAT : explique ce que les modeles de risque disent, en langage naturel et concret. 2-3 phrases max.
2. VERIFICATION : dis a l'inspecteur CE QU'IL DOIT VERIFIER chez l'exploitant. Pas ce qu'il doit faire lui-meme, mais ce qu'il doit exiger, controler, inspecter. 3-4 phrases max.

Regles:
- Reste factuel et operationnel. Pas de jargon LLM.
- L'inspecteur a besoin d'actions concretes, pas de generalites.
- Si plusieurs signaux sont lies, fais le lien entre eux dans le constat.
- La verification doit pouvoir etre transformee en points de check-list.
- N'invente pas d'informations qui ne sont pas dans les donnees fournies.`

interface RecommendationInput {
  titre: string
  priorite: string
  echeance: string
  impactAttendu: string
  donnees: Record<string, unknown>
}

interface EnrichedOutput {
  constat: string
  verification: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const recommandations: RecommendationInput[] = body.recommandations

    if (!recommandations || !Array.isArray(recommandations) || recommandations.length === 0) {
      return NextResponse.json({ enriched: [] })
    }

    const enriched: EnrichedOutput[] = []

    for (const rec of recommandations) {
      const userPrompt = `Genere le constat et la verification pour ce point de vigilance:

Titre: ${rec.titre}
Priorite: ${rec.priorite}
Echeance: ${rec.echeance}
Impact attendu: ${rec.impactAttendu}
Donnees du modele: ${JSON.stringify(rec.donnees, null, 2)}

Reponds uniquement au format:
CONSTAT: ...
VERIFICATION: ...`

      let constat = ''
      let verification = ''
      try {
        const { content: raw } = await callWithFallback({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.5,
          max_tokens: 400,
        })

        const constatMatch = raw.match(/CONSTAT:\s*(.+?)(?:\n|$)/i)
        const verifMatch = raw.match(/VERIFICATION:\s*(.+?)(?:\n|$)/i)
        constat = constatMatch?.[1]?.trim() ?? ''
        verification = verifMatch?.[1]?.trim() ?? ''
      } catch {
        // Silence — fallback handled by caller
      }

      enriched.push({ constat, verification })
    }

    return NextResponse.json({ enriched })
  } catch (err) {
    console.error('AI recommendations error:', err)
    return NextResponse.json({ enriched: [], error: 'Failed to enrich' }, { status: 500 })
  }
}
