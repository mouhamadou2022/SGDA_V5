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
  /** Réflexion qwen3 côté local (défaut false). Ignoré par les clouds. */
  think?: boolean
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

// Modèles Groq VÉRIFIÉS EN DIRECT sur le compte actuel (GET /models + appel
// réel le 2026-09-30) : Groq a retiré llama-3.3-70b-versatile, llama-3.1-8b-instant
// ET groq/compound-mini + groq/compound (404 model_not_found).
// qwen/qwen3.8-27b (id exact renvoyé par l'API) répond sans reasoning parasite ;
// openai/gpt-oss-20b répond aussi (reasoning court, contenu présent) en repli.
const GROQ_PRIMARY = 'qwen/qwen3.8-27b'
const GROQ_FALLBACK_MODEL = 'openai/gpt-oss-20b'
// 2026-10 : qwen/qwen3.8-27b:free retiré (404 « use qwen/qwen3.8-27b » payant)
// + deepseek/deepseek-chat en 402 permanent (zéro crédit). Remplacés par des
// :free EXISTANTS vérifiés le 2026-10-05 (liste /models + ping réel) — le
// gratuit OpenRouter tourne vite (429/vides) : la pause auto absorbe.
// Si le compte reste à zéro crédit durablement : IA_ENABLE_OPENROUTER=false.
const OPENROUTER_PRIMARY = 'google/gemma-4-26b-a4b-it:free'
const OPENROUTER_FALLBACK = 'google/gemma-4-31b-it:free'
const GOOGLE_PRIMARY = 'gemini-2.5-flash'
// 2026-10 : gemini-2.0-flash retiré par Google (404 « no longer available »,
// consigne : gemini-3.8-flash). Si ce successeur échoue aussi, la pause auto
// sur 404 contient l'erreur sans casser la chaîne.
const GOOGLE_FALLBACK = 'gemini-3.8-flash'
const DEEPSEEK_PRIMARY = 'deepseek-chat'
const DEEPSEEK_FALLBACK = 'deepseek-chat'
const MISTRAL_PRIMARY = 'mistral-large-latest'
const MISTRAL_FALLBACK = 'mistral-small-latest'
const HF_PRIMARY = 'mistralai/Mistral-7B-Instruct-v0.3'
const HF_FALLBACK = 'HuggingFaceH4/zephyr-7b-beta'
const OLLAMA_PRIMARY = 'mistral'
const OLLAMA_FALLBACK = 'llama3.2'
const AERORISQ_PRIMARY = process.env.AERORISQ_MODEL || 'mistral' // modèle de l'IA maison AERORISQ (Ollama par défaut)
// Durée pendant laquelle Ollama garde le modèle chargé en mémoire après un appel
// (warm-up : zéro CPU permanent, ~4-5 Go de RAM). '30m' couvre la plupart des
// sessions ; '1h' voire '-1' (indéfini) possible si la machine a assez de RAM.
const OLLAMA_KEEP_ALIVE = '30m'

// ── Désactivation explicite des providers ─────────────────────────────
// Un provider (service cloud) n'est essayé QUE s'il est explicitement activé
// via IA_ENABLE_<SERVICE>=true dans l'environnement. Sans drapeau, il ne sera
// JAMAIS appelé → zéro latence ajoutée par les API mortes / payantes.
// Par défaut seuls AERORISQ et Groq sont actifs pendant la phase de test.
export function isProviderEnabled(service: string): boolean {
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

const apiFetch = (url: string, apiKey: string | null, body: LLMRequest, model: string, signal?: AbortSignal, extraBody?: Record<string, unknown>): Promise<Response> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  const payload: Record<string, unknown> = { ...body, ...extraBody, model }
  // Champs Ollama uniquement (think, keep_alive) : les endpoints OpenAI
  // stricts (Google…) les rejettent en 400 « Unknown name ». On ne les envoie
  // que si l'appelant les a explicitement demandés (chemins Ollama/AERORISQ
  // local) — jamais par héritage du LLMRequest vers un cloud.
  if (!extraBody || !('think' in extraBody)) delete payload.think
  if (!extraBody || !('keep_alive' in extraBody)) delete payload.keep_alive
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal })
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

/**
 * URLs Ollama à essayer : le cas classique est `localhost` résolu en ::1
 * (IPv6) alors qu'Ollama n'écoute que 127.0.0.1 (IPv4), ou l'inverse.
 * Même règle que le pilote (variantesUrlOllama) — configurable via
 * OLLAMA_URL ou NEXT_PUBLIC_OLLAMA_URL.
 */
/**
 * Partition stable local-d'abord (SGDA_LOCAL_FIRST) : les providers locaux
 * (Ollama, AERORISQ local) devant, le cloud en secours. Ordre relatif conservé.
 */
