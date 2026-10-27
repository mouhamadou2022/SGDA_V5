// lib/checklistNumerotation.ts
// Références des questions (colonne « Réf ») : génération et unicité.
//
// Deux défauts corrigés :
//  1. Les nouveaux items étaient numérotés `${domaine.id}.${n}` (ex.
//     « QSC_CONTINUE_SEC6.1.19 ») → la référence débordait de la colonne.
//  2. Quand les numéros existants n'étaient pas purement numériques (QSC01,
//     SGS.01…), `parseInt` renvoyait NaN et chaque section repartait à « 01 » :
//     les références devenaient identiques d'un bout à l'autre de la checklist.
//
// Règle appliquée : chaque référence est UNIQUE dans la checklist. On conserve
// le schéma de la section (préfixe + numéro, ex. « QSC19 » → « QSC20 ») et on
// ne renomme que les vides ou les doublons (la première occurrence est gardée).
//
// Module pur, sans dépendance UI : testable.

interface NoeudRef {
  id?: string
  nom?: string
  items?: any[]
  sousDomaines?: NoeudRef[]
  sousSousDomaines?: NoeudRef[]
}

/** Préfixe + numéro final : « QSC01 » → { prefixe: 'QSC', numero: 1, largeur: 2 } */
const RE_REF = /^(.*?)(\d+)$/

function referenceDecoupee(ref: unknown): { prefixe: string; numero: number; largeur: number } | null {
  const s = String(ref ?? '').trim()
  if (!s) return null
  const m = s.match(RE_REF)
  if (!m) return null
  return { prefixe: m[1], numero: parseInt(m[2], 10), largeur: m[2].length }
}

function echapperRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Toutes les références non vides de la checklist, dans l'ordre d'affichage. */
export function numerosUtilises(domaines: NoeudRef[] | null | undefined): string[] {
  const out: string[] = []
  const parcourir = (noeuds: NoeudRef[] | undefined) => {
    for (const n of noeuds || []) {
      for (const item of n.items || []) {
        const ref = String(item?.numero ?? '').trim()
        if (ref) out.push(ref)
      }
      parcourir(n.sousDomaines)
      parcourir(n.sousSousDomaines)
    }
  }
  parcourir(domaines || [])
  return out
}

/**
 * Préfixe d'une section, déduit de ses items existants (« QSC01 » → « QSC »),
 * sinon du nom de la section (« OPS — Procédures opérationnelles » → « OPS »).
 */
export function prefixeDepuisItems(items: any[] | null | undefined): string {
  for (const item of items || []) {
    const d = referenceDecoupee(item?.numero)
    if (d) return d.prefixe
  }
  return ''
}

export function prefixeDepuisNom(nom: string | undefined): string {
  const brut = String(nom ?? '')
    .split(/\s*[—–\-:]\s*/)[0]
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
  return brut.slice(0, 6) || 'IT'
}

/**
 * Prochaine référence libre pour un préfixe donné, en respectant la largeur
 * (zéros à gauche) et sans jamais réutiliser une référence existante.
 */
export function prochaineReference(prefixe: string, numerosExistants: Iterable<string>): string {
  const existants = new Set(Array.from(numerosExistants, n => String(n ?? '').trim()).filter(Boolean))
  const motif = new RegExp(`^${echapperRegex(prefixe)}(\\d+)$`)
  let max = 0
  let largeur = 2
  for (const ref of existants) {
    const m = ref.match(motif)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (n > max) max = n
    if (m[1].length > largeur) largeur = m[1].length
  }
  let suivant = max + 1
  let candidat = `${prefixe}${String(suivant).padStart(largeur, '0')}`
  while (existants.has(candidat)) {
    suivant++
    candidat = `${prefixe}${String(suivant).padStart(largeur, '0')}`
  }
  return candidat
}

export interface ResultatUnicite<T> {
  domaines: T[]
  /** Nombre de références vides ou dupliquées qui ont été renumérotées. */
  renommes: number
}

/**
 * Garantit l'unicité des références dans toute la checklist.
 *
 * - première occurrence d'une référence : conservée telle quelle ;
 * - référence vide ou doublon : renumérotée selon le schéma de sa section
 *   (préfixe + numéro suivant), sans collision avec le reste de la checklist.
 */
export function assurerReferencesUniques<T extends NoeudRef>(
  domaines: T[] | null | undefined,
): ResultatUnicite<T> {
  const source = Array.isArray(domaines) ? domaines : []
  const tous = new Set(numerosUtilises(source))
  const attribues = new Set<string>()
  let renommes = 0

  const traiterSection = (items: any[], nomSection: string | undefined): any[] => {
    const prefixe = prefixeDepuisItems(items) || prefixeDepuisNom(nomSection)
    let max = 0
    let largeur = 2
    for (const item of items) {
      const d = referenceDecoupee(item?.numero)
      if (!d || d.prefixe !== prefixe) continue
      if (d.numero > max) max = d.numero
      if (d.largeur > largeur) largeur = d.largeur
    }

    return (items || []).map(item => {
      const ref = String(item?.numero ?? '').trim()
      if (ref && !attribues.has(ref)) {
        attribues.add(ref)
        return item
      }
      let suivant = max + 1
      let candidat = `${prefixe}${String(suivant).padStart(largeur, '0')}`
      while (tous.has(candidat) || attribues.has(candidat)) {
        suivant++
        candidat = `${prefixe}${String(suivant).padStart(largeur, '0')}`
      }
      max = suivant
      attribues.add(candidat)
      renommes++
      return { ...item, numero: candidat }
    })
  }

  const traiterNoeuds = (noeuds: NoeudRef[] | undefined): any[] =>
    (noeuds || []).map(noeud => ({
      ...noeud,
      items: traiterSection(noeud.items || [], noeud.nom),
      sousDomaines: traiterNoeuds(noeud.sousDomaines),
      sousSousDomaines: traiterNoeuds(noeud.sousSousDomaines),
    }))

  return { domaines: traiterNoeuds(source) as T[], renommes }
}

/** Vrai si la checklist contient au moins une référence vide ou dupliquée. */
export function aDesReferencesNonUniques(domaines: NoeudRef[] | null | undefined): boolean {
  const vus = new Set<string>()
  let anomalie = false
  const parcourir = (noeuds: NoeudRef[] | undefined) => {
    for (const n of noeuds || []) {
      for (const item of n.items || []) {
        const ref = String(item?.numero ?? '').trim()
        if (!ref || vus.has(ref)) anomalie = true
        else vus.add(ref)
      }
      parcourir(n.sousDomaines)
      parcourir(n.sousSousDomaines)
    }
  }
  parcourir(domaines || [])
  return anomalie
}
