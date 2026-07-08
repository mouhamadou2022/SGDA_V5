// components/modules/charge-travail/ChargeTravailModule.tsx
// ✅ CDC 5.19 - Charge de Travail
// ✅ Onglet "Ma Charge" basé sur l'inspecteur connecté
// ✅ Tâches groupées par : En retard / En cours / Terminé
// ✅ Filtres sur une seule ligne (style Planning)
// ✅ Design system premium - classes harmonisées

'use client';

import React, { useState, useMemo } from 'react';
import {
  ListTodo,
  Clock,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Calendar,
  User,
  Filter,
  Search,
  Download,
  Eye,
  Activity,
  Flame,
  Briefcase,
  FileText,
  AlertTriangle,
  Gauge,
  Trash2,
  X,
  Users,
  BarChart3,

} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { FormShell } from '@/components/ui/FormShell';
import { useAppStore } from '@/lib/store';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { chargeUtils, Tache } from '@/lib/chargeUtils';
import { AuthUser } from '@/lib/auth';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
};

interface ChargeTravailModuleProps {
  user: AuthUser;
}

type MainTab = 'ma_charge' | 'equipe' | 'stats';

const STATUT_SECTIONS = [
  { key: 'en_retard', label: 'En retard', badgeClass: 'badge danger animate-pulse', borderClass: 'border-l-4 border-l-danger', bgClass: 'bg-danger-soft', iconClass: 'text-danger', Icon: Flame },
  { key: 'en_cours',  label: 'En cours',  badgeClass: 'badge primary',              borderClass: 'border-l-4 border-l-role-primary', bgClass: 'bg-role-primary-soft', iconClass: 'text-role-primary', Icon: Clock },
  { key: 'a_faire',   label: 'À faire',   badgeClass: 'badge neutral',              borderClass: 'border-l-2 border-l-border', bgClass: 'bg-muted/20', iconClass: 'text-muted-foreground', Icon: ListTodo },
  { key: 'termine',   label: 'Terminé',   badgeClass: 'badge success',              borderClass: 'border-l-4 border-l-success', bgClass: 'bg-success-soft', iconClass: 'text-success', Icon: CheckCircle2 },
] as const;

