// app/api/ia/training/route.ts
// Collecte les exécutions de tâches d'agents IA (module Agents) pour
// l'apprentissage d'AERORISQ — pointe vers ia_training_dataset.
// Best-effort : si la table n'existe pas ou que Supabase est indisponible,
// on répond ok sans bloquer l'UI (l'historique reste local dans IndexedDB).

import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 })
    }

    const nomModule = typeof body.module === 'string' ? body.module : ''
    const texte = typeof body.texte === 'string' ? body.texte : ''
    if (!nomModule || !texte) {
      return NextResponse.json({ ok: false, error: 'module et texte requis' }, { status: 400 })
    }

    const texteHash =
      typeof body.texte_hash === 'string' && body.texte_hash
        ? body.texte_hash
        : `${nomModule}::${texte.length}::${(body.agentId ?? '').toString()}`.replace(/[^a-zA-Z0-9]/g, '_')

    const vote = body.vote === 'up' || body.vote === 'down' ? body.vote : null
    const fallbackIA = body.fallbackIA === true

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: true, stored: false, reason: 'Supabase non configurée' })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const row = {
      module: nomModule,
      texte_hash: texteHash,
      contexte: body.contexte && typeof body.contexte === 'object' ? body.contexte : {},
      texte,
      fallback_ia: fallbackIA,
      vote,
    }

    const { data: existing } = await supabaseAdmin
      .from('ia_training_dataset')
      .select('id')
      .eq('module', nomModule)
      .eq('texte_hash', texteHash)
      .limit(1)

    let stored = false
    if (existing && existing.length > 0) {
      const update: Record<string, unknown> = { fallback_ia: fallbackIA }
      if (vote) update.vote = vote
      const { error } = await supabaseAdmin
        .from('ia_training_dataset')
        .update(update)
        .eq('id', existing[0].id)
      if (!error) stored = true
    } else {
      const { error } = await supabaseAdmin.from('ia_training_dataset').insert(row)
      if (!error) stored = true
    }

    return NextResponse.json({ ok: true, stored })
  } catch (err) {
    return NextResponse.json({ ok: true, stored: false, reason: (err as Error).message })
  }
}