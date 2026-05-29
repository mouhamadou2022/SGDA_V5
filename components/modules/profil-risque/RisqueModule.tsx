// components/modules/profil-risque/RisqueModule.tsx
// VERSION CORRIGÉE - Ajout de canRecalculate manquant
// VERSION AVEC INTÉGRATION IA - Assistant pour suggestions détaillées

'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Plane,
  BarChart3,
  Info,
  Sparkles,
  Shield,
  Target,
  Clock,
  CalendarDays,
  Download,
  Eye,
  Brain,
  Map,
  PieChart,
  FileText,
  X,
  Loader2,
  Send,
  BookOpen,
} from 'lucide-react'
import { useAppStore, useHistoricalScores } from '@/lib/store'
import { useOptimizedStore, useGlobalTransition, LazyLoad } from '@/lib/performance/globalOptimizer'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { HelpModal, type HelpSection } from '@/components/ui/HelpModal'
import {
  computeProbabilityLevel,
  computeGravityLevel,
  getMatrixCell,
  getRiskLevelFromCell,
  type NiveauProbabilite,
  type NiveauGravite,
} from '@/lib/risque'
import {
  computeBayesianPrediction,
  type PredictionBayesienne,
} from '@/lib/risque/bayesian'
import {
  linearRegression,
  getTrendFromSlope,
  detectInflexions,
} from '@/lib/risque/trends'
import {
  type RisqueDomaine,
  type BowTieModele,
  type Barriere,
} from '@/lib/risque/types'
import { checklistMemory, getSuggestionsDetaillees, detectRecurrentPatterns } from '@/lib/checklistMemory'
import { reportAgent } from '@/lib/ia/agents/reportAgent'
import { assistantAgent } from '@/lib/ia/agents/assistantAgent'
import { riskAgent } from '@/lib/ia/agents/riskAgent'
import { useAIRiskAnalysis } from '@/hooks/useAIAnalysis'

// Composants existants du module
import { RiskGauge } from './RiskGauge'
import { RadarChart } from './RadarChart'
import { PredictionChart } from './PredictionChart'
import { TendanceTable } from './TendanceTable'
import { RecommandationCards } from './RecommandationCards'
import { ScenarioSimulator } from './ScenarioSimulator'
import { RiskMatrixView } from './RiskMatrixView'
import { BayesianDashboard } from './BayesianDashboard'
import { BowTieViewer } from './BowTieViewer'
import { CalibrationDashboard } from './CalibrationDashboard'
import { CorrelationHeatmap } from './CorrelationHeatmap'
import { EventTimeline } from './EventTimeline'
import { RiskMap } from './RiskMap'
import { ComparativeAnalysis } from './ComparativeAnalysis'
import { DrillDownAnalysis } from './DrillDownAnalysis'
import { AlertCenter } from './AlertCenter'
import { RiskReportExport } from './RiskReportExport'
import { TrendAnalysis } from './TrendAnalysis'
import { EscalationAlert } from './EscalationAlert'
import { FeedbackModal } from './FeedbackModal'
import { ModelCalibrationDashboard } from './ModelCalibrationDashboard'
import AdvancedModelsDashboard from './AdvancedModelsDashboard'
import { ProfilRisque } from '@/lib/store'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface RisqueModuleProps {
  userRole: string
}

type OngletId = 
  | 'global' 
  | 'maturite' 
  | 'matrice' 
  | 'predictions' 
  | 'scenarios' 
  | 'recommandations' 
  | 'analyses'
  | 'modeles'

interface Onglet {
  id: OngletId
  label: string
  icon: React.ElementType
  description: string
}

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

const ONGLETS: Onglet[] = [
  { id: 'global', label: 'Vue Globale', icon: Activity, description: 'Score, radar, tendances' },
  { id: 'maturite', label: 'Maturité SGS', icon: Shield, description: '4 composantes, bayésien, barrières' },
  { id: 'matrice', label: 'Matrice OACI', icon: Target, description: 'Matrice 5×5, corrélations' },
  { id: 'predictions', label: 'Prédictions', icon: TrendingUp, description: 'N+1/N+2/N+3, calibration' },
  { id: 'scenarios', label: 'Scénarios', icon: Sparkles, description: 'Simulations what-if' },
  { id: 'recommandations', label: 'Recommandations', icon: CheckCircle2, description: 'Actions prioritaires' },
  { id: 'analyses', label: 'Analyses', icon: BarChart3, description: 'Benchmark, export' },
  { id: 'modeles', label: 'Modèles', icon: Brain, description: 'Survival, EVT, HMM, Copulas, TS' },
]

const CRITERES = [
  { key: 'c1' as const, label: 'Maturité & Culture SGS', poids: 20 },
  { key: 'c2' as const, label: 'Efficacité & Réactivité PAC', poids: 25 },
  { key: 'c3' as const, label: 'Conformité Technique', poids: 20 },
  { key: 'c4' as const, label: 'Charge Critique Non Résolue', poids: 20 },
  { key: 'c5' as const, label: 'Résilience & Historique Sécurité', poids: 15 },
]

const LEGENDE_NIVEAUX = [
  { label: 'Faible (≥ 80)', badgeClass: 'risk-badge faible', softBg: 'bg-success-soft', textColor: 'text-success', freq: '1×/12 mois', icon: '🏆' },
  { label: 'Moyen (60–79)', badgeClass: 'risk-badge moyen', softBg: 'bg-primary-soft', textColor: 'text-primary', freq: '1×/6 mois', icon: '✓' },
  { label: 'Élevé (30–59)', badgeClass: 'risk-badge eleve', softBg: 'bg-warning-soft', textColor: 'text-warning', freq: '1×/3 mois', icon: '⚠️' },
  { label: 'Critique (< 30)', badgeClass: 'risk-badge critique', softBg: 'bg-danger-soft', textColor: 'text-danger', freq: '1×/mois', icon: '🔴' },
]

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

// Helper pour formater les nombres optionnels
function formatOptionalNumber(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '0.00';
  return value.toFixed(digits);
}

// Helper: Obtenir la configuration d'un niveau
function getNiveauConfig(score: number) {
  if (score >= 80) return { label: 'Faible', badgeClass: 'risk-badge faible', softBg: 'bg-success-soft', textColor: 'text-success', badge: 'success' as const, icon: '🏆' }
  if (score >= 60) return { label: 'Moyen', badgeClass: 'risk-badge moyen', softBg: 'bg-primary-soft', textColor: 'text-primary', badge: 'primary' as const, icon: '✓' }
  if (score >= 30) return { label: 'Élevé', badgeClass: 'risk-badge eleve', softBg: 'bg-warning-soft', textColor: 'text-warning', badge: 'warning' as const, icon: '⚠️' }
  return { label: 'Critique', badgeClass: 'risk-badge critique', softBg: 'bg-danger-soft', textColor: 'text-danger', badge: 'danger' as const, icon: '🔴' }
}

function TendanceIcon({ tendance }: { tendance: string }) {
  if (tendance === 'hausse') return <TrendingUp className="w-4 h-4 text-success" />
  if (tendance === 'baisse') return <TrendingDown className="w-4 h-4 text-danger animate-pulse" />
  return <Minus className="w-4 h-4 text-muted-foreground" />
}

// Helper: Score AGA pénalisé par l'hétérogénéité des critères
// Plus les scores sont dispersés, plus le score AGA est réduit
function computeAGAScore(c1: number, c2: number, c3: number, c4: number, c5: number): number {
  const scores = [c1, c2, c3, c4, c5]
  const moyenne = scores.reduce((a, b) => a + b, 0) / 5
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - moyenne, 2), 0) / 5
  const ecartType = Math.sqrt(variance)
  // Facteur 0.3 : 10 pts d'écart entre critères = -3 pts AGA
  const penalite = ecartType * 0.3
  return Math.max(0, Math.min(100, Math.round(moyenne - penalite)))
}

