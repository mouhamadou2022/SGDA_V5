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
const AERORISQ_URL = process.env.AERORISQ_API_URL // IA maison — serveur d'inférence propre

// Modèles Groq VALIDÉS sur le compte actuel (liste /models vérifiée) :
// les anciens « llama-3.3-70b-versatile » / « llama-3.1-8b-instant » renvoient 404.
// IMPORTANT : on choisit des modèles NON-« reasoning » par défaut (groq/compound-mini,
// groq/compound). Les modèles de raisonnement (openai/gpt-oss-*, qwen3@400 tokens)
// consomment tout le budget max_tokens en \u003cthink\u003e et renvoient un content VIDE
// (bug rencontré : response.content="" avec reasoning_tokens=398).
const GROQ_PRIMARY = 'groq/compound-mini'
const GROQ_FALLBACK_MODEL = 'groq/compound'
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
const AERORISQ_PRIMARY = process.env.AERORISQ_MODEL || 'mistral' // modèle de l'IA maison AERORISQ (Ollama par défaut)

// ── Désactivation explicite des providers ─────────────────────────────
// Un provider (service cloud) n'est essayé QUE s'il est explicitement activé
// via IA_ENABLE_<SERVICE>=true dans l'environnement. Sans drapeau, il ne sera
// JAMAIS appelé → zéro latence ajoutée par les API mortes / payantes.
// Par défaut seuls AERORISQ et Groq sont actifs pendant la phase de test.
function isProviderEnabled(service: string): boolean {
  const flag = process.env[`IA_ENABLE_${service.toUpperCase()}`]
  if (flag !== undefined) return flag.trim().toLowerCase() === 'true'
  // Valeurs par défaut : AERORISQ et Groq actifs, le reste inactif.
  return service === 'aerorisq' || service === 'groq'
}

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

// AERORISQ — IA maison (OpenAI-compatible). Prioritaire quand AERORISQ_API_URL est configuré.
async function callAerorisq(apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  if (!AERORISQ_URL) throw new Error('AERORISQ_API_URL non configuré')
  return apiFetch(AERORISQ_URL, apiKey || null, body, model, signal)
}

// Cache des clés API (5 min TTL) — évite 7+ requêtes Supabase à chaque appel LLM
const keysCache = new Map<string, { data: KeyEntry[]; expiresAt: number }>()
const KEYS_CACHE_TTL = 5 * 60 * 1000

// Charge les clés depuis Supabase (service role) avec fallback .env
async function getServiceKeys(service: string): Promise<KeyEntry[]> {
  const cached = keysCache.get(service)
  if (cached && cached.expiresAt > Date.now()) return cached.data

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
    aerorisq: process.env.AERORISQ_API_KEY,
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

  keysCache.set(service, { data: keys, expiresAt: Date.now() + KEYS_CACHE_TTL })
  return keys
}

// --- Context-aware routing helpers ---
function estimateInputTokens(messages: Array<{ role: string; content: string }>): number {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0) + m.role.length, 0)
  // chars/3 est plus prudent que /4 pour le français (accents, ponctuation, RAG),
  // évite de sous-estimer la vraie limite et les erreurs 413 malgré le contrôle.
  return Math.ceil(totalChars / 3)
}

function getProviderMaxInput(providerName: string): number {
  if (providerName.startsWith('aerorisq')) return 60000
  if (providerName.startsWith('groq_fallback')) return 4000
  if (providerName.startsWith('groq')) return 60000
  if (providerName.startsWith('cloudflare')) return 20000
  if (providerName.startsWith('mistral')) return 30000
  if (providerName.startsWith('huggingface_fallback')) return 16000
  if (providerName.startsWith('huggingface')) return 30000
  if (providerName.startsWith('ollama')) return 100000
  return 60000
}

