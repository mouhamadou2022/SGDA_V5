// components/modules/dossiers/DossiersModule.tsx
// ✅ CDC 5.9 - Dossiers techniques
// ✅ Workflow de traitement avec progression
// ✅ Filtres par catégorie, service, inspecteur
// ✅ Onglet Archives avec accordéon Année → Catégorie
// ✅ Archivage automatique des dossiers terminés
// ✅ Classes du design system harmonisées

'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  FolderOpen,
  FileText,
  Download,
  Eye,
  PenSquare,
  Trash2,
  Plus,
  Search,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Upload,
  ChevronDown,
  ChevronRight,
  ArchiveRestore,
  Calendar,
  List,
  Archive,
  Filter,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAppStore, type Dossier } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { dossierUtils } from '@/lib/dossierUtils';
import { FormShell } from '@/components/ui/FormShell';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';
import { DossierForm } from '@/components/forms/DossierForm';
import { DossierCard } from '@/components/cards/DossierCard';
import DetailsModal from './DetailsModal';

interface DossiersModuleProps {
  userRole?: string;
  aerodromeId?: string;
}

// Catégories de dossiers (CDC 5.9.1)
const CATEGORIES_DOSSIERS = [
  { id: 'reglementaire', label: 'Réglementaire', icon: FileText },
  { id: 'technique', label: 'Technique', icon: FileText },
  { id: 'operationnel', label: 'Opérationnel', icon: FileText },
  { id: 'surveillance', label: 'Surveillance', icon: Eye },
  { id: 'formation', label: 'Formation', icon: FileText },
  { id: 'financier', label: 'Financier', icon: FileText },
];

// Services assignés
const SERVICES = [
  { id: 'securite_aerodromes', label: 'Sécurité des Aérodromes' },
  { id: 'normes_aerodromes', label: 'Normes des Aérodromes' },
];

