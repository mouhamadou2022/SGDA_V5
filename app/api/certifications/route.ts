// app/api/certifications/route.ts
// API endpoint pour la création et mise à jour des certifications
// Utilise la clé service_role pour contourner RLS (focal_operator n'a pas les droits write)

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_COLS = [
  'id', 'aerodrome_id', 'reference', 'phase_active', 'phases_data',
  'statut_global', 'numero_cert', 'date_delivrance', 'date_expiration',
  'lettre_signee_url', 'type_certification', 'archived_at', 'exemptions_ids',
  'created_at', 'updated_at',
]

function cleanPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const key of ALLOWED_COLS) {
    if (payload[key] !== undefined) clean[key] = payload[key]
  }
  if (!clean.updated_at) clean.updated_at = new Date().toISOString()
  return clean
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Supabase non configuré' }, { status: 500 })
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const clean = cleanPayload(payload)
    if (!clean.created_at) clean.created_at = new Date().toISOString()
    if (!clean.id) clean.id = crypto.randomUUID()

    const { data, error } = await sb.from('certifications').insert(clean).select().single()
    if (error) {
      console.error('[api/certifications] POST error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[api/certifications] POST exception:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, ...payload } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Supabase non configuré' }, { status: 500 })
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const clean = cleanPayload(payload)

    const { data, error } = await sb.from('certifications').update(clean).eq('id', id).select().single()
    if (error) {
      console.error('[api/certifications] PUT error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[api/certifications] PUT exception:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
