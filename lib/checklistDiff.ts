// lib/checklistDiff.ts — Diff entre deux versions de hiérarchie checklist.
// Pur et testé : compare les domaines par nom, détecte ajout/retrait et
// modification (items). Utilisé par l'historique des versions du kit
// (traçabilité : qui, quand, quelles sections).

import type { DomaineChecklist } from './store';

interface NoeudChecklist {
  id?: string;
  numero?: string;
  point_verification?: string;
  description?: string;
  items?: NoeudChecklist[];
  sousDomaines?: NoeudChecklist[];
  sousSousDomaines?: NoeudChecklist[];
}

function collecterItems(noeuds: NoeudChecklist[] | undefined, sortie: string[]): void {
  for (const n of noeuds || []) {
    if (n.id || n.numero || n.point_verification) {
      sortie.push([n.id || '', n.numero || '', n.point_verification || n.description || ''].join('|'))
    }
    collecterItems(n.items, sortie)
    collecterItems(n.sousDomaines, sortie)
    collecterItems(n.sousSousDomaines, sortie)
  }
}

/** Signature stable d'un domaine (ids + intitulés, récursif, triée). */
export function signerDomaine(domaine: DomaineChecklist): string {
  const items: string[] = []
  collecterItems([domaine as unknown as NoeudChecklist], items)
  return items.sort().join(';')
}

export interface DiffHierarchie {
  /** Noms des domaines ajoutés. */
  ajoutes: string[];
  /** Noms des domaines retirés. */
  retires: string[];
  /** Noms des domaines présents avant/après mais modifiés. */
  modifies: string[];
}

/** Diff entre l'ancienne et la nouvelle hiérarchie (noms de domaines). */
export function diffHierarchieVersions(
  ancienne: DomaineChecklist[] | null | undefined,
  nouvelle: DomaineChecklist[] | null | undefined,
): DiffHierarchie {
  const avant = new Map((ancienne || []).map(d => [d.nom, d]))
  const apres = new Map((nouvelle || []).map(d => [d.nom, d]))
  const ajoutes = [...apres.keys()].filter(nom => !avant.has(nom))
  const retires = [...avant.keys()].filter(nom => !apres.has(nom))
  const modifies = [...apres.keys()].filter(nom => {
    const a = avant.get(nom)
    const b = apres.get(nom)
    return !!a && !!b && signerDomaine(a) !== signerDomaine(b)
  })
  return { ajoutes, retires, modifies }
}
