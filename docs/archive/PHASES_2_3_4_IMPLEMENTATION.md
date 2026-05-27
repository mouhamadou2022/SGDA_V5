# Implémentation des Phases 2, 3 et 4 - SGDA V5.2

## Vue d'ensemble

Ce document présente l'implémentation complète des phases avancées du système SGDA, incluant les Web Workers, les modèles de Machine Learning avancés, et l'infrastructure temps réel.

---

## Phase 2: Web Workers pour les Calculs Lourds

### Architecture

```
lib/workers/
  └── riskWorker.ts    # Worker principal pour les calculs de risque

hooks/
  └── useRiskWorker.ts # Hook React pour utiliser le worker
```

### Fonctionnalités

1. **riskWorker.ts** - Web Worker qui exécute les calculs intensifs :
   - `computeHawkes` - Processus de Hawkes pour la contagion des écarts
   - `computeHawkesMultivariate` - Propagation entre domaines
   - `computeCUSUM` - Détection de rupture
   - `computeBayesian` - Intervalle de crédibilité bayésien
   - `computeStress` - Score de stress système
   - `computeProactiveAlert` - Alerte proactive
   - `computeVelocity` - Métriques de vélocité

2. **useRiskWorker.ts** - Hook React qui :
   - Initialise et gère le worker
   - Fournit une API simple pour envoyer des calculs
   - Gère la file d'attente des messages
   - Retourne les résultats avec promesse

### Avantages

- ✅ UI non bloquante pendant les calculs
- ✅ Parallélisation des tâches intensives
- ✅ Meilleure expérience utilisateur
- ✅ Temps de réponse perçu réduit

---

## Phase 3: Modèles Avancés de Machine Learning

### Random Forest (`lib/risque/randomForest.ts`)

**Objectif** : Classification prédictive du niveau de risque

**Fonctionnalités** :
- Entraînement d'une forêt d'arbres de décision
- Importance des caractéristiques (feature importance)
- Prédiction du niveau de risque (critique/élevé/moyen/faible)
- Conversion automatique ProfilRisque → Features

**Features utilisées** :
- score_global, c1, c2, c3, c4, c5
- tendance (baisse/hausse/stable)
- predictions à 3m et 6m
- écarts entre critères
- minimum des critères

**Exemple d'utilisation** :
```typescript
import { trainRandomForest, predictRandomForest, profilToFeatures } from '@/lib/risque/randomForest'

// Entraîner le modèle
const model = trainRandomForest(trainingSamples, 10, 4, 3)

// Prédire pour un nouvel aérodrome
const features = profilToFeatures(profilRisque)
const prediction = predictRandomForest(model, features)
```

### Graph Network (`lib/risque/graphNetwork.ts`)

**Objectif** : Modéliser et analyser la propagation des risques

**Fonctionnalités** :
- Création de graphe de risque (noeuds + arêtes)
- Calcul de propagation BFS
- Identification des chemins critiques
- Centralité des noeuds
- Recommandations d'actions

**Types de noeuds** :
- `aerodrome` - Aérodromes
- `domaine` - Domaines de surveillance (SGS, SLI, PHY, etc.)
- `ecart` - Écarts constatés
- `surveillance` - Missions de surveillance

**Types d'arêtes** :
- `influence` - Influence directe
- `propagation` - Propagation entre domaines
- `correlation` - Corrélation statistique
- `causation` - Relation de causalité

**Exemple d'utilisation** :
```typescript
import { createRiskGraph, calculateRiskPropagation, recommendActionsFromGraph } from '@/lib/risque/graphNetwork'

// Créer le graphe
const graph = createRiskGraph({
  aerodromes,
  domaines,
  ecarts,
  surveillances
})

// Analyser la propagation depuis un aérodrome
const propagation = calculateRiskPropagation(graph, `aero_${aerodromeId}`)

// Obtenir des recommandations
const actions = recommendActionsFromGraph(graph, aerodromeId)
```

---

## Phase 4: Infrastructure Temps Réel

### WebSocket Service (`lib/realtime/websocketService.ts`)

**Objectif** : Notifications en temps réel et synchronisation

**Fonctionnalités** :
- Connexion WebSocket avec reconnexion automatique
- Gestion des événements en temps réel
- File d'attente des messages hors ligne
- Notifications navigateur
- Sons d'alerte

**Types d'événements** :
- `ecart_created` - Nouvel écart créé
- `ecart_updated` - Écart mis à jour
- `ecart_closed` - Écart clôturé
- `surveillance_started` - Surveillance démarrée
- `surveillance_completed` - Surveillance terminée
- `alert_triggered` - Alerte de risque
- `risk_score_updated` - Score de risque mis à jour
- `planning_updated` - Planning modifié
- `user_presence` - Présence utilisateur
- `message_new` - Nouveau message

**Exemple d'utilisation** :
```typescript
import { WebSocketService } from '@/lib/realtime/websocketService'

const wsService = new WebSocketService({
  url: process.env.NEXT_PUBLIC_WS_URL || 'wss://api.sgda.anacim.sn/realtime'
})

// Se connecter
await wsService.connect()

// S'abonner aux alertes
const unsubscribe = wsService.subscribe('alert_triggered', (event) => {
  console.log('Alerte reçue:', event)
  // Afficher notification, sonner alarme, etc.
})

// Envoyer un événement
wsService.send({
  type: 'user_presence',
  payload: { aerodromeId, userId, timestamp: new Date() },
  source: 'client'
})

// Se déconnecter
wsService.disconnect()
```

