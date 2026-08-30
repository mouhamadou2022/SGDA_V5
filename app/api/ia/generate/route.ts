// app/api/ia/generate/route.ts
// Endpoint de génération de contenu (rapports, documents, etc.)
// Multi-provider : Groq → OpenRouter → Google → … → Ollama (local, dernier recours)

import { NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'

// Borne explicite la durée de la route plutôt que de dépendre du seul timeout
// de la plateforme d'hébergement. Doit rester STRICTEMENT SUPÉRIEUR au pire
// cas de la chaîne de fallback (CLOUD_BUDGET_MS + LOCAL_BUDGET_MS = 50s dans
// lib/ia/providers.ts), afin que la chaîne s'arrête proprement sur son budget
// interne avant que la plateforme ne coupe.
export const maxDuration = 60

function erreurDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function POST(request: Request) {
  let prompt: unknown
  try {
    const body = await request.json()
    prompt = body?.prompt
  } catch (parseError) {
    console.error('[/api/ia/generate] corps de requête invalide:', parseError)
    return NextResponse.json(
      { error: 'Corps de requête JSON invalide.', code: 'INVALID_REQUEST_BODY' },
      { status: 400 }
    )
  }

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    return NextResponse.json(
      { error: 'Le champ "prompt" est requis et doit être une chaîne non vide.', code: 'MISSING_PROMPT' },
      { status: 400 }
    )
  }

  try {
    const messages = [
      {
        role: 'system',
        content: `Tu es un expert en sécurité aéronautique à l'ANACIM Sénégal. Rédige en français un contenu professionnel, concis et technique au format HTML. Utilise des paragraphes, listes à puces, et mises en forme adaptées.`,
      },
      { role: 'user', content: prompt },
    ]

    const result = await callWithFallback({
      messages,
      temperature: 0.3,
      max_tokens: 4096,
      top_p: 0.9,
    })

    // callWithFallback retente automatiquement le provider suivant quand un
    // provider répond 200 avec un contenu vide ; ce garde est une sécurité
    // défensive de dernier recours (cas extrême où tous renverraient du vide).
    if (!result?.content || result.content.trim().length === 0) {
      console.error('[/api/ia/generate] contenu vide renvoyé par le provider:', result?.provider, result?.model)
      return NextResponse.json(
        { error: 'Le fournisseur a renvoyé un contenu vide.', code: 'EMPTY_CONTENT' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      content: result.content,
      model: result.model,
      provider: result.provider,
    })
  } catch (error) {
    // Détail complet dans les logs serveur uniquement — le client ne reçoit
    // qu'un message générique, pour ne pas exposer de détails internes de
    // providers (endpoints, structure de config, etc.).
    console.error('[/api/ia/generate]', erreurDetail(error))
    return NextResponse.json(
      { error: 'Tous les fournisseurs IA ont échoué. Réessayez dans quelques instants.', code: 'ALL_PROVIDERS_FAILED' },
      { status: 503 }
    )
  }
}
