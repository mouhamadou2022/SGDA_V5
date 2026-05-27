// components/modules/plans-actions/AideMemoirePAC.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { HelpCircle, X, CheckCircle, XCircle, FileText, Users, Calendar, Target, Shield, Globe, AlertCircle } from 'lucide-react';
import { createPortal } from 'react-dom';

interface AideMemoirePACProps {
  type: 'pac' | 'preuves';
  trigger?: React.ReactNode;
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
}

const PAC_CRITERES = [
  {
    id: 'pertinence',
    label: 'Pertinence',
    description: 'Le PAC s\'attaque-t-il directement aux causes profondes identifiées lors de l\'inspection ?',
    bonExemple: 'Écart "Balisage défectueux" → PAC "Remplacer les 12 blocs HS"',
    mauvaisExemple: 'Écart "Balisage défectueux" → PAC "Réorganiser le service technique"',
    icon: Target,
  },
  {
    id: 'exhaustivite',
    label: 'Exhaustivité',
    description: 'Le PAC couvre-t-il l\'ensemble des dimensions de la problématique identifiée ?',
    bonExemple: 'Remplacement + test + formation du personnel',
    mauvaisExemple: 'Remplacement seul, sans test ni formation',
    icon: Shield,
  },
  {
    id: 'precision',
    label: 'Précision',
    description: 'Les actions sont-elles décrites de manière séquentielle détaillée ?',
    bonExemple: '1. Commander blocs, 2. Remplacer, 3. Tester, 4. Former',
    mauvaisExemple: 'Réparer le balisage (trop vague)',
    icon: FileText,
  },
  {
    id: 'specificite',
    label: 'Spécificité',
    description: 'Les responsabilités sont-elles clairement définies ?',
    bonExemple: 'Action 1: M. Diop (DTS), Action 2: Mme Sy (Responsable SSLIA)',
    mauvaisExemple: 'L\'exploitant se charge des réparations (trop vague)',
    icon: Users,
  },
  {
    id: 'realisme',
    label: 'Réalisme',
    description: 'Les délais et ressources sont-ils réalistes ?',
    bonExemple: 'Remplacement en 15j (délai réaliste pour commande + intervention)',
    mauvaisExemple: 'Remplacement en 2j (impossible compte tenu des délais de livraison)',
    icon: Calendar,
  },
  {
    id: 'coherence',
    label: 'Cohérence',
    description: 'Y a-t-il cohérence avec les autres PAC soumis ?',
    bonExemple: 'PAC balisage + PAC signalétique (actions complémentaires)',
    mauvaisExemple: 'PAC balisage dit "OK" mais autre PAC signale le même problème',
    icon: Globe,
  },
];

const PREUVES_CRITERES = [
  {
    id: 'completude',
    label: 'Complétude',
    description: 'Tous les livrables attendus sont-ils fournis ?',
    bonExemple: 'Facture + photo après travaux + rapport de test',
    mauvaisExemple: 'Facture uniquement, sans preuve de réalisation',
    icon: FileText,
  },
  {
    id: 'qualite',
    label: 'Qualité',
    description: 'Les documents sont-ils lisibles ? Les photos identifiables ?',
    bonExemple: 'Photo datée avec légende, document PDF signé',
    mauvaisExemple: 'Photo floue sans date, document illisible',
    icon: AlertCircle,
  },
  {
    id: 'pertinence',
    label: 'Pertinence',
    description: 'Les preuves démontrent-elles réellement la réalisation des actions ?',
    bonExemple: 'Photo de l\'équipement après réparation',
    mauvaisExemple: 'Photo générique non liée à l\'action',
    icon: Target,
  },
  {
    id: 'tracabilite',
    label: 'Traçabilité',
    description: 'Les preuves sont-elles datées et signées ?',
    bonExemple: 'Document daté et signé par le responsable',
    mauvaisExemple: 'Document sans date ni signature',
    icon: Shield,
  },
  {
    id: 'efficacite',
    label: 'Efficacité',
    description: 'L\'action a-t-elle réellement résolu l\'écart ?',
    bonExemple: 'Rapport de test confirmant le bon fonctionnement',
    mauvaisExemple: 'Preuve de réalisation mais problème persistant',
    icon: CheckCircle,
  },
];

