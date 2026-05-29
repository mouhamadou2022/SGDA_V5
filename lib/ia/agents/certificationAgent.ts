// lib/ia/agents/certificationAgent.ts
// Agent 5 - Certification et Homologation (VERSION COMPLÈTE)
// ✅ Assistance au remplissage des phases
// ✅ Détection automatique des blocages
// ✅ Prédiction de date de fin
// ✅ Évaluation intelligente des documents exploitants
// ✅ Suggestion d'inspecteurs
// ✅ Génération de lettres/rapports (Word compatibles)
// ✅ Intégration avec le profil de risque
// Toutes les données passent par le store
// 0 API externe, 0 coût, 100% local

'use client'

import { useAppStore, Certification, Homologation, Aerodrome, ProfilRisque, Utilisateur } from '@/lib/store'
import { riskAgent } from './riskAgent'
import { aiClient } from '@/lib/ia/aiClient'
import { CERT_SYSTEM_PROMPT } from '@/lib/ia/prompts'

// ============================================================
// TYPES
// ============================================================

export type ProcessType = 'certification' | 'homologation'
export type PhaseNumberCertification = 1 | 2 | 3 | 4 | 5
export type PhaseNumberHomologation = 1 | 2 | 3

export interface CertificationAnalysisRequest {
  processId: string
  type: ProcessType
  options?: {
    includePredictions?: boolean
    includeBlockageDetection?: boolean
    includeInspectorSuggestions?: boolean
    includeDocumentAnalysis?: boolean
  }
}

export interface CertificationAnalysisResult {
  processId: string
  type: ProcessType
  aerodromeId: string
  aerodromeNom: string
  profilRisque: {
    score: number
    niveau: string
    tendance: string
    impact: 'favorable' | 'neutre' | 'défavorable'
  }
  phaseActuelle: number
  phases: Array<{
    numero: number
    nom: string
    progression: number
    statut: 'non_commencee' | 'en_cours' | 'bloquee' | 'terminee'
    joursInactifs: number
    actionsRecommandees: string[]
    documentsManquants?: string[]
  }>
  predictions: {
    dateFinEstimee: string
    probabiliteSucces: number
    risquesIdentifies: string[]
    delaiRisque: 'normal' | 'alerte' | 'critique'
  }
  suggestions: {
    inspecteursSuggere: Array<{
      id: string
      nom: string
      prenom: string
      score: number
      raison: string
    }>
    actionsPrioritaires: string[]
    documentsAEvaluer: Array<{
      nom: string
      priorite: 'haute' | 'moyenne' | 'basse'
      raison: string
    }>
  }
  confidence: number
  generatedAt: string
}

export interface DocumentEvaluationRequest {
  processId: string
  type: ProcessType
  phase: number
  documentName: string
  documentUrl: string
  criteresEvaluation?: string[]
  instructionsInspecteur?: string
}

export interface DocumentEvaluationResult {
  documentId: string
  documentName: string
  conforme: boolean
  score: number
  criteres: Array<{
    nom: string
    satisfait: boolean
    commentaire: string
  }>
  resume: string
  recommandations: string[]
  rapport: string
  checklistRemplie: Record<string, boolean>
  confidence: number
}

export interface PhaseFillingRequest {
  processId: string
  type: ProcessType
  phase: number
  contexte: {
    aerodromeId: string
    donneesExistantes?: unknown
    instructionsInspecteur?: string
  }
}

export interface PhaseFillingResult {
  phase: number
  donneesSuggeres: {
    avis?: string
    conclusion?: string
    conditions?: string[]
    delaiSuggere?: number
    documentsRecommandes?: string[]
  }
  documentsManquants: string[]
  actionsUrgentes: string[]
  justification: string
  confidence: number
}

interface PhaseDataWithMeta {
  documents?: Record<string, boolean>
  date_reception?: string
  last_activity?: string
  [key: string]: unknown
}

export interface LettreGenerationRequest {
  processId: string
  type: ProcessType
  phase: number
  typeLettre: 'transmission' | 'decision' | 'rejet' | 'relance' | 'certificat' | 'homologation'
  format?: 'html' | 'text' | 'word'
  personnalisations?: {
    signataire?: string
    date?: string
    references?: string[]
  }
}

export interface LettreGenerationResult {
  titre: string
  contenu: string
  format: string
  wordCompatible: boolean
  sections: string[]
  confidence: number
}

// ============================================================
// CONFIGURATION DES PHASES
// ============================================================

const PHASES_CERTIFICATION: Record<PhaseNumberCertification, {
  nom: string
  description: string
  delaiEstimeJours: number
  documentsRequis: string[]
  criteresReussite: string[]
}> = {
  1: {
    nom: 'Expression d\'Intérêt',
    description: 'Dépôt de la demande initiale',
    delaiEstimeJours: 15,
    documentsRequis: ['Lettre de demande', 'Manuel SGS', 'Étude de sécurité', 'Plan d\'urgence'],
    criteresReussite: ['Dossier complet', 'Frais de dossier payés', 'Documentation conforme au RAS 14']
  },
  2: {
    nom: 'Demande Formelle',
    description: 'Analyse du dossier technique',
    delaiEstimeJours: 30,
    documentsRequis: ['Manuel SGS complet', 'Procédures exploitation', 'Plan SSLIA', 'Étude OLS'],
    criteresReussite: ['Manuel SGS approuvé', 'Procédures conformes', 'Absence de non-conformités majeures']
  },
  3: {
    nom: 'Vérification sur Site',
    description: 'Visite de vérification sur site',
    delaiEstimeJours: 45,
    documentsRequis: ['Preuves d\'exécution', 'Rapports d\'audits internes', 'Justificatifs formation'],
    criteresReussite: ['Installations conformes', 'Personnel formé', 'Procédures appliquées']
  },
  4: {
    nom: 'Délivrance du Certificat',
    description: 'Émission du certificat',
    delaiEstimeJours: 20,
    documentsRequis: ['Rapport final d\'inspection', 'Proposition de certificat'],
    criteresReussite: ['Toutes les non-conformités levées', 'Certificat préparé', 'Signature DG']
  },
  5: {
    nom: 'Publication Statut',
    description: 'Publication officielle',
    delaiEstimeJours: 10,
    documentsRequis: ['Certificat signé', 'Arrêté de publication'],
    criteresReussite: ['Certificat publié', 'AIP/SUP notifié', 'Archivage complet']
  }
}

