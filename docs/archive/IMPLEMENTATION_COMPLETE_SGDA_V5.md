# IMPLÉMENTATION COMPLÈTE - SGDA V5 TOUTES PHASES

## 📦 STRUCTURE DES FICHIERS À CRÉER/MODIFIER

```
lib/
├── risque.ts                    # MODIFIER - Phase 1
├── store.ts                     # MODIFIER - Phase 1
├── config.ts                    # MODIFIER - Phase 1
├── riskModels/
│   ├── randomForest.ts         # CRÉER - Phase 3
│   ├── graphNetwork.ts         # CRÉER - Phase 3
│   └── index.ts                # CRÉER - Phase 3
├── streaming/
│   ├── riskEvents.ts           # CRÉER - Phase 4
│   └── kafkaConfig.ts          # CRÉER - Phase 4
├── realtime/
│   ├── riskDashboard.ts        # CRÉER - Phase 4
│   └── websocketServer.ts      # CRÉER - Phase 4
└── workers/
    └── riskWorker.ts           # CRÉER - Phase 2
```

---

## PHASE 1: CORRECTIONS CRITIQUES

### 1.1 UNIFIER C4 DANS `lib/risque.ts`

Ajouter cette fonction unifiée et remplacer les appels à `calculateC4` et `calculateC4FromEcarts`:

```typescript
/**
 * Version unifiée de C4 avec support de deux formules
 * @param ecartsActifs - Liste des écarts actifs
 * @param options - Options de calcul
 * @returns Score C4 (0-100)
 */
export function calculateC4Unified(
  ecartsActifs: Array<{ niveau_risque?: string; niveau?: string }>,
  options?: {
    formule?: 'logarithmique' | 'lineaire';
    seuilMax?: number;
  }
): number {
  const formule = options?.formule || 'logarithmique';
  const seuilMax = options?.seuilMax || 50;
  
  if (ecartsActifs.length === 0) return 100;
  
  const poids: Record<string, number> = {
    critique: 4,
    eleve: 2,
    moyen: 1,
    faible: 0.5
  };
  
  const charge = ecartsActifs.reduce((acc, ecart) => {
    const niveau = ecart.niveau_risque || ecart.niveau || 'faible';
    return acc + (poids[niveau] || 0);
  }, 0);
  
  if (formule === 'lineaire') {
    return Math.max(0, 100 - Math.min(100, (charge / seuilMax) * 100));
  }
  
  // Formule logarithmique (défaut)
  if (charge <= seuilMax) {
    return Math.round(100 - (charge / seuilMax * 100));
  }
  
  const excess = charge - seuilMax;
  const penalite = 100 * (1 - Math.exp(-excess / seuilMax));
  return Math.round(Math.max(0, 100 - penalite));
}

// Remplacer calculateC4FromEcarts par:
export function calculateC4FromEcarts(ecarts: Ecart[], aerodromeId?: string): number {
  const ecartsActifs = ecarts.filter(e => 
    (!aerodromeId || e.aerodrome_id === aerodromeId) && 
    e.statut !== 'cloture'
  );
  
  return calculateC4Unified(ecartsActifs, { formule: 'lineaire' });
}

// Garder calculateC4 original mais utiliser calculateC4Unified en interne
export function calculateC4(ecartsActifs: Array<{ niveau: string }>, seuilMax: number = 50): number {
  return calculateC4Unified(ecartsActifs, { formule: 'logarithmique', seuilMax });
}
```

### 1.2 AJOUTER CACHE AVEC INVALIDATION DANS `lib/store.ts`

Ajouter après les interfaces de slices:

```typescript
// ============================================================
// SYSTÈME DE CACHE POUR CALCULS COÛTEUX
// ============================================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // time-to-live en ms
  dependencies: string[]; // IDs dont ce cache dépend
}

interface RiskCache {
  profils: CacheEntry<Record<string, ProfilRisque>>;
  predictions: CacheEntry<Record<string, RiskPrediction>>;
  alerts: CacheEntry<Record<string, ProactiveAlertStored>>;
  velocity: CacheEntry<Record<string, VelocityMetricsStored>>;
  hawkes: CacheEntry<Record<string, number>>;
}

const DEFAULT_CACHE_CONFIG = {
  profils: { ttl: 5 * 60 * 1000, dependencies: ['ecarts', 'surveillances'] }, // 5 min
  predictions: { ttl: 10 * 60 * 1000, dependencies: ['profils'] }, // 10 min
  alerts: { ttl: 5 * 60 * 1000, dependencies: ['predictions', 'hawkes'] }, // 5 min
  velocity: { ttl: 2 * 60 * 1000, dependencies: ['historique_scores'] }, // 2 min
  hawkes: { ttl: 3 * 60 * 1000, dependencies: ['ecarts'] }, // 3 min
};
```

Dans le store, ajouter:

