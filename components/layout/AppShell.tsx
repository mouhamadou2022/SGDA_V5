// components/layout/AppShell.tsx
'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'
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
  const [systemTheme, setSystemTheme] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemTheme(e.matches)
    setSystemTheme(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const isDark = theme === 'dark' || (theme === 'system' && systemTheme)
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme, systemTheme])

  useEffect(() => {
    setUser(user)
  }, [user, setUser])

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
      'dg-dashboard': 'Tableau de Bord DG',
      'dg-operator-dashboard': 'Tableau de Bord Exploitant',
      'focal-dashboard': 'Tableau de Bord Point Focal',
      'staff-dashboard': 'Tableau de Bord Personnel',
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
      'operator-ecarts': 'Mes Écarts',
      'operator-evenements': 'Événements',
      'operator-documentations': 'Documents (Kit ANACIM)',
      'operator-kit': 'Kit Références',
      'operator-planning': 'Mon Planning',
      'operator-pac-consolide': 'PAC (Consolidation)',
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
