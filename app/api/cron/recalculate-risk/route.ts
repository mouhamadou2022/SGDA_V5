// app/api/cron/recalculate-risk/route.ts
// Cron endpoint pour recalculer périodiquement tous les profils de risque.
// Appelable via cron-job.org, UptimeRobot, ou tout service externe.
// Protection par CRON_SECRET dans .env.local

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  try {
    // Vérification du secret
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

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // Importer les fonctions de calcul (pures, compatibles serveur)
    const risqueUtils = await import('@/lib/risque')
    const { computeIncidentPrediction, computeEventTrendAnalysis, computeBayesianPosterior } = await import('@/lib/risque')

    // 1. Récupérer tous les aérodromes actifs
    const { data: aerodromes } = await supabaseAdmin.from('aerodromes').select('*')
    if (!aerodromes || aerodromes.length === 0) {
      return NextResponse.json({ message: 'Aucun aérodrome', count: 0 })
    }

    const results: Array<{ id: string; code_oaci: string; score: number; status: string }> = []

    for (const aerodrome of aerodromes) {
      const aerodromeId = aerodrome.id
      try {
        // 2. Récupérer les données liées
        const { data: ecarts } = await supabaseAdmin
          .from('ecarts').select('*').eq('aerodrome_id', aerodromeId)
        const { data: surveillances } = await supabaseAdmin
          .from('surveillances').select('*').eq('aerodrome_id', aerodromeId)
        const { data: evenements } = await supabaseAdmin
          .from('evenements_securite').select('*').eq('aerodrome_id', aerodromeId)

        const ecartsAerodrome = (ecarts || []).filter((e: any) => e.statut !== 'cloture')
        const surveillancesAerodrome = (surveillances || []).filter((s: any) => s.score_global != null && s.statut === 'checklist_signee')
        const evenementsAerodrome = (evenements || []).map((e: any) => ({
          gravite: e.gravite || 'moyen',
          date: e.date || e.created_at,
        }))

        // 3. Calculer C1-C5
        const maturiteSGS = aerodrome.statut_sgs === 'non_applicable' ? 100 : (aerodrome.maturite_sgs ?? 50)
        const c1 = risqueUtils.calculateC1(maturiteSGS, undefined, aerodrome.statut_sgs)
        const c2 = risqueUtils.calculateC2FromEcarts(ecartsAerodrome || [])
        const c3 = surveillancesAerodrome.length > 0
          ? risqueUtils.calculateC3(surveillancesAerodrome.map((s: any) => ({
              score: s.score_global,
              date: s.date_debut,
            })))
          : 70
        const c4 = risqueUtils.calculateC4FromEcarts(ecartsAerodrome || [])
        const c5 = risqueUtils.calculateC5(evenementsAerodrome || [])
        const scoreGlobal = risqueUtils.calculateGlobalScore({ c1, c2, c3, c4, c5 })

        // 4. Prédictions et tendances
        const incidentPred = computeIncidentPrediction(evenementsAerodrome || [])
        const eventTrend = computeEventTrendAnalysis(evenementsAerodrome || [])

        // 5. Construire le profil
        const now = new Date().toISOString()
        const profil = {
          aerodrome_id: aerodromeId,
          score_global: scoreGlobal,
          niveau: scoreGlobal >= 80 ? 'faible' : scoreGlobal >= 60 ? 'moyen' : scoreGlobal >= 30 ? 'eleve' : 'critique',
          c1, c2, c3, c4, c5,
          prediction_3m: scoreGlobal,
          prediction_6m: scoreGlobal,
          tendance: 'stable',
          computed_at: now,
          incident_prediction_3m: incidentPred.probability3m,
          incident_prediction_6m: incidentPred.probability6m,
          incident_prediction_12m: incidentPred.probability12m,
          event_frequency: incidentPred.expectedEventsPerMonth,
          event_severity_trend: incidentPred.severityTrend,
          days_since_last_event: incidentPred.daysSinceLastIncident,
          event_trend_acceleration: eventTrend.recentAcceleration,
        }

        // 6. Upsert dans la table profils_risque
        const { error: upsertError } = await supabaseAdmin
          .from('profils_risque')
          .upsert(profil, { onConflict: 'aerodrome_id' })

        // 7. Alimenter score_history pour l'apprentissage
        if (!upsertError) {
          const { error: shError } = await supabaseAdmin
            .from('score_history')
            .insert({
              aerodrome_id: aerodromeId,
              score_global: scoreGlobal,
              c1, c2, c3, c4, c5,
              niveau: profil.niveau,
              tendance: 'stable',
              computed_at: now,
            })
          if (shError) {
            console.warn(`[recalculate-risk] score_history insert failed for ${aerodromeId}: ${shError.message}`)
          }
        }

        results.push({
          id: aerodromeId,
          code_oaci: aerodrome.code_oaci || '',
          score: scoreGlobal,
          status: upsertError ? `Erreur: ${upsertError.message}` : 'OK',
        })
      } catch (aeroError) {
        results.push({
          id: aerodromeId,
          code_oaci: aerodrome.code_oaci || '',
          score: -1,
          status: `Erreur: ${(aeroError as Error).message}`,
        })
      }
    }

    return NextResponse.json({
      message: 'Recalcul terminé',
      count: results.length,
      errors: results.filter(r => r.status !== 'OK').length,
      results,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
