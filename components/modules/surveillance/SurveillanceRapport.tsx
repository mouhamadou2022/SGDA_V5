// components/modules/surveillance/SurveillanceRapport.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  Save,
  Download,
  Printer,
  PenLine,
  X,
  CheckCircle,
  AlertCircle,
  Sparkles,
  Loader2,
  Send,
  ChevronDown,
  ChevronRight,
  Target,
  Users,
  Calendar,
  MapPin,
  Upload,
  File,
  Mic,
  MicOff,
  TrendingUp,
  TrendingDown,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  RotateCcw,
  RotateCw,
  Brain,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { RapportAnnexes } from './RapportAnnexes';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import { generateEquipeTableHtml, generateEcartsTableHtml } from '@/lib/rapportHtml';
import { reportAgent } from '@/lib/ia/agents/reportAgent';


// Classes CSS réutilisées
const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

// Service IA pour générer le rapport
async function generateWithIA(prompt: string): Promise<string> {
  const response = await fetch('/api/ia/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await response.json();
  return data.content || '';
}

// Composant: Barre d'outils deux lignes
function RapportToolbar({
  onExecCommand,
  onSave,
  onPrint,
  onExportPDF,
  onLoadReport,
  readOnly,
  onSign,
  isSigned,
  onIACommand,
  isIaGenerating,
  onDictate,
  isDictating,
  onAnalyse,
}: {
  onExecCommand: (cmd: string, value?: string) => void;
  onSave: () => void;
  onPrint: () => void;
  onExportPDF: () => void;
  onLoadReport: () => void;
  readOnly: boolean;
  onSign: () => void;
  isSigned: boolean;
  onIACommand: (instruction: string) => void;
  isIaGenerating: boolean;
  onDictate: () => void;
  isDictating: boolean;
  onAnalyse?: () => void;
}) {
  const [iaPanelOpen, setIaPanelOpen] = useState(false);
  const [iaInstruction, setIaInstruction] = useState('');

  const execOnDown = (e: React.MouseEvent, cmd: string, value?: string) => {
    e.preventDefault();
    onExecCommand(cmd, value);
  };

  const handleIA = () => {
    if (iaInstruction.trim()) {
      onIACommand(iaInstruction);
      setIaInstruction('');
    }
  };

  return (
    <div className="mb-4 sticky top-0 z-[100] bg-white border-b border-border shadow-sm">
      {/* Row 1: Actions principales */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button onClick={onSave} className="btn btn-sm px-2 py-0.5 gap-1 text-xs">
          <Save className="w-3 h-3" /> Sauvegarder
        </button>
        <button onClick={onExportPDF} className="btn btn-sm px-2 py-0.5 gap-1 text-xs">
          <Download className="w-3 h-3" /> PDF
        </button>
        <button onClick={onPrint} className="btn btn-sm px-2 py-0.5 gap-1 text-xs">
          <Printer className="w-3 h-3" /> Imprimer
        </button>
        <button onClick={onLoadReport} className="btn btn-sm px-2 py-0.5 gap-1 text-xs">
          <Upload className="w-3 h-3" /> Charger
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        {!readOnly && !isSigned && (
          <>
            <button
              onClick={() => setIaPanelOpen(!iaPanelOpen)}
              className={`btn btn-sm px-2 py-0.5 gap-1 text-xs ${iaPanelOpen ? 'btn-primary' : ''}`}
            >
              <Brain className="w-3 h-3" /> IA
            </button>
            <button onClick={onDictate} className={`btn btn-sm px-2 py-0.5 gap-1 text-xs ${isDictating ? 'bg-danger text-white' : ''}`}>
              {isDictating ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              {isDictating ? 'Arrêter' : 'Dictée'}
            </button>
            <div className="w-px h-4 bg-border mx-1" />
          </>
        )}
        <div className="flex-1" />
        {!readOnly && !isSigned && (
          <button onClick={onSign} className="btn btn-sm px-2 py-0.5 btn-primary gap-1 text-xs">
            <PenLine className="w-3 h-3" /> Signer
          </button>
        )}
        {isSigned && <span className="text-xs text-muted-foreground">✓ Signé</span>}
        {readOnly && !isSigned && <span className="text-xs text-muted-foreground">👁️ Lecture seule</span>}
      </div>

      {/* Row 2: Formatage (visible en édition) */}
      {!readOnly && !isSigned && (
        <div className="flex items-center gap-1 px-3 py-1 border-t border-border bg-gray-50 flex-wrap">
          <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('undo'); }} className="action-button p-1" title="Annuler">
            <RotateCcw className="w-3 h-3" />
          </button>
          <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('redo'); }} className="action-button p-1" title="Rétablir">
            <RotateCw className="w-3 h-3" />
          </button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button onMouseDown={(e) => execOnDown(e, 'bold')} className="action-button p-1" title="Gras"><Bold className="w-3 h-3" /></button>
          <button onMouseDown={(e) => execOnDown(e, 'italic')} className="action-button p-1" title="Italique"><Italic className="w-3 h-3" /></button>
          <button onMouseDown={(e) => execOnDown(e, 'underline')} className="action-button p-1" title="Souligné"><Underline className="w-3 h-3" /></button>
          <button onMouseDown={(e) => execOnDown(e, 'strikeThrough')} className="action-button p-1" title="Barré"><Strikethrough className="w-3 h-3" /></button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button onMouseDown={(e) => execOnDown(e, 'formatBlock', '<h1>')} className="action-button text-[10px] px-1.5 py-1 font-bold" title="Titre 1">H1</button>
          <button onMouseDown={(e) => execOnDown(e, 'formatBlock', '<h2>')} className="action-button text-[10px] px-1.5 py-1 font-bold" title="Titre 2">H2</button>
          <button onMouseDown={(e) => execOnDown(e, 'formatBlock', '<h3>')} className="action-button text-[10px] px-1.5 py-1 font-bold" title="Titre 3">H3</button>
          <button onMouseDown={(e) => execOnDown(e, 'formatBlock', '<p>')} className="action-button text-[10px] px-1.5 py-1" title="Normal">Normal</button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button onMouseDown={(e) => execOnDown(e, 'insertUnorderedList')} className="action-button p-1" title="Liste à puces"><List className="w-3 h-3" /></button>
          <button onMouseDown={(e) => execOnDown(e, 'insertOrderedList')} className="action-button p-1" title="Liste numérotée"><ListOrdered className="w-3 h-3" /></button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button onMouseDown={(e) => execOnDown(e, 'justifyLeft')} className="action-button p-1" title="Aligner gauche"><AlignLeft className="w-3 h-3" /></button>
          <button onMouseDown={(e) => execOnDown(e, 'justifyCenter')} className="action-button p-1" title="Centrer"><AlignCenter className="w-3 h-3" /></button>
          <button onMouseDown={(e) => execOnDown(e, 'justifyRight')} className="action-button p-1" title="Aligner droite"><AlignRight className="w-3 h-3" /></button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button onClick={() => { const url = prompt('URL du lien :'); if (url) onExecCommand('createLink', url); }} className="action-button p-1" title="Lien"><Link2 className="w-3 h-3" /></button>
          <button onClick={() => { const url = prompt('URL de l\'image :'); if (url) onExecCommand('insertImage', url); }} className="action-button p-1" title="Image"><ImageIcon className="w-3 h-3" /></button>
          <button onClick={() => { const r = prompt('Lignes:', '3'); const c = prompt('Colonnes:', '3'); if (r && c) { let h = '<table border="1" style="border-collapse:collapse;width:100%">'; for (let i = 0; i < parseInt(r); i++) { h += '<tr>'; for (let j = 0; j < parseInt(c); j++) { h += i === 0 ? '<th style="padding:8px;background:#f0f0f0">&nbsp;</th>' : '<td style="padding:8px">&nbsp;</td>'; } h += '</tr>'; } h += '</table><br>'; onExecCommand('insertHTML', h); } }} className="action-button p-1" title="Tableau"><TableIcon className="w-3 h-3" /></button>
        </div>
      )}

      {/* IA Panel (expansible) */}
      {iaPanelOpen && !readOnly && !isSigned && (
        <div className="border-t border-border px-3 py-2 bg-primary-soft/20">
          <div className="flex gap-2">
            <input
              type="text"
              value={iaInstruction}
              onChange={(e) => setIaInstruction(e.target.value)}
              placeholder="Ex: Améliore la conclusion, ajoute des recommandations..."
              className="flex-1 form-input text-xs"
              onKeyDown={(e) => e.key === 'Enter' && handleIA()}
            />
            <button onClick={handleIA} disabled={isIaGenerating || !iaInstruction.trim()} className="btn btn-sm px-3 py-1 btn-primary gap-1 text-xs">
              {isIaGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Appliquer
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            <button onClick={() => onIACommand("Génère un résumé exécutif")} className="btn btn-sm px-2 py-0.5 text-[10px]">Résumé</button>
            <button onClick={() => onIACommand("Ajoute des recommandations")} className="btn btn-sm px-2 py-0.5 text-[10px]">Recommandations</button>
            <button onClick={() => onIACommand("Rédige une conclusion")} className="btn btn-sm px-2 py-0.5 text-[10px]">Conclusion</button>
            <button onClick={() => onIACommand("Analyse les résultats")} className="btn btn-sm px-2 py-0.5 text-[10px]">Analyser</button>
            <button onClick={onAnalyse} className="btn btn-sm px-2 py-0.5 text-[10px] bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200">Qualité</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Composant: Page de garde
function PageGarde({
  aerodrome,
  surveillance,
  dgNom,
  editable,
  onContentChange,
  values,
}: {
  aerodrome: any;
  surveillance: any;
  dgNom: string;
  editable: boolean;
  onContentChange?: (field: string, value: string) => void;
  values?: Record<string, string>;
}) {
  const [ministere, setMinistere] = useState(values?.ministere ?? "MINISTERE DES TRANSPORTS TERRESTRES ET AERIENS");
  const [direction, setDirection] = useState(values?.direction ?? "DIRECTION DE LA NAVIGATION AERIENNE ET DES AERODROMES");
  const [titreLigne1, setTitreLigne1] = useState(values?.titreLigne1 ?? "Rapport de surveillance");
  const [titreLigne2, setTitreLigne2] = useState(values?.titreLigne2 ?? `Aéroport de ${aerodrome?.nom || ''} (${aerodrome?.code_oaci || ''})`);
  const [dateInspection, setDateInspection] = useState(values?.dateInspection ?? `du ${new Date(surveillance?.date_debut).toLocaleDateString('fr-FR')} au ${new Date(surveillance?.date_fin).toLocaleDateString('fr-FR')}`);
  const [referentiel, setReferentiel] = useState(values?.referentiel ?? `${new Date().getFullYear()}_01_${aerodrome?.code_oaci || 'XXX'}_SURV`);

  useEffect(() => {
    if (values) {
      if (values.ministere !== undefined) setMinistere(values.ministere);
      if (values.direction !== undefined) setDirection(values.direction);
      if (values.titreLigne1 !== undefined) setTitreLigne1(values.titreLigne1);
      if (values.titreLigne2 !== undefined) setTitreLigne2(values.titreLigne2);
      if (values.dateInspection !== undefined) setDateInspection(values.dateInspection);
      if (values.referentiel !== undefined) setReferentiel(values.referentiel);
    }
  }, [values]);

  const handleMinistereChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMinistere(e.target.value);
    onContentChange?.('ministere', e.target.value);
  };

  const handleDirectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDirection(e.target.value);
    onContentChange?.('direction', e.target.value);
  };

  const handleTitreLigne1Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitreLigne1(e.target.value);
    onContentChange?.('titreLigne1', e.target.value);
  };

  const handleTitreLigne2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitreLigne2(e.target.value);
    onContentChange?.('titreLigne2', e.target.value);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateInspection(e.target.value);
    onContentChange?.('dateInspection', e.target.value);
  };

  const handleReferentielChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReferentiel(e.target.value);
    onContentChange?.('referentiel', e.target.value);
  };

  return (
    <div className="page-garde text-center" style={{ pageBreakAfter: 'avoid' }}>
      <h1 className="text-2xl font-bold">République du Sénégal</h1>
      <div className="flex justify-center"><img src="/drapeau_SN.png" className="h-16 my-2" alt="Drapeau Sénégal" onError={(e) => (e.currentTarget.style.display = 'none')} /></div>
      <p className="devise">Un Peuple – Un But – Une Foi</p>

      <hr className="separator" />

      <div>
        {editable ? (
          <input
            type="text"
            value={ministere}
            onChange={handleMinistereChange}
            className="form-input font-semibold text-center w-full max-w-md mx-auto hg-label"
          />
        ) : (
          <p className="text-sm font-semibold">{ministere}</p>
        )}
        <div className="flex justify-center"><img src="/logo-anacim.png" className="h-12 my-3" alt="Logo ANACIM" onError={(e) => (e.currentTarget.style.display = 'none')} /></div>
        <p className="text-sm font-bold">AGENCE NATIONALE DE L'AVIATION CIVILE ET DE LA METEOROLOGIE</p>
        {editable ? (
          <input
            type="text"
            value={direction}
            onChange={handleDirectionChange}
            className="form-input text-center w-full max-w-md mx-auto mt-1 hg-label"
          />
        ) : (
          <p className="text-sm">{direction}</p>
        )}
      </div>

      <hr className="separator" />

      {editable ? (
        <input
          type="text"
          value={titreLigne1}
          onChange={handleTitreLigne1Change}
          className="form-input text-center w-full max-w-lg mx-auto hg-titre"
        />
      ) : (
        <h2 className="sous-titre">{titreLigne1}</h2>
      )}
      {editable ? (
        <input
          type="text"
          value={titreLigne2}
          onChange={handleTitreLigne2Change}
          className="form-input text-center w-full max-w-lg mx-auto mt-2 hg-sous-titre"
        />
      ) : (
        <h3 className="sous-titre">{titreLigne2}</h3>
      )}

      <hr className="separator" />

      <div className="infos">
        <div className="flex items-center gap-2">
          <strong>Date de l'inspection :</strong>
          {editable ? (
            <input type="text" value={dateInspection} onChange={handleDateChange} className="form-input flex-1 hg-label" />
          ) : (
            <span>{dateInspection}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <strong>Référentiel :</strong>
          {editable ? (
            <input type="text" value={referentiel} onChange={handleReferentielChange} className="form-input flex-1 hg-label" />
          ) : (
            <span>{referentiel}</span>
          )}
        </div>
      </div>

      <hr className="my-6 border-gray-300" />

      <div className="mt-8">
        <p className="font-semibold">Mandataire</p>
        <p>{dgNom}</p>
        <p>Directeur général ANACIM</p>
      </div>
    </div>
  );
}

// Composant: Section éditable (style document, sans Card)
function EditableSection({
  title,
  content,
  onContentChange,
  editable,
  onImprove,
  isImproving,
}: {
  title: string;
  content: string;
  onContentChange: (content: string) => void;
  editable: boolean;
  onImprove?: (instruction: string) => void;
  isImproving?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localContent, setLocalContent] = useState(content);
  const [showIaInput, setShowIaInput] = useState(false);
  const [iaInput, setIaInput] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  const handleSave = () => {
    onContentChange(localContent);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalContent(content);
    setIsEditing(false);
  };

  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  if (!editable) {
    return (
      <div className="rapport-section">
        <h2 className="rapport-heading">{title}</h2>
        <div className="rapport-text" dangerouslySetInnerHTML={{ __html: content || '<em>Non renseigné</em>' }} />
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="rapport-section">
        <div className="flex items-center justify-between mb-2">
          <h2 className="rapport-heading !mb-0">{title}</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} className="btn btn-sm px-2 py-0.5 btn-success text-xs">
              <CheckCircle className="w-3 h-3 mr-1" /> Valider
            </button>
            <button onClick={handleCancel} className="btn btn-sm px-2 py-0.5 btn-danger text-xs">
              <X className="w-3 h-3 mr-1" /> Annuler
            </button>
          </div>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => editorRef.current && setLocalContent(editorRef.current.innerHTML)}
          className="rapport-text-editable min-h-[120px]"
          dangerouslySetInnerHTML={{ __html: localContent }}
        />
      </div>
    );
  }

  return (
    <div className="rapport-section">
      <div className="flex items-center justify-between">
        <h2 className="rapport-heading !mb-0">{title}</h2>
        <div className="flex items-center gap-1">
          {onImprove && (
            <div className="relative">
              <button onClick={() => setShowIaInput(!showIaInput)} disabled={isImproving} className="btn btn-sm px-2 py-0.5 text-xs gap-1">
                {isImproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                IA
              </button>
              {showIaInput && (
                <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-white rounded-xl shadow-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-2">Que voulez-vous que l'IA fasse ?</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={iaInput}
                      onChange={(e) => setIaInput(e.target.value)}
                      placeholder="Ex: Améliore, ajoute des stats..."
                      className="flex-1 form-input text-sm"
                      onKeyDown={(e) => { if (e.key === 'Enter' && iaInput.trim()) { setShowIaInput(false); onImprove(iaInput.trim()); setIaInput(''); } }}
                      autoFocus
                    />
                    <button onClick={() => { if (iaInput.trim()) { setShowIaInput(false); onImprove(iaInput.trim()); setIaInput(''); } }} className="btn btn-sm px-3 py-1 btn-primary">
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                  <button onClick={() => { setShowIaInput(false); onImprove(''); setIaInput(''); }} className="text-xs text-muted-foreground mt-2 hover:text-foreground">
                    Génération rapide (sans instruction)
                  </button>
                </div>
              )}
            </div>
          )}
          <button onClick={() => setIsEditing(true)} className="btn btn-sm px-2 py-0.5 text-xs">
            <PenLine className="w-3 h-3 mr-1" /> Modifier
          </button>
        </div>
      </div>
      <div className="rapport-text" dangerouslySetInnerHTML={{ __html: content || '<em>Non renseigné</em>' }} />
    </div>
  );
}

