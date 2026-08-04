// lib/risque/ftaEngine.ts
// FTA — Fault Tree Analysis (Arbre de Défaillance)
// Approche top-down (complément du BowTie) : part d'un événement sommet
// (ex. « perte de capacité SSLIA », « incursion de piste ») et décompose
// les combinaisons de causes via des portes ET/OU.
// Sert l'investigation d'événements et la recherche de causes racines —
// c'est exactement le côté gauche (barrières préventives) d'un BowTie.

export type PorteFTA = 'ET' | 'OU'
export type TypeNoeudFTA = 'sommet' | 'intermediaire' | 'cause'
export type FacteurFTA = 'humain' | 'technique' | 'environnemental' | 'organisationnel'

export interface NoeudFTA {
  id: string
  parentId?: string
  label: string
  type: TypeNoeudFTA
  /** Porte logique pour les nœuds qui ont des enfants (ET = tous, OU = au moins un) */
  porte?: PorteFTA
  /** Probabilité de base (0-100 %) — les causes fondamentales portent des valeurs */
  probabilite: number
  /** État de l'analyse : cause présente / absente / non déterminée */
  estPresent?: boolean | null
  facteur?: FacteurFTA
  /** Mots-clés de correspondance avec evenement.causes pour pré-remplir l'analyse */
  causeRef?: string[]
}

export interface ArbreFTA {
  id: string
  evenementId: string
  aerodromeId: string
  domaine: string
  evenementLabel: string
  templateId: string
  sommetId: string
  noeuds: NoeudFTA[]
  statut: 'en_cours' | 'termine'
  /** Résultats calculés (persistés en base) */
  probabilite_sommet?: number
  nb_coupes_minimales?: number
  causes_identifiees?: string[]
  created_at: string
  updated_at: string
}

export interface CalculArbre {
  probabiliteSommet: number
  coupesMinimales: string[][]
  noeuds: NoeudFTA[]
}

// ─────────────────────────────────────────────────────────────
// TEMPLATES — arbres de référence par type d'événement
// ─────────────────────────────────────────────────────────────

interface TemplateNoeud {
  id: string
  parentId?: string
  label: string
  type: TypeNoeudFTA
  porte?: PorteFTA
  probabilite: number
  facteur?: FacteurFTA
  causeRef?: string[]
}

export interface TemplateFTA {
  id: string
  domaine: string
  libelle: string
  matching: string[]
  noeuds: TemplateNoeud[]
}

function n(id: string, parentId: string | undefined, label: string, type: TypeNoeudFTA, opts: Partial<TemplateNoeud> = {}): TemplateNoeud {
  return { id, parentId, label, type, probabilite: 0, ...opts }
}

