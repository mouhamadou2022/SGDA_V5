// lib/ia/agents/registreAgent.ts
// Agent IA pour le Registre - Version complète avec recherche sémantique avancée

'use client'

import { useAppStore, RegistreEntry, RegulationAnalysis, FormationSuggestion, KitDocument } from '@/lib/store'
import { aiClient } from '@/lib/ia/aiClient'
import { REGISTRE_SYSTEM_PROMPT } from '@/lib/ia/prompts'

// ============================================================
// TYPES
// ============================================================

export interface RegulationAnalysisRequest {
  documentId: string
  titre: string
  type: string
  contenu?: string
  contenu_url?: string
  version_ancienne?: string
  version_nouvelle: string
  date_publication: string
  resume?: string
}

export interface RegulationAnalysisResult {
  id: string
  documentId: string
  documentTitre: string
  documentType: string
  version: string
  date_analyse: string
  impact: 'majeur' | 'modere' | 'mineur' | 'aucun'
  impact_description: string
  chapitres_modifies: string[]
  formations_suggerees: FormationSuggestion[]
  inspecteurs_concernes: string[]
  delai_mise_conformite: number
  confidence: number
}

// FormationSuggestion est importée depuis @/lib/store (pas besoin de redéfinition)

export interface TrainingNeedsAnalysisRequest {
  aerodromeId?: string
  inspecteurId?: string
  horizonJours?: number
}

export interface TrainingNeedsAnalysisResult {
  inspecteurs: {
    id: string
    nom: string
    prenom: string
    besoins: {
      domaine: string
      formation_suggerer: string
      priorite: 'haute' | 'moyenne' | 'basse'
      raison: string
      derniere_formation?: string
      delai_jours: number
    }[]
    score_urgence: number
  }[]
  recommandations_generales: {
    titre: string
    description: string
    priorite: string
  }[]
  synthese: string
  analysee_le: string
}

export interface SemanticSearchResult {
  entry: RegistreEntry
  score: number
  matchedTerms: string[]
}

// ============================================================
// AGENT REGISTRE COMPLET
// ============================================================

export class RegistreAgent {
  private initialized: boolean = false
  private analysesCache: Map<string, RegulationAnalysisResult> = new Map()
  private formationSuggestionsCache: Map<string, FormationSuggestion[]> = new Map()

  async init(): Promise<void> {
    this.initialized = true
    console.log('[RegistreAgent] Initialisé')
  }

  // ============================================================
  // 1. RECHERCHE SÉMANTIQUE AVANCÉE
  // ============================================================