// Budget de temps GLOBAL de toute la chaîne de fallback.
// Borné SOUS le maxDuration de la route (60s) pour que la plateforme ne coupe
// jamais brutalement avant un échec propre et exploitable. Doit rester <
// maxDuration de generate/route.ts (et cohérent avec les autres routes IA).
// 30 s : le cas nominal (Groq compound-mini) répond en ~1-2 s ; ce budget ne
// borne que le pire cas (tous les providers échouent en chaîne) — au-delà on
// rend la main à l'UI plutôt que de laisser tourner un spinner interminable.
export const GLOBAL_BUDGET_MS = 30000

// Heuristique « provider local = lent » : un serveur local doit être dépriorisé
// (mis en fin de chaîne) car son inférence CPU est lente. Détecte localhost,
// les IP privées LAN (192.168.x, 10.x, 172.16-31.x, Tailscale 100.x) et les
// hôtes .local — au lieu de ne reconnaître que localhost/127.0.0.1.
export function isLocalUrl(url: string | undefined): boolean {
  if (!url) return false
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\.)/.test(url) || /\.local(\/|$)/.test(url)
}

// Détecte si deux URLs pointent vers le même serveur (même origin).
// Utile quand AERORISQ_API_URL = Ollama : éviter de tenter 2x la même machine
// sous des noms différents au sein d'une même chaîne de fallback.
function sameOrigin(a: string | undefined, b: string): boolean {
  if (!a) return false
  try { return new URL(a).origin === new URL(b).origin } catch { return false }
}

