// components/modules/profil-risque/ShapExplicationCard.tsx
// Explication du score global du profil — attribution additive SHAP-like.
// Rejoue le moteur lib/ia/shapExplainer.ts (baseline neutre / moyenne historique /
// mois précédent) pour expliquer « pourquoi ce score ». Lecture seule.

'use client'

import { useMemo, useState } from 'react'
import { BarChart3, ArrowRight, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react'
import { useAppStore, type ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { calculerExplicationShap, construireNarrationShap, type ModeBaselineShap } from '@/lib/ia/shapExplainer'

interface Props {
  profil: ProfilRisque
}

const MODES: Array<{ id: ModeBaselineShap; label: string }> = [
  { id: 'neutre', label: 'Neutre (50)' },
  { id: 'moyenne', label: 'Moyenne historique' },
  { id: 'precedent', label: 'Mois précédent' },
]

export default function ShapExplicationCard({ profil }: Props) {
  const getHistoricalScoresForAerodrome = useAppStore(s => s.getHistoricalScoresForAerodrome)
  const [mode, setMode] = useState<ModeBaselineShap>('moyenne')

  const historique = useMemo(
    () => getHistoricalScoresForAerodrome(profil.aerodrome_id),
    [profil.aerodrome_id, getHistoricalScoresForAerodrome],
  )

  const explication = useMemo(
    () => calculerExplicationShap(profil, historique, mode),
    [profil, historique, mode],
  )

  const tri = [...explication.contributions].sort((a, b) => Math.abs(b.phi) - Math.abs(a.phi))
  const maxPhi = Math.max(1, ...tri.map(c => Math.abs(c.phi)))
  const sommeExacte = Math.abs(explication.ecart) <= 0.51

  return (
    <Card icon={<BarChart3 className="h-4 w-4 text-role-primary" />} title="Pourquoi ce score ? — Explication SHAP-like" badge={
      <div className="flex items-center gap-1.5">
        <span className="badge text-xs">{explication.baseline.valeur} → {explication.score}</span>
        <span className="badge neutral text-xs">Σ exacte</span>
      </div>
    }>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground">
          Attribution additive exacte : chaque critère reçoit une contribution <span className="font-mono text-xs">φ = W·(x − référence)/100</span> par rapport à une référence choisie.
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`px-2.5 py-1 rounded-md text-xs ${mode === m.id ? 'bg-role-primary text-white' : 'text-foreground hover:bg-muted/30'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Contributions */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-foreground">Contributions par critère</h4>
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

        {/* Narration + vérification */}
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-foreground flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-role-primary" />Lecture du score</h4>
          <div className="rounded-lg bg-role-primary-soft/40 p-3 text-sm text-foreground leading-relaxed">
            {construireNarrationShap(explication)}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <h5 className="text-[10px] uppercase text-muted-foreground">Vérification additive</h5>
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className="px-2 py-1 rounded bg-muted/20 font-mono">base {explication.baseline.valeur}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="px-2 py-1 rounded bg-success-soft font-mono">+hausse {explication.totalHausse.toFixed(1)}</span>
              <span className="px-2 py-1 rounded bg-danger-soft font-mono">−baisse {Math.abs(explication.totalBaisse).toFixed(1)}</span>
              <ArrowRight className="w-3 h-3 text-muted-foreground" />
              <span className="px-2 py-1 rounded bg-role-primary-soft font-mono font-bold">{explication.somme.toFixed(1)} ≈ {explication.score}</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              {sommeExacte ? (
                <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="w-3 h-3" />Somme exacte (écart {explication.ecart.toFixed(2)} pts)</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-warning"><AlertTriangle className="w-3 h-3" />Écart résiduel {explication.ecart.toFixed(2)} pts</span>
              )}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Référence : {explication.baseline.libelle}. Un poids personnalisé (recalibrage AERORISQ) est reflété par un écart entre le score stocké ({explication.scoreStocke}/100) et la décomposition.
          </p>
        </div>
      </div>
    </Card>
  )
}
