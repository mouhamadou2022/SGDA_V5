// lib/ia/models/bowtie.ts
// Modèle Generic BowTie + AI pour l'évaluation dynamique des barrières
// Évalue l'efficacité des barrières préventives et correctives
// Basé sur les données réelles des inspections et écarts
// 0 API externe, 0 coût, 100% local

'use client'

import { useAppStore, Ecart, Surveillance, ChecklistItem } from '@/lib/store'

// ============================================================
// TYPES
// ============================================================

export interface BowTieBarrier {
  id: string
  type: 'preventive' | 'corrective'
  description: string
  effectivenessScore: number
  level: 'excellente' | 'bonne' | 'moyenne' | 'faible' | 'critique'
  lastAssessed: string
  evidenceLinks: string[]
  recommendations?: string[]
  nsCount?: number
  ecartsCount?: number
}

export interface GenericBowTie {
  id: string
  domaine: string
  danger: string
  topEvent: string
  consequences: string[]
  barriers: BowTieBarrier[]
  degradationFactors: string[]
  lastAssessment: string
  overallScore: number
  overallLevel: 'critique' | 'eleve' | 'moyen' | 'faible'
  actionRequired: string
}

export interface BarrierAssessmentData {
  nsCount: number
  ecartsCount: number
  inspectionsPassed: boolean
  lastAuditScore: number
  surveillanceCount: number
  delaiMoyenCorrection: number
  conformiteTaux: number
}

export interface BowTieAnalysisResult {
  bowtie: GenericBowTie
  weaknesses: { barrierId: string; reason: string; impact: number }[]
  strengths: { barrierId: string; reason: string }[]
  recommendations: string[]
  riskResiduel: number
  riskLevel: 'critique' | 'eleve' | 'moyen' | 'faible'
}

// ============================================================
// CONSTANTES
// ============================================================

