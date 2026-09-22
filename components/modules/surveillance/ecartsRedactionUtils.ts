// components/modules/surveillance/ecartsRedactionUtils.ts
// Constantes + helpers purs extraits du module (testes).

export const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
export const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

export const NIVEAUX = [
  { value: 'critique', label: 'Critique', variant: 'danger', delais: { pac: 3, regularisation: 7 } },
  { value: 'eleve', label: 'Élevé', variant: 'warning', delais: { pac: 7, regularisation: 30 } },
  { value: 'moyen', label: 'Moyen', variant: 'primary', delais: { pac: 15, regularisation: 90 } },
  { value: 'faible', label: 'Faible', variant: 'success', delais: { pac: 30, regularisation: 180 } },
];

export function isValidOACI(cellule: string | undefined | null): cellule is string {
  return typeof cellule === 'string' && /^[1-5][A-E]$/.test(cellule);
}

/**
 * Découpe un libellé combiné (puces numérotées « 1. », « 2. », « 3. ») en libellés
 * séparés. Si le libellé contient plusieurs puces, renvoie une puce par élément.
 * Sinon renvoie le libellé entier en un seul élément.
 */
export function decouperLibelleEnEcarts(libelle: string): string[] {
  const parts = libelle
    .split(/(?=^\s*\d+[.)]\s*)/m)
    .map(p => p.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [libelle.trim()];
}

export function getProgressBarColorDynamic(taux: number): string {
  if (taux >= 80) return 'bg-success';
  if (taux >= 60) return 'bg-primary';
  if (taux >= 40) return 'bg-warning';
  return 'bg-danger';
}
