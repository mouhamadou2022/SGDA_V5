// components/modules/surveillance/InspecteurDelegationPanel.tsx
// Panel affiché à un inspecteur qui a des domaines délégués pour cette surveillance
// Permet de suivre ses tâches et de transmettre au chef d'équipe
'use client';

import React, { useState } from 'react';
import {
  ClipboardList, AlertTriangle, CheckCircle2,
  Send, Clock, ChevronRight, Shield,
  FileSignature, Loader2, Info,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAppStore, Delegation } from '@/lib/store';
import { getDomaineLabel } from '@/lib/domaines';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InspecteurDelegationPanelProps {
  surveillanceId: string;
  /** Portée de la surveillance (pour déterminer si SGS ou standard) */
  portee?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextAction(del: Delegation): {
  label: string;
  route?: string;
  action?: 'sign_checklist' | 'sign_ecarts' | 'transmettre';
  disabled: boolean;
  variant: 'primary' | 'success' | 'secondary';
} {
  switch (del.statut) {
    case 'assigne':
    case 'en_cours':
    case 'checklist_en_cours':
      return {
        label: 'Compléter la checklist',
        route: del.domaine === 'SGS' ? '__sgs_checklist__' : '__checklist__',
        disabled: false,
        variant: 'primary',
      };
    case 'checklist_signee':
    case 'ecarts_en_cours':
      return {
        label: 'Rédiger les écarts',
        route: del.domaine === 'SGS' ? '__sgs_ecarts__' : '__ecarts__',
        disabled: false,
        variant: 'primary',
      };
    case 'ecarts_signes':
      return {
        label: 'Transmettre au chef',
        action: 'transmettre',
        disabled: false,
        variant: 'success',
      };
    case 'transmis_chef':
    case 'termine':
      return {
        label: 'Transmis ✓',
        disabled: true,
        variant: 'secondary',
      };
    case 'bloque':
      return {
        label: 'Bloqué — contacter le chef',
        disabled: true,
        variant: 'secondary',
      };
    default:
      return { label: 'Commencer', disabled: false, variant: 'primary' };
  }
}

function StatutStep({
  done, active, label,
}: { done: boolean; active: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 text-xs transition-all ${
        done
          ? 'bg-success border-success text-white'
          : active
          ? 'bg-role-primary border-role-primary text-white animate-pulse'
          : 'bg-muted/20 border-border text-muted-foreground'
      }`}>
        {done ? '✓' : active ? '…' : '○'}
      </div>
      <span className="text-[9px] text-muted-foreground mt-0.5 whitespace-nowrap">{label}</span>
    </div>
  );
}

// ─── Carte par délégation ─────────────────────────────────────────────────────

function DelegationTaskCard({
  delegation,
  surveillanceId,
  portee,
}: {
  delegation: Delegation;
  surveillanceId: string;
  portee?: string[];
}) {
  const updateDelegation = useAppStore(s => s.updateDelegation);
  const addNotification  = useAppStore(s => s.addNotification);
  const user             = useAppStore(s => s.user);
  const router           = useRouter();
  const [isTransmitting, setIsTransmitting] = useState(false);

  const next = getNextAction(delegation);
  const isSGS = delegation.domaine === 'SGS';
  const isTransmis = delegation.statut === 'transmis_chef' || delegation.statut === 'termine';

  // Calcul statut visuels pour la mini-timeline
  const order = { assigne: 0, en_cours: 1, checklist_en_cours: 1, checklist_signee: 2, ecarts_en_cours: 3, ecarts_signes: 4, transmis_chef: 5, termine: 5, bloque: -1 } as Record<string, number>;
  const currentOrder = order[delegation.statut] ?? 0;

  const handleAction = async () => {
    if (!next.route && next.action !== 'transmettre') return;

    if (next.action === 'transmettre') {
      setIsTransmitting(true);
      const now = new Date().toISOString();
      updateDelegation(delegation.id, {
        statut: 'transmis_chef',
        transmis_le: now,
        derniere_activite: now,
      });
      addNotification({
        user_id: user?.id ?? '',
        type: 'success',
        title: 'Travaux transmis',
        message: `Vos travaux sur le domaine ${delegation.domaine} ont été transmis au chef d'équipe.`,
        canal: 'in_app',
      });
      await new Promise(r => setTimeout(r, 400));
      setIsTransmitting(false);
      return;
    }

    // Navigation
    if (next.route === '__checklist__')     router.push(`/surveillance/${surveillanceId}/checklist`);
    if (next.route === '__sgs_checklist__') router.push(`/surveillance/${surveillanceId}/checklist?type=sgs`);
    if (next.route === '__ecarts__')        router.push(`/surveillance/${surveillanceId}/ecarts`);
    if (next.route === '__sgs_ecarts__')    router.push(`/surveillance/${surveillanceId}/ecarts/sgs`);
  };

  return (
    <Card
      variant={isTransmis ? "level" : delegation.statut === 'bloque' ? "level" : "role"}
      levelColor={isTransmis ? "success" : delegation.statut === 'bloque' ? "danger" : undefined}
      className="transition-all"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 flex-1">
          <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold text-white ${
            isSGS ? 'bg-warning' : 'bg-role-primary'
          }`}>
            {isSGS ? <Shield className="w-5 h-5" /> : delegation.domaine}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {!isSGS && (
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-role-primary text-white">
                  {delegation.domaine}
                </span>
              )}
              <p className="font-medium text-sm text-foreground">
                {delegation.domaine_nom ?? getDomaineLabel(delegation.domaine as any) ?? delegation.domaine}
              </p>
              {isSGS && (
                <span className="badge warning text-[10px]">SGS — PAOE</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {delegation.items_count ?? delegation.items_ids.length} item{(delegation.items_count ?? 1) > 1 ? 's' : ''} •{' '}
              Assigné le {new Date(delegation.assigne_le).toLocaleDateString('fr-FR')}
            </p>

            <div className="flex items-center gap-1 mt-2">
              <StatutStep done={currentOrder >= 0} active={currentOrder === 0} label="Assigné" />
              <div className={`h-0.5 w-4 mb-3 rounded-full ${currentOrder >= 2 ? 'bg-success' : 'bg-border'}`} />
              <StatutStep done={currentOrder >= 2} active={currentOrder === 1} label="Checklist" />
              <div className={`h-0.5 w-4 mb-3 rounded-full ${currentOrder >= 4 ? 'bg-success' : 'bg-border'}`} />
              <StatutStep done={currentOrder >= 4} active={currentOrder === 3} label="Écarts" />
              <div className={`h-0.5 w-4 mb-3 rounded-full ${currentOrder >= 5 ? 'bg-success' : 'bg-border'}`} />
              <StatutStep done={currentOrder >= 5} active={currentOrder === 4} label="Transmis" />
            </div>
          </div>
        </div>

        <button
          onClick={handleAction}
          disabled={next.disabled || isTransmitting}
          className={`btn gap-2 flex-shrink-0 ${
            next.variant === 'success' ? 'btn-success' :
            next.variant === 'primary' ? 'btn-primary' :
            'btn-secondary opacity-60 cursor-default'
          }`}
        >
          {isTransmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : next.variant === 'success' ? (
            <Send className="w-4 h-4" />
          ) : next.disabled ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          {isTransmitting ? 'Envoi...' : next.label}
        </button>
      </div>

      {isSGS && currentOrder < 2 && (
        <div className="mt-3 flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
          <Info className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-warning-foreground">
            Ce domaine utilise l'évaluation PAOE (Absent / Présent / Approprié / Opérationnel / Efficace)
            — pas de NS/NV, pas d'indice OACI.
          </p>
        </div>
      )}
    </Card>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function InspecteurDelegationPanel({
  surveillanceId,
  portee,
}: InspecteurDelegationPanelProps) {
  const user                      = useAppStore(s => s.user);
  const getDelegationsByInspecteur = useAppStore(s => s.getDelegationsByInspecteur);

  if (!user?.id) return null;

  // Délégations assignées à cet inspecteur pour cette surveillance
  const mesDelegations = getDelegationsByInspecteur(user.id).filter(
    d => d.surveillance_id === surveillanceId
  );

  if (mesDelegations.length === 0) return null;

  const transmises = mesDelegations.filter(d => d.statut === 'transmis_chef' || d.statut === 'termine').length;
  const allDone    = transmises === mesDelegations.length;

  return (
    <Card className="border-role-primary/30" data-module="inspecteur-delegation"
      icon={<FileSignature className="w-4 h-4 text-role-primary" />}
      title="Mes domaines délégués"
      badge={<span className="badge outline text-xs">{transmises}/{mesDelegations.length} transmis</span>}
    >
      {allDone && (
        <p className="text-xs text-success mb-3 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Tous vos travaux ont été transmis au chef d'équipe.
        </p>
      )}

      <div className="space-y-3">
        {!allDone && (
          <div className="alert alert-info p-3">
            <Info className="alert-icon w-4 h-4" />
            <div className="alert-content">
              <div className="alert-description text-xs">
                Pour chaque domaine : complétez la checklist → signez → rédigez les écarts → signez → transmettez au chef d'équipe.
              </div>
            </div>
          </div>
        )}

        {mesDelegations.map(del => (
          <DelegationTaskCard
            key={del.id}
            delegation={del}
            surveillanceId={surveillanceId}
            portee={portee}
          />
        ))}
      </div>
    </Card>
  );
}

