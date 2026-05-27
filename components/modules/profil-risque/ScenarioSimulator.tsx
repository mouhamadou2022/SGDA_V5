// components/modules/profil-risque/ScenarioSimulator.tsx
// Simulateur what-if interactif avec suggestions ML, ROI, et analyse d'impact
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// - .card, .card-header, .card-content, .card-title, .card-footer
// - .badge, .badge.success, .badge.warning, .badge.danger, .badge.primary
// - .btn, .btn-primary, .btn-secondary, .btn-ghost, .btn-sm
// - .alert, .alert-info, .alert-warning, .alert-success
// - .progress, .progress-bar
// - .modal, .modal-overlay, .modal-content
// - .animate-fade-up, .animate-pulse, .animate-float
// - .text-role-primary, .bg-role-primary-soft
// 0 style inline, 0 fetch direct

'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  FlaskConical, RotateCcw, Save, Trash2, ChevronDown, ChevronUp,
  Sparkles, TrendingUp, TrendingDown, Target, Zap, Shield, Brain,
  Lightbulb, ArrowRight, CheckCircle2, AlertCircle, X, Minus
} from 'lucide-react'
import { RiskGauge } from './RiskGauge'
import { calculateGlobalScore, computeActionEffectiveness } from '@/lib/risque'
import { useAppStore, ProfilRisque, ActionOutcomeRecord } from '@/lib/store'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ScenarioSimulatorProps {
  profil: ProfilRisque
  aerodromeName: string
  userRole: string
}

interface CritereSimule {
  key: 'c1' | 'c2' | 'c3' | 'c4' | 'c5'
  label: string
  poids: number
  description: string
}

interface ScenarioSauvegarde {
  id: string
  nom: string
  c1: number
  c2: number
  c3: number
  c4: number
  c5: number
  scoreSimule: number
  createdAt: string
  impactDescription?: string
}

interface SmartSuggestion {
  id: string
  titre: string
  description: string
  actions: { critere: keyof ProfilRisque; delta: number }[]
  gainEstime: number
  probabiliteSucces: number
  effort: 'faible' | 'moyen' | 'eleve'
  roi: number
  impactDirect: string
}

// ─────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────

const CRITERES: CritereSimule[] = [
  { key: 'c1', label: 'C1 — Maturité & Culture SGS', poids: 20, description: 'Renforcer la culture sécurité' },
  { key: 'c2', label: 'C2 — Efficacité & Réactivité PAC', poids: 25, description: 'Accélérer traitement PAC' },
  { key: 'c3', label: 'C3 — Conformité Technique', poids: 20, description: 'Améliorer conformité' },
  { key: 'c4', label: 'C4 — Charge Critique', poids: 20, description: 'Réduire écarts critiques' },
  { key: 'c5', label: 'C5 — Résilience', poids: 15, description: 'Renforcer prévention' },
]

const MAX_SCENARIOS = 8
const STORAGE_KEY = 'sgda_scenarios_simules_v2'

// Configuration des couleurs par niveau de risque (classes CSS)
const NIVEAU_CONFIG: Record<string, { badgeClass: string; textClass: string; bgClass: string }> = {
  excellent: { badgeClass: 'badge success', textClass: 'text-green-600', bgClass: 'bg-green-50' },
  bon: { badgeClass: 'badge primary', textClass: 'text-blue-600', bgClass: 'bg-blue-50' },
  modere: { badgeClass: 'badge warning', textClass: 'text-orange-600', bgClass: 'bg-orange-50' },
  critique: { badgeClass: 'badge danger', textClass: 'text-red-600', bgClass: 'bg-red-50' },
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

function getNiveauLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Bon'
  if (score >= 30) return 'Modéré'
  return 'Critique'
}

function getNiveauKey(score: number): string {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'bon'
  if (score >= 30) return 'modere'
  return 'critique'
}

function getNiveauColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-blue-600'
  if (score >= 30) return 'text-orange-600'
  return 'text-red-600'
}

function getProgressClass(v: number): string {
  return v >= 80 ? 'progress-faible' : v >= 60 ? 'progress-moyen' : v >= 30 ? 'progress-eleve' : 'progress-critique'
}

