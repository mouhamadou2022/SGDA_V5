// lib/acteurs.ts — Résolution d'identités pour l'affichage.
// Règle : jamais d'UUID brut à l'écran. Feuille pure (aucun import).

export interface PersonneNommable {
  id?: string
  user_id?: string
  prenom?: string
  nom?: string
  email?: string
}

/** Nom affichable d'un acteur (id compte, id inspecteur ou 'system'). */
export function nomActeur(
  acteurId: string | undefined | null,
  personnes: readonly PersonneNommable[],
): string {
  if (!acteurId) return 'Inconnu'
  if (acteurId === 'system') return 'Système'
  const personne = personnes.find(p =>
    p.id === acteurId || (p.user_id != null && p.user_id === acteurId))
  if (personne) {
    const nom = `${personne.prenom || ''} ${personne.nom || ''}`.trim()
    return nom || personne.email || 'Utilisateur'
  }
  // Repli : préfixe court, jamais l'UUID complet.
  return `ID ${acteurId.slice(0, 8)}`
}

/** Libellé français d'un rôle d'acteur (repli : valeur brute capitalisée). */
export function labelRoleActeur(role: string | undefined | null): string {
  const labels: Record<string, string> = {
    system: 'Système',
    inspector: 'Inspecteur',
    admin: 'Admin',
    chef_sna: 'Chef SNA',
    focal_operator: 'Point focal',
    dg_operator: 'DG exploitant',
    staff_operator: 'Exploitant',
  }
  if (!role) return ''
  return labels[role] || role
}
