// lib/evenementsStatuts.ts
// SOURCE UNIQUE des statuts d'événements : mêmes 12 statuts, mêmes libellés,
// mêmes couleurs, pour tous les rôles (admin, inspecteur, exploitant).
// Des copies locales partielles affichaient des codes bruts (« assigne »)
// côté exploitant — ne plus dupliquer, importer d'ici.

export interface StatutEvenementInfo {
  value: string
  label: string
  className: string
}

export const STATUTS_EVENEMENT: StatutEvenementInfo[] = [
  { value: 'recu', label: 'Reçu', className: 'badge neutral' },
  { value: 'assigne', label: 'Assigné', className: 'badge primary' },
  { value: 'accepte', label: 'Accepté', className: 'badge primary' },
  { value: 'refuse', label: 'Refusé', className: 'badge danger' },
  { value: 'attente_operateur', label: 'Attente exploitant', className: 'badge warning' },
  { value: 'en_cours', label: 'En cours', className: 'badge primary' },
  { value: 'analyse', label: 'Analyse', className: 'badge warning' },
  { value: 'ecart_cree', label: 'Écart créé', className: 'badge warning' },
  { value: 'rapport_redige', label: 'Rapport rédigé', className: 'badge success' },
  { value: 'soumis_validation', label: 'Soumis validation', className: 'badge warning' },
  { value: 'retourne', label: 'Retourné', className: 'badge warning' },
  { value: 'cloture', label: 'Clôturé', className: 'badge success' },
]

export function infoStatutEvenement(statut: string): StatutEvenementInfo {
  return STATUTS_EVENEMENT.find(s => s.value === statut) || { value: statut, label: statut, className: 'badge neutral' }
}

export function labelStatutEvenement(statut: string): string {
  return infoStatutEvenement(statut).label
}
