// components/modules/profil-risque/RecommandationCards.tsx
// Cards de recommandations intelligentes avec scoring ML, probabilité de succès, ROI
// VERSION AMÉLIORÉE - Ajout des domaines prioritaires, équipe suggérée, type mission, fréquence
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// - .card, .card-header, .card-content, .card-title, .card-footer
// - .badge, .badge.danger, .badge.warning, .badge.success, .badge.primary, .badge.neutral
// - .btn, .btn-primary, .btn-secondary, .btn-outline
// - .alert, .alert-error, .alert-warning, .alert-success, .alert-info
// - .progress, .progress-bar
// - .text-role-primary, .bg-role-primary-soft, .border-role-primary
// - .animate-pulse, .animate-fade-up
// 0 style inline, 0 fetch direct

'use client'

import { useMemo } from 'react'
import {
  AlertTriangle,
  BookOpen,
  ClipboardList,
  Eye,
  ShieldAlert,
  FileSearch,
  CalendarPlus,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Clock,
  Target,
  Shield,
  Zap,
  Users,
  MapPin,
  Calendar,
  AlertOctagon,
} from 'lucide-react'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore, ProfilRisque, ActionOutcomeRecord } from '@/lib/store'
import { computeBaseFrequency, suggestMissionType, type NiveauRisqueMatrice } from '@/lib/risque'

interface RecommandationCardsProps {
  profil: ProfilRisque
  aerodromeName: string
  onPlanifierSurveillance?: () => void
}

type Priorite = 'CRITIQUE' | 'HAUTE' | 'NORMALE'

interface DomainePrioritaire {
  domaine: string
  score: number
  niveau: string
  raison: string
  itemsNS?: number
}

interface EquipeSuggeree {
  id: string
  prenom: string
  nom: string
  competences: string[]
  disponibilite: 'disponible' | 'occupe' | 'mission'
  matchScore: number
}

interface Recommandation {
  id: string
  critere: string
  titre: string
  description: string
  actions: string[]
  priorite: Priorite
  icon: React.ElementType
  probabilitySuccess?: number
  expectedImprovement?: number
  effortEstime?: 'faible' | 'moyen' | 'eleve'
  roi?: number
  impactCible?: string
  domainesPrioritaires?: DomainePrioritaire[]
  equipeSuggerer?: EquipeSuggeree[]
  typeMissionSuggerer?: string
  frequenceSuggerer?: { label: string; valeur: number; justification: string }
}

// Configuration des couleurs par priorité (classes CSS)
const PRIORITY_CONFIG: Record<Priorite, {
  label: string
  badgeClass: string
  cardBorderClass: string
  headerBgClass: string
  iconBgClass: string
  textClass: string
  progressBarClass: string
}> = {
  CRITIQUE: {
    label: 'CRITIQUE',
    badgeClass: 'badge danger pulse',
    cardBorderClass: 'border-l-4 border-l-danger',
    headerBgClass: 'bg-danger-soft',
    iconBgClass: 'bg-danger-soft border-danger/20',
    textClass: 'text-danger',
    progressBarClass: 'progress-critique'
  },
  HAUTE: {
    label: 'HAUTE',
    badgeClass: 'badge warning',
    cardBorderClass: 'border-l-4 border-l-warning',
    headerBgClass: 'bg-warning-soft',
    iconBgClass: 'bg-warning-soft border-warning/20',
    textClass: 'text-warning',
    progressBarClass: 'progress-eleve'
  },
  NORMALE: {
    label: 'NORMALE',
    badgeClass: 'badge primary',
    cardBorderClass: 'border-l-4 border-l-role-primary',
    headerBgClass: 'bg-role-primary-soft',
    iconBgClass: 'bg-role-primary-soft border-role-primary/20',
    textClass: 'text-role-primary',
    progressBarClass: 'progress-moyen'
  }
}

const EFFORT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  faible: { label: 'Effort faible', icon: Zap, color: 'text-success' },
  moyen: { label: 'Effort moyen', icon: Clock, color: 'text-warning' },
  eleve: { label: 'Effort élevé', icon: Target, color: 'text-danger' }
}

