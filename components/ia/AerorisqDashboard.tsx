'use client'

import React, { useState, useMemo } from 'react'
import {
  Brain, CheckCircle2, XCircle, Clock, AlertTriangle, Target, BarChart3,
  ThumbsUp, ThumbsDown, Minus, Eye, FileText, Download,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { decisionTracker, type DecisionRecord, type EffectivenessRating } from '@/lib/ia/decisionTracker'
import { useDecisionEngine } from '@/hooks/useDecisionEngine'
import { engineFeedback } from '@/lib/ia/engines/engineFeedback'
import { thresholdController } from '@/lib/ia/thresholdController'

interface Props {
  aerodromeId: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: '#f59e0b' },
  applied: { label: 'Appliquée', color: '#16a34a' },
  dismissed: { label: 'Rejetée', color: '#dc2626' },
  expired: { label: 'Expirée', color: '#6b7280' },
}

const EFF_LABEL: Record<EffectivenessRating, { label: string; color: string; icon: React.ComponentType<{ className?: string; color?: string }> }> = {
  efficace: { label: 'Efficace', color: '#16a34a', icon: ThumbsUp },
  partiel: { label: 'Partiel', color: '#f59e0b', icon: Minus },
  inefficace: { label: 'Inefficace', color: '#dc2626', icon: ThumbsDown },
  non_evalue: { label: 'Non évalué', color: '#6b7280', icon: Minus },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AerorisqDashboard({ aerodromeId }: Props) {
  const analysis = useDecisionEngine(aerodromeId)
  const [filter, setFilter] = useState<DecisionRecord['type'] | 'all'>('all')

  const decisions = useMemo(() => decisionTracker.getDecisionsByAerodrome(aerodromeId), [aerodromeId])
  const stats = useMemo(() => decisionTracker.getStats(aerodromeId), [aerodromeId])
  const engineStats = useMemo(() => engineFeedback.getStats(), [])
  const ajustements = useMemo(() => thresholdController.getHistorique(), [])

  const filtered = filter === 'all' ? decisions : decisions.filter(d => d.type === filter)

  const appliquer = (id: string) => { decisionTracker.appliquer(id); window.location.reload() }
  const dismiss = (id: string) => { decisionTracker.dismiss(id); window.location.reload() }
  const evaluer = (id: string, rating: EffectivenessRating) => { decisionTracker.evaluer(id, rating); window.location.reload() }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card variant="level" levelColor="primary" className="p-3">
          <p className="text-[10px] text-muted-foreground">Décisions totales</p>
          <p className="text-xl font-bold text-foreground">{stats.total}</p>
        </Card>
        <Card variant="level" levelColor="success" className="p-3">
          <p className="text-[10px] text-muted-foreground">Appliquées</p>
          <p className="text-xl font-bold text-success">{stats.appliquees}</p>
        </Card>
        <Card variant="level" levelColor="warning" className="p-3">
          <p className="text-[10px] text-muted-foreground">Taux application</p>
          <p className="text-xl font-bold text-warning">{stats.tauxApplication}%</p>
        </Card>
        <Card variant="level" levelColor="success" className="p-3">
          <p className="text-[10px] text-muted-foreground">Efficacité</p>
          <p className="text-xl font-bold text-success">{stats.tauxEfficacite}%</p>
        </Card>
      </div>

      {/* Prédictions vs Réalité */}
      <Card icon={<BarChart3 className="h-4 w-4 text-role-primary" />} title="Prédictions ML vs réalité">
        {engineStats.totalFeedbacks > 0 ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Taux de pertinence global</span>
              <span className="font-bold">{engineStats.pertinenceRate}%</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
              {(Object.entries(engineStats.parEngine) as [string, { total: number; pertinents: number; taux: number }][]).map(([engine, data]) => (
                <div key={engine} className="bg-role-primary-soft rounded p-2">
                  <p className="text-xs text-muted-foreground capitalize">
                    {engine === 'riskProfile' ? 'Profil risque' : engine === 'compliance' ? 'Conformité' : engine === 'certificate' ? 'Certificat' : engine === 'team' ? 'Équipe' : 'Recommandations'}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-sm font-bold ${data.taux >= 60 ? 'text-success' : data.taux >= 40 ? 'text-warning' : 'text-danger'}`}>{data.taux}%</span>
                    <span className="text-[10px] text-muted-foreground">{data.total} votes</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted py-2">Aucun feedback ML enregistré — les prédictions apparaîtront ici après les inspections.</p>
        )}
      </Card>

      {/* Décisions récentes */}
      <Card icon={<Brain className="h-4 w-4 text-role-primary" />} title="Décisions AERORISQ">
        {/* Filtres */}
        <div className="flex gap-2 mb-3 flex-wrap">
          {(['all', 'recommendation', 'certificat', 'declencheur', 'type_suggestion'] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                filter === f ? 'bg-role-primary text-white border-role-primary' : 'bg-transparent text-muted-foreground border-border hover:border-role-primary'
              }`}
            >
              {f === 'all' ? 'Tous' : f === 'recommendation' ? 'Recommandations' : f === 'certificat' ? 'Certificat' : f === 'declencheur' ? 'Déclencheurs' : 'Suggestions ML'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">Aucune décision enregistrée. Lancez une analyse AERORISQ pour générer des décisions.</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filtered.map(d => {
              const s = STATUS_LABEL[d.status]
              const eff = EFF_LABEL[d.effectiveness]
              const EffIcon = eff.icon
              return (
                <div key={d.id} className="p-3 rounded-lg border border-border bg-role-primary-soft/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {d.type === 'recommendation' && <Eye className="h-3.5 w-3.5 text-role-primary" />}
                      {d.type === 'certificat' && <Target className="h-3.5 w-3.5 text-role-primary" />}
                      {d.type === 'declencheur' && <AlertTriangle className="h-3.5 w-3.5 text-warning" />}
                      {d.type === 'type_suggestion' && <Brain className="h-3.5 w-3.5 text-role-primary" />}
                      <span className="text-xs font-semibold text-foreground">
                        {d.type === 'recommendation' ? d.recommendation?.action
                          : d.type === 'certificat' ? `Certificat: ${d.certificatAction}`
                          : d.type === 'declencheur' ? `Déclencheur: ${d.declencheurType}`
                          : `ML: ${d.suggestionType} (${d.suggestionConfiance}%)`}
                      </span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: s.color + '20', color: s.color }}>
                      {s.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{formatDate(d.date)}</p>
                  {d.type === 'recommendation' && d.recommendation?.justification && (
                    <p className="text-[10px] text-muted-foreground">{d.recommendation.justification}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    {d.status === 'pending' && (
                      <>
                        <button type="button" onClick={() => appliquer(d.id)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-success/10 text-success hover:bg-success/20 transition-colors">
                          <CheckCircle2 className="h-3 w-3" /> Appliquer
                        </button>
                        <button type="button" onClick={() => dismiss(d.id)} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors">
                          <XCircle className="h-3 w-3" /> Ignorer
                        </button>
                      </>
                    )}
                    {d.status === 'applied' && d.effectiveness === 'non_evalue' && (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">Efficacité:</span>
                        {(['efficace', 'partiel', 'inefficace'] as const).map(r => (
                          <button key={r} type="button" onClick={() => evaluer(d.id, r)} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-role-primary-soft hover:bg-role-primary/20 transition-colors">
                            {r === 'efficace' ? <ThumbsUp className="h-3 w-3" /> : r === 'inefficace' ? <ThumbsDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {r === 'efficace' ? 'Efficace' : r === 'partiel' ? 'Partiel' : 'Inefficace'}
                          </button>
                        ))}
                      </div>
                    )}
                    {d.effectiveness !== 'non_evalue' && (
                      <div className="flex items-center gap-1">
                        <EffIcon className="h-3 w-3" color={eff.color} />
                        <span className="text-[10px]" style={{ color: eff.color }}>{eff.label}</span>
                        {d.commentaire && <span className="text-[10px] text-muted-foreground">— {d.commentaire}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Ajustements auto */}
      <Card icon={<FileText className="h-4 w-4 text-role-primary" />} title="Ajustements automatiques des seuils">
        {ajustements.length === 0 ? (
          <p className="text-sm text-muted py-2">Aucun ajustement automatique pour l'instant.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {ajustements.slice(-15).reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded bg-role-primary-soft/50 text-xs">
                <Brain className="h-3 w-3 text-role-primary mt-0.5" />
                <div>
                  <p className="text-foreground font-medium">{h.parametre}: {h.ancienneValeur} → {h.nouvelleValeur}</p>
                  <p className="text-muted-foreground">{h.raison} — {formatDate(h.date)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recommandations actives */}
      {analysis && analysis.recommandations.length > 0 && (
        <Card icon={<Target className="h-4 w-4 text-role-primary" />} title="Recommandations actives AERORISQ">
          <div className="space-y-2">
            {analysis.recommandations.slice(0, 5).map((r, i) => (
              <div key={i} className="p-2.5 rounded-lg border-l-4 text-sm" style={{
                borderLeftColor: r.urgence === 'immediate' ? '#dc2626' : r.urgence === '3_mois' ? '#f59e0b' : r.urgence === '6_mois' ? '#3b82f6' : '#6b7280',
                background: '#f9fafb',
              }}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{r.action}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
                    background: r.urgence === 'immediate' ? '#dc262615' : r.urgence === '3_mois' ? '#f59e0b15' : r.urgence === '6_mois' ? '#3b82f615' : '#6b728015',
                    color: r.urgence === 'immediate' ? '#dc2626' : r.urgence === '3_mois' ? '#f59e0b' : r.urgence === '6_mois' ? '#3b82f6' : '#6b7280',
                  }}>{r.urgence}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{r.justification}</p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-right mt-1">
              <button type="button" onClick={() => {
                const html = decisionTracker.getDecisionsByAerodrome(aerodromeId).map(d =>
                  `[${d.type}] ${d.date.slice(0, 10)} — ${d.recommendation?.action || d.certificatAction || d.declencheurType || d.suggestionType} — ${d.status} — ${d.effectiveness}`
                ).join('\n')
                const blob = new Blob([html], { type: 'text/plain;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `decisions_aerorisq_${aerodromeId.slice(0, 8)}.txt`
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
              }}
              className="text-role-primary hover:underline inline-flex items-center gap-1">
                <Download className="h-3 w-3" /> Exporter l'historique
              </button>
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
