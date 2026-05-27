// components/modules/profil-risque/DrillDownAnalysis.tsx
'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Info,
  Calendar,
  Clock,
  Target,
  Shield,
  Zap,
  Eye,
  FileText,
  Download,
  Share2,
  X,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  PieChart,
  LineChart,
  MapPin,
} from 'lucide-react'
import { useAppStore, ProfilRisque, Aerodrome } from '@/lib/store'

interface DrillDownAnalysisProps {
  aerodromeId: string
  onClose?: () => void
}

interface DetailSection {
  id: string
  title: string
  icon: React.ElementType
  color: string
}

const SECTIONS: DetailSection[] = [
  { id: 'overview', title: "Vue d'ensemble", icon: Eye, color: 'text-blue-600' },
  { id: 'criteria', title: 'Détail des critères', icon: BarChart3, color: 'text-green-600' },
  { id: 'trends', title: 'Analyse des tendances', icon: LineChart, color: 'text-purple-600' },
  { id: 'alerts', title: 'Alertes et recommandations', icon: AlertTriangle, color: 'text-red-600' },
  { id: 'history', title: 'Historique', icon: Calendar, color: 'text-orange-600' },
]

function getScoreLevel(score: number): 'excellent' | 'bon' | 'modere' | 'critique' {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'bon'
  if (score >= 30) return 'modere'
  return 'critique'
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-blue-600'
  if (score >= 30) return 'text-orange-600'
  return 'text-red-600'
}

function getScoreBg(score: number): string {
  if (score >= 80) return 'bg-green-100'
  if (score >= 60) return 'bg-blue-100'
  if (score >= 30) return 'bg-orange-100'
  return 'bg-red-100'
}

function getScoreProgressClass(score: number): string {
  if (score >= 80) return 'progress-faible'
  if (score >= 60) return 'progress-moyen'
  if (score >= 30) return 'progress-eleve'
  return 'progress-critique'
}

