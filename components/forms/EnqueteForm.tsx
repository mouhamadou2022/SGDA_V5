// components/forms/EnqueteForm.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  ClipboardList, Save, X, AlertCircle,
  Plane, Target, Shield, TrendingUp, Sparkles, Users,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { TYPES_ENQUETE } from '@/lib/config';
import { riskAgent } from '@/lib/ia/agents/riskAgent';
import type { RiskAnalysisResult } from '@/lib/ia/agents/riskAgent';

type IaAnalysis = { message: string; priorite: string };

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
};

const IMPACT_OPTIONS = [
  { value: 'amelioration_culture',       label: 'Amélioration de la culture SGS',               poids: 25 },
  { value: 'conformite_reglementaire',   label: 'Évaluation de la conformité réglementaire',    poids: 20 },
  { value: 'identification_risques',     label: 'Identification des risques émergents',          poids: 30 },
  { value: 'suivi_actions',              label: 'Suivi des actions correctives',                 poids: 15 },
  { value: 'retour_experience',          label: "Retour d'expérience après incident",            poids: 35 },
  { value: 'personnalise',               label: 'Personnalisé...',                               poids: 10 },
];

const OBJECTIFS_OPTIONS = [
  { value: 'objectifs_anacim',       label: "Contribuer aux objectifs sécurité de l'ANACIM" },
  { value: 'alimenter_profil_risque', label: 'Alimenter le profil de risque des aérodromes' },
  { value: 'axes_amelioration',      label: "Identifier des axes d'amélioration" },
  { value: 'efficacite_actions',     label: "Mesurer l'efficacité des actions précédentes" },
  { value: 'personnalise',           label: 'Personnalisé...' },
];

const CRITICITE_OPTIONS = [
  { value: 'basse',    label: 'Basse',    color: 'success' },
  { value: 'moyenne',  label: 'Moyenne',  color: 'warning' },
  { value: 'haute',    label: 'Haute',    color: 'danger' },
  { value: 'critique', label: 'Critique', color: 'danger' },
];

interface EnqueteFormProps {
  mode: 'creation' | 'modification' | 'reponse';
  enqueteId?: string;
  aerodromeId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  userRole: string;
  userId: string;
  onProgressChange?: (n: number) => void;
}

