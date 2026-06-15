// components/modules/surveillance/SurveillanceModule.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye,
  ClipboardList,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  PenLine,
  Send,
  Plus,
  Filter,
  X,
  Users,
  Calendar,
  AlertTriangle,
  Activity,
  Archive,
  Search,
  Download,
  Printer,
  FolderArchive,
  HardDrive,
  FileCheck,
  FileSignature,
  Info,
  Shield,
  Mail,
  ChevronRight,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { FormShell } from '@/components/ui/FormShell';
import { Card } from '@/components/ui/card';

// Store
import { useOptimizedStore, useGlobalTransition } from '@/lib/performance/globalOptimizer';
import { useAppStore, type Aerodrome, type TypeEntiteAerodrome } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { getProcessusActifs } from '@/lib/processus';
import { AccordionSection, AccordionGroup, AccordionSubItem } from '@/components/ui/AccordionSection';

// Composants du module
import { SurveillanceCard } from '@/components/cards/SurveillanceCard';
import { SurveillanceForm } from '@/components/forms/SurveillanceForm';
import SurveillanceTransmission from './SurveillanceTransmission';
import SurveillanceLettre from './SurveillanceLettre';

// Types
import { Surveillance, SurveillanceStatut, SurveillanceType } from '@/types/surveillance';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

function typeEntiteBadge(typeEntite?: TypeEntiteAerodrome) {
  switch (typeEntite) {
    case 'helistation': return <span className="badge warning text-[10px]" title="RAS 14 II">🚁 Hélistation</span>
    case 'mixte':       return <span className="badge purple text-[10px]"  title="RAS 14 I+II">✈︎🚁 Mixte</span>
    default:            return <span className="badge neutral text-[10px]" title="RAS 14 I">✈ Aérodrome</span>
  }
}

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

// Statistiques du module
const STATS_CONFIG = [
  { key: 'total', label: 'Total', icon: ClipboardList, variant: 'neutral' },
  { key: 'enCours', label: 'En cours', icon: Clock, variant: 'warning' },
  { key: 'terminees', label: 'Terminées', icon: CheckCircle, variant: 'success' },
  { key: 'ecartsOuverts', label: 'Écarts ouverts', icon: AlertCircle, variant: 'danger' },
  { key: 'checklistsSignees', label: 'Checklists signées', icon: PenLine, variant: 'primary' },
  { key: 'rapportsSignes', label: 'Rapports', icon: FileText, variant: 'primary' },
];

// Options de filtre
const TYPE_OPTIONS: { value: SurveillanceType | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'programmee', label: 'Programmée' },
  { value: 'inopinee', label: 'Inopinée' },
  { value: 'speciale', label: 'Spéciale' },
  { value: 'suivi_ecarts', label: 'Suivi écarts' },
  { value: 'mise_oeuvre_pac', label: 'Mise œuvre PAC' },
  { value: 'certification', label: 'Certification' },
  { value: 'homologation', label: 'Homologation' },
  { value: 'audit_complet', label: 'Audit complet' },
  { value: 'urgence', label: 'Urgence' },
  { value: 'periodique', label: 'Inspection périodique' },
  { value: 'inopine', label: 'Inspection inopinée' },
  { value: 'maintien', label: 'Maintien de la sécurité' },
];

const STATUT_OPTIONS: { value: SurveillanceStatut | 'all'; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'planifiee', label: 'Planifiée' },
  { value: 'en_cours', label: 'En cours' },
  { value: 'checklist_signee', label: 'Checklist signée' },
  { value: 'ecarts_signes', label: 'Écarts signés' },
  { value: 'rapport_signe', label: 'Rapport signé' },
  { value: 'lettre_signee', label: 'Lettre signée DG' },
  { value: 'transmise', label: 'Transmise' },
  { value: 'archivee', label: 'Archivée' },
];

type OngletPrincipal = 'actives';
type ViewMode = 'list' | 'grid';

interface SurveillanceModuleProps {
  userRole: string;
}

