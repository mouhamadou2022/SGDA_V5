// components/modules/exemptions/ExemptionManager.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield,
  X,
  Plus,
  Trash2,
  Edit3,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileText,
  Calendar,
  User,
  Download,
  Save,
  TrendingUp,
  Sliders,
  AlertTriangle,
  RefreshCw,
  Upload,
  Send,
  XCircle,
  Loader2,
  Search,
  Lightbulb,
  List,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

interface ExemptionManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string;
  parentType: 'certification' | 'homologation';
  parentReference: string;
  aerodromeId: string;
  userRole: string;
}

interface Mesure {
  id: string;
  description: string;
  responsable: string;
  date_debut: string;
  date_fin_prevue: string;
  date_fin_reelle?: string;
  statut: 'a_venir' | 'en_cours' | 'realisee' | 'en_retard' | 'abandonnee';
  commentaires?: string;
  preuves?: { id: string; nom: string; url: string; date: string }[];
  declencher_inspection_si_retard: boolean;
  inspection_declenchee?: boolean;
  inspection_id?: string;
  // Pour apprentissage
  efficacite_suggeree?: number;
  efficacite_validee?: number;
  dernier_evenement_surveillance_id?: string;
  dernier_resultat_mise_oeuvre?: 'SA' | 'NS' | 'NV';
}

interface Exemption {
  id: string;
  reference: string;
  parent_id: string;
  parent_type: string;
  aerodrome_id: string;
  date_demande: string;
  description: string;
  etude_securite_url?: string;
  mesures: Mesure[];
  decision: 'acceptee' | 'refusee';
  numero_arrete?: string;
  date_arrete?: string;
  duree_mois: number;
  date_debut: string;
  date_fin: string;
  statut: 'active' | 'expiree' | 'cloturee' | 'revoquee';
  domaines_concerne?: string[];
  created_at: string;
  updated_at: string;
}