const DOMAINE_CONFIG: Record<string, {
  danger: string
  topEvent: string
  consequences: string[]
  degradationFactors: string[]
  defaultBarriers: Omit<BowTieBarrier, 'effectivenessScore' | 'level' | 'lastAssessed' | 'evidenceLinks'>[]
}> = {
  'SGS': {
    danger: 'Défaillance du système de gestion',
    topEvent: 'Non-conformité SGS',
    consequences: [
      'Augmentation des écarts',
      'Détection tardive des problèmes',
      'Risque de non-certification'
    ],
    degradationFactors: [
      'Rotation du personnel',
      'Manque de formation',
      'Documentation obsolète'
    ],
    defaultBarriers: [
      { id: 'bp1', type: 'preventive', description: 'Audits internes réguliers' },
      { id: 'bp2', type: 'preventive', description: 'Formation du personnel' },
      { id: 'bc1', type: 'corrective', description: 'Plan d\'actions correctives' },
      { id: 'bc2', type: 'corrective', description: 'Revue de direction' }
    ]
  },
  'SLI': {
    danger: 'Perte de capacité de secours',
    topEvent: 'Défaillance du service SLI',
    consequences: [
      'Retard d\'intervention',
      'Aggravation des incidents',
      'Non-conformité RAS 14'
    ],
    degradationFactors: [
      'Véhicules vétustes',
      'Personnel non formé',
      'Temps d\'intervention dépassé'
    ],
    defaultBarriers: [
      { id: 'bp1', type: 'preventive', description: 'Entretien régulier des véhicules' },
      { id: 'bp2', type: 'preventive', description: 'Exercices périodiques' },
      { id: 'bc1', type: 'corrective', description: 'Plan de remplacement' },
      { id: 'bc2', type: 'corrective', description: 'Suivi des temps d\'intervention' }
    ]
  },
  'PHY': {
    danger: 'Dégradation des infrastructures',
    topEvent: 'Non-conformité physique',
    consequences: [
      'Risque opérationnel',
      'Indisponibilité des installations',
      'Incidents au sol'
    ],
    degradationFactors: [
      'Maintenance insuffisante',
      'Absence de programme',
      'Manque de budget'
    ],
    defaultBarriers: [
      { id: 'bp1', type: 'preventive', description: 'Programme de maintenance préventive' },
      { id: 'bp2', type: 'preventive', description: 'Inspections régulières' },
      { id: 'bc1', type: 'corrective', description: 'Plan de rénovation' },
      { id: 'bc2', type: 'corrective', description: 'Gestion des non-conformités' }
    ]
  },
  'OPS': {
    danger: 'Défaillance opérationnelle',
    topEvent: 'Incident opérationnel',
    consequences: [
      'Perturbation des opérations',
      'Retards',
      'Insatisfaction usagers'
    ],
    degradationFactors: [
      'Procédures non appliquées',
      'Manque de coordination',
      'Formation insuffisante'
    ],
    defaultBarriers: [
      { id: 'bp1', type: 'preventive', description: 'Procédures standardisées' },
      { id: 'bp2', type: 'preventive', description: 'Briefings quotidiens' },
      { id: 'bc1', type: 'corrective', description: 'Retour d\'expérience' },
      { id: 'bc2', type: 'corrective', description: 'Plan de continuité' }
    ]
  },
  'ELEC': {
    danger: 'Défaillance électrique',
    topEvent: 'Panne électrique critique',
    consequences: [
      'Balisage hors service',
      'Interruption des opérations nocturnes',
      'Détérioration de l\'image'
    ],
    degradationFactors: [
      'Vieillissement des équipements',
      'Maintenance préventive insuffisante',
      'Gestion des pièces de rechange'
    ],
    defaultBarriers: [
      { id: 'bp1', type: 'preventive', description: 'Plan de maintenance électrique' },
      { id: 'bp2', type: 'preventive', description: 'Audits énergétiques' },
      { id: 'bc1', type: 'corrective', description: 'Plan d\'urgence électrique' },
      { id: 'bc2', type: 'corrective', description: 'Gestion des crises' }
    ]
  },
  'OLS': {
    danger: 'Intrusion dans les surfaces de limitation d\'obstacles',
    topEvent: 'Non-conformité OLS',
    consequences: [
      'Réduction des minima opérationnels',
      'Risque de collision avec obstacles',
      'Restriction d\'exploitation'
    ],
    degradationFactors: [
      'Construction non autorisée',
      'Végétation non maîtrisée',
      'Absence de monitoring'
    ],
    defaultBarriers: [
      { id: 'bp1', type: 'preventive', description: 'Surveillance périodique des surfaces OLS' },
      { id: 'bp2', type: 'preventive', description: 'Coordination avec les autorités urbanistiques' },
      { id: 'bc1', type: 'corrective', description: 'Plan de dégagement des obstacles' },
      { id: 'bc2', type: 'corrective', description: 'Notification AIP et NOTAM' }
    ]
  },
  'RA': {
    danger: 'Collision avec la faune',
    topEvent: 'Incident lié au péril animalier',
    consequences: [
      'Endommagement d\'aéronefs',
      'Interruption des opérations',
      'Risque pour la sécurité des vols'
    ],
    degradationFactors: [
      'Attraction faunistique (déchets, eau)',
      'Absence de plan de gestion',
      'Personnel non formé'
    ],
    defaultBarriers: [
      { id: 'bp1', type: 'preventive', description: 'Plan de gestion de la faune' },
      { id: 'bp2', type: 'preventive', description: 'Contrôle de l\'environnement attractif' },
      { id: 'bc1', type: 'corrective', description: 'Effarouchement et capture' },
      { id: 'bc2', type: 'corrective', description: 'Suivi statistique et rapportage' }
    ]
  },
  'MFP': {
    danger: 'Défaillance de la signalisation',
    topEvent: 'Non-conformité marques/feux/panneaux',
    consequences: [
      'Confusion des pilotes',
      'Incidents au sol',
      'Non-conformité RAS 14'
    ],
    degradationFactors: [
      'Usure du marquage',
      'Pannes de feux non détectées',
      'Panneaux manquants ou obsolètes'
    ],
    defaultBarriers: [
      { id: 'bp1', type: 'preventive', description: 'Inspection quotidienne du balisage' },
      { id: 'bp2', type: 'preventive', description: 'Programme de repainture et remplacement' },
      { id: 'bc1', type: 'corrective', description: 'Réparation rapide des défaillances' },
      { id: 'bc2', type: 'corrective', description: 'Contrôle de conformité réglementaire' }
    ]
  },
  'COP': {
    danger: 'Défaillance des compétences',
    topEvent: 'Incompétence du personnel',
    consequences: [
      'Erreurs opérationnelles',
      'Non-respect des procédures',
      'Accidents et incidents'
    ],
    degradationFactors: [
      'Formation insuffisante',
      'Habilitation expirée',
      'Turnover élevé'
    ],
    defaultBarriers: [
      { id: 'bp1', type: 'preventive', description: 'Programme de formation continue' },
      { id: 'bp2', type: 'preventive', description: 'Suivi des habilitations et recyclages' },
      { id: 'bc1', type: 'corrective', description: 'Plan de remédiation des compétences' },
      { id: 'bc2', type: 'corrective', description: 'Évaluation périodique des performances' }
    ]
  }
}