// Composant ArchiveView (conservé tel quel)
function ArchiveView({
  surveillances,
  aerodromes,
  onViewSurveillance,
}: {
  surveillances: Surveillance[];
  aerodromes: any[];
  onViewSurveillance: (surveillance: Surveillance, type?: 'rapport' | 'checklist' | 'ecarts') => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedAerodrome, setSelectedAerodrome] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Filtrer les surveillances terminées/archivées
  const archiveSurveillances = surveillances.filter(s => 
    s.statut === 'transmise' || s.statut === 'archivee'
  );

  const filteredSurveillances = archiveSurveillances.filter(s => {
    if (selectedAerodrome !== 'all' && s.aerodrome_id !== selectedAerodrome) return false;
    if (selectedType !== 'all' && s.type !== selectedType) return false;
    if (selectedYear !== 'all') {
      const year = new Date(s.date_debut).getFullYear().toString();
      if (year !== selectedYear) return false;
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const aerodrome = aerodromes.find(a => a.id === s.aerodrome_id);
      const matches = s.type.toLowerCase().includes(term) ||
        aerodrome?.code_oaci.toLowerCase().includes(term) ||
        aerodrome?.nom.toLowerCase().includes(term);
      if (!matches) return false;
    }
    return true;
  });

  // Grouper par année
  const groupedByYear = (() => {
    const groups: Record<string, Surveillance[]> = {};
    filteredSurveillances.forEach(s => {
      const year = new Date(s.date_debut).getFullYear().toString();
      if (!groups[year]) groups[year] = [];
      groups[year].push(s);
    });
    return Object.fromEntries(Object.entries(groups).sort((a, b) => parseInt(b[0]) - parseInt(a[0])));
  })();

  const getAvailableYears = () => {
    const years = new Set<string>();
    archiveSurveillances.forEach(s => {
      years.add(new Date(s.date_debut).getFullYear().toString());
    });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  };

  const getTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      programmee: 'Programmée',
      inopinee: 'Inopinée',
      speciale: 'Spéciale',
      suivi_ecarts: 'Suivi écarts',
      mise_oeuvre_pac: 'Mise œuvre PAC',
      certification: 'Certification',
      homologation: 'Homologation',
      audit_complet: 'Audit complet',
      urgence: 'Urgence',
    };
    return labels[type] || type;
  };

  const getStatutBadge = (statut: string) => {
    if (statut === 'transmise') return 'badge primary';
    return 'badge neutral';
  };

  const getStatutLabel = (statut: string) => {
    if (statut === 'transmise') return 'Transmise';
    return 'Archivée';
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedYear('all');
    setSelectedAerodrome('all');
    setSelectedType('all');
  };

  const stats = {
    total: archiveSurveillances.length,
    transmises: archiveSurveillances.filter(s => s.statut === 'transmise').length,
    archivees: archiveSurveillances.filter(s => s.statut === 'archivee').length,
  };

  return (
    <div className="space-y-6">
      {/* KPIs Archive */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <HardDrive className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total archivées</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-primary-soft">
            <Send className="w-5 h-5 text-primary" />
          </div>
          <div className="kpi-label">Transmises</div>
          <div className="kpi-value">{stats.transmises}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <FolderArchive className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Archivées</div>
          <div className="kpi-value">{stats.archivees}</div>
        </div>
      </div>

      {/* Filtres Archive */}
      <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres archive">
        <div className="flex flex-wrap items-center gap-3">
          {/* Recherche */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Aérodrome, code OACI, type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm ${focusClass}`}
            />
          </div>

          {/* Année */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="all">Toutes les années</option>
            {getAvailableYears().map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          {/* Aérodrome */}
          <select
            value={selectedAerodrome}
            onChange={(e) => setSelectedAerodrome(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none min-w-[180px] ${focusClass}`}
            style={selectStyle}
          >
            <option value="all">Tous les aérodromes</option>
            {aerodromes.map(a => (
              <option key={a.id} value={a.id}>{a.code_oaci} - {a.nom}</option>
            ))}
          </select>

          {/* Type */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            {TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Réinitialiser */}
          <button onClick={resetFilters} className="action-button" title="Réinitialiser">
            <X className="w-4 h-4" />
          </button>
        </div>
      </Card>

      {/* Résultats Archives */}
      {Object.keys(groupedByYear).length === 0 ? (
        <Card className="text-center text-muted-foreground">
            <Archive className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-body">Aucune surveillance archivée trouvée</p>
            <p className="text-small mt-2">Modifiez vos filtres pour élargir la recherche</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedByYear).map(([year, yearSurveillances]) => {
            
            // Grouper par aérodrome à l'intérieur de l'année
            const aerodromeGroups: Record<string, Surveillance[]> = {};
            yearSurveillances.forEach(s => {
              const key = s.aerodrome_id;
              if (!aerodromeGroups[key]) aerodromeGroups[key] = [];
              aerodromeGroups[key].push(s);
            });

            return (
              <AccordionSection
                key={year}
                icon={<Calendar className="w-5 h-5 text-role-primary" />}
                title={`Année ${year}`}
                badges={<span className="badge outline">{yearSurveillances.length} surveillance(s)</span>}
              >
                {Object.entries(aerodromeGroups).map(([aerodromeId, aeroSurveillances]) => {
                  const aerodrome = aerodromes.find(a => a.id === aerodromeId);

                  return (
                    <AccordionSubItem
                      key={aerodromeId}
                      itemKey={aerodromeId}
                      title={`${aerodrome?.code_oaci || aerodromeId} - ${aerodrome?.nom || 'Aérodrome'}`}
                      badges={<span className="badge outline">{aeroSurveillances.length} surveillance(s)</span>}
                    >
                      {aeroSurveillances.map(surveillance => (
                  <Card key={surveillance.id} className="mb-2">
                              <div className="flex items-start justify-between flex-wrap gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-2">
                                    <span className="badge outline">{getTypeLabel(surveillance.type)}</span>
                                    <span className={getStatutBadge(surveillance.statut)}>
                                      {getStatutLabel(surveillance.statut)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(surveillance.date_debut).toLocaleDateString('fr-FR')} → {new Date(surveillance.date_fin).toLocaleDateString('fr-FR')}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Users className="w-3 h-3" />
                                      {surveillance.equipe_ids?.length || 0} inspecteur(s)
                                    </span>
                                    {surveillance.transmitted_at && (
                                      <span className="flex items-center gap-1">
                                        <Send className="w-3 h-3" />
                                        Transmis le {new Date(surveillance.transmitted_at).toLocaleDateString('fr-FR')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => onViewSurveillance(surveillance, 'rapport')}
                                    className="action-button"
                                    title="Voir le rapport"
                                  >
                                    <FileText className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => onViewSurveillance(surveillance, 'checklist')}
                                    className="action-button"
                                    title="Voir la checklist"
                                  >
                                    <ClipboardList className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => onViewSurveillance(surveillance, 'ecarts')}
                                    className="action-button"
                                    title="Voir les écarts"
                                  >
                                    <FileSignature className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                          </Card>
                              ))}
                            </AccordionSubItem>
                          );
                        })}
                      </AccordionSection>
                    );
                  })}
        </div>
      )}
    </div>
  );
}

