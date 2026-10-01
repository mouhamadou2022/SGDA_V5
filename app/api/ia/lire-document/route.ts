// app/api/ia/lire-document/route.ts
// L'IA locale LIT le document : transcription des pages (images PNG rendues
// par le navigateur) via un modèle de vision Ollama (ex. qwen2.5vl:7b).
// Les modèles texte (mistral, qwen3, ministral) ne savent pas lire d'images —
// si le modèle de vision est absent, la route répond 503 MODELE_VISION_ABSENT
// avec la commande d'installation exacte, au lieu d'échouer en silence.

import { NextResponse } from 'next/server'
import {
  MODELE_VISION_DEFAUT,
  MAX_PAGES_VISION,
  promptTranscription,
  assemblerTranscriptions,
  extraireTexteReponseVision,
  estErreurModeleAbsent,
} from '@/lib/ia/lectureDocument'

export const maxDuration = 300

const OLLAMA_URL = process.env.AERORISQ_API_URL?.replace(/\/v1\/chat\/completions\/?$/, '') || 'http://localhost:11434'
const MODELE_VISION = process.env.OLLAMA_VISION_MODEL || MODELE_VISION_DEFAUT

export interface LireDocumentRequest {
  /** Nom du fichier (contexte pour la transcription). */
  nom: string
  /** Pages rendues en PNG (dataURL), max MAX_PAGES_VISION. */
  images: string[]
}

export async function POST(request: Request) {
  try {
    const body: LireDocumentRequest = await request.json()
    const images = Array.isArray(body.images) ? body.images.slice(0, MAX_PAGES_VISION) : []
    if (images.length === 0) {
      return NextResponse.json({ error: 'Aucune page à lire.', code: 'SANS_PAGE' }, { status: 400 })
    }

    const transcriptions: Array<{ page: number; texte: string }> = []
    for (let i = 0; i < images.length; i++) {
      const res = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODELE_VISION,
          keep_alive: '30m',
          temperature: 0.1,
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptTranscription(body.nom || 'document', i + 1, images.length) },
                { type: 'image_url', image_url: { url: images[i] } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(240000),
      })
      if (!res.ok) {
        const err = await res.text().catch(() => res.statusText)
        if (estErreurModeleAbsent(err)) {
          return NextResponse.json({
            error: `Modèle de vision « ${MODELE_VISION} » absent d'Ollama.`,
            code: 'MODELE_VISION_ABSENT',
            aide: `Installez-le en une commande : ollama pull ${MODELE_VISION} (~6 Go), puis redéposez le document.`,
          }, { status: 503 })
        }
        throw new Error(`Vision locale HTTP ${res.status} : ${err.slice(0, 200)}`)
      }
      const texte = extraireTexteReponseVision(await res.json())
      if (texte) transcriptions.push({ page: i + 1, texte })
    }

    const texte = assemblerTranscriptions(transcriptions)
    if (texte.length <= 50) {
      return NextResponse.json({
        error: 'Le modèle de vision n’a rien pu lire sur ces pages (images vides ou totalement illisibles).',
        code: 'RIEN_LU',
      }, { status: 503 })
    }
    return NextResponse.json({ texte, methode: 'vision-locale', modele: MODELE_VISION, pages: transcriptions.length })
  } catch (error) {
    const msg = (error as Error)?.message || 'Lecture impossible.'
    if (/ollama|fetch|ECONNREFUSED|Failed to fetch/i.test(msg)) {
      return NextResponse.json({
        error: 'Ollama injoignable — vérifiez qu’Ollama est démarré sur cette machine.',
        code: 'OLLAMA_INJOIGNABLE',
      }, { status: 503 })
    }
    console.error('[/api/ia/lire-document]', error)
    return NextResponse.json({ error: msg, code: 'LECTURE_IMPOSSIBLE' }, { status: 503 })
  }
}
