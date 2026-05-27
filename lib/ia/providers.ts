// lib/ia/providers.ts
// Multi-provider LLM client avec fallback multi-clés (env → Supabase)
// Utilisé par toutes les routes API IA

export interface LLMRequest {
  model?: string
  messages: Array<{ role: string; content: string }>
  temperature?: number
  max_tokens?: number
  top_p?: number
  response_format?: { type: 'json_object' }
}

export interface LLMResponse {
  content: string
  model: string
  provider: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const GROQ_PRIMARY = 'llama-3.3-70b-versatile'
const GROQ_FALLBACK_MODEL = 'llama-3.1-8b-instant'
const OPENROUTER_PRIMARY = 'qwen/qwen-2.5-72b-instruct'
const OPENROUTER_FALLBACK = 'deepseek/deepseek-chat'

interface KeyEntry {
  key_value: string
  fallback_order: number
  is_active: boolean
}

async function callGroq(apiKey: string, model: string, body: LLMRequest): Promise<Response> {
  return fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, model }),
  })
}

async function callOpenRouter(apiKey: string, model: string, body: LLMRequest): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://sgda.anacim.sn', 'X-Title': 'SGDA ANACIM' },
    body: JSON.stringify({ ...body, model }),
  })
}

// Charge les clés depuis Supabase (service role) avec fallback .env
async function getServiceKeys(service: string): Promise<KeyEntry[]> {
  const keys: KeyEntry[] = []
  // Fallback .env
  const envMap: Record<string, string | undefined> = {
    groq: process.env.GROQ_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    resend: process.env.RESEND_API_KEY,
    twilio_account_sid: process.env.TWILIO_ACCOUNT_SID,
    twilio_auth_token: process.env.TWILIO_AUTH_TOKEN,
    twilio_auth_sid: process.env.TWILIO_AUTH_SID,
  }
  if (envMap[service]) keys.push({ key_value: envMap[service]!, fallback_order: 0, is_active: true })
  // Clés depuis Supabase
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceKey) {
      const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      const { data } = await sb.from('api_keys').select('key_value, fallback_order, is_active').eq('service', service).eq('is_active', true).order('fallback_order')
      if (data) keys.push(...data.map(k => ({ key_value: k.key_value, fallback_order: keys.length + k.fallback_order, is_active: k.is_active })))
    }
  } catch {}
  return keys
}

export async function callWithFallback(request: LLMRequest): Promise<LLMResult> {
  const errors: string[] = []
  const groqKeys = await getServiceKeys('groq')
  const openrouterKeys = await getServiceKeys('openrouter')
  const allProviders: { name: string; key: string; call: typeof callGroq; model: string }[] = []

  for (const k of groqKeys) {
    if (!k.is_active) continue
    allProviders.push({ name: `groq_${k.fallback_order}`, key: k.key_value, call: callGroq, model: GROQ_PRIMARY })
    allProviders.push({ name: `groq_fallback_${k.fallback_order}`, key: k.key_value, call: callGroq, model: GROQ_FALLBACK_MODEL })
  }
  for (const k of openrouterKeys) {
    if (!k.is_active) continue
    allProviders.push({ name: `openrouter_${k.fallback_order}`, key: k.key_value, call: callOpenRouter, model: OPENROUTER_PRIMARY })
    allProviders.push({ name: `openrouter_fallback_${k.fallback_order}`, key: k.key_value, call: callOpenRouter, model: OPENROUTER_FALLBACK })
  }

  if (allProviders.length === 0) {
    throw new Error('Aucune clé API configurée pour Groq ou OpenRouter')
  }

  for (const provider of allProviders) {
    try {
      const res = await provider.call(provider.key, provider.model, request)
      if (res.status === 429) { errors.push(`${provider.name}: quota dépassé (429)`); continue }
      if (!res.ok) { const t = await res.text(); errors.push(`${provider.name}: ${res.status} ${t.slice(0, 200)}`); continue }
      const data = await res.json()
      return { content: data.choices?.[0]?.message?.content ?? '', provider: provider.name as any, model: data.model || provider.model, usage: data.usage }
    } catch (err: any) { errors.push(`${provider.name}: ${err.message}`) }
  }
  throw new Error(`Tous les providers LLM ont échoué:\n${errors.join('\n')}`)
}

export type ProviderName = string

export interface LLMResult {
  content: string
  provider: ProviderName
  model: string
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export function isLLMConfigured(): boolean {
  return !!process.env.GROQ_API_KEY || !!process.env.OPENROUTER_API_KEY
}

export function getAvailableProviders(): string[] {
  const list: string[] = []
  if (process.env.GROQ_API_KEY) list.push(`groq (env)`)
  if (process.env.OPENROUTER_API_KEY) list.push(`openrouter (env)`)
  return list
}