const RISK_LEVEL_CONFIG = {
  critique: { color: 'danger', label: 'Critique', action: 'Action immédiate requise' },
  eleve: { color: 'warning', label: 'Élevé', action: 'Surveillance renforcée dans les 30 jours' },
  moyen: { color: 'primary', label: 'Moyen', action: 'Maintenir la surveillance' },
  faible: { color: 'success', label: 'Faible', action: 'Poursuivre les bonnes pratiques' }
}

// ============================================================
// MODÈLE BOWTIE
// ============================================================

export class BowTieModel {
  private models: Map<string, GenericBowTie> = new Map()
  private lastUpdate: Date | null = null

  // ============================================================
  // CRÉATION ET GESTION
  // ============================================================

  createBowTie(domaine: string, customConfig?: Partial<GenericBowTie>): GenericBowTie {
    const config = DOMAINE_CONFIG[domaine]
    if (!config) {
      throw new Error(`Domaine ${domaine} non configuré pour le modèle BowTie`)
    }
    
    const now = new Date().toISOString()
    
    const barriers: BowTieBarrier[] = config.defaultBarriers.map(barrier => ({
      ...barrier,
      effectivenessScore: 70,
      level: 'moyenne',
      lastAssessed: now,
      evidenceLinks: []
    }))
    
    const bowtie: GenericBowTie = {
      id: `bowtie_${domaine}_${Date.now()}`,
      domaine,
      danger: config.danger,
      topEvent: config.topEvent,
      consequences: config.consequences,
      barriers,
      degradationFactors: config.degradationFactors,
      lastAssessment: now,
      overallScore: 70,
      overallLevel: 'moyen',
      actionRequired: RISK_LEVEL_CONFIG.moyen.action,
      ...customConfig
    }
    
    this.models.set(bowtie.id, bowtie)
    this.lastUpdate = new Date()
    
    return bowtie
  }

  getBowTie(domaine: string): GenericBowTie | undefined {
    for (const bowtie of this.models.values()) {
      if (bowtie.domaine === domaine) return bowtie
    }
    return undefined
  }

  getAllBowTies(): GenericBowTie[] {
    return Array.from(this.models.values())
  }

  // ============================================================
  // ÉVALUATION DES BARRIÈRES
  // ============================================================

  async assessBarrierEffectiveness(
    barrierId: string,
    data: BarrierAssessmentData
  ): Promise<{ effectiveness: number; level: BowTieBarrier['level']; recommendations: string[] }> {
    let score = 70 // baseline
    const recommendations: string[] = []
    
    // Impact des NS
    if (data.nsCount > 0) {
      score -= data.nsCount * 5
      recommendations.push(`${data.nsCount} NS détecté(s) sur cette barrière`)
    }
    
    // Impact des écarts
    if (data.ecartsCount > 0) {
      score -= data.ecartsCount * 10
      recommendations.push(`${data.ecartsCount} écart(s) lié(s) à cette barrière`)
    }
    
    // Inspections récentes
    if (data.inspectionsPassed) {
      score += 15
      recommendations.push('Inspections récentes validées')
    } else {
      score -= 10
      recommendations.push('Dernière inspection non conforme')
    }
    
    // Score d'audit
    if (data.lastAuditScore < 40) {
      score -= 25
      recommendations.push(`Score audit bas (${data.lastAuditScore}/100)`)
    } else if (data.lastAuditScore < 60) {
      score -= 10
      recommendations.push(`Score audit moyen (${data.lastAuditScore}/100)`)
    } else if (data.lastAuditScore >= 80) {
      score += 10
      recommendations.push(`Score audit élevé (${data.lastAuditScore}/100)`)
    }
    
    // Absence de surveillance
    if (data.surveillanceCount === 0) {
      score -= 15
      recommendations.push('Aucune surveillance récente')
    }
    
    // Délais de correction
    if (data.delaiMoyenCorrection > 90) {
      score -= 15
      recommendations.push(`Délai de correction long (${data.delaiMoyenCorrection} jours)`)
    }
    
    // Taux de conformité
    if (data.conformiteTaux < 50) {
      score -= 20
      recommendations.push(`Taux de conformité faible (${data.conformiteTaux}%)`)
    } else if (data.conformiteTaux >= 80) {
      score += 10
      recommendations.push(`Taux de conformité élevé (${data.conformiteTaux}%)`)
    }
    
    const effectiveness = Math.min(100, Math.max(0, score))
    
    let level: BowTieBarrier['level']
    if (effectiveness >= 85) level = 'excellente'
    else if (effectiveness >= 70) level = 'bonne'
    else if (effectiveness >= 50) level = 'moyenne'
    else if (effectiveness >= 30) level = 'faible'
    else level = 'critique'
    
    return { effectiveness, level, recommendations }
  }