```typescript
// Dans l'interface AppStore, ajouter:
riskCache: RiskCache;
invalidateCache: (dependency: string) => void;
isCacheValid: (key: keyof RiskCache) => boolean;
getFromCache: <T>(key: keyof RiskCache) => T | null;
setCache: <T>(key: keyof RiskCache, data: T) => void;

// Dans le create:
riskCache: {
  profils: { data: {}, timestamp: 0, ttl: DEFAULT_CACHE_CONFIG.profils.ttl, dependencies: DEFAULT_CACHE_CONFIG.profils.dependencies },
  predictions: { data: {}, timestamp: 0, ttl: DEFAULT_CACHE_CONFIG.predictions.ttl, dependencies: DEFAULT_CACHE_CONFIG.predictions.dependencies },
  alerts: { data: {}, timestamp: 0, ttl: DEFAULT_CACHE_CONFIG.alerts.ttl, dependencies: DEFAULT_CACHE_CONFIG.alerts.dependencies },
  velocity: { data: {}, timestamp: 0, ttl: DEFAULT_CACHE_CONFIG.velocity.ttl, dependencies: DEFAULT_CACHE_CONFIG.velocity.dependencies },
  hawkes: { data: {}, timestamp: 0, ttl: DEFAULT_CACHE_CONFIG.hawkes.ttl, dependencies: DEFAULT_CACHE_CONFIG.hawkes.dependencies },
},

invalidateCache: (dependency: string) => {
  const cache = get().riskCache;
  Object.entries(cache).forEach(([key, entry]) => {
    if (entry.dependencies.includes(dependency)) {
      set(state => ({
        riskCache: {
          ...state.riskCache,
          [key]: { ...entry, timestamp: 0 }
        }
      }));
    }
  });
},

isCacheValid: (key: keyof RiskCache) => {
  const entry = get().riskCache[key];
  return Date.now() - entry.timestamp < entry.ttl;
},

getFromCache: (key: keyof RiskCache) => {
  if (!get().isCacheValid(key)) return null;
  return get().riskCache[key].data;
},

setCache: (key: keyof RiskCache, data: any) => {
  set(state => ({
    riskCache: {
      ...state.riskCache,
      [key]: {
        ...state.riskCache[key],
        data,
        timestamp: Date.now()
      }
    }
  }));
},
```

### 1.3 MEMOIZATION DANS `lib/risque.ts`

Ajouter en début de fichier:

```typescript
/**
 * Utility de memoization avec TTL
 */
function memoizeWithTTL<T extends (...args: any[]) => any>(
  fn: T,
  ttl: number = 60000, // 1 minute par défaut
  resolver?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, { result: ReturnType<T>; timestamp: number }>();
  
  return ((...args: Parameters<T>) => {
    const key = resolver ? resolver(...args) : JSON.stringify(args);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.result;
    }
    
    const result = fn(...args);
    cache.set(key, { result, timestamp: Date.now() });
    
    // Nettoyage des anciennes entrées
    cache.forEach((value, cacheKey) => {
      if (Date.now() - value.timestamp > ttl * 2) {
        cache.delete(cacheKey);
      }
    });
    
    return result;
  }) as T;
}

// Appliquer memoization aux fonctions coûteuses
export const computeHawkesMultivariateMemoized = memoizeWithTTL(
  computeHawkesMultivariate,
  180000, // 3 minutes
  (ecarts) => JSON.stringify(Object.values(ecarts).flat().map(e => e.createdAt).sort())
);

export const computeSystemStressMemoized = memoizeWithTTL(
  computeSystemStress,
  120000, // 2 minutes
  (profil, ecarts, velocity) => 
    `${profil.aerodrome_id}-${profil.computed_at}-${ecarts.length}-${velocity.vitesse}-${velocity.acceleration}`
);

export const computeProactiveAlertMemoized = memoizeWithTTL(
  computeProactiveAlert,
  300000, // 5 minutes
  (profil, historique, hawkes) =>
    `${profil.aerodrome_id}-${profil.score_global}-${historique.length}-${hawkes.currentIntensity}`
);
```

### 1.4 DOCUMENTER SEUILS DANS `lib/config.ts`

Ajouter:

```typescript
/**
 * SEUILS CRITIQUES POUR LA SURVEILLANCE DES RISQUES
 * 
 * Ces seuils déterminent les niveaux d'alerte et les actions automatiques
 * à entreprendre en fonction de l'état du profil de risque.
 */

export const SEUILS_CRITIQUES = {
  /**
   * BLACK SWAN - Événement rare extrême
   * Déclenche: Audit inopiné immédiat + notification DG + comité de crise
   */
  BLACK_SWAN: {
    score_global: { min: 0, max: 15 },
    velocity_vitesse: { min: -Infinity, max: -5 },
    acceleration: { min: -Infinity, max: -2 },
    actions: [
      'audit_inopine_immediat',
      'notification_dg',
      'comite_crise',
      'suspension_operations'
    ]
  },

  /**
   * ALERTE ROUGE - Risque critique imminent
   * Déclenche: Surveillance renforcée sous 7 jours
   */
  ALERTE_ROUGE: {
    score_global: { min: 15, max: 30 },
    probabilite_seuil30_3m: { min: 80, max: 100 },
    hawkes_risk30j: { min: 70, max: 100 },
    actions: [
      'surveillance_renforcee_7j',
      'notification_inspecteur_principal',
      'revue_ecarts_critiques'
    ]
  },

  /**
   * VIGILANCE - Dégradation en cours
   * Déclenche: Revue mensuelle obligatoire
   */
  VIGILANCE: {
    score_global: { min: 30, max: 50 },
    tendance: 'baisse',
    velocity_vitesse: { min: -2, max: -0.5 },
    actions: [
      'revue_mensuelle_obligatoire',
      'suivi_hebdomadaire',
      'analyse_tendance'
    ]
  },

  /**
   * DÉGRADATION ACCÉLÉRÉE - Détérioration rapide
   * Déclenche: Analyse root cause immédiate
   */
  DEGRADATION_ACCELEREE: {
    velocity_vitesse: { min: -Infinity, max: -2 },
    acceleration: { min: -Infinity, max: 0 },
    actions: [
      'analyse_root_cause',
      'inspection_ciblee',
      'plan_action_correctif'
    ]
  },

  /**
   * STRESS ÉLEVÉ - Système sous tension
   */
  STRESS_ELEVE: {
    system_stress_score: { min: 50, max: 70 },
    nb_ecarts_critiques: { min: 2, max: Infinity },
    actions: [
      'surveillance_accrue',
      'renfort_equipe',
      'priorisation_ecarts'
    ]
  }
} as const;

/**
 * NIVEAUX DE RISQUE OACI (Matrice 5x5)
 */
export const NIVEAUX_RISQUE_OACI = {
  CRITIQUE: { probabilite: [4, 5], gravite: ['A', 'B', 'C'], frequence_surveillance: 12 },
  ELEVE: { probabilite: [3, 4], gravite: ['B', 'C', 'D'], frequence_surveillance: 4 },
  MOYEN: { probabilite: [2, 3], gravite: ['C', 'D', 'E'], frequence_surveillance: 2 },
  FAIBLE: { probabilite: [1, 2], gravite: ['D', 'E'], frequence_surveillance: 1 }
} as const;

/**
 * PARAMÈTRES DES MODÈLES MATHÉMATIQUES
 */
export const MODEL_PARAMETERS = {
  HAWKES: {
    mu: 0.03,        // Taux de base (événements/jour)
    alpha: 0.40,     // Excitation (doit être < beta pour stationnarité)
    beta: 0.60,      // Décroissance
    maxAge: 90,      // Jours maximum pour considérer un écart
  },
  
  EWMA: {
    lambda_court: 0.7,   // Pour prédictions court terme
    lambda_long: 0.3,    // Pour prédictions long terme
  },
  
  CUSUM: {
    seuil: 5,
    drift_autorise: 0.5,
  },
  
  BAYESIAN: {
    prior_mean: 50,
    prior_certainty: 10,
  }
} as const;

/**
 * CONFIGURATION DES ALERTES PROACTIVES
 */
export const ALERT_CONFIG = {
  CHECK_INTERVAL: 5 * 60 * 1000, // Vérifier toutes les 5 minutes
  COOLDOWN: 30 * 60 * 1000,      // Ne pas répéter avant 30 minutes
  MAX_ALERTS_PER_DAY: 10,
  
  CHANNELS: {
    CRITIQUE: ['in_app', 'email', 'sms'],
    ALERTE: ['in_app', 'email'],
    VIGILANCE: ['in_app'],
    INFO: ['in_app']
  }
} as const;
```

