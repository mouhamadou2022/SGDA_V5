// components/modules/formation/FormationModule.tsx
'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { FormShell } from '@/components/ui/FormShell';
import { Card } from '@/components/ui/card';
import { useDebounce } from '@/hooks/useDebounce';
import {
  GraduationCap,
  Users,
  Calendar,
  CalendarDays,
  Clock,
  MapPin,
  FileText,
  Download,
  Eye,
  PenSquare,
  Trash2,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Star,
  Award,
  BarChart3,
  TrendingUp,
  User as UserIcon,
  Briefcase,
  BookOpen,
  ChevronDown,
  ChevronRight,
  PlayCircle,
  RotateCcw,
  X,
  Upload,
  Mail,
  Activity,
  Sparkles,
  List,
  Grid3x3,
  PieChart,
} from 'lucide-react';
import { PieChart as FormationPieChart } from '@/components/ui/charts/PieChart';
import { CompetenceMatrix } from './CompetenceMatrix';
import { EcheanceAlert } from './EcheanceAlert';
import { FormationSuggestions } from './FormationSuggestions';
import { DeleteConfirmationDialog } from '@/components/ui/DeleteConfirmationDialog';
import { useOptimizedStore, useGlobalTransition } from '@/lib/performance/globalOptimizer';
import { useAppStore, Formation, Inspecteur, Competence } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { formationUtils } from '@/lib/formationUtils';
import { formatDate } from '@/lib/utils';
{/* InspecteurFiche import retiré */}

interface FormationModuleProps {
  userRole: string;
}

const TYPES_FORMATION = [
  { id: 'initiale', label: 'Initiale', color: 'blue' },
  { id: 'continue', label: 'Continue', color: 'green' },
  { id: 'specialisee', label: 'Spécialisée', color: 'purple' },
  { id: 'recyclage', label: 'Recyclage', color: 'orange' },
  { id: 'certification', label: 'Certification', color: 'teal' },
];

const DOMAINES_COMPETENCE = [
  { id: 'exploitation', label: 'Exploitation (AGA)', color: 'blue' },
  { id: 'sli', label: 'Sauvetage et lutte incendie (SLI)', color: 'red' },
  { id: 'genie_civil', label: 'Génie civil', color: 'green' },
  { id: 'genie_electrique', label: 'Génie électrique', color: 'yellow' },
  { id: 'risque_animalier', label: 'Risque animalier', color: 'orange' },
  { id: 'certification', label: 'Certification', color: 'purple' },
  { id: 'homologation', label: 'Homologation', color: 'teal' },
];

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