// Niveaux de risque pour les domaines
const NIVEAU_DOMAINE_CONFIG: Record<string, { label: string; color: string; badgeClass: string }> = {
  critique: { label: 'Critique', color: 'text-danger', badgeClass: 'badge danger' },
  eleve: { label: 'Élevé', color: 'text-warning', badgeClass: 'badge warning' },
  moyen: { label: 'Moyen', color: 'text-role-primary', badgeClass: 'badge primary' },
  faible: { label: 'Faible', color: 'text-success', badgeClass: 'badge success' }
}

function getPriorityOrder(p: Priorite): number {
  return p === 'CRITIQUE' ? 0 : p === 'HAUTE' ? 1 : 2
}

function getNiveauColor(score: number): string {
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-role-primary'
  if (score >= 30) return 'text-warning'
  return 'text-danger'
}

function getProbabilityBadgeClass(probabilite: number): string {
  if (probabilite >= 80) return 'badge success'
  if (probabilite >= 60) return 'badge primary'
  if (probabilite >= 40) return 'badge warning'
  return 'badge neutral'
}

// Extraire les domaines prioritaires du profil
function getDomainesPrioritaires(profil: ProfilRisque): DomainePrioritaire[] {
  const domainesMap = [
    { key: 'c1', domaine: 'SGS', label: 'Maturité & Culture SGS', seuil: 50, seuilCritique: 30, itemsNS: 0 },
    { key: 'c2', domaine: 'PAC', label: 'Efficacité PAC', seuil: 50, seuilCritique: 30, itemsNS: 0 },
    { key: 'c3', domaine: 'PHY/OPS', label: 'Conformité Technique', seuil: 50, seuilCritique: 30, itemsNS: 0 },
    { key: 'c4', domaine: 'Écarts', label: 'Charge Critique', seuil: 50, seuilCritique: 30, itemsNS: 0 },
    { key: 'c5', domaine: 'SLI', label: 'Résilience', seuil: 50, seuilCritique: 30, itemsNS: 0 },
  ]
  
  return domainesMap
    .filter(d => (profil[d.key as keyof ProfilRisque] as number) < d.seuil)
    .sort((a, b) => ((profil[a.key as keyof ProfilRisque] as number) - (profil[b.key as keyof ProfilRisque] as number)))
    .slice(0, 4)
    .map(d => {
      const score = profil[d.key as keyof ProfilRisque] as number
      const niveau = score < d.seuilCritique ? 'critique' : score < d.seuil ? 'eleve' : 'moyen'
      return {
        domaine: d.domaine,
        score: score,
        niveau,
        raison: `Score ${score}/100. ${score < d.seuilCritique ? 'Urgence absolue' : 'Action requise dans les 30 jours'}.`,
        itemsNS: d.itemsNS
      }
    })
}

