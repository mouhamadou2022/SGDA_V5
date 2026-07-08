// components/modules/ml-monitoring/MLMonitoringModule.tsx
// 2 onglets : Performances (tous) | Modèles (admin only)
// Monitoring clair des modèles ML

'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import type { MLRiskCorrelationData } from '@/lib/store/advancedModelsSlice'
import type { AuthUser } from '@/lib/auth'
import type { RecalibrationAlertRecord, ModelCalibrationRecord } from '@/lib/store'
import type { RandomForestModelStored, ModelPerformanceMetrics, ModelTrainingConfig, TrainingHistoryEntry, TrainingStats } from '@/lib/store/models'
import type { RiskGraphStored } from '@/lib/store/models'
import { Card } from '@/components/ui/card'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { HelpModal, type HelpSection } from '@/components/ui/HelpModal'
import { getABStats, clearABHistory } from '@/lib/ab_testing'
import { engineFeedback, type EngineLearningStats } from '@/lib/ia/engines/engineFeedback'
import { thresholdController } from '@/lib/ia/thresholdController'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from 'recharts'
import {
  Brain, Target, TrendingUp, Activity, AlertTriangle, CheckCircle2, RefreshCw,
  Settings, Database, BarChart3, Layers, Download, Upload, RotateCcw, Clock,
  BookOpen, FlaskConical, GitCompare, Network, Users, Shield,
} from 'lucide-react'
import { getConfianceLabel, getConfianceDot } from '@/lib/risque/bayesianNetwork'

interface Props { user: AuthUser }