export function ordonnerProvidersLocalFirst<T extends { name: string }>(
  providers: T[],
  aerorisqEstLocal: boolean,
): T[] {
  const estLocal = (nom: string) =>
    nom.startsWith('ollama') || (nom.startsWith('aerorisq') && aerorisqEstLocal)
  return [...providers.filter(p => estLocal(p.name)), ...providers.filter(p => !estLocal(p.name))]
}

export function urlsOllama(): string[] {
  const brut = process.env.OLLAMA_URL || process.env.NEXT_PUBLIC_OLLAMA_URL || OLLAMA_URL
  const base = brut.replace(/\/v1\/chat\/completions\/?$/, '').replace(/\/+$/, '')
  const variantes = [base]
  if (base.includes('localhost')) variantes.push(base.replace('localhost', '127.0.0.1'))
  else if (base.includes('127.0.0.1')) variantes.push(base.replace('127.0.0.1', 'localhost'))
  return variantes.map(v => `${v}/v1/chat/completions`)
}

async function callOllama(_apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  // keep_alive : voir note dans callAerorisq (même objectif warm-up local).
  // think:false : qwen3 réfléchit sinon en cachette (minutes sur CPU) —
  // ignoré sans effet par les versions qui ne le supportent pas.
  let derniere: Response | null = null
  let derniereErreur: unknown = null
  for (const url of urlsOllama()) {
    try {
      const res = await apiFetch(url, null, body, model, signal, { keep_alive: OLLAMA_KEEP_ALIVE, think: body.think ?? false })
      if (res.ok) return res
      derniere = res
    } catch (e) {
      derniereErreur = e
    }
  }
  if (derniere) return derniere
  throw derniereErreur instanceof Error ? derniereErreur : new Error('Ollama injoignable (localhost et 127.0.0.1 essayés)')
}

// AERORISQ — IA maison (OpenAI-compatible). Prioritaire quand AERORISQ_API_URL est configuré.
async function callAerorisq(apiKey: string, model: string, body: LLMRequest, signal?: AbortSignal): Promise<Response> {
  if (!AERORISQ_URL) throw new Error('AERORISQ_API_URL non configuré')
  // keep_alive (paramètre Ollama, OpenAI-compatible) : garde le modèle chargé en
  // mémoire entre les appels — supprime le chargement à froid (10-30s+) au
  // premier hit après inactivité. Zéro CPU permanent, ~4-5 Go de RAM. Uniquement
  // pertinent si AERORISQ_URL pointe vers un serveur local (Ollama par défaut).
  const localOllama = isLocalUrl(AERORISQ_URL)
  return apiFetch(AERORISQ_URL, apiKey || null, body, model, signal, localOllama ? { keep_alive: OLLAMA_KEEP_ALIVE, think: body.think ?? false } : undefined)
}

// Cache des clés API (5 min TTL) — évite 7+ requêtes Supabase à chaque appel LLM
const keysCache = new Map<string, { data: KeyEntry[]; expiresAt: number }>()
const KEYS_CACHE_TTL = 5 * 60 * 1000

// Charge les clés depuis Supabase (service role) avec fallback .env
export async function getServiceKeys(service: string): Promise<KeyEntry[]> {
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

// --- Pause auto sur quota épuisé ---
// Un provider en échec quota/clé (401 clé invalide, 402 crédits épuisés,
// 429 sans retry) est sauté pendant 15 min au lieu de brûler le budget cloud
// à chaque appel — la chaîne passe au suivant, puis au local (Ollama, déjà
// chaud via keep_alive). Purement mémoire (repart à zéro au redémarrage ;
// un réapprovisionnement refonctionne à l'expiration). Les 400 et contenus
// vides ne déclenchent PAS de pause (liés à la requête, pas au provider).
const pausesQuota = new Map<string, number>()
export const DUREE_PAUSE_QUOTA_MS = 15 * 60 * 1000

/** Préfixe de service (groq_0 + groq_fallback_0 partagent la même clé/quota). */
export function prefixeService(nom: string): string {
  return nom.split('_')[0]
}

/** Marque un provider en pause quota (testable directement). */
export function marquerQuotaEpuise(nom: string, dureeMs: number = DUREE_PAUSE_QUOTA_MS): void {
  const jusqu = Date.now() + dureeMs
  pausesQuota.set(nom, jusqu)
  // Le jumeau fallback partage clé et quota : pausé aussi, sinon il brûle
  // le budget pour la même panne (mesuré : openrouter_0 429 puis
  // openrouter_fallback_0 402 dans le même appel).
  pausesQuota.set(prefixeService(nom), jusqu)
}

/** Vrai si le provider est en pause quota (expirée = nettoyée). */
export function quotaEnPause(nom: string, maintenant: number = Date.now()): boolean {
  const jusqu = pausesQuota.get(nom) ?? pausesQuota.get(prefixeService(nom))
  if (jusqu == null) return false
  if (maintenant >= jusqu) {
    pausesQuota.delete(nom)
    pausesQuota.delete(prefixeService(nom))
    return false
  }
  return true
}

/** Fin de pause anticipée (clé réparée / crédits rechargés). */
export function leverPauseQuota(nom: string): void {
  pausesQuota.delete(nom)
  pausesQuota.delete(prefixeService(nom))
}

// --- Context-aware routing helpers ---
function estimateInputTokens(messages: Array<{ role: string; content: string }>): number {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0) + m.role.length, 0)
  // chars/3 est plus prudent que /4 pour le français (accents, ponctuation, RAG),
  // évite de sous-estimer la vraie limite et les erreurs 413 malgré le contrôle.
  return Math.ceil(totalChars / 3)
}

