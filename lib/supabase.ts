import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_supabase) return _supabase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing Supabase environment variables')
  _supabase = createClient(url, key)
  return _supabase
}

function createSupabaseProxy(): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_, prop) {
      const client = getClient()
      return (client as any)[prop]
    },
  })
}

export const supabase = createSupabaseProxy()