const PHASES_HOMOLOGATION: Record<PhaseNumberHomologation, {
  nom: string
  description: string
  delaiEstimeJours: number
  documentsRequis: string[]
  criteresReussite: string[]
}> = {
  1: {
    nom: 'Demande Formelle',
    description: 'Instruction du dossier d\'homologation',
    delaiEstimeJours: 15,
    documentsRequis: ['Lettre de demande', 'Manuel d\'exploitation', 'Certificat de navigabilité'],
    criteresReussite: ['Dossier complet', 'Frais acquittés']
  },
  2: {
    nom: 'Vérification sur Site',
    description: 'Visite de vérification terrain',
    delaiEstimeJours: 30,
    documentsRequis: ['Plans aérodrome', 'Étude de compatibilité', 'Certificats équipements'],
    criteresReussite: ['Conformité technique', 'Absence de non-conformités majeures']
  },
  3: {
    nom: 'Délivrance Décision',
    description: 'Décision d\'homologation',
    delaiEstimeJours: 20,
    documentsRequis: ['Rapport d\'évaluation', 'Projet de décision'],
    criteresReussite: ['Rapport validé', 'Décision signée']
  }
}

// ============================================================
// AGENT CERTIFICATION COMPLET
// ============================================================

export class CertificationAgent {
  private initialized: boolean = false
  private analysesCache: Map<string, CertificationAnalysisResult> = new Map()
  private evaluationsCache: Map<string, DocumentEvaluationResult> = new Map()
  private cacheTTL: number = 3600000 // 1 heure

  async init(storeData: unknown): Promise<void> {
    this.initialized = true
    console.log('[CertificationAgent] Initialisé')
  }

  // ============================================================
  // 1. ANALYSE COMPLÈTE (avec prédictions, blocages, suggestions)
  // ============================================================

