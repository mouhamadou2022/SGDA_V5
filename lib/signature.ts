/**
 * signature.ts — SGDA V5 — CDC §3.5
 * Gestion signatures stylet (Canvas + Pointer Events)
 *
 * CORRECTION : Buffer.from() est Node.js uniquement → crash navigateur.
 * Remplacé par la conversion base64 → Uint8Array → Blob (API Web standard).
 * ✅ Compatible navigateur, tablette, stylet, souris.
 */

import { supabase } from './supabase'

export interface SignatureData {
  id: string
  user_id: string
  document_type: 'lettre' | 'certificat' | 'decision' | 'rapport' | 'checklist'
  document_id: string
  signature_url: string
  signed_at: string
  signed_by: string
  signed_by_name: string
}

/**
 * Exporte le canvas en PNG base64
 */
export function signatureToPNG(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

/**
 * Valide que la signature n'est pas vide (canvas non blanc)
 */
export function isSignatureValid(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext('2d')
  if (!context) return false
  const pixelData = context.getImageData(0, 0, canvas.width, canvas.height).data
  for (let i = 3; i < pixelData.length; i += 4) {
    // Si un pixel a une valeur alpha > 0 → quelque chose a été dessiné
    if (pixelData[i] > 0) return true
  }
  return false
}

/**
 * Convertit une chaîne base64 en Uint8Array
 * ✅ API Web standard — compatible tous navigateurs (remplace Buffer.from)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Upload la signature vers Supabase Storage
 * Utilise Blob (API Web) à la place de Buffer (Node.js)
 */
export async function uploadSignature(
  canvas: HTMLCanvasElement,
  userId: string,
  documentType: string,
  documentId: string
): Promise<string | null> {
  try {
    const pngDataUrl = signatureToPNG(canvas)

    // Extraire le base64 pur (supprimer le préfixe data:image/png;base64,)
    const base64Data = pngDataUrl.split(',')[1]
    if (!base64Data) throw new Error('Conversion PNG échouée')

    // ✅ Conversion base64 → Uint8Array → Blob (API Web, fonctionne dans le navigateur)
    const uint8Array = base64ToUint8Array(base64Data)
    const blob = new Blob([uint8Array.buffer as ArrayBuffer], { type: 'image/png' })

    const fileName = `signatures/${documentType}/${documentId}_${userId}_${Date.now()}.png`

    const { error } = await supabase.storage
      .from('documents')
      .upload(fileName, blob, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(fileName)

    return publicUrl
  } catch (error) {
    console.error('[SGDA] Erreur upload signature:', error)
    return null
  }
}

/**
 * Enregistre les métadonnées de la signature en base de données
 */
export async function saveSignature(
  userId: string,
  userName: string,
  documentType: SignatureData['document_type'],
  documentId: string,
  signatureUrl: string
): Promise<SignatureData | null> {
  try {
    const signatureData: SignatureData = {
      id: crypto.randomUUID(),
      user_id: userId,
      document_type: documentType,
      document_id: documentId,
      signature_url: signatureUrl,
      signed_at: new Date().toISOString(),
      signed_by: userId,
      signed_by_name: userName,
    }

    const { error } = await supabase
      .from('v5_signatures')
      .insert([signatureData])

    if (error) throw error

    return signatureData
  } catch (error) {
    console.error('[SGDA] Erreur sauvegarde signature:', error)
    return null
  }
}

/**
 * Vérifie si un document a déjà été signé (lecture seule après signature — CDC §3.5)
 */
export async function isDocumentSigned(
  documentType: string,
  documentId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('v5_signatures')
      .select('id')
      .eq('document_type', documentType)
      .eq('document_id', documentId)
      .maybeSingle()

    return !!data
  } catch {
    return false
  }
}
