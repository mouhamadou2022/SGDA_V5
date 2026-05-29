// components/modules/surveillance/PresenceSheet.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Trash2, CheckCircle2, Download, Printer,
  Signature, Brain, Loader2, X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
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
  const [iaSuggestion, setIaSuggestion] = useState<string | null>(null);
  const [isIaLoading, setIsIaLoading] = useState(false);

  useEffect(() => {
    if (externalEntries && externalEntries.length > 0) {
      setEntries(externalEntries);
    } else {
      const defaultEntries: PresenceEntry[] = []
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
                <th className="p-2 border-r font-semibold text-center whitespace-nowrap" style={{ borderColor: '#3b5b9f' }}>Signature</th>
                <th className="p-2 font-semibold text-center whitespace-nowrap" style={{ color: '#ffffff' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.sort((a, b) => a.ordre - b.ordre).map(entry => {
    const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
    const inputClass = readOnly ? `bg-muted-soft p-2 w-full rounded text-sm border border-border ${focusClass}` : `form-input p-2 w-full text-sm ${focusClass}`;
    return (
    <tr key={entry.id} className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className="p-2 border-r border-border"><input type="text" value={entry.prenom_nom} onChange={e => handleUpdateEntry({ ...entry, prenom_nom: e.target.value })} placeholder="Nom et prénom" className={inputClass} disabled={readOnly} /></td>
      <td className="p-2 border-r border-border"><input type="text" value={entry.structure} onChange={e => handleUpdateEntry({ ...entry, structure: e.target.value })} placeholder="ANACIM, Exploitant, …" className={inputClass} disabled={readOnly} /></td>
      <td className="p-2 border-r border-border"><input type="text" value={entry.fonction} onChange={e => handleUpdateEntry({ ...entry, fonction: e.target.value })} placeholder="Fonction" className={inputClass} disabled={readOnly} /></td>
      <td className="p-2 border-r border-border"><input type="tel" value={entry.telephone} onChange={e => handleUpdateEntry({ ...entry, telephone: e.target.value })} placeholder="Téléphone" className={inputClass} disabled={readOnly} /></td>
      <td className="p-2 border-r border-border"><input type="email" value={entry.email} onChange={e => handleUpdateEntry({ ...entry, email: e.target.value })} placeholder="Email" className={inputClass} disabled={readOnly} /></td>
      <td className="p-2 border-r border-border text-center">
        {entry.signature_url ? (
          <div className="flex items-center justify-center gap-1">
            <span className="badge success text-xs flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Signé</span>
            {!readOnly && <button onClick={() => setSigningId(entry.id)} className="action-button hover:text-role-primary hover:bg-role-primary/10" title="Re-signer"><Signature className="w-3.5 h-3.5" /></button>}
          </div>
        ) : !readOnly ? (
          <button onClick={() => setSigningId(entry.id)} className="btn btn-secondary btn-sm gap-1"><Signature className="w-3 h-3" /> Signer</button>
        ) : null}
      </td>
      <td className="p-2 text-center whitespace-nowrap">{!readOnly && <button onClick={() => handleDeleteEntry(entry.id)} className="action-button hover:text-danger hover:bg-danger/10" title="Supprimer"><Trash2 className="w-4 h-4" /></button>}</td>
    </tr>
    );
  })}
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

      {/* Modal Signature */}
      {signingId && createPortal(
        <div className="modal-overlay" data-role={userRole} onClick={() => setSigningId(null)}>
          <div className="modal-content max-w-xl" onClick={e => e.stopPropagation()}>
            <SignaturePadWithColor
              onSave={(url) => {
                const entry = entries.find(e => e.id === signingId)
                if (entry) {
                  const updated = { ...entry, signature_url: url, signature_date: new Date().toISOString() }
                  const newEntries = entries.map(e => e.id === updated.id ? updated : e)
                  setEntries(newEntries)
                  onEntriesChange?.(newEntries)
                  onSignatureSave?.(entry.id, url)
                }
                setSigningId(null)
              }}
              onCancel={() => setSigningId(null)}
              signataireNom={entries.find(e => e.id === signingId)?.prenom_nom || 'Signataire'}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default PresenceSheet;
