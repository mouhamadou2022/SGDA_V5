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

    // Filet anti-doublon : si la référence existe déjà (compteur client basé
    // sur un cache partiel/filtré ou création parallèle), régénérer depuis le
    // max réel en base et réessayer (borné). Ne touche jamais aux autres champs.
    for (let tentative = 0; tentative < 5; tentative++) {
      const { data, error } = await sb.from('evenements_securite').insert(payload).select().single()
      if (!error) {
        // Fan-out serveur (best-effort, jamais bloquant) : les notifications
        // admin ne dépendent plus de la liste utilisateurs chargée côté client
        // (vide = admin jamais prévenu, cas constaté en prod).
        try {
          const { data: admins } = await sb.from('utilisateurs').select('id').eq('role', 'admin')
          const grave = (data as { gravite?: string }).gravite === 'critique'
          for (const a of (admins || []) as Array<{ id: string }>) {
            await sb.from('notifications').insert({
              user_id: a.id,
              type: grave ? 'danger' : 'warning',
              title: `Nouvel événement (${(data as { gravite?: string }).gravite || ''}) — ${(data as { reference?: string }).reference || ''}`,
              message: `${(data as { type?: string }).type || 'Événement'} déclaré — à assigner pour traitement.`,
              canal: 'in_app',
            })
          }
        } catch {
          // La création a réussi : un fan-out manqué ne doit jamais l'annuler.
        }
        return NextResponse.json({ data })
      }
      const doublon = (error as { code?: string; message?: string }).code === '23505'
        || (error.message || '').includes('evenements_securite_reference_key')
      if (!doublon || tentative === 4) {
        console.error('[api/evenements] POST error:', JSON.stringify(error))
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      const annee = new Date().getFullYear()
      const { data: existantes } = await sb.from('evenements_securite')
        .select('reference')
        .like('reference', `EVT-${annee}-%`)
      let max = 0
      for (const r of (existantes || []) as Array<{ reference?: string }>) {
        const n = Number(String(r.reference || '').slice(`EVT-${annee}-`.length))
        if (Number.isInteger(n) && n > max) max = n
      }
      payload.reference = `EVT-${annee}-${String(max + 1).padStart(3, '0')}`
    }
    return NextResponse.json({ error: 'Référence indisponible après plusieurs tentatives' }, { status: 409 })
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
