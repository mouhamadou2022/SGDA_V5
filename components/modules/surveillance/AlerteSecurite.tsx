// components/modules/surveillance/AlerteSecurite.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  Flame,
  CheckCircle2,
  XCircle,
  Eye,
  Download,
  Trash2,
  Upload,
  X,
  Clock,
  UserCheck,
  FileText,
  Camera,
  Send,
  Bell,
  BellRing,
  ChevronDown,
} from 'lucide-react';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { FileUploader } from '@/components/ui/FileUploader';
import { createPortal } from 'react-dom';

// Types
export type NiveauAlerte = 'critique' | 'eleve' | 'moyen' | 'faible';
export type StatutAlerte = 'active' | 'traitee' | 'cloturee';

export interface AlerteSecuriteData {
  id: string;
  surveillanceId: string;
  delegationId?: string;
  itemId: string;
  itemNumero: string;
  itemDescription: string;
  domaine: string;
  niveau: NiveauAlerte;
  message: string;
  declencheePar: string;
  declencheurNom: string;
  declencheeLe: string;
  statut: StatutAlerte;
  preuves: { id: string; nom: string; url: string; dateUpload: string }[];
  commentaireTraitement?: string;
  traiteePar?: string;
  traiteeLe?: string;
  notifieChef: boolean;
  notifieChefLe?: string;
  notifieDG: boolean;
  notifieDGLe?: string;
}

export interface AlerteSecuriteProps {
  alerte: AlerteSecuriteData;
  onTraiter?: (alerteId: string, commentaire: string, preuves?: { nom: string; url: string }[]) => void;
  onCloturer?: (alerteId: string) => void;
  onNotifierDG?: (alerteId: string) => void;
  onVoirDetails?: (alerteId: string) => void;
  readOnly?: boolean;
  compact?: boolean;
}

// Configuration des niveaux d'alerte
const NIVEAU_CONFIG: Record<NiveauAlerte, {
  label: string;
  badgeClass: string;
  icon: React.ElementType;
  iconClass: string;
  bgClass: string;
  borderClass: string;
}> = {
  critique: {
    label: 'Critique',
    badgeClass: 'badge danger animate-pulse',
    icon: Flame,
    iconClass: 'text-danger',
    bgClass: 'bg-danger/10',
    borderClass: 'border-danger',
  },
  eleve: {
    label: 'Élevé',
    badgeClass: 'badge warning',
    icon: AlertOctagon,
    iconClass: 'text-warning',
    bgClass: 'bg-warning/10',
    borderClass: 'border-warning',
  },
  moyen: {
    label: 'Moyen',
    badgeClass: 'badge primary',
    icon: AlertTriangle,
    iconClass: 'text-primary',
    bgClass: 'bg-primary/10',
    borderClass: 'border-primary',
  },
  faible: {
    label: 'Faible',
    badgeClass: 'badge neutral',
    icon: AlertTriangle,
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-gray-100',
    borderClass: 'border-gray-300',
  },
};

const STATUT_CONFIG: Record<StatutAlerte, {
  label: string;
  badgeClass: string;
  icon: React.ElementType;
}> = {
  active: {
    label: 'Active',
    badgeClass: 'badge danger animate-pulse',
    icon: BellRing,
  },
  traitee: {
    label: 'Traitée',
    badgeClass: 'badge warning',
    icon: Bell,
  },
  cloturee: {
    label: 'Clôturée',
    badgeClass: 'badge success',
    icon: CheckCircle2,
  },
};

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