export function EnqueteForm({
  mode, enqueteId, aerodromeId, onSuccess, onCancel, userRole, userId, onProgressChange,
}: EnqueteFormProps) {
  const enquetes = useAppStore(s => s.enquetes)
  const aerodromes = useAppStore(s => s.aerodromes)
  const user = useAppStore(s => s.user)
  const addEnquete = useAppStore(s => s.addEnquete)
  const updateEnquete = useAppStore(s => s.updateEnquete)
  const addNotification = useAppStore(s => s.addNotification)
  const getProfilRisque = useAppStore(s => s.getProfilRisque);

  const [formData, setFormData] = useState({
    titre: '',
    description: '',
    contexte_securite: '',
    impact_securite: '',
    impact_securite_personnalise: '',
    objectif_strategique: '',
    objectif_strategique_personnalise: '',
    criticite: 'moyenne' as 'basse' | 'moyenne' | 'haute' | 'critique',
    type_enquete: TYPES_ENQUETE[0] as string,
    aerodrome_ids: aerodromeId ? [aerodromeId] : [] as string[],
    date_debut: '',
    date_fin: '',
    statut: 'brouillon' as string,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [iaAnalysis, setIaAnalysis] = useState<IaAnalysis | null>(null);
  const [isLoadingIA, setIsLoadingIA] = useState(false);
  const [showIaSuggestion, setShowIaSuggestion] = useState(true);

  // Analyse IA des aérodromes ciblés
  useEffect(() => {
    const loadIaAnalysis = async () => {
      if (formData.aerodrome_ids.length > 0 && mode === 'creation') {
        setIsLoadingIA(true);
        try {
          const firstAerodromeId = formData.aerodrome_ids[0];
          const profil = getProfilRisque(firstAerodromeId);
          if (profil && profil.c1 < 60) {
            const analysis = await riskAgent.analyzeRisk({
              aerodromeId: firstAerodromeId,
              includeSuggestions: true,
              includePredictions: false,
              includeBlackSwan: false,
            }, {});
            const sgsSuggestion = analysis.suggestions?.find((s: any) => s.domaines.includes('SGS'));
            if (sgsSuggestion) {
              setIaAnalysis({
                message: `Le score C1 (Maturité SGS) est à ${profil.c1}/100. ${sgsSuggestion.description}`,
                priorite: sgsSuggestion.priorite,
              });
            }
          }
        } catch (error) {
          console.error('Erreur IA:', error);
        } finally {
          setIsLoadingIA(false);
        }
      }
    };
    loadIaAnalysis();
  }, [formData.aerodrome_ids, mode, getProfilRisque]);

  useEffect(() => {
    if (mode === 'modification' && enqueteId) {
      const enquete = enquetes?.find(e => e.id === enqueteId);
      if (enquete) {
        let impactValue = (enquete as any).impact_securite || '';
        let impactPersonnalise = '';
        let objectifValue = (enquete as any).objectif_strategique || '';
        let objectifPersonnalise = '';

        if (impactValue && !IMPACT_OPTIONS.some(opt => opt.value === impactValue)) {
          impactPersonnalise = impactValue;
          impactValue = 'personnalise';
        }
        if (objectifValue && !OBJECTIFS_OPTIONS.some(opt => opt.value === objectifValue)) {
          objectifPersonnalise = objectifValue;
          objectifValue = 'personnalise';
        }

        setFormData({
          titre: enquete.titre || '',
          description: enquete.description || '',
          contexte_securite: (enquete as any).contexte_securite || '',
          impact_securite: impactValue,
          impact_securite_personnalise: impactPersonnalise,
          objectif_strategique: objectifValue,
          objectif_strategique_personnalise: objectifPersonnalise,
          criticite: (enquete as any).criticite || 'moyenne',
          type_enquete: enquete.type_enquete || TYPES_ENQUETE[0],
          aerodrome_ids: enquete.aerodrome_ids || [],
          date_debut: (enquete as any).date_debut?.split('T')[0] || '',
          date_fin: enquete.deadline?.split('T')[0] || '',
          statut: enquete.statut || 'brouillon',
        });
      }
    }
  }, [mode, enqueteId, enquetes]);

  const validerFormulaire = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.titre.trim())       newErrors.titre       = "Le titre est requis";
    if (!formData.description.trim()) newErrors.description = "La description est requise";
    if (!formData.date_debut)         newErrors.date_debut  = "La date de début est requise";
    if (!formData.date_fin)           newErrors.date_fin    = "La date de fin est requise";
    if (formData.aerodrome_ids.length === 0) newErrors.aerodrome_ids = "Au moins un aérodrome doit être ciblé";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getImpactValue = () => {
    if (formData.impact_securite === 'personnalise') return formData.impact_securite_personnalise;
    return formData.impact_securite;
  };

  const getObjectifValue = () => {
    if (formData.objectif_strategique === 'personnalise') return formData.objectif_strategique_personnalise;
    return formData.objectif_strategique;
  };

  const getImpactPoids = () => {
    const impact = IMPACT_OPTIONS.find(i => i.value === formData.impact_securite);
    return impact?.poids || 10;
  };

  const calculateImpactScore = () => {
    let score = 50 + getImpactPoids();
    if (formData.criticite === 'haute')    score += 10;
    if (formData.criticite === 'critique') score += 20;
    if (formData.aerodrome_ids.length > 3) score += 5;
    return Math.min(100, score);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validerFormulaire()) return;
    setIsSubmitting(true);
    try {
      const payload = {
        reference: `ENQ-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
        titre: formData.titre,
        description: formData.description,
        contexte_securite: formData.contexte_securite,
        impact_securite: getImpactValue(),
        objectif_strategique: getObjectifValue(),
        criticite: formData.criticite,
        type_enquete: formData.type_enquete,
        aerodrome_ids: formData.aerodrome_ids,
        date_debut: formData.date_debut,
        deadline: formData.date_fin,
        questions: [],
        statut: formData.statut as 'brouillon' | 'active' | 'terminee' | 'archivee',
        created_by: user?.id || '',
      };
      if (mode === 'creation') {
        addEnquete(payload as any);
        addNotification({
          user_id: userId,
          type: 'success',
          title: 'Enquête créée',
          message: `L'enquête "${formData.titre}" a été créée`,
          canal: 'in_app',
        });
      } else if (mode === 'modification' && enqueteId) {
        updateEnquete(enqueteId, payload);
        addNotification({
          user_id: userId,
          type: 'info',
          title: 'Enquête modifiée',
          message: `L'enquête "${formData.titre}" a été mise à jour`,
          canal: 'in_app',
        });
      }
      onSuccess?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">

        {/* Suggestion IA */}
        {showIaSuggestion && iaAnalysis && mode === 'creation' && (
          <div className={`alert ${iaAnalysis.priorite === 'critique' ? 'alert-warning' : 'alert-info'} animate-fade-in`}>
            <Sparkles className="alert-icon w-4 h-4" />
            <div className="alert-content flex-1">
              <div className="alert-title">🤖 Suggestion IA</div>
              <div className="alert-description">{iaAnalysis.message}</div>
            </div>
            <button type="button" onClick={() => setShowIaSuggestion(false)} className="btn btn-ghost btn-sm">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {isLoadingIA && (
          <div className="text-center py-2">
            <div className="spinner spinner-sm inline-block mr-2" />
            <span className="text-xs text-muted-foreground">Analyse du profil de risque...</span>
          </div>
        )}

        {/* SECTION 1 : Informations générales */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />Informations générales
          </p>

          <div className="form-field">
            <label className={labelClass}>Titre <span className="text-danger">*</span></label>
            <input
              type="text"
              value={formData.titre}
              onChange={e => setFormData({ ...formData, titre: e.target.value })}
              placeholder="Ex: Évaluation de la culture SGS 2026"
              className={`form-input w-full ${focusClass}${errors.titre ? ' border-danger' : ''}`}
            />
            {errors.titre && (
              <p className="field-error flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{errors.titre}
              </p>
            )}
          </div>

          <div className="form-field">
            <label className={labelClass}>Description <span className="text-danger">*</span></label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Objectif et contexte de l'enquête..."
              rows={3}
              className={`form-textarea w-full ${focusClass}${errors.description ? ' border-danger' : ''}`}
            />
            {errors.description && (
              <p className="field-error flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{errors.description}
              </p>
            )}
          </div>

          <div className="form-grid grid-cols-2 gap-4">
            <div className="form-field">
              <label className={labelClass}>Type d'enquête</label>
              <select
                value={formData.type_enquete}
                onChange={e => setFormData({ ...formData, type_enquete: e.target.value })}
                className={`form-select w-full ${focusClass}`}
                style={selectStyle}
              >
                {TYPES_ENQUETE.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className={labelClass}>Niveau de criticité</label>
              <div className="flex gap-3">
                {CRITICITE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, criticite: opt.value as any })}
                    className={`flex-1 py-2 px-3 rounded-lg border-2 transition-all ${
                      formData.criticite === opt.value
                        ? `border-${opt.color} bg-${opt.color}/10 text-${opt.color}`
                        : 'border-border hover:border-role-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="form-grid grid-cols-2 gap-4">
            <div className="form-field">
              <label className={labelClass}>Date de début <span className="text-danger">*</span></label>
              <input
                type="date"
                value={formData.date_debut}
                onChange={e => setFormData({ ...formData, date_debut: e.target.value })}
                className={`form-input w-full ${focusClass}${errors.date_debut ? ' border-danger' : ''}`}
              />
              {errors.date_debut && <p className="field-error">{errors.date_debut}</p>}
            </div>
            <div className="form-field">
              <label className={labelClass}>Date de fin <span className="text-danger">*</span></label>
              <input
                type="date"
                value={formData.date_fin}
                onChange={e => setFormData({ ...formData, date_fin: e.target.value })}
                min={formData.date_debut}
                className={`form-input w-full ${focusClass}${errors.date_fin ? ' border-danger' : ''}`}
              />
              {errors.date_fin && <p className="field-error">{errors.date_fin}</p>}
            </div>
          </div>
        </div>

        {/* SECTION 2 : Impact et contexte sécurité */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border flex items-center gap-2">
            <Shield className="w-4 h-4" />Impact et contexte sécurité
          </p>

          <div className="form-field">
            <label className={`${labelClass} flex items-center gap-2`}>
              <Target className="w-3 h-3" />
              Contexte de l'enquête (pourquoi ?)
            </label>
            <textarea
              value={formData.contexte_securite}
              onChange={e => setFormData({ ...formData, contexte_securite: e.target.value })}
              placeholder="Expliquez le contexte et les raisons de cette enquête..."
              rows={2}
              className={`form-textarea w-full ${focusClass}`}
            />
          </div>

          <div className="form-field">
            <label className={`${labelClass} flex items-center gap-2`}>
              <AlertCircle className="w-3 h-3" />
              Impact attendu sur la sécurité
            </label>
            <select
              value={formData.impact_securite}
              onChange={e => setFormData({ ...formData, impact_securite: e.target.value })}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              <option value="">Sélectionner un impact</option>
              {IMPACT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {formData.impact_securite === 'personnalise' && (
              <input
                type="text"
                value={formData.impact_securite_personnalise}
                onChange={e => setFormData({ ...formData, impact_securite_personnalise: e.target.value })}
                placeholder="Saisissez votre impact personnalisé..."
                className={`form-input w-full mt-2 ${focusClass}`}
              />
            )}
          </div>

          <div className="form-field">
            <label className={`${labelClass} flex items-center gap-2`}>
              <TrendingUp className="w-3 h-3" />
              Objectif stratégique
            </label>
            <select
              value={formData.objectif_strategique}
              onChange={e => setFormData({ ...formData, objectif_strategique: e.target.value })}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              <option value="">Sélectionner un objectif stratégique</option>
              {OBJECTIFS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {formData.objectif_strategique === 'personnalise' && (
              <input
                type="text"
                value={formData.objectif_strategique_personnalise}
                onChange={e => setFormData({ ...formData, objectif_strategique_personnalise: e.target.value })}
                placeholder="Saisissez votre objectif personnalisé..."
                className={`form-input w-full mt-2 ${focusClass}`}
              />
            )}
          </div>
        </div>

        {/* SECTION 3 : Aérodromes ciblés */}
        <div className="space-y-4">
          <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border flex items-center gap-2">
            <Users className="w-4 h-4" />Aérodromes ciblés <span className="text-danger">*</span>
          </p>

          <div className="form-field">
            <select
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
              value=""
              onChange={(e) => {
                const value = e.target.value;
                if (value && !formData.aerodrome_ids.includes(value)) {
                  setFormData({ ...formData, aerodrome_ids: [...formData.aerodrome_ids, value] });
                }
              }}
            >
              <option value="">-- Sélectionner un aérodrome --</option>
              {aerodromes?.map(a => {
                const profil = getProfilRisque(a.id);
                return (
                  <option key={a.id} value={a.id}>
                    {a.code_oaci} - {a.nom}
                    {profil && profil.c1 < 50 && ' ⚠️ C1 faible'}
                  </option>
                );
              })}
            </select>

            <div className="flex flex-wrap gap-2 mt-3">
              {formData.aerodrome_ids.map(id => {
                const aerodrome = aerodromes?.find(a => a.id === id);
                const profil = getProfilRisque(id);
                return (
                  <div
                    key={id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
                      profil && profil.c1 < 50 ? 'bg-warning/20' : 'bg-role-primary-soft'
                    }`}
                  >
                    <Plane className="w-3 h-3 text-role-primary" />
                    <span className="text-sm">{aerodrome?.code_oaci} - {aerodrome?.nom}</span>
                    {profil && profil.c1 < 50 && (
                      <span className="text-xs text-warning">⚠️ C1={profil.c1}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        aerodrome_ids: formData.aerodrome_ids.filter(i => i !== id),
                      })}
                      className="text-danger hover:text-danger-800 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>

            {errors.aerodrome_ids && (
              <p className="field-error flex items-center gap-1 mt-2">
                <AlertCircle className="w-3 h-3" />{errors.aerodrome_ids}
              </p>
            )}
          </div>
        </div>

        {/* Impact sur le profil de risque */}
        <div className="bg-primary/10 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-medium">Impact sur le profil de risque (C1 - Maturité SGS)</span>
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-xs mb-1">
              <span>Impact estimé</span>
              <span>{calculateImpactScore()} points</span>
            </div>
            <div className="progress h-1">
              <div className="progress-bar" style={{ width: `${calculateImpactScore()}%` }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Les réponses à cette enquête pourront impacter le score C1 des aérodromes ciblés.
            {formData.criticite === 'haute'    && " La criticité haute amplifie l'impact."}
            {formData.criticite === 'critique' && " La criticité critique amplifie significativement l'impact."}
          </p>
        </div>

        {/* Boutons d'action */}
        <div className="form-actions">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="btn btn-secondary"
          >
            <X className="w-4 h-4 mr-2 inline" />
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="btn btn-primary min-w-[140px]"
          >
            {isSubmitting
              ? <><div className="spinner spinner-sm mr-2 inline-block" />Sauvegarde...</>
              : <><Save className="w-4 h-4 mr-2 inline" />{mode === 'creation' ? "Créer l'enquête" : 'Enregistrer'}</>
            }
          </button>
        </div>

      </div>
    </form>
  );
}