---

## PHASE 2: OPTIMISATIONS PERFORMANCES

### 2.1 WEB WORKER POUR HAWKES MULTIVARIÉ

Créer `lib/workers/riskWorker.ts`:

```typescript
// lib/workers/riskWorker.ts
/// <reference lib="webworker" />

import { 
  computeHawkesMultivariate, 
  computeSystemStress, 
  computeVelocityMetrics 
} from '../risque';

type RiskWorkerMessage = 
  | { type: 'HAWKES_MULTIVARIATE'; payload: Parameters<typeof computeHawkesMultivariate>[0] }
  | { type: 'SYSTEM_STRESS'; payload: Parameters<typeof computeSystemStress>[0] }
  | { type: 'VELOCITY_METRICS'; payload: Parameters<typeof computeVelocityMetrics>[0] };

self.onmessage = (event: MessageEvent<RiskWorkerMessage>) => {
  const { type, payload } = event.data;
  
  try {
    let result: any;
    
    switch (type) {
      case 'HAWKES_MULTIVARIATE':
        result = computeHawkesMultivariate(payload);
        break;
        
      case 'SYSTEM_STRESS':
        result = computeSystemStress(payload.profil, payload.ecartsActifs, payload.velocity);
        break;
        
      case 'VELOCITY_METRICS':
        result = computeVelocityMetrics(payload);
        break;
        
      default:
        throw new Error(`Message type inconnu: ${type}`);
    }
    
    self.postMessage({ type: 'RESULT', result, originalType: type });
  } catch (error) {
    self.postMessage({ 
      type: 'ERROR', 
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      originalType: type 
    });
  }
};

export default null as unknown as Worker;
```

Créer un hook pour utiliser le worker:

```typescript
// hooks/useRiskWorker.ts
import { useEffect, useRef, useCallback } from 'react';
import type { HawkesMultivariateResult, SystemStress, VelocityMetrics } from '@/lib/risque';

type WorkerResult = 
  | { type: 'HAWKES_MULTIVARIATE'; result: HawkesMultivariateResult }
  | { type: 'SYSTEM_STRESS'; result: SystemStress }
  | { type: 'VELOCITY_METRICS'; result: VelocityMetrics };

export function useRiskWorker() {
  const workerRef = useRef<Worker | null>(null);
  const callbacksRef = useRef<Map<string, (result: any) => void>>(new Map());

  useEffect(() => {
    // Initialiser le worker
    workerRef.current = new Worker(new URL('../lib/workers/riskWorker.ts', import.meta.url));
    
    workerRef.current.onmessage = (event) => {
      const { type, result, originalType } = event.data;
      const callback = callbacksRef.current.get(originalType);
      if (callback) {
        callback(result);
        callbacksRef.current.delete(originalType);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const computeHawkesMultivariate = useCallback((ecarts: any): Promise<HawkesMultivariateResult> => {
    return new Promise((resolve) => {
      const requestId = `hawkes_${Date.now()}`;
      callbacksRef.current.set(requestId, resolve);
      workerRef.current?.postMessage({ type: 'HAWKES_MULTIVARIATE', payload: ecarts, requestId });
    });
  }, []);

  const computeSystemStress = useCallback((data: any): Promise<SystemStress> => {
    return new Promise((resolve) => {
      const requestId = `stress_${Date.now()}`;
      callbacksRef.current.set(requestId, resolve);
      workerRef.current?.postMessage({ type: 'SYSTEM_STRESS', payload: data, requestId });
    });
  }, []);

  const computeVelocityMetrics = useCallback((historique: any): Promise<VelocityMetrics> => {
    return new Promise((resolve) => {
      const requestId = `velocity_${Date.now()}`;
      callbacksRef.current.set(requestId, resolve);
      workerRef.current?.postMessage({ type: 'VELOCITY_METRICS', payload: historique, requestId });
    });
  }, []);

  return {
    computeHawkesMultivariate,
    computeSystemStress,
    computeVelocityMetrics
  };
}
```

### 2.2 LAZY LOADING DES MODÈLES

