// components/modules/surveillance/ChefDashboard.tsx
// Tableau de bord du chef d'équipe pour suivre les délégations en temps réel
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  Wifi,
  WifiOff,
  UserCheck,
  FileText,
  RefreshCw,
  Shield,
  ClipboardCheck,
  FileCheck2,
  Send,
} from 'lucide-react';
import { useAppStore, Delegation } from '@/lib/store';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ChefDashboardProps {
  surveillanceId: string;
  /** Appelé quand tous les domaines ont été transmis → ouvre modal rapport */
  onToutRecu?: () => void;
  onRefresh?: () => void;
  refreshInterval?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STATUT_ORDER: Record<string, number> = {
  assigne:            0,
  en_cours:           1,
  checklist_en_cours: 1,
  checklist_signee:   2,
  ecarts_en_cours:    3,
  ecarts_signes:      4,
  transmis_chef:      5,
  termine:            5,
  bloque:            -1,
};

// ─── Mini-timeline par délégation ─────────────────────────────────────────────

function MiniTimeline({ statut }: { statut: string }) {
  const order    = STATUT_ORDER[statut] ?? 0;
  const isBloque = statut === 'bloque';

  const Step = ({ threshold, label }: { threshold: number; label: string }) => {
    const done   = !isBloque && order >= threshold;
    const active = !isBloque && order === threshold - 1;
    return (
      <div className="flex flex-col items-center">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 text-[9px] font-bold transition-all ${
          done    ? 'bg-success border-success text-white'
          : active ? 'bg-role-primary border-role-primary text-white animate-pulse'
          : isBloque ? 'bg-danger/20 border-danger text-danger'
          : 'bg-muted/20 border-border text-muted-foreground'
        }`}>
          {done ? '✓' : isBloque ? '!' : '○'}
        </div>
        <span className="text-[8px] text-muted-foreground mt-0.5 whitespace-nowrap">{label}</span>
      </div>
    );
  };

  const Connector = ({ reached }: { reached: boolean }) => (
    <div className={`h-0.5 w-4 mb-3.5 flex-shrink-0 rounded-full ${reached ? 'bg-success' : 'bg-border'}`} />
  );

  return (
    <div className="flex items-center gap-0.5">
      <Step threshold={0} label="Assigné"  />
      <Connector reached={!isBloque && order >= 2} />
      <Step threshold={2} label="Checklist" />
      <Connector reached={!isBloque && order >= 4} />
      <Step threshold={4} label="Écarts"   />
      <Connector reached={!isBloque && order >= 5} />
      <Step threshold={5} label="Transmis" />
    </div>
  );
}

// ─── Carte par délégation ─────────────────────────────────────────────────────

function DelegationTransmissionCard({ delegation }: { delegation: Delegation }) {
  const isTransmis = delegation.statut === 'transmis_chef' || delegation.statut === 'termine';
  const isBloque   = delegation.statut === 'bloque';
  const isSGS      = delegation.domaine === 'SGS';

  return (
    <div className={`border rounded-lg p-3 transition-all ${
      isTransmis ? 'border-success/40 bg-success/5'
      : isBloque  ? 'border-danger/40  bg-danger/5'
      : 'border-border'
    }`}>
      {/* Header: domaine + inspecteur + badge */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold text-white ${
            isSGS ? 'bg-warning' : 'bg-role-primary'
          }`}>
            {isSGS ? <Shield className="w-3.5 h-3.5" /> : delegation.domaine.slice(0, 3)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate leading-tight">
              {delegation.domaine_nom ?? delegation.domaine}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              {delegation.assigne_nom ?? delegation.assigne_a}
              {' · '}
              {(delegation.items_count ?? delegation.items_ids.length)} item{((delegation.items_count ?? 1) > 1) ? 's' : ''}
            </p>
          </div>
        </div>
        {isTransmis ? (
          <span className="badge success text-[10px] flex-shrink-0">✓ Transmis</span>
        ) : isBloque ? (
          <span className="badge danger text-[10px] animate-pulse flex-shrink-0">⚠ Bloqué</span>
        ) : (
          <span className="badge warning text-[10px] flex-shrink-0">En cours</span>
        )}
      </div>

      {/* Mini-timeline */}
      <MiniTimeline statut={delegation.statut} />

      {/* Date transmission */}
      {delegation.transmis_le && (
        <p className="text-[10px] text-success mt-1.5 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Transmis le {new Date(delegation.transmis_le).toLocaleDateString('fr-FR')} à{' '}
          {new Date(delegation.transmis_le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* Signatures disponibles */}
      {(delegation.checklist_signe_le || delegation.ecarts_signes_le) && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {delegation.checklist_signe_le && (
            <span className="flex items-center gap-0.5 text-[9px] text-success">
              <ClipboardCheck className="w-3 h-3" />
              Checklist signée
            </span>
          )}
          {delegation.ecarts_signes_le && (
            <span className="flex items-center gap-0.5 text-[9px] text-success">
              <FileCheck2 className="w-3 h-3" />
              Écarts signés
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ────────────────────────────────────────────────────────

export function ChefDashboard({
  surveillanceId,
  onToutRecu,
  onRefresh,
  refreshInterval = 30000,
}: ChefDashboardProps) {
  const getDelegationsBySurveillance = useAppStore(s => s.getDelegationsBySurveillance);
  const user                         = useAppStore(s => s.user);

  const [expandedSections, setExpandedSections] = useState<string[]>(['transmissions', 'inspecteurs']);
  const [isRefreshing, setIsRefreshing]          = useState(false);
  const [tick, setTick]                          = useState(0); // force re-render on interval

  // Live data from store
  const delegations = getDelegationsBySurveillance(surveillanceId);

  // Auto-refresh (triggers re-render to pick up store changes)
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const id = setInterval(() => setTick(t => t + 1), refreshInterval);
    return () => clearInterval(id);
  }, [refreshInterval]);

  // KPIs
  const total     = delegations.length;
  const transmis  = delegations.filter(d => d.statut === 'transmis_chef' || d.statut === 'termine').length;
  const bloques   = delegations.filter(d => d.statut === 'bloque').length;
  const enCours   = total - transmis - bloques;
  const toutTransmis      = total > 0 && transmis === total;
  const progressionGlobale = total > 0 ? Math.round((transmis / total) * 100) : 0;

  // Group by inspector
  const parInspecteur = useMemo(() => {
    const map = new Map<string, { nom: string; dels: Delegation[] }>();
    delegations.forEach(d => {
      const key = d.assigne_a;
      if (!map.has(key)) map.set(key, { nom: d.assigne_nom ?? d.assigne_a, dels: [] });
      map.get(key)!.dels.push(d);
    });
    return Array.from(map.values());
  }, [delegations]);

  // Don't render if no delegations
  if (total === 0) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 400));
    setTick(t => t + 1);
    setIsRefreshing(false);
    onRefresh?.();
  };

  const toggleSection = (s: string) =>
    setExpandedSections(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );

  return (
    <div className="card border-role-primary/30" data-module="chef-dashboard">
      {/* ── En-tête ── */}
      <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="w-4 h-4 text-role-primary" />
            <h3 className="font-semibold text-sm text-foreground">
              Suivi des délégations
            </h3>
            <span className="badge outline text-xs">{transmis}/{total} transmis</span>
            {toutTransmis && (
              <span className="badge success text-xs">✓ Tout reçu</span>
            )}
          </div>
          <button
            onClick={handleRefresh}
            className="action-button"
            disabled={isRefreshing}
            title="Rafraîchir"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="card-content p-4 space-y-4">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 bg-success/10 rounded-lg">
            <div className="text-xl font-bold text-success">{transmis}</div>
            <div className="text-[10px] text-muted-foreground">Transmis</div>
          </div>
          <div className="text-center p-2 bg-warning/10 rounded-lg">
            <div className="text-xl font-bold text-warning">{enCours}</div>
            <div className="text-[10px] text-muted-foreground">En cours</div>
          </div>
          <div className={`text-center p-2 rounded-lg ${bloques > 0 ? 'bg-danger/10' : 'bg-muted/20'}`}>
            <div className={`text-xl font-bold ${bloques > 0 ? 'text-danger' : 'text-muted-foreground'}`}>{bloques}</div>
            <div className="text-[10px] text-muted-foreground">Bloqués</div>
          </div>
        </div>

        {/* ── Barre de progression globale ── */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Avancement des transmissions</span>
            <span className="font-medium">{progressionGlobale}%</span>
          </div>
          <div className="progress h-2">
            <div
              className={`progress-bar transition-all ${toutTransmis ? 'bg-success' : 'bg-role-primary'}`}
              style={{ width: `${progressionGlobale}%` }}
            />
          </div>
        </div>

        {/* ── Section : État des transmissions ── */}
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-3 bg-muted/20 hover:bg-role-primary-soft transition-colors"
            onClick={() => toggleSection('transmissions')}
          >
            <div className="flex items-center gap-2">
              <Send className="w-3.5 h-3.5 text-role-primary" />
              <span className="font-medium text-sm">État des transmissions</span>
              <span className="badge outline text-xs">
                {total} domaine{total > 1 ? 's' : ''}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${
              expandedSections.includes('transmissions') ? 'rotate-180' : ''
            }`} />
          </button>

          {expandedSections.includes('transmissions') && (
            <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {delegations.map(d => (
                <DelegationTransmissionCard key={d.id} delegation={d} />
              ))}
            </div>
          )}
        </div>

        {/* ── Section : Progression par inspecteur ── */}
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-3 bg-muted/20 hover:bg-role-primary-soft transition-colors"
            onClick={() => toggleSection('inspecteurs')}
          >
            <div className="flex items-center gap-2">
              <UserCheck className="w-3.5 h-3.5 text-role-primary" />
              <span className="font-medium text-sm">Progression par inspecteur</span>
              <span className="badge outline text-xs">
                {parInspecteur.length} inspecteur{parInspecteur.length > 1 ? 's' : ''}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 transition-transform ${
              expandedSections.includes('inspecteurs') ? 'rotate-180' : ''
            }`} />
          </button>

          {expandedSections.includes('inspecteurs') && (
            <div className="p-3 space-y-2">
              {parInspecteur.map(({ nom, dels }) => {
                const doneCount = dels.filter(
                  d => d.statut === 'transmis_chef' || d.statut === 'termine'
                ).length;
                const pct = dels.length > 0
                  ? Math.round((doneCount / dels.length) * 100)
                  : 0;
                const syncRecente = dels.some(d => {
                  const ref = d.derniere_sync ?? d.derniere_activite;
                  return Date.now() - new Date(ref).getTime() < 10 * 60 * 1000;
                });

                return (
                  <div key={nom} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-role-primary text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {nom.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-sm">{nom}</span>
                        {syncRecente ? (
                          <span className="flex items-center gap-0.5 text-[10px] text-success">
                            <Wifi className="w-3 h-3" />
                            Synchro
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-[10px] text-warning">
                            <WifiOff className="w-3 h-3" />
                            Hors ligne
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {doneCount}/{dels.length} transmis
                      </span>
                    </div>

                    <div className="progress h-1.5 mb-2">
                      <div
                        className={`progress-bar ${
                          pct === 100 ? 'bg-success'
                          : pct >= 50 ? 'bg-warning'
                          : 'bg-role-primary'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {dels.map(d => (
                        <span
                          key={d.id}
                          className={`badge text-[9px] ${
                            d.statut === 'transmis_chef' || d.statut === 'termine' ? 'success'
                            : d.statut === 'bloque' ? 'danger'
                            : 'warning'
                          }`}
                        >
                          {d.domaine}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Alerte : domaines bloqués ── */}
        {bloques > 0 && (
          <div className="flex items-start gap-2 p-3 border border-danger/30 bg-danger/5 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
            <p className="text-xs text-danger">
              <strong>{bloques} domaine{bloques > 1 ? 's bloqués' : ' bloqué'}</strong> — contactez l'inspecteur
              concerné pour débloquer la situation.
            </p>
          </div>
        )}

        {/* ── CTA : Rédiger le rapport ── */}
        {toutTransmis && onToutRecu && (
          <div className="flex flex-col items-center gap-2 pt-2 border-t border-border">
            <p className="text-xs text-success font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Tous les domaines ont été transmis — vous pouvez rédiger le rapport.
            </p>
            <button onClick={onToutRecu} className="btn btn-success gap-2">
              <FileText className="w-4 h-4" />
              Charger / Rédiger le rapport
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default ChefDashboard;
