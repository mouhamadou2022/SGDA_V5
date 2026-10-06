// lib/evenementUtils.ts
import { EvenementSecurite } from './store'
import { GRAVITE_EVENEMENT } from './config'
import { getRiskLevelFromCell, getRiskLevelFromCell5 } from './risque/matrix'
import { GRAVITE_LABEL, PROBABILITE_LABEL } from './risque/amdecEngine'

/**
 * Niveaux de gravité d'un événement alignés sur les niveaux de risque
 * standard de l'app (critique / eleve / moyen / faible).
 */
type NiveauGraviteEvenement = 'critique' | 'eleve' | 'moyen' | 'faible'

const GRAVITE_RISQUE: Record<string, { label: string; classe: string }> = {
  critique: { label: 'Critique', classe: 'badge danger' },
  eleve:    { label: 'Élevé',    classe: 'badge eleve' },
  moyen:    { label: 'Moyen',    classe: 'badge moyen' },
  faible:   { label: 'Faible',   classe: 'badge success' },
}

// Ancienne échelle OACI 5 niveaux (CRITIQUE/ORANGE/JAUNE/GRIS/BLEU) → 4 niveaux de risque
const GRAVITE_LEGACY: Record<string, NiveauGraviteEvenement> = {
  CRITIQUE: 'critique', ORANGE: 'eleve', JAUNE: 'moyen', GRIS: 'faible', BLEU: 'faible',
}

/**
 * Normalise la gravité d'un événement vers les 4 niveaux de risque.
 * Gère les anciennes valeurs OACI 5 niveaux persistées ou reçues de l'API.
 */
/** Format cellule OACI : probabilité 1-5 + gravité A-E (ex. 2A, 4C). */
export const FORMAT_CELLULE_OACI = /^[1-5][A-E]$/i

/**
 * Listes fermées de saisie (aucune valeur invalide possible) — libellés
 * canoniques AMDEC/OACI (source unique : amdecEngine, pas de duplication).
 */
const ORDRE_PROBABILITE = ['5', '4', '3', '2', '1'] as const
const ORDRE_GRAVITE = ['A', 'B', 'C', 'D', 'E'] as const
export const PROBABILITE_OACI_OPTIONS = ORDRE_PROBABILITE.map(v => ({
  value: v,
  label: `${v} — ${PROBABILITE_LABEL[Number(v)]}`,
}))
export const GRAVITE_OACI_OPTIONS = ORDRE_GRAVITE.map(v => ({
  value: v,
  label: `${v} — ${GRAVITE_LABEL[v as keyof typeof GRAVITE_LABEL]}`,
}))

export function normaliserCellule(cellule: string | undefined | null): string | null {
  const c = (cellule || '').trim().toUpperCase()
  return FORMAT_CELLULE_OACI.test(c) ? c : null
}

/**
 * Gravité dérivée d'une cellule OACI via la matrice (référence unique).
 * 'tres_faible' matriciel → 'faible' événement (4 niveaux). null si format invalide.
 */
export function graviteDepuisCellule(cellule: string | undefined | null): NiveauGraviteEvenement | null {
  const c = normaliserCellule(cellule)
  if (!c) return null
  const niveau = getRiskLevelFromCell(c)
  if (niveau === 'tres_faible') return 'faible'
  if (niveau === 'critique' || niveau === 'eleve' || niveau === 'moyen' || niveau === 'faible') return niveau
  return 'moyen'
}

/**
 * Niveau matriciel 5 niveaux d'une cellule (null si invalide) — échelle fine
 * (avec 'tres_faible') pour comparer initial/résiduel : un initial 'faible'
 * admet un résiduel 'tres_faible' (ex. 1E), sinon aucun résiduel ne serait
 * jamais valable au plancher.
 */
export function niveauDepuisCellule(cellule: string | undefined | null): string | null {
  const c = normaliserCellule(cellule)
  if (!c) return null
  return getRiskLevelFromCell5(c)
}

/** Ordre croissant des niveaux (échelle matrice 5 niveaux). */
export const ORDRE_NIVEAU_RISQUE: Record<string, number> = {
  tres_faible: 0, faible: 1, moyen: 2, eleve: 3, critique: 4,
}

export function libelleNiveau5(niveau: string): string {
  const labels: Record<string, string> = {
    critique: 'Critique', eleve: 'Élevé', moyen: 'Moyen', faible: 'Faible', tres_faible: 'Très faible',
  }
  return labels[(niveau || '').toLowerCase()] || niveau
}

