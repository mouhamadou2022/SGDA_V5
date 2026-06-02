import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Pendant le build Vercel, les variables ne sont pas encore injectées.
    // On retourne un client factice — il ne sera utilisé qu'au runtime côté client.
    return new Proxy({} as SupabaseClient, {
      get(_, prop) {
        return (..._args: any[]) => {
          console.warn(`[supabase] Appel '${String(prop)}' ignoré — variables d'environnement absentes`)
          return Promise.resolve({ data: null, error: new Error('Supabase non disponible (build)') })
        }
      },
    })
  }
  _client = createClient(url, key)
  return _client
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabase() as any)[prop]
  },
})
