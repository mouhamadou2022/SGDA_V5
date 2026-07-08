// lib/plansActionsUtils.ts
import type { Ecart, StatistiquesPAC } from './store'
import { NIVEAUX_RISQUE_ECART } from './config'

export const plansActionsUtils = {
  /**
   * Calcule le score C2 (Efficacité & Réactivité) basé sur historique des écarts
   */
  calculerScoreC2(ecartsClotures: Ecart[]): number {
    if (ecartsClotures.length === 0) return 100

    const maintenant = new Date()
    const douzeMois = new Date(maintenant.setMonth(maintenant.getMonth() - 12))

    const ecartsPeriode = ecartsClotures.filter(e => 
      new Date(e.cloture_le || e.updated_at) >= douzeMois
    )

    if (ecartsPeriode.length === 0) return 100

    const scores = ecartsPeriode.map(ecart => {
      const dateCreation = new Date(ecart.created_at)
      const dateCloture = new Date(ecart.cloture_le || ecart.updated_at)
      const dateEcheance = new Date(ecart.delai_regularisation)

      const delaiEffectif = Math.ceil((dateCloture.getTime() - dateCreation.getTime()) / (1000 * 60 * 60 * 24))
      const delaiEcheance = Math.ceil((dateEcheance.getTime() - dateCreation.getTime()) / (1000 * 60 * 60 * 24))

      // Score 100 si en avance, dégradé proportionnellement
      const ratio = delaiEffectif / delaiEcheance
      return Math.max(0, 100 - ((ratio - 1) * 100))
    })

    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  },

  /**
   * Calcule le score C4 (Charge Critique Non Résolue)
   */
  calculerScoreC4(ecartsActifs: Ecart[], seuilMax: number = 50): number {
    const poids: Record<string, number> = {
      critique: 4,
      eleve: 2,
      moyen: 1,
      faible: 0.5
    }

    const scorePenalite = ecartsActifs.reduce((acc, ecart) => {
      return acc + (poids[ecart.niveau_risque] || 0)
    }, 0)

    return Math.max(0, 100 - Math.min(100, (scorePenalite / seuilMax) * 100))
  },

  /**
   * Détermine la couleur du délai restant
   */
  getCouleurDelai(joursRestants: number): 'vert' | 'orange' | 'rouge' {
    if (joursRestants < 0) return 'rouge'
    if (joursRestants < 7) return 'rouge'
    if (joursRestants < 15) return 'orange'
    return 'vert'
  },

  /**
   * Vérifie si un écart nécessite un rappel automatique
   */
  necessiteRappel(ecart: Ecart): boolean {
    const maintenant = new Date()
    const delaiPAC = new Date(ecart.delai_pac)
    const delaiReg = new Date(ecart.delai_regularisation)
    const joursAvantPAC = Math.ceil((delaiPAC.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
    const joursAvantReg = Math.ceil((delaiReg.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))

    // Rappel à J-7, J-3, J-1
    return [7, 3, 1].includes(joursAvantPAC) || [7, 3, 1].includes(joursAvantReg)
  },

  /**
   * Génère la référence auto pour un écart
   */
  genererReference(annee: number, compteur: number): string {
    return `ECA-${annee}-${String(compteur).padStart(3, '0')}`
  },

  /**
   * Calcule les délais par défaut selon le niveau de risque
   */
  getDelaisParDefaut(niveau: string): { pac: number; regularisation: number } {
    const config = NIVEAUX_RISQUE_ECART[niveau as keyof typeof NIVEAUX_RISQUE_ECART]
    if (config) {
      return {
        pac: config.delai_pac,
        regularisation: config.delai_regularisation
      }
    }
    return { pac: 15, regularisation: 90 }
  },

  /**
   * Vérifie la complétude d'un PAC
   */
  verifierCompletudePAC(pac: any): { complet: boolean; manquants: string[] } {
    const manquants: string[] = []

    if (!pac?.actions || pac.actions.length === 0) {
      manquants.push('Au moins une action corrective')
    } else {
      pac.actions.forEach((action: any, idx: number) => {
        if (!action.description?.trim()) manquants.push(`Description action ${idx + 1}`)
        if (!action.responsable?.trim()) manquants.push(`Responsable action ${idx + 1}`)
        if (!action.date_prevue) manquants.push(`Date prévue action ${idx + 1}`)
      })
    }

    return {
      complet: manquants.length === 0,
      manquants
    }
  },

  /**
   * Calcule la note globale d'évaluation PAC (moyenne des 6 critères)
   */
  calculerNoteGlobale(evaluation: {
    note_pertinence: number
    note_exhaustivite: number
    note_precision: number
    note_specificite: number
    note_coherence: number
    note_realisme?: number
    note_tracabilite?: number
  }): number {
    const somme = evaluation.note_pertinence + evaluation.note_exhaustivite +
                  evaluation.note_precision + evaluation.note_specificite +
                  evaluation.note_coherence + (evaluation.note_realisme ?? evaluation.note_tracabilite ?? 0)
    return Math.round((somme / 6) * 10) / 10
  },

  /**
   * Formate le statut pour affichage
   */
  formatStatut(statut: string): string {
    const map: Record<string, string> = {
      'ouvert': 'Ouvert',
      'pac_attendu': 'PAC attendu',
      'pac_soumis': 'PAC soumis',
      'pac_refuse': 'PAC refusé',
      'pac_accepte': 'PAC accepté',
      'preuves_soumises': 'Preuves soumises',
      'preuves_evaluees': 'Preuves évaluées',
      'en_retard': 'En retard',
      'cloture': 'Clôturé'
    }
    return map[statut] || statut
  },

  /**
   * Calcule la progression d'un écart (0-100)
   */
  calculerProgression(ecart: Ecart): number {
    const etapes: Record<string, number> = {
      'ouvert': 10,
      'pac_attendu': 20,
      'pac_soumis': 40,
      'pac_refuse': 30,
      'pac_accepte': 60,
      'preuves_soumises': 80,
      'preuves_evaluees': 90,
      'cloture': 100,
      'en_retard': 25
    }
    return etapes[ecart.statut] || 0
  },

  /**
   * Agrège les statistiques PAC
   */
  getStatistiquesPAC(ecarts: Ecart[], aerodromeId?: string): StatistiquesPAC {
    const filtered = aerodromeId 
      ? ecarts.filter(e => e.aerodrome_id === aerodromeId)
      : ecarts

    const stats = {
      total: filtered.length,
      en_attente: filtered.filter(e => ['pac_attendu', 'pac_soumis'].includes(e.statut)).length,
      evalues: filtered.filter(e => e.evaluation_pac).length,
      acceptes: filtered.filter(e => e.evaluation_pac?.decision === 'accepte' || e.evaluation_pac?.decision === 'reserve').length,
      refuses: filtered.filter(e => e.evaluation_pac?.decision === 'refuse').length,
      en_retard: filtered.filter(e => e.statut === 'en_retard').length,
      critiques: filtered.filter(e => e.niveau_risque === 'critique' && e.statut !== 'cloture').length,
      taux_acceptation: 0,
      delai_moyen_traitement: 0
    }

    stats.taux_acceptation = stats.evalues > 0 
      ? Math.round((stats.acceptes / stats.evalues) * 100) 
      : 0

    const delais = filtered
      .filter(e => e.evaluation_pac?.delai_traitement != null)
      .map(e => e.evaluation_pac!.delai_traitement!)

    stats.delai_moyen_traitement = delais.length > 0
      ? Math.round(delais.reduce((a: number, b: number) => a + b, 0) / delais.length * 10) / 10
      : 0

    return stats
  },

  /**
   * Détermine le niveau d'urgence d'un écart
   */
  getNiveauUrgence(ecart: Ecart): 'basse' | 'moyenne' | 'haute' | 'critique' {
    const { jours, depasse } = this.getDelaiRestant(ecart)
    
    if (depasse) return 'critique'
    if (ecart.niveau_risque === 'critique') return 'haute'
    if (jours < 7) return 'haute'
    if (jours < 15) return 'moyenne'
    return 'basse'
  },

  /**
   * Calcule les jours restants pour un écart
   */
  getDelaiRestant(ecart: Ecart): { jours: number; depasse: boolean } {
    const maintenant = new Date()
    const delai = ecart.statut === 'ouvert' || ecart.statut === 'pac_attendu'
      ? new Date(ecart.delai_pac)
      : new Date(ecart.delai_regularisation)
    
    const joursRestants = Math.ceil((delai.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
    
    return {
      jours: joursRestants,
      depasse: joursRestants < 0
    }
  },

  /**
   * Vérifie si un utilisateur peut effectuer une action sur un écart
   */
  peutEffectuerAction(ecart: Ecart, userRole: string, userId: string): {
    peutSoumettrePAC: boolean
    peutEvaluerPAC: boolean
    peutSoumettrePreuves: boolean
    peutEvaluerPreuves: boolean
    peutVoir: boolean
  } {
    const estExploitant = ['dg_operator', 'focal_operator'].includes(userRole)
    const estInspecteur = ['admin', 'inspector'].includes(userRole)
    const estReferent = ecart.inspecteur_ref_id === userId

    return {
      peutSoumettrePAC: estExploitant && ['ouvert', 'pac_refuse'].includes(ecart.statut),
      peutEvaluerPAC: estInspecteur && ecart.statut === 'pac_soumis' && estReferent,
      peutSoumettrePreuves: estExploitant && ecart.statut === 'pac_accepte',
      peutEvaluerPreuves: estInspecteur && ecart.statut === 'preuves_soumises' && estReferent,
      peutVoir: true
    }
  },

  /**
   * Génère un message de notification selon le type d'événement
   */
  genererMessageNotification(type: string, ecart: Ecart): { titre: string; message: string; type_notif: 'info' | 'success' | 'warning' | 'danger' } {
    const messages: Record<string, { titre: string; message: string; type_notif: 'info' | 'success' | 'warning' | 'danger' }> = {
      soumission_pac: {
        titre: 'PAC soumis',
        message: `Un PAC a été soumis pour l'écart ${ecart.reference}`,
        type_notif: 'info'
      },
      evaluation_pac_accepte: {
        titre: 'PAC accepté',
        message: `Le PAC pour l'écart ${ecart.reference} a été accepté`,
        type_notif: 'success'
      },
      evaluation_pac_refuse: {
        titre: 'PAC refusé',
        message: `Le PAC pour l'écart ${ecart.reference} a été refusé. Merci de le réviser.`,
        type_notif: 'warning'
      },
      soumission_preuves: {
        titre: 'Preuves soumises',
        message: `Des preuves ont été soumises pour l'écart ${ecart.reference}`,
        type_notif: 'info'
      },
      validation_preuves_valide: {
        titre: 'Preuves validées',
        message: `Les preuves pour l'écart ${ecart.reference} ont été validées. Écart clôturé.`,
        type_notif: 'success'
      },
      validation_preuves_refuse: {
        titre: 'Preuves refusées',
        message: `Les preuves pour l'écart ${ecart.reference} ont été refusées. Merci de les compléter.`,
        type_notif: 'warning'
      },
      retard: {
        titre: 'Écart en retard',
        message: `L'écart ${ecart.reference} a dépassé son délai. Action immédiate requise.`,
        type_notif: 'danger'
      },
      rappel_j7: {
        titre: 'Rappel J-7',
        message: `L'écart ${ecart.reference} arrive à échéance dans 7 jours`,
        type_notif: 'warning'
      },
      rappel_j3: {
        titre: 'Rappel J-3',
        message: `L'écart ${ecart.reference} arrive à échéance dans 3 jours`,
        type_notif: 'warning'
      },
      rappel_j1: {
        titre: 'Rappel J-1',
        message: `L'écart ${ecart.reference} arrive à échéance demain`,
        type_notif: 'danger'
      }
    }

    return messages[type] || {
      titre: 'Notification',
      message: `Mise à jour concernant l'écart ${ecart.reference}`,
      type_notif: 'info'
    }
  },

  /**
   * Formate une date pour affichage
   */
  formatDatePourEcart(dateStr: string): string {
    const date = new Date(dateStr)
    const maintenant = new Date()
    const diffJours = Math.ceil((date.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))

    if (diffJours < 0) {
      return `Retard de ${Math.abs(diffJours)} jour${Math.abs(diffJours) > 1 ? 's' : ''}`
    }
    if (diffJours === 0) return "Aujourd'hui"
    if (diffJours === 1) return "Demain"
    if (diffJours < 7) return `Dans ${diffJours} jours`
    
    return date.toLocaleDateString('fr-FR')
  }
}