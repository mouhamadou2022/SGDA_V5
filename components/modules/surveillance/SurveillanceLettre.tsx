// components/modules/surveillance/SurveillanceLettre.tsx
'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle, Mail, AlertCircle, Info, Upload,
  X, Eye, Trash2, FileText, Calendar, Tag, Activity,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import type { Aerodrome } from '@/lib/store';
import { LettreTransmissionUpload } from '@/components/ui/LettreTransmissionUpload';

interface SurveillanceLettreProps {
  surveillanceId: string;
  aerodrome?: Aerodrome;
  onLettreSignee?: (signatureUrl: string) => void;
  readOnly?: boolean;
  userRole?: string;
}

export default function SurveillanceLettre({
  surveillanceId,
  aerodrome,
  onLettreSignee,
  readOnly = false,
  userRole = 'inspector',
}: SurveillanceLettreProps) {
  const surveillances = useOptimizedStore(s => s.surveillances);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const addNotification = useAppStore(s => s.addNotification);
  const user = useOptimizedStore(s => s.user);
  const utilisateurs = useOptimizedStore(s => s.utilisateurs);
  const surveillance = surveillances.find(s => s.id === surveillanceId);

  const [lettreFileName, setLettreFileName] = useState<string | null>(null);
  const [lettreDate, setLettreDate] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const lettreUrl = surveillance?.lettre_signee_url ?? null;
  const isLettreChargee = !!lettreUrl;
  const isTransmise = surveillance?.statut === 'transmise';
  const isReadOnly = readOnly || isTransmise;

  const handleUpload = (url: string, fileName: string, date: string) => {
    setLettreFileName(fileName);
    setLettreDate(date);
    updateSurveillance(surveillanceId, {
      lettre_signee_url: url,
      statut: 'lettre_signee',
    });
    const inspecteurs = utilisateurs.filter(u => surveillance?.equipe_ids?.includes(u.id));
    inspecteurs.forEach(inspecteur => {
      addNotification({
        user_id: inspecteur.id,
        type: 'success',
        title: 'Lettre de transmission chargée',
        message: `La lettre pour ${aerodrome?.code_oaci ?? 'l\'aérodrome'} est disponible.`,
        canal: 'in_app',
      });
    });
    onLettreSignee?.(url);
    setUploadModalOpen(false);
  };

  const handleRemove = () => {
    setLettreFileName(null);
    setLettreDate(null);
    updateSurveillance(surveillanceId, {
      lettre_signee_url: undefined,
      statut: 'rapport_signe',
    });
  };

  const getStatutLabel = (statut: string) => {
    const map: Record<string, string> = {
      planifiee: 'Planifiée', en_cours: 'En cours',
      checklist_signee: 'Checklist signée', ecarts_signes: 'Écarts signés',
      rapport_signe: 'Rapport signé', lettre_signee: 'Lettre signée',
      transmise: 'Transmise', archivee: 'Archivée',
    };
    return map[statut] ?? statut;
  };

  if (!surveillance) {
    return (
      <div className="animate-fade-in">
        <Card className="text-center">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-small">Surveillance introuvable.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-up">

      {/* ── Hero zone : état de la lettre ── */}
      {isLettreChargee ? (
        <div className="kpi-card animate-scale">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="kpi-icon">
                <CheckCircle />
              </div>
              <div>
                <p className="kpi-label">Lettre de transmission</p>
                <p className="font-semibold text-foreground text-base">
                  {lettreFileName ?? 'Document chargé'}
                </p>
                {lettreDate && (
                  <p className="text-small mt-0.5 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Chargée le {new Date(lettreDate).toLocaleDateString('fr-FR')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {lettreUrl && (
                <button
                  onClick={() => window.open(lettreUrl, '_blank')}
                  className="btn btn-secondary btn-sm gap-1"
                  title="Voir la lettre"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Voir
                </button>
              )}
              {!isReadOnly && (
                <>
                  <button
                    onClick={() => setUploadModalOpen(true)}
                    className="btn btn-secondary btn-sm gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Remplacer
                  </button>
                  <button
                    onClick={handleRemove}
                    className="action-button text-danger"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── Zone upload vide ── */
        <div className="kpi-card animate-fade-in">
          <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
            <div className="kpi-icon mx-auto">
              <Mail />
            </div>
            <div>
              <p className="font-semibold text-foreground">Aucune lettre chargée</p>
              <p className="text-small mt-1">
                PDF, DOC ou DOCX — signée par le Directeur Général
              </p>
            </div>
            {!isReadOnly && (
              <button
                onClick={() => setUploadModalOpen(true)}
                className="btn btn-primary gap-2 shadow-role-glow"
              >
                <Upload className="w-4 h-4" />
                Charger la lettre
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Alerte contextuelle ── */}
      {!isLettreChargee && (
        <div className="alert alert-info animate-fade-in">
          <Info className="alert-icon" />
          <div className="alert-content">
            La lettre de transmission doit être signée par le Directeur Général avant d'être chargée.
          </div>
        </div>
      )}

      {/* ── Métadonnées surveillance ── */}
      <div className="animate-fade-in" style={{ animationDelay: '100ms' }}>
        <Card
          icon={<Activity className="w-4 h-4 text-role-primary" />}
          title="Informations de la surveillance"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-role-primary-soft flex items-center justify-center flex-shrink-0">
                <Tag className="w-3.5 h-3.5 text-role-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Type</p>
                <p className="text-sm font-medium capitalize">
                  {surveillance.type?.replace(/_/g, ' ') ?? '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-role-primary-soft flex items-center justify-center flex-shrink-0">
                <Activity className="w-3.5 h-3.5 text-role-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Statut</p>
                <p className="text-sm font-medium">
                  {getStatutLabel(surveillance.statut ?? '')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-role-primary-soft flex items-center justify-center flex-shrink-0">
                <Calendar className="w-3.5 h-3.5 text-role-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Date début</p>
                <p className="text-sm font-medium">
                  {surveillance.date_debut
                    ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR')
                    : '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-role-primary-soft flex items-center justify-center flex-shrink-0">
                <Calendar className="w-3.5 h-3.5 text-role-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Date fin</p>
                <p className="text-sm font-medium">
                  {surveillance.date_fin
                    ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR')
                    : '—'}
                </p>
              </div>
            </div>
          </div>
      </Card>
      </div>

      {/* ── Modale upload ── */}
      {uploadModalOpen && createPortal(
        <div
          className="modal-overlay"
          onClick={() => setUploadModalOpen(false)}
        >
          <div
            className="modal-content max-w-lg w-full animate-scale"
            onClick={e => e.stopPropagation()}
          >
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">

              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title">
                  <div className="w-8 h-8 rounded-lg bg-role-primary-soft flex items-center justify-center">
                    <FileText className="w-4 h-4 text-role-primary" />
                  </div>
                  Charger la lettre de transmission
                </div>
                <button
                  className="modal-close"
                  onClick={() => setUploadModalOpen(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="modal-body space-y-4">
                {aerodrome && (
                  <div className="flex items-center gap-3 p-3 bg-role-primary-soft rounded-xl">
                    <Mail className="w-4 h-4 text-role-primary flex-shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Aérodrome concerné</p>
                      <p className="text-sm font-semibold text-role-primary">
                        {aerodrome.code_oaci} — {aerodrome.nom}
                      </p>
                    </div>
                  </div>
                )}

                <div className="alert alert-info">
                  <Info className="alert-icon" />
                  <div className="alert-content text-xs">
                    Le document doit être signé par le Directeur Général.
                    Formats acceptés : <strong>PDF, DOC, DOCX</strong>.
                  </div>
                </div>

                <LettreTransmissionUpload
                  label="Lettre de transmission DG ANACIM"
                  currentUrl={lettreUrl}
                  currentFileName={lettreFileName ?? undefined}
                  currentDate={lettreDate ?? undefined}
                  onUpload={handleUpload}
                  onRemove={undefined}
                  disabled={false}
                  required
                />
              </div>

              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setUploadModalOpen(false)}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