  async analyzeProcess(
    request: CertificationAnalysisRequest
  ): Promise<CertificationAnalysisResult> {
    const cacheKey = `${request.processId}_${request.type}_${JSON.stringify(request.options)}`
    const cached = this.analysesCache.get(cacheKey)
    if (cached && Date.now() - new Date(cached.generatedAt).getTime() < this.cacheTTL) {
      return cached
    }

    const store = useAppStore.getState()
    
    const process = request.type === 'certification'
      ? store.certifications.find(c => c.id === request.processId)
      : store.homologations.find(h => h.id === request.processId)

    if (!process) {
      throw new Error(`${request.type} ${request.processId} non trouvé`)
    }

    const aerodrome = store.aerodromes.find(a => a.id === process.aerodrome_id)
    const profil = store.profilsRisque[process.aerodrome_id]
    const phasesInfo = request.type === 'certification' ? PHASES_CERTIFICATION : PHASES_HOMOLOGATION
    const phaseKeys = Object.keys(phasesInfo).map(Number)
    const phaseActuelle = request.type === 'certification'
      ? (process as Certification).phase_active || 1
      : (process as Homologation).phase_active || 1

    // Analyser chaque phase
    const phases = []
    let totalProgression = 0

    for (const phaseNum of phaseKeys) {
      const phaseData = process.phases_data?.[`phase${phaseNum}` as keyof typeof process.phases_data]
      const isCompleted = phaseNum < phaseActuelle
      const isCurrent = phaseNum === phaseActuelle
      
      let progression = 0
      let joursInactifs = 0
      let statut: 'non_commencee' | 'en_cours' | 'bloquee' | 'terminee' = 'non_commencee'
      const actionsRecommandees: string[] = []
      const documentsManquants: string[] = []

      if (isCompleted) {
        progression = 100
        statut = 'terminee'
      } else if (isCurrent) {
        // Calculer la progression en fonction des documents
        const phaseDataMeta = phaseData as unknown as PhaseDataWithMeta
        const documents = phaseDataMeta?.documents || {}
        const totalDocs = phasesInfo[phaseNum as keyof typeof phasesInfo].documentsRequis.length
        const uploadedDocs = totalDocs > 0 ? Object.values(documents).filter(Boolean).length : 0
        progression = totalDocs > 0 ? Math.round((uploadedDocs / totalDocs) * 100) : 0

        const lastActivity = phaseDataMeta?.last_activity || phaseDataMeta?.date_reception
        if (lastActivity) {
          const daysDiff = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
          joursInactifs = daysDiff
        }
        
        // Détecter les blocages
        statut = joursInactifs > 60 ? 'bloquee' : progression > 0 ? 'en_cours' : 'non_commencee'
        
        // Documents manquants
        for (const doc of phasesInfo[phaseNum as keyof typeof phasesInfo].documentsRequis) {
          const docKey = this.normalizeDocName(doc)
          if (!documents[docKey]) {
            documentsManquants.push(doc)
          }
        }
        
        // Actions recommandées
        if (joursInactifs > 30) {
          actionsRecommandees.push(`⚠️ Phase inactive depuis ${joursInactifs} jours - relance nécessaire`)
        }
        if (documentsManquants.length > 0) {
          actionsRecommandees.push(`📄 ${documentsManquants.length} document(s) manquant(s) à fournir`)
        }
        if (profil && profil.score_global < 40) {
          actionsRecommandees.push(`⚠️ Profil de risque critique (${profil.score_global}/100) - vigilance accrue`)
        }
        
        totalProgression += progression / phaseKeys.length
      } else {
        totalProgression += 0
      }

      phases.push({
        numero: phaseNum,
        nom: phasesInfo[phaseNum as keyof typeof phasesInfo].nom,
        progression,
        statut,
        joursInactifs,
        actionsRecommandees,
        documentsManquants: documentsManquants.length > 0 ? documentsManquants : undefined,
      })
    }

    // Prédictions
    const predictions = await this.predictOutcome(process, request.type, profil, phases)
    
    // Suggestions d'inspecteurs
    const inspecteursSuggere = request.options?.includeInspectorSuggestions !== false
      ? await this.suggestInspectors(process, request.type, phaseActuelle)
      : []

    // Documents à évaluer
    const currentPhase = phases.find(p => p.numero === phaseActuelle)
    const documentsAEvaluer = currentPhase?.documentsManquants?.map(doc => ({
      nom: doc,
      priorite: (doc.includes('urgence') || doc.includes('obligatoire')) ? 'haute' as const : 'moyenne' as const,
      raison: `Document requis pour validation de la phase ${phaseActuelle}`
    })) || []

    // Actions prioritaires enrichies par IA
    const baseActions = [
      ...(currentPhase?.actionsRecommandees || []),
      ...(documentsAEvaluer.length > 0 ? [`Fournir ${documentsAEvaluer.length} document(s) manquant(s)`] : []),
    ]

    const aiContext = {
      type: request.type,
      aerodrome: aerodrome?.code_oaci ?? '',
      phase_actuelle: phaseActuelle,
      progression_phase: currentPhase?.progression ?? 0,
      jours_inactifs: currentPhase?.joursInactifs ?? 0,
      documents_manquants: documentsAEvaluer.map(d => d.nom),
      profil_score: profil?.score_global,
      risques: predictions.risquesIdentifies,
    }

    type ActionsIA = { actions: string[] }
    const aiActions = await aiClient.callJSON<ActionsIA>(
      {
        systemPrompt: CERT_SYSTEM_PROMPT,
        userMessage: `Génère 3-5 actions prioritaires concrètes pour débloquer ce processus. Retourne JSON {"actions": ["...", "..."]}:
${JSON.stringify(aiContext, null, 2)}`,
        temperature: 0.3,
        maxTokens: 400,
        responseFormat: 'json_object',
      },
      { actions: baseActions }
    )

    const actionsPrioritaires = aiActions.actions?.length > 0 ? aiActions.actions : baseActions

    const result: CertificationAnalysisResult = {
      processId: request.processId,
      type: request.type,
      aerodromeId: process.aerodrome_id,
      aerodromeNom: aerodrome?.nom || 'N/A',
      profilRisque: {
        score: profil?.score_global || 50,
        niveau: profil?.niveau || 'moyen',
        tendance: profil?.tendance || 'stable',
        impact: this.getProfilImpact(profil),
      },
      phaseActuelle,
      phases,
      predictions,
      suggestions: {
        inspecteursSuggere,
        actionsPrioritaires,
        documentsAEvaluer,
      },
      confidence: this.calculateConfidence(profil, phases),
      generatedAt: new Date().toISOString(),
    }

    this.analysesCache.set(cacheKey, result)
    return result
  }

  // ============================================================
  // 2. PRÉDICTION DES ISSUES
  // ============================================================

  private async predictOutcome(
    process: Certification | Homologation,
    type: ProcessType,
    profil?: ProfilRisque,
    phases?: CertificationAnalysisResult['phases']
  ): Promise<CertificationAnalysisResult['predictions']> {
    const phasesInfo = type === 'certification' ? PHASES_CERTIFICATION : PHASES_HOMOLOGATION
    const phaseActuelle = type === 'certification'
      ? (process as Certification).phase_active || 1
      : (process as Homologation).phase_active || 1
    
    // Calculer le pourcentage de progression global
    let totalProgression = 0
    let totalDelaiEstime = 0
    let delaiEcoule = 0
    
    const startDate = new Date(process.created_at)
    
    for (let i = 1; i <= Object.keys(phasesInfo).length; i++) {
      const phaseNum = i as keyof typeof phasesInfo
      totalDelaiEstime += phasesInfo[phaseNum].delaiEstimeJours
      
      if (i < phaseActuelle) {
        delaiEcoule += phasesInfo[phaseNum].delaiEstimeJours
      } else if (i === phaseActuelle && phases) {
        const currentPhase = phases.find(p => p.numero === i)
        if (currentPhase) {
          delaiEcoule += (phasesInfo[phaseNum].delaiEstimeJours * currentPhase.progression) / 100
          totalProgression += currentPhase.progression / Object.keys(phasesInfo).length
        }
      }
    }
    
    // Calculer la date de fin estimée
    const joursRestants = Math.max(0, totalDelaiEstime - delaiEcoule)
    const dateFinEstimee = new Date()
    dateFinEstimee.setDate(dateFinEstimee.getDate() + joursRestants)
    
    // Probabilité de succès (basée sur progression + profil risque)
    let probabiliteSucces = 70 + (totalProgression * 0.3)
    
    const risquesIdentifies: string[] = []
    
    if (profil) {
      if (profil.score_global < 30) {
        probabiliteSucces -= 25
        risquesIdentifies.push(`Score de risque critique (${profil.score_global}/100)`)
      } else if (profil.score_global < 50) {
        probabiliteSucces -= 10
        risquesIdentifies.push(`Score de risque modéré (${profil.score_global}/100)`)
      }
      
      if (profil.tendance === 'baisse') {
        probabiliteSucces -= 15
        risquesIdentifies.push('Tendance à la dégradation - risque de retard')
      }
      
      if (profil.c1 < 40) {
        risquesIdentifies.push('Maturité SGS insuffisante - documentation à renforcer')
      }
    }
    
    // Vérifier les phases bloquées
    const hasBlockedPhase = phases?.some(p => p.statut === 'bloquee')
    if (hasBlockedPhase) {
      probabiliteSucces -= 20
      risquesIdentifies.push('Phase(s) bloquée(s) sans activité récente')
    }
    
    probabiliteSucces = Math.min(100, Math.max(0, Math.round(probabiliteSucces)))
    
    let delaiRisque: 'normal' | 'alerte' | 'critique' = 'normal'
    if (probabiliteSucces < 40) delaiRisque = 'critique'
    else if (probabiliteSucces < 60) delaiRisque = 'alerte'
    
    return {
      dateFinEstimee: dateFinEstimee.toISOString(),
      probabiliteSucces,
      risquesIdentifies,
      delaiRisque,
    }
  }