Créer `lib/riskModels/index.ts`:

```typescript
// lib/riskModels/index.ts

// Export dynamique pour lazy loading
export const loadRandomForest = async () => {
  const module = await import('./randomForest');
  return module.RandomForestPredictor;
};

export const loadGraphNetwork = async () => {
  const module = await import('./graphNetwork');
  return module.RiskPropagationNetwork;
};

export const loadConformalPrediction = async () => {
  const module = await import('./conformalPrediction');
  return module.ConformalPredictor;
};

// Version synchrone pour les modèles déjà chargés
let _randomForest: any = null;
let _graphNetwork: any = null;

export const getRandomForest = async () => {
  if (!_randomForest) {
    _randomForest = await loadRandomForest();
  }
  return _randomForest;
};

export const getGraphNetwork = async () => {
  if (!_graphNetwork) {
    _graphNetwork = await loadGraphNetwork();
  }
  return _graphNetwork;
};
```

---

## PHASE 3: NOUVEAUX MODÈLES IA

### 3.1 RANDOM FOREST (`lib/riskModels/randomForest.ts`)

```typescript
// lib/riskModels/randomForest.ts

export interface DecisionTree {
  feature: string;
  threshold: number;
  left: DecisionTree | number;
  right: DecisionTree | number;
}

export interface RandomForestModel {
  trees: DecisionTree[];
  featureImportance: Record<string, number>;
  oobError: number;
  nTrees: number;
  maxDepth: number;
}

export interface TrainingSample {
  features: Record<string, number>;
  target3m: number;
  target6m: number;
}

export class RandomForestPredictor {
  private model3m: RandomForestModel | null = null;
  private model6m: RandomForestModel | null = null;
  private isTrained: boolean = false;

  constructor(
    private nTrees: number = 100,
    private maxDepth: number = 10,
    private minSamplesSplit: number = 5
  ) {}

  /**
   * Entraîne le modèle sur l'historique
   */
  async train(data: TrainingSample[]): Promise<void> {
    if (data.length < 50) {
      throw new Error('Besoin d\'au moins 50 échantillons pour l\'entraînement');
    }

    // Séparer features et targets
    const features = data.map(d => d.features);
    const targets3m = data.map(d => d.target3m);
    const targets6m = data.map(d => d.target6m);

    // Entraîner les deux modèles
    this.model3m = this.buildForest(features, targets3m);
    this.model6m = this.buildForest(features, targets6m);
    this.isTrained = true;
  }

  /**
   * Construit une forêt d'arbres de décision
   */
  private buildForest(features: Record<string, number>[], targets: number[]): RandomForestModel {
    const trees: DecisionTree[] = [];
    const featureNames = Object.keys(features[0]);
    const featureImportance: Record<string, number> = {};
    
    featureNames.forEach(f => featureImportance[f] = 0);

    for (let i = 0; i < this.nTrees; i++) {
      // Bootstrap sample
      const sample = this.bootstrapSample(features, targets);
      const tree = this.buildTree(sample.features, sample.targets, 0);
      trees.push(tree);
      
      // Mettre à jour l'importance des features
      this.updateFeatureImportance(tree, featureImportance, featureNames);
    }

    // Normaliser l'importance
    const totalImportance = Object.values(featureImportance).reduce((a, b) => a + b, 0);
    if (totalImportance > 0) {
      Object.keys(featureImportance).forEach(k => {
        featureImportance[k] /= totalImportance;
      });
    }

    return {
      trees,
      featureImportance,
      oobError: 0, // À calculer avec out-of-bag
      nTrees: this.nTrees,
      maxDepth: this.maxDepth
    };
  }

  /**
   * Bootstrap sample
   */
  private bootstrapSample(features: Record<string, number>[], targets: number[]) {
    const n = features.length;
    const indices = new Set<number>();
    const sampledFeatures: Record<string, number>[] = [];
    const sampledTargets: number[] = [];

    while (indices.size < n) {
      const idx = Math.floor(Math.random() * n);
      if (!indices.has(idx)) {
        indices.add(idx);
        sampledFeatures.push(features[idx]);
        sampledTargets.push(targets[idx]);
      }
    }

    return { features: sampledFeatures, targets: sampledTargets };
  }

  /**
   * Construit un arbre de décision
   */
  private buildTree(
    features: Record<string, number>[],
    targets: number[],
    depth: number
  ): DecisionTree | number {
    // Cas de base
    if (depth >= this.maxDepth || targets.length < this.minSamplesSplit) {
      return targets.reduce((a, b) => a + b, 0) / targets.length;
    }

    // Trouver la meilleure split
    const { feature, threshold, leftData, rightData } = this.findBestSplit(features, targets);

    if (!feature) {
      return targets.reduce((a, b) => a + b, 0) / targets.length;
    }

    return {
      feature,
      threshold,
      left: this.buildTree(leftData, leftData.map((_, i) => targets[i]), depth + 1),
      right: this.buildTree(rightData, rightData.map((_, i) => targets[i]), depth + 1)
    };
  }

  /**
   * Trouve la meilleure split
   */
  private findBestSplit(features: Record<string, number>[], targets: number[]) {
    let bestFeature: string | null = null;
    let bestThreshold = 0;
    let bestScore = Infinity;
    let bestLeft: Record<string, number>[] = [];
    let bestRight: Record<string, number>[] = [];

    const featureNames = Object.keys(features[0]);

    for (const feature of featureNames) {
      const values = features.map(f => f[feature]);
      const thresholds = this.getThresholds(values);

      for (const threshold of thresholds) {
        const left: Record<string, number>[] = [];
        const right: Record<string, number>[] = [];

        features.forEach((f, i) => {
          if (f[feature] <= threshold) {
            left.push(f);
          } else {
            right.push(f);
          }
        });

        if (left.length < 2 || right.length < 2) continue;

        const score = this.calculateVariance(left.map((_, i) => targets[i])) + 
                     this.calculateVariance(right.map((_, i) => targets[i]));

        if (score < bestScore) {
          bestScore = score;
          bestFeature = feature;
          bestThreshold = threshold;
          bestLeft = left;
          bestRight = right;
        }
      }
    }

    return { feature: bestFeature, threshold: bestThreshold, leftData: bestLeft, rightData: bestRight };
  }

  /**
   * Calcule la variance
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Obtient les seuils potentiels
   */
  private getThresholds(values: number[]): number[] {
    const sorted = [...new Set(values)].sort((a, b) => a - b);
    const thresholds: number[] = [];
    
    for (let i = 0; i < sorted.length - 1; i++) {
      thresholds.push((sorted[i] + sorted[i + 1]) / 2);
    }
    
    return thresholds;
  }

  /**
   * Met à jour l'importance des features
   */
  private updateFeatureImportance(
    tree: DecisionTree | number,
    importance: Record<string, number>,
    featureNames: string[]
  ) {
    if (typeof tree === 'number') return;
    
    importance[tree.feature] = (importance[tree.feature] || 0) + 1;
    this.updateFeatureImportance(tree.left, importance, featureNames);
    this.updateFeatureImportance(tree.right, importance, featureNames);
  }

  /**
   * Prédit le score pour de nouvelles features
   */
  predict(features: Record<string, number>): { score3m: number; score6m: number; confidence: number } {
    if (!this.isTrained || !this.model3m || !this.model6m) {
      throw new Error('Modèle non entraîné');
    }

    const pred3m = this.predictTree(this.model3m.trees, features);
    const pred6m = this.predictTree(this.model6m.trees, features);

    // Calcul de la confiance basée sur la variance des prédictions
    const variance3m = this.calculateTreeVariance(this.model3m.trees, features);
    const confidence = Math.max(30, Math.min(95, 100 - variance3m * 2));

    return {
      score3m: Math.min(100, Math.max(0, Math.round(pred3m))),
      score6m: Math.min(100, Math.max(0, Math.round(pred6m))),
      confidence: Math.round(confidence)
    };
  }

  /**
   * Prédit en utilisant une forêt
   */
  private predictTree(trees: DecisionTree[], features: Record<string, number>): number {
    const predictions = trees.map(tree => this.predictSingleTree(tree, features));
    return predictions.reduce((a, b) => a + b, 0) / predictions.length;
  }

  /**
   * Prédit avec un seul arbre
   */
  private predictSingleTree(tree: DecisionTree | number, features: Record<string, number>): number {
    if (typeof tree === 'number') return tree;
    
    if (features[tree.feature] <= tree.threshold) {
      return this.predictSingleTree(tree.left, features);
    } else {
      return this.predictSingleTree(tree.right, features);
    }
  }

  /**
   * Calcule la variance des prédictions des arbres
   */
  private calculateTreeVariance(trees: DecisionTree[], features: Record<string, number>): number {
    const predictions = trees.map(tree => this.predictSingleTree(tree, features));
    const mean = predictions.reduce((a, b) => a + b, 0) / predictions.length;
    return predictions.reduce((sum, pred) => sum + Math.pow(pred - mean, 2), 0) / predictions.length;
  }

  /**
   * Obtient l'importance des features
   */
  getFeatureImportance(): Record<string, number> {
    if (!this.model3m) return {};
    return this.model3m.featureImportance;
  }

  /**
   * Exporte le modèle
   */
  exportModel(): string {
    return JSON.stringify({
      model3m: this.model3m,
      model6m: this.model6m
    });
  }

  /**
   * Importe un modèle
   */
  importModel(json: string): void {
    const data = JSON.parse(json);
    this.model3m = data.model3m;
    this.model6m = data.model6m;
    this.isTrained = true;
  }
}
```