function computeDomainRisksFromProfil(profil: ProfilRisque): RisqueDomaine[] {
  const domaines = [
    { key: 'SGS', score: profil.c1 },
    { key: 'SLI', score: profil.c5 },
    { key: 'PHY', score: profil.c3 },
    { key: 'OLS', score: profil.c3 },
    { key: 'RA', score: profil.c5 },
    { key: 'ELEC', score: profil.c3 },
    { key: 'MFP', score: profil.c3 },
    { key: 'COP', score: profil.c1 },
    { key: 'OPS', score: profil.c2 },
    { key: 'AGA', score: computeAGAScore(profil.c1, profil.c2, profil.c3, profil.c4, profil.c5) },
  ]

  return domaines.map(({ key: domaine, score }) => {
    const scoreInverse = 100 - score
    const probScore = Math.min(1, scoreInverse / 100)
    let probabilite: NiveauProbabilite
    if (probScore >= 0.8) probabilite = 5
    else if (probScore >= 0.6) probabilite = 4
    else if (probScore >= 0.4) probabilite = 3
    else if (probScore >= 0.2) probabilite = 2
    else probabilite = 1

    let gravite: NiveauGravite
    if (score < 30) gravite = 'A'
    else if (score < 50) gravite = 'B'
    else if (score < 70) gravite = 'C'
    else if (score < 90) gravite = 'D'
    else gravite = 'E'

    const cellule = getMatrixCell(probabilite, gravite)
    const niveau = getRiskLevelFromCell(cellule)

    return {
      domaine,
      probabilite,
      gravite,
      niveau,
      cellule,
      confiance: Math.max(50, Math.min(95, 75 + (score - 50) * 0.4)),
      volatilite: profil.velocity_metrics?.volatilite ?? 15,
      tendance: profil.tendance as 'hausse' | 'baisse' | 'stable',
    }
  })
}

function computeBayesianPredictionsFromProfil(profil: ProfilRisque): Record<string, PredictionBayesienne> {
  const domaines = ['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS', 'AGA']
  const result: Record<string, PredictionBayesienne> = {}

  for (const domaine of domaines) {
    const score = domaine === 'SGS' ? profil.c1
      : domaine === 'SLI' ? profil.c5
      : domaine === 'PHY' ? profil.c3
      : domaine === 'OLS' ? profil.c3
      : domaine === 'RA' ? profil.c5
      : domaine === 'ELEC' ? profil.c3
      : domaine === 'MFP' ? profil.c3
      : domaine === 'COP' ? profil.c1
      : domaine === 'OPS' ? profil.c2
      : computeAGAScore(profil.c1, profil.c2, profil.c3, profil.c4, profil.c5)

    const riskLevel = 100 - score
    const moisSansIncident = profil.historical_scores?.length ?? 0

    const signaux: Array<{ type: string }> = []
    if (score < 40) signaux.push({ type: 'ecart_critique' })
    if (profil.c2 < 50) signaux.push({ type: 'NS' })
    if (profil.c4 > 60) signaux.push({ type: 'ecart_eleve' })

    result[domaine] = computeBayesianPrediction(
      domaine,
      signaux,
      Math.floor((100 - profil.score_global) / 20),
      moisSansIncident,
      riskLevel / 200,
      50
    )
  }

  return result
}

function generateBowTieModelsFromProfil(profil: ProfilRisque): BowTieModele[] {
  const domaines = [
    { domaine: 'SGS', danger: 'Défaillance du système de gestion', defaillance: 'Absence de procédures ou non-respect', consequence: 'Augmentation des écarts et incidents' },
    { domaine: 'SLI', danger: 'Perte de fonctions de sécurité', defaillance: 'SLI non monitoré ou dépassé', consequence: 'Réduction des marges de sécurité' },
    { domaine: 'PHY', danger: 'Dégradation des infrastructures', defaillance: 'Maintenance insuffisante', consequence: 'Non-conformité aux standards OACI' },
    { domaine: 'OLS', danger: 'Intrusion dans les surfaces OLS', defaillance: 'Obstacles non détectés', consequence: 'Réduction des minima opérationnels' },
    { domaine: 'RA', danger: 'Collision avec la faune', defaillance: 'Gestion de la faune inefficace', consequence: 'Endommagement d\'aéronefs' },
    { domaine: 'ELEC', danger: 'Défaillance électrique', defaillance: 'Maintenance insuffisante', consequence: 'Balisage hors service' },
    { domaine: 'MFP', danger: 'Défaillance de la signalisation', defaillance: 'Marquage/feux non conformes', consequence: 'Confusion des pilotes' },
    { domaine: 'COP', danger: 'Défaillance des compétences', defaillance: 'Formation insuffisante', consequence: 'Erreurs opérationnelles' },
    { domaine: 'OPS', danger: 'Défaillance opérationnelle', defaillance: 'Procédures non appliquées', consequence: 'Incidents opérationnels' },
  ]

  const barriereEff = profil.c2 > 70 ? 80 : profil.c2 > 50 ? 60 : profil.c2 > 30 ? 40 : 20
  const barrierePrev = profil.c1 > 70 ? 75 : profil.c1 > 50 ? 55 : profil.c1 > 30 ? 35 : 15

  const barrieresPreventives: Barriere[] = [
    { id: 'bp1', nom: 'Formation du personnel', type: 'preventive', efficace: barrierePrev > 50, efficacite: barrierePrev, dernierTest: profil.computed_at },
    { id: 'bp2', nom: 'Audits internes', type: 'preventive', efficace: profil.c1 > 60, efficacite: profil.c1, dernierTest: profil.computed_at },
  ]

  const barrieresCorrectives: Barriere[] = [
    { id: 'bc1', nom: 'Plans d\'actions correctifs', type: 'corrective', efficace: barriereEff > 50, efficacite: barriereEff, dernierTest: profil.computed_at },
    { id: 'bc2', nom: 'Suivi des écarts', type: 'corrective', efficace: profil.c3 > 50, efficacite: profil.c3, dernierTest: profil.computed_at },
  ]

  return domaines.map(({ domaine, danger, defaillance, consequence }) => {
    const score = domaine === 'SGS' ? profil.c1
      : domaine === 'SLI' ? profil.c5
      : domaine === 'COP' ? profil.c1
      : domaine === 'OPS' ? profil.c2
      : domaine === 'RA' ? profil.c5
      : domaine === 'AGA' ? computeAGAScore(profil.c1, profil.c2, profil.c3, profil.c4, profil.c5)
      : profil.c3
    const probRes = Math.max(5, Math.min(95, 100 - score - (barriereEff + barrierePrev) / 4))
    return {
      id: `bt-${domaine}`,
      domaine,
      danger,
      defaillance,
      scenario: `Si ${defaillance.toLowerCase()} alors ${consequence.toLowerCase()}`,
      consequence,
      barrieresPreventives,
      barrieresCorrectives,
      probabiliteResiduelle: probRes,
      niveauRisqueResiduel: probRes > 60 ? 'critique' : probRes > 40 ? 'eleve' : probRes > 20 ? 'moyen' : 'faible',
      lastAssessed: profil.computed_at,
    }
  })
}

function computeRealTrends(historiqueScores: { date: string; score: number }[]) {
  if (historiqueScores.length < 2) {
    return {
      longTerm: { tendance: 'stable' as const, pente: 0, intercept: 0, coefficientCorrelation: 0, pointsAnalyse: 0, stdError: 0, confidenceMargin95: 0 },
      shortTerm: { tendance: 'stable' as const, pente: 0, intercept: 0, coefficientCorrelation: 0, pointsAnalyse: 0, stdError: 0, confidenceMargin95: 0 },
      inflexions: [] as Array<{ index: number; date: string; type: string }>,
    }
  }

  const scores = historiqueScores.map(h => h.score)
  const dates = historiqueScores.map(h => h.date)

  const longTermReg = linearRegression(scores)
  const longTermTendance = getTrendFromSlope(longTermReg.slope, longTermReg.stdError)

  const recentScores = scores.slice(-Math.min(3, scores.length))
  const shortTermReg = recentScores.length >= 2 ? linearRegression(recentScores) : { slope: 0, intercept: 0, r2: 0, stdError: 0, confidenceMargin95: 0 }
  const shortTermTendance = getTrendFromSlope(shortTermReg.slope, shortTermReg.stdError)

  const inflexionPoints = detectInflexions(scores, dates, 5)

  return {
    longTerm: {
      tendance: longTermTendance,
      pente: longTermReg.slope,
      intercept: longTermReg.intercept,
      coefficientCorrelation: Math.min(1, Math.max(0, longTermReg.r2)),
      pointsAnalyse: scores.length,
      stdError: longTermReg.stdError,
      confidenceMargin95: longTermReg.confidenceMargin95,
    },
    shortTerm: {
      tendance: shortTermTendance,
      pente: shortTermReg.slope,
      intercept: shortTermReg.intercept,
      coefficientCorrelation: Math.min(1, Math.max(0, shortTermReg.r2)),
      pointsAnalyse: recentScores.length,
      stdError: shortTermReg.stdError,
      confidenceMargin95: shortTermReg.confidenceMargin95,
    },
    inflexions: inflexionPoints,
  }
}

// ─────────────────────────────────────────────────────────────
// Sous-composant : Suggestions IA
// ─────────────────────────────────────────────────────────────

interface IASuggestionsProps {
  aerodromeId: string
  profil: ProfilRisque
  onClose: () => void
}

