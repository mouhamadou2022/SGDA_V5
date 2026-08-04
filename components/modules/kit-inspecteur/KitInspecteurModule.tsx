// components/modules/kit-inspecteur/KitInspecteurModule.tsx

// ✅ CDC 5.11 - Kit Inspecteur
// ✅ Base documentaire partageable avec exploitants
// ✅ Filtres par domaine, type, statut
// ✅ Classes du design system harmonisées
// ✅ 0 composant shadcn/ui
// ✅ CORRIGÉ - Import manquants et classes dynamiques fixes
// ✅ Analyse IA post-ajout (kitDocAgent)

'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { FormShell } from '@/components/ui/FormShell';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';
import {
  Briefcase,
  FileText,
  Download,
  Eye,
  Upload,
  Search,
  Plus,
  Calendar,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Share2,
  Trash2,
  Edit3,
  Grid3x3,
  List,
  Brain,
  Sparkles,
  AlertTriangle,
  X,
  ClipboardList,
  LayoutList,
  Layers,
  Target,
  PenSquare,
  Filter,
  Archive,
  Clock,
  Shield,
  ChevronRight,
  History,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SGS_COMPOSANTES_STRUCTURE } from '@/types/checklist';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useAppStore, type KitDocument, type TypeDocumentOACI, type FormatDocument, type DomaineChecklist, type ChecklistTemplate, type ChecklistTemplateCategorie } from '@/lib/store';
import { uploadFile } from '@/lib/datastore';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { kitUtils } from '@/lib/kitUtils';
import { formatDate } from '@/lib/utils';
import { inspecteurVirtuel } from '@/lib/ia/agents/inspecteurVirtuelAgent';
import { generateKitChecklist, type KitDocAnalysis } from '@/lib/ia/agents/kitDocAgent';
import { getDomainesIndividuelsCodes } from '@/lib/domaines';
import { parseChecklistWord } from '@/lib/services/checklistParser';
import type { TemplateDiff } from '@/lib/services/checklistTemplateService';
import { KitDocForm } from '@/components/forms';
import { TYPES_DOCUMENTS, DOMAINES, ETATS_DOCUMENT } from '@/lib/kitOptions';

interface KitInspecteurModuleProps {
  userRole: string;
}

// Mapping des couleurs pour les classes CSS (non dynamiques)
const TYPE_COLOR_CLASSES: Record<string, string> = {
  primary: 'text-primary',
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted-foreground',
};

const TYPE_BG_COLOR_CLASSES: Record<string, string> = {
  primary: 'bg-primary-soft',
  success: 'bg-success-soft',
  info: 'bg-info-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
  neutral: 'bg-muted/20',
};

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

// Cache mémoire pour les URLs blob (non persisté dans Zustand)
const documentBlobUrls = new Map<string, string>()

// Constantes de formulaire hissées hors du composant
const DOMAINES_DISPONIBLES = [
  { code: 'AGA', label: 'Tous les domaines (AGA)' },
  { code: 'SGS', label: 'Système de Gestion de la Sécurité' },
  { code: 'SLI', label: 'Sauvetage et Lutte Incendie' },
  { code: 'PHY', label: 'Caractéristiques Physiques' },
  { code: 'OLS', label: 'Surface de Limitation d\'Obstacles' },
  { code: 'RA', label: 'Risque Animalier' },
  { code: 'ELEC', label: 'Réseaux Électriques' },
  { code: 'MFP', label: 'Marques, Feux et Panneaux' },
  { code: 'COP', label: 'Compétences Organisationnelles et Personnels' },
  { code: 'OPS', label: 'Procédures Opérationnelles' },
];

const TYPE_AERODROME_OPTIONS = [
  { value: 'aerodrome', label: 'Aérodrome', description: 'Certification ANACIM complète' },
  { value: 'helistation', label: 'Hélistation', description: 'Infrastructure héliportuaire' },
  { value: 'mixte', label: 'Mixte', description: 'Aérodrome + Hélistation' },
];

const TYPE_SURVEILLANCE_OPTIONS = [
  { value: 'periodique', label: 'Périodique', description: 'Surveillance planifiée régulière' },
  { value: 'inopine', label: 'Inopinée', description: 'Surveillance sans préavis' },
  { value: 'maintien', label: 'Maintien', description: 'Suivi des écarts et mesures correctives' },
];


