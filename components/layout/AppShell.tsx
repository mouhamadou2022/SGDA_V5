// components/layout/AppShell.tsx
'use client'

import { ReactNode, useEffect, useState, useSyncExternalStore, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { chargerFeedbacksDepuisSupabase, synchroniserFeedback } from '@/lib/ia/syncEngineFeedback'
import { engineFeedback } from '@/lib/ia/engines/engineFeedback'
import { thresholdController } from '@/lib/ia/thresholdController'
import { decisionTracker, type DecisionRecord } from '@/lib/ia/decisionTracker'
import { fetchThresholds, fetchDecisions, upsertThreshold, createDecision, fetchModelState, upsertModelState } from '@/lib/datastore'
import { suggestionMLAgent } from '@/lib/ia/agents/suggestionMLAgent'
import { TimerBar } from './TimerBar'
import { AppHeader } from './AppHeader'
import { Breadcrumb } from './Breadcrumb'
import { AppNav } from './AppNav'
import { CommandPalette } from './CommandPalette'
import { OfflineBanner } from './OfflineBanner'
import { SyncStatusBadge } from './SyncStatus'
import { AIAssistant } from '@/components/ui/AIAssistant'
import { AuthUser } from '@/lib/auth'
import { Plane } from 'lucide-react'

// Ces modules gèrent leur propre espacement bas (tableaux, listes infinies, etc.)
const NO_BOTTOM_PADDING = ['aerodromes', 'formation', 'utilisateurs', 'audit', 'codes']

interface AppShellProps {
  user: AuthUser
  children: ReactNode
  onLogout: () => void
}

export function AppShell({ user, children, onLogout }: AppShellProps) {
  const activeModule = useAppStore(s => s.activeModule);
  const setActiveModule = useAppStore(s => s.setActiveModule);
  const setUser = useAppStore(s => s.setUser);
  const theme = useAppStore(s => s.theme);
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [previousModule, setPreviousModule] = useState(activeModule)
  const [isNavVisible, setIsNavVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  // État système : suit prefers-color-scheme SANS flash (lecture synchrone)
  const subscribeMql = useCallback((cb: () => void) => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', cb)
    return () => mql.removeEventListener('change', cb)
  }, [])
  const getSnapshot = () => window.matchMedia('(prefers-color-scheme: dark)').matches
  const isSystemDark = useSyncExternalStore(subscribeMql, getSnapshot, () => false)

  // Heure courante pour le fallback horaire
  const [hour, setHour] = useState(() => new Date().getHours())
  useEffect(() => {
    const timer = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const isNightTime = hour < 6 || hour >= 19
    const isDark = theme === 'dark' || (theme === 'system' && (isSystemDark || isNightTime))
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme, isSystemDark, hour])

  useEffect(() => {
    setUser(user)
  }, [user, setUser])

  useEffect(() => {
    // Restaurer l'état depuis IndexedDB avant Supabase
    decisionTracker.initFromIDB()
    engineFeedback.initFromIDB()
    thresholdController.initFromIDB()

    chargerFeedbacksDepuisSupabase()
    engineFeedback.onSync(synchroniserFeedback)

    // Charger les seuils depuis Supabase
    fetchThresholds().then(res => {
      if (res.data && res.data.length > 0) {
        thresholdController.initFromSupabase(res.data.map(r => ({ parametre: r.parametre, valeur: Number(r.valeur) })))
      }
    })
    thresholdController.onSync((engine, parametre, valeur, raison) => {
      upsertThreshold(parametre, valeur, engine, raison)
    })

    // Charger les décisions depuis Supabase
    fetchDecisions().then(res => {
      if (res.data && res.data.length > 0) {
        const mapped: DecisionRecord[] = res.data.map(r => ({
          id: r.id,
          aerodromeId: r.aerodrome_id,
          date: r.date_decision,
          type: r.type as DecisionRecord['type'],
          status: r.status as DecisionRecord['status'],
          effectiveness: r.effectiveness as DecisionRecord['effectiveness'],
          appliedAt: r.applied_at,
          commentaire: r.commentaire,
          recommendation: r.recommendation_action ? {
            action: r.recommendation_action,
            type: (r.recommendation_type || 'correctif') as any,
            urgence: (r.recommendation_urgence || '3_mois') as any,
            justification: '',
          } : undefined,
          certificatAction: r.certificat_action,
          declencheurType: r.declencheur_type,
          suggestionType: r.suggestion_type,
          suggestionConfiance: r.suggestion_confiance,
        }))
        decisionTracker.initFromSupabase(mapped)
      }
    })
    decisionTracker.onSync((record) => {
      createDecision({
        aerodrome_id: record.aerodromeId,
        type: record.type,
        recommendation_action: record.recommendation?.action,
        recommendation_type: record.recommendation?.type,
        recommendation_urgence: record.recommendation?.urgence,
        certificat_action: record.certificatAction,
        declencheur_type: record.declencheurType,
        suggestion_type: record.suggestionType,
        suggestion_confiance: record.suggestionConfiance,
        confiance: record.recommendation?.confiance,
      })
    })

    // Charger les poids du modèle ML depuis Supabase
    fetchModelState('suggestion_ml').then(res => {
      if (res.data) {
        suggestionMLAgent.initModelFromSupabase({
          version: res.data.version,
          updated_at: '',
          weights: res.data.weights,
          biases: res.data.biases,
          learning_rate: Number(res.data.learning_rate),
          total_feedbacks: res.data.total_feedbacks,
          accuracy_history: (res.data.accuracy_history || []).map(Number),
          aerodrome_specific: (res.data.model_data as Record<string, any>) || {},
        })
      }
    })
    suggestionMLAgent.onSyncModel((model) => {
      // Sérialiser les champs pour l'upsert
      const aerodromeIds = Object.keys(model.aerodrome_specific || {})
      // Sauvegarder l'état global (sans aerodrome_id)
      upsertModelState({
        model_name: 'suggestion_ml',
        version: model.version,
        weights: model.weights,
        biases: model.biases,
        learning_rate: model.learning_rate,
        total_feedbacks: model.total_feedbacks,
        accuracy_history: model.accuracy_history,
        model_data: model.aerodrome_specific as unknown as Record<string, unknown>,
      })
    })
  }, [])

  useEffect(() => {
    document.body.setAttribute('data-role', user.role)
    return () => {
      document.body.removeAttribute('data-role')
    }
  }, [user.role])

  useEffect(() => {
    if (previousModule !== activeModule) {
      setIsTransitioning(true)
      const timer = setTimeout(() => {
        setIsTransitioning(false)
        setPreviousModule(activeModule)
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [activeModule, previousModule])

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsNavVisible(false)
      } else if (currentScrollY < lastScrollY) {
        setIsNavVisible(true)
      }
      setLastScrollY(currentScrollY)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [lastScrollY])

  const getModuleLabel = (module: string): string => {
    const labels: Record<string, string> = {
      dashboard: 'Tableau de Bord',
      'admin-dashboard': 'Administration',
      'dg-dashboard': 'Vue Nationale',
      'dg-pilotage-securite': 'Pilotage Sécurité',
      'dg-conformite-controle': 'Conformité & Contrôle',
      'dg-decisions-impact': 'Décisions & Impact',
      'dg-operator-dashboard': 'Vue d\'Ensemble',
      'focal-dashboard': 'Tableau de Bord Point Focal',
      'staff-dashboard': 'Mon Aérodrome',
      'guest-dashboard': 'Consultation',
      aerodromes: 'Aérodromes',
      certification: 'Certification',
      homologation: 'Homologation',
      planning: 'Planning',
      surveillance: 'Surveillance',
      'plans-actions': 'Écarts & PAC',
      registres: 'Registres',
      dossiers: 'Dossiers',
      formation: 'Formation',
      kit: 'Kit Inspecteur',
      evenements: 'Événements',
      enquetes: 'Enquêtes',
      messagerie: 'Messagerie',
      risque: 'Profil de Risque',
      signatures: 'Signatures DG',
      charge: 'Charge de Travail',
      utilisateurs: 'Utilisateurs',
      audit: 'Journal Audit',
      codes: "Codes d'Accès",
      'operator-dashboard': 'Mon Dashboard',
      'operator-situation-securite': 'Situation Sécurité',
      'operator-conformite-echeances': 'Conformité & Échéances',
      'operator-impact-decisions': 'Impact & Décisions',
      'operator-ecarts': 'Mes Écarts',
      'operator-evenements': 'Événements',
      'operator-documentations': 'Documents (Kit ANACIM)',
      'operator-kit': 'Kit Références',
      'operator-planning': 'Mon Planning',
      'operator-pac-consolide': 'PAC (Consolidation)',
      'operator-self-assessment': 'Auto-évaluation',
      'operator-enquetes': 'Enquêtes',
      'operator-messagerie': 'Messagerie',
      'operator-certification': 'Certification',
      'operator-homologation': 'Homologation',
    }
    return labels[module] || module
  }

  const breadcrumbItems = [{ label: getModuleLabel(activeModule) }]
  const noBottomPad = NO_BOTTOM_PADDING.includes(activeModule)

  return (
    <div className="min-h-screen" data-role={user.role}>
      <OfflineBanner />
      <TimerBar />
      <AppHeader user={user} onLogout={onLogout} />
      <Breadcrumb items={breadcrumbItems} onNavigate={setActiveModule} />

      <div className={`sticky top-[calc(40px+70px+50px)] z-30 transition-all duration-500 ${isNavVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
        <AppNav userRole={user.role} activeModule={activeModule} onModuleChange={setActiveModule} />
      </div>

      <main className="bg-transparent">
        {isTransitioning && (
          <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
            <div className="absolute inset-0 bg-role-primary/10 backdrop-blur-sm animate-fade-out" />
            <div className="relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-role-gradient shadow-role-glow flex items-center justify-center animate-scale">
                <Plane className="w-8 h-8 text-white animate-takeoff" />
              </div>
            </div>
          </div>
        )}

        <div className={`container pt-8 ${noBottomPad ? 'pb-0' : 'pb-8'} transition-all duration-500 ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100 animate-fade-up'}`}>
          {children}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-role-primary/5 to-transparent pointer-events-none z-0" />
      <CommandPalette />
      <AIAssistant hideTrigger />
    </div>
  )
}
