// app/api/aerorisq/langage-clair/route.ts
// Collecte les échanges « langage clair » (texte affiché + contexte + vote) pour
// l'apprentissage d'AERORISQ. Best-effort : si la table n'existe pas encore ou
// que Supabase est indisponible, on répond ok sans bloquer l'UI.

import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false, error: 'JSON invalide' }, { status: 400 })
    }

    const module = typeof body.module === 'string' ? body.module : ''
    const texte = typeof body.texte === 'string' ? body.texte : ''
    if (!module || !texte) {
      return NextResponse.json({ ok: false, error: 'module et texte requis' }, { status: 400 })
    }

    const texteHash = typeof body.texte_hash === 'string' && body.texte_hash
      ? body.texte_hash
      : `${module}::${texte.length}`.replace(/[^a-zA-Z0-9]/g, '_')

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
      module,
      texte_hash: texteHash,
      aerodrome_id: typeof body.aerodromeId === 'string' ? body.aerodromeId : null,
      contexte: body.contexte && typeof body.contexte === 'object' ? body.contexte : {},
      texte,
      fallback_ia: fallbackIA,
      vote,
      user_id: typeof body.userId === 'string' ? body.userId : null,
      updated_at: new Date().toISOString(),
    }

    // Dédoublonnage : mise à jour du vote sur une ligne existante, sinon insert.
    const { data: existing } = await supabaseAdmin
      .from('ia_langage_clair')
      .select('id, vote')
      .eq('module', module)
      .eq('texte_hash', texteHash)
      .limit(1)

    let stored = false
    if (existing && existing.length > 0) {
      const update: Record<string, unknown> = { updated_at: row.updated_at }
      if (vote) update.vote = vote
      const { error } = await supabaseAdmin.from('ia_langage_clair').update(update).eq('id', existing[0].id)
      if (!error) stored = true
    } else {
      const { error } = await supabaseAdmin.from('ia_langage_clair').insert({ ...row, vote })
      if (!error) stored = true
    }

    return NextResponse.json({ ok: true, stored })
  } catch (err) {
    return NextResponse.json({ ok: true, stored: false, reason: (err as Error).message })
  }
}
