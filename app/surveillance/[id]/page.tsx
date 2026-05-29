'use client';

import React, { useState, Component, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SurveillanceLettre from '@/components/modules/surveillance/SurveillanceLettre';
import SurveillanceTransmission from '@/components/modules/surveillance/SurveillanceTransmission';
import { ChargerRedigerRapportModal } from '@/components/modules/surveillance/ChargerRedigerRapportModal';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { SurveillanceStepper } from '@/components/modules/surveillance/SurveillanceStepper';
import { ChefDashboard } from '@/components/modules/surveillance/ChefDashboard';
import { InspecteurDelegationPanel } from '@/components/modules/surveillance/InspecteurDelegationPanel';
import {
  ArrowLeft, MapPin, Calendar, Users, Eye, AlertTriangle,
  FileText, ClipboardList, ChevronRight, Shield, Mail, X, Send, Wrench, CheckCircle2
} from 'lucide-react';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl p-6 max-w-md text-center">
            <AlertTriangle className="w-10 h-10 text-danger mx-auto mb-3" />
            <p className="font-semibold text-danger mb-1">Erreur modale</p>
            <p className="text-sm text-muted-foreground">{this.state.error?.message}</p>
            <button className="btn btn-secondary mt-4" onClick={() => this.setState({ hasError: false, error: null })}>Fermer</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SurveillanceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const surveillanceId = params.id as string;

  const surveillances = useAppStore(s => s.surveillances)
  const aerodromes = useAppStore(s => s.aerodromes)
  const user = useAppStore(s => s.user)
  const ecarts = useAppStore(s => s.ecarts)
  const getExemptionsActives = useAppStore(s => s.getExemptionsActives);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const passerEtapeSuivante = useAppStore(s => s.passerEtapeSuivante);
  const reparerEcartsManquants = useAppStore(s => s.reparerEcartsManquants);
  const ecartsRedaction = useAppStore(s => s.ecartsRedaction);
  const addNotification = useAppStore(s => s.addNotification);
  const [stepperAction, setStepperAction] = useState<string | null>(null);
  const [showLettreModal, setShowLettreModal] = useState(false);
  const [showRapportModal, setShowRapportModal] = useState(false);
  const [showTransmissionModal, setShowTransmissionModal] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<{ repaired: number; message: string } | null>(null);
  const [showSgsChoice, setShowSgsChoice] = useState<'checklist' | 'ecarts' | null>(null);

  // ── data-role sur body pour les variables CSS de rôle (btn-primary, bg-role-gradient…) ──
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  // Auto-ouvrir la modale rapport si paramètre `ouvrirRapport=1` dans l'URL
  useEffect(() => {
    if (searchParams.get('ouvrirRapport') === '1') {
      setShowRapportModal(true);
    }
  }, [searchParams]);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);
  const exemptionsActives = surveillance ? getExemptionsActives(surveillance.aerodrome_id) : [];

  // ── Prérequis transmission ──────────────────────────────────────────────────
  const STATUT_ORDER_MAP: Record<string, number> = {
    planifiee: 0, en_cours: 1, checklist_signee: 2,
    ecarts_signes: 3, rapport_signe: 4, lettre_signee: 5,
    transmise: 6, archivee: 6,
  };
  const currentStatutOrder = STATUT_ORDER_MAP[surveillance?.statut ?? ''] ?? 0;
  const checklistSignee  = currentStatutOrder >= 2;
  const ecartsTraites    = currentStatutOrder >= 3;
  const rapportSigne     = currentStatutOrder >= 4;
  const lettreSigneeDG   = !!surveillance?.lettre_signee_url;

  const handleTransmettre = async (data: { dateLimitePAC: string; messagePersonnalise: string; dateTransmission: string }) => {
    if (!surveillance) return;
    // passerEtapeSuivante est async — convertit ecartsRedaction → ecarts officiels (avec fallback Supabase)
    // et passe à 'transmise'
    await passerEtapeSuivante(surveillanceId);
    // Compléter avec transmitted_at (non géré par passerEtapeSuivante)
    updateSurveillance(surveillanceId, { transmitted_at: data.dateTransmission });
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Dossier transmis',
      message: `Le dossier de ${aerodrome?.code_oaci ?? 'l\'aérodrome'} a été transmis au portail exploitant.`,
      canal: 'in_app',
    });
    setShowTransmissionModal(false);
  };

  // Navigation checklist avec logique SGS
  const navigateToChecklist = (type: 'standard' | 'sgs') => {
    router.push(`/surveillance/${surveillanceId}/checklist?type=${type}`);
  };

  const handleChecklistAction = () => {
    if (hasSGS && !isSgsOnly) {
      setShowSgsChoice('checklist');
    } else if (isSgsOnly) {
      navigateToChecklist('sgs');
    } else {
      navigateToChecklist('standard');
    }
  };

  if (!surveillance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-danger/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-danger" />
          </div>
          <p className="text-lg font-medium text-foreground mb-2">Surveillance non trouvée</p>
          <button onClick={() => router.push('/')} className="btn btn-primary">
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  // Pour la portée SGS-only, les écarts sont sur la page dédiée /ecarts/sgs
  const isSgsOnly = (surveillance.portee || []).length === 1 && surveillance.portee?.[0] === 'SGS';
  const hasSGS = (surveillance.portee || []).includes('SGS');
  const ecartsRoute = isSgsOnly
    ? `/surveillance/${surveillanceId}/ecarts/sgs`
    : `/surveillance/${surveillanceId}/ecarts`;

  const handleEcartClick = () => {
    if (hasSGS && !isSgsOnly) {
      setShowSgsChoice('ecarts');
    } else {
      router.push(ecartsRoute);
    }
  };

  const etapeRoutes: Record<string, string> = {
    planifiee: `/surveillance/${surveillanceId}/checklist`,
    en_cours: `/surveillance/${surveillanceId}/checklist`,
    checklist_signee: ecartsRoute,
    ecarts_signes: '__rapport__',
    rapport_signe: '__lettre__',
    lettre_signee: '__transmission__',
    transmise: '__transmission__',
  };

  const STATUTS_RAPPORT_FINALISE = ['rapport_signe', 'lettre_signee', 'transmise', 'archivee'];
  const handleEtapeClick = (etape: string) => {
    // Clic sur "Rapport signé" avant que le rapport soit finalisé → modal de création
    if (etape === 'rapport_signe' && !STATUTS_RAPPORT_FINALISE.includes(surveillance.statut)) {
      setShowRapportModal(true);
      return;
    }
    // Clic sur "Lettre signée" depuis le stepper → ouvre la lettre
    if (etape === 'lettre_signee' && surveillance.statut === 'rapport_signe') {
      setShowLettreModal(true);
      return;
    }
    const route = etapeRoutes[etape];
    if (!route) return;
    if (route === '__lettre__') { setShowLettreModal(true); return; }
    if (route === '__rapport__') { setShowRapportModal(true); return; }
    if (route === '__transmission__') { setShowTransmissionModal(true); return; }
    // Écarts avec SGS mixte → choix
    if (route === ecartsRoute && hasSGS && !isSgsOnly) {
      setShowSgsChoice('ecarts');
      return;
    }
    router.push(route);
  };

  const getStatutBadge = (statut: string) => {
    const map: Record<string, string> = {
      planifiee: 'badge neutral',
      en_cours: 'badge warning',
      checklist_signee: 'badge primary',
      ecarts_signes: 'badge primary',
      rapport_signe: 'badge success',
      lettre_signee: 'badge success',
      transmise: 'badge success',
      archivee: 'badge neutral',
    };
    return map[statut] || 'badge neutral';
  };

  const getStatutLabel = (statut: string) => {
    const map: Record<string, string> = {
      planifiee: 'Planifiée',
      en_cours: 'En cours',
      checklist_signee: 'Checklist signée',
      ecarts_signes: 'Écarts signés',
      rapport_signe: 'Rapport signé',
      lettre_signee: 'Lettre signée',
      transmise: 'Transmise',
      archivee: 'Archivée',
    };
    return map[statut] || statut;
  };

  const equipeNoms = (surveillance.equipe_ids || []).map(id => {
    const u = useAppStore.getState().utilisateurs.find(u => u.id === id);
    return `${u?.prenom || ''} ${u?.nom || ''}`.trim() || id;
  });

  const chefNom = surveillance.chef_id ? (() => {
    const chef = useAppStore.getState().utilisateurs.find(u => u.id === surveillance.chef_id);
    return `${chef?.prenom || ''} ${chef?.nom || ''}`.trim() || surveillance.chef_id;
  })() : 'Non assigné';

  return (
    <div className="min-h-screen bg-gray-50" data-role={user?.role} data-module="surveillance-detail">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/')}
                className="btn btn-secondary btn-sm gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center">
                  <Eye className="w-5 h-5 text-role-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">
                    {aerodrome?.code_oaci} — {aerodrome?.nom}
                  </h1>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="badge outline text-xs">
                      {surveillance.type.replace(/_/g, ' ')}
                    </span>
                    <span className={getStatutBadge(surveillance.statut)}>
                      {getStatutLabel(surveillance.statut)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Colonne gauche: Stepper */}
          <div className="lg:col-span-1">
            <div className="card border-border sticky top-24">
              <div className="card-content p-5">
                <SurveillanceStepper
                  surveillance={surveillance}
                  onEtapeClick={handleEtapeClick}
                />
              </div>
            </div>
          </div>

          {/* Colonne droite: Infos + Actions */}
          <div className="lg:col-span-2 space-y-6">
            {/* Infos générales */}
            <div className="card border-border">
              <div className="card-content p-5">
                <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-role-primary" />
                  Informations
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Aérodrome</p>
                      <p className="text-sm font-medium">{aerodrome?.code_oaci} — {aerodrome?.nom}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Type</p>
                      <p className="text-sm font-medium">{surveillance.type.replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="text-sm font-medium">
                        {new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}
                        {surveillance.date_fin && ` → ${new Date(surveillance.date_fin).toLocaleDateString('fr-FR')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Chef d'équipe</p>
                      <p className="text-sm font-medium">{chefNom}</p>
                    </div>
                  </div>
                </div>

                {equipeNoms.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">Équipe d'inspection</p>
                    <div className="flex flex-wrap gap-2">
                      {equipeNoms.map((nom, i) => (
                        <span key={i} className="badge outline text-xs">{nom}</span>
                      ))}
                    </div>
                  </div>
                )}

                {exemptionsActives.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-warning" />
                      <p className="text-xs font-semibold text-foreground">Exemptions actives</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {exemptionsActives.map(e => (
                        <span key={e.id} className="badge warning text-xs">{e.reference}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions rapides */}
            <div className="card border-border">
              <div className="card-content p-5">
                <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-role-primary" />
                  Actions
                </h2>
                <div className="flex flex-col gap-3">

                  {/* ── planifiee / en_cours ── */}
                  {(surveillance.statut === 'planifiee' || surveillance.statut === 'en_cours') && (
                    <button
                      onClick={handleChecklistAction}
                      className="btn btn-primary w-full justify-start gap-3"
                    >
                      <ClipboardList className="w-5 h-5 flex-shrink-0" />
                      <span>Ouvrir la checklist</span>
                    </button>
                  )}

                  {/* ── checklist_signee ── */}
                  {surveillance.statut === 'checklist_signee' && (
                    <>
                      <button
                        onClick={handleEcartClick}
                        className="btn btn-primary w-full justify-start gap-3"
                      >
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span>Rédiger les écarts</span>
                      </button>
                      <button
                        onClick={handleChecklistAction}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted hover:bg-role-primary/10 hover:border-role-primary/40 hover:text-role-primary text-foreground font-semibold text-sm transition-all duration-200 cursor-pointer"
                      >
                        <ClipboardList className="w-5 h-5 flex-shrink-0" />
                        <span>Voir la checklist</span>
                      </button>
                    </>
                  )}

                  {/* ── ecarts_signes ── */}
                  {surveillance.statut === 'ecarts_signes' && (
                    <>
                      <button
                        onClick={() => setShowRapportModal(true)}
                        className="btn btn-primary w-full justify-start gap-3"
                      >
                        <FileText className="w-5 h-5 flex-shrink-0" />
                        <span>Rédiger le rapport</span>
                      </button>
                      <button
                        onClick={handleChecklistAction}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted hover:bg-role-primary/10 hover:border-role-primary/40 hover:text-role-primary text-foreground font-semibold text-sm transition-all duration-200 cursor-pointer"
                      >
                        <ClipboardList className="w-5 h-5 flex-shrink-0" />
                        <span>Voir la checklist</span>
                      </button>
                    </>
                  )}

                  {/* ── rapport_signe ── */}
                  {surveillance.statut === 'rapport_signe' && (
                    <>
                      <button
                        onClick={() => setShowLettreModal(true)}
                        className="btn btn-primary w-full justify-start gap-3"
                      >
                        <Mail className="w-5 h-5 flex-shrink-0" />
                        <span>Lettre de transmission</span>
                      </button>
                      <button
                        onClick={() => router.push(`/surveillance/${surveillanceId}/rapport`)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted hover:bg-role-primary/10 hover:border-role-primary/40 hover:text-role-primary text-foreground font-semibold text-sm transition-all duration-200 cursor-pointer"
                      >
                        <FileText className="w-5 h-5 flex-shrink-0" />
                        <span>Voir le rapport</span>
                      </button>
                      <button
                        onClick={handleEcartClick}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted hover:bg-role-primary/10 hover:border-role-primary/40 hover:text-role-primary text-foreground font-semibold text-sm transition-all duration-200 cursor-pointer"
                      >
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span>Voir les écarts</span>
                      </button>
                    </>
                  )}

                  {/* ── lettre_signee → transmission ── */}
                  {surveillance.statut === 'lettre_signee' && (
                    <>
                      <button
                        onClick={() => setShowTransmissionModal(true)}
                        className="btn btn-primary w-full justify-start gap-3"
                      >
                        <Send className="w-5 h-5 flex-shrink-0" />
                        <span>Transmettre au portail exploitant</span>
                      </button>
                      <button
                        onClick={() => setShowLettreModal(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted hover:bg-role-primary/10 hover:border-role-primary/40 hover:text-role-primary text-foreground font-semibold text-sm transition-all duration-200 cursor-pointer"
                      >
                        <Mail className="w-5 h-5 flex-shrink-0" />
                        <span>Voir la lettre de transmission</span>
                      </button>
                      <button
                        onClick={() => router.push(`/surveillance/${surveillanceId}/rapport`)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted hover:bg-role-primary/10 hover:border-role-primary/40 hover:text-role-primary text-foreground font-semibold text-sm transition-all duration-200 cursor-pointer"
                      >
                        <FileText className="w-5 h-5 flex-shrink-0" />
                        <span>Voir le rapport</span>
                      </button>
                    </>
                  )}

                  {/* ── transmise / archivee ── lecture seule ── */}
                  {(surveillance.statut === 'transmise' || surveillance.statut === 'archivee') && (
                    <>
                      <button
                        onClick={() => router.push(`/surveillance/${surveillanceId}/rapport`)}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted hover:bg-role-primary/10 hover:border-role-primary/40 hover:text-role-primary text-foreground font-semibold text-sm transition-all duration-200 cursor-pointer"
                      >
                        <FileText className="w-5 h-5 flex-shrink-0" />
                        <span>Voir le rapport</span>
                      </button>
                      <button
                        onClick={handleEcartClick}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-border bg-muted hover:bg-role-primary/10 hover:border-role-primary/40 hover:text-role-primary text-foreground font-semibold text-sm transition-all duration-200 cursor-pointer"
                      >
                        <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                        <span>Voir les écarts</span>
                      </button>

                      {/* ── Bouton réparation — visible si écarts officiels absents mais brouillons disponibles ── */}
                      {ecarts.filter(e => e.surveillance_id === surveillanceId).length === 0 &&
                       ecartsRedaction.filter((e: any) => e.surveillance_id === surveillanceId).length > 0 && (
                        <div className="space-y-2">
                          <button
                            onClick={async () => {
                              setIsRepairing(true);
                              setRepairResult(null);
                              const result = await reparerEcartsManquants(surveillanceId);
                              setRepairResult(result);
                              setIsRepairing(false);
                            }}
                            disabled={isRepairing}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-warning/50 bg-warning/10 hover:bg-warning/20 text-warning font-semibold text-sm transition-all duration-200"
                          >
                            <Wrench className={`w-5 h-5 flex-shrink-0 ${isRepairing ? 'animate-spin' : ''}`} />
                            <span>{isRepairing ? 'Réparation en cours…' : 'Réparer les écarts manquants'}</span>
                          </button>
                          {repairResult && (
                            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                              repairResult.repaired > 0 ? 'bg-success/10 text-success border border-success/20' : 'bg-danger/10 text-danger border border-danger/20'
                            }`}>
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{repairResult.message}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <div className="border-t border-border pt-3 mt-1">
                    <button
                      onClick={() => router.push(`/surveillance/${surveillanceId}/presence`)}
                      className="btn btn-secondary btn-sm gap-2 w-full justify-start"
                    >
                      <Users className="w-4 h-4" />
                      Feuille de présence
                    </button>
                  </div>

                </div>
              </div>
            </div>

            {/* ── Tableau de bord délégations (chef d'équipe, optionnel) ── */}
            {user?.id === surveillance.chef_id && (
              <ChefDashboard
                surveillanceId={surveillanceId}
                onToutRecu={() => setShowRapportModal(true)}
              />
            )}

            {/* ── Panel inspecteur délégué (optionnel) ── */}
            {user?.id !== surveillance.chef_id && (
              <InspecteurDelegationPanel
                surveillanceId={surveillanceId}
                portee={surveillance.portee}
              />
            )}

          </div>
        </div>
      </div>

      {/* Modale — Lettre de transmission */}
      {showLettreModal && createPortal(
        <div
          className="modal-overlay"
          data-role={user?.role}
          onClick={() => setShowLettreModal(false)}
        >
          <div
            className="modal-content max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title flex items-center gap-2">
                  <Mail className="w-5 h-5 text-role-primary" />
                  Lettre de transmission
                </div>
                <button
                  className="modal-close"
                  onClick={() => setShowLettreModal(false)}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="modal-body p-6">
                <SurveillanceLettre
                  surveillanceId={surveillanceId}
                  aerodrome={aerodrome}
                  onLettreSignee={() => {
                    setShowLettreModal(false);
                    // Ouvrir directement la transmission après validation de la lettre
                    setShowTransmissionModal(true);
                  }}
                  userRole={user?.role}
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modale — Choix SGS/Standard pour checklist ou écarts */}
      {showSgsChoice && createPortal(
        <div className="modal-overlay" data-role={user?.role} onClick={() => setShowSgsChoice(null)}>
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-role-primary" />
                  {showSgsChoice === 'checklist' ? 'Choisir le type de checklist' : 'Choisir le type d\'écarts'}
                </div>
                <button className="modal-close" onClick={() => setShowSgsChoice(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="modal-body p-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cette surveillance inclut le domaine SGS. Sélectionnez le format à consulter :
                </p>
                <button
                  type="button"
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-role-primary-soft/30 transition-all text-left"
                  onClick={() => {
                    const type = showSgsChoice;
                    setShowSgsChoice(null);
                    if (type === 'checklist') {
                      navigateToChecklist('standard');
                    } else {
                      router.push(`/surveillance/${surveillanceId}/ecarts`);
                    }
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0">
                    <ClipboardList className="w-5 h-5 text-role-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {showSgsChoice === 'checklist' ? 'Checklist Standard' : 'Écarts Standard'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {showSgsChoice === 'checklist' ? 'Items standards RAS-14' : 'Écarts au format RAS-14 standard'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-role-primary-soft/30 transition-all text-left"
                  onClick={() => {
                    const type = showSgsChoice;
                    setShowSgsChoice(null);
                    if (type === 'checklist') {
                      navigateToChecklist('sgs');
                    } else {
                      router.push(`/surveillance/${surveillanceId}/ecarts/sgs`);
                    }
                  }}
                >
                  <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-role-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {showSgsChoice === 'checklist' ? 'Checklist SGS' : 'Écarts SGS'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {showSgsChoice === 'checklist' ? 'Évaluation SGS (PAOE - Annexe 19 OACI)' : 'Écarts SGS (PAOE - Annexe 19 OACI)'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showRapportModal && createPortal(
        <ErrorBoundary>
          <ChargerRedigerRapportModal
            surveillanceId={surveillanceId}
            onClose={() => setShowRapportModal(false)}
          />
        </ErrorBoundary>,
        document.body
      )}

      {/* Modale — Transmission au portail exploitant */}
      <SurveillanceTransmission
        open={showTransmissionModal}
        surveillanceId={surveillanceId}
        aerodrome={aerodrome}
        checklistSignee={checklistSignee}
        ecartsTraites={ecartsTraites}
        rapportSigne={rapportSigne}
        lettreSigneeDG={lettreSigneeDG}
        onTransmettre={handleTransmettre}
        onClose={() => setShowTransmissionModal(false)}
        userRole={user?.role}
      />

    </div>
  );
}
