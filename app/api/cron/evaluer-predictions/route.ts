// app/api/cron/evaluer-predictions/route.ts
// Boucle d'apprentissage en arrière-plan sur les PRÉDICTIONS du profil de risque.
// Fréquence recommandée : hebdomadaire (voir PLAN_APPRENTISSAGE dans
// lib/ia/predictionLearning.ts). Appelable via cron-job.org, UptimeRobot, etc.
// Protection par CRON_SECRET (même convention que recalculate-risk).
//
// Ce que fait ce cron : pour chaque prédiction 3m/6m dont l'horizon est
// atteint, compare au score réel (score_history) et publie la précision
// (MAE, biais) dans ia_thresholds (pred_mae_3m, pred_biais_3m, …).
// Il MESURE uniquement : aucune correction n'est appliquée aux prédictions
// (décision reportée après la démo DG).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifierPredictions, agregerMetriques } from '@/lib/ia/predictionLearning'

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

    const maintenant = Date.now()

    // Prédictions DÉJÀ vérifiées (historique cumulé pour les métriques).
    const { data: dejaVerifiees, error: errPred } = await supabaseAdmin
      .from('prediction_suivi')
      .select('id, aerodrome_id, predicted_at, pred_3m, pred_6m, verifie_3m, verifie_6m')
      .or('verifie_3m.eq.true,verifie_6m.eq.false')
      .order('predicted_at', { ascending: false })
      .limit(500)
    if (errPred) {
      // Table pas encore créée côté prod → message clair, pas d'échec obscur.
      return NextResponse.json({
        error: `Lecture prediction_suivi impossible : ${errPred.message} (appliquez SGDA_v5_FINAL_COMPLET.sql §24.H)`,
      }, { status: 500 })
    }
    // + prédictions non vérifiées (dont les horizons ont pu mûrir).
    const { data: aVerifier } = await supabaseAdmin
      .from('prediction_suivi')
      .select('id, aerodrome_id, predicted_at, pred_3m, pred_6m, verifie_3m, verifie_6m')
      .or('verifie_3m.eq.false,verifie_6m.eq.false')
      .order('predicted_at', { ascending: true })
      .limit(500)

    const parAero = new Map<string, Array<{
      id: string; aerodrome_id: string; predicted_at: string
      pred_3m: number; pred_6m: number; verifie_3m?: boolean; verifie_6m?: boolean
    }>>()
    for (const p of [...(dejaVerifiees || []), ...(aVerifier || [])]) {
      const normalise = {
        id: p.id, aerodrome_id: p.aerodrome_id, predicted_at: p.predicted_at,
        pred_3m: Number(p.pred_3m), pred_6m: Number(p.pred_6m),
        verifie_3m: p.verifie_3m, verifie_6m: p.verifie_6m,
      }
      const liste = parAero.get(p.aerodrome_id) || []
      if (!liste.some(x => x.id === p.id)) liste.push(normalise)
      parAero.set(p.aerodrome_id, liste)
    }

    let verificationsNouvelles = 0
    const toutesVerifs: Array<{ id: string; horizon: '3m' | '6m'; predit: number; reel: number; erreur: number }> = []
    for (const [aerodromeId, preds] of parAero) {
      const { data: historique } = await supabaseAdmin
        .from('score_history')
        .select('score_global, computed_at')
        .eq('aerodrome_id', aerodromeId)
        .order('computed_at', { ascending: true })
        .limit(500)
      const points = (historique || []).map((s: { score_global: number; computed_at: string }) => ({
        date: s.computed_at,
        score: s.score_global,
      }))
      const vs = verifierPredictions(preds, points, maintenant)
      for (const v of vs) {
        const dejaConnu = preds.find(p => p.id === v.id)
        const dejaMarque = v.horizon === '3m' ? dejaConnu?.verifie_3m : dejaConnu?.verifie_6m
        if (!dejaMarque) {
          const champ = v.horizon === '3m' ? 'verifie_3m' : 'verifie_6m'
          await supabaseAdmin.from('prediction_suivi').update({ [champ]: true }).eq('id', v.id)
          verificationsNouvelles++
        }
      }
      // Métriques sur TOUT l'historique vérifiable (drapeaux retirés pour
      // recalculer aussi les horizons déjà marqués les semaines précédentes).
      const vsToutes = verifierPredictions(
        preds.map(p => ({ ...p, verifie_3m: false, verifie_6m: false })),
        points,
        maintenant,
      )
      toutesVerifs.push(...vsToutes)
    }

    const metriques = agregerMetriques(toutesVerifs)
    const publiees: string[] = []
    for (const m of metriques) {
      if (m.n === 0) continue
      const base = m.horizon === '3m' ? 'pred_3m' : 'pred_6m'
      await supabaseAdmin.from('ia_thresholds').upsert(
        { parametre: `${base}_n`, valeur: m.n, engine: 'prediction', raison: `Échantillon vérifié au ${new Date(maintenant).toISOString().slice(0, 10)}`, actif: true },
        { onConflict: 'parametre' },
      )
      await supabaseAdmin.from('ia_thresholds').upsert(
        { parametre: `${base}_mae`, valeur: m.mae, engine: 'prediction', raison: `Erreur absolue moyenne sur ${m.n} prédictions vérifiées`, actif: true },
        { onConflict: 'parametre' },
      )
      await supabaseAdmin.from('ia_thresholds').upsert(
        { parametre: `${base}_biais`, valeur: m.biais, engine: 'prediction', raison: m.biais > 0 ? 'Modèle pessimiste (sous-estime le score)' : m.biais < 0 ? 'Modèle optimiste (surestime le score)' : 'Sans biais notable', actif: true },
        { onConflict: 'parametre' },
      )
      publiees.push(`${m.horizon}: n=${m.n} MAE=${m.mae} biais=${m.biais}`)
    }

    return NextResponse.json({
      message: 'Évaluation des prédictions terminée',
      verifications_nouvelles: verificationsNouvelles,
      metriques: publiees,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
