// app/api/cron/evaluate-decisions/route.ts
// Évalue les décisions 6 mois après + recalibrage des poids C1-C5
// Boucle d'apprentissage complète : décision → outcome → recalibrage
// Protection par CRON_SECRET

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runLearningCycle } from '@/lib/ia/evaluateOutcomes'
import { weightController } from '@/lib/ia/weightController'
import type { EffectivenessRating } from '@/lib/ia/types'

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

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    })

    // 1. Évaluer les décisions non évaluées de >= 6 mois
    const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString()
    const { data: decisions } = await supabaseAdmin
      .from('ia_decisions')
      .select('id, aerodrome_id, date_decision')
      .is('evaluated_at', null)
      .lt('date_decision', sixMonthsAgo)
      .in('status', ['applied', 'pending'])
      .order('date_decision', { ascending: true })

    const evaluationResults: Array<{ id: string; delta: number | null; effectiveness: string }> = []

    if (decisions && decisions.length > 0) {
      for (const dec of decisions) {
        try {
          const { data: profilBefore } = await supabaseAdmin
            .from('profils_risque')
            .select('score_global, computed_at, c1, c2, c3, c4, c5')
            .eq('aerodrome_id', dec.aerodrome_id)
            .lte('computed_at', dec.date_decision)
            .order('computed_at', { ascending: false })
            .limit(1)

          const decDate = new Date(dec.date_decision)
          const after5m = new Date(decDate.getTime() + 150 * 86400000).toISOString()
          const after8m = new Date(decDate.getTime() + 240 * 86400000).toISOString()
          const { data: profilAfter } = await supabaseAdmin
            .from('profils_risque')
            .select('score_global, tendance, computed_at')
            .eq('aerodrome_id', dec.aerodrome_id)
            .gte('computed_at', after5m)
            .lte('computed_at', after8m)
            .order('computed_at', { ascending: true })
            .limit(1)

          const after3m = new Date(decDate.getTime() + 90 * 86400000).toISOString()
          const after4m = new Date(decDate.getTime() + 120 * 86400000).toISOString()
          const { data: profilAfter3m } = await supabaseAdmin
            .from('profils_risque')
            .select('score_global')
            .eq('aerodrome_id', dec.aerodrome_id)
            .gte('computed_at', after3m)
            .lte('computed_at', after4m)
            .order('computed_at', { ascending: true })
            .limit(1)

          let scoreBefore = profilBefore?.[0]?.score_global ?? null
          let scoreAfter6m = profilAfter?.[0]?.score_global ?? null
          const scoreAfter3m = profilAfter3m?.[0]?.score_global ?? null
          let tendanceAfter = profilAfter?.[0]?.tendance ?? null

          if (scoreBefore !== null && scoreAfter6m === null) {
            const { data: latestProfil } = await supabaseAdmin
              .from('profils_risque')
              .select('score_global, tendance')
              .eq('aerodrome_id', dec.aerodrome_id)
              .order('computed_at', { ascending: false })
              .limit(1)
            if (latestProfil?.[0]) {
              scoreAfter6m = latestProfil[0].score_global
              tendanceAfter = latestProfil[0].tendance ?? 'stable'
            }
          }

          let delta: number | null = null
          let effectiveness = 'non_evalue'

          if (scoreBefore !== null && scoreAfter6m !== null) {
            delta = Math.round((scoreAfter6m - scoreBefore) * 10) / 10
            if (delta > 5) effectiveness = 'efficace'
            else if (delta >= -5) effectiveness = 'partiel'
            else effectiveness = 'inefficace'
          }

          await supabaseAdmin.from('ia_decisions').update({
            score_before: scoreBefore,
            score_after_3m: scoreAfter3m,
            score_after_6m: scoreAfter6m,
            score_delta_6m: delta,
            score_tendance_at_outcome: tendanceAfter ?? 'stable',
            effectiveness,
            evaluated_at: new Date().toISOString(),
            auto_evaluated: true,
          }).eq('id', dec.id)

          evaluationResults.push({ id: dec.id, delta, effectiveness })
        } catch (decError) {
          evaluationResults.push({ id: dec.id, delta: null, effectiveness: `Erreur: ${(decError as Error).message}` })
        }
      }
    }

    // 2. Recalibrage des poids C1-C5
    const { data: allDecisions } = await supabaseAdmin
      .from('ia_decisions')
      .select('id, aerodrome_id, score_before, score_after_6m, score_delta_6m, effectiveness, evaluated_at, auto_evaluated')
      .not('effectiveness', 'eq', 'non_evalue')
      .not('effectiveness', 'is', null)

    let weightAdjustments: Array<{ dim: string; delta: number; raison: string; appliedAt: string }> = []
    let poidsAvant = weightController.getCurrentWeights()
    if (allDecisions && allDecisions.length >= 5) {
      const outcomes = allDecisions.map(d => ({
        decision_id: d.id,
        aerodrome_id: d.aerodrome_id,
        score_before: d.score_before,
        score_after_6m: d.score_after_6m,
        delta: d.score_delta_6m,
        effectiveness: d.effectiveness as EffectivenessRating,
        evaluated_at: d.evaluated_at,
        auto_evaluated: d.auto_evaluated,
      }))

      // Restaurer les poids précédemment persistés pour un apprentissage cumulatif
      const { data: savedWeights } = await supabaseAdmin
        .from('ia_thresholds')
        .select('parametre, valeur')
        .in('parametre', ['weight_c1', 'weight_c2', 'weight_c3', 'weight_c4', 'weight_c5'])
      if (savedWeights && savedWeights.length > 0) {
        weightController.initFromSupabase(savedWeights)
      }

      // Récupérer les dimensions actuelles par aérodrome (résolution granulaire)
      const aerodromeIds = [...new Set(outcomes.map(o => o.aerodrome_id))]
      const { data: currentProfils } = await supabaseAdmin
        .from('profils_risque')
        .select('aerodrome_id, c1, c2, c3, c4, c5')
        .in('aerodrome_id', aerodromeIds)

      const dimensionsByAerodrome = new Map<string, Record<string, number>>()
      if (currentProfils && currentProfils.length > 0) {
        for (const p of currentProfils) {
          dimensionsByAerodrome.set(p.aerodrome_id, {
            c1: p.c1 ?? 50,
            c2: p.c2 ?? 50,
            c3: p.c3 ?? 50,
            c4: p.c4 ?? 50,
            c5: p.c5 ?? 50,
          })
        }
      }

      const cycleResult = runLearningCycle(outcomes, dimensionsByAerodrome)
      weightAdjustments = cycleResult.weightAdjustments

      // Persister les nouveaux poids dans ia_thresholds
      const currentWeights = weightController.getCurrentWeights()
      for (const [dim, weight] of Object.entries(currentWeights)) {
        await supabaseAdmin.from('ia_thresholds').upsert({
          parametre: `weight_${dim}`,
          valeur: weight,
          engine: 'recommendation',
          raison: `Recalibré automatiquement par le cycle d'apprentissage`,
          actif: true,
        }, { onConflict: 'parametre' })
      }
    }

    const efficaces = evaluationResults.filter(r => r.effectiveness === 'efficace').length
    const inefficaces = evaluationResults.filter(r => r.effectiveness === 'inefficace').length
    const partiels = evaluationResults.filter(r => r.effectiveness === 'partiel').length

    return NextResponse.json({
      message: 'Cycle d\'apprentissage terminé',
      evaluations: {
        count: evaluationResults.length,
        efficaces, partiels, inefficaces,
        results: evaluationResults,
      },
      recalibrage: {
        poidsPrecedents: { ...poidsAvant },
        poidsActuels: weightController.getCurrentWeights(),
        ajustements: weightAdjustments,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
