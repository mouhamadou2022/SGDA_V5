import type { Aerodrome, Utilisateur, Surveillance } from '@/lib/store'
import type { AnalysePreparation } from './decisionEngine'

// Déclencheurs qui nécessitent une action automatique
const DECLENCHEURS_URGENCE = ['score_critique', 'ecarts_critiques', 'transition_hmm', 'certificat', 'tendance_baisse']

export interface AutoTriggerResult {
  declencheurDeclenche: boolean
  type: string
  description: string
  surveillancePreRemplie?: {
    type: Surveillance['type']
    portee: string[]
    equipe_ids: string[]
    justification: string
  }
}

export function verifierDeclencheursAutomatiques(
  analyse: AnalysePreparation,
  aerodrome: Aerodrome | null,
  utilisateurs: Utilisateur[],
): AutoTriggerResult | null {
  const declencheursElevees = analyse.declencheurs.filter(d => d.urgence === 'elevee')
  if (declencheursElevees.length === 0) return null

  const prioritaire = declencheursElevees.find(d => DECLENCHEURS_URGENCE.includes(d.type))
    || declencheursElevees[0]

  // Inspecteurs disponibles (non chef et non surchargés)
  const inspecteursDispos = utilisateurs
    .filter(u => u.role === 'inspector' && u.statut === 'actif')
    .slice(0, 3)
    .map(u => u.id)

  return {
    declencheurDeclenche: true,
    type: prioritaire.type,
    description: prioritaire.description,
    surveillancePreRemplie: {
      type: prioritaire.type === 'transition_hmm' || prioritaire.type === 'score_critique'
        ? 'inopinee'
        : prioritaire.type === 'ecarts_critiques'
          ? 'suivi_ecarts'
          : 'urgence',
      portee: analyse.portee.domaines,
      equipe_ids: inspecteursDispos,
      justification: `Déclenchement automatique AERORISQ: ${prioritaire.type} — ${prioritaire.description}`,
    },
  }
}

export function genererMessageNotification(
  aerodrome: Aerodrome | null,
  result: AutoTriggerResult,
): { titre: string; message: string } {
  const nomAero = aerodrome?.nom || 'Aérodrome inconnu'
  const codeOACI = aerodrome?.code_oaci || 'N/C'

  const messages: Record<string, string> = {
    score_critique: `Le score de risque de ${nomAero} (${codeOACI}) est critique. Une inspection d'urgence est requise.`,
    ecarts_critiques: `${nomAero} (${codeOACI}) accumule des écarts critiques nécessitant une intervention immédiate.`,
    transition_hmm: `Alerte AERORISQ: Transition de régime détectée sur ${nomAero} (${codeOACI}). Risque de passage en état critique.`,
    certificat: `Alerte certificat pour ${nomAero} (${codeOACI}): risque de suspension/retrait du certificat.`,
    tendance_baisse: `Dégradation continue du profil de risque de ${nomAero} (${codeOACI}). Surveillance renforcée recommandée.`,
  }

  return {
    titre: `Alerte AERORISQ — ${nomAero} (${codeOACI})`,
    message: messages[result.type] || `Alerte automatique AERORISQ pour ${nomAero} (${codeOACI}): ${result.description}`,
  }
}
