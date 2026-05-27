'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/lib/store';
import {
  Plus, Trash2, Upload, FileText, X, Send, AlertCircle, Calendar, User, CheckCircle2, Building2, CalendarDays,
  HelpCircle,
} from 'lucide-react';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent"
const labelClass = "text-xs font-semibold uppercase tracking-wide text-role-primary"

interface LignePAC {
  id: string;
  action: string;
  responsable: string;
  date_debut: string;
  date_fin: string;
}

interface SoumissionPACFormProps {
  ecartId: string;
  onSuccess: () => void;
  onCancel: () => void;
  userRole?: string;
}

const NIVEAU_CONFIG = {
  critique: { label: 'Critique', badgeClass: 'badge danger' },
  eleve:    { label: 'Élevé',    badgeClass: 'badge warning' },
  moyen:    { label: 'Moyen',    badgeClass: 'badge primary' },
  faible:   { label: 'Faible',   badgeClass: 'badge success' },
} as const;

export function SoumissionPACForm({
  ecartId, onSuccess, onCancel, userRole = 'focal_operator'
}: SoumissionPACFormProps) {
  const ecarts = useAppStore(s => s.ecarts);
  const aerodromes = useAppStore(s => s.aerodromes);
  const soumettrePAC = useAppStore(s => s.soumettrePAC);
  const user = useAppStore(s => s.user);

  const ecart = ecarts.find(e => e.id === ecartId);
  const aerodrome = aerodromes.find(a => a.id === ecart?.aerodrome_id);

  const [lignes, setLignes] = useState<LignePAC[]>([
    { id: crypto.randomUUID(), action: '', responsable: '', date_debut: '', date_fin: '' }
  ]);
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showFeedback, setShowFeedback] = useState(false);

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const niveauCfg = ecart ? NIVEAU_CONFIG[ecart.niveau_risque] : null;

  const autoResize = (id: string) => {
    const el = textareaRefs.current[id];
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  };

  useEffect(() => {
    if (user?.nom && lignes.length === 1 && !lignes[0].responsable) {
      setLignes([{ ...lignes[0], responsable: user.nom }]);
    }
  }, [user?.nom]);

  const ajouterLigne = () => {
    setLignes([...lignes, { id: crypto.randomUUID(), action: '', responsable: user?.nom || '', date_debut: '', date_fin: '' }]);
  };

  const supprimerLigne = (id: string) => {
    if (lignes.length > 1) setLignes(lignes.filter(l => l.id !== id));
  };

  const updateLigne = (id: string, field: keyof LignePAC, value: string) => {
    setLignes(lignes.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === 'date_debut' && updated.date_fin && value > updated.date_fin) updated.date_fin = '';
      return updated;
    }));
    const newErrors = { ...errors };
    delete newErrors[`${id}_${field}`];
    if (field === 'date_debut') delete newErrors[`${id}_date_fin`];
    setErrors(newErrors);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setFichiers([...fichiers, ...Array.from(e.target.files)]);
  };

  const getProgressionGlobale = () => {
    if (lignes.length === 0) return 0;
    const complete = lignes.filter(l => l.action.trim() && l.responsable.trim() && l.date_debut && l.date_fin).length;
    return Math.round((complete / lignes.length) * 100);
  };

  const validerFormulaire = (): boolean => {
    const newErrors: Record<string, string> = {};
    lignes.forEach((ligne) => {
      if (!ligne.action.trim()) newErrors[`${ligne.id}_action`] = 'Requis';
      if (!ligne.responsable.trim()) newErrors[`${ligne.id}_responsable`] = 'Requis';
      if (!ligne.date_debut) newErrors[`${ligne.id}_date_debut`] = 'Requis';
      if (!ligne.date_fin) newErrors[`${ligne.id}_date_fin`] = 'Requis';
      if (ligne.date_debut && ligne.date_fin && ligne.date_fin <= ligne.date_debut) newErrors[`${ligne.id}_date_fin`] = 'Doit être postérieure à la date de début';
    });
    setErrors(newErrors);
    const firstError = Object.keys(newErrors)[0];
    if (firstError) {
      const id = firstError.split('_')[0];
      document.querySelector(`[data-row="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validerFormulaire()) return;
    setIsSubmitting(true);
    try {
      const fichiersUrls = fichiers.map(f => URL.createObjectURL(f));
      const lignesRemplies = lignes.filter(l => l.action.trim() || l.responsable.trim());
      if (lignesRemplies.length === 0) { alert('Ajoutez au moins une action corrective.'); setIsSubmitting(false); return; }
      await soumettrePAC(ecartId, {
        actions: lignesRemplies.map(l => ({ description: l.action, responsable: l.responsable, date_prevue: l.date_fin, date_debut: l.date_debut, livrables: [] })),
        observations: '', fichiers: fichiersUrls, soumis_par: user?.id || ''
      });
      setShowFeedback(true);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Erreur:', msg);
      alert(`Erreur :\n${msg}`);
    } finally { setIsSubmitting(false); }
  };

  const handleFeedback = () => { setShowFeedback(false); onSuccess(); };

  const progression = getProgressionGlobale();

  if (!ecart) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
        <p>Écart non trouvé</p>
        <button type="button" onClick={onCancel} className="btn btn-secondary mt-4">Fermer</button>
      </div>
    );
  }

  return (
    <div data-role={userRole} data-module="soumission-pac">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* HEADER */}
        <div className="flex items-start gap-4 p-4 rounded-lg border border-border bg-muted/20">
          <div className="p-2.5 rounded-lg bg-role-primary text-white"><Send className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-role-primary" />
              <h3 className="font-bold truncate">{aerodrome?.nom || 'Aérodrome'}</h3>
              {aerodrome?.code_oaci && <span className="code-oaci-badge">{aerodrome.code_oaci}</span>}
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {ecart.reference} — {ecart.libelle.substring(0, 100)}{ecart.libelle.length > 100 ? '...' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />{new Date(ecart.delai_pac).toLocaleDateString('fr-FR')}</span>
              {niveauCfg && <span className={niveauCfg.badgeClass}>{niveauCfg.label}</span>}
              <span className={`px-2 py-0.5 rounded-full text-white font-semibold ${progression === 100 ? 'bg-success' : 'bg-warning'}`}>{progression}%</span>
            </div>
          </div>
        </div>

        {/* PROGRESS BAR */}
        <div className="progress h-2.5">
          <div className="progress-bar transition-all duration-500" style={{
            width: `${progression}%`,
            backgroundColor: progression === 100 ? 'var(--color-success)' : progression >= 50 ? 'var(--color-warning)' : 'var(--color-danger)',
          }} />
        </div>

        {/* ECART DESCRIPTION */}
        <details>
          <summary className="text-xs font-semibold uppercase tracking-wider text-role-primary cursor-pointer mb-2">
            Description de l'écart
          </summary>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-1 pr-4 text-muted-foreground w-36 align-top">Référence</td><td>{ecart.reference}</td></tr>
              <tr><td className="py-1 pr-4 text-muted-foreground align-top">Texte réglementaire</td><td>{ecart.ref_reglementaire}</td></tr>
              <tr><td className="py-1 pr-4 text-muted-foreground align-top">Domaine</td><td>{ecart.domaine}</td></tr>
              <tr><td className="py-1 pr-4 text-muted-foreground align-top">Constat</td><td className="leading-relaxed">{ecart.libelle}</td></tr>
            </tbody>
          </table>
        </details>

        {/* ACTIONS CORRECTIVES */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className={labelClass}>Actions correctives ({lignes.length})</span>
            <button type="button" onClick={ajouterLigne} className="btn btn-secondary btn-sm gap-1">
              <Plus className="w-3 h-3" />Ajouter
            </button>
          </div>

          <div className="space-y-2">
            {lignes.map((ligne, index) => {
              const rowNum = index + 1;
              const isComplete = !!(ligne.action.trim() && ligne.responsable.trim() && ligne.date_debut && ligne.date_fin);
              const hasError = !!(errors[`${ligne.id}_action`] || errors[`${ligne.id}_responsable`] || errors[`${ligne.id}_date_debut`] || errors[`${ligne.id}_date_fin`]);
              const actionChars = ligne.action.length;
              return (
                <div key={ligne.id} data-row={ligne.id} className="border border-border rounded-lg">
                  {/* EN-TÊTE */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/10">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[11px] font-bold ${
                        hasError ? 'bg-danger' : isComplete ? 'bg-success' : 'bg-role-primary'
                      }`}>
                        {rowNum}
                      </span>
                      <span className="text-xs font-semibold">Action corrective #{rowNum}</span>
                      {isComplete && !hasError && (
                        <span className="text-[10px] text-success">✓ Complète</span>
                      )}
                      {hasError && (
                        <span className="text-[10px] text-danger">Champs requis</span>
                      )}
                    </div>
                    {lignes.length > 1 && (
                      <button type="button" onClick={() => supprimerLigne(ligne.id)}
                        className="text-xs text-muted-foreground flex items-center gap-1"
                        title="Supprimer cette action">
                        Supprimer
                      </button>
                    )}
                  </div>

                  {/* CORPS */}
                  <div className="p-3 space-y-3">
                    {/* TEXTAREA PLEINE LARGEUR */}
                    <div>
                      <label className={labelClass}>Description de l'action</label>
                      <div className="relative mt-1">
                        <textarea ref={el => { textareaRefs.current[ligne.id] = el; }}
                          value={ligne.action} onChange={e => { updateLigne(ligne.id, 'action', e.target.value); autoResize(ligne.id); }}
                          placeholder="Décrivez l'action corrective..."
                          rows={3}
                          className={`form-textarea w-full resize-none text-sm pr-10 ${focusClass} ${errors[`${ligne.id}_action`] ? 'border-danger' : ''}`} />
                        {ligne.action && (
                          <span className={`absolute bottom-2.5 right-2.5 text-[10px] font-mono ${actionChars >= 20 ? 'text-success' : 'text-muted-foreground'}`}>
                            {actionChars}
                          </span>
                        )}
                      </div>
                      {errors[`${ligne.id}_action`] && <p className="field-error text-xs mt-1">{errors[`${ligne.id}_action`]}</p>}
                    </div>

                    {/* GRILLE 3 COLONNES : RESPONSABLE + DATES */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Responsable</label>
                        <div className="relative mt-1">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input type="text" value={ligne.responsable}
                            onChange={e => updateLigne(ligne.id, 'responsable', e.target.value)}
                            placeholder="Responsable"
                            className={`form-input text-sm pl-9 w-full ${focusClass} ${errors[`${ligne.id}_responsable`] ? 'border-danger' : ''}`} />
                        </div>
                        {errors[`${ligne.id}_responsable`] && <p className="field-error text-xs mt-0.5">{errors[`${ligne.id}_responsable`]}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Date début</label>
                        <div className="relative mt-1">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input type="date" value={ligne.date_debut}
                            onChange={e => updateLigne(ligne.id, 'date_debut', e.target.value)}
                            className={`form-input text-sm pl-9 w-full ${focusClass} ${errors[`${ligne.id}_date_debut`] ? 'border-danger' : ''}`} />
                        </div>
                        {errors[`${ligne.id}_date_debut`] && <p className="field-error text-xs mt-0.5">{errors[`${ligne.id}_date_debut`]}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Date fin</label>
                        <div className="relative mt-1">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <input type="date" value={ligne.date_fin}
                            onChange={e => updateLigne(ligne.id, 'date_fin', e.target.value)}
                            min={ligne.date_debut ? new Date(new Date(ligne.date_debut).getTime() + 86400000).toISOString().split('T')[0] : undefined}
                            className={`form-input text-sm pl-9 w-full ${focusClass} ${errors[`${ligne.id}_date_fin`] ? 'border-danger' : ''}`} />
                        </div>
                        {errors[`${ligne.id}_date_fin`] && <p className="field-error text-xs mt-0.5">{errors[`${ligne.id}_date_fin`]}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={ajouterLigne}
            className="w-full py-2 border border-dashed border-border rounded text-sm text-muted-foreground flex items-center justify-center gap-1">
            <Plus className="w-3.5 h-3.5" />Ajouter une action
          </button>
        </div>

        {/* FICHIERS */}
        <div className="border border-dashed border-border rounded-lg p-4">
          <input type="file" multiple onChange={handleFileUpload} className="hidden" id="pac-files" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
          <label htmlFor="pac-files" className="cursor-pointer flex flex-col items-center gap-1 text-sm text-muted-foreground">
            <Upload className="w-6 h-6" />
            <span>Pièces jointes <span className="text-xs opacity-60">(optionnel)</span></span>
          </label>
          {fichiers.length > 0 && (
            <div className="mt-3 space-y-1">
              {fichiers.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/20">
                  <span className="truncate">{file.name} ({(file.size / 1024).toFixed(0)} Ko)</span>
                  <button type="button" onClick={() => setFichiers(fichiers.filter((_, i) => i !== idx))} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ALERTE */}
        {progression < 100 && lignes.some(l => l.action.trim() || l.responsable.trim() || l.date_debut || l.date_fin) && (
          <div className="alert alert-warning text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />Complétez ou supprimez les actions incomplètes.
          </div>
        )}

        <hr className="border-border" />

        {/* FOOTER */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary">Annuler</button>
          <button type="submit" disabled={isSubmitting || progression < 100} className="btn btn-primary">
            {isSubmitting ? 'Envoi...' : 'Soumettre le PAC'}
          </button>
        </div>
      </form>

      {/* FEEDBACK MODAL */}
      {showFeedback && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background rounded-2xl max-w-md w-full border-t-4 border-t-role-primary">
            <div className="modal-header">
              <div className="modal-title flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-role-primary" />Votre avis nous intéresse
              </div>
              <button className="modal-close" onClick={() => { setShowFeedback(false); onSuccess(); }}><X className="w-4 h-4" /></button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <p className="text-sm">Le formulaire PAC vous a-t-il été utile ?</p>
              <div className="flex gap-3">
                <button onClick={handleFeedback} className="btn btn-success flex-1">Oui</button>
                <button onClick={handleFeedback} className="btn btn-warning flex-1">Peu</button>
                <button onClick={handleFeedback} className="btn btn-danger flex-1">Non</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
