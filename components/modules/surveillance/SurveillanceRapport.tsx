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
  AlignJustify,
  Palette,
  Highlighter,
  RemoveFormatting,
  Type,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  RotateCcw,
  RotateCw,
  Brain,
  History,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAppStore } from '@/lib/store';
import { toast } from '@/lib/toast';
import { RapportAnnexes } from './RapportAnnexes';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import { generateEquipeTableHtml, generateEcartsTableHtml } from '@/lib/rapportHtml';
import { getSurveillanceEquipeIds, getSurveillanceChefId } from '@/lib/surveillanceTeam';
import { getSgsMaturiteLabel } from '@/lib/utils';
import { PAOE_LABELS, type PAOELevel } from '@/types/checklist';
import { reportAgent } from '@/lib/ia/agents/reportAgent';
import RapportRibbon from './RapportRibbon';
import { ChatIALateralRapport } from './ChatIALateralRapport';


// Classes CSS réutilisées
const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

// Service IA pour générer le rapport
async function generateWithIA(prompt: string): Promise<string> {
  const response = await fetch('/api/ia/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  let data: { content?: string; error?: string };
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok || !data.content) {
    throw new Error(data.error || `AERORISQ n'a pas pu générer le contenu (HTTP ${response.status}).`);
  }
  return data.content;
}

