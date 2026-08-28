// components/modules/agents/AgentsModule.tsx
// Module « Agents IA » : copilote conversationnel libre, création de tâches
// personnalisées (entraînement) et suivi des stats d'apprentissage AERORISQ.

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import {
  Bot,
  Gauge,
  ShieldCheck,
  FileText,
  BookOpen,
  BadgeCheck,
  ClipboardCheck,
  Brain,
  Sparkles,
  Play,
  ThumbsUp,
  ThumbsDown,
  History,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Rocket,
} from 'lucide-react'
import { taskRunner } from '@/lib/ia/registry/taskRunner'
import { AGENT_REGISTRY } from '@/lib/ia/registry/agentRegistry'
import CopiloteInspecteur from './CopiloteInspecteur'
import type {
  TaskExecutionRecord,
  TaskVote,
  TaskHistoryStats,
} from '@/lib/ia/registry/types'
import type { CustomTask } from '@/lib/ia/registry/taskRunner'

interface Props {
  user: { role?: string }
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  assistant: Bot,
  risk: Gauge,
  ecart: AlertTriangle,
  rapport: FileText,
  registre: BookOpen,
  certification: BadgeCheck,
  checklist: ClipboardCheck,
  inspecteur: ShieldCheck,
  suggestionML: Brain,
}

