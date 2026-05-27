// components/modules/archive/ArchiveAccordion.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, Eye, Download, Calendar, MapPin } from 'lucide-react';
import { useAppStore, type Certification, type Homologation } from '@/lib/store';
import ArchiveViewer from './ArchiveViewer';

interface ArchiveAccordionProps {
  items: any[];
  type: 'certification' | 'homologation';
  onRestore?: (item: any) => void;
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

export function ArchiveAccordion({ items, type, onRestore }: ArchiveAccordionProps) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  const [expandedAerodromes, setExpandedAerodromes] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<Certification | Homologation | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Filtrer les items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const aero = aerodromes.find(a => a.id === item.aerodrome_id);
        const matches = item.reference.toLowerCase().includes(term) ||
          aero?.code_oaci.toLowerCase().includes(term) ||
          aero?.nom.toLowerCase().includes(term);
        if (!matches) return false;
      }
      if (selectedYear !== 'all') {
        const year = new Date(item.updated_at).getFullYear().toString();
        if (year !== selectedYear) return false;
      }
      if (selectedType !== 'all' && item.type_certification !== selectedType) return false;
      return true;
    });
  }, [items, searchTerm, selectedYear, selectedType, aerodromes]);

  // Grouper par année puis par aérodrome
  const groupedItems = useMemo(() => {
    const grouped: Record<string, Record<string, any[]>> = {};
    
    filteredItems.forEach(item => {
      const year = new Date(item.updated_at).getFullYear().toString();
      const aerodromeId = item.aerodrome_id;
      
      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][aerodromeId]) grouped[year][aerodromeId] = [];
      grouped[year][aerodromeId].push(item);
    });
    
    // Trier les années décroissantes
    const sortedYears = Object.keys(grouped).sort((a, b) => parseInt(b) - parseInt(a));
    const result: { year: string; aerodromes: { id: string; items: any[] }[] }[] = [];
    
    for (const year of sortedYears) {
      const aerodromeEntries = Object.entries(grouped[year]);
      const aerodromesList = aerodromeEntries.map(([id, items]) => ({
        id,
        items: items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      }));
      result.push({ year, aerodromes: aerodromesList });
    }
    
    return result;
  }, [filteredItems]);

  const toggleYear = (year: string) => {
    setExpandedYears(prev => ({ ...prev, [year]: !prev[year] }));
  };

  const toggleAerodrome = (key: string) => {
    setExpandedAerodromes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleView = (item: any) => {
    setSelectedItem(item);
    setViewerOpen(true);
  };

  const availableYears = useMemo(() => {
    const years = new Set(items.map(item => new Date(item.updated_at).getFullYear().toString()));
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [items]);

  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundPosition: 'right 0.75rem center',
    backgroundRepeat: 'no-repeat'
  };

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher par référence, code OACI ou nom..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>

          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="all">Toutes années</option>
            {availableYears.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="all">Tous types</option>
            <option value="initiale">Certification initiale</option>
            <option value="renouvellement">Renouvellement</option>
          </select>

          {(searchTerm || selectedYear !== 'all' || selectedType !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedYear('all');
                setSelectedType('all');
              }}
              className="btn btn-ghost btn-sm"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Résultats */}
      {groupedItems.length === 0 ? (
        <div className="card">
          <div className="card-content py-12 text-center">
            <Calendar className="h-12 w-12 text-muted mx-auto mb-4 opacity-30" />
            <p className="text-muted-foreground">Aucun dossier archivé trouvé</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedItems.map(({ year, aerodromes: aeroList }) => (
            <div key={year} className="card overflow-hidden">
              {/* En-tête année */}
              <button
                onClick={() => toggleYear(year)}
                className="w-full flex items-center justify-between p-4 bg-role-primary-soft/30 hover:bg-role-primary-soft/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedYears[year] ? (
                    <ChevronDown className="h-4 w-4 text-role-primary" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-role-primary" />
                  )}
                  <span className="font-semibold text-lg">{year}</span>
                  <span className="badge neutral">
                    {aeroList.reduce((acc, a) => acc + a.items.length, 0)} dossier(s)
                  </span>
                </div>
              </button>

              {/* Contenu année */}
              {expandedYears[year] && (
                <div className="p-4 space-y-3">
                  {aeroList.map(({ id: aerodromeId, items: aeroItems }) => {
                    const aerodrome = aerodromes.find(a => a.id === aerodromeId);
                    const aeroKey = `${year}-${aerodromeId}`;
                    
                    return (
                      <div key={aerodromeId} className="accordion">
                        {/* En-tête aérodrome */}
                        <button
                          onClick={() => toggleAerodrome(aeroKey)}
                          className="accordion-trigger w-full text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="code-oaci-badge">{aerodrome?.code_oaci}</span>
                            <span className="text-foreground font-medium">{aerodrome?.nom}</span>
                            <span className="badge outline text-xs">
                              {aeroItems.length}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mr-4">
                            <svg className={`w-4 h-4 text-muted transition-transform ${expandedAerodromes[aeroKey] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </button>

                        {/* Liste des dossiers de cet aérodrome */}
                        {expandedAerodromes[aeroKey] && (
                          <div className="accordion-content divide-y divide-border">
                            {aeroItems.map(item => (
                              <div key={item.id} className="p-3 hover:bg-role-primary-soft/30 transition-colors">
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono text-sm font-semibold text-role-primary">
                                        {item.reference}
                                      </span>
                                      <span className="badge success text-xs">
                                        {type === 'certification' ? 'Certifié' : 'Homologué'}
                                      </span>
                                      {item.type_certification === 'renouvellement' && (
                                        <span className="badge outline text-xs">Renouvellement</span>
                                      )}
                                    </div>
                                    <p className="text-sm text-foreground mt-1 line-clamp-1">
                                      {item.titre || type === 'certification' ? 'Certification' : 'Homologation'}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        Terminé le {new Date(item.updated_at).toLocaleDateString('fr-FR')}
                                      </span>
                                      {type === 'certification' && item.numero_cert && (
                                        <span className="font-mono">Certificat: {item.numero_cert}</span>
                                      )}
                                      {type === 'homologation' && item.numero_decision && (
                                        <span className="font-mono">Décision: {item.numero_decision}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      className="action-button"
                                      onClick={() => handleView(item)}
                                      title="Voir le dossier complet"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                    {onRestore && (
                                      <button
                                        className="action-button text-warning hover:text-warning"
                                        onClick={() => onRestore(item)}
                                        title="Restaurer ce dossier"
                                      >
                                        <Download className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
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

      {/* Modal de visualisation */}
      {selectedItem && viewerOpen && (
        <ArchiveViewer
          item={selectedItem}
          type={type}
          onClose={() => setViewerOpen(false)}
          onRestore={onRestore ? () => onRestore(selectedItem) : undefined}
        />
      )}
    </div>
  );
}

export default ArchiveAccordion;