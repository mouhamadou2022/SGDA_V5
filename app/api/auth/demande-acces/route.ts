import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// app/api/auth/demande-acces/route.ts
// Soumission publique d'une demande d'accès au système SGDA
// (bouton "Demander un accès au système" du dashboard Invité).
// Insère dans la table `demandes_acces` via service-role :
// le visiteur n'est pas authentifié, il ne peut donc pas écrire
// directement avec son token. La lecture/traitement est réservée
// à l'admin (module Utilisateurs).

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const nom = typeof body.nom === 'string' ? body.nom.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const structure = typeof body.structure === 'string' ? body.structure.trim() : ''
    const type_demande = typeof body.type_demande === 'string' ? body.type_demande : 'compte'
    const message = typeof body.message === 'string' ? body.message.trim() : ''

    if (!nom || !email) {
      return NextResponse.json({ error: 'Nom et email sont requis' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey)

    const { error } = await supabaseAdmin.from('demandes_acces').insert({
      nom,
      email,
      structure: structure || null,
      type_demande: ['compte', 'assistance', 'autre'].includes(type_demande) ? type_demande : 'compte',
      message: message || null,
      statut: 'nouveau',
    })

    if (error) {
      console.error('[demande-acces] Erreur insertion:', error)
      return NextResponse.json({ error: 'Impossible d\u2019enregistrer votre demande. Veuillez réessayer.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Votre demande a bien été enregistrée. L\u2019ANACIM la traitera dans les plus brefs délais.' })
  } catch (error: unknown) {
    console.error('[demande-acces] Erreur API:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
