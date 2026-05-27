'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText, CheckCircle, XCircle, MinusCircle, AlertCircle,
  PenLine, Trash2, Plus, Eye, Edit3, Check, X,
  ChevronDown, ChevronRight, Copy, MoveUp, MoveDown,
  Info, Brain, Sparkles, AlertTriangle, Type, Upload,
  MessageSquare,
} from 'lucide-react';
import { FileUploader } from '@/components/ui/FileUploader';
import SignaturePad from 'signature_pad';
import { SimpleTooltip as Tooltip } from '@/components/ui/tooltip';
import type {
  ChecklistItem,
  SousSousDomaine,
  SousDomaine,
  DomaineChecklist,
  ResultatChecklist,
  ModeSaisie,
} from '@/types/checklist';
export type {
  ChecklistItem,
  SousSousDomaine,
  SousDomaine,
  DomaineChecklist,
  ResultatChecklist,
  ModeSaisie,
};

export const RESULTAT_LABELS = {
  SA: { label: 'Satisfaisant', variant: 'success', icon: CheckCircle, color: 'bg-success/20 text-success-800 border-success', rowBg: 'bg-green-50' },
  NS: { label: 'Non satisfaisant', variant: 'danger', icon: XCircle, color: 'bg-danger/20 text-danger-800 border-danger', rowBg: 'bg-red-50' },
  NA: { label: 'Non applicable', variant: 'neutral', icon: MinusCircle, color: 'bg-blue-50 text-blue-600 border-blue-300', rowBg: 'bg-blue-50' },
  NV: { label: 'Non vérifié', variant: 'warning', icon: AlertCircle, color: 'bg-warning/20 text-warning-800 border-warning', rowBg: 'bg-orange-50' },
};

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

// ── ConfidenceIndicator ──
export function ConfidenceIndicator({ confiance }: { confiance: number }) {
  let color = 'bg-blue-200';
  let text = 'Faible';
  if (confiance >= 85) { color = 'bg-success'; text = 'Très bonne'; }
  else if (confiance >= 70) { color = 'bg-primary'; text = 'Bonne'; }
  else if (confiance >= 50) { color = 'bg-warning'; text = 'Moyenne'; }
  else if (confiance >= 30) { color = 'bg-orange-400'; text = 'Faible'; }
  else { color = 'bg-danger'; text = 'Très faible'; }
  return (
    <div className="flex items-center gap-1" title={`Confiance: ${confiance}% - ${text}`}>
      <div className="w-12 h-1.5 bg-blue-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} confidence-fill`} style={{ '--cf': confiance } as React.CSSProperties} />
      </div>
      <span className="text-[9px] text-blue-400">{confiance}%</span>
    </div>
  );
}

// ── AutoTextarea ──
export function AutoTextarea({
  value, onChange, onBlur, placeholder, className, disabled, minRows = 1,
}: {
  value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void; placeholder?: string; className?: string; disabled?: boolean; minRows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  }, []);
  useEffect(() => { adjustHeight(); }, [value, adjustHeight]);
  return (
    <textarea ref={textareaRef} value={value} onChange={onChange} onBlur={onBlur}
      placeholder={placeholder} className={`${className ?? ''} auto-textarea`} disabled={disabled} rows={minRows} />
  );
}

// ── CompactStylusInput ──
export function CompactStylusInput({ value, onChange, height = 80 }: {
  value?: string; onChange: (dataUrl: string) => void; height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.parentElement?.getBoundingClientRect();
    const width = rect?.width || 200;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);
    const sigPad = new SignaturePad(canvas, { penColor: 'rgb(0, 0, 0)', minWidth: 1, maxWidth: 2 });
    sigPadRef.current = sigPad;
    sigPad.addEventListener('beginStroke', () => setIsDrawing(true));
    sigPad.addEventListener('endStroke', () => { setIsDrawing(false); onChange(sigPad.toDataURL('image/png')); });
    if (value) sigPad.fromDataURL(value);
    return () => { sigPad.removeEventListener('beginStroke', () => {}); sigPad.removeEventListener('endStroke', () => {}); };
  }, []);

  const handleClear = () => { sigPadRef.current?.clear(); onChange(''); };
  return (
    <div className="checklist-stylus-canvas">
      <canvas ref={canvasRef} className="w-full touch-none cursor-crosshair canvas-dynamic" style={{ '--ch': `${height}px` } as React.CSSProperties} />
      {!isDrawing && !value && <div className="stylus-hint">✍️ Écrire ici avec le stylet ou le doigt</div>}
      <button type="button" onClick={handleClear} className="checklist-stylus-clear" title="Effacer"><X className="w-2.5 h-2.5" /></button>
    </div>
  );
}

