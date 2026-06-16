// components/modules/aerodromes/AerodromesModule.tsx
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/card';
import { FormShell } from '@/components/ui/FormShell';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useShallow } from 'zustand/react/shallow';
import {
  Plane, Search, Grid3x3, List, Map, Plus, Eye, PenSquare,
  Trash2, Download, Shield, Scale, AlertTriangle, Clock,
  MapPin, X, QrCode, Loader2, Filter, Building2,
} from 'lucide-react';
import { useAppStore, type Aerodrome } from '@/lib/store';
import { toast } from '@/lib/toast';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { REGIONS } from '@/lib/config';
import AerodromeForm from '@/components/forms/AerodromeForm';
import AerodromeDetail from './AerodromeDetail';
import { QrCodeGenerator } from './QrCodeGenerator';

const OPERATOR_ROLES = ['dg_operator', 'focal_operator', 'staff_operator'];

const AerodromeMap = dynamic(() => import('@/components/modules/aerodromes/AerodromeMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] bg-role-primary-soft rounded-xl flex items-center justify-center animate-pulse">
      <MapPin className="h-8 w-8 text-role-primary" />
    </div>
  ),
});

interface AerodromesModuleProps { userRole: string }

const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
};
const focusClass = 'focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all';

// ── Helpers d'affichage ──────────────────────────────────────────────────────

function getTypeBadge(type: string, typeEntite?: string) {
  const Icon = typeEntite === 'helistation'
    ? () => <span>🚁</span>
    : typeEntite === 'mixte'
    ? () => <span>✈🚁</span>
    : () => <Plane className="w-3 h-3" />;
  return type === 'international'
    ? <span className="badge primary inline-flex items-center gap-1"><Icon />International</span>
    : <span className="badge teal   inline-flex items-center gap-1"><Icon />National</span>;
}

function getStatutBadge(statut: string) {
  switch (statut) {
    case 'actif':     return <span className="badge success">Actif</span>;
    case 'brouillon': return <span className="badge neutral">Brouillon</span>;
    case 'suspendu':  return <span className="badge warning">Suspendu</span>;
    case 'ferme':     return <span className="badge danger">Fermé</span>;
    default:          return <span className="badge outline">{statut}</span>;
  }
}

function getRiskBadgeClass(niveau: string) {
  const base = 'risk-badge';
  switch (niveau) {
    case 'faible':   return `${base} faible`;
    case 'moyen':    return `${base} moyen`;
    case 'eleve':    return `${base} eleve`;
    case 'critique': return `${base} critique`;
    default:         return 'badge neutral';
  }
}

function getRiskProgressClass(niveau: string) {
  switch (niveau) {
    case 'faible':   return 'progress-faible';
    case 'moyen':    return 'progress-moyen';
    case 'eleve':    return 'progress-eleve';
    case 'critique': return 'progress-critique';
    default:         return '';
  }
}

/** Icône principale de la card selon le type d'entité */
function EntiteIcon({ typeEntite, className = 'w-4 h-4' }: { typeEntite?: string; className?: string }) {
  if (typeEntite === 'helistation') return <span>🚁</span>;
  if (typeEntite === 'mixte')       return <span>✈🚁</span>;
  return <Plane className={className} />;
}

