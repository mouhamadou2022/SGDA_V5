// lib/evenementUtils.ts
import { EvenementSecurite } from './store'
import { GRAVITE_EVENEMENT } from './config'

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
  determinerGravite(type: string): 'CRITIQUE' | 'ORANGE' | 'JAUNE' | 'GRIS' | 'BLEU' {
    const mapping: Record<string, any> = {
      'Incursion sur piste': 'CRITIQUE',
      'Événement lié à des travaux/maintenance sur ou à proximité d\'une piste': 'CRITIQUE',
      'Événement de sûreté pouvant avoir un impact sur la sécurité': 'CRITIQUE',
      'Émission lasers ou feux non aéronautiques': 'ORANGE',
      'Non mise en oeuvre des procédures': 'ORANGE',
      'Marchandises dangereuses': 'ORANGE',
      'Avitaillement en carburant de l\'avion': 'ORANGE',
      'Utilisation des matériels de piste (choc avion…)': 'ORANGE',
      'Mise en route des moteurs et/ou roulage non conformes': 'ORANGE',
      'Présence indésirable sur une aire': 'ORANGE',
      'Défaillance des interfaces sol-bord (incompréhension, inadaptation des infos transmises,…)': 'ORANGE',
      'Contamination de la piste': 'ORANGE',
      'Péril animalier': 'ORANGE',
      'Facteurs humains': 'JAUNE',
      'Travaux en cours sur l\'aire de mouvement': 'JAUNE',
      'Travaux de maintenance': 'JAUNE',
      'FOD': 'JAUNE',
      'Placement et stationnement de l\'avion': 'JAUNE',
      'Infrastructures inadaptées': 'JAUNE',
      'Souffle causé par un aéronef': 'JAUNE',
      'Autre, précisez': 'BLEU',
    }
    return mapping[type] || 'BLEU'
  },

  /**
   * Calcule le délai de notification en heures
   */
  getDelaiNotification(gravite: string): number {
    const configs = Object.values(GRAVITE_EVENEMENT).filter(g => g.niveau === gravite)
    if (configs.length === 0) return 48
    return Math.min(...configs.map(c => c.delai_notification))
  },

  /**
   * Vérifie si un événement nécessite une notification SMS d'urgence
   */
  necessiteSMSUrgent(gravite: string): boolean {
    const config = Object.values(GRAVITE_EVENEMENT).find(g => g.niveau === gravite)
    return config?.sms || false
  },

  /**
   * Calcule le score C5 (Résilience) basé sur les événements
   */
  calculerImpactC5(evenements: EvenementSecurite[]): number {
    if (evenements.length === 0) return 100

    const poids: Record<string, number> = {
      'CRITIQUE': 40,
      'ORANGE': 20,
      'JAUNE': 10,
      'GRIS': 5,
      'BLEU': 2
    }

    const douzeMois = new Date()
    douzeMois.setMonth(douzeMois.getMonth() - 12)

    const penalite = evenements.reduce((acc, evt) => {
      const dateOk = evt.date ? new Date(evt.date) >= douzeMois : true
      return dateOk && evt.statut !== 'cloture' ? acc + (poids[evt.gravite] || 0) : acc
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