export function ExemptionManager({ open, onOpenChange, parentId, parentType, parentReference, aerodromeId, userRole }: ExemptionManagerProps) {
  const aerodromes = useAppStore(s => s.aerodromes)
  const addExemption = useAppStore(s => s.addExemption)
  const updateExemption = useAppStore(s => s.updateExemption)
  const deleteExemption = useAppStore(s => s.deleteExemption)
  const addNotification = useAppStore(s => s.addNotification)
  const user = useAppStore(s => s.user)
  const getExemptionsByAerodrome = useAppStore(s => s.getExemptionsByAerodrome)
  const updateMesureAtténuation = useAppStore(s => s.updateMesureAtténuation);
  
  const [exemptions, setExemptions] = useState<Exemption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingExemption, setEditingExemption] = useState<Exemption | null>(null);
  const [mounted, setMounted] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'list' | 'form'>('list');
  const [loading, setLoading] = useState(true);

  // Formulaire
  const [formData, setFormData] = useState({
    reference: '',
    description: '',
    etude_securite_url: '',
    duree_mois: 6,
    date_debut: new Date().toISOString().slice(0, 10),
    date_fin: new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString().slice(0, 10),
    numero_arrete: '',
    date_arrete: new Date().toISOString().slice(0, 10),
    decision: 'acceptee' as 'acceptee' | 'refusee',
    domaines_concerne: [] as string[],
  });

  const [mesures, setMesures] = useState<Mesure[]>([]);
  const [currentMesure, setCurrentMesure] = useState<Partial<Mesure>>({});
  const [showMesureForm, setShowMesureForm] = useState(false);
  const [efficaciteSliderOpen, setEfficaciteSliderOpen] = useState<string | null>(null);
  const [efficaciteTemp, setEfficaciteTemp] = useState<number>(70);

  useEffect(() => setMounted(true), []);

  // Charger les exemptions depuis le store
  useEffect(() => {
    if (open && getExemptionsByAerodrome) {
      setLoading(true);
      try {
        const allExemptions = getExemptionsByAerodrome(aerodromeId) || [];
        const filtered = allExemptions.filter((e: any) => e.parent_id === parentId && e.parent_type === parentType);
        setExemptions(filtered as Exemption[]);
      } catch (e) {
        console.error('Erreur chargement exemptions', e);
      } finally {
        setLoading(false);
      }
    }
  }, [open, aerodromeId, parentId, parentType, getExemptionsByAerodrome]);

  const aerodrome = aerodromes?.find(a => a.id === aerodromeId);

  const resetForm = () => {
    setFormData({
      reference: '',
      description: '',
      etude_securite_url: '',
      duree_mois: 6,
      date_debut: new Date().toISOString().slice(0, 10),
      date_fin: new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString().slice(0, 10),
      numero_arrete: '',
      date_arrete: new Date().toISOString().slice(0, 10),
      decision: 'acceptee',
      domaines_concerne: [],
    });
    setMesures([]);
    setCurrentMesure({});
    setShowMesureForm(false);
  };

  const handleAddMesure = () => {
    if (!currentMesure.description) return;
    const newMesure: Mesure = {
      id: `mesure_${Date.now()}`,
      description: currentMesure.description,
      responsable: currentMesure.responsable || 'Non assigné',
      date_debut: currentMesure.date_debut || new Date().toISOString().slice(0, 10),
      date_fin_prevue: currentMesure.date_fin_prevue || new Date().toISOString().slice(0, 10),
      statut: 'a_venir',
      commentaires: currentMesure.commentaires || '',
      preuves: [],
      declencher_inspection_si_retard: currentMesure.declencher_inspection_si_retard || false,
      efficacite_suggeree: 70,
    };
    setMesures([...mesures, newMesure]);
    setCurrentMesure({});
    setShowMesureForm(false);
  };

  const handleRemoveMesure = (id: string) => {
    setMesures(mesures.filter(m => m.id !== id));
  };

  const handleUpdateMesureStatut = (mesureId: string, newStatut: Mesure['statut']) => {
    setMesures(mesures.map(m => 
      m.id === mesureId ? { ...m, statut: newStatut } : m
    ));
  };

  const handleUpdateMesureEfficacite = (mesureId: string, efficacite: number) => {
    setMesures(mesures.map(m => 
      m.id === mesureId ? { ...m, efficacite_validee: efficacite } : m
    ));
    setEfficaciteSliderOpen(null);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Efficacité mise à jour',
      message: `Efficacité de la mesure mise à jour: ${efficacite}%`,
      canal: 'in_app',
    });
  };

  const handleSubmitExemption = () => {
    if (!formData.description) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Champ requis',
        message: 'La description de l\'exemption est requise',
        canal: 'in_app',
      });
      return;
    }

    const newExemption: Exemption = {
      id: editingExemption?.id || `ex_${Date.now()}`,
      reference: formData.reference || `EX-${new Date().getFullYear()}-${exemptions.length + 1}`,
      parent_id: parentId,
      parent_type: parentType,
      aerodrome_id: aerodromeId,
      date_demande: new Date().toISOString().slice(0, 10),
      description: formData.description,
      etude_securite_url: formData.etude_securite_url,
      mesures: mesures,
      decision: formData.decision,
      numero_arrete: formData.numero_arrete,
      date_arrete: formData.date_arrete,
      duree_mois: formData.duree_mois,
      date_debut: formData.date_debut,
      date_fin: formData.date_fin,
      statut: 'active',
      domaines_concerne: formData.domaines_concerne,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (editingExemption) {
      updateExemption(newExemption.id, newExemption as any);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Exemption mise à jour',
        message: `L'exemption ${newExemption.reference} a été mise à jour.`,
        canal: 'in_app',
      });
    } else {
      addExemption(newExemption as any);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Exemption créée',
        message: `L'exemption ${newExemption.reference} a été créée avec succès.`,
        canal: 'in_app',
      });
    }

    // Rafraîchir la liste
    const allExemptions = getExemptionsByAerodrome?.(aerodromeId) || [];
    const filtered = allExemptions.filter((e: any) => e.parent_id === parentId && e.parent_type === parentType);
    setExemptions(filtered as unknown as Exemption[]);

    resetForm();
    setShowForm(false);
    setEditingExemption(null);
    setSelectedTab('list');
  };

  const handleEditExemption = (exemption: Exemption) => {
    setEditingExemption(exemption);
    setFormData({
      reference: exemption.reference,
      description: exemption.description,
      etude_securite_url: exemption.etude_securite_url || '',
      duree_mois: exemption.duree_mois,
      date_debut: exemption.date_debut,
      date_fin: exemption.date_fin,
      numero_arrete: exemption.numero_arrete || '',
      date_arrete: exemption.date_arrete || '',
      decision: exemption.decision,
      domaines_concerne: exemption.domaines_concerne || [],
    });
    setMesures(exemption.mesures || []);
    setShowForm(true);
    setSelectedTab('form');
  };

  const handleDeleteExemption = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette exemption ?')) {
      deleteExemption(id);
      setExemptions(exemptions.filter(e => e.id !== id));
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Exemption supprimée',
        message: `L'exemption a été supprimée.`,
        canal: 'in_app',
      });
    }
  };

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'active': return <span className="badge warning">Active</span>;
      case 'expiree': return <span className="badge danger">Expirée</span>;
      case 'cloturee': return <span className="badge danger">Clôturée</span>;
      case 'revoquee': return <span className="badge danger">Révoquée</span>;
      default: return <span className="badge neutral">{statut}</span>;
    }
  };

  const getWorkflowBadge = (ws?: string) => {
    switch (ws) {
      case 'en_attente': return <span className="badge warning pulse">En attente</span>;
      case 'accuse': return <span className="badge primary">Accusé réception</span>;
      case 'en_cours': return <span className="badge primary pulse">En instruction</span>;
      default: return null;
    }
  };

  const getAvisBadge = (avis?: string) => {
    switch (avis) {
      case 'favorable': return <span className="badge success">Favorable</span>;
      case 'a_reviser': return <span className="badge warning">À réviser</span>;
      case 'defavorable': return <span className="badge danger">Défavorable</span>;
      default: return null;
    }
  };

  const [expandedExemption, setExpandedExemption] = useState<string | null>(null);
  const [instructComment, setInstructComment] = useState('');
  const [instructFiles, setInstructFiles] = useState<{ nom: string; url: string }[]>([]);
  const [isDeciding, setIsDeciding] = useState(false);

  const getMesureStatutBadge = (statut: string) => {
    switch (statut) {
      case 'realisee': return <span className="badge success">Réalisée</span>;
      case 'en_cours': return <span className="badge primary pulse">En cours</span>;
      case 'en_retard': return <span className="badge danger pulse">En retard</span>;
      case 'abandonnee': return <span className="badge danger">Abandonnée</span>;
      default: return <span className="badge neutral">À venir</span>;
    }
  };

  const getMesureStatutIcon = (statut: string) => {
    switch (statut) {
      case 'realisee': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'en_cours': return <Clock className="h-4 w-4 text-primary" />;
      case 'en_retard': return <AlertCircle className="h-4 w-4 text-danger" />;
      default: return <Clock className="h-4 w-4 text-muted" />;
    }
  };

  const getProgressionPourcentage = (mesure: Mesure): number => {
    switch (mesure.statut) {
      case 'realisee': return 100;
      case 'en_cours': return 50;
      case 'en_retard': return 25;
      case 'abandonnee': return 0;
      default: return 0;
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  // Domaines d'exemption disponibles
  const domainesOptions = [
    { value: 'SGS', label: 'SGS - Système de Gestion de la Sécurité' },
    { value: 'PHY', label: 'PHY - Caractéristiques physiques' },
    { value: 'OPS', label: 'OPS - Procédures opérationnelles' },
    { value: 'SLI', label: 'SLI - Sauvetage et Lutte Incendie' },
    { value: 'AGA', label: 'AGA - Aérodrome' },
    { value: 'ELEC', label: 'ELEC - Réseaux électriques' },
  ];

  if (!mounted || !open) return null;

  return createPortal(
    <div className="modal-overlay" data-role={userRole} onClick={() => onOpenChange(false)}>
      <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          
          {/* Header */}
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title flex items-center gap-2">
              <Shield className="h-5 w-5 text-role-primary" />
              Gestion des exemptions - {parentReference}
            </div>
            <button className="modal-close" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="modal-body">
            <p className="text-muted text-sm mb-4">
              Aérodrome: {aerodrome?.nom} ({aerodrome?.code_oaci})
            </p>

            {/* Tabs */}
            <div className="tabs mb-4">
              <button
                className={`tab gap-2 ${selectedTab === 'list' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTab('list');
                  setShowForm(false);
                  setEditingExemption(null);
                  resetForm();
                }}
              >
                <List className="w-4 h-4" />Liste des exemptions
              </button>
              <button
                className={`tab gap-2 ${selectedTab === 'form' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTab('form');
                  setShowForm(true);
                }}
              >
                {editingExemption ? <Edit3 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editingExemption ? "Modifier l'exemption" : 'Nouvelle exemption'}
              </button>
            </div>

            {/* Liste des exemptions */}
            {selectedTab === 'list' && !showForm && (
              <div className="space-y-4">
                {loading && (
                  <div className="text-center py-8 text-muted-foreground">
                    <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin opacity-50" />
                    <p>Chargement des exemptions...</p>
                  </div>
                )}

                {!loading && exemptions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Aucune exemption pour ce dossier</p>
                    <button
                      onClick={() => {
                        setEditingExemption(null);
                        resetForm();
                        setShowForm(true);
                        setSelectedTab('form');
                      }}
                      className="btn btn-primary mt-4 gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Demander une exemption
                    </button>
                  </div>
                )}

                {!loading && exemptions.map(ex => (
                  <div key={ex.id} className="card border-border">
                    <div className="card-header flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-role-primary" />
                        <span className="font-mono font-semibold">{ex.reference}</span>
                        {getStatutBadge(ex.statut)}
                        {ex.domaines_concerne && ex.domaines_concerne.length > 0 && (
                          <span className="badge neutral text-[10px]">
                            {ex.domaines_concerne.join(', ')}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button className="action-button" onClick={() => handleEditExemption(ex)} title="Modifier">
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button className="action-button hover:text-danger" onClick={() => handleDeleteExemption(ex.id)} title="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="card-content space-y-3">
                      <p className="text-sm">{ex.description}</p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Date demande</p>
                          <p>{formatDate(ex.date_demande)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Date début</p>
                          <p>{formatDate(ex.date_debut)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Date fin</p>
                          <p>{formatDate(ex.date_fin)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Durée</p>
                          <p>{ex.duree_mois} mois</p>
                        </div>
                      </div>

                      {ex.numero_arrete && (
                        <div className="flex items-center gap-2 text-sm">
                          <FileText className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Arrêté:</span>
                          <span className="font-mono text-xs">{ex.numero_arrete}</span>
                          <span className="text-muted-foreground">du {formatDate(ex.date_arrete)}</span>
                        </div>
                      )}

                      {ex.etude_securite_url && (
                        <a href={ex.etude_securite_url} target="_blank" rel="noopener noreferrer" className="text-role-primary text-sm hover:underline flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Étude de sécurité jointe
                        </a>
                      )}

                      {/* Mesures d'atténuation */}
                      {ex.mesures.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-sm font-semibold mb-2">Mesures d'atténuation</p>
                          <div className="space-y-2">
                            {ex.mesures.map(mesure => {
                              const progression = getProgressionPourcentage(mesure);
                              return (
                                <div key={mesure.id} className={`border rounded-lg p-3 ${mesure.statut === 'en_retard' ? 'border-danger bg-danger-soft/10' : 'border-border'}`}>
                                  <div className="flex items-start justify-between flex-wrap gap-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        {getMesureStatutIcon(mesure.statut)}
                                        <span className="font-medium text-sm">{mesure.description}</span>
                                      </div>
                                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                                        <span>Responsable: {mesure.responsable}</span>
                                        <span>Début: {formatDate(mesure.date_debut)}</span>
                                        <span>Fin prévue: {formatDate(mesure.date_fin_prevue)}</span>
                                        {mesure.date_fin_reelle && (
                                          <span className="text-success">Réalisée le {formatDate(mesure.date_fin_reelle)}</span>
                                        )}
                                      </div>
                                      
                                      {/* Barre de progression */}
                                      <div className="mt-2">
                                        <div className="flex items-center justify-between text-xs mb-1">
                                          <span className="text-muted-foreground">Progression</span>
                                          <span className="text-foreground">{progression}%</span>
                                        </div>
                                        <div className="progress h-1.5">
                                          <div className={`progress-bar ${progression === 100 ? 'progress-moyen' : progression >= 50 ? 'progress-eleve' : 'progress-critique'}`} style={{ width: `${progression}%` }} />
                                        </div>
                                      </div>

                                      {/* Efficacité validée */}
                                      {mesure.efficacite_validee !== undefined && (
                                        <div className="mt-2 flex items-center gap-2 text-xs">
                                          <TrendingUp className="w-3 h-3 text-success" />
                                          <span className="text-success">Efficacité validée: {mesure.efficacite_validee}%</span>
                                        </div>
                                      )}

                                      {/* Alerte si en retard */}
                                      {mesure.statut === 'en_retard' && mesure.declencher_inspection_si_retard && !mesure.inspection_declenchee && (
                                        <div className="mt-2 flex items-center gap-2 text-xs text-danger">
                                          <AlertTriangle className="w-3 h-3" />
                                          <span>Une inspection devrait être déclenchée</span>
                                        </div>
                                      )}
                                    </div>
                                    {getMesureStatutBadge(mesure.statut)}
                                  </div>

                                  {/* Actions sur la mesure (si en mode édition) */}
                                  {editingExemption && (
                                    <div className="mt-3 flex gap-2">
                                      <select
                                        value={mesure.statut}
                                        onChange={(e) => handleUpdateMesureStatut(mesure.id, e.target.value as Mesure['statut'])}
                                        className="form-select text-xs h-8 px-2 py-0"
                                        style={selectStyle}
                                      >
                                        <option value="a_venir">À venir</option>
                                        <option value="en_cours">En cours</option>
                                        <option value="realisee">Réalisée</option>
                                        <option value="en_retard">En retard</option>
                                        <option value="abandonnee">Abandonnée</option>
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEfficaciteSliderOpen(mesure.id);
                                          setEfficaciteTemp(mesure.efficacite_validee || mesure.efficacite_suggeree || 70);
                                        }}
                                        className="action-button"
                                        title="Évaluer l'efficacité"
                                      >
                                        <TrendingUp className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        className="action-button hover:text-danger"
                                        onClick={() => handleRemoveMesure(mesure.id)}
                                        title="Supprimer"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}

                                  {/* Slider d'efficacité */}
                                  {efficaciteSliderOpen === mesure.id && (
                                    <div className="mt-3 p-3 bg-role-primary-soft rounded-lg border border-role-primary-light">
                                      <p className="text-xs font-medium mb-2">Évaluer l'efficacité de la mesure</p>
                                      <div className="flex items-center gap-3">
                                        <input
                                          type="range"
                                          min="0"
                                          max="100"
                                          step="5"
                                          value={efficaciteTemp}
                                          onChange={(e) => setEfficaciteTemp(parseInt(e.target.value))}
                                          className="flex-1 accent-role-primary"
                                        />
                                        <span className="text-sm font-semibold w-12 text-center">{efficaciteTemp}%</span>
                                      </div>
                                      <div className="flex justify-end gap-2 mt-2">
                                        <button
                                          type="button"
                                          className="btn btn-secondary btn-sm gap-1"
                                          onClick={() => setEfficaciteSliderOpen(null)}
                                        >
                                          <X className="w-3 h-3" />Annuler
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-primary btn-sm gap-1"
                                          onClick={() => handleUpdateMesureEfficacite(mesure.id, efficaciteTemp)}
                                        >
                                          <CheckCircle2 className="w-3 h-3" />Valider
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                      {/* Workflow instructeur */}
                      {(ex as any).workflow_statut && (
                        <div className="mt-4 pt-4 border-t border-border space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">Instruction ANACIM</span>
                              {getWorkflowBadge((ex as any).workflow_statut)}
                              {getAvisBadge((ex as any).avis_final)}
                            </div>
                            {(ex as any).workflow_statut === 'en_attente' && (
                              <button type="button" onClick={() => {
                                const now = new Date().toISOString();
                                updateExemption(ex.id, {
                                  ...ex,
                                  workflow_statut: 'accuse',
                                  date_accuse_reception: now,
                                } as any);
                                setExemptions(prev => prev.map(e => e.id === ex.id ? { ...e, workflow_statut: 'accuse' as any, date_accuse_reception: now } : e));
                              }} className="btn btn-primary gap-2 text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" />Accuser réception
                              </button>
                            )}
                          </div>

                          {((ex as any).workflow_statut === 'accuse' || (ex as any).workflow_statut === 'en_cours') && !(ex as any).avis_final && (
                            <div className="space-y-3 p-4 bg-role-primary-soft/10 rounded-xl border border-role-primary/20">
                              <p className="text-xs text-muted-foreground">Instruction du dossier d'exemption</p>

                              {expandedExemption !== ex.id ? (
                                <button type="button" onClick={() => {
                                  setExpandedExemption(ex.id);
                                  setInstructComment((ex as any).inspecteur_commentaires || '');
                                  setInstructFiles((ex as any).inspecteur_fichiers || []);
                                  updateExemption(ex.id, { ...ex, workflow_statut: 'en_cours' } as any);
                                  setExemptions(prev => prev.map(e => e.id === ex.id ? { ...e, workflow_statut: 'en_cours' as any } : e));
                                }} className="btn btn-secondary gap-2 text-xs">
                                  <Eye className="w-3.5 h-3.5" />Instruire le dossier
                                </button>
                              ) : (
                                <div className="space-y-3">
                                  <div className="form-field">
                                    <label className="filter-label text-xs">Commentaires</label>
                                    <textarea className={`form-textarea text-sm ${focusClass}`} value={instructComment} onChange={e => setInstructComment(e.target.value)} rows={3} placeholder="Avis, observations, demandes de compléments..." />
                                  </div>
                                  <div className="form-field">
                                    <label className="filter-label text-xs">Fichiers d'instruction</label>
                                    <div className="space-y-1">
                                      {instructFiles.map((f, i) => (
                                        <div key={i} className="flex items-center justify-between p-2 bg-success/5 border border-success/30 rounded-lg">
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <FileText className="w-3.5 h-3.5 text-success shrink-0" />
                                            <span className="text-xs text-foreground truncate">{f.nom}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <button type="button" className="action-button" onClick={() => window.open(f.url, '_blank')}><Eye className="w-3 h-3" /></button>
                                            <button type="button" className="action-button hover:text-danger" onClick={() => setInstructFiles(prev => prev.filter((_, j) => j !== i))}><Trash2 className="w-3 h-3" /></button>
                                          </div>
                                        </div>
                                      ))}
                                      <button type="button" onClick={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
                                        input.onchange = (e) => {
                                          const file = (e.target as HTMLInputElement).files?.[0];
                                          if (!file) return;
                                          setInstructFiles(prev => [...prev, { nom: file.name, url: URL.createObjectURL(file) }]);
                                        };
                                        input.click();
                                      }} className="btn btn-secondary w-full gap-1 py-3 border-dashed text-xs">
                                        <Upload className="w-3.5 h-3.5" />Ajouter un fichier
                                      </button>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 pt-2">
                                    <button type="button" disabled={isDeciding} onClick={() => {
                                      setIsDeciding(true);
                                      const now = new Date().toISOString();
                                      updateExemption(ex.id, {
                                        ...ex,
                                        avis_final: 'favorable',
                                        inspecteur_commentaires: instructComment,
                                        inspecteur_fichiers: instructFiles,
                                        workflow_statut: 'favorable' as any,
                                        statut: 'active',
                                        decision: 'acceptee',
                                        date_decision: now,
                                      } as any);
                                      setExemptions(prev => prev.map(e => e.id === ex.id ? { ...e, avis_final: 'favorable' as any, inspecteur_commentaires: instructComment, inspecteur_fichiers: instructFiles, workflow_statut: 'favorable' as any, statut: 'active' as any, decision: 'acceptee' as any, date_decision: now } : e));
                                      addNotification({
                                        user_id: '',
                                        type: 'success',
                                        title: 'Exemption acceptée',
                                        message: `L'exemption ${ex.reference} a été acceptée. Des mesures d'atténuation s'appliquent.`,
                                        canal: 'in_app',
                                      });
                                      setExpandedExemption(null);
                                      setIsDeciding(false);
                                    }} className="btn btn-success gap-2 text-xs">
                                      {isDeciding ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Favorable
                                    </button>
                                    <button type="button" disabled={isDeciding} onClick={() => {
                                      setIsDeciding(true);
                                      const now = new Date().toISOString();
                                      updateExemption(ex.id, {
                                        ...ex,
                                        avis_final: 'a_reviser',
                                        inspecteur_commentaires: instructComment,
                                        inspecteur_fichiers: instructFiles,
                                        workflow_statut: 'a_reviser' as any,
                                        date_decision: now,
                                      } as any);
                                      setExemptions(prev => prev.map(e => e.id === ex.id ? { ...e, avis_final: 'a_reviser' as any, inspecteur_commentaires: instructComment, inspecteur_fichiers: instructFiles, workflow_statut: 'a_reviser' as any, date_decision: now } : e));
                                      addNotification({
                                        user_id: '',
                                        type: 'warning',
                                        title: 'Exemption à réviser',
                                        message: `L'exemption ${ex.reference} nécessite des compléments. L'exploitant est notifié.`,
                                        canal: 'in_app',
                                      });
                                      setExpandedExemption(null);
                                      setIsDeciding(false);
                                    }} className="btn btn-warning gap-2 text-xs">
                                      {isDeciding ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}À réviser
                                    </button>
                                    <button type="button" disabled={isDeciding} onClick={() => {
                                      setIsDeciding(true);
                                      const now = new Date().toISOString();
                                      updateExemption(ex.id, {
                                        ...ex,
                                        avis_final: 'defavorable',
                                        inspecteur_commentaires: instructComment,
                                        inspecteur_fichiers: instructFiles,
                                        workflow_statut: 'defavorable' as any,
                                        statut: 'cloturee',
                                        decision: 'refusee',
                                        date_decision: now,
                                      } as any);
                                      setExemptions(prev => prev.map(e => e.id === ex.id ? { ...e, avis_final: 'defavorable' as any, inspecteur_commentaires: instructComment, inspecteur_fichiers: instructFiles, workflow_statut: 'defavorable' as any, statut: 'cloturee' as any, decision: 'refusee' as any, date_decision: now } : e));
                                      addNotification({
                                        user_id: '',
                                        type: 'danger',
                                        title: 'Exemption refusée',
                                        message: `L'exemption ${ex.reference} a été refusée.`,
                                        canal: 'in_app',
                                      });
                                      setExpandedExemption(null);
                                      setIsDeciding(false);
                                    }} className="btn btn-danger gap-2 text-xs">
                                      {isDeciding ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}Défavorable
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {(ex as any).avis_final === 'favorable' && (
                            <div className="alert alert-success">
                              <CheckCircle2 className="alert-icon" />
                              <div className="alert-content">Exemption acceptée — mesures d'atténuation en vigueur.</div>
                            </div>
                          )}
                          {(ex as any).avis_final === 'a_reviser' && (
                            <div className="alert alert-warning">
                              <AlertCircle className="alert-icon" />
                              <div className="alert-content">Exemption à réviser — l'exploitant doit fournir des compléments.</div>
                            </div>
                          )}
                          {(ex as any).avis_final === 'defavorable' && (
                            <div className="alert alert-danger">
                              <XCircle className="alert-icon" />
                              <div className="alert-content">Exemption refusée.</div>
                            </div>
                          )}

                          {(ex as any).inspecteur_commentaires && (
                            <div className="p-3 bg-card border border-border rounded-lg">
                              <p className="text-xs text-muted-foreground mb-1">Commentaires de l'inspecteur</p>
                              <p className="text-sm text-foreground whitespace-pre-wrap">{(ex as any).inspecteur_commentaires}</p>
                            </div>
                          )}
                          {(ex as any).inspecteur_fichiers && (ex as any).inspecteur_fichiers.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">Fichiers d'instruction</p>
                              {(ex as any).inspecteur_fichiers.map((f: any, i: number) => (
                                <button key={i} type="button" className="btn btn-secondary gap-2 text-xs py-1.5 w-full justify-start" onClick={() => window.open(f.url, '_blank')}>
                                  <FileText className="w-3 h-3" />{f.nom}
                                </button>
                              ))}
                            </div>
                          )}
                          {(ex as any).date_decision && (
                            <p className="text-xs text-muted-foreground">Décision le {new Date((ex as any).date_decision).toLocaleDateString('fr-FR')}</p>
                          )}
                        </div>
                      )}

                  </div>
                ))}
              </div>
            )}

            {/* Formulaire d'exemption */}
            {selectedTab === 'form' && (
              <div className="space-y-5">
                <div className="form-field">
                  <label className="filter-label">Description de l'exemption *</label>
                  <textarea
                    className={`form-textarea ${focusClass}`}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    placeholder="Décrire la demande d'exemption et sa justification..."
                  />
                </div>

                {/* Domaines concernés */}
                <div className="form-field">
                  <label className="filter-label">Domaines concernés</label>
                  <div className="border border-border rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
                    {domainesOptions.map(dom => (
                      <label key={dom.value} className="form-checkbox cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={formData.domaines_concerne.includes(dom.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({ ...formData, domaines_concerne: [...formData.domaines_concerne, dom.value] });
                            } else {
                              setFormData({ ...formData, domaines_concerne: formData.domaines_concerne.filter(d => d !== dom.value) });
                            }
                          }}
                        />
                        <span>{dom.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="field-description">Sélectionnez les domaines concernés par l'exemption</p>
                </div>

                <div className="form-field">
                  <label className="filter-label">Étude de sécurité (PDF)</label>
                  <input
                    type="file"
                    accept=".pdf"
                    className="block w-full text-small text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-role-primary-soft file:text-role-primary hover:file:bg-role-primary-light"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // Simuler l'upload
                        const url = URL.createObjectURL(file);
                        setFormData({ ...formData, etude_securite_url: url });
                      }
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-field">
                    <label className="filter-label">Date début exemption</label>
                    <input
                      type="date"
                      className={`form-input ${focusClass}`}
                      value={formData.date_debut}
                      onChange={(e) => {
                        const newDebut = e.target.value;
                        const newFin = new Date(new Date(newDebut).setMonth(new Date(newDebut).getMonth() + formData.duree_mois)).toISOString().slice(0, 10);
                        setFormData({ ...formData, date_debut: newDebut, date_fin: newFin });
                      }}
                    />
                  </div>
                  <div className="form-field">
                    <label className="filter-label">Durée (mois)</label>
                    <input
                      type="number"
                      min="1"
                      max="36"
                      className={`form-input ${focusClass}`}
                      value={formData.duree_mois}
                      onChange={(e) => {
                        const newDuree = parseInt(e.target.value);
                        const newFin = new Date(new Date(formData.date_debut).setMonth(new Date(formData.date_debut).getMonth() + newDuree)).toISOString().slice(0, 10);
                        setFormData({ ...formData, duree_mois: newDuree, date_fin: newFin });
                      }}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label className="filter-label">Date fin exemption</label>
                  <input
                    type="date"
                    className={`form-input ${focusClass} bg-muted/20`}
                    value={formData.date_fin}
                    disabled
                  />
                  <p className="field-description">Calculée automatiquement</p>
                </div>

                <div className="form-field">
                  <label className="filter-label">Décision</label>
                  <div className="flex gap-4">
                    <label className="form-radio cursor-pointer">
                      <input
                        type="radio"
                        name="decision"
                        value="acceptee"
                        checked={formData.decision === 'acceptee'}
                        onChange={() => setFormData({ ...formData, decision: 'acceptee' })}
                      />
                      <span className="text-small">Acceptée</span>
                    </label>
                    <label className="form-radio cursor-pointer">
                      <input
                        type="radio"
                        name="decision"
                        value="refusee"
                        checked={formData.decision === 'refusee'}
                        onChange={() => setFormData({ ...formData, decision: 'refusee' })}
                      />
                      <span className="text-small">Refusée</span>
                    </label>
                  </div>
                </div>

                {formData.decision === 'acceptee' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="form-field">
                        <label className="filter-label">N° arrêté</label>
                        <input
                          className={`form-input ${focusClass}`}
                          value={formData.numero_arrete}
                          onChange={(e) => setFormData({ ...formData, numero_arrete: e.target.value })}
                          placeholder="045/DG/ANACIM/2025"
                        />
                      </div>
                      <div className="form-field">
                        <label className="filter-label">Date arrêté</label>
                        <input
                          type="date"
                          className={`form-input ${focusClass}`}
                          value={formData.date_arrete}
                          onChange={(e) => setFormData({ ...formData, date_arrete: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* Mesures d'atténuation */}
                    <div className="border-t border-border pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <label className="filter-label">Mesures d'atténuation</label>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm gap-1"
                          onClick={() => setShowMesureForm(!showMesureForm)}
                        >
                          <Plus className="h-3 w-3" />
                          Ajouter une mesure
                        </button>
                      </div>

                      {showMesureForm && (
                        <div className="p-4 bg-role-primary-soft rounded-xl mb-3 space-y-3">
                          <input
                            className={`form-input ${focusClass}`}
                            placeholder="Description de la mesure"
                            value={currentMesure.description || ''}
                            onChange={(e) => setCurrentMesure({ ...currentMesure, description: e.target.value })}
                          />
                          <div className="grid grid-cols-3 gap-3">
                            <input
                              className={`form-input ${focusClass}`}
                              placeholder="Responsable"
                              value={currentMesure.responsable || ''}
                              onChange={(e) => setCurrentMesure({ ...currentMesure, responsable: e.target.value })}
                            />
                            <input
                              type="date"
                              className={`form-input ${focusClass}`}
                              value={currentMesure.date_debut || ''}
                              onChange={(e) => setCurrentMesure({ ...currentMesure, date_debut: e.target.value })}
                            />
                            <input
                              type="date"
                              className={`form-input ${focusClass}`}
                              value={currentMesure.date_fin_prevue || ''}
                              onChange={(e) => setCurrentMesure({ ...currentMesure, date_fin_prevue: e.target.value })}
                            />
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="form-checkbox cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={currentMesure.declencher_inspection_si_retard || false}
                                onChange={(e) => setCurrentMesure({ ...currentMesure, declencher_inspection_si_retard: e.target.checked })}
                              />
                              <span>Déclencher une inspection en cas de retard</span>
                            </label>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button className="btn btn-secondary btn-sm" onClick={() => setShowMesureForm(false)}>
                              <XCircle className="h-4 w-4" />
                              Annuler
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={handleAddMesure}>
                              <Plus className="h-4 w-4" />
                              Ajouter
                            </button>
                          </div>
                        </div>
                      )}

                      {mesures.length > 0 && (
                        <div className="space-y-2">
                          {mesures.map(mesure => (
                            <div key={mesure.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                              <div className="flex-1">
                                <p className="text-sm font-medium">{mesure.description}</p>
                                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                                  <span>Responsable: {mesure.responsable}</span>
                                  <span>Début: {formatDate(mesure.date_debut)}</span>
                                  <span>Fin: {formatDate(mesure.date_fin_prevue)}</span>
                                  {mesure.declencher_inspection_si_retard && (
                                    <span className="text-warning flex items-center gap-1"><Search className="h-3 w-3" /> Inspection auto</span>
                                  )}
                                </div>
                              </div>
                              <button className="action-button hover:text-danger" onClick={() => handleRemoveMesure(mesure.id)}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <button className="btn btn-secondary" onClick={() => {
                    setSelectedTab('list');
                    setShowForm(false);
                    setEditingExemption(null);
                    resetForm();
                  }}>
                    <XCircle className="h-4 w-4" />
                    Annuler
                  </button>
                  <button className="btn btn-primary" onClick={handleSubmitExemption}>
                    <Save className="h-4 w-4 mr-2" />
                    {editingExemption ? 'Mettre à jour' : 'Enregistrer l\'exemption'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ExemptionManager;