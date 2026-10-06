// components/modules/profil-risque/usePoidsAppris.ts
// Poids C1-C5 effectifs (appris par l'IA, repli défauts) + indicateur de
// personnalisation. Source unique côté UI pour ne plus raisonner en
// 20/25/20/20/15 fixe alors que le moteur utilise les poids appris.
'use client'

import { useEffect, useState } from 'react'
import { DEFAULT_WEIGHTS, fetchLearnedWeights, type WeightMap } from '@/lib/ia/weightController'

export function usePoidsAppris(): { poids: WeightMap; personnalises: boolean } {
  const [poids, setPoids] = useState<WeightMap>({ ...DEFAULT_WEIGHTS })
  const [personnalises, setPersonnalises] = useState(false)
  useEffect(() => {
    fetchLearnedWeights()
      .then((w) => {
        setPoids(w)
        setPersonnalises(
          Object.keys(DEFAULT_WEIGHTS).some((k) => w[k] !== DEFAULT_WEIGHTS[k as keyof typeof DEFAULT_WEIGHTS]),
        )
      })
      .catch(() => {})
  }, [])
  return { poids, personnalises }
}
