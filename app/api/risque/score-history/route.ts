// app/api/risque/score-history/route.ts
// Persistance d'un point d'historique de score (score_history).
//
// La table score_history n'a pas de policy RLS d'écriture pour le client
// (l'insert direct via la clé anon renvoyait 403). On écrit ici avec la clé
// service_role — même schéma que /api/evenements — et le client reste en
// best-effort : un échec d'historisation ne bloque jamais un calcul de score.

import { NextRequest, NextResponse } from 'next/server'

async function getSb() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

interface ScoreHistoryPayload {
  aerodrome_id?: string
  score_global?: number
  c1?: number | null
  c2?: number | null
  c3?: number | null
  c4?: number | null
  c5?: number | null
  niveau?: string | null
  tendance?: string | null
  computed_at?: string
}

export async function POST(req: NextRequest) {
  try {
    const p = (await req.json()) as ScoreHistoryPayload
    if (!p?.aerodrome_id || typeof p.score_global !== 'number' || !Number.isFinite(p.score_global)) {
      return NextResponse.json({ error: 'aerodrome_id et score_global (numérique) requis' }, { status: 400 })
    }

    const sb = await getSb()
    if (!sb) return NextResponse.json({ error: 'Supabase non configuré' }, { status: 500 })

    const payload = {
      aerodrome_id: p.aerodrome_id,
      score_global: p.score_global,
      c1: p.c1 ?? null,
      c2: p.c2 ?? null,
      c3: p.c3 ?? null,
      c4: p.c4 ?? null,
      c5: p.c5 ?? null,
      niveau: p.niveau ?? null,
      tendance: p.tendance ?? null,
      computed_at: p.computed_at ?? new Date().toISOString(),
    }

    const { error } = await sb.from('score_history').insert(payload)
    if (error) {
      console.error('[score-history] Insert refusé:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    console.error('[score-history] Exception:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
