import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, prenom, nom, role, inspecteur_id, must_change_password = true, matricule, service } = body

    console.log('[create-user] Requête reçue:', { email, prenom, nom, role, inspecteur_id })

    if (!email || !password) {
      return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    console.log('[create-user] SUPABASE_SERVICE_ROLE_KEY défini:', !!serviceKey)
    console.log('[create-user] NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    
    if (!serviceKey) {
      console.error('[create-user] SUPABASE_SERVICE_ROLE_KEY non défini dans .env.local')
      return NextResponse.json({ error: 'Configuration serveur manquante: SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey
    )

    // Vérifier si l'utilisateur existe déjà dans Auth
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()
    if (listError) {
      console.error('[create-user] Erreur listUsers:', listError)
    } else {
      const existingUser = existingUsers.users.find(u => u.email === email)
      if (existingUser) {
        console.log('[create-user] Utilisateur Auth existe déjà:', existingUser.id)
        // Mettre à jour l'entrée dans utilisateurs
        const { error: dbError } = await supabaseAdmin
          .from('utilisateurs')
          .update({
            auth_id: existingUser.id,
            prenom,
            nom,
            role,
            force_pwd_change: must_change_password,
            statut: 'actif',
            ...(inspecteur_id && { inspecteur_id }),
            ...(matricule && { matricule }),
            ...(service && { service }),
          })
          .eq('email', email)

        if (dbError) {
          console.error('[create-user] Erreur update:', dbError)
        }

        const { data: existingRow } = await supabaseAdmin
          .from('utilisateurs')
          .select('id')
          .eq('email', email)
          .single()

        return NextResponse.json({
          success: true,
          auth_id: existingUser.id,
          user_id: existingRow?.id,
          message: 'Utilisateur existant mis à jour',
        })
      }
    }

    // Créer l'utilisateur dans Supabase Auth
    console.log('[create-user] Création utilisateur Auth...')
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        prenom,
        nom,
        role,
        inspecteur_id,
        must_change_password,
      },
    })

    if (authError) {
      console.error('[create-user] Erreur Supabase Auth:', JSON.stringify(authError))
      if (authError.message?.includes('already exists') || authError.message?.includes('duplicate')) {
        return NextResponse.json({ error: 'Un compte existe déjà avec cet email' }, { status: 409 })
      }
      if (/Database error creating new user/i.test(authError.message || '')) {
        return NextResponse.json({
          error: 'Supabase n\'a pas pu créer le compte : le projet Auth semble mal configuré. Vérifiez que SUPABASE_SERVICE_ROLE_KEY a les droits admin et que le provider Email/Password est activé.',
        }, { status: 500 })
      }
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    console.log('[create-user] Utilisateur Auth créé:', authData.user.id)

    // Créer l'entrée dans utilisateurs avec TOUS les champs.
    // Le trigger handle_new_user a déjà inséré une ligne avec auth_id :
    // on fait donc un upsert par email (ON CONFLICT email) pour réutiliser
    // la ligne existante et garder le même id en base qu'en local.
    const userData = {
      auth_id: authData.user.id,
      email,
      prenom,
      nom,
      role,
      force_pwd_change: must_change_password,
      statut: 'actif',
      notifications_email: true,
      notifications_sms: false,
      ...(inspecteur_id && { inspecteur_id }),
      ...(matricule && { matricule }),
      ...(service && { service }),
    }

    // Upsert par email : le trigger a déjà créé la ligne → on la réutilise
    // (même id qu'en base, pas de doublon).
    const { error: dbError } = await supabaseAdmin
      .from('utilisateurs')
      .upsert(userData, { onConflict: 'email', ignoreDuplicates: false })

    if (dbError) {
      console.error('[create-user] Erreur upsert utilisateur DB:', JSON.stringify(dbError))
      const cause = dbError.message || 'erreur inconnue'
      return NextResponse.json({ error: `Erreur base de données : ${cause}` }, { status: 500 })
    }

    const { data: createdRow } = await supabaseAdmin
      .from('utilisateurs')
      .select('id')
      .eq('email', email)
      .single()

    return NextResponse.json({
      success: true,
      auth_id: authData.user.id,
      user_id: createdRow?.id,
      message: 'Utilisateur créé avec succès',
    })
  } catch (error: unknown) {
    console.error('[create-user] Erreur API:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}