// Composant: Alerte card (version complète)
function AlerteSecuriteCardFull({
  alerte,
  onTraiter,
  onCloturer,
  onNotifierDG,
  onVoirDetails,
  readOnly,
}: AlerteSecuriteProps) {
  const [expanded, setExpanded] = useState(false);
  const [showTraiterModal, setShowTraiterModal] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [preuves, setPreuves] = useState<{ id: string; nom: string; url: string; dateUpload: string }[]>([]);
  const user = useOptimizedStore(s => s.user);

  const niveauConfig = NIVEAU_CONFIG[alerte.niveau];
  const statutConfig = STATUT_CONFIG[alerte.statut];
  const NiveauIcon = niveauConfig.icon;
  const StatutIcon = statutConfig.icon;

  const handleTraiter = () => {
    if (!commentaire.trim()) return;
    onTraiter?.(alerte.id, commentaire, preuves);
    setShowTraiterModal(false);
    setCommentaire('');
    setPreuves([]);
  };

  const handleFileUpload = (file: { nom: string; url: string }) => {
    setPreuves(prev => [...prev, {
      id: `proof-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      nom: file.nom,
      url: file.url,
      dateUpload: new Date().toISOString(),
    }]);
  };

  const handleFileDelete = (proofId: string) => {
    setPreuves(prev => prev.filter(p => p.id !== proofId));
  };

  return (
    <div className={`border-l-4 ${niveauConfig.borderClass} rounded-lg bg-white shadow-sm mb-3`}>
      <div
        className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${niveauConfig.bgClass}`}>
              <NiveauIcon className={`w-5 h-5 ${niveauConfig.iconClass}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-foreground">
                  {alerte.domaine} - {alerte.itemNumero}
                </span>
                <span className={niveauConfig.badgeClass}>{niveauConfig.label}</span>
                <span className={statutConfig.badgeClass}>
                  <StatutIcon className="w-3 h-3 inline mr-1" />
                  {statutConfig.label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {alerte.itemDescription}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3 h-3" />
                  {alerte.declencheurNom}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(alerte.declencheeLe).toLocaleString('fr-FR')}
                </span>
                {alerte.notifieChef && (
                  <span className="flex items-center gap-1 text-success">
                    <BellRing className="w-3 h-3" />
                    Chef notifié
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="action-button"
              onClick={(e) => { e.stopPropagation(); onVoirDetails?.(alerte.id); }}
              title="Voir détails"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button className="action-button">
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-4 pt-0 border-t border-border animate-fade-in">
          {/* Message d'alerte */}
          <div className={`p-3 rounded-lg ${niveauConfig.bgClass} mb-3`}>
            <p className="text-sm font-medium">{alerte.message}</p>
          </div>

          {/* Preuves existantes */}
          {alerte.preuves.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Preuves jointes
              </p>
              <div className="space-y-1">
                {alerte.preuves.map(proof => (
                  <div key={proof.id} className="flex items-center gap-2 text-xs bg-gray-50 p-2 rounded">
                    <FileText className="w-4 h-4 text-primary" />
                    <span className="flex-1 truncate">{proof.nom}</span>
                    <button
                      className="action-button"
                      onClick={() => window.open(proof.url, '_blank')}
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    <button
                      className="action-button"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = proof.url;
                        link.download = proof.nom;
                        link.click();
                      }}
                    >
                      <Download className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commentaire de traitement */}
          {alerte.commentaireTraitement && (
            <div className="mb-3 p-2 bg-gray-100 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground">Commentaire de traitement</p>
              <p className="text-sm mt-1">{alerte.commentaireTraitement}</p>
              {alerte.traiteePar && (
                <p className="text-xs text-muted-foreground mt-1">
                  Traité par {alerte.traiteePar} le {new Date(alerte.traiteeLe || '').toLocaleString('fr-FR')}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          {!readOnly && alerte.statut === 'active' && (
            <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border">
              <button
                onClick={() => onNotifierDG?.(alerte.id)}
                className="btn btn-secondary btn-sm gap-2"
              >
                <Send className="w-4 h-4" />
                Notifier le DG
              </button>
              <button
                onClick={() => setShowTraiterModal(true)}
                className="btn btn-primary btn-sm gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Traiter l'alerte
              </button>
            </div>
          )}

          {!readOnly && alerte.statut === 'traitee' && (
            <div className="flex items-center justify-end mt-3 pt-3 border-t border-border">
              <button
                onClick={() => onCloturer?.(alerte.id)}
                className="btn btn-success btn-sm gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Clôturer
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de traitement */}
      {showTraiterModal && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setShowTraiterModal(false)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Traiter l'alerte</h2>
              <button className="modal-close" onClick={() => setShowTraiterModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body py-4 space-y-4">
              <div className="p-3 bg-danger/10 rounded-lg">
                <p className="text-sm font-medium text-danger">
                  {alerte.domaine} - {alerte.itemNumero}
                </p>
                <p className="text-sm mt-1">{alerte.itemDescription}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Signalé par {alerte.declencheurNom} le {new Date(alerte.declencheeLe).toLocaleString('fr-FR')}
                </p>
              </div>

              <div className="form-field">
                <label className="filter-label">
                  Commentaire de traitement <span className="text-danger">*</span>
                </label>
                <textarea
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Décrivez les actions entreprises..."
                  className={`form-textarea min-h-[100px] ${focusClass}`}
                />
              </div>

              <div>
                <label className="filter-label">Preuves (optionnel)</label>
                <FileUploader
                  onUpload={handleFileUpload}
                  accept=".pdf,.jpg,.jpeg,.png"
                />
                {preuves.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {preuves.map(proof => (
                      <div key={proof.id} className="flex items-center gap-2 text-xs bg-gray-50 p-2 rounded">
                        <FileText className="w-3 h-3 text-primary" />
                        <span className="flex-1 truncate">{proof.nom}</span>
                        <button
                          className="action-button danger"
                          onClick={() => handleFileDelete(proof.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowTraiterModal(false)}>
                Annuler
              </button>
              <button
                className="btn btn-primary"
                disabled={!commentaire.trim()}
                onClick={handleTraiter}
              >
                Confirmer le traitement
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Composant: Alerte card (version compacte)
function AlerteSecuriteCardCompact({
  alerte,
  onVoirDetails,
}: AlerteSecuriteProps) {
  const niveauConfig = NIVEAU_CONFIG[alerte.niveau];
  const NiveauIcon = niveauConfig.icon;

  return (
    <div
      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${niveauConfig.bgClass}`}
      onClick={() => onVoirDetails?.(alerte.id)}
    >
      <div className="flex items-center gap-2">
        <NiveauIcon className={`w-4 h-4 ${niveauConfig.iconClass}`} />
        <div>
          <span className="text-sm font-medium">{alerte.domaine}</span>
          <p className="text-xs text-muted-foreground line-clamp-1">{alerte.itemDescription}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={niveauConfig.badgeClass}>{niveauConfig.label}</span>
        <Eye className="w-3 h-3 text-muted-foreground" />
      </div>
    </div>
  );
}

// Composant principal
export function AlerteSecurite({
  alerte,
  onTraiter,
  onCloturer,
  onNotifierDG,
  onVoirDetails,
  readOnly = false,
  compact = false,
}: AlerteSecuriteProps) {
  if (compact) {
    return (
      <AlerteSecuriteCardCompact
        alerte={alerte}
        onVoirDetails={onVoirDetails}
        readOnly={readOnly}
      />
    );
  }

  return (
    <AlerteSecuriteCardFull
      alerte={alerte}
      onTraiter={onTraiter}
      onCloturer={onCloturer}
      onNotifierDG={onNotifierDG}
      onVoirDetails={onVoirDetails}
      readOnly={readOnly}
    />
  );
}

// Composant: Liste des alertes
export function AlerteSecuriteList({
  alertes,
  onTraiter,
  onCloturer,
  onNotifierDG,
  onVoirDetails,
  readOnly = false,
  compact = false,
  title = "Alertes sécurité",
}: {
  alertes: AlerteSecuriteData[];
  onTraiter?: (alerteId: string, commentaire: string, preuves?: { nom: string; url: string }[]) => void;
  onCloturer?: (alerteId: string) => void;
  onNotifierDG?: (alerteId: string) => void;
  onVoirDetails?: (alerteId: string) => void;
  readOnly?: boolean;
  compact?: boolean;
  title?: string;
}) {
  const alertesActives = alertes.filter(a => a.statut === 'active');
  const alertesTraitees = alertes.filter(a => a.statut === 'traitee');
  const alertesCloturees = alertes.filter(a => a.statut === 'cloturee');

  if (alertes.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Aucune alerte sécurité</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alertes actives */}
      {alertesActives.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BellRing className="w-4 h-4 text-danger" />
            <span className="text-sm font-semibold text-danger">Actives ({alertesActives.length})</span>
          </div>
          <div className="space-y-2">
            {alertesActives.map(alerte => (
              <AlerteSecurite
                key={alerte.id}
                alerte={alerte}
                onTraiter={onTraiter}
                onCloturer={onCloturer}
                onNotifierDG={onNotifierDG}
                onVoirDetails={onVoirDetails}
                readOnly={readOnly}
                compact={compact}
              />
            ))}
          </div>
        </div>
      )}

      {/* Alertes traitées */}
      {alertesTraitees.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-warning" />
            <span className="text-sm font-semibold text-warning">Traitée ({alertesTraitees.length})</span>
          </div>
          <div className="space-y-2">
            {alertesTraitees.map(alerte => (
              <AlerteSecurite
                key={alerte.id}
                alerte={alerte}
                onTraiter={onTraiter}
                onCloturer={onCloturer}
                onNotifierDG={onNotifierDG}
                onVoirDetails={onVoirDetails}
                readOnly={readOnly}
                compact={compact}
              />
            ))}
          </div>
        </div>
      )}

      {/* Alertes clôturées */}
      {alertesCloturees.length > 0 && !compact && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Alertes clôturées ({alertesCloturees.length})
          </summary>
          <div className="mt-2 space-y-2">
            {alertesCloturees.map(alerte => (
              <AlerteSecurite
                key={alerte.id}
                alerte={alerte}
                onVoirDetails={onVoirDetails}
                readOnly={true}
                compact={true}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default AlerteSecurite;