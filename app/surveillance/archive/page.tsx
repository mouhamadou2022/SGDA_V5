// app/surveillance/archive/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Calendar,
  MapPin,
  FileText,
  CheckCircle2,
  AlertCircle,
  Download,
  Eye,
  Filter,
  Printer,
  FolderArchive,
  HardDrive,
  FileCheck,
  FileSignature,
  Send,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

// Types
interface ArchiveSurveillance {
  id: string;
  aerodrome_id: string;
  aerodrome_nom: string;
  aerodrome_code: string;
  type: string;
  date_debut: string;
  date_fin: string;
  statut: 'transmise' | 'archivee';
  progression: number;
  checklist_signee: boolean;
  ecarts_signes: boolean;
  rapport_signe: boolean;
  lettre_signee: boolean;
  transmitted_at?: string;
  rapport_url?: string;
  checklist_url?: string;
  ecarts_url?: string;
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

const TYPE_OPTIONS = [
  { value: 'all', label: 'Tous les types' },
  { value: 'programmee', label: 'Programmée' },
  { value: 'inopinee', label: 'Inopinée' },
  { value: 'speciale', label: 'Spéciale' },
  { value: 'suivi_ecarts', label: 'Suivi écarts' },
  { value: 'mise_oeuvre_pac', label: 'Mise œuvre PAC' },
  { value: 'audit_complet', label: 'Audit complet' },
];

const STATUT_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'transmise', label: 'Transmise' },
  { value: 'archivee', label: 'Archivée' },
];