function DetailModal({ showDetails, selectedDocument, setShowDetails, handleDownload, getTypeIcon, getEtatBadge, formatTaille, userRole }: {
  showDetails: boolean; selectedDocument: KitDocument | null;
  setShowDetails: (v: boolean) => void;
  handleDownload: (doc: any) => Promise<void>;
  getTypeIcon: (typeId: string, className?: string) => React.ReactNode;
  getEtatBadge: (etat: string) => React.ReactNode;
  formatTaille: (taille: number) => string;
  userRole: string;
}) {
  if (!showDetails || !selectedDocument) return null;
  return (
    <FormShell
      open={showDetails}
      onClose={() => setShowDetails(false)}
      title="Détails du document"
      icon={FileText}
      size="2xl"
      dataRole={userRole}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => setShowDetails(false)}>
            Fermer
          </button>
          <button className="btn btn-primary gap-2" onClick={() => handleDownload(selectedDocument)}>
            <Download className="w-4 h-4" />
            Télécharger
          </button>
        </>
      }
    >
      <>
        <div className="flex items-center gap-3 p-4 bg-role-primary-soft rounded-xl mb-4">
          {getTypeIcon(selectedDocument.type_document, "w-8 h-8")}
          <div>
            <h3 className="font-semibold text-foreground">{selectedDocument.nom}</h3>
            <p className="text-small text-muted-foreground">{selectedDocument.resume}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Version</p>
            <p className="font-medium text-foreground">{selectedDocument.version}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Date de révision</p>
            <p className="font-medium text-foreground">{selectedDocument.date_revision ? new Date(selectedDocument.date_revision).toLocaleDateString('fr-FR') : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">État</p>
            <div>{getEtatBadge(selectedDocument.etat)}</div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Taille</p>
            <p className="font-medium text-foreground">{formatTaille(selectedDocument.fichier_taille)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Téléchargements</p>
            <p className="font-medium text-foreground">{selectedDocument.telechargements}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Accès exploitant</p>
            <span className={`badge ${selectedDocument.accessible_exploitant ? 'success' : 'neutral'}`}>
              {selectedDocument.accessible_exploitant ? 'Oui' : 'Non'}
            </span>
          </div>
          {selectedDocument.ia_analyse_at && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Analyse IA</p>
              <span className="badge success inline-flex items-center gap-1 mt-1">
                <Sparkles className="w-3 h-3" />
                Analyse effectuée le {new Date(selectedDocument.ia_analyse_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Domaines</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedDocument.domaines?.map((d: string) => (
                <span key={d} className="badge outline">{d}</span>
              ))}
            </div>
          </div>
          {selectedDocument.mots_cles && selectedDocument.mots_cles.length > 0 && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Mots-clés</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedDocument.mots_cles.map((mot: string) => (
                  <span key={mot} className="badge neutral text-[10px]">{mot}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </>
    </FormShell>
  );
}

function ShareModalAction({ showShareModal, selectedDocument, setShowShareModal, updateKitDocument, addNotification, user, userRole }: {
  showShareModal: boolean; selectedDocument: KitDocument | null;
  setShowShareModal: (v: boolean) => void;
  updateKitDocument: (id: string, data: any) => void;
  addNotification: any; user: any; userRole: string;
}) {
  if (!showShareModal || !selectedDocument) return null;
  const handleToggleAccess = async () => {
    await updateKitDocument(selectedDocument.id, { accessible_exploitant: !selectedDocument.accessible_exploitant } as any);
    addNotification?.({
      user_id: user?.id || '', type: 'success',
      title: selectedDocument.accessible_exploitant ? 'Accès révoqué' : 'Accès accordé',
      message: `Le document "${selectedDocument.nom}" n'est ${selectedDocument.accessible_exploitant ? 'plus' : 'maintenant'} visible par les exploitants.`,
      canal: 'in_app',
    });
    setShowShareModal(false);
  };
  return (
    <FormShell
      open={showShareModal}
      onClose={() => setShowShareModal(false)}
      title="Partager avec les exploitants"
      icon={Share2}
      size="md"
      dataRole={userRole}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => setShowShareModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleToggleAccess}>
            {selectedDocument.accessible_exploitant ? 'Révoquer l\'accès' : 'Autoriser l\'accès'}
          </button>
        </>
      }
    >
      <div className="alert alert-info">
        <AlertCircle className="alert-icon" />
        <div className="alert-content">
          <div className="alert-title">Information</div>
          <div className="alert-description">
            Ce document est actuellement {selectedDocument.accessible_exploitant ? 'visible' : 'non visible'} pour les exploitants.
          </div>
        </div>
      </div>
    </FormShell>
  );
}

export default function KitInspecteurModule({ userRole }: KitInspecteurModuleProps) {
  const kitDocuments = useAppStore(s => s.kitDocuments);
  const user = useAppStore(s => s.user);
  const addKitDocument = useAppStore(s => s.addKitDocument);
  const updateKitDocument = useAppStore(s => s.updateKitDocument);
  const deleteKitDocument = useAppStore(s => s.deleteKitDocument);
  const incrementerTelechargement = useAppStore(s => s.incrementerTelechargement);
  const addNotification = useAppStore(s => s.addNotification);
  const masterChecklists = useAppStore(s => s.masterChecklists);
  const archivedMasterChecklists = useAppStore(s => s.archivedMasterChecklists);
  const setMasterChecklist = useAppStore(s => s.setMasterChecklist);
  const deleteMasterChecklist = useAppStore(s => s.deleteMasterChecklist);
  const archiveMasterChecklist = useAppStore(s => s.archiveMasterChecklist);
  const unarchiveMasterChecklist = useAppStore(s => s.unarchiveMasterChecklist);
  const aerodromes = useAppStore(s => s.aerodromes);
  const updateAerodrome = useAppStore(s => s.updateAerodrome);
  const surveillances = useAppStore(s => s.surveillances);

  // Templates persistés en Supabase (versions, dates, utilisateurs) pour l'accordéon
  const [supaTemplates, setSupaTemplates] = useState<ChecklistTemplate[]>([]);

  useEffect(() => {
    let cancelled = false
    import('@/lib/services/checklistTemplateService').then(({ loadTemplatesFromSupabase }) => {
      loadTemplatesFromSupabase().then(list => { if (!cancelled) setSupaTemplates(list) }).catch(() => {})
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Historique par thème (type_code) à partir des templates persistés
  const supaByTheme = useMemo(() => {
    const m: Record<string, ChecklistTemplate[]> = {}
    for (const t of supaTemplates) {
      const k = `${t.type}_${t.code}`
      if (!m[k]) m[k] = []
      m[k].push(t)
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return m
  }, [supaTemplates])

  // États
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    type: 'tous',
    domaine: 'tous',
    etat: 'tous',
    accessible: 'tous'
  });
  const [showForm, setShowForm] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<KitDocument | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [viewMode, setViewMode] = useState<'liste' | 'grille'>('liste');
  const [sousTab, setSousTab] = useState<'documents' | 'templates'>('documents');

  // Filtres templates
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateFilterType, setTemplateFilterType] = useState<string>('tous');
  const [templateFilterDomaine, setTemplateFilterDomaine] = useState<string>('tous');
  const [showArchived, setShowArchived] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState<string | null>(null);

  // Charger les templates depuis Supabase au montage
  useEffect(() => {
    import('@/lib/services/checklistTemplateService').then(({ loadTemplatesFromSupabase }) => {
      loadTemplatesFromSupabase().catch(() => {})
    }).catch(() => {})
  }, []);

  const router = useRouter();

  // Génération multi-docs (enrichie avec profil de risque)
  const [showGenModal, setShowGenModal] = useState(false);
  const [genPortee, setGenPortee] = useState<string[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genTypeEntite, setGenTypeEntite] = useState<'aerodrome' | 'helistation' | 'mixte'>('aerodrome');
  const [genTypeSurveillance, setGenTypeSurveillance] = useState<'periodique' | 'inopine' | 'maintien'>('periodique');
  const [genInstructions, setGenInstructions] = useState('');

  // Import modèle ANACIM (.docx)
  const [showImportModal, setShowImportModal] = useState(false);
  const [importDragOver, setImportDragOver] = useState(false);
  const [importParsing, setImportParsing] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{
    template: { type: string; code: string; nom: string; version: string; portee: string[] }
    hierarchie: any[]
    filename: string
  } | null>(null);
  const [importPorteeEdit, setImportPorteeEdit] = useState<string[]>([]);
  const [importDomaineOverrides, setImportDomaineOverrides] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importTypeEdit, setImportTypeEdit] = useState<string>('QSC');
  const [importPorteeManual, setImportPorteeManual] = useState<string>('');
  const [porteeManuallyEdited, setPorteeManuallyEdited] = useState(false);
  const [importFileBuffer, setImportFileBuffer] = useState<ArrayBuffer | null>(null);
  const [importSGSAerodrome, setImportSGSAerodrome] = useState<string>('');
  const [exportMenuOpen, setExportMenuOpen] = useState<string | null>(null);
  const [exportMenuRect, setExportMenuRect] = useState<{ top: number; right: number } | null>(null);

  // ── Wizard d'import guidé ──────────────────────────────────────────────────
  const [importStep, setImportStep] = useState<'upload' | 'config' | 'confirmation'>('upload');
  const [importCategorie, setImportCategorie] = useState<ChecklistTemplateCategorie>('surveillance_continue');
  const [importSousType, setImportSousType] = useState<string>('IT');
  const [importITDomaines, setImportITDomaines] = useState<string[]>([]);
  const [importTypeEntite, setImportTypeEntite] = useState<'aerodrome' | 'helistation'>('aerodrome');
  const [importRegime, setImportRegime] = useState<'certifie' | 'homologue'>('certifie');
  const [importCodeLibre, setImportCodeLibre] = useState('');
  const [importVersion, setImportVersion] = useState('');
  const [importEditionDate, setImportEditionDate] = useState('');
  const [existingVersions, setExistingVersions] = useState<ChecklistTemplate[]>([]);
  const [templateDiff, setTemplateDiff] = useState<TemplateDiff | null>(null);
  const [diffIA, setDiffIA] = useState<string | null>(null);
  const [diffIALoading, setDiffIALoading] = useState(false);
  const [checkingDup, setCheckingDup] = useState(false);
  const [importDecision, setImportDecision] = useState<'replace' | 'keep'>('replace');

  const IMPORT_CATEGORIES: { value: ChecklistTemplateCategorie; label: string; desc: string }[] = [
    { value: 'homologation', label: 'Homologation', desc: 'Aérodrome ou hélistation' },
    { value: 'certification', label: 'Certification', desc: 'Inspection technique, Procédures, SGS, COP' },
    { value: 'surveillance_continue', label: 'Surveillance continue', desc: 'Aérodrome certifié ou homologué' },
    { value: 'validation_site', label: 'Validation de site', desc: 'Aérodrome ou hélistation' },
    { value: 'autres', label: 'Autres checklist', desc: 'Études de sécurité, manuel d\'aérodrome…' },
  ];

  const CERTIFICATION_SUBTYPES = [
    { value: 'IT', label: 'Inspection technique' },
    { value: 'SOP', label: 'Procédures' },
    { value: 'SGS', label: 'SGS (PAOE)' },
    { value: 'COP', label: 'COP' },
  ];

  // Identité (type + code) dérivée de la famille choisie dans le wizard
  const computeImportIdentity = useCallback((): { type: string; code: string } => {
    switch (importCategorie) {
      case 'homologation': return { type: 'HMG', code: 'HMG_CHKLIST_GENERAL' }
      case 'certification': {
        let code = importSousType === 'SGS' ? 'SGS_PAOE'
          : importSousType === 'COP' ? 'COP_CHKLIST_GENERAL'
          : importSousType === 'SOP' ? 'SOP_CHKLIST_GENERAL'
          : 'IT_CHKLIST_GENERAL'
        // IT : un fichier par domaine (PHY, ELEC, MFP, OLS) ou domaines combinés (ex. ELEC + MFP)
        if (importSousType === 'IT' && importITDomaines.length > 0) {
          code = `IT_CHKLIST_${[...importITDomaines].sort().join('_')}`
        }
        return { type: importSousType, code }
      }
      case 'surveillance_continue': return { type: 'QSC', code: 'QSC_CONTINUE' }
      case 'validation_site': return { type: 'VALIDATION_SITE', code: 'VS_CHKLIST_GENERAL' }
      case 'autres':
      default:
        return { type: 'AUT', code: (importCodeLibre || 'AUT').toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24) }
    }
  }, [importCategorie, importSousType, importCodeLibre, importITDomaines]);

  // Passage à l'étape de confirmation : détection de doublon + diff client
  const goToConfirmation = useCallback(async () => {
    if (!importPreview) return
    setCheckingDup(true)
    setTemplateDiff(null)
    setDiffIA(null)
    setExistingVersions([])
    try {
      const { fetchTemplateVersions, compareChecklists } = await import('@/lib/services/checklistTemplateService')
      const { type, code } = computeImportIdentity()
      const versions = await fetchTemplateVersions(type, code)
      setExistingVersions(versions)
      const active = versions.find(v => v.actif)
      if (active) {
        setTemplateDiff(compareChecklists(active.hierarchie, importPreview.hierarchie))
      }
    } finally {
      setCheckingDup(false)
      setImportStep('confirmation')
    }
  }, [importPreview, computeImportIdentity]);

  // Comparaison détaillée IA (à la demande)
  const runDiffIA = useCallback(async () => {
    if (!importPreview || !existingVersions.length) return
    const active = existingVersions.find(v => v.actif)
    if (!active) return
    setDiffIALoading(true)
    setDiffIA(null)
    try {
      const { compareChecklistsWithIA } = await import('@/lib/services/checklistTemplateService')
      const analyse = await compareChecklistsWithIA(active.hierarchie, importPreview.hierarchie)
      setDiffIA(analyse)
    } finally {
      setDiffIALoading(false)
    }
  }, [importPreview, existingVersions]);

  // Import final (validation)
  const confirmImport = useCallback(async () => {
    if (!importPreview) return
    if (importDecision === 'keep') {
      setShowImportModal(false); setImportPreview(null); setImportStep('upload'); setImportError(null)
      return
    }
    setImporting(true)
    try {
      const { type, code } = computeImportIdentity()
      const templateId = `${type}_${code}`
      const hierarchieWithOverrides = importPreview.hierarchie.map((d: any, i: number) => {
        if (importDomaineOverrides[i] && importDomaineOverrides[i] !== d.nom) return { ...d, nom: importDomaineOverrides[i] }
        return d
      })
      const effectivePortee = importPorteeEdit.length > 0
        ? importPorteeEdit
        : [...new Set(hierarchieWithOverrides.map((d: any) => d.nom))]
      setMasterChecklist(templateId, hierarchieWithOverrides)

      if (type !== importPreview.template.type && user?.id) {
        import('@/lib/services/checklistTemplateService').then(({ recordTypeCorrection }) => {
          recordTypeCorrection(importPreview.filename, importPreview.template.type, type, user.id)
        }).catch(() => {})
      }

      const { importTemplateToSupabase } = await import('@/lib/services/checklistTemplateService')
      await importTemplateToSupabase(
        type as any,
        code,
        importPreview.template.nom,
        effectivePortee,
        hierarchieWithOverrides,
        {
          categorie: importCategorie,
          regime: importCategorie === 'surveillance_continue' ? importRegime : undefined,
          type_entite_cible: importTypeEntite,
          version: importVersion || importPreview.template.version || '1.0',
          edition_date: importEditionDate || undefined,
          source_fichier: importPreview.filename,
          etat: 'publie',
          archivePrevious: true,
        },
      )

      // Template SGS appliqué à un aérodrome
      if (type === 'SGS' && importSGSAerodrome) {
        const aero = aerodromes.find(a => a.id === importSGSAerodrome)
        if (aero) {
          import('@/lib/services/checklistParser').then(({ buildSGSTemplateFromImport }) => {
            const sgsTemplate = buildSGSTemplateFromImport(hierarchieWithOverrides, code)
            updateAerodrome(importSGSAerodrome, { sgs_checklist_template: sgsTemplate as any })
          }).catch(() => {})
        }
      }

      setImportPreview(null)
      setImportStep('upload')
      setShowImportModal(false)
      setSousTab('templates')
    } catch (err: any) {
      setImportError(err?.message || 'Erreur lors de l\'import du template.')
    } finally {
      setImporting(false)
    }
  }, [importPreview, importDecision, computeImportIdentity, importDomaineOverrides, importPorteeEdit, setMasterChecklist, user, importCategorie, importRegime, importTypeEntite, importVersion, importEditionDate, importSGSAerodrome, aerodromes, updateAerodrome, setSousTab]);

  const handleImportFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      setImportError('Seuls les fichiers .docx (Word) sont acceptés.')
      return
    }
    setImportError(null)
    setImportParsing(true)
    setImportPreview(null)
    setImportFileBuffer(null)
    try {
      const buffer = await file.arrayBuffer()
      // Recréer un File-like object à partir du buffer pour pouvoir re-parser
      const fileObj = new File([buffer], file.name, { type: file.type })
      const result = await parseChecklistWord(fileObj)
      setImportFileBuffer(buffer)
      setImportPreview({
        template: result.template,
        hierarchie: result.hierarchie,
        filename: file.name,
      })
      setImportTypeEdit(result.template.type)
      setImportPorteeEdit(result.template.portee)
      setImportDomaineOverrides({})
      setPorteeManuallyEdited(false)
      setImportVersion(result.template.version || '')
      setImportEditionDate('')
      setImportStep('config')
    } catch (err: any) {
      setImportError(err?.message || 'Erreur lors de l\'analyse du fichier.')
    } finally {
      setImportParsing(false)
    }
  }, [])

  const totalItems = (d: any) =>
    (d.items?.length || 0) +
    (d.sousDomaines || []).reduce((s: number, sd: any) =>
      s + (sd.items?.length || 0) +
      (sd.sousSousDomaines || []).reduce((s2: number, ssd: any) =>
        s2 + (ssd.items?.length || 0), 0), 0)

  const TYPE_LABELS: Record<string, string> = {
    IT: 'Inspection Technique',
    SOP: 'Procédures d\'Exploitation Normalisées',
    QSC: 'QSC — Surveillance Continue',
    SGS: 'SGS — PAOE',
    VALIDATION_SITE: 'Validation de site (construction)',
  }

  // Sync la portée globale depuis les overrides de domaine par section
  useEffect(() => {
    if (!importPreview) return
    if (porteeManuallyEdited) return
    const effective = [...new Set(
      importPreview.hierarchie.map((d: any, i: number) => importDomaineOverrides[i] ?? d.nom)
    )]
    setImportPorteeEdit(effective)
  }, [importPreview, importDomaineOverrides, porteeManuallyEdited])

  // Re-parser quand l'utilisateur change le type manuellement
  useEffect(() => {
    if (!importPreview || !importFileBuffer || !importTypeEdit) return
    if (importTypeEdit === importPreview.template.type) return
    // Type différent → re-parser avec le type corrigé
    const reparse = async () => {
      setImportParsing(true)
      try {
        const { parseChecklistWord } = await import('@/lib/services/checklistParser')
        const fileObj = new File([importFileBuffer], importPreview.filename, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
        const result = await parseChecklistWord(fileObj, importTypeEdit as any)
        setImportPreview({
          template: { ...result.template, type: importTypeEdit },
          hierarchie: result.hierarchie,
          filename: importPreview.filename,
        })
        setImportPorteeEdit(result.template.portee)
        setImportDomaineOverrides({})
        setPorteeManuallyEdited(false)
      } catch {
        // Garder l'ancien aperçu si le re-parse échoue
      } finally {
        setImportParsing(false)
      }
    }
    reparse()
  }, [importTypeEdit, importFileBuffer])

  // Synchroniser le type effectif avec la famille choisie dans le wizard
  useEffect(() => {
    if (!importPreview) return
    const ident = computeImportIdentity()
    if (importTypeEdit !== ident.type) setImportTypeEdit(ident.type)
  }, [computeImportIdentity, importPreview, importTypeEdit])

  // Reset states when import modal closes
  useEffect(() => {
    if (!importPreview && !showImportModal) {
      setImportTypeEdit('QSC')
      setImportPorteeManual('')
      setPorteeManuallyEdited(false)
      setImportFileBuffer(null)
      setImportSGSAerodrome('')
      setImportStep('upload')
      setImportCategorie('surveillance_continue')
      setImportSousType('IT')
      setImportITDomaines([])
      setImportTypeEntite('aerodrome')
      setImportRegime('certifie')
      setImportCodeLibre('')
      setImportVersion('')
      setImportEditionDate('')
      setExistingVersions([])
      setTemplateDiff(null)
      setDiffIA(null)
      setImportDecision('replace')
    }
  }, [importPreview, showImportModal])

  // Escape key closes modals
  useEffect(() => {
    if (!showGenModal && !showImportModal) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowGenModal(false); setShowImportModal(false) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showGenModal, showImportModal])

  const handleGenerateChecklist = async () => {
    if (genPortee.length === 0) return
    setGenLoading(true)
    try {
      if (!inspecteurVirtuel.isReady()) await inspecteurVirtuel.init()
      const now = new Date();
      const mmYY = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
      const domaineCode = genPortee.includes('AGA') || genPortee.length >= 8 ? 'AGA' : genPortee.join('-');
      const existingIds = Object.keys(masterChecklists).filter(id => id.startsWith(`CHCKLI-${domaineCode}-${mmYY}`));
      const version = existingIds.length + 1;
      const generationId = `CHCKLI-${domaineCode}-${mmYY}-${String(version).padStart(2, '0')}`;
      
      const typeEntite = genTypeEntite

      const result = await generateKitChecklist({
        surveillance_id: generationId,
        entite_id: 'master',
        type_entite: typeEntite,
        type_surveillance: genTypeSurveillance,
        portee: genPortee,
        profil_risque: undefined,
      })

      const hierarchy = result.domaines.map((d, di) => ({
        id: `master_${generationId}_${d.code}`,
        nom: d.label,
        description: d.description,
        items: [] as any[],
        sousDomaines: d.sous_domaines.map((sd, sdi) => ({
          id: `master_${generationId}_${d.code}_${sd.nom.replace(/\s+/g, '_').toLowerCase()}`,
          nom: sd.nom,
          items: sd.sous_sous_domaines?.flatMap((ssd: any) => ssd.items || []) || [],
          sousSousDomaines: sd.sous_sous_domaines.map((ssd, ssdi) => ({
            id: `master_${generationId}_${d.code}_${ssd.nom.replace(/\s+/g, '_').toLowerCase()}`,
            nom: ssd.nom,
            items: ssd.items.map((item, ii) => ({
              id: item.id,
              numero: item.numero,
              reference_reglementaire: item.reference_reglementaire,
              point_verification: item.point_verification,
              directive_preuve: item.directive_preuve,
              directive_sa: item.directive_sa,
              directive_ns: item.directive_ns,
              directive_nv: item.directive_nv,
              directive_na: item.directive_na,
              ordre: ii,
              resultat: undefined,
              prediction: item.prediction,
              confiance: item.confiance,
              justification: item.justification,
              alerte: item.alerte,
              prefilled: false,
              observation: undefined,
              fichiers: [],
            })),
            isExpanded: true,
            ordre: ssdi,
          })),
          isExpanded: true,
          ordre: sdi,
        })),
        isExpanded: true,
        progression: 0,
        ordre: di,
      }))

      if (!result.domaines || result.domaines.length === 0) {
        addNotification?.({
          user_id: user?.id || '',
          type: 'danger',
          title: 'Génération vide',
          message: 'Aucune structure de domaines n\'a été générée. Vérifie que tes documents d\'analyse couvrent les domaines sélectionnés.',
          canal: 'in_app',
        })
      } else {
        setMasterChecklist(generationId, hierarchy as unknown as DomaineChecklist[])
        addNotification?.({
          user_id: user?.id || '',
          type: 'success',
          title: 'Checklist générée',
          message: genInstructions.trim() 
            ? `Checklist générée avec vos instructions : "${genInstructions.substring(0, 50)}..."`
            : 'Checklist générée avec succès',
          canal: 'in_app',
        })
      }
      
      setShowGenModal(false)
      setGenPortee([])
      setGenInstructions('')
      
      router.push(`/kit-checklist/${generationId}`)
    } catch (err) {
      console.error('[KitInspecteur] Erreur génération checklist:', err)
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: 'Impossible de générer la checklist',
        canal: 'in_app',
      })
    } finally {
      setGenLoading(false)
    }
  }

  // Formulaire
  const [formData, setFormData] = useState({
    nom: '',
    type_document: 'reglementation',
    type_document_oaci: '' as TypeDocumentOACI | '',
    format: 'PDF' as FormatDocument,
    version: 'v1.0',
    date_revision: new Date().toISOString().split('T')[0],
    etat: 'a_jour',
    domaines: [] as string[],
    fichier: null as File | null,
    mots_cles: [] as string[],
    resume: '',
    accessible_exploitant: false,
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const listeDocuments = kitDocuments ?? [];

  // Filtrer les documents
  const filteredDocuments = useMemo(() => {
    return listeDocuments.filter(doc => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = 
          doc.nom?.toLowerCase().includes(term) ||
          doc.mots_cles?.some((m: string) => m.toLowerCase().includes(term)) ||
          doc.resume?.toLowerCase().includes(term);
        if (!matches) return false;
      }

      if (filters.type !== 'tous' && doc.type_document !== filters.type) return false;
      if (filters.etat !== 'tous' && doc.etat !== filters.etat) return false;
      if (filters.domaine !== 'tous' && !doc.domaines?.includes(filters.domaine)) return false;
      if (filters.accessible !== 'tous') {
        const accessible = filters.accessible === 'oui';
        if (doc.accessible_exploitant !== accessible) return false;
      }

      return true;
    });
  }, [listeDocuments, searchTerm, filters]);

  // Grouper par type
  const documentsParType = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    TYPES_DOCUMENTS.forEach(t => { grouped[t.id] = []; });
    filteredDocuments.forEach(doc => {
      if (grouped[doc.type_document]) grouped[doc.type_document].push(doc);
    });
    return grouped;
  }, [filteredDocuments]);

  // Statistiques
  const stats = useMemo(() => {
    return {
      total: listeDocuments.length,
      a_jour: listeDocuments.filter(d => d.etat === 'a_jour').length,
      en_revision: listeDocuments.filter(d => d.etat === 'en_revision').length,
      obsolete: listeDocuments.filter(d => d.etat === 'obsolete').length,
      exploitant: listeDocuments.filter(d => d.accessible_exploitant).length,
      telechargements: listeDocuments.reduce((acc, d) => acc + (d.telechargements || 0), 0)
    };
  }, [listeDocuments]);

  const templateStats = useMemo(() => {
    const types: Record<string, { count: number; items: number }> = {}
    let totalItems = 0
    for (const [id, domaines] of Object.entries(masterChecklists)) {
      const items = domaines.flatMap(d => d.items || [])
      totalItems += items.length
      const prefixes = new Set(items.map(i => i.numero?.split('-')[0]).filter(Boolean))
      let type = 'surveillance'
      if (prefixes.has('CERT')) type = 'certification'
      else if (prefixes.has('HMG')) type = 'homologation'
      else if (domaines.length === 1 && domaines[0].nom === 'SGS') type = 'sgs'
      if (!types[type]) types[type] = { count: 0, items: 0 }
      types[type].count++
      types[type].items += items.length
    }
    return { total: Object.keys(masterChecklists).length, totalItems, types }
  }, [masterChecklists]);

  const getTypeIcon = (typeId: string, className?: string) => {
    const type = TYPES_DOCUMENTS.find(t => t.id === typeId);
    if (!type) return <FileText className={className || "w-5 h-5"} />;
    const Icon = type.icon;
    const colorClass = TYPE_COLOR_CLASSES[type.color] || 'text-primary';
    return <Icon className={`${className || "w-5 h-5"} ${colorClass}`} />;
  };

  const getEtatBadge = (etat: string) => {
    const config = ETATS_DOCUMENT.find(e => e.id === etat);
    if (!config) return <span className="badge neutral">{etat}</span>;
    const Icon = config.icon;
    return (
      <span className={`badge ${config.color} inline-flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  const formatTaille = (taille: number) => {
    if (!taille) return '-';
    if (taille < 1024) return `${taille} o`;
    if (taille < 1024 * 1024) return `${(taille / 1024).toFixed(1)} Ko`;
    return `${(taille / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const validerFormulaire = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.nom.trim()) errors.nom = "Le nom du document est requis";
    if (!formData.version.trim()) errors.version = "La version est requise";
    if (!formData.fichier && !selectedDocument) errors.fichier = "Le fichier est requis";
    if (formData.domaines.length === 0) errors.domaines = "Au moins un domaine est requis";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validerFormulaire()) return;
    setIsSubmitting(true);
    try {
      let uploadError: string | null = null;
      let storageUrl = selectedDocument?.fichier_url || '';

      // Upload du fichier vers Supabase Storage si nouveau fichier sélectionné
      if (formData.fichier) {
        const path = `kit-documents/${crypto.randomUUID()}_${formData.fichier.name}`;
        const { data: uploadResult, error: upErr } = await uploadFile('documents', path, formData.fichier);
        if (upErr) {
          uploadError = upErr;
          console.warn('[KitInspecteur] Upload Storage échoué, fallback blob URL:', upErr);
        } else {
          storageUrl = uploadResult?.url || '';
        }
      }

      const fichierUrl = formData.fichier
        ? (uploadError ? URL.createObjectURL(formData.fichier) : storageUrl)
        : documentBlobUrls.get(selectedDocument!.id) || selectedDocument?.fichier_url;

      const documentData = {
        nom: formData.nom,
        type_document: formData.type_document,
        type_document_oaci: formData.type_document_oaci || undefined,
        format: formData.format || undefined,
        version: formData.version,
        date_revision: formData.date_revision,
        etat: formData.etat,
        domaines: formData.domaines,
        fichier_url: storageUrl,
        fichier_nom: formData.fichier?.name || selectedDocument?.fichier_nom,
        fichier_taille: formData.fichier?.size || selectedDocument?.fichier_taille,
        mots_cles: formData.mots_cles,
        resume: formData.resume,
        accessible_exploitant: formData.accessible_exploitant,
        updated_at: new Date().toISOString(),
      };

      let savedDoc: KitDocument | null = null;

      if (selectedDocument) {
        await updateKitDocument(selectedDocument.id, documentData as any);
        savedDoc = { ...selectedDocument, ...documentData } as KitDocument;
      } else {
        const newDoc = {
          ...documentData,
          telechargements: 0,
          created_at: new Date().toISOString(),
          created_by: user?.id || '',
        } as any;
        savedDoc = await addKitDocument(newDoc);
      }

      // URL blob fallback si l'upload Storage a échoué
      if (savedDoc?.id && fichierUrl && formData.fichier && uploadError) {
        documentBlobUrls.set(savedDoc.id, fichierUrl)
      }

      setShowForm(false);
      resetForm();

      if (savedDoc) {
        addNotification?.({
          user_id: user?.id || '',
          type: 'success',
          title: 'Document ajouté',
          message: `Document "${savedDoc?.nom}" ajouté au Kit Inspecteur.`,
          canal: 'in_app',
        });
      }
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nom: '',
      type_document: 'reglementation',
      type_document_oaci: '',
      format: 'PDF',
      version: 'v1.0',
      date_revision: new Date().toISOString().split('T')[0],
      etat: 'a_jour',
      domaines: [],
      fichier: null,
      mots_cles: [],
      resume: '',
      accessible_exploitant: false,
    });
    setSelectedDocument(null);
    setFormErrors({});
  };

  const handleEdit = (doc: any) => {
    setSelectedDocument(doc);
    setFormData({
      nom: doc.nom,
      type_document: doc.type_document,
      type_document_oaci: doc.type_document_oaci || '',
      format: doc.format || 'PDF',
      version: doc.version,
      date_revision: doc.date_revision,
      etat: doc.etat,
      domaines: doc.domaines,
      fichier: null,
      mots_cles: doc.mots_cles,
      resume: doc.resume || '',
      accessible_exploitant: doc.accessible_exploitant,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce document ?')) {
      await deleteKitDocument(id);
    }
  };

  const handleDownload = async (doc: any) => {
    await incrementerTelechargement(doc.id);
    const url = documentBlobUrls.get(doc.id) || doc.fichier_url;
    if (url) {
      window.open(url, '_blank');
    }
  };

  const getHeaderBgClass = (typeId: string) => {
    const type = TYPES_DOCUMENTS.find(t => t.id === typeId);
    if (!type) return 'bg-gradient-to-r from-role-primary/5 to-transparent';
    switch (type.color) {
      case 'primary': return 'bg-gradient-to-r from-primary-soft to-transparent';
      case 'success': return 'bg-gradient-to-r from-success-soft to-transparent';
      case 'info': return 'bg-gradient-to-r from-info-soft to-transparent';
      case 'warning': return 'bg-gradient-to-r from-warning-soft to-transparent';
      case 'danger': return 'bg-gradient-to-r from-danger-soft to-transparent';
      default: return 'bg-gradient-to-r from-role-primary/5 to-transparent';
    }
  };

  const columnsDef: Column<KitDocument>[] = [
    {
      key: 'document',
      header: 'Document',
      render: (doc) => (
        <div className="flex items-center gap-2">
          {getTypeIcon(doc.type_document, "w-4 h-4")}
          <div>
            <p className="font-medium text-foreground">{doc.nom}</p>
            <p className="text-xs text-muted-foreground truncate max-w-xs">{doc.resume}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (doc) => <span className="badge outline">{doc.version}</span>,
    },
    {
      key: 'revision',
      header: 'Révision',
      render: (doc) => (
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3 text-muted-foreground" />
          {doc.date_revision ? new Date(doc.date_revision).toLocaleDateString('fr-FR') : '-'}
        </div>
      ),
    },
    {
      key: 'domaines',
      header: 'Domaines',
      render: (doc) => (
        <div className="flex flex-wrap gap-1">
          {doc.domaines?.map((d: string) => (
            <span key={d} className="badge outline text-[10px]">{d}</span>
          ))}
        </div>
      ),
    },
    {
      key: 'etat',
      header: 'État',
      render: (doc) => getEtatBadge(doc.etat),
    },
    {
      key: 'exploitant',
      header: 'Exploitant',
      render: (doc) => (
        <span className={`badge ${doc.accessible_exploitant ? 'success' : 'neutral'}`}>
          {doc.accessible_exploitant ? 'Oui' : 'Non'}
        </span>
      ),
    },
    {
      key: 'telechargements',
      header: 'Téléch.',
      render: (doc) => <span className="badge outline">{doc.telechargements}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (doc) => (
        <div className="flex justify-end gap-2">
          <button className="action-button" onClick={() => handleDownload(doc)}>
            <Download className="w-4 h-4" />
          </button>
          <button className="action-button" onClick={() => { setSelectedDocument(doc); setShowDetails(true); }}>
            <Eye className="w-4 h-4" />
          </button>
          <button className="action-button" onClick={() => handleEdit(doc)} title="Modifier">
            <Edit3 className="w-4 h-4" />
          </button>
          <button className="action-button" onClick={() => handleDelete(doc.id)} title="Supprimer">
            <Trash2 className="w-4 h-4 text-danger" />
          </button>
          {doc.accessible_exploitant && (
            <button className="action-button" onClick={() => { setSelectedDocument(doc); setShowShareModal(true); }}>
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="kit-inspecteur">

      {/* En-tête */}
      <ModuleHeader
        icon={<Briefcase />}
        title="Kit Inspecteur"
        description={`Base documentaire - ${stats.total} documents`}
        actions={<div className="flex items-center gap-2">
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary gap-2">
            <Upload className="w-4 h-4" />
            Importer modèle ANACIM
          </button>
          <button onClick={() => setShowGenModal(true)} className="btn btn-secondary gap-2">
            <LayoutList className="w-4 h-4" />
            Générer la checklist
          </button>
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn btn-primary gap-2">
            <Plus className="w-4 h-4" />
            Ajouter un document
          </button>
        </div>}
      />

      {/* Sous-onglets */}
      <div className="tabs-container border-b border-border mb-6">
        <div className="tabs flex gap-1">
          <button
            className={`tab px-4 py-2 font-medium transition-all ${
              sousTab === 'documents'
                ? 'active border-b-2 border-role-primary text-role-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSousTab('documents')}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Documents
          </button>
          <button
            className={`tab px-4 py-2 font-medium transition-all ${
              sousTab === 'templates'
                ? 'active border-b-2 border-role-primary text-role-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSousTab('templates')}
          >
            <LayoutList className="w-4 h-4 inline mr-2" />
            Templates
          </button>
        </div>
      </div>

      {/* Contenu Documents */}
      {sousTab === 'documents' && (
      <>
      {/* KPIs Documents */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <FileText className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">À jour</div>
          <div className="kpi-value">{stats.a_jour}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <RefreshCw className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">En révision</div>
          <div className="kpi-value">{stats.en_revision}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft">
            <XCircle className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label">Obsolètes</div>
          <div className="kpi-value">{stats.obsolete}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-info-soft">
            <Download className="w-5 h-5 text-info" />
          </div>
          <div className="kpi-label">Téléchargements</div>
          <div className="kpi-value">{stats.telechargements}</div>
        </div>
      </div>
      </>)}

      {/* Contenu Templates importés */}
      {sousTab === 'templates' && (
        <div className="space-y-6 animate-fade-up">
          {/* Stats templates */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon bg-purple-50">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <div className="kpi-label">Templates</div>
              <div className="kpi-value">{templateStats.total}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon bg-blue-50">
                <ClipboardList className="w-5 h-5 text-blue-600" />
              </div>
              <div className="kpi-label">Total items</div>
              <div className="kpi-value">{templateStats.totalItems}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon bg-green-50">
                <Layers className="w-5 h-5 text-green-600" />
              </div>
              <div className="kpi-label">Types</div>
              <div className="kpi-value">{Object.keys(templateStats.types).length}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon bg-orange-50">
                <Archive className="w-5 h-5 text-orange-600" />
              </div>
              <div className="kpi-label">Archivés</div>
              <div className="kpi-value">{Object.keys(archivedMasterChecklists).length}</div>
            </div>
          </div>

          {/* Barre de recherche et filtres — design SurveillanceModule */}
          <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" value={templateSearch} onChange={e => setTemplateSearch(e.target.value)}
                  placeholder="Référence, domaine, type..."
                  className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm ${focusClass}`} />
              </div>
              <select value={templateFilterType} onChange={e => setTemplateFilterType(e.target.value)}
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}>
                <option value="tous">Tous les types</option>
                <option value="surveillance">Surveillance</option>
                <option value="certification">Certification</option>
                <option value="homologation">Homologation</option>
                <option value="sgs">SGS</option>
              </select>
              <select value={templateFilterDomaine} onChange={e => setTemplateFilterDomaine(e.target.value)}
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}>
                <option value="tous">Tous domaines</option>
                {DOMAINES.map(d => <option key={d.id} value={d.id}>{d.label.split(' — ')[0]}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm cursor-pointer ml-auto">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
                  className="form-checkbox" />
                <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                Afficher archivés
              </label>
            </div>
          </Card>

          {/* Templates importés par catégorie */}
          {(() => {
            const TYPE_CONFIG = [
              { id: 'sgs', label: 'SGS — Système de Gestion de la Sécurité', icon: Brain },
              { id: 'certification', label: 'Certification', icon: FileText },
              { id: 'surveillance', label: 'Surveillance continue', icon: ClipboardList },
              { id: 'homologation', label: 'Homologation', icon: FileText },
              { id: 'validation', label: 'Validation de site', icon: Target },
              { id: 'helistation', label: 'Hélistation', icon: FileText },
            ] as const

            const classifyChecklist = (key: string, domaines: DomaineChecklist[]): string => {
              // Source de vérité : type/catégorie persistés lors de l'import (wizard)
              const latest = (supaByTheme[key] || [])[0]
              if (latest) {
                switch (latest.type) {
                  case 'HMG': return 'homologation'
                  case 'QSC': return 'surveillance'
                  case 'VALIDATION_SITE': return 'validation'
                  case 'SGS': return 'sgs'
                  case 'IT':
                  case 'SOP':
                  case 'COP': return 'certification'
                  default: break
                }
              }
              if (latest?.categorie) {
                switch (latest.categorie) {
                  case 'homologation': return 'homologation'
                  case 'certification': return 'certification'
                  case 'surveillance_continue': return 'surveillance'
                  case 'validation_site': return 'validation'
                  default: break
                }
              }
              const items = domaines.flatMap(d => d.items || [])
              const domainCodes = domaines.map(d => d.nom)
              const prefixes = new Set(items.map(i => i.numero?.split('-')[0]).filter(Boolean))
              if (prefixes.has('CERT')) return 'certification'
              if (prefixes.has('HMG')) return 'homologation'
              if (domainCodes.length > 0 && domainCodes.every(d => d === 'SGS')) return 'sgs'
              if (items.some(i => (i as any).type_entite_cible === 'helistation')) return 'helistation'
              return 'surveillance'
            }

            // Fusionner templates actifs + archivés (si showArchived)
            const allChecklists = { ...masterChecklists }
            if (showArchived) Object.assign(allChecklists, archivedMasterChecklists)

            const grouped: Record<string, { key: string; domaines: string[]; itemsCount: number; archived?: boolean; version?: string; updatedAt?: string; updatedByName?: string; versionsCount?: number }[]> = {}
            for (const [key, domaines] of Object.entries(allChecklists)) {
              if (templateSearch) {
                const term = templateSearch.toLowerCase()
                if (!key.toLowerCase().includes(term) && !domaines.some(d => d.nom.toLowerCase().includes(term))) continue
              }
              const type = classifyChecklist(key, domaines)
              if (templateFilterType !== 'tous' && type !== templateFilterType) continue
              if (templateFilterDomaine !== 'tous' && !domaines.some(d => d.nom === templateFilterDomaine.toUpperCase())) continue
              if (!grouped[type]) grouped[type] = []
              const itemsCount = domaines.reduce((acc, d) => acc + (d.items?.length || 0) + (d.sousDomaines?.reduce((a, sd) => a + (sd.items?.length || 0), 0) || 0), 0)
              const domaineLabels = [...new Set(domaines.map(d => d.nom))]
              const supa = supaByTheme[key] || []
              const latest = supa[0]
              grouped[type].push({
                key,
                domaines: domaineLabels,
                itemsCount,
                archived: !!archivedMasterChecklists[key],
                version: latest?.version,
                updatedAt: latest?.updated_at,
                updatedByName: (latest?.metadonnees as any)?.updated_by_name || '',
                versionsCount: supa.length,
              })
            }

            const totalVisible = Object.values(grouped).reduce((acc, entries) => acc + entries.length, 0)

            return totalVisible === 0 ? (
              <Card title="Templates" icon={<FileText className="w-4 h-4 text-role-primary" />}>
                <p className="text-sm text-foreground/60 py-4 text-center">
                  {showArchived ? 'Aucun template (actif ou archivé) trouvé.' : 'Aucun template trouvé.'}
                </p>
              </Card>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {TYPE_CONFIG.map(ct => {
                  const entries = grouped[ct.id] || []
                  if (entries.length === 0) return null
                  return (
                    <AccordionSection
                      key={ct.id}
                      title={
                        <div className="flex items-center gap-3">
                          <ct.icon className="w-5 h-5 text-role-primary" />
                          <span className="text-sm font-medium text-foreground">{ct.label}</span>
                        </div>
                      }
                      badges={[`${entries.length} template${entries.length > 1 ? 's' : ''}`]}
                      defaultOpen={true}
                    >
                      {entries.map(e => {
                        const isArchived = e.archived
                        return (
                          <div key={e.key} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${isArchived ? 'opacity-60 hover:opacity-100 bg-muted/10' : 'hover:bg-muted/30'}`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono text-foreground">{e.key}</span>
                                <span className="text-xs text-muted-foreground">— {e.itemsCount} item{e.itemsCount > 1 ? 's' : ''}</span>
                                {e.version && <span className="text-[10px] px-1.5 py-0.5 rounded bg-role-primary-soft/40 text-role-primary font-medium">v{e.version}</span>}
                                {isArchived && <span className="badge neutral text-[10px]">Archivé</span>}
                                {(e.versionsCount || 0) > 1 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-medium">{e.versionsCount} versions</span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {e.domaines.map(d => (
                                  <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-primary-soft/50 text-role-primary">{d}</span>
                                ))}
                              </div>
                              {(e.updatedAt || e.updatedByName) && (
                                <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  {e.updatedAt && <span>{formatDate(e.updatedAt)}</span>}
                                  {e.updatedByName && <span>— modifié par {e.updatedByName}</span>}
                                </div>
                              )}
                              {(e.versionsCount || 0) > 1 && (
                                <details className="mt-1.5">
                                  <summary className="text-[10px] text-role-primary cursor-pointer hover:underline">Historique des versions</summary>
                                  <div className="mt-1 space-y-0.5">
                                    {(supaByTheme[e.key] || []).map(t => (
                                      <div key={t.id} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                        <span className="font-mono">v{t.version || '—'}</span>
                                        <span className={`px-1 rounded ${t.actif ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>{t.actif ? 'actif' : t.etat}</span>
                                        <span>{formatDate(t.updated_at || t.created_at)}</span>
                                        {((t.metadonnees as any)?.updated_by_name || (t.metadonnees as any)?.created_by_name) && (
                                          <span>— {((t.metadonnees as any)?.updated_by_name || (t.metadonnees as any)?.created_by_name)}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {(e.versionsCount || 0) > 1 && (
                                <button className="action-button" onClick={() => setShowVersionHistory(e.key)} title="Historique des versions"><History className="w-3.5 h-3.5" /></button>
                              )}
                              {!isArchived && (
                                <>
                                  <button className="action-button" onClick={() => router.push(`/kit-checklist/${e.key}`)} title="Modifier"><Edit3 className="w-3.5 h-3.5" /></button>
                                  {ct.id === 'sgs' && (
                                    <button className="action-button" title="Importer un formulaire rempli" onClick={() => {
                                      const input = document.createElement('input')
                                      input.type = 'file'
                                      input.accept = '.docx'
                                      input.onchange = async (ev: any) => {
                                        const file = ev.target?.files?.[0]
                                        if (!file) return
                                        try {
                                          const { parseSGSFormDOCX } = await import('@/lib/services/sgsFormRoundtrip')
                                          const { itemStates } = await parseSGSFormDOCX(file)
                                          const hierarchie = (allChecklists[e.key] as any[]).map((d: any) => ({
                                            ...d,
                                            items: (d.items || []).map((it: any) => {
                                              const state = it.numero ? itemStates[it.numero] : undefined
                                              if (!state) return it
                                              const { commentaire, ...paoe } = state
                                              return { ...it, paoe: { ...(it.paoe || {}), ...paoe }, commentaire: commentaire || it.commentaire }
                                            }),
                                          }))
                                          setMasterChecklist(e.key, hierarchie)
                                          addNotification({ user_id: '', type: 'success', title: 'Formulaire importé', message: `${Object.keys(itemStates).length} indicateur(s) mis à jour sur ${e.key}`, canal: 'in_app' })
                                        } catch (err: any) {
                                          addNotification({ user_id: '', type: 'danger', title: 'Échec de l\'import', message: err?.message || 'Fichier illisible', canal: 'in_app' })
                                        }
                                      }
                                      input.click()
                                    }}><Upload className="w-3.5 h-3.5" /></button>
                                  )}
                                  <div className="relative inline-block">
                                    <button className="action-button" onClick={(ev) => { ev.stopPropagation(); const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect(); setExportMenuRect({ top: rect.bottom + 4, right: rect.right }); setExportMenuOpen(exportMenuOpen === e.key ? null : e.key) }} title="Exporter"><Download className="w-3.5 h-3.5" /></button>
                                    {exportMenuOpen === e.key && exportMenuRect && createPortal(
                                      <>
                                        <div className="fixed inset-0 z-[199]" onClick={() => { setExportMenuOpen(null); setExportMenuRect(null) }} />
                                        <div className="fixed z-[200] bg-background border border-border rounded-xl shadow-lg py-1 min-w-[120px]" style={{ left: Math.max(0, exportMenuRect.right - 130) + 'px', top: exportMenuRect.top + 'px' }}>
                                          <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 flex items-center gap-2 whitespace-nowrap" onClick={async (ev) => {
                                            ev.stopPropagation(); setExportMenuOpen(null); setExportMenuRect(null)
                                            const hierarchie = allChecklists[e.key] as any[]
                                            const m = await import('@/lib/services/exportChecklist')
                                            let sgsTemplate: Record<string, any> | undefined
                                            if (ct.id === 'sgs') {
                                              const { buildSGSTemplateFromImport } = await import('@/lib/services/checklistParser')
                                              sgsTemplate = buildSGSTemplateFromImport(hierarchie as any, e.key)
                                            }
                                            m.exportChecklistPDF(hierarchie, { titre: e.key, code: e.key, portee: e.domaines, sgsTemplate })
                                          }}>
                                            <Download className="w-3 h-3" /> PDF
                                          </button>
                                          <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 flex items-center gap-2 whitespace-nowrap" onClick={async (ev) => {
                                            ev.stopPropagation(); setExportMenuOpen(null); setExportMenuRect(null)
                                            const hierarchie = allChecklists[e.key] as any[]
                                            const m = await import('@/lib/services/documentTemplater')
                                            let sgsTemplate: Record<string, any> | undefined
                                            if (ct.id === 'sgs') {
                                              const { buildSGSTemplateFromImport } = await import('@/lib/services/checklistParser')
                                              sgsTemplate = buildSGSTemplateFromImport(hierarchie as any, e.key)
                                            }
                                            m.exportChecklistDOCX(hierarchie, { titre: e.key, code: e.key, portee: e.domaines, aerodrome: '', sgsTemplate })
                                          }}>
                                            <FileText className="w-3 h-3" /> Word
                                          </button>
                                          {ct.id === 'sgs' && (
                                            <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 flex items-center gap-2 whitespace-nowrap" onClick={async (ev) => {
                                              ev.stopPropagation(); setExportMenuOpen(null); setExportMenuRect(null)
                                              const hierarchie = allChecklists[e.key] as any[]
                                              const { buildSGSTemplateFromImport } = await import('@/lib/services/checklistParser')
                                              const sgsTemplate = buildSGSTemplateFromImport(hierarchie as any, e.key)
                                              // Pré-remplir avec les états P/A/O/E déjà enregistrés sur les items (si l'inspecteur a déjà travaillé dessus)
                                              const itemStates: Record<string, any> = {}
                                              for (const d of hierarchie) {
                                                for (const it of (d.items || [])) {
                                                  if (it.numero && (it.paoe || it.commentaire)) {
                                                    itemStates[it.numero] = { ...(it.paoe || {}), commentaire: it.commentaire || it.observation || '' }
                                                  }
                                                }
                                              }
                                              const { exportSGSFormDOCX } = await import('@/lib/services/sgsFormRoundtrip')
                                              exportSGSFormDOCX(hierarchie, sgsTemplate, { titre: e.key, code: e.key, aerodrome: '' }, itemStates)
                                            }}>
                                              <FileText className="w-3 h-3" /> Formulaire (cases à cocher)
                                            </button>
                                          )}
                                        </div>
                                      </>,
                                      document.body
                                    )}
                                  </div>
                                  {(e.versionsCount || 0) > 1 && (
                                    <button className="action-button" onClick={() => setShowVersionHistory(e.key)} title="Historique versions"><Clock className="w-3.5 h-3.5" /></button>
                                  )}
                                  <button className="action-button text-warning hover:text-warning" onClick={() => { if (confirm(`Archiver le template ${e.key} ?`)) archiveMasterChecklist(e.key); }} title="Archiver"><Archive className="w-3.5 h-3.5" /></button>
                                  <button className="action-button text-danger hover:text-danger" onClick={() => { if (confirm(`Supprimer définitivement le template ${e.key} ? Cette action est irréversible.`)) deleteMasterChecklist(e.key); }} title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                              {isArchived && (
                                <>
                                  <button className="action-button" onClick={() => unarchiveMasterChecklist(e.key)} title="Restaurer"><RefreshCw className="w-3.5 h-3.5" /></button>
                                  <button className="action-button text-danger hover:text-danger" onClick={() => { if (confirm(`Supprimer définitivement le template ${e.key} ? Cette action est irréversible.`)) deleteMasterChecklist(e.key); }} title="Supprimer définitivement"><Trash2 className="w-3.5 h-3.5" /></button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </AccordionSection>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}
      {/* Contenu Documents */}
      {/* Contenu Documents */}
      {sousTab === 'documents' && (<>
      {/* Barre d'outils */}
      <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un document..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>
          <select
            value={filters.type}
            onChange={(e) => setFilters({...filters, type: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous types</option>
            {TYPES_DOCUMENTS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select
            value={filters.domaine}
            onChange={(e) => setFilters({...filters, domaine: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous domaines</option>
            {DOMAINES.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <select
            value={filters.etat}
            onChange={(e) => setFilters({...filters, etat: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous états</option>
            {ETATS_DOCUMENT.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          <select
            value={filters.accessible}
            onChange={(e) => setFilters({...filters, accessible: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous accès</option>
            <option value="oui">Accessible exploitant</option>
            <option value="non">Non accessible</option>
          </select>
          <div className="view-toggle">
            <button className={viewMode === 'liste' ? 'active' : ''} onClick={() => setViewMode('liste')}>
              <List className="w-4 h-4" /> Liste
            </button>
            <button className={viewMode === 'grille' ? 'active' : ''} onClick={() => setViewMode('grille')}>
              <Grid3x3 className="w-4 h-4" /> Grille
            </button>
            </div>
          </div>
      </Card>

      {/* Vue Liste avec accordéons maison */}
      {viewMode === 'liste' && (
        <AccordionGroup spacing="sm">
          {TYPES_DOCUMENTS.map(type => {
            const docs = documentsParType[type.id] || [];
            if (docs.length === 0) return null;

          return (
            <AccordionSection
              key={type.id}
              icon={getTypeIcon(type.id, "w-5 h-5")}
              title={type.label}
              badges={
                <div className="flex items-center gap-2">
                  <span className="badge outline">{docs.length} document(s)</span>
                  {docs.filter(d => d.etat === 'en_revision').length > 0 && (
                    <span className="badge warning">
                      {docs.filter(d => d.etat === 'en_revision').length} en révision
                    </span>
                  )}
                </div>
              }
            >
                    <DataTable
                      data={docs}
                      columns={columnsDef}
                      keyExtractor={(doc) => doc.id}
                      headerClassName="text-foreground font-semibold"
                      emptyState={{ icon: FileText, title: 'Aucun document' }}
                    />
            </AccordionSection>
          );
          })}
        </AccordionGroup>
      )}

      {/* Vue Grille */}
      {viewMode === 'grille' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map(doc => {
            const type = TYPES_DOCUMENTS.find(t => t.id === doc.type_document);
            const headerBgClass = getHeaderBgClass(doc.type_document);
            
            return (
              <div key={doc.id} className="card hover:shadow-role-glow transition-all overflow-hidden">
                <div className={`card-header pb-2 ${headerBgClass}`}>
                  <div className="card-title text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(doc.type_document, "w-4 h-4")}
                      <span className="truncate">{type?.label}</span>
                    </div>
                    {getEtatBadge(doc.etat)}
                  </div>
                </div>
                <div className="card-content p-3 space-y-3">
                  <div>
                    <p className="font-medium text-foreground line-clamp-2">{doc.nom}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.resume}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {doc.domaines?.map((d: string) => (
                      <span key={d} className="badge outline text-[10px]">{d}</span>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      {doc.date_revision ? new Date(doc.date_revision).toLocaleDateString('fr-FR') : '-'}
                    </div>
                    <span className="badge outline">{doc.version}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Download className="w-3 h-3" />
                      {doc.telechargements}
                    </div>
                    <div className="flex gap-1">
                      <button className="action-button h-7 w-7 p-0" onClick={() => handleDownload(doc)} title="Télécharger">
                        <Download className="w-3 h-3" />
                      </button>
                      <button className="action-button h-7 w-7 p-0" onClick={() => { setSelectedDocument(doc); setShowDetails(true); }} title="Voir détails">
                        <Eye className="w-3 h-3" />
                      </button>
                      <button className="action-button h-7 w-7 p-0" onClick={() => handleEdit(doc)} title="Modifier">
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button className="action-button h-7 w-7 p-0" onClick={() => handleDelete(doc.id)} title="Supprimer">
                        <Trash2 className="w-3 h-3 text-danger" />
                      </button>
                      {doc.extraits && doc.extraits.length > 0 && (
                        <span className="badge outline text-[10px]">{doc.extraits.length} extrait(s)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Historique des versions */}
      {showVersionHistory && createPortal(
        <div className="modal-overlay" onClick={() => setShowVersionHistory(null)}>
          <div className="form-shell-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="form-shell-inner" data-role={userRole}>
              <div className="form-shell-header">
                <div className="form-shell-title">
                  <span className="form-shell-icon-wrap">
                    <Clock className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <span className="form-shell-title-text">Historique des versions</span>
                    <span className="form-shell-subtitle">{showVersionHistory}</span>
                  </div>
                </div>
                <button className="modal-close" onClick={() => setShowVersionHistory(null)} aria-label="Fermer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="form-shell-body space-y-3">
                {(() => {
                  const versions = (supaByTheme[showVersionHistory] || [])
                  if (versions.length === 0) {
                    return <p className="text-sm text-muted-foreground">Aucun historique de version pour ce template.</p>
                  }
                  return versions.map((v, i) => (
                    <div key={v.id} className="flex items-start gap-3 p-3 rounded-lg border border-border">
                      <div className="w-8 h-8 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-role-primary">v{v.version}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${v.actif ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>{v.actif ? 'actif' : v.etat}</span>
                          {i === 0 && <span className="text-[10px] text-muted-foreground">dernière version</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(v.updated_at || v.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {((v.metadonnees as any)?.updated_by_name || (v.metadonnees as any)?.created_by_name) && ` — par ${(v.metadonnees as any)?.updated_by_name || (v.metadonnees as any)?.created_by_name}`}
                        </p>
                        <p className="text-xs text-foreground mt-1">
                          {(v.hierarchie || []).length} domaine{(v.hierarchie || []).length > 1 ? 's' : ''} : {[...new Set((v.hierarchie || []).map((d: any) => d.nom))].join(', ')}
                        </p>
                        {v.source_fichier && <p className="text-[10px] text-muted-foreground mt-0.5">Fichier : {v.source_fichier}</p>}
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showGenModal && createPortal(
        <div className="modal-overlay" onClick={() => setShowGenModal(false)}>
          <div className="form-shell-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="form-shell-inner" data-role={userRole} data-module="kit-generate-modal">
              <div className="form-shell-header">
                <div className="form-shell-title">
                  <span className="form-shell-icon-wrap">
                    <ClipboardList className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <span className="form-shell-title-text">Générer une checklist</span>
                    <span className="form-shell-subtitle">Sélectionnez les domaines à inclure dans la checklist</span>
                  </div>
                </div>
                <button className="modal-close" onClick={() => setShowGenModal(false)} aria-label="Fermer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="form-shell-body space-y-5">
                {/* Mode de génération */}
                <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <PenSquare className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-blue-800">Mode génération manuelle — Vous contrôlez tout</span>
                </div>

                {/* Type d'entité */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">Type d'entité</label>
                  <select
                    value={genTypeEntite}
                    onChange={(e) => setGenTypeEntite(e.target.value as 'aerodrome' | 'helistation' | 'mixte')}
                    className="form-select w-full"
                  >
                    {TYPE_AERODROME_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label} — {opt.description}</option>
                    ))}
                  </select>
                </div>

                {/* Type de surveillance */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">Type de surveillance</label>
                  <select
                    value={genTypeSurveillance}
                    onChange={(e) => setGenTypeSurveillance(e.target.value as 'periodique' | 'inopine' | 'maintien')}
                    className="form-select w-full"
                  >
                    {TYPE_SURVEILLANCE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label} — {opt.description}</option>
                    ))}
                  </select>
                </div>

                

                {/* Sélection des domaines */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">Domaines à inclure</label>
                  <div className="space-y-2">
                    {DOMAINES_DISPONIBLES.map(d => {
                      const selected = genPortee.includes(d.code)
                      return (
                        <label key={d.code} className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                          d.code === 'AGA' && selected ? 'border-purple-300 bg-purple-50' :
                          selected ? 'border-role-primary/30 bg-role-primary-soft/15' : 'border-border hover:bg-role-primary-soft/10'
                        }`}>
                          <input type="checkbox" checked={selected} onChange={() => {
                            if (d.code === 'AGA') {
                              setGenPortee(selected ? [] : ['AGA'])
                            } else {
                              setGenPortee(prev => {
                                const next = selected ? prev.filter(p => p !== d.code) : [...prev, d.code]
                                return next.includes('AGA') ? next.filter(p => p !== 'AGA') : next
                              })
                            }
                          }} className="form-checkbox rounded" />
                          <div>
                            <span className={`text-sm font-semibold ${d.code === 'AGA' ? 'text-purple-700' : 'text-foreground'}`}>{d.code}</span>
                            <span className="text-xs text-muted-foreground ml-2">{d.label}</span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Instructions pour l'IA */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">
                    Instructions pour l'IA
                    <span className="text-muted-foreground font-normal ml-1">(optionnel)</span>
                  </label>
                  <textarea
                    value={genInstructions}
                    onChange={(e) => setGenInstructions(e.target.value)}
                    placeholder="Exemples d'instructions :
- Nombre de questions: 15-20 par domaine
- Focus documentaire: Doc 9137 Partie 1, RAS 14 Vol II
- Priorités: balisage lumineux, extincteurs, aire de manœuvre
- Points critiques: vérification des feux de piste, état des pistes..."
                    className="form-textarea w-full h-28 text-sm"
                    rows={4}
                  />
                  <div className="text-[10px] text-muted-foreground mt-2 space-y-1">
                    <p><strong>Vous pouvez préciser :</strong></p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Le nombre de questions souhaité par domaine</li>
                      <li>Les documents de référence à consulter en priorité</li>
                      <li>Les points spécifiques à vérifier en priorité</li>
                      <li>Le type de focus (technique, documentaire, opérationnel)</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="form-shell-footer">
                <button onClick={() => setShowGenModal(false)} className="btn btn-secondary">Annuler</button>
                <button onClick={handleGenerateChecklist} disabled={genPortee.length === 0 || genLoading}
                  className="btn btn-primary gap-1.5">
                  {genLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <LayoutList className="w-3.5 h-3.5" />}
                  Générer ({genPortee.length} domaine{genPortee.length > 1 ? 's' : ''})
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Import modèle ANACIM */}
      {showImportModal && createPortal(
        <div className="modal-overlay" onClick={() => { setShowImportModal(false); setImportPreview(null); setImportError(null); setImportStep('upload'); }}>
          <div className="form-shell-content max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="form-shell-inner">
              <div className="form-shell-header">
                <div className="form-shell-title">
                  <span className="form-shell-icon-wrap">
                    <Upload className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <span className="form-shell-title-text">Importer un modèle ANACIM</span>
                    <span className="form-shell-subtitle">Fichier .docx — IT, SOP, QSC, SGS, Validation de site</span>
                  </div>
                </div>
                <button className="modal-close" onClick={() => { setShowImportModal(false); setImportPreview(null); setImportError(null); setImportStep('upload'); }} aria-label="Fermer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="form-shell-body">
                <div className="flex items-center gap-2 mb-4 text-xs">
                  {[
                    { id: 'upload', label: '1. Fichier' },
                    { id: 'config', label: '2. Configuration' },
                    { id: 'confirmation', label: '3. Validation' },
                  ].map((s, i) => (
                    <React.Fragment key={s.id}>
                      {i > 0 && <div className={`h-px flex-1 ${importStep === s.id ? 'bg-role-primary' : 'bg-border'}`} />}
                      <span className={`px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${importStep === s.id ? 'bg-role-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                        {s.label}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
                {importError && (
                  <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg flex items-center gap-2 text-sm text-danger">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {importError}
                    <button onClick={() => setImportError(null)} className="ml-auto p-1 hover:bg-danger/20 rounded">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {importStep === 'upload' && (<>
                  {!importPreview && !importParsing && (
                  <div
                    className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
                      ${importDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-gray-50'}`}
                    onDragOver={e => { e.preventDefault(); setImportDragOver(true) }}
                    onDragLeave={() => setImportDragOver(false)}
                    onDrop={e => { e.preventDefault(); setImportDragOver(false); if (e.dataTransfer.files[0]) handleImportFile(e.dataTransfer.files[0]) }}
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = '.docx'
                      input.onchange = (e: any) => { if (e.target?.files?.[0]) handleImportFile(e.target.files[0]) }
                      input.click()
                    }}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">Déposer un fichier .docx ici</p>
                      <p className="text-xs text-muted-foreground">Modèles Word ANACIM officiels (IT, SOP, QSC, SGS, Validation de site)</p>
                    </div>
                  </div>
                )}

                {importParsing && (
                  <div className="flex flex-col items-center gap-2 py-12">
                    <RefreshCw className="w-8 h-8 text-role-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Analyse du document en cours...</p>
                  </div>
                )}
                </>)}

                {/* Étape 2 — Configuration */}
                {importStep === 'config' && importPreview && (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-foreground">{importPreview.template.nom}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{importPreview.filename}</p>
                      </div>
                    </div>

                    {/* Famille métier */}
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-role-primary" />
                        Famille de la checklist
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {IMPORT_CATEGORIES.map(cat => (
                          <button key={cat.value}
                            onClick={() => setImportCategorie(cat.value)}
                            className={`p-2.5 rounded-xl border text-left transition-colors ${importCategorie === cat.value ? 'border-role-primary bg-role-primary-soft/10 shadow-[0_0_0_1px_var(--role-primary)]' : 'border-border hover:border-role-primary/40 bg-background'}`}
                          >
                            <span className="block text-xs font-semibold text-foreground">{cat.label}</span>
                            <span className="block text-[10px] text-muted-foreground mt-0.5">{cat.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Détails selon la famille */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-role-primary-soft/20 rounded-xl">
                      <div className="col-span-2 sm:col-span-1">
                        <p className="text-xs text-muted-foreground mb-1">Type</p>
                        {importCategorie === 'certification' && (
                          <div className="flex flex-wrap gap-1.5">
                            {CERTIFICATION_SUBTYPES.map(st => (
                              <button key={st.value}
                                onClick={() => setImportSousType(st.value)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${importSousType === st.value ? 'bg-role-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                                {st.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {importCategorie === 'certification' && importSousType === 'IT' && (
                          <div className="mt-2">
                            <p className="text-[10px] text-muted-foreground mb-1.5">
                              Domaine(s) couvert(s) par ce fichier (un fichier par domaine, ou combinés — ex. ELEC + MFP) :
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {['PHY', 'ELEC', 'MFP', 'OLS', 'SLI', 'RA'].map(d => (
                                <button key={d}
                                  onClick={() => setImportITDomaines(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${importITDomaines.includes(d) ? 'bg-role-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                                  {d}
                                </button>
                              ))}
                              {importITDomaines.length === 0 && (
                                <span className="text-[10px] text-muted-foreground self-center italic">Aucun sélectionné → IT_CHKLIST_GENERAL</span>
                              )}
                            </div>
                          </div>
                        )}
                        {(importCategorie === 'homologation' || importCategorie === 'validation_site') && (
                          <div className="flex flex-wrap gap-1.5">
                            {(['aerodrome', 'helistation'] as const).map(t => (
                              <button key={t} onClick={() => setImportTypeEntite(t)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${importTypeEntite === t ? 'bg-role-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                                {t === 'aerodrome' ? 'Aérodrome' : 'Hélistation'}
                              </button>
                            ))}
                          </div>
                        )}
                        {importCategorie === 'surveillance_continue' && (
                          <div className="flex flex-wrap gap-1.5">
                            {(['certifie', 'homologue'] as const).map(r => (
                              <button key={r} onClick={() => setImportRegime(r)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${importRegime === r ? 'bg-role-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                                {r === 'certifie' ? 'Certifié' : 'Homologué'}
                              </button>
                            ))}
                          </div>
                        )}
                        {importCategorie === 'autres' && (
                          <input
                            value={importCodeLibre}
                            onChange={e => setImportCodeLibre(e.target.value)}
                            placeholder="Code libre (ex: ETUDE_SECURITE)"
                            className="w-full h-7 text-xs px-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)]"
                          />
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Code</p>
                        <p className="text-sm font-medium text-foreground font-mono">{computeImportIdentity().code}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Version</p>
                        <input
                          value={importVersion}
                          onChange={e => setImportVersion(e.target.value)}
                          placeholder={importPreview.template.version || '1.0'}
                          className="w-full h-7 text-xs px-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)]"
                        />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Date d'édition</p>
                        <input
                          type="date"
                          value={importEditionDate}
                          onChange={e => setImportEditionDate(e.target.value)}
                          className="w-full h-7 text-xs px-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)]"
                        />
                      </div>
                    </div>
                      <div className="col-span-1 sm:col-span-2">
                        <p className="text-xs text-muted-foreground mb-1">
                          Portée
                          <button
                            onClick={() => setPorteeManuallyEdited(false)}
                            className="text-role-primary text-[10px] ml-2 underline hover:no-underline"
                            title="Réinitialiser depuis les sections"
                          >
                            auto
                          </button>
                        </p>
                        <div className="flex flex-wrap gap-1 mb-1">
                          {importPorteeEdit.map(code => (
                            <span key={code}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-role-primary-soft/20 text-role-primary">
                              {code}
                              <button
                                onClick={() => {
                                  setImportPorteeEdit(prev => prev.filter(c => c !== code))
                                  setPorteeManuallyEdited(true)
                                }}
                                className="hover:text-danger transition-colors"
                                title="Retirer ce domaine"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                          {importPorteeEdit.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">Aucun domaine</span>
                          )}
                        </div>
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) {
                              setImportPorteeEdit(prev => [...new Set([...prev, e.target.value])])
                              setPorteeManuallyEdited(true)
                            }
                          }}
                          className="w-full h-7 text-xs px-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] appearance-none cursor-pointer"
                          style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3e%3cpath fill=%27none%27 stroke=%27%23343a40%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27M2 5l6 6 6-6%27/%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.3rem center', backgroundSize: '10px' }}
                        >
                          <option value="">+ Ajouter un domaine...</option>
                          {getDomainesIndividuelsCodes().filter(c => !importPorteeEdit.includes(c)).map(code => (
                            <option key={code} value={code}>{code}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Items</p>
                        <p className="text-sm font-medium text-foreground">
                          {importPreview.hierarchie.reduce((s: number, d: any) => s + totalItems(d), 0)}
                        </p>
                      </div>

                    {(importTypeEdit === 'SGS') && aerodromes.length > 0 && (
                      <div className="p-3 bg-role-primary-soft/10 rounded-xl border border-role-primary/20">
                        <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-role-primary" />
                          Enregistrer aussi comme template SGS pour un aérodrome
                        </p>
                        <select
                          value={importSGSAerodrome}
                          onChange={e => setImportSGSAerodrome(e.target.value)}
                          className={`w-full h-9 text-xs px-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] appearance-none cursor-pointer ${focusClass}`}
                          style={{ backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27%3e%3cpath fill=%27none%27 stroke=%27%23343a40%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27M2 5l6 6 6-6%27/%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center', backgroundSize: '12px', paddingRight: '2rem' }}
                        >
                          <option value="">Ne pas enregistrer (import standard uniquement)</option>
                          {aerodromes.map(a => (
                            <option key={a.id} value={a.id}>{a.nom} ({a.code_oaci})</option>
                          ))}
                        </select>
                        <p className="text-[10px] text-muted-foreground mt-1">Le template SGS servira pour l'évaluation PAOE dans SGSEvaluation</p>
                      </div>
                    )}

                    {importTypeEdit === 'SGS' ? (
                      <div className="max-h-80 overflow-y-auto space-y-2">
                        {(() => {
                          const allItems: any[] = []
                          for (const d of importPreview.hierarchie) {
                            allItems.push(...(d.items || []))
                            for (const sd of (d.sousDomaines || [])) {
                              allItems.push(...(sd.items || []))
                              for (const ssd of (sd.sousSousDomaines || [])) {
                                allItems.push(...(ssd.items || []))
                              }
                            }
                          }
                          const byElement: Record<string, any[]> = {}
                          for (const item of allItems) {
                            const parts = (item.numero || '').split('.')
                            if (parts.length < 2) continue
                            const eid = `${parts[0]}.${parts[1]}`
                            if (!byElement[eid]) byElement[eid] = []
                            byElement[eid].push(item)
                          }
                          const comps = SGS_COMPOSANTES_STRUCTURE
                            .map(comp => ({
                              ...comp,
                              elements: comp.elements.filter(el => (byElement[el.id]?.length || 0) > 0),
                            }))
                            .filter(comp => comp.elements.length > 0)
                          return comps.length > 0 ? comps.map(comp => (
                            <div key={comp.id} className="border border-role-primary/20 rounded-xl overflow-hidden">
                              <div className="px-3 py-2 bg-role-primary-soft/10 font-semibold text-xs text-foreground flex items-center gap-2">
                                <Shield className="w-3.5 h-3.5 text-role-primary" />
                                <span>Composante {comp.id} — {comp.label} <span className="text-muted-foreground font-normal">({comp.elements.reduce((s, el) => s + byElement[el.id].length, 0)} items)</span></span>
                              </div>
                              {comp.elements.map(el => (
                                <div key={el.id} className="border-t border-border/50">
                                  <div className="px-3 py-1.5 text-xs font-medium text-foreground bg-muted/20 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-role-primary" />
                                    Élément {el.id} — {el.label}
                                  </div>
                                  <div className="divide-y divide-border/30">
                                    {byElement[el.id].map((item: any) => (
                                      <div key={item.id || item.numero} className="px-3 py-1.5 flex items-start gap-2 text-xs">
                                        <span className="font-mono text-muted-foreground shrink-0 mt-0.5 min-w-[3rem]">{item.numero}</span>
                                        <span className="text-foreground">{item.point_verification || item.description || ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )) : (
                            <div className="text-xs text-muted-foreground text-center py-4">
                              Aucun élément SGS structuré trouvé. {allItems.length} item(s) non groupés.
                            </div>
                          )
                        })()}
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-60 overflow-y-auto">
                        {importPreview.hierarchie.map((d: any, i: number) => {
                          const overridden = importDomaineOverrides[i] ?? d.nom
                          const allCodes = [...new Set([
                            ...importPreview.hierarchie.map((x: any) => x.nom),
                            ...getDomainesIndividuelsCodes(),
                          ])].sort()
                          return (
                            <div key={d.id || i} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                <select
                                  value={overridden}
                                  onChange={e => setImportDomaineOverrides(prev => ({ ...prev, [i]: e.target.value }))}
                                  className="w-16 text-xs font-medium bg-transparent border border-dashed border-border rounded px-1 py-0.5 text-role-primary hover:border-role-primary focus:border-role-primary focus:outline-none cursor-pointer"
                                  title="Code domaine"
                                >
                                  {allCodes.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                                <span className="text-sm text-foreground truncate">{d.description || d.nom}</span>
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0 ml-2">{totalItems(d)} item{totalItems(d) > 1 ? 's' : ''}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Étape 3 — Validation */}
                {importStep === 'confirmation' && importPreview && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-role-primary/20 bg-role-primary-soft/10 p-4">
                      <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                        <ClipboardList className="w-3.5 h-3.5 text-role-primary" />
                        Récapitulatif
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Type</p>
                          <p className="font-medium text-foreground">{TYPE_LABELS[computeImportIdentity().type] || computeImportIdentity().type}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Code</p>
                          <p className="font-medium text-foreground font-mono">{computeImportIdentity().code}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Version</p>
                          <p className="font-medium text-foreground">{importVersion || importPreview.template.version || '1.0'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Domaine(s)</p>
                          <p className="font-medium text-foreground">
                            {(importPorteeEdit.length > 0 ? importPorteeEdit : [...new Set(importPreview.hierarchie.map((x: any) => x.nom))]).join(', ') || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        {importPreview.hierarchie.reduce((s: number, d: any) => s + totalItems(d), 0)} item(s) — {importCategorie === 'surveillance_continue' ? `régime ${importRegime}` : importCategorie === 'certification' && importSousType === 'IT' ? `IT — domaine(s) ${importITDomaines.length > 0 ? importITDomaines.join(' + ') : 'général (aucun sélectionné)'}` : importCategorie === 'certification' ? `sous-type ${importSousType}` : importCategorie === 'homologation' || importCategorie === 'validation_site' ? `type ${importTypeEntite}` : importCategorie} — fichier {importPreview.filename}
                      </div>
                    </div>

                    {checkingDup ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                        <RefreshCw className="w-4 h-4 animate-spin text-role-primary" />
                        Vérification des versions existantes...
                      </div>
                    ) : (
                      <>
                        {existingVersions.length > 0 && existingVersions.some(v => v.actif) ? (
                          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 space-y-3">
                            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                              Un template actif existe déjà ({existingVersions.find(v => v.actif)?.version || 'version ?'}) — {existingVersions.length} version(s) au total
                            </p>
                            {templateDiff && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground">Items existants</p>
                                  <p className="font-semibold text-foreground">{templateDiff.existingItems}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Items importés</p>
                                  <p className="font-semibold text-foreground">{templateDiff.incomingItems}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Ajoutés</p>
                                  <p className="font-semibold text-success">{templateDiff.added.length}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Retirés</p>
                                  <p className="font-semibold text-danger">{templateDiff.removed.length}</p>
                                </div>
                              </div>
                            )}
                            {templateDiff && (templateDiff.added.length + templateDiff.removed.length + templateDiff.modified.length) > 0 && (
                              <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                                {templateDiff.added.slice(0, 8).map((d, i) => (
                                  <div key={`a${i}`} className="flex items-start gap-2 text-foreground">
                                    <span className="shrink-0 px-1 rounded bg-success/15 text-success font-semibold">+</span>
                                    <span className="font-mono text-muted-foreground shrink-0">{d.numero}</span>
                                    <span className="truncate">{d.question}</span>
                                  </div>
                                ))}
                                {templateDiff.modified.slice(0, 8).map((d, i) => (
                                  <div key={`m${i}`} className="flex items-start gap-2 text-foreground">
                                    <span className="shrink-0 px-1 rounded bg-warning/15 text-warning font-semibold">~</span>
                                    <span className="font-mono text-muted-foreground shrink-0">{d.numero}</span>
                                    <span className="truncate"><span className="line-through opacity-60">{d.before}</span> → {d.after}</span>
                                  </div>
                                ))}
                                {templateDiff.removed.slice(0, 8).map((d, i) => (
                                  <div key={`r${i}`} className="flex items-start gap-2 text-foreground">
                                    <span className="shrink-0 px-1 rounded bg-danger/15 text-danger font-semibold">−</span>
                                    <span className="font-mono text-muted-foreground shrink-0">{d.numero}</span>
                                    <span className="truncate line-through opacity-60">{d.question}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2 items-center">
                              <button onClick={runDiffIA} disabled={diffIALoading}
                                className="btn btn-secondary gap-1.5">
                                {diffIALoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                                Comparaison détaillée IA
                              </button>
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => setImportDecision('replace')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${importDecision === 'replace' ? 'bg-role-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                                  Remplacer (archiver l'existant)
                                </button>
                                <button onClick={() => setImportDecision('keep')}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${importDecision === 'keep' ? 'bg-warning text-white' : 'bg-muted text-muted-foreground'}`}>
                                  Garder l'existant
                                </button>
                              </div>
                            </div>
                            {diffIA && (
                              <div className="text-xs text-foreground bg-background border border-border rounded-lg p-3 whitespace-pre-wrap">{diffIA}</div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-success/30 bg-success/5 p-3 text-sm text-foreground flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                            Aucun template actif existant pour ce type/code — import en création.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="form-shell-footer">
                <button onClick={() => { setShowImportModal(false); setImportPreview(null); setImportError(null); setImportStep('upload'); }}
                  className="btn btn-secondary">Annuler</button>
                {importStep === 'config' && importPreview && (
                  <button onClick={goToConfirmation} disabled={importing || checkingDup}
                    className="btn btn-primary gap-1.5">
                    {checkingDup ? <RefreshCw className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Continuer
                  </button>
                )}
                {importStep === 'confirmation' && importPreview && (
                  <>
                    <button onClick={() => setImportStep('config')} className="btn btn-secondary">
                      Retour
                    </button>
                    <button onClick={confirmImport} disabled={importing}
                      className="btn btn-primary gap-1.5">
                      {importing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {importDecision === 'keep' ? 'Fermer (garder l\'existant)' : (existingVersions.some(v => v.actif) ? 'Remplacer & importer' : 'Valider l\'import')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      </>)}
      {/* Modales — vrais composants React (pas d'appels de fonction) */}
      <KitDocForm showForm={showForm} setShowForm={setShowForm} resetForm={resetForm}
        selectedDocument={selectedDocument} isSubmitting={isSubmitting}
        handleSubmit={handleSubmit} formData={formData} setFormData={setFormData}
        formErrors={formErrors}
        userRole={userRole} focusClass={focusClass} selectStyle={selectStyle} />
      <DetailModal showDetails={showDetails} selectedDocument={selectedDocument}
        setShowDetails={setShowDetails} handleDownload={handleDownload}
        getTypeIcon={getTypeIcon} getEtatBadge={getEtatBadge} formatTaille={formatTaille}
        userRole={userRole} />
      <ShareModalAction showShareModal={showShareModal} selectedDocument={selectedDocument}
        setShowShareModal={setShowShareModal} updateKitDocument={updateKitDocument}
        addNotification={addNotification} user={user} userRole={userRole} />
    </div>
  );
}
