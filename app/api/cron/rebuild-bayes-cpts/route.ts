import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const urlSecret = new URL(request.url).searchParams.get('secret')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}` && urlSecret !== cronSecret) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const { generateDomaineBowTie } = await import('@/lib/risque/bowTieEngine')
    const { construireReseauDepuisBowTie, incrementAndRecalibrate, recomputeCPTFromObservations } = await import('@/lib/risque/bayesianNetwork')
    const { calculateC1, calculateC2FromEcarts, calculateC3, calculateC4FromEcarts, calculateC5 } = await import('@/lib/risque')

    const { data: aerodromes } = await supabase.from('aerodromes').select('*')
    if (!aerodromes || aerodromes.length === 0) {
      return NextResponse.json({ message: 'Aucun aérodrome', count: 0 })
    }

    const domaines = ['SGS', 'PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']
    let totalSaved = 0
    let totalErrors = 0

    for (const aerodrome of aerodromes) {
      const aerodromeId = aerodrome.id
      const maturiteSGS = aerodrome.statut_sgs === 'non_applicable' ? 100 : (aerodrome.maturite_sgs ?? 50)
      const c1 = calculateC1(maturiteSGS, undefined, aerodrome.statut_sgs)

      const { data: ecarts } = await supabase.from('ecarts').select('*').eq('aerodrome_id', aerodromeId)
      const { data: surveillances } = await supabase.from('surveillances').select('*').eq('aerodrome_id', aerodromeId)
      const { data: evenements } = await supabase.from('evenements_securite').select('*').eq('aerodrome_id', aerodromeId)
      const { data: feedbacks } = await supabase.from('ia_feedback').select('*').eq('aerodrome_id', aerodromeId)
      const { data: decisions } = await supabase.from('ia_decisions').select('*').eq('aerodrome_id', aerodromeId)

      const ecartsList = (ecarts || []).filter((e: any) => e.statut !== 'cloture')
      const surveillancesList = (surveillances || []).filter((s: any) => s.score_global != null && s.statut === 'checklist_signee')
      const evenementsList = (evenements || []).map((e: any) => ({ gravite: e.gravite || 'moyen', date: e.date || e.created_at }))
      const c2 = calculateC2FromEcarts(ecartsList)
      const c3 = surveillancesList.length > 0 ? calculateC3(surveillancesList.map((s: any) => ({ score: s.score_global, date: s.date_debut }))) : 70
      const c4 = calculateC4FromEcarts(ecartsList)
      const c5 = calculateC5(evenementsList)

      for (const domaine of domaines) {
        try {
          const ecartsDom = (ecarts || []).filter((e: any) =>
            (e.domaine || '').toUpperCase() === domaine || (!e.domaine && domaine === 'SGS')
          )
          const surveillancesDom = (surveillances || []).filter((s: any) =>
            (s.type || '').toUpperCase().includes(domaine)
          )

          const bt = generateDomaineBowTie({
            c1, c2, c3, c5, scoreGlobal: Math.round((c1 + c2 + c3 + c4 + c5) / 5),
            ecartsDom, surveillancesDom, evenementsDom: evenements || [],
            domaine, lastAssessed: new Date().toISOString(),
            statut_sgs: aerodrome.statut_sgs,
          })

          let reseau = construireReseauDepuisBowTie(bt)
          let nbObs = 0

          // Inférer observations depuis les écarts
          for (const ecart of ecartsDom) {
            const niveau = (ecart.niveau_risque || 'moyen') as string
            const niveauScore = niveau === 'critique' ? 2 : niveau === 'eleve' ? 2 : niveau === 'moyen' ? 1 : 0
            for (const node of reseau) {
              if (node.type === 'barriere') {
                const parentKey = ''
                const observedState = niveauScore >= 2 ? 2 : niveauScore === 1 ? 1 : 0
                reseau = reseau.map(n => n.id === node.id ? incrementAndRecalibrate(n, parentKey, observedState) : n)
                nbObs++
              }
            }
          }

          // Inférer depuis les décisions évaluées
          const evaluated = (decisions || []).filter((d: any) => d.effectiveness)
          for (const dec of evaluated) {
            const effMap: Record<string, number> = { 'efficace': 0, 'partiellement_efficace': 1, 'inefficace': 2 }
            const state = effMap[dec.effectiveness as string] ?? 1
            const orgNodeIds = [
              `charge_travail_bt-${domaine}`,
              `formation_adequation_bt-${domaine}`,
              `supervision_quality_bt-${domaine}`,
            ]
            for (const nid of orgNodeIds) {
              const idx = reseau.findIndex(n => n.id === nid)
              if (idx >= 0) {
                reseau[idx] = incrementAndRecalibrate(reseau[idx], '', state)
                nbObs++
              }
            }
          }

          // Recalculer toutes les CPT
          reseau = reseau.map(n => recomputeCPTFromObservations(n))

          const { error } = await supabase
            .from('ia_bayes_network_state')
            .upsert({
              aerodrome_id: aerodromeId,
              bow_tie_domaine: domaine,
              noeuds: reseau,
              nb_observations_total: nbObs,
              derniere_maj: new Date().toISOString(),
            }, { onConflict: 'aerodrome_id,bow_tie_domaine' })

          if (error) throw error
          totalSaved++
        } catch (domError) {
          console.error(`[rebuild-bayes-cpts] Erreur ${aerodrome.code_oaci}/${domaine}:`, domError)
          totalErrors++
        }
      }
    }

    return NextResponse.json({
      message: 'Rebuild terminé',
      aerodromes: aerodromes.length,
      domaines: domaines.length,
      saved: totalSaved,
      errors: totalErrors,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