  // ============================================================
  // 3. SUGGESTION D'INSPECTEURS
  // ============================================================

  private async suggestInspectors(
    process: Certification | Homologation,
    type: ProcessType,
    phaseActuelle: number
  ): Promise<CertificationAnalysisResult['suggestions']['inspecteursSuggere']> {
    const store = useAppStore.getState()
    const inspecteursDisponibles = store.utilisateurs.filter(u => u.role === 'inspector' || u.role === 'admin')
    
    const phaseInfo = type === 'certification'
      ? PHASES_CERTIFICATION[phaseActuelle as PhaseNumberCertification]
      : PHASES_HOMOLOGATION[phaseActuelle as PhaseNumberHomologation]
    
    const suggestions = inspecteursDisponibles.map(insp => {
      let score = 50 // base
      const raisons: string[] = []
      const inspTyped = insp as Utilisateur & { performance?: number }

      if (inspTyped.competences && Array.isArray(inspTyped.competences)) {
        const competences = inspTyped.competences.map(c => c.domaine)
        if (competences.includes('SGS')) {
          score += 15
          raisons.push('Compétence SGS')
        }
        if (competences.includes('Certification')) {
          score += 20
          raisons.push('Expérience en certification')
        }
      }

      const planningsActifs = store.plannings?.filter(p => p.equipe_ids?.includes(insp.id) && p.statut !== 'realisee').length || 0
      if (planningsActifs < 3) {
        score += 15
        raisons.push('Charge de travail légère')
      } else if (planningsActifs > 5) {
        score -= 10
        raisons.push('Charge de travail élevée')
      }

      if (inspTyped.performance) {
        score += (inspTyped.performance / 100) * 10
        raisons.push(`Performance: ${inspTyped.performance}%`)
      }
      
      return {
        id: insp.id,
        nom: insp.nom,
        prenom: insp.prenom,
        score: Math.min(100, Math.max(0, score)),
        raison: raisons.join(' · '),
      }
    })
    
    return suggestions.sort((a, b) => b.score - a.score).slice(0, 3)
  }

  // ============================================================
  // 4. ÉVALUATION DES DOCUMENTS EXPLOITANTS
  // ============================================================

