'use client'

import { ProfilRisque, Ecart, EvenementSecurite } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { getSgsMaturiteLabel } from '@/lib/utils'
import { useState, useMemo, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { AlertTriangle, Shield, Activity, Zap, BarChart3, Sparkles, Loader2 } from 'lucide-react'
import { expliquerCriteresEnClair, type ExplicationCritere } from '@/lib/ia/critereExplicationIA'
import { expliquerCygneNoirEnClair, type CygneNoirExplication } from '@/lib/ia/cygneNoirIA'
import BowTieAnalyzer from './BowTieAnalyzer'
import { OACIMatrixSection } from './OACIMatrixSection'
import { CorrelationSection } from './CorrelationSection'
import { AmdecModule } from '@/components/modules/amdec/AmdecModule'
import { ModeleAnalyseSelector } from '@/components/ui/ModeleAnalyseSelector'
import { recommanderParmi, getModelesDisponibles, type ModeleAnalyse, type ModeleAnalyseInput } from '@/lib/ia/modelSelector'
import { ModeleMLAnalysis } from './ModeleMLAnalysis'
import type { Role } from '@/lib/config'

type Niveau = 'critique' | 'eleve' | 'moyen' | 'faible'

function getNiveau(score: number): Niveau {
  if (score >= 80) return 'faible'
  if (score >= 60) return 'moyen'
  if (score >= 30) return 'eleve'
  return 'critique'
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

function getLevelColor(n: Niveau): 'danger' | 'warning' | 'primary' | 'success' {
  switch (n) {
    case 'critique': return 'danger'
    case 'eleve': return 'warning'
    case 'moyen': return 'primary'
    case 'faible': return 'success'
  }
}

const CRITERES = [
  { key: 'c1' as const, label: 'Maturité SGS', weight: 20, desc: 'Solidité du Système de Gestion de la Sécurité : politiques, documentation, formation et culture sécurité.' },
  { key: 'c2' as const, label: 'Efficacité PAC', weight: 25, desc: 'Taux de mise en œuvre et efficacité des Plans d\'Actions Correctives suite aux audits.' },
  { key: 'c3' as const, label: 'Conformité technique', weight: 20, desc: 'Respect des exigences réglementaires : infrastructures, équipements et aides visuelles.' },
  { key: 'c4' as const, label: 'Charge critique non résolue', weight: 20, desc: 'Volume d\'écarts critiques et majeurs en souffrance — alourdit le risque opérationnel.' },
  { key: 'c5' as const, label: 'Résilience & Historique', weight: 15, desc: 'Historique d\'incidents, capacité de résilience et récurrence des événements.' },
]

interface DiagnosticTabProps {
  profil: ProfilRisque
  surveillances: any[]
  ecarts: Ecart[]
  evenementsCount: number
  evenements?: EvenementSecurite[]
  userRole?: string
}

export function DiagnosticTab({ profil, surveillances, ecarts, evenementsCount, evenements, userRole }: DiagnosticTabProps) {
  const niveauGlobal = getNiveau(profil.score_global)
  const scenarioCatastrophe = profil.scenarios?.[3]
  const amdecAnalyses = useAppStore((s) => s.amdecAnalyses)
  const ftaAnalyses = useAppStore((s) => s.ftaAnalyses)
  const rfModelInfo = useAppStore((s) => s.rfModelInfo)
  const predictRisk = useAppStore((s) => s.predictRisk)

  // Input de recommandation construit depuis les données réelles du store
  const inputModele = useMemo<ModeleAnalyseInput>(() => ({
    profil,
    evenement: null,
    evenements,
    ecarts,
    surveillances,
    amdecAnalyses,
    ftaAnalyses,
    rfModelInfo,
  }), [profil, evenements, ecarts, surveillances, amdecAnalyses, ftaAnalyses, rfModelInfo])

  const modelesDispo = useMemo(() => getModelesDisponibles(inputModele), [inputModele])

  const predictionRF = useMemo(() => (rfModelInfo ? predictRisk(profil) : null), [rfModelInfo, predictRisk, profil])

  const [modeleActif, setModeleActif] = useState<ModeleAnalyse>(() => {
    const rec = recommanderParmi(inputModele, modelesDispo)
    return modelesDispo.includes(rec.recommande) ? rec.recommande : (modelesDispo[0] ?? 'bowtie')
  })

  // Explication IA des critères C1-C5 en langage clair (fallback déterministe sinon)
  const [explications, setExplications] = useState<ExplicationCritere>(() => ({
    c1: CRITERES[0].desc,
    c2: CRITERES[1].desc,
    c3: CRITERES[2].desc,
    c4: CRITERES[3].desc,
    c5: CRITERES[4].desc,
  }))
  const [explicationIAEnCours, setExplicationIAEnCours] = useState(true)
  const [explicationIAActif, setExplicationIAActif] = useState(false)

  useEffect(() => {
    let actif = true
    setExplicationIAEnCours(true)
    expliquerCriteresEnClair({
      profil,
      ecarts,
      evenementsCount,
    }).then((res) => {
      if (!actif) return
      setExplications(res.explications)
      setExplicationIAActif(!res.fallbackIA)
      setExplicationIAEnCours(false)
    }).catch(() => {
      if (!actif) return
      setExplicationIAEnCours(false)
    })
    return () => { actif = false }
  }, [profil, ecarts, evenementsCount])

  // Explication IA de l'alerte cygne noir (fallback déterministe data-driven sinon)
  const [cygneNoir, setCygneNoir] = useState<CygneNoirExplication | null>(null)
  const [cygneNoirEnCours, setCygneNoirEnCours] = useState(true)

  useEffect(() => {
    if (!profil.bayesian_black_swan) return
    let actif = true
    setCygneNoirEnCours(true)
    expliquerCygneNoirEnClair({
      profil,
      ecarts,
      evenementsCount,
    }).then((res) => {
      if (!actif) return
      setCygneNoir(res)
      setCygneNoirEnCours(false)
    }).catch(() => {
      if (!actif) return
      setCygneNoirEnCours(false)
    })
    return () => { actif = false }
  }, [profil, ecarts, evenementsCount])

  return (
    <div className="space-y-10">
      {/* ── Diagnostic du niveau de risque ── */}
      <Card
        variant="level"
        levelColor={getLevelColor(niveauGlobal)}
        heading="Diagnostic du niveau de risque"
        icon={<Shield className={`w-5 h-5 ${getTextColor(niveauGlobal)}`} />}
        badge={<span className={`${getBadgeClass(niveauGlobal)}`}>{getNiveauLabel(niveauGlobal)} — {profil.score_global}/100</span>}
        headerGradient={false}
      >
        <p className="text-sm text-foreground">
          {surveillances.length} surveillance{surveillances.length !== 1 ? 's' : ''} · {evenementsCount} événement{evenementsCount !== 1 ? 's' : ''}
        </p>
      </Card>

      {/* ── Détail par critère C1-C5 ── */}
      <Card
        variant="role"
        heading="Détail par critère"
        icon={<BarChart3 className="w-5 h-5" />}
        badge={
          explicationIAEnCours ? (
            <span className="inline-flex items-center gap-2 text-xs text-primary">
              <Loader2 className="w-4 h-4 animate-spin" /> Analyse IA en cours…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5" />
              {explicationIAActif ? 'Langage clair AERORISQ' : 'Analyse déterministe'}
            </span>
          )
        }
      >
        <div className="space-y-5">
          {CRITERES.map(c => {
            const score = profil[c.key]
            const niv = getNiveau(score)
            const isMaturite = c.key === 'c1'
            return (
              <div key={c.key} className={`rounded-lg border border-border bg-card p-4 border-l-4 border-l-${getLevelColor(niv)}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground">
                      {c.key.toUpperCase()} — {c.label}
                    </span>
                    <span className={`${getBadgeClass(niv)}`}>{getNiveauLabel(niv)}</span>
                  </div>
                  <span className={`text-sm font-bold ${getTextColor(niv)}`}>
                    {score}/100
                  </span>
                </div>
                {isMaturite && (
                  <div className="mb-2">
                    <span className="text-sm font-semibold text-primary">{getSgsMaturiteLabel(score)}</span>
                  </div>
                )}
                <div className="w-full bg-muted rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full transition-all ${getProgressColor(niv)}`}
                    style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground">{explications[c.key]}</p>
                  <span className="text-[10px] text-muted-foreground font-mono ml-2 shrink-0">{c.weight}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Facteurs infrastructure ── */}
      {profil.infrastructure && (
        <Card
          variant="role"
          heading="Facteurs infrastructure"
          icon={<Activity className="w-5 h-5" />}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">Type d&apos;entité</span>
              <p className="text-sm font-semibold text-foreground mt-1">{profil.infrastructure.type_entite}</p>
            </div>
            {profil.infrastructure.horaires && (
              <div>
                <span className="text-sm text-muted-foreground">Horaires</span>
                <p className="text-sm font-semibold text-foreground mt-1">
                  {profil.infrastructure.horaires === 'h24' ? 'H24' : 'Jour'}
                </p>
              </div>
            )}
            <div>
              <span className="text-sm text-muted-foreground">Type</span>
              <p className="text-sm font-semibold text-foreground mt-1">
                {profil.infrastructure.type === 'international' ? 'International' : 'National'}
              </p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Catégorie SSLI</span>
              <p className="text-sm font-semibold text-foreground mt-1">{profil.infrastructure.categorie_sslia}</p>
            </div>
          </div>
          <p className="text-sm text-foreground mt-4 leading-relaxed">
            {profil.infrastructure.type === 'international'
              ? 'Aérodrome international : exigences renforcées (OACI Annexe 14), trafic plus dense, surveillance accrue.'
              : 'Aérodrome national : exigences standard OACI adaptées au trafic domestique.'}
            {profil.infrastructure.horaires === 'h24' && ' L\'exploitation H24 augmente l\'exposition au risque et requiert des moyens permanents.'}
          </p>
        </Card>
      )}

      {/* ── Dépendance entre critères ── */}
      {profil.copula_metrics && (
        <Card
          variant="role"
          heading="Dépendance entre critères"
          icon={<Zap className="w-5 h-5 text-warning" />}
        >
          <p className="text-sm text-foreground leading-relaxed">
            Dépendance entre critères : {Math.round(profil.copula_metrics.maxTailDependence * 100)} %.
            Les domaines sont liés — une dégradation de l&apos;un affecte les autres.
          </p>
          {profil.copula_metrics.worstCaseDescription && (
            <p className="text-sm text-foreground mt-2 italic">
              Pire cas : {profil.copula_metrics.worstCaseDescription}
            </p>
          )}
        </Card>
      )}

      {/* ── Variabilité des incidents ── */}
      {profil.negbin_metrics && profil.negbin_metrics.isOverdispersed && (
        <Card
          variant="role"
          heading="Variabilité des incidents"
          icon={<Activity className="w-5 h-5 text-primary" />}
        >
          <p className="text-sm text-foreground leading-relaxed">
            Forte variabilité des incidents détectée — le nombre d&apos;incidents fluctue par grappes.
          </p>
          {profil.negbin_metrics.dispersion != null && (
            <p className="text-sm text-foreground mt-2">
              Dispersion : {profil.negbin_metrics.dispersion.toFixed(2)} · Moyenne : {profil.negbin_metrics.mean?.toFixed(1)} · Variance : {profil.negbin_metrics.variance?.toFixed(1)}
            </p>
          )}
        </Card>
      )}

      {/* ── Alerte Cygne Noir ── */}
      {profil.bayesian_black_swan && (
        <Card
          variant="alert"
          alertBg="danger"
          heading="Alerte Cygne Noir"
          icon={<AlertTriangle className="w-5 h-5 text-danger animate-pulse" />}
          badge={
            cygneNoirEnCours ? (
              <span className="inline-flex items-center gap-2 text-xs text-danger">
                <Loader2 className="w-4 h-4 animate-spin" /> Analyse IA en cours…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-danger bg-danger/10 px-2 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5" />
                Langage clair IA
              </span>
            )
          }
          headerGradient={false}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {profil.bayesian_prior != null && (
                <div className="p-3 rounded-lg border border-danger/20 bg-danger/5">
                  <span className="text-xs text-foreground/70">Probabilité a priori (historique)</span>
                  <p className={`text-lg font-bold mt-1 ${getTextColor(getNiveau(profil.bayesian_prior))}`}>
                    {profil.bayesian_prior} %
                  </p>
                </div>
              )}
              {profil.bayesian_posterior != null && (
                <div className="p-3 rounded-lg border border-danger/20 bg-danger/5">
                  <span className="text-xs text-foreground/70">Probabilité a posteriori (actuelle)</span>
                  <p className={`text-lg font-bold mt-1 ${getTextColor(getNiveau(profil.bayesian_posterior))}`}>
                    {profil.bayesian_posterior} %
                  </p>
                </div>
              )}
            </div>
            {cygneNoirEnCours ? (
              <p className="text-sm text-danger leading-relaxed">Analyse du signal en cours…</p>
            ) : cygneNoir ? (
              <>
                <p className="text-sm text-danger leading-relaxed">{cygneNoir.explication}</p>
                {cygneNoir.actions.length > 0 && (
                  <div>
                    <span className="text-sm font-semibold text-foreground">Actions à engager :</span>
                    <ul className="mt-2 space-y-1">
                      {cygneNoir.actions.map((a, i) => (
                        <li key={i} className="text-sm text-foreground flex items-start gap-2">
                          <span className="text-danger mt-1.5 shrink-0">•</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-danger leading-relaxed">Analyse du signal en cours…</p>
            )}
          </div>
        </Card>
      )}

      {/* ── Scénario pire cas ── */}
      {scenarioCatastrophe && (
        <Card
          variant="level"
          levelColor={getLevelColor(getNiveau(scenarioCatastrophe.scoreProjecte))}
          heading={`Scénario pire cas : ${scenarioCatastrophe.nom}`}
          icon={<AlertTriangle className="w-5 h-5 text-danger" />}
          badge={<span className={`${getBadgeClass(getNiveau(scenarioCatastrophe.scoreProjecte))}`}>{getNiveauLabel(getNiveau(scenarioCatastrophe.scoreProjecte))}</span>}
          headerGradient={false}
        >
          <div className="space-y-5">
            <p className="text-sm text-foreground leading-relaxed">{scenarioCatastrophe.description}</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg border border-border bg-muted/10">
                <span className="text-sm text-muted-foreground">Score projeté</span>
                <p className={`text-lg font-bold mt-1 ${getTextColor(getNiveau(scenarioCatastrophe.scoreProjecte))}`}>
                  {scenarioCatastrophe.scoreProjecte}/100
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/10">
                <span className="text-sm text-muted-foreground">Probabilité</span>
                <p className="text-lg font-bold text-foreground mt-1">{(scenarioCatastrophe.probabilite * 100).toFixed(1)} %</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-muted/10">
                <span className="text-sm text-muted-foreground">Intervalle de confiance</span>
                <p className="text-sm text-foreground mt-1">
                  [{scenarioCatastrophe.intervalleConfiance[0].toFixed(1)}% – {scenarioCatastrophe.intervalleConfiance[1].toFixed(1)}%]
                </p>
              </div>
            </div>
            {scenarioCatastrophe.actionsRecommandees.length > 0 && (
              <div>
                <span className="text-sm font-semibold text-foreground">Actions recommandées :</span>
                <ul className="mt-2 space-y-1">
                  {scenarioCatastrophe.actionsRecommandees.map((a, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="text-danger mt-1.5 shrink-0">•</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Force de dépendance ── */}
      {profil.copula_metrics && profil.copula_metrics.maxTailDependence != null && (
        <Card
          variant="role"
          heading="Force de dépendance"
          icon={<Zap className="w-5 h-5" />}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${profil.copula_metrics.maxTailDependence > 0.6 ? 'bg-danger' : profil.copula_metrics.maxTailDependence > 0.3 ? 'bg-warning' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, profil.copula_metrics.maxTailDependence * 100)}%` }}
                  />
                </div>
              </div>
              <span className={`text-sm font-bold ${profil.copula_metrics.maxTailDependence > 0.6 ? 'text-danger' : profil.copula_metrics.maxTailDependence > 0.3 ? 'text-warning' : 'text-primary'}`}>
                {(profil.copula_metrics.maxTailDependence * 100).toFixed(0)} %
              </span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              Dépendance de queue maximale entre domaines —{' '}
              {profil.copula_metrics.maxTailDependence > 0.6
                ? 'forte corrélation dans les extrêmes : une défaillance critique dans un domaine risque d\'en entraîner d\'autres.'
                : profil.copula_metrics.maxTailDependence > 0.3
                  ? 'corrélation modérée : les domaines sont partiellement liés en situation de stress.'
                  : 'faible corrélation : les domaines évoluent de façon relativement indépendante.'}
            </p>
          </div>
        </Card>
      )}

      {/* Sélecteur de modèle d'analyse — recommandation IA (au-dessus des analyses) */}
      <ModeleAnalyseSelector
        input={inputModele}
        selected={modeleActif}
        onSelect={setModeleActif}
        modelesDisponibles={modelesDispo}
      />

      {/* Bow-Tie — Analyse complète data-driven (affichée si BowTie sélectionné) */}
      {modeleActif === 'bowtie' && (
        <BowTieAnalyzer profil={profil} ecarts={ecarts} surveillances={surveillances} evenements={evenements} />
      )}

      {/* AMDEC — Analyse bottom-up des modes de défaillance (pilote le malus C3) */}
      {modeleActif === 'amdec' && (
        <AmdecModule aerodromeId={profil.aerodrome_id} userRole={userRole as Role | undefined} embedded />
      )}

      {/* Modèles ML avancés — analyse rendue depuis les métriques persistées (HMM, survie, EVT, copulas, TS, bayésien, RF) */}
      {modeleActif !== 'bowtie' && modeleActif !== 'fta' && modeleActif !== 'amdec' && (
        <ModeleMLAnalysis modele={modeleActif} profil={profil} rfModelInfo={rfModelInfo} predictionRF={predictionRF} evenements={evenements} ecarts={ecarts} />
      )}

      {/* Matrice OACI 5×5 */}
      <OACIMatrixSection profil={profil} ecarts={ecarts} surveillances={surveillances} evenements={evenements} />

      {/* Corrélations C1-C5 + Copulas */}
      <CorrelationSection profil={profil} />
    </div>
  )
}
