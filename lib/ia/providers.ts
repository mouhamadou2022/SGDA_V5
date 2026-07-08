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
const GOOGLE_AI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions'
const HF_URL = 'https://api-inference.huggingface.co/v1/chat/completions'
const OLLAMA_URL = 'http://localhost:11434/v1/chat/completions'

const GROQ_PRIMARY = 'llama-3.3-70b-versatile'
const GROQ_FALLBACK_MODEL = 'llama-3.1-8b-instant'
const OPENROUTER_PRIMARY = 'qwen/qwen-2.5-72b-instruct'
const OPENROUTER_FALLBACK = 'deepseek/deepseek-chat'
const GOOGLE_PRIMARY = 'gemini-2.5-flash'
const GOOGLE_FALLBACK = 'gemini-2.0-flash'
const DEEPSEEK_PRIMARY = 'deepseek-chat'
const DEEPSEEK_FALLBACK = 'deepseek-chat'
const MISTRAL_PRIMARY = 'mistral-large-latest'
const MISTRAL_FALLBACK = 'mistral-small-latest'
const HF_PRIMARY = 'mistralai/Mistral-7B-Instruct-v0.3'
const HF_FALLBACK = 'HuggingFaceH4/zephyr-7b-beta'
const OLLAMA_PRIMARY = 'mistral'
const OLLAMA_FALLBACK = 'llama3.2'

interface KeyEntry {
  key_value: string
  fallback_order: number
  is_active: boolean
}

type ProviderCall = (apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal) => Promise<Response>

const apiFetch = (url: string, apiKey: string | null, body: LLMRequest, model: string, signal?: AbortSignal): Promise<Response> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return fetch(url, { method: 'POST', headers, body: JSON.stringify({ ...body, model }), signal })
}

async function callGroq(apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  return apiFetch(GROQ_URL, apiKey, body, model, signal)
}

async function callOpenRouter(apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://sgda.anacim.sn', 'X-Title': 'SGDA ANACIM' },
    body: JSON.stringify({ ...body, model }),
    signal,
  })
}

async function callGoogle(apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  return apiFetch(GOOGLE_AI_URL, apiKey, body, model, signal)
}

async function callDeepSeek(apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  return apiFetch(DEEPSEEK_URL, apiKey, body, model, signal)
}

async function callMistral(apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  return apiFetch(MISTRAL_URL, apiKey, body, model, signal)
}

async function callHuggingFace(apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  return apiFetch(HF_URL, apiKey, body, model, signal)
}