export const TEMPLATES_FTA: TemplateFTA[] = [
  {
    id: 'perte-capacite-sslia',
    domaine: 'SLI',
    libelle: 'Perte de capacité SSLIA',
    matching: ['sslai', 'incendie', 'sauvetage', 'lutte contre', 'extinction', 'pompier'],
    noeuds: [
      n('s0', undefined, 'Perte de capacité SSLIA', 'sommet', { porte: 'OU' }),
      n('i1', 's0', 'Véhicules d\'extinction inopérants', 'intermediaire', { porte: 'OU' }),
      n('b1', 'i1', 'Panne de pompe à incendie', 'cause', { probabilite: 20, facteur: 'technique', causeRef: ['pompe', 'véhicule', 'extinction'] }),
      n('b2', 'i1', 'Panne moteur du véhicule', 'cause', { probabilite: 15, facteur: 'technique', causeRef: ['moteur', 'véhicule'] }),
      n('b3', 'i1', 'Maintenance préventive non réalisée', 'cause', { probabilite: 25, facteur: 'organisationnel', causeRef: ['maintenance'] }),
      n('i2', 's0', 'Effectif SSLIA insuffisant', 'intermediaire', { porte: 'OU' }),
      n('b4', 'i2', 'Absentéisme non compensé', 'cause', { probabilite: 20, facteur: 'humain', causeRef: ['effectif', 'personnel', 'absent'] }),
      n('b5', 'i2', 'Sous-effectif chronique', 'cause', { probabilite: 30, facteur: 'organisationnel', causeRef: ['effectif', 'recrutement'] }),
      n('b6', 's0', 'Agent extincteur insuffisant', 'cause', { probabilite: 25, facteur: 'organisationnel', causeRef: ['extincteur', 'mousse', 'agent'] }),
      n('i3', 's0', 'Temps d\'intervention dépassé', 'intermediaire', { porte: 'OU' }),
      n('b7', 'i3', 'Poste de veille mal positionné', 'cause', { probabilite: 15, facteur: 'organisationnel', causeRef: ['poste', 'veille'] }),
      n('b8', 'i3', 'Procédure d\'alerte défaillante', 'cause', { probabilite: 20, facteur: 'organisationnel', causeRef: ['alerte', 'procédure', 'coordination'] }),
    ],
  },
  {
    id: 'incursion-piste',
    domaine: 'PHY',
    libelle: 'Incursion de piste',
    matching: ['incursion sur piste', 'présence indésirable', 'incursion', 'roulage non conforme'],
    noeuds: [
      n('s0', undefined, 'Incursion de piste', 'sommet', { porte: 'OU' }),
      n('i1', 's0', 'Coordination ATC / équipage défaillante', 'intermediaire', { porte: 'OU' }),
      n('b1', 'i1', 'Clairance erronée', 'cause', { probabilite: 20, facteur: 'humain', causeRef: ['clairance', 'atc', 'contrôle'] }),
      n('b2', 'i1', 'Incompréhension des instructions', 'cause', { probabilite: 25, facteur: 'humain', causeRef: ['instruction', 'communication'] }),
      n('i2', 's0', 'Guidage au sol défaillant', 'intermediaire', { porte: 'OU' }),
      n('b3', 'i2', 'Signalisation au sol effacée', 'cause', { probabilite: 20, facteur: 'technique', causeRef: ['signalisation', 'marquage'] }),
      n('b4', 'i2', 'Balisage lumineux en panne', 'cause', { probabilite: 15, facteur: 'technique', causeRef: ['balisage', 'feux'] }),
      n('b5', 's0', 'Procédure non respectée par l\'équipage', 'cause', { probabilite: 30, facteur: 'humain', causeRef: ['procédure', 'équipage'] }),
      n('i3', 's0', 'Travaux / présence non coordonnée', 'intermediaire', { porte: 'OU' }),
      n('b6', 'i3', 'Permis de travail non appliqué', 'cause', { probabilite: 20, facteur: 'organisationnel', causeRef: ['travaux', 'permis'] }),
      n('b7', 'i3', 'Engin de chantier non escorté', 'cause', { probabilite: 15, facteur: 'organisationnel', causeRef: ['engin', 'travaux', 'escorte'] }),
    ],
  },
  {
    id: 'panne-balisage',
    domaine: 'ELEC',
    libelle: 'Perte du balisage lumineux',
    matching: ['balisage', 'feux', 'lumineux', 'éclairage', 'alimentation'],
    noeuds: [
      n('s0', undefined, 'Perte du balisage lumineux', 'sommet', { porte: 'OU' }),
      n('i1', 's0', 'Alimentation électrique coupée', 'intermediaire', { porte: 'OU' }),
      n('b1', 'i1', 'Défaut du réseau externe', 'cause', { probabilite: 15, facteur: 'environnemental', causeRef: ['réseau', 'coupure'] }),
      n('b2', 'i1', 'Transformateur hors service', 'cause', { probabilite: 10, facteur: 'technique', causeRef: ['transformateur'] }),
      n('i2', 's0', 'Secours électrique indisponible', 'intermediaire', { porte: 'OU' }),
      n('b3', 'i2', 'Groupe électrogène en panne', 'cause', { probabilite: 15, facteur: 'technique', causeRef: ['groupe', 'génératrice'] }),
      n('b4', 'i2', 'Batterie de secours déchargée', 'cause', { probabilite: 20, facteur: 'technique', causeRef: ['batterie'] }),
      n('b5', 's0', 'Contrôleur de balisage défaillant', 'cause', { probabilite: 20, facteur: 'technique', causeRef: ['contrôleur'] }),
      n('b6', 's0', 'Maintenance préventive non réalisée', 'cause', { probabilite: 25, facteur: 'organisationnel', causeRef: ['maintenance'] }),
    ],
  },
  {
    id: 'sortie-piste',
    domaine: 'PHY',
    libelle: 'Sortie de piste',
    matching: ['sortie de piste', 'contamination de la piste', 'glissance', 'atterrissage'],
    noeuds: [
      n('s0', undefined, 'Sortie de piste', 'sommet', { porte: 'OU' }),
      n('i1', 's0', 'Perte d\'adhérence', 'intermediaire', { porte: 'OU' }),
      n('b1', 'i1', 'Revêtement usé ou glissant', 'cause', { probabilite: 20, facteur: 'technique', causeRef: ['revêtement', 'adhérence', 'glissance'] }),
      n('b2', 'i1', 'Contamination de la piste', 'cause', { probabilite: 25, facteur: 'environnemental', causeRef: ['contamination', 'dépôt'] }),
      n('i2', 's0', 'Approche non stabilisée', 'intermediaire', { porte: 'OU' }),
      n('b3', 'i2', 'Météo dégradée', 'cause', { probabilite: 20, facteur: 'environnemental', causeRef: ['météo', 'vent', 'pluie'] }),
      n('b4', 'i2', 'Erreur de pilotage', 'cause', { probabilite: 20, facteur: 'humain', causeRef: ['équipage', 'pilotage'] }),
      n('b5', 's0', 'Freinage inefficace', 'cause', { probabilite: 15, facteur: 'technique', causeRef: ['frein'] }),
    ],
  },
  {
    id: 'collision-animaliere',
    domaine: 'RA',
    libelle: 'Péril animalier',
    matching: ['péril animalier', 'animal', 'faune', 'oiseau', 'bird'],
    noeuds: [
      n('s0', undefined, 'Collision animal / aéronef', 'sommet', { porte: 'OU' }),
      n('b1', 's0', 'Faune présente sur l\'aire de mouvement', 'cause', { probabilite: 30, facteur: 'environnemental', causeRef: ['faune', 'animal'] }),
      n('b2', 's0', 'Effarouchement inefficace', 'cause', { probabilite: 25, facteur: 'organisationnel', causeRef: ['effarouchement'] }),
      n('b3', 's0', 'Abords attractifs (décharges, mares)', 'cause', { probabilite: 30, facteur: 'environnemental', causeRef: ['décharge', 'mare', 'abords'] }),
      n('b4', 's0', 'Patrouilles de prévention insuffisantes', 'cause', { probabilite: 20, facteur: 'organisationnel', causeRef: ['patrouille', 'prévention'] }),
    ],
  },
  {
    id: 'fod',
    domaine: 'PHY',
    libelle: 'Objet étranger (FOD)',
    matching: ['fod', 'objet étranger', 'débris'],
    noeuds: [
      n('s0', undefined, 'Dommage lié à un objet étranger (FOD)', 'sommet', { porte: 'OU' }),
      n('i1', 's0', 'Objet présent sur la piste', 'intermediaire', { porte: 'OU' }),
      n('b1', 'i1', 'Nettoyage insuffisant', 'cause', { probabilite: 25, facteur: 'organisationnel', causeRef: ['nettoyage'] }),
      n('b2', 'i1', 'Débris de travaux non évacués', 'cause', { probabilite: 20, facteur: 'organisationnel', causeRef: ['travaux', 'débris'] }),
      n('i2', 's0', 'Objet non détecté', 'intermediaire', { porte: 'OU' }),
      n('b3', 'i2', 'Inspection de piste insuffisante', 'cause', { probabilite: 25, facteur: 'organisationnel', causeRef: ['inspection'] }),
      n('b4', 'i2', 'Détection FOD indisponible', 'cause', { probabilite: 15, facteur: 'technique', causeRef: ['détection'] }),
    ],
  },
  {
    id: 'non-respect-procedures',
    domaine: 'OPS',
    libelle: 'Non-respect des procédures',
    matching: ['non mise en oeuvre', 'non mise en œuvre', 'procédure', 'procédures', 'facteurs humains'],
    noeuds: [
      n('s0', undefined, 'Non-respect des procédures opérationnelles', 'sommet', { porte: 'OU' }),
      n('b1', 's0', 'Procédures obsolètes ou inadaptées', 'cause', { probabilite: 20, facteur: 'organisationnel', causeRef: ['procédure', 'documentation'] }),
      n('b2', 's0', 'Formation insuffisante', 'cause', { probabilite: 25, facteur: 'organisationnel', causeRef: ['formation'] }),
      n('b3', 's0', 'Supervision défaillante', 'cause', { probabilite: 25, facteur: 'organisationnel', causeRef: ['supervision', 'encadrement'] }),
      n('b4', 's0', 'Charge de travail excessive', 'cause', { probabilite: 20, facteur: 'humain', causeRef: ['charge', 'pression'] }),
      n('b5', 's0', 'Culture sécurité faible', 'cause', { probabilite: 20, facteur: 'organisationnel', causeRef: ['culture', 'sécurité'] }),
    ],
  },
  {
    id: 'generique',
    domaine: 'SGS',
    libelle: 'Analyse causale générique',
    matching: [],
    noeuds: [
      n('s0', undefined, 'Événement de sécurité', 'sommet', { porte: 'OU' }),
      n('b1', 's0', 'Facteurs humains', 'cause', { probabilite: 25, facteur: 'humain', causeRef: ['humain', 'personnel'] }),
      n('b2', 's0', 'Défaillance technique', 'cause', { probabilite: 25, facteur: 'technique', causeRef: ['technique', 'équipement', 'panne'] }),
      n('b3', 's0', 'Facteurs environnementaux', 'cause', { probabilite: 20, facteur: 'environnemental', causeRef: ['météo', 'environnement'] }),
      n('b4', 's0', 'Facteurs organisationnels', 'cause', { probabilite: 30, facteur: 'organisationnel', causeRef: ['organisation', 'procédure', 'gestion'] }),
    ],
  },
]