export default function SurveillanceModule({ userRole }: SurveillanceModuleProps) {
  const router = useRouter();
  const { startTransition } = useGlobalTransition();
  
  // Store
  const user = useOptimizedStore(s => s.user)
  const aerodromes = useOptimizedStore(s => s.aerodromes)
  const surveillances = useOptimizedStore(s => s.surveillances)
  const ecarts = useOptimizedStore(s => s.ecarts)
  const certifications = useAppStore(s => s.certifications)
  const homologations = useAppStore(s => s.homologations)
  const updateSurveillance = useAppStore(s => s.updateSurveillance)
  const deleteSurveillance = useAppStore(s => s.deleteSurveillance)
  const verifierAvantTransmission = useAppStore(s => s.verifierAvantTransmission)
  const passerEtapeSuivante = useAppStore(s => s.passerEtapeSuivante)
  const addNotification = useAppStore(s => s.addNotification)
  const setActiveModule = useAppStore(s => s.setActiveModule)

  // Récupérer les exemptions actives si la fonction existe
  const getExemptionsActives = (useAppStore as any).getExemptionsActives?.bind(useAppStore) || (() => []);

  // Portal mount state
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // États UI
  const [ongletPrincipal, setOngletPrincipal] = useState<OngletPrincipal>('actives');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filters, setFilters] = useState({
    aerodrome: 'all' as string,
    type: 'all' as SurveillanceType | 'all',
    statut: 'all' as SurveillanceStatut | 'all',
    type_entite: 'all' as TypeEntiteAerodrome | 'all',
  });
  const [showProcessus, setShowProcessus] = useState(false);

  const resetFilters = () => {
    setFilters({ aerodrome: 'all', type: 'all', statut: 'all', type_entite: 'all' });
  };

  const handleViewDetails = (surveillance: Surveillance) => {
    router.push(`/surveillance/${surveillance.id}`);
  };

  const handleViewSurveillance = (surveillance: Surveillance, view: 'rapport' | 'checklist' | 'ecarts') => {
    if (view === 'rapport') {
      router.push(`/surveillance/${surveillance.id}/rapport`);
    } else if (view === 'ecarts') {
      const portee = surveillance.portee || [];
      const hasSGS = portee.includes('SGS');
      if (hasSGS && portee.length > 1) {
        setEcartChoiceSurveillance(surveillance);
        setShowEcartChoice(true);
      } else if (hasSGS) {
        router.push(`/surveillance/${surveillance.id}/ecarts/sgs`);
      } else {
        router.push(`/surveillance/${surveillance.id}/ecarts`);
      }
    } else {
      router.push(`/surveillance/${surveillance.id}`);
    }
  };

  const handleEditSurveillance = (surveillance: Surveillance) => {
    setEditingSurveillance(surveillance);
    setFormOpen(true);
  };

  const handleDeleteSurveillance = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette surveillance ?')) {
      deleteSurveillance(id);
    }
  };

  const handleContinue = (surveillance: Surveillance) => {
    passerEtapeSuivante(surveillance.id);
  };

  const handleTransmit = (surveillance: Surveillance) => {
    const aerodrome = aerodromes.find(a => a.id === surveillance.aerodrome_id);
    setTransmissionData({
      open: true,
      surveillance,
      aerodrome,
      ok: surveillance.statut === 'transmise' || surveillance.statut === 'archivee',
      checklistSignee: true,
      ecartsTraites: true,
      rapportSigne: true,
      lettreSigneeDG: true,
      manquants: [],
    });
  };

  const handleChecklistNavigation = (surveillance: Surveillance) => {
    router.push(`/surveillance/${surveillance.id}`);
  };

  const openLettreModal = (surveillance: Surveillance) => {
    setLettreSurveillance(surveillance);
    setLettreModalOpen(true);
  };

  const handleTransmissionComplete = () => {
    setTransmissionData(null);
  };

  // États modals
  const [formOpen, setFormOpen] = useState(false);

  const [transmissionOpen, setTransmissionOpen] = useState(false);

  const [currentSurveillance, setCurrentSurveillance] = useState<Surveillance | null>(null);
  const [editingSurveillance, setEditingSurveillance] = useState<Surveillance | null>(null);
  const [transmissionData, setTransmissionData] = useState<{
    open: boolean;
    surveillance: Surveillance;
    aerodrome?: Aerodrome;
    ok: boolean;
    checklistSignee: boolean;
    ecartsTraites: boolean;
    rapportSigne: boolean;
    lettreSigneeDG: boolean;
    manquants: string[];
  } | null>(null);
  const [lettreModalOpen, setLettreModalOpen] = useState(false);
  const [lettreSurveillance, setLettreSurveillance] = useState<Surveillance | null>(null);

  // État pour le choix Écarts SGS/Standard
  const [showEcartChoice, setShowEcartChoice] = useState(false);
  const [ecartChoiceSurveillance, setEcartChoiceSurveillance] = useState<Surveillance | null>(null);

  // Obtenir les exemptions actives par aérodrome (pour affichage)
  const exemptionsActivesParAerodrome = useMemo(() => {
    const map = new Map<string, any[]>();
    try {
      aerodromes.forEach(aero => {
        const actives = getExemptionsActives(aero.id);
        if (actives && actives.length > 0) {
          map.set(aero.id, actives);
        }
      });
    } catch (e) {
      // La fonction n'existe pas encore
    }
    return map;
  }, [aerodromes, getExemptionsActives]);

  // Statistiques
  const stats = useMemo(() => {
    const total = surveillances.length;
    const enCours = surveillances.filter(s => s.statut === 'en_cours').length;
    const terminees = surveillances.filter(s => s.statut === 'transmise' || s.statut === 'archivee').length;
    const ecartsOuverts = ecarts.filter(e => e.statut !== 'cloture').length;
    const checklistsSignees = surveillances.filter(s => s.statut >= 'checklist_signee').length;
    const rapportsSignes = surveillances.filter(s => s.statut >= 'rapport_signe').length;

    return { total, enCours, terminees, ecartsOuverts, checklistsSignees, rapportsSignes };
  }, [surveillances, ecarts]);