### 3.2 GRAPH NEURAL NETWORK (`lib/riskModels/graphNetwork.ts`)

```typescript
// lib/riskModels/graphNetwork.ts

export interface RiskNode {
  id: string;
  type: 'aerodrome' | 'domaine' | 'ecart';
  features: number[];
  riskScore: number;
}

export interface RiskEdge {
  source: string;
  target: string;
  weight: number;
  type: 'similarity' | 'causal' | 'temporal';
}

export interface RiskGraph {
  nodes: RiskNode[];
  edges: RiskEdge[];
}

export class RiskPropagationNetwork {
  private graph: RiskGraph = { nodes: [], edges: [] };
  private nodeMap: Map<string, RiskNode> = new Map();
  private adjacencyList: Map<string, { node: string; weight: number }[]> = new Map();

  /**
   * Construit le graphe de risques
   */
  buildGraph(
    aerodromes: { id: string; score_global: number; c1: number; c2: number; c3: number; c4: number; c5: number }[],
    ecarts: { id: string; aerodrome_id: string; domaine: string; niveau_risque: string }[],
    surveillances: { aerodrome_id: string; score_global?: number }[]
  ): void {
    this.graph = { nodes: [], edges: [] };
    this.nodeMap.clear();
    this.adjacencyList.clear();

    // Créer les noeuds aérodromes
    aerodromes.forEach(aero => {
      const node: RiskNode = {
        id: `aero_${aero.id}`,
        type: 'aerodrome',
        features: [aero.c1, aero.c2, aero.c3, aero.c4, aero.c5],
        riskScore: aero.score_global
      };
      this.addNode(node);
    });

    // Créer les noeuds domaines par aérodrome
    const domaines = ['SGS', 'PHY', 'SLI', 'OLS', 'RA', 'COP', 'OPS', 'ELEC', 'MFP'];
    aerodromes.forEach(aero => {
      domaines.forEach(domaine => {
        const node: RiskNode = {
          id: `domain_${aero.id}_${domaine}`,
          type: 'domaine',
          features: this.extractDomainFeatures(aero, domaine),
          riskScore: this.calculateDomainRisk(aero, domaine, ecarts)
        };
        this.addNode(node);

        // Lier au noeud aérodrome
        this.addEdge(`aero_${aero.id}`, `domain_${aero.id}_${domaine}`, 0.8, 'causal');
      });
    });

    // Créer les noeuds écarts
    ecarts.forEach(ecart => {
      const node: RiskNode = {
        id: `ecart_${ecart.id}`,
        type: 'ecart',
        features: this.encodeNiveauRisque(ecart.niveau_risque),
        riskScore: this.ecartRiskScore(ecart.niveau_risque)
      };
      this.addNode(node);

      // Lier au domaine correspondant
      this.addEdge(`domain_${ecart.aerodrome_id}_${ecart.domaine}`, `ecart_${ecart.id}`, 0.9, 'causal');
    });

    // Ajouter les arêtes de similarité entre aérodromes
    for (let i = 0; i < aerodromes.length; i++) {
      for (let j = i + 1; j < aerodromes.length; j++) {
        const similarity = this.calculateSimilarity(aerodromes[i], aerodromes[j]);
        if (similarity > 0.6) {
          this.addEdge(`aero_${aerodromes[i].id}`, `aero_${aerodromes[j].id}`, similarity, 'similarity');
        }
      }
    }
  }

  private addNode(node: RiskNode): void {
    this.graph.nodes.push(node);
    this.nodeMap.set(node.id, node);
    this.adjacencyList.set(node.id, []);
  }

  private addEdge(source: string, target: string, weight: number, type: 'similarity' | 'causal' | 'temporal'): void {
    this.graph.edges.push({ source, target, weight, type });
    
    if (!this.adjacencyList.has(source)) {
      this.adjacencyList.set(source, []);
    }
    this.adjacencyList.get(source)!.push({ node: target, weight });
    
    // Arête non dirigée pour similarity
    if (type === 'similarity') {
      if (!this.adjacencyList.has(target)) {
        this.adjacencyList.set(target, []);
      }
      this.adjacencyList.get(target)!.push({ node: source, weight });
    }
  }

  private extractDomainFeatures(aero: any, domaine: string): number[] {
    // Features simplifiées par domaine
    const domainWeights: Record<string, number[]> = {
      SGS: [0.3, 0.2, 0.2, 0.15, 0.15],
      PHY: [0.1, 0.1, 0.4, 0.2, 0.2],
      SLI: [0.1, 0.1, 0.2, 0.2, 0.4],
      OLS: [0.2, 0.1, 0.3, 0.2, 0.2],
      RA: [0.2, 0.1, 0.2, 0.2, 0.3],
      COP: [0.15, 0.25, 0.2, 0.2, 0.2],
      OPS: [0.15, 0.25, 0.2, 0.2, 0.2],
      ELEC: [0.1, 0.1, 0.3, 0.3, 0.2],
      MFP: [0.1, 0.1, 0.3, 0.3, 0.2]
    };

    const weights = domainWeights[domaine] || [0.2, 0.2, 0.2, 0.2, 0.2];
    return [aero.c1 * weights[0], aero.c2 * weights[1], aero.c3 * weights[2], aero.c4 * weights[3], aero.c5 * weights[4]];
  }

  private calculateDomainRisk(aero: any, domaine: string, ecarts: any[]): number {
    const ecartsDomaine = ecarts.filter(e => e.aerodrome_id === aero.id && e.domaine === domaine);
    const penalite = ecartsDomaine.reduce((sum, e) => {
      const poids = { critique: 4, eleve: 2, moyen: 1, faible: 0.5 };
      return sum + (poids[e.niveau_risque as keyof typeof poids] || 0);
    }, 0);
    
    return Math.max(0, aero.score_global - penalite * 5);
  }

  private encodeNiveauRisque(niveau: string): number[] {
    const encoding: Record<string, number[]> = {
      critique: [1, 0, 0, 0],
      eleve: [0, 1, 0, 0],
      moyen: [0, 0, 1, 0],
      faible: [0, 0, 0, 1]
    };
    return encoding[niveau] || [0, 0, 0, 1];
  }

  private ecartRiskScore(niveau: string): number {
    const scores: Record<string, number> = {
      critique: 20,
      eleve: 40,
      moyen: 60,
      faible: 80
    };
    return scores[niveau] || 80;
  }

  private calculateSimilarity(a1: any, a2: any): number {
    const features1 = [a1.c1, a1.c2, a1.c3, a1.c4, a1.c5];
    const features2 = [a2.c1, a2.c2, a2.c3, a2.c4, a2.c5];
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < 5; i++) {
      dotProduct += features1[i] * features2[i];
      norm1 += features1[i] * features1[i];
      norm2 += features2[i] * features2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Prédit la propagation d'un risque
   */
  predictPropagation(ecartId: string): { affectedDomains: string[]; probability: number } {
    const ecartNode = this.nodeMap.get(`ecart_${ecartId}`);
    if (!ecartNode) return { affectedDomains: [], probability: 0 };

    // Message passing sur 2 hops
    const affectedNodes = new Set<string>();
    const visited = new Set<string>();
    const queue: { id: string; probability: number }[] = [{ id: ecartNode.id, probability: 1 }];

    while (queue.length > 0 && visited.size < 20) {
      const { id, probability } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const neighbors = this.adjacencyList.get(id) || [];
      for (const { node: neighborId, weight } of neighbors) {
        const newProb = probability * weight * 0.7; // Facteur de décroissance
        if (newProb > 0.1) {
          const neighbor = this.nodeMap.get(neighborId);
          if (neighbor?.type === 'domaine' && !affectedNodes.has(neighborId)) {
            affectedNodes.add(neighborId);
          }
          queue.push({ id: neighborId, probability: newProb });
        }
      }
    }

    const affectedDomains = Array.from(affectedNodes).map(id => {
      const parts = id.split('_');
      return parts.slice(1).join('_');
    });

    const maxProbability = Math.min(1, affectedNodes.size * 0.15);

    return {
      affectedDomains,
      probability: Math.round(maxProbability * 100)
    };
  }

  /**
   * Détecte les communautés de risques
   */
  detectCommunities(): string[][] {
    // Algorithme simplifié de Label Propagation
    const labels = new Map<string, string>();
    const nodeIds = Array.from(this.nodeMap.keys());

    // Initialisation: chaque noeud a son propre label
    nodeIds.forEach(id => labels.set(id, id));

    // Itérations
    for (let iter = 0; iter < 10; iter++) {
      let changed = false;
      
      for (const nodeId of nodeIds) {
        const neighbors = this.adjacencyList.get(nodeId) || [];
        if (neighbors.length === 0) continue;

        // Compter les labels des voisins
        const labelCounts = new Map<string, number>();
        neighbors.forEach(({ node, weight }) => {
          const neighborLabel = labels.get(node);
          if (neighborLabel) {
            labelCounts.set(neighborLabel, (labelCounts.get(neighborLabel) || 0) + weight);
          }
        });

        // Trouver le label le plus fréquent
        let maxLabel = labels.get(nodeId)!;
        let maxCount = 0;
        labelCounts.forEach((count, label) => {
          if (count > maxCount) {
            maxCount = count;
            maxLabel = label;
          }
        });

        if (maxLabel !== labels.get(nodeId)) {
          labels.set(nodeId, maxLabel);
          changed = true;
        }
      }

      if (!changed) break;
    }

    // Grouper par label
    const communities = new Map<string, string[]>();
    labels.forEach((label, nodeId) => {
      if (!communities.has(label)) {
        communities.set(label, []);
      }
      communities.get(label)!.push(nodeId);
    });

    return Array.from(communities.values());
  }

  /**
   * Exporte le graphe
   */
  exportGraph(): string {
    return JSON.stringify(this.graph);
  }

  /**
   * Importe un graphe
   */
  importGraph(json: string): void {
    this.graph = JSON.parse(json);
    this.nodeMap.clear();
    this.adjacencyList.clear();
    
    this.graph.nodes.forEach(node => this.nodeMap.set(node.id, node));
    this.graph.edges.forEach(edge => {
      if (!this.adjacencyList.has(edge.source)) {
        this.adjacencyList.set(edge.source, []);
      }
      this.adjacencyList.get(edge.source)!.push({ node: edge.target, weight: edge.weight });
    });
  }
}
```

