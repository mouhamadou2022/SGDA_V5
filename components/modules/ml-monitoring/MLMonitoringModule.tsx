// components/modules/ml-monitoring/MLMonitoringModule.tsx
// Monitoring ML — 5 cartes (recentré strict : modèles et apprentissage uniquement) :
// 1. Modèles ML (RF / XGBoost / LightGBM / CatBoost / MLP) : benchmark, maturité, calibrage, sélection du modèle actif
// 2. Modèles de risques : corrélation ML/risque, précision, maturité, évolution
// 3. Agents IA : précision, maturité
// 4. AERORISQ : simulation, entraînement, A/B testing
// 5. Apprentissage AERORISQ : données réelles, runs, compteurs

'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import type { MLRiskCorrelationData } from '@/lib/store/advancedModelsSlice'
import type { AuthUser } from '@/lib/auth'
import type { RecalibrationAlertRecord, ProfilRisque, Ecart, Surveillance, AmdecAnalyse, ArbreFTA, EvenementSecurite } from '@/lib/store'
import type { ModelTrainingConfig, TrainingHistoryEntry, TrainingStats } from '@/lib/store/models'
import { Card } from '@/components/ui/card'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { HelpModal, type HelpSection } from '@/components/ui/HelpModal'
import { getABStats, clearABHistory } from '@/lib/ab_testing'
import { engineFeedback, type EngineLearningStats } from '@/lib/ia/engines/engineFeedback'
import { inspecteurMonitoring, type CapaciteInspecteur, CAPACITES_INSPECTEUR, type InspecteurMonitoringStats } from '@/lib/ia/engines/inspecteurMonitoring'
import { statsCacheOutils } from '@/lib/ia/pilote/bouclePilote'
import { synthetiserModeles } from '@/lib/risque/modelSynthesis'
import { EnClairNote } from './EnClairNote'
import { CompteurPoidsAprentissage } from './CompteurPoidsAprentissage'
import { recommanderModeleAnalyse } from '@/lib/ia/modelSelector'
import ApprentissageCard from './ApprentissageCard'
import type { ModeleBenchmarkId } from '@/lib/ia/benchmark'
import { MODELE_LABELS, DEFAULT_BENCHMARK_CONFIG, MODEL_HYPERPARAMS, configEstPersonnalisee } from '@/lib/ia/benchmark'
import type { BenchmarkConfig } from '@/lib/ia/benchmark'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from 'recharts'
import { creerRapportPdf, PDF_COLORS } from '@/lib/services/pdfRapport'
import {
  Brain, Target, TrendingUp, AlertTriangle, CheckCircle2, RefreshCw,
  Database, Download, Upload, RotateCcw,
  BookOpen, FlaskConical, Network, Users, Cpu,
  Play, Trophy, Settings, SlidersHorizontal, FileText,
} from 'lucide-react'

interface Props { user: AuthUser }

const CAPACITE_LABELS: Record<CapaciteInspecteur, string> = {
  checklist: 'Checklist',
  ecart: 'Écarts',
  rapport: 'Rapports',
  certification: 'Certification / Homologation',
  evenement: 'Événements',
}

