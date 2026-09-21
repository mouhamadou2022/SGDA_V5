// components/modules/planning/PlanningModals.tsx
// Modales extraites de PlanningModule (comportement identique).
// Toutes prop-driven : aucun état interne, aucun appel store direct
// (les callbacks viennent du parent).

'use client';

import { createPortal } from 'react-dom';
import {
  CalendarDays, AlertCircle, X, PlayCircle, Info, Brain,
  CheckCircle2, Edit2, Users, Shield, XCircle,
} from 'lucide-react';
import type { Planning, Aerodrome, Utilisateur, ProfilRisque, IaSuggestion } from '@/lib/store';
import { FormShell } from '@/components/ui/FormShell';
import PlanningForm from '@/components/forms/PlanningForm';
import { RISK_LEVELS, getRiskLevel } from '@/lib/risque';
import { toDatetimeLocal, startOfToday } from './planningDates';

export function ModaleSuppression({ deleteDialogOpen, setDeleteDialogOpen, confirmDelete, userRole }: {
  deleteDialogOpen: boolean, setDeleteDialogOpen: (v: boolean) => void,
  confirmDelete: () => void, userRole: string
}) {
  if (!deleteDialogOpen) return null;
  return createPortal(
    <div className="modal-overlay" data-role={userRole} onClick={() => setDeleteDialogOpen(false)}>
      <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
          <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-5">
            <div className="modal-title flex items-center gap-2 text-danger">
              <AlertCircle className="w-5 h-5" />
              Confirmer la suppression
            </div>
            <button className="modal-close" onClick={() => setDeleteDialogOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="modal-body py-6 px-5">
            <p className="text-foreground">Êtes-vous sûr de vouloir supprimer ce planning ?</p>
            <p className="text-small text-muted-foreground mt-2">Cette action est irréversible.</p>
          </div>
          <div className="modal-footer border-t border-border p-5 flex justify-end gap-3">
            <button className="btn btn-secondary" onClick={() => setDeleteDialogOpen(false)}>Annuler</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Supprimer</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ModaleExecution({ executeConfirmOpen, executeTarget, setExecuteConfirmOpen, setExecuteTarget, aerodromesActifs, aerodromes, userRole, handleConfirmExecute, executeDateDebut, setExecuteDateDebut, executeDateFin, setExecuteDateFin }: {
  executeConfirmOpen: boolean, executeTarget: Planning | null,
  setExecuteConfirmOpen: (v: boolean) => void, setExecuteTarget: (v: Planning | null) => void,
  aerodromesActifs: Aerodrome[], aerodromes: Aerodrome[], userRole: string,
  handleConfirmExecute: () => void,
  executeDateDebut: string, setExecuteDateDebut: (v: string) => void,
  executeDateFin: string, setExecuteDateFin: (v: string) => void,
}) {
  if (!executeConfirmOpen || !executeTarget) return null;
  const aerodrome = aerodromesActifs.find(a => a.id === executeTarget.aerodrome_id) || aerodromes.find(a => a.id === executeTarget.aerodrome_id);
  return createPortal(
    <div className="modal-overlay" data-role={userRole} onClick={() => { setExecuteConfirmOpen(false); setExecuteTarget(null); }}>
      <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
          <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-5">
            <div className="modal-title flex items-center gap-2 text-role-primary">
              <PlayCircle className="w-5 h-5" />
              Lancer la surveillance
            </div>
            <button className="modal-close" onClick={() => { setExecuteConfirmOpen(false); setExecuteTarget(null); }}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="modal-body py-6 px-5 space-y-4">
            <div className="p-3 bg-role-primary-soft rounded-lg">
              <p className="text-sm font-medium">Aérodrome: <span className="text-foreground">{aerodrome?.code_oaci} — {aerodrome?.nom}</span></p>
              <p className="text-sm font-medium mt-1">Type: <span className="text-foreground">{executeTarget.type.replace('_', ' ')}</span></p>
              <p className="text-sm font-medium mt-1">Période programmée: <span className="text-foreground">{new Date(executeTarget.date_debut).toLocaleDateString('fr-FR')} → {new Date(executeTarget.date_fin).toLocaleDateString('fr-FR')}</span></p>
            </div>

            {/* Dates réelles d'exécution — ajustables par le chef d'équipe */}
            <div>
              <h4 className="text-sm font-medium mb-2">Dates réelles de la surveillance</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Début réel</label>
                  <input
                    type="datetime-local"
                    value={executeDateDebut}
                    min={toDatetimeLocal(startOfToday().toISOString())}
                    onChange={(e) => setExecuteDateDebut(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fin réelle</label>
                  <input
                    type="datetime-local"
                    value={executeDateFin}
                    onChange={(e) => setExecuteDateFin(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-foreground text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Pré-remplies avec les dates programmées. Ajustez-les selon les dates réelles de la mission.
              </p>
            </div>

            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Vous allez être redirigé vers le module Surveillance</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    La surveillance sera créée automatiquement. Vous pourrez ensuite rédiger la checklist, identifier les écarts et produire le rapport.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-footer border-t border-border p-5 flex justify-end gap-3">
            <button className="btn btn-secondary" onClick={() => { setExecuteConfirmOpen(false); setExecuteTarget(null); }}>Annuler</button>
            <button className="btn btn-primary" onClick={handleConfirmExecute}>
              <PlayCircle className="w-4 h-4 mr-1" />
              Continuer vers Surveillance
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ModaleFormulaire({ formOpen, setFormOpen, editingPlanning, setEditingPlanning, userRole }: {
  formOpen: boolean, setFormOpen: (v: boolean) => void,
  editingPlanning: Planning | null, setEditingPlanning: (v: Planning | null) => void,
  userRole: string
}) {
  return (
    <FormShell
      open={!!formOpen}
      onClose={() => setFormOpen(false)}
      title={editingPlanning ? 'Modifier le planning' : 'Nouveau planning'}
      icon={CalendarDays}
      size="3xl"
      dataRole={userRole}
    >
      <PlanningForm
        planning={editingPlanning}
        onClose={() => setFormOpen(false)}
        onSuccess={() => { setFormOpen(false); setEditingPlanning(null); }}
      />
    </FormShell>
  );
}

export function ModaleSuggestionsIA({ open, onClose, suggestions, aerodromesActifs, profilsRisque, utilisateurs, userRole, onValider, onAjuster, onRejeter }: {
  open: boolean, onClose: () => void,
  suggestions: IaSuggestion[],
  aerodromesActifs: Aerodrome[],
  profilsRisque: Record<string, ProfilRisque> | undefined,
  utilisateurs: Utilisateur[],
  userRole: string,
  onValider: (s: IaSuggestion) => void,
  onAjuster: (s: IaSuggestion) => void,
  onRejeter: (s: IaSuggestion) => void,
}) {
  if (!open) return null;
  return createPortal(
    <div className="modal-overlay" data-role={userRole} onClick={onClose}>
      <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto p-0" onClick={e => e.stopPropagation()}>
        <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary">
          <div className="modal-header border-b border-border bg-role-primary-soft">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center !text-white">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Suggestions AERORISQ</h2>
                <p className="text-xs text-muted-foreground">{suggestions.length} proposition(s) de surveillance en attente de validation</p>
              </div>
            </div>
            <button onClick={onClose} className="btn btn-secondary gap-2">
              <X className="h-4 w-4" />Fermer
            </button>
          </div>
          <div className="p-6 space-y-4">
            {suggestions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Aucune suggestion AERORISQ en attente.</p>
              </div>
            )}
            {suggestions.map((s) => {
              const aerodrome = aerodromesActifs.find(a => a.id === s.aerodrome_id)
              const sourceLabel = s.source === 'risque_critique' ? 'Score critique'
                : s.source === 'sgs_absent' ? 'SGS absent'
                : s.source === 'sgs_faible' ? 'SGS insuffisant'
                : s.source === 'certification_fraiche' ? 'Certification obtenue'
                : s.source === 'homologation_fraiche' ? 'Homologation obtenue'
                : s.source === 'declencheur_urgent' ? 'Déclencheur urgent'
                : s.source
              const profil = profilsRisque?.[s.aerodrome_id]
              const niveauKey = profil && typeof profil.score_global === 'number'
                ? getRiskLevel(profil.score_global)
                : null
              const niveauLabel = niveauKey ? RISK_LEVELS[niveauKey].label : null
              const niveauColor = niveauKey ? RISK_LEVELS[niveauKey].color : null

              return (
                <div key={s.id} className="border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="code-oaci-badge">{aerodrome?.code_oaci || s.aerodrome_id}</span>
                      <span className="badge text-xs capitalize">{s.type.replace(/_/g, ' ')}</span>
                      {niveauLabel && niveauColor && (
                        <span className={`badge text-xs ${niveauColor}`} title="Niveau de risque de l'aérodrome">
                          {niveauLabel}
                        </span>
                      )}
                      <span className="badge outline text-xs">{Math.round(s.confiance)}% confiance</span>
                    </div>
                    <span className="badge neutral text-xs shrink-0">{sourceLabel}</span>
                  </div>
                  <p className="text-sm font-medium mb-1">{s.objectifs}</p>
                  <p className="text-xs text-muted-foreground mb-3">{s.raison}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {s.portee.map(d => (
                      <span key={d} className="badge outline text-xs">{d}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
                    <span>Début: {new Date(s.date_debut).toLocaleDateString('fr-FR')}</span>
                    <span>Fin: {new Date(s.date_fin).toLocaleDateString('fr-FR')}</span>
                  </div>
                  {s.equipe_ids.length > 0 && (
                    <div className="mb-3 p-3 rounded-lg bg-role-primary-soft border border-role-primary-light">
                      <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-role-primary" />
                        Équipe de surveillance proposée
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {s.equipe_ids.map(id => {
                          const membre = utilisateurs.find(u => u.id === id)
                          const estChef = id === s.chef_id
                          return (
                            <span key={id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${estChef ? 'badge primary' : 'badge outline'}`}>
                              {estChef && <Shield className="w-3 h-3" />}
                              {membre ? `${membre.prenom} ${membre.nom}` : id}
                              {estChef && <span className="font-bold">Chef</span>}
                            </span>
                          )
                        })}
                      </div>
                      {s.equipe_justification && (
                        <p className="text-[11px] text-muted-foreground mt-2">{s.equipe_justification}</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => onValider(s)}
                      className="btn btn-sm btn-success gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Valider
                    </button>
                    <button
                      onClick={() => onAjuster(s)}
                      className="btn btn-sm btn-primary gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Ajuster
                    </button>
                    <button
                      onClick={() => onRejeter(s)}
                      className="btn btn-sm btn-outline gap-1 text-danger border-danger/30 hover:bg-danger/5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Rejeter
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ModaleFeedback({ open, onClose, value, onChangeValue, reason, onChangeReason, onConfirm }: {
  open: boolean, onClose: () => void,
  value: boolean, onChangeValue: (v: boolean) => void,
  reason: string, onChangeReason: (v: string) => void,
  onConfirm: () => void,
}) {
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content max-w-md rounded-2xl overflow-hidden border-t-4 border-t-role-primary" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
          <div className="modal-title flex items-center gap-2">
            <Brain className="w-5 h-5 text-role-primary" />
            Feedback sur la suggestion
          </div>
          <button onClick={onClose} className="modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="modal-body p-5 space-y-4">
          <p className="text-sm text-muted-foreground">Cette suggestion était-elle pertinente ?</p>
          <div className="flex gap-3">
            <button
              onClick={() => { onChangeValue(true); onChangeReason(''); }}
              className={`flex-1 py-3 rounded-lg border-2 text-center font-medium transition-all ${value ? 'border-success bg-success/10 text-success' : 'border-border hover:bg-muted'}`}
            >
              <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
              Oui, pertinent
            </button>
            <button
              onClick={() => { onChangeValue(false); }}
              className={`flex-1 py-3 rounded-lg border-2 text-center font-medium transition-all ${!value ? 'border-danger bg-danger/10 text-danger' : 'border-border hover:bg-muted'}`}
            >
              <XCircle className="w-5 h-5 mx-auto mb-1" />
              Non, pas pertinent
            </button>
          </div>
          {!value && (
            <div>
              <label className="text-sm font-medium mb-1 block">Pourquoi ?</label>
              <select
                value={reason}
                onChange={(e) => onChangeReason(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
              >
                <option value="">Sélectionnez une raison</option>
                <option value="Type incorrect">Type de surveillance incorrect</option>
                <option value="Pas le bon moment">Pas le bon moment</option>
                <option value="Déjà planifié">Déjà planifié ailleurs</option>
                <option value="Priorité trop basse">Priorité trop basse</option>
                <option value="Autre">Autre raison</option>
              </select>
            </div>
          )}
        </div>
        <div className="modal-footer border-t border-border p-4 flex justify-end gap-2">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={onConfirm}>Envoyer</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