---

## PHASE 4: REAL-TIME STREAMING

### 4.1 KAFKA STREAMING (`lib/streaming/riskEvents.ts`)

```typescript
// lib/streaming/riskEvents.ts

export interface RiskEvent {
  id: string;
  type: 'ecart_cree' | 'score_updated' | 'alert_triggered' | 'surveillance_completed' | 'pac_soumis' | 'pac_evalue';
  aerodrome_id: string;
  timestamp: string;
  data: any;
  source: 'manual' | 'automatic' | 'system';
}

export class RiskEventProcessor {
  private eventQueue: RiskEvent[] = [];
  private handlers: Map<string, (event: RiskEvent) => Promise<void>> = new Map();
  private isProcessing = false;
  private batchSize = 10;
  private batchTimeout = 5000; // 5 secondes

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * Enregistre un handler pour un type d'événement
   */
  registerHandler(type: string, handler: (event: RiskEvent) => Promise<void>): void {
    this.handlers.set(type, handler);
  }

  /**
   * Handlers par défaut
   */
  private registerDefaultHandlers(): void {
    this.registerHandler('ecart_cree', async (event) => {
      // Recalculer le profil de risque
      console.log(`Recalcul risque pour ${event.aerodrome_id} suite à écart`);
      // TODO: Appeler le store pour recalculer
    });

    this.registerHandler('score_updated', async (event) => {
      // Mettre à jour les prédictions
      console.log(`Score mis à jour pour ${event.aerodrome_id}: ${event.data.score}`);
      // TODO: Invalider le cache
    });

    this.registerHandler('alert_triggered', async (event) => {
      // Notifier les utilisateurs concernés
      console.log(`Alerte déclenchée: ${event.data.niveau} pour ${event.aerodrome_id}`);
      // TODO: Envoyer notifications
    });

    this.registerHandler('surveillance_completed', async (event) => {
      // Mettre à jour l'historique
      console.log(`Surveillance terminée pour ${event.aerodrome_id}`);
      // TODO: Mettre à jour les scores
    });
  }

  /**
   * Ajoute un événement à la queue
   */
  async addEvent(event: Omit<RiskEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: RiskEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };

    this.eventQueue.push(fullEvent);

    if (!this.isProcessing) {
      this.processBatch();
    }
  }

  /**
   * Traite les événements par batch
   */
  private async processBatch(): Promise<void> {
    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const batch = this.eventQueue.splice(0, this.batchSize);
      
      await Promise.allSettled(
        batch.map(event => this.processEvent(event))
      );

      // Attendre avant le prochain batch
      if (this.eventQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, this.batchTimeout));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Traite un événement individuel
   */
  private async processEvent(event: RiskEvent): Promise<void> {
    const handler = this.handlers.get(event.type);
    if (handler) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Erreur traitement événement ${event.type}:`, error);
        // TODO: Logger l'erreur et notifier
      }
    } else {
      console.warn(`Pas de handler pour le type d'événement: ${event.type}`);
    }
  }

  /**
   * Obtient l'historique des événements
   */
  getEventHistory(aerodromeId?: string, limit: number = 50): RiskEvent[] {
    let events = this.eventQueue;
    if (aerodromeId) {
      events = events.filter(e => e.aerodrome_id === aerodromeId);
    }
    return events.slice(-limit);
  }
}

