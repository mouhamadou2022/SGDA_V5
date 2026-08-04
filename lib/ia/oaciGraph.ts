// lib/ia/oaciGraph.ts
// Graphe unifié OACI → risques → écarts.
// Relie chaque critère OACI C1-C5 aux barrières Bow-Tie qu'il pilote, aux
// domaines qu'elles protègent et aux écarts qui y sont rattachés. La chaîne
// causale est :  Critère → Barrière (Bow-Tie) → Domaine → Écart.
// Réutilise les moteurs existants (generateBowTieModels, types BowTieModele)
// et reste purement déterministe et testable — aucune écriture, aucun réseau.

import type { Ecart, EvenementSecurite, ProfilRisque, Surveillance } from '@/lib/store'
import type { Barriere } from '@/lib/risque/types'
import { generateBowTieModels } from '@/lib/risque/bowTieEngine'

export type CleCritereOaci = 'c1' | 'c2' | 'c3' | 'c4' | 'c5'

export type NoeudOaci =
  | { id: string; type: 'critere'; cle: CleCritereOaci; label: string; valeur: number; poids: number; force: 'critique' | 'eleve' | 'moyen' | 'faible' }
  | { id: string; type: 'domaine'; code: string; niveauRisque: string; probabiliteResiduelle: number; nbEcarts: number }
  | { id: string; type: 'barriere'; idBar: string; nom: string; typeBar: 'preventive' | 'corrective'; efficacite: number; domaine: string; cle: CleCritereOaci }
  | { id: string; type: 'ecart'; ecartId: string; niveau: string; domaine: string | null; statut: string }

export type TypeAreteOaci = 'pilote' | 'porte' | 'rattache' | 'charge'

export interface AreteOaci {
  source: string
  cible: string
  type: TypeAreteOaci
}

export interface GrapheOaci {
  noeuds: NoeudOaci[]
  aretes: AreteOaci[]
  stats: {
    nbCriteres: number
    nbDomaines: number
    nbBarrieres: number
    nbEcarts: number
    nbAretes: number
    barrieresFaibles: number
    ecartsCritiques: number
    domainesDegrades: number
  }
}

export interface ImpactOaci {
  id: string
  type: NoeudOaci['type']
  impact: number
  chemin: string[]
}

const POIDS: Record<CleCritereOaci, number> = { c1: 20, c2: 25, c3: 20, c4: 20, c5: 15 }
const LABELS: Record<CleCritereOaci, string> = {
  c1: 'Maturité & culture SGS', c2: 'Efficacité PAC', c3: 'Conformité technique',
  c4: 'Charge critique', c5: 'Résilience',
}
const POIDS_ARETE: Record<TypeAreteOaci, number> = { pilote: 0.7, porte: 0.5, rattache: 0.85, charge: 1 }

function forceCritere(valeur: number): 'critique' | 'eleve' | 'moyen' | 'faible' {
  if (valeur < 30) return 'critique'
  if (valeur < 50) return 'eleve'
  if (valeur < 70) return 'moyen'
  return 'faible'
}

/** Attribue la barrière Bow-Tie au critère qui pilote son efficacité. */
function critereDeBarriere(b: Barriere): CleCritereOaci {
  if (b.type === 'corrective') return 'c2'
  return 'c1'
}

/**
 * Construit le graphe unifié à partir des données réelles de l'aérodrome.
 * @param statut_sgs  si 'non_applicable', le domaine SGS est exclu (cohérent
 *                    avec generateBowTieModels).
 */
