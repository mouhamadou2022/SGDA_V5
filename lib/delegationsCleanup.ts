// lib/delegationsCleanup.ts
// Unification de la mémoire des délégations :
//  - planning.delegations (base) = source de vérité unique pour la préparation
//  - store delegations[] = suivi d'exécution des checklists
//  - localStorage `sgda_delegations_*` = résidu historique, migré puis purgé

import { useAppStore } from '@/lib/store'

const CLEF_PREFIXE = 'sgda_delegations_'

/**
 * Nettoie la mémoire des délégations :
 *  1. Migration des clés localStorage `sgda_delegations_<planningId>` vers
 *     planning.delegations (base) si la base est vide, puis suppression de la clé.
 *  2. Suppression des délégations orphelines dans le store (surveillance disparue,
 *     domaine vide, inspecteur vide) et des doublons par (surveillance, domaine).
 */
export async function nettoyerMemoDelegations(): Promise<void> {
  if (typeof window === 'undefined') return

  const store = useAppStore.getState()
  const plannings = store.plannings

  // 1. Migrer puis purger les clés localStorage résiduelles
  const cles: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const cle = window.localStorage.key(i)
    if (cle && cle.startsWith(CLEF_PREFIXE)) cles.push(cle)
  }

  for (const cle of cles) {
    const planningId = cle.slice(CLEF_PREFIXE.length)
    let valeur: Record<string, string> = {}
    try {
      const brut = window.localStorage.getItem(cle)
      if (brut) valeur = JSON.parse(brut)
    } catch { /* clé corrompue : purge directe */ }

    const planning = plannings.find(p => p.id === planningId)
    const baseVide = !planning?.delegations || Object.keys(planning.delegations).length === 0
    const valeurUtile = Object.entries(valeur).filter(([, id]) => id).length > 0

    // Migrer vers la base uniquement si le planning existe et qu'aucune donnée
    // plus récente n'y est déjà présente.
    if (planning && baseVide && valeurUtile) {
      await store.updatePlanning(planningId, { delegations: valeur })
    }

    window.localStorage.removeItem(cle)
  }

  // 2. Nettoyer le store : orphelines + doublons
  store.cleanupDelegations()
}
