// components/modules/dashboard/FocalOperatorDashboardModule.tsx
// ✅ R1 : 0 style=, uniquement classes CSS
// ✅ R3 : Données via AppStore
// ✅ R5 : Rôle géré par le parent
// ✅ Accès en lecture/écriture
// ✅ Design system premium - classes harmonisées

'use client';

import React, { useMemo } from 'react';
import {
  LayoutDashboard,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Send,
  TrendingUp,
  TrendingDown,
  Calendar,
  User,
  Shield,
  Activity,
  MessageSquare,
  Flame,
  Gauge,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { getDomaineLabel } from '@/lib/domaines';
import { ModuleHeader } from '@/components/layout/ModuleHeader';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

interface FocalOperatorDashboardModuleProps {
  user?: { role?: string; aerodrome_id?: string };
  userRole?: string;
}

export default function FocalOperatorDashboardModule({ user: userProp, userRole: userRoleProp }: FocalOperatorDashboardModuleProps) {
  const user = useAppStore(s => s.user);
  const userRole = userRoleProp ?? userProp?.role ?? user?.role ?? ''
  const aerodromes = useAppStore(s => s.aerodromes);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const plannings = useAppStore(s => s.plannings);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const getStatistiquesPAC = useAppStore(s => s.getStatistiquesPAC);
  const setActiveModule = useAppStore(s => s.setActiveModule);

  // Récupérer l'aérodrome associé à l'utilisateur
  const aerodrome = useMemo(() => {
    if (!user?.aerodrome_id) return null;
    return aerodromes?.find(a => a.id === user.aerodrome_id);
  }, [user, aerodromes]);

  const profil = useMemo(() => {
    if (!aerodrome) return null;
    return profilsRisque?.[aerodrome.id];
  }, [aerodrome, profilsRisque]);

  const statsPAC = useMemo(() => {
    if (!aerodrome) return null;
    return getStatistiquesPAC?.(aerodrome.id);
  }, [aerodrome, getStatistiquesPAC]);

  const ecartsOuverts = useMemo(() => {
    if (!aerodrome) return 0;
    return ecarts?.filter(e =>
      e.aerodrome_id === aerodrome.id && e.statut !== 'cloture'
    ).length || 0;
  }, [aerodrome, ecarts]);

  const ecartsCritiques = useMemo(() => {
    if (!aerodrome) return 0;
    return ecarts?.filter(e =>
      e.aerodrome_id === aerodrome.id &&
      e.niveau_risque === 'critique' &&
      e.statut !== 'cloture'
    ).length || 0;
  }, [aerodrome, ecarts]);

  const surveillancesCount = useMemo(() => {
    if (!aerodrome) return 0;
    return surveillances?.filter(s => s.aerodrome_id === aerodrome.id).length || 0;
  }, [aerodrome, surveillances]);

  const pacEnAttente = statsPAC?.en_attente || 0;

  const prochaineSurveillance = useMemo(() => {
    if (!aerodrome) return null;
    return (surveillances || [])
      .filter(s => s.aerodrome_id === aerodrome.id && s.statut === 'planifiee' && new Date(s.date_debut) > new Date())
      .sort((a, b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime())[0] ?? null;
  }, [aerodrome, surveillances]);

  const getRiskBadgeClass = (niveau?: string) => {
    switch(niveau) {
      case 'faible': return 'risk-badge faible';
      case 'moyen': return 'risk-badge moyen';
      case 'eleve': return 'risk-badge eleve';
      case 'critique': return 'risk-badge critique';
      default: return 'badge neutral';
    }
  };

  const getScoreColorClass = (score?: number) => {
    if (!score) return 'text-muted';
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-primary';
    if (score >= 30) return 'text-warning';
    return 'text-danger';
  };

  const now = new Date();

  if (!aerodrome) {
    return (
      <div className="card card-accent border-warning/30 bg-warning/5 animate-fade-in">
        <div className="card-content py-12 text-center">
          <AlertCircle className="h-12 w-12 text-warning mx-auto mb-4" />
          <p className="text-body text-foreground mb-2">Aucun aérodrome associé à votre compte</p>
          <p className="text-small text-muted">Veuillez contacter l'administrateur</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-role={userRole} data-module="focal-operator-dashboard">

      {/* ==================== EN-TÊTE ==================== */}
      <ModuleHeader
        icon={<LayoutDashboard className="h-8 w-8 text-white" />}
        title={`Bienvenue, ${user?.prenom || 'Focal'}`}
        description={`Portail Exploitant — ${aerodrome.nom} (${aerodrome.code_oaci})`}
        actions={<div className="flex items-center gap-3">
          <span className="badge warning">FOCAL</span>
          <span className="badge neutral bg-white/20 text-white border border-white/30 whitespace-nowrap">
            {now.toLocaleDateString('fr-FR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </span>
          {profil?.niveau === 'critique' && (
            <span className="badge danger pulse">
              Niveau critique
            </span>
          )}
        </div>}
      />

      {/* ==================== KPIs ==================== */}
      <div className="kpi-grid">
        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="kpi-icon"><Gauge className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Score risque</div>
            <div className={`kpi-value ${getScoreColorClass(profil?.score_global)}`}>
              {profil?.score_global || 0}%
            </div>
            {profil?.tendance && (
              <div className="flex items-center gap-1 mt-1">
                {profil.tendance === 'hausse' && <TrendingUp className="h-3 w-3 text-success" />}
                {profil.tendance === 'baisse' && <TrendingDown className="h-3 w-3 text-danger" />}
                <span className="text-xs text-muted capitalize">{profil.tendance}</span>
              </div>
            )}
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="kpi-icon"><Eye className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Surveillances</div>
            <div className="kpi-value">{surveillancesCount}</div>
            <div className="text-xs text-muted mt-1">au total</div>
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="kpi-icon"><AlertCircle className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Écarts ouverts</div>
            <div className="kpi-value">{ecartsOuverts}</div>
            {ecartsCritiques > 0 && (
              <div className="flex items-center gap-1 mt-1">
                <Flame className="w-3 h-3 text-danger" />
                <span className="text-xs text-danger">{ecartsCritiques} critiques</span>
              </div>
            )}
          </div>
        </div>

        <div className="kpi-card animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="kpi-icon"><Send className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-label">PAC à soumettre</div>
            <div className="kpi-value text-warning">{pacEnAttente}</div>
            {pacEnAttente > 0 && (
              <div className="text-xs text-warning mt-1">Action requise</div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== ACTIONS RAPIDES ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.25s' }}>
        <div className="card-header">
          <div className="card-title text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-role-primary" />
            Actions rapides
          </div>
        </div>
        <div className="card-content">
          <div className="flex flex-wrap gap-3">
            <button className="btn btn-primary gap-2" onClick={() => setActiveModule('operator-ecarts')}>
              <Send className="w-4 h-4" />
              Soumettre un PAC
            </button>
            <button className="btn btn-secondary gap-2" onClick={() => setActiveModule('operator-evenements')}>
              <AlertCircle className="w-4 h-4" />
              Déclarer événement
            </button>
            <button className="btn btn-secondary gap-2" onClick={() => setActiveModule('operator-documentations')}>
              <FileText className="w-4 h-4" />
              Documents reçus
            </button>
          </div>
        </div>
      </div>

      {/* ==================== PAC EN ATTENTE + DERNIERS MESSAGES ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* PAC en attente */}
        <div className="card card-accent animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <div className="card-header">
            <div className="card-title text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning" />
              PAC en attente
              {pacEnAttente > 0 && (
                <span className="badge warning pulse">
                  {pacEnAttente}
                </span>
              )}
            </div>
          </div>
          <div className="card-content">
            {ecarts?.filter(e => e.aerodrome_id === aerodrome.id && e.statut === 'pac_attendu').length === 0 ? (
              <div className="text-center py-8 text-muted">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-small">Aucun PAC en attente</p>
              </div>
            ) : (
              <div className="space-y-2">
                {ecarts
                  ?.filter(e => e.aerodrome_id === aerodrome.id && e.statut === 'pac_attendu')
                  .slice(0, 5)
                  .map(ecart => (
                    <div key={ecart.id} className="p-3 bg-warning/10 rounded-xl border border-warning/20">
                      <div className="flex justify-between items-start gap-2 flex-wrap">
                        <div>
                          <p className="code-oaci-badge text-xs">{ecart.reference}</p>
                          <p className="text-small text-foreground mt-1 line-clamp-2">{ecart.libelle}</p>
                        </div>
                        <span className="badge warning shrink-0">
                          À soumettre
                        </span>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button className="btn btn-primary btn-sm text-xs" onClick={() => setActiveModule('operator-ecarts')}>
                          <Send className="w-3 h-3 mr-1" />
                          Soumettre le PAC
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Profil de risque détaillé */}
        <div className="card animate-fade-up" style={{ animationDelay: '0.35s' }}>
          <div className="card-header">
            <div className="card-title text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-role-primary" />
              Profil de risque
            </div>
          </div>
          <div className="card-content space-y-4">
            {/* Score global */}
            <div>
              <div className="flex justify-between text-small mb-1">
                <span className="text-muted">Score global</span>
                <span className={`font-semibold ${getScoreColorClass(profil?.score_global)}`}>
                  {profil?.score_global || 0}/100
                </span>
              </div>
              <div className={`progress h-2 ${
                (profil?.score_global || 0) >= 80 ? 'progress-moyen' :
                (profil?.score_global || 0) >= 60 ? 'progress-moyen' :
                (profil?.score_global || 0) >= 30 ? 'progress-eleve' : 'progress-critique'
              }`}>
                <div className="progress-bar" style={{ width: `${profil?.score_global || 0}%` }} />
              </div>
            </div>

            {/* Niveau */}
            <div className="flex items-center justify-between">
              <span className="text-muted text-small">Niveau</span>
              <span className={getRiskBadgeClass(profil?.niveau)}>
                {profil?.niveau ? profil.niveau.charAt(0).toUpperCase() + profil.niveau.slice(1) : 'Non défini'}
              </span>
            </div>

            {/* Prédictions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-2 bg-role-primary-soft rounded-xl text-center">
                <p className="text-xs text-muted">Dans 3 mois</p>
                <p className={`text-lg font-bold ${getScoreColorClass(profil?.prediction_3m)}`}>
                  {profil?.prediction_3m || 0}%
                </p>
              </div>
              <div className="p-2 bg-role-primary-soft rounded-xl text-center">
                <p className="text-xs text-muted">Dans 6 mois</p>
                <p className={`text-lg font-bold ${getScoreColorClass(profil?.prediction_6m)}`}>
                  {profil?.prediction_6m || 0}%
                </p>
              </div>
            </div>

            {/* Prochaine surveillance — enrichi */}
            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted" />
                  <span className="text-xs text-muted">Prochaine surveillance</span>
                </div>
                {prochaineSurveillance ? (() => {
                  const daysLeft = Math.ceil((new Date(prochaineSurveillance.date_debut).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const color = daysLeft > 7 ? 'text-success' : daysLeft > 3 ? 'text-warning' : 'text-danger';
                  const bg = daysLeft > 7 ? 'bg-success/10' : daysLeft > 3 ? 'bg-warning/10' : 'bg-danger/10';
                  return (
                    <span className={`badge outline text-xs ${color}`}>
                      J-{Math.max(0, daysLeft)} jours
                    </span>
                  );
                })() : (
                  <span className="badge outline text-xs">À planifier</span>
                )}
              </div>
              {prochaineSurveillance && (() => {
                const daysLeft = Math.ceil((new Date(prochaineSurveillance.date_debut).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                const dotColor = daysLeft > 7 ? 'bg-success' : daysLeft > 3 ? 'bg-warning' : 'bg-danger';
                const domaines = prochaineSurveillance.portee?.map(getDomaineLabel).join(', ') || '—';
                const equipe = prochaineSurveillance.equipe_ids?.map((id: string) => {
                  const u = utilisateurs?.find((x: any) => x.id === id);
                  return u ? `${u.prenom} ${u.nom}` : id;
                }).join(', ') || '—';
                return (
                  <div className="flex items-start gap-2 bg-muted/20 rounded-lg p-2">
                    <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dotColor}`} />
                    <div className="text-xs text-muted space-y-0.5">
                      <p><span className="font-medium text-foreground">Dates :</span> {new Date(prochaineSurveillance.date_debut).toLocaleDateString('fr-FR')} → {new Date(prochaineSurveillance.date_fin).toLocaleDateString('fr-FR')}</p>
                      <p><span className="font-medium text-foreground">Domaines :</span> {domaines}</p>
                      <p><span className="font-medium text-foreground">Équipe :</span> {equipe}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== DERNIERS MESSAGES ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.4s' }}>
        <div className="card-header">
          <div className="card-title text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-role-primary" />
            Derniers messages
          </div>
        </div>
        <div className="card-content">
          <div className="text-center py-8 text-muted">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-small">Aucun message récent</p>
            <p className="text-xs text-muted mt-1">Les communications apparaîtront ici</p>
          </div>
        </div>
      </div>

      {/* ==================== DERNIERS RAPPORTS ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.45s' }}>
        <div className="card-header">
          <div className="card-title text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-role-primary" />
            Derniers rapports
          </div>
        </div>
        <div className="card-content">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Score</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {surveillances
                  ?.filter(s => s.aerodrome_id === aerodrome.id && (s.statut === 'transmise' || s.statut === 'archivee'))
                  .slice(0, 5)
                  .map(s => (
                    <tr key={s.id} className="hover:bg-role-primary-soft transition-colors">
                      <td className="text-small text-foreground">{new Date(s.date_debut).toLocaleDateString('fr-FR')}</td>
                      <td className="text-small text-foreground">{s.type}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="progress w-16 h-1.5">
                            <div className="progress-bar" style={{ width: `${s.score_global || 0}%` }} />
                          </div>
                          <span className="text-small text-foreground">{s.score_global || 0}%</span>
                        </div>
                      </td>
                      <td className="text-right">
                        <button className="action-button" onClick={() => setActiveModule('surveillance')}>
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {(surveillances?.filter(s => s.aerodrome_id === aerodrome.id && (s.statut === 'transmise' || s.statut === 'archivee')).length || 0) === 0 && (
              <div className="text-center py-6 text-muted">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-xs">Aucun rapport disponible</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
