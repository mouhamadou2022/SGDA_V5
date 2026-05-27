// components/modules/ml-monitoring/MLMonitoringModule.tsx
'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import type { MLRiskCorrelationData } from '@/lib/store/advancedModelsSlice'
import type { AuthUser } from '@/lib/auth'
import type { RecalibrationAlertRecord, ModelCalibrationRecord } from '@/lib/store'
import type { RandomForestModelStored, ModelPerformanceMetrics, ModelTrainingConfig, TrainingHistoryEntry, TrainingStats } from '@/lib/store/models'
import type { RiskGraphStored } from '@/lib/store/models'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'
import {
  Brain,
  Target,
  TrendingUp,
  Network,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Settings,
  Database,
  BarChart3,
  Layers,
  FileText,
  Download,
  Upload,
  RotateCcw,
  AlertCircle,
  Clock,
  BookOpen,
} from 'lucide-react'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { HelpModal, type HelpSection } from '@/components/ui/HelpModal'
import { getABStats, getABHistory, clearABHistory } from '@/lib/ab_testing'
import { Cpu, FlaskConical, GitCompare } from 'lucide-react'

interface MLMonitoringModuleProps {
  user: AuthUser
}

export default function MLMonitoringModule({ user }: MLMonitoringModuleProps) {
  const learningFeedbacks = useAppStore(s => s.learningFeedbacks)
  const currentModel = useAppStore(s => s.currentModel)
  const recalibrationAlerts = useAppStore(s => s.recalibrationAlerts)
  const calculatePerformance = useAppStore(s => s.calculatePerformance)
  const getDetailedLearningStats = useAppStore(s => s.getDetailedLearningStats)
  const recalibrateModel = useAppStore(s => s.recalibrateModel)
  const exportLearningData = useAppStore(s => s.exportLearningData)
  const importLearningData = useAppStore(s => s.importLearningData)
  const resetLearningData = useAppStore(s => s.resetLearningData)
  const getLearningStatsPAC = useAppStore(s => s.getLearningStatsPAC)
  const rfModelInfo = useAppStore(s => s.rfModelInfo)
  const graphModelInfo = useAppStore(s => s.graphModelInfo)
  const modelMetrics = useAppStore(s => s.modelMetrics)
  const rfSamplesCount = useAppStore(s => s.rfSamplesCount)
  const modelTrainingConfig = useAppStore(s => s.modelTrainingConfig)
  const trainRandomForestModel = useAppStore(s => s.trainRandomForestModel)
  const resetAdvancedModels = useAppStore(s => s.resetAdvancedModels)
  const refreshModelInfo = useAppStore(s => s.refreshModelInfo)
  const setAutoTrainEnabled = useAppStore(s => s.setAutoTrainEnabled)
  const setTrainInterval = useAppStore(s => s.setTrainInterval)
  const getMLRiskCorrelation = useAppStore(s => s.getMLRiskCorrelation)
  const getTrainingHistory = useAppStore(s => s.getTrainingHistory)
  const getTrainingStats = useAppStore(s => s.getTrainingStats)
  const exportTrainingHistoryCSV = useAppStore(s => s.exportTrainingHistoryCSV)
  const aerodromes               = useAppStore(s => s.aerodromes)
  const profilsRisque            = useAppStore(s => s.profilsRisque)

  const [activeTab, setActiveTab] = useState<'learning' | 'pac' | 'random-forest' | 'graph' | 'history' | 'settings' | 'server-nn'>('learning')
  const [showHelp, setShowHelp] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const stats = learningFeedbacks.length > 0 ? calculatePerformance() : null
  const detailedStats = learningFeedbacks.length > 0 ? getDetailedLearningStats() : null
  const pacStats = getLearningStatsPAC()
  const pendingAlerts = recalibrationAlerts?.filter(a => !a.traitee) || []

  const mlRiskCorrelation: MLRiskCorrelationData = useMemo(() => getMLRiskCorrelation(), [rfModelInfo, graphModelInfo, rfSamplesCount])

  const handleRecalibrate = () => {
    recalibrateModel('manuel', user?.prenom && user?.nom ? `${user.prenom} ${user.nom}` : 'admin')
  }

  const handleExport = () => {
    const data = exportLearningData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `learning-data-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        setIsImporting(true)
        setImportError(null)
        const text = await file.text()
        importLearningData(text)
      } catch (err: unknown) {
        setImportError(err instanceof Error ? err.message : "Erreur lors de l'import")
      } finally {
        setIsImporting(false)
      }
    }
    input.click()
  }

  const handleTrainRF = () => {
    trainRandomForestModel(10, 4)
  }

  const barColor = 'var(--role-primary)'

  const tabs = [
    { id: 'learning' as const, label: 'Learning Engine', icon: Brain },
    { id: 'pac' as const, label: 'PAC Learning', icon: Target },
    { id: 'random-forest' as const, label: 'Random Forest', icon: TrendingUp },
    { id: 'graph' as const, label: 'Graph Network', icon: Network },
    { id: 'server-nn' as const, label: 'Serveur NN + A/B', icon: Cpu },
    { id: 'history' as const, label: 'Historique', icon: Clock },
    { id: 'settings' as const, label: 'Configuration', icon: Settings },
  ]

  const kpis = [
    {
      label: 'Learning Engine',
      value: detailedStats?.total_feedbacks || 0,
      icon: <Brain className="h-5 w-5" />,
      trend: 'feedbacks',
      trendUp: true,
      tooltip: "Nombre de retours d'inspecteurs intégrés dans le modèle d'apprentissage. Plus il y en a, plus les prédictions sont fiables.",
    },
    {
      label: 'Précision',
      value: `${stats?.precision_globale ?? 0}%`,
      icon: <Activity className="h-5 w-5" />,
      trend: `v${currentModel?.version || 1}`,
      trendUp: (stats?.precision_globale ?? 0) >= 70,
      tooltip: "Taux de prédictions correctes du modèle. Seuil acceptable : ≥ 70 %. En dessous, une recalibration est recommandée.",
    },
    {
      label: 'Alertes',
      value: pendingAlerts.length,
      icon: <AlertTriangle className="h-5 w-5" />,
      trend: 'en attente',
      trendUp: false,
      warning: pendingAlerts.length > 0,
      tooltip: "Alertes de recalibration en attente de traitement. Chaque alerte signale une dérive du modèle détectée automatiquement.",
    },
    {
      label: 'Échantillons RF',
      value: rfSamplesCount,
      icon: <Database className="h-5 w-5" />,
      trend: rfModelInfo ? `Précision: ${(rfModelInfo.accuracy * 100).toFixed(0)}%` : 'non entraîné',
      trendUp: true,
      tooltip: "Nombre d'échantillons d'inspection disponibles pour entraîner le modèle Random Forest. Minimum requis : 10 échantillons.",
    },
    {
      label: 'Score Risque Moyen',
      value: `${mlRiskCorrelation.avgRiskScore}/100`,
      icon: <Activity className="h-5 w-5" />,
      trend: `${mlRiskCorrelation.aerodromeCount} aérodromes`,
      trendUp: mlRiskCorrelation.avgRiskScore >= 60,
      tooltip: "Score de risque moyen calculé par les modèles ML sur l'ensemble des aérodromes actifs.",
    },
    {
      label: 'Convergence ML-Risque',
      value: `${mlRiskCorrelation.convergenceScore}%`,
      icon: <Target className="h-5 w-5" />,
      trend: mlRiskCorrelation.alignmentScore >= 60 ? 'bon alignement' : 'faible alignement',
      trendUp: mlRiskCorrelation.convergenceScore >= 60,
      tooltip: "Cohérence entre les prédictions ML et les scores du profil de risque. ≥ 60 % = bonne convergence. Un écart important indique que les deux systèmes divergent.",
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in" data-module="ml-monitoring" data-role={user?.role}>
      <ModuleHeader
        icon={<Brain className="h-8 w-8 text-role-primary" />}
        title="Monitoring des Modèles d'Apprentissage"
        description="Surveillance des performances et entraînement des modèles ML"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelp(true)}
              className="btn btn-sm btn-secondary gap-1.5"
              title="Aide & Glossaire"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Aide
            </button>
            <button onClick={handleExport} className="btn btn-sm btn-secondary gap-1.5">
              <Download className="h-4 w-4" /> Exporter
            </button>
            <button onClick={handleImport} disabled={isImporting} className="btn btn-sm btn-secondary gap-1.5">
              <Upload className="h-4 w-4" /> {isImporting ? 'Import...' : 'Importer'}
            </button>
          </div>
        }
      />

      {/* ── Modal Aide & Glossaire ─────────────────────────────────── */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="Guide — Monitoring ML"
        subtitle="Comprendre les modèles d'apprentissage et les métriques de performance"
        sections={ML_HELP_SECTIONS}
      />

      {importError && (
        <div className="alert alert-error animate-fade-up">
          <AlertCircle className="alert-icon" />
          <div className="alert-content">{importError}</div>
        </div>
      )}

      {/* KPIs */}
      <div className="kpi-grid">
        {kpis.map((kpi, idx) => (
          <div key={kpi.label} className="kpi-card animate-fade-up" style={{ animationDelay: `${idx * 0.05}s` }}>
            <div className="kpi-icon">{kpi.icon}</div>
            <div className="kpi-content">
              <div className="kpi-label">
                {kpi.label}
                {(kpi as any).tooltip && <InfoTooltip content={(kpi as any).tooltip} />}
              </div>
              <div className={`kpi-value ${kpi.warning ? 'text-warning' : ''}`}>{kpi.value}</div>
              <div className={`kpi-trend ${kpi.trendUp ? 'up' : 'down'}`}>{kpi.trend}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs-container border-b border-border">
        <div className="tabs flex gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab px-4 py-2 font-medium transition-all ${
                  activeTab === tab.id
                    ? 'active border-b-2 border-role-primary text-role-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="tab-icon" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content space-y-6">
        {activeTab === 'learning' && (
          <LearningTab
            stats={stats}
            detailedStats={detailedStats}
            currentModel={currentModel}
            pendingAlerts={pendingAlerts}
            onRecalibrate={handleRecalibrate}
            onReset={resetLearningData}
            barColor={barColor}
            mlRiskCorrelation={mlRiskCorrelation}
          />
        )}

        {activeTab === 'pac' && (
          <PACTab pacStats={pacStats} barColor={barColor} />
        )}

        {activeTab === 'random-forest' && (
          <RFTab
            rfModelInfo={rfModelInfo}
            rfSamplesCount={rfSamplesCount}
            modelMetrics={modelMetrics}
            onTrain={handleTrainRF}
            barColor={barColor}
            mlRiskCorrelation={mlRiskCorrelation}
          />
        )}

        {activeTab === 'graph' && (
          <GraphTab
            graphModelInfo={graphModelInfo}
            mlRiskCorrelation={mlRiskCorrelation}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab
            getTrainingHistory={getTrainingHistory}
            getTrainingStats={getTrainingStats}
            exportTrainingHistoryCSV={exportTrainingHistoryCSV}
          />
        )}

        {activeTab === 'server-nn' && (
          <ServerNNTab
            aerodromes={aerodromes}
            profilsRisque={profilsRisque}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            modelTrainingConfig={modelTrainingConfig}
            setAutoTrainEnabled={setAutoTrainEnabled}
            setTrainInterval={setTrainInterval}
            resetAdvancedModels={resetAdvancedModels}
            refreshModelInfo={refreshModelInfo}
          />
        )}
      </div>
    </div>
  )
}

function LearningTab({
  stats,
  detailedStats,
  currentModel,
  pendingAlerts,
  onRecalibrate,
  onReset,
  barColor,
  mlRiskCorrelation,
}: {
  stats: { precision_globale: number; precision_par_domaine: Record<string, number>; taux_faux_positifs: number; taux_faux_negatifs: number; total_feedbacks: number; feedbacks_recents: number } | null
  detailedStats: { total_feedbacks: number; taux_justesse: number; alertes_pending: number; dernier_recalibrage: string; version_modele: number; precision_par_domaine: Record<string, number>; items_ameliores: number; items_degrades: number; confiance_moyenne: number } | null
  currentModel: ModelCalibrationRecord | null
  pendingAlerts: RecalibrationAlertRecord[]
  onRecalibrate: () => void
  onReset: () => void
  barColor: string
  mlRiskCorrelation: MLRiskCorrelationData
}) {
  if (!stats && !detailedStats) {
    return (
      <div className="text-center py-12 text-muted">
        <Brain className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg font-medium">Aucune donnée d'apprentissage</p>
        <p className="text-sm">Les feedbacks collectés pendant les inspections apparaîtront ici.</p>
      </div>
    )
  }

  const domainChartData = useMemo(() => {
    if (!detailedStats?.precision_par_domaine) return []
    return Object.entries(detailedStats.precision_par_domaine).map(([domaine, precision]) => ({
      name: domaine,
      Précision: precision as number,
    }))
  }, [detailedStats])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Performance */}
      <div className="card lg:col-span-2 animate-fade-up">
        <div className="card-header pb-2">
          <div className="card-title text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-role-primary" />
            Métriques de Performance
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard label="Précision globale" value={`${stats?.precision_globale ?? 0}%`} color="text-success" />
            <MetricCard label="Faux positifs" value={`${stats?.taux_faux_positifs ?? 0}%`} color={(stats?.taux_faux_positifs ?? 0) > 15 ? 'text-danger' : 'text-warning'} />
            <MetricCard label="Faux négatifs" value={`${stats?.taux_faux_negatifs ?? 0}%`} color={(stats?.taux_faux_negatifs ?? 0) > 10 ? 'text-danger' : 'text-warning'} />
            <MetricCard label="Feedbacks récents" value={`${stats?.feedbacks_recents ?? 0}`} color="text-role-primary" />
          </div>

          {domainChartData.length > 0 && (
            <div>
              <h4 className="text-small mb-3">Précision par domaine</h4>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={domainChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--background)',
                      borderColor: 'var(--border)',
                      borderRadius: 'var(--border-radius-lg)',
                      color: 'var(--foreground)',
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }}
                    formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                  />
                  <Bar dataKey="Précision" name="Précision" fill={barColor} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Corrélation ML ↔ Profil de Risque */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="card-title text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-role-primary" />
              Corrélation ML ↔ Profil de Risque
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-primary-soft rounded-lg p-3 text-center">
                <p className="text-xs text-primary">Score Risque Moyen</p>
                <p className="text-xl font-bold text-primary">{mlRiskCorrelation.avgRiskScore}/100</p>
                <p className="text-[10px] text-muted-foreground">{mlRiskCorrelation.aerodromeCount} aérodromes</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 text-center">
                <p className="text-xs text-purple-600">Convergence ML</p>
                <p className="text-xl font-bold text-purple-700">{mlRiskCorrelation.convergenceScore}%</p>
                <p className="text-[10px] text-muted-foreground">RF + Profil Risque</p>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Alignement</p>
                <p className={`text-xl font-bold ${mlRiskCorrelation.alignmentScore >= 60 ? 'text-success' : 'text-warning'}`}>
                  {mlRiskCorrelation.alignmentScore}%
                </p>
              </div>
              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Distribution</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(mlRiskCorrelation.riskLevelDistribution).map(([level, count]) => (
                    <span key={level} className={`badge text-[9px] ${
                      level === 'critique' ? 'danger' : level === 'eleve' ? 'warning' : level === 'moyen' ? 'primary' : 'success'
                    }`}>{count}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts & Model Info */}
      <div className="space-y-4 animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="card">
          <div className="card-header pb-2">
            <div className="card-title text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Alertes ({pendingAlerts.length})
            </div>
          </div>
          <div className="card-content">
            {pendingAlerts.length === 0 ? (
              <p className="text-small text-muted">Aucune alerte en attente</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {pendingAlerts.slice(0, 5).map((alert: RecalibrationAlertRecord) => (
                  <div key={alert.id} className={`p-2.5 rounded-lg text-sm ${
                    alert.niveau === 'critical' ? 'bg-danger-soft border border-red-500/20' :
                    alert.niveau === 'warning' ? 'bg-warning-soft border border-amber-500/20' :
                    'bg-primary-soft border border-blue-500/20'
                  }`}>
                    <p className={`font-medium ${
                      alert.niveau === 'critical' ? 'text-danger' :
                      alert.niveau === 'warning' ? 'text-warning' : 'text-primary'
                    }`}>{alert.message}</p>
                    <p className="text-xs text-muted mt-1">{new Date(alert.date).toLocaleDateString('fr-FR')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header pb-2">
            <div className="card-title text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-role-primary" />
              Modèle actuel v{currentModel?.version || 1}
            </div>
          </div>
          <div className="card-content">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted">Dernière calibration</span><span>{currentModel?.date_calibration ? new Date(currentModel.date_calibration).toLocaleDateString('fr-FR') : 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-muted">Items améliorés</span><span>{detailedStats?.items_ameliores || 0}</span></div>
              <div className="flex justify-between"><span className="text-muted">Items dégradés</span><span>{detailedStats?.items_degrades || 0}</span></div>
              <div className="flex justify-between"><span className="text-muted">Confiance moyenne</span><span>{detailedStats?.confiance_moyenne || 0}%</span></div>
            </div>
          </div>
          <div className="card-footer flex gap-2">
            <button onClick={onRecalibrate} className="btn btn-primary btn-sm flex-1 gap-1.5">
              <RefreshCw className="h-4 w-4" /> Recalibrer
            </button>
            <button onClick={onReset} className="btn btn-sm btn-secondary gap-1.5">
              <RotateCcw className="h-4 w-4" /> Réinitialiser
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PACTab({ pacStats, barColor }: { pacStats: { total_feedbacks: number; taux_concordance: number; taux_utilite: number; ponderations_criteres: Record<string, number>; ponderations_priorisation: Record<string, number> }; barColor: string }) {
  const criteresData = pacStats?.ponderations_criteres
    ? Object.entries(pacStats.ponderations_criteres).map(([critere, poids]) => ({
        name: critere,
        Poids: (poids as number),
      }))
    : []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="card lg:col-span-2 animate-fade-up">
        <div className="card-header pb-2">
          <div className="card-title text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-role-primary" />
            Statistiques PAC Learning
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <MetricCard label="Feedbacks PAC" value={`${pacStats?.total_feedbacks || 0}`} color="text-role-primary" />
            <MetricCard label="Taux concordance" value={`${pacStats?.taux_concordance || 0}%`} color="text-success" />
            <MetricCard label="Taux d'utilité" value={`${pacStats?.taux_utilite || 0}%`} color="text-warning" />
          </div>

          {criteresData.length > 0 && (
            <div>
              <h4 className="text-small mb-3">Pondérations des critères PAC</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={criteresData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} layout="vertical">
                  <XAxis type="number" domain={[0, 2]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={100} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--background)',
                      borderColor: 'var(--border)',
                      borderRadius: 'var(--border-radius-lg)',
                      color: 'var(--foreground)',
                    }}
                  />
                  <Bar dataKey="Poids" name="Poids" fill={barColor} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="card animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="card-header pb-2">
          <div className="card-title text-sm font-medium flex items-center gap-2">
            <Layers className="h-4 w-4 text-role-primary" />
            Priorisation
          </div>
        </div>
        <div className="card-content">
          {pacStats?.ponderations_priorisation ? (
            <div className="space-y-3">
              {Object.entries(pacStats.ponderations_priorisation).map(([critere, poids]) => (
                <div key={critere}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted capitalize">{critere.replace(/_/g, ' ')}</span>
                    <span className="font-mono font-semibold">{poids as number}</span>
                  </div>
                  <div className="progress h-1.5">
                    <div className="progress-bar" style={{ width: `${Math.min(100, ((poids as number) / 30) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Aucune donnée de priorisation</p>
          )}
        </div>
      </div>
    </div>
  )
}

