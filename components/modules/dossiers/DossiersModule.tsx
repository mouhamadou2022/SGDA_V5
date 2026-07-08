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
  Calendar,
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
  const addAssignment = useAppStore(s => s.addAssignment);
  const updateAssignment = useAppStore(s => s.updateAssignment);
  const reassignAssignment = useAppStore(s => s.reassignAssignment);
  const addAssignmentFeedback = useAppStore(s => s.addAssignmentFeedback);

  // États
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
    };
  }, [filteredDossiers]);

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
    const dossier = listeDossiers.find(d => d.id === dossierId)
    if (!dossier) return
    const now = new Date().toISOString()
    const auteur = user?.nom || 'Système'

    // Compléter toutes les assignments non terminées
    const updatedAssignments = (dossier.assignments || []).map(a => {
      if (a.statut === 'termine' || a.statut === 'valide') return a
      return {
        ...a,
        statut: 'termine' as const,
        progression: 100 as 0 | 25 | 50 | 75 | 100,
        historique: [...a.historique, { date: now, action: 'Dossier clôturé par le chef', details: 'Assignation automatiquement terminée' }],
      }
    })

    // Refuser les extensions en attente
    const updatedExtensions = (dossier.extensions || []).map(e =>
      e.statut === 'en_attente' ? { ...e, statut: 'refuse' as const, superieur_approbation: auteur } : e
    )

    updateDossier(dossierId, {
      progression: 100,
      statut: 'termine',
      assignments: updatedAssignments,
      extensions: updatedExtensions,
      updated_at: now,
      historique: [
        ...(dossier.historique || []),
        { date: now, action: 'Dossier terminé', utilisateur: auteur, commentaire: 'Traitement finalisé — toutes les assignations clôturées' },
        ...(updatedExtensions.some(e => e.statut === 'refuse') ? [{ date: now, action: 'Extensions en attente refusées (clôture)', utilisateur: auteur, commentaire: 'Clôture automatique' }] : []),
      ],
    } as any)
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
      </div>

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