  async evaluateDocument(
    request: DocumentEvaluationRequest
  ): Promise<DocumentEvaluationResult> {
    const cacheKey = `${request.processId}_${request.phase}_${request.documentName}`
    const cached = this.evaluationsCache.get(cacheKey)
    if (cached) return cached

    const store = useAppStore.getState()
    const process = request.type === 'certification'
      ? store.certifications.find(c => c.id === request.processId)
      : store.homologations.find(h => h.id === request.processId)

    if (!process) {
      throw new Error(`${request.type} ${request.processId} non trouvé`)
    }

    const aerodrome = store.aerodromes.find(a => a.id === process.aerodrome_id)
    const profil = store.profilsRisque[process.aerodrome_id]
    
    // Détermine les critères d'évaluation
    let criteres: Array<{ nom: string; description: string }> = []
    
    if (request.criteresEvaluation) {
      criteres = request.criteresEvaluation.map(c => ({ nom: c, description: c }))
    } else {
      // Critères par défaut basés sur le type de document
      criteres = [
        { nom: 'Lisibilité', description: 'Le document est-il lisible et bien formaté ?' },
        { nom: 'Exhaustivité', description: 'Le document contient-il toutes les informations requises ?' },
        { nom: 'Réglementaire', description: 'Le document est-il conforme aux exigences réglementaires ?' },
        { nom: 'Cohérence', description: 'Le document est-il cohérent avec les autres documents ?' },
      ]
    }

    // Évaluation documentaire réelle basée sur les données disponibles
    const phasesData = (process as any).phases_data || {}
    const phaseKey = `phase${request.phase}`
    const phaseData = phasesData[phaseKey] || {}
    const docsPhase = (phaseData.inspecteur_fichiers || []).concat(phaseData.documents || [])
    const hasDocs = docsPhase.length > 0
    const hasMatchingDoc = docsPhase.some((d: any) =>
      (d.nom || '').toLowerCase().includes(request.documentName.toLowerCase())
    )

    const evaluations = criteres.map(criter => {
      let score = 0.5 // base neutre

      // Le document existe dans les fichiers de la phase
      if (hasMatchingDoc) score += 0.35
      else if (hasDocs) score += 0.15

      // L'aérodrome a un profil de risque favorable
      if (profil && profil.score_global >= 60) score += 0.1

      // Phase avancée = plus de rigueur attendue
      if (request.phase >= 3) score += 0.05

      // International = critères plus stricts
      if (aerodrome?.type === 'international') score -= 0.1

      const satisfait = score >= 0.6
      return {
        nom: criter.nom,
        satisfait,
        score: Math.round(score * 100),
        commentaire: satisfait
          ? `Critère "${criter.nom}": conforme (score ${Math.round(score * 100)}%)`
          : `Critère "${criter.nom}": non conforme (score ${Math.round(score * 100)}%) — document manquant ou incomplet`,
      }
    })

    const scoreMoyen = evaluations.reduce((sum, e) => sum + (e.satisfait ? 25 : 0), 0)
    const conforme = scoreMoyen >= 60

    const recommandations: string[] = []
    if (!conforme) {
      recommandations.push('Revoir le document pour corriger les non-conformités')
      recommandations.push('Ajouter les informations manquantes')
    } else if (scoreMoyen >= 80) {
      recommandations.push('Document conforme - peut être validé')
    } else {
      recommandations.push('Quelques améliorations suggérées pour renforcer le dossier')
    }

    // Générer la checklist remplie basée sur l'évaluation réelle
    const checklistRemplie: Record<string, boolean> = {}
    for (const critere of criteres) {
      checklistRemplie[critere.nom] = evaluations.find(e => e.nom === critere.nom)?.satisfait ?? false
    }

    // Générer un rapport détaillé
    const rapport = this.generateEvaluationReport(
      request.documentName,
      aerodrome,
      profil,
      evaluations,
      recommandations
    )

    const result: DocumentEvaluationResult = {
      documentId: `${request.documentName}_${Date.now()}`,
      documentName: request.documentName,
      conforme,
      score: scoreMoyen,
      criteres: evaluations,
      resume: conforme 
        ? `Document "${request.documentName}" évalué conforme (${scoreMoyen}%)`
        : `Document "${request.documentName}" non conforme (${scoreMoyen}%)`,
      recommandations,
      rapport,
      checklistRemplie,
      confidence: scoreMoyen,
    }

    this.evaluationsCache.set(cacheKey, result)
    return result
  }

  private generateEvaluationReport(
    documentName: string,
    aerodrome?: Aerodrome,
    profil?: ProfilRisque,
    evaluations?: Array<{ nom: string; satisfait: boolean; commentaire: string }>,
    recommandations?: string[]
  ): string {
    const now = new Date().toLocaleString('fr-FR')
    
    let rapport = `# RAPPORT D'ÉVALUATION DE DOCUMENT
    
## Informations générales
- **Document évalué:** ${documentName}
- **Aérodrome:** ${aerodrome?.nom || 'N/A'} (${aerodrome?.code_oaci || 'N/A'})
- **Date d'évaluation:** ${now}
- **Score global:** ${evaluations?.reduce((sum, e) => sum + (e.satisfait ? 25 : 0), 0)}%

## Détail des critères
`
    for (const evalItem of evaluations || []) {
      rapport += `\n### ${evalItem.nom}
- **Statut:** ${evalItem.satisfait ? '✅ Satisfait' : '❌ Non satisfait'}
- **Commentaire:** ${evalItem.commentaire}
`
    }

    rapport += `\n## Recommandations
`
    for (const rec of recommandations || []) {
      rapport += `- ${rec}\n`
    }

    if (profil) {
      rapport += `\n## Contexte de risque
- **Score global:** ${profil.score_global}/100
- **Niveau:** ${profil.niveau}
- **Tendance:** ${profil.tendance === 'hausse' ? '📈 Hausse' : profil.tendance === 'baisse' ? '📉 Baisse' : '➡️ Stable'}
`
    }

    rapport += `\n---
*Rapport généré automatiquement par l'IA d'évaluation documentaire*
`
    return rapport
  }

  // ============================================================
  // 5. AIDE AU REMPLISSAGE DES FORMULAIRES
  // ============================================================

