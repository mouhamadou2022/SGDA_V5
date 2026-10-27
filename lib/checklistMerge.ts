// lib/checklistMerge.ts
// Fusion des modifications proposées par l'assistant IA dans une hiérarchie de
// checklist (domaines → items, sous-domaines → items, sous-sous-domaines).
//
// Règle d'or : ON NE PERD JAMAIS D'ITEM. L'assistant ne renvoie que ce qu'il
// modifie ou ajoute ; tout ce qui n'est pas renvoyé est conservé tel quel.
//
// - Item existant renvoyé partiellement (id + champs modifiés) : fusion champ
//   par champ, les champs absents restent inchangés.
// - Item nouveau (id inconnu) : ajouté à la fin.
// - Domaine / sous-domaine / sous-sous-domaine nouveau : ajouté.
// - Correspondance par `id`, à défaut par `nom`.
//
// Module pur, testable.

type Champ = Record<string, any>
interface Noeud extends Champ {
  id?: string
  nom?: string
  items?: Champ[]
  sousDomaines?: Noeud[]
  sousSousDomaines?: Noeud[]
}

function defini(v: unknown): boolean {
  return v !== undefined && v !== null
}

/** Champs propres au nœud (hors items et sous-niveaux). */
function champsPropres(noeud: Noeud): Champ {
  const copie: Champ = { ...noeud }
  delete copie.items
  delete copie.sousDomaines
  delete copie.sousSousDomaines
  return copie
}

function patch(noeud: Noeud): Champ {
  const propres = champsPropres(noeud)
  delete propres.id
  return Object.fromEntries(Object.entries(propres).filter(([, v]) => defini(v)))
}

function memeNoeud(a: Noeud, b: Noeud): boolean {
  // L'id est la clé principale, le nom sert de repli : un domaine renvoyé avec
  // un id différent mais le même nom doit être fusionné, pas dupliqué.
  if (a.id && b.id && a.id === b.id) return true
  if (a.nom && b.nom && a.nom === b.nom) return true
  return false
}

/** Fusionne deux listes d'items en préservant l'ordre et les champs existants. */
export function fusionnerItemsIA(existants: Champ[] = [], entrants: Champ[] = []): Champ[] {
  const resultat = (existants || []).map(i => ({ ...i }))
  const index = new Map<string, number>()
  const parNumero = new Map<string, number>()
  resultat.forEach((item, i) => {
    if (item?.id) index.set(String(item.id), i)
    if (item?.numero) parNumero.set(String(item.numero), i)
  })

  for (const entrant of entrants || []) {
    if (!entrant) continue
    const id = entrant.id ? String(entrant.id) : ''
    let k = id ? index.get(id) : undefined
    // Repli sur le numéro (SGS.01, QSC12…) : le modèle peut renvoyer un id
    // approximatif ; mieux vaut patcher l'item existant que créer un doublon.
    if (k === undefined && entrant.numero) k = parNumero.get(String(entrant.numero))
    if (k === undefined) {
      resultat.push({ ...entrant })
      if (id) index.set(id, resultat.length - 1)
      if (entrant.numero) parNumero.set(String(entrant.numero), resultat.length - 1)
      continue
    }
    const champs = Object.fromEntries(Object.entries(entrant).filter(([, v]) => defini(v)))
    // Retrouvé par numéro avec un id divergent : l'id existant fait foi.
    if (id && resultat[k].id && String(resultat[k].id) !== id) delete champs.id
    resultat[k] = { ...resultat[k], ...champs }
  }
  return resultat
}

function fusionnerNiveau(
  existants: Noeud[] = [],
  entrants: Noeud[] = [],
  enfant: 'sousDomaines' | 'sousSousDomaines' | null,
): Noeud[] {
  const resultat = (existants || []).map(n => ({ ...n }))

  for (const entrant of entrants || []) {
    if (!entrant) continue
    const k = resultat.findIndex(n => memeNoeud(n, entrant))
    if (k === -1) {
      resultat.push({ ...entrant })
      continue
    }
    const base = resultat[k]
    const fusion: Noeud = {
      ...base,
      ...patch(entrant),
      items: fusionnerItemsIA(base.items, entrant.items),
    }
    if (enfant) {
      fusion[enfant] = fusionnerNiveau(base[enfant] || [], entrant[enfant] || [], enfant === 'sousDomaines' ? 'sousSousDomaines' : null)
    }
    resultat[k] = fusion
  }
  return resultat
}

/**
 * Fusionne les domaines proposés par l'IA dans la checklist existante.
 * Retourne une nouvelle liste (aucune mutation des entrées).
 */
export function fusionnerDomainesIA<T extends Noeud>(existants: T[], entrants: Noeud[] | null | undefined): T[] {
  return fusionnerNiveau(existants as Noeud[], Array.isArray(entrants) ? entrants : [], 'sousDomaines') as T[]
}

/** Identifiants des domaines touchés par l'IA (pour surligner les propositions). */
export function domainesTouchesIA(entrants: Noeud[] | null | undefined): Set<string> {
  const cles = new Set<string>()
  for (const d of entrants || []) {
    if (d?.id) cles.add(`id:${d.id}`)
    if (d?.nom) cles.add(`nom:${d.nom}`)
  }
  return cles
}

export function domaineEstTouche(domaine: Noeud, cles: Set<string>): boolean {
  if (domaine?.id && cles.has(`id:${domaine.id}`)) return true
  if (domaine?.nom && cles.has(`nom:${domaine.nom}`)) return true
  return false
}
