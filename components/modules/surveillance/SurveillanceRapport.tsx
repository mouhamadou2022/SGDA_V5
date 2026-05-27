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
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Bold,
  Italic,
  Underline,
  Link2,
  Image as ImageIcon,
  Table,
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
  Brain,
  RotateCcw,
  RotateCw,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  Moon,
  Sun,
  FolderTree,
  Quote,
  Info,
  AlertTriangle,
  Upload,
  File,
  Mic,
  MicOff,
  TrendingUp,
  TrendingDown,
  Strikethrough,
  Palette,
  Highlighter,
  SeparatorHorizontal,
  ClipboardList,
  CheckSquare,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { RapportAnnexes } from './RapportAnnexes';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import { generatePDFFromHTMLString, downloadBlob } from '@/lib/pdfGenerator';
import {
  calculateRapportStatsByDomaine,
  formatEcartsForRapport,
  formatProfilForRapport,
  generatePageGardeHTML,
  generateTableMatiereHTML,
  generateResultatsHTML,
  generateAnnexesHTML,
  generateRapportCompletHTML,
} from '@/lib/rapportUtils';

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

// Composant: Table des matières flottante
function TableOfContents({ headings, onNavigate }: { headings: { id: string; text: string; level: number }[]; onNavigate: (id: string) => void }) {
  const [isOpen, setIsOpen] = useState(true);

  if (headings.length === 0) return null;

  return (
    <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden xl:block">
      <div className="card border-border shadow-lg p-3 max-h-96 overflow-y-auto w-60">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full text-xs font-semibold text-role-primary mb-2"
        >
          <span className="flex items-center gap-1">
            <FolderTree className="w-3 h-3" />
            Table des matières
          </span>
          <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="space-y-1">
            {headings.map((h, idx) => (
              <button
                key={idx}
                onClick={() => onNavigate(h.id)}
                className="text-left text-xs hover:text-role-primary transition-colors block truncate w-full"
                style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
              >
                {h.text || `Section ${idx + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Composant: Barre d'outils à onglets
function RapportToolbar({
  onExecCommand,
  onToggleWatermark,
  watermarkEnabled,
  onToggleFocusMode,
  focusMode,
  onZoomIn,
  onZoomOut,
  zoom,
  onToggleDarkMode,
  darkMode,
  onSave,
  onPrint,
  onExportPDF,
  onLoadReport,
  onIACommand,
  isIaGenerating,
  readOnly,
  onSign,
  isSigned,
  onDictate,
  isDictating,
}: {
  onExecCommand: (cmd: string, value?: string) => void;
  onToggleWatermark: () => void;
  watermarkEnabled: boolean;
  onToggleFocusMode: () => void;
  focusMode: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoom: number;
  onToggleDarkMode: () => void;
  darkMode: boolean;
  onSave: () => void;
  onPrint: () => void;
  onExportPDF: () => void;
  onLoadReport: () => void;
  onIACommand: (instruction: string) => void;
  isIaGenerating: boolean;
  readOnly: boolean;
  onSign: () => void;
  isSigned: boolean;
  onDictate: () => void;
  isDictating: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'accueil' | 'insertion' | 'ia'>('accueil');
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

  if (readOnly || isSigned) {
    return (
      <div className="card border-border mb-4 sticky top-0 z-[100]">
        <div className="p-2 flex flex-wrap items-center justify-between gap-2 bg-white border-b border-border">
          <div className="flex items-center gap-2">
            <button onClick={onPrint} className="btn btn-secondary btn-sm gap-1">
              <Printer className="w-3.5 h-3.5" />
              Imprimer
            </button>
            <button onClick={onExportPDF} className="btn btn-secondary btn-sm gap-1">
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            <span>👁️ Mode lecture seule</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-border mb-4 sticky top-0 z-[100]">
      <div className="tabs border-b border-border px-2 pt-1 bg-gray-50">
        <button
          onClick={() => setActiveTab('accueil')}
          className={`tab px-3 py-1.5 text-xs ${activeTab === 'accueil' ? 'active' : ''}`}
        >
          ✏️ Accueil
        </button>
        <button
          onClick={() => setActiveTab('insertion')}
          className={`tab px-3 py-1.5 text-xs ${activeTab === 'insertion' ? 'active' : ''}`}
        >
          📄 Insertion
        </button>
        <button
          onClick={() => setActiveTab('ia')}
          className={`tab px-3 py-1.5 text-xs ${activeTab === 'ia' ? 'active' : ''}`}
        >
          <Brain className="w-3 h-3 inline mr-1" />
          IA Assistant
        </button>
      </div>

      {activeTab === 'accueil' && (
        <div className="p-2 flex flex-wrap items-center gap-1 border-b border-border">
          <button onClick={onSave} className="btn btn-sm px-3 py-1 gap-1">
            <Save className="w-3.5 h-3.5" />
            Sauvegarder
          </button>
          <button onClick={onExportPDF} className="btn btn-sm px-3 py-1 gap-1">
            <Download className="w-3.5 h-3.5" />
            PDF
          </button>
          <button onClick={onPrint} className="btn btn-sm px-3 py-1 gap-1">
            <Printer className="w-3.5 h-3.5" />
            Imprimer
          </button>
          <button onClick={onLoadReport} className="btn btn-sm px-3 py-1 gap-1">
            <Upload className="w-3.5 h-3.5" />
            Charger
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('undo'); }} className="action-button" title="Annuler">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => { e.preventDefault(); document.execCommand('redo'); }} className="action-button" title="Rétablir">
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onMouseDown={(e) => execOnDown(e, 'bold')} className="action-button" title="Gras">
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'italic')} className="action-button" title="Italique">
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'underline')} className="action-button" title="Souligné">
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'strikeThrough')} className="action-button" title="Barré">
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onClick={() => { const c = prompt('Couleur hexa (ex: #ff0000) :', '#ff0000'); if (c) document.execCommand('foreColor', false, c); }} className="action-button" title="Couleur du texte">
            <Palette className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => { const c = prompt('Couleur hexa (ex: #ffff00) :', '#ffff00'); if (c) document.execCommand('hiliteColor', false, c); }} className="action-button" title="Surlignage">
            <Highlighter className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onMouseDown={(e) => execOnDown(e, 'justifyLeft')} className="action-button" title="Aligner gauche">
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'justifyCenter')} className="action-button" title="Centrer">
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'justifyRight')} className="action-button" title="Aligner droite">
            <AlignRight className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'justifyFull')} className="action-button" title="Justifier">
            <AlignJustify className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onMouseDown={(e) => execOnDown(e, 'insertUnorderedList')} className="action-button" title="Liste à puces">
            <List className="w-3.5 h-3.5" />
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'insertOrderedList')} className="action-button" title="Liste numérotée">
            <ListOrdered className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onMouseDown={(e) => execOnDown(e, 'formatBlock', '<h1>')} className="action-button text-xs px-2" title="Titre 1">
            T1
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'formatBlock', '<h2>')} className="action-button text-xs px-2" title="Titre 2">
            T2
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'formatBlock', '<h3>')} className="action-button text-xs px-2" title="Titre 3">
            T3
          </button>
          <button onMouseDown={(e) => execOnDown(e, 'formatBlock', '<p>')} className="action-button text-xs px-2" title="Normal">
            Normal
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button onClick={onSign} className="btn btn-sm px-3 py-1 btn-primary gap-1">
            <PenLine className="w-3.5 h-3.5" />
            Signer
          </button>
        </div>
      )}

      {activeTab === 'insertion' && (
        <div className="p-2 flex flex-wrap items-center gap-1 border-b border-border">
          <button
            onClick={() => {
              const rows = prompt('Nombre de lignes:', '3');
              const cols = prompt('Nombre de colonnes:', '3');
              if (rows && cols) {
                let html = '<table class="table-normal" border="1" style="border-collapse:collapse;width:100%">';
                for (let i = 0; i < parseInt(rows); i++) {
                  html += '<tr>';
                  for (let j = 0; j < parseInt(cols); j++) {
                    html += i === 0 ? '<th style="padding:8px;background:#f0f0f0">&nbsp;</th>' : '<td style="padding:8px">&nbsp;</td>';
                  }
                  html += '</tr>';
                }
                html += '</table><br>';
                onExecCommand('insertHTML', html);
              }
            }}
            className="action-button"
            title="Insérer un tableau"
          >
            <Table className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const url = prompt('URL de l\'image :');
              if (url) onExecCommand('insertImage', url);
            }}
            className="action-button"
            title="Insérer une image"
          >
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const url = prompt('URL du lien :');
              if (url) onExecCommand('createLink', url);
            }}
            className="action-button"
            title="Insérer un lien"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const html = '<div class="alert alert-info my-2 p-3 rounded border-l-4 border-l-primary"><strong>ℹ️ Information</strong><br/>Contenu de l\'encadré...</div>';
              onExecCommand('insertHTML', html);
            }}
            className="action-button"
            title="Encadré info"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const html = '<div class="alert alert-warning my-2 p-3 rounded border-l-4 border-l-warning"><strong>⚠️ Avertissement</strong><br/>Contenu de l\'avertissement...</div>';
              onExecCommand('insertHTML', html);
            }}
            className="action-button"
            title="Encadré avertissement"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              const html = '<blockquote class="border-l-4 border-role-primary pl-4 my-2 italic text-muted-foreground">Citation réglementaire...</blockquote>';
              onExecCommand('insertHTML', html);
            }}
            className="action-button"
            title="Citation"
          >
            <Quote className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-border mx-1" />

          <button
            onClick={() => onExecCommand('insertHorizontalRule')}
            className="action-button"
            title="Ligne horizontale"
          >
            <SeparatorHorizontal className="w-3.5 h-3.5" />
          </button>

          <div className="relative group inline-flex">
            <button className="action-button group" title="Snippet">
              <ClipboardList className="w-3.5 h-3.5" />
              <ChevronDown className="w-2 h-2 ml-0.5" />
            </button>
            <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-50">
              <div className="card border-border shadow-lg p-1 w-64 space-y-0.5">
                {[
                  { label: 'Constat de sécurité', html: '<p><strong>Constat :</strong> Il a été observé que...</p>' },
                  { label: 'Recommandation', html: '<p><strong>Recommandation :</strong> Il est recommandé de...</p>' },
                  { label: 'Observation', html: '<p><strong>Observation :</strong> Aucun écart n\'a été relevé concernant...</p>' },
                  { label: 'Mesure corrective', html: '<p><strong>Mesure corrective :</strong> L\'exploitant doit mettre en œuvre...</p>' },
                  { label: 'Non-conformité', html: '<p><strong>Non-conformité :</strong> Le point suivant n\'est pas conforme...</p>' },
                  { label: 'Délai de mise en œuvre', html: '<p><strong>Délai :</strong> La corrective doit être mise en œuvre sous...</p>' },
                ].map((s) => (
                  <button
                    key={s.label}
                    onClick={() => onExecCommand('insertHTML', s.html)}
                    className="block w-full text-left text-xs px-2 py-1.5 hover:bg-primary-soft rounded transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              const html = '<div class="flex items-start gap-2 my-1"><input type="checkbox" class="mt-1" /> <span>Tâche à réaliser</span></div>';
              onExecCommand('insertHTML', html);
            }}
            className="action-button"
            title="Liste de tâches"
          >
            <CheckSquare className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {activeTab === 'ia' && (
        <div className="p-3 border-b border-border bg-primary-soft/30">
          <div className="flex gap-2 mb-2">
            <button
              onClick={onDictate}
              className={`btn btn-sm px-3 py-1 gap-1 ${isDictating ? 'bg-danger text-white' : ''}`}
              title="Dictée vocale"
            >
              {isDictating ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {isDictating ? 'Arrêter' : 'Dictée'}
            </button>
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={iaInstruction}
                onChange={(e) => setIaInstruction(e.target.value)}
                placeholder="Ex: Améliore la conclusion, Ajoute des recommandations..."
                className={`flex-1 form-input text-sm ${focusClass}`}
                onKeyDown={(e) => e.key === 'Enter' && handleIA()}
              />
              <button
                onClick={handleIA}
                disabled={isIaGenerating || !iaInstruction.trim()}
                className="btn btn-sm px-3 py-1 btn-primary gap-2"
              >
                {isIaGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Améliorer
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onIACommand("Génère un résumé exécutif")} className="btn btn-sm px-3 py-1">
              Générer résumé
            </button>
            <button onClick={() => onIACommand("Ajoute des recommandations")} className="btn btn-sm px-3 py-1">
              Générer recommandations
            </button>
            <button onClick={() => onIACommand("Rédige une conclusion")} className="btn btn-sm px-3 py-1">
              Générer conclusion
            </button>
            <button onClick={() => onIACommand("Analyse les résultats et propose des actions")} className="btn btn-sm px-3 py-1">
              Analyser résultats
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            💡 L'IA peut générer, améliorer ou reformuler n'importe quelle section
          </p>
        </div>
      )}

      <div className="p-2 flex flex-wrap items-center justify-between gap-2 bg-white">
        <div className="flex items-center gap-2">
          <button onClick={onToggleWatermark} className="action-button" title="Filigrane">
            {watermarkEnabled ? '🖼️ ON' : '🖼️ OFF'}
          </button>
          <button onClick={onToggleFocusMode} className="action-button" title="Mode focus">
            {focusMode ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onToggleDarkMode} className="action-button" title="Mode nuit">
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onZoomOut} className="action-button" title="Zoom -">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs w-12 text-center">{zoom}%</span>
          <button onClick={onZoomIn} className="action-button" title="Zoom +">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          <span>✏️ Mode édition</span>
        </div>
      </div>
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
            className="form-input text-sm font-semibold text-center w-full max-w-md mx-auto"
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
            className="form-input text-sm text-center w-full max-w-md mx-auto mt-1"
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
          className="form-input text-xl font-bold text-center w-full max-w-lg mx-auto"
        />
      ) : (
        <h2 className="sous-titre">{titreLigne1}</h2>
      )}
      {editable ? (
        <input
          type="text"
          value={titreLigne2}
          onChange={handleTitreLigne2Change}
          className="form-input text-lg text-center w-full max-w-lg mx-auto mt-2"
        />
      ) : (
        <h3 className="sous-titre">{titreLigne2}</h3>
      )}

      <hr className="separator" />

      <div className="infos">
        <div className="flex items-center gap-2">
          <strong>Date de l'inspection :</strong>
          {editable ? (
            <input type="text" value={dateInspection} onChange={handleDateChange} className="form-input text-sm flex-1" />
          ) : (
            <span>{dateInspection}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <strong>Référentiel :</strong>
          {editable ? (
            <input type="text" value={referentiel} onChange={handleReferentielChange} className="form-input text-sm flex-1" />
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

// Composant: Section éditable
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
      <div className="card border-border mb-4">
        <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent py-3">
          <div className="card-title text-base">{title}</div>
        </div>
        <div className="card-content p-4">
          <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: content || '<em>Non renseigné</em>' }} />
        </div>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="card border-border mb-4">
        <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent py-3">
          <div className="card-title text-base flex items-center justify-between">
            <span>{title}</span>
            <div className="flex items-center gap-2">
              <button onClick={handleSave} className="btn btn-sm px-3 py-1 btn-success">
                <CheckCircle className="w-3 h-3 mr-1" />
                Valider
              </button>
              <button onClick={handleCancel} className="btn btn-sm px-3 py-1 btn-danger">
                <X className="w-3 h-3 mr-1" />
                Annuler
              </button>
            </div>
          </div>
        </div>
        <div className="card-content p-4">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={() => editorRef.current && setLocalContent(editorRef.current.innerHTML)}
            className="min-h-[150px] p-3 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-role-primary prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: localContent }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="card border-border mb-4">
      <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent py-3">
        <div className="card-title text-base flex items-center justify-between">
          <span>{title}</span>
          <div className="flex items-center gap-2">
            {onImprove && (
              <div className="relative">
                <button onClick={() => setShowIaInput(!showIaInput)} disabled={isImproving} className="btn btn-sm px-3 py-1 gap-1">
                  {isImproving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  IA
                </button>
                {showIaInput && (
                  <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white rounded-xl shadow-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground mb-2">Que voulez-vous que l'IA fasse ?</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={iaInput}
                        onChange={(e) => setIaInput(e.target.value)}
                        placeholder="Ex: Améliore, ajoute des stats..."
                        className="flex-1 form-input text-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && iaInput.trim()) {
                            setShowIaInput(false);
                            onImprove(iaInput.trim());
                            setIaInput('');
                          }
                        }}
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (iaInput.trim()) {
                            setShowIaInput(false);
                            onImprove(iaInput.trim());
                            setIaInput('');
                          }
                        }}
                        className="btn btn-sm px-3 py-1 btn-primary"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setShowIaInput(false);
                        onImprove('');
                        setIaInput('');
                      }}
                      className="text-xs text-muted-foreground mt-2 hover:text-foreground"
                    >
                      Génération rapide (sans instruction)
                    </button>
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setIsEditing(true)} className="btn btn-sm px-3 py-1">
              <PenLine className="w-3 h-3 mr-1" />
              Modifier
            </button>
          </div>
        </div>
      </div>
      <div className="card-content p-4">
        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: content || '<em>Non renseigné</em>' }} />
      </div>
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
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([]);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [savedReports, setSavedReports] = useState<{ id: string; date: string; preview: string; content?: string }[]>([]);
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
    const equipeList = utilisateurs.filter(u => equipeIds.includes(u.id));
    if (equipeList.length === 0) return '<p>Aucune équipe assignée</p>';
    let html = '<table class="table"><thead><tr><th>Nom</th><th>Fonction</th><th>Rôle</th></tr></thead><tbody>';
    equipeList.forEach(u => {
      html += `<tr><td>${u.prenom} ${u.nom}</td><td>${u.service || '-'}</td><td>${u.id === surveillance?.chef_id ? 'Chef d\'équipe' : 'Inspecteur'}</td></tr>`;
    });
    html += '</tbody></table>';
    return html;
  }, [surveillance, utilisateurs]);

  // Génération du tableau des écarts
  const generateEcartsTable = useCallback(() => {
    const ecartsList = surveillanceEcarts();
    if (ecartsList.length === 0) return '<p>Aucun écart constaté</p>';
    let html = '<table class="table"><thead><tr><th>Référence</th><th>Libellé</th><th>Niveau</th><th>Statut</th></tr></thead><tbody>';
    ecartsList.forEach(e => {
      html += `<tr><td class="code-oaci-badge">${e.reference}</td><td>${e.libelle}</td><td><span class="badge ${e.niveau_risque === 'critique' ? 'danger' : e.niveau_risque === 'eleve' ? 'warning' : 'primary'}">${e.niveau_risque}</span></td><td>${e.statut}</td></tr>`;
    });
    html += '</tbody></table>';
    return html;
  }, [surveillanceEcarts]);

  // Génération du HTML des résultats (graphiques)
  const generateResultsHtml = useCallback(() => {
    if (!profil) return '<p>Données de risque non disponibles</p>';
    
    const items = checklistItems[surveillanceId] || [];
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

    let html = `
      <div class="space-y-6">
        <div class="card border-border">
          <div class="card-header">
            <div class="card-title text-sm">Score global de risque</div>
          </div>
          <div class="card-content">
            <div class="flex items-center justify-between mb-2">
              <span class="text-3xl font-bold ${globalColor === 'success' ? 'text-success' : globalColor === 'warning' ? 'text-warning' : 'text-danger'}">${profil.score_global}/100</span>
              <div class="flex items-center gap-1">
                ${profil.tendance === 'hausse' ? '<TrendingUp className="w-4 h-4 text-success" />' : profil.tendance === 'baisse' ? '<TrendingDown className="w-4 h-4 text-danger" />' : ''}
                <span class="text-sm capitalize">${profil.tendance}</span>
              </div>
            </div>
            <div class="progress h-2">
              <div class="progress-bar ${globalColor === 'success' ? 'bg-success' : globalColor === 'warning' ? 'bg-warning' : 'bg-danger'}" style="width: ${profil.score_global}%"></div>
            </div>
          </div>
        </div>

        <div class="card border-border">
          <div class="card-header">
            <div class="card-title text-sm">Critères d'évaluation (C1 à C5)</div>
          </div>
          <div class="card-content">
            <div class="space-y-3">
              <ProgressBar label="C1 - Maturité SGS" value="${profil.c1}" colorClass="${profil.c1 >= 70 ? 'bg-success' : profil.c1 >= 50 ? 'bg-warning' : 'bg-danger'}" />
              <ProgressBar label="C2 - Efficacité PAC" value="${profil.c2}" colorClass="${profil.c2 >= 70 ? 'bg-success' : profil.c2 >= 50 ? 'bg-warning' : 'bg-danger'}" />
              <ProgressBar label="C3 - Conformité" value="${profil.c3}" colorClass="${profil.c3 >= 70 ? 'bg-success' : profil.c3 >= 50 ? 'bg-warning' : 'bg-danger'}" />
              <ProgressBar label="C4 - Charge critique" value="${profil.c4}" colorClass="${profil.c4 >= 70 ? 'bg-success' : profil.c4 >= 50 ? 'bg-warning' : 'bg-danger'}" />
              <ProgressBar label="C5 - Résilience" value="${profil.c5}" colorClass="${profil.c5 >= 70 ? 'bg-success' : profil.c5 >= 50 ? 'bg-warning' : 'bg-danger'}" />
            </div>
          </div>
        </div>

        <div class="card border-border">
          <div class="card-header">
            <div class="card-title text-sm">Taux de conformité</div>
          </div>
          <div class="card-content">
            <div class="grid grid-cols-3 gap-3 mb-4">
              <div class="text-center p-2 bg-success/10 rounded-lg"><div class="text-xl font-bold text-success">${checklistStats.sa}</div><div class="text-xs">SA</div></div>
              <div class="text-center p-2 bg-danger/10 rounded-lg"><div class="text-xl font-bold text-danger">${checklistStats.ns}</div><div class="text-xs">NS</div></div>
              <div class="text-center p-2 bg-warning/10 rounded-lg"><div class="text-xl font-bold text-warning">${checklistStats.nv}</div><div class="text-xs">NV</div></div>
            </div>
            <ProgressBar label="Taux de conformité réel (NV=NS)" value="${checklistStats.taux}" colorClass="${globalColor === 'success' ? 'bg-success' : globalColor === 'warning' ? 'bg-warning' : 'bg-danger'}" />
          </div>
        </div>

        <div class="card border-border">
          <div class="card-header">
            <div class="card-title text-sm">Écarts par niveau de risque</div>
          </div>
          <div class="card-content">
            <div class="space-y-3">
              <ProgressBar label="Critique" value="${ecartsList.filter(e => e.niveau_risque === 'critique').length}" colorClass="bg-danger" maxValue="${Math.max(ecartsList.length, 1)}" />
              <ProgressBar label="Élevé" value="${ecartsList.filter(e => e.niveau_risque === 'eleve').length}" colorClass="bg-warning" maxValue="${Math.max(ecartsList.length, 1)}" />
              <ProgressBar label="Moyen" value="${ecartsList.filter(e => e.niveau_risque === 'moyen').length}" colorClass="bg-primary" maxValue="${Math.max(ecartsList.length, 1)}" />
              <ProgressBar label="Faible" value="${ecartsList.filter(e => e.niveau_risque === 'faible').length}" colorClass="bg-info" maxValue="${Math.max(ecartsList.length, 1)}" />
            </div>
            ${ecartsList.filter(e => e.niveau_risque === 'critique').length > 0 ? `
              <div class="alert alert-danger mt-3">
                <AlertTriangle className="alert-icon" />
                <div class="alert-content">
                  <div class="alert-title">⚠️ Action immédiate requise</div>
                  <div class="alert-description">${ecartsList.filter(e => e.niveau_risque === 'critique').length} écart(s) critique(s) nécessitent une attention immédiate.</div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="card border-border">
          <div class="card-header">
            <div class="card-title text-sm">Détail par domaine</div>
          </div>
          <div class="card-content space-y-3">
    `;
    
    Object.entries(byDomaine).forEach(([domaine, stats]) => {
      const taux = stats.total > 0 ? Math.round((stats.sa / (stats.sa + stats.ns + stats.nv)) * 100) : 0;
      const colorClass = taux >= 70 ? 'bg-success' : taux >= 50 ? 'bg-warning' : 'bg-danger';
      html += `
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span class="font-medium">${domaine}</span>
            <span>${taux}%</span>
          </div>
          <div class="progress h-2 mb-1">
            <div class="progress-bar ${colorClass}" style="width: ${taux}%"></div>
          </div>
          <div class="flex gap-2 text-xs">
            <span class="text-success">SA:${stats.sa}</span>
            <span class="text-danger">NS:${stats.ns}</span>
            <span class="text-warning">NV:${stats.nv}</span>
          </div>
        </div>
      `;
    });
    
    html += `</div></div></div>`;
    return html;
  }, [profil, checklistItems, surveillanceId, checklistStats, surveillanceEcarts]);

  // Génération complète du rapport avec IA
  const generateFullReport = useCallback(async () => {
    setIsGenerating(true);
    try {
      const context = `
        Aérodrome: ${aerodrome?.nom} (${aerodrome?.code_oaci})
        Dates: ${surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A'} au ${surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A'}
        Type: ${surveillance?.type}
        Score risque: ${profil?.score_global || 'N/A'}/100
        Niveau risque: ${profil?.niveau || 'N/A'}
        Tendance: ${profil?.tendance || 'stable'}
        Nombre d'écarts: ${surveillanceEcarts().length}
        Taux conformité: ${checklistStats.taux}%
      `;

      const prompt = `Tu es un expert en sécurité aéronautique à l'ANACIM Sénégal. Rédige les sections suivantes d'un rapport de surveillance au format HTML (paragraphes, listes si besoin). Sois professionnel, concis et technique. N'inclus PAS le titre de la section dans le contenu.

Contexte: ${context}

1. RÉSUMÉ EXÉCUTIF (synthèse des constats clés)
2. INTRODUCTION ET CONTEXTE (objectifs et cadre)
3. MÉTHODOLOGIE (approche utilisée)
4. DÉROULEMENT - Préparation
5. DÉROULEMENT - Réunion d'ouverture
6. DÉROULEMENT - Phase de vérification sur site
7. DÉROULEMENT - Réunion de clôture
8. PRÉOCCUPATIONS DE SÉCURITÉ (points critiques à surveiller)
9. INTRODUCTION DES RÉSULTATS (présentation des résultats)
10. ANALYSE DES RÉSULTATS (interprétation des données)
11. RECOMMANDATIONS (actions correctives)
12. CONCLUSION (bilan et perspectives)`;


      const generatedContent = await generateWithIA(prompt);
      
      const newSections = { ...sections };
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
        else if (line.includes('Réunion d\'ouverture')) currentSection = 'reunionOuverture';
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
      const context = `Aérodrome: ${aerodrome?.nom} (${aerodrome?.code_oaci})
Date: ${surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A'} au ${surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A'}
Type: ${surveillance?.type}
Score risque: ${profil?.score_global || 'N/A'}/100
Tendance: ${profil?.tendance || 'stable'}
Écarts: ${surveillanceEcarts().length}
Taux conformité: ${checklistStats.taux}%`;

      const instructionPart = userInstruction
        ? `\nInstruction supplémentaire de l'utilisateur : ${userInstruction}\n`
        : '';

      const prompt = isRempli
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
  }, [user, addNotification]);

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

  // Sauvegarde auto
  useEffect(() => {
    if (readOnly || isSigned) return;
    const interval = setInterval(() => {
      setLastSaved(new Date());
      const rapportHtml = reportContainerRef.current?.innerHTML || '';
      onSave?.(rapportHtml);
      updateSurveillance(surveillanceId, { rapport_html: rapportHtml });
    }, 15000);
    return () => clearInterval(interval);
  }, [readOnly, isSigned, onSave, surveillanceId, updateSurveillance]);

  // Pré-remplir les sections au chargement
  useEffect(() => {
    if (!sections.resume && aerodrome && surveillance) {
      generateFullReport();
    }
  }, [aerodrome?.code_oaci]);

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
    updateSurveillance(surveillanceId, {
      statut: 'rapport_signe',
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
        title: 'Export PDF',
        message: 'Génération du PDF en cours...',
        canal: 'in_app',
      });

      const ecartsList = surveillanceEcarts();
      const presences = (getFichesBySurveillance?.(surveillanceId) || []).map(p => ({
        id: p.id,
        prenom_nom: p.prenom_nom,
        structure: p.structure,
        fonction: p.fonction,
        signature_url: p.signature_url,
        signature_date: p.signature_date,
      }));
      const items = checklistItems[surveillanceId] || [];
      const stats = {
        total_items: checklistStats.total,
        sa: checklistStats.sa,
        ns: checklistStats.ns,
        nv: checklistStats.nv,
        na: checklistStats.na,
        taux_conformite_classique: items.length > 0 ? Math.round((checklistStats.sa / items.length) * 100) : 0,
        taux_conformite_reel: checklistStats.taux,
        progression: items.length > 0 ? Math.round(((checklistStats.sa + checklistStats.ns + checklistStats.na) / items.length) * 100) : 0,
      };
      const statsByDomaine = calculateRapportStatsByDomaine(items);
      const ecartsFormatted = formatEcartsForRapport(ecartsList);
      const profilFormatted = formatProfilForRapport(profil);

      const chefEquipe = utilisateurs.find(u => u.id === surveillance?.chef_id);
      const today = new Date();
const reference = `${aerodrome?.code_oaci || 'XXX'}_${today.getFullYear()}_${String(today.getMonth()+1).padStart(2,'0')}_SURV`;

      const deroulementHtml = [
        sections.deroulement.preparation && `<h3>Préparation</h3>${sections.deroulement.preparation}`,
        sections.deroulement.reunionOuverture && `<h3>Réunion d'ouverture</h3>${sections.deroulement.reunionOuverture}`,
        sections.deroulement.verificationSite && `<h3>Vérification sur site</h3>${sections.deroulement.verificationSite}`,
        sections.deroulement.reunionCloture && `<h3>Réunion de clôture</h3>${sections.deroulement.reunionCloture}`,
      ].filter(Boolean).join('');

      const sectionsList = [
        { id: 'resume', titre: 'Résumé exécutif' },
        { id: 'introduction', titre: 'Introduction et contexte' },
        { id: 'equipe', titre: "Équipe d'inspection" },
        { id: 'methodologie', titre: 'Méthodologie' },
        { id: 'deroulement', titre: 'Déroulement de la surveillance' },
        { id: 'resultats', titre: "Résultats de l'inspection" },
        { id: 'preoccupations', titre: 'Préoccupations de sécurité' },
        { id: 'recommandations', titre: 'Recommandations' },
        { id: 'conclusion', titre: 'Conclusion' },
        { id: 'annexes', titre: 'Annexes' },
      ];

      const rapportSections: Record<string, string> = {
        page_garde: generatePageGardeHTML(
          aerodrome?.nom || '',
          aerodrome?.code_oaci || '',
          surveillance?.date_debut || '',
          surveillance?.date_fin || '',
          surveillance?.type || '',
          reference,
          chefEquipe ? `${chefEquipe.prenom} ${chefEquipe.nom}` : undefined
        ),
        table_matieres: generateTableMatiereHTML(sectionsList),
        resume: `<div><h2>Résumé exécutif</h2>${sections.resume || '<p>À compléter...</p>'}</div>`,
        introduction: `<div><h2>Introduction et contexte</h2>${sections.introduction || '<p>À compléter...</p>'}</div>`,
        equipe: `<div><h2>Équipe d\'inspection</h2>${sections.equipe || generateEquipeHtml()}</div>`,
        methodologie: `<div><h2>Méthodologie</h2>${sections.methodologie || '<p>À compléter...</p>'}</div>`,
        deroulement: `<div><h2>Déroulement de la surveillance</h2>${deroulementHtml || '<p>À compléter...</p>'}</div>`,
        resultats: generateResultatsHTML(stats, statsByDomaine, { profil: profilFormatted, checklistItems: items }),
        preoccupations: `<div><h2>Préoccupations de sécurité</h2>${sections.preoccupations || '<p>Aucune préoccupation majeure identifiée.</p>'}</div>`,
        recommandations: `<div><h2>Recommandations</h2>${sections.recommandations || '<p>À compléter...</p>'}</div>`,
        conclusion: `<div><h2>Conclusion</h2>${sections.conclusion || '<p>À compléter...</p>'}</div>`,
        annexes: generateAnnexesHTML(presences, ecartsFormatted, profilFormatted, items),
      };

      const fullHTML = generateRapportCompletHTML(rapportSections, {
        includeCSS: true,
        pageSize: 'A4',
      });

      const filename = `rapport_${aerodrome?.code_oaci || 'aerodrome'}_${reference.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      const result = await generatePDFFromHTMLString(fullHTML, {
        title: `Rapport — ${aerodrome?.nom} (${aerodrome?.code_oaci})`,
        author: user?.nom ? `${user.prenom || ''} ${user.nom}` : 'ANACIM',
        subject: `Rapport de surveillance — ${aerodrome?.nom}`,
      });

      if (result.success && result.blob) {
        downloadBlob(result.blob, filename);
        addNotification({
          user_id: user?.id || '',
          type: 'success',
          title: 'PDF généré',
          message: `Le PDF a été téléchargé : ${filename}`,
          canal: 'in_app',
        });
      } else {
        throw new Error(result.error || 'Échec de la génération PDF');
      }
    } catch (err) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur PDF',
        message: err instanceof Error ? err.message : 'Erreur lors de la génération du PDF',
        canal: 'in_app',
      });
    }
  };

  const handlePrint = () => window.print();

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

  const execCommand = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
  };

  const navigateToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (isSigned) {
    return (
      <div className="card border-success bg-success/10" data-role={userRole}>
        <div className="card-content p-6 text-center">
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
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${darkMode ? 'dark' : ''}`} data-role={userRole} data-module="surveillance-rapport">

      {watermarkEnabled && (
        <div className="fixed inset-0 pointer-events-none z-0 opacity-5 select-none">
          <div className="text-9xl font-black rotate-45 mt-32 text-center">ANACIM</div>
          <div className="text-6xl font-black -rotate-45 mt-64 text-center">RÉPUBLIQUE DU SÉNÉGAL</div>
        </div>
      )}

      <RapportToolbar
        onExecCommand={execCommand}
        onToggleWatermark={() => setWatermarkEnabled(!watermarkEnabled)}
        watermarkEnabled={watermarkEnabled}
        onToggleFocusMode={() => setFocusMode(!focusMode)}
        focusMode={focusMode}
        onZoomIn={() => setZoom(prev => Math.min(150, prev + 10))}
        onZoomOut={() => setZoom(prev => Math.max(70, prev - 10))}
        zoom={zoom}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        darkMode={darkMode}
        onSave={handleSave}
        onPrint={handlePrint}
        onExportPDF={handleExportPDF}
        onLoadReport={handleLoadReport}
        onIACommand={(instruction) => improveSection('resume', sections.resume, 'RÉSUMÉ EXÉCUTIF', instruction)}
        isIaGenerating={isImproving}
        readOnly={readOnly}
        onSign={handleSign}
        isSigned={isSigned}
        onDictate={toggleDictation}
        isDictating={isDictating}
      />

      <TableOfContents headings={headings} onNavigate={navigateToHeading} />

      <div className="rapport-a4">
        <div
          ref={reportContainerRef}
          className="rapport-content space-y-6 bg-white"
          style={{ zoom: `${zoom}%` }}
        >
          <PageGarde
            aerodrome={aerodrome}
            surveillance={surveillance}
            dgNom={dgNom}
            editable={!readOnly && !isSigned}
            onContentChange={handlePageGardeChange}
            values={pageGardeFields}
          />

          <div className="page-break-before"></div>

          <div className="sommaire mb-8">
            <h1 className="text-lg font-bold mb-4">SOMMAIRE</h1>
            <div className="space-y-1">
              {headings.map((h, idx) => (
                <div key={idx} style={{ marginLeft: `${(h.level - 1) * 20}px` }}>
                  <a href={`#${h.id}`} className="text-sm text-role-primary hover:underline">{h.text}</a>
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
          <div className="card border-border mb-4">
            <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent py-3">
              <div className="card-title text-base">4. ÉQUIPE D'INSPECTION</div>
            </div>
            <div className="card-content p-4">
              <div dangerouslySetInnerHTML={{ __html: generateEquipeHtml() }} />
            </div>
          </div>

          <div className="page-break-before"></div>
          <div className="card border-border mb-4">
            <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent py-3">
              <div className="card-title text-base">5. DÉROULEMENT DE L'INSPECTION</div>
            </div>
            <div className="card-content p-4 space-y-4">
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
          </div>

          <div className="page-break-before"></div>
          <div className="card border-border mb-4">
            <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent py-3">
              <div className="card-title text-base">6. RÉSULTATS DE L'INSPECTION</div>
            </div>
            <div className="card-content p-4 space-y-4">
              <EditableSection
                title="6.1. Introduction"
                content={sections.resultsIntro}
                onContentChange={(val) => setSections(prev => ({ ...prev, resultsIntro: val }))}
                editable={!readOnly && !isSigned}
                onImprove={(instruction?) => improveSection('resultsIntro', sections.resultsIntro, 'Introduction des résultats', instruction)}
                isImproving={isImproving}
              />
              <div dangerouslySetInnerHTML={{ __html: generateResultsHtml() }} />
              <EditableSection
                title="6.2. Analyse approfondie"
                content={sections.resultsAnalysis}
                onContentChange={(val) => setSections(prev => ({ ...prev, resultsAnalysis: val }))}
                editable={!readOnly && !isSigned}
                onImprove={(instruction?) => improveSection('resultsAnalysis', sections.resultsAnalysis, 'Analyse des résultats', instruction)}
                isImproving={isImproving}
              />
            </div>
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
          <div className="card border-border mb-4">
            <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent py-3">
              <div className="card-title text-base">8. NON-CONFORMITÉS IDENTIFIÉES</div>
            </div>
            <div className="card-content p-4">
              <div dangerouslySetInnerHTML={{ __html: generateEcartsTable() }} />
            </div>
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
          <div className="card border-border mb-4">
            <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent py-3">
              <div className="card-title text-base">11. ANNEXES</div>
            </div>
            <div className="card-content p-4">
              <RapportAnnexes
              surveillanceId={surveillanceId}
              readOnly={readOnly || isSigned}
              userRole={userRole}
            />
          </div>
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