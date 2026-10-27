// lib/ia/checklistContext.ts
// Compaction du contexte « checklist » envoyé au modèle par l'assistant latéral.
//
// Problème corrigé : l'assistant sérialisait la checklist ENTIÈRE avec tous ses
// champs (directives SA/NS/NV/NA, preuves, justifications…). Sur une checklist
// de 138 items, le prompt atteignait ~61 500 tokens, au-delà de la fenêtre de
// TOUS les providers : la requête était refusée (503 ALL_PROVIDERS_FAILED) et
// l'inspecteur recevait « Je n'ai pas pu traiter votre demande ».
//
// Principe : n'envoyer que ce qui permet au modèle d'identifier les items
// (id, numéro, question) et tenir dans un budget de caractères calibré sur le
// plafond du provider le plus rapide (Groq tier : ~6 000 tokens ≈ 18 000
// caractères pour TOUTE la requête, prompt système inclus). Les champs lourds
// (directives, prédictions…) ne sont pas nécessaires : pour une modification,
// le modèle renvoie uniquement les champs qu'il change, et la fusion côté
// client conserve le reste.
//
// Module pur, sans appel réseau : testable.

export interface ContexteChecklist {
  /** JSON compact à injecter dans le prompt. */
  texte: string
  /** Nombre d'items effectivement décrits au modèle. */
  itemsEnvoyes: number
  /** Nombre total d'items de la checklist. */
  itemsTotal: number
  /** Items non listés (checklist très volumineuse). */
  itemsOmis: number
  /** Vrai si les questions ont été raccourcies. */
  questionsRaccourcies: boolean
}

interface Noeud {
  id?: string
  nom?: string
  items?: any[]
  sousDomaines?: Noeud[]
  sousSousDomaines?: Noeud[]
}

/**
 * Budget par défaut (~5 000 tokens à chars/3) : laisse la place au prompt
 * système et au message utilisateur sous le plafond de 6 000 tokens du tier
 * Groq, afin que la requête reste servie par le provider rapide au lieu de
 * basculer sur un provider lent (ou d'échouer).
 */
export const BUDGET_CONTEXTE_CHECKLIST = 15000

/** Longueurs de question essayées, de la plus fidèle à la plus courte. */
const PALIERS_POINT = [240, 160, 120, 90, 70, 55, 40, 30]
/** Nombre d'items listés par nœud, essayé seulement si les questions ne suffisent pas. */
const PALIERS_ITEMS = [Number.MAX_SAFE_INTEGER, 60, 30, 20, 12, 8, 5, 3]

function compterItems(noeuds: Noeud[] | undefined): number {
  if (!noeuds) return 0
  let n = 0
  for (const noeud of noeuds) {
    n += (noeud.items || []).length
    n += compterItems(noeud.sousDomaines)
    n += compterItems(noeud.sousSousDomaines)
  }
  return n
}

/** Nombre d'items réellement listés une fois la troncature appliquée. */
function compterItemsListes(noeuds: Noeud[] | undefined, maxItems: number): number {
  if (!noeuds) return 0
  let n = 0
  for (const noeud of noeuds) {
    const total = (noeud.items || []).length
    n += Math.min(total, maxItems)
    n += compterItemsListes(noeud.sousDomaines, maxItems)
    n += compterItemsListes(noeud.sousSousDomaines, maxItems)
  }
  return n
}

function couper(texte: unknown, max: number): string {
  const s = String(texte ?? '').trim()
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function compacterItem(item: any, maxPoint: number, avecRef: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: item?.id,
    numero: item?.numero,
    point_verification: couper(item?.point_verification, maxPoint),
  }
  if (avecRef) out.reference_reglementaire = couper(item?.reference_reglementaire, 90)
  return out
}

function compacterNoeud(noeud: Noeud, maxPoint: number, avecRef: boolean, maxItems: number): Record<string, unknown> {
  const items = noeud.items || []
  const gardes = maxItems >= items.length ? items : items.slice(0, maxItems)
  const out: Record<string, unknown> = {
    id: noeud.id,
    nom: noeud.nom,
    items: gardes.map(i => compacterItem(i, maxPoint, avecRef)),
  }
  if (gardes.length < items.length) out.autres_items_non_listes = items.length - gardes.length
  if (noeud.sousDomaines) out.sousDomaines = noeud.sousDomaines.map(sd => compacterNoeud(sd, maxPoint, avecRef, maxItems))
  if (noeud.sousSousDomaines) out.sousSousDomaines = noeud.sousSousDomaines.map(ssd => compacterNoeud(ssd, maxPoint, avecRef, maxItems))
  return out
}

function construire(domaines: Noeud[], maxPoint: number, avecRef: boolean, maxItems: number): string {
  return JSON.stringify(domaines.map(d => compacterNoeud(d, maxPoint, avecRef, maxItems)))
}

/**
 * Construit un contexte compact qui tient dans `budgetChars`.
 *
 * Paliers : on raccourcit d'abord les questions (en gardant TOUS les items),
 * puis la référence réglementaire, et en dernier recours seulement on ne liste
 * qu'une partie des items par nœud (`autres_items_non_listes` indique combien
 * restent, et le prompt le signale au modèle).
 */
export function construireContexteChecklist(
  domaines: Noeud[] | null | undefined,
  budgetChars: number = BUDGET_CONTEXTE_CHECKLIST,
): ContexteChecklist {
  const source = Array.isArray(domaines) ? domaines : []
  const itemsTotal = compterItems(source)
  const budget = Math.max(1500, Math.floor(budgetChars))

  for (const maxItems of PALIERS_ITEMS) {
    for (const maxPoint of PALIERS_POINT) {
      // La référence réglementaire n'est conservée que si la question est déjà lisible.
      const refs = maxPoint >= 90 ? [true, false] : [false]
      for (const avecRef of refs) {
        const texte = construire(source, maxPoint, avecRef, maxItems)
        if (texte.length <= budget) {
          const itemsEnvoyes = compterItemsListes(source, maxItems)
          return {
            texte,
            itemsEnvoyes,
            itemsTotal,
            itemsOmis: Math.max(0, itemsTotal - itemsEnvoyes),
            questionsRaccourcies: maxPoint < 240,
          }
        }
      }
    }
  }

  // Filet de sécurité : le plus compact possible, même si le budget est dépassé.
  const maxPoint = PALIERS_POINT[PALIERS_POINT.length - 1]
  const maxItems = PALIERS_ITEMS[PALIERS_ITEMS.length - 1]
  const texte = construire(source, maxPoint, false, maxItems)
  const itemsEnvoyes = compterItemsListes(source, maxItems)
  return {
    texte,
    itemsEnvoyes,
    itemsTotal,
    itemsOmis: Math.max(0, itemsTotal - itemsEnvoyes),
    questionsRaccourcies: true,
  }
}
