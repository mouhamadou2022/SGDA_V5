// components/layout/CommandPalette.tsx — SGDA V5
// Palette de commandes Cmd+K / Ctrl+K avec IA intégrée
// Recherche universelle + Commandes IA + Navigation intelligente
// Design premium avec espacements optimisés

'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  LayoutDashboard, Plane, ShieldCheck, CalendarDays, ClipboardList,
  BarChart3, FileSignature, AlertTriangle, MessageSquare, Users,
  Search, Settings, BookOpen, Wrench, FileText, ChevronRight, Hash,
  Command, Sparkles, Rocket, Brain, Target, Zap, Globe, Mic,
  PenLine, CheckSquare, ListTodo, Quote, Info, AlertCircle,
  Download, Upload, Save, Printer, Eye, Sun, Moon, Maximize2,
  Minimize2, History, RotateCcw, RotateCw, FolderTree, HelpCircle,
  Loader2, TrendingUp, TrendingDown, Minus, Shield, Scale,
  GraduationCap, Archive, Eye as EyeIcon, AlertOctagon, MapPin,
  Calendar, User, CheckCircle, XCircle, Clock, FileCheck,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useAppStore } from '@/lib/store'
import { Badge } from '@/components/ui/badge'
import { assistantAgent } from '@/lib/ia/agents/assistantAgent'
import { riskAgent } from '@/lib/ia/agents/riskAgent'
import { registreAgent } from '@/lib/ia/agents/registreAgent'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface Command {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  module?: string
  action?: () => void | Promise<void>
  keywords?: string[]
  badge?: { label: string; variant: string }
  category?: 'navigation' | 'ia' | 'recherche' | 'action'
}

interface SearchResult {
  id: string
  type: 'aerodrome' | 'surveillance' | 'ecart' | 'certification' | 'homologation' | 'document' | 'evenement' | 'formation'
  title: string
  subtitle: string
  icon: React.ReactNode
  badge?: string
  badgeVariant?: string
  action: () => void
  score: number
}

interface IaSuggestion {
  id: string
  type: 'analyse' | 'recommandation' | 'alerte' | 'rappel'
  message: string
  icon: React.ReactNode
  action: () => void
  confidence: number
}

interface CommandPaletteProps {
  onNavigate?: (module: string, params?: any) => void
  onIaCommand?: (command: string) => void
  currentContext?: {
    module?: string
    aerodromeId?: string
    surveillanceId?: string
    ecartId?: string
  }
}

// ─────────────────────────────────────────────────────────────
// COMMANDES STATIQUES
// ─────────────────────────────────────────────────────────────

