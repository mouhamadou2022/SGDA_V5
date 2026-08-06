import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_PASSWORD = 'AnacimDNS@2026'

// Réinitialisation du mot de passe par un administrateur :
// remet le mot de passe par défaut (comme à la création) et force
// l'utilisateur à le changer à sa prochaine connexion.
export async function POST(request: Request) {
  try {
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'id utilisateur requis' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Configuration serveur manquante: SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey
    )

    const { data: user, error: fetchError } = await supabaseAdmin
      .from('utilisateurs')
      .select('id, email, auth_id, nom, prenom')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      console.error('[reset-password] Erreur fetch utilisateur:', fetchError)
      return NextResponse.json({ error: `Erreur base de données : ${fetchError.message}` }, { status: 500 })
    }

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
    }

    const email = user.email
    if (!email) {
      return NextResponse.json({ error: "Cet utilisateur n'a pas d'email" }, { status: 400 })
    }

    // Garantir un compte Supabase Auth avec le mot de passe par défaut
    let authId = user.auth_id

    if (authId) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authId, {
        password: DEFAULT_PASSWORD,
      })
      if (updateError) {
        console.error('[reset-password] Erreur updateUserById:', updateError)
        authId = null
      }
    }

    if (!authId) {
      // Chercher un compte Auth existant par email (auth_id obsolète ou absent)
      const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()
      if (!listError) {
        const existingUser = existingUsers.users.find(u => u.email === email)
        if (existingUser) {
          authId = existingUser.id
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authId, {
            password: DEFAULT_PASSWORD,
          })
          if (updateError) {
            console.error('[reset-password] Erreur updateUserById (par email):', updateError)
          }
        }
      } else {
        console.error('[reset-password] Erreur listUsers:', listError)
      }
    }

    if (!authId) {
      // Aucun compte Auth → le créer avec le mot de passe par défaut
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: {
          prenom: user.prenom,
          nom: user.nom,
          force_pwd_change: true,
        },
      })
      if (authError) {
        console.error('[reset-password] Erreur createUser:', authError)
        return NextResponse.json({ error: `Supabase n'a pas pu réinitialiser le compte : ${authError.message}` }, { status: 500 })
      }
      authId = authData.user.id
    }

    // Relier auth_id si nécessaire + forcer le changement de mot de passe
    const { error: dbError } = await supabaseAdmin
      .from('utilisateurs')
      .update({ auth_id: authId, force_pwd_change: true })
      .eq('id', id)

    if (dbError) {
      console.error('[reset-password] Erreur update utilisateurs:', dbError)
      return NextResponse.json({ error: `Erreur base de données : ${dbError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      email,
      motDePasseTemporaire: DEFAULT_PASSWORD,
      message: `Mot de passe réinitialisé (${DEFAULT_PASSWORD}). L'utilisateur devra le changer à la prochaine connexion.`,
    })
  } catch (error: unknown) {
    console.error('[reset-password] Erreur API:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}
