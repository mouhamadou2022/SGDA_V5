// components/modules/ml-monitoring/MLMonitoringModule.tsx
// Monitoring ML — 6 grandes cartes :
// 1. Modèles ML (RF / XGBoost / LightGBM / CatBoost / MLP) : benchmark, maturité, calibrage, sélection du modèle actif
// 2. Modèles de risques : précision, maturité, évolution, calibrage, simulation
// 3. Modèles mathématiques : calibrage + simulation
// 4. Agents IA : précision, maturité
// 5. AERORISQ : simulation, entraînement, A/B testing
// 6. Synthèse : données + langage clair

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
import { thresholdController } from '@/lib/ia/thresholdController'
import { synthetiserModeles, NOMBRE_MAX_VOTES } from '@/lib/risque/modelSynthesis'
import { pctBayes } from '@/lib/risque/bayesian'
import { EnClairNote } from './EnClairNote'
import { recommanderModeleAnalyse } from '@/lib/ia/modelSelector'
import { lancerDiagnosticOrchestrateur, lireDernierDiagnostic, historiqueOrchestrateur } from '@/lib/ia/orchestrateur'
import type { ResultatOrchestrateur } from '@/lib/ia/orchestrateur'
import DigitalTwinCard from './DigitalTwinCard'
import ShapExplainerCard from './ShapExplainerCard'
import OaciGraphCard from './OaciGraphCard'
import SimulationSurveillanceCard from './SimulationSurveillanceCard'
import type { ModeleBenchmarkId } from '@/lib/ia/benchmark'
import { MODELE_LABELS, DEFAULT_BENCHMARK_CONFIG, MODEL_HYPERPARAMS, configEstPersonnalisee } from '@/lib/ia/benchmark'
import type { BenchmarkConfig } from '@/lib/ia/benchmark'
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid,
} from 'recharts'
import { generatePDFFromHTMLString } from '@/lib/pdfGenerator'
import {
  Brain, Target, TrendingUp, AlertTriangle, CheckCircle2, RefreshCw,
  Database, Download, Upload, RotateCcw,
  BookOpen, FlaskConical, Network, Users, Cpu, Calculator,
  Play, Trophy, Sparkles, Settings, SlidersHorizontal, Workflow, History, FileText,
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

  const construireHTMLRapport = useCallback(() => {
    const aerodromeNom = premierProfil?.aerodrome_id
      ? aerodromes.find(a => a.id === premierProfil.aerodrome_id)?.nom || premierProfil.aerodrome_id
      : '—'
    const diag = premierProfil ? synthetiserModeles(premierProfil) : null
    const tendanceLabel = diag?.tendance === 'amelioration' ? 'Amélioration' : diag?.tendance === 'degradation_rapide' ? 'Dégradation rapide' : diag?.tendance === 'degradation_legere' ? 'Dégradation légère' : 'Stable'

    const kpi = (label: string, value: string, sub?: string) => `
      <div style="flex:1;min-width:130px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin:4px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;">${label}</div>
        <div style="font-size:18px;font-weight:700;color:#0f172a;margin-top:2px;">${value}</div>
        ${sub ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${sub}</div>` : ''}
      </div>`

    const voteRows = diag && diag.votes.length > 0
      ? diag.votes.map(v => `
        <tr>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${v.nom}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;font-weight:600;">${v.indiceDegradation}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${v.confiance}%</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${v.interpretation}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="padding:6px 8px;font-size:11px;color:#64748b;">Aucun profil de risque disponible pour la synthèse.</td></tr>'

    const benchRows = benchmarkOutcome && benchmarkOutcome.ranked.length > 0
      ? benchmarkOutcome.ranked.map((r, i) => `
        <tr>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;">${i + 1}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:600;">${r.nom}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${r.score.toFixed(1)}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${(r.accuracy * 100).toFixed(1)}%</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${(r.f1Score * 100).toFixed(1)}%</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;">${(r.rocAuc * 100).toFixed(1)}%</td>
        </tr>`).join('')
      : '<tr><td colspan="6" style="padding:6px 8px;font-size:11px;color:#64748b;">Benchmark non réalisé (il faut au moins 10 échantillons d\'entraînement).</td></tr>'

    const alertLines = pendingAlerts.length > 0
      ? pendingAlerts.slice(0, 10).map(a => `<li style="font-size:11px;margin:3px 0;">${a.niveau.toUpperCase()} — ${a.message}</li>`).join('')
      : '<li style="font-size:11px;color:#64748b;">Aucune alerte de recalibrage en attente.</li>'

    const dom = (nom: string, prec: number) =>
      `<tr><td style="padding:3px 8px;border-bottom:1px solid #eef2f7;font-size:11px;">${nom}</td><td style="padding:3px 8px;border-bottom:1px solid #eef2f7;font-size:11px;text-align:right;font-weight:600;">${prec.toFixed(1)}%</td></tr>`

    const domainesRows = detailedStats && Object.keys(detailedStats.precision_par_domaine).length > 0
      ? Object.entries(detailedStats.precision_par_domaine).map(([d, p]) => dom(d, p)).join('')
      : '<tr><td colspan="2" style="padding:4px 8px;font-size:11px;color:#64748b;">Pas encore de données par domaine.</td></tr>'

    return `
      <html><head><meta charset="utf-8" /></head>
      <body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;margin:0;padding:0;">
        <div style="padding:0 4px;">
          <div style="border-bottom:3px solid #0f766e;padding-bottom:10px;margin-bottom:16px;">
            <h1 style="font-size:20px;margin:0;color:#0f766e;">Rapport de monitoring ML</h1>
            <div style="font-size:11px;color:#475569;margin-top:4px;">SGDA V5 — ${aerodromeNom} — généré le ${new Date().toLocaleDateString('fr-FR')}</div>
          </div>

          <h2 style="font-size:14px;color:#0f766e;margin:14px 0 6px;">1. Synthèse en langage clair</h2>
          <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:10px 12px;">
            ${diag ? `
              <p style="font-size:12px;margin:2px 0;"><b>Tendance :</b> ${tendanceLabel} — indice global ${Math.round(diag.indiceGlobal)}/100 (confiance ${Math.round(diag.confianceGlobale)}%)</p>
              <p style="font-size:12px;margin:2px 0;"><b>Interprétation :</b> ${diag.interpretation}</p>
              <p style="font-size:12px;margin:2px 0;"><b>Recommandation :</b> ${diag.recommandation}</p>
              ${diag.elementsClefs.length > 0 ? `<p style="font-size:12px;margin:2px 0;"><b>Éléments clés :</b> ${diag.elementsClefs.join(' · ')}</p>` : ''}
            ` : '<p style="font-size:12px;margin:2px 0;">Aucun profil de risque chargé — la synthèse IA n\'est pas disponible.</p>'}
          </div>

          <h2 style="font-size:14px;color:#0f766e;margin:14px 0 6px;">2. Indicateurs clés</h2>
          <div style="display:flex;flex-wrap:wrap;gap:4px;">
            ${kpi('Précision apprentissage', detailedStats ? `${detailedStats.taux_justesse.toFixed(1)}%` : '—', detailedStats ? `${detailedStats.total_feedbacks} feedbacks · v${detailedStats.version_modele}` : 'aucun feedback')}
            ${kpi('Modèle actif', activeModelName || 'aucun', activeModelTrainedAt ? new Date(activeModelTrainedAt).toLocaleDateString('fr-FR') : '')}
            ${kpi('Maturité inspecteur', inspecteurStats ? `${inspecteurStats.maturiteGlobale.toFixed(0)}/100` : '—', inspecteurStats?.maturiteGlobaleLabel || '')}
            ${kpi('Pertinence AERORISQ', engineStats ? `${(engineStats.pertinenceRate * 100).toFixed(0)}%` : '—', engineStats ? `${engineStats.totalFeedbacks} retours` : '')}
            ${kpi('Corrélation ML/risque', `${mlRiskCorrelation.convergenceScore}%`, mlRiskCorrelation.aerodromeCount > 0 ? `${mlRiskCorrelation.aerodromeCount} aérodromes` : '')}
            ${kpi('Alertes en attente', `${pendingAlerts.length}`, '')}
          </div>

          <h2 style="font-size:14px;color:#0f766e;margin:14px 0 6px;">3. Détail des modèles mathématiques</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#f1f5f9;">
              <th style="padding:4px 8px;font-size:10px;text-align:left;color:#475569;text-transform:uppercase;">Modèle</th>
              <th style="padding:4px 8px;font-size:10px;text-align:right;color:#475569;text-transform:uppercase;">Indice</th>
              <th style="padding:4px 8px;font-size:10px;text-align:right;color:#475569;text-transform:uppercase;">Confiance</th>
              <th style="padding:4px 8px;font-size:10px;text-align:left;color:#475569;text-transform:uppercase;">Interprétation</th>
            </tr>
            ${voteRows}
          </table>

          <h2 style="font-size:14px;color:#0f766e;margin:14px 0 6px;">4. Benchmark des modèles ML</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#f1f5f9;">
              <th style="padding:4px 8px;font-size:10px;text-align:left;color:#475569;">#</th>
              <th style="padding:4px 8px;font-size:10px;text-align:left;color:#475569;">Modèle</th>
              <th style="padding:4px 8px;font-size:10px;text-align:right;color:#475569;">Score</th>
              <th style="padding:4px 8px;font-size:10px;text-align:right;color:#475569;">Accuracy</th>
              <th style="padding:4px 8px;font-size:10px;text-align:right;color:#475569;">F1</th>
              <th style="padding:4px 8px;font-size:10px;text-align:right;color:#475569;">ROC-AUC</th>
            </tr>
            ${benchRows}
          </table>

          <h2 style="font-size:14px;color:#0f766e;margin:14px 0 6px;">5. Précision par domaine</h2>
          <table style="width:100%;border-collapse:collapse;">
            ${domainesRows}
          </table>

          <h2 style="font-size:14px;color:#0f766e;margin:14px 0 6px;">6. Alertes de recalibrage</h2>
          <ul style="padding-left:18px;margin:4px 0;">${alertLines}</ul>

          <div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:10px;color:#94a3b8;">
            Ce rapport est généré par le module Monitoring ML de SGDA V5 à partir des données locales du poste. Les modèles mathématiques fournissent une interprétation automatique ; la décision finale reste de la responsabilité de l'inspecteur.
          </div>
        </div>
      </body></html>`
  }, [premierProfil, aerodromes, detailedStats, activeModelName, activeModelTrainedAt, inspecteurStats, engineStats, mlRiskCorrelation, pendingAlerts, benchmarkOutcome])

  const handleExportPDF = async () => {
    setPdfExportError(null)
    setExportingPdf(true)
    try {
      const result = await generatePDFFromHTMLString(construireHTMLRapport(), {
        title: `Rapport monitoring ML — ${new Date().toISOString().slice(0, 10)}`,
        author: user?.prenom && user?.nom ? `${user.prenom} ${user.nom}` : 'SGDA V5',
        subject: `Rapport de monitoring des modèles d'intelligence artificielle`,
        keywords: ['SGDA', 'IA', 'monitoring', 'apprentissage'],
        header: { text: 'SGDA V5 — Monitoring ML', height: 10 },
        footer: { text: 'Rapport généré par le module Monitoring ML', height: 10 },
      })
      if (!result.success || !result.blob) throw new Error(result.error || 'Génération impossible')
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a'); a.href = url; a.download = `rapport-monitoring-ml-${new Date().toISOString().split('T')[0]}.pdf`; a.click()
      URL.revokeObjectURL(url)
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
          <button onClick={handleImport} className="btn btn-sm btn-secondary gap-1.5"><Upload className="h-4 w-4" />Importer</button>
        </div>} />

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} title="Guide — Monitoring ML" subtitle="Onze cartes : modèles ML, risques, mathématiques, agents, AERORISQ, synthèse, diagnostic multi-agents, jumeau numérique, explicabilité SHAP, graphe OACI, simulation de surveillance" sections={HELP_SECTIONS} />

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
        barColor={barColor}
      />

      {/* ══════════════════ CARTE 3 : MODÈLES MATHÉMATIQUES ══════════════════ */}
      <MathModelsCard profilsRisque={profilsRisque} />

      {/* ══════════════════ CARTE 4 : AGENTS IA ══════════════════ */}
      <AgentsCard engineStats={engineStats} inspecteurStats={inspecteurStats} aerodromeId={premierProfil?.aerodrome_id} />

      {/* ══════════════════ CARTE 5 : AERORISQ ══════════════════ */}
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

      {/* ══════════════════ CARTE 6 : SYNTHÈSE ══════════════════ */}
      <SynthesisCard
        premierProfil={premierProfil}
        stats={stats}
        inspecteurStats={inspecteurStats}
        benchmarkOutcome={benchmarkOutcome}
        activeModelName={activeModelName}
        rfModelInfo={rfModelInfo}
        mlRiskCorrelation={mlRiskCorrelation}
        engineStats={engineStats}
      />

      {/* ══════════════════ CARTE 7 : DIAGNOSTIC MULTI-AGENTS ══════════════════ */}
      <DiagnosticAgentsCard
        premierProfil={premierProfil}
        ecarts={ecarts}
        surveillances={surveillances}
        rfModelInfo={rfModelInfo}
        benchmarkOutcome={benchmarkOutcome}
        activeModelName={activeModelName}
      />

      {/* ══════════════════ CARTE 8 : JUMEAU NUMÉRIQUE INTERACTIF ══════════════════ */}
      <DigitalTwinCard
        key={premierProfil?.aerodrome_id ?? 'none'}
        profil={premierProfil}
        ecarts={ecarts}
        surveillances={surveillances}
      />

      {/* ══════════════════ CARTE 9 : EXPLICABILITÉ SHAP-LIKE ══════════════════ */}
      <ShapExplainerCard profil={premierProfil} />

      {/* ══════════════════ CARTE 10 : GRAPHE UNIFIÉ OACI ══════════════════ */}
      <OaciGraphCard
        profil={premierProfil}
        ecarts={ecarts}
        surveillances={surveillances}
        evenements={evenementsSecurite}
      />

      {/* ══════════════════ CARTE 11 : SIMULATION DE SURVEILLANCE ══════════════════ */}
      <SimulationSurveillanceCard
        profilsRisque={profilsRisque}
        ecarts={ecarts}
        evenements={evenementsSecurite}
      />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CARTE 1 — MODÈLES ML : benchmark 5 algorithmes + sélection active
