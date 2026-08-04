// lib/services/exportReglementaire.ts
// Utilitaires partagés pour les exports PDF « État réglementaire » :
// certifications et homologations des aérodromes (rapports détaillés phases +
// synthèse décisionnelle AERORISQ). Réutilise pdfRapport.ts (jsPDF natif).

'use client'

export function formatDateFR(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function joursRestants(expiration?: string | null): number | null {
  if (!expiration) return null
  return Math.floor((new Date(expiration).getTime() - Date.now()) / 86_400_000)
}

export type Echeance = 'expire' | 'critique' | 'proche' | 'ok' | 'nulle'

export function classerEcheance(jours: number | null): Echeance {
  if (jours === null) return 'nulle'
  if (jours < 0) return 'expire'
  if (jours < 30) return 'critique'
  if (jours < 90) return 'proche'
  return 'ok'
}

export function libelleEcheance(jours: number | null): string {
  if (jours === null) return '—'
  if (jours < 0) return `Expiré depuis ${-jours} j`
  return `J-${jours}`
}

/**
 * Demande la synthèse décisionnelle à AERORISQ (via /api/ia/generate,
 * multi-provider avec AERORISQ prioritaire). Renvoie '' si indisponible.
 */
export async function genererSyntheseAerorisq(prompt: string): Promise<string> {
  try {
    const res = await fetch('/api/ia/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) return ''
    const data = await res.json()
    return typeof data?.content === 'string' ? data.content.trim() : ''
  } catch {
    return ''
  }
}

/**
 * Nettoyage minimal pour PDF : on enlève les marqueurs HTML lourds et on
 * retourne des blocs de paragraphes lisibles.
 */
export function nettoyerTexteIA(texte: string): string {
  let t = texte || ''
  t = t.replace(/<h[1-6][^>]*>/gi, '\n')
  t = t.replace(/<\/h[1-6]>/gi, '\n')
  t = t.replace(/<li[^>]*>/gi, '\n• ')
  t = t.replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/<\/(p|div|ul|ol|li|blockquote)>/gi, '\n')
  t = t.replace(/<\/td>/gi, ' | ')
  t = t.replace(/<[^>]+>/g, '')
  t = t.replace(/&nbsp;/gi, ' ')
  t = t.replace(/&amp;/gi, '&')
  t = t.replace(/&#39;/gi, "'")
  t = t.replace(/&quot;/gi, '"')
  return t.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n')
}