function IASuggestions({ aerodromeId, profil, onClose }: IASuggestionsProps) {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [patterns, setPatterns] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [iaQuestion, setIaQuestion] = useState('')
  const [iaAnswer, setIaAnswer] = useState('')
  const [isAsking, setIsAsking] = useState(false)
  const addNotification = useAppStore(s => s.addNotification);
  const user = useOptimizedStore(s => s.user);

  useEffect(() => {
    const loadSuggestions = async () => {
      setIsLoading(true)
      try {
        const suggestionsData = getSuggestionsDetaillees(aerodromeId, 'programmee', profil)
        const patternsData = detectRecurrentPatterns(aerodromeId, 70)
        setSuggestions(suggestionsData.slice(0, 10))
        setPatterns(patternsData.slice(0, 5))
      } catch (error) {
        console.error('[IASuggestions] Erreur:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadSuggestions()
  }, [aerodromeId, profil])

  const handleAskAssistant = async () => {
    if (!iaQuestion.trim()) return
    
    setIsAsking(true)
    try {
      const result = await assistantAgent.chat({
        message: iaQuestion,
        contexte: {
          module: 'profil-risque',
          aerodromeId,
        },
        userRole: user?.role || 'inspector'
      })
      setIaAnswer(result.message)
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: 'Impossible de contacter l\'assistant',
        canal: 'in_app'
      })
    } finally {
      setIsAsking(false)
      case 'modeles':
        return (
          <AdvancedModelsDashboard aerodromeId={aerodrome.id} userRole={userRole} />
        )
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title flex items-center gap-2">
            <Brain className="w-5 h-5 text-role-primary" />
            Assistant IA - Suggestions intelligentes
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="modal-body p-5 space-y-6">
          {/* Zone de chat */}
          <div className="card border-primary/20 bg-primary-soft/30">
            <div className="card-header pb-2">
              <div className="card-title text-sm flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Posez une question à l'assistant
              </div>
            </div>
            <div className="card-content">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={iaQuestion}
                  onChange={(e) => setIaQuestion(e.target.value)}
                  placeholder="Ex: Quel est le principal risque sur cet aérodrome ?"
                  className={`flex-1 form-input text-sm ${focusClass}`}
                  onKeyDown={(e) => e.key === 'Enter' && handleAskAssistant()}
                />
                <button
                  onClick={handleAskAssistant}
                  disabled={isAsking || !iaQuestion.trim()}
                  className="btn btn-primary gap-2"
                >
                  {isAsking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Demander
                </button>
              </div>
              {iaAnswer && (
                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-700">{iaAnswer}</p>
                </div>
              )}
            </div>
          </div>

          {/* Suggestions détaillées */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-role-primary" />
              Suggestions par item de checklist
            </h3>
            {isLoading ? (
              <div className="text-center py-4">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-center text-muted-foreground py-4">
                Aucune suggestion disponible
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {suggestions.map((sugg, idx) => (
                  <div key={idx} className="p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="code-oaci-badge text-xs">{sugg.itemNumero}</span>
                      <span className={`badge ${sugg.prediction === 'NS' ? 'danger' : 'warning'} text-[10px]`}>
                        Prédit: {sugg.prediction}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{sugg.pointVerification}</p>
                    <p className="text-xs text-muted-foreground mt-1">{sugg.raison}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="badge neutral text-[10px]">Confiance: {sugg.confiance}%</span>
                      <span className="badge outline text-[10px]">{sugg.domaine} / {sugg.sousDomaine}</span>
                    </div>
                    <p className="text-xs text-role-primary mt-1">💡 {sugg.actionSuggerer}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Patterns récurrents */}
          {patterns.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Patterns récurrents détectés
              </h3>
              <div className="space-y-2">
                {patterns.map((pattern, idx) => (
                  <div key={idx} className="p-3 border border-warning/30 rounded-lg bg-warning-soft/30">
                    <div className="flex items-center justify-between">
                      <span className="code-oaci-badge text-xs">{pattern.itemNumero}</span>
                      <span className="badge warning text-[10px]">{pattern.tauxRecurrence}% récurrence</span>
                    </div>
                    <p className="text-sm mt-1">{pattern.pointVerification}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Historique: {pattern.historique.join(' → ')}
                    </p>
                    <p className="text-xs text-warning mt-1">⚠️ {pattern.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sous-composant : carte d'un aérodrome (vue liste)
// ─────────────────────────────────────────────────────────────

interface AerodromeCardProps {
  aerodrome: { id: string; code_oaci: string; nom: string; region: string; type: string }
  profil: ProfilRisque | null
  userRole: string
  refreshing: boolean
  onRecalculer: (id: string) => void
  onSelect: (id: string) => void
}

function AerodromeCard({ aerodrome, profil, userRole, refreshing, onRecalculer, onSelect }: AerodromeCardProps) {
  const cfg = profil ? getNiveauConfig(profil.score_global) : null
  const canRecalculate = userRole === 'admin' || userRole === 'inspector'

  const getBorderClass = () => {
    if (!profil) return 'border-l-slate-400'
    const score = profil.score_global
    if (score >= 80) return 'border-l-success'
    if (score >= 60) return 'border-l-role-primary'
    if (score >= 30) return 'border-l-warning'
    return 'border-l-danger'
  }

  const getProgressClass = (score: number) => {
    if (score >= 80) return 'progress-faible'
    if (score >= 60) return 'progress-moyen'
    if (score >= 30) return 'progress-eleve'
    return 'progress-critique'
  }

  return (
    <div 
      className={`card border border-border hover:shadow-role-glow transition-all duration-300 cursor-pointer border-l-4 ${getBorderClass()}`}
      onClick={() => onSelect(aerodrome.id)}
    >
      <div className="card-header pb-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${cfg?.softBg ?? 'bg-role-primary-soft'} flex items-center justify-center`}>
              <Plane className={`w-5 h-5 ${cfg?.textColor ?? 'text-role-primary'}`} />
            </div>
            <div>
              <div className="card-title text-base font-semibold">
                {aerodrome.code_oaci} — {aerodrome.nom}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs text-muted-foreground">{aerodrome.region} · {aerodrome.type}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {profil && profil.ensemble_confidence !== undefined && profil.ensemble_confidence <= 0.20 && (
              <span className="badge neutral flex items-center gap-1 text-[10px]">
                <Sparkles className="w-2.5 h-2.5" />
                Évaluation initiale
              </span>
            )}
            {profil && (
              <span className={`${cfg!.badgeClass} flex items-center gap-2`}>
                <TendanceIcon tendance={profil.tendance} />
                <span className="text-sm font-bold">{profil.score_global}/100</span>
              </span>
            )}
            {canRecalculate && (
              <button
                className="btn btn-secondary btn-sm gap-1"
                onClick={(e) => { e.stopPropagation(); onRecalculer(aerodrome.id) }}
                disabled={refreshing}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card-content">
        {!profil ? (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Info className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-small text-muted-foreground">Profil non encore calculé</p>
            {canRecalculate && (
              <button
                className="btn btn-secondary btn-sm gap-2"
                onClick={(e) => { e.stopPropagation(); onRecalculer(aerodrome.id) }}
                disabled={refreshing}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Calculer maintenant
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {profil.score_global < 30 && (
              <div className="alert alert-error !p-2">
                <span className="alert-icon text-sm">🔴</span>
                <div className="alert-content text-xs">Critique - action immédiate requise</div>
              </div>
            )}
            
            <div className="space-y-1.5">
              {CRITERES.slice(0, 3).map((c) => {
                const val = profil[c.key]
                return (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground w-6">{c.key}</span>
                    <div className="flex-1">
                      <div className={`progress h-1 ${getProgressClass(val)}`}>
                        <div className="progress-bar" style={{ width: `${val}%` }} />
                      </div>
                    </div>
                    <span className={`text-xs font-semibold ${getNiveauConfig(val).textColor}`}>{val}</span>
                  </div>
                )
              })}
            </div>
            
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{profil.computed_at ? new Date(profil.computed_at).toLocaleDateString('fr-FR') : 'N/A'}</span>
              <span className="font-medium">{profil.tendance === 'hausse' ? '📈 Hausse' : profil.tendance === 'baisse' ? '📉 Baisse' : '➡️ Stable'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sous-composant : Vue détaillée d'un aérodrome
// ─────────────────────────────────────────────────────────────

interface AerodromeDetailViewProps {
  aerodrome: { id: string; code_oaci: string; nom: string; region: string; type: string }
  profil: ProfilRisque
  userRole: string
  onBack: () => void
  onRecalculer: (id: string) => void
  refreshing: boolean
}

function AerodromeDetailView({ aerodrome, profil, userRole, onBack, onRecalculer, refreshing }: AerodromeDetailViewProps) {
  const [activeOnglet, setActiveOnglet] = useState<OngletId>('global')
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [showIASuggestions, setShowIASuggestions] = useState(false)
  const [showAINarrative, setShowAINarrative]     = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [feedbackPredictionType, setFeedbackPredictionType] = useState<'prediction_3m' | 'prediction_6m'>('prediction_3m')
  const { startTransition } = useGlobalTransition();

  const {
    riskResult,
    loadingRisk,
    aiNarrative,
    loadingNarrative,
    errorNarrative,
    runAnalysis,
    runNarrative,
  } = useAIRiskAnalysis(aerodrome.id)
  
  const canRecalculate = userRole === 'admin' || userRole === 'inspector'

  const historiqueScores = useHistoricalScores(aerodrome.id)
  const allProactiveAlerts = useOptimizedStore((state) => state.proactiveAlerts)
  const user = useOptimizedStore((state) => state.user)
  const addNotification = useAppStore((state) => state.addNotification) // Fonction, garder useAppStore
  const kitDocuments = useOptimizedStore((state) => state.kitDocuments)

  // Documents Kit analysés par l'IA (ayant un impact sur cet aérodrome)
  const kitDocsAnalyses = useMemo(() =>
    (kitDocuments || []).filter(d => d.ia_impact && d.ia_impact !== 'aucun'),
    [kitDocuments]
  )

  const trends = useMemo(() => computeRealTrends(historiqueScores), [historiqueScores])
  const domainRisks = useMemo(() => computeDomainRisksFromProfil(profil), [profil])
  const bayesianPredictions = useMemo(() => computeBayesianPredictionsFromProfil(profil), [profil])
  const bowTieModels = useMemo(() => generateBowTieModelsFromProfil(profil), [profil])

  const alerts = useMemo(() => 
    allProactiveAlerts.filter(a => a.aerodrome_id === aerodrome.id && !a.resolved_at),
    [allProactiveAlerts, aerodrome.id]
  )

  const perfMetrics = useMemo(() => {
    if (historiqueScores.length < 2) {
      return {
        mae3m: null, mae6m: null, biais3m: null, biais6m: null,
        coverage95: null, derniereCalibration: new Date().toISOString(), nbObservations: 0,
      }
    }
    const errors = historiqueScores.slice(1).map((h, i) => {
      const prev = historiqueScores[i].score
      const prevPrev = i >= 1 ? historiqueScores[i - 1].score : prev
      const predicted = prev + (prev - prevPrev)
      return h.score - predicted
    })
    if (errors.length === 0) {
      return {
        mae3m: null, mae6m: null, biais3m: null, biais6m: null,
        coverage95: null, derniereCalibration: new Date().toISOString(), nbObservations: 0,
      }
    }
    const mae = errors.reduce((s, e) => s + Math.abs(e), 0) / errors.length
    const bias = errors.reduce((s, e) => s + e, 0) / errors.length
    const inInterval = errors.filter(e => Math.abs(e) < 15).length
    return {
      mae3m: Math.round(mae * 10) / 10,
      mae6m: Math.round(mae * 1.5 * 10) / 10,
      biais3m: Math.round(bias * 10) / 10,
      biais6m: Math.round(bias * 1.5 * 10) / 10,
      coverage95: Math.round((inInterval / errors.length) * 100),
      derniereCalibration: new Date().toISOString(),
      nbObservations: historiqueScores.length,
    }
  }, [historiqueScores])

  const handlePlanifierSurveillance = () => {
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Planification de surveillance',
      message: `Planification de surveillance pour ${aerodrome.code_oaci}`,
      canal: 'in_app'
    })
  }

  const handleFeedbackSubmit = (feedback: {
    type: 'prediction_3m' | 'prediction_6m' | 'alerte' | 'recommandation'
    valeurPredite: number
    valeurReelle: number
    commentaire: string
  }) => {
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Feedback envoyé',
      message: `Merci pour votre retour sur la prédiction ${feedback.type}`,
      canal: 'in_app'
    })
    setShowFeedbackModal(false)
  }

  const renderContent = () => {
    switch (activeOnglet) {
      case 'global':
        return (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="card">
                <div className="card-content p-4 flex justify-center">
                  <RiskGauge 
                    score={profil.score_global} 
                    size="lg"
                    showVelocity={!!profil.velocity_metrics}
                    velocity={profil.velocity_metrics?.vitesse}
                    niveauVigilance={profil.velocity_metrics?.niveau_vigilance ?? 'normal'}
                    confidenceInterval={profil.prediction_interval_3m}
                  />
                </div>
              </div>
              <div className="card">
                <div className="card-content p-4">
                  <RadarChart profil={profil} />
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header pb-2">
                <p className="card-title text-sm font-semibold">Indicateurs clés</p>
              </div>
              <div className="card-content">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-primary-soft rounded-xl p-3 text-center">
                    <p className="text-xs text-primary">Score</p>
                    <p className="text-2xl font-bold text-primary">{profil.score_global}</p>
                  </div>
                  <div className="bg-primary-soft rounded-xl p-3 text-center">
                    <p className="text-xs text-primary">Prédiction 3m</p>
                    <p className="text-2xl font-bold text-primary">{profil.prediction_3m}</p>
                  </div>
                  <div className="bg-warning-soft rounded-xl p-3 text-center">
                    <p className="text-xs text-warning">Prédiction 6m</p>
                    <p className="text-2xl font-bold text-warning">{profil.prediction_6m}</p>
                  </div>
                  <div className="bg-success-soft rounded-xl p-3 text-center">
                    <p className="text-xs text-success">Tendance</p>
                    <div className="flex items-center justify-center gap-1">
                      <TendanceIcon tendance={profil.tendance} />
                      <span className="text-sm font-semibold capitalize">{profil.tendance}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Prédictions d'incidents */}
            {(profil.incident_prediction_3m !== undefined || profil.incident_prediction_6m !== undefined || profil.incident_prediction_12m !== undefined || profil.ensemble_confidence !== undefined) && (
              <div className="card">
                <div className="card-header pb-2">
                  <p className="card-title text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-danger" />
                    Prédictions d'incidents
                  </p>
                </div>
                <div className="card-content">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {profil.incident_prediction_3m !== undefined && (
                      <div className="bg-danger-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-danger">Incident 3m</p>
                        <p className="text-2xl font-bold text-danger">{(profil.incident_prediction_3m * 100).toFixed(1)}%</p>
                      </div>
                    )}
                    {profil.incident_prediction_6m !== undefined && (
                      <div className="bg-warning-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-warning">Incident 6m</p>
                        <p className="text-2xl font-bold text-warning">{(profil.incident_prediction_6m * 100).toFixed(1)}%</p>
                      </div>
                    )}
                    {profil.incident_prediction_12m !== undefined && (
                      <div className="bg-warning-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-warning">Incident 12m</p>
                        <p className="text-2xl font-bold text-warning">{(profil.incident_prediction_12m * 100).toFixed(1)}%</p>
                      </div>
                    )}
                    {profil.ensemble_confidence !== undefined && (
                      <div className="bg-primary-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-primary">
                          Confiance ensemble
                          <InfoTooltip content="Niveau de confiance du modèle ensembliste. En dessous de 20 %, le profil est en phase d'évaluation initiale et les prédictions sont indicatives." />
                        </p>
                        <p className="text-2xl font-bold text-primary">{(profil.ensemble_confidence * 100).toFixed(0)}%</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Événements — fréquence et tendance */}
            {(profil.event_frequency !== undefined || profil.event_severity_trend !== undefined || profil.days_since_last_event !== undefined || profil.event_trend_acceleration !== undefined) && (
              <div className="card">
                <div className="card-header pb-2">
                  <p className="card-title text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-role-primary" />
                    Événements de sécurité
                  </p>
                </div>
                <div className="card-content">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {profil.event_frequency !== undefined && (
                      <div className="bg-muted rounded-xl p-3 text-center">
                        <p className="text-xs text-muted-foreground">Fréquence événements</p>
                        <p className="text-xl font-bold text-foreground">{profil.event_frequency.toFixed(2)}/mois</p>
                      </div>
                    )}
                    {profil.event_severity_trend !== undefined && (
                      <div className={`rounded-xl p-3 text-center ${
                        profil.event_severity_trend === 'hausse' ? 'bg-danger-soft' :
                        profil.event_severity_trend === 'baisse' ? 'bg-success-soft' :
                        'bg-muted'
                      }`}>
                        <p className="text-xs text-muted-foreground">Tendance gravité</p>
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <TendanceIcon tendance={profil.event_severity_trend} />
                          <span className="text-sm font-semibold capitalize">{profil.event_severity_trend}</span>
                        </div>
                      </div>
                    )}
                    {profil.days_since_last_event !== undefined && (
                      <div className="bg-muted rounded-xl p-3 text-center">
                        <p className="text-xs text-muted-foreground">Dernier incident</p>
                        <p className="text-xl font-bold text-foreground">{profil.days_since_last_event} jours</p>
                      </div>
                    )}
                    {profil.event_trend_acceleration !== undefined && profil.event_trend_acceleration !== null && (
                      <div className={`rounded-xl p-3 text-center ${
                        profil.event_trend_acceleration > 0 ? 'bg-danger-soft' : 'bg-success-soft'
                      }`}>
                        <p className="text-xs text-muted-foreground">Accélération tendance</p>
                        <p className={`text-xl font-bold ${
                          profil.event_trend_acceleration > 0 ? 'text-danger' : 'text-success'
                        }`}>
                          {profil.event_trend_acceleration > 0 ? '+' : ''}
                          {profil.event_trend_acceleration.toFixed(2)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-header pb-2">
                <p className="card-title text-sm font-semibold">Détail des critères</p>
              </div>
              <div className="card-content space-y-2.5">
              {CRITERES.map((c) => {
                const val = profil[c.key]
                const critCfg = getNiveauConfig(val)
                return (
                  <div key={c.key} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground w-8 uppercase">{c.key}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-foreground">{c.label}</span>
                        <span className={`text-xs font-semibold ${critCfg.textColor}`}>{val}/100</span>
                      </div>
                      <div className="progress h-1.5">
                        <div className={`progress-bar ${critCfg.badge === 'danger' ? 'progress-critique' : critCfg.badge === 'warning' ? 'progress-eleve' : critCfg.badge === 'success' ? 'progress-faible' : 'progress-moyen'}`} style={{ width: `${val}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{c.poids}%</span>
                  </div>
                )
              })}
              </div>
            </div>

            {profil.velocity_metrics && (
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Vitesse</p>
                  <p className={`text-sm font-semibold ${profil.velocity_metrics.vitesse < 0 ? 'text-danger' : 'text-success'}`}>
                    {profil.velocity_metrics.vitesse > 0 ? '+' : ''}{profil.velocity_metrics.vitesse.toFixed(1)} pts/mois
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Accélération</p>
                  <p className="text-sm font-semibold">{profil.velocity_metrics.acceleration.toFixed(1)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Volatilité</p>
                  <p className="text-sm font-semibold">{profil.velocity_metrics.volatilite.toFixed(1)}%</p>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-content">
                <TendanceTable profil={profil} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setFeedbackPredictionType('prediction_3m')
                  setShowFeedbackModal(true)
                }}
                className="btn btn-ghost btn-sm gap-1 text-xs"
              >
                <Eye className="w-3 h-3" />
                Évaluer cette prédiction
              </button>
              <button
                onClick={() => setShowIASuggestions(true)}
                className="btn btn-ghost btn-sm gap-1 text-xs"
              >
                <Sparkles className="w-3 h-3" />
                Suggestions mémoire
              </button>
              <button
                onClick={async () => { setShowAINarrative(true); await runNarrative() }}
                disabled={loadingNarrative || loadingRisk}
                className="btn btn-primary btn-sm gap-1 text-xs"
              >
                {loadingNarrative
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Brain className="w-3 h-3" />
                }
                Analyse IA
              </button>
            </div>
          </div>
        )

      case 'maturite':
        return (
          <div className="space-y-6 animate-fade-in">
            {/* Profil bayésien global */}
            {(profil.bayesian_posterior !== undefined || profil.bayesian_prior !== undefined || profil.bayesian_black_swan !== undefined) && (
              <div className="card">
                <div className="card-header pb-2">
                  <div className="card-title text-sm font-semibold flex items-center gap-2">
                    <Brain className="h-4 w-4 text-role-primary" />
                    Apprentissage bayésien global
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mise à jour bayésienne après chaque événement (prior → posterior)
                  </p>
                </div>
                <div className="card-content">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {profil.bayesian_prior !== undefined && (
                      <div className="bg-primary-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-primary">Prior global<InfoTooltip content="Probabilité de risque estimée avant observation des données récentes. Le prior est la «croyance initiale» du modèle bayésien avant mise à jour." /></p>
                        <p className="text-2xl font-bold text-primary">{(profil.bayesian_prior * 100).toFixed(1)}%</p>
                      </div>
                    )}
                    {profil.bayesian_posterior !== undefined && (
                      <div className="bg-role-primary-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-role-primary">Posterior global<InfoTooltip content="Probabilité de risque mise à jour après intégration des nouvelles données d'inspection. Si posterior &gt; prior, le risque réel est plus élevé qu'attendu." /></p>
                        <p className="text-2xl font-bold text-role-primary">{(profil.bayesian_posterior * 100).toFixed(1)}%</p>
                      </div>
                    )}
                    {profil.bayesian_prior !== undefined && profil.bayesian_posterior !== undefined && (
                      <div className={`rounded-xl p-3 text-center ${
                        profil.bayesian_posterior > profil.bayesian_prior ? 'bg-danger-soft' :
                        profil.bayesian_posterior < profil.bayesian_prior ? 'bg-success-soft' : 'bg-muted'
                      }`}>
                        <p className="text-xs text-muted-foreground">Delta (post−prior)</p>
                        <p className={`text-2xl font-bold ${
                          profil.bayesian_posterior > profil.bayesian_prior ? 'text-danger' :
                          profil.bayesian_posterior < profil.bayesian_prior ? 'text-success' : 'text-muted-foreground'
                        }`}>
                          {(profil.bayesian_posterior - profil.bayesian_prior) > 0 ? '+' : ''}
                          {((profil.bayesian_posterior - profil.bayesian_prior) * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                    {profil.bayesian_black_swan !== undefined && (
                      <div className={`rounded-xl p-3 text-center ${profil.bayesian_black_swan ? 'bg-danger-soft animate-pulse' : 'bg-muted'}`}>
                        <p className="text-xs text-muted-foreground">Black Swan<InfoTooltip content="Événement à très faible probabilité mais à impact extrême, non prévisible par les données historiques. Détecté quand la posterior bayésienne dépasse un seuil critique." /></p>
                        <p className={`text-xl font-bold ${profil.bayesian_black_swan ? 'text-danger' : 'text-muted-foreground'}`}>
                          {profil.bayesian_black_swan ? '⚠️ Détecté' : 'Aucun'}
                        </p>
                      </div>
                    )}
                  </div>
                  {profil.ensemble_confidence !== undefined && (
                    <div className="mt-3 pt-3 border-t border-border text-center">
                      <span className="text-xs text-muted-foreground">Confiance du modèle ensembliste<InfoTooltip content="Niveau de confiance du modèle combinant plusieurs algorithmes. En dessous de 20 %, le profil est en phase d'évaluation initiale et les prédictions sont indicatives." /> : </span>
                      <span className="text-sm font-semibold text-role-primary">{(profil.ensemble_confidence * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <BayesianDashboard 
              predictions={bayesianPredictions}
              domaines={['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS', 'AGA']}
              onDomainSelect={(domaine) => console.log('Domaine sélectionné:', domaine)}
            />
            <BowTieViewer 
              models={bowTieModels}
              domaines={['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS']}
            />
            <TrendAnalysis 
              historiqueScores={historiqueScores}
              longTermTrend={trends.longTerm}
              shortTermTrend={trends.shortTerm}
              inflexions={trends.inflexions as any}
            />
          </div>
        )

      case 'matrice':
        return (
          <div className="space-y-6 animate-fade-in">
            <RiskMatrixView 
              domainRisks={domainRisks}
              onDomainClick={(domaine) => console.log('Domaine cliqué:', domaine)}
              showLegend={true}
            />
            <CorrelationHeatmap 
              profilsHistorique={historiqueScores.map(h => ({
                ...profil,
                score_global: h.score,
                computed_at: h.date,
              }))}
              currentProfil={profil}
              aerodromeName={aerodrome.nom}
            />
            <EventTimeline 
              aerodromeId={aerodrome.id}
              aerodromeName={aerodrome.nom}
              profil={profil}
            />
          </div>
        )

      case 'predictions':
        return (
          <div className="space-y-6 animate-fade-in">
            <PredictionChart 
              profil={profil}
              aerodromeNom={`${aerodrome.code_oaci} — ${aerodrome.nom}`}
            />

            {/* Prédictions d'incidents */}
            {(profil.incident_prediction_3m !== undefined || profil.incident_prediction_6m !== undefined || profil.incident_prediction_12m !== undefined || profil.ensemble_confidence !== undefined) && (
              <div className="card">
                <div className="card-header pb-2">
                  <div className="card-title text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-danger" />
                    Prédiction d'incidents — Modèle Ensembliste
                  </div>
                </div>
                <div className="card-content">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {profil.incident_prediction_3m !== undefined && (
                      <div className="bg-danger-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-danger">Incident 3 mois</p>
                        <p className="text-2xl font-bold text-danger">{(profil.incident_prediction_3m * 100).toFixed(1)}%</p>
                      </div>
                    )}
                    {profil.incident_prediction_6m !== undefined && (
                      <div className="bg-warning-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-warning">Incident 6 mois</p>
                        <p className="text-2xl font-bold text-warning">{(profil.incident_prediction_6m * 100).toFixed(1)}%</p>
                      </div>
                    )}
                    {profil.incident_prediction_12m !== undefined && (
                      <div className="bg-warning-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-warning">Incident 12 mois</p>
                        <p className="text-2xl font-bold text-warning">{(profil.incident_prediction_12m * 100).toFixed(1)}%</p>
                      </div>
                    )}
                    {profil.ensemble_confidence !== undefined && (
                      <div className="bg-primary-soft rounded-xl p-3 text-center">
                        <p className="text-xs text-primary">
                          Confiance ensemble
                          <InfoTooltip content="Niveau de confiance du modèle ensembliste. En dessous de 20 %, le profil est en phase d'évaluation initiale et les prédictions sont indicatives." />
                        </p>
                        <p className="text-2xl font-bold text-primary">{(profil.ensemble_confidence * 100).toFixed(0)}%</p>
                      </div>
                    )}
                  </div>
                  {(profil.event_frequency !== undefined || profil.event_severity_trend !== undefined || profil.days_since_last_event !== undefined || profil.event_trend_acceleration !== undefined) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-border">
                      {profil.event_frequency !== undefined && (
                        <div className="bg-muted rounded-xl p-3 text-center">
                          <p className="text-xs text-muted-foreground">Fréquence événements</p>
                          <p className="text-xl font-bold text-foreground">{profil.event_frequency.toFixed(2)}/mois</p>
                        </div>
                      )}
                      {profil.event_severity_trend !== undefined && (
                        <div className={`rounded-xl p-3 text-center ${
                          profil.event_severity_trend === 'hausse' ? 'bg-danger-soft' :
                          profil.event_severity_trend === 'baisse' ? 'bg-success-soft' : 'bg-muted'
                        }`}>
                          <p className="text-xs text-muted-foreground">Tendance gravité</p>
                          <div className="flex items-center justify-center gap-1 mt-1">
                            <TendanceIcon tendance={profil.event_severity_trend} />
                            <span className="text-sm font-semibold capitalize">{profil.event_severity_trend}</span>
                          </div>
                        </div>
                      )}
                      {profil.days_since_last_event !== undefined && (
                        <div className="bg-muted rounded-xl p-3 text-center">
                          <p className="text-xs text-muted-foreground">Dernier incident</p>
                          <p className="text-xl font-bold text-foreground">{profil.days_since_last_event} jours</p>
                        </div>
                      )}
                      {profil.event_trend_acceleration !== undefined && profil.event_trend_acceleration !== null && (
                        <div className={`rounded-xl p-3 text-center ${
                          profil.event_trend_acceleration > 0 ? 'bg-danger-soft' : 'bg-success-soft'
                        }`}>
                          <p className="text-xs text-muted-foreground">Accélération tendance</p>
                          <p className={`text-xl font-bold ${
                            profil.event_trend_acceleration > 0 ? 'text-danger' : 'text-success'
                          }`}>
                            {profil.event_trend_acceleration > 0 ? '+' : ''}
                            {profil.event_trend_acceleration.toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            <CalibrationDashboard 
              performance={perfMetrics}
              corrections={[]}
              onCalibrate={() => console.log('Calibration demandée')}
            />
            <ModelCalibrationDashboard aerodromeId={aerodrome.id} />
          </div>
        )

      case 'scenarios':
        return (
          <div className="space-y-6 animate-fade-in">
            {/* Scénarios auto-générés par le modèle bayésien */}
            {profil.scenarios && profil.scenarios.length > 0 && (
              <div className="card">
                <div className="card-header pb-2">
                  <div className="card-title text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-role-primary" />
                    Scénarios générés automatiquement
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Basés sur le profil de risque actuel et l'analyse bayésienne
                  </p>
                </div>
                <div className="card-content space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {profil.scenarios.map((scenario, idx) => {
                      const bgClass = scenario.nom.toLowerCase().includes('catastrophe') ? 'bg-danger-soft border-danger/20' :
                        scenario.nom.toLowerCase().includes('pessimiste') ? 'bg-warning-soft border-warning/20' :
                        scenario.nom.toLowerCase().includes('optimiste') ? 'bg-success-soft border-success/20' :
                        'bg-primary-soft border-primary/20'
                      const icon = scenario.nom.toLowerCase().includes('catastrophe') ? '🔴' :
                        scenario.nom.toLowerCase().includes('pessimiste') ? '⚠️' :
                        scenario.nom.toLowerCase().includes('optimiste') ? '✅' : '📊'
                      return (
                        <div key={idx} className={`p-4 rounded-xl border ${bgClass}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold">{icon} {scenario.nom}</h4>
                            <span className={`badge ${
                              scenario.probabilite > 0.6 ? 'danger' : scenario.probabilite > 0.3 ? 'warning' : 'success'
                            }`}>
                              {(scenario.probabilite * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">{scenario.description}</p>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="text-muted-foreground">Score projeté</span>
                            <span className={`font-bold ${
                              scenario.scoreProjecte >= 80 ? 'text-success' :
                              scenario.scoreProjecte >= 60 ? 'text-primary' :
                              scenario.scoreProjecte >= 30 ? 'text-warning' : 'text-danger'
                            }`}>{scenario.scoreProjecte}/100</span>
                          </div>
                          {scenario.intervalleConfiance && (
                            <div className="text-xs text-muted-foreground mb-2">
                              IC 95% : [{scenario.intervalleConfiance[0]} – {scenario.intervalleConfiance[1]}]
                            </div>
                          )}
                          {scenario.actionsRecommandees && scenario.actionsRecommandees.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-border/50">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Actions recommandées</p>
                              <ul className="space-y-0.5">
                                {scenario.actionsRecommandees.map((action, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                    <span className="text-role-primary mt-0.5">•</span>
                                    {action}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            <ScenarioSimulator 
              profil={profil}
              aerodromeName={`${aerodrome.code_oaci} — ${aerodrome.nom}`}
              userRole={userRole}
            />
          </div>
        )

      case 'recommandations':
        return (
          <div className="space-y-6 animate-fade-in">
            <AlertCenter aerodromeId={aerodrome.id} />
            <RecommandationCards 
              profil={profil}
              aerodromeName={`${aerodrome.code_oaci} — ${aerodrome.nom}`}
              onPlanifierSurveillance={handlePlanifierSurveillance}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alerts.slice(0, 2).map(alert => (
                <EscalationAlert
                  key={alert.id}
                  id={alert.id}
                  titre={alert.message_court}
                  description={alert.message_long}
                  niveauAlerte={alert.niveau_urgence as any}
                  niveauEscalade="inspecteur"
                  dateCreation={alert.created_at}
                  delaiEscaladeJours={7}
                />
              ))}
            </div>

            {/* Documents Kit Inspecteur ayant un impact réglementaire */}
            {kitDocsAnalyses.length > 0 && (
              <div className="card border-border">
                <div className="card-header p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-role-primary" />
                    <h3 className="font-semibold text-foreground">Documents réglementaires analysés par l'IA</h3>
                    <span className="badge muted">{kitDocsAnalyses.length}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ces documents du Kit Inspecteur ont alimenté les prédictions de checklist pour cet aérodrome.
                  </p>
                </div>
                <div className="card-content p-3 space-y-2">
                  {kitDocsAnalyses.map(doc => {
                    const impactConfig = {
                      majeur: { badge: 'danger', label: 'Impact majeur' },
                      modere: { badge: 'warning', label: 'Impact modéré' },
                      mineur: { badge: 'neutral', label: 'Impact mineur' },
                    } as const
                    const cfg = impactConfig[doc.ia_impact as keyof typeof impactConfig]
                    return (
                      <div key={doc.id} className="flex items-center gap-3 p-2 rounded-lg bg-card-soft border border-border">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{doc.nom}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.reference_base && <span className="font-mono mr-2">{doc.reference_base}</span>}
                            {doc.ia_analyse_at && new Date(doc.ia_analyse_at).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                        {cfg && <span className={`badge ${cfg.badge} flex-shrink-0`}>{cfg.label}</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )

      case 'analyses':
        return (
          <div className="space-y-6 animate-fade-in">
            <ComparativeAnalysis selectedAerodromeId={aerodrome.id} />
            <RiskMap onSelectAerodrome={(id) => console.log('Aérodrome sélectionné:', id)} />
            <DrillDownAnalysis aerodromeId={aerodrome.id} />
            <RiskReportExport aerodromeId={aerodrome.id} />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn btn-secondary btn-sm gap-1">
            ← Retour
          </button>
          <div>
            <h2 className="text-xl font-bold text-foreground">{aerodrome.code_oaci} — {aerodrome.nom}</h2>
            <p className="text-xs text-muted-foreground">{aerodrome.region} · {aerodrome.type}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canRecalculate && (
            <button
              className="btn btn-secondary btn-sm gap-1"
              onClick={() => onRecalculer(aerodrome.id)}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Recalculer
            </button>
          )}
          <button onClick={() => setShowExportDialog(true)} className="btn btn-secondary btn-sm gap-1">
            <Download className="w-4 h-4" />
            Exporter
          </button>
        </div>
      </div>

      {/* Bandeau "Évaluation initiale" — profil basé sur le formulaire seulement */}
      {profil.ensemble_confidence !== undefined && profil.ensemble_confidence <= 0.20 && (
        <div className="card border-l-4 border-l-warning">
          <div className="card-content p-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-warning-soft flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="badge warning text-[10px]">Évaluation initiale</span>
                  <span className="badge neutral text-[10px]">Confiance {((profil.ensemble_confidence ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Profil calculé sur les données du formulaire — à affiner après la première surveillance physique.
                </p>
              </div>
              {canRecalculate && (
                <button
                  className="btn btn-secondary btn-sm gap-1 shrink-0"
                  onClick={() => onRecalculer(aerodrome.id)}
                  disabled={refreshing}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Affiner
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ONGLETS */}
      <div className="tabs-container border-b border-border">
        <div className="tabs flex gap-1">
          {ONGLETS.map((onglet) => {
            const Icon = onglet.icon
            const isActive = activeOnglet === onglet.id
            return (
              <button
                key={onglet.id}
                onClick={() => setActiveOnglet(onglet.id)}
                className={`tab px-4 py-2 font-medium transition-all ${
                  isActive
                    ? 'active border-b-2 border-role-primary text-role-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4" />
                {onglet.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="pt-4 pb-6">
        {renderContent()}
      </div>

      {showExportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowExportDialog(false)}>
          <div className="bg-background rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h3 className="text-lg font-semibold">Exporter les analyses</h3>
              <button onClick={() => setShowExportDialog(false)} className="btn btn-ghost btn-sm p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <RiskReportExport aerodromeId={aerodrome.id} />
            </div>
          </div>
        </div>
      )}

      {showFeedbackModal && (
        <FeedbackModal
          isOpen={showFeedbackModal}
          onClose={() => setShowFeedbackModal(false)}
          onSubmit={handleFeedbackSubmit}
          predictionType={feedbackPredictionType}
          predictedValue={feedbackPredictionType === 'prediction_3m' ? profil.prediction_3m : profil.prediction_6m}
          aerodromeName={aerodrome.nom}
        />
      )}

      {/* Panneau narration IA — branché sur useAIRiskAnalysis */}
      {showAINarrative && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAINarrative(false)}>
          <div className="bg-background rounded-2xl max-w-2xl w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title flex items-center gap-2">
                <Brain className="w-5 h-5 text-role-primary" />
                Analyse IA — {aerodrome.code_oaci}
              </h2>
              <button className="modal-close" onClick={() => setShowAINarrative(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body p-5 space-y-4">
              {loadingNarrative && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin text-role-primary" />
                  <span className="text-sm">Analyse en cours par l'IA…</span>
                </div>
              )}
              {errorNarrative && (
                <p className="text-sm text-danger">{errorNarrative}</p>
              )}
              {aiNarrative && (
                <div className="space-y-4">
                  <div className="card bg-primary-soft/20 border-primary/20">
                    <p className="text-sm leading-relaxed">{aiNarrative.narrative}</p>
                  </div>
                  <div className="card">
                    <p className="card-title text-sm mb-2">Explication du score</p>
                    <p className="text-sm text-muted-foreground">{aiNarrative.riskExplanation}</p>
                  </div>
                  {aiNarrative.keyInsights.length > 0 && (
                    <div className="card">
                      <p className="card-title text-sm mb-2">Points clés</p>
                      <ul className="space-y-1">
                        {aiNarrative.keyInsights.map((insight, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-role-primary mt-0.5">•</span>
                            {insight}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiNarrative.immediateActions.length > 0 && (
                    <div className="card border-danger/20">
                      <p className="card-title text-sm mb-2 text-danger">Actions immédiates</p>
                      <ul className="space-y-1">
                        {aiNarrative.immediateActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="w-3.5 h-3.5 text-danger mt-0.5 shrink-0" />
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiNarrative.mediumTermActions.length > 0 && (
                    <div className="card border-warning/20">
                      <p className="card-title text-sm mb-2 text-warning">Actions moyen terme (3–6 mois)</p>
                      <ul className="space-y-1">
                        {aiNarrative.mediumTermActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <Clock className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <button onClick={runNarrative} disabled={loadingNarrative} className="btn btn-ghost btn-sm gap-1">
                      {loadingNarrative ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Régénérer
                    </button>
                    <button onClick={() => setShowAINarrative(false)} className="btn btn-secondary btn-sm">
                      Fermer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showIASuggestions && (
        <IASuggestions
          aerodromeId={aerodrome.id}
          profil={profil}
          onClose={() => setShowIASuggestions(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Contenu aide-mémoire — Profil de Risque
// ─────────────────────────────────────────────────────────────

const RISQUE_HELP_SECTIONS: HelpSection[] = [
  {
    id: 'overview',
    title: 'Vue d\'ensemble du module',
    icon: Activity,
    content: (
      <div className="space-y-2">
        <p>Ce module calcule un <strong>score de risque global (0–100)</strong> pour chaque aérodrome en combinant cinq critères pondérés :</p>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong>C1 — Maturité SGS</strong> : niveau du Système de Gestion de la Sécurité (N1 à N5)</li>
          <li><strong>C2 — Efficacité PAC</strong> : taux de clôture des Plans d'Actions Correctives</li>
          <li><strong>C3 — Conformité</strong> : respect des exigences réglementaires ANACIM</li>
          <li><strong>C4 — Charge critique</strong> : volume et gravité des écarts non résolus</li>
          <li><strong>C5 — Résilience SLI</strong> : capacité du Service de Lutte contre l'Incendie</li>
        </ul>
        <p className="text-muted-foreground">Le score évolue dans le temps. Les tendances et prédictions sont calculées automatiquement par des modèles bayésiens et ensemblistes.</p>
      </div>
    ),
  },
  {
    id: 'scores',
    title: 'Lire les scores et niveaux',
    icon: Target,
    content: (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-success-soft rounded-lg">
            <p className="font-semibold text-success">80 – 100 · Excellent</p>
            <p className="text-muted-foreground">Faible risque — surveillance standard</p>
          </div>
          <div className="p-2 bg-role-primary-soft rounded-lg">
            <p className="font-semibold text-role-primary">60 – 79 · Bon</p>
            <p className="text-muted-foreground">Conformité satisfaisante, amélioration possible</p>
          </div>
          <div className="p-2 bg-warning-soft rounded-lg">
            <p className="font-semibold text-warning">30 – 59 · Modéré</p>
            <p className="text-muted-foreground">Actions correctives attendues dans les 90 jours</p>
          </div>
          <div className="p-2 bg-danger-soft rounded-lg">
            <p className="font-semibold text-danger">0 – 29 · Critique</p>
            <p className="text-muted-foreground">Intervention prioritaire — surveillance renforcée</p>
          </div>
        </div>
        <p className="text-muted-foreground">La <strong>tendance</strong> (hausse/stable/baisse) indique l'évolution sur les 3 dernières évaluations.</p>
      </div>
    ),
  },
  {
    id: 'tabs',
    title: 'Les onglets du détail aérodrome',
    icon: BarChart3,
    content: (
      <div className="space-y-1.5">
        <p><strong>Vue globale</strong> — Jauge principale, radar des 5 critères, indicateurs KPI</p>
        <p><strong>Matrice</strong> — Matrice risque × probabilité × gravité et carte de corrélation entre aérodromes</p>
        <p><strong>Prédictions</strong> — Projection 3 / 6 / 12 mois, prédictions d'incidents, calibration du modèle</p>
        <p><strong>Scénarios</strong> — Scénarios de risque générés automatiquement par le modèle bayésien</p>
        <p><strong>Recommandations</strong> — Actions prioritaires classées par urgence avec ressources disponibles</p>
        <p><strong>Analyses</strong> — Comparaison inter-aérodromes, carte de risque nationale, analyse approfondie</p>
      </div>
    ),
  },
  {
    id: 'glossary',
    title: 'Glossaire technique',
    icon: BookOpen,
    content: (
      <div className="space-y-2">
        <dl className="space-y-2">
          <div>
            <dt className="font-semibold">MAE (Mean Absolute Error)</dt>
            <dd className="text-muted-foreground">Erreur moyenne absolue entre les scores prédits et les scores réels observés. Plus la MAE est faible, plus le modèle est précis. Seuil acceptable : ≤ 10 points.</dd>
          </div>
          <div>
            <dt className="font-semibold">Biais systématique</dt>
            <dd className="text-muted-foreground">Tendance du modèle à systématiquement sur- ou sous-estimer. Un biais positif = le modèle est trop optimiste. Idéalement proche de zéro.</dd>
          </div>
          <div>
            <dt className="font-semibold">Intervalle de confiance (IC 95%)</dt>
            <dd className="text-muted-foreground">Plage dans laquelle le score réel devrait tomber 95 % du temps. Un IC large signale une forte incertitude sur la prédiction.</dd>
          </div>
          <div>
            <dt className="font-semibold">Prior / Posterior bayésien</dt>
            <dd className="text-muted-foreground">Le <strong>prior</strong> est la probabilité de risque estimée avant observation des données récentes. Le <strong>posterior</strong> est cette probabilité mise à jour après intégration des nouvelles données. Si posterior &gt; prior : le risque réel est plus élevé qu'attendu.</dd>
          </div>
          <div>
            <dt className="font-semibold">Black Swan</dt>
            <dd className="text-muted-foreground">Événement à très faible probabilité mais à impact extrême, non prévisible par les données historiques. Détecté par le modèle bayésien quand la posterior dépasse un seuil critique.</dd>
          </div>
          <div>
            <dt className="font-semibold">Confiance ensembliste</dt>
            <dd className="text-muted-foreground">Niveau de confiance du modèle ensembliste (combinaison de plusieurs modèles). En dessous de 20 %, le profil est en phase d'évaluation initiale et les prédictions sont indicatives.</dd>
          </div>
        </dl>
      </div>
    ),
  },
]

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

export function RisqueModule({ userRole }: RisqueModuleProps) {
const aerodromes = useOptimizedStore(s => s.aerodromes)
const profilsRisque = useOptimizedStore(s => s.profilsRisque)
const recalculerProfilRisque = useAppStore(s => s.recalculerProfilRisque)
const user = useOptimizedStore(s => s.user)
const computeFullRiskProfile = useAppStore(s => s.computeFullRiskProfile) 
  
  const [selectedAerodromeId, setSelectedAerodromeId] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const aerodromesFiltres = useMemo(() => {
    const actifs = aerodromes.filter((a) => !a.deleted_at)
    if (user?.aerodrome_id) return actifs.filter((a) => a.id === user.aerodrome_id)
    return actifs
  }, [aerodromes, user])

  const aerodromesAvecProfil = useMemo(() =>
    aerodromesFiltres.map((a) => ({
      aerodrome: a,
      profil: profilsRisque[a.id] ?? null,
    })),
    [aerodromesFiltres, profilsRisque]
  )

  const selectedAerodromeData = useMemo(() => {
    if (selectedAerodromeId === 'all') return null
    return aerodromesAvecProfil.find((e) => e.aerodrome.id === selectedAerodromeId)
  }, [aerodromesAvecProfil, selectedAerodromeId])

  const profilSelectionne = selectedAerodromeData?.profil ?? null
  const aerodromeSelectionne = selectedAerodromeData?.aerodrome ?? null

  const canRecalculate = userRole === 'admin' || userRole === 'inspector'

  const stats = useMemo(() => {
    const profils = aerodromesFiltres
      .map(a => profilsRisque[a.id])
      .filter(Boolean)
    
    if (!profils.length) return null
    
    const moyenne = profils.reduce((s, p) => s + p.score_global, 0) / profils.length
    const critiques = profils.filter((p) => p.score_global < 30).length
    const excellents = profils.filter((p) => p.score_global >= 80).length
    const enDegradation = profils.filter((p) => p.tendance === 'baisse').length
    
    return { 
      moyenne: Math.round(moyenne), 
      critiques, 
      excellents, 
      total: profils.length,
      enDegradation
    }
  }, [aerodromesFiltres, profilsRisque])

  const handleRecalculer = useCallback(async (aerodromeId: string) => {
    setRefreshing(true)
    await recalculerProfilRisque(aerodromeId)
    if (computeFullRiskProfile) {
      await computeFullRiskProfile(aerodromeId)
    }
    setRefreshing(false)
  }, [recalculerProfilRisque, computeFullRiskProfile])

  const hasData = aerodromesAvecProfil.some(item => item.profil !== null)

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="profil-risque">
      
      <ModuleHeader
        icon={<Activity />}
        title="Profil de Risque"
        description="Analyse multicritère avancée — Modèles prédictifs"
        actions={<div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="btn btn-sm btn-secondary gap-1.5"
            title="Aide & Glossaire"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Aide
          </button>
          <select
            value={selectedAerodromeId}
            onChange={(e) => setSelectedAerodromeId(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="all">🌍 Tous les aérodromes</option>
            {aerodromesFiltres.map((a) => (
              <option key={a.id} value={a.id}>
                ✈️ {a.code_oaci} — {a.nom}
              </option>
            ))}
          </select>
        </div>}
      />

      {/* ── Modal Aide & Glossaire ─────────────────────────────────── */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="Guide — Profil de Risque"
        subtitle="Comprendre l'analyse multicritère et les modèles prédictifs"
        sections={RISQUE_HELP_SECTIONS}
      />

      {stats && selectedAerodromeId === 'all' && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon bg-role-primary-soft"><Target className="w-5 h-5 text-role-primary" /></div>
            <div className="kpi-content">
              <div className="kpi-label">Score moyen</div>
              <div className={`kpi-value ${getNiveauConfig(stats.moyenne).textColor}`}>{stats.moyenne}</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon bg-primary-soft"><Plane className="w-5 h-5 text-primary" /></div>
            <div className="kpi-content">
              <div className="kpi-label">Total aérodromes</div>
              <div className="kpi-value">{stats.total}</div>
            </div>
          </div>
          <div className="kpi-card border-danger">
            <div className="kpi-icon bg-danger-soft"><AlertTriangle className="w-5 h-5 text-danger" /></div>
            <div className="kpi-content">
              <div className="kpi-label text-danger">Critiques</div>
              <div className="kpi-value text-danger">{stats.critiques}</div>
            </div>
          </div>
          <div className="kpi-card border-success">
            <div className="kpi-icon bg-success-soft"><CheckCircle2 className="w-5 h-5 text-success" /></div>
            <div className="kpi-content">
              <div className="kpi-label text-success">Excellents</div>
              <div className="kpi-value text-success">{stats.excellents}</div>
            </div>
          </div>
          <div className="kpi-card border-warning">
            <div className="kpi-icon bg-warning-soft"><TrendingDown className="w-5 h-5 text-warning" /></div>
            <div className="kpi-content">
              <div className="kpi-label text-warning">En dégradation</div>
              <div className="kpi-value text-warning">{stats.enDegradation}</div>
            </div>
          </div>
        </div>
      )}

      {selectedAerodromeId === 'all' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {aerodromesAvecProfil.length === 0 && (
            <div className="card col-span-full">
              <div className="card-content py-12 text-center text-muted-foreground">
                <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Aucun aérodrome trouvé.</p>
              </div>
            </div>
          )}
          {aerodromesAvecProfil.map(({ aerodrome, profil }) => (
            <AerodromeCard
              key={aerodrome.id}
              aerodrome={aerodrome}
              profil={profil}
              userRole={userRole}
              refreshing={refreshing}
              onRecalculer={handleRecalculer}
              onSelect={setSelectedAerodromeId}
            />
          ))}
        </div>
      ) : (
        profilSelectionne && aerodromeSelectionne ? (
          <AerodromeDetailView
            aerodrome={aerodromeSelectionne}
            profil={profilSelectionne}
            userRole={userRole}
            onBack={() => setSelectedAerodromeId('all')}
            onRecalculer={handleRecalculer}
            refreshing={refreshing}
          />
        ) : (
          <div className="card">
            <div className="card-content py-12 text-center text-muted-foreground">
              <Info className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="mb-2">Profil non encore calculé pour cet aérodrome.</p>
              {canRecalculate && (
                <button
                  className="btn btn-secondary btn-sm gap-2"
                  onClick={() => handleRecalculer(selectedAerodromeId)}
                  disabled={refreshing}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Calculer maintenant
                </button>
              )}
            </div>
          </div>
        )
      )}

      {/* Légende - n'apparaît que s'il y a des données */}
      {hasData && (
        <div className="card bg-muted border-dashed">
          <div className="card-content pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Info className="w-3 h-3" />
              Légende des niveaux de risque
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {LEGENDE_NIVEAUX.map((lvl) => (
                <div key={lvl.label} className={`p-3 rounded-xl ${lvl.softBg} border border-border`}>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{lvl.icon}</span>
                    <span className={lvl.badgeClass}>{lvl.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Fréquence : {lvl.freq}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RisqueModule