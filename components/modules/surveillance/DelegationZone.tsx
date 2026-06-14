// components/modules/surveillance/DelegationZone.tsx
'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Users,
  Target,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Plus,
  Trash2,
  Edit3,
  Eye,
  GripVertical,
  UserCheck,
  Clock,
  Save,
  RefreshCw,
  BarChart3,
  Bell,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';
import {
  DOMAINES_SURVEILLANCE,
  TYPES_SURVEILLANCE,
  DomaineCode,
  TypeSurveillanceContinue,
  getDomaineInfo,
  getTypeSurveillanceInfo,
  getTypeSurveillanceLabel,
} from '@/lib/domaines';

// Types
export interface DomaineDisponible {
  id: string;
  nom: string;
  itemsCount: number;
  itemsIds: string[];
  priorite: 'haute' | 'moyenne' | 'basse';
  description?: string;
  domaine?: DomaineCode;
}

export interface InspecteurDisponible {
  id: string;
  prenom: string;
  nom: string;
  competences: string[];
  chargeActuelle: number;
  estChef: boolean;
  estDisponible: boolean;
  derniereActivite?: string;
}

export interface DelegationAssignee {
  id: string;
  domaineId: string;
  domaineNom: string;
  domaineCode: DomaineCode;
  typeSurveillance: TypeSurveillanceContinue;
  inspecteurId: string;
  inspecteurNom: string;
  itemsIds: string[];
  itemsCount: number;
  assigneLe: string;
  progression: number;
  statut: 'en_cours' | 'termine' | 'bloque';
  itemsVerifies: number;
  itemsNonConformes: number;
  alertes: DelegationAlerte[];
}

export interface DelegationAlerte {
  id: string;
  type: 'retard' | 'non_conformite' | 'blocage' | 'seuil_critique';
  message: string;
  dateCreation: string;
  lu: boolean;
  domaineCode: DomaineCode;
}

export interface StatsInspecteur {
  inspecteurId: string;
  nom: string;
  domainesAssignes: number;
  progressionMoyenne: number;
  itemsTotal: number;
  itemsVerifies: number;
  itemsNonConformes: number;
  alertesActives: number;
  statut: 'en_avance' | 'dans_les_delais' | 'en_retard' | 'bloque';
}

