// lib/ia/capitalisation.ts
// Capitalisation nocturne de l'historique : les dossiers CLÔTURÉS alimentent
// l'apprentissage (écarts résolus → exemples validés, rapports transmis →
// few-shot, preuves images → transcriptions). Jamais les brouillons.
// Pur et testé ; l'orchestration (cron) vit dans
// app/api/cron/capitaliser-historique/route.ts.

export interface PaireEcartResolu {
  /** Hash stable de déduplication (référence + libellé). */
  hash: string
  module: string
  texte: string
  contexte: Record<string, unknown>
}

/** Hash stable FNV-1a (hex) — dédup sans dépendance. */
export function hacherTexte(texte: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export interface EcartClotureVue {
  reference?: string
  libelle?: string
  domaine?: string
  niveau_risque?: string
  ref_reglementaire?: string
  pac?: { actions?: Array<{ description?: string; responsable?: string }> } | null
  evaluation_notes?: Record<string, number> | null
}

/**
 * Construit l'exemple d'entraînement d'un écart clôturé : constat + PAC qui
 * a marché + notes. Seulement si le dossier est complet (PAC + notes).
 * Retourne null si inexploitable (pas de matière).
 */
export function paireEcartResolu(e: EcartClotureVue): PaireEcartResolu | null {
  const actions = (e.pac?.actions || []).filter(a => (a.description || '').trim())
  if (!(e.libelle || '').trim() || actions.length === 0) return null
  const notes = e.evaluation_notes || {}
  const cles = Object.keys(notes)
  const moyenne = cles.length > 0
    ? cles.reduce((s, k) => s + (notes[k] || 0), 0) / cles.length
    : null
  const texte = [
    `Constat [${e.domaine || '?'} / ${e.niveau_risque || '?'}] : ${e.libelle}`,
    e.ref_reglementaire ? `Référence : ${e.ref_reglementaire}` : '',
    `Plan d'actions correctives (${actions.length}) :`,
    ...actions.map((a, i) => `${i + 1}. ${a.description}${a.responsable ? ` (responsable : ${a.responsable})` : ''}`),
    moyenne != null ? `Évaluation du PAC : ${Math.round(moyenne * 10) / 10}/4 — plan efficace, à imiter.` : '',
  ].filter(Boolean).join('\n')
  return {
    hash: `ecart-resolu::${hacherTexte(`${e.reference || ''}::${e.libelle}`)}`,
    module: 'ecart-resolu',
    texte,
    contexte: { reference: e.reference || null, domaine: e.domaine || null, niveau: e.niveau_risque || null },
  }
}

export interface PreuveATranscrire {
  url: string
  nom: string
  ecartReference?: string
}

/** Hash de dédup d'une preuve (URL normalisée). */
export function hashPreuve(url: string): string {
  return `preuve-transcrite::${hacherTexte(url.trim())}`
}

/** Images transcrivables par la vision (direct, sans rendu) : jpg/png/webp. */
export function estImageTranscrivable(url: string, nom?: string): boolean {
  const cible = `${url} ${nom || ''}`.toLowerCase().split('?')[0].trim()
  if (cible.startsWith('blob:') || cible.startsWith('data:')) return false
  return /\.(jpe?g|png|webp)$/.test(cible)
}

/** Prompt de transcription d'une preuve terrain (photo de constat). */
export function promptTranscriptionPreuve(nom: string, referenceEcart?: string): string {
  return `Tu es un lecteur de documents pour l'aviation civile sénégalaise (ANACIM). ` +
    `Décris FIDÈLEMENT ce que montre cette photo de constat terrain` +
    (referenceEcart ? ` (écart ${referenceEcart})` : '') +
    ` (fichier « ${nom} ») : objets visibles, état des infrastructures, marquages, anomalies. ` +
    `N'invente rien, n'ajoute aucun commentaire ni diagnostic — uniquement la description factuelle.`
}
