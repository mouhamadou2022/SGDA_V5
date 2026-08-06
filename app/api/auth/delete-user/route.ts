import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { auth_id, id } = await request.json()

    if (!auth_id && !id) {
      return NextResponse.json({ error: 'auth_id ou id requis' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Résoudre l'id utilisateur (priorité à l'id passé, sinon via auth_id)
    let userId = id
    if (!userId && auth_id) {
      const { data: byAuth } = await supabaseAdmin
        .from('utilisateurs')
        .select('id')
        .eq('auth_id', auth_id)
        .maybeSingle()
      userId = byAuth?.id
    }

    // Supprimer les références FK avant de supprimer l'utilisateur,
    // sinon le DELETE échoue (ex: dossiers_inspecteur_id_fkey créée via l'UI).
    if (userId) {
      const refs: Array<[string, string]> = [
        ['dossiers', 'inspecteur_id'],
        ['dossiers', 'created_by'],
        ['evenements_securite', 'inspecteur_id'],
        ['competences', 'inspecteur_id'],
      ]
      for (const [table, col] of refs) {
        try {
          await supabaseAdmin.from(table as never).update({ [col]: null } as never).eq(col as never, userId)
        } catch (e) {
          console.error(`[delete-user] Nettoyage ${table}.${col}:`, e)
        }
      }
    }

    // Supprimer l'entrée dans la table utilisateurs
    let dbError: { message?: string } | null = null
    if (userId) {
      const { error } = await supabaseAdmin.from('utilisateurs').delete().eq('id', userId)
      dbError = error
    } else if (auth_id) {
      const { error } = await supabaseAdmin.from('utilisateurs').delete().eq('auth_id', auth_id)
      dbError = error
    }

    if (dbError) {
      console.error('Erreur suppression utilisateur DB:', dbError)
      return NextResponse.json({ error: `Erreur base de données : ${dbError.message || dbError}` }, { status: 500 })
    }

    // Supprimer l'utilisateur de Supabase Auth (en dernier, idempotent)
    if (auth_id) {
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(auth_id)
      if (authError) {
        console.error('Erreur suppression auth user:', authError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Utilisateur supprimé avec succès',
    })
  } catch (error: unknown) {
    console.error('Erreur API delete-user:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Erreur serveur' }, { status: 500 })
  }
}
