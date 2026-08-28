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

export async function GET() {
  // Comptage simple pour le monitoring (ML Monitoring / module Agents).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, total: null })
  }
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    const { count, error } = await sb.from('ml_samples').select('id', { count: 'exact', head: true })
    return NextResponse.json({ ok: !error, total: count ?? null })
  } catch (err) {
    return NextResponse.json({ ok: false, total: null, reason: (err as Error).message })
  }
}
