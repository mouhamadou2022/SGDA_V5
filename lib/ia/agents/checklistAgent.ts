// lib/ia/agents/checklistAgent.ts
// Agent 2 - Checklist Terrain
// Aide l'inspecteur à remplir la checklist, prédit les résultats,
// détecte les patterns récurrents, suggère les items prioritaires
// Supporte le mode hors-ligne via offline.ts
// Toutes les données passent par le store
// 0 API externe, 0 coût, 100% local

'use client'

import { useAppStore, ChecklistItem, ProfilRisque, DomaineChecklist, SousDomaine, SousSousDomaine } from '@/lib/store'
import type { DomaineChecklistOffline } from '@/lib/offline'
import { checklistMemory, getSuggestionsDetaillees, detectRecurrentPatterns } from '@/lib/checklistMemory'
import { idbGet, idbPut, IDB_STORES, isOnline, prepareSurveillanceForOffline, getChecklistHierarchyOffline } from '@/lib/offline'
import { aiClient } from '@/lib/ia/aiClient'
import { CHECKLIST_SYSTEM_PROMPT } from '@/lib/ia/prompts'

// Types pour l'agent
export interface ChecklistPredictionRequest {
  surveillanceId: string
  aerodromeId: string
  domaine: string
  sousDomaine: string
  sousSousDomaine: string
  itemId: string
  itemNumero: string
  itemDescription: string
  profil?: ProfilRisque
}

export interface ChecklistPredictionResult {
  prediction: 'SA' | 'NS' | 'NA' | 'NV'
  confidence: number
  justification: string
  alerte: boolean
  historique: Array<{ date: string; resultat: string }>
}

export interface ChecklistBatchPredictionRequest {
  surveillanceId: string
  aerodromeId: string
  items: Array<{
    id: string
    numero: string
    point_verification: string
    domaine: string
    sousDomaine: string
    sousSousDomaine: string
  }>
  profil?: ProfilRisque
}

export interface ChecklistBatchPredictionResult {
  predictions: Map<string, ChecklistPredictionResult>
  stats: {
    total: number
    sa: number
    ns: number
    na: number
    nv: number
    confidenceMoyenne: number
  }
}

export interface PriorityItem {
  itemId: string
  itemNumero: string
  pointVerification: string
  domaine: string
  sousDomaine: string
  sousSousDomaine: string
  raison: string
  priorite: 'critique' | 'haute' | 'normale'
  confiance: number
}

export interface RecurrentPattern {
  itemId: string
  itemNumero: string
  pointVerification: string
  domaine: string
  sousDomaine: string
  sousSousDomaine: string
  tauxRecurrence: number
  dernierResultat: string
  suggestion: string
}

export interface OfflinePreparationResult {
  surveillanceId: string
  ready: boolean
  itemsCount: number
  hierarchyStored: boolean
}

// Seuils
const CONFIDENCE_THRESHOLDS = {
  TRES_ELEVEE: 85,
  ELEVEE: 70,
  MOYENNE: 50,
}

const PRIORITY_THRESHOLDS = {
  CRITIQUE: {
    confidence: 85,
    nsCount: 2,
  },
  HAUTE: {
    confidence: 70,
    nsCount: 1,
  },
}

// ============================================================
// AGENT CHECKLIST TERRAIN
// ============================================================

export class ChecklistAgent {
  private initialized: boolean = false
  private offlineCache: Map<string, any> = new Map()
  private predictionCache: Map<string, ChecklistPredictionResult> = new Map()
  private cacheTTL: number = 300000 // 5 minutes

  async init(storeData: any): Promise<void> {
    this.initialized = true
    console.log('[ChecklistAgent] Initialisé')
  }

  // ============================================================
  // PRÉDICTION POUR UN ITEM
  // ============================================================

