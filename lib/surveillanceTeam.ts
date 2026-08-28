// Helpers pour résoudre l'équipe d'une surveillance.
// Source de vérité : surveillance.equipe_ids. Si vide, on retombe sur le
// planning lié (planning_id → planning.equipe_ids + inspecteurs délégataires),
// car l'équipe est choisie dans le planning.

interface SurveillanceLike {
  equipe_ids: string[]
  chef_id: string
  planning_id?: string
}

interface PlanningLike {
  id: string
  equipe_ids?: string[]
  chef_id?: string
  delegations?: Record<string, string>
}

/**
 * Retourne la liste effective des IDs des membres de l'équipe d'une
 * surveillance, en retombant sur le planning lié lorsque la surveillance
 * n'a pas d'équipe renseignée.
 */
export function getSurveillanceEquipeIds(
  surveillance: SurveillanceLike | null | undefined,
  plannings: PlanningLike[],
): string[] {
  if (!surveillance) return [];
  let ids = surveillance.equipe_ids || [];
  if (ids.length === 0 && surveillance.planning_id) {
    const planning = plannings.find(p => p.id === surveillance.planning_id);
    ids = planning?.equipe_ids || [];
    if (planning?.delegations) {
      const delegataires = Object.values(planning.delegations).filter((v): v is string => Boolean(v));
      ids = Array.from(new Set([...ids, ...delegataires]));
    }
  }
  return ids;
}

/**
 * Retourne l'ID effectif du chef de mission, en retombant sur le planning
 * lié lorsque la surveillance n'a pas de chef renseigné.
 */
export function getSurveillanceChefId(
  surveillance: SurveillanceLike | null | undefined,
  plannings: PlanningLike[],
): string {
  if (!surveillance) return '';
  const chefId = surveillance.chef_id || '';
  if (chefId) return chefId;
  if (surveillance.planning_id) {
    return plannings.find(p => p.id === surveillance.planning_id)?.chef_id || '';
  }
  return '';
}