export function getTemplateParId(id: string): TemplateFTA {
  return TEMPLATES_FTA.find((t) => t.id === id) ?? TEMPLATES_FTA[TEMPLATES_FTA.length - 1]
}

/**
 * Choisit le template le plus pertinent pour un événement à partir de son type,
 * de sa description et de ses causes déclarées.
 */
export function getTemplatePourEvenement(evenement: {
  type?: string
  description?: string
  causes?: string[]
}): TemplateFTA {
  const corpus = [
    evenement.type || '',
    evenement.description || '',
    ...(evenement.causes || []),
  ].join(' ').toLowerCase()

  const trouve = TEMPLATES_FTA.find((t) =>
    t.matching.some((m) => corpus.includes(m.toLowerCase()))
  )
  return trouve ?? getTemplateParId('generique')
}

export function creerArbreDepuisTemplate(evenement: {
  id: string
  aerodrome_id: string
  type?: string
  description?: string
  causes?: string[]
}, arbreId?: string): ArbreFTA {
  const template = getTemplatePourEvenement(evenement)
  const now = new Date().toISOString()
  const sommet = template.noeuds.find((n) => n.type === 'sommet')
  const noeuds: NoeudFTA[] = template.noeuds.map((t) => ({
    id: t.id,
    parentId: t.parentId,
    label: t.label,
    type: t.type,
    porte: t.porte,
    probabilite: t.probabilite,
    estPresent: null,
    facteur: t.facteur,
    causeRef: t.causeRef,
  }))
  return {
    id: arbreId || crypto.randomUUID(),
    evenementId: evenement.id,
    aerodromeId: evenement.aerodrome_id,
    domaine: template.domaine,
    evenementLabel: evenement.description || evenement.type || 'Événement',
    templateId: template.id,
    sommetId: sommet?.id || noeuds[0].id,
    noeuds,
    statut: 'en_cours',
    created_at: now,
    updated_at: now,
  }
}

