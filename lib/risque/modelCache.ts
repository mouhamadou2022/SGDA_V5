// lib/risque/modelCache.ts
// Cache partagé pour les 6 modèles avancés, évite le double calcul
// entre riskAgent et planningGenerator

import type { ProfilRisque } from '@/lib/store'
import { predictHMM, type HMMPrediction } from '@/lib/risque/hmm'
import { predictSurvival, type SurvivalPrediction } from '@/lib/risque/survival'
import { predictEVT, type EVTPrediction } from '@/lib/risque/extreme'
import { predictNB, type NBPrediction } from '@/lib/risque/negativeBinomial'
import { predictCopula, type CopulaPrediction } from '@/lib/risque/copulas'
import { createThompsonSampling, type TSPrediction } from '@/lib/risque/thompsonSampling'

interface CacheEntry {
  hmm?: HMMPrediction | null
  survival?: SurvivalPrediction | null
  evt?: EVTPrediction | null
  nb?: NBPrediction | null
  copula?: CopulaPrediction | null
  ts?: TSPrediction | null
  computedAt: number
}

class ModelCache {
  private cache = new Map<string, CacheEntry>()
  private readonly TTL = 5 * 60 * 1000 // 5 minutes

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.computedAt > this.TTL
  }

  private getOrCreate(aerodromeId: string): CacheEntry {
    const existing = this.cache.get(aerodromeId)
    if (existing && !this.isExpired(existing)) return existing
    const entry: CacheEntry = { computedAt: Date.now() }
    this.cache.set(aerodromeId, entry)
    return entry
  }

  computeAll(
    aerodromeId: string,
    scoresHistoriques: number[],
    profil: ProfilRisque
  ): CacheEntry {
    const entry = this.getOrCreate(aerodromeId)
    if (entry.hmm !== undefined) return entry // déjà calculé

    if (scoresHistoriques.length >= 3) {
      try { entry.hmm = predictHMM(scoresHistoriques) } catch { entry.hmm = null }
      try {
        const survEvents = scoresHistoriques.map((s, i) => ({
          time: i * 30 + 1, event: s < 30, score: s, covariates: [s, profil.score_global],
        }))
        entry.survival = predictSurvival(survEvents, [profil.score_global, profil.score_global])
      } catch { entry.survival = null }
      try {
        const extremes = scoresHistoriques.map(s => ({ value: 100 - s, date: '' }))
        entry.evt = predictEVT(extremes)
      } catch { entry.evt = null }
      try {
        const counts = scoresHistoriques.map(s => Math.max(0, Math.round((100 - s) / 10)))
        entry.nb = predictNB(counts)
      } catch { entry.nb = null }
      try {
        entry.copula = predictCopula([{ c1: profil.c1, c2: profil.c2, c3: profil.c3, c4: profil.c4, c5: profil.c5 }])
      } catch { entry.copula = null }
      try {
        const actions = [
          { id: 'audit_complet', name: 'Audit complet', alpha: 7, beta: 3 },
          { id: 'maintien', name: 'Maintien', alpha: 6, beta: 4 },
          { id: 'periodique', name: 'Périodique', alpha: 5, beta: 5 },
        ]
        const ts = createThompsonSampling(actions)
        entry.ts = ts
      } catch { entry.ts = null }
    }
    return entry
  }

  get(aerodromeId: string): CacheEntry | undefined {
    const entry = this.cache.get(aerodromeId)
    if (entry && !this.isExpired(entry)) return entry
    this.cache.delete(aerodromeId)
    return undefined
  }

  invalidate(aerodromeId: string) {
    this.cache.delete(aerodromeId)
  }

  clear() { this.cache.clear() }
}

export const modelCache = new ModelCache()