  async predictChecklist(
    request: ChecklistPredictionRequest,
    storeData: any
  ): Promise<ChecklistPredictionResult> {
    const cacheKey = `${request.aerodromeId}_${request.domaine}_${request.sousDomaine}_${request.sousSousDomaine}_${request.itemId}`
    
    // Vérifier le cache
    const cached = this.predictionCache.get(cacheKey)
    if (cached && Date.now() - this.getCacheTimestamp(cached) < this.cacheTTL) {
      return cached
    }

    const store = useAppStore.getState()
    
    // Utiliser checklistMemory existant
    const prediction = checklistMemory.getPredictionForItem(
      request.aerodromeId,
      'programmee',
      request.domaine,
      request.sousDomaine,
      request.sousSousDomaine,
      {
        id: request.itemId,
        numero: request.itemNumero,
        point_verification: request.itemDescription,
      },
      request.profil
    )

    // Enrichissement de la justification par IA si confiance faible ou pattern instable
    let justification = prediction.justification
    const needsAIExplanation = prediction.confiance < 75 || !justification || justification.length < 20

    if (needsAIExplanation && request.itemDescription) {
      const histResume = prediction.historique?.slice(-3).map(h => h.resultat).join(', ') ?? 'N/A'
      const aiResult = await aiClient.call({
        systemPrompt: CHECKLIST_SYSTEM_PROMPT,
        userMessage: `Item checklist : "${request.itemDescription}" (domaine: ${request.domaine})
Prédiction : ${prediction.prediction} (confiance: ${prediction.confiance}%)
Historique récent : ${histResume}
En 1 phrase courte, explique pourquoi ce résultat est prédit.`,
        temperature: 0.3,
        maxTokens: 60,
      })
      if (aiResult.ok && aiResult.content.trim()) {
        justification = aiResult.content.trim()
      }
    }

    const result: ChecklistPredictionResult = {
      prediction: prediction.prediction,
      confidence: prediction.confiance,
      justification,
      alerte: prediction.alerte,
      historique: prediction.historique.map(h => ({
        date: h.date,
        resultat: h.resultat,
      })),
    }

    this.predictionCache.set(cacheKey, result)
    return result
  }

  // ============================================================
  // PRÉDICTION PAR LOT (TOUTE LA CHECKLIST)
  // ============================================================

  async predictBatch(
    request: ChecklistBatchPredictionRequest,
    storeData: any
  ): Promise<ChecklistBatchPredictionResult> {
    const predictions = new Map<string, ChecklistPredictionResult>()
    let saCount = 0, nsCount = 0, naCount = 0, nvCount = 0
    let confidenceSum = 0

    for (const item of request.items) {
      const prediction = await this.predictChecklist(
        {
          surveillanceId: request.surveillanceId,
          aerodromeId: request.aerodromeId,
          domaine: item.domaine,
          sousDomaine: item.sousDomaine,
          sousSousDomaine: item.sousSousDomaine,
          itemId: item.id,
          itemNumero: item.numero,
          itemDescription: item.point_verification,
          profil: request.profil,
        },
        storeData
      )

      predictions.set(item.id, prediction)
      confidenceSum += prediction.confidence

      switch (prediction.prediction) {
        case 'SA': saCount++; break
        case 'NS': nsCount++; break
        case 'NA': naCount++; break
        default: nvCount++; break
      }
    }

    return {
      predictions,
      stats: {
        total: request.items.length,
        sa: saCount,
        ns: nsCount,
        na: naCount,
        nv: nvCount,
        confidenceMoyenne: Math.round(confidenceSum / request.items.length),
      },
    }
  }

  // ============================================================
  // ITEMS PRIORITAIRES
  // ============================================================

  async getPriorityItems(
    aerodromeId: string,
    domaine?: string
  ): Promise<PriorityItem[]> {
    const store = useAppStore.getState()
    const allSuggestions = getSuggestionsDetaillees(aerodromeId, 'programmee')
    
    const priorityItems: PriorityItem[] = []

    for (const suggestion of allSuggestions) {
      let priorite: 'critique' | 'haute' | 'normale' = 'normale'
      
      if (suggestion.confiance >= PRIORITY_THRESHOLDS.CRITIQUE.confidence) {
        priorite = 'critique'
      } else if (suggestion.confiance >= PRIORITY_THRESHOLDS.HAUTE.confidence) {
        priorite = 'haute'
      }

      // Vérifier les NS récurrents
      const nsCount = suggestion.historique.filter(r => r === 'NS').length
      if (nsCount >= PRIORITY_THRESHOLDS.CRITIQUE.nsCount) {
        priorite = 'critique'
      } else if (nsCount >= PRIORITY_THRESHOLDS.HAUTE.nsCount) {
        priorite = 'haute'
      }

      priorityItems.push({
        itemId: suggestion.itemId,
        itemNumero: suggestion.itemNumero,
        pointVerification: suggestion.pointVerification,
        domaine: suggestion.domaine,
        sousDomaine: suggestion.sousDomaine,
        sousSousDomaine: suggestion.sousSousDomaine,
        raison: suggestion.raison,
        priorite,
        confiance: suggestion.confiance,
      })
    }

    // Filtrer par domaine si spécifié
    const filtered = domaine 
      ? priorityItems.filter(i => i.domaine === domaine)
      : priorityItems

    // Trier par priorité
    const order = { critique: 0, haute: 1, normale: 2 }
    return filtered.sort((a, b) => order[a.priorite] - order[b.priorite])
  }

