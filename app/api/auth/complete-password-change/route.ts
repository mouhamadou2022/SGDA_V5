import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Appelé après un changement réussi du mot de passe provisoire (comptes internes).
// Le clear de force_pwd_change doit passer par le serveur : côté client, la
// policy RLS sur `utilisateurs` peut rejeter l'UPDATE et l'erreur était avalée
// silencieusement — le flag restait true et l'utilisateur devait changer son
// mot de passe à chaque connexion.
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // Vérifier la session de l'appelant : on ne fait confiance qu'à un JWT valide
    const { data: userData, error: tokenError } = await supabaseAdmin.auth.getUser(token)
    if (tokenError || !userData?.user) {
      return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
    }

    // On ne modifie QUE le compte de l'appelant (jamais un autre user)
    const { error } = await supabaseAdmin
      .from('utilisateurs')
      .update({ force_pwd_change: false })
      .eq('auth_id', userData.user.id)

    if (error) {
      console.error('[complete-password-change] Erreur update:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Erreur serveur'
    console.error('[complete-password-change] Erreur:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
