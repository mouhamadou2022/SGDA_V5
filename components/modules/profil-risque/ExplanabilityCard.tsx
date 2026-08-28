'use client'

// Carte « Explicabilité du score » : l'explication narrative du niveau de score
// est générée par l'IA (fallback déterministe), depuis les données réelles.
// Les barres C1-C5 ont été retirées (redondantes avec « Détail par critère » du
// tab Diagnostic). Sont conservés les éléments uniques : drivers sensibles,
// alignement ML et inférence bayésienne (C5 prédit, prior→posterior, anomalie).

import { useMemo, useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import type { ProfilRisque, Ecart, EvenementSecurite } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { Lightbulb, BarChart3, BrainCircuit, AlertTriangle, Loader2, Sparkles } from 'lucide-react'
import { computeFeatureContributions, computeBayesianExplainability, getC5Color, getC5Label } from '@/lib/risque/explanability'
import type { NiveauC5 } from '@/lib/risque/naiveBayesC5'
import { expliquerScoreEnClair, type ExplicabiliteExplication } from '@/lib/ia/explicabiliteIA'

interface Props {
  profil: ProfilRisque
  ecarts?: Ecart[]
  evenements?: EvenementSecurite[]
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

export function ExplanabilityCard({ profil, ecarts = [], evenements }: Props) {
  const correlation = useAppStore(s => s.getMLRiskCorrelation())
  const [explication, setExplication] = useState<ExplicabiliteExplication | null>(null)
  const [enCours, setEnCours] = useState(true)
  const [prevProfil, setPrevProfil] = useState(profil)
  if (prevProfil !== profil) {
    setPrevProfil(profil)
    setEnCours(true)
    setExplication(null)
  }

  const contributions = useMemo(() =>
    computeFeatureContributions(profil, correlation),
    [profil, correlation]
  )

  const hasML = correlation?.topFeatures && correlation.topFeatures.length > 0
  const topDrivers = contributions.slice(0, 3)
  const isMostlyStable = contributions.every(c => c.direction === 'stable' || c.delta === null)

  useEffect(() => {
    let actif = true
    expliquerScoreEnClair({ profil, ecarts, evenements, correlation })
      .then((res) => {
        if (!actif) return
        setExplication(res)
        setEnCours(false)
      })
      .catch(() => {
        if (!actif) return
        setEnCours(false)
      })
    return () => { actif = false }
  }, [profil, ecarts, evenements, correlation])

  return (
    <Card variant="role" title="Explicabilité du score" icon={<Lightbulb className="w-4 h-4" />}>
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-foreground font-medium">Pourquoi ce score ?</span>
          {enCours ? (
            <span className="inline-flex items-center gap-2 text-xs text-primary">
              <Loader2 className="w-4 h-4 animate-spin" /> Analyse IA en cours…
            </span>
          ) : explication ? (
            <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full ${explication.fallbackIA ? 'text-foreground/70 bg-muted' : 'text-primary bg-primary/10'}`}>
              {!explication.fallbackIA && <Sparkles className="w-3.5 h-3.5" />}
              {explication.fallbackIA ? 'Analyse déterministe' : 'Langage clair AERORISQ'}
            </span>
          ) : null}
        </div>

        {explication && (
          <div className="space-y-2.5 text-sm text-foreground leading-relaxed">
            <p>{explication.synthese}</p>
            <p>{explication.facteurs}</p>
            <p>{explication.evolutions}</p>
            <p className="text-warning">{explication.priorites}</p>
          </div>
        )}

        {/* Facteurs les plus sensibles / Évolutions du mois */}
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
