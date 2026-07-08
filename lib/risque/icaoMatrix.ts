// lib/risque/icaoMatrix.ts
// Matrice risque ICAO Doc 9859 dynamique — probabilité × sévérité
// Calculée automatiquement à partir des données d'événements observés

export type ProbabiliteCategorie = 'frequente' | 'probable' | 'occasionnelle' | 'improbable' | 'tres_improbable'
export type SeveriteCategorie = 'catastrophique' | 'critique' | 'majeur' | 'mineur' | 'negligeable'
export type NiveauRisqueICAO = 'critique' | 'eleve' | 'moyen' | 'faible'

// Conversion depuis NiveauRisque (5 niveaux, inclut 'tres_faible') vers NiveauRisqueICAO (4 niveaux, sans 'tres_faible')
export function niveau5to4(n: string): NiveauRisqueICAO {
  return n === 'tres_faible' ? 'faible' : n as NiveauRisqueICAO
}

export interface ICaoCell {
  probabilite: ProbabiliteCategorie
  severite: SeveriteCategorie
  niveau: NiveauRisqueICAO
  freqObservee: number
  graviteMoyenne: number
  nbEvenements: number
}

export interface EvenementPourMatrice {
  type: string
  gravite: string
  date: string
}

// Seuils de fréquence (événements par année)
const SEUILS_FREQUENCE = [
  { max: Infinity, label: 'frequente' as ProbabiliteCategorie, desc: '> 12/an' },
  { max: 12, label: 'probable' as ProbabiliteCategorie, desc: '4-12/an' },
  { max: 4, label: 'occasionnelle' as ProbabiliteCategorie, desc: '1-4/an' },
  { max: 1, label: 'improbable' as ProbabiliteCategorie, desc: '< 1/an' },
  { max: 0.25, label: 'tres_improbable' as ProbabiliteCategorie, desc: '~ 1/4 ans' },
]

// Tableau des sévérités observées → catégorie
const GRAVITE_SEUILS: Record<string, number> = {
  CRITIQUE: 5,
  ORANGE: 4,
  JAUNE: 3,
  GRIS: 2,
  BLEU: 1,
}

// Matrice ICAO (probabilité × sévérité → niveau de risque)
const MATRICE_ICAO: Record<ProbabiliteCategorie, Record<SeveriteCategorie, NiveauRisqueICAO>> = {
  frequente: {
    catastrophique: 'critique',
    critique: 'critique',
    majeur: 'eleve',
    mineur: 'moyen',
    negligeable: 'moyen',
  },
  probable: {
    catastrophique: 'critique',
    critique: 'eleve',
    majeur: 'eleve',
    mineur: 'moyen',
    negligeable: 'faible',
  },
  occasionnelle: {
    catastrophique: 'eleve',
    critique: 'eleve',
    majeur: 'moyen',
    mineur: 'moyen',
    negligeable: 'faible',
  },
  improbable: {
    catastrophique: 'eleve',
    critique: 'moyen',
    majeur: 'moyen',
    mineur: 'faible',
    negligeable: 'faible',
  },
  tres_improbable: {
    catastrophique: 'moyen',
    critique: 'moyen',
    majeur: 'faible',
    mineur: 'faible',
    negligeable: 'faible',
  },
}

function getProbabiliteCategorie(freqAnnuelle: number): ProbabiliteCategorie {
  for (const seuil of SEUILS_FREQUENCE) {
    if (freqAnnuelle <= seuil.max) return seuil.label
  }
  return 'tres_improbable'
}

function getSeveriteCategorie(graviteMoyenne: number): SeveriteCategorie {
  if (graviteMoyenne >= 4.5) return 'catastrophique'
  if (graviteMoyenne >= 3.5) return 'critique'
  if (graviteMoyenne >= 2.5) return 'majeur'
  if (graviteMoyenne >= 1.5) return 'mineur'
  return 'negligeable'
}

/**
 * Calcule la matrice risque ICAO dynamique à partir des événements observés.
 * Pour chaque type d'événement :
 * - Fréquence annuelle → catégorie de probabilité
 * - Gravité moyenne → catégorie de sévérité
 * - Croisement → niveau de risque ICAO
 */
