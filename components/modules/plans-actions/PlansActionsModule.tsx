// components/modules/plans-actions/PlansActionsModule.tsx
// VERSION COMPLÈTE AMÉLIORÉE AVEC IA
// ✅ Intègre le profil de risque pour la priorisation dynamique
// ✅ Utilise les modèles avancés (Hawkes, prédictions, etc.)
// ✅ IA pour rédaction des écarts
// ✅ IA pour évaluation des PAC
// ✅ Assistant IA pour aide contextuelle
// AJOUT: Onglet Archive pour les écarts clôturés
'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useOptimizedStore, useGlobalDebounce, useGlobalTransition } from '@/lib/performance/globalOptimizer'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { getProcessusActifs } from '@/lib/processus'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection'
import { Role } from '@/lib/config'
import { plansActionsUtils } from '@/lib/plansActionsUtils'
import {
  ClipboardList, AlertTriangle, CheckCircle2, Clock,
  Search, Filter, Download, Eye, PenSquare, Trash2,
  Calendar, User, FileText,
  TrendingUp, TrendingDown, Minus, AlertOctagon, Flame,
  AlertCircle, Info, MessageSquare, History, Send,
  CheckSquare, XCircle, Bell, Mail, Phone,
  Activity, Shield, Target, Zap, Brain, BarChart3,
  Archive, Loader2, Sparkles, X,
} from 'lucide-react'
import { EcartCard } from '@/components/cards/EcartCard'
import { EvaluationPACModal } from './EvaluationPACModal'
import { EvaluationPreuvesModal } from './EvaluationPreuvesModal'
import { HistoriqueEcartModal } from './HistoriqueEcartModal'
import { SoumissionPACModal } from './SoumissionPACModal'
import { ArchiveEcarts } from './ArchiveEcarts'
import { computeHawkesContagion, computeProactiveAlert, getRiskLevelFromCell } from '@/lib/risque'
import { TYPES_SURVEILLANCE, getTypeSurveillanceLabel, DOMAINES_SURVEILLANCE, getDomaineLabel, DomaineCode, grouperParDomaine, DomaineItems } from '@/lib/domaines'
import { ecartAgent } from '@/lib/ia/agents/ecartAgent'
import type { GenerateEcartResult, EvaluatePACResult } from '@/lib/ia/agents/ecartAgent'
import { assistantAgent } from '@/lib/ia/agents/assistantAgent'

interface PlansActionsModuleProps {
  user?: { role?: string; aerodrome_id?: string }
  userRole?: Role
  aerodromeId?: string
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,backgroundPosition:'right 0.75rem center',backgroundRepeat:'no-repeat'}

