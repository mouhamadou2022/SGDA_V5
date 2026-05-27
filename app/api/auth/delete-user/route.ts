import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { auth_id } = await request.json()

    if (!auth_id) {
      return NextResponse.json({ error: 'auth_id requis' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Supprimer l'utilisateur de Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(auth_id)

    if (authError) {
      console.error('Erreur suppression auth user:', authError)
      // On continue quand même pour supprimer l'entrée DB
    }

    // Supprimer l'entrée dans la table utilisateurs
    const { error: dbError } = await supabaseAdmin
      .from('utilisateurs')
      .delete()
      .eq('auth_id', auth_id)

    if (dbError) {
      console.error('Erreur suppression utilisateur DB:', dbError)
      return NextResponse.json({ error: 'Erreur base de données' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Utilisateur supprimé avec succès',
    })
  } catch (error: any) {
    console.error('Erreur API delete-user:', error)
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 })
  }
}
