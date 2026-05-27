// lib/hooks/useABTesting.ts
// Hook client qui intercepte les prédictions et enregistre les tests A/B
// entre neural_net (serveur) et formules (client)

'use client'

import { useCallback } from 'react'
import { recordABTest } from '@/lib/ab_testing'
import { useAppStore } from '@/lib/store'

export function useABTesting() {
  const aerodromes = useAppStore(s => s.aerodromes)
  const profilsRisque = useAppStore(s => s.profilsRisque)

  const runABComparison = useCallback(async (aerodromeId: string) => {
    const aero = aerodromes.find(a => a.id === aerodromeId)
    if (!aero) return null

    const profil = profilsRisque?.[aerodromeId]
    const features: number[] = [
      profil?.c1 ?? 50, profil?.c2 ?? 50, profil?.c3 ?? 50,
      profil?.c4 ?? 50, profil?.c5 ?? 50,
      50, // maturite SGS
      0, 0, 70,
    ]

    // Prédiction via neural_net (serveur)
    let scoreNN = profil?.score_global ?? 50
    try {
      const r = await fetch('/api/ia/ml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'predict', aerodrome_id: aerodromeId, features }),
      })
      if (r.ok) {
        const data = await r.json()
        scoreNN = data.score_predicted
      }
    } catch { /* use fallback */ }

    // Score formules = score actuel du profil
    const scoreFormulas = profil?.score_global ?? 50

    // Déterminer qui gagne (le plus proche de la cible idéale ~70)
    const winner = Math.abs(scoreNN - 70) < Math.abs(scoreFormulas - 70) ? 'neural_net' as const : Math.abs(scoreNN - 70) > Math.abs(scoreFormulas - 70) ? 'formulas' as const : 'tie' as const

    recordABTest({
      aerodrome_id: aerodromeId,
      code_oaci: aero.code_oaci ?? 'N/A',
      features,
      score_neural_net: scoreNN,
      score_formulas: scoreFormulas,
      winner,
    })

    return { scoreNN, scoreFormulas, winner }
  }, [aerodromes, profilsRisque])

  return { runABComparison }
}