function DossierArchiveItem({
  dossier,
  aerodromes,
  onView,
  onRestore,
  onDelete,
  userRole,
}: {
  dossier: Dossier;
  aerodromes: { id: string; code_oaci: string; nom: string }[];
  onView: (d: Dossier) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  userRole?: string;
}) {
  const canManageArchive = ['admin', 'chef'].includes(userRole || '')
  const [showFiles, setShowFiles] = useState(false);
  const aerodrome = aerodromes?.find(a => a.id === dossier.aerodrome_id);

  return (
    <div className="bg-role-primary-soft/10 rounded-xl p-4 hover:shadow-role-glow transition-shadow">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-role-primary">
              {dossier.reference}
            </span>
            <span className="badge neutral text-xs">
              Archivé le {dossier.archived_at ? new Date(dossier.archived_at).toLocaleDateString('fr-FR') : '-'}
            </span>
          </div>
          <h4 className="font-medium mt-1">{dossier.titre}</h4>
          {aerodrome && (
            <p className="text-small text-muted-foreground mt-1">
              {aerodrome.code_oaci} — {aerodrome.nom}
            </p>
          )}
          {dossier.instructions && (
            <p className="text-small text-muted-foreground mt-2 line-clamp-2">
              {dossier.instructions}
            </p>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <button onClick={() => onView(dossier)} className="action-button" title="Voir détails">
            <Eye className="w-4 h-4" />
          </button>
          {canManageArchive && (
            <>
              <button onClick={() => onRestore(dossier.id)} className="action-button text-success hover:bg-success-soft" title="Restaurer">
                <ArchiveRestore className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(dossier.id)} className="action-button text-danger hover:bg-danger-soft" title="Supprimer définitivement">
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {dossier.fichiers && dossier.fichiers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <button
            onClick={() => setShowFiles(!showFiles)}
            className="flex items-center gap-1 text-small text-role-primary hover:underline"
          >
            {showFiles ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {dossier.fichiers.length} fichier(s) associé(s)
          </button>
          {showFiles && (
            <div className="mt-2 space-y-2">
              {dossier.fichiers.map((fichier) => (
                <div key={(fichier as any).id || fichier.nom} className="flex items-center justify-between p-2 bg-background rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-small truncate max-w-[200px]">{fichier.nom}</span>
                    <span className="text-xs text-muted-foreground">({(fichier as any).taille})</span>
                  </div>
                  <a href={(fichier as any).url} download={fichier.nom} className="action-button" title="Télécharger">
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DossiersModule({ userRole: _userRole, aerodromeId }: DossiersModuleProps) {
  const dossiers = useAppStore(s => s.dossiers);
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const user = useAppStore(s => s.user);
  const userRole = user?.role || _userRole || '';
  const addDossier = useAppStore(s => s.addDossier);
  const updateDossier = useAppStore(s => s.updateDossier);
  const extendreDossier = useAppStore(s => s.extendreDossier);
  const traiterExtension = useAppStore(s => s.traiterExtension);
  const addNotification = useAppStore(s => s.addNotification);
  const deleteDossier = useAppStore(s => s.deleteDossier);
  const archiverDossierAutomatique = useAppStore(s => s.archiverDossierAutomatique);
  const restaurerDossier = useAppStore(s => s.restaurerDossier);
  const addAssignment = useAppStore(s => s.addAssignment);
  const updateAssignment = useAppStore(s => s.updateAssignment);
  const reassignAssignment = useAppStore(s => s.reassignAssignment);
  const addAssignmentFeedback = useAppStore(s => s.addAssignmentFeedback);

  // États
  const [activeTab, setActiveTab] = useState<'actifs' | 'archives'>('actifs');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    categorie: 'tous',
    service: 'tous',
    inspecteur: 'tous',
    statut: 'tous',
    urgence: 'tous'
  });
  const [showForm, setShowForm] = useState(false);
  const [editingDossierId, setEditingDossierId] = useState<string | null>(null);
  const [selectedDossierId, setSelectedDossierId] = useState<string | null>(null);
  const selectedDossier = useAppStore(s => selectedDossierId ? s.dossiers.find(d => d.id === selectedDossierId) || null : null);
  const [showDetails, setShowDetails] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extMotif, setExtMotif] = useState('');
  const [extJours, setExtJours] = useState<3 | 7 | 10>(7);
  const [viewMode, setViewMode] = useState<'liste' | 'grille'>('liste');
  const [mounted, setMounted] = useState(false);

  // Par défaut, l'inspecteur ne voit que ses dossiers
  useEffect(() => {
    if (!mounted || !user) return;
    if (userRole === 'inspector') {
      setFilters(prev => ({ ...prev, inspecteur: user.id }));
    }
  }, [mounted, user, userRole]);

  // États pour Archives
  const [archiveSearchTerm, setArchiveSearchTerm] = useState('');
  const [archiveFilters, setArchiveFilters] = useState({
    categorie: 'tous',
    aerodrome: 'tous',
    dateDebut: '',
    dateFin: '',
  });
  const [anneesOuvertes, setAnneesOuvertes] = useState<Record<string, boolean>>({});
  const [categoriesOuvertes, setCategoriesOuvertes] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Archivage automatique des dossiers terminés
  useEffect(() => {
    if (!dossiers) return;
    
    const dossiersTermines = dossiers.filter(
      d => d.statut === 'termine'
    );

    dossiersTermines.forEach(dossier => {
      // Archivage automatique après 30 jours (délai de conservation)
      const dateFin = new Date(dossier.updated_at);
      dateFin.setDate(dateFin.getDate() + 30);
      if (new Date() >= dateFin) {
        archiverDossierAutomatique(dossier.id);
      }
    });
  }, [dossiers, archiverDossierAutomatique]);

  // Formulaire géré par DossierForm — plus de state local

  const listeDossiers = dossiers ?? [];

  // Dossiers actifs (non archivés)
  const dossiersActifs = useMemo(() => {
    return listeDossiers.filter(d => d.statut !== 'archive');
  }, [listeDossiers]);

  // Dossiers archivés
  const dossiersArchives = useMemo(() => {
    return listeDossiers.filter(d => d.statut === 'archive');
  }, [listeDossiers]);

  // Filtrer les dossiers actifs
  const filteredDossiers = useMemo(() => {
    return dossiersActifs.filter(d => {
      if (aerodromeId && d.aerodrome_id !== aerodromeId) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = d.titre?.toLowerCase().includes(term) || d.reference?.toLowerCase().includes(term);
        if (!matches) return false;
      }

      if (filters.categorie !== 'tous' && d.categorie !== filters.categorie) return false;
      if (filters.service !== 'tous' && d.service_assigne !== filters.service) return false;
      if (filters.inspecteur !== 'tous') {
        const matchesOld = d.inspecteur_id === filters.inspecteur;
        const matchesNew = d.assignments?.some(a => a.inspecteur_id === filters.inspecteur);
        if (!matchesOld && !matchesNew) return false;
      }
      if (filters.statut !== 'tous' && d.statut !== filters.statut) return false;

      if (filters.urgence !== 'tous') {
        const { jours } = dossierUtils.getDelaiRestant(d.date_limite);
        if (filters.urgence === 'urgent' && jours >= 7) return false;
        if (filters.urgence === 'critique' && jours >= 3) return false;
      }

      return true;
    });
  }, [dossiersActifs, searchTerm, filters, aerodromeId]);

  // Filtrer les dossiers archivés
  const filteredArchives = useMemo(() => {
    return dossiersArchives.filter(d => {
      // Recherche textuelle
      if (archiveSearchTerm) {
        const term = archiveSearchTerm.toLowerCase();
        const match =
          d.reference?.toLowerCase().includes(term) ||
          d.titre?.toLowerCase().includes(term) ||
          (d.instructions?.toLowerCase().includes(term) || false);
        if (!match) return false;
      }

      // Filtre catégorie
      if (archiveFilters.categorie !== 'tous' && d.categorie !== archiveFilters.categorie)
        return false;

      // Filtre aérodrome
      if (archiveFilters.aerodrome !== 'tous' && d.aerodrome_id !== archiveFilters.aerodrome)
        return false;

      // Filtre date d'archivage
      if (archiveFilters.dateDebut && d.archived_at && d.archived_at < archiveFilters.dateDebut)
        return false;
      if (archiveFilters.dateFin && d.archived_at && d.archived_at > archiveFilters.dateFin)
        return false;

      return true;
    });
  }, [dossiersArchives, archiveSearchTerm, archiveFilters]);

  // Grouper les archives par année puis par catégorie
  const archivesGrouped = useMemo(() => {
    const grouped: Record<string, Record<string, typeof filteredArchives>> = {};

    filteredArchives.forEach((dossier) => {
      const annee = dossier.archived_at
        ? new Date(dossier.archived_at).getFullYear().toString()
        : 'Sans date';
      const categorie = dossier.categorie;

      if (!grouped[annee]) grouped[annee] = {};
      if (!grouped[annee][categorie]) grouped[annee][categorie] = [];
      grouped[annee][categorie].push(dossier);
    });

    // Trier les années décroissantes
    const anneesTriees = Object.keys(grouped).sort((a, b) => {
      if (a === 'Sans date') return 1;
      if (b === 'Sans date') return -1;
      return parseInt(b) - parseInt(a);
    });

    const result: { annee: string; categories: { nom: string; dossiers: Dossier[] }[] }[] = [];
    for (const annee of anneesTriees) {
      const categories = Object.entries(grouped[annee]).map(([nom, dossiers]) => ({
        nom,
        dossiers,
      }));
      result.push({ annee, categories });
    }

    return result;
  }, [filteredArchives]);

  // Grouper par catégorie pour les actifs
  const dossiersParCategorie = useMemo(() => {
    const grouped: Record<string, Dossier[]> = {};
    
    CATEGORIES_DOSSIERS.forEach(c => {
      grouped[c.id] = [];
    });
    
    filteredDossiers.forEach(d => {
      if (grouped[d.categorie]) {
        grouped[d.categorie].push(d);
      }
    });
    
    return grouped;
  }, [filteredDossiers]);

  // Statistiques
  const stats = useMemo(() => {
    return {
      total: filteredDossiers.length,
      enCours: filteredDossiers.filter(d => d.statut === 'en_cours').length,
      enAttente: filteredDossiers.filter(d => d.statut === 'en_attente').length,
      termines: filteredDossiers.filter(d => d.statut === 'termine').length,
      urgents: filteredDossiers.filter(d => {
        const { jours } = dossierUtils.getDelaiRestant(d.date_limite);
        return jours < 7 && d.statut !== 'termine';
      }).length,
      archives: dossiersArchives.length
    };
  }, [filteredDossiers, dossiersArchives]);

  // Catégories disponibles pour le filtre archives
  const archiveCategoriesDisponibles = useMemo(() => {
    const cats = new Set(dossiersArchives.map(d => d.categorie));
    return Array.from(cats);
  }, [dossiersArchives]);

  const getIconeCategorie = (categorieId: string, className?: string) => {
    const cat = CATEGORIES_DOSSIERS.find(c => c.id === categorieId);
    if (!cat) return <FileText className={className || "w-5 h-5"} />;
    const Icon = cat.icon;
    return <Icon className={className || "w-5 h-5 text-role-primary"} />;
  };

  const getCouleurStatut = (statut: string): string => {
    const couleurs: Record<string, string> = {
      'en_cours': 'badge primary',
      'en_attente': 'badge warning',
      'termine': 'badge success',
      'archive': 'badge neutral'
    };
    return couleurs[statut] || 'badge neutral';
  };

  const getLibelleStatut = (statut: string): string => {
    const libelles: Record<string, string> = {
      'en_cours': 'En cours',
      'en_attente': 'En attente',
      'termine': 'Terminé',
      'archive': 'Archivé'
    };
    return libelles[statut] || statut;
  };

  const getDelaiIndicator = (dateLimite: string) => {
    const { jours } = dossierUtils.getDelaiRestant(dateLimite);
    
    if (jours <= 0) {
      const overdue = Math.abs(jours);
      return {
        label: overdue > 0 ? `${overdue}j de retard` : 'Échéance aujourd\'hui',
        className: 'badge danger animate-pulse',
        icon: AlertCircle
      };
    }
    if (jours === 1) {
      return {
        label: 'Demain',
        className: 'badge danger',
        icon: AlertTriangle
      };
    }
    if (jours < 7) {
      return {
        label: `${jours}j`,
        className: 'badge warning',
        icon: Clock
      };
    }
    return {
      label: `${jours}j`,
      className: 'badge success',
      icon: CheckCircle2
    };
  };

  const canManage = ['admin', 'chef'].includes(userRole)
  const canCreate = ['admin', 'chef'].includes(userRole)

  const handleMarquerTermine = (dossierId: string) => {
    if (!canManage) return
    updateDossier(dossierId, {
      progression: 100,
      statut: 'termine',
      updated_at: new Date().toISOString(),
      historique: [
        ...(listeDossiers.find(d => d.id === dossierId)?.historique || []),
        {
          date: new Date().toISOString(),
          action: 'Dossier terminé',
          utilisateur: user?.id || 'system',
          commentaire: 'Traitement finalisé'
        }
      ]
    });
  };

  const handleRestoreFromArchive = (dossierId: string) => {
    if (!canManage) return
    restaurerDossier(dossierId);
  };

  const handleDeleteArchive = (dossierId: string) => {
    if (!canManage) return
    if (confirm('Supprimer définitivement ce dossier ? Cette action est irréversible.')) {
      deleteDossier(dossierId);
    }
  };

  const handleEditDossier = (dossier: Dossier) => {
    if (!canManage) return
    setEditingDossierId(dossier.id);
    setShowForm(true);
  };

  const handleDeleteDossier = (dossier: Dossier) => {
    if (!canManage) return
    const estTermine = dossier.statut === 'termine' || dossier.statut === 'archive'
    const msg = estTermine
      ? `Ce dossier est ${dossier.statut === 'archive' ? 'déjà archivé' : 'terminé'}. L\'archiver définitivement ?`
      : 'Supprimer ce dossier définitivement ? Cette action est irréversible.'
    if (confirm(msg)) {
      deleteDossier(dossier.id);
    }
  };

  const toggleAnnee = (annee: string) => {
    setAnneesOuvertes((prev) => ({ ...prev, [annee]: !prev[annee] }));
  };

  const toggleCategorie = (key: string) => {
    setCategoriesOuvertes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetArchiveFilters = () => {
    setArchiveSearchTerm('');
    setArchiveFilters({
      categorie: 'tous',
      aerodrome: 'tous',
      dateDebut: '',
      dateFin: '',
    });
  };

  // Style pour les selects avec flèche personnalisée
  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundPosition: 'right 0.75rem center',
    backgroundRepeat: 'no-repeat'
  };

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingDossierId(null);
  }, [])

  // Modales via FormShell
  const FormModal = () => (
    <FormShell
      open={!!mounted && showForm}
      onClose={handleCloseForm}
      title={editingDossierId ? "Modifier le dossier" : "Nouveau dossier technique"}
      icon={FolderOpen}
      size="3xl"
      dataRole={userRole}
    >
      <DossierForm
        mode={editingDossierId ? "modification" : "creation"}
        dossierId={editingDossierId || undefined}
        aerodromeId={aerodromeId}
        userRole={userRole}
        onSuccess={handleCloseForm}
        onCancel={handleCloseForm}
      />
    </FormShell>
  );

  const ExtendModal = () => {
    const localFocus = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
    const handleExtend = async () => {
      if (!selectedDossier || !extMotif.trim()) return
      const estAdmin = ['admin', 'chef'].includes(userRole)
      await extendreDossier(selectedDossier.id, { date: new Date().toISOString(), jours: extJours, motif: extMotif, statut: estAdmin ? 'approuve' : 'en_attente' }, user?.nom)
      if (estAdmin) {
        addNotification({ user_id: selectedDossier.inspecteur_id || selectedDossier.assignments?.[0]?.inspecteur_id || user?.id || '', type: 'success', title: 'Délai étendu', message: `Délai du dossier ${selectedDossier.reference} étendu de ${extJours} jours.`, canal: 'in_app' })
      }
      setShowExtendModal(false)
      setExtMotif('')
    }
    return (
      <FormShell open={showExtendModal} onClose={() => setShowExtendModal(false)} title="Extension de délai" icon={Clock} size="sm"
        footer={<div className="flex gap-2"><button className="btn btn-secondary" onClick={() => setShowExtendModal(false)}>Annuler</button><button className="btn btn-primary" onClick={handleExtend} disabled={!extMotif.trim()}>Confirmer</button></div>}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Date limite actuelle : {selectedDossier?.date_limite ? new Date(selectedDossier.date_limite).toLocaleDateString('fr-FR') : '-'}</p>
          <div className="form-field">
            <label className="filter-label">Jours supplémentaires</label>
            <div className="flex gap-2">{[3, 7, 10].map(j => (
              <button key={j} onClick={() => setExtJours(j as 3|7|10)}
                className={`btn btn-sm flex-1 ${extJours === j ? 'btn-primary' : 'btn-secondary'}`}>{j} jours</button>
            ))}</div>
          </div>
          <div className="form-field">
            <label className="filter-label">Motif <span className="text-danger">*</span></label>
            <textarea className={`form-textarea ${localFocus}`} rows={3} value={extMotif} onChange={e => setExtMotif(e.target.value)} placeholder="Raison de l'extension..." />
          </div>
        </div>
      </FormShell>
    )
  }

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="dossiers">
      
      {/* En-tête */}
      <ModuleHeader
        icon={<FolderOpen />}
        title="Dossiers techniques"
        description="Gestion des dossiers et instructions"
        actions={<div className="flex items-center gap-2">
          {canCreate && (
            <button onClick={() => setShowForm(true)} className="btn btn-primary gap-2">
              <Plus className="w-4 h-4" />
              Nouveau dossier
            </button>
          )}
        </div>}
      />

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <FolderOpen className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total actifs</div>
          <div className="kpi-value">{stats.total}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <Clock className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">En cours</div>
          <div className="kpi-value">{stats.enCours}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <AlertCircle className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">En attente</div>
          <div className="kpi-value">{stats.enAttente}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Terminés</div>
          <div className="kpi-value">{stats.termines}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft">
            <AlertTriangle className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label">Urgents</div>
          <div className="kpi-value">{stats.urgents}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-neutral-soft">
            <ArchiveRestore className="w-5 h-5 text-muted" />
          </div>
          <div className="kpi-label">Archivés</div>
          <div className="kpi-value">{stats.archives}</div>
        </div>
      </div>

      {/* Onglets principaux */}
      <div className="tabs-container border-b border-border">
        <div className="tabs flex gap-1">
          <button
            className={`tab px-4 py-2 font-medium transition-all ${
              activeTab === 'actifs'
                ? 'active border-b-2 border-role-primary text-role-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('actifs')}
          >
            <List className="w-4 h-4 inline mr-1.5" /> Dossiers actifs ({stats.total})
          </button>
          <button
            className={`tab px-4 py-2 font-medium transition-all ${
              activeTab === 'archives'
                ? 'active border-b-2 border-role-primary text-role-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('archives')}
          >
            <Archive className="w-4 h-4 inline mr-1.5" /> Archives ({stats.archives})
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* ONGLET DOSSIERS ACTIFS */}
      {/* ============================================================ */}
      {activeTab === 'actifs' && (
        <>
          {/* Barre d'outils */}
          <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[240px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher un dossier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
                />
              </div>

              <select 
                value={filters.categorie} 
                onChange={(e) => setFilters({...filters, categorie: e.target.value})}
                className="h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent appearance-none"
                style={selectStyle}
              >
                <option value="tous">Toutes catégories</option>
                {CATEGORIES_DOSSIERS.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>

              <select 
                value={filters.service} 
                onChange={(e) => setFilters({...filters, service: e.target.value})}
                className="h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent appearance-none"
                style={selectStyle}
              >
                <option value="tous">Tous services</option>
                {SERVICES.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>

              <select 
                value={filters.statut} 
                onChange={(e) => setFilters({...filters, statut: e.target.value})}
                className="h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent appearance-none"
                style={selectStyle}
              >
                <option value="tous">Tous statuts</option>
                <option value="en_cours">En cours</option>
                <option value="en_attente">En attente</option>
                <option value="termine">Terminé</option>
              </select>

              <select 
                value={filters.urgence} 
                onChange={(e) => setFilters({...filters, urgence: e.target.value})}
                className="h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent appearance-none"
                style={selectStyle}
              >
                <option value="tous">Toute urgence</option>
                <option value="urgent">Urgent (&lt;7j)</option>
                <option value="critique">Critique (&lt;3j)</option>
              </select>

              <div className="view-toggle">
                <button
                  className={viewMode === 'liste' ? 'active' : ''}
                  onClick={() => setViewMode('liste')}
                >
                  <FileText className="w-4 h-4" />
                  Liste
                </button>
                <button
                  className={viewMode === 'grille' ? 'active' : ''}
                  onClick={() => setViewMode('grille')}
                >
                  <FolderOpen className="w-4 h-4" />
                  Grille
                </button>
            </div>
          </div>
        </Card>

        {/* Vue Liste avec catégories */}
          {viewMode === 'liste' && (
            <AccordionGroup spacing="lg">
              {CATEGORIES_DOSSIERS.map(cat => {
                const entries = dossiersParCategorie[cat.id] || [];
                if (entries.length === 0) return null;

                return (
                  <AccordionSection
                    key={cat.id}
                    icon={getIconeCategorie(cat.id)}
                    title={cat.label}
                    badges={
                      <div className="flex items-center gap-2">
                        <span className="badge outline">{entries.length} dossier(s)</span>
                        {entries.filter(d => {
                          const { jours } = dossierUtils.getDelaiRestant(d.date_limite);
                          return jours < 7 && d.statut !== 'termine';
                        }).length > 0 && (
                          <span className="badge danger animate-pulse">
                            {entries.filter(d => {
                              const { jours } = dossierUtils.getDelaiRestant(d.date_limite);
                              return jours < 7 && d.statut !== 'termine';
                            }).length} urgent(s)
                          </span>
                        )}
                      </div>
                    }
                    defaultOpen={true}
                  >
                      <div className="table-container">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Référence</th>
                              <th>Titre</th>
                              <th>Aérodrome</th>
                              <th>Inspecteur</th>
                              <th>Progression</th>
                              <th>Échéance</th>
                              <th>Statut</th>
                              <th className="text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map(dossier => {
                              const aerodrome = aerodromes.find(a => a.id === dossier.aerodrome_id);
                              const delai = getDelaiIndicator(dossier.date_limite);
                              const DelaiIcon = delai.icon;

                              return (
                                <tr key={dossier.id} className="hover:bg-role-primary-soft">
                                  <td className="font-mono text-sm font-semibold">
                                    {dossier.reference}
                                  </td>
                                  <td>
                                    <div className="flex items-center gap-2">
                                      {getIconeCategorie(dossier.categorie, "w-4 h-4 text-role-primary")}
                                      <span>{dossier.titre}</span>
                                    </div>
                                  </td>
                                  <td>
                                    {aerodrome ? (
                                      <span className="badge outline">{aerodrome.code_oaci}</span>
                                    ) : (
                                      <span className="text-muted">-</span>
                                    )}
                                  </td>
                                  <td>
                                    <div className="flex items-center gap-1">
                                      <User className="w-3 h-3 text-muted" />
                                      <span className="text-small">{dossier.assignments?.map((a: any) => a.inspecteur_nom).join(', ') || '—'}</span>
                                    </div>
                                  </td>
                                  <td>
                                    <div className="flex items-center gap-2 w-32">
                                      <div className="progress flex-1 h-2">
                                        <div 
                                          className="progress-bar" 
                                          style={{ width: `${dossier.progression}%` }}
                                        />
                                      </div>
                                      <span className="text-xs">{dossier.progression}%</span>
                                    </div>
                                  </td>
                                  <td>
                                    <span className={`${delai.className} flex items-center gap-1`}>
                                      <DelaiIcon className="w-3 h-3" />
                                      {delai.label}
                                    </span>
                                  </td>
                                  <td>
                                    <span className={getCouleurStatut(dossier.statut)}>
                                      {getLibelleStatut(dossier.statut)}
                                    </span>
                                  </td>
                                   <td className="text-right">
                                    <div className="flex justify-end gap-1">
                                      <button 
                                        className="action-button"
                                        onClick={() => {
                                          setSelectedDossierId(dossier.id);
                                          setShowDetails(true);
                                        }}
                                        title="Voir détails"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      {canManage && dossier.statut !== 'termine' && (
                                        <button 
                                          className="action-button text-success"
                                          onClick={() => handleMarquerTermine(dossier.id)}
                                          title="Marquer comme terminé"
                                        >
                                          <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                      )}
                                      {canManage && (
                                        <button 
                                          className="action-button"
                                          onClick={() => handleEditDossier(dossier)}
                                          title="Modifier"
                                        >
                                          <PenSquare className="w-4 h-4" />
                                        </button>
                                      )}
                                      {canManage && (
                                        <button 
                                          className="action-button text-danger"
                                          onClick={() => handleDeleteDossier(dossier)}
                                          title="Supprimer"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
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
              {filteredDossiers.map(d => {
                const aerodrome = aerodromes.find(a => a.id === d.aerodrome_id);
                return (
                  <DossierCard
                    key={d.id}
                    dossier={d}
                    aerodrome={aerodrome}
                    userRole={userRole}
                    onViewDetails={() => { setSelectedDossierId(d.id); setShowDetails(true); }}
                    onMarkComplete={d.statut !== 'termine' ? () => handleMarquerTermine(d.id) : undefined}
                    onEdit={() => handleEditDossier(d)}
                    onDelete={() => handleDeleteDossier(d)}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* ONGLET ARCHIVES */}
      {/* ============================================================ */}
      {activeTab === 'archives' && (
        <div className="space-y-4">
          {/* Barre de filtres Archives */}
          <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Recherche */}
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher dans les archives..."
                  value={archiveSearchTerm}
                  onChange={(e) => setArchiveSearchTerm(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent"
                />
              </div>

              {/* Filtre catégorie */}
              <select
                value={archiveFilters.categorie}
                onChange={(e) => setArchiveFilters(prev => ({ ...prev, categorie: e.target.value }))}
                className="h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] appearance-none"
                style={selectStyle}
              >
                <option value="tous">Toutes catégories</option>
                {archiveCategoriesDisponibles.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORIES_DOSSIERS.find(c => c.id === cat)?.label || cat}
                  </option>
                ))}
              </select>

              {/* Filtre aérodrome */}
              <select
                value={archiveFilters.aerodrome}
                onChange={(e) => setArchiveFilters(prev => ({ ...prev, aerodrome: e.target.value }))}
                className="h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] appearance-none"
                style={selectStyle}
              >
                <option value="tous">Tous aérodromes</option>
                {aerodromes?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code_oaci} - {a.nom}
                  </option>
                ))}
              </select>

              {/* Filtre date */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={archiveFilters.dateDebut}
                    onChange={(e) => setArchiveFilters(prev => ({ ...prev, dateDebut: e.target.value }))}
                    className="h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground text-sm"
                    placeholder="Du"
                  />
                </div>
                <span className="text-muted-foreground">→</span>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={archiveFilters.dateFin}
                    onChange={(e) => setArchiveFilters(prev => ({ ...prev, dateFin: e.target.value }))}
                    className="h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground text-sm"
                    placeholder="Au"
                  />
                </div>
              </div>

              {/* Reset filtres */}
              {(archiveSearchTerm || archiveFilters.categorie !== 'tous' || archiveFilters.aerodrome !== 'tous' || archiveFilters.dateDebut || archiveFilters.dateFin) && (
                <button onClick={resetArchiveFilters} className="btn btn-ghost btn-sm">
                  Réinitialiser
                </button>
              )}
            </div>

            {/* Résumé des résultats */}
            <div className="flex items-center gap-3 pt-2 border-t border-border">
              <span className="badge neutral">
                {filteredArchives.length} dossier(s) archivé(s)
              </span>
            </div>
          </Card>

          {/* Message si aucun résultat */}
          {filteredArchives.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ArchiveRestore className="h-16 w-16 text-muted-foreground opacity-30 mb-4" />
              <p className="text-muted-foreground">Aucun dossier archivé trouvé</p>
              <button onClick={resetArchiveFilters} className="btn btn-primary mt-4">
                Réinitialiser les filtres
              </button>
            </div>
          )}

          {/* Accordéon par année */}
          {filteredArchives.length > 0 && (
            <div className="space-y-3">
              {archivesGrouped.map(({ annee, categories }) => (
                <div key={annee} className="card overflow-hidden">
                  {/* En-tête année */}
                  <button
                    onClick={() => toggleAnnee(annee)}
                    className="w-full flex items-center justify-between p-4 bg-role-primary-soft/30 hover:bg-role-primary-soft/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {anneesOuvertes[annee] ? (
                        <ChevronDown className="h-4 w-4 text-role-primary" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-role-primary" />
                      )}
                      <span className="font-semibold text-lg">{annee}</span>
                      <span className="badge neutral">
                        {categories.reduce((acc, cat) => acc + cat.dossiers.length, 0)} dossier(s)
                      </span>
                    </div>
                  </button>

                  {/* Contenu année */}
                  {anneesOuvertes[annee] && (
                    <div className="p-4 space-y-3">
                      {categories.map(({ nom, dossiers: catDossiers }) => {
                        const key = `${annee}-${nom}`;
                        const catLabel = CATEGORIES_DOSSIERS.find(c => c.id === nom)?.label || nom;
                        
                        return (
                          <div key={nom} className="border border-border rounded-xl overflow-hidden">
                            {/* En-tête catégorie */}
                            <button
                              onClick={() => toggleCategorie(key)}
                              className="w-full flex items-center justify-between p-3 bg-background hover:bg-role-primary-soft/30 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                {categoriesOuvertes[key] ? (
                                  <ChevronDown className="h-3 w-3 text-role-primary" />
                                ) : (
                                  <ChevronRight className="h-3 w-3 text-role-primary" />
                                )}
                                <span className="font-medium capitalize">{catLabel}</span>
                                <span className="badge outline text-xs">
                                  {catDossiers.length}
                                </span>
                              </div>
                            </button>

                            {/* Liste des dossiers de cette catégorie */}
                            {categoriesOuvertes[key] && (
                              <div className="p-3 space-y-3 border-t border-border">
                                {catDossiers.map((dossier) => (
                                  <DossierArchiveItem
                                    key={dossier.id}
                                    dossier={dossier}
                                    aerodromes={aerodromes}
                                    userRole={userRole}
                                    onView={(d) => { setSelectedDossierId(d.id); setShowDetails(true); }}
                                    onRestore={handleRestoreFromArchive}
                                    onDelete={handleDeleteArchive}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modales via Portal */}
      {showForm && FormModal()}
      <DetailsModal
        dossier={selectedDossier}
        open={!!mounted && showDetails && !!selectedDossier}
        onClose={() => setShowDetails(false)}
        userRole={userRole}
        user={user}
        utilisateurs={utilisateurs}
        onRequestExtend={() => setShowExtendModal(true)}
        onTraiterExtension={(dossierId, extensionIndex, statut) =>
          traiterExtension(dossierId, extensionIndex, statut, user?.nom)
        }
        onAddFeedback={(dossierId, assignmentId, feedback) =>
          addAssignmentFeedback(dossierId, assignmentId, feedback)
        }
        onReassign={(dossierId, assignmentId, newInspectorId, newInspectorNom, motif) =>
          reassignAssignment(dossierId, assignmentId, newInspectorId, newInspectorNom, motif)
        }
      />
      {showExtendModal && ExtendModal()}
    </div>
  );
}