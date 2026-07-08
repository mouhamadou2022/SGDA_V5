// app/api/evenements/route.ts
// API endpoint pour la création et mise à jour d'événements de sécurité
// Utilise la clé service_role pour contourner RLS

import { NextRequest, NextResponse } from 'next/server'

async function getSb() {
  const { createClient } = await import('@supabase/supabase-js')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const sb = await getSb()
    if (!sb) return NextResponse.json({ error: 'Supabase non configuré' }, { status: 500 })

    if (!payload.created_at) payload.created_at = new Date().toISOString()
    if (!payload.updated_at) payload.updated_at = new Date().toISOString()

    const { data, error } = await sb.from('evenements_securite').insert(payload).select().single()
    if (error) {
      console.error('[api/evenements] POST error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[api/evenements] POST exception:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, ...payload } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    const sb = await getSb()
    if (!sb) return NextResponse.json({ error: 'Supabase non configuré' }, { status: 500 })

    payload.updated_at = new Date().toISOString()

    const { data, error } = await sb.from('evenements_securite').update(payload).eq('id', id).select().single()
    if (error) {
      console.error('[api/evenements] PUT error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[api/evenements] PUT exception:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
