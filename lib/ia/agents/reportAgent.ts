// lib/ia/agents/reportAgent.ts
// Agent 4 - Rapport de surveillance (VERSION COMPLÈTE AVEC ANALYSE ET CHARGEMENT)
// Supporte l'analyse de rapports existants, suggestions d'amélioration,
// chargement de fichiers, versioning, et génération avancée
// Toutes les données passent par le store
// 0 API externe, 0 coût, 100% local

'use client'

import { useAppStore, Surveillance, ChecklistItem, Ecart, Aerodrome, ProfilRisque } from '@/lib/store'
import { riskAgent } from './riskAgent'
import { aiClient } from '@/lib/ia/aiClient'
import { REPORT_SYSTEM_PROMPT } from '@/lib/ia/prompts'

// ============================================================
// TYPES
// ============================================================
// TYPES
// ============================================================

export interface IAInstruction {
  surveillanceId: string
  instruction: string
  currentContent: string
  mode: 'modele' | 'libre'
  templateId?: string
}

export interface IAResult {
  success: boolean
  content: string
  suggestion?: string
  message: string
  confidence: number
}

export interface ReportAnalysis {
  score: number
  grade: 'excellent' | 'bon' | 'moyen' | 'faible' | 'insuffisant'
  sectionsPresentes: string[]
  sectionsManquantes: string[]
  faiblesses: Array<{
    section: string
    probleme: string
    suggestion: string
    priorite: 'haute' | 'moyenne' | 'basse'
  }>
  forces: string[]
  statistiques: {
    mots: number
    caracteres: number
    paragraphes: number
    listeItems: number
    presenceTableaux: boolean
    presenceImages: boolean
  }
  recommandations: string[]
}

export interface LoadedReport {
  id: string
  nom: string
  contenu: string
  type: 'pdf' | 'docx' | 'txt' | 'html'
  dateChargement: string
  source: 'upload' | 'historique' | 'template'
  analyse?: ReportAnalysis
  version: number
}

export interface ReportVersion {
  id: string
  rapportId: string
  version: number
  content: string
  createdAt: string
  createdBy: string
  commentaire?: string
  changes: string[]
}

export interface ReportSection {
  id: string
  titre: string
  contenu: string
  auto: boolean
  ordre: number
}

// ============================================================
// TEMPLATES
// ============================================================

const TEMPLATES: Record<string, { sections: ReportSection[]; description: string }> = {
  template_standard: {
    description: 'Template standard avec toutes les sections obligatoires',
    sections: [
      { id: 'page_garde', titre: 'PAGE DE GARDE', contenu: '', auto: true, ordre: 1 },
      { id: 'table_matieres', titre: 'TABLE DES MATIÈRES', contenu: '', auto: true, ordre: 2 },
      { id: 'resume_executif', titre: 'RÉSUMÉ EXÉCUTIF', contenu: '', auto: false, ordre: 3 },
      { id: 'introduction', titre: 'INTRODUCTION ET CONTEXTE', contenu: '', auto: false, ordre: 4 },
      { id: 'equipe_inspection', titre: 'ÉQUIPE D\'INSPECTION', contenu: '', auto: true, ordre: 5 },
      { id: 'methodologie', titre: 'MÉTHODOLOGIE', contenu: '', auto: false, ordre: 6 },
      { id: 'deroulement', titre: 'DÉROULEMENT DE LA SURVEILLANCE', contenu: '', auto: false, ordre: 7 },
      { id: 'resultats', titre: 'RÉSULTATS DE L\'INSPECTION', contenu: '', auto: true, ordre: 8 },
      { id: 'preoccupations', titre: 'PRÉOCCUPATIONS DE SÉCURITÉ', contenu: '', auto: false, ordre: 9 },
      { id: 'recommandations', titre: 'RECOMMANDATIONS ET CONCLUSION', contenu: '', auto: false, ordre: 10 },
      { id: 'annexes', titre: 'ANNEXES', contenu: '', auto: true, ordre: 11 },
    ],
  },
  template_rapide: {
    description: 'Template rapide pour inspections simples',
    sections: [
      { id: 'header', titre: 'EN-TÊTE', contenu: '', auto: true, ordre: 1 },
      { id: 'resume', titre: 'RÉSUMÉ', contenu: '', auto: true, ordre: 2 },
      { id: 'ecarts', titre: 'ÉCARTS', contenu: '', auto: true, ordre: 3 },
      { id: 'conclusion', titre: 'CONCLUSION', contenu: '', auto: false, ordre: 4 },
    ],
  },
  template_detaille: {
    description: 'Template détaillé pour audit complet',
    sections: [
      { id: 'page_garde', titre: 'PAGE DE GARDE', contenu: '', auto: true, ordre: 1 },
      { id: 'resume_executif', titre: 'RÉSUMÉ EXÉCUTIF', contenu: '', auto: true, ordre: 2 },
      { id: 'methodologie', titre: 'MÉTHODOLOGIE', contenu: '', auto: true, ordre: 3 },
      { id: 'resultats', titre: 'RÉSULTATS PAR DOMAINE', contenu: '', auto: true, ordre: 4 },
      { id: 'analyse_nc', titre: 'ANALYSE DES NON-CONFORMITÉS', contenu: '', auto: true, ordre: 5 },
      { id: 'recommandations', titre: 'RECOMMANDATIONS', contenu: '', auto: true, ordre: 6 },
      { id: 'plan_action', titre: 'PLAN D\'ACTION', contenu: '', auto: false, ordre: 7 },
      { id: 'conclusion', titre: 'CONCLUSION', contenu: '', auto: true, ordre: 8 },
      { id: 'annexes', titre: 'ANNEXES', contenu: '', auto: true, ordre: 9 },
    ],
  },
}

// ============================================================
// AGENT RAPPORT COMPLET
// ============================================================

export class ReportAgent {
  private initialized: boolean = false
  private history: Map<string, { content: string; timestamp: string }[]> = new Map()
  private reportVersions: Map<string, ReportVersion[]> = new Map()
  private loadedReports: Map<string, LoadedReport> = new Map()

  async init(storeData: any): Promise<void> {
    this.initialized = true
    console.log('[ReportAgent] Initialisé')
    await this.loadVersionsFromStorage()
  }

  // ============================================================
  // 1. EXÉCUTION D'INSTRUCTION EN LANGAGE NATUREL
  // ============================================================

