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

        return NextResponse.json({
          success: true,
          auth_id: existingUser.id,
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
      console.error('[create-user] Erreur Supabase Auth:', authError)
      if (authError.message?.includes('already exists') || authError.message?.includes('duplicate')) {
        return NextResponse.json({ error: 'Un compte existe déjà avec cet email', status: 409 }, { status: 409 })
      }
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    console.log('[create-user] Utilisateur Auth créé:', authData.user.id)

    // Créer l'entrée dans utilisateurs avec TOUS les champs
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

    const { error: dbError } = await supabaseAdmin
      .from('utilisateurs')
      .insert(userData)

    if (dbError) {
      console.error('[create-user] Erreur insert utilisateur DB:', dbError)
      // Essayer un update si conflit
      const { error: updateError } = await supabaseAdmin
        .from('utilisateurs')
        .update(userData)
        .eq('email', email)

      if (updateError) {
        console.error('[create-user] Erreur update fallback:', updateError)
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
        return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      auth_id: authData.user.id,
      message: 'Utilisateur créé avec succès',
    })
  } catch (error: any) {
    console.error('[create-user] Erreur API:', error)
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 })
  }
}