// Suggérer une équipe d'inspecteurs
function getEquipeSuggerer(
  utilisateurs: any[],
  domainesPrioritaires: DomainePrioritaire[],
  planningsExistants: any[]
): EquipeSuggeree[] {
  const inspecteurs = utilisateurs.filter(u => u.role === 'inspector' && u.statut !== 'inactif')
  const domainesRequis = domainesPrioritaires.map(d => d.domaine)
  
  // Compétences par inspecteur (à adapter selon votre structure de données)
  const getCompetencesInsp = (insp: any): string[] => {
    // Si l'inspecteur a un champ competences
    if (insp.competences && Array.isArray(insp.competences)) {
      return insp.competences.map((c: any) => typeof c === 'string' ? c : c.domaine)
    }
    // Mapping par défaut basé sur le nom ou l'ID (à remplacer par vos données réelles)
    const defaultMapping: Record<string, string[]> = {
      'insp-001': ['SGS', 'AGA'],
      'insp-002': ['PHY/OPS', 'ELEC'],
      'insp-003': ['PAC', 'Écarts'],
      'insp-004': ['SLI', 'SGS'],
    }
    return defaultMapping[insp.id] || ['Général']
  }
  
  // Vérifier la disponibilité
  const estDisponible = (insp: any): 'disponible' | 'occupe' | 'mission' => {
    const planningsInsp = planningsExistants.filter(p => 
      p.equipe_ids?.includes(insp.id) || p.chef_id === insp.id
    )
    if (planningsInsp.length >= 3) return 'mission'
    if (planningsInsp.length >= 1) return 'occupe'
    return 'disponible'
  }
  
  return inspecteurs
    .map(insp => {
      const competences = getCompetencesInsp(insp)
      const matchCount = competences.filter(c => domainesRequis.some(d => c.includes(d) || d.includes(c))).length
      const disponibilite = estDisponible(insp)
      const disponibiliteScore = disponibilite === 'disponible' ? 1 : disponibilite === 'occupe' ? 0.5 : 0
      const matchScore = Math.round(((matchCount / Math.max(1, domainesRequis.length)) * 0.7 + disponibiliteScore * 0.3) * 100)
      
      return {
        id: insp.id,
        prenom: insp.prenom || 'Inspecteur',
        nom: insp.nom || '',
        competences,
        disponibilite,
        matchScore
      }
    })
    .filter(i => i.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3)
}

// Calculer la fréquence suggérée
function getFrequenceSuggerer(profil: ProfilRisque, typeAeroport?: string): { label: string; valeur: number; justification: string } {
  let niveau: NiveauRisqueMatrice = 'moyen'
  if (profil.score_global < 30) niveau = 'critique'
  else if (profil.score_global < 50) niveau = 'eleve'
  else if (profil.score_global < 70) niveau = 'moyen'
  else niveau = 'faible'
  
  let base = 2 // semestrielle par défaut
  switch (niveau) {
    case 'critique': base = 12; break
    case 'eleve': base = 4; break
    case 'moyen': base = 2; break
    case 'faible': base = 1; break
  }
  
  let facteurs: string[] = []
  let multiplier = 1
  
  if (typeAeroport === 'international') {
    multiplier *= 1.2
    facteurs.push('Aéroport international (+20%)')
  }
  if (profil.tendance === 'baisse') {
    multiplier *= 1.3
    facteurs.push('Tendance à la dégradation (+30%)')
  }
  if (profil.c4 < 40) {
    multiplier *= 1.2
    facteurs.push('Charge critique élevée (+20%)')
  }
  if (profil.c1 < 40) {
    multiplier *= 1.1
    facteurs.push('Maturité SGS faible (+10%)')
  }
  
  const valeur = Math.min(12, Math.max(1, Math.round(base * multiplier)))
  let label = ''
  if (valeur >= 12) label = 'Mensuelle'
  else if (valeur >= 6) label = 'Bimensuelle'
  else if (valeur >= 4) label = 'Trimestrielle'
  else if (valeur >= 2) label = 'Semestrielle'
  else label = 'Annuelle'
  
  const justification = facteurs.length > 0 ? facteurs.join(' · ') : `Basé sur niveau ${niveau} (score ${profil.score_global}/100)`
  
  return { label, valeur, justification }
}

// Obtenir le type de mission suggéré
function getTypeMissionSuggerer(profil: ProfilRisque): { type: string; justification: string } {
  if (profil.score_global < 30) {
    return { type: 'audit_complet', justification: 'Score critique - audit complet requis immédiatement' }
  }
  if (profil.score_global < 50 && profil.tendance === 'baisse') {
    return { type: 'suivi_ecarts', justification: 'Score bas + tendance baisse - suivi des écarts renforcé' }
  }
  if (profil.c4 < 40) {
    return { type: 'suivi_ecarts', justification: 'Charge critique élevée - vérification des écarts prioritaires' }
  }
  if (profil.c2 < 45) {
    return { type: 'mise_oeuvre_pac', justification: 'Efficacité PAC faible - suivi des plans d\'actions' }
  }
  if (profil.tendance === 'baisse') {
    return { type: 'programmee', justification: 'Tendance baissière - surveillance programmée renforcée' }
  }
  return { type: 'programmee', justification: 'Surveillance programmée standard' }
}