  async executeInstruction(request: IAInstruction): Promise<IAResult> {
    const instruction = request.instruction.toLowerCase()
    const currentContent = request.currentContent
    const store = useAppStore.getState()
    
    this.saveToHistory(request.surveillanceId, currentContent)

    if (instruction.includes('génère') || instruction.includes('crée') || instruction.includes('nouveau rapport')) {
      return this.generateReport(request)
    }
    
    if (instruction.includes('charge') || instruction.includes('ouvre') || instruction.includes('affiche')) {
      return this.loadReport(request)
    }
    
    if (instruction.includes('analyse') || instruction.includes('évalue') || instruction.includes('diagnostique')) {
      return this.analyzeReport(request)
    }
    
    if (instruction.includes('améliore') || instruction.includes('améliorer') || instruction.includes('reformule')) {
      return this.improveReport(request)
    }
    
    if (instruction.includes('suggère') || instruction.includes('suggestion')) {
      return this.suggestImprovements(request)
    }
    
    if (instruction.includes('ajoute') || instruction.includes('insère')) {
      return this.addContent(request)
    }
    
    if (instruction.includes('compare') || instruction.includes('différence')) {
      return this.compareVersions(request)
    }
    
    if (instruction.includes('supprime') || instruction.includes('enlève')) {
      return this.removeContent(request)
    }

    // Commande libre — traitement par LLM
    return this.handleFreeInstruction(request)
  }

  private async handleFreeInstruction(request: IAInstruction): Promise<IAResult> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find((s: Surveillance) => s.id === request.surveillanceId)

    const aiResult = await aiClient.call({
      systemPrompt: REPORT_SYSTEM_PROMPT,
      userMessage: `Instruction de l'inspecteur : "${request.instruction}"

Contexte :
- Surveillance : ${surveillance?.type ?? 'N/A'} du ${surveillance?.date_debut ?? 'N/A'}
- Aérodrome : ${store.aerodromes.find((a: Aerodrome) => a.id === surveillance?.aerodrome_id)?.code_oaci ?? 'N/A'}
- Rapport actuel (extrait) : ${request.currentContent.substring(0, 500)}...

Exécute l'instruction et retourne le contenu modifié ou ta réponse directement.`,
      temperature: 0.4,
      maxTokens: 2048,
    })

    if (aiResult.ok) {
      return { success: true, content: aiResult.content, message: 'Instruction exécutée par IA.', confidence: 85 }
    }