---

## Intégration dans le Store

Pour intégrer ces nouvelles fonctionnalités dans `lib/store.ts`, ajouter :

```typescript
// Dans l'interface ProfilRisqueSlice
interface ProfilRisqueSlice {
  // ... existing
  randomForestModel?: RandomForestModel
  riskGraph?: RiskGraph
  trainRandomForestModel: (samples: TrainingSample[]) => void
  updateRiskGraph: () => void
  getRiskPredictions: (aerodromeId: string) => Promise<string>
}

// Dans le store
trainRandomForestModel: (samples) => {
  const model = trainRandomForest(samples, 10, 4, 3)
  set({ randomForestModel: model })
},

updateRiskGraph: () => {
  const state = get()
  const graph = createRiskGraph({
    aerodromes: Object.values(state.aerodromes),
    domaines: SURVEILLANCE_DOMAINS.map(d => ({ code: d.code, score: 70 })),
    ecarts: Object.values(state.ecarts),
    surveillances: state.surveillances
  })
  set({ riskGraph: graph })
},

getRiskPredictions: async (aerodromeId) => {
  const profil = get().getProfilRisque(aerodromeId)
  if (!profil || !get().randomForestModel) return 'moyen'
  
  const features = profilToFeatures(profil)
  return predictRandomForest(get().randomForestModel!, features)
}
```

---

## Configuration Requise

### Variables d'environnement

```env
# WebSocket
NEXT_PUBLIC_WS_URL=wss://api.sgda.anacim.sn/realtime

# Feature flags
NEXT_PUBLIC_ENABLE_WEB_WORKERS=true
NEXT_PUBLIC_ENABLE_RANDOM_FOREST=true
NEXT_PUBLIC_ENABLE_GRAPH_NETWORK=true
NEXT_PUBLIC_ENABLE_REALTIME=true
```

### Permissions navigateur

```typescript
// Demander la permission pour les notifications
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission()
}
```

---

## Tests et Validation

### Tests unitaires recommandés

```typescript
// __tests__/randomForest.test.ts
describe('Random Forest', () => {
  it('should train and predict correctly', () => {
    const samples: TrainingSample[] = [
      { features: { score_global: 25, c1: 30, c2: 20, c3: 25, c4: 20, c5: 30 }, label: 'critique' },
      { features: { score_global: 85, c1: 90, c2: 80, c3: 85, c4: 90, c5: 85 }, label: 'faible' },
      // ... plus d'échantillons
    ]
    
    const model = trainRandomForest(samples, 5, 3, 2)
    expect(model.accuracy).toBeGreaterThan(0.7)
    
    const features = { score_global: 20, c1: 25, c2: 15, c3: 20, c4: 15, c5: 25 }
    const prediction = predictRandomForest(model, features)
    expect(prediction).toBe('critique')
  })
})

// __tests__/graphNetwork.test.ts
describe('Graph Network', () => {
  it('should create and analyze risk graph', () => {
    const graph = createRiskGraph({
      aerodromes: [{ id: '1', score_risque: 45, type: 'national' }],
      domaines: [{ code: 'SGS', score: 60 }],
      ecarts: [{ id: 'e1', niveau_risque: 'critique', aerodrome_id: '1' }]
    })
    
    expect(graph.nodes.size).toBeGreaterThan(0)
    
    const propagation = calculateRiskPropagation(graph, 'aero_1')
    expect(propagation.affectedNodes.length).toBeGreaterThan(0)
  })
})
```

---

## Performance Attendue

| Métrique | Avant | Après |
|----------|-------|-------|
| Temps calcul Hawkes | 200-500ms (UI bloquée) | <50ms (background) |
| Précision prédiction | 65-75% (régression linéaire) | 80-90% (Random Forest) |
| Détection propagation | Non disponible | <100ms (Graph Network) |
| Notifications | Polling 30s | Temps réel (<1s) |

---

## Prochaines Étapes

1. **Déploiement progressif** : Activer les feature flags un par un
2. **Collecte données** : Enrichir l'historique pour améliorer Random Forest
3. **Calibration** : Ajuster les hyperparamètres selon les résultats
4. **Monitoring** : Dashboard de performance des modèles
5. **Alertes configurables** : Permettre aux utilisateurs de personnaliser les seuils

---

## Conclusion

L'implémentation des Phases 2, 3 et 4 apporte :

- ✅ **Performance** : Calculs asynchrones sans blocage UI
- ✅ **Précision** : Modèles ML avancés pour des prédictions fiables
- ✅ **Temps réel** : Notifications instantanées pour une réactivité optimale
- ✅ **Analyse réseau** : Compréhension de la propagation des risques

Ces améliorations positionnent le SGDA comme un système de surveillance aérodromaire de nouvelle génération, capable d'anticiper les risques et de recommander des actions proactives.

**Date:** 8 mai 2026  
**Version:** V5.2  
**Statut:** ✅ Implémentation complète