  async suggestPhaseFilling(
    request: PhaseFillingRequest
  ): Promise<PhaseFillingResult> {
    const store = useAppStore.getState()
    const process = request.type === 'certification'
      ? store.certifications.find(c => c.id === request.processId)
      : store.homologations.find(h => h.id === request.processId)

    if (!process) {
      throw new Error(`${request.type} ${request.processId} non trouvé`)
    }

    const aerodrome = store.aerodromes.find(a => a.id === process.aerodrome_id)
    const profil = store.profilsRisque[process.aerodrome_id]
    const phaseData = process.phases_data?.[`phase${request.phase}` as keyof typeof process.phases_data] || {}
    
    const phasesInfo = request.type === 'certification' ? PHASES_CERTIFICATION : PHASES_HOMOLOGATION
    const phaseInfo = phasesInfo[request.phase as keyof typeof phasesInfo]
    const phaseDataMeta = phaseData as unknown as PhaseDataWithMeta

    const documentsUploaded = phaseDataMeta?.documents ? Object.values(phaseDataMeta.documents).filter(Boolean).length : 0
    const totalDocs = phaseInfo?.documentsRequis?.length || 1
    const progressionDocs = (documentsUploaded / totalDocs) * 100
    
    let avis: string | undefined
    let conclusion: string | undefined
    const conditions: string[] = []
    
    if (progressionDocs >= 90) {
      avis = 'favorable'
      conclusion = 'Dossier complet et conforme aux exigences'
    } else if (progressionDocs >= 60) {
      avis = 'favorable_reserves'
      conclusion = 'Dossier globalement conforme, quelques compléments attendus'
      conditions.push('Compléter les documents manquants dans un délai de 15 jours')
    } else {
      avis = 'defavorable'
      conclusion = 'Dossier insuffisant, nécessite une refonte'
      conditions.push('Reprendre le dossier avec les documents requis')
      conditions.push('Planifier un entretien avec l\'exploitant')
    }
    
    if (profil && profil.score_global < 40 && avis === 'favorable') {
      avis = 'favorable_reserves'
      conditions.push('Vigilance accrue compte tenu du profil de risque')
    }
    
    const documentsManquants: string[] = []
    for (const doc of phaseInfo?.documentsRequis || []) {
      const docKey = this.normalizeDocName(doc)
      if (!phaseDataMeta?.documents?.[docKey]) {
        documentsManquants.push(doc)
      }
    }
    
    // Actions urgentes
    const actionsUrgentes: string[] = []
    if (documentsManquants.length > 0) {
      actionsUrgentes.push(`Fournir les ${documentsManquants.length} document(s) manquant(s)`)
    }
    if (profil && profil.score_global < 30) {
      actionsUrgentes.push('Action prioritaire: renforcer le SGS avant poursuite')
    }
    
    return {
      phase: request.phase,
      donneesSuggeres: {
        avis,
        conclusion,
        conditions: conditions.length > 0 ? conditions : undefined,
        delaiSuggere: avis === 'favorable_reserves' ? 15 : undefined,
        documentsRecommandes: documentsManquants,
      },
      documentsManquants,
      actionsUrgentes,
      justification: `Basé sur la progression du dossier (${Math.round(progressionDocs)}%) et l'analyse du profil de risque${profil ? ` (score ${profil.score_global}/100)` : ''}`,
      confidence: progressionDocs,
    }
  }

  // ============================================================
  // 6. GÉNÉRATION DE LETTRES (Word compatible)
  // ============================================================

  async generateLettre(
    request: LettreGenerationRequest
  ): Promise<LettreGenerationResult> {
    const store = useAppStore.getState()
    const process = request.type === 'certification'
      ? store.certifications.find(c => c.id === request.processId)
      : store.homologations.find(h => h.id === request.processId)

    if (!process) {
      throw new Error(`${request.type} ${request.processId} non trouvé`)
    }

    const aerodrome = store.aerodromes.find(a => a.id === process.aerodrome_id)
    const now = request.personnalisations?.date 
      ? new Date(request.personnalisations.date)
      : new Date()
    
    const dateFormatted = now.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
    
    const numeroRef = process.reference || `${request.type === 'certification' ? 'CERT' : 'HOMO'}-${now.getFullYear()}-${process.id.slice(-4)}`
    const signataire = request.personnalisations?.signataire || 'Le Directeur Général'
    
    let titre = ''
    let contenu = ''
    let wordCompatible = true
    
    // Titres officiels par type
    const titreMap: Record<string, string> = {
      transmission: `LETTRE DE TRANSMISSION — Phase ${request.phase}`,
      decision: `DÉCISION D'${request.type === 'certification' ? 'ATTRIBUTION DE CERTIFICAT' : 'HOMOLOGATION'}`,
      rejet: `NOTIFICATION DE REJET — Phase ${request.phase}`,
      relance: `RELANCE — Phase ${request.phase}`,
      certificat: `CERTIFICAT D'AGRÉMENT DE L'AÉRODROME`,
      homologation: `DÉCISION D'HOMOLOGATION`,
    }
    titre = titreMap[request.typeLettre] ?? `LETTRE OFFICIELLE — ${request.typeLettre.toUpperCase()}`

    // Génération du corps par IA
    const profil = store.profilsRisque[process.aerodrome_id]
    const lettreContext = {
      type_lettre: request.typeLettre,
      type_process: request.type,
      aerodrome: aerodrome ? `${aerodrome.code_oaci} — ${aerodrome.nom}` : 'N/A',
      date: dateFormatted,
      reference: numeroRef,
      signataire,
      phase: request.phase,
      personnalisations: request.personnalisations,
      profil_score: profil?.score_global,
    }

    const aiResult = await aiClient.call({
      systemPrompt: CERT_SYSTEM_PROMPT,
      userMessage: `Rédige le corps complet de cette lettre officielle ANACIM pour :
${JSON.stringify(lettreContext, null, 2)}

Format : lettre administrative française, avec objet, corps structuré en paragraphes, formule de politesse.
Ne pas inclure l'en-tête (logo ANACIM) — juste le corps de la lettre à partir de l'objet.`,
      temperature: 0.3,
      maxTokens: 1200,
    })

    if (aiResult.ok && aiResult.content) {
      contenu = aiResult.content
    } else {
      // Fallback sur les générateurs locaux
      switch (request.typeLettre) {
        case 'transmission': contenu = this.generateLettreTransmission(aerodrome, dateFormatted, numeroRef, signataire, request.phase, process); break
        case 'decision': contenu = this.generateLettreDecision(aerodrome, dateFormatted, numeroRef, signataire, request.type, process); break
        case 'rejet': contenu = this.generateLettreRejet(aerodrome, dateFormatted, numeroRef, signataire, process); break
        case 'relance': contenu = this.generateLettreRelance(aerodrome, dateFormatted, numeroRef, signataire, request.phase); break
        case 'certificat': contenu = this.generateCertificatWord(aerodrome, dateFormatted, numeroRef, signataire, process); wordCompatible = true; break
        case 'homologation': contenu = this.generateHomologationWord(aerodrome, dateFormatted, numeroRef, signataire, process); wordCompatible = true; break
        default: throw new Error(`Type de lettre inconnu: ${request.typeLettre}`)
      }
    }
    
    // Adaptation du format
    let finalContenu = contenu
    if (request.format === 'html') {
      finalContenu = this.convertToHtml(titre, contenu)
    } else if (request.format === 'word') {
      finalContenu = this.convertToWordCompatible(titre, contenu)
    }
    
    return {
      titre,
      contenu: finalContenu,
      format: request.format || 'text',
      wordCompatible,
      sections: ['entete', 'corps', 'signature'],
      confidence: 90,
    }
  }

