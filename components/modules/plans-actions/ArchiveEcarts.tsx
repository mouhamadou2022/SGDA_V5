// components/modules/plans-actions/ArchiveEcarts.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Search,
  X,
  Calendar,
  MapPin,
  AlertTriangle,
  Flame,
  AlertOctagon,
  AlertCircle,
  Info,
  Eye,
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  History,
} from 'lucide-react';
import { useOptimizedStore, useGlobalDebounce, useGlobalTransition } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { AccordionSection, AccordionGroup, AccordionSubGroup, AccordionSubItem } from '@/components/ui/AccordionSection';

interface ArchiveEcartsProps {
  userRole: string;
}

interface ArchiveEcartDetail {
  id: string;
  reference: string;
  libelle: string;
  niveau_risque: string;
  aerodrome_id: string;
  aerodrome_nom: string;
  aerodrome_code: string;
  date_cloture: string;
  date_creation: string;
  statut: string;
  decision_pac: 'accepte' | 'refuse';
  preuves_validees: boolean;
  timeline: {
    etape: string;
    date: string;
    acteur: string;
  }[];
  preuves: { nom: string; url: string }[];
}

const getNiveauIcone = (niveau: string) => {
  switch (niveau) {
    case 'critique': return Flame;
    case 'eleve': return AlertOctagon;
    case 'moyen': return AlertCircle;
    default: return Info;
  }
};

const getNiveauBadge = (niveau: string) => {
  switch (niveau) {
    case 'critique': return 'badge danger';
    case 'eleve': return 'badge warning';
    case 'moyen': return 'badge primary';
    default: return 'badge neutral';
  }
};