export default function MLMonitoringModule({ user }: Props) {
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const ecarts = useAppStore(s => s.ecarts)
  const surveillances = useAppStore(s => s.surveillances)
  const amdecAnalyses = useAppStore(s => s.amdecAnalyses)
  const ftaAnalyses = useAppStore(s => s.ftaAnalyses)
  const evenementsSecurite = useAppStore(s => s.evenements)
  const learningFeedbacks = useAppStore(s => s.learningFeedbacks)
  const currentModel = useAppStore(s => s.currentModel)
  const recalibrationAlerts = useAppStore(s => s.recalibrationAlerts)
  const calculatePerformance = useAppStore(s => s.calculatePerformance)
  const getDetailedLearningStats = useAppStore(s => s.getDetailedLearningStats)
  const recalibrateModel = useAppStore(s => s.recalibrateModel)
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
  const isBenchmarking = useAppStore(s => s.isBenchmarking)
  const benchmarkOutcome = useAppStore(s => s.benchmarkOutcome)
  const activeModelId = useAppStore(s => s.activeModelId)
  const activeModelName = useAppStore(s => s.activeModelName)
  const activeModelTrainedAt = useAppStore(s => s.activeModelTrainedAt)
  const runBenchmarkModels = useAppStore(s => s.runBenchmarkModels)
  const selectActiveModel = useAppStore(s => s.selectActiveModel)
  const loadBenchmarkState = useAppStore(s => s.loadBenchmarkState)
  const benchmarkConfig = useAppStore(s => s.benchmarkConfig)
  const setBenchmarkConfig = useAppStore(s => s.setBenchmarkConfig)
  const hydrateMlSamplesFromCentral = useAppStore(s => s.hydrateMlSamplesFromCentral)
  const refreshModelInfoAfterHydration = useAppStore(s => s.refreshModelInfo)

  const aerodromes = useAppStore(s => s.aerodromes)

  const [showHelp, setShowHelp] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [pdfExportError, setPdfExportError] = useState<string | null>(null)
  const [engineStats] = useState<EngineLearningStats | null>(() => engineFeedback.getStats())
  const [inspecteurStats] = useState<InspecteurMonitoringStats | null>(() => inspecteurMonitoring.getStats())
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null)

  useEffect(() => { loadBenchmarkState() }, [loadBenchmarkState])

  // Hydratation best-effort : Supabase (ml_samples) → cache local IDB.
  // Débloque benchmark + auto-train sur tout poste autre que celui qui a signé.
  useEffect(() => {
    let cancelled = false
    hydrateMlSamplesFromCentral().then((added) => {
      if (!cancelled && added > 0) refreshModelInfoAfterHydration()
    }).catch(() => { /* réseau indisponible — cache local conservé */ })
    return () => { cancelled = true }
  }, [hydrateMlSamplesFromCentral, refreshModelInfoAfterHydration])

  const isAdmin = user?.role === 'admin'
  const stats = learningFeedbacks.length > 0 ? calculatePerformance() : null
  const detailedStats = learningFeedbacks.length > 0 ? getDetailedLearningStats() : null
  const pacStats = getLearningStatsPAC()
  const pendingAlerts = useMemo(() => recalibrationAlerts?.filter(a => !a.traitee) || [], [recalibrationAlerts])
  const mlRiskCorrelation: MLRiskCorrelationData = useMemo(() => getMLRiskCorrelation(), [getMLRiskCorrelation])
  const premierProfil = useMemo(() => {
    const arr = profilsRisque ? Object.values(profilsRisque) : []
    return arr[0] || null
  }, [profilsRisque])

  const handleRecalibrate = () => recalibrateModel('manuel', user?.prenom && user?.nom ? `${user.prenom} ${user.nom}` : 'admin')

  const construireRapportMLPDF = useCallback(async (): Promise<Blob> => {
    const pdf = await creerRapportPdf()

    const aerodromeNom = premierProfil?.aerodrome_id
      ? aerodromes.find(a => a.id === premierProfil.aerodrome_id)?.nom || premierProfil.aerodrome_id
      : '—'
    const diag = premierProfil ? synthetiserModeles(premierProfil) : null
    const tendanceLabel = diag?.tendance === 'amelioration' ? 'Amélioration'
      : diag?.tendance === 'degradation_rapide' ? 'Dégradation rapide'
      : diag?.tendance === 'degradation_legere' ? 'Dégradation légère'
      : 'Stable'
    const date = new Date().toISOString().split('T')[0]

    pdf.coverPage({
      titre: 'RAPPORT DE MONITORING DES MODÈLES D’INTELLIGENCE ARTIFICIELLE',
      sousTitre: 'Performance, entraînement et calibrage des modèles de risque — SGDA V5',
      ref: `ML-${date.replace(/-/g, '')}-${(activeModelName || 'RF').toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
      meta: [
        ['Aérodrome', aerodromeNom],
        ['Date du rapport', new Date().toLocaleDateString('fr-FR')],
        ['Modèle actif', activeModelName || 'aucun'],
        ['Dernier entraînement', activeModelTrainedAt ? new Date(activeModelTrainedAt).toLocaleDateString('fr-FR') : '—'],
        ['Corrélation ML / risque', `${mlRiskCorrelation.convergenceScore}%`],
        ['Alertes en attente', `${pendingAlerts.length}`],
      ],
    })

    pdf.addPage()

    pdf.kpiBoxes([
      { value: detailedStats ? `${detailedStats.taux_justesse.toFixed(1)}%` : '—', label: 'Précision apprentissage', color: PDF_COLORS.green },
      { value: activeModelName || 'aucun', label: 'Modèle actif', color: PDF_COLORS.primary },
      { value: inspecteurStats ? `${inspecteurStats.maturiteGlobale.toFixed(0)}/100` : '—', label: 'Maturité inspecteur', color: PDF_COLORS.blue },
      { value: engineStats ? `${(engineStats.pertinenceRate * 100).toFixed(0)}%` : '—', label: 'Pertinence AERORISQ', color: PDF_COLORS.amber },
      { value: `${mlRiskCorrelation.convergenceScore}%`, label: 'Corrélation ML/risque', color: PDF_COLORS.primary },
      { value: `${pendingAlerts.length}`, label: 'Alertes en attente', color: pendingAlerts.length > 0 ? PDF_COLORS.red : PDF_COLORS.green },
    ])

    // 1. Synthèse en langage clair
    pdf.sectionTitle('1. Synthèse en langage clair')
    if (diag) {
      pdf.infoBox(
        `Tendance : ${tendanceLabel} — indice global ${Math.round(diag.indiceGlobal)}/100 (confiance ${Math.round(diag.confianceGlobale)}%)`,
        { title: 'Diagnostic consolidé', tone: 'green' },
      )
      pdf.paragraph(`Interprétation : ${diag.interpretation}`)
      pdf.paragraph(`Recommandation : ${diag.recommandation}`)
      if (diag.elementsClefs.length > 0) pdf.bulletList(diag.elementsClefs)
      if (diag.votes.length > 0) {
        pdf.subHeading('Votes des modèles')
        pdf.table({
          head: [['Modèle', 'Indice', 'Confiance', 'Interprétation']],
          body: diag.votes.map(v => [v.nom, String(v.indiceDegradation), `${v.confiance}%`, v.interpretation]),
          columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 14, halign: 'right' }, 2: { cellWidth: 18, halign: 'right' } },
        })
      }
    } else {
      pdf.paragraph('Aucun profil de risque chargé — la synthèse IA n\'est pas disponible.')
    }

    // 2. Benchmark des modèles ML
    pdf.sectionTitle('2. Benchmark des modèles ML')
    if (benchmarkOutcome && benchmarkOutcome.ranked.length > 0) {
      pdf.table({
        head: [['#', 'Modèle', 'Score', 'Accuracy', 'F1', 'ROC-AUC']],
        body: benchmarkOutcome.ranked.map((r, i) => [
          String(i + 1), r.nom, r.score.toFixed(1),
          `${(r.accuracy * 100).toFixed(1)}%`, `${(r.f1Score * 100).toFixed(1)}%`, `${(r.rocAuc * 100).toFixed(1)}%`,
        ]),
        columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 40 }, 2: { cellWidth: 22, halign: 'right' }, 3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 20, halign: 'right' }, 5: { cellWidth: 26, halign: 'right' } },
      })
    } else {
      pdf.paragraph('Benchmark non réalisé (il faut au moins 10 échantillons d\'entraînement).')
    }

    // 3. Précision par domaine
    pdf.sectionTitle('3. Précision par domaine')
    if (detailedStats && Object.keys(detailedStats.precision_par_domaine).length > 0) {
      pdf.table({
        head: [['Domaine', 'Précision']],
        body: Object.entries(detailedStats.precision_par_domaine).map(([d, p]) => [d, `${p.toFixed(1)}%`]),
        columnStyles: { 1: { cellWidth: 40, halign: 'right' } },
      })
    } else {
      pdf.paragraph('Pas encore de données par domaine.')
    }

    // 4. Alertes de recalibrage
    pdf.sectionTitle('4. Alertes de recalibrage')
    if (pendingAlerts.length > 0) {
      pendingAlerts.slice(0, 10).forEach(a => {
        pdf.infoBox(a.message, {
          title: a.niveau === 'critical' ? 'ALERTE CRITIQUE' : a.niveau === 'warning' ? 'Attention' : 'Information',
          tone: a.niveau === 'critical' ? 'red' : a.niveau === 'warning' ? 'amber' : 'green',
        })
      })
    } else {
      pdf.paragraph('Aucune alerte de recalibrage en attente.')
    }

    pdf.paragraph('Ce rapport est généré par le module Monitoring ML de SGDA V5 à partir des données locales du poste. Les modèles mathématiques fournissent une interprétation automatique ; la décision finale reste de la responsabilité de l\'inspecteur.', 8, { color: PDF_COLORS.gray, italic: true })

    pdf.drawFooter('SGDA V5 — MONITORING ML — ANACIM / Direction de la Navigation Aérienne')
    return pdf.blob()
  }, [premierProfil, aerodromes, detailedStats, activeModelName, activeModelTrainedAt, inspecteurStats, engineStats, mlRiskCorrelation, pendingAlerts, benchmarkOutcome])

  const handleExportPDF = async () => {
    setPdfExportError(null)
    setExportingPdf(true)
    try {
      const blob = await construireRapportMLPDF()
      const { downloadBlob } = await import('@/lib/pdfGenerator')
      downloadBlob(blob, `rapport-monitoring-ml-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (err: unknown) {
      setPdfExportError(err instanceof Error ? err.message : "Erreur d'export PDF")
    } finally {
      setExportingPdf(false)
    }
  }

  const handleImport = () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        setImportError(null); setImportSuccess(null)
        importLearningData(await file.text())
        setImportSuccess("Données d'apprentissage importées avec succès (feedbacks, alertes, modèle).")
      }
      catch (err: unknown) { setImportError(err instanceof Error ? err.message : "Erreur d'import") }
    }
    input.click()
  }
  const handleTrainRF = () => trainRandomForestModel(10, 4)

  const handleRunBenchmark = async () => {
    setBenchmarkError(null)
    const outcome = await runBenchmarkModels()
    if (!outcome) setBenchmarkError("Benchmark impossible — il faut au moins 10 échantillons d'entraînement (collectés via les profils et le decisionTracker).")
  }

  const barColor = 'var(--role-primary)'

  return (
    <div className="space-y-6 animate-fade-in" data-module="ml-monitoring" data-role={user?.role}>
      <ModuleHeader icon={<Brain className="h-8 w-8 text-role-primary" />} title="Monitoring ML" description="Performance, entraînement et calibration des modèles d'intelligence artificielle"
        actions={<div className="flex items-center gap-2">
          <button onClick={() => setShowHelp(true)} className="btn btn-sm btn-secondary gap-1.5"><BookOpen className="w-3.5 h-3.5" />Aide</button>
          <button onClick={handleExportPDF} disabled={exportingPdf} className="btn btn-sm btn-primary gap-1.5"><FileText className="h-4 w-4" />{exportingPdf ? 'Génération…' : 'Rapport PDF'}</button>
          {isAdmin && <button onClick={handleImport} className="btn btn-sm btn-secondary gap-1.5"><Upload className="h-4 w-4" />Importer</button>}
        </div>} />

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} title="Guide — Monitoring ML" subtitle="Cinq cartes : modèles ML, risques, agents, AERORISQ, apprentissage" sections={HELP_SECTIONS} />

      {importError && <div className="alert alert-danger animate-fade-up"><AlertTriangle className="alert-icon" /><div className="alert-content">{importError}</div></div>}
      {importSuccess && <div className="alert alert-success animate-fade-up"><CheckCircle2 className="alert-icon" /><div className="alert-content">{importSuccess}</div></div>}
      {pdfExportError && <div className="alert alert-danger animate-fade-up"><AlertTriangle className="alert-icon" /><div className="alert-content">Échec du rapport PDF — {pdfExportError}</div></div>}
      {benchmarkError && <div className="alert alert-warning animate-fade-up"><AlertTriangle className="alert-icon" /><div className="alert-content">{benchmarkError}</div></div>}

      {/* ══════════════════ CARTE 1 : MODÈLES ML ══════════════════ */}
      <MLModelsCard
        benchmarkOutcome={benchmarkOutcome}
        isBenchmarking={isBenchmarking}
        activeModelId={activeModelId}
        activeModelName={activeModelName}
        activeModelTrainedAt={activeModelTrainedAt}
        rfModelInfo={rfModelInfo}
        rfSamplesCount={rfSamplesCount}
        modelMetrics={modelMetrics}
        pendingAlerts={pendingAlerts}
        onRunBenchmark={handleRunBenchmark}
        onSelectModel={selectActiveModel}
        onTrainRF={handleTrainRF}
        benchmarkConfig={benchmarkConfig}
        onSetConfig={setBenchmarkConfig}
        isAdmin={isAdmin}
        aerodromeId={premierProfil?.aerodrome_id}
      />

      {/* ══════════════════ CARTE 2 : MODÈLES DE RISQUES ══════════════════ */}
      <RiskModelsCard
        profilsRisque={profilsRisque}
        ecarts={ecarts}
        surveillances={surveillances}
        amdecAnalyses={amdecAnalyses}
        ftaAnalyses={ftaAnalyses}
        evenementsSecurite={evenementsSecurite}
        rfModelInfo={rfModelInfo}
        graphModelInfo={graphModelInfo}
        mlRiskCorrelation={mlRiskCorrelation}
        modelTrainingConfig={modelTrainingConfig}
        onTrainRF={handleTrainRF}
        rfSamplesCount={rfSamplesCount}
        isAdmin={isAdmin}
        barColor={barColor}
      />

      {/* ══════════════════ CARTE 3 : AGENTS IA ══════════════════ */}
      <AgentsCard engineStats={engineStats} inspecteurStats={inspecteurStats} aerodromeId={premierProfil?.aerodrome_id} />

      {/* ══════════════════ CARTE 4 : AERORISQ ══════════════════ */}
      <AerorisqCard
        isAdmin={isAdmin}
        pacStats={pacStats}
        detailedStats={detailedStats}
        stats={stats}
        currentModel={currentModel}
        modelTrainingConfig={modelTrainingConfig}
        onRecalibrate={handleRecalibrate}
        onReset={resetLearningData}
        onExport={handleExportPDF}
        onImport={handleImport}
        onSetAutoTrain={setAutoTrainEnabled}
        onSetInterval={setTrainInterval}
        onRefresh={refreshModelInfo}
        onResetModels={resetAdvancedModels}
        getTrainingHistory={getTrainingHistory}
        getTrainingStats={getTrainingStats}
        exportTrainingHistoryCSV={exportTrainingHistoryCSV}
        barColor={barColor}
        aerodromeId={premierProfil?.aerodrome_id}
      />

      {/* ══════════════════ CARTE 5 : APPRENTISSAGE AERORISQ (DONNÉES RÉELLES) ══════════════════ */}
      <ApprentissageCard aerodromeId={premierProfil?.aerodrome_id} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CARTE 1 — MODÈLES ML : benchmark 5 algorithmes + sélection active
