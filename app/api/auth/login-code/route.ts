import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const { code } = await request.json()
    if (!code) {
      return NextResponse.json({ error: 'Code requis' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // 1. Chercher le code d'accès (service role bypasses RLS)
    const { data: codeData, error: codeError } = await supabaseAdmin
      .from('codes_acces')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('statut', 'actif')
      .single()

    if (codeError || !codeData) {
      return NextResponse.json({ error: "Code d'accès invalide ou expiré" }, { status: 401 })
    }
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Code d'accès expiré" }, { status: 401 })
    }

    // 2. Déterminer le rôle depuis le type de code
    let codeType = codeData.code_type
    if (!codeType) {
      const parts = code.toUpperCase().split('-')
      if (parts.length >= 2) codeType = parts[1]
    }
    const roleMap: Record<string, string> = { DG: 'dg_operator', FP: 'focal_operator', ST: 'staff_operator' }
    const expectedRole = roleMap[codeType || ''] || 'focal_operator'

    // 3. Chercher l'utilisateur correspondant (service role bypasses RLS)
    let { data: utilisateur } = await supabaseAdmin
      .from('utilisateurs')
      .select('*')
      .eq('aerodrome_id', codeData.aerodrome_id)
      .eq('role', expectedRole)
      .eq('statut', 'actif')
      .single()

    // 3b. Créer l'utilisateur s'il n'existe pas
    if (!utilisateur) {
      const nameMap: Record<string, { prenom: string; nom: string }> = {
        dg_operator:     { prenom: codeData.dg_prenom || 'DG',      nom: codeData.dg_nom || 'Exploitant' },
        focal_operator:  { prenom: codeData.focal_prenom || 'Focal',  nom: codeData.focal_nom || 'Exploitant' },
        staff_operator:  { prenom: codeData.staff_prenom || 'Staff',  nom: codeData.staff_nom || 'Exploitant' },
      }
      const names = nameMap[expectedRole] || { prenom: 'Exploitant', nom: 'Exploitant' }
      const identifiant = `${expectedRole}_${codeData.aerodrome_id}`.toLowerCase()

      const { data: newUser, error: createError } = await supabaseAdmin
        .from('utilisateurs')
        .insert({
          id: crypto.randomUUID(),
          aerodrome_id: codeData.aerodrome_id,
          email: codeData.email || `${identifiant}@${process.env.NEXT_PUBLIC_EMAIL_DOMAIN || 'anacim.sn'}`,
          identifiant,
          nom: names.nom,
          prenom: names.prenom,
          role: expectedRole,
          statut: 'actif',
          notifications_email: false,
          notifications_sms: false,
          force_pwd_change: false,
        })
        .select()
        .single()

      if (createError || !newUser) {
        return NextResponse.json({
          error: `Impossible de créer l'utilisateur ${expectedRole} : ${createError?.message || 'erreur inconnue'}`
        }, { status: 500 })
      }
      utilisateur = newUser
    }

    // 4. Incrémenter le compteur de connexions
    await supabaseAdmin
      .from('codes_acces')
      .update({
        last_login: new Date().toISOString(),
        nb_connexions: (codeData.nb_connexions ?? 0) + 1,
      })
      .eq('id', codeData.id)

    return NextResponse.json({
      user: {
        id: utilisateur.id,
        email: utilisateur.email ?? '',
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        role: expectedRole,
        aerodrome_id: utilisateur.aerodrome_id,
        last_login: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[login-code] Erreur:', error)
    return NextResponse.json({ error: error.message || 'Erreur serveur' }, { status: 500 })
  }
}