function getEffortConfig(effort: string): { icon: React.ElementType; color: string; label: string } {
  switch (effort) {
    case 'faible':
      return { icon: Zap, color: 'text-green-600', label: 'Effort faible' }
    case 'moyen':
      return { icon: Target, color: 'text-orange-600', label: 'Effort moyen' }
    default:
      return { icon: Shield, color: 'text-red-600', label: 'Effort élevé' }
  }
}

function loadScenariosFromStorage(aerodromeId: string): ScenarioSauvegarde[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${aerodromeId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveScenariosToStorage(aerodromeId: string, scenarios: ScenarioSauvegarde[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`${STORAGE_KEY}_${aerodromeId}`, JSON.stringify(scenarios))
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────

interface CritereSliderRowProps {
  critere: CritereSimule
  valeurActuelle: number
  valeurSimulee: number
  onValueChange: (key: CritereSimule['key'], value: number) => void
  disabled?: boolean
}

function CritereSliderRow({ critere, valeurActuelle, valeurSimulee, onValueChange, disabled }: CritereSliderRowProps) {
  const delta = valeurSimulee - valeurActuelle
  const deltaPositif = delta > 0
  const deltaPourcentage = valeurActuelle > 0 ? Math.round((delta / valeurActuelle) * 100) : 0

  return (
    <div className="space-y-2 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50 transition-colors rounded-lg px-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">{critere.label}</span>
            <span className="badge neutral text-[10px]">{critere.poids}%</span>
          </div>
          <p className="text-xs text-gray-400">{critere.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Actuel: <span className="font-mono">{valeurActuelle}</span></span>
          <span className="text-base font-bold text-blue-600 w-12 text-right">{valeurSimulee}</span>
          {delta !== 0 && (
            <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
              deltaPositif ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {deltaPositif ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {deltaPositif ? '+' : ''}{delta}
              <span className="text-[10px] opacity-70">({deltaPositif ? '+' : ''}{deltaPourcentage}%)</span>
            </div>
          )}
        </div>
      </div>
      <input
        type="range"
        value={valeurSimulee}
        onChange={(e) => onValueChange(critere.key, Number(e.target.value))}
        min={0}
        max={100}
        step={5}
        className={`w-full h-2 rounded-lg appearance-none bg-gray-200 cursor-pointer accent-blue-600 ${focusClass}`}
        disabled={disabled}
      />
      <div className="flex justify-between text-[10px] text-gray-300 px-1">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  )
}

// Composant pour les suggestions intelligentes
function SmartSuggestions({
  profil,
  onApplySuggestion,
  onClose
}: {
  profil: ProfilRisque
  onApplySuggestion: (suggestion: SmartSuggestion) => void
  onClose: () => void
}) {
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)

  const suggestions = useMemo((): SmartSuggestion[] => {
    const suggestionsList: SmartSuggestion[] = []
    const currentScore = profil.score_global
    const currentValues = { c1: profil.c1, c2: profil.c2, c3: profil.c3, c4: profil.c4, c5: profil.c5 }

    // Suggestion 1: Atteindre le prochain niveau
    if (currentScore < 80) {
      const targetScore = currentScore >= 60 ? 80 : currentScore >= 30 ? 60 : 30
      const needed = targetScore - currentScore
      const actions: { critere: keyof ProfilRisque; delta: number }[] = []

      // Trouver les critères les plus impactants
      const weights = { c1: 0.2, c2: 0.25, c3: 0.2, c4: 0.2, c5: 0.15 }
      const sortedCrit = Object.entries(currentValues)
        .sort((a, b) => (a[1] - b[1]))
        .map(([key, val]) => ({ key: key as keyof ProfilRisque, val, weight: weights[key as keyof typeof weights] }))

      let remainingNeeded = needed
      for (const crit of sortedCrit) {
        if (remainingNeeded <= 0) break
        const maxPossible = 100 - crit.val
        const contributionByPoint = crit.weight * 100
        const neededPoints = Math.ceil(remainingNeeded / contributionByPoint)
        const delta = Math.min(maxPossible, neededPoints * 5)
        if (delta > 0) {
          actions.push({ critere: crit.key, delta })
          remainingNeeded -= delta * crit.weight
        }
      }

      if (actions.length > 0) {
        suggestionsList.push({
          id: 'next-level',
          titre: `Atteindre le niveau ${targetScore >= 80 ? 'Excellent' : targetScore >= 60 ? 'Bon' : 'Modéré'}`,
          description: `Améliorer le score de ${currentScore} à ${targetScore} (${needed} points requis)`,
          actions,
          gainEstime: needed,
          probabiliteSucces: needed <= 15 ? 85 : needed <= 30 ? 65 : 45,
          effort: needed <= 10 ? 'faible' : needed <= 25 ? 'moyen' : 'eleve',
          roi: needed <= 10 ? 4.5 : needed <= 25 ? 2.8 : 1.5,
          impactDirect: `Score → ${targetScore}`
        })
      }
    }

    // Suggestion 2: Cibler le critère le plus faible
    const weakestCrit = Object.entries(currentValues).sort((a, b) => a[1] - b[1])[0]
    if (weakestCrit && weakestCrit[1] < 70) {
      const critKey = weakestCrit[0] as keyof ProfilRisque
      const improvement = Math.min(30, 100 - weakestCrit[1])
      suggestionsList.push({
        id: 'weakest',
        titre: `Renforcer ${critKey.toUpperCase()} - ${CRITERES.find(c => c.key === critKey)?.label || ''}`,
        description: `Améliorer le score ${critKey.toUpperCase()} de ${weakestCrit[1]} à ${weakestCrit[1] + improvement}`,
        actions: [{ critere: critKey, delta: improvement }],
        gainEstime: Math.round(improvement * (critKey === 'c2' ? 0.25 : critKey === 'c1' || critKey === 'c3' || critKey === 'c4' ? 0.2 : 0.15)),
        probabiliteSucces: 75,
        effort: improvement > 20 ? 'eleve' : improvement > 10 ? 'moyen' : 'faible',
        roi: 3.2,
        impactDirect: `${critKey.toUpperCase()} +${improvement}`
      })
    }

    // Suggestion 3: Optimisation ROI
    suggestionsList.push({
      id: 'roi',
      titre: 'Actions à fort impact (optimisation ROI)',
      description: 'Focus sur C2 (PAC) et C4 (écarts critiques) pour un maximum de gain',
      actions: [
        { critere: 'c2', delta: Math.min(20, 100 - currentValues.c2) },
        { critere: 'c4', delta: Math.min(15, 100 - currentValues.c4) }
      ],
      gainEstime: 12,
      probabiliteSucces: 80,
      effort: 'moyen',
      roi: 4.2,
      impactDirect: 'C2 + C4'
    })

    return suggestionsList.sort((a, b) => b.roi - a.roi)
  }, [profil])

  return (
    <div className="card border-purple-200 animate-fade-up">
      <div className="card-header pb-2 bg-purple-50 rounded-t-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Brain className="w-4 h-4 text-purple-600" />
            </div>
            <div className="card-title text-sm font-semibold text-purple-700">
              Scénarios suggérés par IA
            </div>
          </div>
          <button className="btn btn-ghost btn-sm w-7 h-7 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Basé sur l'analyse de {suggestions.length} scénarios optimaux
        </p>
      </div>
      <div className="card-content pt-4 space-y-3">
        {suggestions.map((sugg) => {
          const effortConfig = getEffortConfig(sugg.effort)
          const EffortIcon = effortConfig.icon
          const probaClass = sugg.probabiliteSucces >= 70 ? 'badge success' : sugg.probabiliteSucces >= 50 ? 'badge warning' : 'badge neutral'

          return (
            <div
              key={sugg.id}
              className={`p-3 rounded-xl border-2 transition-all cursor-pointer ${
                selectedSuggestion === sugg.id
                  ? 'border-purple-400 bg-purple-50'
                  : 'border-gray-200 hover:border-purple-200 hover:bg-purple-50/50'
              }`}
              onClick={() => setSelectedSuggestion(sugg.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-gray-800">{sugg.titre}</h4>
                    <span className={probaClass}>
                      {sugg.probabiliteSucces}% succès
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{sugg.description}</p>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <div className="flex items-center gap-1 text-xs">
                      <Target className="w-3 h-3 text-gray-400" />
                      <span className="text-green-600 font-medium">+{sugg.gainEstime} pts</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <EffortIcon className={`w-3 h-3 ${effortConfig.color}`} />
                      <span className={effortConfig.color}>{effortConfig.label}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <TrendingUp className="w-3 h-3 text-blue-500" />
                      <span className="text-blue-600 font-medium">ROI {sugg.roi}x</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sugg.actions.map((action, idx) => (
                      <span key={idx} className="badge neutral text-[10px] bg-white">
                        {action.critere.toUpperCase()} +{action.delta}
                      </span>
                    ))}
                  </div>
                </div>
                {selectedSuggestion === sugg.id && (
                  <button
                    className="btn btn-primary btn-sm gap-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      onApplySuggestion(sugg)
                    }}
                  >
                    Appliquer
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

export function ScenarioSimulator({ profil, aerodromeName, userRole }: ScenarioSimulatorProps) {
  // État des valeurs simulées
  const [simC1, setSimC1] = useState(profil.c1)
  const [simC2, setSimC2] = useState(profil.c2)
  const [simC3, setSimC3] = useState(profil.c3)
  const [simC4, setSimC4] = useState(profil.c4)
  const [simC5, setSimC5] = useState(profil.c5)

  // Dialog de sauvegarde
  const [dialogOpen, setDialogOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [nomScenario, setNomScenario] = useState('')
  const [saveError, setSaveError] = useState('')

  // Suggestions intelligentes
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Scénarios sauvegardés
  const [scenarios, setScenarios] = useState<ScenarioSauvegarde[]>(() =>
    loadScenariosFromStorage(profil.aerodrome_id)
  )
  const [listOpen, setListOpen] = useState(false)

  useEffect(() => setMounted(true), [])

  // Score simulé
  const scoreSimule = useMemo(
    () => calculateGlobalScore({ c1: simC1, c2: simC2, c3: simC3, c4: simC4, c5: simC5 }),
    [simC1, simC2, simC3, simC4, simC5]
  )

  const scoreActuel = profil.score_global
  const deltaScore = scoreSimule - scoreActuel
  const niveauActuelKey = getNiveauKey(scoreActuel)
  const niveauSimuleKey = getNiveauKey(scoreSimule)
  const niveauConfigActuel = NIVEAU_CONFIG[niveauActuelKey]
  const niveauConfigSimule = NIVEAU_CONFIG[niveauSimuleKey]

  const simValues = { c1: simC1, c2: simC2, c3: simC3, c4: simC4, c5: simC5 }
  const setters = {
    c1: setSimC1, c2: setSimC2, c3: setSimC3, c4: setSimC4, c5: setSimC5
  }

  const handleSliderChange = useCallback((key: keyof typeof simValues, value: number) => {
    setters[key](value)
  }, [])

  const handleReset = useCallback(() => {
    setSimC1(profil.c1)
    setSimC2(profil.c2)
    setSimC3(profil.c3)
    setSimC4(profil.c4)
    setSimC5(profil.c5)
  }, [profil])

  const handleApplySuggestion = (suggestion: SmartSuggestion) => {
    for (const action of suggestion.actions) {
      const currentValue = (simValues as Record<string, number>)[action.critere] ?? 0;
      const newValue: number = Math.min(100, currentValue + action.delta);
      (setters as Record<string, (v: number) => void>)[action.critere](newValue)
    }
    setShowSuggestions(false)
  }

  const handleLoadScenario = (scenario: ScenarioSauvegarde) => {
    setSimC1(scenario.c1)
    setSimC2(scenario.c2)
    setSimC3(scenario.c3)
    setSimC4(scenario.c4)
    setSimC5(scenario.c5)
  }

  const handleDeleteScenario = (id: string) => {
    const updated = scenarios.filter((s) => s.id !== id)
    setScenarios(updated)
    saveScenariosToStorage(profil.aerodrome_id, updated)
  }

  const handleOpenSaveDialog = () => {
    setSaveError('')
    setNomScenario('')
    setDialogOpen(true)
  }

  const handleSaveScenario = () => {
    const trimmed = nomScenario.trim()
    if (!trimmed) {
      setSaveError('Veuillez saisir un nom pour ce scénario.')
      return
    }
    if (scenarios.length >= MAX_SCENARIOS) {
      setSaveError(`Maximum ${MAX_SCENARIOS} scénarios. Supprimez-en un pour continuer.`)
      return
    }

    const getImpactDescription = () => {
      if (deltaScore > 5) return `Amélioration significative (+${deltaScore} pts)`
      if (deltaScore > 0) return `Légère amélioration (+${deltaScore} pts)`
      if (deltaScore < -5) return `Dégradation significative (${deltaScore} pts)`
      if (deltaScore < 0) return `Légère dégradation (${deltaScore} pts)`
      return 'Stable'
    }

    const nouveau: ScenarioSauvegarde = {
      id: Date.now().toString(),
      nom: trimmed,
      c1: simC1, c2: simC2, c3: simC3, c4: simC4, c5: simC5,
      scoreSimule,
      createdAt: new Date().toISOString(),
      impactDescription: getImpactDescription()
    }
    const updated = [nouveau, ...scenarios].slice(0, MAX_SCENARIOS)
    setScenarios(updated)
    saveScenariosToStorage(profil.aerodrome_id, updated)
    setDialogOpen(false)
    setListOpen(true)
  }

  // Critères à améliorer pour atteindre le niveau supérieur
  const prochainNiveau = useMemo(() => {
    if (scoreSimule >= 80) return null
    if (scoreSimule >= 60) return { label: 'Excellent', seuil: 80, points: 80 - scoreSimule }
    if (scoreSimule >= 30) return { label: 'Bon', seuil: 60, points: 60 - scoreSimule }
    return { label: 'Modéré', seuil: 30, points: 30 - scoreSimule }
  }, [scoreSimule])

  const isReadOnly = userRole === 'guest' || userRole === 'staff_operator'

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center animate-float">
            <FlaskConical className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Simulateur de Scénarios</h2>
            <p className="text-xs text-gray-500">{aerodromeName} — Analyse what-if avancée</p>
          </div>
        </div>
        <button
          onClick={() => setShowSuggestions(!showSuggestions)}
          className="btn btn-secondary btn-sm gap-2 border-purple-200 text-purple-600 hover:bg-purple-50"
        >
          <Lightbulb className="w-4 h-4" />
          Suggestions IA
          <span className="badge neutral bg-purple-100 text-purple-600">
            {showSuggestions ? 'Masquer' : 'Afficher'}
          </span>
        </button>
      </div>

      {/* Suggestions intelligentes */}
      {showSuggestions && (
        <SmartSuggestions
          profil={profil}
          onApplySuggestion={handleApplySuggestion}
          onClose={() => setShowSuggestions(false)}
        />
      )}

      {/* Colonnes principale */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Colonne gauche — Scénario actuel */}
        <div className="card">
          <div className="card-header pb-3">
            <div className="card-title text-sm font-semibold text-gray-700 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Scénario actuel
            </div>
          </div>
          <div className="card-content space-y-4">
            <div className="flex justify-center">
              <RiskGauge score={scoreActuel} size="md" />
            </div>
            <div className="space-y-0">
              {CRITERES.map((c) => {
                const val = profil[c.key]
                return (
                  <div key={c.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">{c.label}</span>
                      <span className="badge neutral text-[10px]">{c.poids}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="progress w-20 h-1.5">
                        <div className={`progress-bar ${getProgressClass(val)}`} style={{width:`${val}%`}} />
                      </div>
                      <span className={`text-xs font-semibold ${getNiveauColor(val)} w-8 text-right`}>
                        {val}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-center pt-2">
              <span className={`${niveauConfigActuel.badgeClass} px-3 py-1`}>
                {getNiveauLabel(scoreActuel)}
              </span>
            </div>
          </div>
        </div>

        {/* Colonne droite — Scénario simulé */}
        <div className="card border-purple-200 shadow-md">
          <div className="card-header pb-3 bg-purple-50 rounded-t-xl">
            <div className="flex items-center justify-between">
              <div className="card-title text-sm font-semibold text-purple-700 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Scénario simulé
              </div>
              <button
                onClick={handleReset}
                className="btn btn-ghost btn-sm text-xs text-gray-500 gap-1 h-7"
                disabled={isReadOnly}
              >
                <RotateCcw className="w-3 h-3" />
                Réinitialiser
              </button>
            </div>
          </div>
          <div className="card-content space-y-4 pt-4">
            <div className="flex justify-center">
              <RiskGauge
                score={scoreSimule}
                size="md"
                showVelocity={deltaScore !== 0}
                velocity={deltaScore}
                niveauVigilance={deltaScore < -5 ? 'alerte' : deltaScore < 0 ? 'surveillance' : 'normal'}
              />
            </div>

            {/* Sliders */}
            <div className="space-y-0 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
              {CRITERES.map((c) => (
                <CritereSliderRow
                  key={c.key}
                  critere={c}
                  valeurActuelle={profil[c.key]}
                  valeurSimulee={simValues[c.key]}
                  onValueChange={handleSliderChange}
                  disabled={isReadOnly}
                />
              ))}
            </div>

            <div className="flex justify-center pt-2">
              <span className={`${niveauConfigSimule.badgeClass} px-3 py-1 transition-all duration-300`}>
                {getNiveauLabel(scoreSimule)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interprétation */}
      <div className={`card ${deltaScore > 0 ? 'bg-green-50 border-green-200' : deltaScore < 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="card-content pt-4 space-y-3">
          <div className="flex items-center gap-2">
            {deltaScore > 0 && <TrendingUp className="w-5 h-5 text-green-600" />}
            {deltaScore < 0 && <TrendingDown className="w-5 h-5 text-red-600" />}
            {deltaScore === 0 && <Minus className="w-5 h-5 text-gray-500" />}
            <p className="text-sm font-semibold text-gray-700">Interprétation</p>
          </div>

          {deltaScore !== 0 ? (
            <>
              <p className="text-sm text-gray-700">
                Ce scénario{' '}
                <span className={`font-semibold ${deltaScore > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {deltaScore > 0 ? 'améliorerait' : 'dégraderait'}
                </span>{' '}
                le profil de{' '}
                <span className={`font-semibold ${niveauConfigActuel.textClass}`}>
                  {getNiveauLabel(scoreActuel)}
                </span>{' '}
                {niveauActuelKey !== niveauSimuleKey ? (
                  <>
                    à{' '}
                    <span className={`font-semibold ${niveauConfigSimule.textClass}`}>
                      {getNiveauLabel(scoreSimule)}
                    </span>
                  </>
                ) : null}
                {' '}
                (<span className={`font-bold ${deltaScore > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {deltaScore > 0 ? '+' : ''}{deltaScore} points
                </span>).
              </p>

              {/* Détail des contributions par critère */}
              <div className="text-xs text-gray-500">
                <p className="font-medium mb-1">Détail des contributions :</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {CRITERES.map(c => {
                    const delta = simValues[c.key] - profil[c.key]
                    if (delta === 0) return null
                    return (
                      <div key={c.key} className={`flex items-center gap-1 ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <span className="font-mono text-xs">{c.key}</span>
                        <span>{delta > 0 ? '+' : ''}{delta}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">Les valeurs simulées sont identiques au scénario actuel.</p>
          )}

          {/* Prochain niveau à atteindre */}
          {prochainNiveau && prochainNiveau.points > 0 && (
            <div className="space-y-2 pt-2 border-t border-dashed border-gray-200">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-600" />
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
                  Objectif : Atteindre le niveau {prochainNiveau.label}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="progress flex-1 h-2">
                  <div className="progress-bar progress-moyen" style={{width:`${(scoreSimule / prochainNiveau.seuil) * 100}%`}} />
                </div>
                <span className="text-xs font-mono text-purple-600">
                  {prochainNiveau.points} pts manquants
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {!isReadOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleReset}
            className="btn btn-secondary btn-sm gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Réinitialiser
          </button>
          <button
            onClick={handleOpenSaveDialog}
            disabled={scenarios.length >= MAX_SCENARIOS}
            className="btn btn-sm gap-2 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Save className="w-4 h-4" />
            Sauvegarder ce scénario
          </button>
          {scenarios.length > 0 && (
            <button
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 underline"
              onClick={() => setListOpen((v) => !v)}
            >
              {scenarios.length} scénario{scenarios.length > 1 ? 's' : ''} sauvegardé{scenarios.length > 1 ? 's' : ''}
              {listOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      )}

      {/* Liste des scénarios sauvegardés */}
      {listOpen && scenarios.length > 0 && (
        <div className="card">
          <div className="card-header pb-2">
            <div className="card-title text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Scénarios sauvegardés ({scenarios.length}/{MAX_SCENARIOS})
            </div>
          </div>
          <div className="card-content space-y-2 max-h-64 overflow-y-auto">
            {scenarios.map((s) => {
              const niveauKey = getNiveauKey(s.scoreSimule)
              const niveauConfig = NIVEAU_CONFIG[niveauKey]
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:border-purple-200 hover:bg-purple-50 transition-all cursor-pointer group"
                >
                  <button
                    className="flex-1 text-left"
                    onClick={() => handleLoadScenario(s)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-800">{s.nom}</p>
                      {s.impactDescription && (
                        <span className="badge neutral text-[10px]">
                          {s.impactDescription}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className={`text-xs font-semibold ${niveauConfig.textClass}`}>
                        {s.scoreSimule}/100 — {getNiveauLabel(s.scoreSimule)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(s.createdAt).toLocaleDateString('fr-FR')}
                      </span>
                      <div className="flex gap-1">
                        <span className="badge neutral text-[9px]">C1:{s.c1}</span>
                        <span className="badge neutral text-[9px]">C2:{s.c2}</span>
                        <span className="badge neutral text-[9px]">C3:{s.c3}</span>
                        <span className="badge neutral text-[9px]">C4:{s.c4}</span>
                        <span className="badge neutral text-[9px]">C5:{s.c5}</span>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteScenario(s.id)}
                    className="btn btn-ghost btn-sm w-8 h-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Dialog de sauvegarde via createPortal */}
      {mounted && dialogOpen && createPortal(
        <div className="modal-overlay" onClick={() => setDialogOpen(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden bg-background">
              <div className="modal-header bg-gradient-to-r from-purple-600/10 to-transparent border-b border-border">
                <div className="modal-title flex items-center gap-2 text-base">
                  <Save className="w-4 h-4 text-purple-600" />
                  Nommer ce scénario
                </div>
                <button className="modal-close" onClick={() => setDialogOpen(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="modal-body space-y-4 py-2">
                <div className="space-y-2">
                  <label htmlFor="scenario-nom" className="text-role-primary text-xs uppercase font-semibold">
                    Nom du scénario
                  </label>
                  <input
                    id="scenario-nom"
                    type="text"
                    value={nomScenario}
                    onChange={(e) => {
                      setNomScenario(e.target.value)
                      setSaveError('')
                    }}
                    placeholder="Ex: Amélioration C2 et C4"
                    className="form-input w-full"
                    maxLength={60}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveScenario() }}
                  />
                  {saveError && <p className="text-xs text-red-600">{saveError}</p>}
                </div>
                <div className={`rounded-xl p-3 ${niveauConfigSimule.bgClass}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">Score simulé</span>
                    <span className={`text-lg font-bold ${niveauConfigSimule.textClass}`}>
                      {scoreSimule}/100
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-600">Niveau</span>
                    <span className={`badge ${niveauConfigSimule.badgeClass}`}>
                      {getNiveauLabel(scoreSimule)}
                    </span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 mt-2 text-center text-[10px] font-mono">
                    <span>C1:{simC1}</span>
                    <span>C2:{simC2}</span>
                    <span>C3:{simC3}</span>
                    <span>C4:{simC4}</span>
                    <span>C5:{simC5}</span>
                  </div>
                </div>
                {deltaScore > 0 && (
                  <div className="alert alert-success !p-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs">Amélioration de {deltaScore} points</span>
                  </div>
                )}
                {deltaScore < 0 && (
                  <div className="alert alert-warning !p-2">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs">Dégradation de {Math.abs(deltaScore)} points</span>
                  </div>
                )}
              </div>
              <div className="modal-footer border-t border-border gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setDialogOpen(false)}>
                  Annuler
                </button>
                <button className="btn btn-sm bg-purple-600 hover:bg-purple-700 text-white" onClick={handleSaveScenario}>
                  Sauvegarder
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default ScenarioSimulator