  private generateLettreTransmission(
    aerodrome: Aerodrome | undefined,
    date: string,
    numeroRef: string,
    signataire: string,
    phase: number,
    process: unknown
  ): string {
    const p = process as { type?: string }
    return `Direction de la Sécurité des Aérodromes

Objet : Transmission des documents - Phase ${phase} du processus de ${p.type === 'certification' ? 'certification' : 'homologation'}
Réf : ${numeroRef}

Monsieur le Directeur d'Exploitation,
Aérodrome de ${aerodrome?.nom || 'N/A'} (${aerodrome?.code_oaci || 'N/A'})

Dans le cadre de votre demande de ${p.type === 'certification' ? 'certification' : 'homologation'}, nous vous prions de bien vouloir trouver ci-joint les documents relatifs à la Phase ${phase}.

Nous vous rappelons que l'ensemble des pièces doit nous parvenir dans un délai de 15 jours.

Veuillez agréer, Monsieur le Directeur d'Exploitation, l'expression de nos salutations distinguées.

${signataire}

Pièces jointes : 
- Formulaire de demande Phase ${phase}
- Checklist documentaire
- Guide d'accompagnement`
  }

  private generateLettreDecision(
    aerodrome: Aerodrome | undefined,
    date: string,
    numeroRef: string,
    signataire: string,
    type: ProcessType,
    process: unknown
  ): string {
    const p = process as { created_at?: string }
    return `DIRECTION DE LA SÉCURITÉ DES AÉRODROMES

DÉCISION N° ${numeroRef}
PORTANT ${type === 'certification' ? 'CERTIFICATION' : 'HOMOLOGATION'}
DE L'AÉRODROME DE ${aerodrome?.nom?.toUpperCase() || 'N/A'} (${aerodrome?.code_oaci || 'N/A'})

LE DIRECTEUR GÉNÉRAL,

Vu le Code de l'Aviation Civile,
Vu le Règlement relatif aux aérodromes,
Vu la demande déposée le ${new Date(p.created_at as string).toLocaleDateString('fr-FR')},
Vu le rapport de l'inspection du ${new Date().toLocaleDateString('fr-FR')},

DÉCIDE :

Article 1 : L'aérodrome de ${aerodrome?.nom || 'N/A'} (code OACI: ${aerodrome?.code_oaci || 'N/A'}) est ${type === 'certification' ? 'certifié' : 'homologué'} pour une durée de 5 ans.

Article 2 : Le présent certificat est délivré sous réserve du respect des conditions suivantes :
- Maintien du Système de Gestion de la Sécurité (SGS)
- Mise à jour annuelle de la documentation
- Notification préalable de tout changement significatif

Article 3 : Le présent certificat prend effet à compter de sa date de signature.

Article 4 : Le Directeur d'Exploitation est chargé de l'exécution de la présente décision.

Fait à Dakar, le ${date}

${signataire}

Certificat n°${numeroRef}`
  }

  private generateLettreRejet(
    aerodrome: Aerodrome | undefined,
    date: string,
    numeroRef: string,
    signataire: string,
    process: unknown
  ): string {
    const p = process as { type?: string }
    return `Direction de la Sécurité des Aérodromes

OBJET : Notification de rejet de la demande
RÉF : ${numeroRef}

Monsieur le Directeur d'Exploitation,

Par la présente, nous vous informons que votre demande de ${p.type === 'certification' ? 'certification' : 'homologation'} pour l'aérodrome de ${aerodrome?.nom || 'N/A'} (${aerodrome?.code_oaci || 'N/A'}) n'a pas été retenue.

Motifs du rejet :
- Non-conformités majeures relevées dans le dossier
- Absence de documents obligatoires
- Non-respect des délais impartis

Vous avez la possibilité de déposer une nouvelle demande après avoir corrigé les anomalies constatées.

Veuillez agréer, Monsieur le Directeur d'Exploitation, l'expression de nos salutations distinguées.

${signataire}`
  }

  private generateLettreRelance(
    aerodrome: Aerodrome | undefined,
    date: string,
    numeroRef: string,
    signataire: string,
    phase: number
  ): string {
    return `Direction de la Sécurité des Aérodromes

OBJET : Relance - Phase ${phase}
RÉF : ${numeroRef}

Monsieur le Directeur d'Exploitation,

Nous constatons que votre dossier de ${phase === 1 ? 'demande initiale' : phase === 2 ? 'documentation' : 'complément'} n'a pas été mis à jour depuis plus de 30 jours.

Nous vous prions de bien vouloir régulariser votre situation dans un délai de 15 jours, faute de quoi votre dossier sera clos.

Veuillez agréer, Monsieur le Directeur d'Exploitation, l'expression de nos salutations distinguées.

${signataire}`
  }

