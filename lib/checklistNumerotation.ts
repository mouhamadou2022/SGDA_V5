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

// ─────────────────────────────────────────────────────────────────────────────
// Numéros d'items restés dans le texte de la question
//
// À l'import, le numéro de l'item du document Word (« 11 la pente … »,
// « 7.2.4 L'exploitant … ») n'est pas toujours reconnu comme référence : il
// reste collé au début de la question. Résultat : la question commence par des
// chiffres (« 11 la pente … ») alors que ces chiffres font partie de la
// référence (« IT1.2.11 »).
//
// On les extrait : la question est nettoyée et le numéro rejoint la référence.
// ─────────────────────────────────────────────────────────────────────────────

/** Unités qui ne doivent jamais être prises pour un numéro d'item. */
const UNITES = new Set([
  'm', 'km', 'cm', 'mm', 'h', 'mn', 'min', 's', 'sec', 'ft', 'kg', 't', 'ha',
  'kt', 'nm', 'l', 'lx', 'cd', 'db', 'm2', 'm3', 'cm2', '%', '°', 'n',
])

/** « 11 la pente … » → { numero: '11', question: 'la pente …' } */
export function extraireNumeroQuestion(
  question: string | null | undefined,
): { numero: string; question: string } {
  const brut = String(question ?? '').trim()
  const m = brut.match(/^(\d{1,3}(?:\.\d{1,3}){0,3})(?:\s*[.)\-–—:]\s*|\s+)([\s\S]+)$/)
  if (!m) return { numero: '', question: brut }
  const numero = m[1]
  const reste = m[2].trim()
  if (!reste) return { numero: '', question: brut }
  // La suite doit commencer par une lettre (ou une ouverture) : « 24 h »,
  // « 3 % » ou « 2 500 m » ne sont pas des numéros d'item.
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ«"(]/.test(reste)) return { numero: '', question: brut }
  const unite = reste.match(/^([A-Za-zÀ-ÖØ-öø-ÿ%°]+)(?=\s|$)/)
  // Un mot-unité (« 24 h », « 3 % ») n'est pas un numéro d'item ; en revanche
  // « L’exploitant » ne doit pas être confondu avec l'unité « l » (litre).
  if (unite && UNITES.has(unite[1].toLowerCase())) return { numero: '', question: brut }
  return { numero, question: reste }
}

export interface ResultatNormalisation<T> extends ResultatUnicite<T> {
  /** Nombre de questions dont le numéro de tête a été retiré. */
  questionsNettoyees: number
}

/**
 * Nettoie les questions qui commencent par leur numéro d'item et intègre ce
 * numéro à la référence (colonne « Réf »), puis garantit l'unicité.
 *
 * Un nombre suivi d'un texte de question est un numéro d'item resté dans la
 * question (les documents Word numérotent leurs items) ; un numéro de
 * paragraphe pointé (« 7.2.4 ») est retiré sans être ajouté à la référence.
 * Les nombres qui font partie de la question (« 24 h », « 2 500 m », « 3 % »)
 * sont conservés.
 */
export function normaliserQuestionsEtReferences<T extends NoeudRef>(
  domaines: T[] | null | undefined,
): ResultatNormalisation<T> {
  const source = Array.isArray(domaines) ? domaines : []
  let questionsNettoyees = 0

  const traiterSection = (items: any[]): any[] => {
    const extraits = items.map(item => extraireNumeroQuestion(item?.point_verification ?? item?.description))
    const compteRefs = new Map<string, number>()
    for (const item of items) {
      const ref = String(item?.numero ?? '').trim()
      if (ref) compteRefs.set(ref, (compteRefs.get(ref) ?? 0) + 1)
    }

    return items.map((item, i) => {
      const { numero: extrait, question } = extraits[i]
      if (!extrait) return item

      const base = String(item?.numero ?? '').trim()
      const duplique = base ? (compteRefs.get(base) ?? 0) > 1 : false
      // Un numéro pointé (« 7.2.4 ») est un paragraphe réglementaire : on le
      // retire de la question sans l'ajouter à la référence.
      const paragraphe = extrait.includes('.')

      let nouvelleRef = base
      if (!paragraphe) {
        const dejaSuffixe = !!base && (base === extrait || base.endsWith(`.${extrait}`))
        if (!dejaSuffixe || duplique) {
          nouvelleRef = base ? `${base}.${extrait}` : extrait
        }
      }

      const maj: Record<string, unknown> = { numero: nouvelleRef, point_verification: question }
      // Le parser recopiait la question dans `description` : on la nettoie aussi.
      if (typeof item?.description === 'string' && item.description.trim() === String(item?.point_verification ?? '').trim()) {
        maj.description = question
      }
      questionsNettoyees++
      return { ...item, ...maj }
    })
  }

  const traiterNoeuds = (noeuds: NoeudRef[] | undefined): any[] =>
    (noeuds || []).map(noeud => ({
      ...noeud,
      items: traiterSection(noeud.items || []),
      sousDomaines: traiterNoeuds(noeud.sousDomaines),
      sousSousDomaines: traiterNoeuds(noeud.sousSousDomaines),
    }))

  const nettoyes = traiterNoeuds(source)
  const resultat = assurerReferencesUniques(nettoyes as T[])
  return { ...resultat, questionsNettoyees }
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
