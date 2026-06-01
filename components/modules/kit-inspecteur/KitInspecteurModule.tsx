// components/modules/kit-inspecteur/KitInspecteurModule.tsx

// ✅ CDC 5.11 - Kit Inspecteur
// ✅ Base documentaire partageable avec exploitants
// ✅ Filtres par domaine, type, statut
// ✅ Classes du design system harmonisées
// ✅ 0 composant shadcn/ui
// ✅ CORRIGÉ - Import manquants et classes dynamiques fixes
// ✅ Analyse IA post-ajout (kitDocAgent)

'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  ChevronDown,
  Grid3x3,
  List,
  Tag,
  Brain,
  Database,
  Sparkles,
  AlertTriangle,
  AlertOctagon,
  Clock,
  X,
  ClipboardList,
  LayoutList,
  Target,
  PenSquare,
} from 'lucide-react';
import { useAppStore, type KitDocument, type TypeDocumentOACI, type FormatDocument, type DomaineChecklist } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { kitUtils } from '@/lib/kitUtils';
import { formatDate } from '@/lib/utils';
import { kitDocAgent, generateKitChecklist, type KitChecklistResult, type KitDocAnalysis } from '@/lib/ia/agents/kitDocAgent';
import { expandDomaines } from '@/lib/domaines';

interface KitInspecteurModuleProps {
  userRole: string;
}

// Types de documents (catégorie)
const TYPES_DOCUMENTS = [
  { id: 'reglementation', label: 'Réglementation', icon: FileText, color: 'primary' },
  { id: 'procedure', label: 'Procédure', icon: FileText, color: 'primary' },
  { id: 'checklist', label: 'Checklist', icon: FileText, color: 'success' },
  { id: 'modele_rapport', label: 'Modèle de rapport', icon: FileText, color: 'info' },
  { id: 'guide', label: 'Guide', icon: FileText, color: 'warning' },
  { id: 'autre', label: 'Autre', icon: FileText, color: 'neutral' },
];

// Types OACI de référence
const TYPES_OACI: { id: TypeDocumentOACI; label: string }[] = [
  { id: 'RAS-14', label: 'RAS 14 (Norme aérodromes)' },
  { id: 'Circulaires', label: 'Circulaires ANACIM' },
  { id: 'Guides', label: 'Guides OACI (Doc 9157, 9261...)' },
  { id: 'Checklists', label: 'Checklists officielles' },
  { id: 'Procédures', label: 'Procédures internes' },
  { id: 'Rapports', label: 'Rapports de surveillance' },
  { id: 'Formulaires', label: 'Formulaires ANACIM' },
];

// Formats de fichier
const FORMATS_FICHIER: { id: FormatDocument; label: string }[] = [
  { id: 'PDF', label: 'PDF' },
  { id: 'DOCX', label: 'Word (DOCX)' },
  { id: 'XLS', label: 'Excel (XLS/XLSX)' },
  { id: 'PPT', label: 'PowerPoint (PPT)' },
  { id: 'ZIP', label: 'Archive (ZIP)' },
];

// Domaines (alignés avec DOMAINES_SURVEILLANCE)
const DOMAINES = [
  { id: 'SGS', label: 'SGS — Système de Gestion de la Sécurité' },
  { id: 'SLI', label: 'SLI — Sauvetage et Lutte contre l\'Incendie' },
  { id: 'PHY', label: 'PHY — Caractéristiques Physiques' },
  { id: 'OLS', label: 'OLS — Surface de Limitation d\'Obstacles' },
  { id: 'RA', label: 'RA — Risque Animalier' },
  { id: 'ELEC', label: 'ELEC — Réseaux Électriques' },
  { id: 'MFP', label: 'MFP — Marques, Feux et Panneaux' },
  { id: 'COP', label: 'COP — Compétences Organisationnelles et Personnels' },
  { id: 'OPS', label: 'OPS — Procédures Opérationnelles' },
  { id: 'AGA', label: 'AGA — Tous domaines' },
];

// États
const ETATS_DOCUMENT = [
  { id: 'a_jour', label: 'À jour', icon: CheckCircle2, color: 'success' },
  { id: 'en_revision', label: 'En révision', icon: RefreshCw, color: 'warning' },
  { id: 'obsolete', label: 'Obsolète', icon: XCircle, color: 'danger' },
];

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