export async function callWithFallback(request: LLMRequest): Promise<LLMResult> {
  const errors: string[] = []
  const budgetDebut = Date.now()

  // Charger en PARALLÈLE les clés des providers ACTIVÉS uniquement
  const [groqKeys, openrouterKeys, googleKeys, deepseekKeys, mistralKeys, hfKeys, cloudflareKeys, aerorisqKeys] = await Promise.all([
    isProviderEnabled('groq') ? getServiceKeys('groq') : Promise.resolve([]),
    isProviderEnabled('openrouter') ? getServiceKeys('openrouter') : Promise.resolve([]),
    isProviderEnabled('google_ai') ? getServiceKeys('google_ai') : Promise.resolve([]),
    isProviderEnabled('deepseek') ? getServiceKeys('deepseek') : Promise.resolve([]),
    isProviderEnabled('mistral') ? getServiceKeys('mistral') : Promise.resolve([]),
    isProviderEnabled('huggingface') ? getServiceKeys('huggingface') : Promise.resolve([]),
    isProviderEnabled('cloudflare') ? getServiceKeys('cloudflare') : Promise.resolve([]),
    (AERORISQ_URL && isProviderEnabled('aerorisq')) ? getServiceKeys('aerorisq') : Promise.resolve([]),
  ])

  const allProviders: { name: string; key: string; call: ProviderCall; model: string }[] = []

  // AERORISQ (IA maison) en PREMIER : prioritaire dès que son serveur est configuré.
  // SAUF s'il s'agit d'un Ollama local (localhost/127.0.0.1) : l'inférence locaux CPU est
  // très lente, on ne la met PAS en priorité — les providers cloud rapides passent d'abord.
  const aerorisqLocal = isLocalUrl(AERORISQ_URL)
  // AERORISQ_API_URL pointe-t-il vers le même serveur qu'Ollama ? (cas typique
  // chez l'utilisateur : les deux sur localhost:11434). Si oui, on ne tentera
  // pas 3x la même machine (aerorisq_0 + ollama + ollama_fallback) — aerorisq_0
  // suffit comme unique tentative vers le serveur local, pour laisser du budget
  // à un éventuel vrai provider différent si le local échoue.
  const aerorisqIsOllama = sameOrigin(AERORISQ_URL, OLLAMA_URL)
  const aerorisqEntries: typeof allProviders = []
  for (const k of aerorisqKeys.length > 0 ? aerorisqKeys : (AERORISQ_URL ? [{ key_value: '', fallback_order: 0, is_active: true }] : [])) {
    if (!k.is_active) continue
    aerorisqEntries.push({ name: `aerorisq_${k.fallback_order}`, key: k.key_value, call: callAerorisq, model: AERORISQ_PRIMARY })
  }
  if (!aerorisqLocal) allProviders.push(...aerorisqEntries)

  for (const k of groqKeys) {
    if (!isProviderEnabled('groq')) break
    if (!k.is_active) continue
    allProviders.push({ name: `groq_${k.fallback_order}`, key: k.key_value, call: callGroq, model: GROQ_PRIMARY })
    allProviders.push({ name: `groq_fallback_${k.fallback_order}`, key: k.key_value, call: callGroq, model: GROQ_FALLBACK_MODEL })
  }
  for (const k of openrouterKeys) {
    if (!isProviderEnabled('openrouter')) break
    if (!k.is_active) continue
    allProviders.push({ name: `openrouter_${k.fallback_order}`, key: k.key_value, call: callOpenRouter, model: OPENROUTER_PRIMARY })
    allProviders.push({ name: `openrouter_fallback_${k.fallback_order}`, key: k.key_value, call: callOpenRouter, model: OPENROUTER_FALLBACK })
  }
  for (const k of googleKeys) {
    if (!isProviderEnabled('google_ai')) break
    if (!k.is_active) continue
    allProviders.push({ name: `google_ai_${k.fallback_order}`, key: k.key_value, call: callGoogle, model: GOOGLE_PRIMARY })
    allProviders.push({ name: `google_ai_fallback_${k.fallback_order}`, key: k.key_value, call: callGoogle, model: GOOGLE_FALLBACK })
  }
  for (const k of deepseekKeys) {
    if (!isProviderEnabled('deepseek')) break
    if (!k.is_active) continue
    allProviders.push({ name: `deepseek_${k.fallback_order}`, key: k.key_value, call: callDeepSeek, model: DEEPSEEK_PRIMARY })
    allProviders.push({ name: `deepseek_fallback_${k.fallback_order}`, key: k.key_value, call: callDeepSeek, model: DEEPSEEK_FALLBACK })
  }
  for (const k of mistralKeys) {
    if (!isProviderEnabled('mistral')) break
    if (!k.is_active) continue
    allProviders.push({ name: `mistral_${k.fallback_order}`, key: k.key_value, call: callMistral, model: MISTRAL_PRIMARY })
    allProviders.push({ name: `mistral_fallback_${k.fallback_order}`, key: k.key_value, call: callMistral, model: MISTRAL_FALLBACK })
  }
  for (const k of hfKeys) {
    if (!isProviderEnabled('huggingface')) break
    if (!k.is_active) continue
    allProviders.push({ name: `huggingface_${k.fallback_order}`, key: k.key_value, call: callHuggingFace, model: HF_PRIMARY })
    allProviders.push({ name: `huggingface_fallback_${k.fallback_order}`, key: k.key_value, call: callHuggingFace, model: HF_FALLBACK })
  }
  for (const k of cloudflareKeys) {
    if (!isProviderEnabled('cloudflare')) break
    if (!k.is_active) continue
    allProviders.push({ name: `cloudflare_${k.fallback_order}`, key: k.key_value, call: callCloudflare, model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' })
  }

  // AERORISQ local (Ollama) : on le remet en fin de liste (fallback) — lent.
  if (aerorisqLocal) allProviders.push(...aerorisqEntries)

  // Ollama (local) en DERNIER recours : zéro clé API mais lent (inférence locale).
  // Les providers cloud (Groq, OpenRouter, Google…) sont priorisés pour la rapidité.
  // Si AERORISQ_API_URL pointe déjà vers ce même serveur Ollama, on le saute :
  // `aerorisq_0` couvre déjà cette machine (évite 3 tentatives redondantes).
  if (!aerorisqIsOllama) {
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
    // Budget global : si on est déjà au-delà, on cesse de tenter les providers
    // restants (le timeout de la plateforme couperait la requête brutalement,
    // sans erreur exploitable). Arrêt propre avec erreur agrégée.
    if (Date.now() - budgetDebut >= GLOBAL_BUDGET_MS) {
      errors.push('budget de temps global dépassé')
      break
    }
    try {
      const controller = new AbortController()
      const isLocal = provider.name.startsWith('ollama') || (
        provider.name.startsWith('aerorisq') && isLocalUrl(AERORISQ_URL)
      )
      // Inférence locale : 120 s — le premier appel charge le modèle en mémoire (lent), les suivants sont rapides.
      // MAIS plafonné par le budget global restant : un provider local ne doit jamais
      // dépasser à lui seul le budget qui encadre TOUTE la chaîne de fallback (sinon
      // GLOBAL_BUDGET_MS serait purement décoratif et les providers suivants n'auraient
      // jamais leur chance).
      const callElapsed = Date.now() - budgetDebut
      const remainingBudget = GLOBAL_BUDGET_MS - callElapsed
      const cap = isLocal ? 120000 : 60000
      const providerTimeoutMs = Math.max(1000, Math.min(cap, remainingBudget))
      const providerTimeout = setTimeout(() => controller.abort(), providerTimeoutMs)
      const res = await provider.call(provider.key, provider.model, request, controller.signal)
      clearTimeout(providerTimeout)
      if (res.status === 429) { errors.push(`${provider.name}: quota dépassé (429)`); continue }
      if (!res.ok) { const t = await res.text(); errors.push(`${provider.name}: ${res.status} ${t.slice(0, 200)}`); continue }
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content ?? ''
      // Un provider peut répondre 200 avec un contenu vide (filtrage,
      // troncature, contenu refusé) : ce n'est pas un succès exploitable.
      // On considère ce cas comme un échec et on retente le provider suivant.
      if (!content || content.trim().length === 0) {
        errors.push(`${provider.name}: contenu vide (200)`)
        continue
      }
      return { content, provider: provider.name as any, model: data.model || provider.model, usage: data.usage }
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
  if (AERORISQ_URL && isProviderEnabled('aerorisq')) return true
  return (
    (isProviderEnabled('groq') && !!process.env.GROQ_API_KEY) ||
    (isProviderEnabled('openrouter') && !!process.env.OPENROUTER_API_KEY) ||
    (isProviderEnabled('google_ai') && !!process.env.GOOGLE_AI_API_KEY) ||
    (isProviderEnabled('deepseek') && !!process.env.DEEPSEEK_API_KEY) ||
    (isProviderEnabled('mistral') && !!process.env.MISTRAL_API_KEY) ||
    (isProviderEnabled('huggingface') && !!process.env.HF_API_KEY) ||
    (isProviderEnabled('cloudflare') && !!process.env.CLOUDFLARE_AI_KEY)
  )
}

export function getAvailableProviders(): string[] {
  const list: string[] = []
  const push = (enabled: boolean, label: string) => { if (enabled) list.push(label) }
  push(!!AERORISQ_URL && isProviderEnabled('aerorisq'), `aerorisq (IA maison)`)
  push(isProviderEnabled('groq') && !!process.env.GROQ_API_KEY, `groq (env)`)
  push(isProviderEnabled('openrouter') && !!process.env.OPENROUTER_API_KEY, `openrouter (env)`)
  push(isProviderEnabled('google_ai') && !!process.env.GOOGLE_AI_API_KEY, `google_ai (env)`)
  push(isProviderEnabled('deepseek') && !!process.env.DEEPSEEK_API_KEY, `deepseek (env)`)
  push(isProviderEnabled('mistral') && !!process.env.MISTRAL_API_KEY, `mistral (env)`)
  push(isProviderEnabled('huggingface') && !!process.env.HF_API_KEY, `huggingface (env)`)
  if (isProviderEnabled('cloudflare') && !!process.env.CLOUDFLARE_AI_KEY) {
    if (process.env.CLOUDFLARE_ACCOUNT_ID) list.push(`cloudflare (env)`)
    else list.push(`cloudflare (env — manque CLOUDFLARE_ACCOUNT_ID)`)
  }
  list.push(`ollama (local — dernier recours)`)
  return list
}
