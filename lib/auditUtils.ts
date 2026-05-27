// lib/auditUtils.ts
import { AuditLog } from './store'

export const auditUtils = {
  /**
   * Génère un libellé d'action lisible
   */
  formatAction(action: string): string {
    const actions: Record<string, string> = {
      'connexion': 'Connexion',
      'deconnexion': 'Déconnexion',
      'creation': 'Création',
      'modification': 'Modification',
      'suppression': 'Suppression',
      'consultation': 'Consultation',
      'signature': 'Signature',
      'transmission': 'Transmission',
      'generation_code': 'Génération de code',
      'revocation': 'Révocation'
    }
    return actions[action] || action
  },

  /**
   * Formate le module pour affichage
   */
  formatModule(module: string): string {
    const modules: Record<string, string> = {
      'auth': 'Authentification',
      'aerodromes': 'Aérodromes',
      'certification': 'Certification',
      'homologation': 'Homologation',
      'planning': 'Planning',
      'surveillance': 'Surveillance',
      'ecarts': 'Écarts & PAC',
      'evenements': 'Événements',
      'enquetes': 'Enquêtes',
      'messagerie': 'Messagerie',
      'dossiers': 'Dossiers',
      'formation': 'Formation',
      'kit': 'Kit Inspecteur',
      'utilisateurs': 'Utilisateurs',
      'codes': "Codes d'accès"
    }
    return modules[module] || module
  },

  /**
   * Filtre les logs par période
   */
  filterByPeriode(logs: AuditLog[], debut: Date, fin: Date): AuditLog[] {
    return logs.filter(log => {
      const date = new Date(log.date)
      return date >= debut && date <= fin
    })
  },

  /**
   * Filtre les logs par utilisateur
   */
  filterByUtilisateur(logs: AuditLog[], utilisateurId: string): AuditLog[] {
    return logs.filter(log => log.utilisateur_id === utilisateurId)
  },

  /**
   * Filtre les logs par module
   */
  filterByModule(logs: AuditLog[], module: string): AuditLog[] {
    return logs.filter(log => log.module === module)
  },

  /**
   * Filtre les logs par action
   */
  filterByAction(logs: AuditLog[], action: string): AuditLog[] {
    return logs.filter(log => log.action === action)
  },

  /**
   * Exporte les logs au format CSV
   */
  exporterCSV(logs: AuditLog[]): string {
    const headers = ['Date', 'Utilisateur', 'Rôle', 'Action', 'Module', 'Entité', 'Détails']
    
    const rows = logs.map(log => [
      new Date(log.date).toLocaleString('fr-FR'),
      log.utilisateur_nom,
      log.utilisateur_role,
      this.formatAction(log.action),
      this.formatModule(log.module),
      log.entite_nom || log.entite_id,
      log.details ? JSON.stringify(log.details).substring(0, 100) : ''
    ])

    return [headers, ...rows].map(row => row.join(';')).join('\n')
  },

  /**
   * Agrège les statistiques par action
   */
  getStatsByAction(logs: AuditLog[]): Record<string, number> {
    return logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  },

  /**
   * Agrège les statistiques par utilisateur
   */
  getStatsByUtilisateur(logs: AuditLog[]): Record<string, number> {
    return logs.reduce((acc, log) => {
      acc[log.utilisateur_nom] = (acc[log.utilisateur_nom] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  },

  /**
   * Nettoie les logs anciens (pour Supabase Free)
   */
  nettoyerLogsAnciens(logs: AuditLog[], moisGarder: number = 12): AuditLog[] {
    const dateLimite = new Date()
    dateLimite.setMonth(dateLimite.getMonth() - moisGarder)
    
    return logs.filter(log => new Date(log.date) >= dateLimite)
  },

  /**
   * Archive les logs (export + suppression)
   */
  archiverLogs(logs: AuditLog[], dateLimite: Date): {
    archives: string
    logsRestants: AuditLog[]
  } {
    const aArchiver = logs.filter(log => new Date(log.date) < dateLimite)
    const logsRestants = logs.filter(log => new Date(log.date) >= dateLimite)
    
    return {
      archives: this.exporterCSV(aArchiver),
      logsRestants
    }
  },

  /**
   * Détecte les activités suspectes
   */
  detecterActivitesSuspectes(logs: AuditLog[]): AuditLog[] {
    const seuil = 50 // Nombre d'actions suspectes
    const periodes: Record<string, number> = {}

    return logs.filter(log => {
      // Connexions multiples en peu de temps
      if (log.action === 'connexion') {
        const heure = new Date(log.date).getHours()
        if (heure < 6 || heure > 22) return true // Connexion nocturne
      }

      // Suppressions multiples
      if (log.action === 'suppression') {
        const jour = new Date(log.date).toDateString()
        periodes[jour] = (periodes[jour] || 0) + 1
        if (periodes[jour] > seuil) return true
      }

      return false
    })
  }
}