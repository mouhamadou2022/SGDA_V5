// components/modules/profil-risque/AnticipationTab.tsx
// Points de vigilance inspecteur partagés avec l'onglet « Actions » :
// l'appel /api/ai/actions est réalisé UNE SEULE FOIS par l'onglet Actions,
// cet onglet relit le résultat depuis le store partagé (pas de double appel).

'use client'

import { useState, useEffect } from 'react'
import { ProfilRisque, ScoreHistoryPoint, EvenementSecurite } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { AlertTriangle, Brain, Target, Shield, Clock, ArrowRight, CheckCircle2, Sparkles, Loader2 } from 'lucide-react'
import ScenarioSimulator from './ScenarioSimulator'
import type { ActionConcrete } from '@/lib/risque/recommendations'
import { useActionsIAStore } from '@/lib/state/actionsIAStore'
import {
  expliquerPredictionsEnClair,
  expliquerRisquesIncidentsEnClair,
  fallbackPredictions,
  fallbackIncidents,
} from '@/lib/ia/anticipationIA'

interface AnticipationTabProps {
  profil: ProfilRisque
  historicalScores: ScoreHistoryPoint[]
  evenements: EvenementSecurite[]
  aerodromeCode?: string
}

const PRIORITE_LABEL: Record<string, { label: string; badge: string }> = {
  immediate: { label: 'Immédiat', badge: 'badge danger' },
  haute: { label: 'Prioritaire', badge: 'badge warning' },
  moyenne: { label: 'À planifier', badge: 'badge teal' },
  basse: { label: 'Secondaire', badge: 'badge neutral' },
}

// Normalise une valeur vers un pourcentage 0-100 (accepte 0-1 ou 0-100)
function pct(v?: number | null): number | null {
  if (v === undefined || v === null || Number.isNaN(v)) return null
  const p = v <= 1 ? v * 100 : v
  return Math.min(100, Math.max(0, Math.round(p)))
}

// ── Sous-composant : interprétation en langage clair d'une carte ──
function LangageClair({ texte, iaEnCours, iaActif }: { texte: string; iaEnCours: boolean; iaActif: boolean }) {
  if (iaEnCours) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-primary mt-3 pt-2 border-t border-border">
        <Loader2 className="w-3 h-3 animate-spin" /> Interprétation en cours…
      </p>
    )
  }
  return (
    <div className="mt-3 pt-2 border-t border-border">
      <p className="text-xs text-foreground leading-relaxed">{texte}</p>
      {iaActif && (
        <p className="flex items-center gap-1.5 text-[10px] text-primary mt-1">
          <Sparkles className="w-3 h-3" /> Langage clair IA
        </p>
      )}
    </div>
  )
}