const NAVIGATION_COMMANDS: Command[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard className="w-4 h-4" />, module: 'dashboard', keywords: ['accueil', 'home'], category: 'navigation' },
  { id: 'aerodromes', label: 'Aérodromes', icon: <Plane className="w-4 h-4" />, module: 'aerodromes', keywords: ['airports', 'oaci'], category: 'navigation' },
  { id: 'certification', label: 'Certification', icon: <ShieldCheck className="w-4 h-4" />, module: 'certification', category: 'navigation' },
  { id: 'homologation', label: 'Homologation', icon: <Scale className="w-4 h-4" />, module: 'homologation', category: 'navigation' },
  { id: 'planning', label: 'Planning', icon: <CalendarDays className="w-4 h-4" />, module: 'planning', keywords: ['calendrier', 'schedule'], category: 'navigation' },
  { id: 'surveillance', label: 'Surveillance', icon: <ClipboardList className="w-4 h-4" />, module: 'surveillance', keywords: ['surveillance', 'checklist'], category: 'navigation' },
  { id: 'risque', label: 'Profil de Risque', icon: <BarChart3 className="w-4 h-4" />, module: 'risque', keywords: ['risk', 'score'], category: 'navigation' },
  { id: 'signatures', label: 'Signatures DG', icon: <FileSignature className="w-4 h-4" />, module: 'signatures', keywords: ['signer', 'sign'], badge: { label: 'DG', variant: 'primary' }, category: 'navigation' },
  { id: 'evenements', label: 'Événements', icon: <AlertTriangle className="w-4 h-4" />, module: 'evenements', keywords: ['incidents', 'accidents'], category: 'navigation' },
  { id: 'enquetes', label: 'Enquêtes', icon: <Search className="w-4 h-4" />, module: 'enquetes', keywords: ['surveys', 'questionnaires'], category: 'navigation' },
  { id: 'messagerie', label: 'Messagerie', icon: <MessageSquare className="w-4 h-4" />, module: 'messagerie', keywords: ['messages', 'chat'], category: 'navigation' },
  { id: 'utilisateurs', label: 'Utilisateurs', icon: <Users className="w-4 h-4" />, module: 'utilisateurs', keywords: ['users', 'comptes'], badge: { label: 'Admin', variant: 'danger' }, category: 'navigation' },
  { id: 'formation', label: 'Formations', icon: <GraduationCap className="w-4 h-4" />, module: 'formation', keywords: ['training', 'competences'], category: 'navigation' },
  { id: 'kit', label: 'Kit Inspecteur', icon: <Wrench className="w-4 h-4" />, module: 'kit', keywords: ['outils', 'templates'], category: 'navigation' },
  { id: 'registres', label: 'Registres', icon: <FileText className="w-4 h-4" />, module: 'registres', keywords: ['documents', 'archives'], category: 'navigation' },
  { id: 'audit', label: "Journal d'audit", icon: <Settings className="w-4 h-4" />, module: 'audit', keywords: ['logs', 'historique'], badge: { label: 'Admin', variant: 'danger' }, category: 'navigation' },
  { id: 'charge', label: 'Charge de Travail', icon: <ClipboardList className="w-4 h-4" />, module: 'charge', keywords: ['taches', 'workload'], category: 'navigation' },
  { id: 'plans-actions', label: 'Plans d\'Actions', icon: <Rocket className="w-4 h-4" />, module: 'plans-actions', keywords: ['pac', 'ecarts'], category: 'navigation' },
]

const IA_COMMANDS: Command[] = [
  { id: 'ia-analyze-risk', label: 'Analyser le profil de risque', icon: <BarChart3 className="w-4 h-4" />, description: 'Analyse IA du risque pour l\'aérodrome sélectionné', module: 'ia', keywords: ['risque', 'score', 'analyse', 'tendance'], badge: { label: 'IA', variant: 'primary' }, category: 'ia' },
  { id: 'ia-analyze-report', label: 'Analyser le rapport', icon: <FileText className="w-4 h-4" />, description: 'Analyse IA de la qualité du rapport', module: 'ia', keywords: ['rapport', 'qualité', 'amélioration'], badge: { label: 'IA', variant: 'primary' }, category: 'ia' },
  { id: 'ia-find-similar', label: 'Trouver des éléments similaires', icon: <Search className="w-4 h-4" />, description: 'Recherche sémantique IA dans tout le système', module: 'ia', keywords: ['similaire', 'recherche', 'trouve'], badge: { label: 'IA', variant: 'primary' }, category: 'ia' },
  { id: 'ia-training-needs', label: 'Analyser les besoins formation', icon: <GraduationCap className="w-4 h-4" />, description: 'Analyse IA des besoins en formation des inspecteurs', module: 'ia', keywords: ['formation', 'besoin', 'inspecteur'], badge: { label: 'IA', variant: 'primary' }, category: 'ia' },
  { id: 'ia-predict-risk', label: 'Prédire l\'évolution du risque', icon: <TrendingUp className="w-4 h-4" />, description: 'Prédiction IA du score de risque à 3 et 6 mois', module: 'ia', keywords: ['prédiction', 'évolution', 'futur'], badge: { label: 'IA', variant: 'primary' }, category: 'ia' },
  { id: 'ia-compare', label: 'Comparer les aérodromes', icon: <Scale className="w-4 h-4" />, description: 'Comparaison IA entre aérodromes', module: 'ia', keywords: ['comparer', 'analyse', 'performance'], badge: { label: 'IA', variant: 'primary' }, category: 'ia' },
  { id: 'ia-summarize', label: 'Résumer le contexte actuel', icon: <Sparkles className="w-4 h-4" />, description: 'Génère un résumé IA de la situation', module: 'ia', keywords: ['résumé', 'synthèse', 'récap'], badge: { label: 'IA', variant: 'primary' }, category: 'ia' },
]