export default function MLMonitoringModule({ user }: Props) {
  const aerodromes = useAppStore(s => s.aerodromes)
  const profilsRisque = useAppStore(s => s.profilsRisque)
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

  const [activeTab, setActiveTab] = useState<'performances' | 'modeles'>('performances')
  const [showHelp, setShowHelp] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [engineStats, setEngineStats] = useState<EngineLearningStats | null>(null)

  useEffect(() => { setEngineStats(engineFeedback.getStats()) }, [])

  const isAdmin = user?.role === 'admin'
  const stats = learningFeedbacks.length > 0 ? calculatePerformance() : null
  const detailedStats = learningFeedbacks.length > 0 ? getDetailedLearningStats() : null
  const pacStats = getLearningStatsPAC()
  const pendingAlerts = recalibrationAlerts?.filter(a => !a.traitee) || []
  const mlRiskCorrelation: MLRiskCorrelationData = useMemo(() => getMLRiskCorrelation(), [rfModelInfo, graphModelInfo, rfSamplesCount])

  const handleRecalibrate = () => recalibrateModel('manuel', user?.prenom && user?.nom ? `${user.prenom} ${user.nom}` : 'admin')
  const handleExport = () => {
    const data = exportLearningData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `learning-data-${new Date().toISOString().split('T')[0]}.json`; a.click()
    URL.revokeObjectURL(url)
  }
  const handleImport = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try { setImportError(null); importLearningData(await file.text()) }
      catch (err: unknown) { setImportError(err instanceof Error ? err.message : "Erreur d'import") }
    }
    input.click()
  }
  const handleTrainRF = () => trainRandomForestModel(10, 4)

  const barColor = 'var(--role-primary)'

  const sourceInfo = (persistent: boolean, label: string) => (
    <span className={`text-[10px] ${persistent ? 'text-success' : 'text-warning'} ml-1`} title={persistent ? 'Données persistées Supabase' : 'Stockage temporaire (session) — perdu à la fermeture'}>
      {persistent ? '🟢' : '🟡'} {label}
    </span>
  )

  const kpis = [
    { label: 'Feedbacks', value: detailedStats?.total_feedbacks || 0, icon: <Brain className="h-5 w-5" />, tooltip: "Retours inspecteurs intégrés au modèle d'apprentissage.", trend: 'collectés', trendUp: true, source: sourceInfo(false, 'session') },
    { label: 'Précision', value: `${stats?.precision_globale ?? 0}%`, icon: <Activity className="h-5 w-5" />, tooltip: "Taux de prédictions correctes. Seuil acceptable ≥ 70 %.", trend: `v${currentModel?.version || 1}`, trendUp: (stats?.precision_globale ?? 0) >= 70, source: sourceInfo(false, 'session') },
    { label: 'Alertes', value: pendingAlerts.length, icon: <AlertTriangle className="h-5 w-5" />, tooltip: "Alertes de recalibration en attente.", trend: 'en attente', trendUp: false, warning: pendingAlerts.length > 0, source: sourceInfo(false, 'session') },
    { label: 'Échantillons RF', value: rfSamplesCount > 0 ? rfSamplesCount : 'modèle non alimenté', icon: <Database className="h-5 w-5" />, tooltip: rfSamplesCount > 0 ? "Échantillons pour Random Forest." : "Aucun échantillon réel — modèle jamais entraîné. Les prédictions RF utilisent des valeurs par défaut.", trend: rfModelInfo ? `${(rfModelInfo.accuracy * 100).toFixed(0)}%` : 'non entraîné', trendUp: rfModelInfo ? rfModelInfo.accuracy >= 0.7 : false, source: sourceInfo(false, 'session') },
    { label: 'Convergence ML', value: `${mlRiskCorrelation.convergenceScore}%`, icon: <Target className="h-5 w-5" />, tooltip: "Cohérence entre prédictions ML et profil de risque. ≥ 60 % = bonne convergence.", trend: `${mlRiskCorrelation.aerodromeCount} aérodromes`, trendUp: mlRiskCorrelation.convergenceScore >= 60, source: sourceInfo(false, 'session') },
  ]

  const domainChartData = useMemo(() => {
    if (!detailedStats?.precision_par_domaine) return []
    return Object.entries(detailedStats.precision_par_domaine).map(([d, p]) => ({ name: d, Précision: p as number }))
  }, [detailedStats])

  return (
    <div className="space-y-6 animate-fade-in" data-module="ml-monitoring" data-role={user?.role}>
      <ModuleHeader icon={<Brain className="h-8 w-8 text-role-primary" />} title="Monitoring ML" description="Performance et entraînement des modèles d'apprentissage"
        actions={<div className="flex items-center gap-2">
          <button onClick={() => setShowHelp(true)} className="btn btn-sm btn-secondary gap-1.5"><BookOpen className="w-3.5 h-3.5" />Aide</button>
          <button onClick={handleExport} className="btn btn-sm btn-secondary gap-1.5"><Download className="h-4 w-4" />Exporter</button>
          <button onClick={handleImport} className="btn btn-sm btn-secondary gap-1.5"><Upload className="h-4 w-4" />Importer</button>
        </div>} />

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} title="Guide — Monitoring ML" subtitle="Performances des modèles d'apprentissage" sections={HELP_SECTIONS} />

      {importError && <div className="alert alert-danger animate-fade-up"><AlertTriangle className="alert-icon" /><div className="alert-content">{importError}</div></div>}

      {/* KPIs — 5 cartes, tooltips 1 phrase */}
      <div className="kpi-grid">
        {kpis.map((kpi, idx) => (
          <div key={kpi.label} className="kpi-card animate-fade-up" style={{ animationDelay: `${idx * 0.05}s` }}>
            <div className="kpi-icon">{kpi.icon}</div>
              <div className="kpi-content">
                <div className="kpi-label">{kpi.label}<InfoTooltip content={kpi.tooltip} /></div>
              <div className={`kpi-value ${kpi.warning ? 'text-warning' : ''} ${typeof kpi.value === 'string' && kpi.value.includes('non alimenté') ? 'text-muted-foreground italic' : ''}`}>{kpi.value}</div>
              <div className={`kpi-trend ${kpi.trendUp ? 'up' : 'down'}`}>{kpi.trend}</div>
              {kpi.source}
            </div>
          </div>
        ))}
      </div>

      {/* Onglets */}
      <div className="tabs-container border-b border-border">
        <div className="tabs flex gap-1">
          <button onClick={() => setActiveTab('performances')} className={`tab px-4 py-2 font-medium transition-all ${activeTab === 'performances' ? 'active border-b-2 border-role-primary text-role-primary' : 'text-muted-foreground hover:text-foreground'}`}><BarChart3 className="w-4 h-4 inline mr-1.5" />Performances</button>
          {isAdmin && (
            <button onClick={() => setActiveTab('modeles')} className={`tab px-4 py-2 font-medium transition-all ${activeTab === 'modeles' ? 'active border-b-2 border-role-primary text-role-primary' : 'text-muted-foreground hover:text-foreground'}`}><Settings className="w-4 h-4 inline mr-1.5" />Modèles</button>
          )}
        </div>
      </div>

      {/* Performances */}
      {activeTab === 'performances' && (
        <div className="space-y-6">
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card icon={<BarChart3 className="h-4 w-4 text-role-primary" />} title="Précision par domaine">
              {domainChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={domainChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: 'var(--border-radius-lg)', color: 'var(--foreground)' }} />
                    <Bar dataKey="Précision" fill={barColor} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="text-center py-8 text-muted"><p>Aucune donnée de précision par domaine</p></div>}
            </Card>
            <Card icon={<Activity className="h-4 w-4 text-role-primary" />} title="Métriques de performance">
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="Précision globale" value={`${stats?.precision_globale ?? 0}%`} color="text-success" />
                <MetricCard label="Faux positifs" value={`${stats?.taux_faux_positifs ?? 0}%`} color={(stats?.taux_faux_positifs ?? 0) > 15 ? 'text-danger' : 'text-warning'} />
                <MetricCard label="Faux négatifs" value={`${stats?.taux_faux_negatifs ?? 0}%`} color={(stats?.taux_faux_negatifs ?? 0) > 10 ? 'text-danger' : 'text-warning'} />
                <MetricCard label="Feedbacks récents" value={`${stats?.feedbacks_recents ?? 0}`} color="text-role-primary" />
              </div>
            </Card>
          </div>

          {/* Corrélation ML ↔ Profil de Risque */}
          <Card icon={<Target className="h-4 w-4 text-role-primary" />} title="Corrélation ML ↔ Profil de Risque">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-role-primary-soft rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Score Risque Moyen</p><p className="text-xl font-bold">{mlRiskCorrelation.avgRiskScore}/100</p><p className="text-xs text-muted-foreground">{mlRiskCorrelation.aerodromeCount} aérodromes</p>
              </div>
              <div className="bg-role-primary-soft rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Convergence ML</p><p className="text-xl font-bold">{mlRiskCorrelation.convergenceScore}%</p>
              </div>
              <div className="bg-role-primary-soft rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Alignement</p><p className={`text-xl font-bold ${mlRiskCorrelation.alignmentScore >= 60 ? 'text-success' : 'text-warning'}`}>{mlRiskCorrelation.alignmentScore}%</p>
              </div>
              <div className="bg-role-primary-soft rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Distribution</p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(mlRiskCorrelation.riskLevelDistribution).map(([level, count]) => (
                    <span key={level} className={`badge text-xs ${level === 'critique' ? 'danger' : level === 'eleve' ? 'warning' : level === 'moyen' ? 'primary' : 'success'}`}>{count}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* AERORISQ Engines */}
          <Card icon={<Brain className="h-4 w-4 text-role-primary" />} title="AERORISQ — Engines décisionnels" className="h-full">
            {engineStats ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-muted-foreground">Feedback total</span>
                  <span className="font-bold text-foreground">{engineStats.totalFeedbacks}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-muted-foreground">Taux de pertinence global</span>
                  <span className={`font-bold ${engineStats.pertinenceRate >= 60 ? 'text-success' : engineStats.pertinenceRate >= 40 ? 'text-warning' : 'text-danger'}`}>{engineStats.pertinenceRate}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                  {(Object.entries(engineStats.parEngine) as [string, { total: number; pertinents: number; taux: number }][]).map(([engine, data]) => (
                    <div key={engine} className="bg-role-primary-soft rounded-lg p-2.5">
                      <p className="text-xs text-muted-foreground capitalize mb-1">{engine === 'riskProfile' ? 'Profil risque' : engine === 'compliance' ? 'Conformité' : engine === 'certificate' ? 'Certificat' : engine === 'team' ? 'Équipe' : 'Recommandations'}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{data.taux}%</span>
                        <span className="text-[10px] text-muted-foreground">{data.total} votes</span>
                      </div>
                    </div>
                  ))}
                </div>
                {engineStats.dernieresSuggestions.length > 0 && (
                  <details className="text-xs pt-2 border-t border-border">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">Derniers feedbacks ({engineStats.dernieresSuggestions.length})</summary>
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {engineStats.dernieresSuggestions.slice(0, 5).map(f => (
                        <div key={f.id} className="flex items-center justify-between p-1.5 rounded bg-role-primary-soft/50">
                          <span className="text-muted-foreground">{f.engineType} — {f.decision.type}</span>
                          <span className={`font-medium ${f.vote === 'pertinent' ? 'text-success' : f.vote === 'non_pertinent' ? 'text-danger' : 'text-warning'}`}>{f.vote}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {/* Seuils auto-ajustés */}
                {(() => {
                  const histo = thresholdController.getHistorique()
                  return histo.length > 0 && (
                    <details className="text-xs pt-2 border-t border-border">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">Ajustements auto ({histo.length})</summary>
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {histo.slice(-10).reverse().map((h, i) => (
                          <div key={i} className="p-1.5 rounded bg-role-primary-soft/50">
                            <span className="text-muted-foreground">{h.parametre}: {h.ancienneValeur}→{h.nouvelleValeur}</span>
                            <p className="text-muted mt-0.5">{h.raison}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )
                })()}
              </div>
            ) : <p className="text-sm text-muted text-center py-4">Aucun feedback AERORISQ enregistré</p>}
          </Card>

          {/* Réseau bayésien causal */}
          <Card icon={<Shield className="h-4 w-4 text-role-primary" />} title="Réseau bayésien causal — Confiance">
            <div className="space-y-3">
              {(() => {
                const totalBowTies = Object.values(profilsRisque).reduce((sum: number, p: any) => sum + (p.bowtie_metrics?.length || 0), 0)
                return (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-foreground">Modèles Bow-Tie configurés</span>
                      <span className="text-lg font-bold">{totalBowTies}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-foreground">Lissage Dirichlet</span>
                      <span className="text-xs text-success flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Actif (α=1.0)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-foreground">Inférence</span>
                      <span className="text-xs text-foreground">Élimination de variables</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-foreground">Nœuds organisationnels COP</span>
                      <span className="text-xs text-foreground">3 (charge, formation, supervision)</span>
                    </div>
                    <div className="pt-3 border-t border-border text-xs text-foreground flex items-center gap-1">
                      <Database className="w-3 h-3" />
                      Persistance : Supabase (prévue)
                    </div>
                  </>
                )
              })()}
            </div>
          </Card>

          {/* Alertes + Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card icon={<AlertTriangle className="h-4 w-4 text-warning" />} title={`Alertes (${pendingAlerts.length})`} levelColor="warning">
              {pendingAlerts.length === 0 ? <p className="text-sm text-muted">Aucune alerte</p> : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {pendingAlerts.slice(0, 5).map((a: RecalibrationAlertRecord) => (
                    <div key={a.id} className={`p-2.5 rounded-lg text-sm ${a.niveau === 'critical' ? 'bg-danger-soft border border-red-500/20' : a.niveau === 'warning' ? 'bg-warning-soft border border-amber-500/20' : 'bg-primary-soft border border-blue-500/20'}`}>
                      <p className={`font-medium ${a.niveau === 'critical' ? 'text-danger' : a.niveau === 'warning' ? 'text-warning' : 'text-primary'}`}>{a.message}</p>
                      <p className="text-xs text-muted mt-1">{new Date(a.date).toLocaleDateString('fr-FR')}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card icon={<Activity className="h-4 w-4 text-role-primary" />} title={`Modèle v${currentModel?.version || 1}`}>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Dernière calibration</span><span>{currentModel?.date_calibration ? new Date(currentModel.date_calibration).toLocaleDateString('fr-FR') : 'N/A'}</span></div>
                <div className="flex justify-between"><span className="text-muted">Items améliorés</span><span>{detailedStats?.items_ameliores || 0}</span></div>
                <div className="flex justify-between"><span className="text-muted">Items dégradés</span><span>{detailedStats?.items_degrades || 0}</span></div>
                <div className="flex justify-between"><span className="text-muted">Confiance moyenne</span><span>{detailedStats?.confiance_moyenne || 0}%</span></div>
              </div>
              <div className="flex gap-2 mt-5 pt-4 border-t border-border">
                <button onClick={handleRecalibrate} className="btn btn-primary btn-sm flex-1 gap-1.5"><RefreshCw className="h-4 w-4" />Recalibrer</button>
                <button onClick={resetLearningData} className="btn btn-sm btn-secondary gap-1.5"><RotateCcw className="h-4 w-4" />Réinitialiser</button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Modèles — admin only */}
      {activeTab === 'modeles' && isAdmin && (
        <div className="space-y-6">
          {/* Random Forest */}
          <Card heading="Random Forest" icon={<TrendingUp className="h-4 w-4 text-role-primary" />} badge={
            <span title={rfSamplesCount < 10 ? "En attente de données d'entraînement réelles — voir decisionTracker" : 'Lancer l\'entraînement du Random Forest'}>
              <button onClick={rfSamplesCount >= 10 ? handleTrainRF : undefined} disabled={rfSamplesCount < 10} className="btn btn-primary btn-sm gap-1.5"><RefreshCw className="h-4 w-4" />Entraîner</button>
            </span>
          }>
            {!rfModelInfo ? (
              <div className="text-center py-8 text-muted">
                <Database className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>Modèle non entraîné</p>
                <p className="text-sm">Ajoutez au moins 10 échantillons ({rfSamplesCount} disponibles)</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MetricCard label="Précision" value={`${(rfModelInfo.accuracy * 100).toFixed(1)}%`} color="text-success" />
                  <MetricCard label="Échantillons" value={`${rfModelInfo.training_samples}`} color="text-role-primary" />
                  <MetricCard label="Version" value={`v${rfModelInfo.version}`} color="text-warning" />
                  <MetricCard label="Entraîné le" value={new Date(rfModelInfo.trained_at).toLocaleDateString('fr-FR')} color="text-info" />
                </div>
                {rfModelInfo.feature_importance && (
                  <div>
                    <h4 className="text-sm mb-2">Importance des caractéristiques</h4>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={Object.entries(rfModelInfo.feature_importance).sort(([, a], [, b]) => (b as number) - (a as number)).map(([k, v]) => ({ name: k.replace(/_/g, ' '), Importance: v as number }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} layout="vertical">
                        <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={130} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: 'var(--border-radius-lg)', color: 'var(--foreground)' }} />
                        <Bar dataKey="Importance" fill={barColor} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {modelMetrics?.random_forest?.confusion_matrix && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-muted mb-2">Matrice de confusion</p>
                    <div className="grid grid-cols-2 gap-1 text-center text-xs font-mono max-w-xs">
                      <div className="p-1.5 rounded bg-success-soft"><span className="text-success">VN: {(modelMetrics.random_forest.confusion_matrix as any).true_negatives ?? 0}</span></div>
                      <div className="p-1.5 rounded bg-danger-soft"><span className="text-danger">FP: {(modelMetrics.random_forest.confusion_matrix as any).false_positives ?? 0}</span></div>
                      <div className="p-1.5 rounded bg-danger-soft"><span className="text-danger">FN: {(modelMetrics.random_forest.confusion_matrix as any).false_negatives ?? 0}</span></div>
                      <div className="p-1.5 rounded bg-success-soft"><span className="text-success">VP: {(modelMetrics.random_forest.confusion_matrix as any).true_positives ?? 0}</span></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* PAC Learning */}
          <Card icon={<Target className="h-4 w-4 text-role-primary" />} title="PAC Learning">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <MetricCard label="Feedbacks PAC" value={`${pacStats?.total_feedbacks || 0}`} color="text-role-primary" />
              <MetricCard label="Taux concordance" value={`${pacStats?.taux_concordance || 0}%`} color="text-success" />
              <MetricCard label="Taux d'utilité" value={`${pacStats?.taux_utilite || 0}%`} color="text-warning" />
            </div>
            {pacStats?.ponderations_priorisation && (
              <div>
                <h4 className="text-sm mb-2">Priorisation des critères</h4>
                <div className="space-y-2">
                  {Object.entries(pacStats.ponderations_priorisation).map(([k, v]) => (
                    <div key={k}><div className="flex justify-between text-xs mb-1"><span className="text-muted capitalize">{k.replace(/_/g, ' ')}</span><span className="font-mono">{v as number}</span></div>
                    <div className="progress h-1.5"><div className="progress-bar" style={{ width: `${Math.min(100, ((v as number) / 30) * 100)}%` }} /></div></div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Historique */}
          <HistorySection getTrainingHistory={getTrainingHistory} getTrainingStats={getTrainingStats} exportTrainingHistoryCSV={exportTrainingHistoryCSV} barColor={barColor} />

            {/* A/B Testing + Settings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* A/B Testing */}
            <ABTestingSection />

            {/* Settings */}
            <Card icon={<Settings className="h-4 w-4 text-role-primary" />} title="Configuration">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-medium">Entraînement auto</p><p className="text-xs text-muted">Lancer périodiquement</p></div>
                  <label className="form-toggle"><input type="checkbox" checked={modelTrainingConfig?.auto_train_enabled || false} onChange={e => setAutoTrainEnabled(e.target.checked)} /><span className="form-toggle-slider" /></label>
                </div>
                <select value={modelTrainingConfig?.train_interval_hours || 24} onChange={e => setTrainInterval(parseInt(e.target.value))} className="form-select text-sm">
                  <option value={6}>6 heures</option><option value={24}>24 heures</option><option value={168}>1 semaine</option>
                </select>
                <div className="space-y-2">
                  <button onClick={refreshModelInfo} className="btn btn-sm btn-secondary w-full gap-2"><RefreshCw className="h-4 w-4" />Rafraîchir</button>
                  <button onClick={resetAdvancedModels} className="btn btn-sm btn-danger w-full gap-2"><RotateCcw className="h-4 w-4" />Réinitialiser</button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="p-3 rounded-lg bg-muted/20"><p className="text-xs text-muted">{label}</p><p className={`text-lg font-bold ${color}`}>{value}</p></div>
}

function HistorySection({ getTrainingHistory, getTrainingStats, exportTrainingHistoryCSV, barColor }: {
  getTrainingHistory: () => Promise<TrainingHistoryEntry[]>
  getTrainingStats: () => Promise<TrainingStats>
  exportTrainingHistoryCSV: () => Promise<string>
  barColor: string
}) {
  const [history, setHistory] = useState<TrainingHistoryEntry[]>([])
  const [stats, setStats] = useState<TrainingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => { setLoading(true); const [h, s] = await Promise.all([getTrainingHistory(), getTrainingStats()]); setHistory(h); setStats(s); setLoading(false) }, [getTrainingHistory, getTrainingStats])
  useEffect(() => { load() }, [load])
  const handleExport = async () => {
    const csv = await exportTrainingHistoryCSV(); const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `training-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  if (loading) return <div className="text-center py-8 text-muted"><RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-30 animate-spin" /><p>Chargement...</p></div>
  return (
    <Card
      heading="Historique des entraînements"
      icon={<Clock className="h-4 w-4 text-role-primary" />}
      badge={
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-sm btn-secondary gap-1"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={handleExport} className="btn btn-sm btn-primary gap-1"><Download className="h-4 w-4" />CSV</button>
        </div>
      }
    >
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricCard label="Entraînements" value={`${stats.total_trainings}`} color="text-role-primary" />
          <MetricCard label="Dernière précision" value={`${(stats.last_accuracy * 100).toFixed(1)}%`} color="text-success" />
          <MetricCard label="Meilleure" value={`${(stats.best_accuracy * 100).toFixed(1)}%`} color="text-role-primary" />
          <MetricCard label="Tendance" value={stats.accuracy_trend === 'up' ? 'Hausse' : stats.accuracy_trend === 'down' ? 'Baisse' : 'Stable'} color="text-warning" />
        </div>
      )}
      {history.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-muted-foreground text-xs uppercase"><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Précision</th><th className="py-2 pr-4">Échantillons</th><th className="py-2 pr-4">Arbres</th><th className="py-2">Durée</th></tr></thead>
            <tbody>{history.slice().reverse().map((e, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/10"><td className="py-2 pr-4 text-muted-foreground">{new Date(e.date).toLocaleDateString('fr-FR')}</td><td className={`py-2 pr-4 font-semibold ${e.accuracy >= 0.8 ? 'text-success' : e.accuracy >= 0.6 ? 'text-warning' : 'text-danger'}`}>{(e.accuracy * 100).toFixed(1)}%</td><td className="py-2 pr-4">{e.dataset_size}</td><td className="py-2 pr-4">{e.n_trees}</td><td className="py-2 text-muted-foreground">{e.duration_ms}ms</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted text-center py-4">Aucun entraînement enregistré</p>}
      {history.length >= 2 && (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={history.map((h, i) => ({ i: i + 1, a: +(h.accuracy * 100).toFixed(1) }))} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="i" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <Tooltip contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: 'var(--border-radius-lg)', color: 'var(--foreground)' }} />
              <Line type="monotone" dataKey="a" stroke={barColor} strokeWidth={2} dot={{ fill: barColor, r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function ABTestingSection() {
  const [abStats, setAbStats] = useState(getABStats())
  useEffect(() => { setAbStats(getABStats()) }, [])
  return (
    <Card icon={<GitCompare className="h-4 w-4 text-role-primary" />} title="A/B Testing">
      {abStats ? (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Tests</span><span className="font-bold">{abStats.total}</span></div>
          <div className="flex justify-between"><span className="text-green-600">Neural Net</span><span>{abStats.neuralWins} ({Math.round(abStats.neuralWinRate * 100)}%)</span></div>
          <div className="flex justify-between"><span className="text-orange-600">Formules</span><span>{abStats.formulasWins} ({Math.round(abStats.formulasWinRate * 100)}%)</span></div>
          <div className="flex justify-between"><span>Égalités</span><span>{abStats.ties}</span></div>
          <button onClick={() => { clearABHistory(); setAbStats(getABStats()) }} className="btn btn-sm btn-secondary w-full mt-2 gap-1"><RotateCcw className="h-3.5 w-3.5" />Réinitialiser</button>
        </div>
      ) : <p className="text-sm text-muted">Aucun test A/B. Créés automatiquement à chaque prédiction.</p>}
    </Card>
  )
}

const HELP_SECTIONS: HelpSection[] = [
  { id: 'performances', title: 'Performances', content: 'Précision globale, faux positifs/négatifs, corrélation entre prédictions ML et profil de risque.' },
  { id: 'modeles', title: 'Modèles (admin)', content: 'Random Forest, PAC Learning, Graph Network, A/B Testing, configuration. Onglet visible uniquement pour les administrateurs.' },
  { id: 'rf', title: 'Random Forest', content: 'Algorithme supervisé entraîné sur les échantillons d\'inspection. Prédit le résultat probable d\'une vérification.' },
]
