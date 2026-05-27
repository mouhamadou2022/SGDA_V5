// lib/registreUtils.ts
import { EntreeRegistre, RegistreEntry } from './store'

export const registreUtils = {
  /**
   * Génère une référence unique pour un registre
   */
  genererReference(type: string, annee: number, compteur: number): string {
    const prefix = type.substring(0, 3).toUpperCase()
    return `REG-${prefix}-${annee}-${String(compteur).padStart(4, '0')}`
  },

  /**
   * Crée une entrée de registre à partir d'une formation
   */
  fromFormation(formation: any, aerodromeId?: string): Omit<EntreeRegistre, 'id' | 'created_at'> {
    return {
      aerodrome_id: aerodromeId,
      type: 'formation',
      reference: formation.reference,
      date_entree: formation.date,
      objet: `Formation: ${formation.titre}`,
      description: formation.objectifs,
      lien_id: formation.id,
      lien_type: 'formation',
      signataire_id: formation.formateur,
      signataire_nom: typeof formation.formateur === 'string' ? formation.formateur : undefined,
      fichiers: formation.documents,
      statut: formation.statut === 'terminee' ? 'valide' : 'provisoire',
      created_by: formation.created_by
    }
  },

  /**
   * Crée une entrée de registre à partir d'un événement
   */
  fromEvenement(evenement: any): Omit<EntreeRegistre, 'id' | 'created_at'> {
    return {
      aerodrome_id: evenement.aerodrome_id,
      type: 'evenement',
      reference: evenement.reference,
      date_entree: evenement.date,
      objet: `Événement: ${evenement.type}`,
      description: evenement.description,
      lien_id: evenement.id,
      lien_type: 'evenement',
      signataire_id: evenement.inspecteur_id,
      fichiers: evenement.rapport_final_url ? [{
        nom: `rapport_${evenement.reference}.pdf`,
        url: evenement.rapport_final_url,
        taille: 0,
        type: 'application/pdf'
      }] : [],
      statut: evenement.statut === 'cloture' ? 'valide' : 'provisoire',
      created_by: evenement.created_by
    }
  },

  /**
   * Crée une entrée de registre à partir d'une surveillance
   */
  fromSurveillance(surveillance: any): Omit<EntreeRegistre, 'id' | 'created_at'> {
    return {
      aerodrome_id: surveillance.aerodrome_id,
      type: 'surveillance',
      reference: surveillance.id,
      date_entree: surveillance.date_debut,
      objet: `Surveillance: ${surveillance.type}`,
      description: surveillance.observations || 'Surveillance programmée',
      lien_id: surveillance.id,
      lien_type: 'surveillance',
      signataire_id: surveillance.chef_id,
      fichiers: surveillance.rapport_sig_url ? [{
        nom: `rapport_${surveillance.id}.pdf`,
        url: surveillance.rapport_sig_url,
        taille: 0,
        type: 'application/pdf'
      }] : [],
      statut: surveillance.statut === 'transmise' ? 'valide' : 'provisoire',
      created_by: surveillance.created_by || ''
    }
  },

  /**
   * Crée une entrée de registre à partir d'une certification
   */
  fromCertification(certification: any): Omit<EntreeRegistre, 'id' | 'created_at'> {
    return {
      aerodrome_id: certification.aerodrome_id,
      type: 'certification',
      reference: certification.reference,
      date_entree: certification.date_delivrance || certification.created_at,
      objet: `Certification - Phase ${certification.phase_active}`,
      description: `Certification ${certification.statut_global}`,
      lien_id: certification.id,
      lien_type: 'certification',
      signataire_id: certification.signataire_id,
      fichiers: certification.lettre_signee_url ? [{
        nom: `certificat_${certification.reference}.pdf`,
        url: certification.lettre_signee_url,
        taille: 0,
        type: 'application/pdf'
      }] : [],
      statut: certification.statut_global === 'certifie' ? 'valide' : 'provisoire',
      created_by: certification.created_by
    }
  },

  /**
   * Crée une entrée de registre à partir d'une homologation
   */
  fromHomologation(homologation: any): Omit<EntreeRegistre, 'id' | 'created_at'> {
    const fichiers: { nom: string; url: string; taille: number; type: string }[] = []
    const phasesData = homologation.phases_data || {}
    // Récupérer tous les inspecteur_fichiers des phases
    for (const key of ['phase1', 'phase2', 'phase3']) {
      const phase = phasesData[key]
      if (phase?.inspecteur_fichiers) {
        phase.inspecteur_fichiers.forEach((f: any) => {
          fichiers.push({ nom: f.nom, url: f.url, taille: 0, type: 'application/pdf' })
        })
      }
    }
    return {
      aerodrome_id: homologation.aerodrome_id,
      type: 'homologation',
      reference: homologation.reference,
      date_entree: homologation.date_delivrance || homologation.created_at,
      objet: `Homologation - Phase ${homologation.phase_active}`,
      description: `Homologation ${homologation.statut_global}`,
      lien_id: homologation.id,
      lien_type: 'homologation',
      signataire_id: homologation.signataire_id,
      fichiers,
      statut: homologation.statut_global === 'homologue' ? 'valide' : 'provisoire',
      created_by: homologation.created_by
    }
  },

  /**
   * Convertit une certification en RegistreEntry (nouveau store)
   */
  toRegistreEntryFromCertification(certification: any, aerodrome?: any): Omit<RegistreEntry, 'id' | 'created_at' | 'timeline'> {
    const fichiers: { nom: string; url: string }[] = []
    const phasesData = certification.phases_data || {}
    for (const key of ['phase1', 'phase2', 'phase3', 'phase4', 'phase5']) {
      const phase = phasesData[key]
      if (phase?.inspecteur_fichiers) {
        phase.inspecteur_fichiers.forEach((f: any) => {
          fichiers.push({ nom: f.nom, url: f.url })
        })
      }
    }
    return {
      type: 'certification',
      reference: certification.reference || certification.numero_cert || '',
      titre: `Certification ${aerodrome?.code_oaci || ''} - ${certification.numero_cert || certification.reference || ''}`,
      description: `Certification ${certification.statut_global} — Phase ${certification.phase_active}/5`,
      date_entree: certification.date_delivrance || certification.created_at || new Date().toISOString(),
      aerodrome_id: certification.aerodrome_id,
      fichiers,
      statut: certification.statut_global === 'certifie' ? 'valide' : 'archive',
      auto_generated: true,
      source_id: certification.id,
      source_type: 'certification',
      created_by: certification.created_by || '',
    }
  },

  /**
   * Convertit une homologation en RegistreEntry (nouveau store)
   */
  toRegistreEntryFromHomologation(homologation: any, aerodrome?: any): Omit<RegistreEntry, 'id' | 'created_at' | 'timeline'> {
    const fichiers: { nom: string; url: string }[] = []
    const phasesData = homologation.phases_data || {}
    for (const key of ['phase1', 'phase2', 'phase3']) {
      const phase = phasesData[key]
      if (phase?.inspecteur_fichiers) {
        phase.inspecteur_fichiers.forEach((f: any) => {
          fichiers.push({ nom: f.nom, url: f.url })
        })
      }
    }
    return {
      type: 'homologation',
      reference: homologation.reference || '',
      titre: `Homologation ${aerodrome?.code_oaci || ''} — ${homologation.reference || ''}`,
      description: `Homologation ${homologation.statut_global} — Phase ${homologation.phase_active}/3`,
      date_entree: homologation.date_delivrance || homologation.created_at || new Date().toISOString(),
      aerodrome_id: homologation.aerodrome_id,
      fichiers,
      statut: homologation.statut_global === 'homologue' ? 'valide' : 'archive',
      auto_generated: true,
      source_id: homologation.id,
      source_type: 'homologation',
      created_by: homologation.created_by || '',
    }
  },

  /**
   * Filtre les registres par période
   */
  filterByPeriode(registres: EntreeRegistre[], debut: Date, fin: Date): EntreeRegistre[] {
    return registres.filter(r => {
      const date = new Date(r.date_entree)
      return date >= debut && date <= fin
    })
  },

  /**
   * Exporte les registres au format CSV
   */
  exporterCSV(registres: EntreeRegistre[], aerodromes: any[]): string {
    const headers = ['Type', 'Référence', 'Date', 'Objet', 'Aérodrome', 'Statut', 'Signataire']
    
    const rows = registres.map(r => {
      const aerodrome = aerodromes.find(a => a.id === r.aerodrome_id)
      return [
        r.type,
        r.reference,
        new Date(r.date_entree).toLocaleDateString('fr-FR'),
        r.objet,
        aerodrome ? `${aerodrome.code_oaci} - ${aerodrome.nom}` : 'N/A',
        r.statut,
        r.signataire_nom || ''
      ]
    })

    return [headers, ...rows].map(row => row.join(';')).join('\n')
  },

  /**
   * Vérifie si un registre est complet
   */
  estComplet(entree: EntreeRegistre): boolean {
    return !!(
      entree.reference &&
      entree.objet &&
      entree.description &&
      entree.signataire_id
    )
  },

  /**
   * Obtient la couleur du badge selon le type
   */
  getCouleurType(type: string): string {
    const couleurs: Record<string, string> = {
      'formation': 'bg-blue-100 text-blue-800',
      'evenement': 'bg-orange-100 text-orange-800',
      'surveillance': 'bg-purple-100 text-purple-800',
      'certification': 'bg-green-100 text-green-800',
      'homologation': 'bg-teal-100 text-teal-800',
      'ecart': 'bg-red-100 text-red-800',
      'exploitation': 'bg-gray-100 text-gray-800'
    }
    return couleurs[type] || 'bg-gray-100 text-gray-800'
  }
}