// app/api/ia/analyze/route.ts
// Endpoint générique LLM — utilisé par tous les agents SGDA
// Accepte n'importe quel systemPrompt pour couvrir tous les modules
// Multi-provider : Groq → OpenRouter → lightweight fallback

import { NextResponse } from 'next/server'
import { callWithFallback, isLLMConfigured } from '@/lib/ia/providers'

export interface AnalyzeRequest {
  systemPrompt: string
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  temperature?: number
  maxTokens?: number
  responseFormat?: 'text' | 'json_object'
}

export async function POST(request: Request) {
  try {
    const body: AnalyzeRequest = await request.json()

    if (!isLLMConfigured()) {
      return NextResponse.json(
        { error: 'Aucune clé API configurée. Ajoutez GROQ_API_KEY ou OPENROUTER_API_KEY dans .env.local', code: 'NO_API_KEY' },
        { status: 503 }
      )
    }

    const messages = [
      { role: 'system', content: body.systemPrompt },
      ...body.messages,
    ]

    const llmRequest = {
      messages,
      temperature: body.temperature ?? 0.3,
      max_tokens: body.maxTokens ?? 2048,
      top_p: 0.9,
      ...(body.responseFormat === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
    }

    const result = await callWithFallback(llmRequest)

    return NextResponse.json({
      content: result.content,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
    })
  } catch (error) {
    console.error('[/api/ia/analyze]', error)
    return NextResponse.json(
      { error: (error as Error).message, code: 'ALL_PROVIDERS_FAILED' },
      { status: 503 }
    )
  }
}
