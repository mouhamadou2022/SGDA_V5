'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Activity, AlertTriangle, Brain, Network, Share2, Target, Timer, ArrowRight, CircleDot, Loader2, Sparkles } from 'lucide-react'
import type { ProfilRisque, Ecart, EvenementSecurite } from '@/lib/store'
import type { RandomForestModelStored } from '@/lib/store/models'
import type { ModeleAnalyse } from '@/lib/ia/modelSelector'
import { expliquerBayesEnClair, CRITERE_INDICE, pctBayes, type BayesExplication } from '@/lib/ia/bayesExplicationIA'

// Composant de rendu des analyses des modèles ML avancés (HMM, survie, EVT,
// copulas, Thompson Sampling, bayésien, Random Forest). Chaque carte est
// 100% data-driven : elle lit les métriques réellement persistées au profil.

type ModeleML = Exclude<ModeleAnalyse, 'bowtie' | 'fta' | 'amdec'>

const LABELS_ACTION: Record<string, string> = {
  audit_complet: 'Audit complet',
  maintien: 'Maintien',
  periodique: 'Périodique',
  suivi_ecarts: 'Suivi des écarts',
}

const LABEL_NIVEAU: Record<string, string> = {
  critique: 'Critique',
  eleve: 'Élevé',
  moyen: 'Moyen',
  faible: 'Faible',
}

function badgeNiveau(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'badge danger'
    case 'eleve': return 'badge warning'
    case 'moyen': return 'badge teal'
    default: return 'badge success'
  }
}

function etatHmmClasse(etat: string): string {
  if (etat === 'critique') return 'text-danger'
  if (etat === 'dégradation' || etat === 'degradation') return 'text-warning'
  return 'text-success'
}

interface Props {
  modele: ModeleML
  profil: ProfilRisque
  rfModelInfo?: RandomForestModelStored | null
  predictionRF?: { prediction: string; confidence: number } | null
  evenements?: EvenementSecurite[]
  ecarts?: Ecart[]
}

