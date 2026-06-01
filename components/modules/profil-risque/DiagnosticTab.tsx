'use client'

import { ProfilRisque, Ecart } from '@/lib/store'
import { AlertTriangle, Shield, Activity, Zap, BarChart3 } from 'lucide-react'
import BowTieAnalyzer from './BowTieAnalyzer'
import { OACIMatrixSection } from './OACIMatrixSection'
import { CorrelationSection } from './CorrelationSection'

type Niveau = 'critique' | 'eleve' | 'moyen' | 'faible'

function getNiveau(score: number): Niveau {
  if (score >= 80) return 'faible'
  if (score >= 60) return 'moyen'
  if (score >= 30) return 'eleve'
  return 'critique'
}

function getBorderColor(n: Niveau): string {
  switch (n) {
    case 'critique': return 'border-l-danger'
    case 'eleve': return 'border-l-warning'
    case 'moyen': return 'border-l-primary'
    case 'faible': return 'border-l-success'
  }
}

function getBgSoft(n: Niveau): string {
  switch (n) {
    case 'critique': return 'bg-danger-soft'
    case 'eleve': return 'bg-warning-soft'
    case 'moyen': return 'bg-primary-soft'
    case 'faible': return 'bg-success-soft'
  }
}

function getTextColor(n: Niveau): string {
  switch (n) {
    case 'critique': return 'text-danger'
    case 'eleve': return 'text-warning'
    case 'moyen': return 'text-primary'
    case 'faible': return 'text-success'
  }
}

function getProgressColor(n: Niveau): string {
  switch (n) {
    case 'critique': return 'bg-danger'
    case 'eleve': return 'bg-warning'
    case 'moyen': return 'bg-primary'
    case 'faible': return 'bg-success'
  }
}

function getBadgeClass(n: Niveau): string {
  switch (n) {
    case 'critique': return 'badge danger'
    case 'eleve': return 'badge warning'
    case 'moyen': return 'badge primary'
    case 'faible': return 'badge success'
  }
}

function getNiveauLabel(n: Niveau): string {
  switch (n) {
    case 'critique': return 'Critique'
    case 'eleve': return 'Élevé'
    case 'moyen': return 'Moyen'
    case 'faible': return 'Faible'
  }
}

const CRITERES = [
  { key: 'c1' as const, label: 'Maturité SGS', weight: 20, desc: 'Solidité du Système de Gestion de la Sécurité : politiques, documentation, formation et culture sécurité.' },
  { key: 'c2' as const, label: 'Efficacité PAC', weight: 20, desc: 'Taux de mise en œuvre et efficacité des Plans d\'Actions Correctives suite aux audits.' },
  { key: 'c3' as const, label: 'Conformité technique', weight: 20, desc: 'Respect des exigences réglementaires : infrastructures, équipements et aides visuelles.' },
  { key: 'c4' as const, label: 'Charge critique non résolue', weight: 15, desc: 'Volume d\'écarts critiques et majeurs en souffrance — alourdit le risque opérationnel.' },
  { key: 'c5' as const, label: 'Résilience & Historique', weight: 25, desc: 'Historique d\'incidents, capacité de résilience et récurrence des événements.' },
]

interface DiagnosticTabProps {
  profil: ProfilRisque
  surveillances: any[]
  ecarts: Ecart[]
  evenementsCount: number
}