export interface DelegationZoneProps {
  surveillanceId: string;
  typeSurveillance: TypeSurveillanceContinue;
  domaines: DomaineDisponible[];
  inspecteurs: InspecteurDisponible[];
  delegationsExistantes?: DelegationAssignee[];
  onDelegationChange?: (delegations: DelegationAssignee[]) => void;
  readOnly?: boolean;
  userRole?: string;
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

const MOCK_INSPECTEURS: InspecteurDisponible[] = [
  { id: 'insp-001', prenom: 'Mamadou', nom: 'Diop', competences: ['SGS', 'OLS', 'PHY', 'AGA'], chargeActuelle: 2, estChef: true, estDisponible: true },
  { id: 'insp-002', prenom: 'Fatou', nom: 'Ndiaye', competences: ['SLI', 'RA', 'OPS'], chargeActuelle: 1, estChef: false, estDisponible: true },
  { id: 'insp-003', prenom: 'Ibrahima', nom: 'Sow', competences: ['ELEC', 'MFP', 'PHY'], chargeActuelle: 0, estChef: false, estDisponible: true },
  { id: 'insp-004', prenom: 'Aissatou', nom: 'Ba', competences: ['COP', 'SGS', 'OPS'], chargeActuelle: 0, estChef: false, estDisponible: false, derniereActivite: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
];

function getTypeBadge(type: TypeSurveillanceContinue) {
  const colors: Record<TypeSurveillanceContinue, string> = {
    periodique: 'badge primary',
    inopine: 'badge warning',
    maintien: 'badge neutral',
  };
  const labels: Record<TypeSurveillanceContinue, string> = {
    periodique: 'Périodique',
    inopine: 'Inopinée',
    maintien: 'Maintien',
  };
  return <span className={`${colors[type]} text-[10px]`}>{labels[type]}</span>;
}

function getPrioriteBadge(priorite: 'haute' | 'moyenne' | 'basse') {
  switch (priorite) {
    case 'haute':
      return <span className="badge danger text-[10px]">Priorité haute</span>;
    case 'moyenne':
      return <span className="badge warning text-[10px]">Priorité moyenne</span>;
    default:
      return <span className="badge neutral text-[10px]">Priorité basse</span>;
  }
}

function getDomaineBadge(code: DomaineCode) {
  return (
    <span className="inline-flex items-center justify-center w-10 h-6 rounded-md text-[10px] font-bold bg-role-primary text-white tracking-wide">
      {code}
    </span>
  );
}

function DomaineCard({
  domaine,
  isDragging,
  onDragStart,
  onDragEnd,
  onAssign,
  typeSurveillance,
}: {
  domaine: DomaineDisponible;
  isDragging: boolean;
  onDragStart: (domaine: DomaineDisponible) => void;
  onDragEnd: () => void;
  onAssign: (domaine: DomaineDisponible) => void;
  typeSurveillance: TypeSurveillanceContinue;
}) {
  return (
    <div
      className="border rounded-lg p-3 mb-2 cursor-grab transition-all bg-white hover:shadow-md hover:border-role-primary"
      draggable
      onDragStart={() => onDragStart(domaine)}
      onDragEnd={onDragEnd}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
          {domaine.domaine && getDomaineBadge(domaine.domaine)}
          <span className="font-semibold text-sm text-foreground">{domaine.nom}</span>
          {getPrioriteBadge(domaine.priorite)}
        </div>
        <button
          onClick={() => onAssign(domaine)}
          className="btn btn-sm px-3 py-1 btn-primary"
          title="Assigner manuellement"
        >
          <UserCheck className="w-3 h-3" />
        </button>
      </div>
      <div className="ml-6 mt-1">
        <p className="text-xs text-muted-foreground">{domaine.description || `${domaine.itemsCount} items à vérifier`}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="badge neutral text-[10px]">{domaine.itemsCount} items</span>
          {getTypeBadge(typeSurveillance)}
        </div>
      </div>
    </div>
  );
}

function InspecteurCard({
  inspecteur,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  assignedDomaines,
}: {
  inspecteur: InspecteurDisponible;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent, inspecteurId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, inspecteurId: string) => void;
  assignedDomaines: DelegationAssignee[];
}) {
  const assignedDomainesList = assignedDomaines.filter(d => d.inspecteurId === inspecteur.id);
  const totalItems = assignedDomainesList.reduce((sum, d) => sum + d.itemsCount, 0);
  const totalVerifies = assignedDomainesList.reduce((sum, d) => sum + d.itemsVerifies, 0);
  const totalAlertes = assignedDomainesList.reduce((sum, d) => sum + d.alertes.filter(a => !a.lu).length, 0);
  const moyenneProgression = assignedDomainesList.length > 0
    ? Math.round(assignedDomainesList.reduce((sum, d) => sum + d.progression, 0) / assignedDomainesList.length)
    : 0;

  return (
    <div
      className={`border rounded-lg p-3 mb-3 transition-all bg-white ${
        isDragOver ? 'border-role-primary bg-role-primary/5 shadow-md' : 'border-border'
      } ${!inspecteur.estDisponible ? 'opacity-60 bg-muted/20' : ''}`}
      onDragOver={(e) => onDragOver(e, inspecteur.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, inspecteur.id)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
            inspecteur.estChef ? 'bg-role-primary' : 'bg-muted-foreground'
          }`}>
            {inspecteur.prenom.charAt(0)}{inspecteur.nom.charAt(0)}
          </div>
          <div>
            <span className="font-medium text-sm text-foreground">
              {inspecteur.prenom} {inspecteur.nom}
            </span>
            {inspecteur.estChef && (
              <span className="ml-2 badge warning text-[9px]">Chef</span>
            )}
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {inspecteur.competences.slice(0, 3).map(comp => (
                <span key={comp} className="badge outline text-[9px]">{comp}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">{assignedDomainesList.length} domaine(s)</span>
          {assignedDomainesList.length > 0 && (
            <div className="text-xs font-semibold text-role-primary">{moyenneProgression}%</div>
          )}
          {totalAlertes > 0 && (
            <div className="flex items-center gap-1 text-xs text-danger font-medium">
              <AlertTriangle className="w-3 h-3" />
              {totalAlertes}
            </div>
          )}
        </div>
      </div>

      {assignedDomainesList.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="space-y-1.5">
            {assignedDomainesList.map(deleg => (
              <div key={deleg.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {deleg.domaineCode && getDomaineBadge(deleg.domaineCode)}
                  <span className="text-muted-foreground">{deleg.domaineNom}</span>
                  {getTypeBadge(deleg.typeSurveillance)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="progress w-16 h-1.5">
                    <div
                      className={`progress-bar ${
                        deleg.progression >= 80 ? 'progress-success' :
                        deleg.progression >= 50 ? '' :
                        deleg.progression >= 25 ? 'progress-moyen' : 'progress-critique'
                      }`}
                      style={{ width: `${deleg.progression}%` }}
                    />
                  </div>
                  <span className="text-foreground font-medium w-8 text-right">{deleg.progression}%</span>
                </div>
              </div>
            ))}
          </div>
          {totalItems > 0 && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              {totalVerifies}/{totalItems} items vérifiés
            </div>
          )}
        </div>
      )}

      {!inspecteur.estDisponible && (
        <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Indisponible
        </div>
      )}
    </div>
  );
}

function StatsDashboard({
  delegations,
  inspecteurs,
}: {
  delegations: DelegationAssignee[];
  inspecteurs: InspecteurDisponible[];
}) {
  const stats: StatsInspecteur[] = useMemo(() => {
    return inspecteurs.map(insp => {
      const dels = delegations.filter(d => d.inspecteurId === insp.id);
      const itemsTotal = dels.reduce((s, d) => s + d.itemsCount, 0);
      const itemsVerifies = dels.reduce((s, d) => s + d.itemsVerifies, 0);
      const itemsNC = dels.reduce((s, d) => s + d.itemsNonConformes, 0);
      const alertes = dels.reduce((s, d) => s + d.alertes.filter(a => !a.lu).length, 0);
      const progMoy = dels.length > 0 ? Math.round(dels.reduce((s, d) => s + d.progression, 0) / dels.length) : 0;
      const bloque = dels.some(d => d.statut === 'bloque');
      const statut: StatsInspecteur['statut'] = bloque ? 'bloque' : progMoy >= 80 ? 'en_avance' : progMoy >= 40 ? 'dans_les_delais' : 'en_retard';

      return {
        inspecteurId: insp.id,
        nom: `${insp.prenom} ${insp.nom}`,
        domainesAssignes: dels.length,
        progressionMoyenne: progMoy,
        itemsTotal,
        itemsVerifies,
        itemsNonConformes: itemsNC,
        alertesActives: alertes,
        statut,
      };
    });
  }, [delegations, inspecteurs]);

  const statutColors: Record<StatsInspecteur['statut'], string> = {
    en_avance: 'badge success',
    dans_les_delais: 'badge primary',
    en_retard: 'badge warning',
    bloque: 'badge danger',
  };
  const statutLabels: Record<StatsInspecteur['statut'], string> = {
    en_avance: 'En avance',
    dans_les_delais: 'Dans les délais',
    en_retard: 'En retard',
    bloque: 'Bloqué',
  };

  const totalAlertes = stats.reduce((s, st) => s + st.alertesActives, 0);
  const progressionGlobale = stats.length > 0
    ? Math.round(stats.reduce((s, st) => s + st.progressionMoyenne, 0) / stats.filter(s => s.domainesAssignes > 0).length || 0)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-role-primary" />
          <span className="text-sm font-medium text-foreground">Progression globale</span>
          <span className="text-lg font-bold text-role-primary">{progressionGlobale}%</span>
        </div>
        {totalAlertes > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full badge danger">
            <Bell className="w-3 h-3" />
            <span className="text-xs font-medium">{totalAlertes} alerte(s)</span>
          </div>
        )}
      </div>
      <div className="progress h-2 w-full">
        <div
          className={`h-full rounded-full transition-all ${
            progressionGlobale >= 80 ? 'bg-green-500' :
            progressionGlobale >= 50 ? 'bg-blue-500' :
            progressionGlobale >= 25 ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${progressionGlobale}%` }}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {stats.filter(s => s.domainesAssignes > 0).map(s => (
          <div key={s.inspecteurId} className="border rounded-lg p-2.5 bg-white">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground truncate">{s.nom}</span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${statutColors[s.statut]}`}>
                {statutLabels[s.statut]}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {s.itemsVerifies}/{s.itemsTotal} items · {s.domainesAssignes} domaine(s)
            </div>
            {s.alertesActives > 0 && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-red-600 font-medium">
                <AlertTriangle className="w-3 h-3" />
                {s.alertesActives} alerte(s)
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Composant principal
export function DelegationZone({
  surveillanceId,
  typeSurveillance,
  domaines: domainesProp,
  inspecteurs: inspecteursProp,
  delegationsExistantes = [],
  onDelegationChange,
  readOnly = false,
  userRole = 'chef_equipe',
}: DelegationZoneProps) {
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);

  // Store delegation persistence
  const addDelegationStore     = useAppStore(s => s.addDelegation);
  const updateDelegationStore  = useAppStore(s => s.updateDelegation);
  const deleteDelegationStore  = useAppStore(s => s.deleteDelegation);
  const getDelegationsStore    = useAppStore(s => s.getDelegationsBySurveillance);
  const surveillances          = useAppStore(s => s.surveillances);
  const surveillance           = surveillances.find(s => s.id === surveillanceId);
  const aerodromeId            = surveillance?.aerodrome_id ?? '';
  const chefId                 = surveillance?.chef_id ?? user?.id ?? '';

  const [domaines, setDomaines] = useState<DomaineDisponible[]>(() => {
    if (domainesProp.length > 0) return domainesProp;
    return DOMAINES_SURVEILLANCE.map(d => ({
      id: `dom-${d.code.toLowerCase()}`,
      nom: d.code,
      itemsCount: Math.floor(Math.random() * 20) + 10,
      itemsIds: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, i) => `${d.code.toLowerCase()}-${String(i + 1).padStart(3, '0')}`),
      priorite: (d.code === 'SGS' || d.code === 'SLI' || d.code === 'RA') ? 'haute' : (d.code === 'AGA' ? 'haute' : 'moyenne'),
      description: d.label,
      domaine: d.code as DomaineCode,
    }));
  });
  const [inspecteurs] = useState<InspecteurDisponible[]>(inspecteursProp.length > 0 ? inspecteursProp : MOCK_INSPECTEURS);

  // Initialiser depuis le store (délégations déjà persistées), sinon depuis les props
  const [delegations, setDelegations] = useState<DelegationAssignee[]>(() => {
    const fromStore = getDelegationsStore(surveillanceId);
    if (fromStore.length > 0) {
      // Convertir Delegation (store) → DelegationAssignee (local)
      return fromStore.map(d => ({
        id: d.id,
        domaineId: d.domaine,
        domaineNom: d.domaine_nom ?? d.domaine,
        domaineCode: d.domaine as DomaineCode,
        typeSurveillance: (d.type_surveillance ?? typeSurveillance) as TypeSurveillanceContinue,
        inspecteurId: d.assigne_a,
        inspecteurNom: d.assigne_nom ?? d.assigne_a,
        itemsIds: d.items_ids,
        itemsCount: d.items_count ?? d.items_ids.length,
        assigneLe: d.assigne_le,
        progression: d.progression,
        statut: d.statut as DelegationAssignee['statut'],
        itemsVerifies: 0,
        itemsNonConformes: 0,
        alertes: [],
      }));
    }
    return delegationsExistantes;
  });
  const [draggedDomaine, setDraggedDomaine] = useState<DomaineDisponible | null>(null);
  const [dragOverInspecteurId, setDragOverInspecteurId] = useState<string | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedDomaine, setSelectedDomaine] = useState<DomaineDisponible | null>(null);
  const [selectedInspecteurId, setSelectedInspecteurId] = useState<string>('');
  const [selectedTypeSurveillance, setSelectedTypeSurveillance] = useState<TypeSurveillanceContinue>(typeSurveillance);
  const [isSaving, setIsSaving] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Calcul des domaines non assignés
  const domainesNonAssignes = useCallback(() => {
    const assignedDomaineIds = delegations.map(d => d.domaineId);
    return domaines.filter(d => !assignedDomaineIds.includes(d.id));
  }, [domaines, delegations]);

