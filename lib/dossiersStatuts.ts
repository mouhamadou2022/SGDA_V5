// lib/dossiersStatuts.ts
// SOURCE UNIQUE des statuts dossiers + assignations : mêmes libellés et
// couleurs pour tous les rôles (évite « terminé ici, en cours ailleurs »).

export interface StatutDossierInfo {
  value: string
  label: string
  className: string
}

export const STATUTS_DOSSIER: StatutDossierInfo[] = [
  { value: 'en_attente', label: 'En attente', className: 'badge warning' },
  { value: 'en_cours', label: 'En cours', className: 'badge primary' },
  { value: 'termine', label: 'Terminé', className: 'badge success' },
  { value: 'archive', label: 'Archivé', className: 'badge neutral' },
]

export const STATUTS_ASSIGNMENT: StatutDossierInfo[] = [
  { value: 'attribue', label: 'Attribué', className: 'badge neutral' },
  { value: 'accuse', label: 'Accusé réception', className: 'badge primary' },
  { value: 'en_cours', label: 'En cours', className: 'badge primary' },
  { value: 'en_validation', label: 'En validation', className: 'badge warning' },
  { value: 'valide', label: 'Validé', className: 'badge success' },
  { value: 'termine', label: 'Terminé', className: 'badge success' },
]

function chercher(liste: StatutDossierInfo[], statut: string): StatutDossierInfo {
  return liste.find(s => s.value === statut) || { value: statut, label: statut, className: 'badge neutral' }
}

export function infoStatutDossier(statut: string): StatutDossierInfo {
  return chercher(STATUTS_DOSSIER, statut)
}

export function infoStatutAssignment(statut: string): StatutDossierInfo {
  return chercher(STATUTS_ASSIGNMENT, statut)
}
