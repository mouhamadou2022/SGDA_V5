// lib/ia/engines/teamOptimizer.ts
// Optimise la composition d'équipe : compétences, charge, disponibilité

import type { Utilisateur, Planning, Formation } from '@/lib/store'

export interface TeamProposal {
  inspecteurs: Array<{
    id: string
    nom: string
    prenom: string
    competences: string[]
    chargeActuelle: number
    niveauMax: string
    score: number
    peutEtreChef: boolean
  }>
  chefPropose?: string
  justification: string
}

interface InspecteurAvecCompetence extends Utilisateur {
  _insp?: { type?: string; domaine_principal?: string }
}

export class TeamOptimizer {
  proposer(
    utilisateurs: Utilisateur[],
    plannings: Planning[],
    domaines: string[],
    formations: Formation[],
  ): TeamProposal {
    const inspecteurs: InspecteurAvecCompetence[] = utilisateurs
      .filter((u: InspecteurAvecCompetence) =>
        (u.role === 'inspector' || u.role === 'inspecteur_principal') &&
        u.statut !== 'inactif' && u.statut !== 'suspendu'
      )

    const charges: Record<string, number> = {}
    for (const p of plannings) {
      for (const id of p.equipe_ids || []) {
        charges[id] = (charges[id] || 0) + 1
      }
    }

    const domainesExpandus = expandDomainesSimples(domaines)
    const competencesParDomaine: Record<string, string[]> = {
      SGS: ['management_sgs', 'securite', 'audit'],
      PHY: ['genie_civil', 'infrastructure', 'travaux'],
      OLS: ['obstacle', 'balisage', 'signalisation'],
      OPS: ['exploitation', 'operations', 'procedures'],
      ELEC: ['balisage', 'electricite', 'maintenance'],
      SLI: ['incendie', 'sauvetage', 'intervention'],
      RA: ['environnement', 'reglementaire', 'juridique'],
      MFP: ['signalisation', 'marquage'],
      COP: ['formation', 'qualification', 'pedagogie'],
      PAC: ['plan_action', 'correctif', 'suivi'],
    }

    const competencesRequises = [
      ...new Set(domainesExpandus.flatMap(d => competencesParDomaine[d] || [])),
    ]

    const notes = inspecteurs.map(insp => {
      const comps = (insp as any).competences || []
      const match = competencesRequises.filter(c =>
        comps.some((cc: { domaine: string; niveau: string }) => cc.domaine === c)
      ).length
      const charge = charges[insp.id] || 0
      const niveauMax = comps.length > 0
        ? Math.max(...comps.map((c: { niveau: string }) =>
            c.niveau === 'expert' ? 3 : c.niveau === 'confirme' ? 2 : 1
          ))
        : 0
      const peutEtreChef = ['inspecteur_titulaire', 'inspecteur_principal'].includes(
        (insp as InspecteurAvecCompetence)._insp?.type || insp.type_inspecteur || ''
      )
      return {
        id: insp.id, nom: insp.nom, prenom: insp.prenom,
        competences: comps.map((c: any) => c.domaine || c),
        chargeActuelle: charge, niveauMax: ['', 'debutant', 'confirme', 'expert'][niveauMax] || 'inconnu',
        score: match * 5 - charge * 2 + (peutEtreChef ? 3 : 0) + niveauMax * 2,
        peutEtreChef,
      }
    })
      .filter(n => n.score > 0 || domainesExpandus.length <= 2)
      .sort((a, b) => b.score - a.score)

    const equipeFinale = notes.slice(0, Math.min(4, Math.max(2, domainesExpandus.length)))
    const chef = equipeFinale.find(i => i.peutEtreChef) || equipeFinale[0]

    return {
      inspecteurs: equipeFinale,
      chefPropose: chef?.id,
      justification: equipeFinale.length > 0
        ? `Équipe proposée: ${equipeFinale.map(i => `${i.prenom} ${i.nom}`).join(', ')} (basée sur compétences et charge)`
        : 'Aucun inspecteur disponible avec les compétences requises',
    }
  }
}

function expandDomainesSimples(domaines: string[]): string[] {
  const expansions: Record<string, string[]> = {
    AGA: ['SGS', 'PHY', 'OPS', 'ELEC', 'SLI', 'RA', 'MFP', 'COP'],
    XXX: ['SGS', 'PHY', 'OPS', 'ELEC', 'SLI', 'RA', 'MFP', 'COP'],
  }
  return domaines.flatMap(d => expansions[d] || [d])
}

export const teamOptimizer = new TeamOptimizer()