// Create aerodrome lookup map for O(1) access
   const aerodromesMap = useMemo(() => {
     const map = new Map<string, Aerodrome>();
     aerodromes.forEach(aero => {
       map.set(aero.id, aero);
     });
     return map;
    }, [aerodromes]);

   const processusActifs = useMemo(() =>
     getProcessusActifs(certifications, homologations, surveillances, ecarts, aerodromes),
   [certifications, homologations, surveillances, ecarts, aerodromes]);

   // Surveillances filtrées (actives, non archivées)
   const filteredSurveillances = useMemo(() => {
     return surveillances.filter(s => {
        // Exclure les surveillances terminées/archivées de l'onglet actives
        // Onglet actives : exclure les surveillances terminées/archivées
        if (s.statut === 'transmise' || s.statut === 'archivee') return false;
       if (filters.aerodrome !== 'all' && s.aerodrome_id !== filters.aerodrome) return false;
       if (filters.statut !== 'all' && s.statut !== filters.statut) return false;
       if (filters.type !== 'all' && s.type !== filters.type) return false;
       if (filters.type_entite !== 'all') {
         const aero = aerodromesMap.get(s.aerodrome_id);
         if (aero?.type_entite !== filters.type_entite) return false;
       }
       if (showProcessus) {
         const isProcessusType = s.type === 'certification' || s.type === 'homologation';
         const aUnProcessusActif = processusActifs.some(pr => pr.aerodrome_id === s.aerodrome_id && pr.processus_type === s.type);
         if (!isProcessusType || !aUnProcessusActif) return false;
       }
       return true;
     });
   }, [surveillances, filters, ongletPrincipal, aerodromesMap, showProcessus, processusActifs]);

   // Groupement par aérodrome (pour onglet actives seulement)
   const surveillancesByAerodrome = useMemo(() => {
     if (ongletPrincipal !== 'actives') return [];
     const grouped = new Map();
     filteredSurveillances.forEach(s => {
       const aero = aerodromesMap.get(s.aerodrome_id);
       if (!aero) return;

       if (!grouped.has(s.aerodrome_id)) {
         grouped.set(s.aerodrome_id, {
           aerodrome: aero,
           surveillances: [],
           hasExemptions: exemptionsActivesParAerodrome.has(s.aerodrome_id),
         });
       }
       grouped.get(s.aerodrome_id).surveillances.push(s);
     });
    return Array.from(grouped.values());
  }, [filteredSurveillances, aerodromesMap, ongletPrincipal, exemptionsActivesParAerodrome]);

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="surveillance">

      {/* Bandeau d'information si des exemptions existent */}
      {exemptionsActivesParAerodrome.size > 0 && ongletPrincipal === 'actives' && (
        <div className="alert alert-info">
          <Shield className="alert-icon" />
          <div className="alert-content">
            <div className="alert-title">Exemptions actives détectées</div>
            <div className="alert-description">
              Certains aérodromes bénéficient d'exemptions. Les mesures d'atténuation seront automatiquement ajoutées aux checklists.
            </div>
          </div>
        </div>
      )}

      {/* En-tête */}
      <ModuleHeader
        icon={<Eye className="h-6 w-6" />}
        title="Surveillance"
        description="Gestion des surveillances et checklists"
        actions={<div className="flex items-center gap-2">
          <div className="alert alert-info p-2 text-sm">
            <Info className="h-4 w-4" />
            <span>Les surveillances sont créées depuis le module Planning</span>
          </div>
        </div>}
      />

      {/* KPIs - 6 cartes */}
      <div className="kpi-grid">
        {STATS_CONFIG.map(({ key, label, icon: Icon, variant }) => (
          <div key={key} className="kpi-card">
            <div className={`kpi-icon bg-${variant}/20`}>
              <Icon className="h-5 w-5 text-role-primary" />
            </div>
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{stats[key as keyof typeof stats]}</div>
          </div>
        ))}
      </div>

      {/* Onglets principaux */}
      <div className="tabs border-b border-border">
        <button
          onClick={() => setOngletPrincipal('actives')}
          className={`tab py-2 px-4 ${ongletPrincipal === 'actives' ? 'active border-b-2 border-role-primary text-role-primary' : 'text-muted-foreground'}`}
        >
          <Activity className="w-4 h-4 inline mr-2" />
          Actives
        </button>
        <button
          onClick={() => setActiveModule('registres')}
          className="tab py-2 px-4 text-muted-foreground hover:text-role-primary transition-colors"
          title="Les archives sont consultables dans le module Registres"
        >
          <Archive className="w-4 h-4 inline mr-2" />
          Archives → Registres
        </button>
      </div>

      {/* Onglet Actives */}
      {ongletPrincipal === 'actives' && (
        <>
          {/* Filtres */}
          <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres">
            <div className="flex flex-wrap items-center gap-3">
               {/* Filtre Aérodrome */}
               <select
                 value={filters.aerodrome}
                 onChange={(e) => setFilters(f => ({ ...f, aerodrome: e.target.value }))}
                 className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                 style={selectStyle}
               >
                 <option value="all">Tous les aérodromes</option>
                 {/* Memoize aerodrome options */}
                 {useMemo(() => {
                   return aerodromes.map(a => (
                     <option key={a.id} value={a.id}>
                       {a.code_oaci} - {a.nom}
                       {exemptionsActivesParAerodrome.has(a.id) && ' ⚠️'}
                     </option>
                   ))
                 }, [aerodromes, exemptionsActivesParAerodrome])}
               </select>

              {/* Filtre Type */}
              <select
                value={filters.type}
                onChange={(e) => setFilters(f => ({ ...f, type: e.target.value as any }))}
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
              >
                {TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {/* Filtre Statut */}
              <select
                value={filters.statut}
                onChange={(e) => setFilters(f => ({ ...f, statut: e.target.value as any }))}
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
              >
                {STATUT_OPTIONS.filter(opt => opt.value !== 'transmise' && opt.value !== 'archivee').map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {/* Filtre Nature d'infrastructure */}
              <select
                value={filters.type_entite}
                onChange={(e) => setFilters(f => ({ ...f, type_entite: e.target.value as any }))}
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
              >
                <option value="all">Toutes les natures</option>
                <option value="aerodrome">✈ Aérodrome</option>
                <option value="helistation">🚁 Hélistation</option>
                <option value="mixte">✈︎🚁 Mixte</option>
              </select>

              {/* Réinitialiser */}
              <button
                className="btn btn-secondary gap-1"
                onClick={resetFilters}
              >
                <X className="h-4 w-4" />
                Réinitialiser
              </button>

              {processusActifs.length > 0 && (
                <button
                  onClick={() => setShowProcessus(!showProcessus)}
                  className={`filter-chip ${showProcessus ? 'active' : ''}`}
                >
                  <Shield className="w-3 h-3 mr-1" />
                  Certification / Homologation
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold bg-primary text-white">{processusActifs.length}</span>
                </button>
              )}

              <div className="ml-auto view-toggle">
                <button
                  onClick={() => setViewMode('list')}
                  className={viewMode === 'list' ? 'active' : ''}
                  title="Vue liste"
                >
                  <ClipboardList className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={viewMode === 'grid' ? 'active' : ''}
                  title="Vue grille"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Card>

          {/* VUE LISTE - Groupée par aérodrome (accordéon) */}
          {viewMode === 'list' && (
            <AccordionGroup spacing="sm">
              {surveillancesByAerodrome.map(({ aerodrome, surveillances: aeroSurveillances, hasExemptions }) => (
                <AccordionSection
                  key={aerodrome.id}
                  icon={<FileText className="w-4 h-4 text-white" />}
                  title={<><span className="code-oaci-badge mr-2">{aerodrome.code_oaci}</span>{aerodrome.nom}</>}
                  badges={
                    <>
                      {typeEntiteBadge((aerodrome as Aerodrome).type_entite)}
                      <span className="badge outline">{aeroSurveillances.length} surveillance(s)</span>
                      {hasExemptions && (
                        <span className="badge warning flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          Exemption(s)
                        </span>
                      )}
                    </>
                  }
                  className={hasExemptions ? 'border-l-4 border-l-warning' : ''}
                >
                  {hasExemptions && (
                    <div className="alert alert-warning mb-3 p-2 text-sm">
                      <Shield className="w-4 h-4" />
                      <span>Cet aérodrome bénéficie d'exemption(s) active(s). Les mesures d'atténuation seront ajoutées aux checklists.</span>
                    </div>
                  )}
                  {aeroSurveillances.map((s: any) => (
                    <div key={s.id} className="space-y-1">
                      {showProcessus && (() => {
                        const pr = processusActifs.find(p => p.aerodrome_id === s.aerodrome_id && p.processus_type === s.type);
                        return pr ? (
                          <div className="flex items-center gap-2 px-1">
                            <span className={`badge ${pr.processus_type === 'certification' ? 'primary' : 'info'} text-[10px]`}>
                              {pr.phase_label}
                            </span>
                            <span className="text-xs text-muted-foreground">{Math.round(pr.progression)}%</span>
                            <div className="progress w-16 h-1.5 ml-1">
                              <div className="progress-bar" style={{ width: `${pr.progression}%` }} />
                            </div>
                            <button className="action-button text-[10px] text-role-primary hover:underline" onClick={() => setActiveModule(pr.processus_type)}>
                              Voir le processus →
                            </button>
                          </div>
                        ) : null
                      })()}
                    <SurveillanceCard
                      key={s.id}
                      surveillance={s}
                      aerodrome={aerodrome}
                      onView={() => handleViewDetails(s)}
                      onEdit={() => handleEditSurveillance(s)}
                      onDelete={() => handleDeleteSurveillance(s.id)}
                      onContinue={() => handleContinue(s)}
                      onTransmit={() => handleTransmit(s)}
                      onViewChecklist={() => handleChecklistNavigation(s)}
                      onViewEcarts={() => {
                        const portee = s.portee || [];
                        const hasSGS = portee.includes('SGS');
                        if (hasSGS && portee.length > 1) {
                          setEcartChoiceSurveillance(s);
                          setShowEcartChoice(true);
                        } else if (hasSGS) {
                          router.push(`/surveillance/${s.id}/ecarts/sgs`);
                        } else {
                          router.push(`/surveillance/${s.id}/ecarts`);
                        }
                      }}
                      onViewRapport={() => handleViewSurveillance(s, 'rapport')}
                      onViewLettre={() => openLettreModal(s)}
                      onViewTransmission={() => handleTransmit(s)}
                    />
                    </div>
                  ))}
                </AccordionSection>
              ))}

              {surveillancesByAerodrome.length === 0 && (
                <Card className="text-center">
                  <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                  <p className="text-body text-muted-foreground">Aucune surveillance active trouvée</p>
                </Card>
              )}
            </AccordionGroup>
          )}

          {/* VUE GRILLE */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredSurveillances.map(surveillance => {
                const aerodrome = aerodromes.find(a => a.id === surveillance.aerodrome_id);
                const hasExemptions = exemptionsActivesParAerodrome.has(surveillance.aerodrome_id);
                return (
                  <div key={surveillance.id} className={`${hasExemptions ? 'border-l-4 border-l-warning' : ''}`}>
                    <SurveillanceCard
                      surveillance={surveillance}
                      aerodrome={aerodrome}
                      onView={() => handleViewDetails(surveillance)}
                      onEdit={() => handleEditSurveillance(surveillance)}
                      onDelete={() => handleDeleteSurveillance(surveillance.id)}
                      onContinue={() => handleContinue(surveillance)}
                      onTransmit={() => handleTransmit(surveillance)}
                      onViewChecklist={() => handleChecklistNavigation(surveillance)}
                      onViewEcarts={() => {
                        const portee = surveillance.portee || [];
                        const hasSGS = portee.includes('SGS');
                        if (hasSGS && portee.length > 1) {
                          setEcartChoiceSurveillance(surveillance);
                          setShowEcartChoice(true);
                        } else if (hasSGS) {
                          router.push(`/surveillance/${surveillance.id}/ecarts/sgs`);
                        } else {
                          router.push(`/surveillance/${surveillance.id}/ecarts`);
                        }
                      }}
                      onViewRapport={() => handleViewSurveillance(surveillance, 'rapport')}
                      onViewLettre={() => openLettreModal(surveillance)}
                      onViewTransmission={() => handleTransmit(surveillance)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}


      {/* MODALS via createPortal */}

      {/* Formulaire (modification uniquement) */}
      <FormShell
        open={!!mounted && formOpen}
        onClose={() => setFormOpen(false)}
        title="Modifier la surveillance"
        icon={Eye}
        size="3xl"
        dataRole={userRole}
      >
        <SurveillanceForm
          surveillance={editingSurveillance}
          onClose={() => setFormOpen(false)}
          onSuccess={() => { setFormOpen(false); setEditingSurveillance(null); }}
          userRole={userRole}
        />
      </FormShell>

      {/* Lettre de transmission — modale */}
      {mounted && lettreModalOpen && lettreSurveillance && createPortal(
        <div
          className="modal-overlay"
          data-role={userRole}
          onClick={() => setLettreModalOpen(false)}
        >
          <div
            className="modal-content max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title flex items-center gap-2">
                  <Mail className="w-5 h-5 text-role-primary" />
                  Lettre de transmission
                </div>
                <button
                  className="modal-close"
                  onClick={() => setLettreModalOpen(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="modal-body p-6">
                <SurveillanceLettre
                  surveillanceId={lettreSurveillance.id}
                  aerodrome={aerodromes.find(a => a.id === lettreSurveillance.aerodrome_id)}
                  onLettreSignee={() => setLettreModalOpen(false)}
                  userRole={userRole}
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Choix Écarts SGS/Standard */}
      {mounted && showEcartChoice && ecartChoiceSurveillance && createPortal(
        <div className="modal-overlay" data-role={userRole} onClick={() => setShowEcartChoice(false)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-role-primary" />
                  Choisir le type d'écarts
                </div>
                <button className="modal-close" onClick={() => setShowEcartChoice(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="modal-body p-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cette surveillance inclut le domaine SGS. Les écarts SGS ont leur propre format d'évaluation. Sélectionnez le type d'écarts à consulter :
                </p>
                <button
                  type="button"
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-role-primary-soft/30 transition-all text-left"
                  onClick={() => {
                    setShowEcartChoice(false);
                    setEcartChoiceSurveillance(null);
                    router.push(`/surveillance/${ecartChoiceSurveillance.id}/ecarts`);
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0">
                    <FileSignature className="w-5 h-5 text-role-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Écarts Standard</p>
                    <p className="text-xs text-muted-foreground">Écarts au format RAS-14 standard</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-role-primary-soft/30 transition-all text-left"
                  onClick={() => {
                    setShowEcartChoice(false);
                    setEcartChoiceSurveillance(null);
                    router.push(`/surveillance/${ecartChoiceSurveillance.id}/ecarts/sgs`);
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-role-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Écarts SGS</p>
                    <p className="text-xs text-muted-foreground">Écarts SGS (PAOE - Annexe 19 OACI)</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Transmission */}
      {transmissionData && (
        <SurveillanceTransmission
          {...transmissionData}
          surveillanceId={transmissionData.surveillance.id}
          onClose={() => {
            setTransmissionOpen(false);
            setTransmissionData(null);
          }}
          onTransmettre={handleTransmissionComplete}
          userRole={userRole}
        />
      )}

    </div>
  );
}