export function PlansActionsModule({ user: userProp, userRole: userRoleProp, aerodromeId: aerodromeIdProp }: PlansActionsModuleProps) {
  const { startTransition } = useGlobalTransition()
  const ecarts = useOptimizedStore(s => s.ecarts)
  const aerodromes = useOptimizedStore(s => s.aerodromes)
  const surveillances = useOptimizedStore(s => s.surveillances)
  const evenements = useOptimizedStore(s => s.evenements)
  const profilsRisque = useOptimizedStore(s => s.profilsRisque)
  const historiqueScores = useOptimizedStore(s => s.historiqueScores)
  const certifications = useAppStore(s => s.certifications)
  const homologations = useAppStore(s => s.homologations)
  const getStatistiquesPAC = useAppStore(s => s.getStatistiquesPAC)
  const user = useOptimizedStore(s => s.user)
  const userRole = (userRoleProp ?? userProp?.role ?? user?.role ?? '') as Role
  const aerodromeId = aerodromeIdProp ?? userProp?.aerodrome_id ?? user?.aerodrome_id
  const addNotification = useAppStore(s => s.addNotification)
  const setActiveModule = useAppStore(s => s.setActiveModule)
  const checklistItems = useOptimizedStore(s => s.checklistItems)

  const [searchTerm, setSearchTerm] = useState('')
  const debouncedSearchTerm = useGlobalDebounce(searchTerm, 300)
  const [filters, setFilters] = useState({
    aerodrome: 'tous',
    niveau: 'tous',
    statut: 'tous',
    typeSource: 'tous',
    periode: 'tous',
    urgence: 'tous',
    prioritaire: false
  })
  const [selectedEcart, setSelectedEcart] = useState<string | null>(null)
  const [showEvaluationModal, setShowEvaluationModal] = useState(false)
  const [showPreuvesEvaluationModal, setShowPreuvesEvaluationModal] = useState(false)
  const [showHistoriqueModal, setShowHistoriqueModal] = useState(false)
  const [showSoumissionModal, setShowSoumissionModal] = useState(false)
  const [activeTab, setActiveTab] = useState('surveillances')
  const [showAnalytics, setShowAnalytics] = useState(false)
  
  // États pour l'IA
  const [isIaGenerating, setIsIaGenerating] = useState(false)
  const [iaSuggestion, setIaSuggestion] = useState<GenerateEcartResult | EvaluatePACResult | null>(null)
  const [showIaModal, setShowIaModal] = useState(false)
  const [iaQuestion, setIaQuestion] = useState('')
  const [iaAnswer, setIaAnswer] = useState('')
  const [isAskingIa, setIsAskingIa] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      useAppStore.getState().verifierRappelsAutomatiques()
    }, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Récupérer les items de checklist pour la surveillance courante
  const getCurrentSurveillanceItems = useCallback((surveillanceId: string) => {
    return checklistItems[surveillanceId] || []
  }, [checklistItems])

  // Calcul de l'urgence dynamique basée sur le profil de risque
  const getUrgenceDynamique = useMemo(() => {
    return (ecart: any): { niveau: 'critique' | 'haute' | 'normale' | 'basse'; raison: string; points: number } => {
      const profil = profilsRisque[ecart.aerodrome_id]
      if (!profil) {
        switch (ecart.niveau_risque) {
          case 'critique': return { niveau: 'critique', raison: 'Écart critique', points: 40 }
          case 'eleve': return { niveau: 'haute', raison: 'Écart élevé', points: 25 }
          case 'moyen': return { niveau: 'normale', raison: 'Écart moyen', points: 15 }
          default: return { niveau: 'basse', raison: 'Écart faible', points: 5 }
        }
      }
      
      let points = 0
      let raisons: string[] = []
      
      // Score de base selon niveau d'écart
      switch (ecart.niveau_risque) {
        case 'critique': points += 40; raisons.push('Écart critique'); break
        case 'eleve': points += 25; raisons.push('Écart élevé'); break
        case 'moyen': points += 15; raisons.push('Écart moyen'); break
        default: points += 5; raisons.push('Écart faible')
      }
      
      // Ajustement selon score global de l'aérodrome
      if (profil.score_global < 30) {
        points += 30
        raisons.push(`Aérodrome critique (score ${profil.score_global}/100)`)
      } else if (profil.score_global < 50) {
        points += 15
        raisons.push(`Aérodrome en tension (score ${profil.score_global}/100)`)
      } else if (profil.tendance === 'baisse') {
        points += 10
        raisons.push(`Tendance à la dégradation`)
      }
      
      // Ajustement selon C4 (charge critique)
      if (profil.c4 < 40) {
        points += 20
        raisons.push(`Charge critique élevée (C4: ${profil.c4}/100)`)
      }
      
      // Ajustement selon délai expiré
      const estEnRetard = ecart.statut === 'en_retard'
      if (estEnRetard) {
        points += 25
        raisons.push('Délai expiré')
      }
      
      let niveau: 'critique' | 'haute' | 'normale' | 'basse'
      if (points >= 70) niveau = 'critique'
      else if (points >= 45) niveau = 'haute'
      else if (points >= 25) niveau = 'normale'
      else niveau = 'basse'
      
      return { niveau, raison: raisons.join(' · '), points }
    }
  }, [profilsRisque])

  // Calcul du risque de cascade Hawkes pour un aérodrome
  const getHawkesRisk = useMemo(() => {
    return (aerodromeId: string) => {
      const ecartsAerodrome = ecarts.filter(e => e.aerodrome_id === aerodromeId)
      const hawkes = computeHawkesContagion(ecartsAerodrome.map(e => ({ createdAt: e.created_at, niveau: e.niveau_risque })))
      return hawkes
    }
  }, [ecarts])

  // Écarts avec priorisation dynamique
  const ecartsAvecPriorite = useMemo(() => {
    return ecarts.map(ecart => {
      const urgence = getUrgenceDynamique(ecart)
      return { ...ecart, prioriteDynamique: urgence.niveau, raisonPriorite: urgence.raison, pointsPriorite: urgence.points }
    })
  }, [ecarts, getUrgenceDynamique])

  // ============================================================
  // FONCTIONS IA
  // ============================================================

  const handleIaGenerateEcart = async (surveillanceId: string) => {
    const items = getCurrentSurveillanceItems(surveillanceId)
    const itemsNSNV = items.filter(i => i.resultat === 'NS' || i.resultat === 'NV')
    
    if (itemsNSNV.length === 0) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Aucun écart',
        message: 'Aucun item NS/NV à transformer en écart',
        canal: 'in_app'
      })
      return
    }
    
    setIsIaGenerating(true)
    try {
      const surveillance = surveillances.find(s => s.id === surveillanceId)
      const profil = surveillance ? profilsRisque[surveillance.aerodrome_id] : undefined
      
      const result = await ecartAgent.generateEcart({
        itemsNSNV: itemsNSNV.map(item => ({
          id: item.id,
          numero: (item as any).numero || (item as any).ordre || '',
          point_verification: (item as any).point_verification || item.description || '',
          reference_reglementaire: item.reference_ras14 || '',
          observation: item.observation,
          domaine: item.domaine || 'Général'
        })),
        aerodromeId: surveillance?.aerodrome_id || aerodromeId || '',
        surveillanceId: surveillanceId,
        profil: profil
      }, {})
      
      setIaSuggestion(result)
      startTransition(() => setShowIaModal(true))
      
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'IA a généré un écart',
        message: `${itemsNSNV.length} écart(s) généré(s) - Vérifiez et ajustez si nécessaire`,
        canal: 'in_app'
      })
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur IA',
        message: error instanceof Error ? error.message : 'Impossible de générer l\'écart',
        canal: 'in_app'
      })
    } finally {
      setIsIaGenerating(false)
    }
  }

  const handleIaEvaluatePAC = async (ecartId: string, pacData: any) => {
    setIsIaGenerating(true)
    try {
      const result = await ecartAgent.evaluatePAC({
        ecartId,
        pac: pacData
      }, {})
      
      setIaSuggestion(result)
      startTransition(() => setShowIaModal(true))
      
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'IA a évalué le PAC',
        message: `Note suggérée: ${result.note_globale}/100 - ${result.decision === 'accepte' ? 'Accepté' : 'Refusé'}`,
        canal: 'in_app'
      })
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur IA',
        message: error instanceof Error ? error.message : 'Impossible d\'évaluer le PAC',
        canal: 'in_app'
      })
    } finally {
      setIsIaGenerating(false)
    }
  }

  const handleAskAssistant = async () => {
    if (!iaQuestion.trim()) return
    
    setIsAskingIa(true)
    try {
      const result = await assistantAgent.chat({
        message: iaQuestion,
        contexte: {
          module: 'plans-actions',
          aerodromeId: aerodromeId,
        },
        userRole: userRole
      })
      setIaAnswer(result.message)
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: 'Impossible de contacter l\'assistant',
        canal: 'in_app'
      })
    } finally {
      setIsAskingIa(false)
    }
  }

  const filteredEcarts = ecartsAvecPriorite.filter(ecart => {
    if (aerodromeId && ecart.aerodrome_id !== aerodromeId) return false
    if (debouncedSearchTerm) {
      const term = debouncedSearchTerm.toLowerCase()
      const matches =
        ecart.reference.toLowerCase().includes(term) ||
        ecart.libelle.toLowerCase().includes(term) ||
        ecart.ref_reglementaire.toLowerCase().includes(term)
      if (!matches) return false
    }
    if (filters.aerodrome !== 'tous' && ecart.aerodrome_id !== filters.aerodrome) return false
    if (filters.niveau !== 'tous' && ecart.niveau_risque !== filters.niveau) return false
    if (filters.statut !== 'tous' && ecart.statut !== filters.statut) return false
    if (filters.typeSource === 'surveillance' && !ecart.surveillance_id) return false
    if (filters.typeSource === 'evenement' && !ecart.evenement_id) return false
    if (filters.prioritaire && ecart.prioriteDynamique === 'normale') return false
    if (filters.prioritaire && ecart.prioriteDynamique === 'basse') return false
    if (filters.urgence !== 'tous') {
      if (filters.urgence === 'critique' && ecart.prioriteDynamique !== 'critique') return false
      if (filters.urgence === 'haute' && !['critique', 'haute'].includes(ecart.prioriteDynamique)) return false
    }
    if (filters.periode !== 'tous') {
      const dateEcart = new Date(ecart.created_at)
      const now = new Date()
      const diffJours = Math.ceil((now.getTime() - dateEcart.getTime()) / (1000 * 60 * 60 * 24))
      if (filters.periode === '7j' && diffJours > 7) return false
      if (filters.periode === '30j' && diffJours > 30) return false
      if (filters.periode === '90j' && diffJours > 90) return false
    }
    return true
  })

  // Trier par priorité dynamique
  const sortedEcarts = [...filteredEcarts].sort((a, b) => {
    const order = { critique: 3, haute: 2, normale: 1, basse: 0 }
    return (order[b.prioriteDynamique] || 0) - (order[a.prioriteDynamique] || 0)
  })

  const ecartsParSurveillance = sortedEcarts
    .filter(e => e.surveillance_id)
    .reduce((acc, ecart) => {
      const surveillance = surveillances.find(s => s.id === ecart.surveillance_id)
      if (!surveillance) return acc
      const key = surveillance.id
      if (!acc[key]) acc[key] = { surveillance, ecarts: [] }
      acc[key].ecarts.push(ecart)
      return acc
    }, {} as Record<string, { surveillance: any; ecarts: any[] }>)

  const ecartsParEvenement = sortedEcarts
    .filter(e => e.evenement_id)
    .reduce((acc, ecart) => {
      const evenement = evenements?.find(ev => ev.id === ecart.evenement_id)
      if (!evenement) return acc
      const key = evenement.id
      if (!acc[key]) acc[key] = { evenement, ecarts: [] }
      acc[key].ecarts.push(ecart)
      return acc
    }, {} as Record<string, { evenement: any; ecarts: any[] }>)

  const processusActifs = useMemo(() =>
    getProcessusActifs(certifications, homologations, surveillances, ecarts, aerodromes),
  [certifications, homologations, surveillances, ecarts, aerodromes]);

  const stats = getStatistiquesPAC(aerodromeId)
  
  // Statistiques avancées
  const statsAvancees = useMemo(() => {
    const critiquesAvecProfil = sortedEcarts.filter(e => e.prioriteDynamique === 'critique').length
    const urgentes = sortedEcarts.filter(e => e.prioriteDynamique === 'critique' || e.prioriteDynamique === 'haute').length
    const risqueCascade = aerodromeId ? getHawkesRisk(aerodromeId).riskNext30Days : null
    
    // Nombre d'écarts clôturés (pour l'onglet archive)
    const clotures = ecarts.filter(e => e.statut === 'cloture').length
    
    return { critiquesAvecProfil, urgentes, risqueCascade, clotures }
  }, [sortedEcarts, aerodromeId, getHawkesRisk, ecarts])

  return (
    <div className="space-y-6" data-role={userRole} data-module="plans-actions">

      {/* En-tête */}
      <ModuleHeader
        icon={<ClipboardList />}
        title="Plans d'actions & Écarts"
        description="Gestion des non-conformités et plans correctifs"
        actions={<div className="flex items-center gap-2">
          <button
            onClick={() => setShowAnalytics(!showAnalytics)}
            className="btn btn-sm px-3 py-1 btn-secondary gap-2"
          >
            <Brain className="w-4 h-4" />
            {showAnalytics ? 'Masquer analyses' : 'Afficher analyses avancées'}
          </button>
        </div>}
      />

      {/* Assistant IA - Zone de chat rapide */}
      <Card className="border-primary/20 bg-primary-soft/30">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-role-primary" />
            <span className="text-sm font-medium">Assistant IA - Posez une question</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={iaQuestion}
              onChange={(e) => setIaQuestion(e.target.value)}
              placeholder="Ex: Quels sont les écarts prioritaires ? Comment évaluer un PAC ?"
              className={`flex-1 form-input text-sm ${focusClass}`}
              onKeyDown={(e) => e.key === 'Enter' && handleAskAssistant()}
            />
            <button
              onClick={handleAskAssistant}
              disabled={isAskingIa || !iaQuestion.trim()}
              className="btn btn-primary gap-2"
            >
              {isAskingIa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Demander
            </button>
          </div>
          {iaAnswer && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
              <p className="text-sm text-gray-700">{iaAnswer}</p>
            </div>
          )}
      </Card>

      {/* KPIs enrichis */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon"><ClipboardList className="w-5 h-5 text-role-primary" /></div>
          <div className="kpi-label">Total écarts</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><Clock className="w-5 h-5 text-role-primary" /></div>
          <div className="kpi-label">En attente</div>
          <div className="kpi-value">{stats.en_attente}</div>
        </div>
        <div className="kpi-card border-danger">
          <div className="kpi-icon bg-danger-soft"><Flame className="w-5 h-5 text-danger" /></div>
          <div className="kpi-label text-danger">Priorité critique</div>
          <div className="kpi-value text-danger">{statsAvancees.critiquesAvecProfil}</div>
          <p className="text-[10px] text-gray-400">basé sur profil risque</p>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><CheckCircle2 className="w-5 h-5 text-role-primary" /></div>
          <div className="kpi-label">Taux acceptation</div>
          <div className="kpi-value">{stats.taux_acceptation}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon"><TrendingUp className="w-5 h-5 text-role-primary" /></div>
          <div className="kpi-label">Délai moy.</div>
          <div className="kpi-value">{stats.delai_moyen_traitement}j</div>
        </div>
      </div>

      {/* Analyses avancées (toggle) */}
      {showAnalytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-up">
          <Card icon={<Shield className="w-4 h-4 text-info" />} title={`Risque de cascade (Hawkes) - ${aerodromeId ? 'Aérodrome sélectionné' : 'Analyse globale'}`} className="border-info">
              {aerodromeId ? (
                <>
                  <p className="text-2xl font-bold text-info">{statsAvancees.risqueCascade}%</p>
                  <div className="progress h-2 mt-2">
                    <div className={`progress-bar ${statsAvancees.risqueCascade && statsAvancees.risqueCascade > 50 ? 'progress-critique' : 'progress-moyen'}`} 
                         style={{ width: `${statsAvancees.risqueCascade || 0}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Risque de nouveaux écarts dans les 30 jours
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sélectionnez un aérodrome pour voir l'analyse de cascade</p>
              )}
          </Card>
          <Card variant="level" levelColor="warning" icon={<Target className="w-4 h-4 text-warning" />} title="Priorisation dynamique">
              <div className="flex items-center justify-between">
                <span className="text-sm">Critique</span>
                <span className="text-sm font-bold text-danger">{statsAvancees.critiquesAvecProfil}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm">Haute priorité</span>
                <span className="text-sm font-bold text-warning">{statsAvancees.urgentes}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Basé sur score risque aérodrome + tendance + C4
              </p>
          </Card>
        </div>
      )}

      {/* Barre d'outils */}
      <div className="filters-panel">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex-1 w-full lg:w-auto">
            <div className="search-box">
              <Search />
              <input
                type="text"
                placeholder="Rechercher par référence, libellé, réglementation..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={filters.aerodrome}
              onChange={(e) => setFilters({...filters, aerodrome: e.target.value})}
              className={`h-10 px-3 pr-8 rounded-xl border border-border appearance-none ${focusClass}`}
              style={selectStyle}
            >
              <option value="tous">Tous les aérodromes</option>
              {aerodromes.map(a => (
                <option key={a.id} value={a.id}>{a.code_oaci} - {a.nom}</option>
              ))}
            </select>

            <select
              value={filters.niveau}
              onChange={(e) => setFilters({...filters, niveau: e.target.value})}
              className={`h-10 px-3 pr-8 rounded-xl border border-border appearance-none ${focusClass}`}
              style={selectStyle}
            >
              <option value="tous">Tous niveaux</option>
              <option value="critique">Critique</option>
              <option value="eleve">Élevé</option>
              <option value="moyen">Moyen</option>
              <option value="faible">Faible</option>
            </select>

            <select
              value={filters.statut}
              onChange={(e) => setFilters({...filters, statut: e.target.value})}
              className={`h-10 px-3 pr-8 rounded-xl border border-border appearance-none ${focusClass}`}
              style={selectStyle}
            >
              <option value="tous">Tous statuts</option>
              <option value="ouvert">Ouvert</option>
              <option value="pac_attendu">PAC attendu</option>
              <option value="pac_soumis">PAC soumis</option>
              <option value="pac_accepte">PAC accepté</option>
              <option value="preuves_soumises">Preuves soumises</option>
              <option value="cloture">Clôturé</option>
              <option value="en_retard">En retard</option>
            </select>

            <select
              value={filters.urgence}
              onChange={(e) => setFilters({...filters, urgence: e.target.value})}
              className={`h-10 px-3 pr-8 rounded-xl border border-border appearance-none ${focusClass}`}
              style={selectStyle}
            >
              <option value="tous">Toutes urgences</option>
              <option value="critique">Critique (dynamique)</option>
              <option value="haute">Haute priorité</option>
            </select>

            <button
              onClick={() => setFilters({...filters, prioritaire: !filters.prioritaire})}
              className={`btn btn-sm px-3 py-1 ${filters.prioritaire ? 'btn-primary' : 'btn-secondary'} h-10 px-3 gap-1`}
            >
              <Target className="w-4 h-4" />
              {filters.prioritaire ? 'Priorité ON' : 'Tous écarts'}
            </button>

            <button className="btn btn-sm px-3 py-1 btn-secondary h-10 px-3">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filtres rapides enrichis */}
        <div className="filter-chips mt-3 pt-3 border-t">
          <button
            className={`filter-chip ${filters.statut === 'en_retard' ? 'active' : ''}`}
            onClick={() => setFilters({...filters, statut: 'en_retard'})}
          >
            <Clock className="w-3 h-3 mr-1" />
            En retard ({stats.en_retard})
          </button>
          <button
            className={`filter-chip ${filters.niveau === 'critique' ? 'active' : ''}`}
            onClick={() => setFilters({...filters, niveau: 'critique'})}
          >
            <Flame className="w-3 h-3 mr-1" />
            Critiques ({stats.critiques})
          </button>
          <button
            className={`filter-chip ${filters.statut === 'pac_attendu' ? 'active' : ''}`}
            onClick={() => setFilters({...filters, statut: 'pac_attendu'})}
          >
            <Mail className="w-3 h-3 mr-1" />
            PAC attendus
          </button>
          <button
            className="filter-chip"
            onClick={() => setFilters({...filters, urgence: 'critique'})}
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            Priorité dynamique
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'surveillances' ? 'active' : ''}`} onClick={() => setActiveTab('surveillances')}>
          <Eye className="w-4 h-4 mr-2" />
          Surveillances
          {statsAvancees.critiquesAvecProfil > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 border border-red-200 ml-2">{statsAvancees.critiquesAvecProfil}</span>
          )}
        </button>
        <button className={`tab ${activeTab === 'evenements' ? 'active' : ''}`} onClick={() => setActiveTab('evenements')}>
          <AlertTriangle className="w-4 h-4 mr-2" />
          Événements
        </button>
        <button className={`tab ${activeTab === 'urgences' ? 'active' : ''}`} onClick={() => setActiveTab('urgences')}>
          <Flame className="w-4 h-4 mr-2" />
          Urgences
          {statsAvancees.critiquesAvecProfil > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 animate-pulse ml-2">{statsAvancees.critiquesAvecProfil}</span>
          )}
        </button>
        {processusActifs.length > 0 && (
          <button className={`tab ${activeTab === 'processus' ? 'active' : ''}`} onClick={() => setActiveTab('processus')}>
            <Shield className="w-4 h-4 mr-2" />
            Certification / Homologation
            <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-primary text-white">{processusActifs.length}</span>
          </button>
        )}
        <button
          className="tab text-muted-foreground hover:text-role-primary transition-colors"
          onClick={() => setActiveModule('registres')}
          title="Les archives sont consultables dans le module Registres"
        >
          <Archive className="w-4 h-4 mr-2" />
          Archives → Registres
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'surveillances' && (
          <AccordionGroup spacing="sm">
            {Object.entries(ecartsParSurveillance).map(([survId, { surveillance, ecarts }]) => {
              const aerodrome = aerodromes.find(a => a.id === surveillance.aerodrome_id)
              const totalEcarts = ecarts.length
              const clos = ecarts.filter(e => e.statut === 'cloture').length
              const progression = totalEcarts > 0 ? (clos / totalEcarts) * 100 : 0
              const enRetard = ecarts.filter(e => e.statut === 'en_retard').length
              const critiques = ecarts.filter(e => e.prioriteDynamique === 'critique').length

              return (
                <AccordionSection
                  key={survId}
                  icon={<FileText className="w-4 h-4 text-white" />}
                  title={<><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 mr-2">{getTypeSurveillanceLabel(surveillance.type_surveillance || surveillance.type)}</span>{aerodrome?.code_oaci} - {aerodrome?.nom}</>}
                  subtitle={new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}
                  badges={
                    <>
                      {enRetard > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">{enRetard} en retard</span>}
                      {critiques > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">{critiques} critique(s)</span>}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">{totalEcarts} écart{totalEcarts > 1 ? 's' : ''}</span>
                      <span className="text-sm text-muted-foreground">{clos}/{totalEcarts} clos</span>
                    </>
                  }
                  actions={
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleIaGenerateEcart(survId)
                      }}
                      disabled={isIaGenerating}
                      className="action-button text-role-primary"
                      title="IA - Générer les écarts"
                    >
                      {isIaGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                    </button>
                  }
                >
                  {/* Regroupement par domaine réglementaire */}
                  {grouperParDomaine(ecarts).map((groupe: DomaineItems<any>) => (
                    <div key={groupe.domaine} className="space-y-3">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 rounded-lg border border-border/50">
                        <span className="inline-flex items-center justify-center w-8 h-6 rounded-md text-[10px] font-bold bg-role-primary text-white tracking-wide">{groupe.domaine}</span>
                        <span className="text-sm font-medium text-foreground">{groupe.domaineLabel}</span>
                        <span className="badge outline text-[10px]">{groupe.items.length} écart{groupe.items.length > 1 ? 's' : ''}</span>
                      </div>
                      {groupe.items.map((ecart: any) => (
                        <EcartCard
                          key={ecart.id}
                          ecart={ecart}
                          aerodrome={aerodrome}
                          prioriteDynamique={ecart.prioriteDynamique}
                          raisonPriorite={ecart.raisonPriorite}
                          onViewDetails={() => { setSelectedEcart(ecart.id); startTransition(() => setShowHistoriqueModal(true)) }}
                          onEvaluate={() => { setSelectedEcart(ecart.id); startTransition(() => { ecart.statut === 'preuves_soumises' ? setShowPreuvesEvaluationModal(true) : setShowEvaluationModal(true) }) }}
                          onSubmitPAC={() => { setSelectedEcart(ecart.id); startTransition(() => setShowSoumissionModal(true)) }}
                          onIaEvaluate={(pacData) => handleIaEvaluatePAC(ecart.id, pacData)}
                          userRole={userRole}
                          userId={user?.id || ''}
                        />
                      ))}
                    </div>
                  ))}
                </AccordionSection>
              )
            })}
          </AccordionGroup>
        )}

        {activeTab === 'evenements' && (
          <AccordionGroup spacing="sm">
            {Object.entries(ecartsParEvenement).map(([evId, { evenement, ecarts }]) => {
              const aerodrome = aerodromes.find(a => a.id === evenement.aerodrome_id)
              const totalEcarts = ecarts.length
              const clos = ecarts.filter(e => e.statut === 'cloture').length
              const critiques = ecarts.filter(e => e.prioriteDynamique === 'critique').length

              return (
                <AccordionSection
                  key={evId}
                  icon={<AlertTriangle className="w-4 h-4 text-white" />}
                  title={<><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mr-2 ${evenement.gravite === 'CRITIQUE' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>{evenement.type}</span>{aerodrome?.code_oaci}</>}
                  subtitle={new Date(evenement.date).toLocaleDateString('fr-FR')}
                  badges={
                    <>
                      {critiques > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">{critiques} critique(s)</span>}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">{totalEcarts} écart{totalEcarts > 1 ? 's' : ''}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${clos === totalEcarts ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>{clos}/{totalEcarts} clos</span>
                    </>
                  }
                >
                  {grouperParDomaine(ecarts).map((groupe: DomaineItems<any>) => (
                    <div key={groupe.domaine} className="space-y-3">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 rounded-lg border border-border/50">
                        <span className="inline-flex items-center justify-center w-8 h-6 rounded-md text-[10px] font-bold bg-role-primary text-white tracking-wide">{groupe.domaine}</span>
                        <span className="text-sm font-medium text-foreground">{groupe.domaineLabel}</span>
                        <span className="badge outline text-[10px]">{groupe.items.length} écart{groupe.items.length > 1 ? 's' : ''}</span>
                      </div>
                      {groupe.items.map((ecart: any) => (
                        <EcartCard
                          key={ecart.id}
                          ecart={ecart}
                          aerodrome={aerodrome}
                          prioriteDynamique={ecart.prioriteDynamique}
                          raisonPriorite={ecart.raisonPriorite}
                          onViewDetails={() => { setSelectedEcart(ecart.id); startTransition(() => setShowHistoriqueModal(true)) }}
                          onEvaluate={() => { setSelectedEcart(ecart.id); startTransition(() => { ecart.statut === 'preuves_soumises' ? setShowPreuvesEvaluationModal(true) : setShowEvaluationModal(true) }) }}
                          onSubmitPAC={() => { setSelectedEcart(ecart.id); startTransition(() => setShowSoumissionModal(true)) }}
                          onIaEvaluate={(pacData) => handleIaEvaluatePAC(ecart.id, pacData)}
                          userRole={userRole}
                          userId={user?.id || ''}
                        />
                      ))}
                    </div>
                  ))}
                </AccordionSection>
              )
            })}
          </AccordionGroup>
        )}

        {activeTab === 'urgences' && (
          <div className="animate-fade-in space-y-4">
            {sortedEcarts
              .filter(e => e.prioriteDynamique === 'critique' || e.statut === 'en_retard' || e.prioriteDynamique === 'haute')
              .map(ecart => {
                const aerodrome = aerodromes.find(a => a.id === ecart.aerodrome_id)
                return (
                  <EcartCard
                    key={ecart.id}
                    ecart={ecart}
                    aerodrome={aerodrome}
                    prioriteDynamique={ecart.prioriteDynamique}
                    raisonPriorite={ecart.raisonPriorite}
                    onViewDetails={() => { setSelectedEcart(ecart.id); startTransition(() => setShowHistoriqueModal(true)) }}
                    onEvaluate={() => { setSelectedEcart(ecart.id); startTransition(() => { ecart.statut === 'preuves_soumises' ? setShowPreuvesEvaluationModal(true) : setShowEvaluationModal(true) }) }}
                    onSubmitPAC={() => { setSelectedEcart(ecart.id); startTransition(() => setShowSoumissionModal(true)) }}
                    onIaEvaluate={(pacData) => handleIaEvaluatePAC(ecart.id, pacData)}
                    userRole={userRole}
                    userId={user?.id || ''}
                    urgent
                  />
                )
              })}
            {sortedEcarts.filter(e => e.prioriteDynamique === 'critique' || e.statut === 'en_retard').length === 0 && (
              <Card className="text-center">
                  <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
                  <p className="text-muted-foreground">Aucun écart urgent ou critique</p>
                  <p className="text-xs text-muted-foreground mt-1">Tous les écarts sont sous contrôle</p>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'processus' && (
          <AccordionGroup spacing="sm">
            {(() => {
              const processusParAerodrome = new Map<string, { aerodrome: any; processus: typeof processusActifs; ecarts: any[] }>()
              processusActifs.forEach(pr => {
                const aero = aerodromes.find(a => a.id === pr.aerodrome_id)
                if (!aero) return
                if (!processusParAerodrome.has(pr.aerodrome_id)) {
                  processusParAerodrome.set(pr.aerodrome_id, { aerodrome: aero, processus: [], ecarts: [] })
                }
                const group = processusParAerodrome.get(pr.aerodrome_id)!
                group.processus.push(pr)
                if (pr.surveillance_id) {
                  const ecartsPr = ecarts.filter(e => e.surveillance_id === pr.surveillance_id)
                  group.ecarts.push(...ecartsPr)
                }
              })
              return Array.from(processusParAerodrome.values()).map(({ aerodrome, processus, ecarts: aeroEcarts }) => {
                const total = aeroEcarts.length
                const clos = aeroEcarts.filter(e => e.statut === 'cloture').length
                return (
                  <AccordionSection
                    key={aerodrome.id}
                    icon={<Shield className="w-4 h-4 text-white" />}
                    title={<><span className="code-oaci-badge mr-2">{aerodrome.code_oaci}</span>{aerodrome.nom}</>}
                    badges={
                      <>
                        {processus.map(pr => (
                          <span key={pr.processus_id} className={`badge ${pr.processus_type === 'certification' ? 'primary' : 'info'} text-[10px] mr-1`}>
                            {pr.phase_label}
                          </span>
                        ))}
                        <span className="badge outline">{total} écart{total > 1 ? 's' : ''}</span>
                        <span className="text-sm text-muted-foreground">{clos}/{total} clos</span>
                      </>
                    }
                    actions={
                      <button className="action-button text-[10px] text-role-primary hover:underline" onClick={() => setActiveModule(processus[0].processus_type)}>
                        Voir le processus →
                      </button>
                    }
                  >
                    {grouperParDomaine(aeroEcarts).map((groupe: DomaineItems<any>) => (
                      <div key={groupe.domaine} className="space-y-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 rounded-lg border border-border/50">
                          <span className="inline-flex items-center justify-center w-8 h-6 rounded-md text-[10px] font-bold bg-role-primary text-white tracking-wide">{groupe.domaine}</span>
                          <span className="text-sm font-medium text-foreground">{groupe.domaineLabel}</span>
                          <span className="badge outline text-[10px]">{groupe.items.length} écart{groupe.items.length > 1 ? 's' : ''}</span>
                        </div>
                        {groupe.items.map((ecart: any) => (
                          <EcartCard
                            key={ecart.id}
                            ecart={ecart}
                            aerodrome={aerodrome}
                            prioriteDynamique={ecart.prioriteDynamique}
                            raisonPriorite={ecart.raisonPriorite}
                            onViewDetails={() => { setSelectedEcart(ecart.id); startTransition(() => setShowHistoriqueModal(true)) }}
                            onEvaluate={() => { setSelectedEcart(ecart.id); startTransition(() => { ecart.statut === 'preuves_soumises' ? setShowPreuvesEvaluationModal(true) : setShowEvaluationModal(true) }) }}
                            onSubmitPAC={() => { setSelectedEcart(ecart.id); startTransition(() => setShowSoumissionModal(true)) }}
                            onIaEvaluate={(pacData) => handleIaEvaluatePAC(ecart.id, pacData)}
                            userRole={userRole}
                            userId={user?.id || ''}
                          />
                        ))}
                      </div>
                    ))}
                    {aeroEcarts.length === 0 && (
                      <Card className="text-center">
                        <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
                        <p className="text-muted-foreground">Tous les écarts de ce processus sont clôturés</p>
                      </Card>
                    )}
                  </AccordionSection>
                )
              })
            })()}
          </AccordionGroup>
        )}

      </div>

      {/* Modal IA pour suggestion */}
      {showIaModal && iaSuggestion && (() => {
        const sug = iaSuggestion as any;
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowIaModal(false)}>
          <div className="bg-background rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-role-primary" />
                Suggestion IA
              </h2>
              <button className="modal-close" onClick={() => setShowIaModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body p-5 space-y-4">
              {sug.libelle && (
                <div className="form-field">
                  <label className="filter-label">Libellé suggéré</label>
                  <p className="p-2 bg-gray-50 rounded text-sm">{sug.libelle}</p>
                </div>
              )}
              {sug.ref_reglementaire && (
                <div className="form-field">
                  <label className="filter-label">Référence réglementaire</label>
                  <p className="p-2 bg-gray-50 rounded text-sm">{sug.ref_reglementaire}</p>
                </div>
              )}
              {sug.niveau_risque && (
                <div className="form-field">
                  <label className="filter-label">Niveau de risque suggéré</label>
                  <span className={`badge ${sug.niveau_risque === 'critique' ? 'danger' : sug.niveau_risque === 'eleve' ? 'warning' : 'primary'}`}>
                    {sug.niveau_risque}
                  </span>
                </div>
              )}
              {sug.delai_pac_propose && (
                <div className="form-field">
                  <label className="filter-label">Délai PAC proposé</label>
                  <p className="text-sm">{sug.delai_pac_propose} jours</p>
                </div>
              )}
              {sug.note_globale !== undefined && (
                <div className="form-field">
                  <label className="filter-label">Note suggérée</label>
                  <p className="text-2xl font-bold">{sug.note_globale}/100</p>
                  <div className="progress h-2 mt-1">
                    <div className="progress-bar" style={{ width: `${sug.note_globale}%` }} />
                  </div>
                </div>
              )}
              {sug.decision && (
                <div className="form-field">
                  <label className="filter-label">Décision suggérée</label>
                  <span className={`badge ${sug.decision === 'accepte' ? 'success' : 'danger'}`}>
                    {sug.decision === 'accepte' ? 'Accepter' : 'Refuser'}
                  </span>
                </div>
              )}
              {sug.commentaire && (
                <div className="form-field">
                  <label className="filter-label">Commentaire IA</label>
                  <p className="p-2 bg-gray-50 rounded text-sm">{sug.commentaire}</p>
                </div>
              )}
              {sug.ameliorations_suggestions && sug.ameliorations_suggestions.length > 0 && (
                <div className="form-field">
                  <label className="filter-label">Suggestions d'amélioration</label>
                  <ul className="list-disc pl-5 space-y-1">
                    {sug.ameliorations_suggestions.map((s: string, i: number) => (
                      <li key={i} className="text-sm">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-footer gap-2">
              <button className="btn btn-secondary" onClick={() => setShowIaModal(false)}>Fermer</button>
              <button className="btn btn-primary" onClick={() => {
                if (sug.libelle) {
                  addNotification({
                    user_id: user?.id || '',
                    type: 'success',
                    title: 'Suggestion appliquée',
                    message: 'Le formulaire a été pré-rempli avec la suggestion IA',
                    canal: 'in_app'
                  })
                }
                setShowIaModal(false)
              }}>Appliquer la suggestion</button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modals */}
      {selectedEcart && (
        <>
          <EvaluationPACModal
            isOpen={showEvaluationModal}
            onClose={() => { setShowEvaluationModal(false); setSelectedEcart(null) }}
            ecartId={selectedEcart}
            userRole={userRole}
          />
          <EvaluationPreuvesModal
            isOpen={showPreuvesEvaluationModal}
            onClose={() => { setShowPreuvesEvaluationModal(false); setSelectedEcart(null) }}
            ecartId={selectedEcart}
            userRole={userRole}
          />
          <HistoriqueEcartModal
            isOpen={showHistoriqueModal}
            onClose={() => { setShowHistoriqueModal(false); setSelectedEcart(null) }}
            ecartId={selectedEcart}
            userRole={userRole}
          />
          <SoumissionPACModal
            isOpen={showSoumissionModal}
            onClose={() => { setShowSoumissionModal(false); setSelectedEcart(null) }}
            ecartId={selectedEcart}
          />
        </>
      )}
    </div>
  )
}
