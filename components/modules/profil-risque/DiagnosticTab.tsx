'use client'

import { ProfilRisque } from '@/lib/store'
import { AlertTriangle, Shield, Activity, Zap, BarChart3 } from 'lucide-react'

type Niveau = 'critique' | 'eleve' | 'moyen' | 'faible'

function getNiveau(score: number): Niveau {
  if (score >= 80) return 'faible'
  if (score >= 60) return 'moyen'
  if (score >= 30) return 'eleve'
  return 'critique'
}

function getBorderColor(n: Niveau): string {
  switch (n) {
    case 'critique': return 'border-l-red-500'
    case 'eleve': return 'border-l-orange-500'
    case 'moyen': return 'border-l-blue-500'
    case 'faible': return 'border-l-green-500'
  }
}

function getBgSoft(n: Niveau): string {
  switch (n) {
    case 'critique': return 'bg-red-50'
    case 'eleve': return 'bg-orange-50'
    case 'moyen': return 'bg-blue-50'
    case 'faible': return 'bg-green-50'
  }
}

function getTextColor(n: Niveau): string {
  switch (n) {
    case 'critique': return 'text-red-700'
    case 'eleve': return 'text-orange-700'
    case 'moyen': return 'text-blue-700'
    case 'faible': return 'text-green-700'
  }
}

