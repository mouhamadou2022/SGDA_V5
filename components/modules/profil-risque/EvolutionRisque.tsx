'use client'

// components/modules/profil-risque/EvolutionRisque.tsx
// Carte « Évolution du risque (modèle bayésien) » — vue exploitant.
// 3 blocs 100% data-driven à partir des données persistées du profil :
//   1. Trajectoire du score projeté (aujourd'hui → 3/6/12 mois + pire cas, IC95)
//   2. Mise à jour bayésienne dynamique (prior → posterior, cygne noir)
//   3. Impact des mesures engagées (simulation C4 via calculateC4FromEcarts)
// Encart « En langage clair » via IA avec fallback déterministe chiffré.

import { useState, useEffect } from 'react'
import { ProfilRisque } from '@/lib/store'
import { calculateGlobalScore, calculateC4FromEcarts } from '@/lib/risque'
import { Card } from '@/components/ui/card'
import { expliquerEvolutionRisque, fallbackEvolutionRisque } from '@/lib/ia/exploitantIA'
import { LangageClairFeedback } from '@/components/modules/profil-risque/LangageClairFeedback'
import { Brain, Sparkles, Loader2, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react'

interface Props {
  profil: ProfilRisque
  aerodromeCode: string
  aerodromeName: string
  ecartsActifs: any[]
}

function scoreClr(s: number): string {
  if (s >= 60) return 'text-success'
  if (s >= 30) return 'text-warning'
  return 'text-danger'
}

const STATUTS_ENGAGES = ['pac_soumis', 'pac_accepte', 'preuves_soumises', 'preuves_evaluees']

export default function EvolutionRisque({ profil, aerodromeCode, aerodromeName, ecartsActifs }: Props) {
  // ── Simulation d'impact des mesures (data-driven, fondée sur C4) ──
  const ecartsEngages = ecartsActifs.filter((e: any) => STATUTS_ENGAGES.includes(e.statut))
  const ecartsEnAttente = ecartsActifs.filter((e: any) => !STATUTS_ENGAGES.includes(e.statut))
  const c4Actuel = calculateC4FromEcarts(ecartsActifs)
  const c4AvecMesures = calculateC4FromEcarts(ecartsActifs.filter((e: any) => !STATUTS_ENGAGES.includes(e.statut)))
  const crit = (c4: number) => ({ c1: profil.c1, c2: profil.c2, c3: profil.c3, c4, c5: profil.c5 })
  const scoreActuel = calculateGlobalScore(crit(c4Actuel))
  const scoreAvecMesures = calculateGlobalScore(crit(c4AvecMesures))
  const scorePotentiel = calculateGlobalScore(crit(100))

  // ── Bayésien dynamique ──
  const post = profil.bayesian_posterior != null ? Math.round(profil.bayesian_posterior * 100) : null
  const prior = profil.bayesian_prior != null ? Math.round(profil.bayesian_prior * 100) : null

  // ── Langage clair IA ──
  const [texte, setTexte] = useState(() => fallbackEvolutionRisque({ profil, aerodromeCode, aerodromeName, ecartsActifs }).texte)
  const [iaEnCours, setIaEnCours] = useState(true)
  const [iaActif, setIaActif] = useState(false)

  useEffect(() => {
    let actif = true
    setIaEnCours(true)
    setIaActif(false)
    setTexte(fallbackEvolutionRisque({ profil, aerodromeCode, aerodromeName, ecartsActifs }).texte)
    expliquerEvolutionRisque({ profil, aerodromeCode, aerodromeName, ecartsActifs }).then((res) => {
      if (!actif) return
      setTexte(res.texte)
      setIaActif(!res.fallbackIA)
      setIaEnCours(false)
    }).catch(() => {
      if (!actif) return
      setIaEnCours(false)
    })
    return () => { actif = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profil, aerodromeCode, aerodromeName])

  const score = profil.score_global ?? 0
  const points = [
    { label: "Aujourd'hui", val: score, ic: null as { lower: number; upper: number } | null },
    { label: '3 mois', val: profil.prediction_3m, ic: profil.prediction_interval_3m ?? null },
    { label: '6 mois', val: profil.prediction_6m, ic: profil.prediction_interval_6m ?? null },
    { label: '12 mois', val: profil.prediction_12m ?? null, ic: null },
    { label: 'Pire cas', val: profil.scenarios?.[3]?.scoreProjecte ?? null, ic: null },
  ]

  const interpTrajectoire = (() => {
    if (profil.prediction_3m == null) return null
    const diff = Math.round(profil.prediction_3m) - score
    if (diff > 2) return `Le score devrait gagner environ ${diff} points d'ici 3 mois si la tendance se poursuit.`
    if (diff < -2) return `Attention : le score pourrait perdre environ ${-diff} points d'ici 3 mois — la tendance se dégrade.`
    return 'Le score devrait rester stable d\'ici 3 mois.'
  })()

  const interpBayes = (() => {
    if (prior == null || post == null) return null
    if (post > prior) return `La probabilité de défaillance estimée est passée de ${prior}% à ${post}% après intégration des dernières observations : signal de dégradation à surveiller.`
    if (post < prior) return `La probabilité de défaillance estimée est passée de ${prior}% à ${post}% : le risque diminue grâce aux mesures prises.`
    return `La probabilité de défaillance estimée reste stable (${post}%).`
  })()

  const gainMesures = scoreAvecMesures - scoreActuel
  const gainPotentiel = scorePotentiel - scoreActuel

  return (
    <Card variant="role" title="Évolution du risque (modèle bayésien)" icon={<TrendingUp className="w-4 h-4" />}>
      <div className="space-y-4">
        {/* ── 1. Trajectoire du score projeté ── */}
        <div>
          <p className="text-xs font-semibold text-foreground mb-2">Trajectoire du score</p>
          <div className="flex items-center justify-around flex-wrap gap-3">
            {points.map((p) => {
              if (p.val == null) return null
              return (
                <div key={p.label} className="text-center">
                  <p className="text-xs text-foreground">{p.label}</p>
                  <p className={`text-lg font-bold ${scoreClr(Math.round(p.val))}`}>{Math.round(p.val)}/100</p>
                  {p.ic && <p className="text-[10px] text-foreground italic">IC95 [{Math.round(p.ic.lower)}–{Math.round(p.ic.upper)}]</p>}
                </div>
              )
            })}
          </div>
          {interpTrajectoire && (
            <p className="text-xs text-foreground mt-2 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-primary shrink-0" />
              {interpTrajectoire}
            </p>
          )}
        </div>

        {/* ── 2. Mise à jour bayésienne dynamique ── */}
        {post != null && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
              <Brain className="w-3.5 h-3.5 text-primary shrink-0" /> Probabilité de défaillance (mise à jour bayésienne)
            </p>
            <div className="flex items-center gap-3 text-xs text-foreground">
              {prior != null && <span>Avant : <span className="font-semibold">{prior}%</span></span>}
              <div className="progress flex-1 h-2">
                <div className={`progress-bar ${post > 50 ? 'bg-danger' : post > 30 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${post}%` }} />
              </div>
              <span>Après : <span className={`font-semibold ${post > 50 ? 'text-danger' : post > 30 ? 'text-warning' : 'text-success'}`}>{post}%</span></span>
            </div>
            {interpBayes && <p className="text-xs text-foreground mt-2">{interpBayes}</p>}
            {profil.bayesian_black_swan && (
              <div className="flex items-center gap-1.5 mt-2 p-2 rounded-lg bg-danger-soft text-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
                <span className="text-danger font-semibold">Cygne noir détecté</span>
                <span className="text-foreground">— événement rare mais potentiellement grave, à traiter avec précaution.</span>
              </div>
            )}
          </div>
        )}

        {/* ── 3. Impact des mesures engagées ── */}
        <div className="pt-3 border-t border-border">
          <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" /> Impact des mesures engagées
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-muted/20 rounded-lg p-2">
              <p className="text-xs text-foreground">Actuel</p>
              <p className={`text-base font-bold ${scoreClr(scoreActuel)}`}>{scoreActuel}/100</p>
            </div>
            <div className="bg-primary-soft rounded-lg p-2">
              <p className="text-xs text-foreground">Si les mesures aboutissent</p>
              <p className={`text-base font-bold ${scoreClr(scoreAvecMesures)}`}>{scoreAvecMesures}/100</p>
              {gainMesures !== 0 && <p className={`text-[10px] font-semibold ${gainMesures > 0 ? 'text-success' : 'text-danger'}`}>{gainMesures > 0 ? `+${gainMesures}` : gainMesures} pts</p>}
            </div>
            <div className="bg-success-soft rounded-lg p-2">
              <p className="text-xs text-foreground">Si tous les écarts traités</p>
              <p className={`text-base font-bold ${scoreClr(scorePotentiel)}`}>{scorePotentiel}/100</p>
              {gainPotentiel !== 0 && <p className={`text-[10px] font-semibold ${gainPotentiel > 0 ? 'text-success' : 'text-danger'}`}>{gainPotentiel > 0 ? `+${gainPotentiel}` : gainPotentiel} pts</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-foreground">
            <span className={`badge ${ecartsEngages.length > 0 ? 'primary' : 'muted'}`}>{ecartsEngages.length} mesure(s) engagée(s)</span>
            <span className={`badge ${ecartsEnAttente.length > 0 ? 'warning' : 'muted'}`}>{ecartsEnAttente.length} à engager</span>
            {ecartsEnAttente.length > 0 && (
              <span className="text-xs text-foreground">Chaque PAC soumis ou écart traité fait baisser la charge critique (C4) et remonte le score.</span>
            )}
          </div>
          <p className="text-[10px] text-foreground italic mt-2">
            Simulation fondée sur le critère C4 (charge critique), seul composant du score directement piloté par les écarts actifs, avec les poids par défaut.
          </p>
        </div>

        {/* ── En langage clair IA ── */}
        <div className="pt-3 border-t border-border text-xs text-foreground" data-module="evolution-langage-clair">
          {iaEnCours ? (
            <p className="flex items-center gap-1.5 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" /> Analyse en cours…
            </p>
          ) : (
            <div>
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase text-primary mb-1">
                <Sparkles className="w-3 h-3" /> En langage clair
              </p>
              <p className="leading-relaxed">{texte}</p>
              {iaActif && (
                <p className="flex items-center gap-1.5 text-[10px] text-primary mt-1">
                  <Sparkles className="w-3 h-3" /> Langage clair IA
                </p>
              )}
              <LangageClairFeedback module="evolution" aerodromeId={aerodromeCode} contexte={{ score }} texte={texte} fallbackIA={!iaActif} />
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
