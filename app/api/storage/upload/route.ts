// app/api/storage/upload/route.ts
// Upload via clé service (contourne RLS) : l'upload anon direct échoue en
// « row-level security policy » quand aucune session Supabase Auth n'est
// ouverte — cas courant (l'app a son propre login). Fichiers concernés :
// Kit Inspecteur, dossiers PAC, preuves, certifications (tous via
// uploadFile, bucket 'documents').
// Garde-fous : bucket allowlisté, pas de '..', 50 Mo max. Service role
// côté serveur uniquement (jamais exposée au navigateur).

import { NextResponse } from 'next/server'

// Route serveur : pas de maxDuration exotique, upload standard.
export const maxDuration = 120

const BUCKETS_AUTORISES = ['documents']
const TAILLE_MAX_OCTETS = 50 * 1024 * 1024

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const bucket = String(body?.bucket || '')
    const path = String(body?.path || '')
    const contentBase64 = String(body?.contentBase64 || '')
    const contentType = String(body?.contentType || 'application/octet-stream')

    if (!BUCKETS_AUTORISES.includes(bucket)) {
      return NextResponse.json({ error: `Bucket « ${bucket} » non autorisé.` }, { status: 400 })
    }
    if (!path || path.includes('..') || path.startsWith('/')) {
      return NextResponse.json({ error: 'Chemin de fichier invalide.' }, { status: 400 })
    }
    if (!contentBase64) {
      return NextResponse.json({ error: 'Fichier vide.' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      return NextResponse.json({ error: 'Stockage serveur non configuré.' }, { status: 503 })
    }

    const binaire = Buffer.from(contentBase64, 'base64')
    if (binaire.length === 0 || binaire.length > TAILLE_MAX_OCTETS) {
      return NextResponse.json({ error: 'Fichier vide ou > 50 Mo.' }, { status: 400 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, serviceKey, { auth: { persistSession: false } })
    const { error } = await sb.storage.from(bucket).upload(path, binaire, {
      contentType,
      upsert: true,
    })
    if (error) {
      return NextResponse.json({ error: `Stockage: ${error.message}` }, { status: 500 })
    }
    const { data } = sb.storage.from(bucket).getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl })
  } catch (error) {
    console.error('[/api/storage/upload]', error)
    return NextResponse.json(
      { error: (error as Error)?.message || 'Échec upload.' },
      { status: 500 },
    )
  }
}
