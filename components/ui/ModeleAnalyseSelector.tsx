// components/ui/ModeleAnalyseSelector.tsx
// Sélecteur de modèle d'analyse IA : Bow-Tie / FTA / AMDEC.
// Recommande le modèle le plus adapté aux données réelles (score, intervalle
// de confiance, raisons) et laisse l'inspecteur choisir.

'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import {
  recommanderModeleAnalyse,
  recommanderParmi,
  getModelesDisponibles,
  MODELE_LABELS,
  MODELE_DESCRIPTIONS,
  type ModeleAnalyse,
  type ModeleAnalyseInput,
} from '@/lib/ia/modelSelector'
import { traduireRecommandationEnClair, type RecommandationClaire } from '@/lib/ia/modelSelectorIA'
import { GitBranch, ListTree, Settings2, Sparkles, CheckCircle2, Loader2, Activity, Timer, AlertTriangle, Share2, Target, Brain, Network } from 'lucide-react'

const ICONES: Record<ModeleAnalyse, React.ElementType> = {
  bowtie: GitBranch,
  fta: ListTree,
  amdec: Settings2,
  hmm: Activity,
  survie: Timer,
  evt: AlertTriangle,
  copula: Share2,
  thompson: Target,
  bayes: Brain,
  rf: Network,
}

interface Props {
  input: ModeleAnalyseInput
  selected: ModeleAnalyse
  onSelect: (modele: ModeleAnalyse) => void
  /** Limite aux modèles réellement disponibles dans le contexte (ex. exploitant).
   *  Par défaut, les modèles sont déduits des données réelles via getModelesDisponibles. */
  modelesDisponibles?: ModeleAnalyse[]
  className?: string
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-success'
  if (score >= 45) return 'text-warning'
  return 'text-danger'
}

function getScoreBar(score: number): string {
  if (score >= 70) return 'bg-success'
  if (score >= 45) return 'bg-warning'
  return 'bg-danger'
}

export function ModeleAnalyseSelector({ input, selected, onSelect, modelesDisponibles, className }: Props) {
  const modelesAuto = useMemo(() => getModelesDisponibles(input), [input])
  const modeles = modelesDisponibles ?? modelesAuto

  const rec = useMemo(() => {
    if (modelesDisponibles) return recommanderParmi(input, modelesDisponibles)
    return recommanderModeleAnalyse(input)
  }, [input, modelesDisponibles])

  const [clair, setClair] = useState<RecommandationClaire | null>(null)
  const [iaEnCours, setIaEnCours] = useState(false)

  const enrichir = useCallback(async () => {
    if (modeles.length === 0) return
    setIaEnCours(true)
    try {
      const result = await traduireRecommandationEnClair(input, rec, modeles)
      setClair(result)
    } catch {
      setClair(null)
    } finally {
      setIaEnCours(false)
    }
  }, [input, rec, modeles])

  useEffect(() => {
    setClair(null)
    enrichir()
  }, [enrichir])

  const scores = (clair?.scores ?? rec.scores).filter((s) => modeles.includes(s.modele))
  const justification = clair?.justification ?? rec.justification
  const estTraduit = !!clair && !clair.fallbackIA

  return (
    <Card variant="role" heading="Modèle d'analyse — recommandation AERORISQ" icon={<Sparkles className="w-5 h-5" />} className={className}>
      <div className="flex items-start gap-3 mb-4 rounded-xl border border-role-primary/20 bg-role-primary/5 p-3">
        <div className="w-8 h-8 rounded-lg bg-role-primary-soft flex items-center justify-center shrink-0">
          {iaEnCours ? <Loader2 className="w-4 h-4 text-role-primary animate-spin" /> : <Sparkles className="w-4 h-4 text-role-primary" />}
        </div>
        <div className="text-sm text-foreground leading-relaxed">
          <span className="font-semibold text-role-primary">{MODELE_LABELS[rec.recommande]}</span> recommandé
          {rec.fallbackDeterministe && <span className="badge outline ml-2">déterministe</span>}
          {estTraduit && <span className="badge primary ml-2">langage clair AERORISQ</span>}
          <p className="mt-1">{justification}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {scores.map((s) => {
          const Icone = ICONES[s.modele]
          const actif = selected === s.modele
          const estRecommande = rec.recommande === s.modele && !rec.fallbackDeterministe
          return (
            <button
              key={s.modele}
              onClick={() => onSelect(s.modele)}
              className={`text-left rounded-xl border p-3 transition-all ${actif ? 'border-role-primary bg-role-primary/10 shadow-role-glow' : 'border-border hover:border-role-primary/40 hover:bg-muted/20'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2">
                  <Icone className={`w-4 h-4 ${actif ? 'text-role-primary' : 'text-foreground/60'}`} />
                  <span className={`text-sm font-semibold ${actif ? 'text-role-primary' : 'text-foreground'}`}>{MODELE_LABELS[s.modele]}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {estRecommande && <span className="rounded-full bg-success/15 text-success text-[10px] px-1.5 py-0.5 font-medium">Recommandé</span>}
                  {actif && <CheckCircle2 className="w-4 h-4 text-role-primary" />}
                </div>
              </div>

              <p className="text-[11px] text-foreground/60 leading-snug mb-2 line-clamp-2">{MODELE_DESCRIPTIONS[s.modele]}</p>

              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-foreground/60">Pertinence</span>
                <span className={`font-bold ${getScoreColor(s.score)}`}>{s.score}/100</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 mb-2">
                <div className={`h-1.5 rounded-full ${getScoreBar(s.score)}`} style={{ width: `${Math.min(100, s.score)}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-foreground/60">
                <span>Confiance {s.confiance}%</span>
                <span className="font-mono">[{s.intervalle[0]}–{s.intervalle[1]}]</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 space-y-1">
        {scores.map((s) => (
          <p key={s.modele} className="text-[11px] text-foreground/60 leading-snug">
            <span className="font-semibold text-foreground/80">{MODELE_LABELS[s.modele]}</span> : {s.raisons.join(' · ') || '—'}
          </p>
        ))}
      </div>
    </Card>
  )
}