  // ============================================================
  // PATTERNS RÉCURRENTS
  // ============================================================

  async getRecurrentPatterns(
    aerodromeId: string,
    seuilRecurrence: number = 70
  ): Promise<RecurrentPattern[]> {
    const patterns = detectRecurrentPatterns(aerodromeId, seuilRecurrence)
    
    return patterns.map(p => ({
      itemId: p.itemId,
      itemNumero: p.itemNumero,
      pointVerification: p.pointVerification,
      domaine: p.domaine,
      sousDomaine: p.sousDomaine,
      sousSousDomaine: p.sousSousDomaine,
      tauxRecurrence: p.tauxRecurrence,
      dernierResultat: p.dernierResultat,
      suggestion: p.suggestion,
    }))
  }

  // ============================================================
  // MODE HORS-LIGNE
  // ============================================================

  async prepareForOffline(
    surveillanceId: string,
    hierarchy: DomaineChecklist[]
  ): Promise<OfflinePreparationResult> {
    // Compter le nombre total d'items
    let itemsCount = 0
    const countItems = (domaines: DomaineChecklist[]) => {
      for (const domaine of domaines) {
        for (const sousDomaine of domaine.sousDomaines) {
          for (const sousSousDomaine of sousDomaine.sousSousDomaines) {
            itemsCount += sousSousDomaine.items.length
          }
        }
      }
    }
    countItems(hierarchy)

    // Préparer les données offline
    await prepareSurveillanceForOffline(surveillanceId, {
      hierarchy: hierarchy as unknown as DomaineChecklistOffline[],
      domaineIds: hierarchy.map(d => d.id),
    })

    // Stocker dans le cache local
    this.offlineCache.set(surveillanceId, {
      hierarchy,
      preparedAt: new Date().toISOString(),
      itemsCount,
    })

    return {
      surveillanceId,
      ready: true,
      itemsCount,
      hierarchyStored: true,
    }
  }

  async isOfflineReady(surveillanceId: string): Promise<boolean> {
    // Vérifier dans le cache
    if (this.offlineCache.has(surveillanceId)) {
      return true
    }

    // Vérifier dans IndexedDB
    const hierarchy = await getChecklistHierarchyOffline(surveillanceId)
    return hierarchy !== null && hierarchy.length > 0
  }

  // ============================================================
  // SYNCHRONISATION
  // ============================================================

  async syncOfflineChanges(surveillanceId: string): Promise<{
    synced: boolean
    itemsSynced: number
    errors: string[]
  }> {
    const store = useAppStore.getState()
    const errors: string[] = []
    let itemsSynced = 0

    try {
      const offlineHierarchy = await getChecklistHierarchyOffline(surveillanceId)
      if (!offlineHierarchy) {
        return { synced: false, itemsSynced: 0, errors: ['Aucune donnée offline trouvée'] }
      }

      // Parcourir la hiérarchie offline et synchroniser les changements
      for (const domaine of offlineHierarchy) {
        for (const sousDomaine of domaine.sousDomaines) {
          for (const sousSousDomaine of sousDomaine.sousSousDomaines) {
            for (const item of sousSousDomaine.items) {
              if (item.resultat) {
                // Mettre à jour dans checklistMemory
                checklistMemory.upsertItemHistory(
                  surveillanceId,
                  'programmee',
                  domaine.nom,
                  sousDomaine.nom,
                  sousSousDomaine.nom,
                  {
                    id: item.id,
                    numero: item.numero,
                    point_verification: item.point_verification,
                    resultat: item.resultat,
                    observation: item.observation,
                    fichiers: item.fichiers,
                  },
                  surveillanceId
                )
                itemsSynced++
              }
            }
          }
        }
      }

      // Mettre à jour le profil de risque
      const surv = store.surveillances.find(s => s.id === surveillanceId)
      if (surv?.aerodrome_id) {
        await store.recalculerProfilRisque(surv.aerodrome_id)
      }

      return { synced: true, itemsSynced, errors }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      return { synced: false, itemsSynced, errors }
    }
  }