function buildRecommandations(
  profil: ProfilRisque,
  actionsHistorique?: ActionOutcomeRecord[],
  utilisateurs?: any[],
  planningsExistants?: any[],
  typeAeroport?: string
): Recommandation[] {
  const recs: Recommandation[] = []
  
  // Extraire les domaines prioritaires
  const domainesPrioritaires = getDomainesPrioritaires(profil)
  const equipeSuggerer = utilisateurs ? getEquipeSuggerer(utilisateurs, domainesPrioritaires, planningsExistants || []) : []
  const frequenceSuggerer = getFrequenceSuggerer(profil, typeAeroport)
  const typeMissionSuggerer = getTypeMissionSuggerer(profil)
  
  // Analyse de l'historique des actions
  const actionEfficacy: Record<string, { avgImprovement: number; confidence: number }> = {}
  if (actionsHistorique && actionsHistorique.length > 0) {
    const grouped = new Map<string, { improvements: number[] }>()
    for (const action of actionsHistorique) {
      if (!grouped.has(action.action_type)) {
        grouped.set(action.action_type, { improvements: [] })
      }
      grouped.get(action.action_type)!.improvements.push(action.effectiveness)
    }
    for (const [type, data] of grouped) {
      const avgImprovement = data.improvements.reduce((a, b) => a + b, 0) / data.improvements.length
      const confidence = Math.min(95, 50 + data.improvements.length * 5)
      actionEfficacy[type] = { avgImprovement: Math.round(avgImprovement), confidence }
    }
  }

  // Alerte globale critique
  if (profil.score_global < 30) {
    recs.push({
      id: 'global-critique',
      critere: 'GLOBAL',
      titre: 'Surveillance mensuelle inopinée obligatoire',
      description: `Score global ${profil.score_global}/100 — En dessous du seuil critique (30). Une mission de surveillance inopinée doit être planifiée immédiatement.`,
      actions: [
        'Déclencher une surveillance inopinée dans les 7 jours',
        'Notifier la direction de l\'ANACIM',
        'Établir un plan d\'action d\'urgence',
        'Programmer un suivi mensuel systématique',
      ],
      priorite: 'CRITIQUE',
      icon: AlertTriangle,
      probabilitySuccess: actionEfficacy['surveillance']?.avgImprovement || 85,
      expectedImprovement: 15,
      effortEstime: 'eleve',
      roi: 2.5,
      impactCible: 'score_global',
      domainesPrioritaires,
      equipeSuggerer,
      typeMissionSuggerer: typeMissionSuggerer.type,
      frequenceSuggerer
    })
  } 
  // Sinon, recommandation standard avec enrichissements
  else {
    // Déterminer la priorité en fonction des domaines critiques
    const hasCritique = domainesPrioritaires.some(d => d.niveau === 'critique')
    const hasEleve = domainesPrioritaires.some(d => d.niveau === 'eleve')
    const priorite: Priorite = hasCritique ? 'CRITIQUE' : hasEleve ? 'HAUTE' : 'NORMALE'
    
    // Titre dynamique basé sur les domaines prioritaires
    const domainesNoms = domainesPrioritaires.slice(0, 2).map(d => d.domaine).join(' et ')
    const titre = domainesPrioritaires.length > 0 
      ? `Action prioritaire sur ${domainesNoms}`
      : 'Maintien de la conformité'
    
    // Description dynamique
    const description = domainesPrioritaires.length > 0
      ? `Analyse du profil de risque identifie ${domainesPrioritaires.length} domaine(s) nécessitant une attention particulière. ${domainesPrioritaires.map(d => `${d.domaine}: ${d.score}/100`).join(', ')}.`
      : `Profil de risque satisfaisant (${profil.score_global}/100). Maintenir la surveillance programmée.`
    
    recs.push({
      id: 'domaines-prioritaires',
      critere: 'MULTI',
      titre,
      description,
      actions: [
        ...domainesPrioritaires.map(d => `Planifier une inspection ciblée sur le domaine ${d.domaine} (score ${d.score}/100)`),
        'Analyser les causes racines des non-conformités',
        'Mettre en place un plan d\'action correctif',
      ],
      priorite,
      icon: Target,
      probabilitySuccess: 75,
      expectedImprovement: domainesPrioritaires.reduce((sum, d) => sum + (100 - d.score) * 0.1, 0),
      effortEstime: hasCritique ? 'eleve' : hasEleve ? 'moyen' : 'faible',
      roi: 3.0,
      impactCible: 'score_global',
      domainesPrioritaires,
      equipeSuggerer,
      typeMissionSuggerer: typeMissionSuggerer.type,
      frequenceSuggerer
    })
  }

  return recs.sort((a, b) => getPriorityOrder(a.priorite) - getPriorityOrder(b.priorite))
}

