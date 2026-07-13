import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const aerodromeId = searchParams.get('aerodrome_id')
    const domaine = searchParams.get('domaine')

    const supabase = getAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    let query = supabase.from('ia_bayes_network_state').select('*')
    if (aerodromeId) query = query.eq('aerodrome_id', aerodromeId)
    if (domaine) query = query.eq('bow_tie_domaine', domaine)

    const { data, error } = await query.order('derniere_maj', { ascending: false })
    if (error) throw error

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[bayes-cpts GET]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { aerodrome_id, bow_tie_domaine, noeuds } = body
    if (!aerodrome_id || !bow_tie_domaine || !noeuds) {
      return NextResponse.json({ error: 'aerodrome_id, bow_tie_domaine, noeuds requis' }, { status: 400 })
    }

    const supabase = getAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }

    const nbObs = (noeuds as any[]).reduce((sum: number, n: any) => {
      const cpt = n.cpt || {}
      const obs = cpt.observations || {}
      return sum + Object.values(obs).reduce((s: number, v: any) => s + (v as number[]).reduce((a: number, b: number) => a + b, 0), 0)
    }, 0)

    const { data, error } = await supabase
      .from('ia_bayes_network_state')
      .upsert({
        aerodrome_id,
        bow_tie_domaine,
        noeuds,
        nb_observations_total: nbObs,
        derniere_maj: new Date().toISOString(),
      }, { onConflict: 'aerodrome_id,bow_tie_domaine' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[bayes-cpts POST]', err)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
