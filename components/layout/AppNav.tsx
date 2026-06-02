// components/layout/AppNav.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Plane,
  ShieldCheck,
  Scale,
  CalendarDays,
  Eye,
  ClipboardList,
  BookOpen,
  FolderOpen,
  GraduationCap,
  Briefcase,
  AlertTriangle,
  MessageSquare,
  Activity,
  PenLine,
  Users,
  FileSearch,
  Key,
  AlertCircle,
  FileText,
  MessageCircle,
  ListTodo,
  Flame,
  Mail,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AppNavProps {
  userRole: string;
  activeModule: string;
  onModuleChange: (module: string) => void;
}

export function AppNav({ userRole, activeModule, onModuleChange }: AppNavProps) {
  const ecarts = useAppStore(s => s.ecarts);
  const messages = useAppStore(s => s.messages);
  const certifications = useAppStore(s => s.certifications);
  const homologations = useAppStore(s => s.homologations);
  const aerodromes = useAppStore(s => s.aerodromes);
  const user = useAppStore(s => s.user);
  const userId = user?.id || '';
  const messagesNonLus = useMemo(() => messages.filter(m => {
    const toId = m.to_id
    const isRecipient = toId === userId || (Array.isArray(toId) && toId.includes(userId))
    const isCC = m.cc_id?.includes(userId)
    return (isRecipient || isCC) && !m.read_at
  }).length, [messages, userId]);
  const [scrolled, setScrolled] = useState(false);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const navRef = React.useRef<HTMLDivElement>(null);

  // Effet de scroll sur la navigation
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Vérifier les flèches de défilement
  useEffect(() => {
    const checkArrows = () => {
      if (navRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = navRef.current;
        setShowLeftArrow(scrollLeft > 0);
        setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 10);
      }
    };
    checkArrows();
    window.addEventListener('resize', checkArrows);
    return () => window.removeEventListener('resize', checkArrows);
  }, []);

  const scrollNav = (direction: 'left' | 'right') => {
    if (navRef.current) {
      const scrollAmount = 200;
      navRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // Compter les écarts critiques pour le badge
  const nbEcartsCritiques = ecarts.filter(e =>
    e.niveau_risque === 'critique' &&
    e.statut !== 'cloture'
  ).length;

  // Onglets certification/homologation dynamiques selon l'aérodrome de l'utilisateur
  const aerodromeId = user?.aerodrome_id
  const anacimRoles = ['admin', 'inspector', 'dg_anacim']
  const isAnacimRole = anacimRoles.includes(userRole)

  // ANACIM : voit tout. Autres rôles : visible seulement si leur aérodrome a un dossier
  const showCertification = isAnacimRole ||
    certifications.some(c => !aerodromeId || c.aerodrome_id === aerodromeId)
  const showHomologation = isAnacimRole ||
    homologations.some(h => !aerodromeId || h.aerodrome_id === aerodromeId)

  // Portail exploitant : afficher certification ou homologation selon le type d'aérodrome
  const operaerodrome = aerodromes.find(a => a.id === aerodromeId)
  const showOperatorCertification = !!operaerodrome && operaerodrome.type === 'international'
  const showOperatorHomologation = !!operaerodrome && operaerodrome.type === 'national'

  type NavModule = {
    id: string
    label: string
    icon: React.ElementType
    roles: string[]
    badge?: number
    badgeVariant?: string
    condition?: boolean
  }

  // Tous les rôles utilisent id='dashboard' — DASHBOARD_BY_ROLE dispatche vers le bon composant
  const modules: NavModule[] = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: LayoutDashboard, roles: ['admin', 'inspector', 'dg_anacim', 'dg_operator', 'focal_operator', 'staff_operator', 'guest'] },
    // ── Modules ANACIM ──
    { id: 'aerodromes', label: 'Aérodromes', icon: Plane, roles: ['admin', 'inspector', 'dg_anacim', 'dg_operator', 'focal_operator', 'guest'] },
    { id: 'certification', label: 'Certification', icon: ShieldCheck, roles: ['admin', 'inspector', 'dg_anacim', 'dg_operator', 'guest'], condition: showCertification },
    { id: 'homologation', label: 'Homologation', icon: Scale, roles: ['admin', 'inspector', 'dg_anacim', 'dg_operator', 'guest'], condition: showHomologation },
    { id: 'planning', label: 'Planning', icon: CalendarDays, roles: ['admin', 'inspector', 'dg_anacim'] },
    { id: 'surveillance', label: 'Surveillance', icon: Eye, roles: ['admin', 'inspector', 'dg_anacim'] },
    { id: 'plans-actions', label: 'Écarts & PAC', icon: Flame, roles: ['admin', 'inspector', 'dg_anacim'], badge: nbEcartsCritiques, badgeVariant: 'danger' },
    { id: 'registres', label: 'Registres', icon: BookOpen, roles: ['admin', 'inspector', 'dg_anacim'] },
    { id: 'dossiers', label: 'Dossiers', icon: FolderOpen, roles: ['admin', 'inspector', 'dg_anacim', 'guest'] },
    { id: 'formation', label: 'Formation', icon: GraduationCap, roles: ['admin', 'inspector', 'dg_anacim'] },
    { id: 'kit', label: 'Kit Inspecteur', icon: Briefcase, roles: ['admin', 'inspector'] },
    { id: 'evenements', label: 'Événements', icon: AlertTriangle, roles: ['admin', 'inspector', 'dg_anacim'] },
    { id: 'enquetes', label: 'Enquêtes', icon: MessageSquare, roles: ['admin', 'inspector', 'dg_anacim'] },
    { id: 'messagerie', label: 'Messagerie', icon: Mail, roles: ['admin', 'inspector', 'dg_anacim'], badge: messagesNonLus, badgeVariant: 'primary' },
    { id: 'risque', label: 'Profil Risque', icon: Activity, roles: ['admin', 'inspector', 'dg_anacim', 'dg_operator', 'focal_operator', 'staff_operator'] },
    { id: 'signatures', label: 'Signatures DG', icon: PenLine, roles: ['dg_anacim'] },
    { id: 'charge', label: 'Charge Travail', icon: ListTodo, roles: ['admin', 'inspector'] },
    // ── Modules admin exclusifs ──
    { id: 'utilisateurs', label: 'Utilisateurs', icon: Users, roles: ['admin'] },
    { id: 'audit', label: 'Journal Audit', icon: FileSearch, roles: ['admin'] },
    { id: 'codes', label: "Codes d'Accès", icon: Key, roles: ['admin'] },
    { id: 'ml-monitoring', label: 'ML Monitoring', icon: Activity, roles: ['admin', 'inspector'] },
    // ── Portail exploitant ──
    { id: 'operator-planning', label: 'Mon Planning', icon: ListTodo, roles: ['dg_operator', 'focal_operator', 'staff_operator'] },
    { id: 'operator-ecarts', label: 'Écarts & PAC', icon: Flame, roles: ['dg_operator', 'focal_operator'], badge: nbEcartsCritiques, badgeVariant: 'danger' },
    { id: 'operator-pac-consolide', label: 'PAC Consolidé', icon: ShieldCheck, roles: ['focal_operator'] },
    { id: 'operator-certification', label: 'Certification', icon: ShieldCheck, roles: ['dg_operator', 'focal_operator', 'staff_operator'], condition: showOperatorCertification },
    { id: 'operator-homologation', label: 'Homologation', icon: Scale, roles: ['dg_operator', 'focal_operator', 'staff_operator'], condition: showOperatorHomologation },
    { id: 'operator-evenements', label: 'Événements', icon: AlertCircle, roles: ['focal_operator', 'staff_operator'] },
    { id: 'operator-documentations', label: 'Kit Références', icon: FileText, roles: ['focal_operator', 'staff_operator'] },
    { id: 'operator-enquetes', label: 'Enquêtes', icon: MessageCircle, roles: ['focal_operator'] },
    { id: 'operator-messagerie', label: 'Messagerie', icon: Mail, roles: ['dg_operator', 'focal_operator'], badge: messagesNonLus, badgeVariant: 'primary' },
  ]

  // Filtrer par rôle ET par condition optionnelle (ex: certification/homologation dynamiques)
  const filteredModules = modules.filter(m =>
    m.roles.includes(userRole) && (m.condition === undefined || m.condition)
  );

  return (
    <nav 
      className={`app-nav ${scrolled ? 'shadow-role-glow' : ''} transition-all duration-300`} 
      data-role={userRole}
    >
      {/* Flèche de navigation gauche */}
      {showLeftArrow && (
        <button
          onClick={() => scrollNav('left')}
          className="nav-scroll-btn left group"
          aria-label="Défiler vers la gauche"
        >
          <ChevronLeft className="w-4 h-4 text-role-primary group-hover:scale-110 transition-transform" />
        </button>
      )}

      {/* Conteneur des modules avec défilement */}
      <div 
        ref={navRef}
        className="nav-container overflow-x-auto scrollbar-thin scrollbar-thumb-role-primary scrollbar-track-border"
        style={{ scrollBehavior: 'smooth' }}
      >
        <TooltipProvider delayDuration={300}>
          {filteredModules.map((module, index) => {
            const Icon = module.icon;
            const operatorRoles = ['dg_operator', 'focal_operator', 'staff_operator'];
            const isActive =
              activeModule === module.id ||
              (operatorRoles.includes(userRole) &&
                activeModule === 'dashboard' &&
                module.id === 'operator-dashboard');
            
            // Animation différée pour chaque item
            const animationDelay = `${index * 0.03}s`;
            
            return (
              <Tooltip key={module.id}>
                <TooltipTrigger asChild>
                  <button
                    className={`nav-item ${isActive ? 'active' : ''} animate-fade-up`}
                    style={{ animationDelay }}
                    onClick={() => onModuleChange(module.id)}
                  >
                    <div className="relative">
                      <Icon className="nav-icon" />
                      {(module.badge ?? 0) > 0 && (
                        <Badge 
                          variant={module.badgeVariant as any || 'danger'} 
                          className={`badge ${module.badgeVariant === 'danger' ? 'danger pulse' : module.badgeVariant === 'primary' ? 'primary pulse' : 'neutral'} absolute -top-2 -right-2 h-5 min-w-[1.25rem] px-1 flex items-center justify-center text-[10px] font-bold`}
                        >
                          {module.badge && module.badge > 99 ? '99+' : module.badge}
                        </Badge>
                      )}
                    </div>
                    <span className="nav-label">{module.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="tooltip-text">
                  <p className="text-small font-medium">{module.label}</p>
                  {(module.badge ?? 0) > 0 && (
                    <p className="text-xs text-muted mt-0.5">{module.badge} élément(s) en attente</p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </div>

      {/* Flèche de navigation droite */}
      {showRightArrow && (
        <button
          onClick={() => scrollNav('right')}
          className="nav-scroll-btn right group"
          aria-label="Défiler vers la droite"
        >
          <ChevronRight className="w-4 h-4 text-role-primary group-hover:scale-110 transition-transform" />
        </button>
      )}

    </nav>
  );
}