function getProgressColor(n: Niveau): string {
  switch (n) {
    case 'critique': return 'bg-red-500'
    case 'eleve': return 'bg-orange-500'
    case 'moyen': return 'bg-blue-500'
    case 'faible': return 'bg-green-500'
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
  evenementsCount: number
}

export function DiagnosticTab({ profil, surveillances, evenementsCount }: DiagnosticTabProps) {
  const niveauGlobal = getNiveau(profil.score_global)
  const scenarioCatastrophe = profil.scenarios?.[3]

  return (
    <div className="space-y-4">
      <div className={`rounded-lg border-l-4 ${getBorderColor(niveauGlobal)} ${getBgSoft(niveauGlobal)} p-4`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Shield className={`w-5 h-5 ${getTextColor(niveauGlobal)}`} />
            <span className="text-sm font-semibold text-gray-800">Diagnostic du niveau de risque</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {surveillances.length} surveillance{surveillances.length !== 1 ? 's' : ''} · {evenementsCount} événement{evenementsCount !== 1 ? 's' : ''}
            </span>
            <span className={`${getBadgeClass(niveauGlobal)} text-xs`}>
              {getNiveauLabel(niveauGlobal)} — {profil.score_global}/100
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Détail par critère</span>
        </div>
        <div className="space-y-3">
          {CRITERES.map(c => {
            const score = profil[c.key]
            const niv = getNiveau(score)
            return (
              <div key={c.key} className={`rounded border-l-4 ${getBorderColor(niv)} p-3`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">
                    {c.key.toUpperCase()} — {c.label}
                    <span className="text-gray-400 ml-1">({c.weight}&nbsp;%)</span>
                  </span>
                  <span className={`text-xs font-bold ${getTextColor(niv)}`}>{score}/100</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressColor(niv)}`}
                    style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{c.desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {profil.infrastructure && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Facteurs infrastructure</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-xs text-gray-400">Type d&apos;entité</span>
              <p className="text-xs font-medium text-gray-700 mt-0.5">{profil.infrastructure.type_entite}</p>
            </div>
            {profil.infrastructure.horaires && (
              <div>
                <span className="text-xs text-gray-400">Horaires</span>
                <p className="text-xs font-medium text-gray-700 mt-0.5">
                  {profil.infrastructure.horaires === 'h24' ? 'H24' : 'Jour'}
                </p>
              </div>
            )}
            <div>
              <span className="text-xs text-gray-400">Type</span>
              <p className="text-xs font-medium text-gray-700 mt-0.5">
                {profil.infrastructure.type === 'international' ? 'International' : 'National'}
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-400">Catégorie SSLI</span>
              <p className="text-xs font-medium text-gray-700 mt-0.5">{profil.infrastructure.categorie_sslia}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">
            {profil.infrastructure.type === 'international'
              ? 'Aérodrome international : exigences renforcées (OACI Annexe 14), trafic plus dense, surveillance accrue.'
              : 'Aérodrome national : exigences standard OACI adaptées au trafic domestique.'}
            {profil.infrastructure.horaires === 'h24' && ' L\'exploitation H24 augmente l\'exposition au risque et requiert des moyens permanents.'}
          </p>
        </div>
      )}

      {profil.copula_metrics && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-gray-700">Dépendance entre critères</span>
          </div>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            Dépendance entre critères&nbsp;: {Math.round(profil.copula_metrics.maxTailDependence * 100)}&nbsp;%.
            Les domaines sont liés — une dégradation de l&apos;un affecte les autres.
          </p>
          {profil.copula_metrics.worstCaseDescription && (
            <p className="text-xs text-gray-400 mt-1 italic">
              Pire cas&nbsp;: {profil.copula_metrics.worstCaseDescription}
            </p>
          )}
        </div>
      )}

      {profil.negbin_metrics && profil.negbin_metrics.isOverdispersed && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-semibold text-gray-700">Variabilité des incidents</span>
          </div>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            Forte variabilité des incidents détectée — le nombre d&apos;incidents fluctue par grappes.
          </p>
          {profil.negbin_metrics.dispersion != null && (
            <p className="text-xs text-gray-400 mt-1">
              Dispersion&nbsp;: {profil.negbin_metrics.dispersion.toFixed(2)} · Moyenne&nbsp;: {profil.negbin_metrics.mean?.toFixed(1)} · Variance&nbsp;: {profil.negbin_metrics.variance?.toFixed(1)}
            </p>
          )}
        </div>
      )}

      {profil.bayesian_black_swan && (
        <div className="rounded-lg border-l-4 border-l-red-500 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 animate-pulse" />
            <span className="text-sm font-semibold text-red-700">Alerte Cygne Noir</span>
          </div>
          <p className="text-xs text-red-600 mt-2 leading-relaxed">
            Le modèle bayésien détecte un risque de type «&nbsp;cygne noir&nbsp;» — un événement rare mais à impact catastrophique pourrait survenir. Renforcement urgent de la surveillance recommandé.
          </p>
        </div>
      )}

      {(profil.bayesian_posterior != null || profil.bayesian_prior != null) && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Analyse bayésienne</span>
          </div>
          <div className="flex items-start gap-6">
            {profil.bayesian_prior != null && (
              <div>
                <span className="text-xs text-gray-400">Probabilité a priori</span>
                <p className={`text-sm font-bold ${getTextColor(getNiveau(profil.bayesian_prior))}`}>
                  {profil.bayesian_prior}&nbsp;%
                </p>
                <p className="text-xs text-gray-400">Estimation initiale basée sur le profil type</p>
              </div>
            )}
            {profil.bayesian_posterior != null && (
              <div>
                <span className="text-xs text-gray-400">Probabilité a posteriori</span>
                <p className={`text-sm font-bold ${getTextColor(getNiveau(profil.bayesian_posterior))}`}>
                  {profil.bayesian_posterior}&nbsp;%
                </p>
                <p className="text-xs text-gray-400">Mise à jour avec les données observées</p>
              </div>
            )}
          </div>
          {profil.bayesian_prior != null && profil.bayesian_posterior != null && (
            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
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
        <div className="rounded-lg border-l-4 border-l-red-500 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700">Scénario pire cas&nbsp;: {scenarioCatastrophe.nom}</span>
          </div>
          <p className="text-xs text-gray-600 mb-3 leading-relaxed">{scenarioCatastrophe.description}</p>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <span className="text-xs text-gray-400">Score projeté</span>
              <p className={`text-sm font-bold ${getTextColor(getNiveau(scenarioCatastrophe.scoreProjecte))}`}>
                {scenarioCatastrophe.scoreProjecte}/100
              </p>
            </div>
            <div>
              <span className="text-xs text-gray-400">Probabilité</span>
              <p className="text-sm font-bold text-gray-700">{(scenarioCatastrophe.probabilite * 100).toFixed(1)}&nbsp;%</p>
            </div>
            <div>
              <span className="text-xs text-gray-400">Intervalle de confiance</span>
              <p className="text-xs text-gray-700">
                [{scenarioCatastrophe.intervalleConfiance[0].toFixed(1)}% – {scenarioCatastrophe.intervalleConfiance[1].toFixed(1)}%]
              </p>
            </div>
          </div>
          {scenarioCatastrophe.actionsRecommandees.length > 0 && (
            <div>
              <span className="text-xs font-medium text-gray-600">Actions recommandées&nbsp;:</span>
              <ul className="mt-1 space-y-0.5">
                {scenarioCatastrophe.actionsRecommandees.map((a, i) => (
                  <li key={i} className="text-xs text-gray-500 flex items-start gap-1">
                    <span className="text-red-400 mt-0.5 shrink-0">•</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {profil.copula_metrics && profil.copula_metrics.maxTailDependence != null && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Force de dépendance</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="w-full bg-gray-100 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${profil.copula_metrics.maxTailDependence > 0.6 ? 'bg-red-500' : profil.copula_metrics.maxTailDependence > 0.3 ? 'bg-orange-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, profil.copula_metrics.maxTailDependence * 100)}%` }}
                />
              </div>
            </div>
            <span className={`text-xs font-bold ${profil.copula_metrics.maxTailDependence > 0.6 ? 'text-red-600' : profil.copula_metrics.maxTailDependence > 0.3 ? 'text-orange-600' : 'text-blue-600'}`}>
              {(profil.copula_metrics.maxTailDependence * 100).toFixed(0)}&nbsp;%
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            Dépendance de queue maximale entre domaines —{' '}
            {profil.copula_metrics.maxTailDependence > 0.6
              ? 'forte corrélation dans les extrêmes : une défaillance critique dans un domaine risque d\'en entraîner d\'autres.'
              : profil.copula_metrics.maxTailDependence > 0.3
                ? 'corrélation modérée : les domaines sont partiellement liés en situation de stress.'
                : 'faible corrélation : les domaines évoluent de façon relativement indépendante.'}
          </p>
        </div>
      )}

      {/* Bow-Tie — Barrières par domaine */}
      {profil.bowtie_metrics && profil.bowtie_metrics.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Bow-Tie — Efficacité des barrières</span>
          </div>
          <div className="space-y-2">
            {profil.bowtie_metrics.map(b => (
              <div key={b.domaine} className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold w-10">{b.domaine}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${b.effectiveness < 40 ? 'bg-red-500' : b.effectiveness < 70 ? 'bg-orange-500' : 'bg-green-500'}`}
                    style={{ width: `${b.effectiveness}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-10 text-right ${b.effectiveness < 40 ? 'text-red-600' : b.effectiveness < 70 ? 'text-orange-600' : 'text-green-600'}`}>
                  {b.effectiveness}%
                </span>
                {b.ecartsCount > 0 && (
                  <span className="badge danger text-xs">{b.ecartsCount} écart(s)</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">
            Efficacité estimée des barrières de défense par domaine. Une barrière faible (&lt;40%) indique un risque de défaillance — renforcer les mesures d'atténuation dans ces domaines.
          </p>
        </div>
      )}

      {/* Bow-Tie — Analyse dangers / barrières / bénéfices */}
      {profil.bowtie_metrics && profil.bowtie_metrics.length > 0 && (
        <div className="card border-border">
          <div className="card-header border-b border-border"><div className="card-title text-sm font-semibold">Analyse Bow-Tie — Dangers, Barrières, Bénéfices</div></div>
          <div className="card-content p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-danger-soft rounded-lg p-3">
                <p className="text-xs font-semibold text-danger uppercase mb-2">Menaces ({profil.bowtie_metrics.filter(b => b.effectiveness < 40).length})</p>
                {profil.bowtie_metrics.filter(b => b.effectiveness < 40).map(b => (
                  <div key={b.domaine} className="flex items-center justify-between text-xs py-1"><span className="font-mono">{b.domaine}</span><span className="text-danger font-bold">{b.effectiveness}%</span></div>
                ))}
                {profil.bowtie_metrics.filter(b => b.effectiveness < 40).length === 0 && <p className="text-xs text-muted-foreground">Aucune menace critique</p>}
                <p className="text-xs text-muted-foreground mt-2">Barriere &lt;40% = defaillance probable</p>
              </div>
              <div className="bg-warning-soft rounded-lg p-3">
                <p className="text-xs font-semibold text-warning uppercase mb-2">Barrières à renforcer ({profil.bowtie_metrics.filter(b => b.effectiveness >= 40 && b.effectiveness < 70).length})</p>
                {profil.bowtie_metrics.filter(b => b.effectiveness >= 40 && b.effectiveness < 70).map(b => (
                  <div key={b.domaine} className="text-xs py-1"><span className="font-mono">{b.domaine}</span> {b.ecartsCount > 0 && <span className="badge warning text-xs ml-1">prioritaire</span>}</div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">Renforcement → gain ~{Math.round(profil.bowtie_metrics.filter(b => b.effectiveness < 70).length * 4)} pts C2</p>
              </div>
              <div className="bg-success-soft rounded-lg p-3">
                <p className="text-xs font-semibold text-success uppercase mb-2">Bénéfices estimés</p>
                <p className="text-sm font-bold text-success">{Math.round(profil.bowtie_metrics.filter(b => b.effectiveness < 70).length / Math.max(1, profil.bowtie_metrics.length) * 100)}% réduction risque</p>
                <p className="text-xs text-muted-foreground mt-1">{profil.bowtie_metrics.filter(b => b.effectiveness < 70).length} domaines à renforcer</p>
                {profil.survival_metrics && <p className="text-xs text-success mt-1">Hazard 90j réduit de ~{Math.round(profil.survival_metrics.hazard90d * 40)}%</p>}
                {profil.bowtie_metrics.filter(b => b.effectiveness >= 70).length > 0 && <p className="text-xs text-muted-foreground mt-1">{profil.bowtie_metrics.filter(b => b.effectiveness >= 70).length} domaines déjà protégés</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