function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr || '-').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function DrillDownAnalysis({ aerodromeId, onClose }: DrillDownAnalysisProps) {
  const [activeSection, setActiveSection] = useState<string>('overview')
  const [showExportDialog, setShowExportDialog] = useState(false)

  const aerodromes = useAppStore((state) => state.aerodromes)
  const profilsRisque = useAppStore((state) => state.profilsRisque)
  const historiqueScoresMap = useAppStore((state) => state.historiqueScores)
  const allProactiveAlerts = useAppStore((state) => state.proactiveAlerts)
  const allActionOutcomes = useAppStore((state) => state.actionOutcomes)

  const historiqueScores = useMemo(
    () => historiqueScoresMap[aerodromeId] ?? [],
    [historiqueScoresMap, aerodromeId]
  )
  const proactiveAlerts = useMemo(
    () => allProactiveAlerts.filter(a => a.aerodrome_id === aerodromeId && !a.resolved_at),
    [allProactiveAlerts, aerodromeId]
  )
  const actionOutcomes = useMemo(
    () => allActionOutcomes.filter(a => a.aerodrome_id === aerodromeId),
    [allActionOutcomes, aerodromeId]
  )

  const aerodrome = aerodromes.find(a => a.id === aerodromeId)
  const profil = profilsRisque[aerodromeId]

  if (!aerodrome || !profil) {
    return (
      <div className="card">
        <div className="card-content py-12 text-center text-muted-foreground">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Données non disponibles pour cet aérodrome</p>
        </div>
      </div>
    )
  }

  const scoreLevel = getScoreLevel(profil.score_global)
  const scoreColor = getScoreColor(profil.score_global)
  const scoreBg = getScoreBg(profil.score_global)
  const progressClass = getScoreProgressClass(profil.score_global)

  const historiqueStats = useMemo(() => {
    if (historiqueScores.length < 2) return null

    const first = historiqueScores[0]
    const last = historiqueScores[historiqueScores.length - 1]
    const evolution = last.score - first.score
    const maxScore = Math.max(...historiqueScores.map(h => h.score))
    const minScore = Math.min(...historiqueScores.map(h => h.score))
    const moyenne = historiqueScores.reduce((a, b) => a + b.score, 0) / historiqueScores.length

    let tendance: 'hausse' | 'baisse' | 'stable' = 'stable'
    if (evolution > 2) tendance = 'hausse'
    else if (evolution < -2) tendance = 'baisse'

    return { evolution, maxScore, minScore, moyenne: Math.round(moyenne), tendance }
  }, [historiqueScores])

  const actionEfficiency = useMemo(() => {
    if (actionOutcomes.length === 0) return null
    const avgEffectiveness = actionOutcomes.reduce((a, b) => a + b.effectiveness, 0) / actionOutcomes.length
    const suivies = actionOutcomes.filter(a => a.was_followed).length
    return { avgEffectiveness: Math.round(avgEffectiveness), suivies, total: actionOutcomes.length }
  }, [actionOutcomes])

  return (
    <>
      <div className="card border-l-4 border-l-role-primary animate-fade-up">
        {/* En-tête */}
        <div className={`${scoreBg} rounded-t-xl p-4 border-b`}>
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white shadow-md flex items-center justify-center">
                <span className="text-xl">✈️</span>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {aerodrome.code_oaci} — {aerodrome.nom}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="badge outline text-[10px] flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {aerodrome.region}
                  </span>
                  <span className="badge outline text-[10px]">
                    {aerodrome.type === 'international' ? '🌍 International' : '🇸🇳 National'}
                  </span>
                  <span className="badge outline text-[10px] flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Cat. {aerodrome.categorie_sslia}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${scoreBg} ${scoreColor}`}>
                <span className="text-sm font-semibold">Score global</span>
                <span className="text-xl font-bold">{profil.score_global}/100</span>
              </div>
              <button
                type="button"
                className="action-button w-8 h-8 p-0"
                title="Exporter l'analyse"
                onClick={() => setShowExportDialog(true)}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              {onClose && (
                <button
                  type="button"
                  className="action-button w-8 h-8 p-0"
                  onClick={onClose}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="card-content p-5 space-y-5">
          {/* Navigation par onglets */}
          <div className="flex flex-wrap gap-1 border-b border-gray-200 pb-2">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                    isActive
                      ? `${section.color} bg-gray-100 font-semibold`
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <Icon className="w-4 h-4" />
                  {section.title}
                </button>
              )
            })}
          </div>

          {/* Section Vue d'ensemble */}
          {activeSection === 'overview' && (
            <div className="space-y-4 animate-fade-up">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">Score global</span>
                    <span className={`text-sm font-bold ${scoreColor}`}>{profil.score_global}/100</span>
                  </div>
                  <div className={`progress h-3 ${progressClass}`}>
                    <div className="progress-bar" style={{ width: `${profil.score_global}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0</span>
                    <span>Critique</span>
                    <span>30</span>
                    <span>Modéré</span>
                    <span>60</span>
                    <span>Bon</span>
                    <span>80</span>
                    <span>100</span>
                  </div>
                </div>
                <div className={`px-3 py-1.5 rounded-full ${scoreBg} ${scoreColor} text-sm font-semibold`}>
                  {scoreLevel === 'excellent' ? '🏆 Excellent' :
                   scoreLevel === 'bon' ? '✓ Bon' :
                   scoreLevel === 'modere' ? '⚠️ Modéré' : '🔴 Critique'}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Tendance</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    {profil.tendance === 'hausse' && <TrendingUp className="w-5 h-5 text-green-600" />}
                    {profil.tendance === 'baisse' && <TrendingDown className="w-5 h-5 text-red-600 animate-pulse" />}
                    {profil.tendance === 'stable' && <Minus className="w-5 h-5 text-gray-500" />}
                    <span className={`text-sm font-semibold ${
                      profil.tendance === 'hausse' ? 'text-green-600' :
                      profil.tendance === 'baisse' ? 'text-red-600' : 'text-gray-600'
                    }`}>
                      {profil.tendance === 'hausse' ? 'Hausse' :
                       profil.tendance === 'baisse' ? 'Baisse' : 'Stable'}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Prédiction 3m</p>
                  <p className={`text-lg font-bold ${getScoreColor(profil.prediction_3m)}`}>
                    {profil.prediction_3m}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Prédiction 6m</p>
                  <p className={`text-lg font-bold ${getScoreColor(profil.prediction_6m)}`}>
                    {profil.prediction_6m}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Dernier calcul</p>
                  <p className="text-sm font-medium">{profil.computed_at ? new Date(profil.computed_at).toLocaleDateString('fr-FR') : 'N/A'}</p>
                </div>
              </div>

              {profil.velocity_metrics && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-xs text-gray-500">Vitesse de variation</p>
                      <p className={`text-sm font-semibold ${profil.velocity_metrics.vitesse < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {profil.velocity_metrics.vitesse > 0 ? '+' : ''}{profil.velocity_metrics.vitesse} pts/mois
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-50">
                    <Shield className="w-4 h-4 text-purple-600" />
                    <div>
                      <p className="text-xs text-gray-500">Stress système</p>
                      <p className={`text-sm font-semibold ${profil.system_stress?.niveau_stress === 'critique' ? 'text-red-600' : 'text-orange-600'}`}>
                        {profil.system_stress?.niveau_stress || 'Non évalué'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-green-50">
                    <Target className="w-4 h-4 text-green-600" />
                    <div>
                      <p className="text-xs text-gray-500">Efficacité actions</p>
                      <p className="text-sm font-semibold text-green-600">
                        {actionEfficiency?.avgEffectiveness || 0}%
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {proactiveAlerts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    Alertes actives ({proactiveAlerts.length})
                  </p>
                  {proactiveAlerts.slice(0, 2).map((alert) => (
                    <div key={alert.id} className="alert alert-warning !p-2">
                      <span className="alert-icon">⚠️</span>
                      <div className="alert-content">
                        <p className="alert-title text-sm">{alert.message_court}</p>
                        <p className="alert-description text-xs">{alert.action_suggerer}</p>
                      </div>
                    </div>
                  ))}
                  {proactiveAlerts.length > 2 && (
                    <p className="text-xs text-gray-400 text-center">+{proactiveAlerts.length - 2} autre(s) alerte(s)</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section Détail des critères */}
          {activeSection === 'criteria' && (
            <div className="space-y-3 animate-fade-up">
              {[
                { key: 'c1', label: 'Maturité & Culture SGS', valeur: profil.c1, poids: 20, description: "Niveau de maturité du Système de Gestion de la Sécurité" },
                { key: 'c2', label: 'Efficacité & Réactivité PAC', valeur: profil.c2, poids: 25, description: "Délais de traitement des Plans d'Actions Correctives" },
                { key: 'c3', label: 'Conformité Technique', valeur: profil.c3, poids: 20, description: 'Respect des normes et réglementations techniques' },
                { key: 'c4', label: 'Charge Critique Non Résolue', valeur: profil.c4, poids: 20, description: 'Nombre et sévérité des écarts actifs' },
                { key: 'c5', label: 'Résilience & Historique Sécurité', valeur: profil.c5, poids: 15, description: 'Historique des événements de sécurité' },
              ].map((crit) => (
                <div key={crit.key} className="p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div>
                      <span className="font-semibold text-gray-800 text-sm">{crit.label}</span>
                      <p className="text-xs text-gray-400">{crit.description}</p>
                    </div>
                    <span className="badge outline text-[10px]">Poids {crit.poids}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className={`progress h-2 ${getScoreProgressClass(crit.valeur)}`}>
                        <div className="progress-bar" style={{ width: `${crit.valeur}%` }} />
                      </div>
                    </div>
                    <span className={`text-lg font-bold ${getScoreColor(crit.valeur)} w-12 text-right`}>
                      {crit.valeur}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {crit.valeur >= 80 ? '✓ Niveau excellent - bonnes pratiques établies' :
                     crit.valeur >= 60 ? '✓ Niveau satisfaisant - peut être amélioré' :
                     crit.valeur >= 30 ? '⚠️ Niveau insuffisant - action requise' :
                     '🔴 Niveau critique - action immédiate nécessaire'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Section Analyse des tendances */}
          {activeSection === 'trends' && historiqueStats && (
            <div className="space-y-4 animate-fade-up">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Évolution</p>
                  <div className="flex items-center justify-center gap-1">
                    {historiqueStats.evolution > 0 && <TrendingUp className="w-4 h-4 text-green-600" />}
                    {historiqueStats.evolution < 0 && <TrendingDown className="w-4 h-4 text-red-600" />}
                    <span className={`text-sm font-bold ${historiqueStats.evolution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {historiqueStats.evolution > 0 ? '+' : ''}{historiqueStats.evolution}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Maximum</p>
                  <p className="text-lg font-bold text-green-600">{historiqueStats.maxScore}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Minimum</p>
                  <p className="text-lg font-bold text-red-600">{historiqueStats.minScore}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Moyenne</p>
                  <p className="text-lg font-bold text-blue-600">{historiqueStats.moyenne}</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Évolution du score</p>
                <div className="flex items-end gap-1 h-32">
                  {historiqueScores.slice(-12).map((point, idx) => {
                    const height = (point.score / 100) * 100
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center">
                        <div
                          className={`w-full rounded-t transition-all ${
                            point.score >= 80 ? 'bg-green-500' :
                            point.score >= 60 ? 'bg-blue-500' :
                            point.score >= 30 ? 'bg-warning' : 'bg-danger'
                          }`}
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[8px] text-gray-400 mt-1 rotate-45 origin-left">
                          {point.date ? new Date(point.date).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }) : 'N/A'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="alert alert-info">
                <span className="alert-icon">📈</span>
                <div className="alert-content">
                  <p className="alert-title">Interprétation</p>
                  <p className="alert-description">
                    {historiqueStats.tendance === 'hausse' && "La tendance est à l'amélioration. Maintenir les actions en cours."}
                    {historiqueStats.tendance === 'baisse' && 'La tendance est à la dégradation. Une action corrective est recommandée.'}
                    {historiqueStats.tendance === 'stable' && 'La situation est stable. Poursuivre la surveillance programmée.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section Alertes et recommandations */}
          {activeSection === 'alerts' && (
            <div className="space-y-3 animate-fade-up">
              {proactiveAlerts.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
                  <p className="text-sm">Aucune alerte active</p>
                  <p className="text-xs">Toutes les alertes ont été traitées</p>
                </div>
              ) : (
                proactiveAlerts.map((alert) => (
                  <div key={alert.id} className={`p-3 rounded-xl border ${
                    alert.niveau_urgence === 'critique' ? 'border-danger/20 bg-danger/5' :
                    alert.niveau_urgence === 'alerte' ? 'border-warning/20 bg-warning/5' :
                    'border-primary/20 bg-primary/5'
                  }`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`w-4 h-4 ${
                        alert.niveau_urgence === 'critique' ? 'text-danger' :
                        alert.niveau_urgence === 'alerte' ? 'text-warning' :
                        'text-blue-500'
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800">{alert.message_court}</p>
                        <p className="text-xs text-gray-600 mt-1">{alert.message_long}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`${
                            alert.niveau_urgence === 'critique' ? 'badge danger' :
                            alert.niveau_urgence === 'alerte' ? 'badge warning' :
                            'badge primary'
                          } text-[10px]`}>
                            {alert.probabilite_degradation_3m}% Dégradation
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {alert.created_at ? new Date(alert.created_at).toLocaleDateString('fr-FR') : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {actionEfficiency && (
                <div className="mt-4 p-3 rounded-xl bg-green-50 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-4 h-4 text-green-600" />
                    <p className="text-sm font-semibold text-green-700">Efficacité des actions</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="progress flex-1 h-2 progress-success">
                      <div className="progress-bar" style={{ width: `${actionEfficiency.avgEffectiveness}%` }} />
                    </div>
                    <span className="text-sm font-bold text-green-600">{actionEfficiency.avgEffectiveness}%</span>
                  </div>
                  <p className="text-xs text-green-600 mt-2">
                    {actionEfficiency.suivies}/{actionEfficiency.total} actions suivies
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Section Historique */}
          {activeSection === 'history' && (
            <div className="space-y-3 animate-fade-up">
              {historiqueScores.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Aucun historique disponible</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {[...historiqueScores].reverse().slice(0, 20).map((point, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                          <Calendar className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {point.date ? new Date(point.date).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            }) : 'N/A'}
                          </p>
                          {point.c1 && (
                            <div className="flex gap-2 text-[10px] text-gray-400 mt-0.5">
                              <span>C1:{point.c1}</span>
                              <span>C2:{point.c2}</span>
                              <span>C3:{point.c3}</span>
                              <span>C4:{point.c4}</span>
                              <span>C5:{point.c5}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-full text-sm font-bold ${getScoreBg(point.score)} ${getScoreColor(point.score)}`}>
                        {point.score}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 rounded-b-xl p-3 flex justify-between text-[10px] text-gray-400">
          <span>🔍 Analyse approfondie du profil de risque</span>
          <span>ID: {aerodromeId.slice(0, 8)}...</span>
        </div>
      </div>

      {/* Modal d'export */}
      {showExportDialog && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setShowExportDialog(false)}>
          <div
            className="modal-content max-w-sm border-t-4 border-t-role-primary"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title flex items-center gap-2 text-base">
                <Download className="w-4 h-4 text-blue-600" />
                Exporter l'analyse
              </h2>
              <button type="button" className="action-button" onClick={() => setShowExportDialog(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body space-y-3 py-3">
              <button type="button" className="btn btn-secondary w-full gap-2 justify-start">
                <FileText className="w-4 h-4" />
                PDF - Rapport complet
              </button>
              <button type="button" className="btn btn-secondary w-full gap-2 justify-start">
                <FileText className="w-4 h-4" />
                CSV - Données brutes
              </button>
              <button type="button" className="btn btn-secondary w-full gap-2 justify-start">
                <Share2 className="w-4 h-4" />
                JSON - API
              </button>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="action-button"
                onClick={() => setShowExportDialog(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default DrillDownAnalysis
