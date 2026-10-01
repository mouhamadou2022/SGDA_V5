// app/api/cron/capitaliser-historique/route.ts
// Capitalisation nocturne de l'historique : les dossiers CLÔTURÉS alimentent
// l'apprentissage (jamais les brouillons). Fréquence : hebdomadaire
// (voir PLAN_APPRENTISSAGE). Appelable via cron-job.org, UptimeRobot, etc.
// Protection par CRON_SECRET (même convention que recalculate-risk).
//
// 1. Écarts clôturés → paires (constat + PAC efficace + notes) en
//    ia_training_dataset (module 'ecart-resolu').
// 2. Surveillances transmises → extraits de rapports (module 'rapport-transmis').
// 3. Preuves IMAGES jointes → transcription par la vision locale (Ollama,
//    plafonné à 8/nuit, ~client lourd CPU) en 'preuve-transcrite'.
//    PDF/DOCX/scans : non transcrits ici (reste le circuit lire-document à
//    la demande) — le cron ne fait que ce qui est rapide et fiable.
// Sans Ollama local (ex. Vercel), l'étape 3 est sautée proprement.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  paireEcartResolu,
  hashPreuve,
  estImageTranscrivable,
  promptTranscriptionPreuve,
} from '@/lib/ia/capitalisation'

export const maxDuration = 300

const MAX_PREUVES_PAR_NUIT = 8
const MODELE_VISION = process.env.OLLAMA_VISION_MODEL || 'qwen2.5vl:7b'
const OLLAMA_URL = (process.env.AERORISQ_API_URL || 'http://localhost:11434/v1/chat/completions')
  .replace(/\/v1\/chat\/completions\/?$/, '')

async function insererExemple(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  row: { module: string; texte_hash: string; texte: string; contexte?: Record<string, unknown> },
): Promise<boolean> {
  const { error } = await sb.from('ia_training_dataset').upsert(
    { ...row, fallback_ia: false },
    { onConflict: 'module,texte_hash' },
  )
  if (error) {
    console.warn(`[capitaliser] upsert ${row.module} ignoré :`, error.message)
    return false
  }
  return true
}

function textePropre(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function transcrireImage(url: string, nom: string, reference?: string): Promise<string | null> {
  try {
    const img = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!img.ok) return null
    const buf = Buffer.from(await img.arrayBuffer())
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return null
    const ext = url.toLowerCase().split('?')[0].endsWith('.png') ? 'image/png'
      : url.toLowerCase().split('?')[0].endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELE_VISION,
        keep_alive: '30m',
        temperature: 0.1,
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: promptTranscriptionPreuve(nom, reference) },
            { type: 'image_url', image_url: { url: `data:${ext};base64,${buf.toString('base64')}` } },
          ],
        }],
      }),
      signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const texte = (data?.choices?.[0]?.message?.content || '').trim()
    return texte.length > 50 ? texte : null
  } catch {
    return null
  }
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
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    let paires = 0
    let rapports = 0
    let preuvesLues = 0
    let preuvesIgnorees = 0

    // ── 1. Écarts clôturés ──
    const { data: ecarts } = await sb
      .from('ecarts')
      .select('reference, libelle, domaine, niveau_risque, ref_reglementaire, pac, evaluation_pac')
      .eq('statut', 'cloture')
      .order('updated_at', { ascending: false })
      .limit(200)
    for (const e of ecarts || []) {
      const notes: Record<string, number> = {}
      const ev = (e.evaluation_pac || {}) as Record<string, unknown>
      for (const [k, v] of Object.entries(ev)) {
        if (k.startsWith('note_') && typeof v === 'number') notes[k.replace(/^note_/, '')] = v
      }
      const paire = paireEcartResolu({
        reference: e.reference,
        libelle: e.libelle,
        domaine: e.domaine,
        niveau_risque: e.niveau_risque,
        ref_reglementaire: e.ref_reglementaire,
        pac: e.pac,
        evaluation_notes: notes,
      })
      if (!paire) continue
      if (await insererExemple(sb, {
        module: paire.module,
        texte_hash: paire.hash,
        texte: paire.texte,
        contexte: paire.contexte,
      })) paires++
    }

    // ── 2. Rapports transmis ──
    const { data: survs } = await sb
      .from('surveillances')
      .select('id, aerodrome_id, rapport_html, transmitted_at')
      .eq('statut', 'transmise')
      .order('transmitted_at', { ascending: false })
      .limit(50)
    for (const s of survs || []) {
      const texte = textePropre(String(s.rapport_html || '')).slice(0, 2000)
      if (texte.length < 200) continue
      const hash = `rapport-transmis::${s.id}`
      if (await insererExemple(sb, {
        module: 'rapport-transmis',
        texte_hash: hash,
        texte: `Rapport de surveillance transmise :\n${texte}`,
        contexte: { surveillance_id: s.id, aerodrome_id: s.aerodrome_id },
      })) rapports++
    }

    // ── 3. Preuves images (plafonné) ──
    const { data: avecPreuves } = await sb
      .from('ecarts')
      .select('reference, preuves, fichiers, pieces_jointes')
      .eq('statut', 'cloture')
      .order('updated_at', { ascending: false })
      .limit(100)
    const candidates: Array<{ url: string; nom: string; reference?: string }> = []
    for (const e of avecPreuves || []) {
      const listes = [e.preuves, e.fichiers, e.pieces_jointes].filter(Array.isArray).flat() as Array<{ url?: string; nom?: string }>
      for (const p of listes) {
        if (p?.url && estImageTranscrivable(p.url, p.nom)) {
          candidates.push({ url: p.url, nom: p.nom || 'preuve', reference: e.reference })
        }
      }
      if (candidates.length >= MAX_PREUVES_PAR_NUIT * 3) break
    }
    // Déjà transcrites ? (hash présent → on saute sans appeler la vision)
    const aTranscrire: typeof candidates = []
    for (const c of candidates) {
      if (aTranscrire.length >= MAX_PREUVES_PAR_NUIT) { preuvesIgnorees++; continue }
      const { data: existe } = await sb
        .from('ia_training_dataset')
        .select('id')
        .eq('module', 'preuve-transcrite')
        .eq('texte_hash', hashPreuve(c.url))
        .limit(1)
      if (existe && existe.length > 0) continue
      aTranscrire.push(c)
    }
    for (const c of aTranscrire) {
      const texte = await transcrireImage(c.url, c.nom, c.reference)
      if (!texte) { preuvesIgnorees++; continue }
      if (await insererExemple(sb, {
        module: 'preuve-transcrite',
        texte_hash: hashPreuve(c.url),
        texte: `Preuve terrain${c.reference ? ` (écart ${c.reference})` : ''} — ${c.nom} :\n${texte}`,
        contexte: { url: c.url, ecart: c.reference || null },
      })) preuvesLues++
      else preuvesIgnorees++
    }

    try {
      await sb.from('ia_training_logs').insert({
        type: 'capitaliser-historique',
        resume: { paires, rapports, preuvesLues, preuvesIgnorees },
      })
    } catch { /* journal best-effort */ }

    return NextResponse.json({
      message: 'Capitalisation terminée',
      paires_ecarts: paires,
      rapports,
      preuves_transcrites: preuvesLues,
      preuves_ignorees: preuvesIgnorees,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
