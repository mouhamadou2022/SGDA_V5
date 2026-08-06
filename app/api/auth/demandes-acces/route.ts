import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// app/api/auth/demandes-acces/route.ts
// Consultation et traitement des demandes d'accès (module Utilisateurs).
//
//  GET  → liste des demandes (réservée aux rôles admin / dg_anacim / inspector)
//  POST → met à jour le statut d'une demande (traitée / en_traitement / rejetée)
//
// Le rôle est vérifié via le token du client connecté (JWT). La lecture
// directe avec le client connecté est aussi protégée par la RLS de la table
// demandes_acces (select réservé à admin/dg_anacim/inspector).

async function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return null
  }
  return createClient(supabaseUrl, serviceKey)
}

export async function GET() {
  try {
    const supabaseAdmin = await getSupabaseClient()
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const { data, error } = await supabaseAdmin
      .from('demandes_acces')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[demandes-acces] Erreur lecture:', error)
      return NextResponse.json({ error: 'Impossible de charger les demandes.' }, { status: 500 })
    }

    return NextResponse.json({ demandes: data ?? [] })
  } catch (error: unknown) {
    console.error('[demandes-acces] Erreur GET:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const id = typeof body.id === 'string' ? body.id : ''
    const statut = typeof body.statut === 'string' ? body.statut : ''
    const note = typeof body.note === 'string' ? body.note.trim() : ''

    if (!id) {
      return NextResponse.json({ error: 'Identifiant de demande requis' }, { status: 400 })
    }
    if (!['nouveau', 'en_traitement', 'traitee', 'rejetee'].includes(statut)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    const supabaseAdmin = await getSupabaseClient()
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const { error } = await supabaseAdmin
      .from('demandes_acces')
      .update({
        statut,
        traitee_le: new Date().toISOString(),
        note_traitement: note || null,
      })
      .eq('id', id)

    if (error) {
      console.error('[demandes-acces] Erreur mise à jour:', error)
      return NextResponse.json({ error: 'Impossible de mettre à jour la demande.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('[demandes-acces] Erreur POST:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
