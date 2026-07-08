'use client'

import { useMemo } from 'react'
import { ProfilRisque } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { Lightbulb, TrendingUp, TrendingDown, BarChart3, BrainCircuit, AlertTriangle } from 'lucide-react'
import { computeFeatureContributions, computeBayesianExplainability, getC5Color, getC5Label, type FeatureContribution } from '@/lib/risque/explanability'
import type { NiveauC5 } from '@/lib/risque/naiveBayesC5'

interface Props {
  profil: ProfilRisque
}

function getRiskLevel(score: number): string {
  if (score < 30) return 'critique'
  if (score < 60) return 'eleve'
  if (score < 80) return 'moyen'
  return 'faible'
}

function getBarColor(score: number): string {
  const level = getRiskLevel(score)
  return level === 'critique' ? 'var(--color-danger)' : level === 'eleve' ? 'var(--color-warning)' : level === 'moyen' ? 'var(--color-primary)' : 'var(--color-success)'
}

function ContributionBar({ contrib }: { contrib: FeatureContribution }) {
  const barColor = getBarColor(contrib.currentValue)
  const isRisk = contrib.currentValue < 60

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">{contrib.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{(contrib.importance * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono font-bold" style={{ color: barColor }}>{contrib.currentValue}</span>
          {contrib.delta !== null && contrib.delta !== 0 && (
            <span className={`flex items-center gap-0.5 text-[10px] font-mono ${contrib.delta > 0 ? 'text-success' : 'text-danger'}`}>
              {contrib.delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {contrib.delta > 0 ? '+' : ''}{contrib.delta}
            </span>
          )}
        </div>
      </div>
      <div className="progress h-1.5">
        <div className="progress-bar" style={{ width: `${contrib.currentValue}%`, background: barColor, opacity: isRisk ? 1 : 0.6 }} />
      </div>
    </div>
  )
}