  async semanticSearch(query: string, filters?: { 
    type?: string; 
    aerodromeId?: string; 
    year?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<SemanticSearchResult[]> {
    const store = useAppStore.getState()
    let entries = store.registreEntries || []
    
    // Filtrage par type
    if (filters?.type) {
      entries = entries.filter(e => e.type === filters.type)
    }
    
    // Filtrage par aérodrome
    if (filters?.aerodromeId) {
      if (filters.aerodromeId === 'none') {
        entries = entries.filter(e => !e.aerodrome_id)
      } else {
        entries = entries.filter(e => e.aerodrome_id === filters.aerodromeId)
      }
    }
    
    // Filtrage par année
    if (filters?.year && filters.year !== 'all') {
      entries = entries.filter(e => e.date_entree.startsWith(filters.year!))
    }
    
    // Filtrage par période
    if (filters?.startDate) {
      entries = entries.filter(e => e.date_entree >= filters.startDate!)
    }
    if (filters?.endDate) {
      entries = entries.filter(e => e.date_entree <= filters.endDate!)
    }
    
    // Recherche sémantique
    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2)
    
    // Mots-clés stop (à ignorer)
    const stopWords = ['le', 'la', 'les', 'de', 'des', 'du', 'et', 'ou', 'pour', 'par', 'dans', 'sur', 'avec', 'sans']
    
    const scored: SemanticSearchResult[] = []
    
    for (const entry of entries) {
      let score = 0
      const matchedTerms: string[] = []
      const searchText = (entry.titre + ' ' + entry.description + ' ' + entry.reference).toLowerCase()
      
      // Score pour correspondance exacte de la phrase
      if (searchText.includes(queryLower)) {
        score += 15
        matchedTerms.push(queryLower)
      }
      
      // Score pour chaque mot de la requête
      for (const word of queryWords) {
        if (!stopWords.includes(word) && searchText.includes(word)) {
          score += 3
          if (!matchedTerms.includes(word)) matchedTerms.push(word)
        }
      }
      
      // Score pour les mots-clés de l'analyse IA
      if (entry.ia_analysis?.keywords) {
        for (const kw of entry.ia_analysis.keywords) {
          if (queryLower.includes(kw.toLowerCase())) {
            score += 5
            if (!matchedTerms.includes(kw)) matchedTerms.push(kw)
          }
        }
      }
      
      // Bonus pour la récence (documents plus récents ont un score légèrement plus élevé)
      const daysSinceEntry = Math.floor((Date.now() - new Date(entry.date_entree).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSinceEntry < 30) score += 2
      else if (daysSinceEntry < 90) score += 1
      
      if (score > 0) {
        scored.push({ entry, score, matchedTerms })
      }
    }
    
    // Trier par score décroissant
    return scored.sort((a, b) => b.score - a.score)
  }

  // ============================================================
  // 2. COMMANDES EN LANGAGE NATUREL AVEC CONTEXTE D'ONGLET
  // ============================================================

  async executeCommand(command: string, contextType?: string): Promise<{ success: boolean; message: string; data?: any }> {
    const lower = command.toLowerCase()

    // Commande: recherche
    if (lower.startsWith('recherche') || lower.startsWith('trouve') || lower.startsWith('cherche')) {
      let query = command.replace(/^(recherche|trouve|cherche)\s+/, '')
      
      // Appliquer le contexte d'onglet si fourni
      const typeMap: Record<string, string> = {
        certification: 'certification',
        homologation: 'homologation',
        surveillance: 'surveillance',
        evenement: 'evenement',
        ecart: 'ecart',
        dossier: 'dossier',
        document: 'document'
      }
      
      const searchType = contextType && typeMap[contextType] ? typeMap[contextType] : undefined
      
      const results = await this.semanticSearch(query, { type: searchType })
      
      if (results.length === 0) {
        return {
          success: true,
          message: `Aucun résultat trouvé pour "${query}"`,
          data: []
        }
      }
      
      return {
        success: true,
        message: `${results.length} résultat(s) trouvé(s) pour "${query}"`,
        data: results.map(r => r.entry)
      }
    }

    // Commande: statistiques
    if (lower.includes('statistique') || lower.includes('combien')) {
      const store = useAppStore.getState()
      const entries = store.registreEntries || []
      const typeMap: Record<string, string> = {
        certification: 'Certifications',
        homologation: 'Homologations',
        surveillance: 'Surveillances',
        evenement: 'Événements',
        ecart: 'Écarts',
        dossier: 'Dossiers',
        document: 'Documents'
      }
      
      let message = `Total: ${entries.length} entrées. `
      const parType: Record<string, number> = {}
      entries.forEach(e => { parType[e.type] = (parType[e.type] || 0) + 1 })
      
      const typeStats = Object.entries(parType)
        .map(([t, c]) => `${typeMap[t] || t}: ${c}`)
        .join(', ')
      
      message += `Répartition: ${typeStats}`
      
      return {
        success: true,
        message,
        data: { total: entries.length, parType }
      }
    }

    // Commande: tendances
    if (lower.includes('tendance') || lower.includes('évolution')) {
      const store = useAppStore.getState()
      const entries = store.registreEntries || []
      
      // Grouper par mois
      const parMois: Record<string, number> = {}
      entries.forEach(e => {
        const mois = e.date_entree.slice(0, 7)
        parMois[mois] = (parMois[mois] || 0) + 1
      })
      
      const mois = Object.keys(parMois).sort().slice(-6)
      const tendances = { hausse: 0, baisse: 0, stable: 0 }
      
      for (let i = 1; i < mois.length; i++) {
        const variation = (parMois[mois[i]] || 0) - (parMois[mois[i-1]] || 0)
        if (variation > 2) tendances.hausse++
        else if (variation < -2) tendances.baisse++
        else tendances.stable++
      }
      
      let message = `Tendances: ${tendances.hausse} mois en hausse, ${tendances.baisse} mois en baisse`
      
      return {
        success: true,
        message,
        data: { parMois, tendances }
      }
    }

    // Commande: résumé
    if (lower.includes('résumé') || lower.includes('synthèse')) {
      const store = useAppStore.getState()
      const entries = store.registreEntries || []
      const total = entries.length
      
      if (total === 0) {
        return {
          success: true,
          message: 'Aucune entrée dans le registre pour cette période.',
          data: null
        }
      }
      
      const parType: Record<string, number> = {}
      entries.forEach(e => { parType[e.type] = (parType[e.type] || 0) + 1 })
      
      const topTypes = Object.entries(parType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t, c]) => `${this.getTypeLabel(t)} (${c})`)
        .join(', ')
      
      const message = `Le registre contient ${total} entrée(s). Principales catégories : ${topTypes}.`
      
      return {
        success: true,
        message,
        data: { total, parType }
      }
    }

    // Commande: analyse besoins formation
    if (lower.includes('besoin formation') || lower.includes('formation inspecteur')) {
      const analysis = await this.analyzeTrainingNeeds({})
      return {
        success: true,
        message: analysis.synthese,
        data: analysis
      }
    }

    // Commande: alertes réglementaires
    if (lower.includes('alerte') || lower.includes('reglement')) {
      const pendingAlerts = await this.getPendingRegulationAlerts()
      if (pendingAlerts.length === 0) {
        return {
          success: true,
          message: 'Aucune alerte réglementaire en attente.',
          data: []
        }
      }
      
      const message = `${pendingAlerts.length} alerte(s) réglementaire(s) en attente. ${pendingAlerts.filter(a => a.impact === 'majeur').length} impact(s) majeur(s).`
      
      return {
        success: true,
        message,
        data: pendingAlerts
      }
    }

    // Commande libre — traitement par LLM avec contexte du registre
    const store = useAppStore.getState()
    const entries = store.registreEntries || []
    const statsContext = {
      total: entries.length,
      par_type: entries.reduce((acc: Record<string, number>, e: RegistreEntry) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc }, {}),
    }