export default function KitInspecteurModule({ userRole }: KitInspecteurModuleProps) {
  const kitDocuments = useAppStore(s => s.kitDocuments);
  const user = useAppStore(s => s.user);
  const addKitDocument = useAppStore(s => s.addKitDocument);
  const updateKitDocument = useAppStore(s => s.updateKitDocument);
  const deleteKitDocument = useAppStore(s => s.deleteKitDocument);
  const incrementerTelechargement = useAppStore(s => s.incrementerTelechargement);
  const addNotification = useAppStore(s => s.addNotification);
  const importChecklistMemoryRecords = useAppStore(s => s.importChecklistMemoryRecords);
  const masterChecklists = useAppStore(s => s.masterChecklists);
  const setMasterChecklist = useAppStore(s => s.setMasterChecklist);
  const deleteMasterChecklist = useAppStore(s => s.deleteMasterChecklist);

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
  const [sousTab, setSousTab] = useState<'documents' | 'entrainement'>('documents');
  const [domainesOpen, setDomainesOpen] = useState(false);
  const domainesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (domainesRef.current && !domainesRef.current.contains(e.target as Node)) {
        setDomainesOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, []);

  const router = useRouter();

  // Analyse IA post-ajout
  const [analyseIA, setAnalyseIA] = useState<KitDocAnalysis | null>(null);
  const [analyseLoading, setAnalyseLoading] = useState(false);
  const [showAnalyse, setShowAnalyse] = useState(false);

  // Génération multi-docs (enrichie avec profil de risque)
  const [showGenModal, setShowGenModal] = useState(false);
  const [genPortee, setGenPortee] = useState<string[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genTypeAerodrome, setGenTypeAerodrome] = useState<'international' | 'national'>('national');
  const [genTypeSurveillance, setGenTypeSurveillance] = useState<'periodique' | 'inopine' | 'maintien'>('periodique');
  const [genInstructions, setGenInstructions] = useState('');

  // Import checklist ANACIM dans la mémoire IA
  const [importDoc, setImportDoc] = useState<KitDocument | null>(null);
  const [importItems, setImportItems] = useState<Awaited<ReturnType<typeof kitDocAgent.extractAnacimChecklistItems>>>([]);
  const [importLoading, setImportLoading] = useState(false);

  const handleImportAnacim = async (doc: KitDocument) => {
    setImportLoading(true);
    setImportDoc(doc);
    try {
      const items = await kitDocAgent.extractAnacimChecklistItems(doc.id);
      setImportItems(items);
    } catch (err) {
      console.error('[KitInspecteur] Erreur extraction checklist ANACIM:', err);
    } finally {
      setImportLoading(false);
    }
  };

  const handleConfirmImport = () => {
    if (importItems.length === 0 || !importDoc) return;
    importChecklistMemoryRecords(importItems);
    addNotification?.({ type: 'success', title: 'Import réussi', message: `${importItems.length} item(s) importé(s) dans la mémoire IA`, user_id: user?.id || '', canal: 'in_app' });
    setImportDoc(null);
    setImportItems([]);
  };

  // Escape key closes modal
  useEffect(() => {
    if (!showGenModal) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowGenModal(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showGenModal])

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
    { value: 'international', label: 'International', description: 'Certification ANACIM complète' },
    { value: 'national', label: 'National', description: 'Aérodrome domestique' },
  ];

  const TYPE_SURVEILLANCE_OPTIONS = [
    { value: 'periodique', label: 'Périodique', description: 'Surveillance planifiée régulière' },
    { value: 'inopine', label: 'Inopinée', description: 'Surveillance sans préavis' },
    { value: 'maintien', label: 'Maintien', description: 'Suivi des écarts et mesures correctives' },
  ];

  const handleGenerateChecklist = async () => {
    if (genPortee.length === 0) return
    setGenLoading(true)
    try {
      if (!kitDocAgent.isReady()) await kitDocAgent.init()
      const now = new Date();
      const mmYY = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getFullYear()).slice(-2)}`;
      const domaineCode = genPortee.includes('AGA') || genPortee.length >= 8 ? 'AGA' : genPortee.join('-');
      const existingIds = Object.keys(masterChecklists).filter(id => id.startsWith(`CHCKLI-${domaineCode}-${mmYY}`));
      const version = existingIds.length + 1;
      const generationId = `CHCKLI-${domaineCode}-${mmYY}-${String(version).padStart(2, '0')}`;
      
      const analysesDocs = kitDocAgent.getAnalysesForPortee(genPortee)
      const typeEntite: 'aerodrome' | 'helistation' | 'mixte' = genTypeAerodrome === 'international' ? 'aerodrome' : 'aerodrome'

      const result = generateKitChecklist({
        surveillance_id: generationId,
        entite_id: 'master',
        type_entite: typeEntite,
        type_surveillance: genTypeSurveillance,
        portee: genPortee,
        profil_risque: undefined,
        analyses_docs: analysesDocs.length > 0 ? analysesDocs : undefined,
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

  const trainingRecords = useAppStore(s => s.checklistMemoryRecords).filter(r => r.aerodrome_id === 'anacim_legacy');
  const trainingStats = useMemo(() => {
    const parDomaine: Record<string, number> = {}
    for (const r of trainingRecords) {
      parDomaine[r.domaine] = (parDomaine[r.domaine] || 0) + 1
    }
    const confianceMoyenne = trainingRecords.length > 0
      ? Math.round(trainingRecords.reduce((s, r) => s + (r.confiance || 0), 0) / trainingRecords.length)
      : 0
    return {
      total: trainingRecords.length,
      parDomaine,
      confianceMoyenne,
      avecResultat: trainingRecords.filter(r => r.dernier_resultat).length,
      masterCount: Object.keys(masterChecklists).length,
    }
  }, [trainingRecords, masterChecklists]);

  const parseItemDesc = (desc: string): string => {
    try { const p = JSON.parse(desc); return p.pv || desc; } catch { return desc; }
  };

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({...formData, fichier: e.target.files[0]});
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validerFormulaire()) return;
    setIsSubmitting(true);
    try {
      const fichierUrl = formData.fichier
        ? URL.createObjectURL(formData.fichier)
        : selectedDocument?.fichier_url;
      const documentData = {
        nom: formData.nom,
        type_document: formData.type_document,
        type_document_oaci: formData.type_document_oaci || undefined,
        format: formData.format || undefined,
        version: formData.version,
        date_revision: formData.date_revision,
        etat: formData.etat,
        domaines: formData.domaines,
        fichier_url: fichierUrl,
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
        await addKitDocument(newDoc);
        const freshDocs = useAppStore.getState().kitDocuments;
        const realDoc = freshDocs.find(d =>
          d.nom === newDoc.nom &&
          d.type_document === newDoc.type_document &&
          d.created_by === (newDoc.created_by ?? '')
        );
        savedDoc = (realDoc ?? { ...newDoc, id: crypto.randomUUID?.() ?? `doc_${Date.now()}` }) as KitDocument;
        if (!realDoc) {
          console.warn('[KitInspecteur] Document non retrouvé dans le store après addKitDocument — ID local généré');
        }
      }

      setShowForm(false);
      resetForm();

      const isRegulation = documentData.type_document === 'reglementation' ||
        documentData.type_document_oaci === 'RAS-14' ||
        documentData.type_document_oaci === 'Circulaires';

      if (isRegulation && savedDoc) {
        setAnalyseLoading(true);
        setShowAnalyse(true);
        try {
          if (!kitDocAgent.isReady()) await kitDocAgent.init();
          const analyse = await kitDocAgent.analyzeDocument(savedDoc);
          console.debug('[KitInspecteur] Analyse IA réussie:', analyse.reference_base, analyse.domaines_impactes);
          setAnalyseIA(analyse);

          const docId = savedDoc.id;
          if (docId && docId !== 'pending') {
            await updateKitDocument(docId, {
              reference_base: analyse.reference_base,
              extraits: analyse.extraits.map(e => ({
                reference: e.reference,
                titre: e.titre,
                contenu_resume: e.contenu_resume,
                statut: e.statut,
                domaines: e.domaines,
                type_entite_cible: e.type_entite_cible,
                seuil_numerique: e.seuil_numerique,
                source_document_id: e.source_document_id,
                detecte_le: e.detecte_le,
              })),
              ia_analyse_at: analyse.analysed_at,
              ia_impact: analyse.impact,
            } as any);
          } else {
            console.warn('[KitInspecteur] Document ID invalide, analyse persistée en mémoire uniquement');
          }

          useAppStore.getState().addNotification?.({
            user_id: user?.id || '',
            type: 'success',
            title: 'Analyse terminée',
            message: `Document "${savedDoc?.nom}" analysé. Le profil de risque sera appliqué lors du lancement d'une surveillance depuis le Planning.`,
            canal: 'in_app',
          });
        } catch (err) {
          console.error('[KitDocAgent] Erreur analyse:', err);
        } finally {
          setAnalyseLoading(false);
        }
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
    setDomainesOpen(false);
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
    if (doc.fichier_url) {
      window.open(doc.fichier_url, '_blank');
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

  const FormModal = () => (
    <FormShell
      open={showForm}
      onClose={() => { setShowForm(false); resetForm(); }}
      title={selectedDocument ? 'Modifier le document' : 'Ajouter un document'}
      icon={Briefcase}
      size="3xl"
      dataRole={userRole}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
            Annuler
          </button>
          <button type="submit" form="kit-document-form" disabled={isSubmitting} className="btn btn-primary gap-2">
            {isSubmitting ? 'Sauvegarde...' : (selectedDocument ? 'Modifier' : 'Ajouter')}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6" id="kit-document-form">
        <div className="form-grid grid-cols-2 gap-4">
          <div className="form-field col-span-2">
            <label className="filter-label">
              <FileText className="w-3 h-3 inline mr-1" />
              Nom du document *
            </label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({...formData, nom: e.target.value})}
              placeholder="Ex: RAS 14 - Section 9.2"
              className={`form-input w-full ${focusClass} ${formErrors.nom ? 'border-danger' : ''}`}
            />
            {formErrors.nom && <span className="field-error">{formErrors.nom}</span>}
          </div>

          <div className="form-field">
            <label className="filter-label">Catégorie *</label>
            <select
              value={formData.type_document}
              onChange={(e) => setFormData({...formData, type_document: e.target.value})}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              {TYPES_DOCUMENTS.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="filter-label">
              <Brain className="w-3 h-3 inline mr-1" />
              Type OACI / Référence
            </label>
            <select
              value={formData.type_document_oaci}
              onChange={(e) => setFormData({...formData, type_document_oaci: e.target.value as TypeDocumentOACI | ''})}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              <option value="">— Sélectionner (optionnel) —</option>
              {TYPES_OACI.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <p className="field-description">Améliore la détection automatique des références réglementaires</p>
          </div>

          <div className="form-field">
            <label className="filter-label">Version *</label>
            <input
              type="text"
              value={formData.version}
              onChange={(e) => setFormData({...formData, version: e.target.value})}
              placeholder="v1.0"
              className={`form-input w-full ${focusClass} ${formErrors.version ? 'border-danger' : ''}`}
            />
            {formErrors.version && <span className="field-error">{formErrors.version}</span>}
          </div>

          <div className="form-field">
            <label className="filter-label">Format</label>
            <select
              value={formData.format}
              onChange={(e) => setFormData({...formData, format: e.target.value as FormatDocument})}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              {FORMATS_FICHIER.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="filter-label">
              <Calendar className="w-3 h-3 inline mr-1" />
              Date de révision *
            </label>
            <input
              type="date"
              value={formData.date_revision}
              onChange={(e) => setFormData({...formData, date_revision: e.target.value})}
              className={`form-input w-full ${focusClass}`}
            />
          </div>

          <div className="form-field">
            <label className="filter-label">
              <RefreshCw className="w-3 h-3 inline mr-1" />
              État *
            </label>
            <select
              value={formData.etat}
              onChange={(e) => setFormData({...formData, etat: e.target.value})}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              {ETATS_DOCUMENT.map(e => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field col-span-2">
            <label className="filter-label">
              <Tag className="w-3 h-3 inline mr-1" />
              Domaines concernés *
            </label>
            <div ref={domainesRef} className="relative">
              <button
                type="button"
                onClick={() => setDomainesOpen(!domainesOpen)}
                className={`w-full h-10 flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-background text-foreground transition-all ${focusClass} ${formErrors.domaines ? 'border-danger' : ''} ${domainesOpen ? 'ring-2 ring-role-primary border-transparent' : ''}`}
                style={selectStyle}
              >
                <span className={formData.domaines.length === 0 ? 'text-muted-foreground' : 'text-foreground'}>
                  {formData.domaines.length === 0
                    ? '-- Sélectionner des domaines --'
                    : formData.domaines.map(d => DOMAINES.find(o => o.id === d)?.label || d).join(', ')}
                </span>
                <ChevronDown className={`w-4 h-4 ml-2 transition-transform shrink-0 ${domainesOpen ? 'rotate-180' : ''}`} />
              </button>

              {domainesOpen && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden">
                  <div className="max-h-60 overflow-y-auto">
                    {DOMAINES.map(d => {
                      const selected = formData.domaines.includes(d.id)
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setFormData({...formData, domaines: formData.domaines.filter(id => id !== d.id)})
                            } else {
                              setFormData({...formData, domaines: [...formData.domaines, d.id]})
                            }
                          }}
                          className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${selected ? 'bg-role-primary-soft text-role-primary font-medium' : 'text-foreground hover:bg-role-primary-soft'}`}
                        >
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            {formErrors.domaines && <span className="field-error">{formErrors.domaines}</span>}
          </div>

          <div className="form-field col-span-2">
            <label className="filter-label">
              <Tag className="w-3 h-3 inline mr-1" />
              Mots-clés
            </label>
            <input
              type="text"
              value={formData.mots_cles.join(', ')}
              onChange={(e) => setFormData({...formData, mots_cles: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
              placeholder="sgs, sécurité, inspection..."
              className={`form-input w-full ${focusClass}`}
            />
            <p className="field-description">Séparés par des virgules</p>
          </div>

          <div className="form-field col-span-2">
            <label className="filter-label">Résumé</label>
            <textarea
              value={formData.resume}
              onChange={(e) => setFormData({...formData, resume: e.target.value})}
              placeholder="Description succincte du document..."
              rows={3}
              className={`form-textarea w-full ${focusClass}`}
            />
          </div>

          <div className="form-field col-span-2">
            <label className="filter-label">
              <Upload className="w-3 h-3 inline mr-1" />
              Fichier *
            </label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-role-primary transition-colors">
              <input
                type="file"
                onChange={handleFileUpload}
                className="hidden"
                id="kit-fichier"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              />
              <label htmlFor="kit-fichier" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-small text-muted-foreground">
                  {formData.fichier ? formData.fichier.name : (selectedDocument?.fichier_nom || 'Cliquez pour ajouter un fichier')}
                </span>
                <span className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint (max 10 Mo)</span>
              </label>
            </div>
            {formErrors.fichier && <span className="field-error">{formErrors.fichier}</span>}
          </div>

          <div className="flex items-center gap-3 p-3 bg-role-primary-soft rounded-xl col-span-2">
            <input
              type="checkbox"
              id="accessible_exploitant"
              checked={formData.accessible_exploitant}
              onChange={(e) => setFormData({...formData, accessible_exploitant: e.target.checked})}
              className="form-checkbox"
            />
            <label htmlFor="accessible_exploitant" className="text-small cursor-pointer">
              Rendre accessible aux exploitants (visible dans leur portail)
            </label>
          </div>
        </div>
      </form>
    </FormShell>
  );

  const DetailModal = () => (
    <FormShell
      open={showDetails && !!selectedDocument}
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
          {selectedDocument?.ia_analyse_at && (
            <div className="text-xs text-muted-foreground mb-2">
              Analyse IA effectuée le {new Date(selectedDocument.ia_analyse_at).toLocaleDateString('fr-FR')}
            </div>
          )}
          <button className="btn btn-primary gap-2" onClick={() => selectedDocument && handleDownload(selectedDocument)}>
            <Download className="w-4 h-4" />
            Télécharger
          </button>
        </>
      }
    >
      {selectedDocument && (
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
      )}
    </FormShell>
  );

  const ShareModal = () => (
    <FormShell
      open={showShareModal && !!selectedDocument}
      onClose={() => setShowShareModal(false)}
      title="Partager avec les exploitants"
      icon={Share2}
      size="md"
      dataRole={userRole}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => setShowShareModal(false)}>Annuler</button>
          <button className="btn btn-primary">Modifier l'accès</button>
        </>
      }
    >
      {selectedDocument && (
        <div className="alert alert-info">
          <AlertCircle className="alert-icon" />
          <div className="alert-content">
            <div className="alert-title">Information</div>
            <div className="alert-description">
              Ce document est actuellement {selectedDocument.accessible_exploitant ? 'visible' : 'non visible'} pour les exploitants.
            </div>
          </div>
        </div>
      )}
    </FormShell>
  );

  const analyseCfg = {
    borderClass: 'border border-border',
    bgClass: 'bg-role-primary-soft',
    iconClass: 'text-role-primary',
    badgeClass: 'badge primary',
    label: 'Analyse IA',
    Icon: Sparkles,
  };
  const isAdminRole = userRole === 'admin' || userRole === 'dg_anacim';

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="kit-inspecteur">

      {/* En-tête */}
      <ModuleHeader
        icon={<Briefcase />}
        title="Kit Inspecteur"
        description={`Base documentaire - ${stats.total} documents`}
        actions={<div className="flex items-center gap-2">
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

      {/* Bandeau Analyse IA — design AlertCard */}
      {showAnalyse && (
        <div className={`card ${analyseCfg.borderClass} hover:shadow-xl transition-all duration-300`} data-role={userRole}>
          <div className="card-content p-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg ${analyseCfg.bgClass} flex items-center justify-center flex-shrink-0`}>
                <analyseCfg.Icon className={`w-5 h-5 ${analyseCfg.iconClass}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={analyseCfg.badgeClass}>{analyseCfg.label}</span>
                  {isAdminRole && !analyseLoading && <span className="badge outline">Vue Admin</span>}
                </div>
                <p className="text-sm font-medium mb-1">
                  {analyseLoading
                    ? 'Analyse réglementaire IA en cours…'
                    : `Analyse réglementaire — Impact : ${analyseIA?.impact?.toUpperCase()}`}
                </p>
                {!analyseLoading && analyseIA && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p><span className="font-medium text-foreground">Référence :</span> {analyseIA.reference_base}</p>
                    <p><span className="font-medium text-foreground">Type OACI :</span> {analyseIA.type_oaci_detecte}</p>
                    {analyseIA.domaines_impactes.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-medium text-foreground">Domaines :</span>
                        {analyseIA.domaines_impactes.map((d, i) => (
                          <span key={i} className="badge outline">{d}</span>
                        ))}
                      </div>
                    )}
                    {analyseIA.extraits.length > 0 && (
                      <p>
                        <span className="font-medium text-foreground">Extraits :</span>{' '}
                        {analyseIA.extraits.length} section(s) identifiée(s)
                      </p>
                    )}
                    {analyseIA.conflits.length > 0 && (
                      <div className="mt-2 p-2 rounded-lg bg-danger-soft border border-danger">
                        <p className="font-medium text-danger">
                          {analyseIA.conflits.length} conflit(s) détecté(s) avec des documents existants
                        </p>
                        {isAdminRole
                          ? analyseIA.conflits.map((c, i) => (
                              <p key={i} className="text-danger mt-1">{c.description}</p>
                            ))
                          : <p className="text-danger mt-1">Contactez un administrateur pour résoudre les conflits.</p>
                        }
                      </div>
                    )}
                    <p className="mt-1">
                      {userRole === 'inspector'
                        ? 'La checklist sera pré-remplie automatiquement lors de la prochaine surveillance.'
                        : 'La checklist sera pré-remplie automatiquement. Vérifiez les conflits avant validation.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
            {!analyseLoading && analyseIA && (
              <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-border">
                {analyseIA.extraits.length > 0 && (
                  <button
                    className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                    aria-label="Voir les extraits réglementaires"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}
                {isAdminRole && analyseIA.conflits.length > 0 && (
                  <span className="badge danger animate-pulse">{analyseIA.conflits.length} conflit(s)</span>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{new Date().toLocaleDateString('fr-FR')}</span>
                </div>
                <button
                  onClick={() => setShowAnalyse(false)}
                  className="action-button hover:text-danger hover:bg-danger/10 transition-all duration-200"
                  aria-label="Ignorer l'analyse"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
              sousTab === 'entrainement'
                ? 'active border-b-2 border-role-primary text-role-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSousTab('entrainement')}
          >
            <Brain className="w-4 h-4 inline mr-2" />
            Entraînement IA
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

      {/* Contenu Entraînement IA */}
      {sousTab === 'entrainement' && (
      <>
      {/* Entraînement IA */}
      <div className="space-y-6 animate-fade-up">
          {/* Stats d'entraînement */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon bg-purple-50">
                <Database className="w-5 h-5 text-purple-600" />
              </div>
              <div className="kpi-label">Items ANACIM importés</div>
              <div className="kpi-value">{trainingStats.total}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon bg-blue-50">
                <Brain className="w-5 h-5 text-blue-600" />
              </div>
              <div className="kpi-label">Confiance moyenne</div>
              <div className="kpi-value">{trainingStats.confianceMoyenne}%</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon bg-green-50">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div className="kpi-label">Avec résultat</div>
              <div className="kpi-value">{trainingStats.avecResultat}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon bg-amber-50">
                <ClipboardList className="w-5 h-5 text-amber-600" />
              </div>
              <div className="kpi-label">Checklists produites</div>
              <div className="kpi-value">{trainingStats.masterCount}</div>
            </div>
          </div>

          {/* Répartition par domaine & actions */}
          <div className="card">
            <div className="card-header">
              <div className="card-title text-sm">Répartition par domaine</div>
            </div>
            <div className="card-content">
              {Object.keys(trainingStats.parDomaine).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Aucun item importé. Importez des checklists ANACIM via le bouton <Database className="w-3.5 h-3.5 inline" /> sur les documents analysés.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(trainingStats.parDomaine).map(([domaine, count]) => (
                    <div key={domaine} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-role-primary-soft/10 border border-border">
                      <span className="badge outline text-[10px] font-mono">{domaine}</span>
                      <span className="text-sm font-semibold text-foreground">{count}</span>
                      <span className="text-xs text-muted-foreground">item{count > 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Table des items importés */}
          <div className="card">
            <div className="card-header">
              <div className="card-title text-sm">Items importés (mémoire ANACIM)</div>
            </div>
            <div className="card-content p-0 overflow-x-auto">
              {trainingRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Aucun item dans la mémoire d'entraînement.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">N°</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">Point à vérifier</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">Domaine</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">Résultat</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">Confiance</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">Importé le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingRecords.map(r => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-role-primary-soft/10">
                        <td className="py-2 px-3 font-mono text-foreground">{r.item_numero}</td>
                        <td className="py-2 px-3 text-foreground max-w-[300px] truncate">{parseItemDesc(r.item_description)}</td>
                        <td className="py-2 px-3">
                          <span className="badge outline text-[10px]">{r.domaine}</span>
                        </td>
                        <td className="py-2 px-3">
                          {r.dernier_resultat ? (
                            <span className={`badge ${r.dernier_resultat === 'SA' ? 'success' : r.dernier_resultat === 'NS' ? 'danger' : 'neutral'} text-[10px]`}>{r.dernier_resultat}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-foreground">{r.confiance}%</span>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {r.dernier_feedback ? new Date(r.dernier_feedback).toLocaleDateString('fr-FR') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Master Checklists produites */}
          <div className="card">
            <div className="card-header">
              <div className="card-title text-sm">Checklists produites</div>
            </div>
            <div className="card-content p-0 overflow-x-auto">
              {Object.keys(masterChecklists).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Aucune checklist générée. Utilisez "Générer la checklist" dans l'onglet Documents.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">ID</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">Domaines</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">Items</th>
                      <th className="text-left py-2.5 px-3 font-semibold text-foreground">Actions</th>

                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(masterChecklists).map(([id, domaines]) => {
                      const totalItems = domaines.reduce((s: number, d: any) => {
                        let c = (d.items || []).length
                        for (const sd of (d.sousDomaines || [])) {
                          c += (sd.items || []).length
                          for (const ssd of (sd.sousSousDomaines || [])) {
                            c += (ssd.items || []).length
                          }
                        }
                        return s + c
                      }, 0)
                      return (
                        <tr key={id} className="border-b border-border/50 hover:bg-role-primary-soft/10">
                          <td className="py-2 px-3 font-mono text-foreground text-[11px]">{id}</td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {domaines.map((d: any, i: number) => (
                                <span key={i} className="badge outline text-[10px]">{d.nom || d.id}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-foreground font-semibold">{totalItems}</td>
                          <td className="py-2 px-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => router.push(`/kit-checklist/${id}`)}
                                className="action-button"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm('Supprimer cette checklist ?')) {
                                    deleteMasterChecklist(id)
                                  }
                                }}
                                className="action-button danger"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>

                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </>)}
      {/* Contenu Documents */}
      {sousTab === 'documents' && (<>
      {/* Barre d'outils */}
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md">
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
      </div>

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
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr className="border-b border-border">
                            <th>Document</th>
                            <th>Version</th>
                            <th>Révision</th>
                            <th>Domaines</th>
                            <th>État</th>
                            <th>Exploitant</th>
                            <th>Téléch.</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {docs.map(doc => (
                            <tr key={doc.id} className="border-b border-border hover:bg-role-primary-soft transition-colors">
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  {getTypeIcon(doc.type_document, "w-4 h-4")}
                                  <div>
                                    <p className="font-medium text-foreground">{doc.nom}</p>
                                    <p className="text-xs text-muted-foreground truncate max-w-xs">{doc.resume}</p>
                                  </div>
                                </div>
                              </td>
                              <td><span className="badge outline">{doc.version}</span></td>
                              <td>
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-muted-foreground" />
                                  {doc.date_revision ? new Date(doc.date_revision).toLocaleDateString('fr-FR') : '-'}
                                </div>
                              </td>
                              <td>
                                <div className="flex flex-wrap gap-1">
                                  {doc.domaines?.map((d: string) => (
                                    <span key={d} className="badge outline text-[10px]">{d}</span>
                                  ))}
                                </div>
                              </td>
                              <td>{getEtatBadge(doc.etat)}</td>
                              <td>
                                <span className={`badge ${doc.accessible_exploitant ? 'success' : 'neutral'}`}>
                                  {doc.accessible_exploitant ? 'Oui' : 'Non'}
                                </span>
                              </td>
                              <td><span className="badge outline">{doc.telechargements}</span></td>
                              <td className="text-right">
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
                                  {doc.extraits && doc.extraits.length > 0 && (
                                    <button className="action-button" onClick={() => handleImportAnacim(doc)} title="Importer dans la mémoire IA">
                                      <Database className="w-4 h-4 text-role-primary" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
                        <button className="action-button h-7 w-7 p-0" onClick={() => handleImportAnacim(doc)} title="Importer dans la mémoire IA">
                          <Database className="w-3 h-3 text-role-primary" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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

                {/* Type d'aérodrome */}
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-2">Type d'aérodrome</label>
                  <select
                    value={genTypeAerodrome}
                    onChange={(e) => setGenTypeAerodrome(e.target.value as 'international' | 'national')}
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

      {importDoc && createPortal(
        <div className="modal-overlay" onClick={() => { setImportDoc(null); setImportItems([]); }}>
          <div className="form-shell-content max-w-3xl" onClick={e => e.stopPropagation()}>
            <div className="form-shell-inner">
              <div className="form-shell-header">
                <div className="form-shell-title">
                  <span className="form-shell-icon-wrap">
                    <Database className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <span className="form-shell-title-text">Importer dans la mémoire IA</span>
                    <span className="form-shell-subtitle">{importDoc.nom} — {importItems.length} item(s) extraits</span>
                  </div>
                </div>
                <button className="modal-close" onClick={() => { setImportDoc(null); setImportItems([]); }} aria-label="Fermer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="form-shell-body">
                {importLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-6 h-6 animate-spin text-role-primary" />
                    <span className="ml-3 text-sm text-muted-foreground">Extraction des items en cours...</span>
                  </div>
                ) : importItems.length === 0 ? (
                  <div className="text-center py-12">
                    <Database className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">Aucun item de checklist structuré trouvé dans ce document.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-2 font-semibold text-foreground">N°</th>
                          <th className="text-left py-2 px-2 font-semibold text-foreground">Réf. réglementaire</th>
                          <th className="text-left py-2 px-2 font-semibold text-foreground">Point à vérifier</th>
                          <th className="text-left py-2 px-2 font-semibold text-foreground">Résultat</th>
                          <th className="text-left py-2 px-2 font-semibold text-foreground">Domaine</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importItems.map((item, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-role-primary-soft/10">
                            <td className="py-2 px-2 font-mono text-foreground">{item.numero}</td>
                            <td className="py-2 px-2 text-muted-foreground max-w-[200px] truncate">{item.reference_reglementaire}</td>
                            <td className="py-2 px-2 text-foreground max-w-[300px] truncate">{item.point_verification}</td>
                            <td className="py-2 px-2">
                              {item.resultat ? (
                                <span className={`badge ${item.resultat === 'SA' ? 'success' : item.resultat === 'NS' ? 'danger' : 'neutral'} text-[10px]`}>{item.resultat}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <span className="badge outline text-[10px]">{item.domaine}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="form-shell-footer">
                <button onClick={() => { setImportDoc(null); setImportItems([]); }} className="btn btn-secondary">Annuler</button>
                <button onClick={handleConfirmImport} disabled={importItems.length === 0 || importLoading} className="btn btn-primary gap-1.5">
                  <Database className="w-3.5 h-3.5" />
                  Importer {importItems.length} item(s)
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      </>)}
      {/* Modales — appelées conditionnellement pour éviter la génération JSX inutile */}
      {showForm && FormModal()}
      {showDetails && DetailModal()}
      {showShareModal && ShareModal()}
    </div>
  );
}