// ═══════════════════════════════════════════════════════════════

function MLModelsCard({ benchmarkOutcome, isBenchmarking, activeModelId, activeModelName, activeModelTrainedAt, rfModelInfo, rfSamplesCount, modelMetrics, pendingAlerts, onRunBenchmark, onSelectModel, onTrainRF, benchmarkConfig, onSetConfig, aerodromeId }: {
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
        {customParams && <span className="badge warning text-xs">Paramètres personnalisés</span>}
        <button onClick={() => setShowSettings(s => !s)} className="btn btn-sm btn-secondary gap-1.5">
          <Settings className="h-4 w-4" />Paramètres
        </button>
        <button onClick={onRunBenchmark} disabled={isBenchmarking || rfSamplesCount < 10} className="btn btn-primary btn-sm gap-1.5">
          <RefreshCw className={`h-4 w-4 ${isBenchmarking ? 'animate-spin' : ''}`} />
          {isBenchmarking ? 'Benchmark en cours…' : 'Lancer le benchmark'}
        </button>
      </div>
    }>
      <EnClairNote module="ml-card-1" aerodromeId={aerodromeId} aQuoiCaSert="Compare 5 algorithmes (Random Forest, XGBoost, LightGBM, CatBoost, MLP) sur les mêmes données pour savoir lequel est le plus fiable, puis désigne celui qui pilote réellement les prédictions de risque." commentLire="Chaque modèle a un score sur 100 (accuracy, précision, rappel, F1, ROC-AUC). Le trophée signale le meilleur. La pastille « Utilisé » est le modèle actif : les futures prédictions passeront par lui." />
      {showSettings && (
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
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="active-model" checked={isActive} onChange={() => onSelectModel(id)} className="accent-role-primary" />
                          <span className="text-xs text-muted-foreground">{isActive ? 'Utilisé' : 'Choisir'}</span>
                        </label>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Benchmark sur {benchmarkOutcome.datasetSize} échantillons (split train/test 75/25, seed fixe). Le modèle sélectionné pilote réellement les prédictions de risque — dernier entraînement actif : {activeModelTrainedAt ? new Date(activeModelTrainedAt).toLocaleDateString('fr-FR') : 'jamais'}.
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
                    <button onClick={onTrainRF} className="btn btn-sm btn-secondary w-full gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Entraîner RF</button>
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

function RiskModelsCard({ profilsRisque, ecarts, surveillances, amdecAnalyses, ftaAnalyses, evenementsSecurite, rfModelInfo, graphModelInfo, mlRiskCorrelation, modelTrainingConfig, onTrainRF, rfSamplesCount, barColor }: {
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
            <button onClick={onTrainRF} disabled={rfSamplesCount < 10} className="btn btn-sm btn-secondary gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Entraîner RF</button>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// CARTE 3 — MODÈLES MATHÉMATIQUES : calibrage + simulation
// ═══════════════════════════════════════════════════════════════

function MathModelsCard({ profilsRisque }: { profilsRisque: Record<string, ProfilRisque> | null }) {
  const premierProfil = profilsRisque ? Object.values(profilsRisque)[0] : null
  const historiqueSeuils = thresholdController.getHistorique()
  const dernierSeuil = historiqueSeuils[historiqueSeuils.length - 1] || null

  const modules: Array<{ nom: string; valeur: string; detail?: string; niveau: 'success' | 'warning' | 'danger' | 'primary' }> = []
  if (premierProfil) {
    if (premierProfil.hmm_state) modules.push({ nom: 'HMM (Markov caché)', valeur: premierProfil.hmm_state.isTransitioning ? 'Transition détectée' : 'Stable', detail: `risque transition ${Math.round(premierProfil.hmm_state.transitionRisk ?? 0)}%`, niveau: premierProfil.hmm_state.isTransitioning ? 'warning' : 'success' })
    if (premierProfil.survival_metrics) modules.push({ nom: 'Survie (Cox)', valeur: premierProfil.survival_metrics.medianDays ? `${premierProfil.survival_metrics.medianDays} j` : '—', detail: `hazard 90j ${Math.round((premierProfil.survival_metrics.hazard90d ?? 0) * 100)}%`, niveau: (premierProfil.survival_metrics.hazard90d ?? 0) > 0.5 ? 'danger' : 'primary' })
    if (premierProfil.extreme_risk) modules.push({ nom: 'EVT (valeurs extrêmes)', valeur: premierProfil.extreme_risk.isHeavyTailed ? 'Queue lourde' : 'Queue légère', detail: `max 12m ${premierProfil.extreme_risk.maxExpected12m ?? 0}`, niveau: premierProfil.extreme_risk.isHeavyTailed ? 'warning' : 'success' })
    if (premierProfil.copula_metrics) modules.push({ nom: 'Copules', valeur: `tail ${Math.round((premierProfil.copula_metrics.maxTailDependence ?? 0) * 100)}%`, detail: premierProfil.copula_metrics.worstCaseDescription ? 'scénario pire cas modélisé' : undefined, niveau: (premierProfil.copula_metrics.maxTailDependence ?? 0) > 0.6 ? 'warning' : 'primary' })
    if (premierProfil.ts_metrics) modules.push({ nom: 'Thompson Sampling', valeur: premierProfil.ts_metrics.recommendedAction || '—', detail: `confiance ${Math.round(premierProfil.ts_metrics.bestProbability ?? 0)}%`, niveau: (premierProfil.ts_metrics.bestProbability ?? 0) > 60 ? 'success' : 'primary' })
    if (premierProfil.bayesian_posterior != null) { const post = pctBayes(premierProfil.bayesian_posterior); if (post != null) modules.push({ nom: 'Bayésien', valeur: `post ${post}%`, detail: premierProfil.bayesian_black_swan ? 'cygne noir !' : undefined, niveau: premierProfil.bayesian_black_swan ? 'danger' : 'primary' }) }
  }
  const modulesAvances = ['HMM (Markov caché)', 'Survie (Cox)', 'EVT (valeurs extrêmes)', 'Copules', 'Thompson Sampling'].filter(nom => !modules.some(m => m.nom === nom))

  return (
    <Card icon={<Calculator className="h-4 w-4 text-role-primary" />} title="3. Modèles mathématiques — calibrage & simulation">
      <EnClairNote module="ml-card-3" aerodromeId={premierProfil?.aerodrome_id} aQuoiCaSert="Affiche les modèles probabilistes (HMM, survie, EVT, copules, Thompson, bayésien) qui estiment le risque de façon avancée, et les seuils auto-ajustés appris par le système." commentLire="Chaque modèle donne un indicateur (stabilité, probabilité a posteriori, hazard...). Un « post » proche de 100% = forte probabilité de défaillance estimée. Les modèles avancés exigent au moins 3 points d'historique pour se calibrer ; le bayésien fonctionne dès le premier profil." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-2">
          <h4 className="text-sm mb-2">Statut des modèles probabilistes</h4>
          {modules.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Aucun modèle mathématique calculé pour le moment. Complétez un profil de risque pour activer HMM, survie, EVT, copules, Thompson et bayésien.</p>
          ) : (
            <>
              {modules.map(m => (
                <div key={m.nom} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20">
                  <div>
                    <p className="text-sm font-medium">{m.nom}</p>
                    {m.detail && <p className="text-xs text-muted-foreground">{m.detail}</p>}
                  </div>
                  <span className={`badge text-xs ${m.niveau === 'danger' ? 'danger' : m.niveau === 'warning' ? 'warning' : m.niveau === 'success' ? 'success' : 'primary'}`}>{m.valeur}</span>
                </div>
              ))}
              {modulesAvances.length > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  {modulesAvances.join(', ')} {modulesAvances.length > 1 ? 'ne sont' : 'n\'est'} pas encore calculé{modulesAvances.length > 1 ? 's' : ''} : il faut au moins 3 points d&apos;historique du profil pour les calibrer. Le bayésien reste disponible dès le premier profil.
                </p>
              )}
            </>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <h4 className="text-sm mb-2 flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5" />Calibrage des seuils (auto-ajustés)</h4>
            {historiqueSeuils.length === 0 ? (
              <p className="text-xs text-muted">Aucun seuil ajusté automatiquement.</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {historiqueSeuils.slice(-8).reverse().map((h, i) => (
                  <div key={i} className="p-2 rounded bg-role-primary-soft/50 text-xs">
                    <span className="font-medium">{h.parametre}: {h.ancienneValeur} → {h.nouvelleValeur}</span>
                    <p className="text-muted-foreground mt-0.5">{h.raison}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <h4 className="text-sm mb-2 flex items-center gap-1.5"><Play className="w-3.5 h-3.5" />Simulation de scénario</h4>
            {premierProfil ? (
              <p className="text-xs text-muted-foreground">
                Score global actuel : <span className="font-bold text-foreground">{premierProfil.score_global}/100</span> · Niveau : <span className="font-medium">{premierProfil.niveau}</span> · Tendance : <span className="font-medium">{premierProfil.tendance}</span>.
                Un scénario de dégradation sur le critère le plus faible (min {Math.min(premierProfil.c1, premierProfil.c2, premierProfil.c3, premierProfil.c4, premierProfil.c5)}/100) ferait basculer la surveillance vers un type plus strict.
              </p>
            ) : <p className="text-xs text-muted">Aucun profil pour la simulation.</p>}
          </div>

          {dernierSeuil && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              Dernier ajustement : {dernierSeuil.parametre} → {dernierSeuil.nouvelleValeur}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// CARTE 4 — AGENTS IA : précision & maturité
// ═══════════════════════════════════════════════════════════════

function AgentsCard({ engineStats, inspecteurStats, aerodromeId }: {
  engineStats: EngineLearningStats | null
  inspecteurStats: InspecteurMonitoringStats | null
  aerodromeId?: string
}) {
  return (
    <Card icon={<Users className="h-4 w-4 text-role-primary" />} title="4. Agents IA — précision & maturité">
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
            </div>
          ) : <p className="text-sm text-muted text-center py-6">Aucun retour inspecteur virtuel. Acceptez, corrigez ou ignorez les suggestions dans les checklists et la rédaction d&apos;écarts.</p>}
        </div>
      </div>
    </Card>
  )
}

// ═══════════════════════════════════════════════════════════════
// CARTE 5 — AERORISQ : simulation, entraînement, A/B testing
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
    <Card icon={<Brain className="h-4 w-4 text-role-primary" />} title="5. AERORISQ — simulation, entraînement & expérimentation">
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
          <div className="flex gap-2">
            <button onClick={onRecalibrate} className="btn btn-primary btn-sm flex-1 gap-1.5"><RefreshCw className="h-4 w-4" />Recalibrer</button>
            <button onClick={onReset} className="btn btn-sm btn-secondary gap-1.5"><RotateCcw className="h-4 w-4" />Réinit.</button>
          </div>
        </div>

        {/* A/B Testing + PAC */}
        <div className="space-y-3">
          <h4 className="text-sm">A/B testing & PAC Learning</h4>
          <ABTestingSection />
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

// ═══════════════════════════════════════════════════════════════
// CARTE 6 — SYNTHÈSE : données + langage clair
// ═══════════════════════════════════════════════════════════════

function SynthesisCard({ premierProfil, stats, inspecteurStats, benchmarkOutcome, activeModelName, rfModelInfo, mlRiskCorrelation, engineStats }: {
  premierProfil: ProfilRisque | null
  stats: ReturnType<ReturnType<typeof useAppStore.getState>['calculatePerformance']> | null
  inspecteurStats: InspecteurMonitoringStats | null
  benchmarkOutcome: ReturnType<typeof useAppStore.getState>['benchmarkOutcome']
  activeModelName: string | null
  rfModelInfo: ReturnType<typeof useAppStore.getState>['rfModelInfo']
  mlRiskCorrelation: MLRiskCorrelationData
  engineStats: EngineLearningStats | null
}) {
  const diagnostic = premierProfil ? synthetiserModeles(premierProfil) : null

  return (
    <Card icon={<Sparkles className="h-4 w-4 text-role-primary" />} title="6. Synthèse — état des modèles en langage clair">
      <EnClairNote module="ml-card-6" aerodromeId={premierProfil?.aerodrome_id} aQuoiCaSert="Résume en quelques lignes l'état global de tous les modèles : précision, modèle actif, maturité et diagnostic consolidé en langage clair." commentLire="Lisez d'abord le « Diagnostic AERORISQ » et sa recommandation : c'est la conclusion synthétique. Les KPIs en haut donnent un ordre de grandeur : précision ≥ 70%, maturité et pertinence visent ≥ 60%." />
      <div className="space-y-5">
        {/* KPIs synthèse */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-role-primary-soft rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Précision apprentissage</p>
            <p className={`text-xl font-bold ${(stats?.precision_globale ?? 0) >= 70 ? 'text-success' : 'text-warning'}`}>{stats?.precision_globale ?? 0}%</p>
          </div>
          <div className="bg-role-primary-soft rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Modèle ML actif</p>
            <p className="text-lg font-bold truncate">{activeModelName ?? 'RF (défaut)'}</p>
            <p className="text-[10px] text-muted-foreground">{rfModelInfo ? `${(rfModelInfo.accuracy * 100).toFixed(0)}% acc.` : 'non entraîné'}</p>
          </div>
          <div className="bg-role-primary-soft rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Maturité inspecteur</p>
            <p className="text-xl font-bold">{inspecteurStats?.maturiteGlobale ?? 0}/100</p>
            <p className="text-[10px] text-role-primary">{inspecteurStats?.maturiteGlobaleLabel ?? 'N1 Absent'}</p>
          </div>
          <div className="bg-role-primary-soft rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Pertinence AERORISQ</p>
            <p className={`text-xl font-bold ${(engineStats?.pertinenceRate ?? 0) >= 60 ? 'text-success' : 'text-warning'}`}>{engineStats?.pertinenceRate ?? 0}%</p>
            <p className="text-[10px] text-muted-foreground">{engineStats?.totalFeedbacks ?? 0} feedbacks</p>
          </div>
        </div>

        {/* Diagnostic en langage clair */}
        {diagnostic ? (
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-sm flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-role-primary" />Diagnostic AERORISQ (synthèse de {NOMBRE_MAX_VOTES} modèles)</h4>
              <span className="badge text-xs">{diagnostic.tendance.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-sm font-medium text-foreground mb-3">{diagnostic.interpretation}</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {diagnostic.elementsClefs.map((el, i) => (
                <span key={i} className="badge badge-secondary text-xs">{el}</span>
              ))}
            </div>
            <div className="rounded-lg bg-role-primary-soft/40 p-3 text-sm">
              <p className="font-medium mb-1">Recommandation :</p>
              <p className="text-muted-foreground">{diagnostic.recommandation}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted text-center py-4">Aucun profil de risque disponible pour la synthèse.</p>
        )}

        {/* Benchmark mini-résumé */}
        {benchmarkOutcome && benchmarkOutcome.ranked.length > 0 && (
          <div className="pt-3 border-t border-border">
            <h4 className="text-xs uppercase text-muted-foreground mb-2">Benchmark ML — {benchmarkOutcome.datasetSize} échantillons</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground border-b border-border text-left"><th className="py-1.5 pr-3">Modèle</th><th className="py-1.5 pr-3">Acc.</th><th className="py-1.5 pr-3">F1</th><th className="py-1.5 pr-3">AUC</th><th className="py-1.5 pr-3">Score</th></tr></thead>
                <tbody>
                  {benchmarkOutcome.ranked.map(r => (
                    <tr key={r.modelId} className="border-b border-border/40">
                      <td className="py-1.5 pr-3 font-medium">{r.nom}{r.modelId === benchmarkOutcome.bestModelId && <Trophy className="w-3 h-3 inline ml-1 text-warning" />}</td>
                      <td className="py-1.5 pr-3">{(r.accuracy * 100).toFixed(0)}%</td>
                      <td className="py-1.5 pr-3">{(r.f1Score * 100).toFixed(0)}%</td>
                      <td className="py-1.5 pr-3">{(r.rocAuc * 100).toFixed(0)}%</td>
                      <td className="py-1.5 font-bold">{r.score}/100</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Aperçu distribution risques */}
        <div className="pt-3 border-t border-border">
          <h4 className="text-xs uppercase text-muted-foreground mb-2">Distribution des risques — {mlRiskCorrelation.aerodromeCount} aérodromes</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(mlRiskCorrelation.riskLevelDistribution).map(([level, count]) => (
              <span key={level} className={`badge text-xs ${level === 'critique' ? 'danger' : level === 'eleve' ? 'warning' : level === 'moyen' ? 'primary' : 'success'}`}>{level} · {count}</span>
            ))}
          </div>
        </div>
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

function ABTestingSection() {
  const [abStats, setAbStats] = useState(getABStats())
  return (
    <div className="rounded-lg border border-border p-3">
      {abStats ? (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted">Tests A/B</span><span className="font-bold">{abStats.total}</span></div>
          <div className="flex justify-between"><span className="text-green-600">Neural Net</span><span>{abStats.neuralWins} ({Math.round(abStats.neuralWinRate * 100)}%)</span></div>
          <div className="flex justify-between"><span className="text-orange-600">Formules</span><span>{abStats.formulasWins} ({Math.round(abStats.formulasWinRate * 100)}%)</span></div>
          <button onClick={() => { clearABHistory(); setAbStats(getABStats()) }} className="btn btn-sm btn-secondary w-full mt-1 gap-1"><RotateCcw className="h-3.5 w-3.5" />Réinitialiser</button>
        </div>
      ) : <p className="text-sm text-muted">Aucun test A/B. Créés automatiquement à chaque prédiction.</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CARTE 7 — DIAGNOSTIC MULTI-AGENTS (orchestrateur)
// ═══════════════════════════════════════════════════════════════

const NIVEAU_BADGE: Record<string, string> = {
  critique: 'danger',
  eleve: 'warning',
  moyen: 'primary',
  faible: 'success',
}

function DiagnosticAgentsCard({ premierProfil, ecarts, surveillances, rfModelInfo, benchmarkOutcome, activeModelName }: {
  premierProfil: ProfilRisque | null
  ecarts: Ecart[]
  surveillances: Surveillance[]
  rfModelInfo: ReturnType<typeof useAppStore.getState>['rfModelInfo']
  benchmarkOutcome: ReturnType<typeof useAppStore.getState>['benchmarkOutcome']
  activeModelName: string | null
}) {
  const aerodromeId = premierProfil?.aerodrome_id ?? null
  const aerodromes = useAppStore(s => s.aerodromes)
  const nomAerodrome = aerodromeId ? aerodromes.find(a => a.id === aerodromeId)?.nom ?? null : null
  const [resultat, setResultat] = useState<ResultatOrchestrateur | null>(() =>
    premierProfil ? lireDernierDiagnostic(premierProfil.aerodrome_id) : null,
  )
  const resultatActif = resultat && resultat.aerodromeId === aerodromeId ? resultat : null
  const historique = aerodromeId ? historiqueOrchestrateur(aerodromeId) : []

  const lancer = () => {
    if (!premierProfil) return
    const res = lancerDiagnosticOrchestrateur({
      aerodromeId: premierProfil.aerodrome_id,
      profil: premierProfil,
      ecarts,
      surveillances,
      contexteML: {
        rfAccuracy: rfModelInfo?.accuracy ?? 0,
        benchmarkMeilleurScore: benchmarkOutcome?.ranked?.[0]?.score ?? 0,
        modeleActifNom: activeModelName ?? undefined,
      },
    })
    setResultat(res)
  }

  return (
    <Card icon={<Workflow className="h-4 w-4 text-role-primary" />} title="7. Diagnostic multi-agents — orchestrateur AERORISQ" badge={
      resultatActif ? <span className={`badge text-xs ${NIVEAU_BADGE[resultatActif.niveau] ?? 'primary'}`}>{resultatActif.niveau}</span> : undefined
    }>
      <EnClairNote module="ml-card-7" aerodromeId={aerodromeId ?? undefined} aQuoiCaSert="Enchaîne 5 agents d'analyse (risque, conformité OACI, modèles ML, inspecteur virtuel, pertinence) et fusionne leurs votes pour produire un verdict consolidé de dégradation." commentLire="L'« Indice de dégradation » /100 est le verdict : ≥ 65 = danger, 40-65 = préoccupant. Chaque vote d'agent affiche sa confiance et son support de données ; les votes trop incertains sont exclus de la fusion." />
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Exécute une chaîne de {5} agents déterministes (risque, conformité OACI, modèles ML, inspecteur virtuel, pertinence), fusionne les votes pondérés par la confiance et journalise le raisonnement.
        </p>
        <button onClick={lancer} disabled={!premierProfil} className="btn btn-primary btn-sm gap-1.5 whitespace-nowrap">
          <Play className="h-4 w-4" />Lancer le diagnostic multi-agents
        </button>
      </div>

      {!premierProfil ? (
        <p className="text-sm text-muted text-center py-6">Complétez un profil de risque pour lancer le diagnostic.</p>
      ) : !resultatActif ? (
        <p className="text-sm text-muted text-center py-6">Aucun diagnostic pour {nomAerodrome ?? aerodromeId}. Cliquez sur « Lancer le diagnostic ».</p>
      ) : (
        <div className="space-y-5">
          {/* Verdict global */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Indice de dégradation</p>
              <p className={`text-2xl font-bold ${resultatActif.indiceGlobal >= 65 ? 'text-danger' : resultatActif.indiceGlobal >= 40 ? 'text-warning' : resultatActif.indiceGlobal >= 15 ? 'text-role-primary' : 'text-success'}`}>{resultatActif.indiceGlobal}/100</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Niveau</p>
              <p className="text-2xl font-bold capitalize">{resultatActif.niveau}</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">Confiance globale</p>
              <p className="text-2xl font-bold">{resultatActif.confianceGlobale}%</p>
            </div>
          </div>

          <p className="text-sm font-medium text-foreground">{resultatActif.interpretation}</p>

          {/* Recommandation */}
          <div className="rounded-lg bg-role-primary-soft/40 p-3 text-sm">
            <p className="font-medium mb-1">Recommandation de l&apos;orchestrateur :</p>
            <p className="text-muted-foreground">{resultatActif.recommandation}</p>
          </div>

          {/* Votes par agent */}
          <div>
            <h4 className="text-sm mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-role-primary" />Votes des agents (fusionnés, pondérés par confiance)</h4>
            <div className="space-y-2">
              {resultatActif.votes.map(v => (
                <div key={v.agent} className="p-3 rounded-lg border border-border/60">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{v.label}</span>
                    {v.statut === 'erreur'
                      ? <span className="badge badge-secondary text-xs">Non applicable</span>
                      : <span className="text-sm font-bold">{v.degradation}/100</span>}
                  </div>
                  <div className="progress h-1.5"><div className="progress-bar" style={{ width: `${v.degradation}%`, backgroundColor: v.statut === 'erreur' ? 'var(--muted)' : 'var(--role-primary)' }} /></div>
                  <p className="text-xs text-foreground mt-1.5">{v.interpretation}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">confiance {v.confiance}%</span>
                    <span className="text-[10px] text-muted-foreground">· données {v.dataSupport}%</span>
                    {v.statut === 'erreur' && <span className="text-[10px] text-muted-foreground">· exclu de la fusion</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Journal de raisonnement */}
          <div>
            <h4 className="text-sm mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-role-primary" />Journal du raisonnement</h4>
            <div className="space-y-2">
              {resultatActif.journal.map((etp, i) => (
                <div key={i} className="flex gap-3 p-2.5 rounded-lg bg-muted/20 text-xs">
                  <span className="font-mono text-muted-foreground w-12 shrink-0">{etp.dureeMs}ms</span>
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{etp.etape}</p>
                    <p className="text-muted-foreground truncate">{etp.sortie}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Historique */}
          <div className="flex items-center justify-between pt-2 border-t border-border text-xs">
            <span className="text-muted-foreground">{historique.length} diagnostic(s) enregistré(s) pour {nomAerodrome ?? aerodromeId} – {new Date(resultatActif.horodatage).toLocaleString('fr-FR')}</span>
          </div>
        </div>
      )}
    </Card>
  )
}

const HELP_SECTIONS: HelpSection[] = [
  { id: 'ml', title: '1. Modèles ML', content: 'Compare les 5 algorithmes (Random Forest, XGBoost, LightGBM, CatBoost, MLP) sur accuracy, precision, recall, F1, ROC-AUC et temps. Sélectionnez le modèle actif qui pilote les prédictions de risque. Via le bouton « Paramètres », ajustez les hyperparamètres de chaque modèle (arbres, profondeur, taux d\'apprentissage, époques...) puis relancez le benchmark pour comparer les performances avec ces valeurs.' },
  { id: 'risques', title: '2. Modèles de risques', content: 'Précision, maturité, convergence ML et simulation du modèle de risque recommandé (Bow-Tie, FTA, AMDEC, HMM, survie, EVT, copules...).' },
  { id: 'math', title: '3. Modèles mathématiques', content: 'Calibrage des seuils auto-ajustés et simulation de scénarios sur les modèles probabilistes (HMM, Cox, EVT, copules, Thompson, bayésien).' },
  { id: 'agents', title: '4. Agents IA', content: 'Pertinence des agents décisionnels AERORISQ et maturité par capacité de l\'inspecteur virtuel.' },
  { id: 'aerorisq', title: '5. AERORISQ', content: 'Simulation, entraînement, A/B testing (neural vs formules), PAC Learning et configuration.' },
  { id: 'synthese', title: '6. Synthèse', content: 'État global des modèles en langage clair : diagnostic AERORISQ, KPIs et classement du benchmark.' },
  { id: 'orchestrateur', title: '7. Diagnostic multi-agents', content: 'Exécute une chaîne de 5 agents déterministes (risque, conformité OACI, modèles ML, inspecteur virtuel, pertinence décisionnelle), fusionne les votes pondérés par la confiance et journalise chaque étape. Le verdict est enregistré localement pour l\'aérodrome courant.' },
  { id: 'jumeau', title: '8. Jumeau numérique interactif', content: 'Miroir interactif du système de risque : ajustez les critères C1-C5, l\'horizon, les facteurs aggravants, le cygne noir et les actions correctives. Le score projeté, les 4 scénarios, la trajectoire et la propagation des écarts dans le graphe se recalculent en temps réel. Lecture seule — aucune donnée n\'est modifiée.' },
  { id: 'shap', title: '9. Explicabilité SHAP-like', content: 'Attribution additive exacte du score : chaque critère C1-C5 reçoit une contribution φ = poids × (valeur − référence)/100, et baseline + Σφ = score (exactitude vérifiée). Trois références possibles : neutre (50), moyenne historique ou mois précédent. Aucune approximation.' },
  { id: 'oaci', title: '10. Graphe unifié OACI → risques → écarts', content: 'Chaîne causale Critère OACI (C1-C5) → Barrière Bow-Tie → Domaine → Écart. Sélectionnez un critère pour tracer la propagation de son impact (décroissante le long du graphe), et consultez par domaine l\'efficacité des barrières et les écarts rattachés.' },
  { id: 'simulation', title: '11. Simulation de surveillance', content: 'Simule une surveillance sur un aérodrome à partir de ses données réelles : profil C1-C5, écarts ouverts, historique et items du Kit Inspecteur. Choisissez l\'aérodrome, le type de surveillance et la portée, puis lancez la simulation pour obtenir une checklist pré-remplie SA/NS/NA/NV avec confiance, les écarts probables et le rapport PDF (gabarit ANACIM existant). Lecture seule — aucune donnée créée ni modifiée.' },
]