function RFTab({
  rfModelInfo,
  rfSamplesCount,
  modelMetrics,
  onTrain,
  barColor,
  mlRiskCorrelation,
}: {
  rfModelInfo: RandomForestModelStored | null
  rfSamplesCount: number
  modelMetrics: ModelPerformanceMetrics
  onTrain: () => void
  barColor: string
  mlRiskCorrelation: MLRiskCorrelationData
}) {
  const featureData = rfModelInfo?.feature_importance
    ? Object.entries(rfModelInfo.feature_importance)
        .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
        .map(([feature, importance]) => ({
          name: feature.replace(/_/g, ' '),
          Importance: importance as number,
        }))
    : []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="card lg:col-span-2 animate-fade-up">
        <div className="card-header pb-2 flex items-center justify-between">
          <div className="card-title text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-role-primary" />
            Random Forest
          </div>
          <button onClick={onTrain} className="btn btn-primary btn-sm gap-1.5">
            <RefreshCw className="h-4 w-4" /> Entraîner
          </button>
        </div>
        <div className="card-content">
          {!rfModelInfo ? (
            <div className="text-center py-8 text-muted">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Modèle non entraîné</p>
              <p className="text-sm">Ajoutez au moins 10 échantillons puis lancez l'entraînement.</p>
              <p className="text-xs mt-2">Échantillons disponibles: {rfSamplesCount}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Précision" value={`${(rfModelInfo.accuracy * 100).toFixed(1)}%`} color="text-success" />
                <MetricCard label="Échantillons" value={`${rfModelInfo.training_samples}`} color="text-role-primary" />
                <MetricCard label="Version" value={`v${rfModelInfo.version}`} color="text-warning" />
                <MetricCard label="Entraîné le" value={new Date(rfModelInfo.trained_at).toLocaleDateString('fr-FR')} color="text-info" />
              </div>

              {featureData.length > 0 && (
                <div>
                  <h4 className="text-small mb-3">Importance des caractéristiques</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={featureData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} layout="vertical">
                      <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={140} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--background)',
                          borderColor: 'var(--border)',
                          borderRadius: 'var(--border-radius-lg)',
                          color: 'var(--foreground)',
                        }}
                      />
                      <Bar dataKey="Importance" name="Importance" fill={barColor} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Alignement Feature Importance ↔ C1-C5 */}
              {mlRiskCorrelation.featureAlignment.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <h4 className="text-small mb-3 flex items-center gap-2">
                    <Target className="h-3.5 w-3.5 text-role-primary" />
                    Alignement features ML ↔ Critères risque
                  </h4>
                  <div className="space-y-2">
                    {mlRiskCorrelation.featureAlignment.slice(0, 6).map((fa) => (
                      <div key={fa.feature} className="flex items-center gap-3">
                        <span className="text-xs font-mono text-muted-foreground w-24 truncate" title={fa.critere}>{fa.critere}</span>
                        <div className="flex-1">
                          <div className="progress h-1.5">
                            <div className="progress-bar" style={{ width: `${fa.importance * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-xs font-semibold w-10 text-right">{(fa.importance * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <span>Score d'alignement global</span>
                    <span className={`font-semibold ${mlRiskCorrelation.alignmentScore >= 60 ? 'text-success' : 'text-warning'}`}>
                      {mlRiskCorrelation.alignmentScore}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="card-header pb-2">
          <div className="card-title text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-role-primary" />
            Métriques du modèle
          </div>
        </div>
        <div className="card-content">
          {modelMetrics?.random_forest ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">Précision RF</span><span className="font-semibold">{(modelMetrics.random_forest.accuracy * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span className="text-muted">Dernière évaluation</span><span>{modelMetrics.random_forest.last_evaluated ? new Date(modelMetrics.random_forest.last_evaluated).toLocaleDateString('fr-FR') : 'N/A'}</span></div>
              {modelMetrics.random_forest.precision_by_class && Object.entries(modelMetrics.random_forest.precision_by_class).map(([cls, prec]) => (
                <div key={cls} className="flex justify-between">
                  <span className="text-muted capitalize">{cls}</span>
                  <span className={`font-semibold ${(prec as number) > 0.7 ? 'text-success' : 'text-warning'}`}>{((prec as number) * 100).toFixed(0)}%</span>
                </div>
              ))}
              {modelMetrics.random_forest.confusion_matrix && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted mb-2">Matrice de confusion</p>
                  <div className="grid grid-cols-2 gap-1 text-center text-xs font-mono">
                    <div className="p-1.5 rounded bg-success-soft">
                      <span className="text-success">VN: {(modelMetrics.random_forest.confusion_matrix as any).true_negatives ?? 0}</span>
                    </div>
                    <div className="p-1.5 rounded bg-danger-soft">
                      <span className="text-danger">FP: {(modelMetrics.random_forest.confusion_matrix as any).false_positives ?? 0}</span>
                    </div>
                    <div className="p-1.5 rounded bg-danger-soft">
                      <span className="text-danger">FN: {(modelMetrics.random_forest.confusion_matrix as any).false_negatives ?? 0}</span>
                    </div>
                    <div className="p-1.5 rounded bg-success-soft">
                      <span className="text-success">VP: {(modelMetrics.random_forest.confusion_matrix as any).true_positives ?? 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Aucune métrique disponible</p>
          )}
        </div>
      </div>
    </div>
  )
}

function GraphTab({ graphModelInfo, mlRiskCorrelation }: { graphModelInfo: RiskGraphStored | null; mlRiskCorrelation: MLRiskCorrelationData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="card lg:col-span-2 animate-fade-up">
        <div className="card-header pb-2">
          <div className="card-title text-sm font-semibold flex items-center gap-2">
            <Network className="h-4 w-4 text-role-primary" />
            Graph Network
          </div>
        </div>
        <div className="card-content">
          {!graphModelInfo ? (
            <div className="text-center py-8 text-muted">
              <Network className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Graphe non calculé</p>
              <p className="text-sm">Le graphe sera créé automatiquement lors de la mise à jour des données de risque.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard label="Nœuds" value={`${graphModelInfo.nodes_count}`} color="text-role-primary" />
                <MetricCard label="Arêtes" value={`${graphModelInfo.edges_count}`} color="text-success" />
                <MetricCard label="Chemins critiques" value={`${graphModelInfo.critical_paths_count}`} color="text-danger" />
                <MetricCard label="Mis à jour le" value={new Date(graphModelInfo.computed_at).toLocaleDateString('fr-FR')} color="text-info" />
              </div>

              {graphModelInfo.top_central_nodes && graphModelInfo.top_central_nodes.length > 0 && (
                <div>
                  <h4 className="text-small mb-3">Nœuds centraux (top 5)</h4>
                  <div className="space-y-2">
                    {graphModelInfo.top_central_nodes.slice(0, 5).map((node: { id: string; centrality: number }, i: number) => (
                      <div key={node.id} className="flex items-center gap-3 text-sm">
                        <span className="badge badge-muted w-6 h-6 flex items-center justify-center p-0 rounded-full text-xs">{i + 1}</span>
                        <span className="font-mono text-xs text-muted flex-1 truncate">{node.id.replace(/^[^_]+_/, '')}</span>
                        <div className="w-24">
                          <div className="progress h-2">
                            <div className="progress-bar" style={{ width: `${Math.min(100, node.centrality * 10)}%` }} />
                          </div>
                        </div>
                        <span className="font-mono text-xs text-muted">{node.centrality.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Corrélation Graph ↔ Profil de Risque */}
              {mlRiskCorrelation.aerodromeCount > 0 && (
                <div className="pt-4 border-t border-border">
                  <h4 className="text-small mb-3 flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-role-primary" />
                    Synthèse Risque
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-primary-soft rounded-lg p-3 text-center">
                      <p className="text-xs text-primary">Score moyen</p>
                      <p className="text-lg font-bold text-primary">{mlRiskCorrelation.avgRiskScore}/100</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <p className="text-xs text-purple-600">Convergence</p>
                      <p className="text-lg font-bold text-purple-700">{mlRiskCorrelation.convergenceScore}%</p>
                    </div>
                    <div className="bg-muted rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">Alignement</p>
                      <p className="text-lg font-bold">{mlRiskCorrelation.alignmentScore}%</p>
                    </div>
                    <div className="bg-muted rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">Aérodromes</p>
                      <p className="text-lg font-bold">{mlRiskCorrelation.aerodromeCount}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {Object.entries(mlRiskCorrelation.riskLevelDistribution).map(([level, count]) => (
                      <span key={level} className={`badge text-[10px] ${
                        level === 'critique' ? 'danger' : level === 'eleve' ? 'warning' : level === 'moyen' ? 'primary' : 'success'
                      }`}>{level}: {count}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="card-header pb-2">
          <div className="card-title text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-role-primary" />
            Métriques du graphe
          </div>
        </div>
        <div className="card-content">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted">Précision propagation</span><span>N/A</span></div>
            <div className="flex justify-between"><span className="text-muted">Centralité moyenne</span><span>{graphModelInfo?.top_central_nodes?.length ? (graphModelInfo.top_central_nodes.reduce((a: number, n: { centrality: number }) => a + n.centrality, 0) / graphModelInfo.top_central_nodes.length).toFixed(1) : 'N/A'}</span></div>
            <div className="flex justify-between"><span className="text-muted">Diamètre du graphe</span><span>{(graphModelInfo as any)?.diameter || 'N/A'}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HistoryTab({
  getTrainingHistory,
  getTrainingStats,
  exportTrainingHistoryCSV,
}: {
  getTrainingHistory: () => Promise<TrainingHistoryEntry[]>
  getTrainingStats: () => Promise<TrainingStats>
  exportTrainingHistoryCSV: () => Promise<string>
}) {
  const [history, setHistory] = useState<TrainingHistoryEntry[]>([])
  const [stats, setStats] = useState<TrainingStats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [h, s] = await Promise.all([getTrainingHistory(), getTrainingStats()])
    setHistory(h)
    setStats(s)
    setLoading(false)
  }, [getTrainingHistory, getTrainingStats])

  useEffect(() => { load() }, [load])

  const handleExportCSV = async () => {
    const csv = await exportTrainingHistoryCSV()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `training-history-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-muted">
        <RefreshCw className="w-10 h-10 mx-auto mb-4 opacity-30 animate-spin" />
        <p>Chargement de l'historique...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-fade-up">
          <MetricCard label="Entraînements" value={`${stats.total_trainings}`} color="text-role-primary" />
          <MetricCard label="Dernière précision" value={`${(stats.last_accuracy * 100).toFixed(1)}%`} color="text-success" />
          <MetricCard label="Meilleure précision" value={`${(stats.best_accuracy * 100).toFixed(1)}%`} color="text-role-primary" />
          <MetricCard label="Moyenne" value={`${(stats.avg_accuracy * 100).toFixed(1)}%`} color="text-info" />
          <MetricCard label="Tendance" value={stats.accuracy_trend === 'up' ? '📈 Hausse' : stats.accuracy_trend === 'down' ? '📉 Baisse' : '➡️ Stable'} color="text-warning" />
        </div>
      )}

      {/* History Table */}
      <div className="card animate-fade-up">
        <div className="card-header pb-2 flex items-center justify-between">
          <div className="card-title text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-role-primary" />
            Historique des entraînements
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="btn btn-sm btn-secondary gap-1.5">
              <RefreshCw className="h-4 w-4" /> Actualiser
            </button>
            <button onClick={handleExportCSV} className="btn btn-sm btn-primary gap-1.5">
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        </div>
        <div className="card-content">
          {history.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Aucun entraînement enregistré</p>
              <p className="text-sm">Lancez un entraînement Random Forest pour voir l'historique.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground text-xs uppercase tracking-wider">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Précision</th>
                    <th className="py-2 pr-4">Échantillons</th>
                    <th className="py-2 pr-4">Arbres</th>
                    <th className="py-2 pr-4">Profondeur</th>
                    <th className="py-2 pr-4">Durée</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice().reverse().map((entry, idx) => (
                    <tr key={`${entry.date}-${idx}`} className="border-b border-border/50 hover:bg-accent/20 transition-colors">
                      <td className="py-2 pr-4 text-muted-foreground">{new Date(entry.date).toLocaleString('fr-FR')}</td>
                      <td className="py-2 pr-4 font-semibold">
                        <span className={`${entry.accuracy >= 0.8 ? 'text-success' : entry.accuracy >= 0.6 ? 'text-warning' : 'text-danger'}`}>
                          {(entry.accuracy * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 pr-4">{entry.dataset_size}</td>
                      <td className="py-2 pr-4">{entry.n_trees}</td>
                      <td className="py-2 pr-4">{entry.max_depth}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{entry.duration_ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Accuracy over time chart */}
      {history.length >= 2 && (
        <div className="card animate-fade-up">
          <div className="card-header pb-2">
            <div className="card-title text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-role-primary" />
              Évolution de la précision
            </div>
          </div>
          <div className="card-content">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={history.map((h, i) => ({ index: i + 1, accuracy: +(h.accuracy * 100).toFixed(1), date: new Date(h.date).toLocaleDateString('fr-FR') }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="index" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} label={{ value: 'Entraînement #', position: 'insideBottomRight', offset: -5, fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} label={{ value: 'Précision %', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: 'var(--border-radius-lg)', color: 'var(--foreground)' }}
                  formatter={(value) => [`${value}%`, 'Précision']}
                  labelFormatter={(label) => `Entraînement #${label}`}
                />
                <Line type="monotone" dataKey="accuracy" stroke="var(--role-primary)" strokeWidth={2} dot={{ fill: 'var(--role-primary)', r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function SettingsTab({
  modelTrainingConfig,
  setAutoTrainEnabled,
  setTrainInterval,
  resetAdvancedModels,
  refreshModelInfo,
}: {
  modelTrainingConfig: ModelTrainingConfig
  setAutoTrainEnabled: (enabled: boolean) => void
  setTrainInterval: (hours: number) => void
  resetAdvancedModels: () => void
  refreshModelInfo: () => void
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card animate-fade-up">
        <div className="card-header pb-2">
          <div className="card-title text-sm font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4 text-role-primary" />
            Configuration de l'entraînement
          </div>
        </div>
        <div className="card-content">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Entraînement automatique</p>
                <p className="text-xs text-muted">Lancer l'entraînement périodique du Random Forest</p>
              </div>
              <label className="form-toggle">
                <input
                  type="checkbox"
                  checked={modelTrainingConfig?.auto_train_enabled || false}
                  onChange={(e) => setAutoTrainEnabled(e.target.checked)}
                />
                <span className="form-toggle-slider" />
              </label>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Intervalle d'entraînement</p>
              <select
                value={modelTrainingConfig?.train_interval_hours || 24}
                onChange={(e) => setTrainInterval(parseInt(e.target.value))}
                className="form-select"
              >
                <option value={1}>Toutes les heures</option>
                <option value={6}>Toutes les 6 heures</option>
                <option value={12}>Toutes les 12 heures</option>
                <option value={24}>Tous les jours</option>
                <option value={72}>Tous les 3 jours</option>
                <option value={168}>Toutes les semaines</option>
              </select>
            </div>

            <div className="text-sm text-muted space-y-1">
              <p>Prochain entraînement: {modelTrainingConfig?.next_auto_train ? new Date(modelTrainingConfig.next_auto_train).toLocaleString('fr-FR') : 'N/A'}</p>
              <p>Dernier: {modelTrainingConfig?.last_auto_train ? new Date(modelTrainingConfig.last_auto_train).toLocaleString('fr-FR') : 'Jamais'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card animate-fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="card-header pb-2">
          <div className="card-title text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-role-primary" />
            Actions
          </div>
        </div>
        <div className="card-content">
          <div className="space-y-3">
            <button onClick={refreshModelInfo} className="btn btn-sm btn-secondary w-full flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4" /> Rafraîchir les informations
            </button>
            <button onClick={resetAdvancedModels} className="btn btn-sm btn-danger w-full flex items-center justify-center gap-2">
              <RotateCcw className="h-4 w-4" /> Réinitialiser les modèles avancés
            </button>
          </div>
          <div className="mt-4 p-3 bg-warning-soft border border-warning/20 rounded-lg text-xs text-warning">
            La réinitialisation supprime le modèle Random Forest et le graphe de risque. Les données d'apprentissage (feedbacks) ne sont pas affectées.
          </div>
        </div>
      </div>
    </div>
  )
}

function ServerNNTab({
  aerodromes,
  profilsRisque,
}: {
  aerodromes: Array<{ id: string; code_oaci: string }>
  profilsRisque: Record<string, { score_global: number }>
}) {
  const [models, setModels] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [abStats, setAbStats] = useState(getABStats())
  const [training, setTraining] = useState(false)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    const result: Record<string, any> = {}
    const active = aerodromes.filter(a => !a.code_oaci.includes('deleted'))
    for (const aero of active.slice(0, 10)) {
      try {
        const r = await fetch('/api/ia/ml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_model', aerodrome_id: aero.id }),
        })
        if (r.ok) result[aero.id] = await r.json()
      } catch { /* skip */ }
    }
    setModels(result)
    setLoading(false)
  }, [aerodromes])

  useEffect(() => { fetchModels() }, [fetchModels])

  const handleRetrain = async () => {
    setTraining(true)
    try {
      await fetch('/api/ia/ml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retrain_all' }),
      })
      await fetchModels()
      alert('Entraînement terminé')
    } catch { alert('Erreur') }
    setTraining(false)
  }

  const activeAeroCount = aerodromes.filter(a => !a.code_oaci?.includes('deleted')).length
  const trainedCount = Object.keys(models).filter(id => models[id]?.version > 0).length
  const avgAccuracy = trainedCount > 0
    ? Object.values(models).reduce((s: number, m: any) => s + (m.accuracy_history?.slice(-1)?.[0] ?? 0), 0) / trainedCount
    : 0

  const accuracyChart = Object.entries(models).length > 0
    ? Object.entries(models)[0][1]?.accuracy_history?.map((v: number, i: number) => ({ epoch: i + 1, loss: Math.round(v * 10000) / 100 })) ?? []
    : []

  return (
    <div className="space-y-6">
      {/* KPIs serveur NN */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card animate-fade-up">
          <div className="card-content text-center">
            <p className="text-xs text-muted">Modèles entraînés</p>
            <p className="text-2xl font-bold">{trainedCount}/{activeAeroCount}</p>
          </div>
        </div>
        <div className="card animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="card-content text-center">
            <p className="text-xs text-muted">Précision moyenne</p>
            <p className="text-2xl font-bold">{Math.round((1 - avgAccuracy) * 100)}%</p>
          </div>
        </div>
        <div className="card animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="card-content text-center">
            <p className="text-xs text-muted">A/B Neural Net</p>
            <p className="text-2xl font-bold">{abStats ? Math.round(abStats.neuralWinRate * 100) : 0}%</p>
            <p className="text-xs text-muted">{abStats?.neuralWins ?? 0} victoires / {abStats?.total ?? 0} tests</p>
          </div>
        </div>
        <div className="card animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <div className="card-content text-center">
            <p className="text-xs text-muted">Meilleur provider</p>
            <p className="text-2xl font-bold">{abStats?.bestProvider === 'tie' ? 'Égalité' : abStats?.bestProvider === 'neural_net' ? 'Neural Net' : 'Formules'}</p>
            {abStats && (abStats.withActual as any[]).length > 0 && (
              <p className="text-xs text-muted">MAE: NN {abStats.neuralMAE} / F {abStats.formulasMAE}</p>
            )}
          </div>
        </div>
      </div>

      {/* Graphique de perte d'entraînement */}
      {accuracyChart.length > 0 && (
        <div className="card animate-fade-up">
          <div className="card-header">
            <div className="card-title text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-role-primary" />
              Convergence de l'entraînement (dernier modèle)
            </div>
          </div>
          <div className="card-content">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={accuracyChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="epoch" />
                <YAxis domain={[0, 'auto']} />
                <Tooltip />
                <Line type="monotone" dataKey="loss" stroke="var(--role-primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tableau des modèles */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.2s' }}>
        <div className="card-header">
          <div className="card-title text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-role-primary" />
            État des modèles par aérodrome
          </div>
        </div>
        <div className="card-content p-0 overflow-x-auto">
          <table className="table-auto w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium">Aérodrome</th>
                <th className="text-left p-3 font-medium">Version</th>
                <th className="text-left p-3 font-medium">Feedbacks</th>
                <th className="text-left p-3 font-medium">Précision</th>
                <th className="text-left p-3 font-medium">Dernière màj</th>
                <th className="text-left p-3 font-medium">Score actuel</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-3 text-center text-muted">Chargement...</td></tr>
              ) : Object.keys(models).length === 0 ? (
                <tr><td colSpan={6} className="p-3 text-center text-muted">Aucun modèle trouvé. Lancez un entraînement.</td></tr>
              ) : (
                Object.entries(models).map(([id, m]) => {
                  const aero = aerodromes.find(a => a.id === id)
                  const profil = profilsRisque[id]
                  const lastAcc = m.accuracy_history?.slice(-1)?.[0] ?? 0
                  return (
                    <tr key={id} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="p-3 font-medium">{aero?.code_oaci ?? id.slice(0, 8)}</td>
                      <td className="p-3">v{m.version ?? 0}</td>
                      <td className="p-3">{m.total_feedbacks ?? 0}</td>
                      <td className="p-3">{Math.round((1 - lastAcc) * 100)}%</td>
                      <td className="p-3">{m.updated_at ? new Date(m.updated_at).toLocaleDateString('fr-FR') : '—'}</td>
                      <td className="p-3">{profil?.score_global ?? '—'}/100</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <div className="card-header">
            <div className="card-title text-sm font-semibold flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-role-primary" />
              A/B Testing — Neural Net vs Formules
            </div>
          </div>
          <div className="card-content">
            {abStats ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Tests réalisés</span>
                  <span className="font-bold">{abStats.total}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-green-600">Neural Net gagne</span>
                  <span className="font-bold">{abStats.neuralWins} ({Math.round(abStats.neuralWinRate * 100)}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-orange-600">Formules gagnent</span>
                  <span className="font-bold">{abStats.formulasWins} ({Math.round(abStats.formulasWinRate * 100)}%)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Égalité</span>
                  <span className="font-bold">{abStats.ties}</span>
                </div>
                {(abStats.withActual as any[]).length > 0 && (
                  <>
                    <div className="border-t border-border pt-2 mt-2">
                      <p className="text-xs font-medium mb-1">Erreur moyenne (MAE) :</p>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Neural Net</span>
                        <span className="font-bold">{abStats.neuralMAE}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Formules</span>
                        <span className="font-bold">{abStats.formulasMAE}</span>
                      </div>
                    </div>
                  </>
                )}
                <button onClick={() => { clearABHistory(); setAbStats(getABStats()) }} className="btn btn-sm btn-secondary w-full mt-2">
                  <RotateCcw className="h-4 w-4" /> Réinitialiser l'historique A/B
                </button>
              </div>
            ) : (
              <p className="text-sm text-muted">Aucun test A/B enregistré. Les comparaisons sont automatiquement créées à chaque prédiction.</p>
            )}
          </div>
        </div>

        <div className="card animate-fade-up" style={{ animationDelay: '0.4s' }}>
          <div className="card-header">
            <div className="card-title text-sm font-semibold flex items-center gap-2">
              <Settings className="h-4 w-4 text-role-primary" />
              Actions
            </div>
          </div>
          <div className="card-content space-y-3">
            <button onClick={fetchModels} disabled={loading} className="btn btn-sm btn-secondary w-full flex items-center justify-center gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Rafraîchir
            </button>
            <button onClick={handleRetrain} disabled={training} className="btn btn-sm btn-primary w-full flex items-center justify-center gap-2">
              <Brain className={`h-4 w-4 ${training ? 'animate-pulse' : ''}`} /> {training ? 'Entraînement...' : 'Ré-entraîner tous les modèles'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-3 rounded-lg bg-accent/30">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

const ML_HELP_SECTIONS: HelpSection[] = [
  {
    id: 'overview',
    title: "Vue d'ensemble du module",
    icon: Brain,
    content: (
      <div className="space-y-2">
        <p>Ce module centralise le <strong>monitoring de tous les modèles d'apprentissage</strong> utilisés par la plateforme :</p>
        <ul className="list-disc pl-4 space-y-1">
          <li><strong>Learning Engine</strong> — Apprentissage continu par feedbacks des inspecteurs</li>
          <li><strong>PAC Learning</strong> — Analyse des pondérations des critères PAC (Probably Approximately Correct)</li>
          <li><strong>Random Forest</strong> — Modèle supervisé pour la prédiction de risque basée sur les échantillons historiques</li>
          <li><strong>Graph Network</strong> — Graphe de corrélation entre aérodromes et propagation des risques</li>
        </ul>
        <p className="text-muted-foreground">Chaque modèle fournit des métriques de performance, des alertes de recalibrage et des indicateurs de convergence avec le profil de risque.</p>
      </div>
    ),
  },
  {
    id: 'tabs',
    title: 'Comprendre les onglets',
    icon: BarChart3,
    content: (
      <div className="space-y-1.5">
        <p><strong>Learning Engine</strong> — Précision globale, taux de faux positifs/négatifs, corrélation ML ↔ Profil de Risque. Permet de recalibrer le modèle.</p>
        <p><strong>PAC Learning</strong> — Taux de concordance et d'utilité des feedbacks, pondérations des critères PAC, priorisation automatique.</p>
        <p><strong>Random Forest</strong> — Entraînement du modèle, importance des caractéristiques, alignement avec les critères C1–C5, matrice de confusion.</p>
        <p><strong>Graph Network</strong> — Graphe des corrélations inter-aérodromes, nœuds centraux, chemins critiques de propagation du risque.</p>
        <p><strong>Historique</strong> — Tableau et graphique d'évolution des entraînements, export CSV.</p>
        <p><strong>Configuration</strong> — Paramètres d'entraînement automatique, intervalle, réinitialisation.</p>
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
            <dt className="font-semibold">Learning Engine</dt>
            <dd className="text-muted-foreground">Moteur d'apprentissage continu qui ajuste les prédictions de risque en fonction des retours (feedbacks) des inspecteurs après chaque évaluation.</dd>
          </div>
          <div>
            <dt className="font-semibold">PAC Learning (Probably Approximately Correct)</dt>
            <dd className="text-muted-foreground">Cadre d'apprentissage qui garantit que le modèle converge vers une solution approximativement correcte avec une probabilité élevée, à mesure que le nombre d'échantillons augmente.</dd>
          </div>
          <div>
            <dt className="font-semibold">Random Forest</dt>
            <dd className="text-muted-foreground">Algorithme d'ensemble basé sur une forêt d'arbres de décision. Chaque arbre vote, et la prédiction finale est la moyenne des votes. Robuste face au sur-apprentissage.</dd>
          </div>
          <div>
            <dt className="font-semibold">Feature Importance</dt>
            <dd className="text-muted-foreground">Poids de chaque variable d'entrée dans la décision du modèle. Plus l'importance est élevée, plus la feature influence la prédiction de risque.</dd>
          </div>
          <div>
            <dt className="font-semibold">Matrice de confusion</dt>
            <dd className="text-muted-foreground">Tableau croisé des prédictions vs réalité : Vrais Négatifs (VN), Faux Positifs (FP), Faux Négatifs (FN), Vrais Positifs (VP). Permet de calculer précision, rappel et spécificité.</dd>
          </div>
          <div>
            <dt className="font-semibold">Convergence ML ↔ Risque</dt>
            <dd className="text-muted-foreground">Mesure d'alignement entre les prédictions du modèle Random Forest et le profil de risque calculé par les critères C1–C5. Une convergence &ge; 60 % indique une bonne cohérence.</dd>
          </div>
          <div>
            <dt className="font-semibold">Recalibrage</dt>
            <dd className="text-muted-foreground">Mise à jour du modèle Learning Engine à partir des nouveaux feedbacks pour corriger les biais et améliorer la précision des prédictions futures.</dd>
          </div>
        </dl>
      </div>
    ),
  },
]