function AgentIcon({ id, className }: { id: string; className?: string }) {
  const Icon = AGENT_ICONS[id] ?? Brain
  return <Icon className={className ?? 'w-5 h-5'} />
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function AgentsModule({ user }: Props) {
  const canTrain = ['admin', 'inspector', 'dg_anacim'].includes(user?.role ?? '')
  const [tab, setTab] = useState<'copilote' | 'entrainement' | 'stats'>('copilote')
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([])
  const [customForm, setCustomForm] = useState({ nom: '', description: '', agentId: '', prompt: '' })
  const [result, setResult] = useState<TaskExecutionRecord | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [correction, setCorrection] = useState('')
  const [stats, setStats] = useState<TaskHistoryStats | null>(null)

  const refreshStats = useCallback(async () => {
    const s = await taskRunner.getStats()
    setStats(s)
  }, [])

  const refreshCustom = useCallback(() => {
    setCustomTasks(taskRunner.getCustomTasks())
  }, [])

  useEffect(() => {
    refreshStats().catch(console.error)
    refreshCustom()
  }, [refreshStats, refreshCustom])

  const runCustom = async (task: CustomTask) => {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const record = await taskRunner.executerTachePersonnalisee(task)
      setResult(record)
      await refreshStats()
      refreshCustom()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const vote = async (recordId: string, vote: TaskVote) => {
    const updated = await taskRunner.voter(recordId, vote)
    setResult(updated ?? result)
    await refreshStats()
  }

  const submitCorrection = async () => {
    if (!result || !correction.trim()) return
    const updated = await taskRunner.corriger(result.id, correction)
    setResult(updated ?? result)
    setCorrection('')
    await refreshStats()
  }

  const creerCustom = async () => {
    if (!customForm.nom.trim() || !customForm.description.trim() || !customForm.agentId) return
    await taskRunner.creerTachePersonnalisee(customForm)
    setCustomForm({ nom: '', description: '', agentId: '', prompt: '' })
    refreshCustom()
  }

  const supprimerCustom = async (id: string) => {
    await taskRunner.supprimerTachePersonnalisee(id)
    refreshCustom()
  }

  return (
    <div className="space-y-6 pb-8">
      <ModuleHeader
        icon={<Rocket className="w-6 h-6 text-role-primary" />}
        title="Agents IA"
        description="Interrogez librement l'IA, entraînez les agents et suivez leur apprentissage."
      />

      {/* Onglets */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
        {([
          ['copilote', 'Copilote'],
          ...(canTrain ? ([['entrainement', 'Entraînement']] as const) : []),
          ['stats', 'Apprentissage'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-card shadow-sm text-role-primary' : 'text-foreground/60 hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'copilote' && (
        <CopiloteInspecteur />
      )}

      {tab === 'entrainement' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <Card
              variant="role"
              title="Créer une tâche personnalisée"
              subtitle="Définissez votre propre demande à un agent : elle enrichira son entraînement."
              icon={<Plus className="w-5 h-5 text-role-primary" />}
            >
              <div className="space-y-3">
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Nom de la tâche</span>
                  <input
                    value={customForm.nom}
                    onChange={(e) => setCustomForm({ ...customForm, nom: e.target.value })}
                    placeholder="ex : Vérifier la conformité SSLIA"
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Description</span>
                  <textarea
                    value={customForm.description}
                    onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })}
                    placeholder="Précisez le contexte et la demande."
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Agent cible</span>
                  <select
                    value={customForm.agentId}
                    onChange={(e) => setCustomForm({ ...customForm, agentId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  >
                    <option value="">— Choisir un agent —</option>
                    {AGENT_REGISTRY.map((a) => (
                      <option key={a.id} value={a.id}>{a.nom}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">Demande complémentaire (optionnel)</span>
                  <textarea
                    value={customForm.prompt}
                    onChange={(e) => setCustomForm({ ...customForm, prompt: e.target.value })}
                    placeholder="Instructions supplémentaires pour l'agent."
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                  />
                </label>
                <button onClick={creerCustom} className="btn btn-primary h-9 px-4 gap-2 text-sm w-full">
                  <Plus className="w-4 h-4" /> Créer la tâche
                </button>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <Card
              variant="role"
              title={`Tâches personnalisées (${customTasks.length})`}
              subtitle="Ces demandes sont exécutées via l'assistant ciblé et alimentent ia_training_dataset."
              icon={<Sparkles className="w-5 h-5 text-role-primary" />}
            >
              {customTasks.length === 0 ? (
                <p className="text-foreground/60">Aucune tâche personnalisée pour le moment.</p>
              ) : (
                <div className="space-y-3">
                  {customTasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-border p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground text-sm">{task.nom}</span>
                          <span className="badge badge-primary">{task.agentId}</span>
                        </div>
                        <p className="text-sm text-foreground/70 mt-1">{task.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => runCustom(task)}
                          disabled={running}
                          title="Exécuter"
                          className="p-2 rounded-lg border border-border text-role-primary hover:bg-role-primary/5"
                        >
                          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => supprimerCustom(task.id)}
                          title="Supprimer"
                          className="p-2 rounded-lg border border-border text-danger hover:bg-danger/5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-danger-soft border border-danger/20 px-3 py-2 text-sm text-foreground">
                <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                {error}
              </div>
            )}

            {result && (
              <ResultCard
                result={result}
                correction={correction}
                setCorrection={setCorrection}
                onVote={vote}
                onCorriger={submitCorrection}
              />
            )}
          </div>
        </div>
      )}

      {tab === 'stats' && <StatsTab stats={stats} onRefresh={refreshStats} />}
    </div>
  )
}

// ============================================================
// RÉSULTAT + ÉVALUATION
// ============================================================

function ResultCard({
  result,
  correction,
  setCorrection,
  onVote,
  onCorriger,
}: {
  result: TaskExecutionRecord
  correction: string
  setCorrection: (v: string) => void
  onVote: (id: string, vote: TaskVote) => void
  onCorriger: () => void
}) {
  return (
    <Card
      variant="level"
      levelColor={result.vote === 'down' ? 'danger' : 'success'}
      title={result.summary ?? result.agentNom}
      subtitle={`${result.agentNom} · ${formatDate(result.date)} · ${result.dureeMs} ms${result.fallbackIA ? ' · fallback déterministe' : ''}`}
      icon={result.vote === 'down' ? <ThumbsDown className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
      badge={
        result.confidence !== undefined ? (
          <span className="badge badge-primary">Confiance {result.confidence}%</span>
        ) : undefined
      }
    >
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground mb-4">
        {result.output}
      </pre>

      {result.vote === 'down' && (
        <div className="mb-4 rounded-lg bg-warning-soft border border-warning/20 p-3 space-y-2">
          <p className="text-sm font-medium text-foreground">Votre correction améliore l&apos;entraînement d&apos;AERORISQ :</p>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="Indiquez la réponse / l'approche attendue…"
            rows={3}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
          />
          <button onClick={onCorriger} disabled={!correction.trim()} className="btn btn-secondary h-8 px-3 text-xs gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Enregistrer la correction
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-foreground/50 mr-1">Résultat :</span>
        <button
          onClick={() => onVote(result.id, 'up')}
          className={`p-2 rounded-lg border transition-colors ${
            result.vote === 'up'
              ? 'bg-success text-white border-success'
              : 'border-border text-success hover:bg-success/10'
          }`}
          title="Utile"
        >
          <ThumbsUp className="w-4 h-4" />
        </button>
        <button
          onClick={() => onVote(result.id, 'down')}
          className={`p-2 rounded-lg border transition-colors ${
            result.vote === 'down'
              ? 'bg-danger text-white border-danger'
              : 'border-border text-danger hover:bg-danger/10'
          }`}
          title="À améliorer"
        >
          <ThumbsDown className="w-4 h-4" />
        </button>
        {result.vote && (
          <span className="text-xs text-foreground/60 ml-2">
            {result.vote === 'up' ? 'Enregistré comme utile' : 'Correction demandée'}
          </span>
        )}
      </div>
    </Card>
  )
}

// ============================================================
// STATS D'APPRENTISSAGE
// ============================================================

function StatsTab({
  stats,
  onRefresh,
}: {
  stats: TaskHistoryStats | null
  onRefresh: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/70">
          Suivi de l&apos;exploitation des agents et de leur entraînement progressif (mirror de ia_training_dataset).
        </p>
        <button onClick={onRefresh} className="btn btn-secondary h-8 px-3 text-xs gap-1.5">
          <History className="w-3.5 h-3.5" /> Actualiser
        </button>
      </div>

      {!stats ? (
        <p className="text-foreground/60">Chargement…</p>
      ) : (
        <>
          <Card
            variant="role"
            title="Synthèse"
            icon={<Sparkles className="w-5 h-5 text-role-primary" />}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatPill label="Exécutions" value={stats.total} />
              <StatPill label="Agents" value={stats.parAgent.filter((a) => a.total > 0).length} />
              <StatPill
                label="Taux d'acceptation"
                value={`${Math.round(
                  stats.parAgent.reduce((s, a) => s + a.votesUp, 0) /
                    Math.max(1, stats.parAgent.reduce((s, a) => s + a.votesUp + a.votesDown, 0)) * 100
                )}%`}
              />
              <StatPill
                label="Corrections"
                value={stats.parAgent.reduce((s, a) => s + a.corrections, 0)}
              />
            </div>
          </Card>

          <Card
            variant="role"
            title="Maturité par agent"
            subtitle="La maturité reflète le nombre d'exécutions et les retours d'apprentissage."
            icon={<Brain className="w-5 h-5 text-role-primary" />}
          >
            <div className="space-y-3">
              {stats.parAgent.map((a) => (
                <div key={a.agentId} className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-role-primary">
                    <AgentIcon id={a.agentId} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{a.agentNom}</span>
                      <span className="text-xs text-foreground/60">
                        {a.total} exéc. · {a.votesUp} 👍 / {a.votesDown} 👎 · conf. {a.confianceMoyenne}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, a.maturite)}%`,
                          background: a.tauxAcceptation >= 60 ? 'var(--success)' : 'var(--warning)',
                        }}
                      />
                    </div>
                    <div className="text-xs text-foreground/50 mt-0.5">{a.maturiteLabel}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-2xl font-bold text-role-primary">{value}</div>
      <div className="text-xs text-foreground/60 mt-0.5">{label}</div>
    </div>
  )
}

export default AgentsModule