// Composant: Carte d'une surveillance dans l'archive
function ArchiveCard({
  surveillance,
  onView,
  onExport,
}: {
  surveillance: ArchiveSurveillance;
  onView: (id: string, type: 'rapport' | 'checklist' | 'ecarts') => void;
  onExport: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dateFormatted = new Date(surveillance.date_debut).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const dateFinFormatted = new Date(surveillance.date_fin).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const typeLabels: Record<string, string> = {
    programmee: 'Programmée',
    inopinee: 'Inopinée',
    speciale: 'Spéciale',
    suivi_ecarts: 'Suivi écarts',
    mise_oeuvre_pac: 'Mise œuvre PAC',
    audit_complet: 'Audit complet',
  };

  return (
    <div className="card border-border mb-3 hover:shadow-lg transition-all">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-role-primary-soft transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 flex-1 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-role-primary-soft flex items-center justify-center">
              <FileText className="w-5 h-5 text-role-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="code-oaci-badge">{surveillance.aerodrome_code}</span>
                <span className="text-sm font-medium text-foreground">{surveillance.aerodrome_nom}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="badge outline">{typeLabels[surveillance.type] || surveillance.type}</span>
                <span className="badge success">Terminée</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {dateFormatted} → {dateFinFormatted}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {surveillance.checklist_signee && (
              <span className="badge success text-[10px]" title="Checklist signée">
                <FileCheck className="w-3 h-3 inline mr-0.5" />
                Checklist
              </span>
            )}
            {surveillance.ecarts_signes && (
              <span className="badge success text-[10px]" title="Écarts signés">
                <FileSignature className="w-3 h-3 inline mr-0.5" />
                Écarts
              </span>
            )}
            {surveillance.rapport_signe && (
              <span className="badge success text-[10px]" title="Rapport signé">
                <FileText className="w-3 h-3 inline mr-0.5" />
                Rapport
              </span>
            )}
            {surveillance.lettre_signee && (
              <span className="badge success text-[10px]" title="Lettre signée DG">
                <Send className="w-3 h-3 inline mr-0.5" />
                Lettre DG
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {surveillance.transmitted_at && (
            <span className="text-xs text-muted-foreground hidden md:block">
              Transmis le {new Date(surveillance.transmitted_at).toLocaleDateString('fr-FR')}
            </span>
          )}
          <button className="action-button" onClick={(e) => { e.stopPropagation(); onExport(surveillance.id); }} title="Exporter">
            <Download className="w-4 h-4" />
          </button>
          <button className="action-button">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 pt-0 border-t border-border animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            {/* Rapport */}
            <div
              className="p-4 rounded-xl bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 cursor-pointer hover:shadow-md transition-all"
              onClick={() => onView(surveillance.id, 'rapport')}
            >
              <FileText className="w-8 h-8 text-primary mb-2" />
              <p className="font-semibold text-sm text-foreground">Rapport de surveillance</p>
              <p className="text-xs text-muted-foreground mt-1">
                Rapport complet signé le {surveillance.transmitted_at ? new Date(surveillance.transmitted_at).toLocaleDateString('fr-FR') : 'N/A'}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Eye className="w-4 h-4 text-primary" />
                <span className="text-xs text-primary">Voir le rapport</span>
              </div>
            </div>

            {/* Checklist */}
            <div
              className="p-4 rounded-xl bg-gradient-to-r from-success/10 to-transparent border border-success/20 cursor-pointer hover:shadow-md transition-all"
              onClick={() => onView(surveillance.id, 'checklist')}
            >
              <FileCheck className="w-8 h-8 text-success mb-2" />
              <p className="font-semibold text-sm text-foreground">Checklist signée</p>
              <p className="text-xs text-muted-foreground mt-1">
                Checklist terrain avec tous les constats
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Eye className="w-4 h-4 text-success" />
                <span className="text-xs text-success">Voir la checklist</span>
              </div>
            </div>

            {/* Écarts */}
            <div
              className="p-4 rounded-xl bg-gradient-to-r from-warning/10 to-transparent border border-warning/20 cursor-pointer hover:shadow-md transition-all"
              onClick={() => onView(surveillance.id, 'ecarts')}
            >
              <FileSignature className="w-8 h-8 text-warning mb-2" />
              <p className="font-semibold text-sm text-foreground">Écarts constatés</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tous les écarts rédigés et signés
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Eye className="w-4 h-4 text-warning" />
                <span className="text-xs text-warning">Voir les écarts</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-border">
            <button
              onClick={() => onExport(surveillance.id)}
              className="btn btn-secondary btn-sm gap-2"
            >
              <Download className="w-4 h-4" />
              Télécharger tout (ZIP)
            </button>
            <button
              onClick={() => window.print()}
              className="btn btn-secondary btn-sm gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Composant principal
export default function ArchivePage() {
  const router = useRouter();
  const user = useAppStore(s => s.user)
  const storeAerodromes = useAppStore(s => s.aerodromes);

  // ── data-role sur body pour les variables CSS de rôle (btn-primary, bg-role-gradient…) ──
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);
  const storeSurveillances = useAppStore(s => s.surveillances);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedAerodrome, setSelectedAerodrome] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatut, setSelectedStatut] = useState<string>('all');
  const [expandedYears, setExpandedYears] = useState<string[]>([]);
  const [expandedAerodromes, setExpandedAerodromes] = useState<Record<string, string[]>>({});

  // Construire les données d'archive depuis le store (surveillances terminées)
  const archiveSurveillances = useMemo(() => {
    const aeroMap = new Map(storeAerodromes.map(a => [a.id, a]));
    return storeSurveillances
      .filter(s => s.statut === 'transmise' || s.statut === 'archivee')
      .map(s => {
        const aero = aeroMap.get(s.aerodrome_id);
        return {
          id: s.id,
          aerodrome_id: s.aerodrome_id,
          aerodrome_nom: aero?.nom || 'Inconnu',
          aerodrome_code: aero?.code_oaci || '????',
          type: s.type,
          date_debut: s.date_debut,
          date_fin: s.date_fin,
          statut: (s.statut === 'transmise' || s.statut === 'archivee' ? s.statut : 'archivee') as 'transmise' | 'archivee',
          progression: s.progression ?? 100,
          checklist_signee: !!s.signatures_checklist?.length,
          ecarts_signes: !!s.signatures_ecarts?.length,
          rapport_signe: !!s.rapport_signe_par,
          lettre_signee: !!s.lettre_signee_url,
          transmitted_at: s.transmitted_at,
        };
      });
  }, [storeAerodromes, storeSurveillances]);

  // Filtrer les surveillances
  const filteredSurveillances = useMemo(() => {
    return archiveSurveillances.filter(s => {
      if (selectedAerodrome !== 'all' && s.aerodrome_id !== selectedAerodrome) return false;
      if (selectedType !== 'all' && s.type !== selectedType) return false;
      if (selectedStatut !== 'all' && s.statut !== selectedStatut) return false;
      if (selectedYear !== 'all') {
        const year = new Date(s.date_debut).getFullYear().toString();
        if (year !== selectedYear) return false;
      }
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = s.aerodrome_nom.toLowerCase().includes(term) ||
          s.aerodrome_code.toLowerCase().includes(term) ||
          s.type.toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [archiveSurveillances, selectedAerodrome, selectedType, selectedStatut, selectedYear, searchTerm]);

  // Grouper par année
  const groupedByYear = useMemo(() => {
    const groups: Record<string, ArchiveSurveillance[]> = {};
    filteredSurveillances.forEach(s => {
      const year = new Date(s.date_debut).getFullYear().toString();
      if (!groups[year]) groups[year] = [];
      groups[year].push(s);
    });
    // Trier les années décroissantes
    return Object.fromEntries(
      Object.entries(groups).sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
    );
  }, [filteredSurveillances]);

  // Grouper par aérodrome à l'intérieur d'une année
  const groupByAerodrome = useCallback((surveillances: ArchiveSurveillance[]) => {
    const groups: Record<string, ArchiveSurveillance[]> = {};
    surveillances.forEach(s => {
      const key = `${s.aerodrome_id}-${s.aerodrome_code}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return Object.entries(groups).sort((a, b) => {
      const codeA = a[1][0]?.aerodrome_code || '';
      const codeB = b[1][0]?.aerodrome_code || '';
      return codeA.localeCompare(codeB);
    });
  }, []);

  const toggleYear = (year: string) => {
    setExpandedYears(prev =>
      prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
    );
  };

  const toggleAerodrome = (year: string, aerodromeKey: string) => {
    setExpandedAerodromes(prev => ({
      ...prev,
      [year]: prev[year]?.includes(aerodromeKey)
        ? prev[year].filter(k => k !== aerodromeKey)
        : [...(prev[year] || []), aerodromeKey],
    }));
  };

  const getAvailableYears = useMemo(() => {
    const years = new Set<string>();
    archiveSurveillances.forEach(s => {
      years.add(new Date(s.date_debut).getFullYear().toString());
    });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [archiveSurveillances]);

  const handleView = (id: string, type: 'rapport' | 'checklist' | 'ecarts') => {
    router.push(`/surveillance/${id}?view=${type}`);
  };

  const handleExport = (id: string) => {
    console.log('Export dossier complet:', id);
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedYear('all');
    setSelectedAerodrome('all');
    setSelectedType('all');
    setSelectedStatut('all');
  };

  const stats = {
    total: archiveSurveillances.length,
    transmises: archiveSurveillances.filter(s => s.statut === 'transmise').length,
    archivees: archiveSurveillances.filter(s => s.statut === 'archivee').length,
  };

  return (
    <div className="min-h-screen bg-gray-50" data-role={user?.role}>
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/surveillance')}
                className="btn btn-secondary btn-sm gap-2"
              >
                ← Retour
              </button>
              <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Archive className="w-5 h-5 text-role-primary" />
                  Archive des surveillances
                </h1>
                <p className="text-xs text-muted-foreground">
                  Accès aux surveillances terminées - Préparation audits OACI
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        {/* KPIs */}
        <div className="kpi-grid mb-6">
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

        {/* Filtres */}
        <div className="filters-panel mb-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Recherche */}
            <div className="min-w-[260px] flex-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Recherche
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Aérodrome, code OACI, type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-foreground text-sm ${focusClass}`}
                />
              </div>
            </div>

            {/* Année */}
            <div className="min-w-[120px]">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Année
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className={`h-10 px-3 pr-8 rounded-lg border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
              >
                <option value="all">Toutes les années</option>
                {getAvailableYears.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Aérodrome */}
            <div className="min-w-[180px]">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Aérodrome
              </label>
              <select
                value={selectedAerodrome}
                onChange={(e) => setSelectedAerodrome(e.target.value)}
                className={`h-10 px-3 pr-8 rounded-lg border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
              >
                <option value="all">Tous les aérodromes</option>
                {storeAerodromes.map(a => (
                  <option key={a.id} value={a.id}>{a.code_oaci} - {a.nom}</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div className="min-w-[140px]">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className={`h-10 px-3 pr-8 rounded-lg border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
              >
                {TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Statut */}
            <div className="min-w-[120px]">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Statut
              </label>
              <select
                value={selectedStatut}
                onChange={(e) => setSelectedStatut(e.target.value)}
                className={`h-10 px-3 pr-8 rounded-lg border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
              >
                {STATUT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Réinitialiser */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2 opacity-0">
                Action
              </label>
              <button onClick={resetFilters} className="btn btn-secondary h-10 px-4 gap-2">
                <X className="w-4 h-4" />
                Réinitialiser
              </button>
            </div>
          </div>
        </div>

        {/* Résultats */}
        {Object.keys(groupedByYear).length === 0 ? (
          <div className="card">
            <div className="card-content py-12 text-center text-muted-foreground">
              <Archive className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-body">Aucune surveillance archivée trouvée</p>
              <p className="text-small mt-2">Modifiez vos filtres pour élargir la recherche</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedByYear).map(([year, surveillances]) => {
              const isYearExpanded = expandedYears.includes(year);
              const groupedAerodromes = groupByAerodrome(surveillances);

              return (
                <div key={year} className="card border-border overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-role-primary/5 to-transparent hover:bg-role-primary-soft transition-colors"
                    onClick={() => toggleYear(year)}
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-role-primary" />
                      <span className="font-bold text-lg text-foreground">Année {year}</span>
                      <span className="badge outline">{surveillances.length} surveillance(s)</span>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform ${isYearExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isYearExpanded && (
                    <div className="p-4 space-y-3 animate-fade-in">
                      {groupedAerodromes.map(([aerodromeKey, aeroSurveillances]) => {
                        const aerodrome = aeroSurveillances[0];
                        const isAerodromeExpanded = expandedAerodromes[year]?.includes(aerodromeKey) || false;

                        return (
                          <div key={aerodromeKey} className="border border-border rounded-lg overflow-hidden">
                            <button
                              className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                              onClick={() => toggleAerodrome(year, aerodromeKey)}
                            >
                              <div className="flex items-center gap-3">
                                <MapPin className="w-4 h-4 text-role-primary" />
                                <span className="font-semibold text-sm">
                                  {aerodrome.aerodrome_code} - {aerodrome.aerodrome_nom}
                                </span>
                                <span className="badge outline">{aeroSurveillances.length} surveillance(s)</span>
                              </div>
                              <ChevronDown className={`w-4 h-4 transition-transform ${isAerodromeExpanded ? 'rotate-180' : ''}`} />
                            </button>

                            {isAerodromeExpanded && (
                              <div className="p-3 space-y-2">
                                {aeroSurveillances.map(s => (
                                  <ArchiveCard
                                    key={s.id}
                                    surveillance={s}
                                    onView={handleView}
                                    onExport={handleExport}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}