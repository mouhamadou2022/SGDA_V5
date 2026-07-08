// components/modules/profil-risque/RisqueModule.tsx
// Vue grille de cartes d'aérodromes → clic → vue détaillée avec back
// DG : DecisionTab | Inspecteur/Admin : 4 onglets techniques

'use client'

import { useState, useMemo, useCallback } from 'react'
import { Activity, TrendingUp, TrendingDown, Minus, Shield, Brain, CheckCircle2, BarChart3, BookOpen, MapPin, ArrowLeft, AlertTriangle, Gauge } from 'lucide-react'
import { useAppStore, useHistoricalScores, ProfilRisque } from '@/lib/store'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import { getBadgeClassFromScore } from '@/lib/config'
import { computeAllHealthIndices, getHealthLevel, getEvolutionArrow, getEvolutionColor } from '@/lib/ia/healthIndex'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { HelpModal, type HelpSection } from '@/components/ui/HelpModal'
import { Card } from '@/components/ui/card'

import { SyntheseTab } from './SyntheseTab'
import { DiagnosticTab } from './DiagnosticTab'
import AnticipationTab from './AnticipationTab'
import { ActionsTab } from './ActionsTab'
import DecisionTab from './DecisionTab'
import ExploitantRiskView from './ExploitantRiskView'
import { RiskCard } from '@/components/cards/RiskCard'
import { ComparativeAnalysis } from './ComparativeAnalysis'

interface Props { userRole: string }
type OngletId = 'synthese' | 'diagnostic' | 'anticipation' | 'actions'

const ONGLETS: { id: OngletId; label: string; icon: React.ElementType }[] = [
  { id: 'synthese', label: 'Synthèse', icon: Activity },
  { id: 'diagnostic', label: 'Diagnostic', icon: Shield },
  { id: 'anticipation', label: 'Anticipation', icon: TrendingUp },
  { id: 'actions', label: 'Actions', icon: CheckCircle2 },
]

const HELP_SECTIONS: HelpSection[] = [
  { id: 'overview', title: 'Profil de Risque', icon: Activity, content: 'Vue d\'ensemble des profils de risque par aérodrome. Score global, C1-C5, tendance, prédictions, recommandations.' },
  { id: 'models', title: 'Modèles IA', icon: Brain, content: 'HMM, Survival, EVT, Negative Binomial, Copulas, Thompson Sampling — intégrés dans le pipeline de calcul du profil.' },
]

function getScoreColor(score: number): string {
  return getBadgeClassFromScore(score).replace('badge', 'text')
}

function getBorderCls(score: number): string {
  return getBadgeClassFromScore(score).replace('badge', 'border-l')
}