  // ============================================================
  // ASSISTANCE À LA SAISIE
  // ============================================================

  async getFieldHelp(
    item: ChecklistItem,
    contexte: string
  ): Promise<{
    suggestion: string
    exemples: string[]
    reglementation: string
  }> {
    // Si l'item a des directives spécifiques par état, les utiliser en priorité
    const directiveMap: Record<string, string | undefined> = {
      SA: (item as any).directive_sa,
      NS: (item as any).directive_ns,
      NV: (item as any).directive_nv,
      NA: (item as any).directive_na,
    }
    const specificDirective = directiveMap[contexte]

    const suggestions: Record<string, { suggestion: string; exemples: string[]; reglementation: string }> = {
      'SA': {
        suggestion: specificDirective
          ?? 'Item jugé satisfaisant. Indiquez les preuves observées qui démontrent la conformité.',
        exemples: specificDirective
          ? [specificDirective, 'Documentation conforme', 'Procédure appliquée']
          : ['Documentation conforme', 'Procédure appliquée', 'Équipement fonctionnel'],
        reglementation: item.reference_reglementaire || 'Référence réglementaire applicable',
      },
      'NS': {
        suggestion: specificDirective
          ?? 'Non-conformité identifiée. Décrivez précisément l\'écart constaté.',
        exemples: specificDirective
          ? [specificDirective, 'Document manquant ou périmé', 'Procédure non respectée']
          : ['Document manquant', 'Procédure non respectée', 'Délai dépassé'],
        reglementation: item.reference_reglementaire || 'Exigence non satisfaite',
      },
      'NA': {
        suggestion: specificDirective
          ?? 'Non applicable. Justifiez pourquoi cet item ne s\'applique pas à cet aérodrome.',
        exemples: specificDirective
          ? [specificDirective, 'Activité non présente sur site', 'Équipement non installé']
          : ['Activité non présente sur site', 'Équipement non installé', 'Processus externalisé'],
        reglementation: item.reference_reglementaire || 'Cas particulier justifié',
      },
      'NV': {
        suggestion: specificDirective
          ?? 'Non vérifié. Indiquez la raison et planifiez une vérification ultérieure.',
        exemples: specificDirective
          ? [specificDirective, 'Document en cours de révision', 'Responsable absent']
          : ['Équipement en maintenance', 'Document en cours de révision', 'Personnel absent'],
        reglementation: item.reference_reglementaire || 'Vérification différée',
      },
    }

    const defaultHelp = {
      suggestion: 'Renseignez le résultat de l\'inspection selon les 4 états disponibles.',
      exemples: [
        'SA : conforme aux exigences réglementaires',
        'NS : non-conformité avérée à documenter',
        'NV : impossibilité de vérifier le point',
        'NA : point non applicable à cet aérodrome',
      ],
      reglementation: 'Se référer à la réglementation en vigueur',
    }

    return suggestions[contexte] || defaultHelp
  }

  // ============================================================
  // VALIDATION BATCH (accepter tous les SA avec haute confiance)
  // ============================================================

  async validateBatchSA(
    items: Array<{ id: string; prediction: string; confiance: number }>,
    seuilConfiance: number = 70
  ): Promise<{
    itemsValides: string[]
    tempsGagne: number
  }> {
    const itemsValides = items
      .filter(item => item.prediction === 'SA' && item.confiance >= seuilConfiance)
      .map(item => item.id)

    const tempsGagne = itemsValides.length * 0.5 // 30 secondes par item

    return {
      itemsValides,
      tempsGagne,
    }
  }

  // ============================================================
  // STATISTIQUES D'APPRENTISSAGE
  // ============================================================

  getLearningStats(): {
    total_items: number
    confiance_moyenne: number
    taux_ecart_recurrent: number
    items_problematiques: number
  } {
    return checklistMemory.getLearningStats()
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  private getCacheTimestamp(result: ChecklistPredictionResult): number {
    // Utiliser la date du dernier historique comme timestamp
    if (result.historique.length > 0) {
      return new Date(result.historique[result.historique.length - 1].date).getTime()
    }
    return Date.now()
  }

  isReady(): boolean {
    return this.initialized
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const checklistAgent = new ChecklistAgent()