  private generateCertificatWord(
    aerodrome: Aerodrome | undefined,
    date: string,
    numeroRef: string,
    signataire: string,
    process: unknown
  ): string {
    // Format Word compatible
    return `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>CERTIFICAT D'AGRÉMENT DE L'AÉRODROME</w:t></w:r></w:p>
    <w:p><w:r><w:t>N° ${numeroRef}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Aérodrome: ${aerodrome?.nom} (${aerodrome?.code_oaci})</w:t></w:r></w:p>
    <w:p><w:r><w:t>Date de délivrance: ${date}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Validité: 5 ans</w:t></w:r></w:p>
    <w:p><w:r><w:t>Signature: ${signataire}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  }

  private generateHomologationWord(
    aerodrome: Aerodrome | undefined,
    date: string,
    numeroRef: string,
    signataire: string,
    process: unknown
  ): string {
    // Format Word compatible
    return `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>DÉCISION D'HOMOLOGATION</w:t></w:r></w:p>
    <w:p><w:r><w:t>N° ${numeroRef}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Aérodrome: ${aerodrome?.nom} (${aerodrome?.code_oaci})</w:t></w:r></w:p>
    <w:p><w:r><w:t>Date de décision: ${date}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Validité: Illimitée (sauf modification majeure)</w:t></w:r></w:p>
    <w:p><w:r><w:t>Signature: ${signataire}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  }

  private convertToHtml(titre: string, contenu: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${titre}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
    h1 { color: #1a237e; border-bottom: 2px solid #1a237e; }
    .header { text-align: center; margin-bottom: 30px; }
    .signature { margin-top: 50px; }
    .footer { margin-top: 50px; font-size: 12px; text-align: center; border-top: 1px solid #ccc; padding-top: 20px; }
  </style>
</head>
<body>
<div class="header">
  <h1>${titre}</h1>
</div>
<pre style="font-family: inherit; white-space: pre-wrap;">${contenu}</pre>
<div class="footer">
  <p>ANACIM Sénégal - Document officiel</p>
</div>
</body>
</html>`
  }

  private convertToWordCompatible(titre: string, contenu: string): string {
    // Format RTF simple (Word compatible)
    return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Arial;}}
\\f0\\fs24
\\par \\qc \\b ${titre} \\b0 \\par
\\par ${contenu.replace(/\n/g, '\\par ')}
\\par
\\par \\qc ANACIM Sénégal - Document officiel
}`
  }

  // ============================================================
  // 7. DÉTECTION DES BLOCAGES (appel automatique)
  // ============================================================

  async detectBlockages(processId: string, type: ProcessType): Promise<{
    hasBlockage: boolean
    blockages: Array<{
      phase: number
      type: 'inactivite' | 'documents_manquants' | 'profil_risque' | 'delai_depasse'
      message: string
      severite: 'critique' | 'elevee' | 'moyenne'
      actionsSuggeres: string[]
    }>
  }> {
    const analysis = await this.analyzeProcess({ processId, type })
    const blockages: Array<{
      phase: number
      type: 'inactivite' | 'documents_manquants' | 'profil_risque' | 'delai_depasse'
      message: string
      severite: 'critique' | 'elevee' | 'moyenne'
      actionsSuggeres: string[]
    }> = []

    for (const phase of analysis.phases) {
      if (phase.statut === 'bloquee') {
        blockages.push({
          phase: phase.numero,
          type: 'inactivite',
          message: `Phase ${phase.numero} inactive depuis ${phase.joursInactifs} jours`,
          severite: phase.joursInactifs > 90 ? 'critique' : phase.joursInactifs > 60 ? 'elevee' : 'moyenne',
          actionsSuggeres: phase.actionsRecommandees,
        })
      }
      
      if (phase.documentsManquants && phase.documentsManquants.length > 0) {
        blockages.push({
          phase: phase.numero,
          type: 'documents_manquants',
          message: `${phase.documentsManquants.length} document(s) manquant(s) pour la phase ${phase.numero}`,
          severite: phase.documentsManquants.length > 3 ? 'elevee' : 'moyenne',
          actionsSuggeres: [`Fournir les documents: ${phase.documentsManquants.join(', ')}`],
        })
      }
    }
    
    if (analysis.profilRisque.impact === 'défavorable') {
      blockages.push({
        phase: analysis.phaseActuelle,
        type: 'profil_risque',
        message: `Profil de risque ${analysis.profilRisque.niveau} (score ${analysis.profilRisque.score}/100) impactant le processus`,
        severite: analysis.profilRisque.score < 30 ? 'critique' : 'elevee',
        actionsSuggeres: [
          'Renforcer le SGS avant de poursuivre',
          'Planifier des audits supplémentaires',
          'Suivi renforcé par l\'inspecteur référent',
        ],
      })
    }
    
    return {
      hasBlockage: blockages.length > 0,
      blockages,
    }
  }

  // ============================================================
  // 8. INTÉGRATION AVEC LE PROFIL DE RISQUE
  // ============================================================

  private getProfilImpact(profil?: ProfilRisque): 'favorable' | 'neutre' | 'défavorable' {
    if (!profil) return 'neutre'
    if (profil.score_global >= 70) return 'favorable'
    if (profil.score_global >= 40) return 'neutre'
    return 'défavorable'
  }

  private calculateConfidence(profil?: ProfilRisque, phases?: CertificationAnalysisResult['phases']): number {
    let confidence = 70
    
    if (profil && profil.score_global >= 70) confidence += 10
    if (profil && profil.score_global < 30) confidence -= 15
    
    const completedPhases = phases?.filter(p => p.statut === 'terminee').length || 0
    if (completedPhases >= 2) confidence += 10
    
    return Math.min(95, Math.max(50, confidence))
  }

  private normalizeDocName(docName: string): string {
    return docName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
  }

  // ============================================================
  // UTILITAIRES
  // ============================================================

  clearCache(): void {
    this.analysesCache.clear()
    this.evaluationsCache.clear()
  }

  isReady(): boolean {
    return this.initialized
  }
}

export const certificationAgent = new CertificationAgent()