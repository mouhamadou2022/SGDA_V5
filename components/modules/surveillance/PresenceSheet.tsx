// components/modules/surveillance/PresenceSheet.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Users, UserPlus, Trash2, CheckCircle2, Download, Printer,
  Signature, Brain, Loader2, Paintbrush, PenLine, RotateCcw, Check, X, Keyboard, PenTool, Type,
} from 'lucide-react';
import SignaturePad from 'signature_pad';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';

export interface PresenceEntry {
  id: string;
  surveillanceId: string;
  prenom_nom: string;
  structure: string;
  fonction: string;
  telephone: string;
  email: string;
  signature_url: string;
  signature_date: string;
  heure_arrivee?: string;
  heure_depart?: string;
  observations?: string;
  ordre: number;
}

export interface PresenceSheetProps {
  surveillanceId: string;
  entries?: PresenceEntry[];
  onEntriesChange?: (entries: PresenceEntry[]) => void;
  onSignatureSave?: (entryId: string, signatureUrl: string) => void;
  readOnly?: boolean;
  isSigned?: boolean;
  userRole?: string;
}

const COLORS = [
  { name: 'Noir', value: '#000000' },
  { name: 'Bleu', value: '#2563eb' },
  { name: 'Rouge', value: '#dc2626' },
  { name: 'Vert', value: '#16a34a' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Violet', value: '#9333ea' },
];

const DEFAULT_ENTRIES: Partial<PresenceEntry>[] = [
  { structure: 'ANACIM', fonction: 'Chef d\'équipe', ordre: 1 },
  { structure: 'ANACIM', fonction: 'Inspecteur', ordre: 2 },
  { structure: 'ANACIM', fonction: 'Inspecteur', ordre: 3 },
  { structure: 'EXPLOITANT', fonction: 'Directeur d\'exploitation', ordre: 4 },
  { structure: 'EXPLOITANT', fonction: 'Responsable Sécurité', ordre: 5 },
];

export interface SignatureCanvasHandle {
  clear: () => void;
  isEmpty: () => boolean;
  getDataUrl: () => string | null;
}

const SignatureCanvas = forwardRef<SignatureCanvasHandle, {
  color: string;
  penSize: number;
  signataireNom: string;
  width: number;
  height: number;
}>(({ color, penSize, signataireNom, width, height }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useImperativeHandle(ref, () => ({
    clear: () => {
      padRef.current?.clear();
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(10, height - 15);
        ctx.lineTo(width - 10, height - 15);
        ctx.stroke();
      }
    },
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    getDataUrl: () => canvasRef.current?.toDataURL('image/png') ?? null,
  }));

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, height - 15);
      ctx.lineTo(width - 10, height - 15);
      ctx.stroke();
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(signataireNom, 10, 14);
    }
    const pad = new SignaturePad(canvas, {
      penColor: color,
      backgroundColor: '#ffffff',
      minWidth: 1,
      maxWidth: penSize,
      throttle: 16,
    });
    padRef.current = pad;
    return () => { pad.off(); };
  }, []);

  useEffect(() => { if (padRef.current) padRef.current.penColor = color; }, [color]);
  useEffect(() => { if (padRef.current) { padRef.current.minWidth = 1; padRef.current.maxWidth = penSize; } }, [penSize]);

  return (
    <div className="border-2 border-gray-200 rounded-md bg-white" style={{ width, height }}>
      <canvas ref={canvasRef} className="touch-none rounded w-full h-full" />
    </div>
  );
});
SignatureCanvas.displayName = 'SignatureCanvas';