export function computeICaoMatrix(
  evenements: EvenementPourMatrice[],
  periodeJours: number = 365
): Map<string, ICaoCell> {
  const result = new Map<string, ICaoCell>()
  if (evenements.length === 0) return result

  // Grouper par type
  const groupes: Record<string, { gravites: number[]; dates: string[] }> = {}
  evenements.forEach(e => {
    const type = e.type || 'Autre'
    if (!groupes[type]) groupes[type] = { gravites: [], dates: [] }
    groupes[type].gravites.push(GRAVITE_SEUILS[e.gravite] || 1)
    groupes[type].dates.push(e.date)
  })

  // Période réelle d'observation
  const datesTriees = evenements.map(e => new Date(e.date).getTime()).sort()
  const periodeReelle = datesTriees.length >= 2
    ? (datesTriees[datesTriees.length - 1] - datesTriees[0]) / (1000 * 60 * 60 * 24)
    : periodeJours

  for (const [type, data] of Object.entries(groupes)) {
    const nbEvenements = data.gravites.length
    const freqAnnuelle = nbEvenements / Math.max(periodeReelle, 1) * 365
    const graviteMoyenne = data.gravites.reduce((s, g) => s + g, 0) / nbEvenements

    const proba = getProbabiliteCategorie(freqAnnuelle)
    const sev = getSeveriteCategorie(graviteMoyenne)
    const niveau = MATRICE_ICAO[proba][sev]

    result.set(type, {
      probabilite: proba,
      severite: sev,
      niveau,
      freqObservee: Math.round(freqAnnuelle * 10) / 10,
      graviteMoyenne: Math.round(graviteMoyenne * 10) / 10,
      nbEvenements,
    })
  }

  return result
}

/**
 * Calcule le niveau de risque ICAO global (plus haut niveau parmi tous les types)
 */
export function computeGlobalICaoRisk(evenements: EvenementPourMatrice[]): {
  niveau: NiveauRisqueICAO
  typePire: string | null
  matrice: Map<string, ICaoCell>
} {
  const matrice = computeICaoMatrix(evenements)
  const niveaux: NiveauRisqueICAO[] = ['critique', 'eleve', 'moyen', 'faible']
  let pireNiveau: NiveauRisqueICAO = 'faible'
  let pireType: string | null = null

  matrice.forEach((cell, type) => {
    const idxPire = niveaux.indexOf(pireNiveau)
    const idxCell = niveaux.indexOf(cell.niveau)
    if (idxCell < idxPire) {
      pireNiveau = cell.niveau
      pireType = type
    }
  })

  return { niveau: pireNiveau, typePire: pireType, matrice }
}

/**
 * Retourne les labels de la matrice ICAO pour l'affichage
 */
export function getICaoLabels() {
  return {
    probabilite: [
      { value: 'frequente' as ProbabiliteCategorie, label: 'Fréquente', desc: '> 12/an' },
      { value: 'probable' as ProbabiliteCategorie, label: 'Probable', desc: '4-12/an' },
      { value: 'occasionnelle' as ProbabiliteCategorie, label: 'Occasionnelle', desc: '1-4/an' },
      { value: 'improbable' as ProbabiliteCategorie, label: 'Improbable', desc: '< 1/an' },
      { value: 'tres_improbable' as ProbabiliteCategorie, label: 'Très improbable', desc: '~ 1/4 ans' },
    ],
    severite: [
      { value: 'catastrophique' as SeveriteCategorie, label: 'Catastrophique', desc: 'Score ≥ 4.5' },
      { value: 'critique' as SeveriteCategorie, label: 'Critique', desc: 'Score 3.5-4.4' },
      { value: 'majeur' as SeveriteCategorie, label: 'Majeur', desc: 'Score 2.5-3.4' },
      { value: 'mineur' as SeveriteCategorie, label: 'Mineur', desc: 'Score 1.5-2.4' },
      { value: 'negligeable' as SeveriteCategorie, label: 'Négligeable', desc: 'Score < 1.5' },
    ],
    niveaux: [
      { value: 'critique' as NiveauRisqueICAO, label: 'Critique', color: 'danger' },
      { value: 'eleve' as NiveauRisqueICAO, label: 'Élevé', color: 'warning' },
      { value: 'moyen' as NiveauRisqueICAO, label: 'Moyen', color: 'primary' },
      { value: 'faible' as NiveauRisqueICAO, label: 'Faible', color: 'success' },
    ],
  }
}
