// lib/formationUtils.ts
import { Formation, Competence, Inspecteur, Surveillance } from './store'

export const formationUtils = {
  /**
   * Génère une référence unique pour une formation
   */
  genererReference(annee: number, compteur: number): string {
    return `FMT-${annee}-${String(compteur).padStart(4, '0')}`
  },

  /**
   * Calcule la matrice de compétences pour un inspecteur
   */
  calculerMatriceCompetences(
    inspecteur: Inspecteur,
    formations: Formation[],
    competences: Competence[]
  ): Record<string, { niveau: string | number; date: string; source: string }> {
    const matrice: Record<string, { niveau: string | number; date: string; source: string }> = {}

    const niveauBase: Record<string, string> = {
      'exploitation': 'cadre_technique',
      'sli': 'cadre_technique',
      'genie_civil': 'cadre_technique',
      'genie_electrique': 'cadre_technique'
    }

    matrice[inspecteur.domaine_principal] = {
      niveau: inspecteur.type,
      date: inspecteur.created_at,
      source: 'nomination'
    }

    // Ajouter les compétences des formations
    formations.forEach(f => {
      if (f.participants.includes(inspecteur.id) && f.statut === 'terminee') {
        f.domaines.forEach(domaine => {
          if (f.evaluation && f.evaluation[inspecteur.id] && f.evaluation[inspecteur.id] >= 4) {
            matrice[domaine] = {
              niveau: inspecteur.type,
              date: f.date,
              source: `formation: ${f.titre}`
            }
          }
        })
      }
    })

    // Ajouter les compétences explicites
    competences.forEach(c => {
      if (c.inspecteur_id === inspecteur.id) {
        matrice[c.domaine] = {
          niveau: c.niveau,
          date: c.date_obtention,
          source: c.source
        }
      }
    })

    return matrice
  },

  /**
   * Vérifie si un inspecteur a une compétence valide
   */
  aCompetence(
    inspecteur: Inspecteur,
    domaine: string,
    niveauRequis: number = 3
  ): boolean {
    const competence = inspecteur.competences.find(c => c.domaine === domaine)
    if (!competence) return false

    if ((competence.niveau || 0) < niveauRequis) return false

    if (competence.expire_le && new Date(competence.expire_le) < new Date()) {
      return false
    }

    return true
  },

  /**
   * Calcule le taux de présence à une formation
   */
  calculerTauxPresence(formation: Formation): number {
    const total = formation.participants.length
    if (total === 0) return 0

    const presents = Object.values(formation.presence || {}).filter(v => v === 'present').length
    return Math.round((presents / total) * 100)
  },

  /**
   * Moteur de calcul automatique des compétences
   */
  GRADE_BASE: { cadre_technique: 1, inspecteur_stagiaire: 2, inspecteur_titulaire: 3, inspecteur_principal: 4 } as Record<string, number>,

  calculerNiveauCompetence(
    inspecteur: Inspecteur,
    domaine: string,
    context: { formations: Formation[]; surveillances: Surveillance[] }
  ): number {
    const grade = inspecteur.type || 'cadre_technique'
    let niveau = this.GRADE_BASE[grade] || 1

    // Bonus domaine principal
    const correspondanceAGA: Record<string, string[]> = {
      exploitation: ['SGS','COP','OPS'], sli: ['SLI','RA'], genie_civil: ['PHY','OLS'], genie_electrique: ['ELEC','MFP'],
    }
    if (correspondanceAGA[inspecteur.domaine_principal]?.includes(domaine)) niveau += 1

    // Bonus formations terminées
    const nbFormations = context.formations.filter(f =>
      f.participants.includes(inspecteur.id) && f.statut === 'terminee' && f.domaines.includes(domaine)
    ).length
    niveau += Math.min(2, nbFormations * 0.5)

    // Bonus missions
    const nbMissions = context.surveillances.filter(s =>
      (s.equipe_ids || []).includes(inspecteur.id) && s.statut !== 'planifiee'
    ).length
    niveau += Math.min(1, Math.floor(nbMissions / 5) * 0.5)

    // Bonus ancienneté
    const annees = (Date.now() - new Date(inspecteur.created_at).getTime()) / 31536000000
    niveau += Math.min(1, Math.floor(annees / 3) * 0.5)

    // Malus péremption
    const derniereFormation = context.formations
      .filter(f => f.participants.includes(inspecteur.id) && f.domaines.includes(domaine))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    if (!derniereFormation || (Date.now() - new Date(derniereFormation.date).getTime()) / 31536000000 > 5) {
      niveau -= 1
    }

    return Math.max(1, Math.min(5, Math.round(niveau)))
  },

  /**
   * Calcule la note moyenne d'une formation
   */
  calculerNoteMoyenne(formation: Formation): number {
    if (!formation.evaluation) return 0

    const notes = Object.values(formation.evaluation)
    if (notes.length === 0) return 0

    const somme = notes.reduce((a, b) => a + b, 0)
    return Math.round((somme / notes.length) * 10) / 10
  },

  /**
   * Formate le type d'inspecteur
   */
  formatTypeInspecteur(type: string): string {
    const types: Record<string, string> = {
      'cadre_technique': 'Cadre Technique',
      'inspecteur_titulaire': 'Inspecteur Titulaire',
      'inspecteur_principal': 'Inspecteur Principal'
    }
    return types[type] || type
  },

  /**
   * Formate le service
   */
  formatService(service: string): string {
    const services: Record<string, string> = {
      'normes_aerodromes': 'Normes des Aérodromes',
      'securite_aerodromes': 'Sécurité des Aérodromes'
    }
    return services[service] || service
  },

  /**
   * Obtient la couleur du statut
   */
  getCouleurStatut(statut: string): string {
    const couleurs: Record<string, string> = {
      'planifiee': 'bg-blue-100 text-blue-800',
      'en_cours': 'bg-yellow-100 text-yellow-800',
      'terminee': 'bg-green-100 text-green-800',
      'annulee': 'bg-red-100 text-red-800'
    }
    return couleurs[statut] || 'bg-gray-100 text-gray-800'
  },

  /**
   * Filtre les formations par période
   */
  getFormationsByPeriode(formations: Formation[], debut: Date, fin: Date): Formation[] {
    return formations.filter(f => {
      const date = new Date(f.date)
      return date >= debut && date <= fin
    })
  },

  /**
   * Génère une attestation de formation
   */
  genererAttestation(formation: Formation, inspecteur: Inspecteur): string {
    const date = new Date().toLocaleDateString('fr-FR')
    
    return `
ATTESTATION DE FORMATION
========================

Je soussigné, ${formation.formateur}, atteste que :

${inspecteur.prenom} ${inspecteur.nom}
Matricule: ${inspecteur.matricule}

a participé à la formation :

Titre: ${formation.titre}
Type: ${formation.type}
Date: ${new Date(formation.date).toLocaleDateString('fr-FR')}
Durée: ${formation.duree_heures} heures
Lieu: ${formation.lieu}

Objectifs:
${formation.objectifs}

Évaluation: ${formation.evaluation?.[inspecteur.id] || 'N/A'}/5

Fait à Dakar, le ${date}

Signature du formateur
    `
  }
}