function PresenceRow({
  entry,
  isSigning,
  penColor,
  penSize,
  onUpdate,
  onDelete,
  onStartSign,
  canvasRef,
}: {
  entry: PresenceEntry;
  isSigning: boolean;
  penColor: string;
  penSize: number;
  onUpdate: (entry: PresenceEntry) => void;
  onDelete: (id: string) => void;
  onStartSign: (entry: PresenceEntry) => void;
  canvasRef: React.RefObject<SignatureCanvasHandle | null>;
}) {
  const handleChange = (field: keyof PresenceEntry, value: string) => {
    onUpdate({ ...entry, [field]: value });
  };

  const inputClass = "form-input text-sm w-full bg-transparent border-0 border-b border-border focus:border-primary px-1 py-0.5 rounded-none";

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="p-2 border-r border-border">
        <input type="text" value={entry.prenom_nom} onChange={e => handleChange('prenom_nom', e.target.value)} placeholder="Nom et prénom" className={inputClass} />
      </td>
      <td className="p-2 border-r border-border">
        <input type="text" value={entry.structure} onChange={e => handleChange('structure', e.target.value)} placeholder="ANACIM, Exploitant, …" className={inputClass} />
      </td>
      <td className="p-2 border-r border-border">
        <input type="text" value={entry.fonction} onChange={e => handleChange('fonction', e.target.value)} placeholder="Fonction" className={inputClass} />
      </td>
      <td className="p-2 border-r border-border">
        <input type="tel" value={entry.telephone} onChange={e => handleChange('telephone', e.target.value)} placeholder="Téléphone" className={inputClass} />
      </td>
      <td className="p-2 border-r border-border">
        <input type="email" value={entry.email} onChange={e => handleChange('email', e.target.value)} placeholder="Email" className={inputClass} />
      </td>
      <td className="p-2 border-r border-border">
        {entry.signature_url ? (
          <div className="flex items-center gap-1">
            <span className="badge success text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Signé</span>
            <button onClick={() => onUpdate({ ...entry, signature_url: '', signature_date: '' })} className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" title="Re-signer"><Signature className="w-3.5 h-3.5" /></button>
          </div>
        ) : isSigning ? (
          <SignatureCanvas ref={canvasRef} color={penColor} penSize={penSize} signataireNom={entry.prenom_nom} width={170} height={52} />
        ) : (
          <button onClick={() => onStartSign(entry)} className="btn btn-secondary btn-sm gap-1"><Signature className="w-3 h-3" /> Signer</button>
        )}
      </td>
      <td className="p-2 text-center whitespace-nowrap">
        <button onClick={() => onDelete(entry.id)} className="action-button hover:text-danger hover:bg-danger/10 transition-all duration-200" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
      </td>
    </tr>
  );
}

