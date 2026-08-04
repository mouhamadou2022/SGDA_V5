// app/api/cron/aerorisq-train-langage-clair/route.ts
// Entraînement quotidien d'AERORISQ sur le « langage clair ».
// 1. Agrége les échanges enregistrés depuis le dernier run
// 2. Calcule le taux de fallback et la satisfaction (votes 👍/👎) par module
// 3. Alimente le dataset d'entraînement (exemples validés) pour l'IA maison
// 4. Persiste les métriques dans ia_thresholds + journal dans ia_training_logs
// Protection par CRON_SECRET (même schéma que evaluate-decisions).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

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

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    // ── 1. Fenêtre depuis le dernier run (défaut : dernières 24h) ──
    let since: string | null = null
    const { data: lastLog } = await supabaseAdmin
      .from('ia_training_logs')
      .select('run_at')
      .eq('type', 'langage_clair')
      .order('run_at', { ascending: false })
      .limit(1)
    if (lastLog && lastLog.length > 0 && lastLog[0].run_at) {
      since = lastLog[0].run_at
    }
    const sinceIso = since ?? new Date(Date.now() - 24 * 86400000).toISOString()

    let query = supabaseAdmin
      .from('ia_langage_clair')
      .select('module, texte_hash, aerodrome_id, contexte, texte, fallback_ia, vote, created_at')
      .gte('created_at', sinceIso)
    const { data: echantillons, error: fetchError } = await query.order('created_at', { ascending: false }).limit(2000)

    if (fetchError) {
      return NextResponse.json({ error: `ia_langage_clair: ${fetchError.message}` }, { status: 500 })
    }

    const rows = echantillons ?? []
    const total = rows.length

    // ── 2. Métriques par module ──
    const parModule = new Map<string, { total: number; fallback: number; up: number; down: number }>()
    let fallbackTotal = 0
    let upTotal = 0
    let downTotal = 0
    for (const r of rows) {
      const m = parModule.get(r.module) ?? { total: 0, fallback: 0, up: 0, down: 0 }
      m.total += 1
      if (r.fallback_ia) { m.fallback += 1; fallbackTotal += 1 }
      if (r.vote === 'up') { m.up += 1; upTotal += 1 }
      if (r.vote === 'down') { m.down += 1; downTotal += 1 }
      parModule.set(r.module, m)
    }

    const modules = [...parModule.entries()].map(([module, m]) => ({
      module,
      total: m.total,
      fallbackRate: m.total > 0 ? Math.round((m.fallback / m.total) * 1000) / 10 : 0,
      up: m.up,
      down: m.down,
    }))

    const fallbackRate = total > 0 ? Math.round((fallbackTotal / total) * 1000) / 10 : 0
    const votesTotal = upTotal + downTotal
    const upRate = votesTotal > 0 ? Math.round((upTotal / votesTotal) * 1000) / 10 : null

    // ── 3. Dataset d'entraînement (exemples validés 👍 ou fiables non-fallback) ──
    const meilleurs = rows.filter((r) => r.vote === 'up' || (!r.fallback_ia && !r.vote)).slice(0, 500)
    let datasetAjoutes = 0
    for (const r of meilleurs) {
      const texteHash = r.texte_hash ?? hash(`${r.module}::${r.texte}`)
      const { error } = await supabaseAdmin.from('ia_training_dataset').upsert({
        module: r.module,
        texte_hash: texteHash,
        contexte: r.contexte ?? {},
        texte: r.texte,
        fallback_ia: r.fallback_ia ?? false,
        vote: r.vote ?? null,
      }, { onConflict: 'module, texte_hash' })
      if (!error) datasetAjoutes += 1
    }

    // ── 4. Persistance des métriques (ia_thresholds) + journal ──
    const seuils: Record<string, string | number> = {
      langage_clair_total: total,
      langage_clair_fallback_rate: fallbackRate,
      langage_clair_up_rate: upRate ?? 0,
      langage_clair_votes: votesTotal,
      langage_clair_training_rows: datasetAjoutes,
    }
    const savedThresholds: string[] = []
    for (const [parametre, valeur] of Object.entries(seuils)) {
      const { error } = await supabaseAdmin.from('ia_thresholds').upsert({
        parametre,
        valeur,
        engine: 'aerorisq',
        raison: `Entraînement quotidien du langage clair (${new Date().toISOString()})`,
        actif: true,
      }, { onConflict: 'parametre' })
      if (!error) savedThresholds.push(parametre)
    }

    const resume = {
      windowSince: sinceIso,
      total,
      fallbackRate,
      upRate,
      votes: { up: upTotal, down: downTotal },
      datasetAjoutes,
      modules,
    }
    await supabaseAdmin.from('ia_training_logs').insert({ type: 'langage_clair', resume })

    return NextResponse.json({
      message: 'Entraînement AERORISQ (langage clair) terminé',
      window: { since: sinceIso },
      total,
      fallbackRate,
      upRate,
      votes: { up: upTotal, down: downTotal },
      datasetAjoutes,
      seuils: savedThresholds,
      modules,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
