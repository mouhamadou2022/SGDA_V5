// lib/enqueteUtils.ts
import { Enquete, ReponseEnquete, QuestionEnquete } from './store'

export const enqueteUtils = {
  /**
   * Génère une référence unique pour une enquête
   */
  genererReference(annee: number, compteur: number): string {
    return `ENQ-${annee}-${String(compteur).padStart(3, '0')}`
  },

  /**
   * Calcule le score C1 à partir des réponses Likert
   */
  calculerImpactC1(reponses: ReponseEnquete[], questions: QuestionEnquete[]): number {
    const questionsLikert = questions.filter(q => q.impact_c1)
    if (questionsLikert.length === 0) return 0

    let total = 0
    let count = 0

    questionsLikert.forEach(question => {
      const reponse = reponses.find(r => r.id === question.id)
      if (reponse && typeof (reponse as any).reponse === 'number') {
        total += (reponse as any).reponse
        count++
      }
    })

    if (count === 0) return 0
    // Convertir de 1-5 à 0-100
    return Math.round((total / count) * 20)
  },

  /**
   * Calcule le taux de réponse pour une enquête
   */
  calculerTauxReponse(enquete: Enquete, reponses: ReponseEnquete[]): number {
    const nbCibles = enquete.aerodrome_ids.length
    const reponsesAerodromes = new Set(
      reponses.filter(r => enquete.aerodrome_ids.includes(r.aerodrome_id)).map(r => r.aerodrome_id)
    )
    const nbReponses = reponsesAerodromes.size
    
    if (nbCibles === 0) return 0
    return Math.round((nbReponses / nbCibles) * 100)
  },

  /**
   * Agrège les statistiques par question
   */
  getStatistiquesQuestion(question: QuestionEnquete, reponses: any[]): any {
    const valeurs = reponses.map(r => r[question.id]).filter(v => v !== undefined)

    if (question.type === 'likert_5' || question.type === 'note_10') {
      const numeriques = valeurs.filter(v => typeof v === 'number')
      return {
        moyenne: numeriques.length > 0 
          ? numeriques.reduce((a, b) => a + b, 0) / numeriques.length 
          : 0,
        repartition: numeriques.reduce((acc, val) => {
          acc[val] = (acc[val] || 0) + 1
          return acc
        }, {} as Record<number, number>)
      }
    }

    if (question.type === 'choix_unique' || question.type === 'choix_multiple') {
      const repartition: Record<string, number> = {}
      valeurs.flat().forEach((val: string) => {
        repartition[val] = (repartition[val] || 0) + 1
      })
      return { repartition }
    }

    return { count: valeurs.filter(v => v !== undefined && v !== null).length }
  },

  /**
   * Vérifie si une enquête est expirée
   */
  estExpiree(enquete: Enquete): boolean {
    return new Date(enquete.deadline) < new Date()
  },

  /**
   * Formate le statut pour affichage
   */
  formatStatut(statut: string): string {
    const statuts: Record<string, string> = {
      'brouillon': 'Brouillon',
      'active': 'Active',
      'terminee': 'Terminée',
      'archivee': 'Archivée'
    }
    return statuts[statut] || statut
  },

  /**
   * Exporte les résultats d'enquête en CSV
   */
  exporterResultatsCSV(enquete: Enquete, reponses: ReponseEnquete[]): string {
    const lignes: string[] = []
    
    // En-tête
    const entete = ['Aérodrome', 'Répondant', 'Date', ...enquete.questions.map(q => q.texte)]
    lignes.push(entete.join(';'))

    // Données
    reponses.forEach(reponse => {
      const ligne = [
        reponse.aerodrome_id,
        reponse.repondant_nom,
        new Date(reponse.submitted_at).toLocaleDateString('fr-FR'),
        ...enquete.questions.map(q => {
          const val = reponse.reponses[q.id]
          return Array.isArray(val) ? val.join('|') : val
        })
      ]
      lignes.push(ligne.join(';'))
    })

    return lignes.join('\n')
  }
}