async function callCloudflare(apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID non configuré')
  return apiFetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`, apiKey, body, model, signal)
}

async function callOllama(_apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  return apiFetch(OLLAMA_URL, null, body, model, signal)
}

// Charge les clés depuis Supabase (service role) avec fallback .env
async function getServiceKeys(service: string): Promise<KeyEntry[]> {
  const keys: KeyEntry[] = []
  // Fallback .env
  const envMap: Record<string, string | undefined> = {
    groq: process.env.GROQ_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    google_ai: process.env.GOOGLE_AI_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    cloudflare: process.env.CLOUDFLARE_AI_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    huggingface: process.env.HF_API_KEY,
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
  } catch { console.warn('[providers] getServiceKeys: Supabase query failed') }
  return keys
}

// --- Context-aware routing helpers ---
function estimateInputTokens(messages: Array<{ role: string; content: string }>): number {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0) + m.role.length, 0)
  return Math.ceil(totalChars / 4)
}

function getProviderMaxInput(providerName: string): number {
  if (providerName.startsWith('groq_fallback')) return 7000
  if (providerName.startsWith('groq')) return 60000
  if (providerName.startsWith('cloudflare')) return 20000
  if (providerName.startsWith('mistral')) return 30000
  if (providerName.startsWith('huggingface_fallback')) return 16000
  if (providerName.startsWith('huggingface')) return 30000
  if (providerName.startsWith('ollama')) return 100000
  return 60000
}

export async function callWithFallback(request: LLMRequest): Promise<LLMResult> {
  const errors: string[] = []
  const groqKeys = await getServiceKeys('groq')
  const openrouterKeys = await getServiceKeys('openrouter')
  const allProviders: { name: string; key: string; call: ProviderCall; model: string }[] = []

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
  const googleKeys = await getServiceKeys('google_ai')
  for (const k of googleKeys) {
    if (!k.is_active) continue
    allProviders.push({ name: `google_ai_${k.fallback_order}`, key: k.key_value, call: callGoogle, model: GOOGLE_PRIMARY })
    allProviders.push({ name: `google_ai_fallback_${k.fallback_order}`, key: k.key_value, call: callGoogle, model: GOOGLE_FALLBACK })
  }
  const deepseekKeys = await getServiceKeys('deepseek')
  for (const k of deepseekKeys) {
    if (!k.is_active) continue
    allProviders.push({ name: `deepseek_${k.fallback_order}`, key: k.key_value, call: callDeepSeek, model: DEEPSEEK_PRIMARY })
    allProviders.push({ name: `deepseek_fallback_${k.fallback_order}`, key: k.key_value, call: callDeepSeek, model: DEEPSEEK_FALLBACK })
  }
  const mistralKeys = await getServiceKeys('mistral')
  for (const k of mistralKeys) {
    if (!k.is_active) continue
    allProviders.push({ name: `mistral_${k.fallback_order}`, key: k.key_value, call: callMistral, model: MISTRAL_PRIMARY })
    allProviders.push({ name: `mistral_fallback_${k.fallback_order}`, key: k.key_value, call: callMistral, model: MISTRAL_FALLBACK })
  }
  const hfKeys = await getServiceKeys('huggingface')
  for (const k of hfKeys) {
    if (!k.is_active) continue
    allProviders.push({ name: `huggingface_${k.fallback_order}`, key: k.key_value, call: callHuggingFace, model: HF_PRIMARY })
    allProviders.push({ name: `huggingface_fallback_${k.fallback_order}`, key: k.key_value, call: callHuggingFace, model: HF_FALLBACK })
  }
  const cloudflareKeys = await getServiceKeys('cloudflare')
  for (const k of cloudflareKeys) {
    if (!k.is_active) continue
    allProviders.push({ name: `cloudflare_${k.fallback_order}`, key: k.key_value, call: callCloudflare, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' })
  }

  // Ollama (local) en priorité — pas de clé API, zéro dépendance réseau
  // Vérification rapide si Ollama est joignable
  const ollamaReachable = await isOllamaReachable()
  if (ollamaReachable) {
    allProviders.unshift({ name: 'ollama', key: '', call: callOllama, model: OLLAMA_PRIMARY })
    allProviders.unshift({ name: 'ollama_fallback', key: '', call: callOllama, model: OLLAMA_FALLBACK })
  } else {
    allProviders.push({ name: 'ollama', key: '', call: callOllama, model: OLLAMA_PRIMARY })
    allProviders.push({ name: 'ollama_fallback', key: '', call: callOllama, model: OLLAMA_FALLBACK })
  }

  // Context-aware routing : sauter les providers dont la fenêtre de contexte est trop petite
  const inputTokens = estimateInputTokens(request.messages)
  const filtered = allProviders.filter(p => {
    const maxInput = getProviderMaxInput(p.name)
    if (inputTokens > maxInput) {
      errors.push(`${p.name}: trop long (${inputTokens} > ${maxInput} tokens)`)
      return false
    }
    return true
  })

  if (filtered.length === 0) {
    throw new Error(`Aucun provider ne peut traiter cette requête (${inputTokens} tokens estimés, max disponoble: ${Math.max(...allProviders.map(p => getProviderMaxInput(p.name)))}). Essaie de réduire le contenu ou active Ollama.`)
  }

  console.log(`[providers] Context-aware routing: ${inputTokens} tokens estimés, ${filtered.length}/${allProviders.length} providers disponibles`)
  for (const p of allProviders.filter(p => !filtered.includes(p))) {
    if (!p.name.startsWith('ollama')) console.warn(`[providers] Sauté: ${p.name} (contexte insuffisant)`)
  }

  for (const provider of filtered) {
    try {
      const controller = new AbortController()
      const isLocal = provider.name.startsWith('ollama')
      const providerTimeout = setTimeout(() => controller.abort(), isLocal ? 30000 : 60000)
      const res = await provider.call(provider.key, provider.model, request, controller.signal)
      clearTimeout(providerTimeout)
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
  return !!process.env.GROQ_API_KEY || !!process.env.OPENROUTER_API_KEY || !!process.env.GOOGLE_AI_API_KEY || !!process.env.DEEPSEEK_API_KEY || !!process.env.MISTRAL_API_KEY || !!process.env.HF_API_KEY || !!process.env.CLOUDFLARE_AI_KEY
}

export function isOllamaReachable(): Promise<boolean> {
  return fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) }).then(r => r.ok).catch(() => false)
}

export function getAvailableProviders(): string[] {
  const list: string[] = []
  if (process.env.GROQ_API_KEY) list.push(`groq (env)`)
  if (process.env.OPENROUTER_API_KEY) list.push(`openrouter (env)`)
  if (process.env.GOOGLE_AI_API_KEY) list.push(`google_ai (env)`)
  if (process.env.DEEPSEEK_API_KEY) list.push(`deepseek (env)`)
  if (process.env.MISTRAL_API_KEY) list.push(`mistral (env)`)
  if (process.env.HF_API_KEY) list.push(`huggingface (env)`)
  if (process.env.CLOUDFLARE_AI_KEY) {
    if (process.env.CLOUDFLARE_ACCOUNT_ID) list.push(`cloudflare (env)`)
    else list.push(`cloudflare (env — manque CLOUDFLARE_ACCOUNT_ID)`)
  }
  list.push(`ollama (local — dernier recours)`)
  return list
}