/**
 * Axes proposables pour le résiduel : seules les probabilités/gravités dont
 * AU MOINS une combinaison donne un niveau strictement inférieur à l'initial
 * (matrice canonique — guide l'exploitant AVANT l'erreur, pas après).
 */
export function axesResiduelCoherents(niveauInitial: string): { probas: string[]; gravites: string[] } {
  const ini = ORDRE_NIVEAU_RISQUE[(niveauInitial || '').toLowerCase()] ?? 99
  const probas = new Set<string>()
  const gravites = new Set<string>()
  for (const p of ['1', '2', '3', '4', '5']) {
    for (const g of ['A', 'B', 'C', 'D', 'E']) {
      if ((ORDRE_NIVEAU_RISQUE[getRiskLevelFromCell5(`${p}${g}`)] ?? 99) < ini) {
        probas.add(p)
        gravites.add(g)
      }
    }
  }
  return { probas: [...probas].sort(), gravites: [...gravites].sort() }
}

/**
 * Résiduel STRICTEMENT inférieur à l'initial (échelle 5 niveaux) ?
 * L'initial 4-niveaux (gravité événement) se place sur la même échelle.
 */
export function estResiduelCoherent(niveauInitial: string, celluleResiduelle: string | undefined | null): boolean {
  const res = niveauDepuisCellule(celluleResiduelle)
  if (!res) return false
  const ini = (niveauInitial || '').toLowerCase()
  return (ORDRE_NIVEAU_RISQUE[res] ?? -1) < (ORDRE_NIVEAU_RISQUE[ini] ?? 99)
}

export function normaliserGravite(gravite: string | undefined | null): NiveauGraviteEvenement {
  const g = (gravite || '').trim().toLowerCase()
  if (g === 'critique' || g === 'eleve' || g === 'moyen' || g === 'faible') return g
  return GRAVITE_LEGACY[g.toUpperCase()] || 'moyen'
}

export function getGraviteRisque(gravite: string): { label: string; classe: string } {
  return GRAVITE_RISQUE[normaliserGravite(gravite)] || { label: gravite, classe: 'badge neutral' }
}

export function getGraviteRisqueLabel(gravite: string): string {
  return getGraviteRisque(gravite).label
}

export function getGraviteRisqueClasse(gravite: string): string {
  return getGraviteRisque(gravite).classe
}