export function AideMemoirePAC({ type, trigger, position = 'bottom-right' }: AideMemoirePACProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      setButtonRect(buttonRef.current.getBoundingClientRect());
    }
  }, [isOpen]);

  const criteres = type === 'pac' ? PAC_CRITERES : PREUVES_CRITERES;
  const title = type === 'pac' ? 'Critères d\'évaluation du PAC' : 'Critères d\'évaluation des preuves';
  const regle = type === 'pac'
    ? '✅ TOUS les critères doivent être respectés pour accepter le PAC'
    : '✅ TOUS les critères doivent être respectés pour valider les preuves';

  const getPositionStyle = (): React.CSSProperties => {
    if (!buttonRect) return { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    switch (position) {
      case 'bottom-right':
        return {
          position: 'fixed',
          top: buttonRect.bottom + 8,
          left: buttonRect.right - 320,
          zIndex: 10000,
        };
      case 'top-right':
        return {
          position: 'fixed',
          top: buttonRect.top - 400,
          left: buttonRect.right - 320,
          zIndex: 10000,
        };
      case 'bottom-left':
        return {
          position: 'fixed',
          top: buttonRect.bottom + 8,
          left: buttonRect.left,
          zIndex: 10000,
        };
      case 'top-left':
        return {
          position: 'fixed',
          top: buttonRect.top - 400,
          left: buttonRect.left,
          zIndex: 10000,
        };
      default:
        return {
          position: 'fixed',
          top: buttonRect.bottom + 8,
          left: buttonRect.right - 320,
          zIndex: 10000,
        };
    }
  };

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const triggerElement = trigger || (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleToggle}
      className="action-button text-primary hover:bg-role-primary-soft transition-colors"
      title="Aide mémoire"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  );

  const modalContent = isOpen && (
    <div
      className="bg-background border border-border rounded-xl shadow-2xl w-[320px] max-h-[500px] overflow-hidden flex flex-col"
      style={getPositionStyle()}
    >
      <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-3">
        <div className="modal-title text-sm flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-role-primary" />
          {title}
        </div>
        <button className="modal-close" onClick={handleClose}>
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="bg-primary/10 rounded-lg p-2 text-center">
          <p className="text-xs font-medium text-primary">{regle}</p>
        </div>

        {criteres.map((critere) => {
          const Icon = critere.icon;
          return (
            <div key={critere.id} className="border border-border rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-role-primary" />
                <span className="text-xs font-semibold text-foreground">{critere.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{critere.description}</p>
              <div className="mt-1 pt-1 border-t border-border">
                <div className="flex items-start gap-1">
                  <CheckCircle className="w-3 h-3 text-success mt-0.5 flex-shrink-0" />
                  <p className="text-[9px] text-success-700">{critere.bonExemple}</p>
                </div>
                <div className="flex items-start gap-1 mt-0.5">
                  <XCircle className="w-3 h-3 text-danger mt-0.5 flex-shrink-0" />
                  <p className="text-[9px] text-danger-700">{critere.mauvaisExemple}</p>
                </div>
              </div>
            </div>
          );
        })}

        <div className="bg-warning/10 rounded-lg p-2">
          <p className="text-[10px] text-warning-700">
            ⚠️ Important: Si un seul critère n'est pas respecté, le PAC/preuves est automatiquement refusé.
          </p>
        </div>
      </div>

      <div className="border-t border-border p-2">
        <button onClick={handleClose} className="btn btn-secondary btn-sm w-full text-xs">
          Fermer
        </button>
      </div>
    </div>
  );

  if (!mounted) return <>{triggerElement}</>;

  return (
    <>
      {triggerElement}
      {createPortal(modalContent, document.body)}
    </>
  );
}

export default AideMemoirePAC;