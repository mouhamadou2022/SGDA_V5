// components/modules/utilisateurs/UtilisateursModule.tsx
'use client';

import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Edit3,
  Trash2,
  Eye,
  Mail,
  Phone,
  Clock,
  Power,
  Key,
  Shield,
  Building,
  Briefcase,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  List,
  LayoutGrid,
} from 'lucide-react';
import { useAppStore, type Utilisateur } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { Card } from '@/components/ui/card';
import { ROLES } from '@/lib/config';
import { UtilisateurForm } from '@/components/forms/UtilisateurForm';
import { FormShell } from '@/components/ui/FormShell';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

interface UtilisateursModuleProps {
  userRole: string;
}

// Types d'inspecteur
const TYPES_INSPECTEUR = [
  { id: 'cadre_technique', label: 'Cadre Technique' },
  { id: 'inspecteur_titulaire', label: 'Inspecteur Titulaire' },
  { id: 'inspecteur_principal', label: 'Inspecteur Principal' },
];

// Services
const SERVICES = [
  { id: 'normes_aerodromes', label: 'Normes des Aérodromes' },
  { id: 'securite_aerodromes', label: 'Sécurité des Aérodromes' },
];

// Statuts
const STATUTS = [
  { id: 'actif', label: 'Actif', variant: 'success' },
  { id: 'inactif', label: 'Inactif', variant: 'neutral' },
  { id: 'suspendu', label: 'Suspendu', variant: 'danger' },
];

// Couleurs pour les KPIs
const KPI_COLORS = {
  purple: 'bg-purple-100 text-purple-600',
  teal: 'bg-teal-100 text-teal-600',
};