export function PresenceSheet({
  surveillanceId,
  entries: externalEntries,
  onEntriesChange,
  onSignatureSave,
  readOnly = false,
  isSigned = false,
  userRole = 'inspector',
}: PresenceSheetProps) {
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);

  const [entries, setEntries] = useState<PresenceEntry[]>([]);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [penColor, setPenColor] = useState('#000000');
  const [penSize, setPenSize] = useState(2);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [saisieMode, setSaisieMode] = useState<'clavier' | 'stylet' | 'mixte'>('mixte');
  const [iaSuggestion, setIaSuggestion] = useState<string | null>(null);
  const [isIaLoading, setIsIaLoading] = useState(false);

  const activeCanvasRef = useRef<SignatureCanvasHandle | null>(null);

  useEffect(() => {
    if (externalEntries && externalEntries.length > 0) {
      setEntries(externalEntries);
    } else {
      const defaultEntries: PresenceEntry[] = DEFAULT_ENTRIES.map((def, idx) => ({
        id: `pres-${Date.now()}-${idx}`,
        surveillanceId,
        prenom_nom: '',
        structure: def.structure || 'ANACIM',
        fonction: def.fonction || '',
        telephone: '',
        email: '',
        signature_url: '',
        signature_date: '',
        ordre: def.ordre || idx + 1,
      }));
      setEntries(defaultEntries);
    }
  }, [externalEntries, surveillanceId]);

  const getIaSuggestion = async () => {
    setIsIaLoading(true);
    try {
      const result = await assistantAgent.chat({ message: 'Suggère une liste type de participants pour une surveillance sur un aérodrome', contexte: { module: 'presence' }, userRole });
      setIaSuggestion(result.message);
      setTimeout(() => setIaSuggestion(null), 8000);
    } catch { /* silent */ } finally { setIsIaLoading(false); }
  };

  const handleUpdateEntry = (updatedEntry: PresenceEntry) => {
    const newEntries = entries.map(e => e.id === updatedEntry.id ? updatedEntry : e);
    setEntries(newEntries);
    onEntriesChange?.(newEntries);
  };

  const handleAddRow = () => {
    const newEntry: PresenceEntry = {
      id: `pres-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      surveillanceId,
      prenom_nom: '', structure: '', fonction: '', telephone: '', email: '',
      signature_url: '', signature_date: '', ordre: entries.length + 1,
    };
    const newEntries = [...entries, newEntry];
    setEntries(newEntries);
    onEntriesChange?.(newEntries);
  };

  const handleDeleteEntry = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (entry && window.confirm(`Supprimer ${entry.prenom_nom || 'ce participant'} ?`)) {
      const newEntries = entries.filter(e => e.id !== id);
      setEntries(newEntries);
      onEntriesChange?.(newEntries);
    }
  };

  const handleStartSign = (entry: PresenceEntry) => setSigningId(entry.id);

  const handleSignSave = useCallback(() => {
    if (!signingId) return;
    const url = activeCanvasRef.current?.getDataUrl();
    if (!url) return;
    if (activeCanvasRef.current?.isEmpty()) { alert('Veuillez tracer votre signature'); return; }
    const updatedEntries = entries.map(e => e.id === signingId ? { ...e, signature_url: url, signature_date: new Date().toISOString() } : e);
    setEntries(updatedEntries);
    onEntriesChange?.(updatedEntries);
    onSignatureSave?.(signingId, url);
    setSigningId(null);
  }, [signingId, entries, onEntriesChange, onSignatureSave]);

  const handleSignClear = useCallback(() => activeCanvasRef.current?.clear(), []);
  const handleSignCancel = useCallback(() => setSigningId(null), []);

  const handleExportPDF = () => addNotification({ user_id: user?.id || '', type: 'info' as const, title: 'Export PDF', message: 'Génération du PDF…', canal: 'in_app' as const });
  const handlePrint = () => window.print();

  const stats = {
    total: entries.length,
    signes: entries.filter(e => e.signature_url).length,
    anacim: entries.filter(e => e.structure === 'ANACIM').length,
    exploitant: entries.filter(e => e.structure === 'EXPLOITANT').length,
  };

  if (isSigned) {
    return (
      <div className="card border-success bg-success/10">
        <div className="card-content p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
          <h3 className="text-lg font-medium text-success-800 mb-2">Fiche de présence signée</h3>
          <p className="text-small text-success-600">{stats.signes}/{stats.total} signatures enregistrées</p>
          <div className="flex justify-center gap-3 mt-4">
            <button onClick={handleExportPDF} className="btn btn-secondary gap-2"><Download className="w-4 h-4" /> Télécharger PDF</button>
            <button onClick={handlePrint} className="btn btn-secondary gap-2"><Printer className="w-4 h-4" /> Imprimer</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="bg-white border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-role-primary-soft rounded-lg"><Users className="w-5 h-5 text-role-primary" /></div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Fiche de présence</h3>
            <p className="text-xs text-muted-foreground">{stats.signes}/{stats.total} signatures &middot; {stats.anacim} ANACIM &middot; {stats.exploitant} Exploitant(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Mode saisie:</span>
          <div className="flex gap-1.5">
            <button onClick={() => setSaisieMode('clavier')} className={`checklist-header-obs-btn ${saisieMode === 'clavier' ? 'active' : ''}`}><Keyboard className="w-3.5 h-3.5" />Clavier</button>
            <button onClick={() => setSaisieMode('stylet')} className={`checklist-header-obs-btn ${saisieMode === 'stylet' ? 'active' : ''}`}><PenTool className="w-3.5 h-3.5" />Stylet</button>
            <button onClick={() => setSaisieMode('mixte')} className={`checklist-header-obs-btn ${saisieMode === 'mixte' ? 'active' : ''}`}><Type className="w-3.5 h-3.5" />Mixte</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={getIaSuggestion} disabled={isIaLoading} className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" title="Suggestion IA">
            {isIaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          </button>
          {!readOnly && <button onClick={handleAddRow} className="btn btn-secondary btn-sm gap-2"><UserPlus className="w-4 h-4" /> Ajouter</button>}
          <button onClick={handleExportPDF} className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" title="Exporter PDF"><Download className="w-4 h-4" /></button>
          <button onClick={handlePrint} className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" title="Imprimer"><Printer className="w-4 h-4" /></button>
        </div>
      </div>

      {iaSuggestion && (
        <div className="bg-info/10 border border-info/30 rounded-lg p-3 flex items-start gap-2">
          <Brain className="w-4 h-4 text-info mt-0.5 shrink-0" />
          <p className="text-xs text-foreground">{iaSuggestion}</p>
        </div>
      )}

      {/* Tableau */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="text-xs uppercase tracking-wide" style={{ backgroundColor: '#1e3a8a', color: '#ffffff' }}>
                <th className="p-2 border-r font-semibold text-left whitespace-nowrap" style={{ borderColor: '#3b5b9f' }}>Nom complet</th>
                <th className="p-2 border-r font-semibold text-left whitespace-nowrap" style={{ borderColor: '#3b5b9f' }}>Structure</th>
                <th className="p-2 border-r font-semibold text-left whitespace-nowrap" style={{ borderColor: '#3b5b9f' }}>Fonction</th>
                <th className="p-2 border-r font-semibold text-left whitespace-nowrap" style={{ borderColor: '#3b5b9f' }}>Téléphone</th>
                <th className="p-2 border-r font-semibold text-left whitespace-nowrap" style={{ borderColor: '#3b5b9f' }}>Email</th>
                <th className="p-2 border-r font-semibold text-center whitespace-nowrap" style={{ borderColor: '#3b5b9f' }}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Signature</span>
                    <div className="flex items-center gap-0.5">
                      <div className="relative">
                        <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={() => { setShowColorPicker(!showColorPicker); setShowSizePicker(false); }} title="Couleur"><Paintbrush className="w-3 h-3" /></button>
                        {showColorPicker && (
                          <div className="dropdown-menu absolute top-full left-0 mt-1 w-44">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Couleur</p>
                            <div className="grid grid-cols-3 gap-2">
                              {COLORS.map(c => (
                                <button key={c.value} className={`h-6 rounded-md border-2 ${penColor === c.value ? 'border-primary' : 'border-border'}`} style={{ backgroundColor: c.value }} onClick={() => { setPenColor(c.value); setShowColorPicker(false); }} title={c.name} />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="relative">
                        <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={() => { setShowSizePicker(!showSizePicker); setShowColorPicker(false); }} title="Taille"><PenLine className="w-3 h-3" /></button>
                        {showSizePicker && (
                          <div className="dropdown-menu absolute top-full left-0 mt-1 w-44">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Épaisseur</p>
                            <input type="range" min="1" max="5" step="0.5" value={penSize} onChange={e => setPenSize(parseFloat(e.target.value))} className="w-full" />
                          </div>
                        )}
                      </div>
                      <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={handleSignClear} title="Effacer"><RotateCcw className="w-3 h-3" /></button>
                      <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={handleSignSave} title="Valider"><Check className="w-3 h-3" /></button>
                      <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={handleSignCancel} title="Annuler"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                </th>
                <th className="p-2 font-semibold text-center whitespace-nowrap" style={{ color: '#ffffff' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.sort((a, b) => a.ordre - b.ordre).map(entry => (
                <PresenceRow key={entry.id} entry={entry} isSigning={signingId === entry.id} penColor={penColor} penSize={penSize} onUpdate={handleUpdateEntry} onDelete={handleDeleteEntry} onStartSign={handleStartSign} canvasRef={signingId === entry.id ? activeCanvasRef : { current: null }} />
              ))}
              {!readOnly && (
                <tr>
                  <td colSpan={7} className="p-2 text-center">
                    <button onClick={handleAddRow} className="btn btn-secondary btn-sm gap-1"><UserPlus className="w-3.5 h-3.5" /> Ajouter une ligne</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {entries.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucun participant</p>
          {!readOnly && <button onClick={handleAddRow} className="btn btn-secondary btn-sm mt-2">Ajouter un participant</button>}
        </div>
      )}
    </div>
  );
}

export default PresenceSheet;
