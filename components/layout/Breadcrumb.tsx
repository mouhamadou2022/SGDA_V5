// components/layout/Breadcrumb.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { ChevronRight, Home, Plane, Navigation } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  onNavigate?: (module: string) => void;
}

export function Breadcrumb({ items, onNavigate }: BreadcrumbProps) {
  const user = useAppStore(s => s.user);
  const activeModule = useAppStore(s => s.activeModule);
  const [isHovered, setIsHovered] = useState(false);
  const [animateHome, setAnimateHome] = useState(false);
  const [prevItemsLength, setPrevItemsLength] = useState(items.length);

  // Animation lors de l'ajout d'un nouvel élément (navigation)
  useEffect(() => {
    if (items.length > prevItemsLength) {
      // Un nouvel élément a été ajouté → animation d'atterrissage
      const timer = setTimeout(() => setAnimateHome(false), 500);
      return () => clearTimeout(timer);
    }
    setPrevItemsLength(items.length);
  }, [items.length, prevItemsLength]);

  const handleHomeClick = () => {
    setAnimateHome(true);
    setTimeout(() => {
      onNavigate?.('dashboard');
      setAnimateHome(false);
    }, 300);
  };

  // Obtenir le module parent depuis le label actuel (pour la navigation hiérarchique)
  const getParentModule = (currentLabel: string): string | null => {
    const moduleMap: Record<string, string> = {
      'Aérodromes': 'dashboard',
      'Certification': 'dashboard',
      'Homologation': 'dashboard',
      'Planning': 'dashboard',
      'Surveillance': 'dashboard',
      'Écarts & PAC': 'dashboard',
      'Registres': 'dashboard',
      'Dossiers': 'dashboard',
      'Formation': 'dashboard',
      'Kit Inspecteur': 'dashboard',
      'Événements': 'dashboard',
      'Enquêtes': 'dashboard',
      'Messagerie': 'dashboard',
      'Profil de Risque': 'dashboard',
      'Signatures DG': 'dashboard',
      'Charge de Travail': 'dashboard',
      'Utilisateurs': 'dashboard',
      'Journal Audit': 'dashboard',
      "Codes d'Accès": 'dashboard',
      'Mon Dashboard': 'dashboard',
      'Mes Écarts': 'plans-actions',
      'Documents': 'kit',
    };
    return moduleMap[currentLabel] || null;
  };

  return (
    <nav className="breadcrumb animate-slide-down" aria-label="Breadcrumb" data-role={user?.role}>
      <div className="container">
        <ol className="breadcrumb-list">
          {/* Élément Accueil avec animation */}
          <li className="breadcrumb-item">
            <button
              onClick={handleHomeClick}
              className={`breadcrumb-home group relative overflow-hidden ${animateHome ? 'animate-landing' : ''}`}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              title="Retour à l'accueil"
            >
              <Home className={`h-4 w-4 transition-all duration-300 ${isHovered ? 'scale-110 text-role-primary' : ''}`} />
              {/* Effet avion au survol */}
              {isHovered && (
                <Plane 
                  className="absolute -top-4 -right-3 w-3 h-3 text-role-primary opacity-70 animate-takeoff"
                  style={{ animationDuration: '0.8s' }}
                />
              )}
              <span className="sr-only">Accueil</span>
            </button>
          </li>

          {/* Séparateur après Accueil (si items existent) */}
          {items.length > 0 && (
            <li className="breadcrumb-separator" aria-hidden="true">
              <ChevronRight className="h-3 w-3" />
            </li>
          )}
          
          {/* Éléments du breadcrumb avec animation */}
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const parentModule = !isLast ? getParentModule(item.label) : null;
            
            return (
              <React.Fragment key={index}>
                <li className={`breadcrumb-item ${isLast ? 'active' : ''} animate-slide-right`} style={{ animationDelay: `${index * 0.1}s` }}>
                  {!isLast && parentModule ? (
                    <button
                      onClick={() => parentModule && onNavigate?.(parentModule)}
                      className="breadcrumb-link hover:text-role-primary transition-colors"
                    >
                      {item.label}
                    </button>
                  ) : (
                    <span className={isLast ? 'breadcrumb-item active' : 'breadcrumb-item'}>
                      {item.label}
                    </span>
                  )}
                </li>
                {!isLast && (
                  <li className="breadcrumb-separator" aria-hidden="true">
                    <ChevronRight className="h-3 w-3" />
                  </li>
                )}
              </React.Fragment>
            );
          })}
        </ol>

        {/* Indicateur de position (style radar) */}
        {items.length > 0 && (
          <div className="hidden lg:flex items-center gap-2 ml-4">
            <div className="w-1.5 h-1.5 rounded-full bg-role-primary animate-pulse" />
            <span className="text-[10px] text-muted uppercase tracking-wider">
              {items[items.length - 1]?.label}
            </span>
          </div>
        )}
      </div>
    </nav>
  );
}