// Harmonisation typographique du HTML généré par AERORISQ :
// impose le hiérarchie Titre 14pt / Sous-titre 13pt / Contenu 12pt partout,
// en purgeant les styles inline et en ramenant h1/h2 vers h3.
function harmoniserHtml(html: string): string {
  return (html || '')
    .replace(/<h[12][^>]*>/gi, '<h3>')
    .replace(/<\/h[12]>/gi, '</h3>')
    .replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
    .replace(/\sstyle\s*=\s*'[^']*'/gi, '')
    .replace(/<([a-z0-9]+)[^>]*class\s*=\s*"[^"]*"[^>]*>/gi, (m, tag) => `<${tag}>`)
    .trim();
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
  const [isEditing, setIsEditing] = useState(false);

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
      {editable && (
        <div className="flex items-center justify-end mb-4">
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="btn btn-sm px-2 py-0.5 btn-primary gap-1 text-xs">
              <PenLine className="w-3 h-3 mr-1" /> Modifier
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setIsEditing(false)} className="btn btn-sm px-2 py-0.5 btn-success text-xs">
                <CheckCircle className="w-3 h-3 mr-1" /> Valider
              </button>
              <button onClick={() => { setIsEditing(false); }} className="btn btn-sm px-2 py-0.5 btn-danger text-xs">
                <X className="w-3 h-3 mr-1" /> Annuler
              </button>
            </div>
          )}
        </div>
      )}
      <h1 className="text-2xl font-bold">République du Sénégal</h1>
      <div className="flex justify-center"><img src="/drapeau_SN.png" className="h-16 my-2" alt="Drapeau Sénégal" onError={(e) => (e.currentTarget.style.display = 'none')} /></div>
      <p className="devise">Un Peuple – Un But – Une Foi</p>

      <hr className="separator" />

      <div>
        {isEditing ? (
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
        {isEditing ? (
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

      {isEditing ? (
        <input
          type="text"
          value={titreLigne1}
          onChange={handleTitreLigne1Change}
          className="form-input text-center w-full max-w-lg mx-auto hg-titre"
        />
      ) : (
        <h2 className="sous-titre">{titreLigne1}</h2>
      )}
      {isEditing ? (
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
          {isEditing ? (
            <input type="text" value={dateInspection} onChange={handleDateChange} className="form-input flex-1 hg-label" />
          ) : (
            <span>{dateInspection}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <strong>Référentiel :</strong>
          {isEditing ? (
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
  directEdit,
}: {
  title: string;
  content: string;
  onContentChange: (content: string) => void;
  editable: boolean;
  directEdit?: boolean;
}) {
  const editorRef = useRef<HTMLDivElement>(null);

  if (!editable) {
    return (
      <div className="rapport-section">
        <h2 className="rapport-heading">{title}</h2>
        <div className="rapport-text" dangerouslySetInnerHTML={{ __html: content || '<em>Non renseigné</em>' }} />
      </div>
    );
  }

  // Mode directEdit : édition inline permanente, pas de boutons Modifier/AERORISQ
  if (directEdit) {
    return (
      <div className="rapport-section">
        <h2 className="rapport-heading">{title}</h2>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => editorRef.current && onContentChange(editorRef.current.innerHTML)}
          className="rapport-text-editable min-h-[80px]"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    );
  }

  return (
    <div className="rapport-section">
      <h2 className="rapport-heading">{title}</h2>
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
  rapportType = 'redige',
}: {
  surveillanceId: string;
  onSave?: (contenu: string) => void;
  onSigner?: (signatureUrl: string) => void;
  readOnly?: boolean;
  userRole?: string;
  rapportType?: 'redige' | 'charge';
}) {
  const user = useAppStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const surveillances = useAppStore(s => s.surveillances);
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const plannings = useAppStore(s => s.plannings);
  const inspecteurs = useAppStore(s => s.inspecteurs);
  const ecarts = useAppStore(s => s.ecarts);
  const getEcartsEffectifs = useAppStore(s => s.getEcartsEffectifsSurveillance);
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
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Layout & Design state for the ribbon
  const [pageMargins, setPageMargins] = useState('25.4mm');
  const [pageOrientation, setPageOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [pageColumns, setPageColumns] = useState(1);
  const [currentTheme, setCurrentTheme] = useState('ANACIM Bleu');

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

  // Récupération des écarts de la surveillance (brouillons pendant la rédaction)
  const surveillanceEcarts = useCallback(() => {
    return getEcartsEffectifs(surveillanceId);
  }, [getEcartsEffectifs, surveillanceId]);

  // Statistiques checklist
  const checklistStats = useMemo(() => {
    const items = checklistItems[surveillanceId] || [];
    const total = items.length;
    const sa = items.filter(i => i.resultat === 'SA').length;
    const ns = items.filter(i => i.resultat === 'NS').length;
    const nv = items.filter(i => i.resultat === 'NV' || !i.resultat).length;
    const na = items.filter(i => i.resultat === 'NA').length;
    const taux = (sa + ns) > 0 ? Math.round((sa / (sa + ns)) * 100) : 0;
    return { total, sa, ns, nv, na, taux };
  }, [checklistItems, surveillanceId]);

  // Génération du tableau de l'équipe
  const generateEquipeHtml = useCallback(() => {
    const equipeIds = getSurveillanceEquipeIds(surveillance, plannings);
    const membres = utilisateurs.filter(u => equipeIds.includes(u.id));
    const chefId = getSurveillanceChefId(surveillance, plannings);
    return generateEquipeTableHtml(membres, chefId);
  }, [surveillance, utilisateurs, plannings]);

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
    const domainesConformes = Object.entries(byDomaine).filter(([, s]) => ((s.sa + s.ns) > 0 ? Math.round((s.sa / (s.sa + s.ns)) * 100) : 0) >= 90).length;

    const sgsEval = surveillance?.sgs_evaluation_prepa as any;
    const sgsScore = sgsEval?.scoreGlobal;
    const sgsNiveau = sgsScore !== undefined ? getSgsMaturiteLabel(sgsScore) : null;

    // ── Résultats PAOE (SGS) : répartition des composantes par niveau ──
    const sgsComposantes: { label?: string; score?: number; niveauGlobal?: PAOELevel; elements?: { niveauGlobal?: PAOELevel }[] }[] =
      Array.isArray(sgsEval?.composantes) ? sgsEval.composantes : [];
    const paoeBreakdown: { niveau: PAOELevel; count: number }[] = (['absent', 'present', 'approprie', 'operationnel', 'efficace'] as PAOELevel[])
      .map((niveau) => ({ niveau, count: sgsComposantes.filter(c => c.niveauGlobal === niveau).length }))
      .filter(b => b.count > 0);
    const paoeBadgeColor: Record<PAOELevel, string> = {
      absent: 'badge danger',
      present: 'badge eleve',
      approprie: 'badge moyen',
      operationnel: 'badge primary',
      efficace: 'badge success',
    };
    const paoeScoreColor = (s: number) => s >= 80 ? 'success' : s >= 60 ? 'primary' : s >= 40 ? 'warning' : 'danger';
    const sgsColor = sgsScore !== undefined ? paoeScoreColor(sgsScore) : 'muted';

    let html = `
      <div class="space-y-5">

        <div class="card border-border">
          <div class="card-header">
            <div class="card-title text-sm">${hasSGS ? 'Maturité du SGS (PAOE — OACI Annexe 19)' : 'Taux de conformité global'}</div>
          </div>
          <div class="card-content">
            ${hasSGS ? `
            <div class="flex items-center justify-between mb-2">
              <span>
                <span class="text-3xl font-bold text-${sgsColor}">${sgsScore !== undefined ? sgsScore + '%' : 'N/A'}</span>
                <span class="text-sm text-muted-foreground ml-2">sur ${sgsComposantes.length} composante(s)</span>
              </span>
              ${sgsNiveau ? `<span class="badge ${sgsColor} text-sm px-3 py-1">${sgsNiveau}</span>` : '<span class="badge muted text-sm px-3 py-1">Non évalué</span>'}
            </div>
            <div class="progress h-2">
              <div class="progress-bar bg-${sgsColor}" style="width: ${sgsScore ?? 0}%"></div>
            </div>
            <div class="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
              ${paoeBreakdown.map(b => `<span>${PAOE_LABELS[b.niveau]} : <strong>${b.count}</strong></span>`).join('')}
            </div>
            ` : `
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
            `}
          </div>
        </div>

        <div class="card border-border">
          <div class="card-header">
            <div class="card-title text-sm">${hasSGS ? 'Résultats PAOE par composante' : 'Résultats par domaine'}</div>
          </div>
          <div class="card-content space-y-3">
    `;

    if (hasSGS) {
      if (sgsComposantes.length > 0) {
        sgsComposantes.forEach((comp) => {
          const cScore = comp.score ?? 0;
          const cColor = paoeScoreColor(cScore);
          const cNiveau = comp.niveauGlobal || 'absent';
          html += `
            <div class="p-3 rounded-lg border border-border">
              <div class="flex items-center justify-between mb-2">
                <span class="font-semibold text-sm">${comp.label || 'Composante'}</span>
                <span class="badge ${paoeBadgeColor[cNiveau]}">${PAOE_LABELS[cNiveau]}</span>
              </div>
              <div class="flex items-center justify-between mb-1 text-xs text-muted-foreground">
                <span>Score : <strong class="text-foreground">${cScore}%</strong></span>
                <span>${comp.elements?.length || 0} élément(s)</span>
              </div>
              <div class="progress h-1.5">
                <div class="progress-bar bg-${cColor}" style="width: ${cScore}%"></div>
              </div>
            </div>
          `;
        });
      } else if (sgsScore !== undefined) {
        html += `
          <div class="p-3 rounded-lg border border-${sgsColor}/30 bg-${sgsColor}/5">
            <div class="flex items-center justify-between mb-1">
              <span class="font-semibold text-sm">Système de Gestion de la Sécurité (SGS)</span>
              ${sgsNiveau ? `<span class="badge ${sgsColor}">${sgsNiveau}</span>` : '<span class="badge muted">Non évalué</span>'}
            </div>
            <div class="flex items-center gap-2 mt-2">
              <span class="text-2xl font-bold text-${sgsColor}">${sgsScore}%</span>
              <div class="flex-1 progress h-1.5">
                <div class="progress-bar bg-${sgsColor}" style="width: ${sgsScore}%"></div>
              </div>
            </div>
          </div>
        `;
      }
    } else {
      Object.entries(byDomaine).forEach(([domaine, stats]) => {
        const taux = (stats.sa + stats.ns) > 0 ? Math.round((stats.sa / (stats.sa + stats.ns)) * 100) : 0;
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
            ${(() => { const c = ecartsList.filter(e => e.niveau_risque === 'eleve').length; return c > 0 ? `<div class="text-center p-2 bg-orange-500/10 rounded"><div class="text-lg font-bold text-orange-500">${c}</div><div class="text-xs text-muted-foreground">Élevé</div></div>` : ''; })()}
            ${(() => { const c = ecartsList.filter(e => e.niveau_risque === 'moyen').length; return c > 0 ? `<div class="text-center p-2 bg-yellow-500/10 rounded"><div class="text-lg font-bold text-yellow-500">${c}</div><div class="text-xs text-muted-foreground">Moyen</div></div>` : ''; })()}
            ${(() => { const c = ecartsList.filter(e => e.niveau_risque === 'faible' || e.niveau_risque === 'tres_faible').length; return c > 0 ? `<div class="text-center p-2 bg-gray-100 rounded"><div class="text-lg font-bold text-gray-600">${c}</div><div class="text-xs text-muted-foreground">Faible</div></div>` : ''; })()}
          </div>
          <p class="text-xs text-muted-foreground mt-2">Se référer à l'<strong>Annexe A-2</strong> pour le détail complet.</p>
        </div>
      `;
    }

    html += `</div></div></div>`;
    return html;
  }, [profil, checklistItems, surveillanceId, checklistStats, surveillanceEcarts, surveillance, aerodrome]);

  // ─── Contexte par type de surveillance ──────────────────────────────
  const RAPPORT_TYPE_META: Record<string, {
    label: string; focus: string; iaFocus: string; sections: string[];
  }> = {
    certification: {
      label: 'Certification initiale / renouvellement',
      focus: 'conformité au référentiel de certification, PAC issus de la certification',
      iaFocus: 'Accentue la vérification de conformité au référentiel de certification, l\'analyse des PAC issus du processus de certification, et les prérequis règlementaires.',
      sections: ['resume', 'introduction', 'information_generale', 'portee', 'methodologie', 'referentiel', 'deroulement', 'resultats', 'rencontre', 'recommandations', 'annexes'],
    },
    homologation: {
      label: 'Homologation',
      focus: 'conformité aux normes d\'homologation, infrastructure et équipements',
      iaFocus: 'Concentre-toi sur la conformité aux normes d\'homologation OACI, l\'état des infrastructures, équipements de navigation aérienne et aides visuelles.',
      sections: ['resume', 'introduction', 'information_generale', 'portee', 'methodologie', 'referentiel', 'deroulement', 'resultats', 'rencontre', 'recommandations', 'annexes'],
    },
    periodique: {
      label: 'Surveillance périodique',
      focus: 'suivi de la conformité continue, PAC antérieurs, évolution du profil de risque',
      iaFocus: 'Accentue le suivi de la conformité continue, l\'évolution des PAC depuis la dernière inspection, et les tendances du profil de risque C1-C5.',
      sections: ['resume', 'introduction', 'information_generale', 'portee', 'methodologie', 'referentiel', 'deroulement', 'resultats', 'rencontre', 'recommandations', 'annexes'],
    },
    maintien: {
      label: 'Maintien de la surveillance continue',
      focus: 'maintien du niveau de sécurité, PAC en cours, tendances',
      iaFocus: 'Analyse le maintien du niveau de sécurité, l\'état d\'avancement des PAC en cours, et les tendances du profil de risque. Mets en évidence les régressions ou améliorations.',
      sections: ['resume', 'introduction', 'information_generale', 'portee', 'methodologie', 'referentiel', 'deroulement', 'resultats', 'rencontre', 'recommandations', 'annexes'],
    },
    inopine: {
      label: 'Inspection inopinée',
      focus: 'constats immédiats, non-conformités critiques, sécurité immédiate',
      iaFocus: 'Priorise les constats de sécurité immédiats, les non-conformités critiques/élevées. Sois direct et factuel. Limite l\'analyse historique — concentre-toi sur l\'instant présent.',
      sections: ['resume', 'introduction', 'portee', 'deroulement', 'resultats', 'recommandations'],
    },
    suivi_ecarts: {
      label: 'Suivi des écarts',
      focus: 'vérification de la levée des écarts, PAC soumis, clôture',
      iaFocus: 'Analyse en détail l\'état de chaque écart, la qualité des PAC soumis, et les délais de régularisation. Vérifie l\'efficacité des actions correctives.',
      sections: ['resume', 'introduction', 'deroulement', 'resultats', 'recommandations'],
    },
    mise_oeuvre_pac: {
      label: 'Mise en œuvre des PAC',
      focus: 'avancement des plans d\'actions correctives, preuves de réalisation',
      iaFocus: 'Évalue l\'avancement de chaque PAC, la qualité des preuves fournies, et les délais de réalisation. Propose des ajustements si nécessaire.',
      sections: ['resume', 'introduction', 'deroulement', 'resultats', 'recommandations'],
    },
  };

  const getTypeMeta = (type?: string) =>
    RAPPORT_TYPE_META[type || ''] || RAPPORT_TYPE_META.periodique;

  // ─── PAC existants de l'aérodrome (toutes surveillances) ────────────
  const aerodromeEcartsAll = useMemo(() => {
    if (!aerodrome) return [];
    return ecarts.filter(e => e.aerodrome_id === aerodrome.id);
  }, [ecarts, aerodrome]);

  const aerodromePacStats = useMemo(() => {
    const all = aerodromeEcartsAll;
    const total = all.length;
    const closed = all.filter(e => e.statut === 'cloture').length;
    const open = all.filter(e => e.statut !== 'cloture' && e.statut !== 'preuves_evaluees').length;
    const inReview = all.filter(e => e.statut === 'pac_accepte' || e.statut === 'preuves_soumises' || e.statut === 'preuves_evaluees').length;
    const overdue = all.filter(e => e.statut === 'en_retard').length;
    return { total, closed, open, inReview, overdue, taux: total > 0 ? Math.round((closed / total) * 100) : 0 };
  }, [aerodromeEcartsAll]);

  // ─── Génération complète du rapport avec IA ─────────────────────────
  const generateFullReport = useCallback(async () => {
    setIsGenerating(true);
    try {
      const ecartsList = surveillanceEcarts();
      const typeMeta = getTypeMeta(surveillance?.type);
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
        .map(([d, s]) => `${d}: ${s.sa} SA / ${s.ns} NS / ${s.nv} NV (${s.total} pts, taux ${(s.sa + s.ns) > 0 ? Math.round((s.sa / (s.sa + s.ns)) * 100) : 0}%)`)
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

      // PAC existants de l'aérodrome
      const pacAeroHistorique = aerodromeEcartsAll.length > 0
        ? `\nPAC ANTÉRIEURS DE L'AÉRODROME (toutes inspections):
- Total PAC: ${aerodromePacStats.total}
- Clôturés: ${aerodromePacStats.closed}
- En cours: ${aerodromePacStats.open}
- En évaluation: ${aerodromePacStats.inReview}
- En retard: ${aerodromePacStats.overdue}
- Taux de clôture global: ${aerodromePacStats.taux}%`
        : '\nAucun PAC antérieur pour cet aérodrome.';

      const typeFocus = typeMeta.iaFocus;
      const typeLabel = typeMeta.label;

      const context = `
TYPE DE SURVEILLANCE: ${typeLabel} (${surveillance?.type})
INSTRUCTIONS SPÉCIFIQUES: ${typeFocus}

AÉRODROME: ${aerodrome?.nom} (${aerodrome?.code_oaci})
PÉRIODE: ${surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A'} → ${surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A'}
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

ÉCARTS CONSTATÉS (cette surveillance):
- Total: ${ecartsList.length}
- Clôturés: ${closedCount}
- En retard: ${overdueCount}
- Avec PAC: ${pacCount}

DÉTAIL DES ÉCARTS:
${ecartsStr || 'Aucun écart'}
${pacAeroHistorique}

SGS:
${sgsEval ? `Score PAOE: ${sgsEval.scoreGlobal}% (${getSgsMaturiteLabel(sgsEval.scoreGlobal)}) — ${sgsEval.composantes?.length || 0} composante(s)` : 'Non évalué / Non inclus'}
`;

      const activeSections = typeMeta.sections;
      const sectionKeys: Record<string, string> = {
        resume: '"resume": "RÉSUMÉ EXÉCUTIF — Synthèse des constats clés"',
        introduction: '"introduction": "INTRODUCTION ET CONTEXTE — Objectifs, cadre réglementaire, périmètre"',
        methodologie: '"methodologie": "MÉTHODOLOGIE — Approche utilisée (revue documentaire, inspection sur site, entretiens, checklist)"',
        deroulement: [
          '"preparation": "DÉROULEMENT - Préparation"',
          '"reunionOuverture": "DÉROULEMENT - Réunion d\'ouverture"',
          '"verificationSite": "DÉROULEMENT - Phase de vérification sur site"',
          '"reunionCloture": "DÉROULEMENT - Réunion de clôture"',
        ].join(',\n  '),
        resultats: [
          '"preoccupations": "PRÉOCCUPATIONS DE SÉCURITÉ"',
          '"resultsIntro": "INTRODUCTION DES RÉSULTATS"',
          '"resultsAnalysis": "ANALYSE DES RÉSULTATS — Interprétation détaillée (par domaine, écarts, PAC, SGS/PAOE, profil C1-C5 en langage clair, tendance, priorités)"',
        ].join(',\n  '),
        recommandations: '"recommandations": "RECOMMANDATIONS — Actions correctives prioritaires/secondaires avec échéances"',
      };
      const jsonSchema = [
        ...(activeSections.includes('resume') ? [sectionKeys.resume] : []),
        ...(activeSections.includes('introduction') ? [sectionKeys.introduction] : []),
        ...(activeSections.includes('methodologie') ? [sectionKeys.methodologie] : []),
        ...(activeSections.includes('deroulement') ? [sectionKeys.deroulement] : []),
        ...(activeSections.includes('resultats') ? [sectionKeys.resultats] : []),
        ...(activeSections.includes('recommandations') ? [sectionKeys.recommandations] : []),
        '"conclusion": "CONCLUSION — Bilan global, conformité, perspectives"',
      ].join(',\n  ');

      const prompt = `Tu es un expert en sécurité aéronautique à l'ANACIM Sénégal. Tu rédiges un rapport de ${typeMeta.label} technique et professionnel destiné à un exploitant d'aérodrome.

Contexte:
${context}

Réponds UNIQUEMENT avec un objet JSON valide. Génère UNIQUEMENT les sections suivantes (adaptées au type de surveillance "${typeMeta.label}") :
{
  ${jsonSchema}
}

Ne mets aucun texte avant ou après le JSON. Utilise du HTML simple et SANS styles inline : paragraphes <p> pour le corps, listes <ul>/<li> si besoin, et <h3> uniquement pour les sous-titres. N'utilise JAMAIS les balises h1, h2 ou des attributs style="font-size:..." — la mise en forme (titre 14pt, sous-titre 13pt, corps 12pt) est appliquée automatiquement par le rapport.`;


      const generatedContent = await generateWithIA(prompt);
      let parsed: Record<string, string> = {};
      try {
        const jsonMatch = generatedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch { /* fallback parsing */ }

      const newSections = { ...sections };
      if (Object.keys(parsed).length > 0) {
        if (parsed.resume) newSections.resume = harmoniserHtml(parsed.resume);
        if (parsed.introduction) newSections.introduction = harmoniserHtml(parsed.introduction);
        if (parsed.methodologie) newSections.methodologie = harmoniserHtml(parsed.methodologie);
        if (parsed.preoccupations) newSections.preoccupations = harmoniserHtml(parsed.preoccupations);
        if (parsed.recommandations) newSections.recommandations = harmoniserHtml(parsed.recommandations);
        if (parsed.conclusion) newSections.conclusion = harmoniserHtml(parsed.conclusion);
        if (parsed.resultsIntro) newSections.resultsIntro = harmoniserHtml(parsed.resultsIntro);
        if (parsed.resultsAnalysis) newSections.resultsAnalysis = harmoniserHtml(parsed.resultsAnalysis);
        if (parsed.preparation) newSections.deroulement.preparation = harmoniserHtml(parsed.preparation);
        if (parsed.reunionOuverture) newSections.deroulement.reunionOuverture = harmoniserHtml(parsed.reunionOuverture);
        if (parsed.verificationSite) newSections.deroulement.verificationSite = harmoniserHtml(parsed.verificationSite);
        if (parsed.reunionCloture) newSections.deroulement.reunionCloture = harmoniserHtml(parsed.reunionCloture);
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
        message: 'Le rapport a été généré automatiquement par AERORISQ',
        canal: 'in_app',
      });
    } catch (error) {
      console.error('Erreur génération IA:', error);
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: error instanceof Error && error.message
          ? error.message
          : 'Impossible de générer le rapport. Veuillez réessayer.',
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

SGS: ${sgsEval ? `Score PAOE: ${sgsEval.scoreGlobal}% (${getSgsMaturiteLabel(sgsEval.scoreGlobal)})` : 'Non évalué'}
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
        ? `Tu es un expert en sécurité aéronautique à l'ANACIM Sénégal. Rédige l'analyse détaillée des résultats au format HTML simple et SANS styles inline (paragraphes <p>, listes <ul>/<li> si besoin, <h3> uniquement pour les sous-titres, jamais h1/h2 ni font-size inline — la mise en forme 14/13/12pt est appliquée par le rapport). Interprète les données suivantes : analyse par domaine, distribution des écarts par niveau, analyse des PAC (taux de clôture, retards), interprétation du SGS/PAOE si applicable, tendance du risque, points prioritaires. Sois pédagogique sans jargon excessif.${instructionPart}
Contexte: ${context}

N'inclus PAS le titre de la section dans le contenu.`
        : isRempli
          ? `Améliore et reformule le texte suivant de manière plus professionnelle, sans changer le sens. Le texte fait partie d'un rapport de surveillance aéronautique ANACIM.${instructionPart}
Contexte: ${context}

Titre de la section: ${sectionTitle}

Texte à améliorer:
${currentContent}

Renvoie uniquement le texte amélioré, en HTML simple et SANS styles inline (paragraphes <p>, listes <ul>/<li>, <h3> pour les sous-titres ; jamais h1/h2 ni font-size inline — la mise en forme 14/13/12pt est appliquée par le rapport), sans le titre de la section.`
          : `Tu es un expert en sécurité aéronautique à l'ANACIM Sénégal. Rédige la section "${sectionTitle}" d'un rapport de surveillance au format HTML simple et SANS styles inline (paragraphes <p>, listes <ul>/<li> si besoin, <h3> uniquement pour les sous-titres, jamais h1/h2 ni font-size inline — la mise en forme 14/13/12pt est appliquée par le rapport). Sois professionnel, concis et technique.${instructionPart}
Contexte: ${context}

N'inclus PAS le titre de la section dans le contenu.`;
      const improved = await generateWithIA(prompt);

      if (!improved || improved.trim() === '') {
        throw new Error('AERORISQ a renvoyé un contenu vide pour cette section.');
      }

      if (sectionKey === 'preparation' || sectionKey === 'reunionOuverture'
        || sectionKey === 'verificationSite' || sectionKey === 'reunionCloture') {
        setSections(prev => ({ ...prev, deroulement: { ...prev.deroulement, [sectionKey]: harmoniserHtml(improved) } }));
      } else if (sectionKey === 'resultsIntro') {
        setSections(prev => ({ ...prev, resultsIntro: harmoniserHtml(improved) }));
      } else if (sectionKey === 'resultsAnalysis') {
        setSections(prev => ({ ...prev, resultsAnalysis: harmoniserHtml(improved) }));
      } else {
        setSections(prev => ({ ...prev, [sectionKey]: harmoniserHtml(improved) }));
      }
      
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Section améliorée',
        message: `La section "${sectionTitle}" a été améliorée par AERORISQ`,
        canal: 'in_app',
      });
      toast('success', `La section "${sectionTitle}" a été mise à jour par AERORISQ.`, 'Section améliorée', 5000);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : "Impossible d'améliorer la section";
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message,
        canal: 'in_app',
      });
      toast('error', message, 'Erreur AERORISQ', 7000);
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
  // + snapshot version si changé
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  useEffect(() => {
    if (readOnly || isSigned || !surveillance) return;
    const timer = setTimeout(() => {
      const prev = surveillance.rapport_sections;
      const next = JSON.stringify(sectionsRef.current);
      if (prev === next) return;
      updateSurveillance(surveillanceId, { rapport_sections: next });
      // Snapshot version (toutes les 30s max)
      if (sectionsRef.current.resume || sectionsRef.current.introduction) {
        useAppStore.getState().addRapportVersion?.(
          surveillanceId, sectionsRef.current,
          user?.id || '', user?.nom || user?.email || 'Inspecteur'
        );
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [sections, readOnly, isSigned, surveillanceId, updateSurveillance, surveillance]);

  // Générer le rapport IA uniquement si :
  // - le rapport n'est pas déjà signé/transmis
  // - aucune section sauvegardée n'a été trouvée
  // - les données aérodrome/surveillance sont chargées
  // - le type n'est PAS 'charge' (rapport chargé = pas de génration auto)
  useEffect(() => {
    if (readOnly || isSigned || rapportType === 'charge') return;
    if (!sections.resume && aerodrome && surveillance && !surveillance.rapport_sections) {
      generateFullReport();
    }
  }, [aerodrome?.code_oaci, readOnly, isSigned, rapportType]);

  // ─── Helper: convertit le HTML du rapport en texte clair pour DOCX ─────
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  // Export Word (.docx) via Docxtemplater + template ANACIM enrichi
  const handleExportDOCX = async () => {
    try {
      const { exportRapportDOCX } = await import('@/lib/services/rapportDocumentService');
      const ecartsArray = surveillanceEcarts();
      const itemsDoc = checklistItems[surveillanceId] || [];
      const equipeMembres = utilisateurs.filter(u => getSurveillanceEquipeIds(surveillance, plannings).includes(u.id));
      const equipeNoms = equipeMembres.map(u => `${u.prenom} ${u.nom}`).join(', ');
      const saCount = itemsDoc.filter(i => i.resultat === 'SA').length;
      const nsCount = itemsDoc.filter(i => i.resultat === 'NS').length;
      const nvCount = itemsDoc.filter(i => i.resultat === 'NV' || !i.resultat).length;
      const naCount = itemsDoc.filter(i => i.resultat === 'NA').length;
      const totalItems = itemsDoc.length;

      // Carte des labels de risque
      const risqueLabels: Record<string, string> = {
        critique: 'Critique', eleve: 'Élevé', moyen: 'Moyen', faible: 'Faible', tres_faible: 'Très faible',
      };

      // Synthèse profil de risque
      const profilAnalyse = profil
        ? `Score global: ${profil.score_global}/100 (${profil.niveau}). `
          + `C1 Maturité SGS: ${profil.c1}/100. C2 Efficacité PAC: ${profil.c2}/100. `
          + `C3 Conformité: ${profil.c3}/100. C4 Charge critique: ${profil.c4}/100. `
          + `C5 Résilience: ${profil.c5}/100. `
          + `Tendance: ${profil.tendance === 'hausse' ? 'en amélioration' : profil.tendance === 'baisse' ? 'en dégradation' : 'stable'}.`
          + (profil.prediction_3m ? ` Prédiction à 3 mois: ${profil.prediction_3m}/100.` : '')
          + (profil.prediction_6m ? ` Prédiction à 6 mois: ${profil.prediction_6m}/100.` : '')
        : 'Données de risque non disponibles.';

      // Équipe pour boucle
      const equipeMembresData = equipeMembres.map(u => ({
        nom_membre: `${u.prenom || ''} ${u.nom || ''}`,
        fonction_membre: (Array.isArray(u.specialites) ? u.specialites.join(', ') : u.specialites) || u.service || 'Inspecteur',
        role_membre: (u.role === 'chef_equipe' || u.id === surveillance?.chef_id) ? "Chef d'équipe" : 'Inspecteur',
      }));

      // Écarts critiques pour tableau
      const ecartsCritiquesData = ecartsArray
        .filter(e => e.niveau_risque === 'critique' || e.niveau_risque === 'eleve')
        .map((e, i) => ({
          num_ecart: i + 1,
          domaine_ecart: e.domaine || '—',
          constat_ecart: e.libelle || '—',
          criticite_ecart: risqueLabels[e.niveau_risque] || e.niveau_risque,
          delai_ecart: e.delai_pac ? new Date(e.delai_pac).toLocaleDateString('fr-FR') : '—',
        }));

      // Évolution PAC depuis historique du profil + données aérodrome
      const evolutionPacData: { date_evol: string; ouverts_evol: number; fermes_evol: number; taux_evol: string }[] = [];
      if (profil?.historical_scores?.length) {
        profil.historical_scores.forEach(h => {
          if (h.date) {
            const score = h.score || 0;
            evolutionPacData.push({
              date_evol: new Date(h.date).toLocaleDateString('fr-FR'),
              ouverts_evol: Math.round((100 - score) / 2),
              fermes_evol: Math.round(score / 2),
              taux_evol: `${score}%`,
            });
          }
        });
      }
      // Ajouter synthèse globale de l'aérodrome (tous PAC confondus)
      if (aerodromePacStats.total > 0) {
        evolutionPacData.push({
          date_evol: `${new Date().toLocaleDateString('fr-FR')} (global aérodrome)`,
          ouverts_evol: aerodromePacStats.open + aerodromePacStats.inReview,
          fermes_evol: aerodromePacStats.closed,
          taux_evol: `${aerodromePacStats.taux}%`,
        });
      }

      // PAC détail depuis items de checklist (groupés par domaine)
      const pacDetailsData = itemsDoc.slice(0, 60).map(item => ({
        ref_pac: item.reference_reglementaire || item.numero || '—',
        etat_initial_pac: item.resultat === 'SA' ? 'Réalisé' : 'Ouvert',
        etat_precedent_pac: '—',
        etat_actuel_pac: item.resultat === 'SA' ? 'Fermé (100%)' : item.resultat === 'NS' ? 'En cours (0%)' : 'Non vérifié',
        progression_pac: item.resultat === 'SA' ? '100%' : item.resultat === 'NS' ? '0%' : '—',
        statut_pac: item.resultat === 'SA' ? 'Fermé' : item.resultat === 'NS' ? 'Ouvert' : 'Non évalué',
      }));

      // PAC SC détail (écarts de cette surveillance)
      const pacScDetailsData = ecartsArray.slice(0, 34).map(e => {
        const pct = e.pac?.actions?.length ? Math.min(Math.round(e.pac.actions.filter(a => a.livrables?.length > 0).length / e.pac.actions.length * 100), 100) : 0;
        return {
          ref_pac_sc: e.reference || '—',
          taux_pac_sc: `${pct}%`,
          etat_pac_sc: e.statut === 'cloture' ? 'Fermé' : e.statut === 'pac_accepte' || e.statut === 'preuves_evaluees' ? 'En évaluation' : 'Ouvert',
        };
      });

      await exportRapportDOCX({
        // Métadonnées
        aerodrome_nom: aerodrome?.nom || '',
        aerodrome_code: aerodrome?.code_oaci || '',
        aerodrome_type: aerodrome?.type === 'international' ? 'International' : aerodrome?.type === 'national' ? 'National' : '—',
        aerodrome_categorie_sslia: aerodrome?.categorie_sslia || '—',
        aerodrome_region: aerodrome?.region || '—',
        aerodrome_exploitant: aerodrome?.exploitant_nom || '—',
        date_debut: surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A',
        date_fin: surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A',
        type_surveillance: surveillance?.type?.replace(/_/g, ' ') || '',
        reference: `${aerodrome?.code_oaci || 'XXX'}_${new Date().getFullYear()}_SURV`,
        chef_equipe: `${user?.prenom || ''} ${user?.nom || ''}`,
        equipe_inspecteurs: equipeNoms,
        niveau_risque: profil ? `${profil.score_global}/100 — ${profil.niveau.toUpperCase()}` : 'Non évalué',
        date_signature: new Date().toLocaleDateString('fr-FR'),

        // TOC
        toc: 'Résumé exécutif, Introduction et vue d\'ensemble, Information générale, Portée, Méthodologie, Référentiel, Déroulement, Résultats, Rencontre exploitant, Recommandations, Annexes',

        // Sections
        resume_executif: stripHtml(sections.resume) || 'À compléter...',
        contexte: stripHtml(sections.introduction) || 'À compléter...',
        objectifs: surveillance?.type === 'inopine'
          ? 'Inspection inopinée visant à vérifier le maintien du niveau de sécurité sans préparation préalable de l\'exploitant.'
          : surveillance?.type === 'certification'
          ? 'Vérifier la conformité aux exigences de certification, valider la mise en œuvre du SGS, et évaluer la capacité de l\'exploitant à assurer la sécurité des opérations.'
          : surveillance?.type === 'homologation'
          ? 'Évaluer la conformité aux normes d\'homologation, l\'état des infrastructures et des équipements de navigation aérienne.'
          : surveillance?.type === 'maintien' || surveillance?.type === 'periodique'
          ? 'Assurer le suivi de la conformité continue, vérifier la mise en œuvre des PAC issus des inspections précédentes, et évaluer l\'évolution du profil de risque.'
          : 'Évaluer la conformité de l\'exploitant aux exigences réglementaires applicables, vérifier la mise en œuvre des PAC, et identifier les éventuelles non-conformités.',
        information_generale: `${aerodrome?.nom || 'Aéroport'} (${aerodrome?.code_oaci || 'N/A'}) est un aéroport de type ${aerodrome?.type || '—'} situé dans la région ${aerodrome?.region || '—'}. Catégorie SSLIA: ${aerodrome?.categorie_sslia || '—'}. Exploitant: ${aerodrome?.exploitant_nom || '—'}.`,
        portee_inspection: (surveillance?.portee || []).join(', ') || 'Non spécifiée',
        methodologie: stripHtml(sections.methodologie) || 'L\'inspection a été réalisée sur la base d\'entretiens, d\'examens documentaires et de vérifications sur site conformément aux procédures ANACIM.',
        referentiel_evaluation: 'Règlement RAS 14, OACI Annexe 19 (SGS), Manuel SGS ANACIM, Procédures DNA, Normes et recommandations OACI.',
        deroulement_preparation: stripHtml(sections.deroulement.preparation) || 'La mission a été préparée conformément au plan de surveillance approuvé.',
        deroulement_reunion_ouverture: stripHtml(sections.deroulement.reunionOuverture) || 'La réunion d\'ouverture s\'est tenue en présence de l\'équipe d\'inspection et des responsables de l\'exploitant.',
        deroulement_visite_site: stripHtml(sections.deroulement.verificationSite) || 'Les vérifications sur site ont porté sur l\'ensemble des domaines de la portée.',
        deroulement_reunion_cloture: stripHtml(sections.deroulement.reunionCloture) || 'La réunion de clôture a permis de présenter les constats préliminaires.',
        resultats_inspection: stripHtml(sections.resultsIntro) || 'Voir sections ci-dessous.',
        profil_risque_analyse: profilAnalyse,
        nas_analyse: `Le niveau acceptable de sécurité (NAS) est évalué à travers les indicateurs C1-C5. ${profil ? `Score C1 (Maturité SGS): ${profil.c1}/100. ` : ''}La tendance globale est ${profil?.tendance === 'hausse' ? 'positive' : profil?.tendance === 'baisse' ? 'préoccupante' : 'stable'}.`,
        rencontre_exploitant: stripHtml(sections.preoccupations) || 'Aucune rencontre spécifique.',
        recommandations_conclusions: stripHtml(sections.recommandations + ' ' + sections.conclusion) || 'À compléter...',
        annexe_fiche_constatations: `Annexe au rapport de surveillance ${aerodrome?.code_oaci || ''} — ${new Date().toLocaleDateString('fr-FR')}. Fiche récapitulative des constatations, non-conformités et références réglementaires.`,

        // Équipe
        equipe_membres: equipeMembresData,

        // PAC certification initiale
        pac_examines: totalItems,
        pac_en_cours: nsCount,
        pac_realises: saCount,
        pac_non_realises: nvCount,

        // Évolution
        evolution_pac: evolutionPacData,

        // PAC détail
        nb_ecarts: ecartsArray.length,
        pac_initialisation_details: pacDetailsData,

        // PAC SC
        pac_sc_examines: ecartsArray.length,
        pac_sc_en_cours: ecartsArray.filter(e => e.statut !== 'cloture').length,
        pac_sc_realises: ecartsArray.filter(e => e.statut === 'cloture').length,
        pac_sc_non_realises: ecartsArray.filter(e => e.statut === 'ouvert' || e.statut === 'pac_attendu').length,

        // Écarts critiques
        ecarts_critiques: ecartsCritiquesData,

        // PAC SC détail
        pac_sc_details: pacScDetailsData,
      });

      addNotification({ user_id: user?.id || '', type: 'success', title: 'Document Word généré', message: 'Le rapport a été exporté au format Word (modèle ANACIM enrichi).', canal: 'in_app' });
    } catch (err) {
      addNotification({ user_id: user?.id || '', type: 'danger', title: 'Erreur', message: err instanceof Error ? err.message : 'Erreur lors de la génération du document Word', canal: 'in_app' });
    }
  };

  // ─── Helper: génération du HTML complet du rapport ──────────────────────────
  const rapportHtmlContent = (
    pgFields: Record<string, string>,
    aero: any,
    surv: any,
    dgName: string,
    ref: string,
    equipeTable: string,
    ecartsTable: string,
    deroule: string,
    ecartsArray: any[],
  ) => {
    const ecartsList = ecartsArray;
    const itemsDoc = checklistItems[surveillanceId] || [];
    const saCount = itemsDoc.filter(i => i.resultat === 'SA').length;
    const nsCount = itemsDoc.filter(i => i.resultat === 'NS').length;
    const nvCount = itemsDoc.filter(i => i.resultat === 'NV' || !i.resultat).length;
    const denom = saCount + nsCount;
    const tauxConformite = denom > 0 ? Math.round((saCount / denom) * 100) : 0;
    const byDomaine: Record<string, { sa: number; ns: number; nv: number }> = {};
    itemsDoc.forEach(item => {
      if (!byDomaine[item.domaine]) byDomaine[item.domaine] = { sa: 0, ns: 0, nv: 0 };
      if (item.resultat === 'SA') byDomaine[item.domaine].sa++;
      else if (item.resultat === 'NS') byDomaine[item.domaine].ns++;
      else if (item.resultat === 'NV' || !item.resultat) byDomaine[item.domaine].nv++;
    });
    const critCount = ecartsList.filter(e => e.niveau_risque === 'critique').length;

    let byDomaineRows = '';
    Object.entries(byDomaine).forEach(([domaine, st]) => {
      const dTaux = (st.sa + st.ns) > 0 ? Math.round((st.sa / (st.sa + st.ns)) * 100) : 0;
      byDomaineRows += `<tr><td>${domaine}</td><td>${st.sa}</td><td>${st.ns}</td><td>${st.nv}</td><td>${dTaux}%</td></tr>`;
    });

    const pageGardeHtml = `
      <div class="page-garde">
        <p class="devise">République du Sénégal</p>
        <p class="devise-sous">Un Peuple – Un But – Une Foi</p>
        <hr class="sep" />
        <p class="ministere">${pgFields.ministere || 'MINISTERE DES TRANSPORTS TERRESTRES ET AERIENS'}</p>
        <div class="logo-placeholder"></div>
        <p class="anacim">AGENCE NATIONALE DE L'AVIATION CIVILE ET DE LA METEOROLOGIE</p>
        <p class="direction">${pgFields.direction || 'DIRECTION DE LA NAVIGATION AERIENNE ET DES AERODROMES'}</p>
        <hr class="sep" />
        <h1 class="titre-rapport">${pgFields.titreLigne1 || 'Rapport de surveillance'}</h1>
        <h2 class="sous-titre">${pgFields.titreLigne2 || `Aéroport de ${aero?.nom || ''} (${aero?.code_oaci || ''})`}</h2>
        <hr class="sep" />
        <table class="infos">
          <tr><td><strong>Date de l'inspection :</strong></td><td>${pgFields.dateInspection || `du ${surv?.date_debut ? new Date(surv.date_debut).toLocaleDateString('fr-FR') : 'N/A'} au ${surv?.date_fin ? new Date(surv.date_fin).toLocaleDateString('fr-FR') : 'N/A'}`}</td></tr>
          <tr><td><strong>Référentiel :</strong></td><td>${pgFields.referentiel || ref}</td></tr>
        </table>
        <hr class="sep" />
        <div class="mandataire">
          <p class="mb-1"><strong>Mandataire</strong></p>
          <p>${dgName || 'Directeur général ANACIM'}</p>
          <p>Directeur général ANACIM</p>
        </div>
      </div>
    `;

    const resultsHtml = `
      <h3>6.1 Score de risque</h3>
      <p>Score global : <strong>${profil?.score_global || 'N/A'}/100</strong> (tendance : ${profil?.tendance || 'stable'})</p>
      <table>
        <tr><th>Critère</th><th>Valeur</th></tr>
        <tr><td>C1 — Maturité SGS</td><td>${profil?.c1 ?? 'N/A'}/100${profil?.c1 != null ? ` (${getSgsMaturiteLabel(profil.c1)})` : ''}</td></tr>
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
      <p>Taux de conformité : <strong>${tauxConformite}%</strong></p>
      ${critCount > 0 ? `<div style="background:#fde8e8;border:1px solid #fecaca;border-radius:4pt;padding:8pt 12pt;margin:12pt 0"><strong style="color:#c53030">⚠ Attention :</strong> ${critCount} écart(s) critique(s) nécessitent une action immédiate.</div>` : ''}
      <h3>6.3 Détail par domaine</h3>
      <table>
        <thead><tr><th>Domaine</th><th>SA</th><th>NS</th><th>NV</th><th>Taux</th></tr></thead>
        <tbody>${byDomaineRows || '<tr><td colspan="5">Aucun domaine évalué</td></tr>'}</tbody>
      </table>`;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport de surveillance — ${aero?.nom} (${aero?.code_oaci})</title>
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
<div class="section-content">${equipeTable}</div>

<div class="page-break"></div>
<h2>5. Déroulement de la surveillance</h2>
<div class="section-content">${deroule || '<p>À compléter...</p>'}</div>

<div class="page-break"></div>
<h2>6. Résultats de l'inspection</h2>
<div class="section-content">${resultsHtml}</div>

<div class="page-break"></div>
<h2>7. Préoccupations de sécurité</h2>
<div class="section-content">${sections.preoccupations || '<p>Aucune préoccupation majeure identifiée.</p>'}</div>

<div class="page-break"></div>
<h2>8. Non-conformités identifiées</h2>
<div class="section-content">${ecartsTable}</div>

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
  ${ecartsTable}
</div>

</body>
</html>`;
  };

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
        title: 'Préparation du PDF',
        message: 'Génération du document PDF…',
        canal: 'in_app',
      });

      const today = new Date();
      const reference = `${aerodrome?.code_oaci || 'XXX'}_${today.getFullYear()}_${String(today.getMonth()+1).padStart(2,'0')}_SURV`;

      const { batirRapportSurveillancePdf } = await import('@/lib/services/rapportSurveillancePdf');
      const blob = await batirRapportSurveillancePdf({
        surveillance,
        aerodrome,
        profil,
        items: checklistItems[surveillanceId] || [],
        ecarts: surveillanceEcarts(),
        utilisateurs,
        sections,
        pageGardeFields,
        dgNom,
        reference,
      });
      const { downloadBlob } = await import('@/lib/pdfGenerator');
      downloadBlob(blob, `Rapport_${aerodrome?.code_oaci || 'rapport'}.pdf`);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'PDF généré',
        message: 'Le rapport a été téléchargé au format PDF.',
        canal: 'in_app',
      });
    } catch (err) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: err instanceof Error ? err.message : 'Erreur lors de la génération du PDF',
        canal: 'in_app',
      });
    }
  };

  const handlePrint = () => {
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

    const fullHtml = rapportHtmlContent(pageGardeFields, aerodrome, surveillance, dgNom, reference, equipeHtml, ecartsTableHtml, deroulementHtml, surveillanceEcarts());

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.document.title = `Rapport_${aerodrome?.code_oaci || 'rapport'}`;
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
    // Source de vérité unique : surveillances.rapport_versions (store),
    // et non localStorage qui n'est jamais alimenté.
    interface RapportVersion {
      version: number;
      modifie_le: string;
      modifie_par?: string;
      modifie_par_nom?: string;
      sections_modifiees?: string[];
      diff?: Record<string, unknown>;
      sections?: Record<string, unknown>;
    }
    let versions: RapportVersion[] = [];
    try { versions = JSON.parse(surveillance?.rapport_versions || '[]'); } catch { versions = []; }
    setSavedReports(versions.map((v, i) => ({
      id: v.version != null ? String(v.version) : String(i),
      date: v.modifie_le || new Date().toISOString(),
      preview: v.sections_modifiees?.length
        ? `Version ${v.version} — ${v.sections_modifiees.join(', ')}`
        : `Version ${v.version}`,
      content: v.sections ? JSON.stringify(v.sections) : undefined,
    })));
    setLoadDialogOpen(true);
  };

  const handleSelectReport = (report: { id: string; content?: string }) => {
    if (report.content) {
      try {
        const restored = JSON.parse(report.content) as Record<string, unknown>;
        setSections(prev => ({ ...prev, ...restored }));
      } catch {
        addNotification({
          user_id: user?.id || '',
          type: 'danger',
          title: 'Rapport illisible',
          message: 'La version sélectionnée ne peut pas être restaurée',
          canal: 'in_app',
        });
      }
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

  // Helper: concatenate all section text for word count / stats
  const sectionsValues = () => {
    const d = sections.deroulement;
    return [sections.resume, sections.introduction, sections.methodologie, sections.equipe,
      d.preparation, d.reunionOuverture, d.verificationSite, d.reunionCloture,
      sections.preoccupations, sections.recommandations, sections.conclusion,
      sections.resultsIntro, sections.resultsAnalysis,
    ].join(' ');
  };

  // ─── Handler IA global (router vers la bonne section) ──────────────
  const handleIACommand = useCallback((instruction: string) => {
    const lower = instruction.toLowerCase();
    if (lower.includes('résumé') || lower.includes('resume') || lower.includes('executif'))
      improveSection('resume', sections.resume, 'RÉSUMÉ EXÉCUTIF', instruction);
    else if (lower.includes('recommandation'))
      improveSection('recommandations', sections.recommandations, 'RECOMMANDATIONS', instruction);
    else if (lower.includes('conclusion'))
      improveSection('conclusion', sections.conclusion, 'CONCLUSION', instruction);
    else if (lower.includes('analyse') || lower.includes('resultat') || lower.includes('résultat'))
      improveSection('resultsAnalysis', sections.resultsAnalysis, 'ANALYSE DES RÉSULTATS', instruction);
    else if (lower.includes('introduction') || lower.includes('contexte'))
      improveSection('introduction', sections.introduction, 'INTRODUCTION ET CONTEXTE', instruction);
    else if (lower.includes('méthodo') || lower.includes('methodo'))
      improveSection('methodologie', sections.methodologie, 'MÉTHODOLOGIE', instruction);
    else
      improveSection('resume', sections.resume, 'RÉSUMÉ EXÉCUTIF', instruction);
  }, [sections, improveSection]);

  // ─── Handler pour les mises à jour sections via le chat IA lateral ──
  const handleChatSectionsUpdate = useCallback((updated: Partial<typeof sections>) => {
    setSections(prev => {
      const next = { ...prev };
      for (const [key, value] of Object.entries(updated)) {
        if (key === 'deroulement' && typeof value === 'object' && value !== null) {
          next.deroulement = { ...prev.deroulement, ...(value as any) };
        } else {
          (next as any)[key] = typeof value === 'string' ? harmoniserHtml(value as string) : value;
        }
      }
      return next;
    });
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Rapport modifié',
      message: 'Les sections ont été mises à jour par AERORISQ',
      canal: 'in_app',
    });
    toast('success', 'Les sections modifiées ont été appliquées.', 'Rapport mis à jour', 5000);
  }, [addNotification, user]);

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
          <button onClick={handleExportDOCX} className="btn btn-secondary gap-2">
            <FileText className="h-4 w-4" />
            Word
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
    <div data-role={userRole} data-module="surveillance-rapport" className="flex flex-col h-[calc(100vh-124px)]">
      <RapportRibbon
        onExecCommand={execCommand}
        onPrint={handlePrint}
        onExportPDF={handleExportPDF}
        onExportDOCX={handleExportDOCX}
        onRegenerate={generateFullReport}
        onSave={handleSave}
        readOnly={readOnly}
        onSign={handleSign}
        isSigned={isSigned}
        onIACommand={handleIACommand}
        isIaGenerating={isImproving}
        onDictate={toggleDictation}
        isDictating={isDictating}
        onAnalyse={handleAnalyse}
        onShowVersionHistory={() => setShowVersionHistory(true)}
        documentStats={{
          words: sectionsValues().split(/\s+/).filter(Boolean).length,
          chars: sectionsValues().length,
          paragraphs: sectionsValues().split(/<\/p>/i).length - 1,
          readingTime: `${Math.max(1, Math.round(sectionsValues().split(/\s+/).filter(Boolean).length / 200))} min`,
        }}
        layoutProps={{
          margins: pageMargins,
          orientation: pageOrientation,
          onSetMargins: setPageMargins,
          onSetOrientation: setPageOrientation,
          onSetColumns: setPageColumns,
        }}
        designProps={{
          currentTheme,
          onApplyTheme: (t) => setCurrentTheme(t.name),
        }}
        onToggleChat={() => setChatOpen(!chatOpen)}
        chatOpen={chatOpen}
      />

      <div className="flex flex-1 overflow-hidden">
        {chatOpen && (
          <ChatIALateralRapport
            sections={sections}
            rapportType={rapportType}
            onSectionsUpdate={handleChatSectionsUpdate}
            onClose={() => setChatOpen(false)}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          <div ref={reportContainerRef} className="rapport-a4" style={{
            padding: pageMargins,
            columns: pageColumns > 1 ? pageColumns : undefined,
          }}>
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
          directEdit={!readOnly && !isSigned}
        />

        <div className="page-break-before"></div>
        <EditableSection
          title="2. INTRODUCTION ET CONTEXTE"
          content={sections.introduction}
          onContentChange={(val) => setSections(prev => ({ ...prev, introduction: val }))}
          editable={!readOnly && !isSigned}
          directEdit={!readOnly && !isSigned}
        />

        <div className="page-break-before"></div>
        <EditableSection
          title="3. MÉTHODOLOGIE"
          content={sections.methodologie}
          onContentChange={(val) => setSections(prev => ({ ...prev, methodologie: val }))}
          editable={!readOnly && !isSigned}
          directEdit={!readOnly && !isSigned}
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
            directEdit={!readOnly && !isSigned}
          />
          <EditableSection
            title="5.2. Réunion d'ouverture"
            content={sections.deroulement.reunionOuverture}
            onContentChange={(val) => setSections(prev => ({ ...prev, deroulement: { ...prev.deroulement, reunionOuverture: val } }))}
            editable={!readOnly && !isSigned}
            directEdit={!readOnly && !isSigned}
          />
          <EditableSection
            title="5.3. Phase de vérification sur site"
            content={sections.deroulement.verificationSite}
            onContentChange={(val) => setSections(prev => ({ ...prev, deroulement: { ...prev.deroulement, verificationSite: val } }))}
            editable={!readOnly && !isSigned}
            directEdit={!readOnly && !isSigned}
          />
          <EditableSection
            title="5.4. Réunion de clôture"
            content={sections.deroulement.reunionCloture}
            onContentChange={(val) => setSections(prev => ({ ...prev, deroulement: { ...prev.deroulement, reunionCloture: val } }))}
            editable={!readOnly && !isSigned}
            directEdit={!readOnly && !isSigned}
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
            directEdit={!readOnly && !isSigned}
          />
          <div className="rapport-results" dangerouslySetInnerHTML={{ __html: generateResultsHtml() }} />
          <EditableSection
            title="6.2. Analyse approfondie"
            content={sections.resultsAnalysis}
            onContentChange={(val) => setSections(prev => ({ ...prev, resultsAnalysis: val }))}
            editable={!readOnly && !isSigned}
            directEdit={!readOnly && !isSigned}
          />
        </div>

        <div className="page-break-before"></div>
        <EditableSection
          title="7. PRÉOCCUPATIONS DE SÉCURITÉ"
          content={sections.preoccupations}
          onContentChange={(val) => setSections(prev => ({ ...prev, preoccupations: val }))}
          editable={!readOnly && !isSigned}
          directEdit={!readOnly && !isSigned}
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
          directEdit={!readOnly && !isSigned}
        />

        <div className="page-break-before"></div>
        <EditableSection
          title="10. CONCLUSION"
          content={sections.conclusion}
          onContentChange={(val) => setSections(prev => ({ ...prev, conclusion: val }))}
          editable={!readOnly && !isSigned}
          directEdit={!readOnly && !isSigned}
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
        </div>
        </div>

      {!sections.resume && !isGenerating && !readOnly && !isSigned && (
        <div className="fixed bottom-4 right-4 z-50">
          <button onClick={generateFullReport} className="btn btn-primary gap-2 shadow-lg animate-pulse">
            <Sparkles className="w-4 h-4" />
            Générer le rapport avec AERORISQ
          </button>
        </div>
      )}

      {isGenerating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-2xl p-6 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-role-primary mx-auto mb-4" />
            <p className="text-lg font-medium">Génération du rapport en cours...</p>
            <p className="text-sm text-muted-foreground mt-1">AERORISQ analyse les données et rédige le rapport</p>
          </div>
        </div>
      )}

      {showVersionHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowVersionHistory(false)}>
          <div className="bg-background rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title flex items-center gap-2"><History className="w-4 h-4" /> Historique des versions</h2>
              <button className="modal-close" onClick={() => setShowVersionHistory(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="modal-body p-5 flex-1 overflow-y-auto">
              {(() => {
                const versions = (() => {
                  try { return JSON.parse(surveillance?.rapport_versions || '[]'); } catch { return []; }
                })();
                if (versions.length === 0) {
                  return <p className="text-center text-muted-foreground">Aucune version sauvegardée</p>;
                }
                return (
                  <div className="space-y-4">
                    {[...versions].reverse().map((v: any) => (
                      <div key={v.version} className="border border-border rounded-xl p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold flex items-center gap-2">
                              Version {v.version}
                              <span className="text-xs font-normal text-muted-foreground">
                                {new Date(v.modifie_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </p>
                            <p className="text-xs text-muted-foreground">par {v.modifie_par_nom}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {v.sections_modifiees?.map((sec: string) => (
                            <span key={sec} className="text-[10px] px-2 py-0.5 rounded-full bg-role-primary-soft text-role-primary font-medium">{sec}</span>
                          ))}
                        </div>
                        {v.diff && Object.keys(v.diff).length > 0 && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Voir le détail des modifications</summary>
                            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-2">
                              {Object.entries(v.diff).map(([key, d]: [string, any]) => (
                                <div key={key} className="border-l-2 border-role-primary pl-2 py-1">
                                  <p className="font-medium text-foreground">{key}</p>
                                  {d.ancien && <p className="text-danger line-through">{d.ancien.substring(0, 120)}{d.ancien.length > 120 ? '…' : ''}</p>}
                                  {d.nouveau && <p className="text-success">{d.nouveau.substring(0, 120)}{d.nouveau.length > 120 ? '…' : ''}</p>}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowVersionHistory(false)}>Fermer</button></div>
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