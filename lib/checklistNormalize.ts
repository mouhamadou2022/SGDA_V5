import type { DomaineChecklist } from '@/lib/store'

type HierNode = {
  items?: { id?: string }[] | undefined
  sousDomaines?: HierNode[] | undefined
}

function walkDedupe(niveaux: HierNode[] | undefined, seen: Set<string>): { items?: any[] } | null {
  if (!niveaux) return null
  for (const niveau of niveaux) {
    if (Array.isArray(niveau.items)) {
      niveau.items = niveau.items.filter(item => {
        const id = item?.id
        if (!id) return true
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
    }
    walkDedupe(niveau.sousDomaines as any, seen)
  }
  return null
}

/**
 * Supprime les occurrences dupliquées d'un item de checklist au sein d'une
 * hiérarchie. Deux items partageant le même `id` dans une même hiérarchie sont
 * un artefact d'import de template (la même ligne copiée plusieurs fois) — on
 * conserve la première occurrence et on écarte les suivantes.
 *
 * La normalisation est profonde (domaine → sousDomaines → sousSousDomaines) et
 * NE renomme PAS les ids : on garde un seul exemplaire de chaque id existant,
 * ce qui préserve les références (item_ids des écarts, résultats checklist_items).
 *
 * Retourne une nouvelle hiérarchie (n'écrase pas l'entrée). Si aucune
 * modification n'est nécessaire, retourne la même référence.
 */
export function dedupeHierarchyItems(domaines: DomaineChecklist[] | undefined | null): DomaineChecklist[] | null {
  if (!domaines || domaines.length === 0) return domaines ?? null
  const seen = new Set<string>()

  const countTotal = (d: HierNode[]): number => {
    let n = 0
    for (const x of d) { n += (x.items || []).length; n += countTotal(x.sousDomaines || []) }
    return n
  }

  const clone: DomaineChecklist[] = JSON.parse(JSON.stringify(domaines))
  const before = countTotal(domaines as any)
  walkDedupe(clone as any, seen)
  const after = countTotal(clone as any)

  // Si rien n'a été retiré, on retourne la référence d'origine (pas de réallocation).
  return before === after ? domaines : clone
}
