// lib/pdfText.ts — Hygiène texte pour les PDF jsPDF (polices standard WinAnsi).
// Source unique : les glyphes absents (→, emojis…) s'afficheraient corrompus
// (« !’ ») ou feraient déborder les lignes. Les accents sont conservés.

/**
 * Assainit un texte pour les polices standard jsPDF (WinAnsi) : convertit les
 * glyphes courants manquants, supprime emojis/invisibles et le reste hors
 * WinAnsi latin. Idempotent.
 */
export function textePdf(texte: unknown): string {
  let s = String(texte ?? '')
  s = s
    .replace(/[→⇒⟶]/g, '-')
    .replace(/[←⟵]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[…]/g, '...')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
  // Emojis et pictos (plans astraux + dingbats) : supprimés, jamais rendus.
  s = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '').replace(/[☀-➿⬀-⯿]/g, '')
  // Reste hors WinAnsi latin : supprimé (évite les carrés vides).
  s = s.replace(/[^\x20-\xFF\n\t]/g, '')
  return s.replace(/[ \t]+/g, ' ')
}

/** Tronque un identifiant brut (UUID…) à 8 caractères lisibles. */
export function idCourtPdf(id: unknown): string {
  const s = String(id ?? '').trim()
  if (!s) return '—'
  return s.length > 12 ? s.slice(0, 8).toUpperCase() : s
}