  // Vérifier si un inspecteur a les compétences pour un domaine
  const inspecteurEstCompetent = useCallback((inspecteur: InspecteurDisponible, domaine: DomaineDisponible): boolean => {
    if (inspecteur.competences.includes('AGA')) return true;
    return inspecteur.competences.some(comp =>
      comp === domaine.nom ||
      domaine.nom?.includes(comp) ||
      comp.includes(domaine.nom || '')
    );
  }, []);

  // Trouver les inspecteurs compétents pour un domaine
  const getInspecteursCompetents = useCallback((domaine: DomaineDisponible) => {
    return inspecteurs.filter(i =>
      i.estDisponible && inspecteurEstCompetent(i, domaine)
    );
  }, [inspecteurs, inspecteurEstCompetent]);

  // Assigner un domaine à un inspecteur
  const assignerDomaine = useCallback((domaine: DomaineDisponible, inspecteurId: string, typeSurv: TypeSurveillanceContinue) => {
    const inspecteur = inspecteurs.find(i => i.id === inspecteurId);
    if (!inspecteur) return;

    const nouvelleDelegation: DelegationAssignee = {
      id: `del-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      domaineId: domaine.id,
      domaineNom: domaine.nom,
      domaineCode: (domaine.domaine || 'SGS') as DomaineCode,
      typeSurveillance: typeSurv,
      inspecteurId: inspecteur.id,
      inspecteurNom: `${inspecteur.prenom} ${inspecteur.nom}`,
      itemsIds: domaine.itemsIds,
      itemsCount: domaine.itemsCount,
      assigneLe: new Date().toISOString(),
      progression: 0,
      statut: 'en_cours',
      itemsVerifies: 0,
      itemsNonConformes: 0,
      alertes: [],
    };

    setDelegations(prev => [...prev, nouvelleDelegation]);

    // Persister dans le store Zustand
    addDelegationStore({
      surveillance_id: surveillanceId,
      aerodrome_id: aerodromeId,
      chef_id: chefId,
      domaine: nouvelleDelegation.domaineCode,
      domaine_nom: nouvelleDelegation.domaineNom,
      type_surveillance: nouvelleDelegation.typeSurveillance,
      assigne_a: inspecteur.id,
      assigne_nom: `${inspecteur.prenom} ${inspecteur.nom}`,
      assigne_par: user?.id || '',
      items_ids: domaine.itemsIds,
      items_count: domaine.itemsCount,
      progression: 0,
      statut: 'assigne',
      assigne_le: nouvelleDelegation.assigneLe,
      derniere_activite: nouvelleDelegation.assigneLe,
      derniere_sync: nouvelleDelegation.assigneLe,
    });

    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Délégation effectuée',
      message: `Le domaine ${domaine.nom} a été assigné à ${inspecteur.prenom} ${inspecteur.nom}`,
      canal: 'in_app',
    });

    setShowAssignModal(false);
    setSelectedDomaine(null);
    setSelectedInspecteurId('');
  }, [inspecteurs, user, addNotification, addDelegationStore, surveillanceId, aerodromeId, chefId]);

  // Supprimer une délégation
  const supprimerDelegation = useCallback((delegationId: string) => {
    const delegation = delegations.find(d => d.id === delegationId);
    if (delegation && window.confirm(`Retirer ${delegation.domaineNom} de ${delegation.inspecteurNom} ?`)) {
      setDelegations(prev => prev.filter(d => d.id !== delegationId));
      // Supprimer du store
      deleteDelegationStore(delegationId);
      addNotification({
        user_id: user?.id || '',
        type: 'info',
        title: 'Délégation annulée',
        message: `Le domaine ${delegation.domaineNom} a été retiré`,
        canal: 'in_app',
      });
    }
  }, [delegations, user, addNotification, deleteDelegationStore]);

  // Sauvegarder les délégations — synchronise l'état local avec le store
  const handleSave = async () => {
    setIsSaving(true);
    const now = new Date().toISOString();
    // Sync les délégations locales dans le store (mise à jour des délégations existantes)
    const storeDelegations = getDelegationsStore(surveillanceId);
    delegations.forEach(del => {
      const storeRecord = storeDelegations.find(s => s.id === del.id);
      if (storeRecord) {
        // Mettre à jour la progression et le statut
        updateDelegationStore(del.id, {
          progression: del.progression,
          statut: del.statut as any,
          derniere_activite: now,
          derniere_sync: now,
        });
      }
      // Si pas dans le store (ex: délégation créée hors du flux normal), l'ajouter
      if (!storeRecord) {
        addDelegationStore({
          surveillance_id: surveillanceId,
          aerodrome_id: aerodromeId,
          chef_id: chefId,
          domaine: del.domaineCode,
          domaine_nom: del.domaineNom,
          type_surveillance: del.typeSurveillance,
          assigne_a: del.inspecteurId,
          assigne_nom: del.inspecteurNom,
          assigne_par: user?.id || '',
          items_ids: del.itemsIds,
          items_count: del.itemsCount,
          progression: del.progression,
          statut: 'assigne',
          assigne_le: del.assigneLe,
          derniere_activite: now,
          derniere_sync: now,
        });
      }
    });
    onDelegationChange?.(delegations);
    setIsSaving(false);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Délégations sauvegardées',
      message: `${delegations.length} délégation(s) enregistrée(s) et persistées`,
      canal: 'in_app',
    });
  };

  // Drag & Drop handlers
  const handleDragStart = (domaine: DomaineDisponible) => {
    if (readOnly) return;
    setDraggedDomaine(domaine);
  };

  const handleDragEnd = () => {
    setDraggedDomaine(null);
    setDragOverInspecteurId(null);
  };

  const handleDragOver = (e: React.DragEvent, inspecteurId: string) => {
    e.preventDefault();
    if (readOnly) return;
    setDragOverInspecteurId(inspecteurId);
  };

  const handleDragLeave = () => {
    setDragOverInspecteurId(null);
  };

  const handleDrop = (e: React.DragEvent, inspecteurId: string) => {
    e.preventDefault();
    setDragOverInspecteurId(null);

    if (readOnly || !draggedDomaine) return;

    const isAlreadyAssigned = delegations.some(d => d.domaineId === draggedDomaine.id);
    if (isAlreadyAssigned) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Domaine déjà assigné',
        message: `Le domaine ${draggedDomaine.nom} est déjà assigné à un inspecteur`,
        canal: 'in_app',
      });
      return;
    }

    const inspecteur = inspecteurs.find(i => i.id === inspecteurId);
    if (!inspecteur || !inspecteur.estDisponible) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Inspecteur indisponible',
        message: `Cet inspecteur n'est pas disponible`,
        canal: 'in_app',
      });
      return;
    }

