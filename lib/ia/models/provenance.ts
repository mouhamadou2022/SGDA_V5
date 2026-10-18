// lib/ia/models/provenance.ts
// Traçabilité honnête de l'origine d'une prédiction : un chiffre doit toujours
// pouvoir dire s'il vient d'un modèle APPRIS sur données, d'une HEURISTIQUE
// experte, d'un FALLBACK (modèle indisponible) ou de données INSUFFISANTES.
// C'est la brique qui empêche de présenter une heuristique comme une probabilité.

'use client'

export type ModelSource = 'learned' | 'heuristic' | 'fallback' | 'insufficient_data'

export interface ModelProvenance {
  source: ModelSource
  /** Libellé court affichable. */
  label: string
  /** Précision optionnelle (ex. « poids non recalibrés sur données réelles »). */
  detail?: string
  /** Nombre d'échantillons derrière le calcul, si pertinent. */
  sampleSize?: number
}

export const PROVENANCE_LABELS: Record<ModelSource, string> = {
  learned: 'Appris sur données',
  heuristic: 'Heuristique experte',
  fallback: 'Repli (modèle indisponible)',
  insufficient_data: 'Données insuffisantes',
}

export const PROVENANCE_DESCRIPTIONS: Record<ModelSource, string> = {
  learned: 'Paramètres ajustés par un algorithme d\'apprentissage sur des données réelles.',
  heuristic: 'Règles et constantes expertes — non calibrées statistiquement sur des résultats observés.',
  fallback: 'Modèle entraîné indisponible : valeur de repli déterministe.',
  insufficient_data: 'Trop peu d\'observations pour un résultat fiable.',
}

/** Classes CSS badge cohérentes avec le reste de l'app. */
export function provenanceBadgeClass(source: ModelSource): string {
  switch (source) {
    case 'learned': return 'badge success'
    case 'heuristic': return 'badge moyen'
    case 'insufficient_data': return 'badge warning'
    case 'fallback': return 'badge neutral'
    default: return 'badge neutral'
  }
}

/**
 * Détermine la provenance d'un résultat à partir de son état :
 *  - `trained` faux → fallback ;
 *  - pas assez d'échantillons → insufficient_data ;
 *  - sinon learned.
 */
export function classifyProvenance(
  trained: boolean,
  sampleSize: number,
  minSamples: number,
): ModelSource {
  if (!trained) return 'fallback'
  if (sampleSize < minSamples) return 'insufficient_data'
  return 'learned'
}

/** Construit une provenance complète et lisible. */
export function makeProvenance(
  source: ModelSource,
  sampleSize?: number,
  detail?: string,
): ModelProvenance {
  return {
    source,
    label: PROVENANCE_LABELS[source],
    detail: detail ?? PROVENANCE_DESCRIPTIONS[source],
    sampleSize,
  }
}

/** Vrai si la valeur est issue d'un modèle réellement appris (donc plus fiable). */
export function isLearned(source: ModelSource): boolean {
  return source === 'learned'
}