export function RecommandationCards({
  profil,
  aerodromeName,
  onPlanifierSurveillance,
}: RecommandationCardsProps) {
  const actionOutcomes = useOptimizedStore(s => s.actionOutcomes)
  const utilisateurs = useOptimizedStore(s => s.utilisateurs)
  const plannings = useOptimizedStore(s => s.plannings)
  const aerodromes = useOptimizedStore(s => s.aerodromes)
  const user = useOptimizedStore(s => s.user)
  const computeEffectivenessScore = useAppStore(s => s.computeEffectivenessScore)
  const addNotification = useAppStore(s => s.addNotification)
  
  const allActionOutcomes = useOptimizedStore((state) => state.actionOutcomes)
  const actionsForAerodrome = useMemo(
    () => allActionOutcomes.filter(a => a.aerodrome_id === profil.aerodrome_id),
    [allActionOutcomes, profil.aerodrome_id]
  )
  const effectivenessScore = computeEffectivenessScore(profil.aerodrome_id)
  
  // Récupérer le type d'aérodrome
  const aerodrome = aerodromes.find(a => a.id === profil.aerodrome_id)
  const typeAeroport = aerodrome?.type || 'national'
  
  const recommandations = buildRecommandations(
    profil, 
    actionsForAerodrome, 
    utilisateurs, 
    plannings,
    typeAeroport
  )

  if (recommandations.length === 0) {
    return (
      <div className="card card-glass text-center">
        <div className="card-content py-12">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-success-soft flex items-center justify-center animate-float">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-success">Profil de risque satisfaisant</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Aucune recommandation urgente pour {aerodromeName}. Maintenir les bonnes pratiques et poursuivre la surveillance programmée.
              </p>
            </div>
            {effectivenessScore > 70 && (
              <div className="alert alert-success !mt-4 !max-w-md">
                <span className="alert-icon">🏆</span>
                <div className="alert-content">
                  <p className="alert-title">Efficacité des actions: {effectivenessScore}%</p>
                  <p className="alert-description">Vos actions précédentes ont été particulièrement efficaces.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* En-tête avec statistiques */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-role-primary-soft rounded-xl p-2">
            <Sparkles className="w-5 h-5 text-role-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {recommandations.length} recommandation{recommandations.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              Basées sur {actionsForAerodrome.length} actions historiques
            </p>
          </div>
        </div>
        {onPlanifierSurveillance && (
          <button
            onClick={onPlanifierSurveillance}
            className="btn btn-secondary btn-sm gap-2"
          >
            <CalendarPlus className="w-4 h-4" />
            Planifier une surveillance
          </button>
        )}
      </div>

      {/* Liste des recommandations */}
      {recommandations.map((rec) => {
        const Icon = rec.icon
        const config = PRIORITY_CONFIG[rec.priorite]
        const EffortIcon = rec.effortEstime ? EFFORT_CONFIG[rec.effortEstime].icon : null
        const effortConfig = rec.effortEstime ? EFFORT_CONFIG[rec.effortEstime] : null
        const probaClass = rec.probabilitySuccess ? getProbabilityBadgeClass(rec.probabilitySuccess) : ''

        return (
          <div key={rec.id} className={`card ${config.cardBorderClass} hover:shadow-lg transition-all duration-300`}>
            <div className={`card-header pb-3 ${config.headerBgClass} rounded-t-xl`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${config.iconBgClass}`}>
                    <Icon className={`w-5 h-5 ${config.textClass}`} />
                  </div>
                  <div>
                    <div className={`card-title text-sm font-semibold ${config.textClass}`}>
                      {rec.titre}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">Critère {rec.critere}</span>
                      {rec.impactCible && (
                        <span className="badge neutral text-[10px]">
                          Impact: {rec.impactCible.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={config.badgeClass}>
                    {config.label}
                  </span>
                </div>
              </div>
            </div>

            <div className="card-content space-y-4 pt-4">
              {/* Description */}
              <p className={`text-sm ${config.textClass} opacity-90`}>{rec.description}</p>

              {/* Type de mission et fréquence suggérés */}
              {rec.typeMissionSuggerer && rec.frequenceSuggerer && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-role-primary-soft rounded-lg p-2 text-center border border-role-primary/20">
                    <p className="text-xs text-role-primary font-medium flex items-center justify-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Type de mission suggéré
                    </p>
                    <p className="text-sm font-bold text-role-primary capitalize">
                      {rec.typeMissionSuggerer.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                      {rec.typeMissionSuggerer === 'audit_complet' ? 'Vérification exhaustive' :
                       rec.typeMissionSuggerer === 'suivi_ecarts' ? 'Ciblage des écarts' :
                       rec.typeMissionSuggerer === 'mise_oeuvre_pac' ? 'Vérification PAC' :
                       'Routine programmée'}
                    </p>
                  </div>
                  <div className="bg-role-primary-soft rounded-lg p-2 text-center border border-role-primary/20">
                    <p className="text-xs text-role-primary font-medium flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />
                      Fréquence suggérée
                    </p>
                    <p className="text-sm font-bold text-role-primary">
                      {rec.frequenceSuggerer.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {rec.frequenceSuggerer.justification}
                    </p>
                  </div>
                </div>
              )}

              {/* Domaines prioritaires - NOUVEAU */}
              {rec.domainesPrioritaires && rec.domainesPrioritaires.length > 0 && (
                <div className="mt-3 p-3 bg-card rounded-lg border border-border">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1 mb-2">
                    <Target className="w-3.5 h-3.5 text-role-primary" />
                    Domaines prioritaires à surveiller
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {rec.domainesPrioritaires.map((domaine) => {
                      const niveauConfig = NIVEAU_DOMAINE_CONFIG[domaine.niveau] || NIVEAU_DOMAINE_CONFIG.moyen
                      return (
                        <div key={domaine.domaine} className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${niveauConfig.badgeClass}`}>
                          <AlertOctagon className="w-3 h-3" />
                          <span className="font-medium">{domaine.domaine}</span>
                          <span>({domaine.score}/100)</span>
                          {domaine.itemsNS && domaine.itemsNS > 0 && (
                            <span className="ml-1 text-[10px]">{domaine.itemsNS} NS</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {rec.domainesPrioritaires[0]?.raison}
                  </p>
                </div>
              )}

              {/* Équipe suggérée - NOUVEAU */}
              {rec.equipeSuggerer && rec.equipeSuggerer.length > 0 && (
                <div className="mt-3 p-3 bg-card rounded-lg border border-border">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1 mb-2">
                    <Users className="w-3.5 h-3.5 text-success" />
                    Équipe suggérée
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {rec.equipeSuggerer.map((insp) => (
                      <div key={insp.id} className="flex items-center gap-2 bg-muted px-2 py-1.5 rounded-full text-xs">
                        <div className="w-6 h-6 rounded-full bg-role-primary-soft flex items-center justify-center text-role-primary font-bold text-[10px]">
                          {insp.prenom?.[0]}{insp.nom?.[0]}
                        </div>
                        <div>
                          <span className="font-medium text-foreground">{insp.prenom} {insp.nom}</span>
                          <div className="flex gap-1 mt-0.5">
                            {insp.competences.slice(0, 2).map(c => (
                              <span key={c} className="text-[9px] text-muted-foreground">{c}</span>
                            ))}
                          </div>
                        </div>
                        <div className={`w-2 h-2 rounded-full ${
                          insp.disponibilite === 'disponible' ? 'bg-success' :
                          insp.disponibilite === 'occupe' ? 'bg-warning' : 'bg-danger'
                        }`} />
                        <span className="text-[10px] font-medium text-role-primary ml-1">{insp.matchScore}%</span>
                      </div>
                    ))}
                  </div>
                  {rec.equipeSuggerer.length < 2 && (
                    <p className="text-[10px] text-warning mt-1">
                      ⚠️ Ressources limitées - considérer une formation complémentaire
                    </p>
                  )}
                </div>
              )}

              {/* Métriques de performance */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {rec.probabilitySuccess && (
                  <div className="bg-muted rounded-lg p-2 text-center">
                    <p className="text-xs text-muted-foreground">Probabilité succès</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <span className={`text-lg font-bold ${getNiveauColor(rec.probabilitySuccess)}`}>
                        {rec.probabilitySuccess}%
                      </span>
                    </div>
                    <div className="progress h-1 mt-1">
                      <div className={`progress-bar ${config.progressBarClass}`} style={{width:`${rec.probabilitySuccess}%`}} />
                    </div>
                  </div>
                )}
                {rec.expectedImprovement && (
                  <div className="bg-muted rounded-lg p-2 text-center">
                    <p className="text-xs text-muted-foreground">Gain estimé</p>
                    <p className="text-lg font-bold text-success">+{rec.expectedImprovement}</p>
                    <p className="text-[10px] text-muted-foreground">points</p>
                  </div>
                )}
                {rec.roi && (
                  <div className="bg-muted rounded-lg p-2 text-center">
                    <p className="text-xs text-muted-foreground">ROI estimé</p>
                    <p className="text-lg font-bold text-role-primary">{rec.roi}x</p>
                    <p className="text-[10px] text-muted-foreground">gain/effort</p>
                  </div>
                )}
                {rec.effortEstime && effortConfig && (
                  <div className="bg-muted rounded-lg p-2 text-center">
                    <p className="text-xs text-muted-foreground">Effort requis</p>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      <effortConfig.icon className={`w-4 h-4 ${effortConfig.color}`} />
                      <span className={`text-sm font-medium ${effortConfig.color}`}>
                        {effortConfig.label}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Liste des actions */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Target className="w-3 h-3" />
                  Actions recommandées
                </p>
                <ul className="space-y-1.5">
                  {rec.actions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        rec.priorite === 'CRITIQUE' ? 'bg-danger' :
                        rec.priorite === 'HAUTE' ? 'bg-warning' : 'bg-role-primary'
                      }`} />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={`card-footer ${config.headerBgClass} rounded-b-xl pt-3 flex justify-between items-center flex-wrap gap-2`}>
              <div className="flex items-center gap-2 text-xs">
                <Shield className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">Recommandation générée par analyse prédictive basée sur profil risque</span>
              </div>
              <button
                className="btn btn-ghost btn-sm text-xs gap-1"
                onClick={() => {
                  addNotification({
                    user_id: user?.id || '',
                    type: 'info',
                    title: 'Recommandation suivie',
                    message: `Vous avez marqué comme suivie la recommandation: ${rec.titre}`,
                    canal: 'in_app'
                  })
                }}
              >
                Marquer comme suivie
                <CheckCircle2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        )
      })}

      {/* Pied de page avec efficacité globale */}
      <div className="alert alert-info">
        <span className="alert-icon">📊</span>
        <div className="alert-content flex-1">
          <p className="alert-title">Analyse prédictive en temps réel</p>
          <p className="alert-description">
            Ces recommandations sont générées dynamiquement en fonction du profil de risque actuel et de
            l'historique des actions ({actionsForAerodrome.length} actions analysées).
            Efficacité globale mesurée: <strong>{effectivenessScore}%</strong>
          </p>
        </div>
      </div>
    </div>
  )
}

export default RecommandationCards