    const estCompetent = inspecteurEstCompetent(inspecteur, draggedDomaine);
    if (!estCompetent) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Incompétence',
        message: `${inspecteur.prenom} ${inspecteur.nom} n'a pas les compétences pour ${draggedDomaine.nom}`,
        canal: 'in_app',
      });
      return;
    }

    assignerDomaine(draggedDomaine, inspecteurId, selectedTypeSurveillance);
    setDraggedDomaine(null);
  };

  const domainesNonAssignesList = domainesNonAssignes();
  const delegationsParInspecteur = inspecteurs.map(insp => ({
    ...insp,
    delegations: delegations.filter(d => d.inspecteurId === insp.id),
  }));

  if (readOnly) {
    return (
      <Card icon={<Users className="w-4 h-4 text-blue-600" />} title="Délégations actuelles" badge={getTypeBadge(typeSurveillance)}>
        {delegations.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-4">
            Aucune délégation configurée
          </p>
        ) : (
          <div className="space-y-3">
            {delegationsParInspecteur.filter(i => i.delegations.length > 0).map(insp => (
              <div key={insp.id} className="border rounded-lg p-3 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <span className="font-medium text-sm">{insp.prenom} {insp.nom}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {insp.delegations.map(d => (
                    <div key={d.id} className="flex items-center gap-1.5 border rounded-lg px-2 py-1 bg-white">
                      {getDomaineBadge(d.domaineCode)}
                      <span className="text-xs font-medium">{d.domaineNom}</span>
                      {getTypeBadge(d.typeSurveillance)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Dashboard */}
      {delegations.length > 0 && (
        <Card icon={<BarChart3 className="w-4 h-4 text-blue-600" />} title="Tableau de bord du chef"
          badge={<button onClick={() => setShowStats(!showStats)} className="btn btn-sm px-3 py-1 btn-ghost">{showStats ? 'Masquer' : 'Détails'}</button>}
        >
          <StatsDashboard delegations={delegations} inspecteurs={inspecteurs} />
        </Card>
      )}

      {/* Zone de drag & drop - 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Colonne gauche : Domaines à assigner */}
        <Card icon={<Target className="w-4 h-4 text-blue-600" />} title="Domaines à couvrir"
          badge={<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">{domainesNonAssignesList.length} restant(s)</span>}
          className="max-h-[500px] overflow-y-auto"
        >
          {domainesNonAssignesList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p className="text-sm">Tous les domaines sont assignés</p>
            </div>
          ) : (
            domainesNonAssignesList.map(domaine => (
              <DomaineCard
                key={domaine.id}
                domaine={domaine}
                isDragging={draggedDomaine?.id === domaine.id}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onAssign={() => {
                  setSelectedDomaine(domaine);
                  setSelectedTypeSurveillance(typeSurveillance);
                  setShowAssignModal(true);
                }}
                typeSurveillance={typeSurveillance}
              />
            ))
          )}
        </Card>

        {/* Colonne droite : Inspecteurs disponibles */}
        <Card icon={<Users className="w-4 h-4 text-blue-600" />} title="Équipe de surveillance"
          subtitle="Glissez-déposez un domaine sur un inspecteur pour assigner"
          badge={<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">{inspecteurs.filter(i => i.estDisponible).length} disponible(s)</span>}
          className="max-h-[500px] overflow-y-auto"
        >
          {inspecteurs.map(inspecteur => (
            <InspecteurCard
              key={inspecteur.id}
              inspecteur={inspecteur}
              isDragOver={dragOverInspecteurId === inspecteur.id}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              assignedDomaines={delegations}
            />
          ))}
        </Card>
      </div>

      {/* Résumé des délégations */}
      {delegations.length > 0 && (
        <Card className="border-border"
          heading={<div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" />Délégations configurées ({delegations.length})</div>}
          badge={<button onClick={handleSave} disabled={isSaving} className="btn btn-sm px-3 py-1 btn-primary"><Save className="w-4 h-4" />{isSaving ? 'Sauvegarde...' : 'Sauvegarder'}</button>}
        >
          <AccordionGroup spacing="sm">
            {delegationsParInspecteur.filter(i => i.delegations.length > 0).map(insp => (
              <AccordionSection
                key={insp.id}
                icon={<UserCheck className="w-4 h-4 text-role-primary" />}
                title={`${insp.prenom} ${insp.nom}`}
                badges={<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">{insp.delegations.length} domaine(s)</span>}
              >
                {insp.delegations.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-2.5 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {getDomaineBadge(d.domaineCode)}
                      <div>
                        <span className="font-medium text-sm">{d.domaineNom}</span>
                        <div className="flex items-center gap-2 mt-1">
                          {getTypeBadge(d.typeSurveillance)}
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                d.progression >= 80 ? 'bg-green-500' :
                                d.progression >= 50 ? 'bg-blue-500' :
                                d.progression >= 25 ? 'bg-amber-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${d.progression}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{d.progression}%</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => supprimerDelegation(d.id)}
                      className="btn btn-sm px-3 py-1 btn-danger"
                      title="Retirer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </AccordionSection>
            ))}
          </AccordionGroup>
        </Card>
      )}

      {/* Modal d'assignation manuelle */}
      {showAssignModal && selectedDomaine && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAssignModal(false)}>
          <div className="bg-background rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Assigner {selectedDomaine.nom}</h2>
              <button className="modal-close" onClick={() => setShowAssignModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body py-4 space-y-4">
              <div className="form-field">
                <label className="filter-label">Type de surveillance</label>
                <div className="grid grid-cols-3 gap-2">
                  {TYPES_SURVEILLANCE.map(t => (
                    <button
                      key={t.code}
                      onClick={() => setSelectedTypeSurveillance(t.code as TypeSurveillanceContinue)}
                      className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                        selectedTypeSurveillance === t.code
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-border hover:border-blue-300'
                      }`}
                    >
                      {getTypeSurveillanceLabel(t.code)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-field">
                <label className="filter-label">Inspecteur</label>
                <select
                  value={selectedInspecteurId}
                  onChange={(e) => setSelectedInspecteurId(e.target.value)}
                  className={`form-select w-full ${focusClass}`}
                >
                  <option value="">Sélectionner un inspecteur</option>
                  {getInspecteursCompetents(selectedDomaine).map(insp => (
                    <option key={insp.id} value={insp.id}>
                      {insp.prenom} {insp.nom} - {insp.competences.join(', ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  {selectedDomaine.itemsCount} items à vérifier
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-sm px-3 py-1 btn-secondary" onClick={() => setShowAssignModal(false)}>
                Annuler
              </button>
              <button
                className="btn btn-sm px-3 py-1 btn-primary"
                disabled={!selectedInspecteurId}
                onClick={() => assignerDomaine(selectedDomaine, selectedInspecteurId, selectedTypeSurveillance)}
              >
                Assigner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DelegationZone;