// components/modules/profil-risque/RisqueModule.tsx
// Vue grille de cartes d'aérodromes → clic → vue détaillée avec back
// DG : DecisionTab | Inspecteur/Admin : 4 onglets techniques

'use client'

import { useState, useMemo, useCallback } from 'react'
import { Activity, TrendingUp, TrendingDown, Minus, Shield, Brain, CheckCircle2, BarChart3, BookOpen, MapPin, ArrowLeft } from 'lucide-react'
import { useAppStore, useHistoricalScores, ProfilRisque } from '@/lib/store'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { HelpModal, type HelpSection } from '@/components/ui/HelpModal'

import { SyntheseTab } from './SyntheseTab'
import { DiagnosticTab } from './DiagnosticTab'
import AnticipationTab from './AnticipationTab'
import { ActionsTab } from './ActionsTab'
import DecisionTab from './DecisionTab'
import { RiskCard } from '@/components/cards/RiskCard'

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

function getNiveauBadgeCls(score: number): string {
  if (score >= 80) return 'badge success'
  if (score >= 60) return 'badge primary'
  if (score >= 30) return 'badge warning'
  return 'badge danger'
}

function getBorderCls(score: number): string {
  if (score >= 80) return 'border-l-success'
  if (score >= 60) return 'border-l-primary'
  if (score >= 30) return 'border-l-warning'
  return 'border-l-danger'
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-primary'
  if (score >= 30) return 'text-warning'
  return 'text-danger'
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

  const isDecisionMaker = userRole === 'dg_anacim' || userRole === 'dg_operator' || userRole === 'focal_operator'
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
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="profil-risque">
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

      {/* KPIs globaux */}
      {stats && !selectedAerodromeId && (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-icon bg-role-primary-soft"><BarChart3 className="w-5 h-5 text-role-primary" /></div><div className="kpi-content"><div className="kpi-label">Score moyen</div><div className={`kpi-value ${getScoreColor(stats.moyenne)}`}>{stats.moyenne}</div></div></div>
          <div className="kpi-card"><div className="kpi-icon bg-success-soft"><CheckCircle2 className="w-5 h-5 text-success" /></div><div className="kpi-content"><div className="kpi-label">Excellents (≥80)</div><div className="kpi-value text-success">{stats.excellents}</div></div></div>
          <div className="kpi-card"><div className="kpi-icon bg-danger-soft"><Activity className="w-5 h-5 text-danger" /></div><div className="kpi-content"><div className="kpi-label">Critiques (&lt;30)</div><div className="kpi-value text-danger">{stats.critiques}</div></div></div>
          <div className="kpi-card"><div className="kpi-icon bg-warning-soft"><TrendingUp className="w-5 h-5 text-warning" /></div><div className="kpi-content"><div className="kpi-label">En dégradation</div><div className="kpi-value text-warning">{stats.enDegradation}</div></div></div>
          <div className="kpi-card"><div className="kpi-icon bg-info-soft"><Shield className="w-5 h-5 text-info" /></div><div className="kpi-content"><div className="kpi-label">Total</div><div className="kpi-value">{stats.total}</div></div></div>
        </div>
      )}

      {/* Analyse comparative — tableau de benchmarking */}
      {!selectedAerodromeId && aerodromesAvecProfil.filter(e => e.profil).length >= 2 && (
        <div className="card border-border">
          <div className="card-header border-b border-border">
            <div className="card-title text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-role-primary" />Analyse comparative</div>
          </div>
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Code OACI</th>
                  <th>Nom</th>
                  <th>Score</th>
                  <th>Tendance</th>
                  <th>C1 (SGS)</th>
                  <th>C2 (PAC)</th>
                  <th>C3</th>
                  <th>C4</th>
                  <th>C5</th>
                  <th>Préd. 3m</th>
                </tr>
              </thead>
              <tbody>
                {aerodromesAvecProfil
                  .filter(e => e.profil)
                  .sort((a, b) => (b.profil!.score_global) - (a.profil!.score_global))
                  .slice(0, 15)
                  .map(({ aerodrome, profil }, idx) => {
                    if (!profil) return null
                    const rank = idx + 1
                    return (
                      <tr key={aerodrome.id} className="cursor-pointer hover:bg-role-primary-soft/20 transition-colors" onClick={() => handleSelectAerodrome(aerodrome.id)}>
                        <td className="font-bold text-xs">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}</td>
                        <td><span className="code-oaci-badge text-xs">{aerodrome.code_oaci}</span></td>
                        <td className="font-medium truncate max-w-[140px]">{aerodrome.nom}</td>
                        <td className={`font-bold ${profil.score_global >= 80 ? 'text-success' : profil.score_global >= 60 ? 'text-primary' : profil.score_global >= 30 ? 'text-warning' : 'text-danger'}`}>{profil.score_global}/100</td>
                        <td>{profil.tendance === 'hausse' ? '📈' : profil.tendance === 'baisse' ? '📉' : '➡️'}</td>
                        <td className="text-xs">{profil.c1}</td>
                        <td className="text-xs">{profil.c2}</td>
                        <td className="text-xs">{profil.c3}</td>
                        <td className="text-xs">{profil.c4}</td>
                        <td className="text-xs">{profil.c5}</td>
                        <td className={`text-xs font-semibold ${profil.prediction_3m >= 80 ? 'text-success' : profil.prediction_3m >= 60 ? 'text-primary' : profil.prediction_3m >= 30 ? 'text-warning' : 'text-danger'}`}>{profil.prediction_3m}/100</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grille de cartes d'aérodromes */}
      {!selectedAerodromeId && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {aerodromesAvecProfil.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground"><MapPin className="w-12 h-12 mx-auto mb-3 opacity-20" /><p>Aucun aérodrome disponible</p></div>
          )}
          {aerodromesAvecProfil.map(({ aerodrome, profil }) => {
            if (!profil) return (
              <div key={aerodrome.id} className="card border-border border-l-4 border-l-muted cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleSelectAerodrome(aerodrome.id)}>
                <div className="card-header border-b border-border"><div className="card-title flex items-center gap-2"><span className="code-oaci-badge text-xs">{aerodrome.code_oaci}</span><span className="font-semibold text-sm">{aerodrome.nom}</span></div></div>
                <div className="card-content p-4 text-center"><p className="text-sm text-muted-foreground">Profil non calculé</p><p className="text-xs text-muted-foreground mt-1">Cliquez pour lancer le calcul</p></div>
              </div>
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

      {/* Vue détaillée — DG */}
      {selectedAerodromeId && aerodrome && profil && isDecisionMaker && (
        <DecisionTab profil={profil} aerodromeCode={aerodrome.code_oaci} aerodromeName={aerodrome.nom} nbEcartsCritiques={nbEcartsCritiques} userRole={userRole} onRecalculate={handleRecalculer} />
      )}

      {/* Vue détaillée — Inspecteur/Admin (4 onglets) */}
      {selectedAerodromeId && aerodrome && profil && !isDecisionMaker && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <span className="code-oaci-badge text-base">{aerodrome.code_oaci}</span>
            <span className="font-semibold text-lg text-foreground">{aerodrome.nom}</span>
            <span className={`badge text-xs ${getNiveauBadgeCls(profil.score_global)}`}>
              {profil.niveau} ({profil.score_global}/100)
            </span>
            {profil.tendance && <span className="text-xs text-muted-foreground">Tendance: {profil.tendance}</span>}
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
              <SyntheseTab profil={profil} aerodromeName={aerodrome.nom} aerodromeCode={aerodrome.code_oaci} nbEcartsCritiques={nbEcartsCritiques} userRole={userRole} />
            )}
            {activeOnglet === 'diagnostic' && (
              <DiagnosticTab profil={profil} surveillances={surveillances.filter(s => s.aerodrome_id === aerodrome.id)} ecarts={ecarts.filter(e => e.aerodrome_id === aerodrome.id)} evenementsCount={evenementsAerodrome.length} />
            )}
            {activeOnglet === 'anticipation' && (
              <AnticipationTab profil={profil} historicalScores={historiqueScores} evenements={evenementsAerodrome} />
            )}
            {activeOnglet === 'actions' && (
              <ActionsTab profil={profil} aerodromeId={aerodrome.id} userRole={userRole} onRecalculate={handleRecalculer} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
