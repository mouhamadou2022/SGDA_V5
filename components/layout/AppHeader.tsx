// components/layout/AppHeader.tsx
'use client';

import React, { useState } from 'react';
import { LogOut, User, Settings, Shield, Sun, Moon, Monitor, Brain, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AuthUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/lib/store';
import { CommandPaletteTrigger } from './CommandPalette';
import { NotificationCenter } from './NotificationCenter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AppHeaderProps {
  user: AuthUser;
  onLogout: () => void;
}

export function AppHeader({ user, onLogout }: AppHeaderProps) {
  const router = useRouter();
  const theme = useAppStore(s => s.theme);
  const setTheme = useAppStore(s => s.setTheme);
  const aerodromes = useAppStore(s => s.aerodromes);
  const [isHovered, setIsHovered] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  
  const aerodrome = React.useMemo(
    () => aerodromes.find(a => a.id === user?.aerodrome_id),
    [aerodromes, user?.aerodrome_id]
  );

  const getRoleLabel = (role: string): string => {
    const labels: Record<string, string> = {
      admin: 'ADMINISTRATEUR',
      inspector: 'INSPECTEUR',
      dg_anacim: 'DG ANACIM',
      dg_operator: 'DG EXPLOITANT',
      focal_operator: 'FOCAL EXPLOITANT',
      staff_operator: 'PERSONNEL EXPLOITANT',
      guest: 'INVITÉ'
    };
    return labels[role] || role;
  };

  const getRoleIcon = (role: string) => {
    const icons: Record<string, React.ReactNode> = {
      admin: <Shield className="w-3 h-3" />,
      inspector: <User className="w-3 h-3" />,
      dg_anacim: <Shield className="w-3 h-3" />,
    };
    return icons[role] || <User className="w-3 h-3" />;
  };

  const getInitials = (firstName: string, lastName: string): string => {
    return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  const handleLogoClick = () => {
    router.push('/dashboard');
  };

  const handleAvatarClick = () => {
    router.push('/profile');
  };

  const logoSyle = {
    background: `linear-gradient(145deg, ${getRolePrimaryColor(user.role)}, ${getRoleSecondaryColor(user.role)})`,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  };

  function getRolePrimaryColor(role: string): string {
    const colors: Record<string, string> = {
      admin: '#1a237e',
      inspector: '#b45309',
      dg_anacim: '#1b4332',
      dg_operator: '#065f46',
      focal_operator: '#0f766e',
      staff_operator: '#0d9488',
      guest: '#475569',
    };
    return colors[role] || '#1a237e';
  }

  function getRoleSecondaryColor(role: string): string {
    const colors: Record<string, string> = {
      admin: '#3949ab',
      inspector: '#f59e0b',
      dg_anacim: '#40916c',
      dg_operator: '#10b981',
      focal_operator: '#2dd4bf',
      staff_operator: '#5eead4',
      guest: '#94a3b8',
    };
    return colors[role] || '#283593';
  }

  return (
    <header className="app-header animate-slide-down" data-role={user.role}>
      {/* Logo cliquable avec dégradé selon le rôle */}
      <div 
        className="flex items-center gap-4 group cursor-pointer"
        onClick={handleLogoClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="logo relative">
          <span className="relative z-10" style={logoSyle}>
            SGDA · <Brain className="w-3 h-3 inline -mt-0.5" style={{color: 'inherit', opacity: 0.6}} /> AERORISQ<sup className="text-[9px] -top-2 ml-0.5 font-semibold inline-flex items-center gap-0.5" style={{WebkitTextFillColor: 'currentColor', color: 'inherit'}}>IA<Sparkles className="w-2.5 h-2.5 ml-0.5 text-yellow-400 inline" /><Sparkles className="w-2 h-2 text-yellow-400 -ml-1 inline" /></sup>
          </span>
          <div className="text-[8px] tracking-widest text-muted-foreground/50 font-medium -mt-1 leading-tight">IA DÉCISIONNEL</div>
          {isHovered && (
            <div className="absolute -top-6 -right-8 w-5 h-5 opacity-70 animate-takeoff">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getRolePrimaryColor(user.role) }} />
            </div>
          )}
        </div>
        <Badge className="badge role flex items-center gap-1">
          {getRoleIcon(user.role)}
          {getRoleLabel(user.role)}
        </Badge>
      </div>

      <div className="user-menu">
        {/* Command Palette Trigger */}
        <CommandPaletteTrigger />
        {aerodrome && (
          <span className="hidden lg:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-role-gradient text-white text-xs font-semibold shadow-sm shadow-role-primary/20 border border-white/20">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white">{aerodrome.nom}</span>
            <span className="text-[10px] font-mono text-white/80 bg-white/15 rounded px-1.5 py-0.5">{aerodrome.code_oaci}</span>
          </span>
        )}

        {/* Thème Dropdown */}
        <DropdownMenu open={themeOpen} onOpenChange={setThemeOpen}>
          <DropdownMenuTrigger asChild>
            <button
              className="action-button"
              aria-label="Changer le thème"
              title="Thème actuel"
            >
              <Monitor className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="dropdown-menu animate-scale" align="end">
            <DropdownMenuLabel className="text-small font-semibold text-role-primary">Thème</DropdownMenuLabel>
            <DropdownMenuSeparator className="dropdown-divider" />
            <DropdownMenuItem 
              className={`dropdown-item cursor-pointer ${theme === 'light' ? 'text-role-primary' : ''}`}
              onClick={() => setTheme('light')}
            >
              <Sun className="w-4 h-4 mr-2" />
              Clair
            </DropdownMenuItem>
            <DropdownMenuItem 
              className={`dropdown-item cursor-pointer ${theme === 'dark' ? 'text-role-primary' : ''}`}
              onClick={() => setTheme('dark')}
            >
              <Moon className="w-4 h-4 mr-2" />
              Sombre
            </DropdownMenuItem>
            <DropdownMenuItem 
              className={`dropdown-item cursor-pointer ${theme === 'system' ? 'text-role-primary' : ''}`}
              onClick={() => setTheme('system')}
            >
              <Monitor className="w-4 h-4 mr-2" />
              Système
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <NotificationCenter />

        {/* Nom de l'utilisateur */}
        <span className="text-small text-role-primary font-medium hidden sm:inline">
          {user.prenom} {user.nom}
        </span>
        
        {/* Avatar cliquable */}
        <div 
          className="user-avatar group-hover:shadow-role-glow transition-all cursor-pointer"
          onClick={handleAvatarClick}
          title="Mon profil"
        >
          {getInitials(user.prenom, user.nom)}
        </div>
        
        {/* Menu déroulant */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="action-button" aria-label="Menu utilisateur">
              <Settings className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="dropdown-menu animate-scale" align="end">
            <DropdownMenuLabel className="text-small font-semibold text-role-primary">
              {user.prenom} {user.nom}
            </DropdownMenuLabel>
            <DropdownMenuLabel className="text-xs text-muted pb-2">
              {getRoleLabel(user.role)}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="dropdown-divider" />
            <DropdownMenuItem 
              className="dropdown-item cursor-pointer"
              onClick={() => router.push('/profile')}
            >
              <User className="w-4 h-4 mr-2" />
              Mon profil
            </DropdownMenuItem>
            <DropdownMenuSeparator className="dropdown-divider" />
            <DropdownMenuItem 
              className="dropdown-item danger cursor-pointer"
              onClick={onLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}