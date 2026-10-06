// components/modules/plans-actions/HistoriqueEcartModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { useEcartQuestionRefs } from '@/lib/useEcartQuestionRefs';
import {
  History,
  X,
  Calendar,
  User,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Upload,
  Eye,
  Download,
  Bell,
  AlertCircle,
  Merge,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { getRiskLevelClass } from '@/lib/risque';
import { construireRecitEcart } from '@/lib/ia/recitEcart';
import type { HistoriqueEcart } from '@/lib/store/ecartsTypes';
import { nomActeur, labelRoleActeur } from '@/lib/acteurs';

interface HistoriqueEcartModalProps {
  isOpen: boolean;
  onClose: () => void;
  ecartId: string;
  userRole: string;
}

interface TimelineStep {
  id: string;
  // Union alignée sur HistoriqueEcart (lib/store/ecartsTypes.ts) — source unique.
  type: HistoriqueEcart['type'];
  date: string;
  acteur: string;
  role_acteur: string;
  description: string;
  details?: any;
  fichiers?: { url: string; nom: string }[];
  icon: React.ElementType;
  color: string;
}

// Libellés des types d'événements (module scope : statique).
const LABEL_TYPE_HISTORIQUE: Record<string, string> = {
  creation: 'Création de l\u2019écart',
  notification: 'Notification envoyée',
  soumission_pac: 'PAC soumis',
  evaluation_pac: 'PAC évalué',
  validation_chef: 'Validation du chef',
  soumission_preuves: 'Preuves soumises',
  validation_preuves: 'Preuves évaluées',
  cloture: 'Écart clôturé',
  rappel: 'Rappel automatique',
  retard: 'Écart en retard — délai dépassé',
  reconciliation: 'Réconciliation',
  ajustement_delais: 'Échéances réajustées',
};

// Phases du parcours d'un écart (module scope : statique).
const PHASES_PARCOURS: { id: string; label: string; types: string[] }[] = [
  { id: 'constat', label: 'Constat', types: ['creation', 'notification'] },
  { id: 'plan', label: 'Plan d\u2019actions', types: ['soumission_pac'] },
  { id: 'evaluation', label: 'Évaluation', types: ['evaluation_pac'] },
  { id: 'preuves', label: 'Preuves', types: ['soumission_preuves', 'validation_preuves'] },
  { id: 'cloture', label: 'Clôture', types: ['cloture'] },
  { id: 'pilotage', label: 'Pilotage (délais)', types: ['rappel', 'retard', 'reconciliation', 'ajustement_delais'] },
];

export function HistoriqueEcartModal({ isOpen, onClose, ecartId, userRole }: HistoriqueEcartModalProps) {
  const ecarts = useOptimizedStore(s => s.ecarts);
  const utilisateurs = useOptimizedStore(s => s.utilisateurs);
  const inspecteurs = useOptimizedStore(s => s.inspecteurs);
  const getHistoriqueEcart = useAppStore(s => s.getHistoriqueEcart);
  const addNotification = useAppStore(s => s.addNotification);
  const ecart = ecarts.find(e => e.id === ecartId);
  const { refs: questionRefs } = useEcartQuestionRefs(ecart);
  const historique = getHistoriqueEcart(ecartId);
  const [mounted, setMounted] = useState(false);
  // Reformulation IA du récit (faits pré-calculés — l'IA ne fait que rédiger).
  const [resumeIA, setResumeIA] = useState<string | null>(null);
  const [resumeIALoading, setResumeIALoading] = useState(false);
  const [resumeIAErreur, setResumeIAErreur] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!ecart || !isOpen) return null;

  // Cartes d'état : situation actuelle depuis les données réelles de l'écart
  // (source Supabase) — évite les entrées fantômes désynchronisées.
  // La création vient de l'historique quand il existe (vrai acteur), sinon repli.
  const derivedTimeline: TimelineStep[] = [];

  if (!historique.some(h => h.type === 'creation')) {
    derivedTimeline.push({
      id: `creation-${ecart.id}`,
      type: 'creation',
      date: ecart.created_at,
      acteur: ecart.inspecteur_ref_id,
      role_acteur: 'inspector',
      description: `Écart constaté — référence ${ecart.reference}`,
      icon: FileText,
      color: 'bg-blue-100 text-blue-600',
    });
  }

  if (ecart.pac) {
    derivedTimeline.push({
      id: `soumission-pac-${ecart.id}`,
      type: 'soumission_pac',
      date: ecart.pac.soumis_le,
      acteur: ecart.pac.soumis_par,
      role_acteur: 'focal_operator',
      description: `PAC version ${ecart.pac.version} — ${ecart.pac.actions.length} action(s) corrective(s)`,
      details: {
        actions: ecart.pac.actions,
        observations: ecart.pac.observations,
      },
      fichiers: (ecart.pac.fichiers || []).map(url => ({
        url,
        nom: url.split('/').pop() || url.split('\\').pop() || 'fichier',
      })),
      icon: Send,
      color: 'bg-green-100 text-green-600',
    });
  }

  if (ecart.evaluation_pac) {
    derivedTimeline.push({
      id: `eval-pac-${ecart.id}`,
      type: 'evaluation_pac',
      date: ecart.evaluation_pac.evalue_le,
      acteur: ecart.evaluation_pac.evalue_par,
      role_acteur: 'inspector',
      description: `PAC ${ecart.evaluation_pac.decision === 'accepte' ? 'accepté' : 'refusé'} — Note globale : ${ecart.evaluation_pac.note_globale}/5`,
      details: ecart.evaluation_pac,
      icon: ecart.evaluation_pac.decision === 'accepte' ? CheckCircle2 : XCircle,
      color: ecart.evaluation_pac.decision === 'accepte' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600',
    });
  }

  if (ecart.preuves) {
    derivedTimeline.push({
      id: `preuves-${ecart.id}`,
      type: 'soumission_preuves',
      date: ecart.preuves.soumis_le,
      acteur: ecart.preuves.soumis_par,
      role_acteur: 'focal_operator',
      description: `Soumission de ${ecart.preuves.fichiers.length} fichier(s) de preuves`,
      fichiers: (ecart.preuves.fichiers || []).map(f => ({
        url: f.url,
        nom: f.nom,
      })),
      icon: Upload,
      color: 'bg-cyan-100 text-cyan-600',
    });
  }

  if (ecart.validation_preuves) {
    derivedTimeline.push({
      id: `valid-preuves-${ecart.id}`,
      type: 'validation_preuves',
      date: ecart.validation_preuves.valide_le,
      acteur: ecart.validation_preuves.valide_par,
      role_acteur: 'inspector',
      description: `Preuves ${ecart.validation_preuves.decision === 'valide' ? 'validées' : 'refusées'}`,
      details: ecart.validation_preuves,
      icon: ecart.validation_preuves.decision === 'valide' ? CheckCircle2 : XCircle,
      color: ecart.validation_preuves.decision === 'valide' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600',
    });
  }

  if (ecart.statut === 'cloture' && ecart.cloture_le) {
    derivedTimeline.push({
      id: `cloture-${ecart.id}`,
      type: 'cloture',
      date: ecart.cloture_le,
      acteur: ecart.validation_preuves?.valide_par || ecart.inspecteur_ref_id,
      role_acteur: 'inspector',
      description: 'Écart validé et clôturé',
      icon: CheckCircle2,
      color: 'bg-emerald-100 text-emerald-600',
    });
  }

  // Entrées d'historique : versions passées (PAC v1 refusé…), décisions du
  // chef, pilotage (rappels, retards, délais). Déduplication : une entrée est
  // couverte par une carte d'état si même type ET même date (même action).
  const CONFIG_ENTREE_HISTORIQUE: Record<HistoriqueEcart['type'], { icon: React.ElementType; couleur: (e: HistoriqueEcart) => string }> = {
    creation: { icon: FileText, couleur: () => 'bg-blue-100 text-blue-600' },
    notification: { icon: Send, couleur: () => 'bg-amber-100 text-amber-600' },
    soumission_pac: { icon: Send, couleur: () => 'bg-green-100 text-green-600' },
    evaluation_pac: { icon: CheckCircle2, couleur: e => (e.details as { decision?: string } | undefined)?.decision === 'refuse' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600' },
    validation_chef: { icon: ShieldCheck, couleur: () => 'bg-purple-100 text-purple-600' },
    soumission_preuves: { icon: Upload, couleur: () => 'bg-cyan-100 text-cyan-600' },
    validation_preuves: { icon: CheckCircle2, couleur: e => (e.details as { decision?: string } | undefined)?.decision === 'valide' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600' },
    cloture: { icon: CheckCircle2, couleur: () => 'bg-emerald-100 text-emerald-600' },
    rappel: { icon: Bell, couleur: () => 'bg-amber-100 text-amber-600' },
    retard: { icon: AlertCircle, couleur: () => 'bg-rose-100 text-rose-600' },
    reconciliation: { icon: Merge, couleur: () => 'bg-purple-100 text-purple-600' },
    ajustement_delais: { icon: Calendar, couleur: () => 'bg-blue-100 text-blue-600' },
  };
  const clesEtat = new Set(derivedTimeline.map(d => `${d.type}::${d.date}`));
  const entreesHistorique: TimelineStep[] = historique
    .filter(entry => entry.type in CONFIG_ENTREE_HISTORIQUE && !clesEtat.has(`${entry.type}::${entry.date}`))
    .map(entry => {
      const config = CONFIG_ENTREE_HISTORIQUE[entry.type];
      return {
        id: entry.id,
        type: entry.type,
        date: entry.date,
        acteur: entry.acteur,
        role_acteur: entry.role_acteur,
        description: entry.description,
        details: entry.details,
        fichiers: (entry.fichiers || []).map(url => ({ url, nom: url.split('/').pop() || url.split('\\').pop() || 'fichier' })),
        icon: config.icon,
        color: config.couleur(entry),
      };
    });

  // Trier par date décroissante (les plus récents en premier)
  const sortedTimeline = [...derivedTimeline, ...entreesHistorique].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Récit calculé depuis les faits (synthèse + situation + anomalies).
  const recit = ecart ? construireRecitEcart(ecart, historique) : null;

  // Regroupement par phase : le lecteur voit « vous êtes ici ».
  // Phase courante = dernière phase métier (hors pilotage) atteinte.
  const timelineParPhase = PHASES_PARCOURS
    .map(phase => ({ ...phase, entrees: sortedTimeline.filter(e => phase.types.includes(e.type)) }))
    .filter(groupe => groupe.entrees.length > 0);
  const phaseCouranteId = (() => {
    const metier = timelineParPhase.filter(g => g.id !== 'pilotage');
    return metier.length > 0 ? metier[0].id : null;
  })();

  const genererResumeIA = async () => {
    if (resumeIALoading || !recit) return;
    setResumeIALoading(true);
    setResumeIAErreur(false);
    try {
      const prompt = `Tu es AERORISQ. Reformule fidèlement ce parcours d'écart en 5 à 8 lignes claires pour un inspecteur. RÈGLE ABSOLUE : n'invente aucun fait — dates, nombres et décisions uniquement depuis les FAITS ci-dessous. Termine par la prochaine action attendue.\nFAITS :\n${recit.phrases.map(p => `- ${p}`).join('\n')}`;
      const res = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, contexte: { module: 'plans-actions', ecart_id: ecartId } }),
      });
      if (!res.ok) throw new Error('IA indisponible');
      const data = await res.json();
      setResumeIA(typeof data.message === 'string' ? data.message : null);
    } catch {
      setResumeIAErreur(true);
    } finally {
      setResumeIALoading(false);
    }
  };

  const getStatutBadge = (statut: string) => {
    const statuts: Record<string, { label: string; className: string }> = {
      'ouvert': { label: 'Ouvert', className: 'badge danger' },
      'pac_attendu': { label: 'PAC attendu', className: 'badge warning' },
      'pac_soumis': { label: 'PAC soumis', className: 'badge primary' },
      'pac_refuse': { label: 'PAC refusé', className: 'badge danger' },
      'pac_accepte': { label: 'PAC accepté', className: 'badge success' },
      'preuves_soumises': { label: 'Preuves soumises', className: 'badge primary' },
      'preuves_evaluees': { label: 'Preuves évaluées', className: 'badge warning' },
      'en_retard': { label: 'En retard', className: 'badge danger' },
      'cloture': { label: 'Clôturé', className: 'badge success' },
    };
    return statuts[statut] || { label: statut, className: 'badge neutral' };
  };

  const statutBadge = getStatutBadge(ecart.statut);

  const content = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-background rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border-t-4 border-t-role-primary flex flex-col">
        <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
          <div className="modal-title flex items-center gap-2">
            <History className="w-5 h-5 text-role-primary" />
            Historique complet - {ecart.reference}
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Informations de l'écart */}
          <Card className="bg-gradient-to-r from-role-primary/5 to-transparent">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="code-oaci-badge text-xs">{ecart.reference}</span>
                  <span className={statutBadge.className}>{statutBadge.label}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  Créé le {new Date(ecart.created_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <p className="text-sm text-foreground">{ecart.libelle}</p>
              {ecart.ref_reglementaire && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ecart.ref_reglementaire.split(/[;,]|\bet\b/i).map(r => r.trim()).filter(Boolean).map((ref, i) => (
                    <span key={i} className="code-oaci-badge text-[10px]">{ref}</span>
                  ))}
                </div>
              )}
              {questionRefs.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {questionRefs.map((ref, i) => (
                    <span key={i} className="code-oaci-badge text-[10px]">{ref}</span>
                  ))}
                </div>
              )}
              {ecart.niveau_risque && (
                <div className="mt-2">
                  <span className={`badge ${getRiskLevelClass(ecart.niveau_risque)}`}>
                    {ecart.niveau_risque}
                  </span>
                </div>
              )}
          </Card>

          {/* Situation : où en est le dossier, qui doit jouer */}
          {recit && (
            <Card className="bg-gradient-to-r from-role-primary/5 to-transparent">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Situation</p>
                <span className={statutBadge.className}>{statutBadge.label}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">En attente</p>
                  <p className="font-medium text-foreground">
                    {recit.situation.attente === 'exploitant' ? "De l'exploitant" : recit.situation.attente === 'inspecteur' ? "De l'inspecteur" : recit.situation.attente === 'chef' ? "Du chef d'équipe" : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">{recit.situation.action}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Échéance</p>
                  <p className="font-medium text-foreground">{recit.situation.echeance}</p>
                  <p className="text-xs text-muted-foreground">{recit.situation.joursDepuisConstat} jour(s) depuis le constat</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Étape du parcours</p>
                  <p className="font-medium text-foreground">
                    {PHASES_PARCOURS.find(p => p.id === phaseCouranteId)?.label || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Niveau {recit.situation.niveau}</p>
                </div>
              </div>
              {recit.anomalies.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {recit.anomalies.map((a, i) => (
                    <div key={i} className={`flex items-start gap-1.5 text-xs p-2 rounded-lg border ${a.niveau === 'danger' ? 'bg-danger/5 border-danger/20 text-danger-700' : 'bg-warning/5 border-warning/20 text-warning-700'}`}>
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span><strong>{a.titre}.</strong> {a.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Synthèse : récit calculé + reformulation IA */}
          {recit && (
            <Card>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Synthèse du parcours</p>
                <button
                  type="button"
                  onClick={genererResumeIA}
                  disabled={resumeIALoading}
                  className="btn btn-sm btn-ghost gap-1 text-[11px]"
                  title="AERORISQ reformule les faits ci-dessous, sans rien inventer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {resumeIALoading ? 'Rédaction…' : resumeIA ? 'Régénérer avec AERORISQ' : 'Reformuler avec AERORISQ'}
                </button>
              </div>
              {resumeIA ? (
                <div>
                  <p className="inline-flex items-center gap-1 text-[10px] px-1.5 py-px rounded-full bg-primary/10 text-primary mb-1.5">
                    <Sparkles className="w-3 h-3" /> Rédigé par AERORISQ à partir des faits ci-dessous
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-line">{resumeIA}</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {recit.phrases.map((phrase, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-1.5">
                      <span className="text-muted-foreground mt-0.5">•</span>
                      <span>{phrase}</span>
                    </li>
                  ))}
                </ul>
              )}
              {resumeIAErreur && (
                <p className="text-xs text-warning mt-1.5">IA indisponible — synthèse calculée affichée.</p>
              )}
            </Card>
          )}

          {/* Timeline visuelle, regroupée par phase */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-role-primary" />
              Chronologie des événements
            </h3>

            <div className="space-y-4">
              {timelineParPhase.map(groupe => (
                <div key={groupe.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${groupe.id === phaseCouranteId ? 'bg-success animate-pulse' : 'bg-muted-foreground/40'}`} />
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {groupe.label}
                      {groupe.id === phaseCouranteId && groupe.id !== 'pilotage' && (
                        <span className="ml-1.5 normal-case font-medium text-success">— vous êtes ici</span>
                      )}
                    </p>
                    <span className="text-[10px] text-muted-foreground">({groupe.entrees.length})</span>
                  </div>
                  <div className="space-y-3 ml-1 pl-3 border-l-2 border-border">
                    {groupe.entrees.map((entry) => {
                const date = new Date(entry.date);
                const dateFormatted = date.toLocaleDateString('fr-FR');
                const timeFormatted = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const isRappel = entry.type === 'rappel';
                const isRetard = entry.type === 'retard';

                return (
                  <div key={entry.id} className="pb-3 last:pb-0">

                    <div className="bg-white border border-border rounded-lg p-3 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">
                              {entry.type === 'evaluation_pac' && entry.details?.note_globale
                                ? `PAC évalué (${entry.details.note_globale}/5)`
                                : entry.type === 'validation_preuves'
                                  ? `Preuves ${entry.details?.decision === 'valide' ? 'validées' : entry.details?.decision === 'reserve' ? 'acceptées avec réserves' : 'refusées'}`
                                  : LABEL_TYPE_HISTORIQUE[entry.type] ?? entry.type}
                            </span>
                            {entry.type === 'soumission_pac' && entry.details?.version != null && (
                              <span className="badge primary text-[10px]">
                                v{entry.details.version}
                              </span>
                            )}
                            {entry.type === 'evaluation_pac' && entry.details?.note_globale && (
                              <span className="badge primary text-[10px]">
                                Note: {entry.details.note_globale}/5
                              </span>
                            )}
                            {entry.type === 'evaluation_pac' && entry.details?.decision && (
                              <span className={`badge text-[10px] ${entry.details.decision === 'refuse' ? 'danger' : entry.details.decision === 'reserve' ? 'warning' : 'success'}`}>
                                {entry.details.decision === 'accepte' ? 'Accepté' : entry.details.decision === 'reserve' ? 'Réserves' : 'Refusé'}
                              </span>
                            )}
                            {entry.type === 'validation_chef' && entry.details?.decision && (
                              <span className={`badge text-[10px] ${entry.details.decision === 'refuse' ? 'danger' : entry.details.decision === 'reserve' ? 'warning' : 'success'}`}>
                                {entry.details.decision === 'accepte' ? 'Accepté' : entry.details.decision === 'reserve' ? 'Réserves' : entry.details.decision === 'valide' ? 'Validé' : 'Refusé'}
                              </span>
                            )}
                            {entry.type === 'validation_chef' && entry.details?.action === 'revision' && (
                              <span className="badge warning text-[10px]">Révision demandée</span>
                            )}
                            {isRappel && (() => {
                              const seuil = /J-(7|3|1)/.exec(entry.description || '')?.[0];
                              return (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                                  {seuil || 'Rappel'}
                                </span>
                              );
                            })()}
                            {isRetard && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 animate-pulse">
                                ⚠️ Alerte
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {dateFormatted} à {timeFormatted}
                              {(() => {
                                const jours = Math.floor((Date.now() - date.getTime()) / 86400000);
                                if (jours <= 0) return null;
                                return (
                                  <span className="text-[10px]">· il y a {jours} j</span>
                                );
                              })()}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {nomActeur(entry.acteur, [...utilisateurs, ...inspecteurs])}
                              {labelRoleActeur(entry.role_acteur) && (
                                <span className="text-[10px] px-1.5 py-px rounded-full bg-muted text-muted-foreground">
                                  {labelRoleActeur(entry.role_acteur)}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-sm mt-2">{entry.description}</p>

                      {entry.details?.actions?.length > 0 && entry.type === 'soumission_pac' && (
                        <div className="mt-3 space-y-2">
                          <div className="overflow-x-auto rounded border border-border">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/30">
                                  <th className="text-left p-2 font-medium">Action</th>
                                  <th className="text-left p-2 font-medium">Responsable</th>
                                  <th className="text-left p-2 font-medium">Date prévue</th>
                                  <th className="text-left p-2 font-medium">Livrables</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.details.actions.map((a: any, i: number) => (
                                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                                    <td className="p-2 align-top break-words">{a.description}</td>
                                    <td className="p-2 align-top">{a.responsable}</td>
                                    <td className="p-2 whitespace-nowrap align-top">{a.date_prevue ? new Date(a.date_prevue).toLocaleDateString('fr-FR') : '-'}</td>
                                    <td className="p-2 align-top break-words">{(a.livrables || []).join(', ') || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {entry.details.observations && (
                            <div className="p-2 bg-background rounded border border-border text-xs">
                              <span className="font-medium text-muted-foreground">Observations: </span>
                              {entry.details.observations}
                            </div>
                          )}
                        </div>
                      )}

                      {(entry.type === 'evaluation_pac' || entry.type === 'validation_preuves') && (() => {
                        // Respect du délai inspecteur : date d'évaluation vs deadline.
                        const details = entry.details || {};
                        const faitLe = details.evalue_le || details.valide_le;
                        const deadline = details.deadline;
                        if (!faitLe || !deadline) return null;
                        const jours = Math.ceil((new Date(faitLe).getTime() - new Date(deadline).getTime()) / 86400000);
                        const dansLesTemps = jours <= 0;
                        return (
                          <div className="mt-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${dansLesTemps ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                              <Clock className="w-3 h-3" />
                              {dansLesTemps ? 'Dans les temps' : `En retard de ${jours} j`}
                            </span>
                          </div>
                        );
                      })()}

                      {entry.type === 'evaluation_pac' && entry.details && (() => {
                        // Notes affichées seulement si présentes (anciennes entrées
                        // sans instantané : note globale + commentaire uniquement).
                        const notes = [
                          ['Pertinence', entry.details.note_pertinence],
                          ['Exhaustivité', entry.details.note_exhaustivite],
                          ['Précision', entry.details.note_precision],
                          ['Spécificité', entry.details.note_specificite],
                          ['Cohérence', entry.details.note_coherence],
                          ['Réalisme', entry.details.note_realisme ?? entry.details.note_tracabilite],
                        ].filter(([, v]) => typeof v === 'number') as [string, number][];
                        if (notes.length === 0 && !entry.details.commentaire_refus) return null;
                        return (
                          <div className="mt-2 p-2 bg-background rounded border border-border grid grid-cols-2 gap-2 text-sm">
                            {notes.map(([label, note]) => (
                              <div key={label}>{label}: {note}/5</div>
                            ))}
                            {entry.details.commentaire_refus && (
                              <div className="col-span-2 p-2 bg-danger/10 rounded-lg text-danger-700">
                                <p className="text-xs font-medium">Commentaire:</p>
                                <p className="text-xs">{entry.details.commentaire_refus}</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {entry.type === 'validation_chef' && entry.details && (
                        <div className="mt-2 p-2 bg-background rounded border border-border text-xs space-y-1">
                          <p>
                            <span className="font-medium">Objet : </span>
                            {entry.details.objet === 'evaluation_pac' ? 'Évaluation du PAC' : 'Validation des preuves'}
                          </p>
                          {entry.details.commentaire && (
                            <p className="p-1.5 bg-muted/30 rounded">
                              <span className="font-medium">Motif : </span>
                              {entry.details.commentaire}
                            </p>
                          )}
                        </div>
                      )}

                      {entry.type === 'soumission_preuves' && entry.details?.commentaire && (
                        <div className="mt-2 p-2 bg-background rounded border border-border text-xs">
                          <span className="font-medium text-muted-foreground">Commentaire : </span>
                          {entry.details.commentaire}
                        </div>
                      )}

                      {entry.fichiers && entry.fichiers.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Fichiers joints:</p>
                          <div className="flex flex-col gap-1.5">
                            {entry.fichiers.map((f, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-background p-1.5 rounded border border-border">
                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="flex-1 truncate text-foreground">{f.nom}</span>
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm px-2 py-0.5 btn-ghost gap-1 text-[10px]"
                                >
                                  <Eye className="w-3 h-3" />
                                  Voir
                                </a>
                                <a
                                  href={f.url}
                                  download={f.nom}
                                  className="btn btn-sm px-2 py-0.5 btn-ghost gap-1 text-[10px]"
                                >
                                  <Download className="w-3 h-3" />
                                  Télécharger
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}
                  </div>
                </div>
              ))}

              {sortedTimeline.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun historique disponible</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions disponibles */}
          <Card title="Actions disponibles">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    addNotification({
                      user_id: userRole,
                      type: 'info',
                      title: 'Export demandé',
                      message: `L'export de l'historique est en cours de préparation`,
                      canal: 'in_app',
                    });
                  }}
                  className="btn btn-secondary btn-sm gap-1"
                >
                  <Download className="w-3 h-3" />
                  Exporter l'historique
                </button>
              </div>
        </Card>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}

export default HistoriqueEcartModal;