/**
 * Pré-remplit les causes fondamentales depuis les données de l'événement
 * (evenement.causes + evenement.facteurs_contributifs).
 */
export function marquerCausesDepuisEvenement(noeuds: NoeudFTA[], evenement: {
  causes?: string[]
  facteurs_contributifs?: { humain: boolean; technique: boolean; environnemental: boolean; organisationnel: boolean }
}): NoeudFTA[] {
  const corpus = (evenement.causes || []).join(' ').toLowerCase()
  const f = evenement.facteurs_contributifs
  return noeuds.map((noeud) => {
    if (noeud.type !== 'cause') return noeud
    let present: boolean | null = null
    if (noeud.causeRef && corpus) {
      present = noeud.causeRef.some((mot) => corpus.includes(mot.toLowerCase()))
    }
    if (noeud.facteur && f) {
      const actif = f[noeud.facteur]
      if (actif) present = present !== false ? true : present
    }
    return { ...noeud, estPresent: present }
  })
}

// ─────────────────────────────────────────────────────────────
// CALCULS
// ─────────────────────────────────────────────────────────────

function enfantsDe(noeuds: NoeudFTA[], id: string): NoeudFTA[] {
  return noeuds.filter((n) => n.parentId === id)
}

/** Probabilité (0-100 %) d'un nœud : cause = probabilite, ET = produit, OU = 1 − ∏(1−p). */
export function calculerProbabiliteNoeud(noeuds: NoeudFTA[], id: string): number {
  const noeud = noeuds.find((n) => n.id === id)
  if (!noeud) return 0
  if (noeud.type === 'cause') return noeud.probabilite
  const enfants = enfantsDe(noeuds, id)
  if (enfants.length === 0) return noeud.probabilite || 0
  if (noeud.porte === 'ET') {
    return enfants.reduce((acc, e) => (acc * calculerProbabiliteNoeud(noeuds, e.id)) / 100, 100)
  }
  const pNon = enfants.reduce((acc, e) => acc * (1 - calculerProbabiliteNoeud(noeuds, e.id) / 100), 1)
  return Math.round(100 * (1 - pNon) * 100) / 100
}