export default function FormationModule({ userRole }: FormationModuleProps) {
  const { startTransition } = useGlobalTransition();
  const formations = useOptimizedStore((s) => s.formations);
  const inspecteurs = useOptimizedStore((s) => s.inspecteurs);
  const surveillances = useOptimizedStore((s) => s.surveillances);
  const utilisateurs = useOptimizedStore((s) => s.utilisateurs);
  const user = useOptimizedStore((s) => s.user);
  const addFormation = useAppStore((s) => s.addFormation);
  const updateFormation = useAppStore((s) => s.updateFormation);
  const deleteFormation = useAppStore((s) => s.deleteFormation);
  const addInspecteur = useAppStore((s) => s.addInspecteur);
  const updateInspecteur = useAppStore((s) => s.updateInspecteur);
  const deleteInspecteur = useAppStore((s) => s.deleteInspecteur);
  const setActiveModule = useAppStore((s) => s.setActiveModule);

  const competencesVersion = useAppStore((s) => s.competencesVersion);
  const lastRecalcVersion = useRef(0);

  // Recalculer les compétences automatiquement uniquement si les données ont changé
  useEffect(() => {
    if (competencesVersion <= lastRecalcVersion.current) return;
    lastRecalcVersion.current = competencesVersion;

    const ctx = { formations: formations || [], surveillances: surveillances || [] }
    inspecteurs.filter(i => !i.deleted_at).forEach(ins => {
      const domaines = [...new Set((ins.competences || []).map(c => c.domaine))]
      const nouvelles: Competence[] = domaines.map(d => {
        const existante = ins.competences?.find(c => c.domaine === d)
        if (existante?.source === 'manuel') return existante
        return { ...(existante || {} as any), id: existante?.id || crypto.randomUUID(), inspecteur_id: ins.id, domaine: d, niveau: formationUtils.calculerNiveauCompetence(ins, d, ctx), source: 'auto' as Competence['source'], date_obtention: existante?.date_obtention || ins.created_at }
      })
      if (nouvelles.length > 0) updateInspecteur(ins.id, { competences: nouvelles as any })
    })
  }, [competencesVersion, formations, surveillances, inspecteurs, updateInspecteur])

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [filters, setFilters] = useState({
    type: 'tous',
    statut: 'tous',
    inspecteur: 'tous'
  });
  const [showForm, setShowForm] = useState(false);
  const [showInspecteurForm, setShowInspecteurForm] = useState(false);
  const [showInspecteurFiche, setShowInspecteurFiche] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingInspecteurId, setDeletingInspecteurId] = useState<string | null>(null);
  const [showMatriceModal, setShowMatriceModal] = useState(false);
  const [selectedInspecteur, setSelectedInspecteur] = useState<string | null>(null);
  const [selectedFormation, setSelectedFormation] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [viewMode, setViewMode] = useState<'dashboard' | 'liste' | 'grille' | 'calendrier' | 'matrice' | 'echeances' | 'suggestions'>('dashboard');
  const [calendarPeriod, setCalendarPeriod] = useState<'mois' | 'six_mois' | 'annee'>('mois');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [expandedInspectors, setExpandedInspectors] = useState<Record<string, boolean>>({});
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);
  const [showCertifModal, setShowCertifModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [certifFile, setCertifFile] = useState<File | null>(null);
  const [newDate, setNewDate] = useState('');
  const [newDuree, setNewDuree] = useState(0);
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [executeDate, setExecuteDate] = useState('');
  const [executeDuree, setExecuteDuree] = useState(0);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const [formData, setFormData] = useState({
    titre: '',
    type: 'initiale' as Formation['type'],
    domaines: [] as string[],
    date: '',
    duree_heures: 0,
    lieu: '',
    formateur: '',
    formateur_externe: false,
    participants: [] as string[],
    objectifs: '',
    programme: '',
    budget: 0,
    statut: 'planifiee' as Formation['statut']
  });

  const [inspecteurData, setInspecteurData] = useState({
    matricule: '',
    prenom: '',
    nom: '',
    email: '',
    telephone: '',
    type: 'cadre_technique' as Inspecteur['type'],
    service: 'normes_aerodromes' as Inspecteur['service'],
    domaine_principal: 'exploitation' as Inspecteur['domaine_principal'],
    statut: 'en_service' as Inspecteur['statut']
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const listeFormations = formations ?? [];
  const listeInspecteurs = inspecteurs ?? [];

  const filteredFormations = useMemo(() => {
    return listeFormations.filter(f => {
      if (debouncedSearchTerm) {
        const term = debouncedSearchTerm.toLowerCase();
        const matches =
          f.titre?.toLowerCase().includes(term) ||
          f.reference?.toLowerCase().includes(term) ||
          f.formateur?.toLowerCase().includes(term);
        if (!matches) return false;
      }
      if (filters.type !== 'tous' && f.type !== filters.type) return false;
      if (filters.statut !== 'tous' && f.statut !== filters.statut) return false;
      if (filters.inspecteur !== 'tous' && !(f.participants || []).includes(filters.inspecteur)) return false;
      return true;
    });
  }, [listeFormations, debouncedSearchTerm, filters]);

  const formationsParInspecteur = useMemo(() => {
    const grouped: Record<string, Formation[]> = {};
    listeInspecteurs.forEach(ins => { grouped[ins.id] = []; });
    listeFormations.forEach(f => {
      f.participants.forEach((pId: string) => {
        if (grouped[pId]) grouped[pId].push(f);
      });
    });
    return grouped;
  }, [listeFormations, listeInspecteurs]);

  const formationsParInspecteurEtType = useMemo(() => {
    const result: Record<string, { planifiees: Formation[]; en_cours: Formation[]; terminees: Formation[] }> = {};
    listeInspecteurs.forEach(ins => {
      const all = formationsParInspecteur[ins.id] || [];
      result[ins.id] = {
        planifiees: all.filter((f: Formation) => f.statut === 'planifiee'),
        en_cours: all.filter((f: Formation) => f.statut === 'en_cours'),
        terminees: all.filter((f: Formation) => f.statut === 'terminee' || f.statut === 'annulee'),
      };
    });
    return result;
  }, [formationsParInspecteur, listeInspecteurs]);

  const stats = useMemo(() => {
    const maintenant = new Date();
    return {
      total: listeFormations.length,
      planifiees: listeFormations.filter(f => f.statut === 'planifiee').length,
      enCours: listeFormations.filter(f => f.statut === 'en_cours').length,
      terminees: listeFormations.filter(f => f.statut === 'terminee').length,
      enRetard: listeFormations.filter(f =>
        f.statut === 'planifiee' && f.date && new Date(f.date) < maintenant
      ).length,
      totalInspecteurs: listeInspecteurs.length,
      enFormation: listeInspecteurs.filter(ins =>
        listeFormations.some(f =>
          f.participants.includes(ins.id) &&
          f.statut === 'en_cours'
        )
      ).length,
      formationsCount: listeFormations.length,
      tauxCompletion: listeFormations.length > 0
        ? Math.round((listeFormations.filter(f => f.statut === 'terminee').length / listeFormations.length) * 100)
        : 0,
      budgetTotal: listeFormations.reduce((sum, f) => sum + (f.budget || 0), 0),
    };
  }, [listeFormations, listeInspecteurs]);

  const toggleInspector = (id: string) => {
    setExpandedInspectors(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleType = (key: string) => {
    setExpandedTypes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Calendar helpers
  const getCalendarData = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    let months: { index: number; year: number; label: string }[] = [];

    if (calendarPeriod === 'mois') {
      months = [{ index: month, year, label: `${MOIS[month]} ${year}` }];
    } else if (calendarPeriod === 'six_mois') {
      for (let i = 0; i < 6; i++) {
        const m = (month + i) % 12;
        const y = year + Math.floor((month + i) / 12);
        months.push({ index: m, year: y, label: `${MOIS[m]} ${y}` });
      }
    } else {
      for (let i = 0; i < 12; i++) {
        months.push({ index: i, year: year, label: `${MOIS[i]} ${year}` });
      }
    }

    const formationsByMonth: Record<string, Formation[]> = {};
    months.forEach(m => {
      const key = `${m.year}-${String(m.index + 1).padStart(2, '0')}`;
      formationsByMonth[key] = listeFormations.filter(f => {
        if (!f.date) return false;
        const fd = new Date(f.date);
        if (isNaN(fd.getTime())) return false;
        return fd.getMonth() === m.index && fd.getFullYear() === m.year;
      });
    });

    return { months, formationsByMonth };
  }, [calendarDate, calendarPeriod, listeFormations]);

  const getTypeBadge = (type: string) => {
    const t = TYPES_FORMATION.find(t => t.id === type);
    return t ? `${t.label}` : type;
  };

  const getStatutBadge = (statut: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      'planifiee': { label: 'Planifiée', className: 'badge primary' },
      'en_cours': { label: 'En cours', className: 'badge warning' },
      'terminee': { label: 'Terminée', className: 'badge success' },
      'annulee': { label: 'Annulée', className: 'badge danger' }
    };
    return variants[statut] || { label: statut, className: 'badge neutral' };
  };

  const getInitials = (prenom: string, nom: string) => {
    return `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase();
  };

  const getInspecteur = (id: string) => listeInspecteurs.find(i => i.id === id);

  const getNiveauLabel = (niveau: string | number) => {
    const niveaux: Record<string, string> = {
      'cadre_technique': 'Cadre Technique',
      'inspecteur_titulaire': 'Inspecteur Titulaire',
      'inspecteur_principal': 'Inspecteur Principal'
    };
    return niveaux[niveau] || niveau;
  };

  const estExpiree = (f: Formation) => {
    if (f.statut !== 'planifiee' || !f.date) return false;
    const dateFin = new Date(f.date);
    dateFin.setHours(dateFin.getHours() + (f.duree_heures || 0));
    return dateFin < new Date();
  };

  const handleSubmitFormation = async (e: React.FormEvent) => {
    e.preventDefault();
    const nouvelleFormation: Omit<Formation, 'id' | 'created_at'> = {
      reference: formationUtils.genererReference(new Date().getFullYear(), listeFormations.length + 1),
      titre: formData.titre,
      type: formData.type,
      domaines: formData.domaines,
      date: formData.date,
      duree_heures: formData.duree_heures,
      lieu: formData.lieu,
      formateur: formData.formateur,
      formateur_externe: formData.formateur_externe,
      participants: formData.participants,
      objectifs: formData.objectifs,
      programme: formData.programme,
      budget: formData.budget,
      statut: formData.statut,
      created_by: user?.id || ''
    };
    try {
      await addFormation(nouvelleFormation)
    } catch (err) {
      console.error('Erreur création formation:', err)
    }
    setShowForm(false);
    resetForm();
  };

  const handleSubmitInspecteur = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedInspecteur) {
      updateInspecteur(selectedInspecteur, {
        matricule: inspecteurData.matricule,
        prenom: inspecteurData.prenom,
        nom: inspecteurData.nom,
        telephone: inspecteurData.telephone,
        type: inspecteurData.type,
        service: inspecteurData.service,
        domaine_principal: inspecteurData.domaine_principal,
        statut: inspecteurData.statut,
      });
      setShowInspecteurForm(false);
      setSelectedInspecteur(null);
      setInspecteurData({
        matricule: '',
        prenom: '',
        nom: '',
        email: '',
        telephone: '',
        type: 'cadre_technique',
        service: 'normes_aerodromes',
        domaine_principal: 'exploitation',
        statut: 'en_service'
      });
    } else {
      // Vérification rapide côté client (cache local)
      const matriculeExistant = inspecteurs.find(i => 
        !i.deleted_at && i.matricule?.trim().toLowerCase() === inspecteurData.matricule.trim().toLowerCase()
      );
      if (matriculeExistant) {
        setFormErrors({ matricule: `Le matricule "${inspecteurData.matricule}" existe déjà pour ${matriculeExistant.prenom} ${matriculeExistant.nom}` });
        return;
      }
      const nouvelInspecteur: Omit<Inspecteur, 'id' | 'created_at'> = {
        matricule: inspecteurData.matricule,
        prenom: inspecteurData.prenom,
        nom: inspecteurData.nom,
        email: '',
        telephone: inspecteurData.telephone,
        type: inspecteurData.type,
        service: inspecteurData.service,
        domaine_principal: inspecteurData.domaine_principal,
        statut: inspecteurData.statut,
        competences: [],
        formations: [],
      };
      try {
        await addInspecteur(nouvelInspecteur);
        setShowInspecteurForm(false);
        setSelectedInspecteur(null);
        setInspecteurData({
          matricule: '',
          prenom: '',
          nom: '',
          email: '',
          telephone: '',
          type: 'cadre_technique',
          service: 'normes_aerodromes',
          domaine_principal: 'exploitation',
          statut: 'en_service'
        });
        setFormErrors({});
      } catch (err: any) {
        setFormErrors({ matricule: err.message || 'Erreur lors de la création de l\'inspecteur' });
      }
    }
  };

  const handleExecute = (f: Formation) => {
    setSelectedFormation(f.id);
    setExecuteDate(f.date);
    setExecuteDuree(f.duree_heures);
    startTransition(() => setShowExecuteModal(true));
  };

  const handleConfirmExecute = async () => {
    if (!selectedFormation) return;
    try {
      await updateFormation(selectedFormation, {
        statut: 'en_cours',
        date_debut_reelle: new Date().toISOString().split('T')[0],
      });
    } catch (err) {
      console.error('Erreur démarrage formation:', err);
    }
    setShowExecuteModal(false);
    setSelectedFormation(null);
  };

  const handleCertificat = (f: Formation) => {
    setSelectedFormation(f.id);
    startTransition(() => setShowCertifModal(true));
  };

  const handleUploadCertificat = async () => {
    if (!selectedFormation || !certifFile) return;
    try {
      await updateFormation(selectedFormation, {
        certificat: true,
        certificat_nom: certifFile.name,
        statut: 'terminee',
      });
    } catch (err) {
      console.error('Erreur validation certificat:', err);
    }
    setShowCertifModal(false);
    setCertifFile(null);
    setSelectedFormation(null);
  };

  const handleModifierDates = (f: Formation) => {
    setSelectedFormation(f.id);
    setNewDate(f.date);
    setNewDuree(f.duree_heures);
    startTransition(() => setShowDateModal(true));
  };

  const handleConfirmDates = async () => {
    if (!selectedFormation) return;
    try {
      await updateFormation(selectedFormation, {
        date: newDate,
        duree_heures: newDuree,
      });
    } catch (err) {
      console.error('Erreur modification dates:', err);
    }
    setShowDateModal(false);
    setSelectedFormation(null);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cette formation ?')) return;
    try {
      await deleteFormation(id);
    } catch (err) {
      console.error('Erreur suppression formation:', err);
    }
  };

  const handleViewInspecteur = (id: string) => {
    setSelectedInspecteur(id);
    startTransition(() => setShowInspecteurFiche(true));
  };

  const handleEditInspecteur = (ins: Inspecteur) => {
    setSelectedInspecteur(ins.id);
    setInspecteurData({
      matricule: ins.matricule || '',
      prenom: ins.prenom || '',
      nom: ins.nom || '',
      email: ins.email || '',
      telephone: ins.telephone || '',
      type: ins.type,
      service: ins.service,
      domaine_principal: ins.domaine_principal,
      statut: ins.statut
    });
    startTransition(() => setShowInspecteurForm(true));
  };

  const handleUpdateInspecteur = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInspecteur) return;
    try {
      await updateInspecteur(selectedInspecteur, {
        matricule: inspecteurData.matricule,
        prenom: inspecteurData.prenom,
        nom: inspecteurData.nom,
        email: inspecteurData.email,
        telephone: inspecteurData.telephone,
        type: inspecteurData.type,
        service: inspecteurData.service,
        domaine_principal: inspecteurData.domaine_principal,
        statut: inspecteurData.statut,
      });
    } catch (err) {
      console.error('Erreur mise à jour inspecteur:', err);
    }
    setShowInspecteurForm(false);
    setSelectedInspecteur(null);
    setInspecteurData({
      matricule: '',
      prenom: '',
      nom: '',
      email: '',
      telephone: '',
      type: 'cadre_technique',
      service: 'normes_aerodromes',
      domaine_principal: 'exploitation',
      statut: 'en_service'
    });
  };

  const handleDeleteInspecteur = (id: string) => {
    setDeletingInspecteurId(id);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDeleteInspecteur = async () => {
    if (!deletingInspecteurId) return;
    try {
      await deleteInspecteur(deletingInspecteurId);
    } catch (err) {
      console.error('Erreur suppression inspecteur:', err);
    }
    setShowDeleteConfirm(false);
    setDeletingInspecteurId(null);
  };

  const handleDeleteExpiree = async (f: Formation) => {
    if (!window.confirm(`La formation "${f.titre}" est arrivée à échéance sans être terminée. Supprimer ?`)) return;
    try {
      await deleteFormation(f.id);
    } catch (err) {
      console.error('Erreur suppression formation expirée:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      titre: '',
      type: 'initiale',
      domaines: [],
      date: '',
      duree_heures: 0,
      lieu: '',
      formateur: '',
      formateur_externe: false,
      participants: [],
      objectifs: '',
      programme: '',
      budget: 0,
      statut: 'planifiee'
    });
    setFormErrors({});
  };

  const canManage = userRole === 'admin' || userRole === 'dg_anacim';

  const FormationFormModal = () => (
    <FormShell
      open={showForm && !!mounted}
      onClose={() => setShowForm(false)}
      title="Nouvelle formation"
      icon={GraduationCap}
      size="3xl"
      dataRole={userRole}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
            Annuler
          </button>
          <button type="submit" form="formation-form" className="btn btn-primary">
            Créer la formation
          </button>
        </>
      }
    >
      <div>
        <form onSubmit={handleSubmitFormation} className="space-y-6" id="formation-form">
          <div className="grid grid-cols-2 gap-4">
            <div className="form-field col-span-2">
              <label className="filter-label text-role-primary">Titre de la formation *</label>
              <input
                type="text"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={formData.titre}
                onChange={(e) => setFormData({...formData, titre: e.target.value})}
                required
              />
            </div>

            <div className="form-field">
              <label className="filter-label text-role-primary">Type *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value as Formation['type']})}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                style={selectStyle}
              >
                {TYPES_FORMATION.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="filter-label text-role-primary">Domaines</label>
              <select
                multiple
                value={formData.domaines}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                  setFormData({...formData, domaines: selected});
                }}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                style={{ ...selectStyle, backgroundImage: 'none' }}
                size={4}
              >
                {DOMAINES_COMPETENCE.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Maintenez Ctrl pour sélectionner plusieurs domaines</p>
            </div>

            <div className="form-field">
              <label className="filter-label text-role-primary">Date *</label>
              <input
                type="date"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
                required
              />
            </div>

            <div className="form-field">
              <label className="filter-label text-role-primary">Durée (heures) *</label>
              <input
                type="number"
                min="1"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={formData.duree_heures}
                onChange={(e) => setFormData({...formData, duree_heures: parseInt(e.target.value) || 0})}
                required
              />
            </div>

            <div className="form-field">
              <label className="filter-label text-role-primary">Lieu *</label>
              <input
                type="text"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={formData.lieu}
                onChange={(e) => setFormData({...formData, lieu: e.target.value})}
                required
              />
            </div>

            <div className="form-field">
              <label className="filter-label text-role-primary">Formateur *</label>
              <input
                type="text"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={formData.formateur}
                onChange={(e) => setFormData({...formData, formateur: e.target.value})}
                required
              />
            </div>

            <div className="form-field col-span-2">
              <label className="filter-label text-role-primary">Participants</label>
              <select
                multiple
                value={formData.participants}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                  setFormData({...formData, participants: selected});
                }}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                style={{ ...selectStyle, backgroundImage: 'none' }}
                size={4}
              >
                {listeInspecteurs.map(ins => (
                  <option key={ins.id} value={ins.id}>
                    {ins.prenom} {ins.nom} ({ins.matricule})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Maintenez Ctrl pour sélectionner plusieurs participants</p>
            </div>

            <div className="form-field col-span-2">
              <label className="filter-label text-role-primary">Objectifs pédagogiques</label>
              <textarea
                className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={formData.objectifs}
                onChange={(e) => setFormData({...formData, objectifs: e.target.value})}
                rows={3}
                required
              />
            </div>

            <div className="form-field col-span-2">
              <label className="filter-label text-role-primary">Programme détaillé</label>
              <textarea
                className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={formData.programme}
                onChange={(e) => setFormData({...formData, programme: e.target.value})}
                rows={4}
              />
            </div>

            <div className="form-field">
              <label className="filter-label text-role-primary">Budget (FCFA)</label>
              <input
                type="number"
                min="0"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={formData.budget}
                onChange={(e) => setFormData({...formData, budget: parseInt(e.target.value) || 0})}
              />
            </div>

            <div className="form-field">
              <label className="filter-label text-role-primary">Statut</label>
              <select
                value={formData.statut}
                onChange={(e) => setFormData({...formData, statut: e.target.value as Formation['statut']})}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                style={selectStyle}
              >
                <option value="planifiee">Planifiée</option>
                <option value="en_cours">En cours</option>
                <option value="terminee">Terminée</option>
                <option value="annulee">Annulée</option>
              </select>
            </div>
          </div>
        </form>
      </div>
    </FormShell>
  );

  const InspecteurFormModal = () => (
    <FormShell
      open={showInspecteurForm && !!mounted}
      onClose={() => { setShowInspecteurForm(false); setSelectedInspecteur(null); setInspecteurData({ matricule: '', prenom: '', nom: '', email: '', telephone: '', type: 'cadre_technique', service: 'normes_aerodromes', domaine_principal: 'exploitation', statut: 'en_service' }); }}
      title={selectedInspecteur ? "Modifier l'inspecteur" : "Nouvel inspecteur"}
      icon={Users}
      size="2xl"
      dataRole={userRole}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => { setShowInspecteurForm(false); setSelectedInspecteur(null); setInspecteurData({ matricule: '', prenom: '', nom: '', email: '', telephone: '', type: 'cadre_technique', service: 'normes_aerodromes', domaine_principal: 'exploitation', statut: 'en_service' }); }}>
            Annuler
          </button>
          <button type="submit" form="inspecteur-form" className="btn btn-primary">
            {selectedInspecteur ? "Enregistrer" : "Créer l'inspecteur"}
          </button>
        </>
      }
    >
      <div>
        {formErrors.submit && (
          <div className="mb-4 p-3 bg-danger-soft rounded-xl border border-danger/20 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-danger mt-0.5 shrink-0" />
            <p className="text-sm text-danger">{formErrors.submit}</p>
          </div>
        )}
        <form onSubmit={handleSubmitInspecteur} className="space-y-4" id="inspecteur-form">
          <div className="grid grid-cols-2 gap-4">
            <div className="form-field">
              <label className="filter-label text-role-primary">Matricule *</label>
              <input
                type="text"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass} ${formErrors.matricule ? 'border-danger' : ''}`}
                value={inspecteurData.matricule}
                onChange={(e) => { setInspecteurData({...inspecteurData, matricule: e.target.value}); if (formErrors.matricule) setFormErrors(prev => ({ ...prev, matricule: '' })); }}
                required
              />
              {formErrors.matricule && <p className="text-xs text-danger mt-1">{formErrors.matricule}</p>}
            </div>
            <div className="form-field">
              <label className="filter-label text-role-primary">Prénom *</label>
              <input
                type="text"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={inspecteurData.prenom}
                onChange={(e) => setInspecteurData({...inspecteurData, prenom: e.target.value})}
                required
              />
            </div>
            <div className="form-field">
              <label className="filter-label text-role-primary">Nom *</label>
              <input
                type="text"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={inspecteurData.nom}
                onChange={(e) => setInspecteurData({...inspecteurData, nom: e.target.value})}
                required
              />
            </div>
            {!selectedInspecteur && inspecteurData.prenom && inspecteurData.nom && (
              <div className="form-field col-span-2">
                <label className="filter-label text-role-primary">Email ANACIM (auto-généré)</label>
                <div className="flex items-center gap-2 p-3 bg-info-soft rounded-xl border border-info/20">
                  <Mail className="w-4 h-4 text-info" />
                  <span className="text-sm font-mono text-info">{inspecteurData.prenom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.')}.{inspecteurData.nom.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.')}@anacim.sn</span>
                </div>
              </div>
            )}
            {!selectedInspecteur && (
              <div className="form-field col-span-2">
                <label className="filter-label text-role-primary">Mot de passe par défaut</label>
                <div className="flex items-center gap-2 p-3 bg-warning-soft rounded-xl border border-warning/20">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <span className="text-sm font-mono text-warning">AnacimDNS@2026</span>
                  <span className="text-xs text-muted-foreground ml-2">(à changer au 1er connexion)</span>
                </div>
              </div>
            )}
            <div className="form-field">
              <label className="filter-label text-role-primary">Téléphone</label>
              <input
                type="tel"
                className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                value={inspecteurData.telephone}
                onChange={(e) => setInspecteurData({...inspecteurData, telephone: e.target.value})}
              />
            </div>
            <div className="form-field">
              <label className="filter-label text-role-primary">Type d'inspecteur *</label>
              <select
                value={inspecteurData.type}
                onChange={(e) => setInspecteurData({...inspecteurData, type: e.target.value as Inspecteur['type']})}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                style={selectStyle}
              >
                <option value="cadre_technique">Cadre Technique</option>
                <option value="inspecteur_titulaire">Inspecteur Titulaire</option>
                <option value="inspecteur_principal">Inspecteur Principal</option>
              </select>
            </div>
            <div className="form-field">
              <label className="filter-label text-role-primary">Service rattaché *</label>
              <select
                value={inspecteurData.service}
                onChange={(e) => setInspecteurData({...inspecteurData, service: e.target.value as Inspecteur['service']})}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                style={selectStyle}
              >
                <option value="normes_aerodromes">Normes des Aérodromes</option>
                <option value="securite_aerodromes">Sécurité des Aérodromes</option>
              </select>
            </div>
            <div className="form-field">
              <label className="filter-label text-role-primary">Domaine principal *</label>
              <select
                value={inspecteurData.domaine_principal}
                onChange={(e) => setInspecteurData({...inspecteurData, domaine_principal: e.target.value as Inspecteur['domaine_principal']})}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                style={selectStyle}
              >
                {DOMAINES_COMPETENCE.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="filter-label text-role-primary">Statut</label>
              <select
                value={inspecteurData.statut}
                onChange={(e) => setInspecteurData({...inspecteurData, statut: e.target.value as Inspecteur['statut']})}
                className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                style={selectStyle}
              >
                <option value="en_service">En service</option>
                <option value="en_conge">En congé</option>
                <option value="en_mission">En mission</option>
                <option value="absent">Absent</option>
              </select>
            </div>
          </div>
        </form>
      </div>
    </FormShell>
  );

  const InspecteurFicheModal = () => {
    const ins = inspecteurs.find(i => i.id === selectedInspecteur);
    if (!ins) return null;
    const formationCount = formations.filter(f => f.participants?.includes(ins.id)).length;
    const statutColors: Record<string, string> = { en_service: 'text-success', en_conge: 'text-warning', en_mission: 'text-info', absent: 'text-danger' };
    const domaine = DOMAINES_COMPETENCE.find(d => d.id === ins.domaine_principal);
    return (
      <FormShell
        open={showInspecteurFiche && !!mounted}
        onClose={() => { setShowInspecteurFiche(false); setSelectedInspecteur(null); }}
        title="Fiche inspecteur"
        icon={Eye}
        size="lg"
        dataRole={userRole}
      >
        <div className="space-y-6">
          {/* Profil header */}
          <div className="flex items-center gap-5 p-5 bg-gradient-to-r from-blue-950/5 to-transparent rounded-2xl border border-border/50">
            <div className="w-20 h-20 rounded-full bg-blue-950 flex items-center justify-center text-white text-2xl font-bold shrink-0 overflow-hidden ring-4 ring-blue-950/10">
              {ins.photo ? (
                <img src={ins.photo} alt="" className="w-full h-full object-cover" />
              ) : (
                getInitials(ins.prenom, ins.nom)
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold tracking-tight">{ins.prenom} {ins.nom}</h3>
              <p className="text-sm text-muted-foreground">{ins.matricule || '—'}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="badge primary text-[10px]">{getNiveauLabel(ins.type)}</span>
                {domaine && <span className="badge outline text-[10px]">{domaine.label.split(' (')[0]}</span>}
                <span className={`text-[11px] font-medium capitalize ${statutColors[ins.statut] || 'text-muted-foreground'}`}>
                  {ins.statut.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>

          {/* Coordonnées */}
          <div>
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide mb-3">Coordonnées</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Email', value: ins.email },
                { label: 'Téléphone', value: ins.telephone },
                { label: 'Service', value: ins.service?.replace(/_/g, ' ') },
              ].map(item => (
                <div key={item.label} className="p-3 bg-role-primary-soft rounded-xl">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{item.label}</p>
                  <p className="text-sm font-medium truncate">{item.value || '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Activité */}
          <div>
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide mb-3">Activité</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Formations', value: formationCount, icon: '🎓' },
                { label: 'Compétences', value: ins.competences?.length || 0, icon: '⭐' },
                { label: 'Domaine', value: domaine?.label.split(' (')[0] || '—' },
                { label: 'Statut', value: ins.statut.replace(/_/g, ' ') },
              ].map(item => (
                <div key={item.label} className="p-3 bg-role-primary-soft rounded-xl">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{item.label}</p>
                  <p className="text-sm font-medium truncate">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Compétences */}
          {ins.competences && ins.competences.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-role-primary uppercase tracking-wide mb-3">Compétences</p>
              <div className="grid grid-cols-2 gap-2">
                {ins.competences.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-role-primary-soft">
                    <span className="text-sm font-medium">{c.domaine}</span>
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(n => (
                        <div key={n} className={`w-2 h-2 rounded-full ${n <= c.niveau ? 'bg-role-primary' : 'bg-border'}`} />
                      ))}
                      <span className="text-[10px] text-muted-foreground ml-1">{c.niveau}/5</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </FormShell>
    );
  };

  const FormationActions = ({ f }: { f: Formation }) => {
    const expiree = estExpiree(f);
    return (
      <div className="flex gap-2">
        <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" title="Voir" onClick={() => { setSelectedFormation(f.id); setShowDetails(true); }}>
          <Eye className="w-4 h-4" />
        </button>
        {f.statut === 'planifiee' && (
          <button className="action-button hover:text-success hover:bg-success/10 transition-all duration-200" onClick={() => handleExecute(f)} title="Exécuter">
            <PlayCircle className="w-4 h-4" />
          </button>
        )}
        {expiree && (
          <>
            <button className="action-button hover:text-warning hover:bg-warning/10 transition-all duration-200" onClick={() => handleCertificat(f)} title="Ajouter certificat">
              <Upload className="w-4 h-4" />
            </button>
            <button className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" onClick={() => handleModifierDates(f)} title="Modifier les dates">
              <RotateCcw className="w-4 h-4" />
            </button>
            <button className="action-button danger hover:bg-danger/10 transition-all duration-200" onClick={() => handleDeleteExpiree(f)} title="Supprimer">
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
        {!expiree && canManage && (
          <button className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" title="Modifier">
            <PenSquare className="w-4 h-4" />
          </button>
        )}
        {!expiree && canManage && (
          <button className="action-button danger hover:bg-danger/10 transition-all duration-200" onClick={() => handleDelete(f.id)} title="Supprimer">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {f.statut === 'terminee' && !f.certificat && (
          <button className="action-button hover:text-warning hover:bg-warning/10 transition-all duration-200" onClick={() => handleCertificat(f)} title="Ajouter certificat">
            <Upload className="w-4 h-4" />
          </button>
        )}
        {f.statut !== 'planifiee' && (
          <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" title="Télécharger">
            <Download className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="formation">

      {/* En-tête */}
      <ModuleHeader
        icon={<GraduationCap />}
        title="Formation & Compétences"
        description="Gestion des formations et matrice de compétences"
        actions={<div className="flex items-center gap-2">
          {/* Nouvel inspecteur géré via Utilisateurs */}
          <button onClick={() => startTransition(() => setShowForm(true))} className="btn btn-primary gap-2">
            <Plus className="w-4 h-4" />
            Nouvelle formation
          </button>
        </div>}
      />

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <GraduationCap className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total formations</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-primary-soft">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div className="kpi-label">Planifiées</div>
          <div className="kpi-value">{stats.planifiees}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <Clock className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">En cours</div>
          <div className="kpi-value">{stats.enCours}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Terminées</div>
          <div className="kpi-value">{stats.terminees}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft">
            <AlertCircle className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label">En retard</div>
          <div className="kpi-value text-danger">{stats.enRetard}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-info-soft">
            <Users className="w-5 h-5 text-info" />
          </div>
          <div className="kpi-label">Inspecteurs</div>
          <div className="kpi-value">{stats.totalInspecteurs}</div>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher une formation..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>

          <select
            value={filters.type}
            onChange={(e) => setFilters({...filters, type: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous types</option>
            {TYPES_FORMATION.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>

          <select
            value={filters.statut}
            onChange={(e) => setFilters({...filters, statut: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous statuts</option>
            <option value="planifiee">Planifiée</option>
            <option value="en_cours">En cours</option>
            <option value="terminee">Terminée</option>
          </select>

          <select
            value={filters.inspecteur}
            onChange={(e) => setFilters({...filters, inspecteur: e.target.value})}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous inspecteurs</option>
            {listeInspecteurs.map(ins => (
              <option key={ins.id} value={ins.id}>{ins.prenom} {ins.nom}</option>
            ))}
          </select>

          <div className="view-toggle">
            <button className={viewMode === 'dashboard' ? 'active' : ''} onClick={() => setViewMode('dashboard')}>
              <Activity className="w-4 h-4" /> Dashboard
            </button>
            <button className={viewMode === 'liste' ? 'active' : ''} onClick={() => setViewMode('liste')}>
              <List className="w-4 h-4" /> Formations
            </button>
            <button className={viewMode === 'calendrier' ? 'active' : ''} onClick={() => setViewMode('calendrier')}>
              <Calendar className="w-4 h-4" /> Calendrier
            </button>
            <button className={viewMode === 'matrice' ? 'active' : ''} onClick={() => setViewMode('matrice')}>
              <Grid3x3 className="w-4 h-4" /> Compétences
            </button>
            <button className={viewMode === 'echeances' ? 'active' : ''} onClick={() => setViewMode('echeances')}>
              <Clock className="w-4 h-4" /> Échéances
            </button>
            <button className={viewMode === 'suggestions' ? 'active' : ''} onClick={() => setViewMode('suggestions')}>
              <Sparkles className="w-4 h-4" /> Suggestions
            </button>
          </div>
        </div>
      </Card>

      {/* Vue Calendrier */}
      {viewMode === 'calendrier' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalendarPeriod('mois')}
                className={`btn btn-sm px-3 py-1 ${calendarPeriod === 'mois' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Mois
              </button>
              <button
                onClick={() => setCalendarPeriod('six_mois')}
                className={`btn btn-sm px-3 py-1 ${calendarPeriod === 'six_mois' ? 'btn-primary' : 'btn-secondary'}`}
              >
                6 mois
              </button>
              <button
                onClick={() => setCalendarPeriod('annee')}
                className={`btn btn-sm px-3 py-1 ${calendarPeriod === 'annee' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Année
              </button>
              <div className="w-px h-6 bg-border mx-1" />
              <button
                className="btn btn-secondary btn-sm px-3 py-1"
                onClick={() => setCalendarDate(new Date())}
              >
                Aujourd'hui
              </button>
            </div>
          </div>

          <div className={`grid gap-6 ${calendarPeriod === 'mois' ? 'grid-cols-1' : calendarPeriod === 'six_mois' ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {getCalendarData.months.map(m => {
              const key = `${m.year}-${String(m.index + 1).padStart(2, '0')}`;
              const monthFormations = getCalendarData.formationsByMonth[key] || [];
              const joursDansMois = new Date(m.year, m.index + 1, 0).getDate();
              const premierJour = new Date(m.year, m.index, 1).getDay();

              return (
                <Card key={key} className="border-border" title={m.label} badge={<span className="badge outline">{monthFormations.length} formation(s)</span>}>
                    {/* En-tête des jours */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {['Di','Lu','Ma','Me','Je','Ve','Sa'].map(j => (
                        <div key={j} className="text-center text-[10px] text-muted-foreground font-medium py-1">{j}</div>
                      ))}
                    </div>
                    {/* Grille des jours */}
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: premierJour }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-8" />
                      ))}
                      {Array.from({ length: joursDansMois }).map((_, i) => {
                        const jour = i + 1;
                        const dateStr = `${m.year}-${String(m.index + 1).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
                        const fDuJour = monthFormations.filter(f => f.date === dateStr);
                        return (
                          <div
                            key={jour}
                            className={`h-8 rounded-lg text-[10px] p-0.5 overflow-hidden cursor-pointer transition-colors hover:bg-role-primary-soft ${
                              fDuJour.length > 0 ? 'bg-role-primary/10 font-medium' : ''
                            }`}
                          >
                            <span className={`${fDuJour.length > 0 ? 'text-role-primary' : 'text-muted-foreground'}`}>{jour}</span>
                            {fDuJour.length > 0 && (
                              <div className="flex gap-0.5 mt-0.5">
                                {fDuJour.map(f => (
                                  <div
                                    key={f.id}
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      f.statut === 'planifiee' ? 'bg-primary' :
                                      f.statut === 'en_cours' ? 'bg-warning' : 'bg-success'
                                    }`}
                                    title={f.titre}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Liste des formations du mois */}
                    {monthFormations.length > 0 && (
                      <div className="mt-3 space-y-2 pt-2 border-t border-border"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={async (e) => {
                          e.preventDefault();
                          const fid = e.dataTransfer.getData('formationId');
                          if (fid) await updateFormation(fid, { date: `${key}-01` } as any)
                        }}
                      >
                        <p className="text-xs font-medium text-muted-foreground">Formations du mois :</p>
                        {monthFormations.map(f => {
                          const ins = f.participants.map((pId: string) => {
                            const i = getInspecteur(pId);
                            return i ? `${i.prenom} ${i.nom}` : pId;
                          }).join(', ');
                          return (
                             <div key={f.id} className="flex items-center justify-between p-2 rounded-lg bg-role-primary-soft cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                               draggable
                               onDragStart={(e) => { e.dataTransfer.setData('formationId', f.id); e.currentTarget.classList.add('opacity-50'); }}
                               onDragEnd={(e) => e.currentTarget.classList.remove('opacity-50')}
                             >
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{f.titre}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{ins}</p>
                              </div>
                              <span className={getStatutBadge(f.statut).className}>{getStatutBadge(f.statut).label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Vue Matrice */}
      {viewMode === 'matrice' && (
        <Card title="Matrice de compétences" size="lg">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2">Inspecteur</th>
                    {DOMAINES_COMPETENCE.map(d => (
                      <th key={d.id} className="text-center px-3 py-2">{d.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listeInspecteurs.map(ins => {
                    const matrice = formationUtils.calculerMatriceCompetences(
                      ins as unknown as Inspecteur,
                      listeFormations as Formation[],
                      (ins.competences || []) as Competence[]
                    );
                    return (
                      <tr key={ins.id} className="hover:bg-role-primary-soft transition-colors">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-role-gradient flex items-center justify-center text-white text-xs font-semibold">
                              {getInitials(ins.prenom, ins.nom)}
                            </div>
                            <div>
                              <p className="font-medium">{ins.prenom} {ins.nom}</p>
                              <p className="text-xs text-muted-foreground">{ins.matricule}</p>
                            </div>
                          </div>
                        </td>
                        {DOMAINES_COMPETENCE.map(d => {
                          const comp = matrice[d.id];
                          return (
                            <td key={d.id} className="text-center px-3 py-2">
                              {comp ? (
                                <div className="flex flex-col items-center">
                                  <span className="badge success mb-1">{getNiveauLabel(comp.niveau)}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {comp.date ? new Date(comp.date).toLocaleDateString('fr-FR') : '-'}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </Card>
      )}

      {/* Vue Liste avec accordéons par inspecteur > type */}
      {viewMode === 'liste' && (
        <div className="space-y-4">
          {listeInspecteurs.map(ins => {
            const grouped = formationsParInspecteurEtType[ins.id];
            const totalCount = (grouped?.planifiees?.length || 0) + (grouped?.en_cours?.length || 0) + (grouped?.terminees?.length || 0);
            const isExpanded = expandedInspectors[ins.id] !== false;

            return (
              <Card key={ins.id} className="overflow-hidden border-border">
                {/* Header inspecteur */}
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-role-primary/5 to-transparent border-b border-border hover:bg-role-primary/10 transition-all cursor-pointer"
                  onClick={() => toggleInspector(ins.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleInspector(ins.id); } }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-role-gradient flex items-center justify-center text-white font-semibold text-sm">
                      {getInitials(ins.prenom, ins.nom)}
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{ins.prenom} {ins.nom}</p>
                      <p className="text-xs text-muted-foreground">
                        {ins.matricule} • {formationUtils.formatService(ins.service)} • {formationUtils.formatTypeInspecteur(ins.type)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {totalCount > 0 ? (
                      <div className="flex items-center gap-1.5">
                        {grouped.planifiees.length > 0 && <span className="badge primary text-[10px]">{grouped.planifiees.length} planifiée(s)</span>}
                        {grouped.en_cours.length > 0 && <span className="badge warning text-[10px]">{grouped.en_cours.length} en cours</span>}
                        {grouped.terminees.length > 0 && <span className="badge success text-[10px]">{grouped.terminees.length} terminée(s)</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Aucune formation</span>
                    )}
                    <div className="flex gap-1 border-l border-border pl-3 ml-1">
                      <button className="action-button" onClick={(e) => { e.stopPropagation(); handleViewInspecteur(ins.id); }} title="Voir"><Eye className="w-4 h-4"/></button>
                      {canManage && <button className="action-button" onClick={(e) => { e.stopPropagation(); setActiveModule('utilisateurs'); }} title="Modifier"><PenSquare className="w-4 h-4"/></button>}
                      {canManage && <button className="action-button danger" onClick={(e) => { e.stopPropagation(); handleDeleteInspecteur(ins.id); }} title="Supprimer"><Trash2 className="w-4 h-4"/></button>}
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Contenu accordéon */}
                {isExpanded && totalCount > 0 && (
                  <div className="p-4 space-y-4">
                    {/* Planifiées */}
                    {grouped.planifiees.length > 0 && (
                      <div className="space-y-2">
                        <button
                          className="flex items-center gap-2 text-sm font-medium text-primary cursor-pointer"
                          onClick={() => toggleType(`planifiee-${ins.id}`)}
                        >
                          {expandedTypes[`planifiee-${ins.id}`] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          Planifiées ({grouped.planifiees.length})
                        </button>
                        {expandedTypes[`planifiee-${ins.id}`] !== false && (
                          <div className="space-y-2 pl-4">
                            {grouped.planifiees.map((f: Formation) => {
                              const expiree = estExpiree(f);
                              return (
                                <Card key={f.id} variant={expiree ? 'level' : undefined} levelColor={expiree ? 'danger' : undefined} className={expiree ? 'border-l-danger' : 'hover:shadow-role-glow'}>
                                    <div className="flex items-start justify-between flex-wrap gap-3">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                          <span className="code-oaci-badge text-xs">{f.reference}</span>
                                          <span className="badge primary">Planifiée</span>
                                          <span className="badge outline text-[10px]">{getTypeBadge(f.type)}</span>
                                          {expiree && <span className="badge danger pulse text-[10px]">Échue</span>}
                                        </div>
                                        <h4 className="text-sm font-medium mb-1">{f.titre}</h4>
                                        <p className="text-xs text-muted-foreground line-clamp-1">{f.objectifs}</p>
                                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
                                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{f.date ? new Date(f.date).toLocaleDateString('fr-FR') : '-'}</span>
                                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{f.duree_heures}h</span>
                                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{f.lieu}</span>
                                        </div>
                                      </div>
                                      <FormationActions f={f} />
                                    </div>
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* En cours */}
                    {grouped.en_cours.length > 0 && (
                      <div className="space-y-2">
                        <button
                          className="flex items-center gap-2 text-sm font-medium text-warning cursor-pointer"
                          onClick={() => toggleType(`en_cours-${ins.id}`)}
                        >
                          {expandedTypes[`en_cours-${ins.id}`] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          En cours ({grouped.en_cours.length})
                        </button>
                        {expandedTypes[`en_cours-${ins.id}`] !== false && (
                          <div className="space-y-2 pl-4">
                            {grouped.en_cours.map((f: Formation) => (
                              <Card key={f.id} variant="level" levelColor="warning" className="hover:shadow-role-glow">
                                  <div className="flex items-start justify-between flex-wrap gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="code-oaci-badge text-xs">{f.reference}</span>
                                        <span className="badge warning">En cours</span>
                                        <span className="badge outline text-[10px]">{getTypeBadge(f.type)}</span>
                                      </div>
                                      <h4 className="text-sm font-medium mb-1">{f.titre}</h4>
                                      <p className="text-xs text-muted-foreground line-clamp-1">{f.objectifs}</p>
                                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
                                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{f.date ? new Date(f.date).toLocaleDateString('fr-FR') : '-'}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{f.duree_heures}h</span>
                                      </div>
                                    </div>
                                    <FormationActions f={f} />
                                  </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Terminées */}
                    {grouped.terminees.length > 0 && (
                      <div className="space-y-2">
                        <button
                          className="flex items-center gap-2 text-sm font-medium text-success cursor-pointer"
                          onClick={() => toggleType(`terminee-${ins.id}`)}
                        >
                          {expandedTypes[`terminee-${ins.id}`] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          Terminées ({grouped.terminees.length})
                        </button>
                        {expandedTypes[`terminee-${ins.id}`] !== false && (
                          <div className="space-y-2 pl-4">
                            {grouped.terminees.map((f: Formation) => (
                              <Card key={f.id} variant="level" levelColor="success" className="hover:shadow-role-glow">
                                  <div className="flex items-start justify-between flex-wrap gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="code-oaci-badge text-xs">{f.reference}</span>
                                        <span className="badge success">Terminée</span>
                                        <span className="badge outline text-[10px]">{getTypeBadge(f.type)}</span>
                                        {f.certificat && <span className="badge success text-[10px]">Certificat</span>}
                                      </div>
                                      <h4 className="text-sm font-medium mb-1">{f.titre}</h4>
                                      <p className="text-xs text-muted-foreground line-clamp-1">{f.objectifs}</p>
                                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-1">
                                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{f.date ? new Date(f.date).toLocaleDateString('fr-FR') : '-'}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{f.duree_heures}h</span>
                                      </div>
                                      {f.evaluation && f.evaluation[ins.id] && (
                                        <div className="mt-1 flex items-center gap-1">
                                          <Star className="w-3 h-3 fill-warning text-warning" />
                                          <span className="text-[10px] font-medium">{f.evaluation[ins.id]}/5</span>
                                        </div>
                                      )}
                                    </div>
                                    <FormationActions f={f} />
                                  </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Vue Grille avec accordéons par inspecteur > type */}
      {viewMode === 'grille' && (
        <div className="space-y-4">
          {listeInspecteurs.map(ins => {
            const grouped = formationsParInspecteurEtType[ins.id];
            const totalCount = (grouped?.planifiees?.length || 0) + (grouped?.en_cours?.length || 0) + (grouped?.terminees?.length || 0);
            const isExpanded = expandedInspectors[ins.id] !== false;

            return (
              <Card key={ins.id} className="overflow-hidden border-border">
                <button
                  className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-role-primary/5 to-transparent border-b border-border hover:bg-role-primary/10 transition-all cursor-pointer"
                  onClick={() => toggleInspector(ins.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-role-gradient flex items-center justify-center text-white font-semibold text-sm">
                      {getInitials(ins.prenom, ins.nom)}
                    </div>
                    <div className="text-left">
                      <p className="font-medium">{ins.prenom} {ins.nom}</p>
                      <p className="text-xs text-muted-foreground">{ins.matricule}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {totalCount > 0 ? (
                      <div className="flex items-center gap-1.5">
                        {grouped.planifiees.length > 0 && <span className="badge primary text-[10px]">{grouped.planifiees.length} planifiée(s)</span>}
                        {grouped.terminees.length > 0 && <span className="badge success text-[10px]">{grouped.terminees.length} terminée(s)</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Aucune formation</span>
                    )}
                    <div className="flex gap-1 border-l border-border pl-3 ml-1">
                      <button className="action-button" onClick={(e) => { e.stopPropagation(); handleViewInspecteur(ins.id); }} title="Voir"><Eye className="w-4 h-4"/></button>
                      {canManage && <button className="action-button" onClick={(e) => { e.stopPropagation(); setActiveModule('utilisateurs'); }} title="Modifier"><PenSquare className="w-4 h-4"/></button>}
                      {canManage && <button className="action-button danger" onClick={(e) => { e.stopPropagation(); handleDeleteInspecteur(ins.id); }} title="Supprimer"><Trash2 className="w-4 h-4"/></button>}
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && totalCount > 0 && (
                  <div className="p-4 space-y-4">
                    {[
                      { key: 'planifiee', label: 'Planifiées', data: grouped.planifiees, icon: Calendar, color: 'primary' as const },
                      { key: 'en_cours', label: 'En cours', data: grouped.en_cours, icon: Clock, color: 'warning' as const },
                      { key: 'terminee', label: 'Terminées', data: grouped.terminees, icon: CheckCircle2, color: 'success' as const },
                    ].map(section => {
                      if (section.data.length === 0) return null;
                      return (
                        <div key={section.key} className="space-y-2">
                          <button
                            className="flex items-center gap-2 text-sm font-medium cursor-pointer"
                            style={{ color: `var(--${section.color})` }}
                            onClick={() => toggleType(`${section.key}-grid-${ins.id}`)}
                          >
                            {expandedTypes[`${section.key}-grid-${ins.id}`] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            {section.label} ({section.data.length})
                          </button>
                          {expandedTypes[`${section.key}-grid-${ins.id}`] !== false && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pl-4">
                              {section.data.map((f: Formation) => {
                                const expiree = estExpiree(f);
                                return (
                                  <Card key={f.id} size="sm" className={`hover:shadow-role-glow transition-all ${expiree ? 'border-l-4 border-l-danger' : ''}`}
                                    heading={
                                      <div className="flex items-center justify-between w-full text-xs">
                                        <span className="flex items-center gap-1"><section.icon className="w-3 h-3" />{getTypeBadge(f.type)}</span>
                                        {expiree && <span className="badge danger text-[8px]">Échue</span>}
                                      </div>
                                    }
                                  >
                                      <p className="code-oaci-badge text-[10px]">{f.reference}</p>
                                      <p className="text-xs font-medium line-clamp-1">{f.titre}</p>
                                      <div className="text-[10px] text-muted-foreground space-y-1">
                                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />{f.date ? new Date(f.date).toLocaleDateString('fr-FR') : '-'}</div>
                                        <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{f.duree_heures}h</div>
                                      </div>
                                      {f.certificat && <span className="badge success text-[8px]">Certificat</span>}
                                      <div className="flex items-center justify-end gap-1 pt-1 border-t border-border">
                                        <FormationActions f={f} />
                                      </div>
                                  </Card>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {viewMode === 'dashboard' && (
        <div className="space-y-6 animate-fade-up">
          <div className="kpi-grid">
            <div className="kpi-card"><div className="kpi-icon"><Calendar className="w-5 h-5" /></div><div className="kpi-content"><div className="kpi-value">{stats.formationsCount}</div><div className="kpi-label">Formations</div></div></div>
            <div className="kpi-card"><div className="kpi-icon"><Clock className="w-5 h-5 text-warning" /></div><div className="kpi-content"><div className="kpi-value">{stats.planifiees}</div><div className="kpi-label">Planifiées</div></div></div>
            <div className="kpi-card"><div className="kpi-icon"><PlayCircle className="w-5 h-5 text-role-primary" /></div><div className="kpi-content"><div className="kpi-value">{stats.enCours}</div><div className="kpi-label">En cours</div></div></div>
            <div className="kpi-card"><div className="kpi-icon"><CheckCircle2 className="w-5 h-5 text-success" /></div><div className="kpi-content"><div className="kpi-value">{stats.terminees}</div><div className="kpi-label">Terminées</div></div></div>
            <div className="kpi-card"><div className="kpi-icon"><TrendingUp className="w-5 h-5 text-role-primary" /></div><div className="kpi-content"><div className="kpi-value">{stats.tauxCompletion}%</div><div className="kpi-label">Taux complétion</div></div></div>
            <div className="kpi-card"><div className="kpi-icon"><BarChart3 className="w-5 h-5" /></div><div className="kpi-content"><div className="kpi-value">{stats.budgetTotal.toLocaleString()} F</div><div className="kpi-label">Budget</div></div></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card title="Formations à venir / en cours" icon={<Calendar className="w-4 h-4" />}>
                {(() => {
                  const upcoming = listeFormations
                    .filter(f => f.statut === 'planifiee' || f.statut === 'en_cours')
                    .sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime())
                    .slice(0, 5);
                  return upcoming.length > 0 ? (
                    <div className="space-y-3">
                      {upcoming.map(f => (
                        <div key={f.id} className="flex items-start justify-between p-3 rounded-lg bg-role-primary-soft/50 hover:bg-role-primary-soft transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="code-oaci-badge text-xs">{f.reference}</span>
                              <span className={getStatutBadge(f.statut).className}>{getStatutBadge(f.statut).label}</span>
                            </div>
                            <p className="text-sm font-medium truncate">{f.titre}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.date ? new Date(f.date).toLocaleDateString('fr-FR') : '-'} &bull; {f.duree_heures}h
                            </p>
                          </div>
                          <FormationActions f={f} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-8">Aucune formation à venir</p>
                  );
                })()}
              </Card>
            </div>
            <div className="lg:col-span-1">
              <Card title="Exécution des formations" icon={<PieChart className="w-4 h-4" />}>
                <FormationPieChart
                  data={[
                    { name: 'Planifié', value: stats.planifiees },
                    { name: 'En cours', value: stats.enCours },
                    { name: 'Terminé', value: stats.terminees },
                    { name: 'En retard', value: stats.enRetard },
                  ]}
                  nameKey="name"
                  valueKey="value"
                  height={280}
                  colors={['#3b82f6', '#f59e0b', '#10b981', '#ef4444']}
                />
              </Card>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card title="Inspecteurs" icon={<Users className="w-4 h-4" />}>
                {listeInspecteurs.slice(0, 6).map(ins => {
                  const domaine = DOMAINES_COMPETENCE.find(d => d.id === ins.domaine_principal);
                  return (
                    <div key={ins.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-role-primary-soft transition-colors">
                      <div className="w-9 h-9 rounded-full bg-blue-950 flex items-center justify-center text-white font-semibold text-xs shrink-0">
                        {getInitials(ins.prenom, ins.nom)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{ins.prenom} {ins.nom}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {getNiveauLabel(ins.type)}{domaine ? ` · ${domaine.label.split(' (')[0]}` : ''}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button className="action-button" onClick={() => { handleViewInspecteur(ins.id); }} title="Voir">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="action-button" onClick={() => { handleEditInspecteur(ins); }} title="Modifier">
                          <PenSquare className="w-4 h-4" />
                        </button>
                        <button className="action-button danger" onClick={() => { handleDeleteInspecteur(ins.id); }} title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            </div>
            <div className="lg:col-span-2">
              <EcheanceAlert userRole={userRole} />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button className="btn btn-secondary gap-2" onClick={() => {
              const h = 'Référence;Titre;Type;Date;Durée;Lieu;Formateur;Statut;Participants\n'
              const rows = listeFormations.map(f => `${f.reference};${f.titre};${f.type};${f.date};${f.duree_heures};${f.lieu||''};${f.formateur||''};${f.statut};${(f.participants||[]).join(',')}`).join('\n')
              const b = new Blob(['\uFEFF' + h + rows], { type: 'text/csv;charset=utf-8' }); const u = URL.createObjectURL(b)
              const a = document.createElement('a'); a.href = u; a.download = 'plan_formation.csv'; a.click(); URL.revokeObjectURL(u)
            }}><Download className="w-4 h-4" /> Export CSV</button>
          </div>
        </div>
      )}
      {viewMode === 'echeances' && <EcheanceAlert userRole={userRole} />}
      {viewMode === 'suggestions' && <FormationSuggestions userRole={userRole} />}
      {showDetails && selectedFormation && (() => {
        const f = listeFormations.find(x => x.id === selectedFormation); if (!f) return null
        const participants = f.participants?.map(pid => getInspecteur(pid)).filter(Boolean) || []
        const formateur = utilisateurs.find(u => u.id === f.formateur || u.nom === f.formateur)
        return (<FormShell open={showDetails} onClose={() => { setShowDetails(false); setSelectedFormation(null) }} title={`${f.titre} — ${f.reference}`} icon={GraduationCap} size="3xl" dataRole={userRole} footer={<button className="btn btn-secondary" onClick={() => { setShowDetails(false); setSelectedFormation(null) }}>Fermer</button>}>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-role-primary-soft rounded-xl"><p className="text-xs text-muted-foreground">Type</p><p className="font-medium capitalize">{f.type}</p></div>
              <div className="p-3 bg-role-primary-soft rounded-xl"><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{new Date(f.date).toLocaleDateString('fr-FR')}</p></div>
              <div className="p-3 bg-role-primary-soft rounded-xl"><p className="text-xs text-muted-foreground">Durée</p><p className="font-medium">{f.duree_heures}h</p></div>
              <div className="p-3 bg-role-primary-soft rounded-xl"><p className="text-xs text-muted-foreground">Lieu</p><p className="font-medium">{f.lieu || '—'}</p></div>
              <div className="p-3 bg-role-primary-soft rounded-xl"><p className="text-xs text-muted-foreground">Formateur</p><p className="font-medium">{formateur ? `${formateur.prenom} ${formateur.nom}` : f.formateur || '—'}</p></div>
              <div className="p-3 bg-role-primary-soft rounded-xl"><p className="text-xs text-muted-foreground">Budget</p><p className="font-medium">{f.budget ? `${f.budget.toLocaleString()} FCFA` : '—'}</p></div>
              <div className="p-3 bg-role-primary-soft rounded-xl col-span-2"><p className="text-xs text-muted-foreground">Objectifs</p><p className="text-sm">{f.objectifs || 'Aucun objectif défini'}</p></div>
            </div>
            {participants.length > 0 && (
              <div><p className="text-xs font-semibold text-role-primary uppercase mb-2">Participants</p>
                <div className="space-y-2">{participants.map(p => p && <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-role-primary-soft"><div><p className="text-sm font-medium">{p.prenom} {p.nom}</p><p className="text-xs text-muted-foreground">{p.service} • {p.poste || 'Inspecteur'}</p></div>{f.presence?.[p.id] && <span className={`badge ${f.presence[p.id] === 'present' ? 'success' : f.presence[p.id] === 'absent' ? 'danger' : 'warning'}`}>{f.presence[p.id]}</span>}</div>)}</div>
              </div>
            )}
            {f.evaluation && Object.keys(f.evaluation).length > 0 && (
              <div><p className="text-xs font-semibold text-role-primary uppercase mb-2">Évaluations</p>
                <div className="grid grid-cols-2 gap-2">{Object.entries(f.evaluation).map(([k, v]) => <div key={k} className="flex items-center justify-between p-2 rounded-lg bg-role-primary-soft"><span className="text-sm">{k}</span><span className="text-sm font-bold text-role-primary">{v}/5</span></div>)}</div>
              </div>
            )}
            {f.documents && f.documents.length > 0 && (
              <div><p className="text-xs font-semibold text-role-primary uppercase mb-2">Documents</p>
                <div className="space-y-2">{f.documents.map((d, i) => <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-role-primary-soft"><span className="text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-role-primary" />{d.nom}</span><a href={d.url} target="_blank" rel="noreferrer" download><button className="btn btn-sm btn-primary gap-1.5"><Download className="w-3.5 h-3.5" />Télécharger</button></a></div>)}</div>
              </div>
            )}
          </div>
        </FormShell>)
      })()}
      {/* Modales */}
      {showForm && FormationFormModal()}
      {showInspecteurForm && InspecteurFormModal()}
      {showInspecteurFiche && InspecteurFicheModal()}

      {/* Modal Exécuter */}
      <FormShell
        open={showExecuteModal}
        onClose={() => { setShowExecuteModal(false); setSelectedFormation(null); }}
        title="Exécuter la formation"
        icon={PlayCircle}
        size="md"
        dataRole={userRole}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowExecuteModal(false); setSelectedFormation(null); }}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={handleConfirmExecute}>
              Démarrer la formation
            </button>
          </>
        }
      >
        <div className="space-y-4 p-2">
          <div className="flex items-center gap-3 p-3 bg-warning-soft rounded-lg">
            <PlayCircle className="w-6 h-6 text-warning" />
            <p className="text-sm">La formation va passer en statut "En cours". Confirmez le démarrage.</p>
          </div>
          <div className="form-field">
            <label className="filter-label text-role-primary">Date de début effective</label>
            <input
              type="date"
              className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
              value={executeDate}
              onChange={(e) => setExecuteDate(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="filter-label text-role-primary">Durée (heures)</label>
            <input
              type="number"
              min="1"
              className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
              value={executeDuree}
              onChange={(e) => setExecuteDuree(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      </FormShell>

      {/* Modal Certificat */}
      <FormShell
        open={showCertifModal}
        onClose={() => { setShowCertifModal(false); setCertifFile(null); setSelectedFormation(null); }}
        title="Ajouter un certificat"
        icon={Award}
        size="md"
        dataRole={userRole}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowCertifModal(false); setCertifFile(null); setSelectedFormation(null); }}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={handleUploadCertificat} disabled={!certifFile}>
              Valider le certificat
            </button>
          </>
        }
      >
        <div className="space-y-4 p-2">
          <div className="flex items-center gap-3 p-3 bg-success-soft rounded-lg">
            <Award className="w-6 h-6 text-success" />
            <p className="text-sm">Ajoutez le certificat de formation pour marquer la formation comme terminée.</p>
          </div>
          <div className="form-field">
            <label className="filter-label text-role-primary">Fichier certificat</label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:bg-role-primary/5 transition-all">
              <input
                type="file"
                accept=".pdf,.jpg,.png"
                className="hidden"
                id="certif-upload"
                onChange={(e) => setCertifFile(e.target.files?.[0] || null)}
              />
              <label htmlFor="certif-upload" className="cursor-pointer">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  {certifFile ? certifFile.name : 'Cliquez pour sélectionner un fichier (PDF, JPG, PNG)'}
                </p>
              </label>
            </div>
          </div>
        </div>
      </FormShell>

      {/* Modal Modifier dates */}
      <FormShell
        open={showDateModal}
        onClose={() => { setShowDateModal(false); setSelectedFormation(null); }}
        title="Modifier les dates"
        icon={RotateCcw}
        size="md"
        dataRole={userRole}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowDateModal(false); setSelectedFormation(null); }}>
              Annuler
            </button>
            <button type="button" className="btn btn-primary" onClick={handleConfirmDates}>
              Enregistrer
            </button>
          </>
        }
      >
        <div className="space-y-4 p-2">
          <div className="flex items-center gap-3 p-3 bg-primary-soft rounded-lg">
            <RotateCcw className="w-6 h-6 text-primary" />
            <p className="text-sm">Modifiez la date et la durée de la formation planifiée.</p>
          </div>
          <div className="form-field">
            <label className="filter-label text-role-primary">Nouvelle date</label>
            <input
              type="date"
              className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="filter-label text-role-primary">Nouvelle durée (heures)</label>
            <input
              type="number"
              min="1"
              className={`form-input w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
              value={newDuree}
              onChange={(e) => setNewDuree(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
      </FormShell>

      <DeleteConfirmationDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={handleConfirmDeleteInspecteur}
        title="Supprimer l'inspecteur"
        description="Cette action est irréversible. Le compte utilisateur, les formations et les données associées seront également supprimés."
        itemName={deletingInspecteurId ? `${inspecteurs.find(i => i.id === deletingInspecteurId)?.prenom} ${inspecteurs.find(i => i.id === deletingInspecteurId)?.nom}` : undefined}
        warnings={[
          "Le compte utilisateur sera définitivement supprimé",
          "L'inspecteur sera retiré des formations planifiées/en cours",
          "L'inspecteur sera retiré des équipes de surveillance"
        ]}
      />
    </div>
  );
}
