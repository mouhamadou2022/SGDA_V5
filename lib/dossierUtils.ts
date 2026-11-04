// lib/dossierUtils.ts
import { Dossier } from './store'

/**
 * Fusionne des entrées d'historique en ignorant les doublons (même date +
 * même action). Les appelants passent parfois l'historique complet (copie
 * locale de l'UI) et parfois seulement les nouvelles entrées : sans ce
 * garde-fou, chaque mise à jour ré-appende tout l'historique existant et il
 * croît de façon exponentielle (constaté en E2E sur la progression).
 */
export function fusionnerHistorique<T extends { date: string; action: string }>(
  existants: T[],
  ajouts: T[] | undefined,
): T[] {
  if (!ajouts || ajouts.length === 0) return existants
  const nouveaux = ajouts.filter(
    a => !existants.some(e => e.date === a.date && e.action === a.action),
  )
  return nouveaux.length ? [...existants, ...nouveaux] : existants
}

/**
 * Ajoute des jours à une date d'échéance en conservant son format.
 *
 * `date_limite` est encore une colonne `date` : si on lui ajoute des jours via
 * `new Date('2026-11-01').getTime() + n * 86400000` on repart de minuit UTC et
 * on peut décaler d'un jour selon le fuseau. En format date seule, on calcule
 * en calendrier local et on rend « AAAA-MM-JJ ».
 */
export function ajouterJours(dateLimite: string, jours: number): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateLimite)) {
    const [y, m, d] = dateLimite.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + jours)
    const yy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }
  return new Date(new Date(dateLimite).getTime() + jours * 86400000).toISOString()
}

export const dossierUtils = {
  /**
   * Génère une référence unique pour un dossier
   */
  genererReference(annee: number, compteur: number): string {
    return `DOS-${annee}-${String(compteur).padStart(4, '0')}`
  },

  /**
   * Prochaine référence libre DOS-AAAA-NNNN : max+1 sur les références
   * existantes (pur, testé) — remplace le compteur aléatoire 1-9999 qui
   * collisionnait à ~1/10000 par création (birthday paradox : bien plus
   * en pratique sur des centaines de dossiers).
   */
  prochaineReference(
    references: Array<string | undefined | null>,
    annee = new Date().getFullYear(),
  ): string {
    const tete = `DOS-${annee}-`
    let max = 0
    for (const ref of references || []) {
      if (typeof ref !== 'string' || !ref.startsWith(tete)) continue
      const n = Number(ref.slice(tete.length))
      if (Number.isInteger(n) && n > max) max = n
    }
    return `DOS-${annee}-${String(max + 1).padStart(4, '0')}`
  },

  /**
   * Calcule le délai restant en jours.
   *
   * `date_limite` est une colonne `date` (drift de schéma, voir
   * SGDA_v5_FINAL_COMPLET.sql) : PostgREST renvoie « AAAA-MM-JJ ».
   * `new Date('2026-11-01')` vaut minuit UTC, donc la veille au soir la
   * comparaison à l'instant courant donnait déjà un jour de retard. Une date
   * seule est ici traitée en jours calendaires locaux (échéance = le jour
   * entier) ; les timestamps complets gardent le calcul horaire.
   */
  getDelaiRestant(
    dateLimite: string,
    maintenant: Date = new Date(),
  ): { jours: number; couleur: 'vert' | 'orange' | 'rouge' } {
    let joursRestants: number
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateLimite)) {
      const [y, m, d] = dateLimite.split('-').map(Number)
      const limite = new Date(y, m - 1, d)
      const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate())
      joursRestants = Math.round((limite.getTime() - debutJour.getTime()) / (1000 * 60 * 60 * 24))
    } else {
      const limite = new Date(dateLimite)
      joursRestants = Math.ceil((limite.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
    }

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
    // Si le dossier utilise le nouveau modèle assignments
    if (dossier.assignments && dossier.assignments.length > 0) {
      const total = dossier.assignments.reduce((sum, a) => sum + a.progression, 0)
      return Math.round(total / dossier.assignments.length) as 0 | 25 | 50 | 75 | 100
    }

    // Fallback ancien modèle
    let progression = 0
    if (dossier.inspecteur_id) progression += 25
    if (dossier.instructions) progression += 25
    if (dossier.fichiers.some(f => f.ocr_extracted)) progression += 25
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