export function ModeleMLAnalysis({ modele, profil, rfModelInfo, predictionRF, evenements, ecarts }: Props) {
  switch (modele) {
    case 'hmm': {
      const hmm = profil.hmm_state
      if (!hmm) return null
      return (
        <Card variant="level" levelColor={hmm.isTransitioning ? 'danger' : hmm.transitionRisk > 50 ? 'warning' : 'success'} heading="HMM — Chaîne de Markov cachée" icon={<Activity className="w-5 h-5" />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-foreground">
                État courant : <strong className={etatHmmClasse(hmm.currentStateName)}>{hmm.currentStateName}</strong>
              </span>
              <span className={hmm.isTransitioning ? 'badge danger animate-pulse' : 'badge success'}>
                {hmm.isTransitioning ? 'Transition en cours' : 'Régime stable'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 rounded-lg border border-border bg-muted/10">
                <span className="text-xs text-foreground/70">Risque de transition</span>
                <p className={`text-lg font-bold mt-1 ${hmm.transitionRisk > 50 ? 'text-warning' : 'text-foreground'}`}>{Math.round(hmm.transitionRisk)}%</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/10">
                <span className="text-xs text-foreground/70">Délai avant état critique</span>
                <p className={`text-lg font-bold mt-1 ${hmm.daysToCritical > 0 && hmm.daysToCritical < 90 ? 'text-danger' : 'text-foreground'}`}>
                  {hmm.daysToCritical > 0 ? `${hmm.daysToCritical} j` : 'Non estimé'}
                </p>
              </div>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {hmm.isTransitioning
                ? `Le modèle HMM détecte un glissement silencieux vers un état dégradé : agir avant J-${hmm.daysToCritical}.`
                : `Le régime est stable mais le risque de transition reste de ${Math.round(hmm.transitionRisk)}% — surveiller la tendance des scores.`}
            </p>
          </div>
        </Card>
      )
    }

    case 'survie': {
      const surv = profil.survival_metrics
      if (!surv) return null
      const hazard90 = Math.round(surv.hazard90d * 100)
      return (
        <Card variant="level" levelColor={surv.hazard90d > 0.5 ? 'danger' : surv.hazard90d > 0.3 ? 'warning' : 'success'} heading="Analyse de survie — délai avant incident" icon={<Timer className="w-5 h-5" />}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg border border-border bg-muted/10">
              <span className="text-xs text-foreground/70">Hazard 90 jours</span>
              <p className={`text-lg font-bold mt-1 ${surv.hazard90d > 0.5 ? 'text-danger' : surv.hazard90d > 0.3 ? 'text-warning' : 'text-foreground'}`}>{hazard90}%</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/10">
              <span className="text-xs text-foreground/70">Hazard 180 jours</span>
              <p className="text-lg font-bold mt-1 text-foreground">{Math.round(surv.hazard180d * 100)}%</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/10">
              <span className="text-xs text-foreground/70">Médiane avant incident</span>
              <p className={`text-lg font-bold mt-1 ${surv.medianDays > 0 && surv.medianDays < 100 ? 'text-warning' : 'text-success'}`}>{surv.medianDays} j</p>
            </div>
          </div>
          <p className="text-sm text-foreground leading-relaxed mt-4">
            {surv.hazard90d > 0.5
              ? `Probabilité d'incident à 90 jours estimée à ${hazard90}% : inspection préventive recommandée.`
              : `Risque d'incident à 90 jours modéré (${hazard90}%) — chaque PAC soumis réduit ce risque.`}
          </p>
        </Card>
      )
    }

    case 'evt': {
      const evt = profil.extreme_risk
      if (!evt) return null
      const tail = Math.round(evt.tailRisk * 100)
      return (
        <Card variant="level" levelColor={evt.isHeavyTailed ? 'danger' : 'warning'} heading="Théorie des valeurs extrêmes (EVT)" icon={<AlertTriangle className="w-5 h-5" />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-foreground">
                Probabilité d&apos;événement extrême : <strong className={evt.isHeavyTailed ? 'text-danger' : 'text-warning'}>{tail}%</strong>
              </span>
              <span className={evt.isHeavyTailed ? 'badge danger' : 'badge success'}>
                {evt.isHeavyTailed ? 'Queue lourde' : 'Queue normale'}
              </span>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/10">
              <span className="text-xs text-foreground/70">Maximum attendu sur 12 mois</span>
              <p className="text-lg font-bold mt-1 text-foreground">{evt.maxExpected12m} incidents</p>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {evt.isHeavyTailed
                ? 'Distribution à queue lourde : les événements extrêmes sont significativement plus fréquents que la normale — préparer un plan d\'urgence.'
                : 'Le risque extrême est modéré mais nécessite une préparation (maximum attendu sur 12 mois pris en compte).'}
            </p>
          </div>
        </Card>
      )
    }

    case 'copula': {
      const copula = profil.copula_metrics
      if (!copula) return null
      const dependance = Math.round(copula.maxTailDependence * 100)
      const worst = Math.round(copula.worstCaseProbability * 100)
      return (
        <Card variant="level" levelColor={copula.maxTailDependence > 0.6 ? 'danger' : 'warning'} heading="Copulas — dépendance de queue" icon={<Share2 className="w-5 h-5" />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 rounded-lg border border-border bg-muted/10">
              <span className="text-xs text-foreground/70">Dépendance maximale de queue</span>
              <p className={`text-lg font-bold mt-1 ${copula.maxTailDependence > 0.6 ? 'text-danger' : 'text-warning'}`}>{dependance}%</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/10">
              <span className="text-xs text-foreground/70">Probabilité du scénario pire cas</span>
              <p className="text-lg font-bold mt-1 text-foreground">{worst}%</p>
            </div>
          </div>
          {copula.worstCaseDescription && (
            <p className="text-sm text-foreground leading-relaxed mt-4 italic">
              Pire cas modélisé : {copula.worstCaseDescription}
            </p>
          )}
          <p className="text-sm text-foreground leading-relaxed mt-2">
            {copula.maxTailDependence > 0.6
              ? 'Forte corrélation dans les extrêmes : une défaillance critique dans un domaine risque d\'en entraîner d\'autres.'
              : 'Corrélation modérée : les domaines sont partiellement liés en situation de stress.'}
          </p>
        </Card>
      )
    }

    case 'thompson': {
      const ts = profil.ts_metrics
      if (!ts) return null
      const confiance = Math.round(ts.bestProbability)
      return (
        <Card variant="level" levelColor={confiance > 60 ? 'success' : 'primary'} heading="Thompson Sampling — action de surveillance" icon={<Target className="w-5 h-5" />}>
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-sm text-foreground">
                Action recommandée : <strong className="text-role-primary">{LABELS_ACTION[ts.recommendedAction] ?? ts.recommendedAction}</strong>
              </span>
              <span className="badge primary">Confiance {confiance}%</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              L&apos;algorithme Thompson Sampling balance exploration / exploitation sur l&apos;historique des surveillances pour recommander
              l&apos;action la plus efficace pour cet aérodrome.
            </p>
          </div>
        </Card>
      )
    }

    case 'bayes':
      return <BayesAnalyseCard profil={profil} ecarts={ecarts} evenements={evenements} />

    case 'rf': {
      if (!rfModelInfo) return null
      const topFeatures = Object.entries(rfModelInfo.feature_importance ?? {})
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3)
      const prediction = predictionRF?.prediction
      return (
        <Card variant="level" levelColor={rfModelInfo.accuracy >= 0.7 ? 'success' : 'primary'} heading="Random Forest — prédiction du niveau de risque" icon={<Network className="w-5 h-5" />}>
          <div className="space-y-3">
            {prediction && (
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-sm text-foreground">Niveau prédit pour ce profil</span>
                <span className={badgeNiveau(prediction)}>{LABEL_NIVEAU[prediction] ?? prediction}</span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg border border-border bg-muted/10">
                <span className="text-xs text-foreground/70">Précision</span>
                <p className="text-lg font-bold mt-1 text-success">{Math.round(rfModelInfo.accuracy * 100)}%</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/10">
                <span className="text-xs text-foreground/70">Échantillons</span>
                <p className="text-lg font-bold mt-1 text-foreground">{rfModelInfo.training_samples}</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/10">
                <span className="text-xs text-foreground/70">Version</span>
                <p className="text-lg font-bold mt-1 text-foreground">v{rfModelInfo.version}</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/10">
                <span className="text-xs text-foreground/70">Entraîné le</span>
                <p className="text-sm font-semibold mt-1 text-foreground">{new Date(rfModelInfo.trained_at).toLocaleDateString('fr-FR')}</p>
              </div>
            </div>
            {topFeatures.length > 0 && (
              <div>
                <span className="text-sm font-semibold text-foreground">Facteurs déterminants :</span>
                <div className="mt-2 space-y-1.5">
                  {topFeatures.map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-sm text-foreground">
                      <span className="flex-1 capitalize">{k.replace(/_/g, ' ')}</span>
                      <span className="w-24 bg-muted rounded-full h-1.5">
                        <span className="block h-1.5 rounded-full bg-role-primary" style={{ width: `${Math.min(100, (v as number) * 100)}%` }} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-sm text-foreground leading-relaxed">
              Modèle entraîné sur {rfModelInfo.training_samples} échantillons réels (précision {Math.round(rfModelInfo.accuracy * 100)}%) — géré depuis le module ML Monitoring.
            </p>
          </div>
        </Card>
      )
    }

    default:
      return null
  }
}

/**
 * Carte bayésienne : la chaîne numérique (a priori → indices → a posteriori)
 * est rendue depuis les données réelles ; le texte explicatif (mécanique,
 * interprétation, actions) est généré par l'IA avec fallback déterministe.
 */
function BayesAnalyseCard({ profil, ecarts, evenements }: { profil: ProfilRisque; ecarts?: Ecart[]; evenements?: EvenementSecurite[] }) {
  const { bayesian_prior, bayesian_posterior, bayesian_black_swan } = profil
  const [explication, setExplication] = useState<BayesExplication | null>(null)
  const [enCours, setEnCours] = useState(true)
  const now = useState(() => Date.now())[0]
  const [prevProfil, setPrevProfil] = useState(profil)
  if (prevProfil !== profil) {
    setPrevProfil(profil)
    setEnCours(true)
    setExplication(null)
  }

  useEffect(() => {
    let actif = true
    expliquerBayesEnClair({ profil, ecarts: ecarts ?? [], evenements }).then((res) => {
      if (!actif) return
      setExplication(res)
      setEnCours(false)
    }).catch(() => {
      if (!actif) return
      setEnCours(false)
    })
    return () => { actif = false }
  }, [profil, ecarts, evenements])

  if (bayesian_posterior == null) return null
  const prior = pctBayes(bayesian_prior)
  const post = pctBayes(bayesian_posterior)
  if (post == null) return null
  const delta = prior != null ? post - prior : null
  const hausse = delta != null && delta > 0

  const indices = (['c1', 'c2', 'c3', 'c4', 'c5'] as const)
    .filter((c) => (profil[c] ?? 0) < 40)
    .map((c) => ({ ...CRITERE_INDICE[c], score: profil[c] }))
  const nbEvenements = evenements?.length ?? 0
  const dernierEvent = evenements && evenements.length > 0
    ? evenements.reduce((max, e) => (new Date(e.date) > max ? new Date(e.date) : max), new Date(0))
    : null
  const moisSansIncident = dernierEvent
    ? Math.max(0, Math.round((now - dernierEvent.getTime()) / (30 * 86400000)))
    : null

  const texte = explication ?? {
    explication: '',
    interpretation: '',
    actions: [] as string[],
    fallbackIA: true,
  }

  return (
    <Card
      variant="level"
      levelColor={bayesian_black_swan || hausse ? 'danger' : 'success'}
      heading="Analyse bayésienne — de l'indice au risque"
      icon={<Brain className="w-5 h-5" />}
      badge={
        enCours ? (
          <span className="inline-flex items-center gap-2 text-xs text-primary">
            <Loader2 className="w-4 h-4 animate-spin" /> Analyse IA en cours…
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full ${texte.fallbackIA ? 'text-foreground/70 bg-muted' : 'text-primary bg-primary/10'}`}>
            {!texte.fallbackIA && <Sparkles className="w-3.5 h-3.5" />}
            {texte.fallbackIA ? 'Analyse déterministe' : 'Langage clair AERORISQ'}
          </span>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-foreground leading-relaxed">
          {texte.explication || "La probabilité de défaillance est révisée dès qu'un indice arrive : A PRIORI (départ) → indice observé → A POSTERIORI (révisée)."}
        </p>

        {/* Chaîne bayésienne */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 rounded-xl border border-border bg-muted/10 p-4">
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
              <CircleDot className="w-3.5 h-3.5 text-primary" /> A priori
            </div>
            <p className={`text-2xl font-bold mt-1 ${hausse ? 'text-foreground' : 'text-success'}`}>{prior != null ? `${prior}%` : '—'}</p>
            <p className="text-[11px] text-foreground/60 mt-0.5">Probabilité de départ (historique)</p>
          </div>
          <ArrowRight className="w-5 h-5 text-foreground/40 hidden sm:block" />
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
              <Activity className="w-3.5 h-3.5 text-warning" /> Indices observés
            </div>
            <p className="text-2xl font-bold mt-1 text-warning">{indices.length + (nbEvenements > 0 ? 1 : 0)}</p>
            <p className="text-[11px] text-foreground/60 mt-0.5">
              {indices.length} critère{indices.length !== 1 ? 's' : ''} dégradé{indices.length !== 1 ? 's' : ''}
              {nbEvenements > 0 ? ` · ${nbEvenements} événement${nbEvenements > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-foreground/40 hidden sm:block" />
          <div className="text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground/70">
              <Brain className="w-3.5 h-3.5 text-danger" /> A posteriori
            </div>
            <p className={`text-2xl font-bold mt-1 ${hausse || bayesian_black_swan ? 'text-danger' : 'text-success'}`}>{post}%</p>
            <p className="text-[11px] text-foreground/60 mt-0.5">Probabilité révisée</p>
          </div>
        </div>

        {/* Indices observés détaillés */}
        {indices.length > 0 && (
          <div>
            <span className="text-sm font-semibold text-foreground">Indices observés sur cet aérodrome :</span>
            <ul className="mt-2 space-y-1.5">
              {indices.map((i) => (
                <li key={i.label} className="text-sm text-foreground flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2">
                  <span className="flex items-start gap-2">
                    <span className="text-warning mt-0.5 shrink-0">•</span>
                    <span>{i.label} — {i.signal} (score {i.score}/100)</span>
                  </span>
                  <span className="badge warning shrink-0">vraisemblance {Math.round(i.likelihood * 100)}%</span>
                </li>
              ))}
              {nbEvenements > 0 && (
                <li className="text-sm text-foreground flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/10 px-3 py-2">
                  <span className="flex items-start gap-2">
                    <span className="text-warning mt-0.5 shrink-0">•</span>
                    <span>{nbEvenements} événement{nbEvenements > 1 ? 's' : ''} sur la période{moisSansIncident != null ? ` (${moisSansIncident} mois sans incident)` : ''}</span>
                  </span>
                  <span className="badge warning shrink-0">vraisemblance 50%</span>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Interprétation IA (fallback déterministe sinon) */}
        {texte.interpretation && (
          <div className={`rounded-lg border p-3 ${hausse || bayesian_black_swan ? 'border-danger/30 bg-danger/5' : 'border-success/30 bg-success/5'}`}>
            <p className="text-sm text-foreground leading-relaxed">{texte.interpretation}</p>
            {bayesian_black_swan && (
              <p className="text-sm text-danger mt-2 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> Signal cygne noir : la révision dépasse le seuil — risque de défaillance soudaine et disproportionnée.
              </p>
            )}
          </div>
        )}

        {/* Actions IA */}
        {texte.actions.length > 0 && (
          <div>
            <span className="text-sm font-semibold text-foreground">Actions à engager :</span>
            <ul className="mt-2 space-y-1">
              {texte.actions.map((a, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-role-primary mt-1.5 shrink-0">•</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  )
}