/** Titre du formulaire selon le contexte (création / édition × type d'entité) */
function getFormTitle(aerodrome?: Aerodrome | null): string {
  if (!aerodrome) return 'Nouvelle infrastructure';
  switch (aerodrome.type_entite) {
    case 'helistation': return "Modifier l'hélistation";
    case 'mixte':       return "Modifier le site mixte";
    default:            return "Modifier l'aérodrome";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
export default function AerodromesModule({ userRole }: AerodromesModuleProps) {
const { user, certifications, homologations, surveillances, ecarts, deleteAerodrome } = useAppStore(
  useShallow(state => ({
    user: state.user,
    certifications: state.certifications,
    homologations: state.homologations,
    surveillances: state.surveillances,
    ecarts: state.ecarts,
    deleteAerodrome: state.deleteAerodrome
  }))
);
const aerodromes = useOptimizedStore(s => s.aerodromes)
const profilsRisque = useOptimizedStore(s => s.profilsRisque)

  const currentUserRole = user?.role || userRole;
  const isOperator = OPERATOR_ROLES.includes(currentUserRole);

  const [searchTerm,   setSearchTerm]   = useState('');
  const [filters,      setFilters]      = useState({
    region: 'tous', type: 'tous', type_entite: 'tous', statut: 'tous', niveauRisque: 'tous',
  });
  const [viewMode,          setViewMode]          = useState<'liste'|'grille'|'carte'>('liste');
  const [selectedAerodrome, setSelectedAerodrome] = useState<Aerodrome|null>(null);
  const [showDeleteDialog,  setShowDeleteDialog]  = useState(false);
  const [isDeleting,        setIsDeleting]        = useState(false);
  const [showDetailDialog,  setShowDetailDialog]  = useState(false);
  const [showFormDialog,    setShowFormDialog]    = useState(false);
  const [showQrDialog,      setShowQrDialog]      = useState(false);
  const [mapLoaded,         setMapLoaded]         = useState(false);

  const [mounted,           setMounted]           = useState(false);

  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  useEffect(() => {
  if (viewMode === 'carte' && !mapLoaded) {
    setMapLoaded(true);
  }
}, [viewMode, mapLoaded]);

  // ── Filtrage ──────────────────────────────────────────────────────────────
  const filteredAerodromes = useMemo(() => {
    let list = aerodromes.filter(a => !a.deleted_at);
    if (isOperator && user?.aerodrome_id) list = list.filter(a => a.id === user.aerodrome_id);

    return list.filter(aero => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!aero.nom.toLowerCase().includes(term) && !aero.code_oaci.toLowerCase().includes(term)) return false;
      }
      if (filters.region      !== 'tous' && aero.region          !== filters.region)      return false;
      if (filters.type        !== 'tous' && aero.type            !== filters.type)        return false;
      if (filters.type_entite !== 'tous' && aero.type_entite     !== filters.type_entite) return false;
      if (filters.statut      !== 'tous' && aero.statut          !== filters.statut)      return false;
      if (filters.niveauRisque !== 'tous') {
        const profil = profilsRisque[aero.id];
        if (!profil || profil.niveau !== filters.niveauRisque) return false;
      }
      return true;
    });
  }, [aerodromes, searchTerm, filters, profilsRisque, isOperator, user?.aerodrome_id]);

  // ── Statistiques ──────────────────────────────────────────────────────────
  const actifs = useMemo(() => {
    let list = aerodromes.filter(a => !a.deleted_at)
    if (isOperator && user?.aerodrome_id) list = list.filter(a => a.id === user.aerodrome_id)
    return list
  }, [aerodromes, isOperator, user?.aerodrome_id])
  const stats = useMemo(() => ({
    total:        actifs.length,
    aerodromes:   actifs.filter(a => a.type_entite === 'aerodrome' || !a.type_entite).length,
    helistations: actifs.filter(a => a.type_entite === 'helistation').length,
    mixtes:       actifs.filter(a => a.type_entite === 'mixte').length,
    certifies:    certifications?.filter(c => actifs.some(a => a.id === c.aerodrome_id) && c.statut_global === 'certifie').length  || 0,
    homologues:   homologations?.filter(h => actifs.some(a => a.id === h.aerodrome_id) && h.statut_global === 'homologue').length  || 0,
    enAlerte:     actifs.filter(a => { const p = profilsRisque[a.id]; return p?.niveau === 'critique' || p?.niveau === 'eleve'; }).length,
  }), [actifs, certifications, homologations, profilsRisque]);

  // ── Certification badge ───────────────────────────────────────────────────
  const getCertificationBadge = (aerodromeId: string) => {
    if (certifications?.find(c => c.aerodrome_id === aerodromeId && c.statut_global === 'certifie'))
      return <span className="badge success">Certifié</span>;
    if (homologations?.find(h => h.aerodrome_id === aerodromeId && h.statut_global === 'homologue'))
      return <span className="badge teal">Homologué</span>;
    return <span className="badge neutral">-</span>;
  };

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDelete = (aerodrome: Aerodrome) => { setSelectedAerodrome(aerodrome); setShowDeleteDialog(true); };
  const confirmDelete = async () => {
    if (!selectedAerodrome) return
    setIsDeleting(true)
    try {
      await deleteAerodrome(selectedAerodrome.id)
      toast('success', 'Aérodrome supprimé', selectedAerodrome.code_oaci)
    } catch (error) {
      console.error('Erreur suppression aérodrome:', error)
      toast('error', 'Échec suppression', selectedAerodrome.code_oaci)
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
      setSelectedAerodrome(null)
    }
  };
  const handleViewDetails  = (aerodrome: Aerodrome) => { setSelectedAerodrome(aerodrome); setShowDetailDialog(true); };
  const handleEdit = () => {
    if (isOperator) return;
    setShowDetailDialog(false);
    setShowFormDialog(true);
  };
  const handleDirectEdit = (aerodrome: Aerodrome) => {
    if (isOperator) return;
    setSelectedAerodrome(aerodrome);
    setShowDetailDialog(false);
    setShowFormDialog(true);
  };

  const closeForm = () => { setShowFormDialog(false); setSelectedAerodrome(null); };

  // ── Vue Liste ─────────────────────────────────────────────────────────────
  const renderListView = () => (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Code OACI</th>
            <th>Nom</th>
            <th>Région</th>
            <th>Type</th>
            <th>Statut</th>
            <th>Certification</th>
            <th>Dernière surv.</th>
            <th>Écarts</th>
            <th>Score risque</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredAerodromes.length === 0 ? (
            <tr>
              <td colSpan={11} className="text-center py-12 text-muted-foreground">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-20" />
                Aucune infrastructure correspondant aux critères
              </td>
            </tr>
          ) : filteredAerodromes.map(aerodrome => {
            const profil = profilsRisque[aerodrome.id];
            const derniereSurv = surveillances
              .filter(s => s.aerodrome_id === aerodrome.id && s.statut === 'transmise')
              .sort((a, b) => new Date(b.date_fin).getTime() - new Date(a.date_fin).getTime())[0];
            const ecartsOuverts   = ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.statut !== 'cloture').length;
            const ecartsCritiques = ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length;

            return (
              <tr key={aerodrome.id} className="cursor-pointer hover:bg-role-primary-soft transition-colors"
                onClick={() => handleViewDetails(aerodrome)}>
                <td><span className="code-oaci-badge">{aerodrome.code_oaci}</span></td>
                <td className="font-medium">{aerodrome.nom}</td>
                <td>{aerodrome.region}</td>
                <td>{getTypeBadge(aerodrome.type, aerodrome.type_entite)}</td>
                <td>{getStatutBadge(aerodrome.statut)}</td>
                <td>{getCertificationBadge(aerodrome.id)}</td>
                <td>
                  {derniereSurv ? (
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-small">{new Date(derniereSurv.date_fin).toLocaleDateString('fr-FR')}</span>
                    </div>
                  ) : <span className="text-muted-foreground">-</span>}
                </td>
                <td>
                  {ecartsOuverts > 0 ? (
                    <div className="flex items-center gap-1">
                      <span className={ecartsCritiques > 0 ? 'badge danger' : 'badge warning'}>{ecartsOuverts}</span>
                      {ecartsCritiques > 0 && <span className="badge danger animate-pulse text-[10px] ml-1">{ecartsCritiques}c</span>}
                    </div>
                  ) : <span className="text-muted-foreground">0</span>}
                </td>
                <td>
                  {profil
                    ? <span className={getRiskBadgeClass(profil.niveau)}>{profil.score_global}%</span>
                    : <span className="text-muted-foreground">-</span>}
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    <button className="action-button" onClick={e => { e.stopPropagation(); handleViewDetails(aerodrome); }}><Eye className="w-4 h-4"/></button>
                    {!isOperator && <>
                      <button className="action-button" onClick={e => { e.stopPropagation(); handleDirectEdit(aerodrome); }}><PenSquare className="w-4 h-4"/></button>
                      <button className="action-button danger" onClick={e => { e.stopPropagation(); handleDelete(aerodrome); }}><Trash2 className="w-4 h-4"/></button>
                    </>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // ── Vue Grille ────────────────────────────────────────────────────────────
  const renderGridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filteredAerodromes.length === 0 ? (
        <div className="col-span-3 text-center py-16 text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-3 opacity-20" />
          Aucune infrastructure correspondant aux critères
        </div>
      ) : filteredAerodromes.map(aerodrome => {
        const profil = profilsRisque[aerodrome.id];
        const ecartsOuverts = ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.statut !== 'cloture').length;
        const borderColor = profil?.niveau === 'critique' ? 'border-danger' : profil?.niveau === 'eleve' ? 'border-warning' : 'border-role-primary';

        return (
          <div key={aerodrome.id}
            className={`card cursor-pointer hover:shadow-role-glow transition-all border-l-4 ${borderColor}`}
            onClick={() => handleViewDetails(aerodrome)}>
            <div className="card-header flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-role-primary-soft flex items-center justify-center">
                  <EntiteIcon typeEntite={aerodrome.type_entite} className="w-4 h-4 text-role-primary" />
                </div>
                <span className="code-oaci-badge">{aerodrome.code_oaci}</span>
              </div>
              {getTypeBadge(aerodrome.type, aerodrome.type_entite)}
            </div>
            <div className="card-content">
              <h4 className="heading-4 font-semibold mb-2 truncate">{aerodrome.nom}</h4>
              <div className="flex items-center gap-1 text-small text-muted-foreground mb-3">
                <MapPin className="w-4 h-4 text-role-primary" />{aerodrome.region}
              </div>
              {profil && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-small mb-1">
                    <span className="text-muted-foreground">Risque</span>
                    <span className={getRiskBadgeClass(profil.niveau)}>{profil.score_global}%</span>
                  </div>
                  <div className={`progress h-1 ${getRiskProgressClass(profil.niveau)}`}>
                    <div className="progress-bar" style={{ width: `${profil.score_global}%` }} />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-small mt-2">
                {getCertificationBadge(aerodrome.id)}
                {ecartsOuverts > 0 && (
                  <span className="badge danger animate-pulse text-[10px]">{ecartsOuverts} écart{ecartsOuverts > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            <div className="card-footer flex justify-between items-center">
              <span className="text-small text-role-primary hover:underline cursor-pointer">Voir fiche</span>
              {!isOperator && (
                <div className="flex gap-1">
                  <button className="action-button" onClick={e => { e.stopPropagation(); setSelectedAerodrome(aerodrome); setShowQrDialog(true); }} title="QR Code"><QrCode className="w-4 h-4"/></button>
                  <button className="action-button" onClick={e => { e.stopPropagation(); handleDirectEdit(aerodrome); }}><PenSquare className="w-4 h-4"/></button>
                  <button className="action-button" onClick={e => e.stopPropagation()}><Download className="w-4 h-4"/></button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Vue Carte ─────────────────────────────────────────────────────────────
  const renderMapView = () => (
  <div className="card overflow-hidden">
    <div className="card-content p-0">
      {!mapLoaded && viewMode === 'carte' && (
        <div className="h-[400px] bg-role-primary-soft rounded-xl flex items-center justify-center animate-pulse">
          <MapPin className="h-8 w-8 text-role-primary" />
          <span className="ml-2 text-muted-foreground">Chargement de la carte...</span>
        </div>
      )}
      {(mapLoaded || viewMode !== 'carte') && (
        <div className={viewMode === 'carte' ? 'block' : 'hidden'}>
          <AerodromeMap aerodromes={filteredAerodromes} />
        </div>
      )}
    </div>
  </div>
);

  // ── Modale Suppression ────────────────────────────────────────────────────
  // ── Modale Détail ─────────────────────────────────────────────────────────
  // ── Modale Formulaire ─────────────────────────────────────────────────────
  // La progression est gérée en interne par FormShell (injectée via cloneElement).
  // Le Module ne re-render plus sur les changements de progression du formulaire.

  if (!mounted) return null;

  return (
    <div className="space-y-6 animate-fade-up" data-role={currentUserRole} data-module="aerodromes">

      <ModuleHeader
        icon={<Plane />}
        title={isOperator ? 'Mon Infrastructure' : 'Aérodromes & Hélistations'}
        description={isOperator ? 'Consultation de votre infrastructure' : 'Gestion des infrastructures aéronautiques du Sénégal'}
        actions={!isOperator ? (
          <button onClick={() => { setSelectedAerodrome(null); setShowFormDialog(true); }} className="btn btn-primary gap-2">
            <Plus className="w-4 h-4" />Nouvelle infrastructure
          </button>
        ) : undefined}
      />

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="kpi-grid">
        {[
          { icon: Plane,      bg: 'bg-role-primary-soft', color: 'text-role-primary', label: 'Total',              value: stats.total },
          { icon: Building2,  bg: 'bg-neutral-soft',      color: 'text-foreground',   label: 'Aérodromes',        value: stats.aerodromes },
          ...(stats.helistations > 0 || !isOperator ? [{
            icon: Shield, bg: 'bg-warning-soft', color: 'text-warning', label: 'Hélistations / Mixtes', value: stats.helistations + stats.mixtes,
          }] : []),
          { icon: Shield,     bg: 'bg-success-soft',      color: 'text-success',       label: 'Certifiés',         value: stats.certifies },
          { icon: Scale,      bg: 'bg-info-soft',         color: 'text-info',          label: 'Homologués',        value: stats.homologues },
          { icon: AlertTriangle, bg: 'bg-danger-soft',    color: 'text-danger',        label: 'En alerte',          value: stats.enAlerte },
        ].map((kpi, i) => (
          <div key={i} className="kpi-card">
            <div className={`kpi-icon ${kpi.bg}`}><kpi.icon className={`w-5 h-5 ${kpi.color}`} /></div>
            <div className="kpi-label">{kpi.label}</div>
            <div className={`kpi-value ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* ── Barre de filtres ──────────────────────────────────────────────── */}
      {!isOperator && (
        <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
          <div className="flex flex-wrap items-center gap-3">
            {/* Recherche */}
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
              <input type="text" placeholder="Rechercher par nom ou code OACI…" value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}/>
            </div>

            {/* Filtre Région */}
            <select value={filters.region} onChange={e => setFilters({...filters, region: e.target.value})}
              className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
              style={selectStyle}>
              <option value="tous">Toutes régions</option>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {/* Filtre Type (international/national) */}
            <select value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}
              className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
              style={selectStyle}>
              <option value="tous">Tous types</option>
              <option value="international">International</option>
              <option value="national">National</option>
            </select>

            {/* Filtre Nature (aérodrome / hélistation / mixte) — NOUVEAU */}
            <select value={filters.type_entite} onChange={e => setFilters({...filters, type_entite: e.target.value})}
              className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
              style={selectStyle}>
              <option value="tous">Toutes natures</option>
              <option value="aerodrome">✈ Aérodromes</option>
              <option value="helistation">🚁 Hélistations</option>
              <option value="mixte">✈🚁 Mixtes</option>
            </select>

            {/* Filtre Risque */}
            <select value={filters.niveauRisque} onChange={e => setFilters({...filters, niveauRisque: e.target.value})}
              className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
              style={selectStyle}>
              <option value="tous">Tous risques</option>
              <option value="faible">Faible</option>
              <option value="moyen">Modéré</option>
              <option value="eleve">Élevé</option>
              <option value="critique">Critique</option>
            </select>

            {/* Filtre Statut */}
            <select value={filters.statut} onChange={e => setFilters({...filters, statut: e.target.value})}
              className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
              style={selectStyle}>
              <option value="tous">Tous statuts</option>
              <option value="actif">Actif</option>
              <option value="brouillon">Brouillon</option>
              <option value="suspendu">Suspendu</option>
              <option value="ferme">Fermé</option>
            </select>

            {/* Compteur résultats */}
            <span className="text-xs text-muted-foreground whitespace-nowrap ml-auto">
              {filteredAerodromes.length} résultat{filteredAerodromes.length !== 1 ? 's' : ''}
            </span>

            {/* Toggle vue */}
            <div className="view-toggle">
              <button className={viewMode==='liste'  ? 'active' : ''} onClick={() => setViewMode('liste')}  title="Vue liste"><List     className="w-4 h-4"/></button>
              <button className={viewMode==='grille' ? 'active' : ''} onClick={() => setViewMode('grille')} title="Vue grille"><Grid3x3 className="w-4 h-4"/></button>
              <button className={viewMode==='carte'  ? 'active' : ''} onClick={() => setViewMode('carte')}  title="Vue carte"><Map      className="w-4 h-4"/></button>
            </div>

            <button className="action-button" title="Exporter"><Download className="w-4 h-4"/></button>
          </div>
        </Card>
      )}

      {/* ── Vue principale ────────────────────────────────────────────────── */}
      {viewMode === 'liste'  && renderListView()}
      {viewMode === 'grille' && renderGridView()}
      {viewMode === 'carte'  && renderMapView()}

      {/* ── Modale Suppression (inline — type stable) ── */}
      {showDeleteDialog && selectedAerodrome && createPortal(
        <div className="modal-overlay" data-role={currentUserRole} onClick={() => setShowDeleteDialog(false)}>
          <div className="modal-content max-w-md rounded-2xl overflow-hidden border-t-4 border-t-role-primary" onClick={e => e.stopPropagation()}>
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <div className="modal-title text-danger flex items-center gap-2"><AlertTriangle className="w-5 h-5"/>Confirmer la suppression</div>
              <button className="modal-close" onClick={() => setShowDeleteDialog(false)}><X className="w-4 h-4"/></button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <p className="text-body">Êtes-vous sûr de vouloir supprimer <span className="font-semibold text-role-primary">{selectedAerodrome.code_oaci}</span> ?</p>
              <p className="text-small text-muted-foreground mt-2">Cette action est irréversible.</p>
            </div>
            <div className="modal-footer border-t border-border p-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
                <X className="w-4 h-4" />
                Annuler
              </button>
              <button className="btn btn-danger" onClick={confirmDelete} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isDeleting ? 'Suppression...' : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modale Détail (inline — type stable) ── */}
      {showDetailDialog && selectedAerodrome && createPortal(
        <div className="modal-overlay" data-role={currentUserRole} onClick={() => setShowDetailDialog(false)}>
          <div className="modal-content max-w-6xl max-h-[90vh] overflow-y-auto p-0" onClick={e => e.stopPropagation()}>
            <AerodromeDetail aerodrome={selectedAerodrome} onClose={() => setShowDetailDialog(false)} onEdit={handleEdit} userRole={userRole} />
          </div>
        </div>,
        document.body
      )}

      {/* ── Modale Formulaire (inline — type stable, FormShell/AerodromeForm sont des imports) ── */}
      {showFormDialog && (
        <FormShell
          open={showFormDialog}
          onClose={closeForm}
          title={getFormTitle(selectedAerodrome)}
          icon={Plane}
          size="4xl"
          dataRole={userRole}
        >
          <AerodromeForm
            aerodrome={selectedAerodrome || undefined}
            onClose={closeForm}
            onSuccess={closeForm}
            userRole={userRole}
          />
        </FormShell>
      )}

      {/* ── Modale QR Code ── */}
      {showQrDialog && selectedAerodrome && createPortal(
        <div className="modal-overlay" onClick={() => setShowQrDialog(false)}>
          <div className="modal-content max-w-md rounded-2xl overflow-hidden border-t-4 border-t-role-primary" onClick={e => e.stopPropagation()}>
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <div className="modal-title">
                <QrCode className="w-5 h-5 text-role-primary" />
                QR Code — {selectedAerodrome.code_oaci}
              </div>
              <button className="modal-close" onClick={() => setShowQrDialog(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body p-5">
              <QrCodeGenerator aerodrome={selectedAerodrome} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
