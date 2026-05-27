// lib/dossierUtils.ts
import { Dossier } from './store'

export const dossierUtils = {
  /**
   * Génère une référence unique pour un dossier
   */
  genererReference(annee: number, compteur: number): string {
    return `DOS-${annee}-${String(compteur).padStart(4, '0')}`
  },

  /**
   * Calcule le délai restant en jours
   */
  getDelaiRestant(dateLimite: string): { jours: number; couleur: 'vert' | 'orange' | 'rouge' } {
    const maintenant = new Date()
    const limite = new Date(dateLimite)
    const joursRestants = Math.ceil((limite.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))

    let couleur: 'vert' | 'orange' | 'rouge' = 'vert'
    if (joursRestants < 0) couleur = 'rouge'
    else if (joursRestants < 7) couleur = 'rouge'
    else if (joursRestants < 15) couleur = 'orange'

    return { jours: joursRestants, couleur }
  },

  /**
   * Détermine si un dossier est urgent
   */
  estUrgent(dossier: Dossier): boolean {
    const { jours } = this.getDelaiRestant(dossier.date_limite)
    return jours < 7 && dossier.statut !== 'termine'
  },

  /**
   * Formate le service pour affichage
   */
  formatService(service: string): string {
    const services: Record<string, string> = {
      'securite_aerodromes': 'Sécurité des Aérodromes',
      'normes_aerodromes': 'Normes des Aérodromes'
    }
    return services[service] || service
  },

  /**
   * Calcule la progression automatique basée sur les actions
   */
  calculerProgressionAuto(dossier: Dossier): number {
    let progression = 0

    // 25% si assigné
    if (dossier.inspecteur_id) progression += 25

    // 25% si instructions présentes
    if (dossier.instructions) progression += 25

    // 25% si fichiers traités
    if (dossier.fichiers.some(f => f.ocr_extracted)) progression += 25

    // 25% si preuve fournie
    if (dossier.preuve_traitement) progression += 25

    return Math.min(100, progression) as 0 | 25 | 50 | 75 | 100
  },

  /**
   * Ajoute une entrée dans l'historique
   */
  ajouterHistorique(
    dossier: Dossier,
    action: string,
    utilisateur: string,
    commentaire?: string
  ): Dossier['historique'] {
    const nouvelleEntree = {
      date: new Date().toISOString(),
      action,
      utilisateur,
      commentaire
    }

    return [...(dossier.historique || []), nouvelleEntree]
  },

  /**
   * Extrait les métadonnées d'un PDF par OCR (simulé)
   */
  async extraireMetadonneesPDF(fichier: File): Promise<{
    date_expiration?: string
    numero_reference?: string
    signataire?: string
  }> {
    // Simulation - à remplacer par un vrai service OCR
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          date_expiration: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          numero_reference: `REF-${Math.floor(Math.random() * 1000)}`,
          signataire: 'M. DIOP'
        })
      }, 1000)
    })
  },

  /**
   * Obtient la couleur du badge selon le statut
   */
  getCouleurStatut(statut: string): string {
    const couleurs: Record<string, string> = {
      'en_cours': 'bg-blue-100 text-blue-800',
      'en_attente': 'bg-orange-100 text-orange-800',
      'termine': 'bg-green-100 text-green-800',
      'archive': 'bg-gray-100 text-gray-800'
    }
    return couleurs[statut] || 'bg-gray-100 text-gray-800'
  },

  /**
   * Filtre les dossiers par catégorie
   */
  getDossiersByCategorie(dossiers: Dossier[], categorie: string): Dossier[] {
    return dossiers.filter(d => d.categorie === categorie)
  }
}