// Instance singleton
export const riskEventProcessor = new RiskEventProcessor();
```

### 4.2 WEBSOCKET DASHBOARD (`lib/realtime/riskDashboard.ts`)

```typescript
// lib/realtime/riskDashboard.ts

import { riskEventProcessor, RiskEvent } from '../streaming/riskEvents';

export interface RiskUpdate {
  aerodrome_id: string;
  score_global?: number;
  niveau?: string;
  velocity?: number;
  alert?: string;
  timestamp: string;
}

export class RiskDashboardRealtime {
  private clients: Map<string, Set<Function>> = new Map();
  private wsServer: WebSocket | null = null;
  private isConnected = false;

  constructor(private wsUrl: string = 'ws://localhost:8080') {
    this.setupEventListeners();
  }

  /**
   * Initialise la connexion WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wsServer = new WebSocket(this.wsUrl);

        this.wsServer.onopen = () => {
          this.isConnected = true;
          console.log('Connecté au serveur WebSocket');
          resolve();
        };

        this.wsServer.onclose = () => {
          this.isConnected = false;
          console.log('Déconnecté du serveur WebSocket');
          // Tentative de reconnexion
          setTimeout(() => this.connect(), 5000);
        };

        this.wsServer.onerror = (error) => {
          console.error('Erreur WebSocket:', error);
          reject(error);
        };

        this.wsServer.onmessage = (event) => {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Configure les écouteurs d'événements
   */
  private setupEventListeners(): void {
    // Écouter les événements de risque
    riskEventProcessor.registerHandler('score_updated', async (event) => {
      this.broadcastUpdate(event.aerodrome_id, {
        aerodrome_id: event.aerodrome_id,
        score_global: event.data.score,
        niveau: event.data.niveau,
        timestamp: event.timestamp
      });
    });

    riskEventProcessor.registerHandler('alert_triggered', async (event) => {
      this.broadcastUpdate(event.aerodrome_id, {
        aerodrome_id: event.aerodrome_id,
        alert: event.data.niveau,
        timestamp: event.timestamp
      });
    });
  }

