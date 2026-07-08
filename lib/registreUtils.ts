// lib/registreUtils.ts
import type { RegistreEntry } from './store'

export const registreUtils = {
  genererReference(type: string, annee: number, compteur: number): string {
    const prefix = type.substring(0, 3).toUpperCase()
    return `REG-${prefix}-${annee}-${String(compteur).padStart(4, '0')}`
  },

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
   * Convertit un dossier archivé en RegistreEntry (nouveau store)
   * avec timeline complète et tous les fichiers
   */
  toRegistreEntryFromDossier(dossier: any, aerodrome?: any): Omit<RegistreEntry, 'id' | 'created_at'> {
    const fichiers: { nom: string; url: string }[] = []
    const fichiersSource = dossier.fichiers || []
    fichiersSource.forEach((f: any) => {
      fichiers.push({ nom: f.nom, url: f.url })
    })

    const assignments = dossier.assignments || []
    const timeline: RegistreEntry['timeline'] = []

    // Étape globale : création du dossier
    if (dossier.created_at) {
      timeline.push({
        id: crypto.randomUUID(),
        etape: 'Création du dossier',
        date: dossier.created_at,
        acteur: dossier.created_by || 'Système',
        acteur_role: 'chef',
        details: `Dossier ${dossier.reference} créé`,
      })
    }

    // Parcourir chaque assignment pour construire la timeline
    assignments.forEach((a: any) => {
      ;(a.historique || []).forEach((h: any) => {
        timeline.push({
          id: crypto.randomUUID(),
          etape: h.action,
          date: h.date,
          acteur: a.inspecteur_nom,
          acteur_role: 'inspecteur',
          details: h.details,
        })
      })

      // Feedbacks
      ;(a.feedbacks || []).forEach((fb: any) => {
        timeline.push({
          id: crypto.randomUUID(),
          etape: `Feedback ${fb.role === 'chef' ? 'chef' : 'inspecteur'}: ${fb.type}`,
          date: fb.date,
          acteur: fb.auteur_nom,
          acteur_role: fb.role || 'inspecteur',
          details: fb.message,
        })
      })

      // Réassignation si existante
      if (a.reassigne_de) {
        timeline.push({
          id: crypto.randomUUID(),
          etape: 'Réassignation',
          date: a.reassigne_de.date,
          acteur: a.reassigne_de.from_inspecteur_nom,
          acteur_role: 'inspecteur',
          details: `Réassigné à ${a.inspecteur_nom} — Motif: ${a.reassigne_de.motif}`,
        })
      }

      // Collaborateurs
      ;(a.collaborateurs || []).forEach((c: any) => {
        timeline.push({
          id: crypto.randomUUID(),
          etape: 'Collaboration',
          date: c.date,
          acteur: c.inspecteur_nom,
          acteur_role: 'inspecteur',
          details: `Sollicité par ${a.inspecteur_nom} — ${c.motif}`,
        })
      })

      // Précharger les preuves comme fichiers de la timeline
      ;(a.preuves || []).forEach((p: any) => {
        fichiers.push({ nom: p.nom, url: p.url })
      })
    })

    // Étape finale : archivage
    if (dossier.archived_at) {
      timeline.push({
        id: crypto.randomUUID(),
        etape: 'Archivage',
        date: dossier.archived_at,
        acteur: 'Système',
        acteur_role: 'chef',
        details: 'Dossier archivé automatiquement',
      })
    }

    // Trier la timeline par date
    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const inspecteursNoms = assignments.map((a: any) => a.inspecteur_nom).join(', ') || 'Non assigné'

    return {
      type: 'dossier',
      reference: dossier.reference,
      titre: `Dossier ${dossier.reference} — ${dossier.titre}`,
      description: `${dossier.categorie} — Traité par ${inspecteursNoms}${dossier.instructions ? ` — ${dossier.instructions}` : ''}`,
      date_entree: dossier.archived_at || dossier.updated_at || new Date().toISOString(),
      aerodrome_id: dossier.aerodrome_id,
      fichiers,
      timeline,
      statut: 'valide',
      auto_generated: true,
      source_id: dossier.id,
      source_type: 'dossier',
      created_by: dossier.created_by || '',
    }
  },

  /**
   * Convertit une surveillance en RegistreEntry (nouveau store)
   */
  toRegistreEntryFromSurveillance(surveillance: any, aerodrome?: any): Omit<RegistreEntry, 'id' | 'created_at'> {
    const fichiers: { nom: string; url: string }[] = []
    if (surveillance.rapport_sig_url) {
      fichiers.push({ nom: `rapport_${surveillance.id}.pdf`, url: surveillance.rapport_sig_url })
    }
    if (surveillance.rapport_fichier_url) {
      fichiers.push({ nom: surveillance.rapport_fichier_nom || `rapport_${surveillance.id}.pdf`, url: surveillance.rapport_fichier_url })
    }
    if (surveillance.lettre_signee_url) {
      fichiers.push({ nom: `lettre_${surveillance.id}.pdf`, url: surveillance.lettre_signee_url })
    }

    // Preuves des checklists (issues de checklist_hierarchy)
    if (surveillance.checklist_hierarchy) {
      const collectPreuves = (items: any[]): void => {
        for (const item of items) {
          if (item.fichiers?.length) {
            for (const f of item.fichiers) {
              fichiers.push({ nom: f.nom || 'preuve', url: f.url })
            }
          }
          if (item.items?.length) collectPreuves(item.items)
          if (item.sousDomaines?.length) {
            for (const sd of item.sousDomaines) {
              collectPreuves(sd.items || [])
              if (sd.sousSousDomaines?.length) {
                for (const ssd of sd.sousSousDomaines) {
                  collectPreuves(ssd.items || [])
                }
              }
            }
          }
        }
      }
      collectPreuves(surveillance.checklist_hierarchy)
    }

    // Preuves des écarts
    if (surveillance.ecarts?.length || surveillance.ecarts_ids?.length) {
      const ecarts = surveillance.ecarts || []
      for (const ecart of ecarts) {
        if (ecart.fichiers?.length) {
          for (const f of ecart.fichiers) {
            fichiers.push({ nom: f.nom || `ecart_${ecart.reference || ecart.id}`, url: f.url })
          }
        }
      }
    }

    // Preuves SGS (issues de sgs_evaluation_prepa)
    if (surveillance.sgs_evaluation_prepa?.composantes) {
      for (const comp of surveillance.sgs_evaluation_prepa.composantes) {
        for (const elem of comp.elements || []) {
          for (const q of elem.questions || []) {
            if (q.preuves?.length) {
              for (const p of q.preuves) {
                fichiers.push({ nom: p.nom || `sgs-${q.ref}`, url: p.url })
              }
            }
          }
        }
      }
    }

    const timeline: RegistreEntry['timeline'] = []
    if (surveillance.created_at) {
      timeline.push({
        id: crypto.randomUUID(), etape: 'Surveillance planifiée',
        date: surveillance.created_at, acteur: 'Système', acteur_role: 'systeme',
        details: `Surveillance ${(surveillance.type || '').replace(/_/g, ' ')} créée`,
      })
    }
    if (surveillance.date_debut) {
      timeline.push({
        id: crypto.randomUUID(), etape: 'Début de la surveillance',
        date: surveillance.date_debut, acteur: surveillance.chef_id || 'Inspecteur', acteur_role: 'inspecteur',
        details: 'Surveillance débutée sur le terrain',
      })
    }
    if (surveillance.signatures_checklist?.length) {
      const sig = surveillance.signatures_checklist[surveillance.signatures_checklist.length - 1]
      timeline.push({
        id: crypto.randomUUID(), etape: 'Checklists signées',
        date: sig.date || surveillance.updated_at, acteur: sig.nom || 'Inspecteur', acteur_role: 'inspecteur',
        details: `${surveillance.signatures_checklist.length} signature(s) sur les checklists`,
      })
    }
    if (surveillance.signatures_ecarts?.length) {
      const sig = surveillance.signatures_ecarts[surveillance.signatures_ecarts.length - 1]
      timeline.push({
        id: crypto.randomUUID(), etape: 'Écarts signés',
        date: sig.date || surveillance.updated_at, acteur: sig.nom || 'Inspecteur', acteur_role: 'inspecteur',
        details: 'Écarts de surveillance signés',
      })
    }
    // Preuves des checklists dans la timeline
    const checklistFichierCount = fichiers.filter(f => !f.nom.startsWith('rapport_') && !f.nom.startsWith('lettre_')).length
    if (checklistFichierCount > 0) {
      timeline.push({
        id: crypto.randomUUID(), etape: 'Preuves jointes',
        date: surveillance.updated_at || surveillance.transmitted_at, acteur: 'Système', acteur_role: 'systeme',
        details: `${checklistFichierCount} fichier(s) de preuve joints (checklists + écarts)`,
      })
    }
    if (surveillance.rapport_signe_le) {
      timeline.push({
        id: crypto.randomUUID(), etape: 'Rapport signé',
        date: surveillance.rapport_signe_le, acteur: surveillance.rapport_signe_par || 'Inspecteur', acteur_role: 'inspecteur',
        fichiers: surveillance.rapport_sig_url ? [{ nom: `rapport_${surveillance.id}.pdf`, url: surveillance.rapport_sig_url }] : [],
        details: 'Rapport de surveillance signé',
      })
    }
    if (surveillance.lettre_signee_url) {
      timeline.push({
        id: crypto.randomUUID(), etape: 'Lettre signée',
        date: surveillance.date_fin || surveillance.updated_at, acteur: 'Inspecteur', acteur_role: 'inspecteur',
        fichiers: [{ nom: `lettre_${surveillance.id}.pdf`, url: surveillance.lettre_signee_url }],
        details: 'Lettre de transmission signée',
      })
    }
    if (surveillance.transmitted_at) {
      timeline.push({
        id: crypto.randomUUID(), etape: 'Transmise à l\'exploitant',
        date: surveillance.transmitted_at, acteur: 'Système', acteur_role: 'systeme',
        details: 'Rapport transmis à l\'exploitant',
      })
    }

    return {
      type: 'surveillance',
      reference: surveillance.id,
      titre: `Surveillance ${aerodrome?.code_oaci || ''} — ${(surveillance.type || '').replace(/_/g, ' ')}`,
      description: surveillance.observations || `Surveillance ${(surveillance.type || '').replace(/_/g, ' ')} archivée`,
      date_entree: surveillance.date_debut,
      aerodrome_id: surveillance.aerodrome_id,
      fichiers,
      timeline,
      statut: 'valide',
      auto_generated: true,
      source_id: surveillance.id,
      source_type: 'surveillance',
      created_by: surveillance.created_by || '',
    }
  },

  getCouleurType(type: string): string {
    const couleurs: Record<string, string> = {
      'formation': 'bg-blue-100 text-blue-800',
      'evenement': 'bg-orange-100 text-orange-800',
      'surveillance': 'bg-purple-100 text-purple-800',
      'certification': 'bg-green-100 text-green-800',
      'homologation': 'bg-teal-100 text-teal-800',
      'ecart': 'bg-red-100 text-red-800',
      'exploitation': 'bg-gray-100 text-gray-800',
      'dossier': 'bg-role-primary-soft text-role-primary'
    }
    return couleurs[type] || 'bg-gray-100 text-gray-800'
  }
}