export function construireGrapheOaci(params: {
  profil: ProfilRisque
  ecarts: Ecart[]
  surveillances: Surveillance[]
  evenements?: EvenementSecurite[]
  statut_sgs?: string
}): GrapheOaci {
  const { profil, ecarts, surveillances, evenements, statut_sgs } = params
  const modeles = generateBowTieModels(profil, ecarts, surveillances, evenements, statut_sgs)

  const noeuds: NoeudOaci[] = []
  const aretes: AreteOaci[] = []
  const ids = new Set<string>()

  const ajouter = (n: NoeudOaci) => {
    if (ids.has(n.id)) return
    ids.add(n.id)
    noeuds.push(n)
  }

  // ── Critères OACI (C1-C5) ──
  for (const cle of Object.keys(POIDS) as CleCritereOaci[]) {
    const valeur = (profil[cle] as number) ?? 50
    ajouter({ id: `critere_${cle}`, type: 'critere', cle, label: LABELS[cle], valeur, poids: POIDS[cle], force: forceCritere(valeur) })
  }

  // ── Domaines Bow-Tie, barrières et écarts ──
  for (const modele of modeles) {
    const domaineId = `domaine_${modele.domaine}`
    const ecartsDom = ecarts.filter(e => e.domaine === modele.domaine && e.statut !== 'cloture')
    ajouter({
      id: domaineId, type: 'domaine', code: modele.domaine,
      niveauRisque: modele.niveauRisqueResiduel,
      probabiliteResiduelle: modele.probabiliteResiduelle,
      nbEcarts: ecartsDom.length,
    })

    // Conformité technique (C3) et résilience (C5) pilotent le domaine
    if (modele.domaine !== 'SGS') {
      aretes.push({ source: 'critere_c3', cible: domaineId, type: 'pilote' })
    }
    aretes.push({ source: 'critere_c5', cible: domaineId, type: 'pilote' })

    // Barrières du domaine
    const toutes = [...modele.barrieresPreventives, ...modele.barrieresCorrectives]
    for (const b of toutes) {
      const barId = `barriere_${b.id}`
      ajouter({ id: barId, type: 'barriere', idBar: b.id, nom: b.nom, typeBar: b.type, efficacite: b.efficacite, domaine: modele.domaine, cle: critereDeBarriere(b) })
      aretes.push({ source: `critere_${critereDeBarriere(b)}`, cible: barId, type: 'pilote' })
      aretes.push({ source: barId, cible: domaineId, type: 'porte' })
    }

    // Écarts rattachés au domaine ; les critiques relèvent de la charge C4
    for (const e of ecartsDom) {
      const ecartId = `ecart_${e.id}`
      ajouter({ id: ecartId, type: 'ecart', ecartId: e.id, niveau: e.niveau_risque, domaine: e.domaine, statut: e.statut })
      aretes.push({ source: domaineId, cible: ecartId, type: 'rattache' })
      if (e.niveau_risque === 'critique') {
        aretes.push({ source: 'critere_c4', cible: ecartId, type: 'charge' })
      }
    }
  }

  // ── Statistiques ──
  const barrieres = noeuds.filter(n => n.type === 'barriere') as Extract<NoeudOaci, { type: 'barriere' }>[]
  const ecartsN = noeuds.filter(n => n.type === 'ecart') as Extract<NoeudOaci, { type: 'ecart' }>[]
  const domaines = noeuds.filter(n => n.type === 'domaine') as Extract<NoeudOaci, { type: 'domaine' }>[]

  return {
    noeuds, aretes,
    stats: {
      nbCriteres: noeuds.filter(n => n.type === 'critere').length,
      nbDomaines: domaines.length,
      nbBarrieres: barrieres.length,
      nbEcarts: ecartsN.length,
      nbAretes: aretes.length,
      barrieresFaibles: barrieres.filter(b => b.efficacite < 50).length,
      ecartsCritiques: ecartsN.filter(e => e.niveau === 'critique').length,
      domainesDegrades: domaines.filter(d => d.niveauRisque === 'critique' || d.niveauRisque === 'eleve').length,
    },
  }
}

/**
 * Propage l'impact d'un critère dans le graphe (BFS multiplicatif).
 * Impact = produit des poids des arêtes parcourues (décroît avec la distance).
 */
export function calculerImpactCritere(g: GrapheOaci, critereId: string): ImpactOaci[] {
  const parId = new Map(g.noeuds.map(n => [n.id, n]))
  const adj = new Map<string, { cible: string; type: TypeAreteOaci }[]>()
  for (const a of g.aretes) {
    const list = adj.get(a.source) ?? []
    list.push({ cible: a.cible, type: a.type })
    adj.set(a.source, list)
  }

  const visites = new Set<string>([critereId])
  const resultats: ImpactOaci[] = []
  const queue: Array<{ id: string; impact: number; chemin: string[] }> = [{ id: critereId, impact: 1, chemin: [critereId] }]

  while (queue.length > 0) {
    const { id, impact, chemin } = queue.shift()!
    const voisins = adj.get(id) ?? []
    for (const v of voisins) {
      if (visites.has(v.cible)) continue
      visites.add(v.cible)
      const newImpact = impact * POIDS_ARETE[v.type]
      const noeud = parId.get(v.cible)
      if (noeud) {
        resultats.push({ id: v.cible, type: noeud.type, impact: Math.round(newImpact * 100) / 100, chemin: [...chemin, v.cible] })
      }
      queue.push({ id: v.cible, impact: newImpact, chemin: [...chemin, v.cible] })
    }
  }

  return resultats.sort((a, b) => b.impact - a.impact)
}

/** Libellé court d'un identifiant de nœud (sans préfixe). */
export function libelleNoeud(id: string): string {
  return id.replace(/^critere_|^domaine_|^barriere_|^ecart_/, '')
}