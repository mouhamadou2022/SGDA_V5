// components/modules/ml-monitoring/ShapExplainerCard.tsx
// Carte 9 — Explicabilité SHAP-like : attribution additive exacte du score.
// Pour chaque critère C1-C5, la contribution φ = W_i·(x_i − référence)/100 est
// calculée par le moteur lib/ia/shapExplainer.ts ; la somme se vérifie
// exactement (baseline + Σφ = score). Visualisation en force chart + narration.
// Strictement additif : lecture seule, aucune donnée modifiée.

'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3, ArrowRight, AlertTriangle, CheckCircle2, Sparkles, Scale,
} from 'lucide-react'
import { useAppStore, type ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { calculerExplicationShap, construireNarrationShap, type ModeBaselineShap } from '@/lib/ia/shapExplainer'

interface Props {
  profil: ProfilRisque | null
}

const MODES: Array<{ id: ModeBaselineShap; label: string }> = [
  { id: 'neutre', label: 'Neutre (50)' },
  { id: 'moyenne', label: 'Moyenne historique' },
  { id: 'precedent', label: 'Mois précédent' },
]

export default function ShapExplainerCard({ profil }: Props) {
  const getHistoricalScoresForAerodrome = useAppStore(s => s.getHistoricalScoresForAerodrome)
  const [mode, setMode] = useState<ModeBaselineShap>('moyenne')

  const historique = useMemo(
    () => (profil ? getHistoricalScoresForAerodrome(profil.aerodrome_id) : []),
    [profil, getHistoricalScoresForAerodrome],
  )

  const explication = useMemo(
    () => (profil ? calculerExplicationShap(profil, historique, mode) : null),
    [profil, historique, mode],
  )

  if (!profil || !explication) {
    return (
      <Card icon={<BarChart3 className="h-4 w-4 text-role-primary" />} title="9. Explicabilité SHAP-like">
        <p className="text-sm text-muted text-center py-8">Complétez un profil de risque pour décomposer le score.</p>
      </Card>
    )
  }

  const tri = [...explication.contributions].sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi))
  const maxPhi = Math.max(1, ...tri.map(c => Math.abs(c.phi)))
  const poidsPerso = Math.abs(explication.scoreStocke - explication.score) > 1

  return (
    <Card icon={<BarChart3 className="h-4 w-4 text-role-primary" />} title="9. Explicabilité SHAP-like — pourquoi ce score ?" badge={
      <div className="flex items-center gap-1.5">
        <span className="badge text-xs">{explication.baseline.valeur} → {explication.score}</span>
        <span className="badge neutral text-xs">Σ exacte</span>
      </div>
    }>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground">
          Attribution additive exacte : chaque critère reçoit une contribution <span className="font-mono text-xs">φ = W·(x − référence)/100</span>, et la somme se vérifie à la prédiction près.
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`px-2.5 py-1 rounded-md text-xs ${mode === m.id ? 'bg-role-primary text-white' : 'text-foreground hover:bg-muted/30'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Force chart */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Contributions par critère</h4>

          {/* Échelle de force additive */}
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
              <span>Référence {explication.baseline.valeur}/100</span>
              <span className="font-bold text-foreground">{explication.score}/100</span>
            </div>
            <div className="relative h-7 rounded-md bg-muted/30 overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-success/70" style={{ width: `${(explication.baseline.valeur / 100) * 100}%` }} />
              <div
                className="absolute inset-y-0 bg-role-primary/70"
                style={{ left: `${Math.min(explication.baseline.valeur, explication.score) / 100 * 100}%`, width: `${Math.max(0, explication.score - explication.baseline.valeur) / 100 * 100}%` }}
              />
              <div className="absolute top-1/2 -translate-y-1/2 w-px h-5 bg-foreground" style={{ left: `${(explication.baseline.valeur / 100) * 100}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">Barre verte : gain net {explication.variation > 0 ? `+${explication.variation}` : explication.variation} pts vs référence ({explication.baseline.libelle}).</p>
          </div>

          {/* Barres de contribution */}
          <div className="space-y-2">
            {tri.map(c => (
              <div key={c.key} className="p-2.5 rounded-lg border border-border/60">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">{c.nom} <span className="text-muted-foreground font-normal">(poids {c.poids}%)</span></span>
                  <span className={`text-sm font-bold ${c.phi > 0 ? 'text-success' : c.phi < 0 ? 'text-danger' : 'text-muted-foreground'}`}>
                    {c.phi > 0 ? '+' : ''}{c.phi.toFixed(1)}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-muted/30">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/30" />
                  {c.phi !== 0 && (
                    <div
                      className={`absolute inset-y-0 rounded-full ${c.phi > 0 ? 'bg-success' : 'bg-danger'}`}
                      style={{
                        left: c.phi > 0 ? '50%' : `${50 - (Math.abs(c.phi) / maxPhi) * 50}%`,
                        width: `${(Math.abs(c.phi) / maxPhi) * 50}%`,
                      }}
                    />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {c.valeurCourante}/100 vs {c.valeurReference}/100 en référence · part {Math.round(c.part * 100)}%
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Narration + vérification */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-role-primary" />Lecture du jumeau</h4>

          <div className="rounded-lg bg-role-primary-soft/40 p-3 text-sm text-foreground leading-relaxed">
            {construireNarrationShap(explication)}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <h5 className="text-xs uppercase text-muted-foreground">Vérification additive</h5>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="px-2 py-1 rounded bg-muted/20 font-mono">base {explication.baseline.valeur}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="px-2 py-1 rounded bg-success-soft font-mono">+hausse {explication.totalHausse.toFixed(1)}</span>
              <span className="px-2 py-1 rounded bg-danger-soft font-mono">−baisse {Math.abs(explication.totalBaisse).toFixed(1)}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="px-2 py-1 rounded bg-role-primary-soft font-mono font-bold">{explication.somme.toFixed(1)} ≈ {explication.score}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              {Math.abs(explication.ecart) <= 0.51 ? (
                <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="w-3 h-3" />Somme exacte (écart {explication.ecart.toFixed(2)} pts — arrondi du score entier)</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="w-3 h-3" />Écart résiduel {explication.ecart.toFixed(2)} pts</span>
              )}
            </div>
          </div>

          {poidsPerso && (
            <div className="rounded-lg border border-border p-3">
              <h5 className="text-xs uppercase text-muted-foreground mb-1">Note</h5>
              <p className="text-xs text-foreground">
                Score stocké {explication.scoreStocke}/100 ≠ score décomposé {explication.score}/100 : des poids personnalisés sont en vigueur (recalibrage AERORISQ). La décomposition s&apos;applique aux poids de référence {Object.entries({ c1: 20, c2: 25, c3: 20, c4: 20, c5: 15 }).map(([k, v]) => `${k.toUpperCase()} ${v}%`).join(' · ')}.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-border p-3">
            <h5 className="text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1.5"><Scale className="w-3 h-3" />Méthode</h5>
            <p className="text-xs text-muted-foreground">
              Le score est une somme pondérée linéaire : l&apos;attribution φ = W·(x − référence)/100 est l&apos;analogue exact d&apos;une valeur de Shapley pour ce modèle — les contributions se somment exactement à la prédiction, sans approximation ni échantillonnage.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}