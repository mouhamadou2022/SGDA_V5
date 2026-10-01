// lib/ia/lectureDocument.ts
// Lecture d'un document PDF scanné par un modèle de vision LOCAL (Ollama).
// Principe : le navigateur rend les pages en images PNG (rapide, quelques
// secondes), le modèle de vision les transcrit. Fini l'OCR Tesseract.js côté
// navigateur (plusieurs minutes, qualité médiocre).
// Les modèles texte locaux (mistral, qwen3, ministral) NE PEUVENT PAS lire
// d'images : il faut un modèle de vision, ex. `ollama pull qwen2.5vl:7b`.

/** Modèle de vision par défaut (surchargé par OLLAMA_VISION_MODEL côté serveur). */
export const MODELE_VISION_DEFAUT = 'qwen2.5vl:7b'

/** Nombre max de pages envoyées à la vision (borne le temps et les tokens). */
export const MAX_PAGES_VISION = 5

/** Consigne de transcription : fidélité, pas d'interprétation. */
export function promptTranscription(nomFichier: string, page: number, total: number): string {
  return `Tu es un lecteur de documents pour l'aviation civile sénégalaise (ANACIM). ` +
    `Transcris FIDÈLEMENT le texte visible sur la page ${page}/${total} du document « ${nomFichier} ». ` +
    `Règles : reproduis le texte tel quel (titres, paragraphes, tableaux en lignes simples) ; ` +
    `n'invente rien, n'ajoute aucun commentaire ni résumé ; ` +
    `si une zone est illisible, écris [illisible] à son emplacement ; ` +
    `réponds UNIQUEMENT avec la transcription.`
}

/** Assemble les transcriptions page par page en un texte unique. */
export function assemblerTranscriptions(pages: Array<{ page: number; texte: string }>): string {
  return [...pages]
    .sort((a, b) => a.page - b.page)
    .map(p => `--- Page ${p.page} ---\n${p.texte.trim()}`)
    .join('\n\n')
    .trim()
}

/** Extrait le texte d'une réponse Ollama /v1/chat/completions. */
export function extraireTexteReponseVision(reponse: unknown): string {
  if (!reponse || typeof reponse !== 'object') return ''
  const choix = (reponse as { choices?: Array<{ message?: { content?: unknown } }> }).choices
  const contenu = choix?.[0]?.message?.content
  if (typeof contenu === 'string') return contenu.trim()
  if (Array.isArray(contenu)) {
    return contenu
      .filter((p): p is { type: string; text?: string } => typeof p === 'object' && p !== null)
      .filter(p => p.type === 'text' && typeof p.text === 'string')
      .map(p => (p as { text: string }).text)
      .join('\n')
      .trim()
  }
  return ''
}

/** Détecte « modèle absent » dans une erreur Ollama (pour guider l'install). */
export function estErreurModeleAbsent(message: string): boolean {
  return /not found|does not exist|model .* not/i.test(message || '')
}
