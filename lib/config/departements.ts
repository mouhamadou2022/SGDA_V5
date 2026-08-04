export type Departement = 'DNSA' | 'DNA'

export interface DepartementConfig {
  id: Departement
  label: string
  labelCourt: string
  entiteLabel: string
  entitePluriel: string
  entiteIcone: string
  referentielReglementaire: string
  modulesExclus: string[]
  intituleProfilRisque?: string
}

export const DEPARTEMENTS: Record<Departement, DepartementConfig> = {
  DNSA: {
    id: 'DNSA',
    label: 'Normes et Sécurité des Aérodromes',
    labelCourt: 'Aérodromes',
    entiteLabel: 'Aérodrome',
    entitePluriel: 'Aérodromes',
    entiteIcone: '✈',
    referentielReglementaire: 'RAS 14',
    modulesExclus: [],
    intituleProfilRisque: 'Profil de risque aérodrome',
  },
  DNA: {
    id: 'DNA',
    label: 'Navigation Aérienne',
    labelCourt: 'Navigation',
    entiteLabel: 'Fournisseur de service',
    entitePluriel: 'Fournisseurs de service',
    entiteIcone: '🛰',
    referentielReglementaire: 'RAS 10 / Doc 4444',
    modulesExclus: ['certification', 'homologation', 'dossiers'],
    intituleProfilRisque: 'Profil de risque navigation',
  },
}

export const MODULES_PAR_DEPARTEMENT: Record<Departement, string[]> = {
  DNSA: [
    'dashboard', 'aerodromes', 'certification', 'homologation', 'planning',
    'surveillance', 'plans-actions', 'registres', 'dossiers', 'formation',
    'kit', 'evenements', 'enquetes', 'messagerie', 'risque', 'charge',
  ],
  DNA: [
    'dashboard', 'aerodromes', 'planning',
    'surveillance', 'plans-actions', 'registres', 'formation',
    'kit', 'evenements', 'enquetes', 'messagerie', 'risque', 'charge',
  ],
}

export function getModulesExclus(departement: Departement): string[] {
  return DEPARTEMENTS[departement]?.modulesExclus ?? []
}

export function estModuleAutorise(moduleId: string, departement: Departement): boolean {
  return !getModulesExclus(departement).includes(moduleId)
}