    const aiResult = await aiClient.call({
      systemPrompt: REGISTRE_SYSTEM_PROMPT,
      userMessage: `Commande utilisateur : "${command}"

Contexte du registre ANACIM :
${JSON.stringify(statsContext, null, 2)}

Réponds à cette commande de façon professionnelle et utile pour l'inspecteur.`,
      temperature: 0.4,
      maxTokens: 600,
    })

    if (aiResult.ok) {
      return { success: true, message: aiResult.content, data: null }
    }

    return {
      success: false,
      message: 'Commande non reconnue. Essayez : recherche [terme], statistiques, tendances, résumé, besoin formation, alerte.',
    }
  }

  private getTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      certification: 'Certifications',
      homologation: 'Homologations',
      surveillance: 'Surveillances',
      evenement: 'Événements',
      ecart: 'Écarts',
      dossier: 'Dossiers',
      document: 'Documents'
    }
    return labels[type] || type
  }

  // ============================================================
  // 3. ANALYSE DES DOCUMENTS RÈGLEMENTAIRES
  // ============================================================

  async analyzeRegulationDocument(request: RegulationAnalysisRequest): Promise<RegulationAnalysisResult> {
    const store = useAppStore.getState()
    const cacheKey = `${request.documentId}_${request.version_nouvelle}`
    
    const cached = this.analysesCache.get(cacheKey)
    if (cached) return cached

    const documentType = this.detectDocumentType(request.titre, request.type)
    
    let impact: 'majeur' | 'modere' | 'mineur' | 'aucun' = 'mineur'
    let impact_description = ''
    let chapitres_modifies: string[] = []
    
    // Analyse d'impact par IA
    type ImpactJSON = { impact: string; description: string; chapitres: string[] }
    const fallbackImpact: ImpactJSON = {
      impact: request.version_ancienne ? (this.detectMajorChanges(request.titre) ? 'majeur' : 'modere') : 'majeur',
      description: request.version_ancienne
        ? `Mise à jour de ${request.titre} — révision des procédures nécessaire.`
        : `Nouveau document réglementaire : ${request.titre} — formation recommandée.`,
      chapitres: this.extractModifiedChapters(request.titre),
    }

    const aiImpact = await aiClient.callJSON<ImpactJSON>(
      {
        systemPrompt: REGISTRE_SYSTEM_PROMPT,
        userMessage: `Analyse l'impact de ce document réglementaire pour les inspecteurs ANACIM et retourne JSON:
{"impact": "majeur|modere|mineur|aucun", "description": "...", "chapitres": ["...", "..."]}

Document: ${request.titre}
Type: ${request.type}
Version ancienne: ${request.version_ancienne ?? 'N/A (nouveau document)'}
Version nouvelle: ${request.version_nouvelle ?? 'N/A'}
Résumé: ${request.resume ?? 'Non fourni'}`,
        temperature: 0.3,
        maxTokens: 400,
        responseFormat: 'json_object',
      },
      fallbackImpact
    )

    impact = (aiImpact.impact as typeof impact) ?? fallbackImpact.impact
    impact_description = aiImpact.description
    chapitres_modifies = aiImpact.chapitres ?? []

    const formations_suggerees = await this.generateFormationSuggestions(request, impact, documentType)
    const inspecteurs_concernes = await this.identifyAffectedInspectors(documentType, impact)
    const DELAIS_CONFORMITE: Record<string, number> = { majeur: 30, modere: 60, mineur: 90, aucun: 90 }
    const delai_mise_conformite = DELAIS_CONFORMITE[impact as string] ?? 90

    const result: RegulationAnalysisResult = {
      id: `reg-ana-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      documentId: request.documentId,
      documentTitre: request.titre,
      documentType: request.type,
      version: request.version_nouvelle,
      date_analyse: new Date().toISOString(),
      impact,
      impact_description,
      chapitres_modifies,
      formations_suggerees,
      inspecteurs_concernes,
      delai_mise_conformite,
      confidence: 85,
    }

    this.analysesCache.set(cacheKey, result)
    return result
  }

  private detectDocumentType(titre: string, type: string): string {
    const titreLower = titre.toLowerCase()
    if (titreLower.includes('ras') || titreLower.includes('annexe')) return 'reglementation_oaci'
    if (titreLower.includes('circulaire')) return 'circulaire'
    if (titreLower.includes('decret')) return 'decret'
    if (titreLower.includes('guide')) return 'guide'
    if (titreLower.includes('procedure')) return 'procedure'
    if (titreLower.includes('checklist')) return 'checklist'
    return type || 'document'
  }

  private detectMajorChanges(titre: string): boolean {
    const keywords = ['réforme', 'nouveau', 'modification majeure', 'refonte', 'chapitre']
    return keywords.some(k => titre.toLowerCase().includes(k))
  }

  private extractModifiedChapters(titre: string): string[] {
    return ['Chapitre 5 - Sécurité', 'Annexe B - Procédures']
  }

  private async generateFormationSuggestions(
    request: RegulationAnalysisRequest,
    impact: string,
    documentType: string
  ): Promise<FormationSuggestion[]> {
    const suggestions: FormationSuggestion[] = []
    const baseId = `fs-${Date.now()}`

    if (impact === 'majeur') {
      suggestions.push({
        id: `${baseId}-1`,
        titre: `Formation à la nouvelle réglementation: ${request.titre.substring(0, 50)}`,
        description: `Présentation des nouvelles exigences et mise à jour des pratiques suite à la publication de ${request.titre}`,
        duree_heures: 8,
        priorite: 'haute',
        justification: `Document réglementaire majeur publié le ${new Date(request.date_publication).toLocaleDateString('fr-FR')}. Formation obligatoire pour tous les inspecteurs concernés.`,
        public_cible: ['tous'],
        domaines: [this.mapDocumentTypeToDomaine(documentType)],
        source_document_id: request.documentId,
        source_document_titre: request.titre,
        status: 'suggested',
        created_at: new Date().toISOString(),
      })
    } else if (impact === 'modere') {
      suggestions.push({
        id: `${baseId}-2`,
        titre: `Mise à jour: ${request.titre.substring(0, 50)}`,
        description: `Session de mise à niveau sur les modifications apportées au document ${request.titre}`,
        duree_heures: 4,
        priorite: 'moyenne',
        justification: `Mise à jour modérée du document. Formation recommandée pour les inspecteurs experts.`,
        public_cible: ['expert'],
        domaines: [this.mapDocumentTypeToDomaine(documentType)],
        source_document_id: request.documentId,
        source_document_titre: request.titre,
        status: 'suggested',
        created_at: new Date().toISOString(),
      })
    }

    return suggestions
  }

  private mapDocumentTypeToDomaine(documentType: string): string {
    const mapping: Record<string, string> = {
      reglementation_oaci: 'Réglementation',
      circulaire: 'Réglementation',
      decret: 'Réglementation',
      guide: 'SGS',
      procedure: 'OPS',
      checklist: 'Inspection',
    }
    return mapping[documentType] || 'Général'
  }

  private async identifyAffectedInspectors(documentType: string, impact: string): Promise<string[]> {
    const store = useAppStore.getState()
    const inspecteurs = store.utilisateurs?.filter(u => u.role === 'inspector') || []
    
    if (impact === 'majeur') {
      return inspecteurs.map(i => i.id)
    }
    
    return inspecteurs.slice(0, 2).map(i => i.id)
  }

  // ============================================================
  // 4. ANALYSE DES BESOINS EN FORMATION
  // ============================================================

  async analyzeTrainingNeeds(request: TrainingNeedsAnalysisRequest): Promise<TrainingNeedsAnalysisResult> {
    const store = useAppStore.getState()
    const inspecteurs = store.utilisateurs?.filter(u => u.role === 'inspector') || []
    const formations = store.formations || []
    const analyses = Array.from(this.analysesCache.values())
    const suggestions = Array.from(this.formationSuggestionsCache.values()).flat()

    const inspecteursAnalysis = await Promise.all(
      inspecteurs.map(async (insp) => {
        const besoins = []
        
        const dernieresFormations = formations.filter(f => 
          f.participants?.includes(insp.id) && f.statut === 'terminee'
        )
        
        for (const analysis of analyses) {
          const aDejaFormation = dernieresFormations.some(f => 
            f.domaines?.includes(this.mapDocumentTypeToDomaine(analysis.documentType))
          )
          
          if (!aDejaFormation && analysis.impact !== 'aucun') {
            besoins.push({
              domaine: this.mapDocumentTypeToDomaine(analysis.documentType),
              formation_suggerer: analysis.formations_suggerees[0]?.titre || `Formation ${analysis.documentTitre}`,
              priorite: analysis.impact === 'majeur' ? 'haute' : 'moyenne',
              raison: analysis.impact_description,
              derniere_formation: this.getLastFormationDate(insp.id, analysis.documentType, formations),
              delai_jours: analysis.delai_mise_conformite,
            })
          }
        }
        
        const suggestionsNonPlanifiees = suggestions.filter(s => 
          s.status === 'suggested'
        )
        
        for (const suggestion of suggestionsNonPlanifiees) {
          besoins.push({
            domaine: suggestion.domaines[0],
            formation_suggerer: suggestion.titre,
            priorite: suggestion.priorite as any,
            raison: suggestion.justification,
            derniere_formation: this.getLastFormationDate(insp.id, suggestion.domaines[0], formations),
            delai_jours: 30,
          })
        }
        
        const score_urgence = Math.min(100, besoins.filter(b => b.priorite === 'haute').length * 30 +
                              besoins.filter(b => b.priorite === 'moyenne').length * 15)
        
        return {
          id: insp.id,
          nom: insp.nom,
          prenom: insp.prenom,
          besoins,
          score_urgence,
        }
      })
    )

    const recommandations_generales = []
    const totalUrgence = inspecteursAnalysis.reduce((sum, i) => sum + i.score_urgence, 0)
    
    if (totalUrgence > 200) {
      recommandations_generales.push({
        titre: "Plan de formation d'urgence",
        description: "Plusieurs inspecteurs présentent des besoins de formation critiques. Organiser une session collective.",
        priorite: 'haute',
      })
    }
    
    if (analyses.some(a => a.impact === 'majeur')) {
      recommandations_generales.push({
        titre: "Nouvelles réglementations à intégrer",
        description: "Des documents réglementaires majeurs ont été publiés. Formation obligatoire pour tous.",
        priorite: 'haute',
      })
    }

    const synthese = this.generateTrainingSynthesis(inspecteursAnalysis)

    return {
      inspecteurs: inspecteursAnalysis,
      recommandations_generales,
      synthese,
      analysee_le: new Date().toISOString(),
    }
  }

  private getLastFormationDate(inspecteurId: string, domaine: string, formations: any[]): string | undefined {
    const formation = formations
      .filter(f => f.participants?.includes(inspecteurId) && f.domaines?.includes(domaine))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    return formation?.date
  }

  private generateTrainingSynthesis(inspecteursAnalysis: any[]): string {
    const totalBesoins = inspecteursAnalysis.reduce((sum, i) => sum + i.besoins.length, 0)
    const besoinsCritiques = inspecteursAnalysis.reduce((sum, i) => 
      sum + i.besoins.filter((b: any) => b.priorite === 'haute').length, 0
    )
    
    if (totalBesoins === 0) {
      return "Aucun besoin de formation identifié. Les inspecteurs sont à jour."
    }
    
    return `${totalBesoins} besoin(s) de formation identifié(s) dont ${besoinsCritiques} prioritaire(s). Un plan de formation est recommandé.`
  }

  // ============================================================
  // 5. UTILITAIRES
  // ============================================================

  async getPendingRegulationAlerts(): Promise<RegulationAnalysisResult[]> {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    return Array.from(this.analysesCache.values()).filter(a => 
      new Date(a.date_analyse) > thirtyDaysAgo && a.impact !== 'aucun'
    )
  }

  async analyzeEntryContent(entry: any): Promise<any> {
    return {
      summary: `${entry.titre} - Entrée du ${new Date(entry.date_entree).toLocaleDateString('fr-FR')}`,
      keywords: this.extractKeywords(entry.titre + ' ' + entry.description),
      entities: [],
      analyzed_at: new Date().toISOString(),
    }
  }

  private extractKeywords(text: string): string[] {
    const stopWords = ['le', 'la', 'les', 'de', 'des', 'du', 'et', 'ou', 'pour', 'par', 'dans', 'sur', 'avec', 'sans']
    const words = text.toLowerCase().split(/[\s,.;:!?()]+/)
    return [...new Set(words.filter(w => w.length > 3 && !stopWords.includes(w)))]
  }

  async analyze(request: any): Promise<any> {
    return {
      stats: { total: 0, parType: {}, parAerodrome: {}, parMois: {} },
      entries: [],
      confidence: 85,
      generatedAt: new Date().toISOString(),
    }
  }

  isReady(): boolean {
    return this.initialized
  }
}

export const registreAgent = new RegistreAgent()