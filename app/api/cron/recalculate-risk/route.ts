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

    // Nettoyer les anciennes entrées en double (même aerodrome_id + computed_at)
    const { data: dupes } = await supabaseAdmin
      .from('score_history')
      .select('id, aerodrome_id, computed_at')
      .order('computed_at', { ascending: false })
    if (dupes && dupes.length > 0) {
      const seen = new Set<string>()
      const toDelete: string[] = []
      for (const d of dupes) {
        const key = `${d.aerodrome_id}_${d.computed_at}`
        if (seen.has(key)) toDelete.push(d.id)
        else seen.add(key)
      }
      if (toDelete.length > 0) {
        await supabaseAdmin.from('score_history').delete().in('id', toDelete)
        console.log(`[recalculate-risk] Nettoyé ${toDelete.length} doublons score_history`)
      }
    }

    // Importer les fonctions de calcul (pures, compatibles serveur)
    const risqueUtils = await import('@/lib/risque')
    const { weightController } = await import('@/lib/ia/weightController')
    // Moteur de score partagé avec le store (convergence store/cron) :
    // C1-C5, ajustements C3, score global et niveau sortent du moteur —
    // la route ne recalcule plus rien localement.
    const { computeProfilScore } = await import('@/lib/risque/profilScoreEngine')
    const { deriverTendance } = await import('@/lib/config')

    // Charger les poids appris C1-C5 depuis ia_thresholds
    let learnedWeights: Record<string, number> | undefined
    const { data: savedWeights } = await supabaseAdmin
      .from('ia_thresholds')
      .select('parametre, valeur')
      .in('parametre', ['weight_c1', 'weight_c2', 'weight_c3', 'weight_c4', 'weight_c5'])
    if (savedWeights && savedWeights.length > 0) {
      weightController.initFromSupabase(savedWeights)
      learnedWeights = weightController.getCurrentWeights()
    }
    const { computeIncidentPrediction, computeEventTrendAnalysis, computeBayesianPosterior } = await import('@/lib/risque')

    // 1. Récupérer tous les aérodromes actifs
    const { data: aerodromes } = await supabaseAdmin.from('aerodromes').select('*')
    if (!aerodromes || aerodromes.length === 0) {
      return NextResponse.json({ message: 'Aucun aérodrome', count: 0 })
    }

    // AMDEC : charger une seule fois pour tous les aérodromes (malus C3 partagé avec le store)
    const { data: amdecRows } = await supabaseAdmin.from('amdec_analyses').select('*')
    const amdecParAerodrome = new Map<string, any[]>()
    for (const a of (amdecRows || [])) {
      const liste = amdecParAerodrome.get(a.aerodrome_id) || []
      liste.push(a)
      amdecParAerodrome.set(a.aerodrome_id, liste)
    }

    // Exemptions : persistées serveur depuis la Phase 3 (même forme que le
    // store : getExemptionsActives — statut active + date_fin_prevue future).
    interface ExemptionRow {
      id: string
      aerodrome_id?: string | null
      statut?: string | null
      date_fin_prevue?: string | null
      domaines_concerne?: string[] | null
      mesures?: { statut?: string; efficacite_validee?: number }[] | null
    }
    const { data: exemptionRows } = await supabaseAdmin.from('exemptions').select('*')
    const nowEx = Date.now()
    const exemptionsParAerodrome = new Map<string, { id: string; domaines_concerne: string[]; mesures: { statut: string; efficacite_validee?: number }[] }[]>()
    for (const e of ((exemptionRows || []) as ExemptionRow[])) {
      if (e.aerodrome_id && e.statut === 'active' && e.date_fin_prevue && new Date(e.date_fin_prevue).getTime() >= nowEx) {
        const liste = exemptionsParAerodrome.get(e.aerodrome_id) || []
        liste.push({
          id: e.id,
          domaines_concerne: e.domaines_concerne || [],
          mesures: (e.mesures || []).map((m) => ({
            statut: m.statut || '',
            efficacite_validee: m.efficacite_validee,
          })),
        })
        exemptionsParAerodrome.set(e.aerodrome_id, liste)
      }
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

        const ecartsTous = (ecarts || [])
        const surveillancesTous = (surveillances || [])
        const evenementsPourPred = (evenements || []).map((e: any) => ({
          gravite: e.gravite || 'moyen',
          date: e.date || e.created_at,
        }))

        // 3. Calcul via le moteur partagé (identique au store).
        // Limite serveur restante : enquêtes C1 (réponses stockées côté
        // client uniquement) → undefined ici comme avant.
        const moteur = computeProfilScore({
          aerodrome,
          ecarts: ecartsTous,
          surveillances: surveillancesTous,
          evenements: evenementsPourPred,
          scoreC1Enquetes: undefined,
          exemptionsActives: exemptionsParAerodrome.get(aerodromeId) || [],
          analysesAmdec: amdecParAerodrome.get(aerodromeId) || [],
          weights: learnedWeights,
          now: Date.now(),
        })
        const { c1, c2, c3, c4, c5 } = moteur
        const scoreGlobal = moteur.scoreGlobal
        const niveau = moteur.niveau

        // 4. Prédictions et tendances
        const incidentPred = computeIncidentPrediction(evenementsPourPred || [])
        const eventTrend = computeEventTrendAnalysis(evenementsPourPred || [])

        // Charger l'historique des scores pour les prédictions
        const { data: scoreHistory } = await supabaseAdmin
          .from('score_history')
          .select('score_global, computed_at')
          .eq('aerodrome_id', aerodromeId)
          .order('computed_at', { ascending: true })
        const historiqueScores = (scoreHistory || []).map((s: any) => ({
          date: s.computed_at,
          score: s.score_global,
        }))
        const dernierScoreHistorique = historiqueScores.length > 0 ? historiqueScores[historiqueScores.length - 1].score : null
        const predictions =
          historiqueScores.length >= 2
            ? risqueUtils.predictWithEnsemble(historiqueScores)
            : { score3m: scoreGlobal, score6m: scoreGlobal, confidence: 30 }

        // Tendance : règle unique partagée avec le store (vs dernier score).
        // Convention repo : 'hausse' = score qui monte = amélioration.
        const tendance = deriverTendance(scoreGlobal, dernierScoreHistorique)

        // 5. Construire le profil
        const now = new Date().toISOString()
        const profil = {
          aerodrome_id: aerodromeId,
          score_global: scoreGlobal,
          niveau,
          c1, c2, c3, c4, c5,
          prediction_3m: Number.isFinite(predictions.score3m) ? predictions.score3m : scoreGlobal,
          prediction_6m: Number.isFinite(predictions.score6m) ? predictions.score6m : scoreGlobal,
          tendance,
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

        // 7. Alimenter score_history pour l'apprentissage (dédup : on ne pollue
        //    pas l'historique si le score n'a pas changé depuis le dernier point)
        let shStatus = ''
        if (dernierScoreHistorique === null || scoreGlobal !== dernierScoreHistorique) {
          const shPayload: Record<string, unknown> = {
            aerodrome_id: aerodromeId,
            score_global: scoreGlobal,
            computed_at: now,
          }
          if (c1 !== undefined) shPayload.c1 = c1
          if (c2 !== undefined) shPayload.c2 = c2
          if (c3 !== undefined) shPayload.c3 = c3
          if (c4 !== undefined) shPayload.c4 = c4
          if (c5 !== undefined) shPayload.c5 = c5
          shPayload.niveau = profil.niveau
          const { error: shError } = await supabaseAdmin
            .from('score_history')
            .insert(shPayload)
          if (shError) {
            shStatus = ` score_history: ${shError.message}`
            console.warn(`[recalculate-risk] score_history insert failed for ${aerodromeId}: ${shError.message}`)
          }
        }

        results.push({
          id: aerodromeId,
          code_oaci: aerodrome.code_oaci || '',
          score: scoreGlobal,
          status: upsertError ? `Erreur: ${upsertError.message}` : `OK${shStatus}`,
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