// Main component
export default function UtilisateursModule({ userRole }: UtilisateursModuleProps) {
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const aerodromes = useAppStore(s => s.aerodromes)
  const deleteUtilisateur = useAppStore(s => s.deleteUtilisateur)
  const updateUtilisateur = useAppStore(s => s.updateUtilisateur);

  // États
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'liste' | 'grille'>('liste');
  const [filters, setFilters] = useState({
    role: 'tous',
    service: 'tous',
    statut: 'tous',
  });
  const [selectedUtilisateur, setSelectedUtilisateur] = useState<Utilisateur | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [activeTab, setActiveTab] = useState<'informations' | 'securite'>('informations');


  const listeUtilisateurs = utilisateurs ?? [];

  // Filtrer les utilisateurs
  const filteredUtilisateurs = useMemo(() => {
    return listeUtilisateurs.filter(u => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches =
          `${u.prenom} ${u.nom}`.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term) ||
          u.telephone?.includes(term);
        if (!matches) return false;
      }

      if (filters.role !== 'tous' && u.role !== filters.role) return false;
      if (filters.service !== 'tous' && u.service !== filters.service) return false;
      if (filters.statut !== 'tous' && u.statut !== filters.statut) return false;

      return true;
    });
  }, [listeUtilisateurs, searchTerm, filters]);

  // Statistiques
  const stats = useMemo(() => ({
    total: listeUtilisateurs.length,
    actifs: listeUtilisateurs.filter(u => u.statut === 'actif').length,
    inactifs: listeUtilisateurs.filter(u => u.statut === 'inactif').length,
    suspendus: listeUtilisateurs.filter(u => u.statut === 'suspendu').length,
    admins: listeUtilisateurs.filter(u => u.role === 'admin').length,
    inspecteurs: listeUtilisateurs.filter(u => u.role === 'inspector').length,
    exploitants: listeUtilisateurs.filter(u => u.role.includes('operator')).length,
  }), [listeUtilisateurs]);

  const getRoleBadge = (role: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      'admin': { label: 'Admin', className: 'bg-role-gradient' },
      'inspector': { label: 'Inspecteur', className: 'bg-role-gradient' },
      'dg_anacim': { label: 'DG ANACIM', className: 'bg-role-gradient' },
      'dg_operator': { label: 'DG Exploitant', className: 'bg-role-gradient' },
      'focal_operator': { label: 'Focal', className: 'bg-role-gradient' },
      'staff_operator': { label: 'Staff', className: 'bg-role-gradient' },
      'guest': { label: 'Invité', className: '' },
    };
    const config = variants[role] || { label: role, className: '' };
    return <span className={`badge primary ${config.className}`}>{config.label}</span>;
  };

  const getStatutBadge = (statut?: string) => {
    const config = STATUTS.find(s => s.id === statut);
    if (!config) return <span className="badge neutral">{statut}</span>;
    return <span className={`badge ${config.variant}`}>{config.label}</span>;
  };

  const getInitials = (prenom: string, nom: string) => {
    return `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase();
  };

  const getLastLoginText = (dateStr?: string) => {
    if (!dateStr) return 'Jamais';
    const date = new Date(dateStr);
    const maintenant = new Date();
    const diffJours = Math.floor((maintenant.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffJours === 0) return "Aujourd'hui";
    if (diffJours === 1) return 'Hier';
    if (diffJours < 7) return `Il y a ${diffJours} jours`;
    return date.toLocaleDateString('fr-FR');
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet utilisateur ?')) {
      await deleteUtilisateur(id);
    }
  };

  const handleResetPassword = (userId: string) => {
    alert('Fonctionnalité de réinitialisation de mot de passe à implémenter');
  };

  const handleToggleActif = (userId: string) => {
    const user = listeUtilisateurs.find(u => u.id === userId);
    if (!user) return;
    const newStatut = user.statut === 'actif' ? 'inactif' : 'actif';
    if (window.confirm(`${newStatut === 'actif' ? 'Activer' : 'Désactiver'} cet utilisateur ?`)) {
      updateUtilisateur(userId, { ...user, statut: newStatut } as any);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="utilisateurs">

      {/* En-tête */}
      <ModuleHeader
        icon={<Users />}
        title="Utilisateurs"
        description={`Gestion des comptes — ${stats.total} utilisateurs`}
        actions={<div className="flex items-center gap-2">
          <button
            onClick={() => { setSelectedUtilisateur(null); setShowForm(true); }}
            className="btn btn-primary gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Nouvel utilisateur
          </button>
        </div>}
      />

      {/* KPIs - 6 cartes */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <Users className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total</div>
          <div className="kpi-value">{stats.total}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Actifs</div>
          <div className="kpi-value">{stats.actifs}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-neutral-soft">
            <XCircle className="w-5 h-5 text-muted" />
          </div>
          <div className="kpi-label">Inactifs</div>
          <div className="kpi-value">{stats.inactifs}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft">
            <AlertCircle className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label">Suspendus</div>
          <div className="kpi-value text-danger">{stats.suspendus}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-purple-100">
            <Shield className="w-5 h-5 text-purple-600" />
          </div>
          <div className="kpi-label">Inspecteurs</div>
          <div className="kpi-value">{stats.inspecteurs}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-teal-100">
            <Building className="w-5 h-5 text-teal-600" />
          </div>
          <div className="kpi-label">Exploitants</div>
          <div className="kpi-value">{stats.exploitants}</div>
        </div>
      </div>

      {/* Barre d'outils */}
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Recherche */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un utilisateur (nom, email, téléphone)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>

          {/* Filtre Rôle */}
          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={filters.role}
            onChange={e => setFilters({ ...filters, role: e.target.value })}
          >
            <option value="tous">Tous rôles</option>
            {ROLES.map(role => (
              <option key={role} value={role}>
                {role === 'admin' ? 'Admin' :
                 role === 'inspector' ? 'Inspecteur' :
                 role === 'dg_anacim' ? 'DG ANACIM' :
                 role === 'dg_operator' ? 'DG Exploitant' :
                 role === 'focal_operator' ? 'Focal' :
                 role === 'staff_operator' ? 'Staff' : 'Invité'}
              </option>
            ))}
          </select>

          {/* Filtre Service */}
          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={filters.service}
            onChange={e => setFilters({ ...filters, service: e.target.value })}
          >
            <option value="tous">Tous services</option>
            {SERVICES.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          {/* Filtre Statut */}
          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={filters.statut}
            onChange={e => setFilters({ ...filters, statut: e.target.value })}
          >
            <option value="tous">Tous statuts</option>
            {STATUTS.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          {/* View Toggle */}
          <div className="view-toggle">
            <button
              className={viewMode === 'liste' ? 'active' : ''}
              onClick={() => setViewMode('liste')}
              title="Vue liste"
            >
              <List className="w-4 h-4" />
              <span>Liste</span>
            </button>
            <button
              className={viewMode === 'grille' ? 'active' : ''}
              onClick={() => setViewMode('grille')}
              title="Vue grille"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Grille</span>
            </button>
          </div>
        </div>
      </div>

      {/* Vue Liste */}
      {viewMode === 'liste' && (
        <Card>
          <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Utilisateur</th>
                    <th>Contact</th>
                    <th>Rôle</th>
                    <th>Service</th>
                    <th>Statut</th>
                    <th>Dernière connexion</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUtilisateurs.map(user => {
                    const aerodrome = aerodromes.find(a => a.id === user.aerodrome_id);

                    return (
                      <tr key={user.id} className="cursor-pointer hover:bg-role-primary-soft">
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-role-gradient flex items-center justify-center text-white font-bold text-sm shrink-0">
                              {getInitials(user.prenom, user.nom)}
                            </div>
                            <div>
                              <p className="font-medium text-small">{user.prenom} {user.nom}</p>
                              <p className="text-xs text-gray-500">{(user as any).matricule || 'Sans matricule'}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-small">
                              <Mail className="w-3 h-3 text-gray-400" />
                              <span>{user.email}</span>
                            </div>
                            {user.telephone && (
                              <div className="flex items-center gap-1 text-small">
                                <Phone className="w-3 h-3 text-gray-400" />
                                <span>{user.telephone}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="space-y-1">
                            {getRoleBadge(user.role)}
                            {aerodrome && (
                              <div className="text-xs text-gray-500">
                                {aerodrome.code_oaci}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          {user.service ? (
                            <span className="badge outline">
                              {SERVICES.find(s => s.id === user.service)?.label || user.service}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td>{getStatutBadge(user.statut)}</td>
                        <td>
                          <div className="flex items-center gap-1 text-small">
                            <Clock className="w-3 h-3 text-gray-400" />
                            {getLastLoginText((user as any).last_login)}
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="action-buttons justify-end">
                            <button
                              className="action-button"
                              onClick={() => { setSelectedUtilisateur(user); setShowDetails(true); }}
                              title="Voir détails"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              className="action-button"
                              onClick={() => { setSelectedUtilisateur(user); setShowForm(true); }}
                              title="Modifier"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              className={`action-button ${user.statut === 'actif' ? 'hover:text-warning hover:bg-warning/10' : 'hover:text-success hover:bg-success/10'}`}
                              onClick={() => handleToggleActif(user.id)}
                              title={user.statut === 'actif' ? 'Désactiver' : 'Activer'}
                            >
                              <Power className={`w-4 h-4 ${user.statut === 'actif' ? 'text-success' : 'text-muted-foreground'}`} />
                            </button>
                            <button
                              className="action-button danger hover:bg-danger/10"
                              onClick={() => handleDelete(user.id)}
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
      )}

      {/* Vue Grille */}
      {viewMode === 'grille' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUtilisateurs.map(user => {
            const aerodrome = aerodromes.find(a => a.id === user.aerodrome_id);

            return (
              <Card
                key={user.id}
                variant="role"
                className="hover:shadow-lg transition-shadow"
                heading={
                  <div className="flex items-start justify-between w-full">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-role-gradient flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {getInitials(user.prenom, user.nom)}
                      </div>
                      <div>
                        <p className="font-semibold text-small">{user.prenom} {user.nom}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </div>
                }
                badge={getRoleBadge(user.role)}
              >
                  {user.telephone && (
                    <div className="flex items-center gap-2 text-small">
                      <Phone className="w-4 h-4 text-gray-400" />
                      {user.telephone}
                    </div>
                  )}

                  {user.service && (
                    <div className="flex items-center gap-2 text-small">
                      <Briefcase className="w-4 h-4 text-gray-400" />
                      {SERVICES.find(s => s.id === user.service)?.label || user.service}
                    </div>
                  )}

                  {aerodrome && (
                    <div className="flex items-center gap-2 text-small">
                      <Building className="w-4 h-4 text-gray-400" />
                      {aerodrome.code_oaci} - {aerodrome.nom}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="w-3 h-3" />
                      {getLastLoginText((user as any).last_login)}
                    </div>
                    {getStatutBadge(user.statut)}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <button
                      className="action-button"
                      onClick={() => { setSelectedUtilisateur(user); setShowDetails(true); }}
                      title="Voir détails"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      className="action-button"
                      onClick={() => { setSelectedUtilisateur(user); setShowForm(true); }}
                      title="Modifier"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      className={`action-button ${user.statut === 'actif' ? 'hover:text-warning hover:bg-warning/10' : 'hover:text-success hover:bg-success/10'}`}
                      onClick={() => handleToggleActif(user.id)}
                      title={user.statut === 'actif' ? 'Désactiver' : 'Activer'}
                    >
                      <Power className={`w-4 h-4 ${user.statut === 'actif' ? 'text-success' : 'text-muted-foreground'}`} />
                    </button>
                    <button
                      className="action-button danger hover:bg-danger/10"
                      onClick={() => handleDelete(user.id)}
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Formulaire */}
      <FormShell
        open={showForm}
        onClose={() => setShowForm(false)}
        title={selectedUtilisateur ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}
        icon={UserPlus}
        size="3xl"
        dataRole={userRole}
      >
        <UtilisateurForm
          mode={selectedUtilisateur ? 'modification' : 'creation'}
          utilisateurId={selectedUtilisateur?.id}
          onSuccess={() => { setShowForm(false); setSelectedUtilisateur(null); }}
          onCancel={() => { setShowForm(false); setSelectedUtilisateur(null); }}
          userRole={userRole}
        />
      </FormShell>

      {/* Modal Détails */}
      <FormShell
        open={showDetails && !!selectedUtilisateur}
        onClose={() => setShowDetails(false)}
        title="Détails de l'utilisateur"
        icon={Users}
        size="2xl"
        dataRole={userRole}
        tabs={[
          { id: 'informations', label: 'Informations' },
          { id: 'securite', label: 'Sécurité' },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'informations' | 'securite')}
        footer={
          <button onClick={() => setShowDetails(false)} className="btn btn-secondary">Fermer</button>
        }
      >
        {/* Tab: Informations */}
        {activeTab === 'informations' && selectedUtilisateur && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-4 p-4 bg-role-primary-soft rounded-lg">
              <div className="w-16 h-16 rounded-full bg-role-gradient flex items-center justify-center text-white font-bold text-xl shrink-0">
                {getInitials(selectedUtilisateur.prenom, selectedUtilisateur.nom)}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold">
                  {selectedUtilisateur.prenom} {selectedUtilisateur.nom}
                </h3>
                <p className="text-small text-gray-600">{selectedUtilisateur.email}</p>
              </div>
              {getStatutBadge(selectedUtilisateur.statut)}
            </div>

            <div className="form-grid grid grid-cols-2 gap-4">
              <div className="form-field">
                <p className="filter-label">Rôle</p>
                <div className="mt-1">{getRoleBadge(selectedUtilisateur.role)}</div>
              </div>
              <div className="form-field">
                <p className="filter-label">Matricule</p>
                <p className="font-medium text-small">{selectedUtilisateur.matricule || 'Non défini'}</p>
              </div>
              <div className="form-field">
                <p className="filter-label">Téléphone</p>
                <p className="font-medium text-small">{selectedUtilisateur.telephone || 'Non renseigné'}</p>
              </div>
              <div className="form-field">
                <p className="filter-label">Date création</p>
                <p className="font-medium text-small">
                  {new Date((selectedUtilisateur as any).created_at).toLocaleDateString('fr-FR')}
                </p>
              </div>

              {selectedUtilisateur.role === 'inspector' && (
                <>
                  <div className="form-field">
                    <p className="filter-label">Type d'inspecteur</p>
                    <p className="font-medium text-small">
                      {TYPES_INSPECTEUR.find(t => t.id === (selectedUtilisateur as any).type_inspecteur)?.label}
                    </p>
                  </div>
                  <div className="form-field">
                    <p className="filter-label">Service</p>
                    <p className="font-medium text-small">
                      {SERVICES.find(s => s.id === selectedUtilisateur.service)?.label}
                    </p>
                  </div>
                  <div className="form-field">
                    <p className="filter-label">Domaine principal</p>
                    <p className="font-medium text-small capitalize">{(selectedUtilisateur as any).domaine_principal}</p>
                  </div>
                </>
              )}

              {selectedUtilisateur.role.includes('operator') && selectedUtilisateur.aerodrome_id && (
                <div className="form-field">
                  <p className="filter-label">Aérodrome</p>
                  <p className="font-medium text-small">
                    {aerodromes.find(a => a.id === selectedUtilisateur.aerodrome_id)?.nom}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Sécurité */}
        {activeTab === 'securite' && selectedUtilisateur && (
          <div className="space-y-4 animate-fade-in">
            <div className="form-field">
              <p className="filter-label">Dernière connexion</p>
              <p className="font-medium text-small">
                {selectedUtilisateur.last_login
                  ? new Date(selectedUtilisateur.last_login).toLocaleString('fr-FR')
                  : 'Jamais'}
              </p>
            </div>

            <div className="form-field">
              <p className="filter-label mb-2">Préférences de notification</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 bg-role-primary-soft rounded">
                  <span className="text-small">Notifications par email</span>
                  {selectedUtilisateur.notifications_email ? (
                    <span className="badge success">Activées</span>
                  ) : (
                    <span className="badge neutral">Désactivées</span>
                  )}
                </div>
                <div className="flex items-center justify-between p-2 bg-role-primary-soft rounded">
                  <span className="text-small">Notifications par SMS</span>
                  {selectedUtilisateur.notifications_sms ? (
                    <span className="badge success">Activées</span>
                  ) : (
                    <span className="badge neutral">Désactivées</span>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                className="btn btn-secondary gap-2"
                onClick={() => handleResetPassword(selectedUtilisateur.id)}
              >
                <Key className="w-4 h-4" />
                Réinitialiser le mot de passe
              </button>
            </div>
          </div>
        )}
      </FormShell>
    </div>
  );
}