const ACTION_COMMANDS: Command[] = [
  { id: 'action-export', label: 'Exporter en PDF', icon: <Download className="w-4 h-4" />, module: 'action', keywords: ['pdf', 'export', 'télécharger'], category: 'action' },
  { id: 'action-print', label: 'Imprimer', icon: <Printer className="w-4 h-4" />, module: 'action', keywords: ['imprimer', 'print'], category: 'action' },
  { id: 'action-save', label: 'Sauvegarder', icon: <Save className="w-4 h-4" />, module: 'action', keywords: ['sauvegarder', 'save'], category: 'action' },
  { id: 'action-history', label: 'Historique des versions', icon: <History className="w-4 h-4" />, module: 'action', keywords: ['historique', 'versions', 'backup'], category: 'action' },
  { id: 'action-darkmode', label: 'Mode sombre', icon: <Moon className="w-4 h-4" />, module: 'action', keywords: ['sombre', 'dark', 'nuit'], category: 'action' },
  { id: 'action-fullscreen', label: 'Plein écran', icon: <Maximize2 className="w-4 h-4" />, module: 'action', keywords: ['plein écran', 'fullscreen'], category: 'action' },
]

// ─────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────

export function CommandPalette({ onNavigate, onIaCommand, currentContext }: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [isIaThinking, setIsIaThinking] = useState(false)
  const [iaSuggestions, setIaSuggestions] = useState<IaSuggestion[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  
  const aerodromes = useAppStore(s => s.aerodromes)
  const surveillances = useAppStore(s => s.surveillances)
  const ecarts = useAppStore(s => s.ecarts)
  const certifications = useAppStore(s => s.certifications)
  const homologations = useAppStore(s => s.homologations)
  const registreEntries = useAppStore(s => s.registreEntries)
  const evenements = useAppStore(s => s.evenements)
  const formations = useAppStore(s => s.formations)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const setActiveModule = useAppStore(s => s.setActiveModule)
  const user = useAppStore(s => s.user)
  const addNotification = useAppStore(s => s.addNotification)

  // ============================================================
  // RECHERCHE IA SÉMANTIQUE DANS TOUT LE SYSTÈME
  // ============================================================
  
  const performUniversalSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([])
      return
    }
    
    setIsSearching(true)
    const results: SearchResult[] = []
    const queryLower = query.toLowerCase()
    
    // 1. Aérodromes
    aerodromes.forEach(aero => {
      let score = 0
      if (aero.code_oaci.toLowerCase().includes(queryLower)) score += 100
      if (aero.nom.toLowerCase().includes(queryLower)) score += 80
      if (aero.region.toLowerCase().includes(queryLower)) score += 50
      
      if (score > 0) {
        const profil = profilsRisque?.[aero.id]
        results.push({
          id: `aero-${aero.id}`,
          type: 'aerodrome',
          title: `${aero.code_oaci} - ${aero.nom}`,
          subtitle: `${aero.region} • ${aero.type === 'international' ? 'International' : 'National'} • Score: ${profil?.score_global || 'N/A'}%`,
          icon: <Plane className="w-4 h-4" />,
          badge: profil?.score_global && profil.score_global < 50 ? 'Risque élevé' : undefined,
          badgeVariant: 'warning',
          action: () => { setActiveModule('aerodromes'); onNavigate?.('aerodromes', { id: aero.id }); setOpen(false) },
          score
        })
      }
    })
    
    // 2. Surveillances
    surveillances.forEach(surv => {
      const aerodrome = aerodromes.find(a => a.id === surv.aerodrome_id)
      let score = 0
      if (aerodrome?.code_oaci.toLowerCase().includes(queryLower)) score += 60
      if (surv.type.toLowerCase().includes(queryLower)) score += 40
      if (surv.statut.toLowerCase().includes(queryLower)) score += 30
      
      if (score > 0) {
        results.push({
          id: `surv-${surv.id}`,
          type: 'surveillance',
          title: `Surveillance ${aerodrome?.code_oaci || ''} - ${surv.type}`,
          subtitle: `${new Date(surv.date_debut).toLocaleDateString('fr-FR')} • ${surv.statut}`,
          icon: <ClipboardList className="w-4 h-4" />,
          badge: (surv as any).statut === 'en_retard' ? 'En retard' : undefined,
          badgeVariant: 'danger',
          action: () => { setActiveModule('surveillance'); onNavigate?.('surveillance', { id: surv.id }); setOpen(false) },
          score
        })
      }
    })
    
    // 3. Écarts
    ecarts.forEach(ecart => {
      const aerodrome = aerodromes.find(a => a.id === ecart.aerodrome_id)
      let score = 0
      if (ecart.reference.toLowerCase().includes(queryLower)) score += 80
      if (ecart.libelle.toLowerCase().includes(queryLower)) score += 70
      if (aerodrome?.code_oaci.toLowerCase().includes(queryLower)) score += 50
      if (ecart.niveau_risque.toLowerCase().includes(queryLower)) score += 40
      
      if (score > 0) {
        results.push({
          id: `ecart-${ecart.id}`,
          type: 'ecart',
          title: `${ecart.reference} - ${ecart.libelle.substring(0, 60)}`,
          subtitle: `${aerodrome?.code_oaci || ''} • ${ecart.niveau_risque} • ${ecart.statut}`,
          icon: <AlertTriangle className="w-4 h-4" />,
          badge: ecart.niveau_risque === 'critique' ? 'Critique' : undefined,
          badgeVariant: 'danger',
          action: () => { setActiveModule('plans-actions'); onNavigate?.('plans-actions', { ecartId: ecart.id }); setOpen(false) },
          score
        })
      }
    })
    
    // 4. Certifications
    certifications?.forEach(cert => {
      const aerodrome = aerodromes.find(a => a.id === cert.aerodrome_id)
      let score = 0
      if (cert.numero_cert?.toLowerCase().includes(queryLower)) score += 80
      if (aerodrome?.code_oaci.toLowerCase().includes(queryLower)) score += 60
      if (cert.statut_global.toLowerCase().includes(queryLower)) score += 40
      
      if (score > 0) {
        results.push({
          id: `cert-${cert.id}`,
          type: 'certification',
          title: `Certification ${aerodrome?.code_oaci || ''}`,
          subtitle: `${cert.numero_cert || 'N° inconnu'} • ${cert.statut_global}`,
          icon: <ShieldCheck className="w-4 h-4" />,
          badge: cert.statut_global === 'certifie' ? 'Certifié' : cert.statut_global,
          badgeVariant: cert.statut_global === 'certifie' ? 'success' : 'warning',
          action: () => { setActiveModule('certification'); onNavigate?.('certification', { id: cert.id }); setOpen(false) },
          score
        })
      }
    })
    
    // 5. Homologations
    homologations?.forEach(homo => {
      const aerodrome = aerodromes.find(a => a.id === homo.aerodrome_id)
      let score = 0
      if (homo.numero_decision?.toLowerCase().includes(queryLower)) score += 80
      if (aerodrome?.code_oaci.toLowerCase().includes(queryLower)) score += 60
      
      if (score > 0) {
        results.push({
          id: `homo-${homo.id}`,
          type: 'homologation',
          title: `Homologation ${aerodrome?.code_oaci || ''}`,
          subtitle: `${homo.numero_decision || 'N° inconnu'} • ${homo.statut_global}`,
          icon: <Scale className="w-4 h-4" />,
          badge: homo.statut_global === 'homologue' ? 'Homologué' : homo.statut_global,
          badgeVariant: homo.statut_global === 'homologue' ? 'success' : 'warning',
          action: () => { setActiveModule('homologation'); onNavigate?.('homologation', { id: homo.id }); setOpen(false) },
          score
        })
      }
    })
    
    // 6. Événements
    evenements?.forEach(event => {
      const aerodrome = aerodromes.find(a => a.id === event.aerodrome_id)
      let score = 0
      if (event.reference?.toLowerCase().includes(queryLower)) score += 80
      if (event.type?.toLowerCase().includes(queryLower)) score += 60
      if (aerodrome?.code_oaci.toLowerCase().includes(queryLower)) score += 50
      if (event.gravite?.toLowerCase().includes(queryLower)) score += 40
      
      if (score > 0) {
        results.push({
          id: `event-${event.id}`,
          type: 'evenement',
          title: `${event.reference} - ${event.type}`,
          subtitle: `${aerodrome?.code_oaci || ''} • ${event.date} • Gravité: ${event.gravite}`,
          icon: <AlertCircle className="w-4 h-4" />,
          badge: event.gravite === 'CRITIQUE' ? 'CRITIQUE' : undefined,
          badgeVariant: 'danger',
          action: () => { setActiveModule('evenements'); onNavigate?.('evenements', { id: event.id }); setOpen(false) },
          score
        })
      }
    })
    
    // 7. Formations
    formations?.forEach(formation => {
      const inspecteur = utilisateurs?.find(u => formation.participants?.includes(u.id))
      let score = 0
      if (formation.titre?.toLowerCase().includes(queryLower)) score += 80
      if (formation.type?.toLowerCase().includes(queryLower)) score += 60
      if (inspecteur?.nom?.toLowerCase().includes(queryLower)) score += 50
      
      if (score > 0 && formation.statut === 'terminee') {
        results.push({
          id: `form-${formation.id}`,
          type: 'formation',
          title: formation.titre,
          subtitle: `${inspecteur?.prenom} ${inspecteur?.nom || ''} • ${formation.date} • ${formation.duree_heures}h`,
          icon: <GraduationCap className="w-4 h-4" />,
          badge: (formation as any).note_moyenne ? `${(formation as any).note_moyenne}/5` : undefined,
          badgeVariant: 'primary',
          action: () => { setActiveModule('formation'); onNavigate?.('formation', { id: formation.id }); setOpen(false) },
          score
        })
      }
    })
    
    // 8. Registre / Documents
    registreEntries?.forEach(entry => {
      let score = 0
      if (entry.titre.toLowerCase().includes(queryLower)) score += 70
      if (entry.description.toLowerCase().includes(queryLower)) score += 50
      if (entry.reference.toLowerCase().includes(queryLower)) score += 60
      
      if (score > 0) {
        results.push({
          id: `reg-${entry.id}`,
          type: 'document',
          title: entry.titre,
          subtitle: `${entry.reference} • ${new Date(entry.date_entree).toLocaleDateString('fr-FR')}`,
          icon: <FileText className="w-4 h-4" />,
          action: () => { setActiveModule('registres'); onNavigate?.('registres', { entryId: entry.id }); setOpen(false) },
          score
        })
      }
    })
    
    // Trier par score décroissant
    results.sort((a, b) => b.score - a.score)
    setSearchResults(results.slice(0, 15))
    setIsSearching(false)
  }, [aerodromes, surveillances, ecarts, certifications, homologations, registreEntries, evenements, formations, utilisateurs, profilsRisque, setActiveModule, onNavigate])
  
  // ============================================================
  // SUGGESTIONS IA PROACTIVES
  // ============================================================
  
  const loadIaSuggestions = useCallback(async () => {
    setIsIaThinking(true)
    const suggestions: IaSuggestion[] = []
    
    try {
      // 1. Aérodromes avec risque critique
      const aerodromesCritiques = aerodromes.filter(a => {
        const profil = profilsRisque?.[a.id]
        return profil && profil.score_global < 40
      })
      
      if (aerodromesCritiques.length > 0) {
        suggestions.push({
          id: 'risk-critical',
          type: 'alerte',
          message: `⚠️ ${aerodromesCritiques.length} aérodrome(s) avec score de risque critique`,
          icon: <AlertOctagon className="w-4 h-4 text-danger" />,
          action: () => { setActiveModule('risque'); onNavigate?.('risque', { filter: 'critique' }); setOpen(false) },
          confidence: 90
        })
      }
      
      // 2. Écarts en retard
      const ecartsEnRetard = ecarts.filter(e => e.statut === 'en_retard')
      if (ecartsEnRetard.length > 0) {
        suggestions.push({
          id: 'ecarts-retard',
          type: 'rappel',
          message: `⏰ ${ecartsEnRetard.length} écart(s) en retard nécessitent une attention immédiate`,
          icon: <AlertTriangle className="w-4 h-4 text-warning" />,
          action: () => { setActiveModule('plans-actions'); onNavigate?.('plans-actions', { filter: 'en_retard' }); setOpen(false) },
          confidence: 85
        })
      }
      
      // 3. Certifications expirant bientôt
      const certsExpirant = certifications?.filter(c => {
        if (!c.date_expiration) return false
        const joursRestants = Math.floor((new Date(c.date_expiration).getTime() - Date.now()) / 86400000)
        return joursRestants <= 90 && joursRestants > 0
      }) || []
      
      if (certsExpirant.length > 0) {
        suggestions.push({
          id: 'cert-expiry',
          type: 'rappel',
          message: `📋 ${certsExpirant.length} certification(s) expirent dans moins de 90 jours`,
          icon: <CalendarDays className="w-4 h-4 text-info" />,
          action: () => { setActiveModule('certification'); onNavigate?.('certification', { filter: 'expiring' }); setOpen(false) },
          confidence: 80
        })
      }
      
      // 4. Inspecteurs sans formation récente
      const inspecteursSansFormation = utilisateurs?.filter(u => {
        if (u.role !== 'inspector') return false
        const dernieresFormations = formations?.filter(f => f.participants?.includes(u.id) && f.statut === 'terminee')
        if (!dernieresFormations || dernieresFormations.length === 0) return true
        const derniereFormation = new Date(Math.max(...dernieresFormations.map(f => new Date(f.date).getTime())))
        const moisDepuis = (Date.now() - derniereFormation.getTime()) / (1000 * 60 * 60 * 24 * 30)
        return moisDepuis > 12
      }) || []
      
      if (inspecteursSansFormation.length > 0) {
        suggestions.push({
          id: 'training-needed',
          type: 'recommandation',
          message: `🎓 ${inspecteursSansFormation.length} inspecteur(s) sans formation depuis plus d'un an`,
          icon: <GraduationCap className="w-4 h-4 text-primary" />,
          action: () => { setActiveModule('formation'); onNavigate?.('formation', { filter: 'needs_training' }); setOpen(false) },
          confidence: 75
        })
      }
      
    } catch (error) {
      console.error('Erreur chargement suggestions IA:', error)
    }
    
    setIaSuggestions(suggestions)
    setIsIaThinking(false)
  }, [aerodromes, profilsRisque, ecarts, certifications, utilisateurs, formations, setActiveModule, onNavigate])
  
  // ============================================================
  // GESTION DES COMMANDES IA
  // ============================================================
  
  const handleIaCommand = useCallback(async (commandId: string) => {
    setOpen(false)
    
    switch (commandId) {
      case 'ia-analyze-risk':
        if (currentContext?.aerodromeId) {
          onNavigate?.('risque', { aerodromeId: currentContext.aerodromeId, analyse: true })
          addNotification?.({
            user_id: user?.id || '',
            type: 'info',
            title: 'Analyse IA en cours',
            message: 'Analyse du profil de risque en cours...',
            canal: 'in_app'
          })
        } else {
          addNotification?.({
            user_id: user?.id || '',
            type: 'warning',
            title: 'Aérodrome requis',
            message: 'Veuillez d\'abord sélectionner un aérodrome',
            canal: 'in_app'
          })
        }
        break
        
      case 'ia-training-needs':
        onNavigate?.('formation', { analyse: true })
        addNotification?.({
          user_id: user?.id || '',
          type: 'info',
          title: 'Analyse IA',
          message: 'Analyse des besoins en formation des inspecteurs...',
          canal: 'in_app'
        })
        break
        
      case 'ia-find-similar':
        if (searchValue) {
          onNavigate?.('recherche', { query: searchValue, semantic: true })
        } else {
          onNavigate?.('registres', { search: 'éléments similaires', semantic: true })
        }
        break
        
      case 'ia-predict-risk':
        if (currentContext?.aerodromeId) {
          onNavigate?.('risque', { aerodromeId: currentContext.aerodromeId, predictions: true })
        }
        break
        
      case 'ia-compare':
        onNavigate?.('aerodromes', { compare: true })
        break
        
      case 'ia-summarize':
        onNavigate?.('dashboard', { summary: true })
        addNotification?.({
          user_id: user?.id || '',
          type: 'info',
          title: 'Génération IA',
          message: 'Génération du résumé contextuel...',
          canal: 'in_app'
        })
        break
        
      default:
        if (onIaCommand) onIaCommand(commandId)
    }
  }, [currentContext, searchValue, onNavigate, onIaCommand, user, addNotification])
  
  // ============================================================
  // EFFETS
  // ============================================================
  
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])
  
  useEffect(() => {
    if (open) {
      loadIaSuggestions()
    }
  }, [open, loadIaSuggestions])
  
  useEffect(() => {
    if (searchValue.length >= 2) {
      const timeout = setTimeout(() => {
        performUniversalSearch(searchValue)
      }, 300)
      return () => clearTimeout(timeout)
    } else {
      setSearchResults([])
    }
  }, [searchValue, performUniversalSearch])
  
  // ============================================================
  // RENDU AVEC ESPACEMENTS OPTIMISÉS
  // ============================================================
  
  return (
    <CommandDialog open={open} onOpenChange={setOpen} data-role={user?.role}>
      <div className="p-4 pb-0">
        <div className="relative">
          <CommandInput 
            placeholder="Rechercher un module, un aérodrome, une surveillance... ou posez une question à l'IA"
            value={searchValue}
            onValueChange={setSearchValue}
            className="border-none focus:ring-0 pr-12 h-12 text-base"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-5 h-5 text-role-primary animate-spin" />
            </div>
          )}
          {!isSearching && searchValue && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Sparkles className="w-5 h-5 text-role-primary animate-pulse" />
            </div>
          )}
        </div>
      </div>
      
      <CommandList className="max-h-[450px] overflow-y-auto px-4 pb-4">
        <CommandEmpty className="py-12 text-center">
          <Search className="w-14 h-14 text-muted mx-auto mb-4 opacity-30" />
          <p className="text-muted text-base">Aucun résultat trouvé</p>
          <p className="text-sm text-muted/60 mt-2">Essayez "GOBD", "certification", ou "écart critique"</p>
          {searchValue && (
            <button 
              onClick={() => handleIaCommand('ia-find-similar')}
              className="mt-6 text-role-primary text-sm hover:underline flex items-center gap-2 justify-center"
            >
              <Sparkles className="w-4 h-4" />
              Recherche sémantique IA pour "{searchValue.substring(0, 40)}"
            </button>
          )}
        </CommandEmpty>

        {/* Suggestions IA proactives */}
        {iaSuggestions.length > 0 && (
          <>
            <CommandGroup heading="💡 Suggestions IA" className="mb-2">
              {iaSuggestions.map((sug) => (
                <CommandItem
                  key={sug.id}
                  onSelect={() => sug.action()}
                  className="group cursor-pointer py-3 my-1"
                >
                  <div className="mr-3">{sug.icon}</div>
                  <span className="flex-1 text-sm">{sug.message}</span>
                  <Badge variant="primary" className="text-[10px] px-2 py-0.5">
                    IA {sug.confidence}%
                  </Badge>
                  <ChevronRight className="ml-3 w-4 h-4 text-muted group-hover:text-role-primary group-hover:translate-x-1 transition-all" />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator className="my-3" />
          </>
        )}

        {/* Résultats de recherche IA */}
        {searchResults.length > 0 && (
          <>
            <CommandGroup heading={`🔍 Résultats de recherche (${searchResults.length})`} className="mb-2">
              {searchResults.map((result) => (
                <CommandItem
                  key={result.id}
                  onSelect={() => result.action()}
                  className="group cursor-pointer py-3 my-1"
                >
                  <div className="mr-3">{result.icon}</div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{result.title}</div>
                    <div className="text-xs text-muted mt-0.5">{result.subtitle}</div>
                  </div>
                  {result.badge && (
                    <Badge variant={result.badgeVariant as any} className="text-[10px] px-2 py-0.5 ml-2">
                      {result.badge}
                    </Badge>
                  )}
                  <ChevronRight className="ml-3 w-4 h-4 text-muted group-hover:text-role-primary group-hover:translate-x-1 transition-all" />
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator className="my-3" />
          </>
        )}

        {/* Commandes IA */}
        <CommandGroup heading="🤖 Commandes IA" className="mb-2">
          {IA_COMMANDS.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={[cmd.label, ...(cmd.keywords ?? [])].join(' ')}
              onSelect={() => handleIaCommand(cmd.id)}
              className="group cursor-pointer py-3 my-1"
            >
              <div className="mr-3 text-role-primary">{cmd.icon}</div>
              <span className="flex-1">{cmd.label}</span>
              {cmd.description && (
                <span className="text-xs text-muted hidden md:inline mr-2">{cmd.description}</span>
              )}
              {cmd.badge && (
                <Badge variant={cmd.badge.variant as any} className="text-[10px] px-2 py-0.5">
                  {cmd.badge.label}
                </Badge>
              )}
              <ChevronRight className="ml-3 w-4 h-4 text-muted group-hover:text-role-primary group-hover:translate-x-1 transition-all" />
            </CommandItem>
          ))}
        </CommandGroup>
        
        <CommandSeparator className="my-3" />

        {/* Navigation */}
        <CommandGroup heading="📱 Navigation" className="mb-2">
          {NAVIGATION_COMMANDS.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={[cmd.label, ...(cmd.keywords ?? [])].join(' ')}
              onSelect={() => {
                if (cmd.module) {
                  setActiveModule(cmd.module)
                  setOpen(false)
                }
              }}
              className="group cursor-pointer py-3 my-1"
            >
              <div className="mr-3">{cmd.icon}</div>
              <span className="flex-1">{cmd.label}</span>
              {cmd.badge && (
                <Badge variant={cmd.badge.variant as any} className="text-[10px] px-2 py-0.5">
                  {cmd.badge.label}
                </Badge>
              )}
              <ChevronRight className="ml-3 w-4 h-4 text-muted group-hover:text-role-primary group-hover:translate-x-1 transition-all" />
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator className="my-3" />

        {/* Actions rapides */}
        <CommandGroup heading="⚡ Actions rapides" className="mb-2">
          {ACTION_COMMANDS.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={[cmd.label, ...(cmd.keywords ?? [])].join(' ')}
              onSelect={() => {
                if (cmd.id === 'action-export') onNavigate?.('export', {})
                if (cmd.id === 'action-print') window.print()
                if (cmd.id === 'action-save') onNavigate?.('save', {})
                if (cmd.id === 'action-history') onNavigate?.('history', {})
                if (cmd.id === 'action-darkmode') document.documentElement.classList.toggle('dark')
                if (cmd.id === 'action-fullscreen') document.documentElement.requestFullscreen()
                setOpen(false)
              }}
              className="group cursor-pointer py-3 my-1"
            >
              <div className="mr-3 text-muted group-hover:text-role-primary transition-colors">{cmd.icon}</div>
              <span className="flex-1">{cmd.label}</span>
              <ChevronRight className="ml-3 w-4 h-4 text-muted group-hover:text-role-primary group-hover:translate-x-1 transition-all" />
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Section Astuce clavier avec espacements */}
        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center justify-between text-xs text-muted">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-muted rounded-md text-[11px] font-mono">↑</kbd>
                <kbd className="px-2 py-1 bg-muted rounded-md text-[11px] font-mono">↓</kbd>
                <span>Naviguer</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-muted rounded-md text-[11px] font-mono">↵</kbd>
                <span>Sélectionner</span>
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-2 py-1 bg-muted rounded-md text-[11px] font-mono">⎋</kbd>
                <span>Fermer</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-role-primary" />
                <span>Commandes IA</span>
              </div>
              <div className="flex items-center gap-2">
                <Command className="w-3.5 h-3.5" />
                <span>+ K</span>
              </div>
            </div>
          </div>
        </div>
      </CommandList>
    </CommandDialog>
  )
}

// ─────────────────────────────────────────────────────────────
// BOUTON TRIGGER AVEC DESIGN PREMIUM
// ─────────────────────────────────────────────────────────────

export function CommandPaletteTrigger() {
  const [isHovered, setIsHovered] = useState(false)
  const user = useAppStore(s => s.user)

  return (
    <button
      onClick={() => {
        const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
        document.dispatchEvent(event)
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="command-palette-trigger"
      aria-label="Ouvrir la palette de commandes (Ctrl+K)"
      data-role={user?.role}
    >
      <Search className={`w-4 h-4 transition-all duration-300 ${isHovered ? 'scale-110' : ''}`} />
      <span className="hidden lg:inline">Rechercher ou commander...</span>
      <div className="flex items-center gap-1.5">
        <kbd className="hidden sm:inline-flex items-center justify-center h-6 px-1.5 rounded-md bg-muted text-muted-foreground text-[11px] font-mono">
          <Command className="w-3 h-3" />
        </kbd>
        <kbd className="hidden sm:inline-flex items-center justify-center h-6 min-w-[26px] px-1.5 rounded-md bg-muted text-muted-foreground text-[11px] font-mono">K</kbd>
      </div>
      {isHovered && (
        <Sparkles className="absolute -right-1 -top-1 w-3 h-3 text-role-primary animate-pulse" />
      )}
    </button>
  )
}