  async updateBarrier(
    bowtieId: string,
    barrierId: string,
    assessmentData: BarrierAssessmentData
  ): Promise<GenericBowTie | null> {
    const bowtie = this.models.get(bowtieId)
    if (!bowtie) return null
    
    const assessment = await this.assessBarrierEffectiveness(barrierId, assessmentData)
    
    const updatedBarriers = bowtie.barriers.map(barrier =>
      barrier.id === barrierId
        ? {
            ...barrier,
            effectivenessScore: assessment.effectiveness,
            level: assessment.level,
            lastAssessed: new Date().toISOString(),
            recommendations: assessment.recommendations,
            nsCount: assessmentData.nsCount,
            ecartsCount: assessmentData.ecartsCount
          }
        : barrier
    )
    
    const overallScore = Math.round(
      updatedBarriers.reduce((sum, b) => sum + b.effectivenessScore, 0) / updatedBarriers.length
    )
    
    let overallLevel: GenericBowTie['overallLevel']
    let actionRequired: string
    
    if (overallScore >= 80) {
      overallLevel = 'faible'
      actionRequired = RISK_LEVEL_CONFIG.faible.action
    } else if (overallScore >= 60) {
      overallLevel = 'moyen'
      actionRequired = RISK_LEVEL_CONFIG.moyen.action
    } else if (overallScore >= 40) {
      overallLevel = 'eleve'
      actionRequired = RISK_LEVEL_CONFIG.eleve.action
    } else {
      overallLevel = 'critique'
      actionRequired = RISK_LEVEL_CONFIG.critique.action
    }
    
    const updatedBowtie = {
      ...bowtie,
      barriers: updatedBarriers,
      overallScore,
      overallLevel,
      actionRequired,
      lastAssessment: new Date().toISOString()
    }
    
    this.models.set(bowtieId, updatedBowtie)
    this.lastUpdate = new Date()
    
    return updatedBowtie
  }

  // ============================================================
  // ANALYSE COMPLÈTE
  // ============================================================

