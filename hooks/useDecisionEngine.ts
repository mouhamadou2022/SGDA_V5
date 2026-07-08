// hooks/useDecisionEngine.ts
// Hook React qui orchestre les engines spécialisés via decisionEngine

import { useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { decisionEngine, type AnalysePreparation } from '@/lib/ia/decisionEngine'

export function useDecisionEngine(aerodromeId: string | null): AnalysePreparation | null {
  const aerodromes = useAppStore(s => s.aerodromes)
  const getProfilRisque = useAppStore(s => s.getProfilRisque)
  const ecarts = useAppStore(s => s.ecarts)
  const surveillances = useAppStore(s => s.surveillances)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const plannings = useAppStore(s => s.plannings)
  const formations = useAppStore(s => s.formations)

  return useMemo(() => {
    if (!aerodromeId) return null
    const aerodrome = aerodromes.find(a => a.id === aerodromeId) || null
    const profil = getProfilRisque(aerodromeId)
    return decisionEngine.analyserPreparation(
      aerodrome, profil, ecarts, surveillances,
      utilisateurs, plannings, formations || [],
    )
  }, [aerodromeId, aerodromes, getProfilRisque, ecarts, surveillances, utilisateurs, plannings, formations])
}
