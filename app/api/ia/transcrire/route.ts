// app/api/ia/transcrire/route.ts
// Secours dictée vocale : transcription audio via Groq Whisper (modèle
// whisper-large-v3-turbo, présent sur le compte). Utilisé quand la
// reconnaissance vocale du navigateur ne capte rien (micro système OK mais
// service Google injoignable/bloqué). Reçoit un multipart { audio }.

import { NextResponse } from 'next/server'
import { getServiceKeys } from '@/lib/ia/providers'

export const maxDuration = 120

// Signatures d'hallucinations connues de Whisper sur du silence/bruit
// (génériques de sous-titrage mémorisés à l'entraînement) : à traiter comme
// du vide, sinon l'IA « répond » n'importe quoi.
const HALLUCINATIONS = [
  'sous-titrage société radio-canada',
  'sous-titres réalisés par',
  'sous-titrage',
  'thanks for watching',
  'subscribe',
  'merci d’avoir regardé',
  'merci de vous abonner',
]

function estHallucination(texte: string): boolean {
  const bas = texte.toLowerCase().trim()
  if (bas.length < 15) return true
  return HALLUCINATIONS.some(h => bas.includes(h))
}

export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null)
    const audio = form?.get('audio')
    if (!(audio instanceof Blob) || audio.size === 0) {
      return NextResponse.json({ error: 'Aucun audio reçu.' }, { status: 400 })
    }
    if (audio.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio trop lourd (20 Mo max).' }, { status: 413 })
    }

    const cles = await getServiceKeys('groq')
    const cle = cles.find(k => k.is_active)?.key_value
    if (!cle) {
      return NextResponse.json({ error: 'Clé Groq indisponible.', code: 'SANS_CLE' }, { status: 503 })
    }

    const envoi = new FormData()
    envoi.append('file', audio, 'dictee.webm')
    envoi.append('model', 'whisper-large-v3-turbo')
    envoi.append('language', 'fr')
    envoi.append('response_format', 'json')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}` },
      body: envoi,
      signal: AbortSignal.timeout(100000),
    })
    if (res.status === 429) {
      return NextResponse.json({ error: 'Quota Groq dépassé — réessayez dans une minute.', code: 'QUOTA' }, { status: 503 })
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      return NextResponse.json({ error: `Transcription impossible (HTTP ${res.status}).`, code: 'PROVIDER' }, { status: 502 })
    }
    const data = await res.json()
    const texte = (data?.text || '').trim()
    if (!texte || estHallucination(texte)) {
      return NextResponse.json({ error: 'Micro muet : seul du silence a été enregistré.', code: 'VIDE' }, { status: 200 })
    }
    return NextResponse.json({ texte })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
