// components/modules/enquetes/EnquetesModule.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FormShell } from '@/components/ui/FormShell';
import { useAppStore, type Enquete } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { TYPES_ENQUETE, TYPES_QUESTION } from '@/lib/config';
import {
  ClipboardList,
  BarChart3,
  TrendingUp,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  Plus,
  Eye,
  PenSquare,
  Trash2,
  Send,
  Search,
  Filter,
  X,
  Star,
  MessageSquare,
  Edit3,
  FileQuestion,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EnqueteForm } from '@/components/forms/EnqueteForm';
import { EnqueteBuilder } from './EnqueteBuilder';
import { EnqueteStats } from './EnqueteStats';
import { EnqueteExport } from './EnqueteExport';

interface EnquetesModuleProps {
  user: any;
  aerodromeId?: string;
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
};

export function EnquetesModule({ user, aerodromeId }: EnquetesModuleProps) {
  const enquetes = useAppStore((s) => s.enquetes);
  const reponsesEnquetes = useAppStore((s) => s.reponsesEnquetes);
  const aerodromes = useAppStore((s) => s.aerodromes);
  const addEnquete = useAppStore((s) => s.addEnquete);
  const updateEnquete = useAppStore((s) => s.updateEnquete);
  const soumettreReponse = useAppStore((s) => s.soumettreReponse);
  const recalculerProfilRisque = useAppStore((s) => s.recalculerProfilRisque);
  const getStatistiquesEnquete = useAppStore((s) => s.getStatistiquesEnquete);
  const addNotification = useAppStore((s) => s.addNotification);

  const userRole = user?.role || 'guest';

  // États
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    type: 'tous',
    statut: 'tous',
    aerodrome: 'tous',
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editingEnquete, setEditingEnquete] = useState<Enquete | null>(null);
  const [showRepondreModal, setShowRepondreModal] = useState(false);
  const [selectedEnquete, setSelectedEnquete] = useState<string | null>(null);
  const [reponses, setReponses] = useState<Record<string, any>>({});

  
  // États pour le builder et les stats/export
  const [builderOpen, setBuilderOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [currentEnquete, setCurrentEnquete] = useState<Enquete | null>(null);

  // Statistiques globales
  const stats = {
    total: enquetes.length,
    actives: enquetes.filter((e) => e.statut === 'active').length,
    terminees: enquetes.filter((e) => e.statut === 'terminee').length,
    tauxReponseMoyen: 0,
  };

  if (enquetes.length > 0) {
    const totalTaux = enquetes.reduce((acc, enquete) => {
      const statsEnq = getStatistiquesEnquete(enquete.id);
      return acc + (statsEnq.taux_reponse || 0);
    }, 0);
    stats.tauxReponseMoyen = Math.round(totalTaux / enquetes.length);
  }

  // Filtrer les enquêtes
  const filteredEnquetes = enquetes.filter((enq) => {
    if (aerodromeId && !enq.aerodrome_ids.includes(aerodromeId)) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matches =
        enq.titre.toLowerCase().includes(term) || enq.description.toLowerCase().includes(term);
      if (!matches) return false;
    }
    if (filters.type !== 'tous' && enq.type_enquete !== filters.type) return false;
    if (filters.statut !== 'tous' && enq.statut !== filters.statut) return false;
    return true;
  });

  const getBadgeStatut = (statut: string) => {
    const statuts: Record<string, { label: string; className: string }> = {
      brouillon: { label: 'Brouillon', className: 'badge neutral' },
      active: { label: 'Active', className: 'badge success' },
      terminee: { label: 'Terminée', className: 'badge primary' },
      archivee: { label: 'Archivée', className: 'badge neutral' },
    };
    return statuts[statut] || { label: statut, className: 'badge neutral' };
  };

  const getIconeType = (type: string) => {
    switch (type) {
      case 'Culture SGS':
        return <Users className="w-4 h-4" />;
      case 'Satisfaction':
        return <Star className="w-4 h-4" />;
      case 'Évaluation':
        return <BarChart3 className="w-4 h-4" />;
      case 'Suivi':
        return <TrendingUp className="w-4 h-4" />;
      default:
        return <ClipboardList className="w-4 h-4" />;
    }
  };

  const handleNewEnquete = () => {
    setEditingEnquete(null);
    setFormOpen(true);
  };

  const handleEditEnquete = (enquete: any) => {
    setEditingEnquete(enquete);
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    setEditingEnquete(null);
  };

  const handleOpenBuilder = (enquete: any) => {
    setCurrentEnquete(enquete);
    setBuilderOpen(true);
  };

  const handleBuilderSave = (updatedEnquete: any) => {
    updateEnquete(updatedEnquete.id, updatedEnquete);
    setBuilderOpen(false);
    setCurrentEnquete(null);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Questionnaire mis à jour',
      message: `Les questions de l'enquête ${updatedEnquete.titre} ont été sauvegardées`,
      canal: 'in_app',
    });
  };

  const handleOpenStats = (enquete: any) => {
    setCurrentEnquete(enquete);
    setStatsOpen(true);
  };

  const handleOpenExport = (enquete: any) => {
    setCurrentEnquete(enquete);
    setExportOpen(true);
  };

  const renderQuestionInput = (question: any) => {
    switch (question.type) {
      case 'texte_libre':
        return (
          <textarea
            className={`form-textarea w-full ${focusClass}`}
            rows={3}
            value={reponses[question.id] || ''}
            onChange={(e) => setReponses({ ...reponses, [question.id]: e.target.value })}
            required={question.obligatoire}
            placeholder="Votre réponse..."
          />
        );
      case 'choix_unique':
        return (
          <div className="space-y-2">
            {question.options?.map((opt: string, i: number) => (
              <label
                key={i}
                className="form-radio p-2 hover:bg-role-primary-soft rounded-lg cursor-pointer transition-colors"
              >
                <input
                  type="radio"
                  name={question.id}
                  value={opt}
                  checked={reponses[question.id] === opt}
                  onChange={(e) => setReponses({ ...reponses, [question.id]: e.target.value })}
                  required={question.obligatoire}
                />
                <span className="text-small">{opt}</span>
              </label>
            ))}
          </div>
        );
      case 'choix_multiple':
        return (
          <div className="space-y-2">
            {question.options?.map((opt: string, i: number) => (
              <label
                key={i}
                className="form-checkbox p-2 hover:bg-role-primary-soft rounded-lg cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  value={opt}
                  checked={(reponses[question.id] || []).includes(opt)}
                  onChange={(e) => {
                    const current = reponses[question.id] || [];
                    const newValue = e.target.checked
                      ? [...current, opt]
                      : current.filter((v: string) => v !== opt);
                    setReponses({ ...reponses, [question.id]: newValue });
                  }}
                />
                <span className="text-small">{opt}</span>
              </label>
            ))}
          </div>
        );
      case 'likert_5':
        return (
          <div className="space-y-2">
            <div className="flex justify-between gap-2">
              {[1, 2, 3, 4, 5].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setReponses({ ...reponses, [question.id]: val })}
                  className={`flex-1 p-3 rounded-lg transition-all ${
                    reponses[question.id] === val
                      ? 'bg-role-gradient text-white shadow-lg scale-105'
                      : 'bg-role-primary-soft hover:bg-role-primary-light'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span>Pas du tout d'accord</span>
              <span>Tout à fait d'accord</span>
            </div>
            {question.impact_c1 && (
              <span className="badge outline mt-2 inline-flex items-center gap-1">
                <Star className="w-3 h-3 fill-warning text-warning" />
                Impacte le score C1
              </span>
            )}
          </div>
        );
      case 'note_10':
        return (
          <select
            className={`form-select w-full ${focusClass}`}
            style={selectStyle}
            value={reponses[question.id]?.toString() || ''}
            onChange={(e) => setReponses({ ...reponses, [question.id]: parseInt(e.target.value) })}
          >
            <option value="">Choisir une note</option>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}/10
              </option>
            ))}
          </select>
        );
      case 'oui_non':
        return (
          <div className="flex gap-4">
            <label className="form-radio cursor-pointer">
              <input
                type="radio"
                name={question.id}
                value="oui"
                checked={reponses[question.id] === 'oui'}
                onChange={(e) => setReponses({ ...reponses, [question.id]: e.target.value })}
              />
              <span className="text-small">Oui</span>
            </label>
            <label className="form-radio cursor-pointer">
              <input
                type="radio"
                name={question.id}
                value="non"
                checked={reponses[question.id] === 'non'}
                onChange={(e) => setReponses({ ...reponses, [question.id]: e.target.value })}
              />
              <span className="text-small">Non</span>
            </label>
          </div>
        );
      case 'date':
        return (
          <input
            type="date"
            className={`form-input w-full ${focusClass}`}
            value={reponses[question.id] || ''}
            onChange={(e) => setReponses({ ...reponses, [question.id]: e.target.value })}
            required={question.obligatoire}
          />
        );
      default:
        return null;
    }
  };

  const handleSoumettreReponse = () => {
    if (!selectedEnquete) return;

    const enquete = enquetes.find((e) => e.id === selectedEnquete);
    if (!enquete) return;

    // Calculer le score C1 si l'enquête impacte
    let scoreC1: number | undefined;
    if (enquete.questions.some((q) => q.impact_c1)) {
      const reponsesLikert = Object.entries(reponses)
        .filter(([qId, val]) => {
          const question = enquete.questions.find((q) => q.id === qId);
          return question?.impact_c1 && typeof val === 'number';
        })
        .map(([, val]) => val as number);

      if (reponsesLikert.length > 0) {
        scoreC1 = reponsesLikert.reduce((a, b) => a + b, 0) / reponsesLikert.length;
      }
    }

    soumettreReponse({
      enquete_id: selectedEnquete,
      aerodrome_id: aerodromeId || enquete.aerodrome_ids[0],
      repondant_id: user?.id || '',
      repondant_nom: user?.nom || '',
      repondant_role: user?.role || '',
      reponses: reponses,
      score_c1: scoreC1,
    });

    // Recalculer le profil de risque si l'enquête impacte C1
    if (scoreC1 !== undefined) {
      const aerodromeCible = aerodromeId || enquete.aerodrome_ids[0]
      recalculerProfilRisque(aerodromeCible).catch(() => {})
    }

    // Notification si impact C1
    if (scoreC1) {
      addNotification({
        user_id: 'system',
        type: 'info',
        title: 'Profil risque mis à jour',
        message: `Le score C1 a été réévalué suite à l'enquête ${enquete.titre}`,
        canal: 'in_app',
      });
    }

    setShowRepondreModal(false);
    setSelectedEnquete(null);
    setReponses({});
  };

  const resetFilters = () => {
    setSearchTerm('');
    setFilters({ type: 'tous', statut: 'tous', aerodrome: 'tous' });
  };

  const peutCreerEnquete = userRole === 'admin' || userRole === 'inspector';

  // ============================================================
  // MODALES
  // ============================================================

  // Modal Formulaire (création/modification)
  const FormModal = () => (
    <FormShell
      open={formOpen}
      onClose={() => { setFormOpen(false); }}
      title={editingEnquete ? "Modifier l'enquête" : 'Nouvelle enquête'}
      icon={ClipboardList}
      size="4xl"
      dataRole={userRole}
    >
      <EnqueteForm
        mode={editingEnquete ? 'modification' : 'creation'}
        enqueteId={editingEnquete?.id}
        onSuccess={() => { setFormOpen(false); }}
        onCancel={() => { setFormOpen(false); }}
        userRole={userRole}
        userId={user?.id || ''}
      />
    </FormShell>
  );

  // Modal Builder (construction des questions)
  const BuilderModal = () => {
    if (!builderOpen || !currentEnquete) return null;
    return createPortal(
      <EnqueteBuilder
        enquete={currentEnquete}
        onSave={handleBuilderSave}
        onClose={() => {
          setBuilderOpen(false);
          setCurrentEnquete(null);
        }}
      />,
      document.body
    );
  };

  // Modal Statistiques
  const StatsModal = () => {
    if (!statsOpen || !currentEnquete) return null;
    return createPortal(
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setStatsOpen(false)}>
        <div className="bg-background rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border-t-4 border-t-role-primary flex flex-col">
          <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title">Statistiques - {currentEnquete.titre}</div>
            <button className="modal-close" onClick={() => setStatsOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <EnqueteStats enqueteId={currentEnquete.id} userRole={userRole} />
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // Modal Export
  const ExportModal = () => {
    if (!exportOpen || !currentEnquete) return null;
    return createPortal(
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setExportOpen(false)}>
        <div className="bg-background rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border-t-4 border-t-role-primary flex flex-col">
          <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title">Export - {currentEnquete.titre}</div>
            <button className="modal-close" onClick={() => setExportOpen(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <EnqueteExport enqueteId={currentEnquete.id} userRole={userRole} />
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // Modal Répondre à l'enquête
  const RepondreModal = () => {
    const enquete = selectedEnquete ? enquetes.find((e) => e.id === selectedEnquete) : null;
    return (
      <FormShell
        open={showRepondreModal && !!enquete}
        onClose={() => setShowRepondreModal(false)}
        title="Répondre à l'enquête"
        icon={MessageSquare}
        size="3xl"
        dataRole={userRole}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowRepondreModal(false)}>
              Annuler
            </button>
            <button className="btn btn-primary" onClick={handleSoumettreReponse}>
              Soumettre mes réponses
            </button>
          </>
        }
      >
        {enquete && (
          <div className="space-y-6">
            {enquete.questions
              .sort((a: any, b: any) => a.ordre - b.ordre)
              .map((question: any, index: number) => (
                <div key={question.id} className="space-y-2">
                  <label className="font-medium">
                    {index + 1}. {question.texte}
                    {question.obligatoire && <span className="text-danger ml-1">*</span>}
                  </label>
                  {renderQuestionInput(question)}
                </div>
              ))}
          </div>
        )}
      </FormShell>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="enquetes">
      {/* En-tête */}
      <ModuleHeader
        icon={<ClipboardList />}
        title="Enquêtes"
        description="Gestion des enquêtes et questionnaires"
        actions={peutCreerEnquete && (
          <button onClick={handleNewEnquete} className="btn btn-primary gap-2">
            <Plus className="w-4 h-4" />
            Nouvelle enquête
          </button>
        )}
      />

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <ClipboardList className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total enquêtes</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Actives</div>
          <div className="kpi-value">{stats.actives}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-primary-soft">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div className="kpi-label">Terminées</div>
          <div className="kpi-value">{stats.terminees}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <TrendingUp className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">Taux réponse</div>
          <div className="kpi-value">{stats.tauxReponseMoyen}%</div>
        </div>
      </div>

      {/* Barre d'outils */}
      <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher enquête..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous types</option>
            {TYPES_ENQUETE.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={filters.statut}
            onChange={(e) => setFilters({ ...filters, statut: e.target.value })}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous statuts</option>
            <option value="brouillon">Brouillon</option>
            <option value="active">Active</option>
            <option value="terminee">Terminée</option>
          </select>
          <button onClick={resetFilters} className="action-button" title="Réinitialiser">
            <X className="w-4 h-4" />
          </button>
        </div>
      </Card>

      {/* Liste des enquêtes */}
      <div className="space-y-4">
        {filteredEnquetes.map((enquete) => {
          const statsEnq = getStatistiquesEnquete(enquete.id);
          const badgeStatut = getBadgeStatut(enquete.statut);
          const dejaRepondu = reponsesEnquetes.some(
            (r) => r.enquete_id === enquete.id && r.repondant_id === user?.id
          );
          const estBrouillon = enquete.statut === 'brouillon';
          const estActive = enquete.statut === 'active';

          return (
            <Card key={enquete.id} className="hover:shadow-role-glow transition-all">
              <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="code-oaci-badge text-sm">{enquete.reference}</span>
                      <span className={badgeStatut.className}>{badgeStatut.label}</span>
                      <span className="badge outline gap-1">
                        {getIconeType(enquete.type_enquete)}
                        {enquete.type_enquete}
                      </span>
                    </div>
                    <h3 className="heading-4 mb-1">{enquete.titre}</h3>
                    <p className="text-small text-muted-foreground mb-3">{enquete.description}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Fin: {new Date(enquete.deadline).toLocaleDateString('fr-FR')}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {enquete.aerodrome_ids.length} aérodrome(s)
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {statsEnq.total_reponses} réponse(s)
                      </div>
                    </div>
                    {estActive && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Taux de réponse</span>
                          <span>{statsEnq.taux_reponse}%</span>
                        </div>
                        <div className="progress h-1">
                          <div className="progress-bar" style={{ width: `${statsEnq.taux_reponse}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {/* Bouton Construire le questionnaire (pour les brouillons) */}
                    {estBrouillon && (
                      <button
                        className="btn btn-secondary btn-sm gap-1"
                        onClick={() => handleOpenBuilder(enquete)}
                        title="Construire le questionnaire"
                      >
                        <FileQuestion className="w-4 h-4" />
                        Questionnaire
                      </button>
                    )}
                    {/* Bouton Modifier (pour les brouillons) */}
                    {estBrouillon && (
                      <button className="action-button" onClick={() => handleEditEnquete(enquete)}>
                        <PenSquare className="w-4 h-4" />
                      </button>
                    )}
                    {/* Bouton Voir les stats (pour les actives/terminées) */}
                    {!estBrouillon && (
                      <button className="action-button" onClick={() => handleOpenStats(enquete)}>
                        <BarChart3 className="w-4 h-4" />
                      </button>
                    )}
                    {/* Bouton Exporter */}
                    {!estBrouillon && statsEnq.total_reponses > 0 && (
                      <button className="action-button" onClick={() => handleOpenExport(enquete)}>
                        <Send className="w-4 h-4" />
                      </button>
                    )}
                    {/* Bouton Répondre */}
                    {estActive && !dejaRepondu && (
                      <button
                        className="btn btn-primary btn-sm gap-1"
                        onClick={() => {
                          setSelectedEnquete(enquete.id);
                          setShowRepondreModal(true);
                        }}
                      >
                        <Send className="w-4 h-4" />
                        Répondre
                      </button>
                    )}
                    {/* Bouton Voir les résultats (pour les terminées) */}
                    {enquete.statut === 'terminee' && (
                      <button className="btn btn-secondary btn-sm gap-1" onClick={() => handleOpenStats(enquete)}>
                        <BarChart3 className="w-4 h-4" />
                        Résultats
                      </button>
                    )}
                  </div>
              </div>
            </Card>
          );
        })}
        {filteredEnquetes.length === 0 && (
          <Card className="text-center">
            <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Aucune enquête trouvée</p>
          </Card>
        )}
      </div>

      {/* Modales */}
      {formOpen && FormModal()}
      {builderOpen && BuilderModal()}
      {statsOpen && StatsModal()}
      {exportOpen && ExportModal()}
      {showRepondreModal && RepondreModal()}
    </div>
  );
}