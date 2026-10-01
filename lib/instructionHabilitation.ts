// lib/instructionHabilitation.ts
// Étape 2 unification workflow : habilitations + équipe d'instruction.
// - Équipe désignée UNE SEULE FOIS par dossier (modifiable), partagée par les
//   phases : clé `instruction` dans phases_data (migration transparente depuis
//   les champs par-phase de l'étape 1).
// - Experts externes admis comme membres (sans compte, sans notification).
// - Vérifications : chef titulaire/principal (bloquant), habilitations
//   expirées et couverture spécialités (avertissements).

import { buildHabilitations } from './competences'
import type { Utilisateur } from './store'

export const TYPES_CHEF_AUTORISES = ['inspecteur_titulaire', 'inspecteur_principal']

export function peutEtreChefInstruction(u: Pick<Utilisateur, 'type_inspecteur'> | undefined): boolean {
  if (!u) return false
  return TYPES_CHEF_AUTORISES.includes(u.type_inspecteur || '')
}

export interface ExpertExterne {
  id: string
  nom: string
  specialite?: string
  organisme?: string
}

export interface InstructionDossier {
  responsable_id?: string
  equipe_ids?: string[]
  chef_id?: string
  /** Experts externes (sans compte) : membres d'équipe à part entière. */
  externes?: ExpertExterne[]
  assigne_le?: string
  assigne_par?: string
}

type PhasesData = Record<string, (InstructionDossier & Record<string, unknown>) | undefined>

/**
 * Lit l'instruction du dossier : clé partagée `instruction`, sinon repli sur
 * les champs par-phase (données de l'étape 1 : phase1 puis phase2).
 */
export function lireInstruction(phasesData: PhasesData | null | undefined): InstructionDossier {
  if (!phasesData) return {}
  const partagee = phasesData.instruction
  if (partagee && (partagee.responsable_id || (partagee.equipe_ids || []).length > 0 || partagee.chef_id || (partagee.externes || []).length > 0)) {
    return {
      responsable_id: partagee.responsable_id,
      equipe_ids: partagee.equipe_ids || [],
      chef_id: partagee.chef_id,
      externes: partagee.externes || [],
      assigne_le: partagee.assigne_le,
      assigne_par: partagee.assigne_par,
    }
  }
  const p1 = phasesData.phase1 || {}
  const p2 = phasesData.phase2 || {}
  return {
    responsable_id: p1.responsable_id || p2.responsable_id,
    equipe_ids: [...new Set([...(p1.equipe_ids || []), ...(p2.equipe_ids || [])])],
    chef_id: p1.chef_id || p2.chef_id,
    externes: [],
    assigne_le: p1.assigne_le || p2.assigne_le,
    assigne_par: p1.assigne_par || p2.assigne_par,
  }
}

export interface VerificationEquipe {
  /** Bloque l'assignation. */
  blocages: string[]
  /** N'empêche pas, à afficher. */
  avertissements: string[]
}

function nomCourt(u: Utilisateur): string {
  return `${u.prenom || ''} ${u.nom || ''}`.trim() || u.id
}

/**
 * Vérifie une équipe d'instruction : chef habilité (bloquant), habilitations
 * expirées et couverture des spécialités (avertissements).
 */
export function verifierEquipeInstruction(
  membres: Utilisateur[],
  chefId: string | undefined,
  nbExternes: number,
): VerificationEquipe {
  const blocages: string[] = []
  const avertissements: string[] = []

  if (chefId) {
    const chef = membres.find(m => m.id === chefId)
    if (!chef) {
      blocages.push('Le chef désigné ne fait pas partie de l’équipe.')
    } else if (!peutEtreChefInstruction(chef)) {
      blocages.push(
        `${nomCourt(chef)} ne peut pas être chef d’équipe (réservé aux inspecteurs titulaires ou principaux).`,
      )
    }
  }

  for (const m of membres) {
    if (!['inspecteur', 'chef_inspecteur', 'admin'].includes(m.role)) {
      blocages.push(`${nomCourt(m)} n’a pas un rôle d’inspection (rôle : ${m.role}).`)
    }
    const habs = buildHabilitations(m)
    const expirees = habs.filter(h => h.statut === 'expire')
    if (expirees.length > 0) {
      avertissements.push(
        `${nomCourt(m)} : habilitation(s) expirée(s) (${expirees.map(h => h.domaine).join(', ')}) — à renouveler.`,
      )
    }
    const bientot = habs.filter(h => h.statut === 'expire_bientot')
    if (bientot.length > 0) {
      avertissements.push(
        `${nomCourt(m)} : habilitation(s) expirant bientôt (${bientot.map(h => h.domaine).join(', ')}).`,
      )
    }
  }

  const specs = new Set<string>()
  for (const m of membres) for (const s of m.specialites || []) specs.add(s)
  if (specs.size === 0 && nbExternes === 0) {
    avertissements.push('Aucune spécialité déclarée dans l’équipe — vérifiez la couverture des domaines.')
  }

  return { blocages, avertissements }
}
