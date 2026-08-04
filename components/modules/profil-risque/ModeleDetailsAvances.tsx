'use client'

// Détails avancés des modèles (accordéon de la carte « Statut des modèles »).
// Affiche les métriques réellement persistées au profil pour CHAQUE modèle
// présent — 100% data-driven, aucun chiffre inventé.

import { Brain } from 'lucide-react'
import type { ProfilRisque } from '@/lib/store'

const LABELS_ACTION: Record<string, string> = {
  audit_complet: 'Audit complet',
  maintien: 'Maintien',
  periodique: 'Périodique',
  suivi_ecarts: 'Suivi des écarts',
}

const BORDERS: Record<string, string> = {
  danger: 'border-l-danger',
  warning: 'border-l-warning',
  primary: 'border-l-primary',
  success: 'border-l-success',
}

type Niveau = 'danger' | 'warning' | 'primary' | 'success'

function Block({ titre, niveau, children }: { titre: string; niveau: Niveau; children: React.ReactNode }) {
  return (
    <div className={`rounded-lg border border-border bg-muted/30 p-2.5 text-xs space-y-1 border-l-4 ${BORDERS[niveau]}`}>
      <p className="font-medium text-foreground">{titre}</p>
      {children}
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-foreground">
      <span className="text-foreground/70">{label}</span>
      <span className={`font-mono font-bold ${tone ?? ''}`}>{value}</span>
    </div>
  )
}

