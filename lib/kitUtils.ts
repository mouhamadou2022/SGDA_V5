// lib/kitUtils.ts
import { KitDocument } from './store'

export const kitUtils = {
  /**
   * Génère une version de document
   */
  genererVersion(majeure: number, mineure: number): string {
    return `v${majeure}.${mineure}`
  },

  /**
   * Incrémente la version d'un document
   */
  incrementerVersion(versionActuelle: string, type: 'majeure' | 'mineure' = 'mineure'): string {
    const [majeure, mineure] = versionActuelle.replace('v', '').split('.').map(Number)
    
    if (type === 'majeure') {
      return `v${majeure + 1}.0`
    } else {
      return `v${majeure}.${mineure + 1}`
    }
  },

  /**
   * Formate la taille du fichier
   */
  formatTaille(taille: number): string {
    if (taille < 1024) return `${taille} o`
    if (taille < 1024 * 1024) return `${(taille / 1024).toFixed(1)} Ko`
    if (taille < 1024 * 1024 * 1024) return `${(taille / (1024 * 1024)).toFixed(1)} Mo`
    return `${(taille / (1024 * 1024 * 1024)).toFixed(1)} Go`
  },

  /**
   * Filtre les documents par domaine
   */
  getDocumentsByDomaine(documents: KitDocument[], domaine: string): KitDocument[] {
    return documents.filter(d => d.domaines.includes(domaine))
  },

  /**
   * Filtre les documents accessibles aux exploitants
   */
  getDocumentsExploitant(documents: KitDocument[]): KitDocument[] {
    return documents.filter(d => d.accessible_exploitant && d.etat === 'a_jour')
  },

  /**
   * Vérifie si un document est obsolète
   */
  estObsolète(document: KitDocument): boolean {
    if (document.etat === 'obsolete') return true
    
    const dateRevision = new Date(document.date_revision)
    const maintenant = new Date()
    const diffMois = (maintenant.getFullYear() - dateRevision.getFullYear()) * 12 +
                     (maintenant.getMonth() - dateRevision.getMonth())
    
    return diffMois > 12 // Obsolète si plus d'un an
  },

  /**
   * Obtient la couleur du badge d'état
   */
  getCouleurEtat(etat: string): string {
    const couleurs: Record<string, string> = {
      'a_jour': 'bg-green-100 text-green-800',
      'en_revision': 'bg-orange-100 text-orange-800',
      'obsolete': 'bg-red-100 text-red-800'
    }
    return couleurs[etat] || 'bg-gray-100 text-gray-800'
  },

  /**
   * Obtient l'icône selon le type de fichier
   */
  getIconeType(type: string): string {
    if (type.includes('pdf')) return 'file-text'
    if (type.includes('word') || type.includes('document')) return 'file-text'
    if (type.includes('excel') || type.includes('sheet')) return 'file-spreadsheet'
    if (type.includes('image')) return 'file-image'
    return 'file'
  },

  /**
   * Recherche par mots-clés
   */
  rechercherParMotsCles(documents: KitDocument[], recherche: string): KitDocument[] {
    const termes = recherche.toLowerCase().split(' ')
    
    return documents.filter(doc => {
      const texteRecherche = [
        doc.nom.toLowerCase(),
        doc.mots_cles.join(' ').toLowerCase(),
        doc.resume?.toLowerCase() || ''
      ].join(' ')
      
      return termes.every(terme => texteRecherche.includes(terme))
    })
  },

  /**
   * Groupe les documents par type
   */
  grouperParType(documents: KitDocument[]): Record<string, KitDocument[]> {
    return documents.reduce((acc, doc) => {
      if (!acc[doc.type_document]) {
        acc[doc.type_document] = []
      }
      acc[doc.type_document].push(doc)
      return acc
    }, {} as Record<string, KitDocument[]>)
  },

  /**
   * Valide les métadonnées d'un document
   */
  validerDocument(document: Partial<KitDocument>): { valide: boolean; erreurs: string[] } {
    const erreurs: string[] = []

    if (!document.nom) erreurs.push('Le nom est requis')
    if (!document.type_document) erreurs.push('Le type est requis')
    if (!document.version) erreurs.push('La version est requise')
    if (!document.date_revision) erreurs.push('La date de révision est requise')
    if (!document.domaines || document.domaines.length === 0) {
      erreurs.push('Au moins un domaine est requis')
    }

    return {
      valide: erreurs.length === 0,
      erreurs
    }
  }
}