export const evenementUtils = {
  /**
   * Génère une référence unique pour un événement
   */
  genererReference(annee: number, compteur: number): string {
    return `EVT-${annee}-${String(compteur).padStart(3, '0')}`
  },

  /**
   * Détermine la gravité d'un événement basé sur son type
   */
  determinerGravite(type: string): 'critique' | 'eleve' | 'moyen' | 'faible' {
    const mapping: Record<string, any> = {
      'Incursion sur piste': 'critique',
      'Événement lié à des travaux/maintenance sur ou à proximité d\'une piste': 'critique',
      'Événement de sûreté pouvant avoir un impact sur la sécurité': 'critique',
      'Émission lasers ou feux non aéronautiques': 'eleve',
      'Non mise en oeuvre des procédures': 'eleve',
      'Marchandises dangereuses': 'eleve',
      'Avitaillement en carburant de l\'avion': 'eleve',
      'Utilisation des matériels de piste (choc avion…)': 'eleve',
      'Mise en route des moteurs et/ou roulage non conformes': 'eleve',
      'Présence indésirable sur une aire': 'eleve',
      'Défaillance des interfaces sol-bord (incompréhension, inadaptation des infos transmises,…)': 'eleve',
      'Contamination de la piste': 'eleve',
      'Péril animalier': 'eleve',
      'Facteurs humains': 'moyen',
      'Travaux en cours sur l\'aire de mouvement': 'moyen',
      'Travaux de maintenance': 'moyen',
      'FOD': 'moyen',
      'Placement et stationnement de l\'avion': 'moyen',
      'Infrastructures inadaptées': 'moyen',
      'Souffle causé par un aéronef': 'moyen',
      'Autre, précisez': 'faible',
    }
    return mapping[type] || 'faible'
  },

  /**
   * Calcule le délai de notification en heures
   */
  getDelaiNotification(gravite: string): number {
    const configs = Object.values(GRAVITE_EVENEMENT).filter(g => g.niveau === normaliserGravite(gravite))
    if (configs.length === 0) return 48
    return Math.min(...configs.map(c => c.delai_notification))
  },

  /**
   * Vérifie si un événement nécessite une notification SMS d'urgence
   */
  necessiteSMSUrgent(gravite: string): boolean {
    const config = Object.values(GRAVITE_EVENEMENT).find(g => g.niveau === normaliserGravite(gravite))
    return config?.sms || false
  },

  /**
   * Calcule le score C5 (Résilience) basé sur les événements
   */
  calculerImpactC5(evenements: EvenementSecurite[]): number {
    if (evenements.length === 0) return 100

    const poids: Record<string, number> = {
      'critique': 40,
      'eleve': 20,
      'moyen': 10,
      'faible': 5
    }

    const douzeMois = new Date()
    douzeMois.setMonth(douzeMois.getMonth() - 12)

    const penalite = evenements.reduce((acc, evt) => {
      const dateOk = evt.date ? new Date(evt.date) >= douzeMois : true
      return dateOk && evt.statut !== 'cloture' ? acc + (poids[normaliserGravite(evt.gravite)] || 0) : acc
    }, 0)

    return Math.max(0, Math.min(100, 100 - penalite))
  },

  /**
   * Formate le statut pour affichage
   */
  formatStatut(statut: string): string {
    const statuts: Record<string, string> = {
      'recu': 'Reçu',
      'en_cours': 'En cours d\'instruction',
      'analyse': 'Analyse causale',
      'ecart_cree': 'Écart créé',
      'rapport_redige': 'Rapport rédigé',
      'cloture': 'Clôturé'
    }
    return statuts[statut] || statut
  },

  /**
   * Obtient la couleur du badge pour un statut
   */
  getCouleurStatut(statut: string): string {
    const couleurs: Record<string, string> = {
      'recu': 'bg-purple-100 text-purple-800',
      'en_cours': 'bg-blue-100 text-blue-800',
      'analyse': 'bg-yellow-100 text-yellow-800',
      'ecart_cree': 'bg-indigo-100 text-indigo-800',
      'rapport_redige': 'bg-green-100 text-green-800',
      'cloture': 'bg-gray-100 text-gray-800'
    }
    return couleurs[statut] || 'bg-gray-100 text-gray-800'
  },

  /**
   * Vérifie si un événement est en retard de traitement
   */
  estEnRetard(evenement: EvenementSecurite): boolean {
    if (evenement.statut === 'cloture') return false

    const dateCreation = new Date(evenement.created_at)
    const maintenant = new Date()
    const joursEcoules = Math.ceil((maintenant.getTime() - dateCreation.getTime()) / (1000 * 60 * 60 * 24))

    const delaisMax: Record<string, number> = {
      'recu': 2,
      'en_cours': 5,
      'analyse': 10,
      'ecart_cree': 15,
      'rapport_redige': 20
    }

    const delaiMax = delaisMax[evenement.statut] || 30
    return joursEcoules > delaiMax
  },

  /**
   * Génère le rapport final d'événement
   */
  genererRapportFinal(evenement: EvenementSecurite): string {
    const date = new Date(evenement.date).toLocaleDateString('fr-FR')
    
    return `
RAPPORT D'ÉVÉNEMENT DE SÉCURITÉ
================================
Référence: ${evenement.reference}
Date: ${date} à ${evenement.heure}
Type: ${evenement.type}
Gravité: ${evenement.gravite}

DESCRIPTION
-----------
${evenement.description}

LOCALISATION
------------
${evenement.localisation}

ACTIONS IMMÉDIATES
------------------
${evenement.actions_immediates}

SERVICES ALERTÉS
----------------
${evenement.services_alertes?.join(', ') || 'Aucun'}

BILAN
-----
- Morts: ${evenement.blesses?.mortels || 0}
- Blessés graves: ${evenement.blesses?.graves || 0}
- Blessés légers: ${evenement.blesses?.legers || 0}
- Indemnes: ${evenement.blesses?.indemnes || 0}

DÉGÂTS MATÉRIELS
----------------
${evenement.dommages_desc || 'Non documenté'}

AÉRONEF IMPLIQUÉ
----------------
${evenement.aeronef ? 
  `Immatriculation: ${evenement.aeronef.immatriculation}
Type: ${evenement.aeronef.type}
Exploitant: ${evenement.aeronef.exploitant}` : 
  'Non applicable'}

RAPPORT ÉTABLI LE ${new Date().toLocaleDateString('fr-FR')}
    `
  }
}