export default function AnticipationTab({ profil, historicalScores, evenements, aerodromeCode }: AnticipationTabProps) {
  const actionsPartagees = useActionsIAStore((s) => s.parAerodrome[profil.aerodrome_id])
  const actions = actionsPartagees ?? []

  // Interprétation en langage clair — fallback déterministe affiché immédiatement
  const [predTexte, setPredTexte] = useState(() => fallbackPredictions(profil).texte)
  const [predEnCours, setPredEnCours] = useState(true)
  const [predIA, setPredIA] = useState(false)
  const [prevProfilPred, setPrevProfilPred] = useState(profil)

  const [incidentTexte, setIncidentTexte] = useState(() => fallbackIncidents(profil).texte)
  const [incidentEnCours, setIncidentEnCours] = useState(true)
  const [incidentIA, setIncidentIA] = useState(false)
  const [prevProfilIncident, setPrevProfilIncident] = useState(profil)

  if (prevProfilPred !== profil) {
    setPrevProfilPred(profil)
    setPredEnCours(true)
    setPredTexte(fallbackPredictions(profil).texte)
  }

  if (prevProfilIncident !== profil) {
    setPrevProfilIncident(profil)
    setIncidentEnCours(true)
    setIncidentTexte(fallbackIncidents(profil).texte)
  }

  useEffect(() => {
    expliquerPredictionsEnClair(profil).then((res) => {
      setPredTexte(res.texte)
      setPredIA(!res.fallbackIA)
      setPredEnCours(false)
    }).catch(() => {
      setPredEnCours(false)
    })
  }, [profil])

  useEffect(() => {
    expliquerRisquesIncidentsEnClair(profil).then((res) => {
      setIncidentTexte(res.texte)
      setIncidentIA(!res.fallbackIA)
      setIncidentEnCours(false)
    }).catch(() => {
      setIncidentEnCours(false)
    })
  }, [profil])

  return (
    <div className="space-y-8 animate-fade-up" data-module="anticipation-tab">
      {/* ═══ ROW 1 — Ce qui va arriver ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card variant="role" title="Prédictions temporelles" icon={<Target className="w-4 h-4" />} size="sm">
          <div className="flex items-center justify-around">
            {([
              { label: '3 mois', val: profil.prediction_3m, ic: profil.prediction_interval_3m },
              { label: '6 mois', val: profil.prediction_6m, ic: profil.prediction_interval_6m },
              { label: '12 mois', val: profil.prediction_12m, ic: null },
            ] as const).map((p) => {
              if (p.val === undefined) return null
              const cls = p.val >= 80 ? 'text-danger' : p.val >= 60 ? 'text-warning' : p.val >= 30 ? 'text-primary' : 'text-success'
              return (
                <div key={p.label} className="text-center">
                  <div className={`text-2xl font-bold ${cls}`}>{Math.round(p.val)}</div>
                  <div className="text-xs text-foreground">{p.label}</div>
                  {p.ic && <div className="text-[10px] text-foreground italic">IC95 [{pct(p.ic.lower)}–{pct(p.ic.upper)}]</div>}
                </div>
              )
            })}
          </div>
          {profil.ensemble_confidence !== undefined && (() => {
            const conf = pct(profil.ensemble_confidence)
            if (conf === null) return null
            return (
              <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border text-xs text-foreground">
                <span>Fiabilité des modèles</span>
                <div className="progress flex-1 h-1.5">
                  <div className="progress-bar" style={{ width: `${conf}%`, background: `var(--color-${conf >= 70 ? 'success' : conf >= 40 ? 'warning' : 'danger'})` }} />
                </div>
                <span className="font-mono">{conf}%</span>
              </div>
            )
          })()}
          <LangageClair texte={predTexte} iaEnCours={predEnCours} iaActif={predIA} />
        </Card>

        <Card variant="role" title="Risques incidents & extrêmes" icon={<AlertTriangle className="w-4 h-4" />} size="sm">
          <div className="grid grid-cols-3 gap-2 text-center">
            {([
              { label: 'Incident 3m', val: profil.incident_prediction_3m, cls: 'text-danger', bg: 'bg-danger/5' },
              { label: 'Incident 6m', val: profil.incident_prediction_6m, cls: 'text-warning', bg: 'bg-warning/5' },
              { label: 'Incident 12m', val: profil.incident_prediction_12m, cls: 'text-role-primary', bg: 'bg-role-primary-soft' },
            ]).map(({ label, val, cls, bg }) => {
              const v = pct(val)
              return (
                <div key={label} className={`p-2 rounded-lg ${bg}`}>
                  <div className="text-xs text-foreground">{label}</div>
                  <div className={`text-lg font-bold ${cls}`}>{v !== null ? `${v}%` : '—'}</div>
                </div>
              )
            })}
          </div>
          {profil.extreme_risk && (() => {
            const tailPct = pct(profil.extreme_risk!.tailRisk)
            return (
              <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-border text-xs text-foreground">
                <span className={`badge ${profil.extreme_risk!.isHeavyTailed ? 'danger' : 'success'}`}>{profil.extreme_risk!.isHeavyTailed ? 'Queue lourde' : 'Queue normale'}</span>
                {tailPct !== null && <span>Risque extrême: {tailPct}%</span>}
                {profil.extreme_risk!.maxExpected12m !== undefined && <span>Max 12m: {profil.extreme_risk!.maxExpected12m} incidents</span>}
              </div>
            )
          })()}
          <LangageClair texte={incidentTexte} iaEnCours={incidentEnCours} iaActif={incidentIA} />
        </Card>
      </div>

      {/* ═══ ROW 2 — Points de vigilance inspecteur (partagés avec l'onglet Actions) ═══ */}
      <Card
        title="Points de vigilance — inspecteur"
        icon={<Shield className="w-4 h-4" />}
        variant="level"
        levelColor={
          actions.length === 0 ? 'none' :
          actions.some(a => a.priorite === 'immediate') ? 'danger' :
          actions.some(a => a.priorite === 'haute') ? 'warning' : 'primary'
        }
      >
        {actions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="w-10 h-10 text-success" />
            <p className="text-sm text-foreground">Aucun point de vigilance enregistré pour le moment.</p>
            <p className="text-xs text-foreground text-center max-w-md">Le plan d&apos;action détaillé (avec suivi, filtres et export) est généré dans l&apos;onglet « Actions » — ouvrez-le pour lancer l&apos;analyse AERORISQ et retrouver ici les points de vigilance.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {actions.map((a, i) => (
              <ActionCard key={i} action={a} />
            ))}
          </div>
        )}
      </Card>

      {/* ═══ ROW 3 — Ce qui pourrait arriver (What-if) ═══ */}
      <ScenarioSimulator profil={profil} aerodromeName={aerodromeCode || profil.aerodrome_id} userRole="admin" />

      {/* ═══ ROW 4 — Signalements contextuels ═══ */}
      {evenements && evenements.length > 0 && (
        <Card variant="role" title="Signalements par type d'incident" icon={<Brain className="w-4 h-4" />} size="sm">
          <div className="space-y-2">
            {(() => {
              const eventTypes = new Map<string, number>()
              for (const evt of evenements) {
                const t = evt.type || evt.gravite || 'incident'
                eventTypes.set(t, (eventTypes.get(t) || 0) + 1)
              }
              const sorted = Array.from(eventTypes.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4)
              return sorted.map(([type, count]) => {
                const prob = Math.min(95, Math.round((count / Math.max(1, evenements.length)) * ((profil.incident_prediction_6m ?? 0) > 0 ? profil.incident_prediction_6m! : 50)))
                return (
                  <div key={type} className={`flex items-center justify-between gap-3 p-2 rounded-lg ${prob > 50 ? 'bg-danger-soft' : prob > 30 ? 'bg-warning-soft' : 'bg-muted/20'}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${prob > 50 ? 'bg-danger' : prob > 30 ? 'bg-warning' : 'bg-primary'}`} />
                    <span className="text-xs text-foreground flex-1 capitalize">{type.toLowerCase().replace(/_/g, ' ')}</span>
                    <span className={`text-xs font-bold ${prob > 50 ? 'text-danger' : prob > 30 ? 'text-warning' : 'text-primary'}`}>{prob}%</span>
                    <span className="text-[10px] text-foreground">({count} occ.)</span>
                  </div>
                )
              })
            })()}
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Sous-composant : un point de vigilance IA ──
function ActionCard({ action }: { action: ActionConcrete }) {
  const cfg = PRIORITE_LABEL[action.priorite] || PRIORITE_LABEL.moyenne

  return (
    <div className={`rounded-xl border ${action.priorite === 'immediate' ? 'border-danger/30 bg-danger-soft' : action.priorite === 'haute' ? 'border-warning/30 bg-warning-soft' : 'border-border bg-background/30'}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${action.priorite === 'immediate' ? 'bg-danger' : action.priorite === 'haute' ? 'bg-warning' : 'bg-role-primary'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-foreground">{action.titre}</p>
              <span className={`badge text-[10px] ${cfg.badge}`}>{cfg.label}</span>
            </div>

            <p className="text-xs text-foreground mt-2">
              <span className="font-medium">Constat : </span>{action.constat}
            </p>

            <div className="mt-2 p-3 rounded-lg bg-background/60 border border-border/50">
              <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Target className="w-3 h-3 text-role-primary" />
                Vérification recommandée :
              </p>
              <p className="text-xs text-foreground mt-1">{action.verification}</p>
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs text-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Échéance: <span className="font-semibold">{action.echeance}</span>
              </span>
              <span className="flex items-center gap-1 text-success">
                <ArrowRight className="w-3 h-3" />
                {action.impactAttendu}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