/**
 * Plafond d'entrée par TIER (pas par modèle) : le tier gratuit Groq refuse
 * au-delà de ~7000 tokens/min (413 « Request too large ») — retenter est
 * inutile, on saute direct vers le local (Ollama, sans plafond) ou un autre
 * provider. Surchargeable : GROQ_TIER_INPUT_CAP.
 */
export function getProviderTierInputCap(providerName: string): number {
  if (providerName.startsWith('groq')) {
    const v = process.env.GROQ_TIER_INPUT_CAP
    const n = v ? Number(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : 6000
  }
  return Infinity
}

function getProviderMaxInput(providerName: string): number {
  if (providerName.startsWith('aerorisq')) return 60000
  if (providerName.startsWith('groq_fallback')) return 60000
  if (providerName.startsWith('groq')) return 60000
  if (providerName.startsWith('cloudflare')) return 20000
  if (providerName.startsWith('mistral')) return 30000
  if (providerName.startsWith('huggingface_fallback')) return 16000
  if (providerName.startsWith('huggingface')) return 30000
  if (providerName.startsWith('ollama')) return 100000
  return 60000
}

// Budgets de temps SÉPARÉS de la chaîne de fallback : un pour la phase cloud,
// un pour la phase locale (Ollama / AERORISQ local). Deux phases indépendantes
// et PLAFONNÉES chacune, plutôt qu'un budget global unique qui plafonnait
// l'inférence locale par ce qu'avait déjà consommé la phase cloud (bug : un
// appel cloud échouant vite — Groq 429/413 — réduisait quasiment à rien le
// temps accordé à Ollama, qui charge son modèle à froid en 10-30s+, donc
// timeout systématique en dev local).
//
// Pire cas total ≈ CLOUD_BUDGET_MS + LOCAL_BUDGET_MS, à garder SOUS le
// maxDuration le plus bas des routes IA concernées (60s actuellement sur
// Hobby / generate) pour que la plateforme ne coupe jamais brutalement avant
// un échec propre.
//
// NOTE 2026-08-30 : la génération d'écarts passe par /api/ia/analyze
// (maxDuration = 300), PAS par /api/ia/generate (60s). Le budget LOCAL est
// donc libre d'être plus généreux côté serveur. Ollama n'existe qu'en local
// (aucun provider local en production Vercel) : relever LOCAL_BUDGET_MS
// n'affecte que le dev. Mesuré ensuite : un prompt copilote à ~9000 tokens
// (grosses pièces) avorte aussi à 120 s sur CPU (pré-remplissage long) —
// le budget passe à 240 s, sous le maxDuration 300 de la route. Les deux
// budgets restent surchargeables par env :
//   NEXT_PUBLIC_CLOUD_BUDGET_MS / NEXT_PUBLIC_LOCAL_BUDGET_MS
function envBudget(key: string, def: number): number {
  const v = process.env[key]
  const n = v ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : def
}
export const CLOUD_BUDGET_MS = envBudget('NEXT_PUBLIC_CLOUD_BUDGET_MS', 20000)
export const LOCAL_BUDGET_MS = envBudget('NEXT_PUBLIC_LOCAL_BUDGET_MS', 240000)

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

  // Ordre local vs cloud (SGDA_LOCAL_FIRST=true : souveraineté — le local
  // passe devant, le cloud ne sert qu'en secours ; défaut false : rapidité).
  const localFirst = (process.env.SGDA_LOCAL_FIRST || '').trim().toLowerCase() === 'true'
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

  // SGDA_LOCAL_FIRST : le local (Ollama/AERORISQ local) passe devant, le cloud
  // ne sert qu'en secours. Partition stable : l'ordre relatif est conservé.
  if (localFirst) {
    const ordonnes = ordonnerProvidersLocalFirst(allProviders, aerorisqLocal)
    allProviders.length = 0
    allProviders.push(...ordonnes)
  }

  // Context-aware routing : sauter les providers dont la fenêtre de contexte est trop petite
  // OU dont le tier gratuit refuserait (413) — on ne brûle ni quota ni secondes.
  const inputTokens = estimateInputTokens(request.messages)
  const filtered = allProviders.filter(p => {
    const maxInput = getProviderMaxInput(p.name)
    if (inputTokens > maxInput) {
      errors.push(`${p.name}: trop long (${inputTokens} > ${maxInput} tokens)`)
      return false
    }
    const tierCap = getProviderTierInputCap(p.name)
    if (inputTokens > tierCap) {
      errors.push(`${p.name}: prompt trop volumineux pour le tier gratuit (${inputTokens} > ${tierCap} tokens) — repli local`)
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

  // Budgets par phase DÉMARRÉS PARESSEUSEMENT : chaque phase dispose de son
  // budget à partir de SA première tentative (et non du début de boucle).
  // Sans ça, en local-first, une tentative locale lente (240 s) faisait
  // expirer la fenêtre cloud (20 s) AVANT qu'elle ne serve — le secours
  // cloud n'était jamais joint (mesuré : tous « budget cloud épuisé »).
  let cloudPhaseStart: number | null = null
  let localPhaseStart: number | null = null

  for (const provider of filtered) {
    // Pause auto : quota/clé morts sautés sans brûler de budget.
    if (quotaEnPause(provider.name)) {
      errors.push(`${provider.name}: en pause auto (quota épuisé — reprise du service bientôt)`)
      continue
    }
    try {
      const controller = new AbortController()
      const isLocal = provider.name.startsWith('ollama') || (
        provider.name.startsWith('aerorisq') && isLocalUrl(AERORISQ_URL)
      )
      // Deux budgets FIXES et INDÉPENDANTS par phase (cloud / local). Le budget
      // local ne dépend jamais de ce qu'a consommé la phase cloud (bug corrigé :
      // un provider cloud échouant vite réduisait à rien le temps accordé à
      // l'inférence locale). Chaque phase reste plafonnée, donc le pire cas total
      // reste connu à l'avance (CLOUD_BUDGET_MS + LOCAL_BUDGET_MS), borné sous le
      // maxDuration le plus bas des routes IA.
      let providerTimeoutMs: number
      if (isLocal) {
        if (localPhaseStart === null) localPhaseStart = Date.now()
        const remaining = LOCAL_BUDGET_MS - (Date.now() - localPhaseStart)
        if (remaining <= 1000) { errors.push(`${provider.name}: ignoré — budget local épuisé`); continue }
        providerTimeoutMs = Math.max(1000, Math.min(240000, remaining))
      } else {
        if (cloudPhaseStart === null) cloudPhaseStart = Date.now()
        const remaining = CLOUD_BUDGET_MS - (Date.now() - cloudPhaseStart)
        if (remaining <= 1000) { errors.push(`${provider.name}: ignoré — budget cloud épuisé`); continue }
        providerTimeoutMs = Math.max(1000, Math.min(60000, remaining))
      }
      const providerTimeout = setTimeout(() => controller.abort(), providerTimeoutMs)
      const appeler = () => provider.call(provider.key, provider.model, request, controller.signal)
      let res = await appeler()
      clearTimeout(providerTimeout)
      // Quota (429) : respecter Retry-After UNE fois au lieu d'abandonner —
      // les rafales (génération SGS multi-éléments) se résorbent en secondes.
      if (res.status === 429) {
        const retryApres = Number(res.headers?.get?.('retry-after')) || 0
        const rejouable = Number.isFinite(retryApres) && retryApres > 0 && retryApres <= 60
        if (!rejouable) {
          marquerQuotaEpuise(provider.name)
          errors.push(`${provider.name}: quota dépassé (429 — pause auto)`)
          continue
        }
        await new Promise(r => setTimeout(r, retryApres * 1000))
        const controller2 = new AbortController()
        const timeout2 = setTimeout(() => controller2.abort(), providerTimeoutMs)
        try {
          res = await provider.call(provider.key, provider.model, request, controller2.signal)
        } finally {
          clearTimeout(timeout2)
        }
        if (res.status === 429) {
          marquerQuotaEpuise(provider.name)
          errors.push(`${provider.name}: quota dépassé (429, retry épuisé — pause auto)`)
          continue
        }
        // Sinon : retombée ci-dessous (traitement normal de la réponse rejouée).
      }
      if (!res.ok) {
        const t = await res.text()
        // 401 (clé invalide) / 402 (crédits épuisés) / 404 (modèle retiré) :
        // état du compte ou du catalogue, pas de la requête — pause auto,
        // les appels suivants passent au suivant.
        if (res.status === 401 || res.status === 402 || res.status === 404) marquerQuotaEpuise(provider.name)
        errors.push(`${provider.name}: ${res.status} ${t.slice(0, 200)}`)
        continue
      }
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