export default function ChargeTravailModule({ user }: ChargeTravailModuleProps) {
  const userRole = user.role;
  const userId   = user.id;

  const surveillances = useAppStore(s => s.surveillances)
  const ecarts = useAppStore(s => s.ecarts)
  const evenements = useAppStore(s => s.evenements)
  const dossiers = useAppStore(s => s.dossiers)
  const formations = useAppStore(s => s.formations)
  const aerodromes = useAppStore(s => s.aerodromes)
  const utilisateurs = useAppStore(s => s.utilisateurs);

  const isAdminRole = ['admin', 'dg_anacim'].includes(userRole);

  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const updateEcart = useAppStore(s => s.updateEcart);
  const updateEvenement = useAppStore(s => s.updateEvenement);
  const updateDossier = useAppStore(s => s.updateDossier);
  const updateFormation = useAppStore(s => s.updateFormation);
  const addNotification = useAppStore(s => s.addNotification);

  // Onglet principal
  const [mainTab, setMainTab] = useState<MainTab>(isAdminRole ? 'equipe' : 'ma_charge');

  // Filtres Ma Charge
  const [searchMC, setSearchMC]   = useState('');
  const [filtersMC, setFiltersMC] = useState({ type: 'tous', priorite: 'tous' });
  const [periodeMC, setPeriodeMC]  = useState(30);

  // Filtres Équipe
  const [searchEq, setSearchEq]   = useState('');
  const [filtersEq, setFiltersEq] = useState({ type: 'tous', priorite: 'tous', statut: 'tous', inspecteur: 'tous' });
  const [periode, setPeriode]      = useState(30);

  // Modal détail inspecteur
  const [selectedInspecteur, setSelectedInspecteur] = useState<string | null>(null);
  const [showDetails, setShowDetails]               = useState(false);
  const [detailTab, setDetailTab]                   = useState<'liste' | 'stats'>('liste');

  // ─── Génération de toutes les tâches ────────────────────────────────────────
  const toutesTaches = useMemo(() => {
    const taches: Tache[] = [];

    surveillances?.forEach(s => {
      if (s.equipe_ids?.length) {
        s.equipe_ids.forEach(inspId => {
          const t = chargeUtils.surveillanceVersTache(s, aerodromes);
          taches.push({ ...t, id: `${t.id}-${inspId}`, lien_id: inspId });
        });
      }
    });

    ecarts?.forEach(e => {
      if (e.inspecteur_ref_id) {
        taches.push({ ...chargeUtils.ecartVersTache(e, aerodromes), lien_id: e.inspecteur_ref_id });
      }
      // Tâches d'évaluation pour l'inspecteur
      const tachePAC = chargeUtils.ecartVersTacheEvaluationPAC(e, aerodromes)
      if (tachePAC && e.inspecteur_ref_id) {
        taches.push({ ...tachePAC, lien_id: e.inspecteur_ref_id })
      }
      const tachePreuves = chargeUtils.ecartVersTacheValidationPreuves(e, aerodromes)
      if (tachePreuves && e.inspecteur_ref_id) {
        taches.push({ ...tachePreuves, lien_id: e.inspecteur_ref_id })
      }
    });

    evenements?.forEach(e => {
      if (e.inspecteur_id) {
        taches.push({ ...chargeUtils.evenementVersTache(e, aerodromes), lien_id: e.inspecteur_id });
      }
    });

    dossiers?.forEach(d => {
      if (d.inspecteur_id) {
        taches.push({ ...chargeUtils.dossierVersTache(d, aerodromes), lien_id: d.inspecteur_id });
      }
    });

    formations?.forEach(f => {
      (f.participants || []).forEach(inspId => {
        if (f.statut === 'planifiee' || f.statut === 'en_cours') {
          taches.push({
            id: `fmt-${f.id}-${inspId}`,
            type: 'formation',
            titre: `Formation : ${f.titre}`,
            description: f.objectifs,
            priorite: 'moyenne',
            statut: f.statut === 'planifiee' ? 'a_faire' : 'en_cours',
            date_echeance: f.date,
            date_debut: f.date,
            temps_estime: f.duree_heures,
            temps_passe: 0,
            progression: 0,
            aerodrome_id: undefined,
            lien_id: inspId,
          });
        }
      });
    });

    return taches;
  }, [surveillances, ecarts, evenements, dossiers, formations, aerodromes]);

  // ─── Tâches "Ma Charge" (inspecteur connecté) ───────────────────────────────
  const tachesMaCharge = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + periodeMC);
    return toutesTaches.filter(t => {
      if (t.lien_id !== userId) return false;
      if (filtersMC.type !== 'tous' && t.type !== filtersMC.type) return false;
      if (filtersMC.priorite !== 'tous' && t.priorite !== filtersMC.priorite) return false;
      if (searchMC) {
        const term = searchMC.toLowerCase();
        if (!t.titre.toLowerCase().includes(term) && !t.description.toLowerCase().includes(term)) return false;
      }
      const d = new Date(t.date_echeance);
      if (d < now || d > cutoff) return false;
      return true;
    });
  }, [toutesTaches, userId, filtersMC, searchMC, periodeMC]);

  // Grouper par statut pour "Ma Charge"
  const tachesParStatutMC = useMemo(() => {
    const grouped: Record<string, Tache[]> = { en_retard: [], en_cours: [], a_faire: [], termine: [] };
    tachesMaCharge.forEach(t => {
      if (grouped[t.statut]) grouped[t.statut].push(t);
      else grouped['a_faire'].push(t);
    });
    return grouped;
  }, [tachesMaCharge]);

  // KPIs Ma Charge
  const kpisMC = useMemo(() => ({
    total:    tachesMaCharge.length,
    en_cours: tachesParStatutMC.en_cours.length,
    en_retard: tachesParStatutMC.en_retard.length,
    termine:  tachesParStatutMC.termine.length,
    progression: tachesMaCharge.length > 0
      ? Math.round((tachesParStatutMC.termine.length / tachesMaCharge.length) * 100)
      : 0,
  }), [tachesMaCharge, tachesParStatutMC]);

  // ─── Tâches Équipe ──────────────────────────────────────────────────────────
  const tachesEquipe = useMemo(() => {
    const debut = new Date();
    const fin   = new Date();
    fin.setDate(fin.getDate() + periode);
    return toutesTaches.filter(t => {
      const d = new Date(t.date_echeance);
      if (d < debut || d > fin) return false;
      if (filtersEq.inspecteur !== 'tous' && t.lien_id !== filtersEq.inspecteur) return false;
      if (filtersEq.type      !== 'tous' && t.type     !== filtersEq.type)      return false;
      if (filtersEq.priorite  !== 'tous' && t.priorite !== filtersEq.priorite)  return false;
      if (filtersEq.statut    !== 'tous' && t.statut   !== filtersEq.statut)    return false;
      if (searchEq) {
        const term = searchEq.toLowerCase();
        if (!t.titre.toLowerCase().includes(term) && !t.description.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [toutesTaches, filtersEq, searchEq, periode]);

  const tachesParInspecteur = useMemo(() => {
    const grouped: Record<string, Tache[]> = {};
    tachesEquipe.forEach(t => {
      if (!grouped[t.lien_id]) grouped[t.lien_id] = [];
      grouped[t.lien_id].push(t);
    });
    return grouped;
  }, [tachesEquipe]);

  const charges = useMemo(() => {
    const inspecteursList = utilisateurs?.filter(u => u.role === 'inspector' || u.role === 'admin') || [];
    return inspecteursList.map(ins => {
      const taches = tachesParInspecteur[ins.id] || [];
      return chargeUtils.calculerChargeInspecteur(ins.id, `${ins.prenom} ${ins.nom}`, taches, periode);
    }).filter(c => c.total_taches > 0);
  }, [tachesParInspecteur, utilisateurs, periode]);

  const statsGlobales = useMemo(() => chargeUtils.calculerStatistiquesGlobales(charges), [charges]);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const getPrioriteBadge = (priorite: string) => {
    const v: Record<string, { label: string; className: string }> = {
      critique: { label: 'Critique', className: 'badge danger animate-pulse' },
      haute:    { label: 'Haute',    className: 'badge warning' },
      moyenne:  { label: 'Moyenne',  className: 'badge primary' },
      basse:    { label: 'Basse',    className: 'badge neutral' },
    };
    return v[priorite] || v.moyenne;
  };

  const getStatutBadge = (statut: string) => {
    const v: Record<string, { label: string; className: string }> = {
      a_faire:   { label: 'À faire',   className: 'badge neutral' },
      en_cours:  { label: 'En cours',  className: 'badge primary' },
      termine:   { label: 'Terminé',   className: 'badge success' },
      en_retard: { label: 'En retard', className: 'badge danger animate-pulse' },
    };
    return v[statut] || v.a_faire;
  };

  const getChargeProgressClass = (charge: number) =>
    charge >= 80 ? 'progress-critique' : charge >= 60 ? 'progress-eleve' : 'progress-moyen';

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'surveillance': return <Eye className="w-4 h-4" />;
      case 'ecart':        return <AlertCircle className="w-4 h-4" />;
      case 'evenement':    return <AlertTriangle className="w-4 h-4" />;
      case 'dossier':      return <Briefcase className="w-4 h-4" />;
      case 'formation':    return <Activity className="w-4 h-4" />;
      default:             return <FileText className="w-4 h-4" />;
    }
  };

  const getInitials = (nom: string) => nom.split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

  const handleExport = () => {
    const csv = charges.map(c =>
      `${c.inspecteur_nom};${c.total_taches};${c.taches_par_statut.a_faire};${c.taches_par_statut.en_cours};${c.taches_par_statut.termine};${c.taches_par_statut.en_retard};${c.charge}%;${c.progression_globale}%`
    ).join('\n');
    const blob = new Blob([`Inspecteur;Total;À faire;En cours;Terminé;En retard;Charge;Progression\n${csv}`], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `charge_travail_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleMarkTermine = (tache: Tache) => {
    const prefix = tache.id.split('-')[0];
    switch (prefix) {
      case 'surv': {
        const id = tache.id.replace('surv-', '');
        updateSurveillance(id, { statut: 'transmise', progression: 100 });
        break;
      }
      case 'ecart': {
        const id = tache.id.replace('ecart-', '');
        updateEcart(id, { statut: 'cloture' });
        break;
      }
      case 'evt': {
        const id = tache.id.replace('evt-', '');
        updateEvenement(id, { statut: 'cloture' });
        break;
      }
      case 'dossier': {
        const id = tache.id.replace('dossier-', '');
        updateDossier(id, { statut: 'termine', progression: 100 } as any);
        break;
      }
      case 'fmt': {
        const parts = tache.id.split('-');
        if (parts.length >= 3) {
          const last = parts.pop();
          updateFormation(parts.slice(1).join('-'), { statut: 'terminee' });
        }
        break;
      }
    }
    addNotification({
      user_id: userId, type: 'success', title: 'Tâche terminée',
      message: `${tache.titre} marquée comme terminée.`, canal: 'in_app',
    });
  };

  const selectedCharge = charges.find(c => c.inspecteur_id === selectedInspecteur);
  const nomConnecte    = `${user.prenom} ${user.nom}`.trim();

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in" data-role={userRole} data-module="charge-travail">

      {/* EN-TÊTE */}
      <ModuleHeader
        icon={<ListTodo />}
        title="Charge de Travail"
        description={mainTab === 'ma_charge'
          ? `Ma charge personnelle — ${nomConnecte}`
          : `Suivi de la charge des inspecteurs`}
        actions={
          <div className="flex items-center gap-3">
            {/* Onglets principaux — toujours visibles, position fixe */}
            <div className="view-toggle">
              <button
                className={mainTab === 'ma_charge' ? 'active' : ''}
                onClick={() => setMainTab('ma_charge')}
              >
                <User className="w-4 h-4" />
                <span>Ma Charge</span>
              </button>
              {isAdminRole && (
                <button
                  className={mainTab === 'equipe' ? 'active' : ''}
                  onClick={() => setMainTab('equipe')}
                >
                  <Users className="w-4 h-4" />
                  <span>Équipe</span>
                </button>
              )}
              <button
                className={mainTab === 'stats' ? 'active' : ''}
                onClick={() => setMainTab('stats')}
              >
                <BarChart3 className="w-4 h-4" />
                <span>Stats</span>
              </button>
            </div>

          </div>
        }
      />

      {/* ══════════════════════════ MA CHARGE ══════════════════════════════════ */}
      {mainTab === 'ma_charge' && (
        <>
          {/* KPIs personnels */}
          <div className="kpi-grid">
            <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.05s' }}>
              <div className="kpi-icon bg-role-primary-soft"><ListTodo className="w-5 h-5 text-role-primary" /></div>
              <div className="kpi-content">
                <div className="kpi-label">Total tâches</div>
                <div className="kpi-value">{kpisMC.total}</div>
              </div>
            </div>
            <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.1s' }}>
              <div className="kpi-icon bg-danger-soft"><Flame className="w-5 h-5 text-danger" /></div>
              <div className="kpi-content">
                <div className="kpi-label text-danger">En retard</div>
                <div className="kpi-value text-danger">{kpisMC.en_retard}</div>
              </div>
            </div>
            <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.15s' }}>
              <div className="kpi-icon bg-role-primary-soft"><Clock className="w-5 h-5 text-role-primary" /></div>
              <div className="kpi-content">
                <div className="kpi-label">En cours</div>
                <div className="kpi-value">{kpisMC.en_cours}</div>
              </div>
            </div>
            <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.2s' }}>
              <div className="kpi-icon bg-success-soft"><CheckCircle2 className="w-5 h-5 text-success" /></div>
              <div className="kpi-content">
                <div className="kpi-label">Terminé</div>
                <div className="kpi-value">{kpisMC.termine}</div>
              </div>
            </div>
            <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.25s' }}>
              <div className="kpi-icon bg-success-soft"><TrendingUp className="w-5 h-5 text-success" /></div>
              <div className="kpi-content">
                <div className="kpi-label">Progression</div>
                <div className="kpi-value">{kpisMC.progression}%</div>
                <div className="progress h-1.5 mt-2">
                  <div className="progress-bar progress-moyen" style={{ width: `${kpisMC.progression}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Filtres — une seule ligne, style Planning */}
          <Card className="border-primary/20 bg-primary-soft/30 animate-fade-up" style={{ animationDelay: '0.3s' }} icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
            <div className="flex flex-wrap items-center gap-3">
              {/* Période */}
              <select
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
                value={periodeMC.toString()}
                onChange={e => setPeriodeMC(parseInt(e.target.value))}
              >
                <option value="7">7 jours</option>
                <option value="15">15 jours</option>
                <option value="30">30 jours</option>
                <option value="60">60 jours</option>
              </select>
              {/* Recherche */}
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher une tâche..."
                  value={searchMC}
                  onChange={e => setSearchMC(e.target.value)}
                  className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm ${focusClass}`}
                />
              </div>
              {/* Type */}
              <select
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
                value={filtersMC.type}
                onChange={e => setFiltersMC(f => ({ ...f, type: e.target.value }))}
              >
                <option value="tous">Tous types</option>
                <option value="surveillance">Surveillances</option>
                <option value="ecart">Écarts</option>
                <option value="evenement">Événements</option>
                <option value="dossier">Dossiers</option>
                <option value="formation">Formations</option>
              </select>
              {/* Priorité */}
              <select
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
                value={filtersMC.priorite}
                onChange={e => setFiltersMC(f => ({ ...f, priorite: e.target.value }))}
              >
                <option value="tous">Toutes priorités</option>
                <option value="critique">Critique</option>
                <option value="haute">Haute</option>
                <option value="moyenne">Moyenne</option>
                <option value="basse">Basse</option>
              </select>
              {/* Reset */}
              {(searchMC || filtersMC.type !== 'tous' || filtersMC.priorite !== 'tous') && (
                <button
                  className="action-button hover:text-danger hover:bg-danger/10 transition-all duration-200"
                  onClick={() => { setSearchMC(''); setFiltersMC({ type: 'tous', priorite: 'tous' }); }}
                  title="Réinitialiser les filtres"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </Card>

          {/* Sections par statut */}
          {tachesMaCharge.length === 0 ? (
            <div className="card animate-fade-up" style={{ animationDelay: '0.35s' }}>
              <div className="card-content py-16 text-center">
                <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4 opacity-50" />
                <p className="text-foreground font-medium">Aucune tâche pour cette période</p>
                <p className="text-muted text-sm mt-1">Les tâches qui vous sont assignées apparaîtront ici.</p>
              </div>
            </div>
          ) : (
            <div className="animate-fade-up" style={{ animationDelay: '0.35s' }}>
            <AccordionGroup spacing="md">
              {STATUT_SECTIONS.map(section => {
                const tachesSection = tachesParStatutMC[section.key as keyof typeof tachesParStatutMC] || [];
                if (tachesSection.length === 0) return null;
                const SectionIcon = section.Icon;
                return (
                  <AccordionSection
                    key={section.key}
                    icon={<div className={`p-2 rounded-lg ${section.bgClass}`}><SectionIcon className={`w-4 h-4 ${section.iconClass}`} /></div>}
                    title={section.label}
                    badges={<span className={section.badgeClass}>{tachesSection.length}</span>}
                  >
                    {tachesSection.map((tache, idx) => {
                      const priorite  = getPrioriteBadge(tache.priorite);
                      const statut    = getStatutBadge(tache.statut);
                      const aerodrome = aerodromes.find(a => a.id === tache.aerodrome_id);
                      return (
                        <div
                          key={tache.id}
                          className={`card ${section.borderClass} hover:shadow-lg transition-all duration-300 animate-fade-up`}
                          style={{ animationDelay: `${idx * 0.03}s` }}
                        >
                          <div className="card-content p-4">
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg ${section.bgClass} flex-shrink-0`}>
                                {getTypeIcon(tache.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className="font-medium text-foreground">{tache.titre}</span>
                                  <span className={priorite.className}>{priorite.label}</span>
                                  <span className={statut.className}>{statut.label}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mb-2">{tache.description}</p>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Échéance : {tache.date_echeance ? new Date(tache.date_echeance).toLocaleDateString('fr-FR') : '-'}</span>
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{chargeUtils.formatTemps(tache.temps_estime)}</span>
                                  {aerodrome && <span className="code-oaci-badge">{aerodrome.code_oaci}</span>}
                                </div>
                                {tache.progression > 0 && (
                                  <div className="mt-2 w-40">
                                    <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Progression</span><span className="font-medium">{tache.progression}%</span></div>
                                    <div className="progress h-1.5"><div className="progress-bar" style={{ width: `${tache.progression}%` }} /></div>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" aria-label="Voir"
                                  onClick={() => { setSelectedInspecteur(tache.lien_id); setShowDetails(true); setDetailTab('liste'); }}>
                                  <Eye className="w-4 h-4" />
                                </button>
                                {tache.statut !== 'termine' && (
                                  <button className="action-button hover:text-success hover:bg-success/10 transition-all duration-200" aria-label="Marquer terminé"
                                    onClick={() => handleMarkTermine(tache)}>
                                    <CheckCircle2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </AccordionSection>
                );
              })}
            </AccordionGroup>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════ ÉQUIPE ═════════════════════════════════════ */}
      {mainTab === 'equipe' && isAdminRole && (
        <>
          {/* KPIs globaux */}
          <div className="kpi-grid">
            <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.05s' }}>
              <div className="kpi-icon"><ListTodo /></div>
              <div className="kpi-content"><div className="kpi-label">Total tâches</div><div className="kpi-value">{statsGlobales.total_taches}</div></div>
            </div>
            <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.1s' }}>
              <div className="kpi-icon"><AlertCircle /></div>
              <div className="kpi-content"><div className="kpi-label text-danger">En retard</div><div className="kpi-value text-danger">{statsGlobales.total_en_retard}</div></div>
            </div>
            <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.15s' }}>
              <div className="kpi-icon"><Gauge /></div>
              <div className="kpi-content">
                <div className="kpi-label">Charge moyenne</div>
                <div className="kpi-value">{statsGlobales.charge_moyenne}%</div>
                <div className="progress h-1.5 mt-2">
                  <div className={`progress-bar ${getChargeProgressClass(statsGlobales.charge_moyenne)}`} style={{ width: `${statsGlobales.charge_moyenne}%` }} />
                </div>
              </div>
            </div>
            <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.2s' }}>
              <div className="kpi-icon"><CheckCircle2 /></div>
              <div className="kpi-content"><div className="kpi-label">Progression</div><div className="kpi-value">{statsGlobales.progression_moyenne}%</div></div>
            </div>
          </div>

          {/* Filtres équipe — une seule ligne, style Planning */}
          <Card className="border-primary/20 bg-primary-soft/30 animate-fade-up" style={{ animationDelay: '0.25s' }} icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
            <div className="flex flex-wrap items-center gap-3">
              <select
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
                value={periode.toString()}
                onChange={e => setPeriode(parseInt(e.target.value))}
              >
                <option value="7">7 jours</option>
                <option value="15">15 jours</option>
                <option value="30">30 jours</option>
                <option value="60">60 jours</option>
              </select>
              <button className="btn btn-secondary h-7 px-2.5 text-xs gap-1.5" onClick={handleExport} title="Exporter le rapport">
                <Download className="w-3.5 h-3.5 text-role-primary" />
                Rapport
              </button>
              <div className="w-px h-6 bg-border" />
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher une tâche..."
                  value={searchEq}
                  onChange={e => setSearchEq(e.target.value)}
                  className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm ${focusClass}`}
                />
              </div>
              <select
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
                value={filtersEq.type}
                onChange={e => setFiltersEq(f => ({ ...f, type: e.target.value }))}
              >
                <option value="tous">Tous types</option>
                <option value="surveillance">Surveillances</option>
                <option value="ecart">Écarts</option>
                <option value="evenement">Événements</option>
                <option value="dossier">Dossiers</option>
                <option value="formation">Formations</option>
              </select>
              <select
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
                value={filtersEq.priorite}
                onChange={e => setFiltersEq(f => ({ ...f, priorite: e.target.value }))}
              >
                <option value="tous">Toutes priorités</option>
                <option value="critique">Critique</option>
                <option value="haute">Haute</option>
                <option value="moyenne">Moyenne</option>
                <option value="basse">Basse</option>
              </select>
              <select
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
                value={filtersEq.statut}
                onChange={e => setFiltersEq(f => ({ ...f, statut: e.target.value }))}
              >
                <option value="tous">Tous statuts</option>
                <option value="a_faire">À faire</option>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé</option>
                <option value="en_retard">En retard</option>
              </select>
              <select
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
                value={filtersEq.inspecteur}
                onChange={e => setFiltersEq(f => ({ ...f, inspecteur: e.target.value }))}
              >
                <option value="tous">Tous les inspecteurs</option>
                {charges.map(c => (
                  <option key={c.inspecteur_id} value={c.inspecteur_id}>{c.inspecteur_nom}</option>
                ))}
              </select>
              {(searchEq || filtersEq.type !== 'tous' || filtersEq.priorite !== 'tous' || filtersEq.statut !== 'tous' || filtersEq.inspecteur !== 'tous') && (
                <button
                  className="action-button hover:text-danger hover:bg-danger/10 transition-all duration-200"
                  onClick={() => { setSearchEq(''); setFiltersEq({ type: 'tous', priorite: 'tous', statut: 'tous', inspecteur: 'tous' }); }}
                  title="Réinitialiser les filtres"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </Card>

          {/* Cartes inspecteurs */}
          <div className="space-y-4">
            {charges.map((charge, idx) => {
              const isOverloaded = charge.charge >= 80;
              const initials = getInitials(charge.inspecteur_nom);
              return (
                <div
                  key={charge.inspecteur_id}
                  className={`card ${isOverloaded ? 'border-l-4 border-l-danger' : 'border-l-4 border-l-role-primary'} hover:shadow-xl transition-all duration-300 animate-fade-up`}
                  style={{ animationDelay: `${0.3 + idx * 0.05}s` }}
                >
                  <div className="card-content p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <span className="w-12 h-12 rounded-full bg-role-gradient !text-white flex items-center justify-center text-xs font-bold shrink-0">{initials}</span>
                        <div>
                          <h3 className="font-semibold text-foreground text-lg">{charge.inspecteur_nom}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="badge outline">{charge.total_taches} tâches</span>
                            {charge.taches_par_statut.en_cours > 0 && (
                              <span className="badge primary">{charge.taches_par_statut.en_cours} en cours</span>
                            )}
                            {charge.taches_par_statut.en_retard > 0 && (
                              <span className="badge danger animate-pulse flex items-center gap-1">
                                <Flame className="w-3 h-3" />{charge.taches_par_statut.en_retard} en retard
                              </span>
                            )}
                            {charge.taches_par_statut.termine > 0 && (
                              <span className="badge success">{charge.taches_par_statut.termine} terminé(s)</span>
                            )}
                            {isOverloaded && <span className="badge danger animate-pulse">Surcharge</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs text-muted-foreground">Charge</div>
                        <div className={`text-2xl font-bold ${isOverloaded ? 'text-danger' : 'text-foreground'}`}>{charge.charge}%</div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Charge sur {charge.jours_disponibles} jours</span>
                        <span>{chargeUtils.formatTemps(charge.temps_total_estime)} estimées</span>
                      </div>
                      <div className="progress h-2">
                        <div className={`progress-bar ${getChargeProgressClass(charge.charge)}`} style={{ width: `${charge.charge}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4 mt-4">
                      <div><p className="text-xs text-muted-foreground">À faire</p><p className="text-lg font-semibold">{charge.taches_par_statut.a_faire}</p></div>
                      <div><p className="text-xs text-muted-foreground">En cours</p><p className="text-lg font-semibold text-role-primary">{charge.taches_par_statut.en_cours}</p></div>
                      <div><p className="text-xs text-muted-foreground">Terminé</p><p className="text-lg font-semibold text-success">{charge.taches_par_statut.termine}</p></div>
                      <div><p className="text-xs text-muted-foreground">Progression</p><p className="text-lg font-semibold">{charge.progression_globale}%</p></div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-border">
                      <button
                        className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                        onClick={() => { setSelectedInspecteur(charge.inspecteur_id); setShowDetails(true); setDetailTab('liste'); }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Voir les tâches
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {charges.length === 0 && (
              <div className="card">
                <div className="card-content py-16 text-center">
                  <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                  <p className="text-muted-foreground">Aucune charge de travail pour la période sélectionnée</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════ STATS ══════════════════════════════════════ */}
      {mainTab === 'stats' && (
        <div className="space-y-6 animate-fade-up">
          {/* Stats inspecteur connecté */}
          <div className="card border-l-4 border-l-role-primary">
            <div className="card-header">
              <h3 className="card-title flex items-center gap-2">
                <User className="w-4 h-4 text-role-primary" />
                {nomConnecte} — Ma répartition
              </h3>
            </div>
            <div className="card-content space-y-3">
              {STATUT_SECTIONS.map(s => {
                const count = tachesParStatutMC[s.key as keyof typeof tachesParStatutMC]?.length || 0;
                return (
                  <div key={s.key}>
                    <div className="flex justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <s.Icon className={`w-3.5 h-3.5 ${s.iconClass}`} />
                        <span className="text-muted-foreground">{s.label}</span>
                      </div>
                      <span className={s.badgeClass}>{count}</span>
                    </div>
                    <div className="progress h-2">
                      <div className="progress-bar" style={{ width: `${kpisMC.total > 0 ? (count / kpisMC.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats globales (admin seulement) */}
          {isAdminRole && charges.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <Users className="w-4 h-4 text-role-primary" />
                  Charge par inspecteur
                </h3>
              </div>
              <div className="card-content space-y-3">
                {charges.map(c => (
                  <div key={c.inspecteur_id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">{c.inspecteur_nom}</span>
                      <span className={`font-medium ${c.charge >= 80 ? 'text-danger' : 'text-foreground'}`}>{c.charge}%</span>
                    </div>
                    <div className="progress h-2">
                      <div className={`progress-bar ${getChargeProgressClass(c.charge)}`} style={{ width: `${c.charge}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Performance des inspecteurs (admin seulement) */}
          {isAdminRole && (
            <div className="card border-l-4 border-l-role-primary">
              <div className="card-header">
                <h3 className="card-title flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-role-primary" />
                  Performance des inspecteurs
                </h3>
              </div>
              <div className="card-content">
                <div className="table-container">
                  <table className="table table-compact">
                    <thead>
                      <tr>
                        <th>Inspecteur</th>
                        <th>Poste</th>
                        <th>Surveillances</th>
                        <th>Dossiers traités</th>
                        <th>En retard</th>
                        <th>Formations</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {utilisateurs.filter(u => ['inspector', 'admin'].includes(u.role) && u.statut === 'actif').map(ins => {
                        const dossiersIns = (dossiers || []).filter(d => d.inspecteur_id === ins.id)
                        const traites = dossiersIns.filter(d => d.statut === 'termine').length
                        const enRetard = dossiersIns.filter(d => d.statut === 'en_cours' && new Date(d.date_limite) < new Date()).length
                        const surveillancesIns = (surveillances || []).filter(s => (s.equipe_ids || []).includes(ins.id) && s.statut === 'transmise')
                        const formationsIns = (formations || []).filter(f => (f.participants || []).includes(ins.id))
                        const perfScore = dossiersIns.length > 0 ? Math.round((traites / (traites + enRetard || 1)) * 50 + Math.min(surveillancesIns.length * 10, 30) + Math.min(formationsIns.length * 5, 20)) : 50
                        return (
                          <tr key={ins.id}>
                            <td className="font-medium">{ins.prenom} {ins.nom}</td>
                            <td className="text-xs capitalize">{ins.poste || 'inspecteur'}</td>
                            <td>{surveillancesIns.length}</td>
                            <td>{traites}</td>
                            <td><span className={enRetard > 0 ? 'badge danger' : 'badge success'}>{enRetard}</span></td>
                            <td>{formationsIns.length}</td>
                            <td>
                              <div className="flex items-center gap-2">
                                <div className="progress w-16 h-1.5">
                                  <div className={`progress-bar ${perfScore >= 70 ? '' : perfScore >= 40 ? 'bg-warning' : 'bg-danger'}`} style={{ width: `${perfScore}%` }} />
                                </div>
                                <span className="text-xs">{perfScore}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Détails inspecteur (Équipe) */}
      <FormShell
        open={showDetails}
        onClose={() => setShowDetails(false)}
        title="Détail des tâches"
        icon={ListTodo}
        size="4xl"
        dataRole={userRole}
        tabs={[
          { id: 'liste', label: 'Liste des tâches' },
          { id: 'stats', label: 'Statistiques' },
        ]}
        activeTab={detailTab}
        onTabChange={id => setDetailTab(id as 'liste' | 'stats')}
      >
        {selectedInspecteur && (
          <div>
            {detailTab === 'liste' && (
              <div className="space-y-3">
                {STATUT_SECTIONS.map(section => {
                  const tachesSection = (tachesParInspecteur[selectedInspecteur] || [])
                    .filter(t => t.statut === section.key);
                  if (tachesSection.length === 0) return null;
                  return (
                    <div key={section.key} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <section.Icon className={`w-4 h-4 ${section.iconClass}`} />
                        <span className="font-semibold text-foreground text-sm">{section.label}</span>
                        <span className={section.badgeClass}>{tachesSection.length}</span>
                      </div>
                      {tachesSection.map((tache, idx) => {
                        const priorite  = getPrioriteBadge(tache.priorite);
                        const statut    = getStatutBadge(tache.statut);
                        const aerodrome = aerodromes.find(a => a.id === tache.aerodrome_id);
                        return (
                          <div key={tache.id} className={`card ${section.borderClass} animate-fade-up`} style={{ animationDelay: `${idx * 0.03}s` }}>
                            <div className="card-content p-4">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg ${section.bgClass} flex-shrink-0`}>{getTypeIcon(tache.type)}</div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="font-medium text-foreground">{tache.titre}</span>
                                    <span className={priorite.className}>{priorite.label}</span>
                                    <span className={statut.className}>{statut.label}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mb-2">{tache.description}</p>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                                      <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />Échéance : {tache.date_echeance ? new Date(tache.date_echeance).toLocaleDateString('fr-FR') : '-'}</div>
                                      <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{chargeUtils.formatTemps(tache.temps_estime)}</div>
                                      {aerodrome && <span className="code-oaci-badge">{aerodrome.code_oaci}</span>}
                                    </div>
                                  {tache.progression > 0 && (
                                    <div className="mt-2 w-40">
                                      <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Progression</span><span className="font-medium">{tache.progression}%</span></div>
                                      <div className="progress h-1.5"><div className="progress-bar" style={{ width: `${tache.progression}%` }} /></div>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" aria-label="Voir"
                                    onClick={() => { setSelectedInspecteur(tache.lien_id); setShowDetails(true); setDetailTab('liste'); }}>
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  {tache.statut !== 'termine' && (
                                    <button className="action-button hover:text-success hover:bg-success/10 transition-all duration-200" aria-label="Marquer terminé"
                                      onClick={() => handleMarkTermine(tache)}>
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  {isAdminRole && (
                                    <button className="action-button hover:text-danger hover:bg-danger/10 transition-all duration-200" aria-label="Supprimer">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {detailTab === 'stats' && selectedCharge && (
              <div className="space-y-6">
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Répartition par statut</h3></div>
                  <div className="card-content space-y-3">
                    {STATUT_SECTIONS.map(s => {
                      const count = selectedCharge.taches_par_statut[s.key as keyof typeof selectedCharge.taches_par_statut] || 0;
                      return (
                        <div key={s.key}>
                          <div className="flex justify-between text-sm mb-1">
                            <div className="flex items-center gap-2">
                              <s.Icon className={`w-3.5 h-3.5 ${s.iconClass}`} />
                              <span className="text-muted-foreground">{s.label}</span>
                            </div>
                            <span className={s.badgeClass}>{count}</span>
                          </div>
                          <div className="progress h-2">
                            <div className="progress-bar" style={{ width: `${selectedCharge.total_taches > 0 ? (count / selectedCharge.total_taches) * 100 : 0}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><h3 className="card-title">Récapitulatif</h3></div>
                  <div className="card-content">
                    <dl className="grid grid-cols-2 gap-4">
                      <div><dt className="text-xs text-muted-foreground">Total tâches</dt><dd className="text-2xl font-bold">{selectedCharge.total_taches}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Charge</dt><dd className={`text-2xl font-bold ${selectedCharge.charge >= 80 ? 'text-danger' : ''}`}>{selectedCharge.charge}%</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Temps estimé</dt><dd className="text-xl font-semibold">{chargeUtils.formatTemps(selectedCharge.temps_total_estime)}</dd></div>
                      <div><dt className="text-xs text-muted-foreground">Progression</dt><dd className="text-xl font-semibold text-success">{selectedCharge.progression_globale}%</dd></div>
                    </dl>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </FormShell>
    </div>
  );
}
