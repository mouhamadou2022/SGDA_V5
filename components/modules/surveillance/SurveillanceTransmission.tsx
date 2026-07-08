// components/modules/surveillance/SurveillanceTransmission.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Aerodrome } from '@/lib/store';
import {
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  X,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

interface SurveillanceTransmissionProps {
  surveillanceId: string;
  aerodrome?: Aerodrome;
  checklistSignee: boolean;
  ecartsTraites: boolean;
  rapportSigne: boolean;
  lettreSigneeDG: boolean;
  onTransmettre: (data: any) => void;
  onClose: () => void;
  open: boolean;
  userRole?: string;
}

export default function SurveillanceTransmission({
  surveillanceId,
  aerodrome,
  checklistSignee,
  ecartsTraites,
  rapportSigne,
  lettreSigneeDG,
  onTransmettre,
  onClose,
  open,
  userRole = 'inspector',
}: SurveillanceTransmissionProps) {
  const [messagePersonnalise, setMessagePersonnalise] = useState('');
  const [dateLimitePAC, setDateLimitePAC] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [isTransmettant, setIsTransmettant] = useState(false);
  const [erreurTransmission, setErreurTransmission] = useState<string | null>(null);

  useEffect(() => {
    const allOk = checklistSignee && ecartsTraites && rapportSigne && lettreSigneeDG;
    setVerificationComplete(allOk);
  }, [checklistSignee, ecartsTraites, rapportSigne, lettreSigneeDG]);

  const prerequis = [
    { label: 'Checklist signée', ok: checklistSignee, message: 'La checklist doit être signée par les inspecteurs' },
    { label: 'Tous les écarts traités', ok: ecartsTraites, message: 'Aucun écart ne doit rester non traité' },
    { label: 'Rapport signé', ok: rapportSigne, message: 'Le rapport de surveillance doit être signé' },
    { label: 'Lettre de transmission signée par le DG', ok: lettreSigneeDG, message: 'La lettre doit être signée par le DG ANACIM' },
  ];

  const handleTransmettre = async () => {
    if (isTransmettant) return;
    setIsTransmettant(true);
    setErreurTransmission(null);
    try {
      await onTransmettre({
        surveillanceId,
        dateLimitePAC,
        messagePersonnalise,
        dateTransmission: new Date().toISOString(),
      });
    } catch (err) {
      setErreurTransmission(err instanceof Error ? err.message : 'Erreur lors de la transmission');
      setIsTransmettant(false);
    }
  };

  if (!open) return null;

  return typeof window !== 'undefined' ? createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-2xl border-t-4 border-t-role-primary"
        data-role={userRole}
        data-module="surveillance-transmission"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title flex items-center gap-2">
            <Send className="h-5 w-5 text-role-primary" />
            Transmission au portail exploitant
          </h2>
          <button className="action-button" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body space-y-6 py-4">
          {/* En-tête */}
          <Card className="bg-primary/10">
              <div className="flex items-center gap-3">
                <div>
                  <p className="filter-label text-xs">Aérodrome</p>
                  <p className="font-bold text-small">{aerodrome?.nom} ({aerodrome?.code_oaci})</p>
                </div>
              </div>
          </Card>

          {/* Barre de progression */}
          <div className="space-y-2">
            <div className="flex justify-between text-small">
              <span className="font-medium">Vérification pré-transmission</span>
              <span>{prerequis.filter(p => p.ok).length}/{prerequis.length}</span>
            </div>
            <div className="progress h-2">
              <div className="progress-bar" style={{ width: `${(prerequis.filter(p => p.ok).length / prerequis.length) * 100}%` }} />
            </div>
          </div>

          {/* Liste des prérequis */}
          <div className="space-y-3">
            {prerequis.map((p, index) => (
              <div
                key={index}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  p.ok ? 'bg-success/10 border-success' : 'bg-danger/10 border-danger'
                }`}
              >
                {p.ok ? (
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-danger flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`font-medium text-small ${p.ok ? 'text-success-800' : 'text-danger-800'}`}>
                    {p.label}
                  </p>
                  <p className={`text-small ${p.ok ? 'text-success-600' : 'text-danger-600'}`}>
                    {p.message}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Message si incomplet */}
          {!verificationComplete && (
            <div className="alert alert-danger">
              <AlertCircle className="alert-icon h-4 w-4" />
              <span>La transmission est bloquée. Veuillez compléter tous les éléments requis.</span>
            </div>
          )}

          {erreurTransmission && (
            <div className="alert alert-danger">
              <AlertCircle className="alert-icon h-4 w-4" />
              <div className="alert-content">
                <span className="alert-title">Erreur de transmission</span>
                <p className="text-xs mt-1">{erreurTransmission}</p>
              </div>
            </div>
          )}

          <hr className="border-border my-4" />

          {/* Options de transmission */}
          <div className="space-y-4">
            <div className="form-field">
              <label className="filter-label">Date limite de réponse PAC</label>
              <input
                type="date"
                value={dateLimitePAC}
                onChange={(e) => setDateLimitePAC(e.target.value)}
                disabled={!verificationComplete}
                className={`form-input ${focusClass}`}
              />
              <p className="field-description">
                Date avant laquelle l'exploitant doit soumettre ses plans d'action
              </p>
            </div>

            <div className="form-field">
              <label className="filter-label">Message personnalisé (optionnel)</label>
              <textarea
                value={messagePersonnalise}
                onChange={(e) => setMessagePersonnalise(e.target.value)}
                placeholder="Ajoutez un message à destination de l'exploitant..."
                disabled={!verificationComplete}
                className={`form-textarea min-h-[100px] ${focusClass}`}
              />
            </div>
          </div>

          {/* Récapitulatif des pièces jointes */}
          <Card>
              <p className="text-small font-medium mb-2">Documents transmis :</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-small">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>Rapport de surveillance signé</span>
                  <span className={`badge ml-auto text-xs ${rapportSigne ? 'success' : 'outline'}`}>{rapportSigne ? '✓' : '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-small">
                  <FileText className="h-4 w-4 text-success" />
                  <span>Checklist de surveillance signée</span>
                  <span className={`badge ml-auto text-xs ${checklistSignee ? 'success' : 'outline'}`}>{checklistSignee ? '✓' : '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-small">
                  <FileText className="h-4 w-4 text-danger" />
                  <span>Écarts constatés signés</span>
                  <span className={`badge ml-auto text-xs ${ecartsTraites ? 'success' : 'outline'}`}>{ecartsTraites ? '✓' : '—'}</span>
                </div>
                <div className="flex items-center gap-2 text-small">
                  <FileText className="h-4 w-4 text-warning" />
                  <span>Lettre de transmission (signée DG)</span>
                  <span className={`badge ml-auto text-xs ${lettreSigneeDG ? 'success' : 'outline'}`}>{lettreSigneeDG ? '✓' : '—'}</span>
                </div>
              </div>
          </Card>

          {/* Actions */}
          <div className="form-actions">
            <button type="button" onClick={onClose} className="btn btn-secondary gap-2">
              <X className="h-4 w-4" />
              Annuler
            </button>
            <button
              type="button"
              onClick={handleTransmettre}
              disabled={!verificationComplete || isTransmettant}
              className={`btn btn-primary gap-2 ${!verificationComplete || isTransmettant ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isTransmettant ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {isTransmettant ? 'Transmission en cours…' : 'Confirmer la transmission'}
            </button>
          </div>

          {/* Note */}
          <p className="text-xs text-gray-400 text-center">
            La transmission est irréversible. Après confirmation, les documents seront
            accessibles en lecture seule sur le portail exploitant.
          </p>
        </div>
      </div>
    </div>,
    document.body
  ) : null;
}