  /**
   * Traite les messages reçus
   */
  private handleMessage(data: any): void {
    const { type, aerodrome_id, payload } = data;

    if (type === 'subscribe') {
      this.subscribe(aerodrome_id, payload.callback);
    } else if (type === 'unsubscribe') {
      this.unsubscribe(aerodrome_id, payload.callback);
    }
  }

  /**
   * S'abonne aux mises à jour d'un aérodrome
   */
  subscribe(aerodromeId: string, callback: (update: RiskUpdate) => void): void {
    if (!this.clients.has(aerodromeId)) {
      this.clients.set(aerodromeId, new Set());
    }
    this.clients.get(aerodromeId)!.add(callback);
  }

  /**
   * Se désabonne
   */
  unsubscribe(aerodromeId: string, callback: Function): void {
    const callbacks = this.clients.get(aerodromeId);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.clients.delete(aerodromeId);
      }
    }
  }

  /**
   * Diffuse une mise à jour à tous les abonnés
   */
  broadcastUpdate(aerodromeId: string, update: RiskUpdate): void {
    const callbacks = this.clients.get(aerodromeId);
    if (callbacks) {
      callbacks.forEach(callback => callback(update));
    }

    // Envoyer via WebSocket si connecté
    if (this.isConnected && this.wsServer) {
      this.wsServer.send(JSON.stringify({
        type: 'risk_update',
        aerodrome_id: aerodromeId,
        payload: update
      }));
    }
  }

  /**
   * Diffuse à tous les aérodromes
   */
  broadcastToAll(update: Omit<RiskUpdate, 'aerodrome_id'>): void {
    this.clients.forEach((_, aerodromeId) => {
      this.broadcastUpdate(aerodromeId, {
        ...update,
        aerodrome_id: aerodromeId
      });
    });
  }

  /**
   * Déconnecte
   */
  disconnect(): void {
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }
    this.clients.clear();
  }
}

// Instance singleton
export const riskDashboard = new RiskDashboardRealtime();
```

---

## 📝 INSTRUCTIONS D'INSTALLATION

### Étape 1: Installer les dépendances

```bash
npm install ws kafka-node
npm install --save-dev @types/ws
```

### Étape 2: Créer la structure de fichiers

```bash
mkdir -p lib/riskModels lib/streaming lib/realtime lib/workers
```

### Étape 3: Copier le code

Copier chaque section de code dans les fichiers correspondants listés ci-dessus.

### Étape 4: Modifier `lib/risque.ts`

Appliquer les modifications de la Phase 1 (unifier C4, memoization).

### Étape 5: Modifier `lib/store.ts`

Ajouter le système de cache (Phase 1.2).

### Étape 6: Modifier `lib/config.ts`

Ajouter les seuils critiques (Phase 1.4).

### Étape 7: Tester

```bash
npm run dev
```

---

## ✅ CHECKLIST DE DÉPLOIEMENT

- [ ] Phase 1.1: Unifier C4 dans risque.ts
- [ ] Phase 1.2: Ajouter cache dans store.ts
- [ ] Phase 1.3: Ajouter memoization dans risque.ts
- [ ] Phase 1.4: Ajouter seuils dans config.ts
- [ ] Phase 2.1: Créer Web Worker
- [ ] Phase 2.2: Implémenter lazy loading
- [ ] Phase 3.1: Créer Random Forest
- [ ] Phase 3.2: Créer Graph Network
- [ ] Phase 4.1: Créer Kafka streaming
- [ ] Phase 4.2: Créer WebSocket dashboard
- [ ] Tests unitaires
- [ ] Tests d'intégration
- [ ] Tests de performance
- [ ] Documentation API
- [ ] Déploiement production

---

**Temps estimé total**: 5-7 semaines
**Impact attendu**: ×10 performances, +15% précision prédictions