// ═══════════════════════════════════════════════════════════════

function MLModelsCard({ benchmarkOutcome, isBenchmarking, activeModelId, activeModelName, activeModelTrainedAt, rfModelInfo, rfSamplesCount, modelMetrics, pendingAlerts, onRunBenchmark, onSelectModel, onTrainRF, benchmarkConfig, onSetConfig, isAdmin, aerodromeId }: {
  benchmarkOutcome: ReturnType<typeof useAppStore.getState>['benchmarkOutcome']
  isBenchmarking: boolean
  activeModelId: ModeleBenchmarkId | null
  activeModelName: string | null
  activeModelTrainedAt: string | null
  rfModelInfo: ReturnType<typeof useAppStore.getState>['rfModelInfo']
  rfSamplesCount: number
  modelMetrics: ReturnType<typeof useAppStore.getState>['modelMetrics']
  pendingAlerts: RecalibrationAlertRecord[]
  onRunBenchmark: () => void
  onSelectModel: (id: ModeleBenchmarkId) => void
  onTrainRF: () => void
  benchmarkConfig: BenchmarkConfig
  onSetConfig: (config: BenchmarkConfig) => void
  isAdmin: boolean
  aerodromeId?: string
}) {
  const ordered: ModeleBenchmarkId[] = ['random_forest', 'xgboost', 'lightgbm', 'catboost', 'mlp']
  const [showSettings, setShowSettings] = useState(false)
  const customParams = configEstPersonnalisee(benchmarkConfig)

  const updateParam = (id: ModeleBenchmarkId, key: string, value: number) => {
    onSetConfig({ ...benchmarkConfig, [id]: { ...benchmarkConfig[id], [key]: value } })
  }

  return (
    <Card icon={<Cpu className="h-4 w-4 text-role-primary" />} title="1. Modèles Machine Learning — comparaison & sélection" badge={
      <div className="flex items-center gap-2">
        {activeModelName && <span className="badge badge-primary text-xs">{activeModelName} <CheckCircle2 className="w-3 h-3 inline ml-1" /></span>}
        {customParams && isAdmin && <span className="badge warning text-xs">Paramètres personnalisés</span>}
        {isAdmin && (
          <>
            <button onClick={() => setShowSettings(s => !s)} className="btn btn-sm btn-secondary gap-1.5">
              <Settings className="h-4 w-4" />Paramètres
            </button>
            <button onClick={onRunBenchmark} disabled={isBenchmarking || rfSamplesCount < 10} className="btn btn-primary btn-sm gap-1.5">
              <RefreshCw className={`h-4 w-4 ${isBenchmarking ? 'animate-spin' : ''}`} />
              {isBenchmarking ? 'Benchmark en cours…' : 'Lancer le benchmark'}
            </button>
          </>
        )}
      </div>
    }>
      <EnClairNote module="ml-card-1" aerodromeId={aerodromeId} aQuoiCaSert="Compare 5 algorithmes (Random Forest, XGBoost, LightGBM, CatBoost, MLP) sur les mêmes données pour savoir lequel est le plus fiable, puis désigne celui qui pilote réellement les prédictions de risque." commentLire="Chaque modèle a un score sur 100 (accuracy, précision, rappel, F1, ROC-AUC). Le trophée signale le meilleur. La pastille « Utilisé » est le modèle actif : les futures prédictions passeront par lui." />
      {showSettings && isAdmin && (
        <div className="mb-5 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5 text-role-primary" />Hyperparamètres par modèle</h4>
            <button onClick={() => onSetConfig(DEFAULT_BENCHMARK_CONFIG)} className="btn btn-sm btn-secondary gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />Réinitialiser
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ordered.map(id => (
              <div key={id} className="rounded-lg bg-muted/20 p-3">
                <p className="text-sm font-medium mb-3">{MODELE_LABELS[id]}</p>
                <div className="space-y-3">
                  {MODEL_HYPERPARAMS[id].map(def => {
                    const value = benchmarkConfig[id][def.key]
                    return (
                      <div key={def.key}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-muted-foreground">{def.label}</label>
                          <input
                            type="number"
                            className="form-input w-20 text-xs py-1 text-right"
                            min={def.min}
                            max={def.max}
                            step={def.step}
                            value={value}
                            onChange={e => updateParam(id, def.key, parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <input
                          type="range"
                          className="w-full"
                          min={def.min}
                          max={def.max}
                          step={def.step}
                          value={value}
                          onChange={e => updateParam(id, def.key, parseFloat(e.target.value))}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Les paramètres sont appliqués au prochain benchmark et à l&apos;entraînement du modèle actif. Re-lancez le benchmark pour comparer les modèles avec ces valeurs.
          </p>
        </div>
      )}
      <CompteurPoidsAprentissage />
      {rfSamplesCount < 10 ? (
        <div className="text-center py-8 text-muted">
          <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Benchmark ML indisponible</p>
          <p className="text-sm">Ajoutez au moins 10 échantillons d&apos;entraînement ({rfSamplesCount} disponibles). Les échantillons sont collectés via les profils de risque et le decisionTracker.</p>
        </div>
      ) : benchmarkOutcome && benchmarkOutcome.ranked.length > 0 ? (
        <div className="space-y-5">
          {/* Tableau comparatif */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground text-xs uppercase">
                  <th className="py-2 pr-3">Modèle</th>
                  <th className="py-2 pr-3 text-right">Accuracy</th>
                  <th className="py-2 pr-3 text-right">Precision</th>
                  <th className="py-2 pr-3 text-right">Recall</th>
                  <th className="py-2 pr-3 text-right">F1</th>
                  <th className="py-2 pr-3 text-right">ROC-AUC</th>
                  <th className="py-2 pr-3 text-right">Train</th>
                  <th className="py-2 pr-3 text-right">Prédict</th>
                  <th className="py-2 pr-3 text-center">Maturité</th>
                  <th className="py-2 text-center">Actif</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map(id => {
                  const r = benchmarkOutcome.ranked.find(x => x.modelId === id)
                  if (!r) return null
                  const isBest = benchmarkOutcome.bestModelId === id
                  const isActive = activeModelId === id
                  return (
                    <tr key={id} className={`border-b border-border/50 hover:bg-muted/10 ${isActive ? 'bg-role-primary-soft/40' : ''}`}>
                      <td className="py-2 pr-3 font-medium">
                        <span className="flex items-center gap-1.5">
                          {r.nom}
                          {isBest && <span title="Meilleur score"><Trophy className="w-3.5 h-3.5 text-warning" /></span>}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold">{(r.accuracy * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-3 text-right">{(r.precision * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-3 text-right">{(r.recall * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-3 text-right">{(r.f1Score * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-3 text-right font-medium text-role-primary">{(r.rocAuc * 100).toFixed(1)}%</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">{r.trainTimeMs}ms</td>
                      <td className="py-2 pr-3 text-right text-muted-foreground">{r.predictTimeMs}ms</td>
                      <td className="py-2 pr-3 text-center"><span className="badge text-xs">{r.maturiteLabel}</span></td>
                      <td className="py-2 text-center">
                        {isAdmin ? (
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="active-model" checked={isActive} onChange={() => onSelectModel(id)} className="accent-role-primary" />
                            <span className="text-xs text-muted-foreground">{isActive ? 'Utilisé' : 'Choisir'}</span>
                          </label>
                        ) : (
                          <span className="text-xs text-muted-foreground">{isActive ? 'Utilisé' : '—'}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {benchmarkOutcome.autoSelected === false && benchmarkOutcome.selectionBlockedReason && (
            <div className="alert alert-warning animate-fade-up">
              <AlertTriangle className="alert-icon" />
              <div className="alert-content text-xs">{benchmarkOutcome.selectionBlockedReason}</div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Benchmark sur {benchmarkOutcome.datasetSize} échantillons (train {benchmarkOutcome.trainSize ?? '—'} / test {benchmarkOutcome.testSize ?? '—'}, split 75/25 stratifié).
            Le modèle sélectionné pilote réellement les prédictions de risque — dernier entraînement actif : {activeModelTrainedAt ? new Date(activeModelTrainedAt).toLocaleDateString('fr-FR') : 'jamais'}.
            {(benchmarkOutcome.testSize ?? 0) < 10 ? ' Test < 10 : métriques indicatives uniquement.' : ''}
          </p>

          {/* Calibrage + évolution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-border">
            <div>
              <h4 className="text-sm mb-2 flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5" />Calibrage & alertes</h4>
              {pendingAlerts.length === 0 ? (
                <p className="text-xs text-muted">Aucune alerte de recalibration en attente.</p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {pendingAlerts.slice(0, 5).map(a => (
                    <div key={a.id} className={`p-2 rounded-lg text-xs ${a.niveau === 'critical' ? 'bg-danger-soft' : a.niveau === 'warning' ? 'bg-warning-soft' : 'bg-primary-soft'}`}>
                      <p className="font-medium">{a.message}</p>
                      <p className="text-muted-foreground mt-0.5">{new Date(a.date).toLocaleDateString('fr-FR')}</p>
                    </div>
                  ))}
                </div>
              )}
              {modelMetrics?.random_forest && (
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Accuracy RF</p><p className="text-sm font-bold">{(modelMetrics.random_forest.accuracy * 100).toFixed(1)}%</p></div>
                  <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Échantillons</p><p className="text-sm font-bold">{rfSamplesCount}</p></div>
                </div>
              )}
            </div>
            <div>
              <h4 className="text-sm mb-2 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Évolution de la précision (historique)</h4>
              {rfModelInfo ? (
                <div className="flex items-center gap-4">
                  <div className="text-center flex-1 p-3 rounded-lg bg-role-primary-soft">
                    <p className="text-xs text-muted-foreground">Précision</p>
                    <p className="text-2xl font-bold text-success">{(rfModelInfo.accuracy * 100).toFixed(0)}%</p>
                    <p className="text-[10px] text-muted-foreground">v{rfModelInfo.version} · {new Date(rfModelInfo.trained_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                  <div className="flex-1">
                    {isAdmin && <button onClick={onTrainRF} className="btn btn-sm btn-secondary w-full gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Entraîner RF</button>}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted">Random Forest non entraîné.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted">
          <Cpu className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aucun benchmark effectué</p>
          <p className="text-sm">Lancez le benchmark pour comparer les 5 algorithmes (RF, XGBoost, LightGBM, CatBoost, MLP) sur {rfSamplesCount} échantillons.</p>
        </div>
      )}
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// CARTE 2 — MODÈLES DE RISQUES : précision, maturité, évolution, calibrage, simulation
// ═══════════════════════════════════════════════════════════════

function RiskModelsCard({ profilsRisque, ecarts, surveillances, amdecAnalyses, ftaAnalyses, evenementsSecurite, rfModelInfo, graphModelInfo, mlRiskCorrelation, modelTrainingConfig, onTrainRF, rfSamplesCount, isAdmin, barColor }: {
  profilsRisque: Record<string, ProfilRisque> | null
  ecarts: Ecart[]
  surveillances: Surveillance[]
  amdecAnalyses: AmdecAnalyse[]
  ftaAnalyses: ArbreFTA[]
  evenementsSecurite: EvenementSecurite[]
  rfModelInfo: ReturnType<typeof useAppStore.getState>['rfModelInfo']
  graphModelInfo: ReturnType<typeof useAppStore.getState>['graphModelInfo']
  mlRiskCorrelation: MLRiskCorrelationData
  modelTrainingConfig: ModelTrainingConfig
  onTrainRF: () => void
  rfSamplesCount: number
  isAdmin: boolean
  barColor: string
}) {
  const premierProfil = profilsRisque ? Object.values(profilsRisque)[0] : null
  const recommandation = useMemo(() => recommanderModeleAnalyse({
    profil: premierProfil,
    ecarts,
    surveillances,
    amdecAnalyses,
    ftaAnalyses,
    evenements: evenementsSecurite,
    rfModelInfo,
  }), [premierProfil, ecarts, surveillances, amdecAnalyses, ftaAnalyses, evenementsSecurite, rfModelInfo])

  const totalBowTies = useMemo(() => {
    const ps = profilsRisque ? Object.values(profilsRisque) : []
    return ps.reduce((sum, p) => sum + (p.bowtie_metrics?.length || 0), 0)
  }, [profilsRisque])

  return (
    <Card icon={<Target className="h-4 w-4 text-role-primary" />} title="2. Modèles de risques — précision, maturité, simulation" badge={
      <span className="badge text-xs">{recommandation.recommande}</span>
    }>
      <EnClairNote module="ml-card-2" aerodromeId={premierProfil?.aerodrome_id} aQuoiCaSert="Mesure à quel point les modèles de risque (Bow-Tie, FTA, AMDEC, ML) concordent avec les scores réels, et recommande le modèle le plus adapté pour analyser un aérodrome." commentLire="La « Convergence ML ↔ Risque » et l'« Alignement C1-C5 » indiquent la cohérence entre modèles et réalité (plus haut = plus fiable). Le badge du titre est le modèle recommandé pour l'analyse en cours." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Précision / maturité */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Convergence ML ↔ Risque</p>
              <p className={`text-xl font-bold ${mlRiskCorrelation.convergenceScore >= 60 ? 'text-success' : 'text-warning'}`}>{mlRiskCorrelation.convergenceScore}%</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Score risque moyen</p>
              <p className="text-xl font-bold">{mlRiskCorrelation.avgRiskScore}/100</p>
              <p className="text-xs text-muted-foreground">{mlRiskCorrelation.aerodromeCount} aérodromes</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Alignement C1-C5</p>
              <p className={`text-xl font-bold ${mlRiskCorrelation.alignmentScore >= 60 ? 'text-success' : 'text-warning'}`}>{mlRiskCorrelation.alignmentScore}%</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Modèles Bow-Tie</p>
              <p className="text-xl font-bold">{totalBowTies}</p>
            </div>
          </div>

          {/* Distribution des niveaux */}
          <div>
            <h4 className="text-sm mb-2">Distribution des niveaux de risque</h4>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(mlRiskCorrelation.riskLevelDistribution).map(([level, count]) => (
                <span key={level} className={`badge text-xs ${level === 'critique' ? 'danger' : level === 'eleve' ? 'warning' : level === 'moyen' ? 'primary' : 'success'}`}>
                  {level} : {count}
                </span>
              ))}
            </div>
          </div>

          {/* Features importantes */}
          {mlRiskCorrelation.topFeatures.length > 0 && (
            <div>
              <h4 className="text-sm mb-2">Features les plus influentes</h4>
              <div className="space-y-1.5">
                {mlRiskCorrelation.topFeatures.slice(0, 6).map(f => (
                  <div key={f.name} className="flex items-center gap-2">
                    <span className="text-xs w-36 truncate text-muted-foreground">{f.name.replace(/_/g, ' ')}</span>
                    <div className="progress h-1.5 flex-1"><div className="progress-bar" style={{ width: `${f.importance}%`, backgroundColor: barColor }} /></div>
                    <span className="text-xs font-mono">{Math.round(f.importance)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Simulation / recommandation */}
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <h4 className="text-sm mb-1 flex items-center gap-1.5"><Play className="w-3.5 h-3.5" />Simulation — modèle recommandé</h4>
            <p className="text-sm font-medium text-role-primary">{recommandation.justification}</p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {recommandation.scores.slice(0, 6).map(s => (
                <div key={s.modele} className="p-2 rounded bg-muted/20">
                  <p className="text-[10px] text-muted-foreground capitalize">{s.modele}</p>
                  <p className="text-sm font-bold">{s.score}/100</p>
                  <p className="text-[10px] text-muted-foreground">conf {s.confiance}%</p>
                </div>
              ))}
            </div>
          </div>

          {graphModelInfo && (
            <div className="rounded-lg border border-border p-3">
              <h4 className="text-sm mb-2 flex items-center gap-1.5"><Network className="w-3.5 h-3.5" />Graph Network</h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-lg font-bold">{graphModelInfo.nodes_count}</p><p className="text-[10px] text-muted-foreground">nœuds</p></div>
                <div><p className="text-lg font-bold">{graphModelInfo.edges_count}</p><p className="text-[10px] text-muted-foreground">arêtes</p></div>
                <div><p className="text-lg font-bold">{graphModelInfo.critical_paths_count}</p><p className="text-[10px] text-muted-foreground">chemins critiques</p></div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-xs text-muted-foreground">
              Auto-entraînement : {modelTrainingConfig?.auto_train_enabled ? 'activé' : 'désactivé'} (toutes les {modelTrainingConfig?.train_interval_hours ?? 24}h)
            </div>
            {isAdmin && <button onClick={onTrainRF} disabled={rfSamplesCount < 10} className="btn btn-sm btn-secondary gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Entraîner RF</button>}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// CARTE 3 — AGENTS IA : précision & maturité
// ═══════════════════════════════════════════════════════════════

function AgentsCard({ engineStats, inspecteurStats, aerodromeId }: {
  engineStats: EngineLearningStats | null
  inspecteurStats: InspecteurMonitoringStats | null
  aerodromeId?: string
}) {
  return (
    <Card icon={<Users className="h-4 w-4 text-role-primary" />} title="3. Agents IA — précision & maturité">
      <EnClairNote module="ml-card-4" aerodromeId={aerodromeId} aQuoiCaSert="Montre la fiabilité des agents IA (AERORISQ et inspecteur virtuel) mesurée à partir de vos retours : accepter, corriger ou ignorer leurs suggestions." commentLire="Le taux de pertinence indique la part de suggestions jugées utiles (visé ≥ 60%). La maturité /100 par capacité (checklist, écarts, rapports...) suit votre taux d'acceptation. Plus vous validez, plus l'agent apprend et devient fiable." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agents décisionnels AERORISQ */}
        <div>
          <h4 className="text-sm mb-2">Agents décisionnels (pertinence)</h4>
          {engineStats && engineStats.totalFeedbacks > 0 ? (
            <div className="space-y-2">
              {(Object.entries(engineStats.parEngine) as [string, { total: number; pertinents: number; taux: number }][]).map(([engine, data]) => (
                <div key={engine} className="p-2.5 rounded-lg bg-muted/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium capitalize">{engine === 'riskProfile' ? 'Profil risque' : engine === 'compliance' ? 'Conformité' : engine === 'certificate' ? 'Certificat' : engine === 'team' ? 'Équipe' : 'Recommandations'}</span>
                    <span className={`text-sm font-bold ${data.taux >= 60 ? 'text-success' : data.taux >= 40 ? 'text-warning' : 'text-danger'}`}>{data.taux}%</span>
                  </div>
                  <div className="progress h-1.5"><div className="progress-bar" style={{ width: `${data.taux}%`, backgroundColor: data.taux >= 60 ? 'var(--success)' : data.taux >= 40 ? 'var(--warning)' : 'var(--danger)' }} /></div>
                  <p className="text-[10px] text-muted-foreground mt-1">{data.total} votes · pertinents {data.pertinents}</p>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">Taux de pertinence global</span>
                <span className={`font-bold ${engineStats.pertinenceRate >= 60 ? 'text-success' : 'text-warning'}`}>{engineStats.pertinenceRate}%</span>
              </div>
            </div>
          ) : <p className="text-sm text-muted text-center py-6">Aucun feedback d&apos;agent décisionnel enregistré.</p>}
        </div>

        {/* Inspecteur virtuel — maturité par capacité */}
        <div>
          <h4 className="text-sm mb-2">Inspecteur virtuel — maturité par capacité</h4>
          {inspecteurStats && inspecteurStats.totalFeedbacks > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <div className="bg-role-primary-soft rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Maturité globale</p>
                  <p className="text-lg font-bold">{inspecteurStats.maturiteGlobale}/100</p>
                  <p className="text-[10px] font-semibold text-role-primary">{inspecteurStats.maturiteGlobaleLabel}</p>
                </div>
                <div className="bg-role-primary-soft rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Retours</p>
                  <p className="text-lg font-bold">{inspecteurStats.totalFeedbacks}</p>
                </div>
                <div className="bg-role-primary-soft rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Capacités</p>
                  <p className="text-lg font-bold">{CAPACITES_INSPECTEUR.filter(c => inspecteurStats.parCapacite[c].total > 0).length}/{CAPACITES_INSPECTEUR.length}</p>
                </div>
                <div className="bg-role-primary-soft rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-muted-foreground">Acceptation</p>
                  <p className={`text-lg font-bold ${inspecteurStats.maturiteGlobale >= 60 ? 'text-success' : 'text-warning'}`}>{inspecteurStats.maturiteGlobale}%</p>
                </div>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {CAPACITES_INSPECTEUR.map(c => {
                  const s = inspecteurStats.parCapacite[c]
                  if (s.total === 0) return null
                  return (
                    <div key={c} className="p-2 rounded-lg bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">{CAPACITE_LABELS[c]}</span>
                        <div className="flex gap-2 text-[10px]">
                          <span className="text-success">{s.tauxAcceptation}% ok</span>
                          <span className="text-warning">{s.tauxCorrection}% corr</span>
                          <span className="text-danger">{s.tauxRejet}% rej</span>
                        </div>
                      </div>
                      <div className="progress h-1.5 mt-1"><div className="progress-bar" style={{ width: `${s.maturite}%` }} /></div>
                    </div>
                  )
                })}
              </div>
              {/* Objectivité : confiance aveugle (tout accepté, jamais corrigé ni rejeté) */}
              {(() => {
                const parInspecteur = inspecteurMonitoring.objectiviteParInspecteur()
                  .filter(o => o.volume >= 3);
                if (parInspecteur.length === 0) return null;
                const st = useAppStore.getState();
                const nomDe = (id: string) => {
                  const u = (st.utilisateurs || []).find(x => x.id === id);
                  const nom = `${u?.prenom || ''} ${u?.nom || ''}`.trim();
                  return nom || `ID ${id.slice(0, 8)}`;
                };
                return (
                  <div className="mt-2 p-2 rounded-lg bg-muted/20">
                    <p className="text-xs font-medium mb-1">Objectivité des suggestions IA</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {parInspecteur.map(o => (
                        <div key={o.inspecteurId} className="flex items-center justify-between text-[11px]">
                          <span className="truncate">{nomDe(o.inspecteurId)}</span>
                          <span className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-muted-foreground">{o.tauxAcceptation}% ok / {o.volume}</span>
                            {o.aveugle && (
                              <span className="px-1.5 py-px rounded-full bg-danger/15 text-danger font-semibold" title="≥90 % acceptés sans jamais corriger ni rejeter — à signaler au chef">
                                Confiance aveugle
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                    {(() => {
                      const cache = statsCacheOutils();
                      if (cache.lectures === 0) return null;
                      return (
                        <p className="text-[11px] text-muted-foreground mt-1.5" title="Lectures d'outils servies depuis le cache (session)">
                          ⚡ Cache outils : {cache.taux}% hits ({cache.hits}/{cache.lectures} lectures évitées)
                        </p>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          ) : <p className="text-sm text-muted text-center py-6">Aucun retour inspecteur virtuel. Acceptez, corrigez ou ignorez les suggestions dans les checklists et la rédaction d&apos;écarts.</p>}
        </div>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// CARTE 4 — AERORISQ : simulation, entraînement, A/B testing
// ═══════════════════════════════════════════════════════════════

function AerorisqCard({ isAdmin, pacStats, detailedStats, stats, currentModel, modelTrainingConfig, onRecalibrate, onReset, onExport, onImport, onSetAutoTrain, onSetInterval, onRefresh, onResetModels, getTrainingHistory, getTrainingStats, exportTrainingHistoryCSV, barColor, aerodromeId }: {
  isAdmin: boolean
  pacStats: ReturnType<ReturnType<typeof useAppStore.getState>['getLearningStatsPAC']> | null
  detailedStats: ReturnType<ReturnType<typeof useAppStore.getState>['getDetailedLearningStats']> | null
  stats: ReturnType<ReturnType<typeof useAppStore.getState>['calculatePerformance']> | null
  currentModel: ReturnType<typeof useAppStore.getState>['currentModel']
  modelTrainingConfig: ModelTrainingConfig
  onRecalibrate: () => void
  onReset: () => void
  onExport: () => void
  onImport: () => void
  onSetAutoTrain: (enabled: boolean) => void
  onSetInterval: (hours: number) => void
  onRefresh: () => void
  onResetModels: () => void
  getTrainingHistory: () => Promise<TrainingHistoryEntry[]>
  getTrainingStats: () => Promise<TrainingStats>
  exportTrainingHistoryCSV: () => Promise<string>
  barColor: string
  aerodromeId?: string
}) {
  return (
    <Card icon={<Brain className="h-4 w-4 text-role-primary" />} title="4. AERORISQ — simulation, entraînement & expérimentation">
      <EnClairNote module="ml-card-5" aerodromeId={aerodromeId} aQuoiCaSert="Gère le moteur de décision global : calibration du modèle, tests A/B (formules vs réseaux de neurones), apprentissage PAC et configuration de l'auto-entraînement." commentLire="La précision globale et les taux de faux positifs/négatifs reflètent la qualité du modèle courant. Le test A/B montre quel moteur gagne le plus souvent : Neural Net ou Formules. « Recalibrer » ré-entraîne le modèle sur vos retours." />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Entraînement / modèle courant */}
        <div className="space-y-3">
          <h4 className="text-sm">Modèle courant</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Version</p><p className="text-sm font-bold">v{currentModel?.version || 1}</p></div>
            <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Précision</p><p className="text-sm font-bold">{stats?.precision_globale ?? 0}%</p></div>
            <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Faux positifs</p><p className="text-sm font-bold">{stats?.taux_faux_positifs ?? 0}%</p></div>
            <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Faux négatifs</p><p className="text-sm font-bold">{stats?.taux_faux_negatifs ?? 0}%</p></div>
          </div>
          <div className="text-xs text-muted-foreground space-y-1 pt-1 border-t border-border">
            <p>Dernière calibration : {currentModel?.date_calibration ? new Date(currentModel.date_calibration).toLocaleDateString('fr-FR') : 'N/A'}</p>
            <p>Items améliorés : {detailedStats?.items_ameliores ?? 0} · dégradés : {detailedStats?.items_degrades ?? 0}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button onClick={onRecalibrate} className="btn btn-primary btn-sm flex-1 gap-1.5"><RefreshCw className="h-4 w-4" />Recalibrer</button>
              <button onClick={onReset} className="btn btn-sm btn-secondary gap-1.5"><RotateCcw className="h-4 w-4" />Réinit.</button>
            </div>
          )}
        </div>

        {/* A/B Testing + PAC */}
        <div className="space-y-3">
          <h4 className="text-sm">A/B testing & PAC Learning</h4>
          <ABTestingSection isAdmin={isAdmin} />
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Feedbacks PAC</p><p className="text-sm font-bold">{pacStats?.total_feedbacks ?? 0}</p></div>
            <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Concordance PAC</p><p className="text-sm font-bold text-success">{pacStats?.taux_concordance ?? 0}%</p></div>
          </div>
        </div>

        {/* Configuration (admin) */}
        {isAdmin && (
          <div className="space-y-3">
            <h4 className="text-sm">Configuration entraînement</h4>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Entraînement auto</p>
              <label className="form-toggle"><input type="checkbox" checked={modelTrainingConfig?.auto_train_enabled ?? false} onChange={e => onSetAutoTrain(e.target.checked)} /><span className="form-toggle-slider" /></label>
            </div>
            <select value={modelTrainingConfig?.train_interval_hours ?? 24} onChange={e => onSetInterval(parseInt(e.target.value))} className="form-select text-sm w-full">
              <option value={6}>6 heures</option><option value={24}>24 heures</option><option value={168}>1 semaine</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onRefresh} className="btn btn-sm btn-secondary gap-1.5"><RefreshCw className="h-4 w-4" />Rafraîchir</button>
              <button onClick={onResetModels} className="btn btn-sm btn-danger gap-1.5"><RotateCcw className="h-4 w-4" />Réinitialiser</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onExport} className="btn btn-sm btn-primary gap-1.5"><FileText className="h-3.5 w-3.5" />Rapport PDF</button>
              <button onClick={onImport} className="btn btn-sm btn-secondary gap-1.5"><Upload className="h-3.5 w-3.5" />Importer</button>
            </div>
          </div>
        )}
      </div>

      {/* Historique des entraînements */}
      <div className="mt-5 pt-4 border-t border-border">
        <HistorySection getTrainingHistory={getTrainingHistory} getTrainingStats={getTrainingStats} exportTrainingHistoryCSV={exportTrainingHistoryCSV} barColor={barColor} />
      </div>
    </Card>
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
  const load = useCallback(() => { Promise.all([getTrainingHistory(), getTrainingStats()]).then(([h, s]) => { setHistory(h); setStats(s); setLoading(false) }) }, [getTrainingHistory, getTrainingStats])
  useEffect(() => { load() }, [load])
  const handleExport = async () => {
    const csv = await exportTrainingHistoryCSV(); const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `training-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  if (loading) return <div className="text-center py-8 text-muted"><RefreshCw className="w-8 h-8 mx-auto mb-2 opacity-30 animate-spin" /><p>Chargement...</p></div>
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm">Historique des entraînements</h4>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-sm btn-secondary gap-1"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={handleExport} className="btn btn-sm btn-primary gap-1"><Download className="h-4 w-4" />CSV</button>
        </div>
      </div>
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
    </div>
  )
}

function ABTestingSection({ isAdmin }: { isAdmin: boolean }) {
  const [abStats, setAbStats] = useState(getABStats())
  return (
    <div className="rounded-lg border border-border p-3">
      {abStats ? (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted">Tests A/B</span><span className="font-bold">{abStats.total}</span></div>
          <div className="flex justify-between"><span className="text-green-600">Neural Net</span><span>{abStats.neuralWins} ({Math.round(abStats.neuralWinRate * 100)}%)</span></div>
          <div className="flex justify-between"><span className="text-orange-600">Formules</span><span>{abStats.formulasWins} ({Math.round(abStats.formulasWinRate * 100)}%)</span></div>
          {isAdmin && <button onClick={() => { clearABHistory(); setAbStats(getABStats()) }} className="btn btn-sm btn-secondary w-full mt-1 gap-1"><RotateCcw className="h-3.5 w-3.5" />Réinitialiser</button>}
        </div>
      ) : <p className="text-sm text-muted">Aucun test A/B. Créés automatiquement à chaque prédiction.</p>}
    </div>
  )
}

const HELP_SECTIONS: HelpSection[] = [
  { id: 'ml', title: '1. Modèles ML', content: 'Compare les 5 algorithmes (Random Forest, XGBoost, LightGBM, CatBoost, MLP) sur accuracy, precision, recall, F1, ROC-AUC et temps. Sélectionnez le modèle actif qui pilote les prédictions de risque. Via le bouton « Paramètres », ajustez les hyperparamètres de chaque modèle (arbres, profondeur, taux d\'apprentissage, époques...) puis relancez le benchmark pour comparer les performances avec ces valeurs.' },
  { id: 'risques', title: '2. Modèles de risques', content: 'Précision, maturité, convergence ML et simulation du modèle de risque recommandé (Bow-Tie, FTA, AMDEC, HMM, survie, EVT, copules...).' },
  { id: 'agents', title: '3. Agents IA', content: 'Pertinence des agents décisionnels AERORISQ et maturité par capacité de l\'inspecteur virtuel.' },
  { id: 'aerorisq', title: '4. AERORISQ', content: 'Simulation, entraînement, A/B testing (neural vs formules), PAC Learning et configuration.' },
  { id: 'apprentissage', title: '5. Apprentissage AERORISQ', content: 'Précision réelle des prédictions (MAE, biais), dataset (écarts résolus, preuves transcrites, rapports, échantillons ML, prédictions suivies/vérifiées), derniers passages des 6 boucles et modèle local Ollama. Lecture seule.' },
]