function BayesianSection({ profil }: { profil: ProfilRisque }) {
  const bayes = useMemo(() => computeBayesianExplainability(profil), [profil])

  if (!bayes) {
    return (
      <div className="pt-2 border-t border-border">
        <p className="text-[10px] text-foreground opacity-60">Inférence bayésienne : historique insuffisant (&lt; 2 points)</p>
      </div>
    )
  }

  const predColor = getC5Color(bayes.predictedC5 as NiveauC5)
  const predLabel = getC5Label(bayes.predictedC5 as NiveauC5)

  return (
    <div className="pt-2 border-t border-border space-y-2.5">
      <div className="flex items-center gap-2">
        <BrainCircuit className="w-3.5 h-3.5 text-foreground shrink-0" />
        <span className="text-[10px] text-foreground uppercase tracking-wide font-semibold">Inférence bayésienne</span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-foreground">C5 estimé depuis C1-C4 :</span>
        <span className="font-bold font-mono" style={{ color: predColor }}>{predLabel}</span>
        <span className="text-[10px] text-muted-foreground">(confiance {(bayes.confidence * 100).toFixed(0)}%)</span>
      </div>

      {/* Barres de distribution prior → posterior */}
      <div className="space-y-1">
        {(['bas', 'moyen', 'eleve'] as const).map(n => {
          const priorPct = (bayes.prior[n] * 100).toFixed(0)
          const postPct = (bayes.posterior[n] * 100).toFixed(0)
          const shift = bayes.posterior[n] - bayes.prior[n]
          const barColor = getC5Color(n)
          return (
            <div key={n} className="grid grid-cols-[4rem_1fr_2.5rem_1fr_2.5rem] gap-1 items-center">
              <span className="text-[10px] text-foreground capitalize">{n}</span>
              <div className="progress h-1">
                <div className="progress-bar" style={{ width: `${bayes.prior[n] * 100}%`, background: 'var(--color-muted-foreground)', opacity: 0.4 }} />
              </div>
              <span className="text-[9px] text-right text-muted-foreground font-mono">{priorPct}%</span>
              <div className="progress h-1">
                <div className="progress-bar" style={{ width: `${bayes.posterior[n] * 100}%`, background: barColor }} />
              </div>
              <span className={`text-[9px] text-right font-mono ${shift > 0 ? 'text-success' : shift < 0 ? 'text-danger' : 'text-muted-foreground'}`}>
                {shift > 0 ? '+' : ''}{(shift * 100).toFixed(0)}%
              </span>
            </div>
          )
        })}
      </div>

      {/* Facteurs de Bayes (top drivers) */}
      <div className="space-y-1">
        <p className="text-[10px] text-foreground font-medium">Contribution causale par critère</p>
        {bayes.topDrivers.slice(0, 3).map(d => (
          <div key={d.key} className="flex items-center gap-2 text-[10px] text-foreground">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0`}
              style={{ background: d.factor > 1 ? 'var(--color-success)' : 'var(--color-warning)' }} />
            <span className="font-medium">{d.name}</span>
            <span className="opacity-60">— facteur {d.factor > 1 ? '×' : '÷'}{Math.max(d.factor, 1/d.factor).toFixed(1)}</span>
          </div>
        ))}
      </div>

      {/* Alerte anomalie */}
      {bayes.isAnomalous && (
        <div className="flex items-start gap-1.5 text-[10px] text-danger">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>Configuration C1-C4 anormale : peu probable sous le modèle bayésien. Vérifier la cohérence des données ou un changement structurel.</span>
        </div>
      )}
    </div>
  )
}

export function ExplanabilityCard({ profil }: Props) {
  const correlation = useAppStore(s => s.getMLRiskCorrelation())

  const contributions = useMemo(() =>
    computeFeatureContributions(profil, correlation),
    [profil, correlation]
  )

  const hasML = correlation?.topFeatures && correlation.topFeatures.length > 0
  const topDrivers = contributions.slice(0, 3)
  const isMostlyStable = contributions.every(c => c.direction === 'stable' || c.delta === null)

  return (
    <Card variant="role" title="Explicabilité du score" icon={<Lightbulb className="w-4 h-4" />}>
      <div className="space-y-3">
        <p className="text-xs text-foreground leading-relaxed">
          {hasML
            ? `Le modèle RF (précision ${(correlation.rfAccuracy * 100).toFixed(0)}%) priorise les critères ci-dessous. Les scores les plus bas pèsent le plus sur le risque global.`
            : `Contribution des 5 critères C1-C5 au score global. Les scores les plus bas indiquent les risques prioritaires.`}
        </p>

        <div className="space-y-2.5">
          {contributions.map(c => (
            <ContributionBar key={c.key} contrib={c} />
          ))}
        </div>

        <div className="pt-2 border-t border-border">
          <p className="text-[10px] text-foreground uppercase tracking-wide font-semibold mb-2">
            {isMostlyStable ? 'Facteurs les plus sensibles' : 'Évolutions du mois'}
          </p>
          <div className="space-y-1.5">
            {topDrivers.map(d => (
              <div key={d.key} className="flex items-center gap-2 text-xs text-foreground">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.currentValue < 30 ? 'bg-danger' : d.currentValue < 60 ? 'bg-warning' : 'bg-success'}`} />
                <span className="font-medium">{d.name}</span>
                <span className="opacity-60">— {d.currentValue < 30 ? 'priorité critique' : d.currentValue < 60 ? 'point de vigilance' : 'bon niveau'}</span>
                {d.delta !== null && d.delta !== 0 && (
                  <span className={`ml-auto shrink-0 text-[10px] font-mono ${d.delta > 0 ? 'text-success' : 'text-danger'}`}>
                    {d.delta > 0 ? '+' : ''}{d.delta} pts
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {hasML && correlation && (
          <div className="flex items-center gap-2 pt-2 text-[10px] text-foreground border-t border-border">
            <BarChart3 className="w-3 h-3 shrink-0" />
            <span>Alignement ML: {correlation.alignmentScore}% · Convergence: {correlation.convergenceScore}%</span>
          </div>
        )}

        {/* Section inférence bayésienne */}
        <BayesianSection profil={profil} />
      </div>
    </Card>
  )
}