function TimelineStep({ step, isLast, isCompleted }: { step: any; isLast: boolean; isCompleted: boolean }) {
  return (
    <div className="flex items-center flex-1">
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ${
          isCompleted ? 'bg-success text-white' : 'bg-gray-200 text-gray-500'
        }`}>
          {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : step.icon}
        </div>
        <span className="text-[9px] text-muted-foreground mt-0.5">{step.date}</span>
      </div>
      {!isLast && (
        <div className={`flex-1 h-0.5 mx-1 ${isCompleted ? 'bg-success' : 'bg-gray-200'}`} />
      )}
    </div>
  );
}

function EcartDetailModal({
  ecart,
  onClose,
  userRole,
}: {
  ecart: ArchiveEcartDetail;
  onClose: () => void;
  userRole: string;
}) {
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const timelineSteps = [
    { label: 'Création', date: new Date(ecart.date_creation).toLocaleDateString('fr-FR'), icon: '📋', completed: true },
    { label: 'PAC', date: ecart.timeline.find(t => t.etape === 'pac')?.date || '', icon: '📄', completed: !!ecart.timeline.find(t => t.etape === 'pac') },
    { label: 'Évaluation', date: ecart.timeline.find(t => t.etape === 'evaluation')?.date || '', icon: '⚖️', completed: !!ecart.timeline.find(t => t.etape === 'evaluation') },
    { label: 'Preuves', date: ecart.timeline.find(t => t.etape === 'preuves')?.date || '', icon: '📎', completed: ecart.preuves_validees },
    { label: 'Clôture', date: new Date(ecart.date_cloture).toLocaleDateString('fr-FR'), icon: '✅', completed: true },
  ];

  const NiveauIcon = getNiveauIcone(ecart.niveau_risque);
  const niveauBadge = getNiveauBadge(ecart.niveau_risque);

  const modalContent = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-background rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border-t-4 border-t-role-primary flex flex-col">
        <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
          <div className="modal-title flex items-center gap-2">
            <Archive className="w-5 h-5 text-role-primary" />
            Détail complet - {ecart.reference}
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* En-tête */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <NiveauIcon className={`w-5 h-5 ${niveauBadge === 'badge danger' ? 'text-danger' : niveauBadge === 'badge warning' ? 'text-warning' : 'text-muted-foreground'}`} />
              <span className={niveauBadge}>{ecart.niveau_risque}</span>
              <span className="code-oaci-badge text-xs">{ecart.aerodrome_code}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge success text-[10px]">Clôturé</span>
              <span className="badge neutral text-[10px]">
                {new Date(ecart.date_cloture).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-foreground">{ecart.libelle}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Aérodrome: {ecart.aerodrome_nom} ({ecart.aerodrome_code})
            </p>
          </div>

          {/* Timeline */}
          <div className="card border-border">
            <div className="card-header pb-2">
              <div className="card-title text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-role-primary" />
                Timeline
              </div>
            </div>
            <div className="card-content">
              <div className="flex items-center justify-between">
                {timelineSteps.map((step, idx) => (
                  <React.Fragment key={step.label}>
                    <div className="flex flex-col items-center flex-1 min-w-0">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                        step.completed ? 'bg-success text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {step.completed ? <CheckCircle2 className="w-4 h-4" /> : step.icon}
                      </div>
                      <span className="text-[10px] font-medium mt-1 text-center">{step.label}</span>
                      <span className="text-[8px] text-muted-foreground">{step.date || '—'}</span>
                    </div>
                    {idx < timelineSteps.length - 1 && (
                      <div className={`flex-1 h-0.5 ${step.completed ? 'bg-success' : 'bg-gray-200'}`} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Décision */}
          <div className={`p-3 rounded-lg ${ecart.decision_pac === 'accepte' ? 'bg-success/10 border border-success/30' : 'bg-danger/10 border border-danger/30'}`}>
            <div className="flex items-center gap-2">
              {ecart.decision_pac === 'accepte' ? (
                <CheckCircle2 className="w-4 h-4 text-success" />
              ) : (
                <XCircle className="w-4 h-4 text-danger" />
              )}
              <span className="text-sm font-medium">
                PAC {ecart.decision_pac === 'accepte' ? 'ACCEPTÉ' : 'REFUSÉ'}
              </span>
              {ecart.preuves_validees && (
                <span className="badge success text-[10px] ml-2">Preuves validées</span>
              )}
            </div>
          </div>

          {/* Preuves */}
          {ecart.preuves.length > 0 && (
            <div className="card border-border">
              <div className="card-header pb-2">
                <div className="card-title text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-role-primary" />
                  Preuves archivées
                </div>
              </div>
              <div className="card-content">
                <div className="space-y-2">
                  {ecart.preuves.map((preuve, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-role-primary-soft rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <span className="text-sm">{preuve.nom}</span>
                      </div>
                      <button
                        onClick={() => window.open(preuve.url, '_blank')}
                        className="action-button"
                        title="Voir le fichier"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Historique détaillé */}
          <div className="card border-border">
            <div className="card-header pb-2">
              <div className="card-title text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-role-primary" />
                Historique des actions
              </div>
            </div>
            <div className="card-content">
              <div className="space-y-2">
                {ecart.timeline.map((event, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-sm">
                    <div className="w-24 text-xs text-muted-foreground flex-shrink-0">
                      {new Date(event.date).toLocaleDateString('fr-FR')}
                    </div>
                    <div className="flex-1">
                      <span className="text-sm">{event.etape}</span>
                      <span className="text-xs text-muted-foreground ml-2">par {event.acteur}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
          <button className="btn btn-primary gap-2">
            <Download className="w-4 h-4" />
            Exporter le dossier
          </button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(modalContent, document.body);
}

export function ArchiveEcarts({ userRole }: ArchiveEcartsProps) {
  const ecarts = useOptimizedStore(s => s.ecarts);
  const aerodromes = useOptimizedStore(s => s.aerodromes);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useGlobalDebounce(searchTerm, 300);
  const [filters, setFilters] = useState({
    aerodrome: 'all',
    niveau: 'all',
    periode: 'all',
  });
  const [selectedEcart, setSelectedEcart] = useState<ArchiveEcartDetail | null>(null);
  const { startTransition } = useGlobalTransition();

  // Récupérer les écarts clôturés
  const ecartsClotures = ecarts.filter(e => e.statut === 'cloture');

  // Enrichir avec les données d'archive
  const archiveData = useMemo(() => {
    return ecartsClotures.map(ecart => {
      const aerodrome = aerodromes.find(a => a.id === ecart.aerodrome_id);
      
      // Construire la timeline à partir de l'historique
      const timeline = [
        { etape: 'Création de l\'écart', date: ecart.created_at, acteur: 'ANACIM' },
      ];
      
      if (ecart.pac?.soumis_le) {
        timeline.push({ etape: 'PAC soumis', date: ecart.pac.soumis_le, acteur: 'Exploitant' });
      }
      if (ecart.evaluation_pac?.evalue_le) {
        timeline.push({ 
          etape: `PAC ${ecart.evaluation_pac.decision === 'accepte' ? 'accepté' : 'refusé'}`, 
          date: ecart.evaluation_pac.evalue_le, 
          acteur: 'ANACIM' 
        });
      }
      if (ecart.preuves?.soumis_le) {
        timeline.push({ etape: 'Preuves soumises', date: ecart.preuves.soumis_le, acteur: 'Exploitant' });
      }
      if (ecart.validation_preuves?.valide_le) {
        timeline.push({ 
          etape: `Preuves ${ecart.validation_preuves.decision === 'valide' ? 'validées' : 'refusées'}`, 
          date: ecart.validation_preuves.valide_le, 
          acteur: 'ANACIM' 
        });
      }
      if (ecart.cloture_le) {
        timeline.push({ etape: 'Écart clôturé', date: ecart.cloture_le, acteur: 'Système' });
      }

      return {
        id: ecart.id,
        reference: ecart.reference,
        libelle: ecart.libelle,
        niveau_risque: ecart.niveau_risque,
        aerodrome_id: ecart.aerodrome_id,
        aerodrome_nom: aerodrome?.nom || '',
        aerodrome_code: aerodrome?.code_oaci || '',
        date_cloture: ecart.cloture_le || ecart.updated_at,
        date_creation: ecart.created_at,
        statut: ecart.statut,
        decision_pac: ecart.evaluation_pac?.decision === 'accepte' ? 'accepte' : 'refuse',
        preuves_validees: ecart.validation_preuves?.decision === 'valide',
        timeline,
        preuves: ecart.preuves?.fichiers?.map(f => ({ nom: f.nom, url: f.url })) || [],
      };
    });
  }, [ecartsClotures, aerodromes]);

  // Filtrer
  const filteredData = useMemo(() => {
    return archiveData.filter(item => {
      if (filters.aerodrome !== 'all' && item.aerodrome_id !== filters.aerodrome) return false;
      if (filters.niveau !== 'all' && item.niveau_risque !== filters.niveau) return false;
      if (filters.periode !== 'all') {
        const year = new Date(item.date_cloture).getFullYear().toString();
        if (year !== filters.periode) return false;
      }
      if (debouncedSearchTerm) {
        const term = debouncedSearchTerm.toLowerCase();
        const matches = item.reference.toLowerCase().includes(term) ||
          item.libelle.toLowerCase().includes(term) ||
          item.aerodrome_code.toLowerCase().includes(term) ||
          item.aerodrome_nom.toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [archiveData, filters, debouncedSearchTerm]);

  // Grouper par année
  const groupedByYear = useMemo(() => {
    const groups: Record<string, ArchiveEcartDetail[]> = {};
    filteredData.forEach(item => {
      const year = new Date(item.date_cloture).getFullYear().toString();
      if (!groups[year]) groups[year] = [];
      groups[year].push(item as ArchiveEcartDetail);
    });
    return Object.fromEntries(Object.entries(groups).sort((a, b) => parseInt(b[0]) - parseInt(a[0])));
  }, [filteredData]);

  const resetFilters = () => {
    setSearchTerm('');
    setFilters({ aerodrome: 'all', niveau: 'all', periode: 'all' });
  };

  const stats = {
    total: archiveData.length,
    critiques: archiveData.filter(e => e.niveau_risque === 'critique').length,
    eleves: archiveData.filter(e => e.niveau_risque === 'eleve').length,
    moyens: archiveData.filter(e => e.niveau_risque === 'moyen').length,
    faibles: archiveData.filter(e => e.niveau_risque === 'faible').length,
  };

  // Obtenir les années disponibles
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    archiveData.forEach(e => years.add(new Date(e.date_cloture).getFullYear().toString()));
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [archiveData]);

  return (
    <div className="space-y-4" data-role={userRole} data-module="archive-ecarts">
      {/* Stats */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <Archive className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card border-danger">
          <div className="kpi-icon bg-danger-soft">
            <Flame className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label text-danger">Critiques</div>
          <div className="kpi-value text-danger">{stats.critiques}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <AlertOctagon className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">Élevés</div>
          <div className="kpi-value">{stats.eleves}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-primary-soft">
            <AlertCircle className="w-5 h-5 text-primary" />
          </div>
          <div className="kpi-label">Moyens</div>
          <div className="kpi-value">{stats.moyens}</div>
        </div>
      </div>

      {/* Filtres */}
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher par référence, libellé, aérodrome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)]`}
            />
          </div>
          <select
            value={filters.aerodrome}
            onChange={(e) => setFilters({ ...filters, aerodrome: e.target.value })}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)]`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.75rem center',
              backgroundRepeat: 'no-repeat',
              appearance: 'none',
            }}
          >
            <option value="all">Tous les aérodromes</option>
            {aerodromes.map(a => (
              <option key={a.id} value={a.id}>{a.code_oaci} - {a.nom}</option>
            ))}
          </select>
          <select
            value={filters.niveau}
            onChange={(e) => setFilters({ ...filters, niveau: e.target.value })}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)]`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.75rem center',
              backgroundRepeat: 'no-repeat',
              appearance: 'none',
            }}
          >
            <option value="all">Tous niveaux</option>
            <option value="critique">Critique</option>
            <option value="eleve">Élevé</option>
            <option value="moyen">Moyen</option>
            <option value="faible">Faible</option>
          </select>
          <select
            value={filters.periode}
            onChange={(e) => setFilters({ ...filters, periode: e.target.value })}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)]`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
              backgroundPosition: 'right 0.75rem center',
              backgroundRepeat: 'no-repeat',
              appearance: 'none',
            }}
          >
            <option value="all">Toutes les périodes</option>
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button onClick={resetFilters} className="action-button" title="Réinitialiser les filtres">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Résultats */}
      <AccordionGroup spacing="md">
        {Object.entries(groupedByYear).map(([year, yearEcarts]) => {
          // Grouper par aérodrome
          const aerodromeGroups: Record<string, ArchiveEcartDetail[]> = {};
          yearEcarts.forEach(ecart => {
            const key = ecart.aerodrome_id;
            if (!aerodromeGroups[key]) aerodromeGroups[key] = [];
            aerodromeGroups[key].push(ecart);
          });

          return (
            <AccordionSection
              key={year}
              icon={<Calendar className="w-5 h-5 text-role-primary" />}
              title={`Année ${year}`}
              badges={<span className="badge outline">{yearEcarts.length} écart(s)</span>}
            >
              <AccordionSubGroup className="space-y-px">
                {Object.entries(aerodromeGroups).map(([aerodromeId, aeroEcarts]) => {
                  const aerodrome = aerodromes.find(a => a.id === aerodromeId);
                  return (
                    <AccordionSubItem
                      key={aerodromeId}
                      itemKey={aerodromeId}
                      title={`${aerodrome?.nom} (${aerodrome?.code_oaci})`}
                      badges={
                        <>
                          <span className="badge outline">{aeroEcarts.length} écart(s)</span>
                          {aeroEcarts.filter(e => e.niveau_risque === 'critique').length > 0 && (
                            <span className="badge danger text-[10px]">
                              {aeroEcarts.filter(e => e.niveau_risque === 'critique').length} critiques
                            </span>
                          )}
                        </>
                      }
                    >
                      {aeroEcarts.map(ecart => {
                        const NiveauIcon = getNiveauIcone(ecart.niveau_risque);
                        const niveauBadge = getNiveauBadge(ecart.niveau_risque);
                        
                        return (
                          <div key={ecart.id} className="card border-border hover:shadow-md transition-all">
                            <div className="card-content p-3">
                              <div className="flex items-start justify-between flex-wrap gap-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="code-oaci-badge text-xs">{ecart.reference}</span>
                                    <span className={niveauBadge}>
                                      <NiveauIcon className="w-3 h-3 inline mr-1" />
                                      {ecart.niveau_risque}
                                    </span>
                                    {ecart.decision_pac === 'accepte' ? (
                                      <span className="badge success text-[10px]">PAC accepté</span>
                                    ) : (
                                      <span className="badge danger text-[10px]">PAC refusé</span>
                                    )}
                                  </div>
                                  <p className="text-sm text-foreground line-clamp-2">{ecart.libelle}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Clôturé le {new Date(ecart.date_cloture).toLocaleDateString('fr-FR')}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => startTransition(() => setSelectedEcart(ecart))}
                                    className="action-button"
                                    title="Voir les détails"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button className="action-button" title="Exporter">
                                    <Download className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </AccordionSubItem>
                  );
                })}
              </AccordionSubGroup>
            </AccordionSection>
          );
        })}

        {Object.keys(groupedByYear).length === 0 && (
          <div className="card">
            <div className="card-content py-12 text-center text-muted-foreground">
              <Archive className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-body">Aucun écart archivé trouvé</p>
              <p className="text-small mt-2">Modifiez vos filtres pour élargir la recherche</p>
            </div>
          </div>
        )}
      </AccordionGroup>

      {/* Modal détail */}
      {selectedEcart && (
        <EcartDetailModal
          ecart={selectedEcart}
          onClose={() => setSelectedEcart(null)}
          userRole={userRole}
        />
      )}
    </div>
  );
}

export default ArchiveEcarts;