export function DiagnosticTab({ profil, surveillances, ecarts, evenementsCount }: DiagnosticTabProps) {
  const niveauGlobal = getNiveau(profil.score_global)
  const scenarioCatastrophe = profil.scenarios?.[3]

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border-l-4 ${getBorderColor(niveauGlobal)} ${getBgSoft(niveauGlobal)} p-4`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Shield className={`w-5 h-5 ${getTextColor(niveauGlobal)}`} />
            <span className="text-sm font-semibold text-foreground">Diagnostic du niveau de risque</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              {surveillances.length} surveillance{surveillances.length !== 1 ? 's' : ''} · {evenementsCount} événement{evenementsCount !== 1 ? 's' : ''}
            </span>
            <span className={`${getBadgeClass(niveauGlobal)} text-xs`}>
              {getNiveauLabel(niveauGlobal)} — {profil.score_global}/100
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Détail par critère</span>
        </div>
        <div className="space-y-3">
          {CRITERES.map(c => {
            const score = profil[c.key]
            const niv = getNiveau(score)
            return (
              <div key={c.key} className={`rounded border-l-4 ${getBorderColor(niv)} p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">
                    {c.key.toUpperCase()} — {c.label}
                    <span className="text-muted-foreground ml-1">({c.weight}&nbsp;%)</span>
                  </span>
                  <span className={`text-xs font-bold ${getTextColor(niv)}`}>{score}/100</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 mb-1">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressColor(niv)}`}
                    style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{c.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {profil.infrastructure && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Facteurs infrastructure</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-xs text-muted-foreground">Type d&apos;entité</span>
              <p className="text-xs font-medium text-foreground mt-0.5">{profil.infrastructure.type_entite}</p>
            </div>
            {profil.infrastructure.horaires && (
              <div>
                <span className="text-xs text-muted-foreground">Horaires</span>
                <p className="text-xs font-medium text-foreground mt-0.5">
                  {profil.infrastructure.horaires === 'h24' ? 'H24' : 'Jour'}
                </p>
              </div>
            )}
            <div>
              <span className="text-xs text-muted-foreground">Type</span>
              <p className="text-xs font-medium text-foreground mt-0.5">
                {profil.infrastructure.type === 'international' ? 'International' : 'National'}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Catégorie SSLI</span>
              <p className="text-xs font-medium text-foreground mt-0.5">{profil.infrastructure.categorie_sslia}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            {profil.infrastructure.type === 'international'
              ? 'Aérodrome international : exigences renforcées (OACI Annexe 14), trafic plus dense, surveillance accrue.'
              : 'Aérodrome national : exigences standard OACI adaptées au trafic domestique.'}
            {profil.infrastructure.horaires === 'h24' && ' L\'exploitation H24 augmente l\'exposition au risque et requiert des moyens permanents.'}
          </p>
        </div>
      )}

      {profil.copula_metrics && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-warning" />
            <span className="text-sm font-semibold text-foreground">Dépendance entre critères</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Dépendance entre critères&nbsp;: {Math.round(profil.copula_metrics.maxTailDependence * 100)}&nbsp;%.
            Les domaines sont liés — une dégradation de l&apos;un affecte les autres.
          </p>
          {profil.copula_metrics.worstCaseDescription && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              Pire cas&nbsp;: {profil.copula_metrics.worstCaseDescription}
            </p>
          )}
        </div>
      )}

      {profil.negbin_metrics && profil.negbin_metrics.isOverdispersed && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Variabilité des incidents</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Forte variabilité des incidents détectée — le nombre d&apos;incidents fluctue par grappes.
          </p>
          {profil.negbin_metrics.dispersion != null && (
            <p className="text-xs text-muted-foreground mt-1">
              Dispersion&nbsp;: {profil.negbin_metrics.dispersion.toFixed(2)} · Moyenne&nbsp;: {profil.negbin_metrics.mean?.toFixed(1)} · Variance&nbsp;: {profil.negbin_metrics.variance?.toFixed(1)}
            </p>
          )}
        </div>
      )}

      {profil.bayesian_black_swan && (
        <div className="rounded-lg border-l-4 border-l-danger bg-danger-soft p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-danger animate-pulse" />
            <span className="text-sm font-semibold text-danger">Alerte Cygne Noir</span>
          </div>
          <p className="text-xs text-danger mt-2 leading-relaxed">
            Le modèle bayésien détecte un risque de type «&nbsp;cygne noir&nbsp;» — un événement rare mais à impact catastrophique pourrait survenir. Renforcement urgent de la surveillance recommandé.
          </p>
        </div>
      )}

      {(profil.bayesian_posterior != null || profil.bayesian_prior != null) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Analyse bayésienne</span>
          </div>
          <div className="flex items-start gap-6">
            {profil.bayesian_prior != null && (
              <div>
                <span className="text-xs text-muted-foreground">Probabilité a priori</span>
                <p className={`text-sm font-bold ${getTextColor(getNiveau(profil.bayesian_prior))}`}>
                  {profil.bayesian_prior}&nbsp;%
                </p>
                <p className="text-xs text-muted-foreground">Estimation initiale basée sur le profil type</p>
              </div>
            )}
            {profil.bayesian_posterior != null && (
              <div>
                <span className="text-xs text-muted-foreground">Probabilité a posteriori</span>
                <p className={`text-sm font-bold ${getTextColor(getNiveau(profil.bayesian_posterior))}`}>
                  {profil.bayesian_posterior}&nbsp;%
                </p>
                <p className="text-xs text-muted-foreground">Mise à jour avec les données observées</p>
              </div>
            )}
          </div>
          {profil.bayesian_prior != null && profil.bayesian_posterior != null && (
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              {profil.bayesian_posterior > profil.bayesian_prior
                ? `La probabilité a posteriori (${profil.bayesian_posterior}&nbsp;%) est supérieure à l&apos;a priori (${profil.bayesian_prior}&nbsp;%) : les observations récentes indiquent une dégradation.`
                : profil.bayesian_posterior < profil.bayesian_prior
                  ? `La probabilité a posteriori (${profil.bayesian_posterior}&nbsp;%) est inférieure à l&apos;a priori (${profil.bayesian_prior}&nbsp;%) : les observations récentes sont rassurantes.`
                  : `La probabilité est stable entre l&apos;a priori et l&apos;a posteriori (${profil.bayesian_posterior}&nbsp;%).`}
            </p>
          )}
        </div>
      )}

      {scenarioCatastrophe && (
        <div className="rounded-lg border-l-4 border-l-danger bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-danger" />
            <span className="text-sm font-semibold text-danger">Scénario pire cas&nbsp;: {scenarioCatastrophe.nom}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{scenarioCatastrophe.description}</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <span className="text-xs text-muted-foreground">Score projeté</span>
              <p className={`text-sm font-bold ${getTextColor(getNiveau(scenarioCatastrophe.scoreProjecte))}`}>
                {scenarioCatastrophe.scoreProjecte}/100
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Probabilité</span>
              <p className="text-sm font-bold text-foreground">{(scenarioCatastrophe.probabilite * 100).toFixed(1)}&nbsp;%</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Intervalle de confiance</span>
              <p className="text-xs text-foreground">
                [{scenarioCatastrophe.intervalleConfiance[0].toFixed(1)}% – {scenarioCatastrophe.intervalleConfiance[1].toFixed(1)}%]
              </p>
            </div>
          </div>
          {scenarioCatastrophe.actionsRecommandees.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Actions recommandées&nbsp;:</span>
              <ul className="mt-1 space-y-0.5">
                {scenarioCatastrophe.actionsRecommandees.map((a, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                    <span className="text-danger mt-0.5 shrink-0">•</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {profil.copula_metrics && profil.copula_metrics.maxTailDependence != null && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Force de dépendance</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${profil.copula_metrics.maxTailDependence > 0.6 ? 'bg-danger' : profil.copula_metrics.maxTailDependence > 0.3 ? 'bg-warning' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, profil.copula_metrics.maxTailDependence * 100)}%` }}
                />
              </div>
            </div>
            <span className={`text-xs font-bold ${profil.copula_metrics.maxTailDependence > 0.6 ? 'text-danger' : profil.copula_metrics.maxTailDependence > 0.3 ? 'text-warning' : 'text-primary'}`}>
              {(profil.copula_metrics.maxTailDependence * 100).toFixed(0)}&nbsp;%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Dépendance de queue maximale entre domaines —{' '}
            {profil.copula_metrics.maxTailDependence > 0.6
              ? 'forte corrélation dans les extrêmes : une défaillance critique dans un domaine risque d\'en entraîner d\'autres.'
              : profil.copula_metrics.maxTailDependence > 0.3
                ? 'corrélation modérée : les domaines sont partiellement liés en situation de stress.'
                : 'faible corrélation : les domaines évoluent de façon relativement indépendante.'}
          </p>
        </div>
      )}

      {/* Bow-Tie — Analyse complète data-driven */}
      <BowTieAnalyzer profil={profil} ecarts={ecarts} surveillances={surveillances} />

      {/* Matrice OACI 5×5 */}
      <OACIMatrixSection profil={profil} ecarts={ecarts} surveillances={surveillances} />

      {/* Corrélations C1-C5 + Copulas */}
      <CorrelationSection profil={profil} />
    </div>
  )
}
