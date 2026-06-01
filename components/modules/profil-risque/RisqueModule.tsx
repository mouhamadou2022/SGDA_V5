// components/modules/profil-risque/RisqueModule.tsx
// Routeur 4 onglets : Synthèse → Diagnostic → Anticipation → Actions
// Tous les modèles IA alimentent ces 4 onglets via ProfilRisque enrichi

'use client'

import { useState, useMemo, useCallback } from 'react'
import { Activity, TrendingUp, Shield, Brain, CheckCircle2, BarChart3, BookOpen } from 'lucide-react'
import { useAppStore, useHistoricalScores, ProfilRisque } from '@/lib/store'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { HelpModal, type HelpSection } from '@/components/ui/HelpModal'

import { SyntheseTab } from './SyntheseTab'
import { DiagnosticTab } from './DiagnosticTab'
import AnticipationTab from './AnticipationTab'
import { ActionsTab } from './ActionsTab'
import DecisionTab from './DecisionTab'

interface Props { userRole: string }

type OngletId = 'synthese' | 'diagnostic' | 'anticipation' | 'actions'

const ONGLETS: { id: OngletId; label: string; icon: React.ElementType }[] = [
  { id: 'synthese', label: 'Synthèse', icon: Activity },
  { id: 'diagnostic', label: 'Diagnostic', icon: Shield },
  { id: 'anticipation', label: 'Anticipation', icon: TrendingUp },
  { id: 'actions', label: 'Actions', icon: CheckCircle2 },
]

