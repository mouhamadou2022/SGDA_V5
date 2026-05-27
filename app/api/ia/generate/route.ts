// app/api/ia/generate/route.ts
// Endpoint de génération de contenu (rapports, documents, etc.)
// Multi-provider : Groq → OpenRouter → lightweight fallback

import { NextResponse } from 'next/server'
import { callWithFallback, isLLMConfigured } from '@/lib/ia/providers'

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json()

    if (!isLLMConfigured()) {
      return NextResponse.json(
        { error: 'Aucune clé API configurée', code: 'NO_API_KEY' },
        { status: 503 }
      )
    }

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

    return NextResponse.json({
      content: result.content,
      model: result.model,
      provider: result.provider,
    })
  } catch (error) {
    console.error('[/api/ia/generate]', error)
    return NextResponse.json(
      { error: (error as Error).message, code: 'ALL_PROVIDERS_FAILED' },
      { status: 503 }
    )
  }
}
