// app/api/ia/ml-samples/route.ts
// Persistance centrale des échantillons ML labellisés terrain.
// Chaque signature de checklist produit un couple :
//   features = profil de risque AVANT inspection → label = niveau réel constaté.
// Carburant des modèles ML : Random Forest navigateur aujourd'hui,
// entraînement serveur / fine-tuning demain. Best-effort : jamais bloquant.

import { NextResponse } from 'next/server'

const LABELS_VALIDES = ['critique', 'eleve', 'moyen', 'faible']

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 })
    }

    const features = body.features && typeof body.features === 'object' ? body.features : null
    const label = typeof body.label === 'string' ? body.label : ''
    const aerodromeId = typeof body.aerodrome_id === 'string' ? body.aerodrome_id : ''
    const surveillanceId = typeof body.surveillance_id === 'string' ? body.surveillance_id : ''

    if (!features || !label || !aerodromeId || !surveillanceId) {
      return NextResponse.json(
        { ok: false, error: 'features, label, aerodrome_id et surveillance_id requis' },
        { status: 400 }
      )
    }
    if (!LABELS_VALIDES.includes(label)) {
      return NextResponse.json({ ok: false, error: 'label invalide' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: true, stored: false, reason: 'Supabase non configurée' })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    // Upsert : re-signer une même surveillance met simplement à jour l'échantillon.
    const { error } = await sb.from('ml_samples').upsert(
      {
        aerodrome_id: aerodromeId,
        surveillance_id: surveillanceId,
        features,
        label,
        label_source: 'terrain',
        contexte: body.contexte && typeof body.contexte === 'object' ? body.contexte : {},
      },
      { onConflict: 'surveillance_id,aerodrome_id' }
    )

    return NextResponse.json({ ok: true, stored: !error, reason: error?.message })
  } catch (err) {
    return NextResponse.json({ ok: true, stored: false, reason: (err as Error).message })
  }
}

export async function GET(request: Request) {
  // Par défaut : comptage simple pour le monitoring (ML Monitoring / module Agents).
  // Avec ?select=samples : retourne les échantillons labellisés terrain pour
  // hydrater le cache local (IndexedDB) — Supabase reste la source de vérité,
  // l'IDB le cache. Dédoublonnage côté client par (surveillance_id, aerodrome_id).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, total: null, samples: [] })
  }
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    let selectSamples = false
    let limit = 500
    try {
      const url = new URL(request.url)
      selectSamples = url.searchParams.get('select') === 'samples'
      const rawLimit = Number(url.searchParams.get('limit') || '500')
      if (Number.isFinite(rawLimit)) limit = Math.min(1000, Math.max(1, Math.floor(rawLimit)))
    } catch {
      // URL non parsable — retomber sur le comptage simple
    }

    if (!selectSamples) {
      const { count, error } = await sb.from('ml_samples').select('id', { count: 'exact', head: true })
      return NextResponse.json({ ok: !error, total: count ?? null })
    }

    const [{ count }, { data, error }] = await Promise.all([
      sb.from('ml_samples').select('id', { count: 'exact', head: true }),
      sb.from('ml_samples')
        .select('id,aerodrome_id,surveillance_id,features,label,created_at')
        .order('created_at', { ascending: false })
        .limit(limit),
    ])
    if (error) {
      return NextResponse.json({ ok: false, total: count ?? null, samples: [], reason: error.message })
    }
    return NextResponse.json({ ok: true, total: count ?? (data?.length ?? 0), samples: data ?? [] })
  } catch (err) {
    return NextResponse.json({ ok: false, total: null, samples: [], reason: (err as Error).message })
  }
}