// ── SuggestionInfoButton ──
export function SuggestionInfoButton({ justification, confiance, historique }: {
  justification: string; confiance: number; historique?: any[];
}) {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (popupRef.current && !popupRef.current.contains(e.target as Node)) setShowPopup(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative inline-block" ref={popupRef}>
      <button type="button" onClick={() => setShowPopup(!showPopup)} className="btn btn-ghost btn-sm p-1" title="Pourquoi cette suggestion ?">
        <Info className="w-3 h-3" />
      </button>
      {showPopup && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-80 bg-background border border-border rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2 mb-2"><Brain className="w-4 h-4 text-role-primary" /><span className="text-xs font-semibold">Pourquoi cette suggestion ?</span></div>
          <p className="text-xs text-blue-500 mb-2">{justification}</p>
          <div className="flex items-center justify-between text-[10px] text-blue-400 pt-1 border-t border-blue-200">
            <span>Confiance: {confiance}%</span>
            {historique && historique.length > 0 && <span>{historique.length} inspection(s)</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ObservationModal ──
export function ObservationModal({
  item,
  isOpen,
  onClose,
  onSave,
  readOnly,
  questionContext,
}: {
  item: ChecklistItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    payload: {
      observation?: string;
      fichiers: { id: string; nom: string; url: string; dateUpload: string }[];
    }
  ) => void;
  readOnly: boolean;
  questionContext?: {
    referenceReglementaire?: string;
    pointVerification?: string;
    directivePreuve?: string;
    domaine?: string;
  };
}) {
  // Mode simplifié (conforme au besoin): la colonne Observations reste éditable dans le tableau.
  // Ce modal sert uniquement à ajouter une preuve: nom + fichier.
  const [preuveNom, setPreuveNom] = useState('');
  const [fichiers, setFichiers] = useState<{
    id: string;
    nom: string;
    url: string;
    dateUpload: string;
  }[]>([]);

  useEffect(() => {
    if (item) {
      setFichiers(item.fichiers || []);
      setPreuveNom('');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleAddFile = (file: { nom: string; url: string }) => {
    const finalName = preuveNom.trim() || file.nom;
    setFichiers((prev) => [
      ...prev,
      {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        nom: finalName,
        url: file.url,
        dateUpload: new Date().toISOString(),
      },
    ]);
  };

  const handleDeleteFile = (fileId: string) =>
    setFichiers((prev) => prev.filter((f) => f.id !== fileId));

  const handleSave = () => {
    onSave({
      fichiers,
    });
    onClose();
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title flex items-center gap-2">
              <Upload className="w-5 h-5 text-role-primary" />
              Ajouter une preuve — {item.numero}
            </div>
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4 text-blue-500" />
            </button>
          </div>

          <div className="modal-body p-5 space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                Contexte de la question
              </div>
              <div className="text-xs text-blue-800/90 space-y-1">
                <div>
                  <span className="font-semibold">Réf:</span>{' '}
                  {questionContext?.referenceReglementaire || item.reference_reglementaire || '—'}
                </div>
                <div>
                  <span className="font-semibold">Point:</span>{' '}
                  {questionContext?.pointVerification || item.point_verification || '—'}
                </div>
                <div>
                  <span className="font-semibold">Domaine:</span>{' '}
                  {questionContext?.domaine || '—'}
                </div>
              </div>
            </div>

            <div>
              <label className="filter-label text-xs">Nom de la preuve</label>
              <input
                type="text"
                value={preuveNom}
                onChange={(e) => setPreuveNom(e.target.value)}
                placeholder="Ex: Photo du balisage, extrait RAS 14, etc."
                className={`form-input w-full ${focusClass}`}
                disabled={readOnly}
                autoFocus
              />
            </div>

            {!readOnly && (
              <div>
                <label className="filter-label text-xs">Uploader la preuve</label>
                <FileUploader
                  onUpload={handleAddFile}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                />
              </div>
            )}

            {fichiers.length > 0 && (
              <div>
                <label className="filter-label text-xs">Preuves ajoutées</label>
                <div className="space-y-2 mt-2">
                  {fichiers.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 text-xs bg-blue-50 p-2 rounded border border-blue-200"
                    >
                      <FileText className="w-3 h-3 text-blue-500" />
                      <span className="flex-1 truncate">{f.nom}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm p-1"
                        onClick={() => window.open(f.url, '_blank')}
                        title="Ouvrir"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger gap-2"
                          onClick={() => handleDeleteFile(f.id)}
                          title="Supprimer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-sm btn-secondary gap-2" onClick={onClose}>
              Annuler
            </button>
            {!readOnly && (
              <button
                className="btn btn-sm btn-primary gap-2"
                onClick={handleSave}
              >
                Ajouter
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}


// ── AddModal ──
export function AddModal({ isOpen, onClose, onAdd, type, parentName }: {
  isOpen: boolean; onClose: () => void;
  onAdd: (name: string, rowCount: number) => void;
  type: 'domaine' | 'sous-domaine' | 'sous-sous-domaine' | 'item'; parentName?: string;
}) {
  const [name, setName] = useState('');
  const [rowCount, setRowCount] = useState(1);
  if (!isOpen) return null;
  const handleSubmit = () => {
    if (name.trim() || type === 'item') { onAdd(name.trim() || 'Nouvelle ligne', rowCount); setName(''); setRowCount(1); onClose(); }
  };
  const typeLabels = { domaine: 'Domaine', 'sous-domaine': 'Sous-domaine', 'sous-sous-domaine': 'Sous-sous-domaine', item: 'Ligne(s)' };
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title"><Plus className="w-5 h-5 text-role-primary" /> Ajouter {typeLabels[type]}</div>
            <button className="modal-close" onClick={onClose}><X className="w-4 h-4 text-blue-500" /></button>
          </div>
          <div className="modal-body p-5 space-y-4">
            {parentName && <div className="p-2 bg-blue-50 rounded-lg text-sm border border-blue-200">Dans : <span className="font-medium">{parentName}</span></div>}
            {type !== 'item' && (
              <div className="form-field">
                <label className="filter-label">Nom</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder={`Nom du ${typeLabels[type]}`} className={`form-input w-full ${focusClass}`} autoFocus />
              </div>
            )}
            {type === 'item' && (
              <div className="form-field">
                <label className="filter-label">Nombre de lignes à ajouter</label>
                <input type="number" min={1} max={50} value={rowCount}
                  onChange={e => setRowCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                  className={`form-input w-full ${focusClass}`} autoFocus />
                <p className="field-description mt-1">Entre 1 et 50 lignes</p>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-sm btn-secondary gap-2" onClick={onClose}>Annuler</button>
            <button className="btn btn-sm btn-primary gap-2" onClick={handleSubmit} disabled={type !== 'item' && !name.trim()}>
              <Plus className="w-4 h-4" /> Ajouter {type === 'item' ? `${rowCount} ligne${rowCount > 1 ? 's' : ''}` : typeLabels[type]}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── ChecklistItemRow ──
function ChecklistItemRow({ item, readOnly, onUpdate, onDelete, onAddFile, onDeleteFile,
  onOpenObservation, obsMode, showFileUpload, showObservationIntegration, niveau }: {
  item: ChecklistItem; readOnly: boolean;
  onUpdate: (item: ChecklistItem) => void; onDelete: (id: string) => void;
  onAddFile: (itemId: string, file: { id: string; nom: string; url: string; dateUpload: string }) => void;
  onDeleteFile: (itemId: string, fileId: string) => void;
  onOpenObservation: (item: ChecklistItem) => void;
  obsMode?: ModeSaisie; showFileUpload?: boolean;
  showObservationIntegration?: boolean; niveau?: string;
}) {
  const [localData, setLocalData] = useState(item);
  const [obsText, setObsText] = useState(item.observation || '');
  const [obsStylus, setObsStylus] = useState(item.observation_stylus_data || '');

  const currentResultat = item.resultat || item.prediction || 'NV';
  const isPrefilled = item.prefilled === true;
  const hasPrediction = item.prediction && !item.resultat;

  useEffect(() => {
    setLocalData(item);
    setObsText(item.observation || '');
    setObsStylus(item.observation_stylus_data || '');
  }, [item]);

  const saveLocal = (updated: Partial<ChecklistItem>) => {
    const newData = { ...localData, ...updated };
    setLocalData(newData);
    onUpdate(newData);
  };

  const handleResultatChange = (resultat: ResultatChecklist) => saveLocal({ resultat, prefilled: false });

  const handleObsTextBlur = () => {
    if (obsText !== (item.observation || '')) saveLocal({ observation: obsText });
  };

  const handleObsStylusChange = (dataUrl: string) => setObsStylus(dataUrl);
  const handleObsStylusBlur = () => {
    if (obsStylus !== (item.observation_stylus_data || '')) saveLocal({ observation_stylus_data: obsStylus });
  };

  const handleFileUpload = (file: { nom: string; url: string }) => {
    const newFile = { id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, nom: file.nom, url: file.url, dateUpload: new Date().toISOString() };
    saveLocal({ fichiers: [...(item.fichiers || []), newFile] });
  };
  const handleDeleteFile = (fileId: string) => saveLocal({ fichiers: (item.fichiers || []).filter(f => f.id !== fileId) });

  const hasObservation = !!(item.observation || item.observation_stylus_data || (item.fichiers && item.fichiers.length > 0));
  const activeObsMode = item.mode_saisie_obs || obsMode || 'clavier';
  const showTextObservation = activeObsMode === 'clavier' || activeObsMode === 'mixte';
  const showStylusObservation = activeObsMode === 'stylet' || activeObsMode === 'mixte';

  return (
    <div className={`checklist-row ${currentResultat === 'SA' ? 'status-sa' : currentResultat === 'NS' ? 'status-ns' : currentResultat === 'NA' ? 'status-na' : 'status-nv'}`}>
      <div className="checklist-cell checklist-col-ref">
        <input type="text" value={localData.numero} onChange={e => saveLocal({ numero: e.target.value })}
          className="form-input" placeholder="QSC002" disabled={readOnly} />
        <div className="flex-shrink-0 ml-1 mt-1">
          {isPrefilled && <Sparkles className="w-3.5 h-3.5 text-primary" />}
          {item.alerte && <AlertTriangle className="w-3.5 h-3.5 text-blue-500" />}
        </div>
      </div>
      <div className="checklist-cell checklist-col-reg">
        <AutoTextarea value={localData.reference_reglementaire} onChange={e => saveLocal({ reference_reglementaire: e.target.value })}
          className="form-textarea" placeholder="RAS 14, Vol I, §3.4" disabled={readOnly} minRows={1} />
      </div>
      <div className="checklist-cell checklist-col-questions">
        <AutoTextarea value={localData.point_verification} onChange={e => saveLocal({ point_verification: e.target.value })}
          className="form-textarea" placeholder="Points de vérification..." disabled={readOnly} minRows={1} />
      </div>
      <div className="checklist-cell checklist-col-directives">
        <AutoTextarea value={localData.directive_preuve} onChange={e => saveLocal({ directive_preuve: e.target.value })}
          className="form-textarea" placeholder="Directives et preuves requises..." disabled={readOnly} minRows={1} />
      </div>
      <div className="checklist-cell checklist-col-etat">
        <div className="checklist-etat">
          {(['SA', 'NS', 'NA', 'NV'] as ResultatChecklist[]).map(r => {
            const config = RESULTAT_LABELS[r];
            const Icon = config.icon;
            const isSelected = currentResultat === r;
            const isPredicted = hasPrediction && item.prediction === r;
            const tooltip = isPredicted && item.confiance
              ? `Suggestion: ${item.prediction} (confiance: ${item.confiance}%)${item.justification ? `\n${item.justification}` : ''}`
              : undefined;
            return (
              <Tooltip key={r} content={tooltip || ''}>
                <button type="button" onClick={() => handleResultatChange(r)}
                  className={`checklist-etat-btn ${isSelected ? `active-${r.toLowerCase()}` : ''} ${isPredicted ? 'ring-2 ring-primary/40' : ''}`}
                  disabled={readOnly}>
                  <Icon className="w-3.5 h-3.5" /><span>{r}</span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>
      <div className="checklist-cell checklist-col-obs">
        <div className="w-full">
          <div className="checklist-obs-toolbar">
            <div className="checklist-obs-actions">
              <button
                type="button"
                onClick={() => onOpenObservation(item)}
                className={`checklist-header-obs-btn ${hasObservation ? 'active' : ''}`}
                title="Ajouter ou voir les preuves"
              >
                <Upload className="w-3 h-3" />
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  className="checklist-header-obs-btn danger"
                  title="Supprimer la ligne"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {showObservationIntegration ? (
            <div className="checklist-obs-content">
              {showTextObservation && (
                <AutoTextarea
                  value={obsText}
                  onChange={e => setObsText(e.target.value)}
                  onBlur={handleObsTextBlur}
                  className="checklist-obs-area"
                  placeholder="Observation..."
                  disabled={readOnly}
                  minRows={1}
                />
              )}
              {showStylusObservation && (
                <div onBlur={handleObsStylusBlur} tabIndex={-1}>
                  <CompactStylusInput value={obsStylus} onChange={handleObsStylusChange} height={activeObsMode === 'mixte' ? 56 : 80} />
                </div>
              )}
              {item.fichiers && item.fichiers.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.fichiers.map(f => (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded text-[10px]"
                    >
                      <FileText className="w-2.5 h-2.5" />{f.nom}
                    </span>
                  ))}
                </div>
              )}
              {!item.observation &&
                !item.observation_stylus_data &&
                (!item.fichiers || item.fichiers.length === 0) && (
                  <span className="text-blue-300 italic">Aucune observation</span>
                )}
            </div>
          ) : (
            <>
              {showTextObservation && (
                <AutoTextarea
                  value={obsText}
                  onChange={e => setObsText(e.target.value)}
                  onBlur={handleObsTextBlur}
                  className="checklist-obs-area"
                  placeholder="Observation..."
                  disabled={readOnly}
                  minRows={1}
                />
              )}
              {showStylusObservation && (
                <div onBlur={handleObsStylusBlur} tabIndex={-1}>
                  <CompactStylusInput value={obsStylus} onChange={handleObsStylusChange} height={activeObsMode === 'mixte' ? 56 : 80} />
                </div>
              )}

              {activeObsMode === 'clavier' && obsStylus && (
                <div className="relative mt-1 border border-border/30 rounded overflow-hidden">
                  <img
                    src={obsStylus}
                    alt="Note manuscrite"
                    className="w-full h-auto max-h-24 object-contain bg-white"
                  />
                  <button
                    onClick={() => {
                      setObsStylus('');
                      saveLocal({ observation_stylus_data: '' });
                    }}
                    className="absolute top-0 right-0 p-0.5 bg-white/80 hover:bg-white text-[10px]"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}

              {activeObsMode === 'stylet' && obsText && (
                <div className="text-xs text-blue-500 bg-blue-50 border border-blue-200 rounded px-2 py-1 truncate">
                  📝 {obsText}
                </div>
              )}

              {showFileUpload && !readOnly && (
                <div className="mt-1">
                  <FileUploader onUpload={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
                </div>
              )}

              {item.fichiers && item.fichiers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {item.fichiers.map(f => (
                    <div key={f.id} className="checklist-file-tag">
                      <FileText className="w-3 h-3" />
                      <span>{f.nom}</span>
                      <button type="button" onClick={() => window.open(f.url, '_blank')}>
                        <Eye className="w-3 h-3" />
                      </button>
                      <button type="button" className="delete" onClick={() => handleDeleteFile(f.id)}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SousSousDomaineSection ──
function SousSousDomaineSection({ ssd, readOnly, onUpdate, onDelete, onAddItem, onUpdateItem, onDeleteItem,
  onAddFile, onDeleteFile, onOpenObservation, showObservationIntegration }: {
  ssd: SousSousDomaine; readOnly: boolean; onUpdate: (ssd: SousSousDomaine) => void;
  onDelete: (id: string) => void; onAddItem: (ssdId: string) => void;
  onUpdateItem: (ssdId: string, item: ChecklistItem) => void; onDeleteItem: (ssdId: string, itemId: string) => void;
  onAddFile: (itemId: string, file: { id: string; nom: string; url: string; dateUpload: string }) => void;
  onDeleteFile: (itemId: string, fileId: string) => void;
  onOpenObservation: (item: ChecklistItem) => void;
  showObservationIntegration: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(ssd.nom);
  const [obsMode, setObsMode] = useState<ModeSaisie>('clavier');
  const [showFileUpload, setShowFileUpload] = useState(false);

  const handleRename = () => { if (newName.trim()) onUpdate({ ...ssd, nom: newName.trim() }); setRenaming(false); };
  const handleObsModeChange = (mode: ModeSaisie) => {
    setObsMode(mode);
    (ssd.items ?? []).forEach(item => onUpdateItem(ssd.id, { ...item, mode_saisie_obs: mode }));
  };

  return (
    <div className="checklist-ssd">
      <div className="checklist-ssd-header">
        <button onClick={() => onUpdate({ ...ssd, isExpanded: !ssd.isExpanded })} className="btn btn-ghost btn-sm p-1">
          {ssd.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        {renaming ? (
          <div className="flex items-center gap-1">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
              className={`form-input text-sm py-0.5 px-2 ${focusClass}`} autoFocus />
            <button onClick={handleRename} className="btn btn-sm btn-primary gap-2"><Check className="w-3 h-3" /></button>
            <button onClick={() => setRenaming(false)} className="btn btn-sm btn-danger gap-2"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <span className="font-semibold text-foreground">{ssd.nom}</span>
        )}
        <span className="badge muted">{(ssd.items ?? []).length} item(s)</span>
        {!readOnly && (
          <button onClick={() => onAddItem(ssd.id)} className="btn btn-sm btn-primary gap-2" title="Ajouter un item">
            <Plus className="w-3 h-3" /> Item
          </button>
        )}
      </div>

      {ssd.isExpanded && (ssd.items ?? []).length > 0 && (
        <div>
          <div className="checklist-header">
            <div className="checklist-header-cell checklist-col-ref">Réf.</div>
            <div className="checklist-header-cell checklist-col-reg">Réf. Réglementaire</div>
            <div className="checklist-header-cell checklist-col-questions">Questions</div>
            <div className="checklist-header-cell checklist-col-directives">Directives</div>
            <div className="checklist-header-cell checklist-col-etat">État</div>
            <div className="checklist-header-cell checklist-col-obs">
              <span>Observations</span>
              {!readOnly && (
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => handleObsModeChange('clavier')}
                    className={`checklist-header-obs-btn ${obsMode === 'clavier' ? 'active' : ''}`} title="Clavier"><Type className="w-3 h-3" /></button>
                  <button type="button" onClick={() => handleObsModeChange('stylet')}
                    className={`checklist-header-obs-btn ${obsMode === 'stylet' ? 'active' : ''}`} title="Stylet"><PenLine className="w-3 h-3" /></button>
                  <button type="button" onClick={() => handleObsModeChange('mixte')}
                    className={`checklist-header-obs-btn ${obsMode === 'mixte' ? 'active' : ''}`} title="Mixte"><MessageSquare className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          </div>
          <div>
            {(ssd.items ?? []).sort((a, b) => a.ordre - b.ordre).map(item => (
              <ChecklistItemRow key={item.id} item={item} readOnly={readOnly}
                onUpdate={upd => onUpdateItem(ssd.id, upd)} onDelete={itemId => onDeleteItem(ssd.id, itemId)}
                onAddFile={onAddFile} onDeleteFile={onDeleteFile} onOpenObservation={onOpenObservation}
                obsMode={obsMode} showFileUpload={showFileUpload}
                showObservationIntegration={showObservationIntegration} />
            ))}
          </div>
        </div>
      )}

      {(ssd.items ?? []).length === 0 && (
        <div className="text-center py-6 text-sm text-blue-400 border border-dashed border-blue-200 rounded-lg bg-blue-50">
          <FileText className="w-6 h-6 mx-auto mb-2 opacity-30" />
          <p>Aucun item ajouté</p>
          {!readOnly && <button onClick={() => onAddItem(ssd.id)} className="btn btn-sm btn-primary gap-2 mt-2"><Plus className="w-4 h-4" /> Ajouter un item</button>}
        </div>
      )}
    </div>
  );
}

// ── SousDomaineSection ──
function SousDomaineSection({ sd, readOnly, onUpdate, onDelete, onAddSsd, onUpdateSsd, onDeleteSsd,
  onAddItem, onUpdateItem, onDeleteItem, onAddFile, onDeleteFile, onOpenObservation,
  onAddItemsToSd, onUpdateSdItem, onDeleteSdItem, onAddItemViaModal,
  showObservationIntegration }: {
  sd: SousDomaine; readOnly: boolean; onUpdate: (sd: SousDomaine) => void;
  onDelete: (id: string) => void; onAddSsd: (sdId: string) => void;
  onUpdateSsd: (sdId: string, ssd: SousSousDomaine) => void; onDeleteSsd: (sdId: string, ssdId: string) => void;
  onAddItem: (ssdId: string) => void; onUpdateItem: (ssdId: string, item: ChecklistItem) => void;
  onDeleteItem: (ssdId: string, itemId: string) => void;
  onAddFile: (itemId: string, file: { id: string; nom: string; url: string; dateUpload: string }) => void;
  onDeleteFile: (itemId: string, fileId: string) => void;
  onOpenObservation: (item: ChecklistItem) => void;
  onAddItemsToSd: (sdId: string, count: number) => void;
  onUpdateSdItem: (sdId: string, item: ChecklistItem) => void;
  onDeleteSdItem: (sdId: string, itemId: string) => void;
  onAddItemViaModal: (sdId: string) => void;
  showObservationIntegration: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(sd.nom);
  const [showMenu, setShowMenu] = useState(false);
  const [obsMode, setObsMode] = useState<ModeSaisie>('clavier');
  const [showFileUpload, setShowFileUpload] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleRename = () => { if (newName.trim()) onUpdate({ ...sd, nom: newName.trim() }); setRenaming(false); };
  const handleObsModeChange = (mode: ModeSaisie) => {
    setObsMode(mode);
    (sd.items ?? []).forEach(item => onUpdateSdItem(sd.id, { ...item, mode_saisie_obs: mode }));
  };

  return (
    <div className="border-t border-border/60 mb-2">
      <div className="bg-gradient-to-r from-role-primary/5 to-transparent px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => onUpdate({ ...sd, isExpanded: !sd.isExpanded })} className="btn btn-ghost btn-sm p-1">
              {sd.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {renaming ? (
              <div className="flex items-center gap-1">
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  className={`form-input text-sm py-0.5 px-2 ${focusClass}`} autoFocus />
                <button onClick={handleRename} className="btn btn-sm btn-primary gap-2"><Check className="w-3 h-3" /></button>
                <button onClick={() => setRenaming(false)} className="btn btn-sm btn-danger gap-2"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <span className="font-semibold text-foreground">{sd.nom}</span>
            )}
            <span className="badge muted">{(sd.items ?? []).length} ligne(s)</span>
            <span className="badge muted">{(sd.sousSousDomaines ?? []).length} sous-sous-domaine(s)</span>
          </div>
          {!readOnly && (
            <div className="flex items-center gap-2" ref={menuRef}>
              <button onClick={() => onAddSsd(sd.id)} className="btn btn-sm btn-primary gap-2" title="Ajouter un sous-sous-domaine">
                <Plus className="w-4 h-4" /> Sous-sous-domaine
              </button>
              <button onClick={() => setRenaming(true)} className="btn btn-sm btn-secondary gap-2" title="Renommer"><Edit3 className="w-3 h-3" /></button>
              <button onClick={() => onDelete(sd.id)} className="btn btn-sm btn-danger gap-2" title="Supprimer"><Trash2 className="w-3 h-3" /></button>
              <button onClick={() => setShowMenu(!showMenu)} className="btn btn-ghost btn-sm p-1" title="Plus"><ChevronDown className="w-3 h-3" /></button>
              {showMenu && (
                <div className="dropdown-menu absolute right-0 top-full mt-1 z-50">
                  <button className="dropdown-item w-full text-left"><Copy className="w-3 h-3 mr-2" /> Dupliquer</button>
                  <button className="dropdown-item w-full text-left"><FileText className="w-3 h-3 mr-2" /> Exporter</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {sd.isExpanded && (
        <div className="space-y-2">
          <div className="checklist-table">
            <div className="checklist-header">
              <div className="checklist-header-cell checklist-col-ref">Réf.</div>
              <div className="checklist-header-cell checklist-col-reg">Réf. Réglementaire</div>
              <div className="checklist-header-cell checklist-col-questions">Questions</div>
              <div className="checklist-header-cell checklist-col-directives">Directives</div>
              <div className="checklist-header-cell checklist-col-etat">État</div>
              <div className="checklist-header-cell checklist-col-obs">
                <span>Observations</span>
                {!readOnly && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleObsModeChange('clavier')}
                      className={`checklist-header-obs-btn ${obsMode === 'clavier' ? 'active' : ''}`} title="Clavier"><Type className="w-3 h-3" /></button>
                    <button type="button" onClick={() => handleObsModeChange('stylet')}
                      className={`checklist-header-obs-btn ${obsMode === 'stylet' ? 'active' : ''}`} title="Stylet"><PenLine className="w-3 h-3" /></button>
                    <button type="button" onClick={() => handleObsModeChange('mixte')}
                      className={`checklist-header-obs-btn ${obsMode === 'mixte' ? 'active' : ''}`} title="Mixte"><MessageSquare className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
            </div>
            {(sd.items ?? []).length > 0 ? (
              (sd.items ?? []).sort((a, b) => a.ordre - b.ordre).map(item => (
                <ChecklistItemRow key={item.id} item={item} readOnly={readOnly}
                  onUpdate={upd => onUpdateSdItem(sd.id, upd)} onDelete={itemId => onDeleteSdItem(sd.id, itemId)}
                  onAddFile={onAddFile} onDeleteFile={onDeleteFile} onOpenObservation={onOpenObservation}
                  obsMode={obsMode} showFileUpload={showFileUpload}
                  showObservationIntegration={showObservationIntegration} />
              ))
            ) : (
              <div className="py-4 text-center text-sm text-blue-400 border-t border-blue-200 bg-blue-50">Aucune ligne. Cliquez sur "Ajouter ligne" pour commencer.</div>
            )}
            <div className="flex justify-end p-2 border-t border-blue-200 bg-blue-50">
              {!readOnly && (
                <button onClick={() => onAddItemViaModal(sd.id)} className="btn btn-sm btn-primary gap-2"><Plus className="w-4 h-4" /> Ajouter ligne</button>
              )}
            </div>
          </div>

          {(sd.sousSousDomaines ?? []).sort((a, b) => a.ordre - b.ordre).map(ssd => (
            <SousSousDomaineSection key={ssd.id} ssd={ssd} readOnly={readOnly}
              onUpdate={upd => onUpdateSsd(sd.id, upd)} onDelete={id => onDeleteSsd(sd.id, id)}
              onAddItem={onAddItem} onUpdateItem={onUpdateItem} onDeleteItem={onDeleteItem}
              onAddFile={onAddFile} onDeleteFile={onDeleteFile} onOpenObservation={onOpenObservation}
              showObservationIntegration={showObservationIntegration} />
          ))}

          {(sd.sousSousDomaines ?? []).length === 0 && (sd.items ?? []).length === 0 && (
            <div className="text-center py-4 text-sm text-blue-400 border border-dashed border-blue-200 rounded-lg bg-blue-50">Aucune donnée. Ajoutez des lignes ou un sous-sous-domaine.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──
export interface ChecklistFormContentProps {
  domaines: DomaineChecklist[];
  onChange: (domaines: DomaineChecklist[]) => void;
  readOnly?: boolean;
  isSigned?: boolean;
  showObservationIntegration?: boolean;
  showCopyChecklist?: boolean;
  showStyleCheckbox?: boolean;
  title?: string;
  onOpenObservation?: (item: ChecklistItem) => void;
  onSaveObservation?: (item: ChecklistItem, observation: string, fichiers: any[]) => void;
  /** Cache le bouton "Ajouter domaine" — à utiliser sur les pages préparation/exécution
   *  où les domaines sont prédéfinis depuis la planification et doivent rester fixes. */
  hideAddDomain?: boolean;
}

export function ChecklistFormContent({
  domaines,
  onChange,
  readOnly = false,
  isSigned = false,
  showObservationIntegration = false,
  showCopyChecklist = false,
  showStyleCheckbox = false,
  title,
  onOpenObservation,
  onSaveObservation,
  hideAddDomain = false,
}: ChecklistFormContentProps) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addType, setAddType] = useState<'domaine' | 'sous-domaine' | 'sous-sous-domaine' | 'item'>('sous-domaine');
  const [addItemLevel, setAddItemLevel] = useState<'domaine' | 'sous-domaine' | 'sous-sous-domaine'>('sous-sous-domaine');
  const [addParentId, setAddParentId] = useState('');
  const [addParentName, setAddParentName] = useState('');
  const [observationModalOpen, setObservationModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ChecklistItem | null>(null);
  const [domaineObsMode, setDomaineObsMode] = useState<ModeSaisie>('clavier');
  const [domaineShowFileUpload, setDomaineShowFileUpload] = useState(false);
  const [undoState, setUndoState] = useState<{ domaines: DomaineChecklist[]; label: string } | null>(null);

  const actualReadOnly = readOnly || isSigned;

  const createNewItem = (): ChecklistItem => ({
    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    numero: '', reference_reglementaire: '', point_verification: '', directive_preuve: '',
    resultat: undefined, ordre: 0,
  });

  const snapshotDomaines = () => JSON.parse(JSON.stringify(domaines)) as DomaineChecklist[];
  const deleteWithUndo = (label: string, updater: (current: DomaineChecklist[]) => DomaineChecklist[]) => {
    setUndoState({ domaines: snapshotDomaines(), label });
    onChange(updater(domaines));
  };
  const handleUndoDelete = () => {
    if (!undoState) return;
    onChange(undoState.domaines);
    setUndoState(null);
  };

  const handleAddDomaine = (nom: string) => {
    const newDomaine: DomaineChecklist = {
      id: `domaine-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      nom,
      description: '',
      items: [],
      sousDomaines: [],
      isExpanded: true,
      progression: 0,
      ordre: domaines.length,
    };
    onChange([...domaines, newDomaine]);
  };

  const handleDeleteDomaine = (domaineId: string) => {
    deleteWithUndo('Domaine supprimé', current => current.filter(d => d.id !== domaineId));
  };

  const handleAddItemsToDomaine = (domaineId: string, count: number) => {
    const newItems = Array.from({ length: count }, () => createNewItem());
    onChange(domaines.map(d => d.id === domaineId ? { ...d, items: [...d.items, ...newItems] } : d));
  };

  const handleUpdateDomaineItem = (domaineId: string, item: ChecklistItem) => {
    onChange(domaines.map(d => d.id === domaineId ? { ...d, items: d.items.map(i => i.id === item.id ? item : i) } : d));
  };

  const handleDeleteDomaineItem = (domaineId: string, itemId: string) => {
    deleteWithUndo('Ligne supprimée', current =>
      current.map(d => d.id === domaineId ? { ...d, items: d.items.filter(i => i.id !== itemId) } : d)
    );
  };

  const handleDomaineObsModeChange = (mode: ModeSaisie) => {
    setDomaineObsMode(mode);
    domaines.forEach(d => d.items.forEach(item => handleUpdateDomaineItem(d.id, { ...item, mode_saisie_obs: mode })));
  };

  const handleAddSousDomaine = (domaineId: string, nom: string) => {
    const newSd: SousDomaine = { id: `sd-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, nom, items: [], sousSousDomaines: [], isExpanded: true, ordre: 0 };
    onChange(domaines.map(d => d.id === domaineId ? { ...d, sousDomaines: [...d.sousDomaines, newSd] } : d));
  };

  const handleUpdateSousDomaine = (domaineId: string, sd: SousDomaine) => {
    onChange(domaines.map(d => d.id === domaineId ? { ...d, sousDomaines: d.sousDomaines.map(s => s.id === sd.id ? sd : s) } : d));
  };

  const handleDeleteSousDomaine = (domaineId: string, sdId: string) => {
    deleteWithUndo('Sous-domaine supprimé', current =>
      current.map(d => d.id === domaineId ? { ...d, sousDomaines: d.sousDomaines.filter(s => s.id !== sdId) } : d)
    );
  };

  const handleAddSousSousDomaine = (domaineId: string, sdId: string, nom: string) => {
    const newSsd: SousSousDomaine = { id: `ssd-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`, nom, items: [], isExpanded: true, ordre: 0 };
    onChange(domaines.map(d => d.id === domaineId ? { ...d, sousDomaines: d.sousDomaines.map(s => s.id === sdId ? { ...s, sousSousDomaines: [...s.sousSousDomaines, newSsd] } : s) } : d));
  };

  const handleUpdateSousSousDomaine = (domaineId: string, sdId: string, ssd: SousSousDomaine) => {
    onChange(domaines.map(d => d.id === domaineId ? { ...d, sousDomaines: d.sousDomaines.map(s => s.id === sdId ? { ...s, sousSousDomaines: s.sousSousDomaines.map(ss => ss.id === ssd.id ? ssd : ss) } : s) } : d));
  };

  const handleDeleteSousSousDomaine = (domaineId: string, sdId: string, ssdId: string) => {
    deleteWithUndo('Sous-sous-domaine supprimé', current =>
      current.map(d => d.id === domaineId ? { ...d, sousDomaines: d.sousDomaines.map(s => s.id === sdId ? { ...s, sousSousDomaines: s.sousSousDomaines.filter(ss => ss.id !== ssdId) } : s) } : d)
    );
  };

  const handleAddItemsToSousDomaine = (domaineId: string, sdId: string, count: number) => {
    const newItems = Array.from({ length: count }, () => createNewItem());
    onChange(domaines.map(d => d.id === domaineId ? { ...d, sousDomaines: d.sousDomaines.map(s => s.id === sdId ? { ...s, items: [...s.items, ...newItems] } : s) } : d));
  };

  const handleUpdateSousDomaineItem = (domaineId: string, sdId: string, item: ChecklistItem) => {
    onChange(domaines.map(d => d.id === domaineId ? { ...d, sousDomaines: d.sousDomaines.map(s => s.id === sdId ? { ...s, items: s.items.map(i => i.id === item.id ? item : i) } : s) } : d));
  };

  const handleDeleteSousDomaineItem = (domaineId: string, sdId: string, itemId: string) => {
    deleteWithUndo('Ligne supprimée', current =>
      current.map(d => d.id === domaineId ? { ...d, sousDomaines: d.sousDomaines.map(s => s.id === sdId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s) } : d)
    );
  };

  const handleAddItem = (ssdId: string, count: number) => {
    const newItems = Array.from({ length: count }, () => createNewItem());
    onChange(domaines.map(d => ({ ...d, sousDomaines: d.sousDomaines.map(s => ({ ...s, sousSousDomaines: s.sousSousDomaines.map(ss => ss.id === ssdId ? { ...ss, items: [...ss.items, ...newItems] } : ss) })) })));
  };

  const handleUpdateItem = (ssdId: string, item: ChecklistItem) => {
    onChange(domaines.map(d => ({ ...d, sousDomaines: d.sousDomaines.map(s => ({ ...s, sousSousDomaines: s.sousSousDomaines.map(ss => ss.id === ssdId ? { ...ss, items: ss.items.map(i => i.id === item.id ? item : i) } : ss) })) })));
  };

  const handleDeleteItem = (ssdId: string, itemId: string) => {
    deleteWithUndo('Ligne supprimée', current =>
      current.map(d => ({ ...d, sousDomaines: d.sousDomaines.map(s => ({ ...s, sousSousDomaines: s.sousSousDomaines.map(ss => ss.id === ssdId ? { ...ss, items: ss.items.filter(i => i.id !== itemId) } : ss) })) }))
    );
  };

  const handleAddFile = (itemId: string, file: { id: string; nom: string; url: string; dateUpload: string }) => {
    console.log('Ajout fichier', itemId, file);
  };

  const handleDeleteFile = (itemId: string, fileId: string) => {
    console.log('Suppression fichier', itemId, fileId);
  };

  const handleOpenObservation = (item: ChecklistItem) => {
    setSelectedItem(item);
    setObservationModalOpen(true);
    onOpenObservation?.(item);
  };

  const handleSaveObservation = (payload: {
    fichiers: { id: string; nom: string; url: string; dateUpload: string }[];
    observation?: string;
  }) => {
    if (selectedItem) {
      const updated = { ...selectedItem, fichiers: payload.fichiers };

      // Find and update the item in the hierarchy
      const newDomaines = domaines.map(d => ({
        ...d,
        items: d.items.map(i => i.id === selectedItem.id ? updated : i),
        sousDomaines: d.sousDomaines.map(s => ({
          ...s,
          items: s.items.map(i => i.id === selectedItem.id ? updated : i),
          sousSousDomaines: s.sousSousDomaines.map(ss => ({
            ...ss,
            items: ss.items.map(i => i.id === selectedItem.id ? updated : i),
          })),
        })),
      }));

      onChange(newDomaines);
      onSaveObservation?.(selectedItem, payload.observation ?? '', payload.fichiers);
    }

    setObservationModalOpen(false);
    setSelectedItem(null);
  };


  const openAddModal = (type: 'domaine' | 'sous-domaine' | 'sous-sous-domaine' | 'item', parentId: string, parentName: string, level: 'domaine' | 'sous-domaine' | 'sous-sous-domaine' = 'sous-sous-domaine') => {
    setAddType(type); setAddItemLevel(level); setAddParentId(parentId); setAddParentName(parentName); setAddModalOpen(true);
  };

  const handleAddFromModal = (name: string, count: number = 1) => {
    if (addType === 'domaine') {
      handleAddDomaine(name);
    } else if (addType === 'sous-domaine') {
      handleAddSousDomaine(addParentId, name);
    } else if (addType === 'sous-sous-domaine') {
      for (const d of domaines) {
        for (const sd of d.sousDomaines) {
          if (sd.id === addParentId) { handleAddSousSousDomaine(d.id, sd.id, name); break; }
        }
      }
    } else if (addType === 'item') {
      if (addItemLevel === 'domaine') handleAddItemsToDomaine(addParentId, count);
      else if (addItemLevel === 'sous-domaine') {
        for (const d of domaines) { if (d.sousDomaines.find(s => s.id === addParentId)) { handleAddItemsToSousDomaine(d.id, addParentId, count); break; } }
      } else handleAddItem(addParentId, count);
    }
  };

  return (
    <div className="space-y-4" data-checklist-form>
      {title && <h2 className="text-lg font-semibold text-blue-800">{title}</h2>}

      <div className="checklist-actions-bar">
        {!actualReadOnly && !hideAddDomain && (
          <button
            type="button"
            onClick={() => openAddModal('domaine', '', '')}
            className="btn btn-sm btn-primary gap-2"
          >
            <Plus className="w-4 h-4" /> Ajouter domaine
          </button>
        )}
        {undoState && (
          <div className="checklist-undo">
            <span>{undoState.label}</span>
            <button type="button" onClick={handleUndoDelete} className="btn btn-sm btn-secondary gap-2">
              Retour en arrière
            </button>
          </div>
        )}
      </div>

      {/* Arborescence des domaines */}
      {domaines.map(domaine => (
        <div key={domaine.id} className="accordion">
          <div className="accordion-trigger">
            <div className="flex items-center gap-3">
              <button onClick={() => onChange(domaines.map(d => d.id === domaine.id ? { ...d, isExpanded: !d.isExpanded } : d))}
                className="btn btn-ghost btn-sm p-1">
                {domaine.isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <div>
                <div className="card-title text-lg">{domaine.nom}</div>
                <p className="text-sm text-blue-400">{domaine.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge muted">{(domaine.items ?? []).length} ligne(s)</span>
              <span className="badge muted">{(domaine.sousDomaines ?? []).length} sous-domaine(s)</span>
              {!actualReadOnly && (
                <>
                  <button onClick={() => openAddModal('sous-domaine', domaine.id, domaine.nom)}
                    className="btn btn-sm btn-primary gap-2"><Plus className="w-4 h-4" /> Sous-domaine</button>
                  <button
                    type="button"
                    onClick={() => handleDeleteDomaine(domaine.id)}
                    className="btn btn-sm btn-danger gap-2"
                    title="Supprimer le domaine"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {domaine.isExpanded && (
            <div className="accordion-content space-y-3">
              {/* Items du domaine */}
              <div className="checklist-table">
                <div className="checklist-header">
                  <div className="checklist-header-cell checklist-col-ref">Réf.</div>
                  <div className="checklist-header-cell checklist-col-reg">Réf. Réglementaire</div>
                  <div className="checklist-header-cell checklist-col-questions">Questions</div>
                  <div className="checklist-header-cell checklist-col-directives">Directives</div>
                  <div className="checklist-header-cell checklist-col-etat">État</div>
                  <div className="checklist-header-cell checklist-col-obs">
                    <span>Observations</span>
                    {!actualReadOnly && (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => handleDomaineObsModeChange('clavier')}
                          className={`checklist-header-obs-btn ${domaineObsMode === 'clavier' ? 'active' : ''}`} title="Clavier"><Type className="w-3 h-3" /></button>
                        <button type="button" onClick={() => handleDomaineObsModeChange('stylet')}
                          className={`checklist-header-obs-btn ${domaineObsMode === 'stylet' ? 'active' : ''}`} title="Stylet"><PenLine className="w-3 h-3" /></button>
                        <button type="button" onClick={() => handleDomaineObsModeChange('mixte')}
                          className={`checklist-header-obs-btn ${domaineObsMode === 'mixte' ? 'active' : ''}`} title="Mixte"><MessageSquare className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                </div>
                {(domaine.items ?? []).length > 0 ? (
                  (domaine.items ?? []).sort((a, b) => a.ordre - b.ordre).map(item => (
                    <ChecklistItemRow key={item.id} item={item} readOnly={actualReadOnly}
                      onUpdate={upd => handleUpdateDomaineItem(domaine.id, upd)}
                      onDelete={itemId => handleDeleteDomaineItem(domaine.id, itemId)}
                      onAddFile={handleAddFile} onDeleteFile={handleDeleteFile}
                      onOpenObservation={handleOpenObservation}
                      obsMode={domaineObsMode} showFileUpload={domaineShowFileUpload}
                      showObservationIntegration={showObservationIntegration} />
                  ))
                ) : (
                  <div className="py-4 text-center text-sm text-blue-400 border-t border-blue-200 bg-blue-50">Aucune ligne. Cliquez sur "Ajouter ligne" pour commencer.</div>
                )}
                <div className="flex justify-end p-2 border-t border-blue-200 bg-blue-50">
                  {!actualReadOnly && (
                    <button onClick={() => openAddModal('item', domaine.id, domaine.nom, 'domaine')}
                      className="btn btn-sm btn-primary gap-2"><Plus className="w-4 h-4" /> Ajouter ligne</button>
                  )}
                </div>
              </div>

              {/* Sous-domaines — pleine largeur, sans indentation */}
              {(domaine.sousDomaines ?? []).sort((a, b) => a.ordre - b.ordre).map(sd => (
                <SousDomaineSection key={sd.id} sd={sd} readOnly={actualReadOnly}
                  onUpdate={upd => handleUpdateSousDomaine(domaine.id, upd)}
                  onDelete={sdId => handleDeleteSousDomaine(domaine.id, sdId)}
                  onAddSsd={sdId => openAddModal('sous-sous-domaine', sdId, sd.nom)}
                  onUpdateSsd={(sdId, ssd) => handleUpdateSousSousDomaine(domaine.id, sdId, ssd)}
                  onDeleteSsd={(sdId, ssdId) => handleDeleteSousSousDomaine(domaine.id, sdId, ssdId)}
                  onAddItem={ssdId => openAddModal('item', ssdId, '')}
                  onUpdateItem={(ssdId, item) => handleUpdateItem(ssdId, item)}
                  onDeleteItem={(ssdId, itemId) => handleDeleteItem(ssdId, itemId)}
                  onAddFile={handleAddFile} onDeleteFile={handleDeleteFile}
                  onOpenObservation={handleOpenObservation}
                  onAddItemsToSd={(sdId, count) => handleAddItemsToSousDomaine(domaine.id, sdId, count)}
                  onUpdateSdItem={(sdId, item) => handleUpdateSousDomaineItem(domaine.id, sdId, item)}
                  onDeleteSdItem={(sdId, itemId) => handleDeleteSousDomaineItem(domaine.id, sdId, itemId)}
                  onAddItemViaModal={sdId => openAddModal('item', sdId, sd.nom)}
                  showObservationIntegration={showObservationIntegration} />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Modales */}
      <AddModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)}
        onAdd={handleAddFromModal} type={addType} parentName={addParentName} />

      <ObservationModal
        item={selectedItem}
        isOpen={observationModalOpen}
        onClose={() => { setObservationModalOpen(false); setSelectedItem(null); }}
        onSave={handleSaveObservation}
        readOnly={actualReadOnly}
        questionContext={{
          referenceReglementaire: selectedItem?.reference_reglementaire,
          pointVerification: selectedItem?.point_verification,
          directivePreuve: selectedItem?.directive_preuve,
          domaine: undefined,
        }}
      />

    </div>
  );
}
