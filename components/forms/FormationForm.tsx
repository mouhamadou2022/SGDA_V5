// components/forms/FormationForm.tsx
'use client';
// ZÉRO @/components/ui/ import

import React, { useState, useEffect } from 'react';
import {
  GraduationCap, FileText, Upload, X, Calendar, User,
  MapPin, Clock, DollarSign, Save, Trash2, Plus,
  Users, Star, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { formationUtils } from '@/lib/formationUtils';
import { useFormProgress } from '@/hooks/useFormProgress';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

interface FormationFormProps {
  mode: 'creation' | 'modification' | 'evaluation';
  formationId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  userRole: string;
}

const TYPES_FORMATION = [
  { id: 'initiale', label: 'Initiale' },
  { id: 'continue', label: 'Continue' },
  { id: 'specialisee', label: 'Spécialisée' },
  { id: 'recyclage', label: 'Recyclage' },
  { id: 'certification', label: 'Certification' },
];

const DOMAINES_COMPETENCE = [
  { id: 'exploitation', label: 'Exploitation (AGA)' },
  { id: 'sli', label: 'Sauvetage et lutte incendie (SLI)' },
  { id: 'genie_civil', label: 'Génie civil' },
  { id: 'genie_electrique', label: 'Génie électrique' },
  { id: 'risque_animalier', label: 'Risque animalier' },
  { id: 'certification', label: 'Certification' },
  { id: 'homologation', label: 'Homologation' },
];

const STATUTS_FORMATION = [
  { id: 'planifiee', label: 'Planifiée' },
  { id: 'en_cours', label: 'En cours' },
  { id: 'terminee', label: 'Terminée' },
  { id: 'annulee', label: 'Annulée' },
];

const PRESENCE_TABS = [
  { id: 'informations', label: 'Informations', icon: FileText },
  { id: 'participants', label: 'Participants', icon: Users },
];

const getInitials = (prenom: string, nom: string) =>
  `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase();

export function FormationForm({ mode, formationId, onSuccess, onCancel, userRole }: FormationFormProps) {
  const formations = useAppStore(s => s.formations);
  const inspecteurs = useAppStore(s => s.inspecteurs);
  const user = useAppStore(s => s.user);
  const addFormation = useAppStore(s => s.addFormation);
  const updateFormation = useAppStore(s => s.updateFormation);

  const [formData, setFormData] = useState({
    titre: '', type: 'initiale' as string,
    domaines: [] as string[], date: '',
    duree_heures: 0, lieu: '', formateur: '',
    formateur_externe: false, participants: [] as string[],
    objectifs: '', programme: '',
    documents: [] as File[], budget: 0,
    statut: 'planifiee' as string,
  });

  const [presence, setPresence] = useState<Record<string, 'present' | 'absent' | 'excusé'>>({});
  const [evaluations, setEvaluations] = useState<Record<string, number>>({});
  const [existingDocuments, setExistingDocuments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('informations');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if ((mode === 'modification' || mode === 'evaluation') && formationId) {
      const formation = formations?.find(f => f.id === formationId);
      if (formation) {
        setFormData({
          titre: formation.titre || '', type: formation.type || 'initiale',
          domaines: formation.domaines || [], date: formation.date?.split('T')[0] || '',
          duree_heures: formation.duree_heures || 0, lieu: formation.lieu || '',
          formateur: formation.formateur || '', formateur_externe: formation.formateur_externe || false,
          participants: formation.participants || [], objectifs: formation.objectifs || '',
          programme: formation.programme || '', documents: [], budget: formation.budget || 0,
          statut: formation.statut || 'planifiee',
        });
        setPresence(formation.presence || {});
        setEvaluations(formation.evaluation || {});
        setExistingDocuments(formation.documents || []);
      }
    }
  }, [mode, formationId, formations]);

  const validerFormulaire = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.titre.trim()) newErrors.titre = "Le titre est requis";
    if (!formData.date) newErrors.date = "La date est requise";
    if (formData.duree_heures <= 0) newErrors.duree_heures = "La durée doit être supérieure à 0";
    if (!formData.lieu.trim()) newErrors.lieu = "Le lieu est requis";
    if (!formData.formateur.trim()) newErrors.formateur = "Le formateur est requis";
    if (formData.domaines.length === 0) newErrors.domaines = "Au moins un domaine est requis";
    if (formData.participants.length === 0) newErrors.participants = "Au moins un participant est requis";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(f => f.size <= 10 * 1024 * 1024);
      const invalidFiles = newFiles.filter(f => f.size > 10 * 1024 * 1024);
      if (invalidFiles.length > 0) alert(`${invalidFiles.length} fichier(s) dépassent la taille maximale de 10 Mo`);
      setFormData({ ...formData, documents: [...formData.documents, ...validFiles] });
    }
  };

  const removeDocument = (index: number) => setFormData({ ...formData, documents: formData.documents.filter((_, i) => i !== index) });
  const removeExistingDocument = (index: number) => setExistingDocuments(existingDocuments.filter((_, i) => i !== index));

  const progress = useFormProgress(formData as Record<string, unknown>, [
    'titre', 'date', 'duree_heures', 'lieu', 'formateur', 'domaines', 'participants',
  ])

  const getProgressionInscription = () => {
    if (formData.participants.length === 0) return 0;
    return Math.min(100, (formData.participants.length / 20) * 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validerFormulaire()) { setActiveTab('informations'); return; }
    setIsSubmitting(true);
    try {
      const uploadedDocs = await Promise.all(
        formData.documents.map(async file => ({
          nom: file.name, url: URL.createObjectURL(file), taille: file.size, type: file.type,
        }))
      );
      const tousDocuments = [...existingDocuments, ...uploadedDocs];

      const tauxPresence = formData.participants.length > 0
        ? (Object.values(presence).filter(v => v === 'present').length / formData.participants.length) * 100 : 0;
      const noteMoyenne = Object.values(evaluations).length > 0
        ? Object.values(evaluations).reduce((a, b) => a + b, 0) / Object.values(evaluations).length : 0;

      const formationData = {
        titre: formData.titre, type: formData.type, domaines: formData.domaines,
        date: formData.date, duree_heures: formData.duree_heures, lieu: formData.lieu,
        formateur: formData.formateur, formateur_externe: formData.formateur_externe,
        participants: formData.participants, objectifs: formData.objectifs,
        programme: formData.programme, documents: tousDocuments,
        budget: formData.budget, statut: formData.statut,
        presence, evaluation: evaluations,
        taux_presence: Math.round(tauxPresence),
        note_moyenne: Math.round(noteMoyenne * 10) / 10,
        updated_at: new Date().toISOString(),
      };

      if (mode === 'creation') {
        const reference = formationUtils.genererReference(new Date().getFullYear(), (formations?.length || 0) + 1);
        await addFormation({ ...formationData, reference, created_at: new Date().toISOString(), created_by: user?.id || '' } as any);
      } else {
        await updateFormation(formationId!, formationData as any);
      }
      onSuccess?.();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Une erreur est survenue lors de la sauvegarde');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs = [
    { id: 'informations', label: 'Informations', icon: FileText },
    { id: 'participants', label: 'Participants', icon: Users },
    ...(mode === 'evaluation' ? [{ id: 'evaluation', label: 'Évaluation', icon: Star }] : []),
  ];

  return (
    <div className="form-container animate-fade-up" data-role={userRole} data-module="formation-form">
      <form onSubmit={handleSubmit}>
        {/* Barre de progression */}
        <div className="form-shell-progress-track mb-5" style={{ borderRadius: '0.5rem' }}>
          <div className="form-shell-progress-fill" style={{ width: `${progress}%` }} />
          <span className="form-shell-progress-label">
            {progress < 100 ? `Complétion ${progress}%` : '✓ Formulaire complet'}
          </span>
        </div>
        {/* En-tête */}
        <div className="flex items-center gap-3 mb-6 p-4 bg-role-primary-soft rounded-lg border-l-4 border-l-role-primary">
          <div className="p-2 bg-role-gradient rounded-lg">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="heading-4 text-xl font-semibold">
              {mode === 'creation' ? 'Nouvelle formation' :
               mode === 'evaluation' ? 'Évaluation de la formation' : 'Modifier la formation'}
            </h2>
            <p className="text-small text-muted-foreground">
              {mode === 'evaluation' ? 'Saisissez les présences et évaluations' : 'Renseignez les détails de la formation'}
            </p>
          </div>
          {mode === 'evaluation' && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-success animate-pulse">Évaluation en cours</span>
          )}
        </div>

        {/* Tabs */}
        <div className="tabs mb-6">
          {tabs.map(tab => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={`tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <TabIcon className="w-4 h-4 mr-2 inline" />{tab.label}
              </button>
            );
          })}
        </div>

        {/* Onglet Informations */}
        <div className={activeTab === 'informations' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <div className="card border-l-4 border-l-role-primary rounded-l-xl">
            <div className="card-header"><h3 className="card-title text-base">Détails de la formation</h3></div>
            <div className="card-content space-y-4">
              <div className="form-field">
                <label className={labelClass}>Titre de la formation <span className="text-danger">*</span></label>
                <input
                  type="text"
                  value={formData.titre}
                  onChange={e => setFormData({ ...formData, titre: e.target.value })}
                  placeholder="Ex: Formation SLI - Niveau 1"
                  disabled={mode === 'evaluation'}
                  className={`form-input ${focusClass}${errors.titre ? ' border-danger' : ''}`}
                />
                {errors.titre && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.titre}</p>}
              </div>

              <div className="form-grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-field">
                  <label className={labelClass}>Type *</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    disabled={mode === 'evaluation'}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    {TYPES_FORMATION.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label className={labelClass}>Statut</label>
                  <select
                    value={formData.statut}
                    onChange={e => setFormData({ ...formData, statut: e.target.value })}
                    disabled={mode === 'evaluation'}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    {STATUTS_FORMATION.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-field">
                <label className={labelClass}>Domaines de compétence <span className="text-danger">*</span></label>
                <div className="grid grid-cols-2 gap-2 p-3 border border-border rounded-lg max-h-40 overflow-y-auto">
                  {DOMAINES_COMPETENCE.map(d => (
                    <label key={d.id} className="flex items-center gap-2 p-1 hover:bg-role-primary-soft rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.domaines.includes(d.id)}
                        disabled={mode === 'evaluation'}
                        onChange={e => {
                          setFormData({
                            ...formData,
                            domaines: e.target.checked
                              ? [...formData.domaines, d.id]
                              : formData.domaines.filter(id => id !== d.id)
                          });
                        }}
                        className="form-checkbox"
                      />
                      <span className="text-small">{d.label}</span>
                    </label>
                  ))}
                </div>
                {errors.domaines && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.domaines}</p>}
              </div>

              <div className="form-grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-field">
                  <label className={labelClass}>
                    <Calendar className="w-4 h-4" />Date <span className="text-danger">*</span>
                  </label>
                  <input type="date" value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    disabled={mode === 'evaluation'}
                    className={`form-input ${focusClass}${errors.date ? ' border-danger' : ''}`}
                  />
                  {errors.date && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.date}</p>}
                </div>
                <div className="form-field">
                  <label className={labelClass}>
                    <Clock className="w-4 h-4" />Durée (heures) <span className="text-danger">*</span>
                  </label>
                  <input type="number" min="1" value={formData.duree_heures}
                    onChange={e => setFormData({ ...formData, duree_heures: parseInt(e.target.value) })}
                    disabled={mode === 'evaluation'}
                    className={`form-input ${focusClass}${errors.duree_heures ? ' border-danger' : ''}`}
                  />
                  {errors.duree_heures && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.duree_heures}</p>}
                </div>
              </div>

              <div className="form-grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-field">
                  <label className={labelClass}>
                    <MapPin className="w-4 h-4" />Lieu <span className="text-danger">*</span>
                  </label>
                  <input type="text" value={formData.lieu}
                    onChange={e => setFormData({ ...formData, lieu: e.target.value })}
                    placeholder="Dakar, Thiès, etc."
                    disabled={mode === 'evaluation'}
                    className={`form-input ${focusClass}${errors.lieu ? ' border-danger' : ''}`}
                  />
                  {errors.lieu && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.lieu}</p>}
                </div>
                <div className="form-field">
                  <label className={labelClass}>
                    <DollarSign className="w-4 h-4" />Budget (FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.budget || ''}
                    onChange={e => setFormData({ ...formData, budget: parseInt(e.target.value) })}
                    disabled={mode === 'evaluation'}
                    className={`form-input ${focusClass}`}
                  />
                </div>
              </div>

              {/* Documents */}
              <div className="card border-l-4 border-l-role-primary rounded-l-xl bg-role-primary-soft">
                <div className="card-header"><h4 className="card-title text-sm">Documents de la formation</h4></div>
                <div className="card-content space-y-4">
                  {existingDocuments.length > 0 && (
                    <div className="space-y-2">
                      <p className={labelClass}>Documents déjà joints</p>
                      {existingDocuments.map((doc, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-background rounded-lg">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-role-primary" />
                            <div>
                              <p className="font-medium text-small">{doc.nom}</p>
                              <p className="text-xs text-muted-foreground">
                                {doc.date_upload ? new Date(doc.date_upload).toLocaleDateString('fr-FR') : 'Date inconnue'}
                              </p>
                            </div>
                          </div>
                          {mode !== 'evaluation' && (
                            <button type="button" onClick={() => removeExistingDocument(idx)} className="btn btn-ghost btn-sm text-danger">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {mode !== 'evaluation' && (
                    <>
                      <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-role-primary transition-colors">
                        <input type="file" multiple onChange={handleFileUpload} className="hidden"
                          id="formation-docs" accept=".pdf,.doc,.docx,.ppt,.pptx" />
                        <label htmlFor="formation-docs" className="cursor-pointer flex flex-col items-center gap-2">
                          <Upload className="w-8 h-8 text-muted-foreground" />
                          <span className="text-small font-medium">Ajouter des documents</span>
                          <span className="text-xs text-muted-foreground">Supports de cours, programme, attestations...</span>
                        </label>
                      </div>
                      {formData.documents.length > 0 && (
                        <div className="space-y-2">
                          <p className={labelClass}>Nouveaux documents</p>
                          {formData.documents.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg">
                              <div className="flex items-center gap-3">
                                <FileText className="w-5 h-5 text-role-primary" />
                                <div>
                                  <p className="font-medium text-small">{file.name}</p>
                                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} Ko</p>
                                </div>
                              </div>
                              <button type="button" onClick={() => removeDocument(idx)} className="btn btn-ghost btn-sm text-danger">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Onglet Participants */}
        <div className={activeTab === 'participants' ? 'space-y-4 animate-fade-in' : 'hidden'}>
          <div className="card">
            <div className="card-header">
              <div className="flex items-center justify-between w-full">
                <h3 className="card-title text-base">Liste des participants</h3>
                {formData.participants.length > 0 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-primary">{formData.participants.length} inscrit(s)</span>
                )}
              </div>
            </div>
            <div className="card-content space-y-4">
              {/* Barre de progression inscription */}
              <div className="space-y-2">
                <div className="flex justify-between text-small">
                  <span className="text-muted-foreground">Taux d'inscription</span>
                  <span className="font-medium">{Math.round(getProgressionInscription())}%</span>
                </div>
                <div className="progress h-2">
                  <div className="progress-bar" style={{ width: `${getProgressionInscription()}%` }} />
                </div>
              </div>

              {mode !== 'evaluation' ? (
                /* Mode sélection */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto border border-border rounded-lg p-3">
                  {inspecteurs?.map(ins => (
                    <label key={ins.id} className="flex items-center gap-3 p-2 hover:bg-role-primary-soft rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.participants.includes(ins.id)}
                        onChange={e => {
                          setFormData({
                            ...formData,
                            participants: e.target.checked
                              ? [...formData.participants, ins.id]
                              : formData.participants.filter(id => id !== ins.id)
                          });
                        }}
                        className="form-checkbox"
                      />
                      <span className="w-8 h-8 rounded-full bg-role-gradient flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {getInitials(ins.prenom, ins.nom)}
                      </span>
                      <div>
                        <p className="text-small font-medium">{ins.prenom} {ins.nom}</p>
                        <p className="text-xs text-muted-foreground">{ins.matricule}</p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                /* Mode évaluation - présence */
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>Présence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.participants.map(pId => {
                        const inspecteur = inspecteurs?.find(i => i.id === pId);
                        if (!inspecteur) return null;
                        return (
                          <tr key={pId}>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-role-gradient flex items-center justify-center text-white text-xs font-bold">
                                  {getInitials(inspecteur.prenom, inspecteur.nom)}
                                </span>
                                <div>
                                  <p className="font-medium text-small">{inspecteur.prenom} {inspecteur.nom}</p>
                                  <p className="text-xs text-muted-foreground">{inspecteur.matricule}</p>
                                </div>
                              </div>
                            </td>
                            <td>
                              <select
                                value={presence[pId] || 'absent'}
                                onChange={e => setPresence(prev => ({ ...prev, [pId]: e.target.value as any }))}
                                className={`form-select text-sm w-[130px] ${focusClass}`}
                                style={selectStyle}
                              >
                                <option value="present">Présent</option>
                                <option value="absent">Absent</option>
                                <option value="excusé">Excusé</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {errors.participants && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.participants}</p>}
            </div>
          </div>
        </div>

        {/* Onglet Évaluation */}
        {mode === 'evaluation' && (
          <div className={activeTab === 'evaluation' ? 'space-y-4 animate-fade-in' : 'hidden'}>
            <div className="card">
              <div className="card-header"><h3 className="card-title text-base">Évaluation post-formation</h3></div>
              <div className="card-content">
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Participant</th>
                        <th>Présence</th>
                        <th>Note /5</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.participants.map(pId => {
                        const inspecteur = inspecteurs?.find(i => i.id === pId);
                        const estPresent = presence[pId] === 'present';
                        if (!inspecteur) return null;
                        return (
                          <tr key={pId}>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className="w-8 h-8 rounded-full bg-role-gradient flex items-center justify-center text-white text-xs font-bold">
                                  {getInitials(inspecteur.prenom, inspecteur.nom)}
                                </span>
                                <div>
                                  <p className="font-medium text-small">{inspecteur.prenom} {inspecteur.nom}</p>
                                  <p className="text-xs text-muted-foreground">{inspecteur.matricule}</p>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white ${estPresent ? 'bg-success' : 'bg-danger'}`}>
                                {estPresent ? 'Présent' : (presence[pId] || 'Absent')}
                              </span>
                            </td>
                            <td>
                              {estPresent ? (
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map(val => (
                                    <button
                                      key={val}
                                      type="button"
                                      onClick={() => setEvaluations(prev => ({ ...prev, [pId]: val }))}
                                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                        evaluations[pId] === val
                                          ? 'bg-role-gradient text-white scale-110 shadow-lg'
                                          : 'bg-background border border-border hover:border-role-primary'
                                      }`}
                                    >
                                      {val}
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-small">Non applicable</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {Object.values(evaluations).length > 0 && (
                  <div className="mt-6 p-4 bg-success/10 rounded-lg">
                    <h4 className="font-medium text-small mb-2 flex items-center gap-2">
                      <Star className="w-4 h-4 fill-warning text-warning" />
                      Résultats de l'évaluation
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-small text-muted-foreground">Note moyenne</p>
                        <p className="text-2xl font-bold text-role-primary">
                          {(Object.values(evaluations).reduce((a, b) => a + b, 0) / Object.values(evaluations).length).toFixed(1)}/5
                        </p>
                      </div>
                      <div>
                        <p className="text-small text-muted-foreground">Participants évalués</p>
                        <p className="text-2xl font-bold text-role-primary">{Object.values(evaluations).length}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <hr className="border-border my-4" />

        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary gap-2">
            <X className="w-4 h-4" />Annuler
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary min-w-[140px] gap-2">
            {isSubmitting
              ? <><div className="spinner spinner-sm mr-2 inline-block" />Sauvegarde...</>
              : <><Save className="w-4 h-4 inline mr-2" />
                {mode === 'creation' ? 'Créer la formation' :
                 mode === 'evaluation' ? "Enregistrer l'évaluation" : 'Enregistrer'}
              </>
            }
          </button>
        </div>
      </form>
    </div>
  );
}