export function ModeleDetailsAvances({ profil }: { profil: ProfilRisque }) {
  const blocs: React.ReactNode[] = []

  // ── HMM ──
  if (profil.hmm_state) {
    const h = profil.hmm_state
    const niveau: Niveau = h.isTransitioning ? 'danger' : h.transitionRisk > 50 ? 'warning' : 'success'
    blocs.push(
      <Block key="hmm" titre={`HMM — Markov ${h.isTransitioning ? '· Transition' : ''}`} niveau={niveau}>
        <Row label="État" value={<span className={h.isTransitioning ? 'text-danger' : 'text-success'}>{h.currentStateName}</span>} />
        <Row label="Risque transition" value={`${Math.round(h.transitionRisk)}%`} tone={h.transitionRisk > 50 ? 'text-danger' : h.transitionRisk > 30 ? 'text-warning' : ''} />
        {h.daysToCritical > 0 && <Row label="Avant critique" value={`J-${h.daysToCritical}`} tone={h.daysToCritical < 90 ? 'text-danger' : ''} />}
      </Block>
    )
  }

  // ── Survie ──
  if (profil.survival_metrics) {
    const s = profil.survival_metrics
    const h90 = Math.round(s.hazard90d * 100)
    const h180 = Math.round(s.hazard180d * 100)
    const niveau: Niveau = h90 > 50 ? 'danger' : h90 > 30 ? 'warning' : 'success'
    blocs.push(
      <Block key="survie" titre="Analyse de survie" niveau={niveau}>
        <Row label="Hazard 90j" value={`${h90}%`} tone={h90 > 50 ? 'text-danger' : h90 > 30 ? 'text-warning' : ''} />
        <Row label="Hazard 180j" value={`${h180}%`} />
        <Row label="Médiane avant incident" value={`${s.medianDays}j`} tone={s.medianDays < 100 ? 'text-warning' : 'text-success'} />
      </Block>
    )
  }

  // ── EVT ──
  if (profil.extreme_risk) {
    const e = profil.extreme_risk
    const tail = Math.round(e.tailRisk * 100)
    const niveau: Niveau = e.isHeavyTailed ? 'danger' : tail > 30 ? 'warning' : 'primary'
    blocs.push(
      <Block key="evt" titre="Risque extrême (EVT)" niveau={niveau}>
        <Row label="Probabilité extrême" value={`${tail}%`} tone={tail > 30 ? 'text-warning' : ''} />
        <Row label="Distribution" value={e.isHeavyTailed ? 'Queue lourde' : 'Queue normale'} tone={e.isHeavyTailed ? 'text-danger' : 'text-success'} />
        <Row label="Max attendu 12 mois" value={`${e.maxExpected12m} incidents`} />
      </Block>
    )
  }

  // ── Copulas ──
  if (profil.copula_metrics) {
    const c = profil.copula_metrics
    const dep = Math.round(c.maxTailDependence * 100)
    const niveau: Niveau = c.maxTailDependence > 0.6 ? 'danger' : c.maxTailDependence > 0.3 ? 'warning' : 'primary'
    blocs.push(
      <Block key="copula" titre="Copulas — dépendance de queue" niveau={niveau}>
        <Row label="Dépendance max" value={`${dep}%`} tone={dep > 60 ? 'text-danger' : dep > 30 ? 'text-warning' : ''} />
        <Row label="Pire cas" value={`${Math.round(c.worstCaseProbability * 100)}%`} tone={c.worstCaseProbability > 0.5 ? 'text-danger' : ''} />
        {c.worstCaseDescription && <p className="text-foreground/70 leading-snug">« {c.worstCaseDescription} »</p>}
      </Block>
    )
  }

  // ── Bayésien ──
  if (profil.bayesian_posterior != null) {
    const post = Math.round(profil.bayesian_posterior)
    const prior = profil.bayesian_prior != null ? Math.round(profil.bayesian_prior) : null
    const hausse = prior != null && post > prior
    const niveau: Niveau = profil.bayesian_black_swan || hausse ? 'danger' : 'success'
    blocs.push(
      <Block key="bayes" titre={`Bayésien ${profil.bayesian_black_swan ? '· Cygne noir' : ''}`} niveau={niveau}>
        {prior != null && <Row label="A priori" value={`${prior}%`} />}
        <Row label="A posteriori" value={`${post}%`} tone={hausse || profil.bayesian_black_swan ? 'text-danger' : 'text-success'} />
        {hausse && <p className="text-foreground/70 leading-snug">Révision à la hausse (+{post - prior} pts)</p>}
      </Block>
    )
  }

  // ── Négatif binomial ──
  if (profil.negbin_metrics) {
    const n = profil.negbin_metrics
    const niveau: Niveau = n.isOverdispersed ? 'warning' : 'success'
    blocs.push(
      <Block key="negbin" titre="Négatif binomial" niveau={niveau}>
        <Row label="Dispersion" value={n.dispersion?.toFixed(2) ?? '—'} tone={n.isOverdispersed ? 'text-warning' : ''} />
        <Row label="Moyenne / Variance" value={`${n.mean?.toFixed(1) ?? '—'} / ${n.variance?.toFixed(1) ?? '—'}`} />
        <p className="text-foreground/70 leading-snug">{n.isOverdispersed ? 'Surcharge détectée — incidents par grappes' : 'Distribution normale'}</p>
      </Block>
    )
  }

  // ── Hawkes ──
  if (profil.hawkes_intensity !== undefined) {
    const h = profil.hawkes_intensity
    const niveau: Niveau = h > 1 ? 'danger' : h > 0.5 ? 'warning' : 'success'
    blocs.push(
      <Block key="hawkes" titre="Hawkes — contagion" niveau={niveau}>
        <Row label="Intensité" value={h.toFixed(2)} tone={h > 1 ? 'text-danger' : h > 0.5 ? 'text-warning' : ''} />
        <p className="text-foreground/70 leading-snug">{h > 1 ? 'Risque de contagion d\'incidents' : h > 0.5 ? 'Contagion modérée' : 'Pas de contagion'}</p>
      </Block>
    )
  }

  // ── Thompson Sampling ──
  if (profil.ts_metrics) {
    const t = profil.ts_metrics
    const conf = Math.round(t.bestProbability)
    const niveau: Niveau = conf > 60 ? 'success' : 'primary'
    blocs.push(
      <Block key="ts" titre="Thompson Sampling" niveau={niveau}>
        <Row label="Action recommandée" value={<span className="font-semibold">{LABELS_ACTION[t.recommendedAction] ?? t.recommendedAction}</span>} tone="text-role-primary" />
        <Row label="Confiance" value={`${conf}%`} tone={conf > 60 ? 'text-success' : ''} />
      </Block>
    )
  }

  // ── Vélocité ──
  if (profil.velocity_metrics) {
    const v = profil.velocity_metrics
    const vitesse = v.vitesse
    const niveau: Niveau = vitesse < -2 ? 'danger' : vitesse < 0 ? 'warning' : 'success'
    blocs.push(
      <Block key="velo" titre={`Vélocité (${v.niveau_vigilance})`} niveau={niveau}>
        <Row label="Vitesse" value={`${vitesse.toFixed(1)} pts/mois`} tone={vitesse < -2 ? 'text-danger' : vitesse < 0 ? 'text-warning' : 'text-success'} />
        <p className="text-foreground/70 leading-snug">{vitesse < -2 ? 'Dégradation rapide' : vitesse < 0 ? 'Dégradation lente' : vitesse > 1 ? 'Amélioration' : 'Stabilité'}</p>
      </Block>
    )
  }

  // ── Stress système ──
  if (profil.system_stress && profil.system_stress.score !== undefined) {
    const ss = profil.system_stress
    const niveau: Niveau = ss.niveau_stress === 'critique' ? 'danger' : ss.niveau_stress === 'eleve' ? 'warning' : ss.niveau_stress === 'modere' ? 'primary' : 'success'
    blocs.push(
      <Block key="stress" titre={`Stress système (${ss.niveau_stress})`} niveau={niveau}>
        <Row label="Score" value={`${ss.score}/100`} tone={ss.niveau_stress === 'critique' ? 'text-danger' : ss.niveau_stress === 'eleve' ? 'text-warning' : ''} />
        {ss.recommandation && <p className="text-foreground/70 leading-snug">{ss.recommandation}</p>}
      </Block>
    )
  }

  // ── Alerte proactive ──
  if (profil.proactive_alert) {
    const pa = profil.proactive_alert
    const niveau: Niveau = pa.niveau_urgence === 'critique' ? 'danger' : pa.niveau_urgence === 'alerte' ? 'warning' : pa.niveau_urgence === 'vigilance' ? 'primary' : 'success'
    blocs.push(
      <Block key="alerte" titre={`Alerte proactive (${pa.niveau_urgence})`} niveau={niveau}>
        {pa.message_court && <p className="text-foreground/70 leading-snug">{pa.message_court}</p>}
      </Block>
    )
  }

  // ── Prédiction incidents ──
  if (profil.incident_prediction_3m !== undefined) {
    const p3 = (profil.incident_prediction_3m ?? 0) / 100
    const niveau: Niveau = p3 > 0.5 ? 'danger' : p3 > 0.3 ? 'warning' : 'success'
    blocs.push(
      <Block key="pred" titre="Prédiction incidents" niveau={niveau}>
        <Row label="Probabilité 3 mois" value={`${(p3 * 100).toFixed(0)}%`} tone={p3 > 0.5 ? 'text-danger' : p3 > 0.3 ? 'text-warning' : ''} />
      </Block>
    )
  }

  // ── Infrastructure ──
  if (profil.infrastructure) {
    const inf = profil.infrastructure
    blocs.push(
      <Block key="infra" titre="Infrastructure" niveau="primary">
        <Row label="Type d'entité" value={inf.type_entite.replace(/_/g, ' ')} />
        <Row label="Catégorie SSLIA" value={inf.categorie_sslia} />
        {inf.horaires && <Row label="Horaires" value={inf.horaires === 'h24' ? 'H24' : 'Jour'} />}
      </Block>
    )
  }

  if (blocs.length === 0) return null

  return (
    <details className="text-sm pt-2 border-t border-border">
      <summary className="cursor-pointer font-medium text-foreground text-xs flex items-center gap-1.5">
        <Brain className="w-3 h-3 text-role-primary" />
        Détails avancés des modèles
      </summary>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">{blocs}</div>
    </details>
  )
}