  async analyze(
    domaine: string,
    aerodromeId: string
  ): Promise<BowTieAnalysisResult> {
    const store = useAppStore.getState()
    
    // Récupérer ou créer le BowTie
    let bowtie = this.getBowTie(domaine)
    if (!bowtie) {
      bowtie = this.createBowTie(domaine)
    }
    
    // Récupérer les données de l'aérodrome
    const ecarts = store.ecarts.filter(e => e.aerodrome_id === aerodromeId)
    const surveillances = store.surveillances.filter(s => s.aerodrome_id === aerodromeId)
    const profil = store.profilsRisque[aerodromeId]
    
    // Évaluer chaque barrière
    const weaknesses: { barrierId: string; reason: string; impact: number }[] = []
    const strengths: { barrierId: string; reason: string }[] = []
    const recommendations: string[] = []

    // Variables agrégées sur l'ensemble des barrières
    const allBarrierEcarts = ecarts.filter(e => e.domaine === domaine)
    let barrierEcartsCritiques = allBarrierEcarts.filter(e => e.niveau_risque === 'critique').length

    for (const barrier of bowtie.barriers) {
      // Compter les écarts liés à ce domaine
      const barrierEcarts = allBarrierEcarts
      const barrierEcartsCount = barrierEcarts.length
      
      // Compter les NS dans les checklists
      const barrierSurveillances = surveillances.filter(s => s.portee?.includes(domaine))
      let nsCount = 0
      for (const surv of barrierSurveillances) {
        const items = store.checklistItems[surv.id] || []
        nsCount += items.filter(i => i.resultat === 'NS' && i.domaine === domaine).length
      }
      
      // Évaluer l'efficacité de la barrière
      const assessmentData: BarrierAssessmentData = {
        nsCount,
        ecartsCount: barrierEcartsCount,
        inspectionsPassed: barrierSurveillances.some(s => s.statut === 'rapport_signe'),
        lastAuditScore: profil?.c1 || 50,
        surveillanceCount: barrierSurveillances.length,
        delaiMoyenCorrection: this.computeAverageDelay(barrierEcarts),
        conformiteTaux: profil?.c3 || 50
      }
      
      const assessment = await this.assessBarrierEffectiveness(barrier.id, assessmentData)
      
      // Mettre à jour la barrière
      const updatedBarriers: BowTieBarrier[] = bowtie.barriers.map(b =>
        b.id === barrier.id
          ? { ...b, effectivenessScore: assessment.effectiveness, level: assessment.level, recommendations: assessment.recommendations }
          : b
      )
      bowtie = { ...bowtie, barriers: updatedBarriers }
      
      // Identifier les faiblesses et forces
      if (assessment.effectiveness < 50) {
        weaknesses.push({
          barrierId: barrier.id,
          reason: assessment.recommendations[0] || `Score d'efficacité faible (${assessment.effectiveness}%)`,
          impact: 50 - assessment.effectiveness
        })
        recommendations.push(`Renforcer ${barrier.description}: ${assessment.recommendations[0] || 'Action corrective requise'}`)
      } else if (assessment.effectiveness >= 80) {
        strengths.push({
          barrierId: barrier.id,
          reason: `Efficacité excellente (${assessment.effectiveness}%)`
        })
      }
    }
    
    // Recommandations additionnelles
    if (barrierEcartsCritiques > 0) {
      recommendations.unshift(`🔴 ${barrierEcartsCritiques} écart(s) critique(s) sur ${domaine} - action immédiate requise`)
    }
    
    if (profil && profil.score_global < 40) {
      recommendations.unshift(`⚠️ Profil de risque ${profil.niveau} (${profil.score_global}/100) - vigilance accrue`)
    }
    
    // Calcul du risque résiduel
    const weakestBarrier = weaknesses.sort((a, b) => b.impact - a.impact)[0]
    const riskResiduel = weakestBarrier 
      ? Math.min(100, 50 + weakestBarrier.impact)
      : 30
    
    let riskLevel: 'critique' | 'eleve' | 'moyen' | 'faible'
    if (riskResiduel >= 70) riskLevel = 'critique'
    else if (riskResiduel >= 50) riskLevel = 'eleve'
    else if (riskResiduel >= 30) riskLevel = 'moyen'
    else riskLevel = 'faible'
    
    // Sauvegarder
    this.models.set(bowtie.id, bowtie)
    this.lastUpdate = new Date()
    
    return {
      bowtie,
      weaknesses,
      strengths,
      recommendations,
      riskResiduel,
      riskLevel
    }
  }

  private computeAverageDelay(ecarts: Ecart[]): number {
    if (ecarts.length === 0) return 0
    
    const delays = ecarts
      .filter(e => e.cloture_le && e.created_at)
      .map(e => {
        const created = new Date(e.created_at)
        const closed = new Date(e.cloture_le!)
        return Math.ceil((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
      })
    
    if (delays.length === 0) return 0
    return delays.reduce((a, b) => a + b, 0) / delays.length
  }

  // ============================================================
  // VISUALISATION
  // ============================================================

  getRiskLevelConfig(level: string): { color: string; label: string; action: string } {
    return RISK_LEVEL_CONFIG[level as keyof typeof RISK_LEVEL_CONFIG] || RISK_LEVEL_CONFIG.moyen
  }

  getBarrierLevelColor(level: string): string {
    switch (level) {
      case 'excellente': return 'bg-success text-white'
      case 'bonne': return 'bg-primary text-white'
      case 'moyenne': return 'bg-warning text-white'
      case 'faible': return 'bg-orange-500 text-white'
      case 'critique': return 'bg-danger text-white animate-pulse'
      default: return 'bg-gray-500 text-white'
    }
  }

  // ============================================================
  // SAUVEGARDE ET CHARGEMENT
  // ============================================================

  exportAll(): string {
    const data = {
      models: Array.from(this.models.entries()),
      lastUpdate: this.lastUpdate?.toISOString()
    }
    return JSON.stringify(data, null, 2)
  }

  importAll(jsonData: string): boolean {
    try {
      const data = JSON.parse(jsonData)
      this.models = new Map(data.models)
      this.lastUpdate = data.lastUpdate ? new Date(data.lastUpdate) : null
      return true
    } catch (error) {
      console.error('[BowTieModel] Erreur lors de l\'import:', error)
      return false
    }
  }

  getLastUpdate(): Date | null {
    return this.lastUpdate
  }

  reset(): void {
    this.models.clear()
    this.lastUpdate = null
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const bowTieModel = new BowTieModel()