// Composant: Graphique barre
function ProgressBar({ label, value, colorClass, maxValue = 100 }: { label: string; value: number; colorClass: string; maxValue?: number }) {
  const percent = (value / maxValue) * 100;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-medium">{value}{maxValue === 100 ? '%' : ''}</span>
      </div>
      <div className="progress h-2">
        <div className={`progress-bar ${colorClass}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// Composant: Graphique radar des critères
function CriteriaRadar({ c1, c2, c3, c4, c5 }: { c1: number; c2: number; c3: number; c4: number; c5: number }) {
  const getColor = (value: number) => {
    if (value >= 70) return 'bg-success';
    if (value >= 50) return 'bg-warning';
    return 'bg-danger';
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <div className="text-center p-3 rounded-lg bg-gray-50">
        <p className="text-xs text-muted-foreground">C1 - SGS</p>
        <p className={`text-xl font-bold ${c1 >= 70 ? 'text-success' : c1 >= 50 ? 'text-warning' : 'text-danger'}`}>{c1}</p>
        <div className="progress h-1 mt-1">
          <div className={`progress-bar ${getColor(c1)}`} style={{ width: `${c1}%` }} />
        </div>
      </div>
      <div className="text-center p-3 rounded-lg bg-gray-50">
        <p className="text-xs text-muted-foreground">C2 - PAC</p>
        <p className={`text-xl font-bold ${c2 >= 70 ? 'text-success' : c2 >= 50 ? 'text-warning' : 'text-danger'}`}>{c2}</p>
        <div className="progress h-1 mt-1">
          <div className={`progress-bar ${getColor(c2)}`} style={{ width: `${c2}%` }} />
        </div>
      </div>
      <div className="text-center p-3 rounded-lg bg-gray-50">
        <p className="text-xs text-muted-foreground">C3 - Conformité</p>
        <p className={`text-xl font-bold ${c3 >= 70 ? 'text-success' : c3 >= 50 ? 'text-warning' : 'text-danger'}`}>{c3}</p>
        <div className="progress h-1 mt-1">
          <div className={`progress-bar ${getColor(c3)}`} style={{ width: `${c3}%` }} />
        </div>
      </div>
      <div className="text-center p-3 rounded-lg bg-gray-50">
        <p className="text-xs text-muted-foreground">C4 - Charge</p>
        <p className={`text-xl font-bold ${c4 >= 70 ? 'text-success' : c4 >= 50 ? 'text-warning' : 'text-danger'}`}>{c4}</p>
        <div className="progress h-1 mt-1">
          <div className={`progress-bar ${getColor(c4)}`} style={{ width: `${c4}%` }} />
        </div>
      </div>
      <div className="text-center p-3 rounded-lg bg-gray-50">
        <p className="text-xs text-muted-foreground">C5 - Résilience</p>
        <p className={`text-xl font-bold ${c5 >= 70 ? 'text-success' : c5 >= 50 ? 'text-warning' : 'text-danger'}`}>{c5}</p>
        <div className="progress h-1 mt-1">
          <div className={`progress-bar ${getColor(c5)}`} style={{ width: `${c5}%` }} />
        </div>
      </div>
    </div>
  );
}

// Composant: Graphique des écarts par niveau
function EcartsByLevel({ ecarts }: { ecarts: any[] }) {
  const levels = [
    { key: 'critique', label: 'Critique', class: 'danger' },
    { key: 'eleve', label: 'Élevé', class: 'warning' },
    { key: 'moyen', label: 'Moyen', class: 'primary' },
    { key: 'faible', label: 'Faible', class: 'info' },
  ];

  const counts = levels.map(l => ({
    ...l,
    count: ecarts.filter(e => e.niveau_risque === l.key && e.statut !== 'cloture').length,
  }));

  const maxCount = Math.max(...counts.map(c => c.count), 1);

  return (
    <div className="space-y-3">
      {counts.map(level => (
        <div key={level.key}>
          <div className="flex justify-between text-sm mb-1">
            <div className="flex items-center gap-2">
              <span className={`badge ${level.class}`}>{level.label}</span>
              <span>{level.count} écart(s)</span>
            </div>
            <span>{Math.round((level.count / maxCount) * 100)}%</span>
          </div>
          <div className="progress h-2">
            <div className={`progress-bar bg-${level.class}`} style={{ width: `${(level.count / maxCount) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SurveillanceRapport({
  surveillanceId,
  onSave,
  onSigner,
  readOnly = false,
  userRole = 'inspector',
}: {
  surveillanceId: string;
  onSave?: (contenu: string) => void;
  onSigner?: (signatureUrl: string) => void;
  readOnly?: boolean;
  userRole?: string;
}) {
  const user = useAppStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const surveillances = useAppStore(s => s.surveillances);
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const inspecteurs = useAppStore(s => s.inspecteurs);
  const ecarts = useAppStore(s => s.ecarts);
  const checklistItems = useAppStore(s => s.checklistItems);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const getFichesBySurveillance = useAppStore(s => s.getFichesBySurveillance);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);
  const profil = profilsRisque[surveillance?.aerodrome_id || ''];
  const dgAnacim = utilisateurs.find(u => u.role === 'dg_anacim');
  const dgNom = dgAnacim ? `${dgAnacim.prenom} ${dgAnacim.nom}` : 'Le Directeur Général';

  const [isGenerating, setIsGenerating] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [isSigned, setIsSigned] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([]);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [savedReports, setSavedReports] = useState<{ id: string; date: string; preview: string; content?: string }[]>([]);
  const [showAnalyse, setShowAnalyse] = useState(false);
  const [analyseResult, setAnalyseResult] = useState<{ score: number; grade: string; forces: string[]; faiblesses: string[] } | null>(null);
  const recognitionRef = useRef<any>(null);

  // Contenu du rapport
  const [sections, setSections] = useState({
    resume: '',
    introduction: '',
    methodologie: '',
    equipe: '',
    deroulement: { preparation: '', reunionOuverture: '', verificationSite: '', reunionCloture: '' },
    preoccupations: '',
    recommandations: '',
    conclusion: '',
    resultsIntro: '',
    resultsAnalysis: '',
  });
  const [pageGardeFields, setPageGardeFields] = useState<Record<string, string>>({});

  const handlePageGardeChange = (field: string, value: string) => {
    setPageGardeFields(prev => ({ ...prev, [field]: value }));
  };

  const reportContainerRef = useRef<HTMLDivElement>(null);

  // Récupération des écarts de la surveillance
  const surveillanceEcarts = useCallback(() => {
    return ecarts.filter(e => e.surveillance_id === surveillanceId);
  }, [ecarts, surveillanceId]);

  // Statistiques checklist
  const checklistStats = useMemo(() => {
    const items = checklistItems[surveillanceId] || [];
    const total = items.length;
    const sa = items.filter(i => i.resultat === 'SA').length;
    const ns = items.filter(i => i.resultat === 'NS').length;
    const nv = items.filter(i => i.resultat === 'NV' || !i.resultat).length;
    const na = items.filter(i => i.resultat === 'NA').length;
    const taux = total > 0 ? Math.round((sa / (sa + ns + nv)) * 100) : 0;
    return { total, sa, ns, nv, na, taux };
  }, [checklistItems, surveillanceId]);

  // Génération du tableau de l'équipe
  const generateEquipeHtml = useCallback(() => {
    const equipeIds = surveillance?.equipe_ids || [];
    const membres = utilisateurs.filter(u => equipeIds.includes(u.id));
    return generateEquipeTableHtml(membres, surveillance?.chef_id);
  }, [surveillance, utilisateurs]);

  // Génération du tableau des écarts
  const generateEcartsTable = useCallback(() => {
    return generateEcartsTableHtml(surveillanceEcarts());
  }, [surveillanceEcarts]);

  // Génération du HTML des résultats (tableaux de bord chiffrés)
  const generateResultsHtml = useCallback(() => {
    if (!profil) return '<p>Données de risque non disponibles</p>';

    const items = checklistItems[surveillanceId] || [];
    const portee = surveillance?.portee || [];
    const hasSGS = portee.includes('SGS');

    // Statistiques par domaine
    const byDomaine: Record<string, { sa: number; ns: number; nv: number; total: number }> = {};
    items.forEach(item => {
      if (!byDomaine[item.domaine]) byDomaine[item.domaine] = { sa: 0, ns: 0, nv: 0, total: 0 };
      byDomaine[item.domaine].total++;
      if (item.resultat === 'SA') byDomaine[item.domaine].sa++;
      else if (item.resultat === 'NS') byDomaine[item.domaine].ns++;
      else if (item.resultat === 'NV' || !item.resultat) byDomaine[item.domaine].nv++;
    });

    const ecartsList = surveillanceEcarts();
    const globalTaux = checklistStats.taux;
    const globalColor = globalTaux >= 70 ? 'success' : globalTaux >= 50 ? 'warning' : 'danger';
    const totalDomaines = Object.keys(byDomaine).length;
    const domainesConformes = Object.entries(byDomaine).filter(([, s]) => (s.total > 0 ? Math.round((s.sa / s.total) * 100) : 100) >= 90).length;

    const sgsEval = surveillance?.sgs_evaluation_prepa as any;
    const sgsScore = sgsEval?.scoreGlobal;
    const sgsNiveau = sgsScore !== undefined
      ? sgsScore >= 80 ? 'Efficace' : sgsScore >= 60 ? 'Opérationnel' : sgsScore >= 40 ? 'Approprié' : 'Non conforme'
      : null;

    let html = `
      <div class="space-y-5">

        <div class="card border-border">
          <div class="card-header">
            <div class="card-title text-sm">Taux de conformité global</div>
          </div>
          <div class="card-content">
            <div class="flex items-center justify-between mb-2">
              <span>
                <span class="text-3xl font-bold ${globalColor === 'success' ? 'text-success' : globalColor === 'warning' ? 'text-warning' : 'text-danger'}">${checklistStats.taux}%</span>
                <span class="text-sm text-muted-foreground ml-2">sur ${checklistStats.total} point(s)</span>
              </span>
              <span class="badge ${globalColor === 'success' ? 'success' : globalColor === 'warning' ? 'warning' : 'danger'} text-sm px-3 py-1">
                ${globalTaux >= 70 ? 'Généralement conforme' : globalTaux >= 50 ? 'Partiellement conforme' : 'Non conforme'}
              </span>
            </div>
            <div class="progress h-2">
              <div class="progress-bar ${globalColor === 'success' ? 'bg-success' : globalColor === 'warning' ? 'bg-warning' : 'bg-danger'}" style="width: ${checklistStats.taux}%"></div>
            </div>
            <div class="flex gap-3 mt-2 text-xs text-muted-foreground">
              <span>SA : <strong class="text-success">${checklistStats.sa}</strong></span>
              <span>NS : <strong class="text-danger">${checklistStats.ns}</strong></span>
              <span>NV : <strong class="text-warning">${checklistStats.nv}</strong></span>
              <span class="ml-auto">${domainesConformes}/${totalDomaines} domaine(s) ≥ 90%</span>
            </div>
          </div>
        </div>

        <div class="card border-border">
          <div class="card-header">
            <div class="card-title text-sm">Résultats par domaine</div>
          </div>
          <div class="card-content space-y-3">
    `;

    Object.entries(byDomaine).forEach(([domaine, stats]) => {
      const taux = stats.total > 0 ? Math.round((stats.sa / (stats.sa + stats.ns + stats.nv)) * 100) : 0;
      const colorBar = taux >= 90 ? 'bg-success' : taux >= 70 ? 'bg-warning' : taux >= 50 ? 'bg-orange-400' : 'bg-danger';
      html += `
        <div class="p-3 rounded-lg border border-border">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-sm">${domaine}</span>
            <span class="${taux >= 90 ? 'text-success' : taux >= 70 ? 'text-warning' : 'text-danger'} font-semibold text-sm">${taux}%</span>
          </div>
          <div class="progress h-1.5 mb-2">
            <div class="progress-bar ${colorBar}" style="width: ${taux}%"></div>
          </div>
          <div class="flex gap-3 text-xs text-muted-foreground">
            <span>SA : <strong class="text-success">${stats.sa}</strong></span>
            <span>NS : <strong class="text-danger">${stats.ns}</strong></span>
            <span>NV : <strong class="text-warning">${stats.nv}</strong></span>
            <span class="ml-auto">${stats.total} point(s) vérifié(s)</span>
          </div>
        </div>
      `;
    });

    if (hasSGS) {
      const sgsColor = sgsScore !== undefined
        ? sgsScore >= 80 ? 'success' : sgsScore >= 60 ? 'primary' : sgsScore >= 40 ? 'warning' : 'danger'
        : 'muted';
      html += `
        <div class="p-3 rounded-lg border border-${sgsColor}/30 bg-${sgsColor}/5">
          <div class="flex items-center justify-between mb-1">
            <span class="font-semibold text-sm">Système de Gestion de la Sécurité (SGS)</span>
            ${sgsNiveau ? `<span class="badge ${sgsColor}">${sgsNiveau}</span>` : '<span class="badge muted">Non évalué</span>'}
          </div>
          ${sgsScore !== undefined ? `
          <div class="flex items-center gap-2 mt-2">
            <span class="text-2xl font-bold text-${sgsColor}">${sgsScore}%</span>
            <div class="flex-1 progress h-1.5">
              <div class="progress-bar bg-${sgsColor}" style="width: ${sgsScore}%"></div>
            </div>
          </div>
          <p class="text-xs text-muted-foreground mt-1">
            Évaluation PAOE (OACI Annexe 19) — ${sgsEval?.composantes?.length || 0} composante(s) évaluée(s).
          </p>` : '<p class="text-xs text-muted-foreground mt-1">L\'évaluation PAOE n\'a pas été renseignée.</p>'}
        </div>
      `;
    }

    if (ecartsList.length > 0) {
      html += `
        <div class="p-3 rounded-lg border border-border">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-sm">Synthèse des écarts</span>
            <span class="badge outline">${ecartsList.length} écart(s)</span>
          </div>
          <div class="grid grid-cols-4 gap-2">
            ${(() => { const c = ecartsList.filter(e => e.niveau_risque === 'critique').length; return c > 0 ? `<div class="text-center p-2 bg-danger/10 rounded"><div class="text-lg font-bold text-danger">${c}</div><div class="text-xs text-muted-foreground">Critique</div></div>` : ''; })()}
            ${(() => { const c = ecartsList.filter(e => e.niveau_risque === 'eleve').length; return c > 0 ? `<div class="text-center p-2 bg-warning/10 rounded"><div class="text-lg font-bold text-warning">${c}</div><div class="text-xs text-muted-foreground">Élevé</div></div>` : ''; })()}
            ${(() => { const c = ecartsList.filter(e => e.niveau_risque === 'moyen').length; return c > 0 ? `<div class="text-center p-2 bg-primary/10 rounded"><div class="text-lg font-bold text-primary">${c}</div><div class="text-xs text-muted-foreground">Moyen</div></div>` : ''; })()}
            ${(() => { const c = ecartsList.filter(e => e.niveau_risque === 'faible' || e.niveau_risque === 'tres_faible').length; return c > 0 ? `<div class="text-center p-2 bg-gray-100 rounded"><div class="text-lg font-bold text-gray-600">${c}</div><div class="text-xs text-muted-foreground">Faible</div></div>` : ''; })()}
          </div>
          <p class="text-xs text-muted-foreground mt-2">Se référer à l'<strong>Annexe A-2</strong> pour le détail complet.</p>
        </div>
      `;
    }

    html += `</div></div></div>`;
    return html;
  }, [profil, checklistItems, surveillanceId, checklistStats, surveillanceEcarts, surveillance, aerodrome]);

  // Génération complète du rapport avec IA
  const generateFullReport = useCallback(async () => {
    setIsGenerating(true);
    try {
      const ecartsList = surveillanceEcarts();
      const items = checklistItems[surveillanceId] || [];
      const byDomaine: Record<string, { sa: number; ns: number; nv: number; total: number }> = {};
      items.forEach(item => {
        if (!byDomaine[item.domaine]) byDomaine[item.domaine] = { sa: 0, ns: 0, nv: 0, total: 0 };
        byDomaine[item.domaine].total++;
        if (item.resultat === 'SA') byDomaine[item.domaine].sa++;
        else if (item.resultat === 'NS') byDomaine[item.domaine].ns++;
        else if (item.resultat === 'NV' || !item.resultat) byDomaine[item.domaine].nv++;
      });
      const domainesStr = Object.entries(byDomaine)
        .map(([d, s]) => `${d}: ${s.sa} SA / ${s.ns} NS / ${s.nv} NV (${s.total} pts, taux ${s.total > 0 ? Math.round((s.sa / s.total) * 100) : 100}%)`)
        .join('\n');
      const pacStatuses = ['pac_attendu', 'pac_soumis', 'pac_accepte', 'preuves_soumises', 'preuves_evaluees', 'en_retard', 'cloture'];
      const pacCount = ecartsList.filter(e => pacStatuses.includes(e.statut)).length;
      const closedCount = ecartsList.filter(e => e.statut === 'cloture').length;
      const overdueCount = ecartsList.filter(e => e.statut === 'en_retard').length;
      const ecartsStr = ecartsList.map(e =>
        `- ${e.reference}: ${e.libelle.replace(/<[^>]*>/g, '').substring(0, 120)} — Niveau: ${e.niveau_risque} — Statut: ${e.statut}${e.cellule_risque_oaci ? ` — OACI: ${e.cellule_risque_oaci}` : ''}`
      ).join('\n');
      const sgsEval = surveillance?.sgs_evaluation_prepa as any;
      const portee = Array.isArray(surveillance?.portee) ? surveillance.portee.join(', ') : surveillance?.portee || 'N/A';

      const context = `
AÉRODROME: ${aerodrome?.nom} (${aerodrome?.code_oaci})
PÉRIODE: ${surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A'} → ${surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A'}
TYPE: ${surveillance?.type}
PORTÉE: ${portee}
SCORE RISQUE: ${profil?.score_global || 'N/A'}/100 — NIVEAU: ${profil?.niveau || 'N/A'} — TENDANCE: ${profil?.tendance || 'stable'}

PROFIL DE RISQUE DÉTAILLÉ:
- C1 (Maturité SGS): ${profil?.c1 || 'N/A'}/100
- C2 (Efficacité PAC): ${profil?.c2 || 'N/A'}/100
- C3 (Conformité): ${profil?.c3 || 'N/A'}/100
- C4 (Charge critique): ${profil?.c4 || 'N/A'}/100
- C5 (Résilience): ${profil?.c5 || 'N/A'}/100
${profil?.prediction_3m ? `- Prédiction 3 mois: ${profil.prediction_3m}/100` : ''}
${profil?.prediction_6m ? `- Prédiction 6 mois: ${profil.prediction_6m}/100` : ''}

RÉSULTATS CHECKLIST:
- Total: ${checklistStats.total} points vérifiés
- SA (Satisfaisant): ${checklistStats.sa}
- NS (Non Satisfaisant): ${checklistStats.ns}
- NV (Non Vérifié): ${checklistStats.nv}
- Taux de conformité global: ${checklistStats.taux}%

RÉSULTATS PAR DOMAINE:
${domainesStr}

ÉCARTS CONSTATÉS:
- Total: ${ecartsList.length}
- Clôturés: ${closedCount}
- En retard: ${overdueCount}
- Avec PAC: ${pacCount}

DÉTAIL DES ÉCARTS:
${ecartsStr || 'Aucun écart'}

SGS:
${sgsEval ? `Score PAOE: ${sgsEval.scoreGlobal}% — ${sgsEval.composantes?.length || 0} composante(s)` : 'Non évalué / Non inclus'}
`;

      const prompt = `Tu es un expert en sécurité aéronautique à l'ANACIM Sénégal. Tu rédiges un rapport de surveillance technique et professionnel destiné à un exploitant d'aérodrome.

Contexte:
${context}

Réponds UNIQUEMENT avec un objet JSON valide contenant les clés suivantes (chaque valeur est une chaîne HTML sans le titre de la section) :
{
  "resume": "RÉSUMÉ EXÉCUTIF — Synthèse des constats clés",
  "introduction": "INTRODUCTION ET CONTEXTE — Objectifs, cadre réglementaire, périmètre",
  "methodologie": "MÉTHODOLOGIE — Approche utilisée (revue documentaire, inspection sur site, entretiens, checklist)",
  "preparation": "DÉROULEMENT - Préparation",
  "reunionOuverture": "DÉROULEMENT - Réunion d'ouverture",
  "verificationSite": "DÉROULEMENT - Phase de vérification sur site",
  "reunionCloture": "DÉROULEMENT - Réunion de clôture",
  "preoccupations": "PRÉOCCUPATIONS DE SÉCURITÉ",
  "resultsIntro": "INTRODUCTION DES RÉSULTATS",
  "resultsAnalysis": "ANALYSE DES RÉSULTATS — Interprétation détaillée (par domaine, écarts, PAC, SGS/PAOE, profil C1-C5 en langage clair, tendance, priorités)",
  "recommandations": "RECOMMANDATIONS — Actions correctives prioritaires/secondaires avec échéances",
  "conclusion": "CONCLUSION — Bilan global, conformité, perspectives"
}

Ne mets aucun texte avant ou après le JSON. Utilise du HTML simple (paragraphes <p>, listes <ul>/<li>).`;


      const generatedContent = await generateWithIA(prompt);
      let parsed: Record<string, string> = {};
      try {
        const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch { /* fallback parsing */ }

      const newSections = { ...sections };
      if (Object.keys(parsed).length > 0) {
        if (parsed.resume) newSections.resume = parsed.resume;
        if (parsed.introduction) newSections.introduction = parsed.introduction;
        if (parsed.methodologie) newSections.methodologie = parsed.methodologie;
        if (parsed.preoccupations) newSections.preoccupations = parsed.preoccupations;
        if (parsed.recommandations) newSections.recommandations = parsed.recommandations;
        if (parsed.conclusion) newSections.conclusion = parsed.conclusion;
        if (parsed.resultsIntro) newSections.resultsIntro = parsed.resultsIntro;
        if (parsed.resultsAnalysis) newSections.resultsAnalysis = parsed.resultsAnalysis;
        if (parsed.preparation) newSections.deroulement.preparation = parsed.preparation;
        if (parsed.reunionOuverture) newSections.deroulement.reunionOuverture = parsed.reunionOuverture;
        if (parsed.verificationSite) newSections.deroulement.verificationSite = parsed.verificationSite;
        if (parsed.reunionCloture) newSections.deroulement.reunionCloture = parsed.reunionCloture;
      } else {
        // Fallback: parsing par sections (ancien format)
        const lines = generatedContent.split('\n');
        let currentSection = '';
        for (const line of lines) {
          if (line.includes('RÉSUMÉ EXÉCUTIF')) currentSection = 'resume';
          else if (line.includes('INTRODUCTION ET CONTEXTE')) currentSection = 'introduction';
          else if (line.includes('MÉTHODOLOGIE')) currentSection = 'methodologie';
          else if (line.includes('PRÉOCCUPATIONS')) currentSection = 'preoccupations';
          else if (line.includes('RECOMMANDATIONS')) currentSection = 'recommandations';
          else if (line.includes('CONCLUSION')) currentSection = 'conclusion';
          else if (line.includes('INTRODUCTION DES RÉSULTATS')) currentSection = 'resultsIntro';
          else if (line.includes('ANALYSE DES RÉSULTATS')) currentSection = 'resultsAnalysis';
          else if (line.includes('Préparation')) currentSection = 'preparation';
          else if (line.includes("Réunion d'ouverture")) currentSection = 'reunionOuverture';
          else if (line.includes('Phase de vérification')) currentSection = 'verificationSite';
          else if (line.includes('Réunion de clôture')) currentSection = 'reunionCloture';
          else if (currentSection && line.trim()) {
            if (currentSection === 'preparation') newSections.deroulement.preparation += line + '<br/>';
            else if (currentSection === 'reunionOuverture') newSections.deroulement.reunionOuverture += line + '<br/>';
            else if (currentSection === 'verificationSite') newSections.deroulement.verificationSite += line + '<br/>';
            else if (currentSection === 'reunionCloture') newSections.deroulement.reunionCloture += line + '<br/>';
            else if (currentSection === 'resume') newSections.resume += line + '<br/>';
            else if (currentSection === 'introduction') newSections.introduction += line + '<br/>';
            else if (currentSection === 'methodologie') newSections.methodologie += line + '<br/>';
            else if (currentSection === 'preoccupations') newSections.preoccupations += line + '<br/>';
            else if (currentSection === 'recommandations') newSections.recommandations += line + '<br/>';
            else if (currentSection === 'conclusion') newSections.conclusion += line + '<br/>';
            else if (currentSection === 'resultsIntro') newSections.resultsIntro += line + '<br/>';
            else if (currentSection === 'resultsAnalysis') newSections.resultsAnalysis += line + '<br/>';
          }
        }
      }

      setSections(newSections);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Rapport généré',
        message: 'Le rapport a été généré automatiquement par l\'IA',
        canal: 'in_app',
      });
    } catch (error) {
      console.error('Erreur génération IA:', error);
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: 'Impossible de générer le rapport. Veuillez réessayer.',
        canal: 'in_app',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [aerodrome, surveillance, profil, surveillanceEcarts, checklistStats, sections, user, addNotification]);

  // Améliorer une section avec IA
  const improveSection = useCallback(async (sectionKey: string, currentContent: string, sectionTitle: string, userInstruction?: string) => {
    setIsImproving(true);
    try {
      const isRempli = currentContent && currentContent.trim() !== '';
      const ecartsList = surveillanceEcarts();
      const ecartsStr = ecartsList.map(e =>
        `- ${e.reference}: ${e.libelle.replace(/<[^>]*>/g, '').substring(0, 120)} — Niveau: ${e.niveau_risque} — Statut: ${e.statut}${e.cellule_risque_oaci ? ` — OACI: ${e.cellule_risque_oaci}` : ''}`
      ).join('\n');
      const sgsEval = surveillance?.sgs_evaluation_prepa as any;
      let richContext = '';
      if (sectionKey === 'resultsAnalysis') {
        richContext = `
RÉSULTATS COMPLETS:
- Taux conformité: ${checklistStats.taux}% (${checklistStats.sa} SA / ${checklistStats.ns} NS / ${checklistStats.nv} NV sur ${checklistStats.total} points)

PROFIL DE RISQUE:
- Score global: ${profil?.score_global || 'N/A'}/100 — ${profil?.niveau || 'N/A'} — Tendance: ${profil?.tendance || 'stable'}
- C1 Maturité SGS: ${profil?.c1 || 'N/A'}/100
- C2 Efficacité PAC: ${profil?.c2 || 'N/A'}/100
- C3 Conformité: ${profil?.c3 || 'N/A'}/100
- C4 Charge critique: ${profil?.c4 || 'N/A'}/100
- C5 Résilience: ${profil?.c5 || 'N/A'}/100
${profil?.effectiveness_score != null ? `- Efficacité PAC: ${profil.effectiveness_score}/100` : ''}

ÉCARTS:
${ecartsStr || 'Aucun écart'}

SGS: ${sgsEval ? `Score PAOE: ${sgsEval.scoreGlobal}%` : 'Non évalué'}
SCORE RISQUE: ${profil?.score_global || 'N/A'}/100 — TENDANCE: ${profil?.tendance || 'stable'}
`;
      }
      const context = `Aérodrome: ${aerodrome?.nom} (${aerodrome?.code_oaci})
Date: ${surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A'} au ${surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A'}
Type: ${surveillance?.type}
Score risque: ${profil?.score_global || 'N/A'}/100
Tendance: ${profil?.tendance || 'stable'}
Écarts: ${surveillanceEcarts().length}
Taux conformité: ${checklistStats.taux}%${richContext}`;

      const instructionPart = userInstruction
        ? `\nInstruction supplémentaire de l'utilisateur : ${userInstruction}\n`
        : '';

      const isAnalysis = sectionKey === 'resultsAnalysis';
      const prompt = isAnalysis && !isRempli
        ? `Tu es un expert en sécurité aéronautique à l'ANACIM Sénégal. Rédige l'analyse détaillée des résultats au format HTML (paragraphes, listes si besoin). Interprète les données suivantes : analyse par domaine, distribution des écarts par niveau, analyse des PAC (taux de clôture, retards), interprétation du SGS/PAOE si applicable, tendance du risque, points prioritaires. Sois pédagogique sans jargon excessif.${instructionPart}
Contexte: ${context}

N'inclus PAS le titre de la section dans le contenu.`
        : isRempli
          ? `Améliore et reformule le texte suivant de manière plus professionnelle, sans changer le sens. Le texte fait partie d'un rapport de surveillance aéronautique ANACIM.${instructionPart}
Contexte: ${context}

Titre de la section: ${sectionTitle}

Texte à améliorer:
${currentContent}

Renvoie uniquement le texte amélioré, sans le titre de la section.`
          : `Tu es un expert en sécurité aéronautique à l'ANACIM Sénégal. Rédige la section "${sectionTitle}" d'un rapport de surveillance au format HTML (paragraphes, listes si besoin). Sois professionnel, concis et technique.${instructionPart}
Contexte: ${context}

N'inclus PAS le titre de la section dans le contenu.`;
      const improved = await generateWithIA(prompt);
      
      if (sectionKey === 'deroulement') {
        // Pour le déroulement, on ne peut pas améliorer globalement
      } else if (sectionKey === 'resultsIntro') {
        setSections(prev => ({ ...prev, resultsIntro: improved }));
      } else if (sectionKey === 'resultsAnalysis') {
        setSections(prev => ({ ...prev, resultsAnalysis: improved }));
      } else {
        setSections(prev => ({ ...prev, [sectionKey]: improved }));
      }
      
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Section améliorée',
        message: `La section "${sectionTitle}" a été améliorée par l'IA`,
        canal: 'in_app',
      });
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: "Impossible d'améliorer la section",
        canal: 'in_app',
      });
    } finally {
      setIsImproving(false);
    }
  }, [user, addNotification, aerodrome, surveillance, profil, surveillanceEcarts, checklistStats]);

  // Dictée vocale
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'fr-FR';
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join(' ');
        if (reportContainerRef.current) {
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            document.execCommand('insertText', false, transcript);
          }
        }
      };
      recognitionRef.current.onerror = () => setIsDictating(false);
      recognitionRef.current.onend = () => setIsDictating(false);
    }
  }, []);

  const toggleDictation = () => {
    if (!recognitionRef.current) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Non supporté',
        message: 'La dictée vocale n\'est pas supportée par ce navigateur',
        canal: 'in_app',
      });
      return;
    }
    if (isDictating) {
      recognitionRef.current.stop();
      setIsDictating(false);
    } else {
      recognitionRef.current.start();
      setIsDictating(true);
    }
  };

  // Sauvegarde auto — toutes les 15s, persist aussi les sections
  useEffect(() => {
    if (readOnly || isSigned) return;
    const interval = setInterval(() => {
      setLastSaved(new Date());
      const rapportHtml = reportContainerRef.current?.innerHTML || '';
      onSave?.(rapportHtml);
      updateSurveillance(surveillanceId, {
        rapport_html: rapportHtml,
        rapport_sections: JSON.stringify(sections),
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [readOnly, isSigned, onSave, surveillanceId, updateSurveillance, sections]);

  // Restaurer les sections depuis le stockage persistant au montage
  useEffect(() => {
    if (!surveillance) return;
    if (surveillance.rapport_sections) {
      try {
        const parsed = JSON.parse(surveillance.rapport_sections);
        setSections(prev => ({
          ...prev,
          ...parsed,
          deroulement: { ...prev.deroulement, ...(parsed.deroulement || {}) },
        }));
      } catch { /* ignore parse error */ }
    }
  }, [surveillance?.id]);

  // Persister les sections à chaque modification (debounced 3s)
  useEffect(() => {
    if (readOnly || isSigned || !surveillance) return;
    const timer = setTimeout(() => {
      updateSurveillance(surveillanceId, {
        rapport_sections: JSON.stringify(sections),
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [sections, readOnly, isSigned, surveillanceId, updateSurveillance, surveillance]);

  // Générer le rapport IA uniquement si :
  // - le rapport n'est pas déjà signé/transmis
  // - aucune section sauvegardée n'a été trouvée
  // - les données aérodrome/surveillance sont chargées
  useEffect(() => {
    if (readOnly || isSigned) return;
    if (!sections.resume && aerodrome && surveillance && !surveillance.rapport_sections) {
      generateFullReport();
    }
  }, [aerodrome?.code_oaci, readOnly, isSigned]);

  // Analyse qualité du rapport via reportAgent
  const handleAnalyse = useCallback(async () => {
    if (!surveillance) return;
    setShowAnalyse(true);
    setAnalyseResult(null);
    try {
      const content = [
        sections.resume, sections.introduction, sections.methodologie,
        sections.preoccupations, sections.recommandations, sections.conclusion,
      ].filter(Boolean).join('\n\n');
      const analysis = await reportAgent.analyzeReportContent(content, surveillanceId);
      setAnalyseResult({
        score: analysis.score,
        grade: analysis.grade,
        forces: analysis.forces,
        faiblesses: analysis.faiblesses.map((f: any) => `${f.probleme} (${f.section})`),
      });
    } catch {
      setAnalyseResult({ score: 0, grade: 'Erreur', forces: [], faiblesses: ["Impossible d'analyser le rapport"] });
    }
  }, [surveillance, surveillanceId, sections]);

  // Extraire les titres pour le sommaire
  useEffect(() => {
    if (reportContainerRef.current) {
      const headingElements = reportContainerRef.current.querySelectorAll('h2, h3');
      const newHeadings: { id: string; text: string; level: number }[] = [];
      let h1Count = 1;
      headingElements.forEach((el, idx) => {
        const level = parseInt(el.tagName[1]);
        let text = el.textContent || '';
        if (level === 2 && !text.match(/^\d+\./)) {
          text = `${h1Count}. ${text}`;
          h1Count++;
        }
        const id = `heading-${idx}`;
        el.id = id;
        newHeadings.push({ id, text, level });
      });
      setHeadings(newHeadings);
    }
  }, [sections]);

  const handleSign = () => setSignatureDialogOpen(true);

  const onSignatureSave = (signatureUrl: string) => {
    setIsSigned(true);
    setSignatureDialogOpen(false);
    const rapportHtml = reportContainerRef.current?.innerHTML || '';
    updateSurveillance(surveillanceId, {
      statut: 'rapport_signe',
      rapport_html: rapportHtml,
      rapport_sections: JSON.stringify(sections),
      signatures_rapport: [{
        signataire_id: user?.id || '',
        signataire_nom: `${user?.prenom || ''} ${user?.nom || ''}`,
        date_signature: new Date().toISOString(),
        signature_url: signatureUrl,
      }],
    });
    onSigner?.(signatureUrl);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Rapport signé',
      message: 'Le rapport a été signé avec succès',
      canal: 'in_app',
    });
  };

  const handleSave = () => {
    const rapportHtml = reportContainerRef.current?.innerHTML || '';
    onSave?.(rapportHtml);
    updateSurveillance(surveillanceId, {
      rapport_html: rapportHtml,
      rapport_sections: JSON.stringify(sections),
    });
    setLastSaved(new Date());
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Rapport sauvegardé',
      message: 'Le rapport a été sauvegardé',
      canal: 'in_app',
    });
  };

  const handleExportPDF = async () => {
    try {
      addNotification({
        user_id: user?.id || '',
        type: 'info',
        title: 'Préparation du document',
        message: 'Génération du document…',
        canal: 'in_app',
      });

      const ecartsList = surveillanceEcarts();
      const today = new Date();
      const reference = `${aerodrome?.code_oaci || 'XXX'}_${today.getFullYear()}_${String(today.getMonth()+1).padStart(2,'0')}_SURV`;

      const equipeHtml = generateEquipeHtml();
      const ecartsTableHtml = generateEcartsTable();
      
      // Build results HTML for the standalone document (simpler than the UI version)
      const ecartsListDoc = surveillanceEcarts();
      const itemsDoc = checklistItems[surveillanceId] || [];
      const saCount = itemsDoc.filter(i => i.resultat === 'SA').length;
      const nsCount = itemsDoc.filter(i => i.resultat === 'NS').length;
      const nvCount = itemsDoc.filter(i => i.resultat === 'NV' || !i.resultat).length;
      const totalItems = itemsDoc.length;
      const tauxConformite = totalItems > 0 ? Math.round((saCount / totalItems) * 100) : 0;
      const byDomaine: Record<string, { sa: number; ns: number; nv: number }> = {};
      itemsDoc.forEach(item => {
        if (!byDomaine[item.domaine]) byDomaine[item.domaine] = { sa: 0, ns: 0, nv: 0 };
        if (item.resultat === 'SA') byDomaine[item.domaine].sa++;
        else if (item.resultat === 'NS') byDomaine[item.domaine].ns++;
        else if (item.resultat === 'NV' || !item.resultat) byDomaine[item.domaine].nv++;
      });
      const critCount = ecartsListDoc.filter(e => e.niveau_risque === 'critique').length;
      const hautCount = ecartsListDoc.filter(e => e.niveau_risque === 'eleve').length;
      
      let byDomaineRows = '';
      Object.entries(byDomaine).forEach(([domaine, st]) => {
        const dTaux = (st.sa + st.ns + st.nv) > 0 ? Math.round((st.sa / (st.sa + st.ns + st.nv)) * 100) : 0;
        byDomaineRows += `<tr><td>${domaine}</td><td>${st.sa}</td><td>${st.ns}</td><td>${st.nv}</td><td>${dTaux}%</td></tr>`;
      });

      const resultsHtml = `
        <h3>6.1 Score de risque</h3>
        <p>Score global : <strong>${profil?.score_global || 'N/A'}/100</strong> (tendance : ${profil?.tendance || 'stable'})</p>
        <table>
          <tr><th>Critère</th><th>Valeur</th></tr>
          <tr><td>C1 — Maturité SGS</td><td>${profil?.c1 ?? 'N/A'}/100</td></tr>
          <tr><td>C2 — Efficacité PAC</td><td>${profil?.c2 ?? 'N/A'}/100</td></tr>
          <tr><td>C3 — Conformité</td><td>${profil?.c3 ?? 'N/A'}/100</td></tr>
          <tr><td>C4 — Charge critique</td><td>${profil?.c4 ?? 'N/A'}/100</td></tr>
          <tr><td>C5 — Résilience</td><td>${profil?.c5 ?? 'N/A'}/100</td></tr>
        </table>
        <h3>6.2 Taux de conformité</h3>
        <div class="stats-grid">
          <div><div class="num">${saCount}</div><div class="label">SA</div></div>
          <div><div class="num">${nsCount}</div><div class="label">NS</div></div>
          <div><div class="num">${nvCount}</div><div class="label">NV</div></div>
        </div>
        <p>Taux de conformité réel (NV = NS) : <strong>${checklistStats.taux}%</strong></p>
        ${critCount > 0 ? `<div style="background:#fde8e8;border:1px solid #fecaca;border-radius:4pt;padding:8pt 12pt;margin:12pt 0"><strong style="color:#c53030">⚠ Attention :</strong> ${critCount} écart(s) critique(s) nécessitent une action immédiate.</div>` : ''}
        <h3>6.3 Détail par domaine</h3>
        <table>
          <thead><tr><th>Domaine</th><th>SA</th><th>NS</th><th>NV</th><th>Taux</th></tr></thead>
          <tbody>${byDomaineRows || '<tr><td colspan="5">Aucun domaine évalué</td></tr>'}</tbody>
        </table>`;

      const deroulementHtml = [
        sections.deroulement.preparation && `<h3>5.1 Préparation</h3>${sections.deroulement.preparation}`,
        sections.deroulement.reunionOuverture && `<h3>5.2 Réunion d'ouverture</h3>${sections.deroulement.reunionOuverture}`,
        sections.deroulement.verificationSite && `<h3>5.3 Vérification sur site</h3>${sections.deroulement.verificationSite}`,
        sections.deroulement.reunionCloture && `<h3>5.4 Réunion de clôture</h3>${sections.deroulement.reunionCloture}`,
      ].filter(Boolean).join('');

      const pageGardeHtml = `
        <div class="page-garde">
          <p class="devise">République du Sénégal</p>
          <p class="devise-sous">Un Peuple – Un But – Une Foi</p>
          <hr class="sep" />
          <p class="ministere">${pageGardeFields.ministere || 'MINISTERE DES TRANSPORTS TERRESTRES ET AERIENS'}</p>
          <div class="logo-placeholder"></div>
          <p class="anacim">AGENCE NATIONALE DE L'AVIATION CIVILE ET DE LA METEOROLOGIE</p>
          <p class="direction">${pageGardeFields.direction || 'DIRECTION DE LA NAVIGATION AERIENNE ET DES AERODROMES'}</p>
          <hr class="sep" />
          <h1 class="titre-rapport">${pageGardeFields.titreLigne1 || 'Rapport de surveillance'}</h1>
          <h2 class="sous-titre">${pageGardeFields.titreLigne2 || `Aéroport de ${aerodrome?.nom || ''} (${aerodrome?.code_oaci || ''})`}</h2>
          <hr class="sep" />
          <table class="infos">
            <tr><td><strong>Date de l'inspection :</strong></td><td>${pageGardeFields.dateInspection || `du ${surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A'} au ${surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A'}`}</td></tr>
            <tr><td><strong>Référentiel :</strong></td><td>${pageGardeFields.referentiel || reference}</td></tr>
          </table>
          <hr class="sep" />
          <div class="mandataire">
            <p class="mb-1"><strong>Mandataire</strong></p>
            <p>${dgNom || 'Directeur général ANACIM'}</p>
            <p>Directeur général ANACIM</p>
          </div>
        </div>
      `;

      const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport de surveillance — ${aerodrome?.nom} (${aerodrome?.code_oaci})</title>
<style>
  @page { margin: 20mm 15mm; size: A4; }
  @media print { html, body { background: white; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; }
  h1 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 20pt; font-weight: 700; margin: 24pt 0 12pt; color: #1a1a1a; }
  h2 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14pt; font-weight: 600; margin: 20pt 0 10pt; color: #1a1a1a; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
  h3 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12pt; font-weight: 600; margin: 16pt 0 8pt; color: #333; }
  p { margin: 6pt 0; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin: 12pt 0; font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 6pt 8pt; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; }
  .page-break { page-break-before: always; }
  .page-garde { text-align: center; padding-top: 60pt; }
  .page-garde .devise { font-size: 11pt; font-weight: 700; margin-bottom: 2pt; }
  .page-garde .devise-sous { font-size: 10pt; font-style: italic; margin-bottom: 16pt; color: #555; }
  .page-garde .sep { border: none; border-top: 2px solid #333; margin: 16pt auto; width: 60%; }
  .page-garde .ministere { font-size: 10pt; font-weight: 600; margin-bottom: 12pt; }
  .page-garde .logo-placeholder { height: 48pt; margin: 12pt 0; }
  .page-garde .anacim { font-size: 10pt; font-weight: 700; margin-bottom: 4pt; }
  .page-garde .direction { font-size: 10pt; margin-bottom: 12pt; }
  .page-garde .titre-rapport { font-size: 20pt; font-weight: 700; margin: 20pt 0 8pt; border: none; }
  .page-garde .sous-titre { font-size: 14pt; font-weight: 500; margin-bottom: 12pt; border: none; color: #555; }
  .page-garde .infos { width: auto; margin: 16pt auto; border: none; }
  .page-garde .infos td { border: none; padding: 4pt 8pt; text-align: left; }
  .page-garde .mandataire { margin-top: 24pt; font-size: 10pt; }
  .sommaire { margin: 24pt 0; }
  .sommaire h2 { border: none; text-align: center; font-size: 14pt; margin-bottom: 16pt; }
  .sommaire ul { list-style: none; padding: 0; }
  .sommaire li { padding: 4pt 0; font-size: 12pt; border-bottom: 1px dotted #ccc; }
  .section-content { margin: 8pt 0; }
  ul, ol { margin: 6pt 0; padding-left: 24pt; }
  li { margin: 2pt 0; }
  .badge { display: inline-block; padding: 1pt 6pt; border-radius: 2pt; font-size: 9pt; font-weight: 600; }
  .badge.danger { background: #fde8e8; color: #c53030; }
  .badge.warning { background: #fef3c7; color: #b45309; }
  .badge.primary { background: #dbeafe; color: #1d4ed8; }
  .code-oaci-badge { font-family: 'Courier New', monospace; background: #f5f5f5; padding: 1pt 4pt; border-radius: 2pt; font-size: 9pt; }
  .stats-grid { display: flex; gap: 12pt; margin: 12pt 0; }
  .stats-grid > div { flex: 1; text-align: center; padding: 8pt; border: 1px solid #ddd; border-radius: 4pt; }
  .stats-grid .num { font-size: 18pt; font-weight: 700; }
  .stats-grid .label { font-size: 9pt; color: #666; }
</style>
</head>
<body>

${pageGardeHtml}

<div class="page-break"></div>
<div class="sommaire">
  <h2>SOMMAIRE</h2>
  <ul>
    <li>1. Résumé exécutif</li>
    <li>2. Introduction et contexte</li>
    <li>3. Méthodologie</li>
    <li>4. Équipe d'inspection</li>
    <li>5. Déroulement de la surveillance</li>
    <li>6. Résultats de l'inspection</li>
    <li>7. Préoccupations de sécurité</li>
    <li>8. Non-conformités identifiées</li>
    <li>9. Recommandations</li>
    <li>10. Conclusion</li>
    <li>11. Annexes</li>
  </ul>
</div>

<div class="page-break"></div>
<h2>1. Résumé exécutif</h2>
<div class="section-content">${sections.resume || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>2. Introduction et contexte</h2>
<div class="section-content">${sections.introduction || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>3. Méthodologie</h2>
<div class="section-content">${sections.methodologie || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>4. Équipe d'inspection</h2>
<div class="section-content">${equipeHtml}</div>

<div class="page-break"></div>
<h2>5. Déroulement de la surveillance</h2>
<div class="section-content">${deroulementHtml || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>6. Résultats de l'inspection</h2>
<div class="section-content">${resultsHtml}</div>

<div class="page-break"></div>
<h2>7. Préoccupations de sécurité</h2>
<div class="section-content">${sections.preoccupations || '<p>Aucune préoccupation majeure identifiée.</p>'}</div>

<div class="page-break"></div>
<h2>8. Non-conformités identifiées</h2>
<div class="section-content">${ecartsTableHtml}</div>

<div class="page-break"></div>
<h2>9. Recommandations</h2>
<div class="section-content">${sections.recommandations || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>10. Conclusion</h2>
<div class="section-content">${sections.conclusion || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>11. Annexes</h2>
<div class="section-content">
  <p><em>Les annexes détaillées sont disponibles dans le dossier de surveillance.</em></p>
  <h3>Écarts constatés (${ecartsList.length})</h3>
  ${ecartsTableHtml}
</div>

</body>
</html>`;

      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (win) {
        win.document.title = `Rapport_${aerodrome?.code_oaci || 'rapport'}`;
      }
      URL.revokeObjectURL(url);

      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Document généré',
        message: 'Le document s\'est ouvert dans un nouvel onglet. Utilisez Ctrl+P ou Cmd+P pour l\'exporter en PDF.',
        canal: 'in_app',
      });
    } catch (err) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Erreur lors de la génération du document',
        canal: 'in_app',
      });
    }
  };

  const handlePrint = () => {
    // Generate same clean document HTML as PDF export, but auto-trigger print
    const ecartsList = surveillanceEcarts();
    const today = new Date();
    const reference = `${aerodrome?.code_oaci || 'XXX'}_${today.getFullYear()}_${String(today.getMonth()+1).padStart(2,'0')}_SURV`;

    const equipeHtml = generateEquipeHtml();
    const ecartsTableHtml = generateEcartsTable();

    const deroulementHtml = [
      sections.deroulement.preparation && `<h3>5.1 Préparation</h3>${sections.deroulement.preparation}`,
      sections.deroulement.reunionOuverture && `<h3>5.2 Réunion d'ouverture</h3>${sections.deroulement.reunionOuverture}`,
      sections.deroulement.verificationSite && `<h3>5.3 Vérification sur site</h3>${sections.deroulement.verificationSite}`,
      sections.deroulement.reunionCloture && `<h3>5.4 Réunion de clôture</h3>${sections.deroulement.reunionCloture}`,
    ].filter(Boolean).join('');

    const pageGardeHtml = `
      <div class="page-garde">
        <p class="devise">République du Sénégal</p>
        <p class="devise-sous">Un Peuple – Un But – Une Foi</p>
        <hr class="sep" />
        <p class="ministere">${pageGardeFields.ministere || 'MINISTERE DES TRANSPORTS TERRESTRES ET AERIENS'}</p>
        <div class="logo-placeholder"></div>
        <p class="anacim">AGENCE NATIONALE DE L'AVIATION CIVILE ET DE LA METEOROLOGIE</p>
        <p class="direction">${pageGardeFields.direction || 'DIRECTION DE LA NAVIGATION AERIENNE ET DES AERODROMES'}</p>
        <hr class="sep" />
        <h1 class="titre-rapport">${pageGardeFields.titreLigne1 || 'Rapport de surveillance'}</h1>
        <h2 class="sous-titre">${pageGardeFields.titreLigne2 || `Aéroport de ${aerodrome?.nom || ''} (${aerodrome?.code_oaci || ''})`}</h2>
        <hr class="sep" />
        <table class="infos">
          <tr><td><strong>Date de l'inspection :</strong></td><td>${pageGardeFields.dateInspection || `du ${surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A'} au ${surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A'}`}</td></tr>
          <tr><td><strong>Référentiel :</strong></td><td>${pageGardeFields.referentiel || reference}</td></tr>
        </table>
        <hr class="sep" />
        <div class="mandataire">
          <p class="mb-1"><strong>Mandataire</strong></p>
          <p>${dgNom || 'Directeur général ANACIM'}</p>
          <p>Directeur général ANACIM</p>
        </div>
      </div>
    `;

    const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport de surveillance — ${aerodrome?.nom} (${aerodrome?.code_oaci})</title>
<style>
  @page { margin: 20mm 15mm; size: A4; }
  @media print { html, body { background: white; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; }
  h1 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 20pt; font-weight: 700; margin: 24pt 0 12pt; color: #1a1a1a; }
  h2 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 14pt; font-weight: 600; margin: 20pt 0 10pt; color: #1a1a1a; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
  h3 { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12pt; font-weight: 600; margin: 16pt 0 8pt; color: #333; }
  p { margin: 6pt 0; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin: 12pt 0; font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 6pt 8pt; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-weight: 600; }
  .page-break { page-break-before: always; }
  .page-garde { text-align: center; padding-top: 60pt; }
  .page-garde .devise { font-size: 11pt; font-weight: 700; margin-bottom: 2pt; }
  .page-garde .devise-sous { font-size: 10pt; font-style: italic; margin-bottom: 16pt; color: #555; }
  .page-garde .sep { border: none; border-top: 2px solid #333; margin: 16pt auto; width: 60%; }
  .page-garde .ministere { font-size: 10pt; font-weight: 600; margin-bottom: 12pt; }
  .page-garde .logo-placeholder { height: 48pt; margin: 12pt 0; }
  .page-garde .anacim { font-size: 10pt; font-weight: 700; margin-bottom: 4pt; }
  .page-garde .direction { font-size: 10pt; margin-bottom: 12pt; }
  .page-garde .titre-rapport { font-size: 20pt; font-weight: 700; margin: 20pt 0 8pt; border: none; }
  .page-garde .sous-titre { font-size: 14pt; font-weight: 500; margin-bottom: 12pt; border: none; color: #555; }
  .page-garde .infos { width: auto; margin: 16pt auto; border: none; }
  .page-garde .infos td { border: none; padding: 4pt 8pt; text-align: left; }
  .sommaire { margin: 24pt 0; }
  .sommaire h2 { border: none; text-align: center; font-size: 14pt; margin-bottom: 16pt; }
  .sommaire ul { list-style: none; padding: 0; }
  .sommaire li { padding: 4pt 0; font-size: 12pt; border-bottom: 1px dotted #ccc; }
  .section-content { margin: 8pt 0; }
  ul, ol { margin: 6pt 0; padding-left: 24pt; }
  li { margin: 2pt 0; }
  .badge { display: inline-block; padding: 1pt 6pt; border-radius: 2pt; font-size: 9pt; font-weight: 600; }
  .badge.danger { background: #fde8e8; color: #c53030; }
  .badge.warning { background: #fef3c7; color: #b45309; }
  .badge.primary { background: #dbeafe; color: #1d4ed8; }
  .code-oaci-badge { font-family: 'Courier New', monospace; background: #f5f5f5; padding: 1pt 4pt; border-radius: 2pt; font-size: 9pt; }
  .stats-grid { display: flex; gap: 12pt; margin: 12pt 0; }
  .stats-grid > div { flex: 1; text-align: center; padding: 8pt; border: 1px solid #ddd; border-radius: 4pt; }
  .stats-grid .num { font-size: 18pt; font-weight: 700; }
  .stats-grid .label { font-size: 9pt; color: #666; }
</style>
</head>
<body>

${pageGardeHtml}

<div class="page-break"></div>
<div class="sommaire">
  <h2>SOMMAIRE</h2>
  <ul>
    <li>1. Résumé exécutif</li>
    <li>2. Introduction et contexte</li>
    <li>3. Méthodologie</li>
    <li>4. Équipe d'inspection</li>
    <li>5. Déroulement de la surveillance</li>
    <li>6. Résultats de l'inspection</li>
    <li>7. Préoccupations de sécurité</li>
    <li>8. Non-conformités identifiées</li>
    <li>9. Recommandations</li>
    <li>10. Conclusion</li>
    <li>11. Annexes</li>
  </ul>
</div>

<div class="page-break"></div>
<h2>1. Résumé exécutif</h2>
<div class="section-content">${sections.resume || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>2. Introduction et contexte</h2>
<div class="section-content">${sections.introduction || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>3. Méthodologie</h2>
<div class="section-content">${sections.methodologie || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>4. Équipe d'inspection</h2>
<div class="section-content">${equipeHtml}</div>

<div class="page-break"></div>
<h2>5. Déroulement de la surveillance</h2>
<div class="section-content">${deroulementHtml || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>6. Résultats de l'inspection</h2>
<div class="section-content">
  ${sections.resultsIntro || ''}
  <p>Score global : ${profil?.score_global || 'N/A'}/100 (tendance : ${profil?.tendance || 'stable'})</p>
  <p>Taux de conformité : ${checklistStats.taux}% (SA: ${checklistStats.sa}, NS: ${checklistStats.ns}, NV: ${checklistStats.nv})</p>
  ${sections.resultsAnalysis || ''}
</div>

<div class="page-break"></div>
<h2>7. Préoccupations de sécurité</h2>
<div class="section-content">${sections.preoccupations || '<p>Aucune préoccupation majeure identifiée.</p>'}</div>

<div class="page-break"></div>
<h2>8. Non-conformités identifiées</h2>
<div class="section-content">${ecartsTableHtml}</div>

<div class="page-break"></div>
<h2>9. Recommandations</h2>
<div class="section-content">${sections.recommandations || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>10. Conclusion</h2>
<div class="section-content">${sections.conclusion || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>11. Annexes</h2>
<div class="section-content">
  <p><em>Les annexes détaillées sont disponibles dans le dossier de surveillance.</em></p>
  <h3>Écarts constatés (${ecartsList.length})</h3>
  ${ecartsTableHtml}
</div>

</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.document.title = `Rapport_${aerodrome?.code_oaci || 'rapport'}`;
      // Trigger browser print after document loads
      const checkReady = setInterval(() => {
        if (win.document.readyState === 'complete') {
          clearInterval(checkReady);
          win.print();
        }
      }, 300);
    }
    URL.revokeObjectURL(url);
  };

  const handleLoadReport = () => {
    const versions = JSON.parse(localStorage.getItem(`rapport_versions_${surveillanceId}`) || '[]');
    setSavedReports(versions);
    setLoadDialogOpen(true);
  };

  const handleSelectReport = (report: { id: string; content?: string }) => {
    if (reportContainerRef.current && report.content) {
      reportContainerRef.current.innerHTML = report.content;
    }
    setLoadDialogOpen(false);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Rapport chargé',
      message: 'Le rapport a été chargé avec succès',
      canal: 'in_app',
    });
  };

  const navigateToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const execCommand = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
  };

  if (isSigned) {
    return (
      <Card variant="level" levelColor="success" className="border-success bg-success/10 text-center" data-role={userRole}>
        <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
        <h3 className="text-lg font-medium text-success-800 mb-2">Rapport signé</h3>
        <p className="text-small text-success-600 mb-4">Le rapport a été signé par les inspecteurs.</p>
        <div className="flex justify-center gap-3">
          <button onClick={handleExportPDF} className="btn btn-secondary gap-2">
            <Download className="h-4 w-4" />
            Télécharger PDF
          </button>
          <button onClick={handlePrint} className="btn btn-secondary gap-2">
            <Printer className="h-4 w-4" />
            Imprimer
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div data-role={userRole} data-module="surveillance-rapport">
      <RapportToolbar
        onExecCommand={execCommand}
        onPrint={handlePrint}
        onExportPDF={handleExportPDF}
        onSave={handleSave}
        onLoadReport={handleLoadReport}
        readOnly={readOnly}
        onSign={handleSign}
        isSigned={isSigned}
        onIACommand={(instruction) => improveSection('resume', sections.resume, 'RÉSUMÉ EXÉCUTIF', instruction)}
        isIaGenerating={isImproving}
        onDictate={toggleDictation}
        isDictating={isDictating}
        onAnalyse={handleAnalyse}
      />

      <div ref={reportContainerRef} className="rapport-a4">
        <div className="rapport-content">
        <PageGarde
          aerodrome={aerodrome}
          surveillance={surveillance}
          dgNom={dgNom}
          editable={!readOnly && !isSigned}
          onContentChange={handlePageGardeChange}
          values={pageGardeFields}
        />

        <div className="page-break-before"></div>

        <div className="rapport-section">
          <h2 className="rapport-heading">SOMMAIRE</h2>
          <div className="sommaire-list">
            {headings.map((h, idx) => (
              <div key={idx} className="sommaire-item" style={{ marginLeft: `${(h.level - 1) * 20}px` }}>
                {h.text}
              </div>
            ))}
          </div>
        </div>

        <div className="page-break-before"></div>
        <EditableSection
          title="1. RÉSUMÉ EXÉCUTIF"
          content={sections.resume}
          onContentChange={(val) => setSections(prev => ({ ...prev, resume: val }))}
          editable={!readOnly && !isSigned}
          onImprove={(instruction?) => improveSection('resume', sections.resume, 'RÉSUMÉ EXÉCUTIF', instruction)}
          isImproving={isImproving}
        />

        <div className="page-break-before"></div>
        <EditableSection
          title="2. INTRODUCTION ET CONTEXTE"
          content={sections.introduction}
          onContentChange={(val) => setSections(prev => ({ ...prev, introduction: val }))}
          editable={!readOnly && !isSigned}
          onImprove={(instruction?) => improveSection('introduction', sections.introduction, 'INTRODUCTION ET CONTEXTE', instruction)}
          isImproving={isImproving}
        />

        <div className="page-break-before"></div>
        <EditableSection
          title="3. MÉTHODOLOGIE"
          content={sections.methodologie}
          onContentChange={(val) => setSections(prev => ({ ...prev, methodologie: val }))}
          editable={!readOnly && !isSigned}
          onImprove={(instruction?) => improveSection('methodologie', sections.methodologie, 'MÉTHODOLOGIE', instruction)}
          isImproving={isImproving}
        />

        <div className="page-break-before"></div>
        <div className="rapport-section">
          <h2 className="rapport-heading">4. ÉQUIPE D'INSPECTION</h2>
          <div dangerouslySetInnerHTML={{ __html: generateEquipeHtml() }} />
        </div>

        <div className="page-break-before"></div>
        <div className="rapport-section">
          <h2 className="rapport-heading">5. DÉROULEMENT DE L'INSPECTION</h2>
          <EditableSection
            title="5.1. Préparation"
            content={sections.deroulement.preparation}
            onContentChange={(val) => setSections(prev => ({ ...prev, deroulement: { ...prev.deroulement, preparation: val } }))}
            editable={!readOnly && !isSigned}
          />
          <EditableSection
            title="5.2. Réunion d'ouverture"
            content={sections.deroulement.reunionOuverture}
            onContentChange={(val) => setSections(prev => ({ ...prev, deroulement: { ...prev.deroulement, reunionOuverture: val } }))}
            editable={!readOnly && !isSigned}
          />
          <EditableSection
            title="5.3. Phase de vérification sur site"
            content={sections.deroulement.verificationSite}
            onContentChange={(val) => setSections(prev => ({ ...prev, deroulement: { ...prev.deroulement, verificationSite: val } }))}
            editable={!readOnly && !isSigned}
          />
          <EditableSection
            title="5.4. Réunion de clôture"
            content={sections.deroulement.reunionCloture}
            onContentChange={(val) => setSections(prev => ({ ...prev, deroulement: { ...prev.deroulement, reunionCloture: val } }))}
            editable={!readOnly && !isSigned}
          />
        </div>

        <div className="page-break-before"></div>
        <div className="rapport-section">
          <h2 className="rapport-heading">6. RÉSULTATS DE L'INSPECTION</h2>
          <EditableSection
            title="6.1. Introduction"
            content={sections.resultsIntro}
            onContentChange={(val) => setSections(prev => ({ ...prev, resultsIntro: val }))}
            editable={!readOnly && !isSigned}
            onImprove={(instruction?) => improveSection('resultsIntro', sections.resultsIntro, 'Introduction des résultats', instruction)}
            isImproving={isImproving}
          />
          <div className="rapport-results" dangerouslySetInnerHTML={{ __html: generateResultsHtml() }} />
          <EditableSection
            title="6.2. Analyse approfondie"
            content={sections.resultsAnalysis}
            onContentChange={(val) => setSections(prev => ({ ...prev, resultsAnalysis: val }))}
            editable={!readOnly && !isSigned}
            onImprove={(instruction?) => improveSection('resultsAnalysis', sections.resultsAnalysis, 'Analyse des résultats', instruction)}
            isImproving={isImproving}
          />
        </div>

        <div className="page-break-before"></div>
        <EditableSection
          title="7. PRÉOCCUPATIONS DE SÉCURITÉ"
          content={sections.preoccupations}
          onContentChange={(val) => setSections(prev => ({ ...prev, preoccupations: val }))}
          editable={!readOnly && !isSigned}
          onImprove={(instruction?) => improveSection('preoccupations', sections.preoccupations, 'PRÉOCCUPATIONS DE SÉCURITÉ', instruction)}
          isImproving={isImproving}
        />

        <div className="page-break-before"></div>
        <div className="rapport-section">
          <h2 className="rapport-heading">8. NON-CONFORMITÉS IDENTIFIÉES</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Voir <strong>Annexe A-2</strong> — Écarts constatés pour le détail complet (référence, libellé, niveau de risque, indice OACI et signature de l'inspecteur).
          </p>
        </div>

        <div className="page-break-before"></div>
        <EditableSection
          title="9. RECOMMANDATIONS"
          content={sections.recommandations}
          onContentChange={(val) => setSections(prev => ({ ...prev, recommandations: val }))}
          editable={!readOnly && !isSigned}
          onImprove={(instruction?) => improveSection('recommandations', sections.recommandations, 'RECOMMANDATIONS', instruction)}
          isImproving={isImproving}
        />

        <div className="page-break-before"></div>
        <EditableSection
          title="10. CONCLUSION"
          content={sections.conclusion}
          onContentChange={(val) => setSections(prev => ({ ...prev, conclusion: val }))}
          editable={!readOnly && !isSigned}
          onImprove={(instruction?) => improveSection('conclusion', sections.conclusion, 'CONCLUSION', instruction)}
          isImproving={isImproving}
        />

        <div className="page-break-before"></div>
        <div className="rapport-section">
          <h2 className="rapport-heading">11. ANNEXES</h2>
          <RapportAnnexes
            surveillanceId={surveillanceId}
            readOnly={readOnly || isSigned}
            userRole={userRole}
          />
        </div>
        </div>
      </div>

      {!sections.resume && !isGenerating && !readOnly && !isSigned && (
        <div className="fixed bottom-4 right-4 z-50">
          <button onClick={generateFullReport} className="btn btn-primary gap-2 shadow-lg animate-pulse">
            <Sparkles className="w-4 h-4" />
            Générer le rapport avec IA
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-role-primary mx-auto mb-4" />
            <p className="text-lg font-medium">Génération du rapport en cours...</p>
            <p className="text-sm text-muted-foreground mt-1">L'IA analyse les données et rédige le rapport</p>
          </div>
        </div>
      )}

      {loadDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setLoadDialogOpen(false)}>
          <div className="bg-background rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Charger un rapport existant</h2>
              <button className="modal-close" onClick={() => setLoadDialogOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="modal-body p-5">
              {savedReports.length === 0 ? (
                <p className="text-center text-muted-foreground">Aucun rapport sauvegardé</p>
              ) : (
                <div className="space-y-2">
                  {savedReports.map(report => (
                    <div key={report.id} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-role-primary-soft cursor-pointer" onClick={() => handleSelectReport(report)}>
                      <div><p className="font-medium">Rapport du {new Date(report.date).toLocaleDateString('fr-FR')}</p><p className="text-xs text-muted-foreground">{report.preview.substring(0, 100)}...</p></div>
                      <File className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setLoadDialogOpen(false)}>Fermer</button></div>
          </div>
        </div>
      )}

      {showAnalyse && createPortal(
        <div className="modal-overlay" onClick={() => setShowAnalyse(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-purple-500 rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-purple-50 to-transparent">
                <div className="modal-title flex items-center gap-2"><Brain className="w-4 h-4 text-purple-600" /> Analyse qualité</div>
                <button className="modal-close" onClick={() => setShowAnalyse(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="modal-body p-4">
                {!analyseResult ? (
                  <div className="text-center py-6">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Analyse en cours...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center">
                      <span className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-2xl font-bold ${analyseResult.score >= 80 ? 'bg-success/20 text-success' : analyseResult.score >= 60 ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'}`}>
                        {analyseResult.score}/100
                      </span>
                      <p className="text-sm font-semibold mt-2">{analyseResult.grade}</p>
                    </div>
                    {analyseResult.forces.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-success mb-1">Points forts</p>
                        <ul className="space-y-1">{analyseResult.forces.map((f, i) => <li key={i} className="text-xs flex items-start gap-1"><CheckCircle className="w-3 h-3 text-success mt-0.5 shrink-0" />{f}</li>)}</ul>
                      </div>
                    )}
                    {analyseResult.faiblesses.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-danger mb-1">Points à améliorer</p>
                        <ul className="space-y-1">{analyseResult.faiblesses.map((f, i) => <li key={i} className="text-xs flex items-start gap-1"><AlertCircle className="w-3 h-3 text-danger mt-0.5 shrink-0" />{f}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowAnalyse(false)}>Fermer</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {signatureDialogOpen && createPortal(
        <div className="modal-overlay" onClick={() => setSignatureDialogOpen(false)}>
          <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title">Signature du rapport</div>
                <button className="modal-close" onClick={() => setSignatureDialogOpen(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="modal-body">
                <SignaturePadWithColor onSave={onSignatureSave} onCancel={() => setSignatureDialogOpen(false)} signataireNom={`${user?.prenom || ''} ${user?.nom || ''}`} />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}