    return {
      success: false,
      content: request.currentContent,
      message: `Instruction non reconnue: "${request.instruction}". Commandes: génère, charge, analyse, améliore, suggère, ajoute, compare, supprime`,
      confidence: 0,
    }
  }

  // ============================================================
  // 2. CHARGER UN RAPPORT EXISTANT
  // ============================================================

  async loadReport(request: IAInstruction): Promise<IAResult> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find(s => s.id === request.surveillanceId)
    
    if (!surveillance?.rapport_html) {
      return {
        success: false,
        content: request.currentContent,
        message: 'Aucun rapport existant pour cette surveillance. Utilisez "génère" pour en créer un.',
        confidence: 0,
      }
    }

    // Sauvegarder la version actuelle avant de charger
    const currentVersion = await this.saveVersion(request.surveillanceId, request.currentContent, 'Chargement d\'un rapport existant')
    
    return {
      success: true,
      content: surveillance.rapport_html,
      message: 'Rapport chargé avec succès. Une version de secours a été sauvegardée.',
      confidence: 100,
    }
  }

  async loadReportFromFile(surveillanceId: string, fileContent: string, fileName: string): Promise<LoadedReport> {
    const newReport: LoadedReport = {
      id: `report-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      nom: fileName,
      contenu: fileContent,
      type: this.detectFileType(fileName),
      dateChargement: new Date().toISOString(),
      source: 'upload',
      version: 1,
    }
    
    // Analyser automatiquement le rapport chargé
    const analysis = await this.analyzeReportContent(newReport.contenu, surveillanceId)
    newReport.analyse = analysis
    
    this.loadedReports.set(newReport.id, newReport)
    
    return newReport
  }

  private detectFileType(fileName: string): LoadedReport['type'] {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'pdf': return 'pdf'
      case 'docx': return 'docx'
      case 'txt': return 'txt'
      case 'html':
      case 'htm': return 'html'
      default: return 'txt'
    }
  }

  // ============================================================
  // 3. ANALYSER UN RAPPORT (QUALITÉ, COMPLÉTUDE, ETC.)
  // ============================================================

  async analyzeReport(request: IAInstruction): Promise<IAResult> {
    const content = request.currentContent
    const analysis = await this.analyzeReportContent(content, request.surveillanceId)
    
    let html = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Analyse du rapport</h3>
          <span class="badge ${this.getGradeBadgeClass(analysis.grade)}">${analysis.grade}</span>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="text-center p-2 bg-gray-50 rounded-lg">
            <div class="text-2xl font-bold">${analysis.score}%</div>
            <div class="text-xs text-muted-foreground">Score global</div>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded-lg">
            <div class="text-2xl font-bold">${analysis.statistiques.mots}</div>
            <div class="text-xs text-muted-foreground">Mots</div>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded-lg">
            <div class="text-2xl font-bold">${analysis.sectionsPresentes.length}/${analysis.sectionsPresentes.length + analysis.sectionsManquantes.length}</div>
            <div class="text-xs text-muted-foreground">Sections</div>
          </div>
          <div class="text-center p-2 bg-gray-50 rounded-lg">
            <div class="text-2xl font-bold">${analysis.statistiques.listeItems}</div>
            <div class="text-xs text-muted-foreground">Points listés</div>
          </div>
        </div>
    `

    if (analysis.sectionsManquantes.length > 0) {
      html += `
        <div class="alert alert-warning">
          <div class="alert-title">⚠️ Sections manquantes</div>
          <div class="alert-description">${analysis.sectionsManquantes.join(', ')}</div>
        </div>
      `
    }

    if (analysis.faiblesses.length > 0) {
      html += `
        <div class="space-y-2">
          <p class="font-semibold">🔍 Points à améliorer</p>
          <div class="space-y-2">
            ${analysis.faiblesses.map(f => `
              <div class="p-2 bg-warning/10 rounded-lg border-l-4 border-warning">
                <p class="font-medium">${f.section}</p>
                <p class="text-sm">${f.probleme}</p>
                <p class="text-xs text-info mt-1">💡 Suggestion: ${f.suggestion}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `
    }

    if (analysis.forces.length > 0) {
      html += `
        <div class="space-y-2">
          <p class="font-semibold">✅ Points forts</p>
          <ul class="list-disc pl-5 space-y-1">
            ${analysis.forces.map(f => `<li class="text-sm">${f}</li>`).join('')}
          </ul>
        </div>
      `
    }

    html += `
        <div class="space-y-2">
          <p class="font-semibold">📋 Recommandations</p>
          <ul class="list-disc pl-5 space-y-1">
            ${analysis.recommandations.map(r => `<li class="text-sm">${r}</li>`).join('')}
          </ul>
        </div>
      </div>
    `

    return {
      success: true,
      content: request.currentContent,
      suggestion: html,
      message: `Analyse terminée - Score: ${analysis.score}%`,
      confidence: 90,
    }
  }

  async analyzeReportContent(content: string, surveillanceId: string): Promise<ReportAnalysis> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find(s => s.id === surveillanceId)
    
    // Statistiques de base
    const mots = content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(w => w.length > 0).length
    const caracteres = content.replace(/<[^>]*>/g, ' ').length
    const paragraphes = content.split(/<\/p>|<br\/>|<br>/i).length
    const listeItems = (content.match(/<li>|<li\/>/gi) || []).length
    const presenceTableaux = content.includes('<table') || content.includes('<td>')
    const presenceImages = content.includes('<img') || content.includes('src=')
    
    // Détecter les sections présentes
    const sectionsRequis = [
      { nom: 'RÉSUMÉ EXÉCUTIF', keywords: ['résumé', 'executif', 'synthèse'] },
      { nom: 'INTRODUCTION', keywords: ['introduction', 'contexte'] },
      { nom: 'MÉTHODOLOGIE', keywords: ['méthodologie', 'méthode', 'approche'] },
      { nom: 'RÉSULTATS', keywords: ['résultats', 'constats', 'observations'] },
      { nom: 'RECOMMANDATIONS', keywords: ['recommandations', 'actions', 'propositions'] },
      { nom: 'CONCLUSION', keywords: ['conclusion', 'clôture'] },
    ]
    
    const sectionsPresentes: string[] = []
    const sectionsManquantes: string[] = []
    
    for (const section of sectionsRequis) {
      const presente = section.keywords.some(keyword => 
        content.toLowerCase().includes(keyword.toLowerCase())
      )
      if (presente) {
        sectionsPresentes.push(section.nom)
      } else {
        sectionsManquantes.push(section.nom)
      }
    }
    
    // Analyser la qualité du contenu
    const faiblesses: ReportAnalysis['faiblesses'] = []
    const forces: string[] = []
    
    if (mots < 500) {
      faiblesses.push({
        section: 'Général',
        probleme: 'Rapport trop court',
        suggestion: 'Développez chaque section avec plus de détails',
        priorite: 'haute',
      })
    } else if (mots > 2000) {
      forces.push('Rapport détaillé et complet')
    }
    
    if (listeItems === 0) {
      faiblesses.push({
        section: 'Structuration',
        probleme: 'Absence de listes structurées',
        suggestion: 'Utilisez des listes à puces pour améliorer la lisibilité',
        priorite: 'moyenne',
      })
    }
    
    if (!presenceTableaux && surveillance) {
      const ecarts = store.ecarts.filter(e => e.surveillance_id === surveillanceId)
      if (ecarts.length > 0) {
        faiblesses.push({
          section: 'Résultats',
          probleme: 'Absence de tableau des écarts',
          suggestion: 'Ajoutez un tableau récapitulatif des non-conformités',
          priorite: 'haute',
        })
      }
    }
    
    if (!presenceImages) {
      faiblesses.push({
        section: 'Preuves',
        probleme: 'Aucune image ou preuve visuelle',
        suggestion: 'Ajoutez des photos des constats terrain',
        priorite: 'basse',
      })
    }
    
    // Vérifier la présence d'une conclusion
    if (!content.toLowerCase().includes('conclusion')) {
      faiblesses.push({
        section: 'Conclusion',
        probleme: 'Section conclusion manquante',
        suggestion: 'Ajoutez une conclusion synthétisant les principales observations',
        priorite: 'haute',
      })
    }
    
    // Vérifier la présence de recommandations
    if (!content.toLowerCase().includes('recommandation') && !content.toLowerCase().includes('action')) {
      faiblesses.push({
        section: 'Recommandations',
        probleme: 'Aucune recommandation formulée',
        suggestion: 'Proposez des actions correctives concrètes',
        priorite: 'haute',
      })
    }
    
    // Calculer le score (base 50 + bonus)
    let score = 50
    if (sectionsPresentes.length >= 4) score += 15
    if (sectionsPresentes.length >= 5) score += 10
    if (mots >= 800) score += 10
    if (listeItems >= 3) score += 10
    if (presenceTableaux) score += 5
    if (presenceImages) score += 5
    if (!content.includes('[À compléter]') && !content.includes('...')) score += 5
    
    score = Math.min(100, Math.max(0, score))
    
    let grade: ReportAnalysis['grade'] = 'moyen'
    if (score >= 85) grade = 'excellent'
    else if (score >= 70) grade = 'bon'
    else if (score >= 50) grade = 'moyen'
    else if (score >= 30) grade = 'faible'
    else grade = 'insuffisant'
    
    // Générer des forces si peu nombreuses
    if (forces.length === 0 && score >= 60) {
      forces.push('Structure globale correcte')
    }
    if (presenceTableaux) forces.push('Utilisation de tableaux pertinents')
    if (listeItems >= 3) forces.push('Bonne structuration des informations')
    
    // Recommandations générales
    const recommandations: string[] = []
    if (sectionsManquantes.includes('RÉSUMÉ EXÉCUTIF')) {
      recommandations.push('Ajoutez un résumé exécutif pour synthétiser les points clés')
    }
    if (sectionsManquantes.includes('CONCLUSION')) {
      recommandations.push('Terminez par une conclusion avec des axes d\'amélioration')
    }
    if (score < 60) {
      recommandations.push('Utilisez l\'IA pour générer automatiquement les sections manquantes')
    }
    
    return {
      score,
      grade,
      sectionsPresentes,
      sectionsManquantes,
      faiblesses,
      forces,
      statistiques: {
        mots,
        caracteres,
        paragraphes,
        listeItems,
        presenceTableaux,
        presenceImages,
      },
      recommandations,
    }
  }

  private getGradeBadgeClass(grade: string): string {
    switch (grade) {
      case 'excellent': return 'success'
      case 'bon': return 'primary'
      case 'moyen': return 'warning'
      case 'faible': return 'danger'
      default: return 'neutral'
    }
  }

  // ============================================================
  // 4. SUGGÉRER DES AMÉLIORATIONS
  // ============================================================

  private async suggestImprovements(request: IAInstruction): Promise<IAResult> {
    const content = request.currentContent
    const analysis = await this.analyzeReportContent(content, request.surveillanceId)
    
    let suggestionHtml = '<div class="space-y-4">'
    
    suggestionHtml += `
      <div class="flex items-center gap-2">
        <div class="progress flex-1 h-2">
          <div class="progress-bar" style="width: ${analysis.score}%"></div>
        </div>
        <span class="text-sm font-medium">${analysis.score}%</span>
      </div>
    `
    
    if (analysis.faiblesses.length > 0) {
      suggestionHtml += `
        <div>
          <p class="font-semibold text-warning mb-2">⚠️ Points à améliorer</p>
          <div class="space-y-2">
            ${analysis.faiblesses.map(f => `
              <div class="p-2 bg-warning/10 rounded-lg border-l-4 border-warning">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-sm">${f.section}</span>
                  <span class="badge ${f.priorite === 'haute' ? 'danger' : f.priorite === 'moyenne' ? 'warning' : 'neutral'} text-[10px]">${f.priorite}</span>
                </div>
                <p class="text-sm mt-1">${f.probleme}</p>
                <p class="text-xs text-primary mt-1">💡 ${f.suggestion}</p>
                <button class="btn btn-sm btn-primary mt-2" onclick="applySuggestion('${f.section.replace(/'/g, "\\'")}', '${f.suggestion.replace(/'/g, "\\'")}')">
                  Appliquer
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `
    }
    
    if (analysis.sectionsManquantes.length > 0) {
      suggestionHtml += `
        <div>
          <p class="font-semibold text-info mb-2">📄 Sections recommandées</p>
          <div class="flex flex-wrap gap-2">
            ${analysis.sectionsManquantes.map(s => `
              <button class="btn btn-sm btn-secondary" onclick="addSection('${s.replace(/'/g, "\\'")}')">
                + Ajouter ${s.toLowerCase()}
              </button>
            `).join('')}
          </div>
        </div>
      `
    }
    
    suggestionHtml += `
      <div class="p-3 bg-success/10 rounded-lg">
        <p class="font-semibold text-success">✅ Actions rapides</p>
        <div class="flex flex-wrap gap-2 mt-2">
          <button class="btn btn-sm btn-success" onclick="improveAll()">
            Améliorer tout le rapport
          </button>
          <button class="btn btn-sm btn-primary" onclick="addTable()">
            + Ajouter tableau des écarts
          </button>
          <button class="btn btn-sm btn-primary" onclick="addConclusion()">
            + Ajouter conclusion
          </button>
        </div>
      </div>
    `
    
    suggestionHtml += '</div>'
    
    return {
      success: true,
      content: request.currentContent,
      suggestion: suggestionHtml,
      message: `${analysis.faiblesses.length} suggestion(s) d'amélioration`,
      confidence: 85,
    }
  }

  // ============================================================
  // 5. AMÉLIORER UN RAPPORT
  // ============================================================

  private async improveReport(request: IAInstruction): Promise<IAResult> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find((s: Surveillance) => s.id === request.surveillanceId)
    const aerodrome = store.aerodromes.find((a: Aerodrome) => a.id === surveillance?.aerodrome_id)

    // Amélioration par IA — reformulation complète ou ciblée
    const aiResult = await aiClient.call({
      systemPrompt: REPORT_SYSTEM_PROMPT,
      userMessage: `Améliore ce rapport de surveillance selon l'instruction suivante : "${request.instruction}"

Contexte : ${aerodrome?.code_oaci ?? ''} — ${surveillance?.type ?? ''} du ${surveillance?.date_debut ?? ''}

Rapport actuel :
${request.currentContent.substring(0, 3000)}

Retourne le rapport amélioré en HTML. Conserve la structure globale, améliore la qualité rédactionnelle, complète les sections incomplètes, renforce le vocabulaire réglementaire OACI/ANACIM.`,
      temperature: 0.4,
      maxTokens: 3000,
    })

    if (aiResult.ok && aiResult.content) {
      return { success: true, content: aiResult.content, message: 'Rapport amélioré par IA', confidence: 88 }
    }

    // Fallback local
    let improvedContent = request.currentContent
    const instruction = request.instruction.toLowerCase()
    const suggestions: string[] = []

    if (instruction.includes('résumé') || instruction.includes('synthèse')) {
      const summary = await this.generateSummary(request.surveillanceId)
      improvedContent = this.replaceOrAddSection(improvedContent, 'RÉSUMÉ EXÉCUTIF', summary)
      suggestions.push('Résumé exécutif mis à jour')
    }
    if (instruction.includes('recommandation')) {
      const recommendations = await this.generateRecommendations(request.surveillanceId)
      improvedContent = this.replaceOrAddSection(improvedContent, 'RECOMMANDATIONS', recommendations)
      suggestions.push('Recommandations mises à jour')
    }
    if (instruction.includes('conclusion')) {
      const conclusion = await this.generateConclusion(request.surveillanceId)
      improvedContent = this.replaceOrAddSection(improvedContent, 'CONCLUSION', conclusion)
      suggestions.push('Conclusion mise à jour')
    }

    return {
      success: true,
      content: improvedContent,
      message: suggestions.length > 0 ? `Améliorations appliquées : ${suggestions.join(', ')}` : 'Aucune amélioration spécifique appliquée',
      confidence: 70,
    }
  }

  // ============================================================
  // 6. AJOUTER DU CONTENU
  // ============================================================

  private async addContent(request: IAInstruction): Promise<IAResult> {
    let newContent = request.currentContent
    const instruction = request.instruction.toLowerCase()
    const addedElements: string[] = []

    if (instruction.includes('présence') || instruction.includes('fiche de présence')) {
      const presenceTable = await this.generatePresenceTable(request.surveillanceId)
      if (!newContent.includes('Fiches de présence')) {
        newContent += `\n\n## Fiches de présence\n\n${presenceTable}`
        addedElements.push('Fiches de présence')
      }
    }
    
    if (instruction.includes('écart') || instruction.includes('non-conformité')) {
      const ecartsTable = await this.generateEcartsTable(request.surveillanceId)
      if (!newContent.includes('Écarts identifiés')) {
        newContent += `\n\n## Écarts identifiés\n\n${ecartsTable}`
        addedElements.push('Tableau des écarts')
      } else {
        newContent = this.replaceOrAddSection(newContent, 'Écarts identifiés', ecartsTable)
        addedElements.push('Tableau des écarts mis à jour')
      }
    }
    
    if (instruction.includes('profil de risque') || instruction.includes('score')) {
      const riskProfile = await this.generateRiskProfile(request.surveillanceId)
      if (!newContent.includes('Profil de risque')) {
        newContent += `\n\n## Profil de risque\n\n${riskProfile}`
        addedElements.push('Profil de risque')
      }
    }
    
    if (instruction.includes('recommandation')) {
      const recommendations = await this.generateRecommendations(request.surveillanceId)
      if (!newContent.includes('RECOMMANDATIONS')) {
        newContent += `\n\n## Recommandations\n\n${recommendations}`
        addedElements.push('Section recommandations')
      }
    }
    
    if (instruction.includes('conclusion')) {
      const conclusion = await this.generateConclusion(request.surveillanceId)
      if (!newContent.toLowerCase().includes('conclusion')) {
        newContent += `\n\n## Conclusion\n\n${conclusion}`
        addedElements.push('Section conclusion')
      }
    }

    const message = addedElements.length > 0 
      ? `Ajout(s) effectué(s): ${addedElements.join(', ')}`
      : 'Aucun ajout spécifique demandé'

    return {
      success: true,
      content: newContent,
      message,
      confidence: 85,
    }
  }

  // ============================================================
  // 7. CHARGER UN RAPPORT (méthode publique pour l'UI)
  // ============================================================

  async loadReportFromHistory(surveillanceId: string, versionIndex?: number): Promise<string | null> {
    const history = this.history.get(surveillanceId)
    if (!history) return null
    if (versionIndex !== undefined && history[versionIndex]) {
      return history[versionIndex].content
    }
    return history[history.length - 1]?.content || null
  }

  getHistory(surveillanceId: string): { content: string; timestamp: string }[] {
    return this.history.get(surveillanceId) || []
  }

  restoreVersion(surveillanceId: string, versionIndex: number): string | null {
    const history = this.history.get(surveillanceId)
    if (!history || versionIndex >= history.length) return null
    return history[versionIndex].content
  }

  // ============================================================
  // 8. VERSIONING
  // ============================================================

  async saveVersion(rapportId: string, content: string, commentaire?: string): Promise<ReportVersion> {
    const versions = this.reportVersions.get(rapportId) || []
    const newVersionNumber = versions.length + 1
    
    // Détecter les changements par rapport à la version précédente
    let changes: string[] = []
    if (versions.length > 0) {
      const previousContent = versions[versions.length - 1].content
      changes = this.detectChanges(previousContent, content)
    }
    
    const newVersion: ReportVersion = {
      id: `ver-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      rapportId,
      version: newVersionNumber,
      content,
      createdAt: new Date().toISOString(),
      createdBy: 'system',
      commentaire: commentaire || `Version ${newVersionNumber}`,
      changes,
    }
    
    versions.push(newVersion)
    this.reportVersions.set(rapportId, versions)
    await this.saveVersionsToStorage()
    
    return newVersion
  }

  async getVersions(rapportId: string): Promise<ReportVersion[]> {
    return this.reportVersions.get(rapportId) || []
  }

  async restoreToVersion(rapportId: string, versionId: string): Promise<string | null> {
    const versions = this.reportVersions.get(rapportId)
    if (!versions) return null
    const version = versions.find(v => v.id === versionId)
    if (!version) return null
    return version.content
  }

  async compareVersions(request: IAInstruction): Promise<IAResult> {
    const versions = await this.getVersions(request.surveillanceId)
    if (versions.length < 2) {
      return {
        success: false,
        content: request.currentContent,
        message: 'Pas assez de versions pour comparer',
        confidence: 0,
      }
    }
    
    const latest = versions[versions.length - 1]
    const previous = versions[versions.length - 2]
    const changes = this.detectChanges(previous.content, latest.content)
    
    let diffHtml = `
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold">Comparaison v${previous.version} → v${latest.version}</h3>
          <span class="text-xs text-muted-foreground">${new Date(latest.createdAt).toLocaleString('fr-FR')}</span>
        </div>
        <div class="space-y-2">
          ${changes.map(c => `
            <div class="p-2 bg-role-primary-soft rounded-lg border-l-4 border-role-primary">
              <p class="text-sm">${c}</p>
            </div>
          `).join('')}
        </div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-secondary" onclick="restoreVersion('${previous.id}')">
            Restaurer v${previous.version}
          </button>
          <button class="btn btn-sm btn-primary" onclick="diffDetails()">
            Voir les détails
          </button>
        </div>
      </div>
    `
    
    return {
      success: true,
      content: request.currentContent,
      suggestion: diffHtml,
      message: `${changes.length} modification(s) détectée(s)`,
      confidence: 90,
    }
  }

  private detectChanges(oldContent: string, newContent: string): string[] {
    const changes: string[] = []
    
    // Simuler la détection de changements
    if (oldContent.length !== newContent.length) {
      const diffLength = newContent.length - oldContent.length
      changes.push(`${diffLength > 0 ? '+' : ''}${diffLength} caractères ${diffLength > 0 ? 'ajoutés' : 'supprimés'}`)
    }
    
    // Vérifier les sections ajoutées
    const oldSections: string[] = oldContent.match(/^## .+$/gm) || []
    const newSections: string[] = newContent.match(/^## .+$/gm) || []
    const addedSections = newSections.filter(s => !oldSections.includes(s))
    const removedSections = oldSections.filter(s => !newSections.includes(s))
    
    addedSections.forEach(s => changes.push(`Section ajoutée: ${s.replace('## ', '')}`))
    removedSections.forEach(s => changes.push(`Section supprimée: ${s.replace('## ', '')}`))
    
    return changes
  }

  // ============================================================
  // 8b. SUPPRESSION DE CONTENU
  // ============================================================

  private removeContent(request: IAInstruction): IAResult {
    const instruction = request.instruction.toLowerCase()
    let content = request.currentContent

    // Supprimer les placeholders et sections vides
    if (instruction.includes('placeholder') || instruction.includes('vide')) {
      content = content.replace(/\[.+?\]/g, '').replace(/\[À compléter\]/gi, '')
    }
    // Supprimer les doublons de lignes
    if (instruction.includes('doublon')) {
      const lines = content.split('\n')
      const unique = lines.filter((l, i) => lines.indexOf(l) === i)
      content = unique.join('\n')
    }
    // Supprimer une section spécifique nommée
    const sectionMatch = instruction.match(/section[s]?\s+"?([^"]+)"?/)
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim()
      const sectionRegex = new RegExp(`^#{1,3}\\s+${sectionName}[\\s\\S]*?(?=^#{1,3}\\s|$)`, 'gim')
      content = content.replace(sectionRegex, '')
    }

    return {
      success: true,
      content,
      message: 'Contenu supprimé',
      confidence: 80,
    }
  }

  // ============================================================
  // 9. GÉNÉRATION DE CONTENU SPÉCIFIQUE
  // ============================================================

  async generateReport(request: IAInstruction): Promise<IAResult> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find((s: Surveillance) => s.id === request.surveillanceId)

    if (!surveillance) {
      return { success: false, content: request.currentContent, message: `Surveillance ${request.surveillanceId} non trouvée`, confidence: 0 }
    }

    const aerodrome = store.aerodromes.find((a: Aerodrome) => a.id === surveillance.aerodrome_id)
    const profil = store.profilsRisque[surveillance.aerodrome_id]
    const checklistItems = store.checklistItems[request.surveillanceId] || []
    const ecarts = store.ecarts.filter((e: Ecart) => e.surveillance_id === request.surveillanceId)

    const saCount = checklistItems.filter((i: ChecklistItem) => i.resultat === 'SA').length
    const nsCount = checklistItems.filter((i: ChecklistItem) => i.resultat === 'NS').length
    const nvCount = checklistItems.filter((i: ChecklistItem) => i.resultat === 'NV' || !i.resultat).length
    const tauxConformite = checklistItems.length > 0 ? Math.round((saCount / (saCount + nsCount + nvCount || 1)) * 100) : 0
    const ecartsCritiques = ecarts.filter((e: Ecart) => e.niveau_risque === 'critique')

    let templateId = request.templateId || 'template_standard'
    if (request.instruction.includes('rapide')) templateId = 'template_rapide'
    if (request.instruction.includes('détaillé') || request.instruction.includes('complet')) templateId = 'template_detaille'

    const template = TEMPLATES[templateId]
    if (!template) {
      return { success: false, content: request.currentContent, message: `Template ${templateId} non trouvé`, confidence: 0 }
    }

    // Contexte pour l'IA
    const reportContext = {
      aerodrome: aerodrome ? `${aerodrome.code_oaci} — ${aerodrome.nom}` : 'N/A',
      type_surveillance: surveillance.type,
      date_debut: surveillance.date_debut,
      date_fin: surveillance.date_fin,
      statut: surveillance.statut,
      taux_conformite: tauxConformite,
      total_items: checklistItems.length,
      sa: saCount, ns: nsCount, nv: nvCount,
      ecarts_total: ecarts.length,
      ecarts_critiques: ecartsCritiques.length,
      profil_score: profil?.score_global,
      profil_niveau: profil?.niveau,
      profil_tendance: profil?.tendance,
    }

    // Générer les sections auto localement + section résumé/recommandations par IA
    const generatedSections = await Promise.all(
      template.sections.map(async (section) => {
        if (!section.auto) return section

        // Sections narratives → IA
        if (['resume_executif', 'recommandations', 'conclusion', 'analyse_nc', 'preoccupations'].includes(section.id)) {
          const sectionContent = await this.generateSectionWithAI(section.id, section.titre, reportContext, ecartsCritiques)
          return { ...section, contenu: sectionContent }
        }

        // Sections structurelles → local
        const generatedContent = await this.generateSectionContent(section.id, surveillance, aerodrome, profil, checklistItems, ecarts)
        return { ...section, contenu: generatedContent }
      })
    )

    const content = generatedSections.map(s => s.contenu).join('\n\n')

    return {
      success: true,
      content,
      message: `Rapport généré avec IA (template: ${templateId}, taux conformité: ${tauxConformite}%)`,
      confidence: 90,
    }
  }

  private async generateSectionWithAI(
    sectionId: string,
    sectionTitre: string,
    context: Record<string, any>,
    ecartsCritiques: Ecart[]
  ): Promise<string> {
    const sectionGuide: Record<string, string> = {
      resume_executif: 'Rédigez un résumé exécutif de 2-3 paragraphes synthétisant les résultats de la surveillance.',
      recommandations: 'Listez les recommandations prioritaires basées sur les résultats.',
      conclusion: 'Rédigez une conclusion avec le bilan et les perspectives.',
      analyse_nc: 'Analysez les non-conformités constatées et leurs implications.',
      preoccupations: 'Identifiez les préoccupations de sécurité principales.',
    }

    const guide = sectionGuide[sectionId] ?? `Rédigez la section "${sectionTitre}".`

    const aiResult = await aiClient.call({
      systemPrompt: REPORT_SYSTEM_PROMPT,
      userMessage: `${guide}

Données de la surveillance :
${JSON.stringify(context, null, 2)}
${ecartsCritiques.length > 0 ? `\nÉcarts critiques :\n${ecartsCritiques.slice(0, 5).map((e: Ecart) => `- ${e.libelle?.substring(0, 100)}`).join('\n')}` : ''}

Retourne uniquement le contenu HTML de la section (utilisez <h3>, <p>, <ul>, <li>, <strong>).`,
      temperature: 0.4,
      maxTokens: 800,
    })

    return aiResult.ok ? aiResult.content : ''
  }

  private async generateSectionContent(
    sectionId: string,
    surveillance: Surveillance,
    aerodrome?: Aerodrome,
    profil?: ProfilRisque,
    checklistItems?: ChecklistItem[],
    ecarts?: Ecart[]
  ): Promise<string> {
    switch (sectionId) {
      case 'page_garde':
        return this.generatePageGarde(surveillance, aerodrome)
      case 'equipe_inspection':
        return this.generateEquipeInspection(surveillance.id)
      case 'resultats':
        return this.generateResults(surveillance.id)
      case 'annexes':
        return this.generateAnnexes(surveillance, aerodrome, profil, ecarts)
      case 'resume_executif':
        return this.generateSummary(surveillance.id)
      case 'recommandations':
        return this.generateRecommendations(surveillance.id)
      case 'conclusion':
        return this.generateConclusion(surveillance.id)
      default:
        return ''
    }
  }

  private async generateResults(surveillanceId: string): Promise<string> {
    const store = useAppStore.getState()
    const checklistItems = store.checklistItems[surveillanceId] || []
    
    const saCount = checklistItems.filter(i => i.resultat === 'SA').length
    const nsCount = checklistItems.filter(i => i.resultat === 'NS').length
    const nvCount = checklistItems.filter(i => i.resultat === 'NV' || !i.resultat).length
    const naCount = checklistItems.filter(i => i.resultat === 'NA').length
    const total = checklistItems.length
    const denominator = saCount + nsCount + nvCount
    const tauxConformite = denominator > 0 ? Math.round((saCount / denominator) * 100) : 0
    
    let html = `
      <div>
        <h3>Synthèse des constats</h3>
        <ul>
          <li>Satisfaisant (SA): ${saCount}</li>
          <li>Non satisfaisant (NS): ${nsCount}</li>
          <li>Non vérifié (NV): ${nvCount}</li>
          <li>Non applicable (NA): ${naCount}</li>
          <li><strong>Taux de conformité: ${tauxConformite}%</strong></li>
        </ul>
        <div class="progress h-2 mt-2">
          <div class="progress-bar" style="width: ${tauxConformite}%; background-color: ${tauxConformite >= 70 ? '#10b981' : tauxConformite >= 50 ? '#f59e0b' : '#ef4444'}"></div>
        </div>
      </div>
    `
    return html
  }

  private async generateSummary(surveillanceId: string): Promise<string> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find(s => s.id === surveillanceId)
    const checklistItems = store.checklistItems[surveillanceId] || []
    const ecarts = store.ecarts.filter(e => e.surveillance_id === surveillanceId)
    
    const saCount = checklistItems.filter(i => i.resultat === 'SA').length
    const nsCount = checklistItems.filter(i => i.resultat === 'NS').length
    const total = checklistItems.length
    const tauxConformite = total > 0 ? Math.round((saCount / (saCount + nsCount)) * 100) : 0
    
    let summary = `<p>La surveillance de l'aérodrome a révélé un taux de conformité de ${tauxConformite}%.</p>`
    
    if (nsCount === 0) {
      summary += '<p>Aucune non-conformité n\'a été identifiée. L\'exploitant maintient un niveau de sécurité satisfaisant.</p>'
    } else if (nsCount <= 3) {
      summary += `<p>${nsCount} non-conformité(s) mineure(s) ont été identifiées. L'exploitant doit mettre en place les actions correctives proposées.</p>`
    } else {
      summary += `<p>${nsCount} non-conformités significatives ont été identifiées. Un suivi renforcé est recommandé.</p>`
    }
    
    if (ecarts.length > 0) {
      summary += `<p>${ecarts.length} écart(s) ont été ouverts pour suivi.</p>`
    }
    
    return summary
  }

  private async generateRecommendations(surveillanceId: string): Promise<string> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find(s => s.id === surveillanceId)
    const checklistItems = store.checklistItems[surveillanceId] || []
    const ecarts = store.ecarts.filter(e => e.surveillance_id === surveillanceId)
    const profil = surveillance ? store.profilsRisque[surveillance.aerodrome_id] : null
    
    const recommendations: string[] = []
    
    if (ecarts.length > 0) {
      recommendations.push(`Traiter les ${ecarts.length} écart(s) identifié(s) dans les délais impartis`)
      const critiques = ecarts.filter(e => e.niveau_risque === 'critique')
      if (critiques.length > 0) {
        recommendations.push(`Priorité absolue: Traiter les ${critiques.length} écart(s) critique(s)`)
      }
    }
    
    if (profil && profil.c1 < 50) {
      recommendations.push('Renforcer le Système de Gestion de la Sécurité (SGS)')
    }
    
    if (profil && profil.tendance === 'baisse') {
      recommendations.push('Inverser la tendance à la dégradation par des actions correctives ciblées')
    }
    
    if (recommendations.length === 0) {
      recommendations.push('Maintenir les bonnes pratiques observées')
      recommendations.push('Poursuivre la surveillance programmée')
    }
    
    let html = '<ul>'
    for (const rec of recommendations) {
      html += `<li>${rec}</li>`
    }
    html += '</ul>'
    
    return html
  }

  private async generateConclusion(surveillanceId: string): Promise<string> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find(s => s.id === surveillanceId)
    const checklistItems = store.checklistItems[surveillanceId] || []
    const ecarts = store.ecarts.filter(e => e.surveillance_id === surveillanceId)
    
    const nsCount = checklistItems.filter(i => i.resultat === 'NS').length
    const ecartsOuverts = ecarts.filter(e => e.statut !== 'cloture').length
    
    if (nsCount === 0 && ecartsOuverts === 0) {
      return '<p>La surveillance n\'a révélé aucune non-conformité. L\'exploitant maintient un niveau de sécurité satisfaisant. Prochaine surveillance recommandée dans 12 mois.</p>'
    } else if (nsCount <= 3 && ecartsOuverts <= 2) {
      return '<p>Des non-conformités mineures ont été identifiées. L\'exploitant doit mettre en place les actions correctives proposées. Prochaine surveillance recommandée dans 6 mois.</p>'
    } else {
      return '<p>Des non-conformités significatives ont été identifiées. Un suivi renforcé est recommandé. Prochaine surveillance recommandée dans 3 mois.</p>'
    }
  }

  private async generatePresenceTable(surveillanceId: string): Promise<string> {
    const store = useAppStore.getState()
    try {
      const fiches = (store as any).getFichesPresenceBySurveillance?.(surveillanceId) || []
      if (fiches.length === 0) {
        return '<p>Aucune fiche de présence disponible</p>'
      }
      
      let html = '<table class="table">'
      html += '<thead><tr><th>Nom</th><th>Structure</th><th>Fonction</th><th>Signature</th></tr></thead><tbody>'
      for (const f of fiches) {
        html += `<tr>
          <td>${f.prenom_nom}</td>
          <td>${f.structure}</td>
          <td>${f.fonction || '-'}</td>
          <td>${f.signature_url ? '✅ Signé' : '❌ Non signé'}</td>
        </tr>`
      }
      html += '</tbody></table>'
      return html
    } catch (e) {
      return '<p>Erreur lors du chargement des fiches de présence</p>'
    }
  }

  private async generateEcartsTable(surveillanceId: string): Promise<string> {
    const store = useAppStore.getState()
    const ecarts = store.ecarts.filter(e => e.surveillance_id === surveillanceId)
    
    if (ecarts.length === 0) {
      return '<p>Aucun écart constaté</p>'
    }
    
    let html = '<table class="table">'
    html += '<thead><tr><th>Référence</th><th>Libellé</th><th>Niveau</th><th>Statut</th></tr></thead><tbody>'
    for (const e of ecarts) {
      html += `<tr>
        <td class="code-oaci-badge">${e.reference}</td>
        <td>${e.libelle}</td>
        <td><span class="badge ${e.niveau_risque === 'critique' ? 'danger' : e.niveau_risque === 'eleve' ? 'warning' : 'primary'}">${e.niveau_risque}</span></td>
        <td>${e.statut}</td>
      </tr>`
    }
    html += '</tbody></table>'
    return html
  }

  private async generateRiskProfile(surveillanceId: string): Promise<string> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find(s => s.id === surveillanceId)
    const profil = surveillance ? store.profilsRisque[surveillance.aerodrome_id] : null
    
    if (!profil) {
      return '<p>Profil de risque non disponible</p>'
    }
    
    return `
      <div>
        <p><strong>Score global:</strong> ${profil.score_global}/100</p>
        <p><strong>Niveau:</strong> ${profil.niveau}</p>
        <p><strong>Tendance:</strong> ${profil.tendance === 'hausse' ? '📈 Hausse' : profil.tendance === 'baisse' ? '📉 Baisse' : '➡️ Stable'}</p>
        <div class="progress h-2 mt-2">
          <div class="progress-bar" style="width: ${profil.score_global}%"></div>
        </div>
        <ul class="mt-2">
          <li>C1 (SGS): ${profil.c1}/100</li>
          <li>C2 (PAC): ${profil.c2}/100</li>
          <li>C3 (Conformité): ${profil.c3}/100</li>
          <li>C4 (Charge critique): ${profil.c4}/100</li>
          <li>C5 (Résilience): ${profil.c5}/100</li>
        </ul>
      </div>
    `
  }

  private generatePageGarde(surveillance: Surveillance, aerodrome?: Aerodrome): string {
    const now = new Date()
    const numero = `SURV-${now.getFullYear()}-${surveillance.id.slice(-4)}`
    return `
      <div style="text-align: center; page-break-after: avoid;">
        <h1>ANACIM</h1>
        <h2>Agence Nationale de l'Aviation Civile du Sénégal</h2>
        <h3>Direction de la Sécurité des Aérodromes</h3>
        <hr />
        <h1>RAPPORT DE SURVEILLANCE</h1>
        <p><strong>Réf:</strong> ${numero}</p>
        <table style="margin: 20px auto;">
          <tr><td><strong>Aérodrome:</strong></td><td>${aerodrome?.nom || 'N/A'} (${aerodrome?.code_oaci || 'N/A'})</td></tr>
          <tr><td><strong>Date:</strong></td><td>${new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}</td></tr>
          <tr><td><strong>Type:</strong></td><td>${surveillance.type || 'Programmée'}</td></tr>
        </table>
        <p><em>Document confidentiel - ANACIM</em></p>
      </div>
    `
  }

  private async generateEquipeInspection(surveillanceId: string): Promise<string> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find(s => s.id === surveillanceId)
    const userIds = surveillance?.equipe_ids || []
    const utilisateurs = userIds.map(id => store.utilisateurs.find(u => u.id === id)).filter(Boolean)
    
    if (utilisateurs.length === 0) {
      return '<p>Aucune équipe assignée</p>'
    }
    
    let html = '<table class="table">'
    html += '<thead><tr><th>Nom</th><th>Fonction</th><th>Rôle</th></tr></thead><tbody>'
    for (const u of utilisateurs) {
      html += `<tr>
        <td>${u?.prenom} ${u?.nom}</td>
        <td>${u?.service || '-'}</td>
        <td>${u?.role === 'chef_equipe' ? 'Chef d\'équipe' : 'Inspecteur'}</td>
      </tr>`
    }
    html += '</tbody></table>'
    return html
  }

  private generateAnnexes(surveillance: Surveillance, aerodrome?: Aerodrome, profil?: ProfilRisque, ecarts?: Ecart[]): string {
    let html = '<div><h3>Annexe A-1: Fiches de présence</h3><p>Voir document séparé</p>'
    html += '<h3>Annexe A-2: Écarts constatés</h3>'
    if (ecarts && ecarts.length > 0) {
      html += '<ul>'
      for (const e of ecarts) {
        html += `<li><strong>${e.reference}</strong>: ${e.libelle} (${e.niveau_risque})</li>`
      }
      html += '</ul>'
    } else {
      html += '<p>Aucun écart constaté</p>'
    }
    html += `<h3>Annexe A-3: Profil de risque</h3>
      <p>Score global: ${profil?.score_global || 'N/A'}/100</p>
      <p>Niveau: ${profil?.niveau || 'N/A'}</p>
      <p>Tendance: ${profil?.tendance || 'stable'}</p>`
    html += '<h3>Annexe A-4: Documents techniques</h3><p>Voir fichiers joints</p>'
    html += '</div>'
    return html
  }

  // ============================================================
  // 10. UTILITAIRES
  // ============================================================

  private replaceOrAddSection(content: string, sectionTitle: string, newContent: string): string {
    const sectionPattern = new RegExp(`(## ${sectionTitle}[\\s\\S]*?)(?=\\n##|$)`, 'i')
    const newSection = `## ${sectionTitle}\n\n${newContent}`
    
    if (sectionPattern.test(content)) {
      return content.replace(sectionPattern, newSection)
    }
    return content + `\n\n${newSection}`
  }

  private simplifyLanguage(content: string): string {
    return content
      .replace(/par conséquent/g, 'donc')
      .replace(/néanmoins/g, 'mais')
      .replace(/cependant/g, 'cependant')
      .replace(/afin de/g, 'pour')
      .replace(/en outre/g, 'aussi')
      .replace(/de surcroît/g, 'en plus')
  }

  private professionalizeLanguage(content: string): string {
    return content
      .replace(/donc/g, 'par conséquent')
      .replace(/mais/g, 'néanmoins')
      .replace(/pour/g, 'afin de')
      .replace(/aussi/g, 'en outre')
      .replace(/en plus/g, 'de surcroît')
  }

  private saveToHistory(surveillanceId: string, content: string): void {
    const history = this.history.get(surveillanceId) || []
    history.push({
      content,
      timestamp: new Date().toISOString(),
    })
    if (history.length > 50) history.shift()
    this.history.set(surveillanceId, history)
  }

  private async saveVersionsToStorage(): Promise<void> {
    try {
      const versionsObj: Record<string, ReportVersion[]> = {}
      this.reportVersions.forEach((value, key) => {
        versionsObj[key] = value
      })
      localStorage.setItem('sgda_report_versions', JSON.stringify(versionsObj))
    } catch (error) {
      console.error('[ReportAgent] Erreur sauvegarde versions:', error)
    }
  }

  private async loadVersionsFromStorage(): Promise<void> {
    try {
      const saved = localStorage.getItem('sgda_report_versions')
      if (saved) {
        const versionsObj = JSON.parse(saved)
        for (const [key, value] of Object.entries(versionsObj)) {
          this.reportVersions.set(key, value as ReportVersion[])
        }
      }
    } catch (error) {
      console.error('[ReportAgent] Erreur chargement versions:', error)
    }
  }

  isReady(): boolean {
    return this.initialized
  }
}

export const reportAgent = new ReportAgent()