export function RisqueModule({ userRole }: Props) {
  const aerodromes = useOptimizedStore(s => s.aerodromes)
  const profilsRisque = useOptimizedStore(s => s.profilsRisque)
  const surveillances = useOptimizedStore(s => s.surveillances)
  const ecarts = useOptimizedStore(s => s.ecarts)
  const evenements = useOptimizedStore(s => s.evenements)
  const user = useOptimizedStore(s => s.user)
  const recalculerProfilRisque = useAppStore(s => s.recalculerProfilRisque)
  const computeFullRiskProfile = useAppStore(s => s.computeFullRiskProfile)

  const [selectedAerodromeId, setSelectedAerodromeId] = useState<string | null>(null)
  const [activeOnglet, setActiveOnglet] = useState<OngletId>('synthese')
  const [refreshing, setRefreshing] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const isDecisionMaker = userRole === 'dg_anacim'
  const isExploitant = !!user?.aerodrome_id
  const historiqueScores = useHistoricalScores(selectedAerodromeId || '')

  const aerodromesActifs = useMemo(() => {
    const actifs = aerodromes.filter(a => !a.deleted_at)
    if (user?.aerodrome_id) return actifs.filter(a => a.id === user.aerodrome_id)
    return actifs
  }, [aerodromes, user])

  const aerodromesAvecProfil = useMemo(() =>
    aerodromesActifs.map(a => ({ aerodrome: a, profil: profilsRisque[a.id] ?? null })),
    [aerodromesActifs, profilsRisque]
  )

  const selected = useMemo(() => {
    if (!selectedAerodromeId) return null
    return aerodromesAvecProfil.find(e => e.aerodrome.id === selectedAerodromeId) ?? null
  }, [aerodromesAvecProfil, selectedAerodromeId])

  const profil = selected?.profil ?? null
  const aerodrome = selected?.aerodrome ?? null

  const healthIndices = useMemo(() => {
    const entries = Object.values(profilsRisque).filter(Boolean) as ProfilRisque[]
    if (entries.length < 2) return null
    return computeAllHealthIndices(profilsRisque)
  }, [profilsRisque])

  const stats = useMemo(() => {
    const profils = aerodromesActifs.map(a => profilsRisque[a.id]).filter(Boolean) as ProfilRisque[]
    if (!profils.length) return null
    const moyenne = profils.reduce((s, p) => s + p.score_global, 0) / profils.length
    const critiques = profils.filter(p => p.score_global < 30).length
    const excellents = profils.filter(p => p.score_global >= 80).length
    const enDegradation = profils.filter(p => p.tendance === 'baisse').length
    return { moyenne: Math.round(moyenne), critiques, excellents, total: profils.length, enDegradation }
  }, [aerodromesActifs, profilsRisque])

  const nbEcartsCritiques = useMemo(() => {
    if (!aerodrome) return 0
    return ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length
  }, [ecarts, aerodrome])

  const evenementsAerodrome = useMemo(() => {
    if (!aerodrome) return []
    return evenements.filter(e => (e as any).aerodrome_id === aerodrome.id).slice(-20)
  }, [evenements, aerodrome])

  const handleRecalculer = useCallback(async () => {
    if (!aerodrome) return
    setRefreshing(true)
    await recalculerProfilRisque(aerodrome.id)
    if (computeFullRiskProfile) await computeFullRiskProfile(aerodrome.id)
    setRefreshing(false)
  }, [aerodrome, recalculerProfilRisque, computeFullRiskProfile])

  const handleSelectAerodrome = (id: string) => {
    setSelectedAerodromeId(id)
    setActiveOnglet('synthese')
  }

  const handleBack = () => {
    setSelectedAerodromeId(null)
  }

  return (
    <div className="space-y-8 animate-fade-up" data-role={userRole} data-module="profil-risque">
      <ModuleHeader
        icon={<Activity />}
        title="Profil de Risque"
        description={selectedAerodromeId ? `Détail — ${aerodrome?.nom || ''}` : 'Analyse multicritère — Modèles IA intégrés'}
        actions={<div className="flex items-center gap-2">
          {selectedAerodromeId && (
            <button onClick={handleBack} className="btn btn-sm btn-secondary gap-1.5"><ArrowLeft className="w-3.5 h-3.5" />Retour</button>
          )}
          <button onClick={() => setShowHelp(true)} className="btn btn-sm btn-secondary gap-1.5"><BookOpen className="w-3.5 h-3.5" />Aide</button>
        </div>}
      />

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} title="Guide — Profil de Risque" subtitle="Analyse multicritère et modèles IA" sections={HELP_SECTIONS} />

      {/* Vue d'ensemble — KPIs puis Health Index */}
      {stats && !selectedAerodromeId && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="kpi-card"><div className="kpi-icon bg-role-primary-soft"><BarChart3 className="w-5 h-5 text-role-primary" /></div><div className="kpi-content"><div className="kpi-label text-foreground">Score moyen</div><div className={`kpi-value ${getScoreColor(stats.moyenne)}`}>{stats.moyenne}</div></div></div>
            <div className="kpi-card"><div className="kpi-icon bg-success-soft"><CheckCircle2 className="w-5 h-5 text-success" /></div><div className="kpi-content"><div className="kpi-label text-foreground">Excellents (≥80)</div><div className="kpi-value text-success">{stats.excellents}</div></div></div>
            <div className="kpi-card"><div className="kpi-icon bg-danger-soft"><Activity className="w-5 h-5 text-danger" /></div><div className="kpi-content"><div className="kpi-label text-foreground">Critiques (&lt;30)</div><div className="kpi-value text-danger">{stats.critiques}</div></div></div>
            <div className="kpi-card"><div className="kpi-icon bg-warning-soft"><TrendingUp className="w-5 h-5 text-warning" /></div><div className="kpi-content"><div className="kpi-label text-foreground">En dégradation</div><div className="kpi-value text-warning">{stats.enDegradation}</div></div></div>
            <div className="kpi-card"><div className="kpi-icon bg-info-soft"><Shield className="w-5 h-5 text-info" /></div><div className="kpi-content"><div className="kpi-label text-foreground">Total</div><div className="kpi-value text-foreground">{stats.total}</div></div></div>
          </div>

          {/* Health Index card */}
          {healthIndices && healthIndices.length > 0 && aerodromesAvecProfil.length > 0 && (() => {
            const avg = Math.round(healthIndices.reduce((s, h) => s + h.score, 0) / healthIndices.length)
            const level = getHealthLevel(avg)
            const alerts = healthIndices.filter(h => h.topAlert).length
            const avgConfiance = Math.round(healthIndices.reduce((s, h) => s + h.confiance, 0) / healthIndices.length)
            const avgPredicted = Math.round(healthIndices.reduce((s, h) => s + (h.prediction.score ?? h.score), 0) / healthIndices.length)

            const worst = aerodromesAvecProfil
              .filter(e => e.profil)
              .sort((a, b) => {
                const pa = a.profil!, pb = b.profil!
                if (pa.tendance === 'baisse' && pb.tendance !== 'baisse') return -1
                if (pa.tendance !== 'baisse' && pb.tendance === 'baisse') return 1
                return pa.score_global - pb.score_global
              })[0]
            const p = worst?.profil
            const DIMS: [keyof ProfilRisque, string][] = [
              ['c1', 'Maturité SGS'], ['c2', 'Efficacité PAC'],
              ['c3', 'Conformité'], ['c4', 'Charge critique'], ['c5', 'Résilience'],
            ]
            const dominantDim = p ? [...DIMS].sort((a, b) => (p[a[0]] as number) - (p[b[0]] as number))[0] : null
            const delta = p ? p.prediction_3m - p.score_global : 0
            const joursSous60 = p && p.tendance === 'baisse' && delta < 0
              ? Math.ceil((p.score_global - 60) / Math.abs(delta / 90))
              : null
            const perte2mois = p && delta < 0 ? Math.round(Math.abs(delta) * 60 / 90) : null

            return (
              <Card variant="role" headerGradient icon={<Gauge className="w-5 h-5" />} title="Health Index — Synthèse exécutive">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                    <span title="Score moyen">Index <strong className={level.color}>{avg}</strong>/100</span>
                    <span title="Niveau" className={level.color}>{level.niveau}</span>
                    <span title="Alerte" className={alerts > 0 ? 'text-danger' : 'text-success'}>
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-0.5" />{alerts} alerte{alerts > 1 ? 's' : ''}
                    </span>
                    <span title="Confiance moyenne">Fiabilité <strong>{avgConfiance}%</strong></span>
                    <span title="Prédiction 3 mois" className={avgPredicted < avg ? 'text-warning' : 'text-success'}>
                      Prévision 3m <strong>{avgPredicted}</strong>
                    </span>
                  </div>

                  {p && worst && dominantDim && (
                    <>
                      <div className="border-t border-border pt-4 text-sm text-foreground leading-relaxed">
                        <strong className="text-role-primary">{worst.aerodrome.nom}</strong> est à <strong>{p.score_global}/100</strong>
                        {p.tendance === 'baisse' && perte2mois !== null
                          ? ` mais perd ${perte2mois} pts sur 2 mois à cause de ${dominantDim[1].toLowerCase()}.`
                          : `. La dimension la plus faible est ${dominantDim[1].toLowerCase()} (${p[dominantDim[0]] as number}/100).`}
                        {joursSous60 !== null && ` Si la tendance continue, le score passera sous 60 dans environ ${joursSous60} jours.`}
                      </div>
                      <div className="border-t border-border pt-4 text-sm text-foreground">
                        <span className="font-medium text-role-primary">Recommandation :</span>{' '}
                        {dominantDim[0] === 'c1' && 'Réaliser un audit SGS complet pour renforcer la culture sécurité.'}
                        {dominantDim[0] === 'c2' && 'Prioriser la clôture des PAC en retard avant la prochaine échéance.'}
                        {dominantDim[0] === 'c3' && 'Planifier une inspection ciblée de la conformité réglementaire.'}
                        {dominantDim[0] === 'c4' && 'Réduire la charge critique par une redistribution des inspections.'}
                        {dominantDim[0] === 'c5' && 'Mettre en place un plan de résilience avec des ressources de renfort.'}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            )
          })()}
        </div>
      )}

      {/* Analyse comparative */}
      {!selectedAerodromeId && !isExploitant && aerodromesAvecProfil.filter(e => e.profil).length >= 2 && (
        <ComparativeAnalysis onSelectAerodrome={handleSelectAerodrome} />
      )}

      {/* Vue exploitant : pas de grille, direct sur son aérodrome */}
      {isExploitant && !selectedAerodromeId && aerodromesAvecProfil.length >= 1 && (
        aerodromesAvecProfil[0].profil ? (
          <ExploitantRiskView
            profil={aerodromesAvecProfil[0].profil}
            aerodromeCode={aerodromesAvecProfil[0].aerodrome.code_oaci}
            aerodromeName={aerodromesAvecProfil[0].aerodrome.nom}
            nbEcartsCritiques={ecarts.filter(e => e.aerodrome_id === aerodromesAvecProfil[0].aerodrome.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length}
            userRole={userRole}
            onRecalculate={handleRecalculer}
            prochainesSurveillances={surveillances.filter(s => s.aerodrome_id === aerodromesAvecProfil[0].aerodrome.id && s.statut !== 'archivee').slice(0, 5)}
            ecartsActifs={ecarts.filter(e => e.aerodrome_id === aerodromesAvecProfil[0].aerodrome.id && e.statut !== 'cloture').slice(0, 10)}
            evenements={evenementsAerodrome}
          />
        ) : (
          <Card>
            <div className="text-center py-12">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-foreground">Profil de risque non calculé pour votre aérodrome</p>
              <p className="text-xs text-foreground mt-1">Contactez votre inspecteur ANACIM</p>
            </div>
          </Card>
        )
      )}

      {/* Exploitant sans aérodrome */}
      {isExploitant && !selectedAerodromeId && !aerodromesAvecProfil.length && (
        <Card>
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-foreground">Aucun aérodrome lié à votre compte</p>
            <p className="text-xs text-foreground mt-1">Contactez l'administrateur ANACIM</p>
          </div>
        </Card>
      )}
      {/* Grille de cartes d'aérodromes — pas pour les exploitants */}
      {!selectedAerodromeId && !isExploitant && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {aerodromesAvecProfil.length === 0 && (
            <div className="col-span-3 text-center py-12 text-foreground"><MapPin className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>Aucun aérodrome disponible</p></div>
          )}
          {aerodromesAvecProfil.map(({ aerodrome, profil }) => {
            if (!profil) return (
              <Card key={aerodrome.id} interactive onClick={() => handleSelectAerodrome(aerodrome.id)}>
                <div className="flex items-center gap-2 mb-2"><span className="code-oaci-badge text-xs">{aerodrome.code_oaci}</span><span className="font-semibold text-sm text-foreground">{aerodrome.nom}</span></div>
                <div className="text-center"><p className="text-sm text-foreground">Profil non calculé</p><p className="text-xs text-foreground mt-1">Cliquez pour lancer le calcul</p></div>
              </Card>
            )
            return (
              <RiskCard
                key={aerodrome.id}
                profil={profil}
                aerodromeCode={aerodrome.code_oaci}
                aerodromeName={aerodrome.nom}
                nbEcartsCritiques={ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length}
                onView={() => handleSelectAerodrome(aerodrome.id)}
              />
            )
          })}
        </div>
      )}

      {/* Vue détaillée — DG ANACIM uniquement (exploitants = ExploitantRiskView) */}
      {selectedAerodromeId && aerodrome && profil && userRole === 'dg_anacim' && (
        <DecisionTab profil={profil} aerodromeCode={aerodrome.code_oaci} aerodromeName={aerodrome.nom} nbEcartsCritiques={nbEcartsCritiques} userRole={userRole} onRecalculate={handleRecalculer} evenements={evenementsAerodrome} ecartsActifs={ecarts.filter(e => e.aerodrome_id === aerodrome.id)} />
      )}

      {/* Vue détaillée — Inspecteur/Admin (4 onglets) */}
      {selectedAerodromeId && aerodrome && profil && !isDecisionMaker && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <span className="code-oaci-badge text-base">{aerodrome.code_oaci}</span>
            <span className="font-semibold text-lg text-foreground">{aerodrome.nom}</span>
            <span className={`badge text-xs ${getBadgeClassFromScore(profil.score_global)}`}>
              {profil.niveau} ({profil.score_global}/100)
            </span>
            {profil.tendance && <span className="text-xs text-foreground">Tendance: {profil.tendance}</span>}
          </div>

          <div className="tabs">
            {ONGLETS.map(o => (
              <button key={o.id} onClick={() => setActiveOnglet(o.id)}
                className={`tab ${activeOnglet === o.id ? 'active' : ''}`}>
                <o.icon className="w-4 h-4 inline mr-2" />{o.label}
              </button>
            ))}
          </div>

          <div className="tab-content">
            {activeOnglet === 'synthese' && (
              <SyntheseTab profil={profil} aerodromeName={aerodrome.nom} aerodromeCode={aerodrome.code_oaci} nbEcartsCritiques={nbEcartsCritiques} userRole={userRole} evenements={evenementsAerodrome} ecarts={ecarts.filter(e => e.aerodrome_id === aerodrome.id)} />
            )}
            {activeOnglet === 'diagnostic' && (
              <DiagnosticTab profil={profil} surveillances={surveillances.filter(s => s.aerodrome_id === aerodrome.id)} ecarts={ecarts.filter(e => e.aerodrome_id === aerodrome.id)} evenementsCount={evenementsAerodrome.length} evenements={evenementsAerodrome} />
            )}
            {activeOnglet === 'anticipation' && (
              <AnticipationTab profil={profil} historicalScores={historiqueScores} evenements={evenementsAerodrome} aerodromeCode={aerodrome.code_oaci} />
            )}
            {activeOnglet === 'actions' && (
              <ActionsTab profil={profil} aerodromeId={aerodrome.id} aerodromeCode={aerodrome.code_oaci} userRole={userRole} onRecalculate={handleRecalculer} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