export function calculerProbabiliteSommet(noeuds: NoeudFTA[], sommetId: string): number {
  return Math.round(calculerProbabiliteNoeud(noeuds, sommetId) * 100) / 100
}

/** Coupes minimales : combinaisons minimales de causes fondamentales qui déclenchent l'événement sommet. */
export function calculerCoupesMinimales(noeuds: NoeudFTA[], sommetId: string): string[][] {
  const memo = new Map<string, string[][]>()
  const rec = (id: string): string[][] => {
    if (memo.has(id)) return memo.get(id)!
    const noeud = noeuds.find((n) => n.id === id)
    if (!noeud) return []
    if (noeud.type === 'cause') {
      memo.set(id, [[id]])
      return [[id]]
    }
    const enfants = enfantsDe(noeuds, id)
    if (enfants.length === 0) {
      memo.set(id, [[id]])
      return [[id]]
    }
    let result: string[][]
    if (noeud.porte === 'ET') {
      // Produit cartésien des coupes des enfants
      result = [[]]
      for (const e of enfants) {
        const coupesEnfant = rec(e.id)
        result = result.flatMap((r) => coupesEnfant.map((c) => [...new Set([...r, ...c])]))
      }
    } else {
      // OU : union
      result = []
      const vus = new Set<string>()
      for (const e of enfants) {
        for (const coupe of rec(e.id)) {
          const cle = [...coupe].sort().join(',')
          if (!vus.has(cle)) {
            vus.add(cle)
            result.push(coupe)
          }
        }
      }
    }
    memo.set(id, result)
    return result
  }
  return rec(sommetId)
}

/** Calcule probabilité du sommet + coupes minimales + noeuds annotés de leur probabilité. */
export function calculerArbre(arbre: ArbreFTA): CalculArbre {
  const probabiliteSommet = calculerProbabiliteSommet(arbre.noeuds, arbre.sommetId)
  const coupesMinimales = calculerCoupesMinimales(arbre.noeuds, arbre.sommetId)
  const noeuds = arbre.noeuds.map((n) => ({ ...n, probabilite: calculerProbabiliteNoeud(arbre.noeuds, n.id) }))
  return { probabiliteSommet, coupesMinimales, noeuds }
}

/** Causes fondamentales marquées comme présentes. */
export function getCausesPresentes(noeuds: NoeudFTA[]): NoeudFTA[] {
  return noeuds.filter((n) => n.type === 'cause' && n.estPresent === true)
}

/** Traduit la probabilité du sommet en niveau de risque (cohérent avec getRiskLevel). */
export function getNiveauProbaArbre(probabilite: number): 'critique' | 'eleve' | 'moyen' | 'faible' {
  if (probabilite >= 30) return 'critique'
  if (probabilite >= 15) return 'eleve'
  if (probabilite >= 5) return 'moyen'
  return 'faible'
}

export const FACTEUR_LABELS: Record<FacteurFTA, string> = {
  humain: 'Humain',
  technique: 'Technique',
  environnemental: 'Environnement',
  organisationnel: 'Organisation',
}

export const PROBA_ARBRE_COULEURS: Record<'critique' | 'eleve' | 'moyen' | 'faible', string> = {
  critique: '#dc2626',
  eleve: '#ea580c',
  moyen: '#eab308',
  faible: '#16a34a',
}