const HELP_SECTIONS: HelpSection[] = [
  { id: 'synthese', title: 'Synthèse', content: 'Vue d\'ensemble du profil de risque : score global, radar C1-C5, tendance, alertes, HMM et survie.' },
  { id: 'diagnostic', title: 'Diagnostic', content: 'Analyse détaillée des causes : critères C1-C5, infrastructure, corrélations, Black Swans.' },
  { id: 'anticipation', title: 'Anticipation', content: 'Prédictions IA à 3/6/12 mois, scénarios, HMM, EVT, Negative Binomial.' },
  { id: 'actions', title: 'Actions', content: 'Recommandations priorisées par IA, action recommandée, recalibration.' },
]

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
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

  const [activeOnglet, setActiveOnglet] = useState<OngletId>('synthese')
  const [selectedAerodromeId, setSelectedAerodromeId] = useState<string>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const historiqueScores = useHistoricalScores(selectedAerodromeId !== 'all' ? selectedAerodromeId : '')

  const aerodromesFiltres = useMemo(() => {
    const actifs = aerodromes.filter(a => !a.deleted_at)
    if (user?.aerodrome_id) return actifs.filter(a => a.id === user.aerodrome_id)
    return actifs
  }, [aerodromes, user])

  const aerodromesAvecProfil = useMemo(() =>
    aerodromesFiltres.map(a => ({ aerodrome: a, profil: profilsRisque[a.id] ?? null })),
    [aerodromesFiltres, profilsRisque]
  )

  const selectedData = useMemo(() => {
    if (selectedAerodromeId === 'all') return null
    return aerodromesAvecProfil.find(e => e.aerodrome.id === selectedAerodromeId) ?? null
  }, [aerodromesAvecProfil, selectedAerodromeId])

  const profil = selectedData?.profil ?? null
  const aerodrome = selectedData?.aerodrome ?? null

  const stats = useMemo(() => {
    const profils = aerodromesFiltres.map(a => profilsRisque[a.id]).filter(Boolean) as ProfilRisque[]
    if (!profils.length) return null
    const moyenne = profils.reduce((s, p) => s + p.score_global, 0) / profils.length
    const critiques = profils.filter(p => p.score_global < 30).length
    const excellents = profils.filter(p => p.score_global >= 80).length
    const enDegradation = profils.filter(p => p.tendance === 'baisse').length
    return { moyenne: Math.round(moyenne), critiques, excellents, total: profils.length, enDegradation }
  }, [aerodromesFiltres, profilsRisque])

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

  const isDecisionMaker = userRole === 'dg_anacim' || userRole === 'dg_operator' || userRole === 'focal_operator'

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAerodromeId(e.target.value)
    setActiveOnglet('synthese') // reset onglet on aerodrome change
  }

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="profil-risque">
      <ModuleHeader
        icon={<Activity />}
        title="Profil de Risque"
        description="Analyse multicritère — Modèles IA intégrés"
        actions={<div className="flex items-center gap-2">
          <button onClick={() => setShowHelp(true)} className="btn btn-sm btn-secondary gap-1.5" title="Aide"><BookOpen className="w-3.5 h-3.5" />Aide</button>
          <select value={selectedAerodromeId} onChange={handleSelectChange}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}>
            <option value="all">Tous les aérodromes</option>
            {aerodromesFiltres.map(a => <option key={a.id} value={a.id}>{a.code_oaci} — {a.nom}</option>)}
          </select>
        </div>}
      />

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} title="Guide — Profil de Risque" subtitle="Comprendre l'analyse multicritère et les modèles IA" sections={HELP_SECTIONS} />

      {/* Vue globale — KPIs */}
      {stats && selectedAerodromeId === 'all' && (
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-icon bg-role-primary-soft"><BarChart3 className="w-5 h-5 text-role-primary" /></div><div className="kpi-content"><div className="kpi-label">Score moyen</div><div className={`kpi-value ${stats.moyenne < 30 ? 'text-danger' : stats.moyenne < 60 ? 'text-warning' : 'text-success'}`}>{stats.moyenne}</div></div></div>
          <div className="kpi-card"><div className="kpi-icon bg-success-soft"><CheckCircle2 className="w-5 h-5 text-success" /></div><div className="kpi-content"><div className="kpi-label">Excellents (≥80)</div><div className="kpi-value text-success">{stats.excellents}</div></div></div>
          <div className="kpi-card"><div className="kpi-icon bg-danger-soft"><Activity className="w-5 h-5 text-danger" /></div><div className="kpi-content"><div className="kpi-label">Critiques (&lt;30)</div><div className="kpi-value text-danger">{stats.critiques}</div></div></div>
          <div className="kpi-card"><div className="kpi-icon bg-warning-soft"><TrendingUp className="w-5 h-5 text-warning" /></div><div className="kpi-content"><div className="kpi-label">En dégradation</div><div className="kpi-value text-warning">{stats.enDegradation}</div></div></div>
          <div className="kpi-card"><div className="kpi-icon bg-info-soft"><Shield className="w-5 h-5 text-info" /></div><div className="kpi-content"><div className="kpi-label">Total analysés</div><div className="kpi-value">{stats.total}</div></div></div>
        </div>
      )}

      {/* Sélection requise pour voir le détail */}
      {selectedAerodromeId === 'all' && (
        <div className="card border-border text-center py-12">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-muted-foreground">Sélectionnez un aérodrome pour voir son profil de risque détaillé</p>
        </div>
      )}

      {/* Détail par aérodrome */}
      {aerodrome && profil && isDecisionMaker && (
        <DecisionTab profil={profil} aerodromeCode={aerodrome.code_oaci} aerodromeName={aerodrome.nom} nbEcartsCritiques={nbEcartsCritiques} userRole={userRole} onRecalculate={handleRecalculer} />
      )}

      {aerodrome && profil && !isDecisionMaker && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <span className="code-oaci-badge text-base">{aerodrome.code_oaci}</span>
            <span className="font-semibold text-lg text-foreground">{aerodrome.nom}</span>
            <span className={`badge text-xs ${profil.score_global < 30 ? 'danger' : profil.score_global < 60 ? 'warning' : 'success'}`}>
              {profil.niveau} ({profil.score_global}/100)
            </span>
            {profil.tendance && (
              <span className="text-xs text-muted-foreground">Tendance: {profil.tendance}</span>
            )}
          </div>

          {/* Onglets */}
          <div className="tabs">
            {ONGLETS.map(o => (
              <button key={o.id} onClick={() => setActiveOnglet(o.id)}
                className={`tab ${activeOnglet === o.id ? 'active' : ''}`}>
                <o.icon className="w-4 h-4 inline mr-2" />{o.label}
              </button>
            ))}
          </div>

          {/* Contenu */}
          {activeOnglet === 'synthese' && (
            <SyntheseTab profil={profil} aerodromeName={aerodrome.nom} aerodromeCode={aerodrome.code_oaci} nbEcartsCritiques={nbEcartsCritiques} userRole={userRole} />
          )}
          {activeOnglet === 'diagnostic' && (
            <DiagnosticTab profil={profil} surveillances={surveillances.filter(s => s.aerodrome_id === aerodrome.id)} evenementsCount={evenementsAerodrome.length} />
          )}
          {activeOnglet === 'anticipation' && (
            <AnticipationTab profil={profil} historicalScores={historiqueScores} evenements={evenementsAerodrome} />
          )}
          {activeOnglet === 'actions' && (
            <ActionsTab profil={profil} aerodromeId={aerodrome.id} userRole={userRole} onRecalculate={handleRecalculer} />
          )}
        </>
      )}
    </div>
  )
}
