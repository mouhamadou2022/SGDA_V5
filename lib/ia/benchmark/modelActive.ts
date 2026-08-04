// lib/ia/benchmark/modelActive.ts
// Gestionnaire du modèle ML actif : le modèle sélectionné (via le benchmark) pilote
// réellement les prédictions de niveau de risque. Garde l'instance entraînée en mémoire
// (sur tous les échantillons disponibles) et la rend consultable par le moteur de risque.

import type { ModeleBenchmark, ModeleBenchmarkId } from './types'
import type { BenchmarkConfig } from './config'
import { creerModelesBenchmark, lireSelection, MODELE_LABELS } from './benchmarkEngine'
import { profilToFeatures } from '@/lib/risque/randomForest'
import type { ProfilRisque } from '@/lib/store'

export interface PredictionActive {
  prediction: string
  confidence: number
}

// L'ordre des features doit être identique à celui du RF (lib/risque/randomForest).
function deriveFeaturesOrder(): string[] {
  return Object.keys(profilToFeatures({
    score_global: 0, c1: 0, c2: 0, c3: 0, c4: 0, c5: 0,
    tendance: 'stable', prediction_3m: 0, prediction_6m: 0,
  }))
}

class ModelActiveManager {
  private model: ModeleBenchmark | null = null
  private modelId: ModeleBenchmarkId | null = null
  private featuresOrder: string[] = deriveFeaturesOrder()
  private trainedAt: string | null = null

  /** Modèle actif en mémoire (null si aucun modèle sélectionné/entraîné). */
  getActive(): { modelId: ModeleBenchmarkId; nom: string; trainedAt: string | null } | null {
    if (!this.modelId || !this.model) return null
    return { modelId: this.modelId, nom: MODELE_LABELS[this.modelId], trainedAt: this.trainedAt }
  }

  /** Entraîne le modèle sélectionné sur TOUS les échantillons disponibles. */
  async trainFromSamples(
    samples: Array<{ features: Record<string, number>; label: string }>,
    modelId: ModeleBenchmarkId | null = null,
    config?: BenchmarkConfig,
  ): Promise<ModeleBenchmarkId | null> {
    const id = modelId ?? lireSelection()
    if (!id || samples.length < 10) return null

    const target = creerModelesBenchmark(config).find(m => m.info.id === id)
    if (!target) return null

    await target.train(samples.map(s => ({
      features: this.featuresOrder.map(k => s.features[k] ?? 0),
      label: s.label,
    })))

    this.model = target
    this.modelId = id
    this.trainedAt = new Date().toISOString()
    return id
  }

  /** Prédit le niveau de risque depuis un profil, via le modèle actif. */
  predict(profil: ProfilRisque): PredictionActive | null {
    if (!this.model || !this.modelId) return null
    const features = profilToFeatures(profil)
    const arr = this.featuresOrder.map(k => features[k] ?? 0)
    const res = this.model.predict(arr)
    return {
      prediction: res.prediction,
      confidence: res.confidence / 100,
    }
  }

  reset(): void {
    this.model = null
    this.modelId = null
    this.trainedAt = null
  }
}

export const modelActive = new ModelActiveManager()
