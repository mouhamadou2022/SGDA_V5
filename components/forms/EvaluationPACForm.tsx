'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import {
  Star, AlertTriangle, CheckCircle2, XCircle, FileText, X, HelpCircle, User, Calendar,
  Clock, MinusCircle,
} from 'lucide-react';
import { AideMemoirePAC } from '@/components/modules/plans-actions/AideMemoirePAC';
import { learningEnginePAC } from '@/lib/learningEnginePAC';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent";

interface Critere {
  id: string; label: string; description: string; bonExemple: string; mauvaisExemple: string; ponderation: number;
}

const CRITERES: Critere[] = [
  { id: 'pertinence', label: 'Pertinence', description: 'Le PAC s\'attaque-t-il aux causes profondes ?', bonExemple: 'Analyse des causes racines avec actions ciblées', mauvaisExemple: 'Action générique non liée à l\'écart', ponderation: 0.20 },
  { id: 'exhaustivite', label: 'Exhaustivité', description: 'Couvre-t-il toutes les dimensions du problème ?', bonExemple: 'Actions sur le processus, la formation, le contrôle', mauvaisExemple: 'Ne traite qu\'un symptôme', ponderation: 0.18 },
  { id: 'precision', label: 'Précision', description: 'Les actions sont-elles suffisamment détaillées ?', bonExemple: 'Calendrier, livrables, critères de succès définis', mauvaisExemple: 'Action vague sans résultat attendu', ponderation: 0.18 },
  { id: 'specificite', label: 'Spécificité', description: 'Les responsabilités sont-elles claires ?', bonExemple: 'Responsable nommé avec rôle explicite', mauvaisExemple: 'Responsable non défini', ponderation: 0.16 },
  { id: 'realisme', label: 'Réalisme', description: 'Les délais sont-ils réalistes ?', bonExemple: 'Délais cohérents avec la charge de travail', mauvaisExemple: 'Délais trop courts', ponderation: 0.15 },
  { id: 'coherence', label: 'Cohérence', description: 'Cohérent avec les autres actions en cours ?', bonExemple: 'Compatible avec les PAC précédents', mauvaisExemple: 'Contredit une action déjà validée', ponderation: 0.13 },
];

const NIVEAUX_SCORE = [
  { valeur: 0, label: 'Non évalué', color: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-muted' },
  { valeur: 1, label: 'Insuffisant', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger' },
  { valeur: 2, label: 'Partiel', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning' },
  { valeur: 3, label: 'Satisfaisant', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary' },
  { valeur: 4, label: 'Excellent', color: 'text-success', bg: 'bg-success/10', border: 'border-success' },
];

interface EvaluationPACFormProps {
  ecartId: string; onSuccess: () => void; onCancel: () => void; userRole?: string;
}

export function EvaluationPACForm({ ecartId, onSuccess, onCancel, userRole = 'focal_operator' }: EvaluationPACFormProps) {
  const ecarts = useOptimizedStore(s => s.ecarts);
  const user = useOptimizedStore(s => s.user);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const evaluerPAC = useAppStore(s => s.evaluerPAC);
  const addNotification = useAppStore(s => s.addNotification);
  const ecart = ecarts.find(e => e.id === ecartId);

  const [notes, setNotes] = useState<Record<string, number>>({
    pertinence: 0, exhaustivite: 0, precision: 0, specificite: 0, realisme: 0, coherence: 0,
  });
  const [commentaire, setCommentaire] = useState('');
  const [decision, setDecision] = useState<'accepte' | 'reserve' | 'refuse'>('refuse');
  const [reserves, setReserves] = useState<string[]>([]);
  const [newReserve, setNewReserve] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const scorePondere = Object.entries(notes).reduce((sum, [key, note]) => {
    const critere = CRITERES.find(c => c.id === key);
    return sum + (note || 0) * (critere?.ponderation || 0.16);
  }, 0);

  const scorePourcentage = Math.round((scorePondere / 4) * 100);
  const tousNotes = Object.values(notes).every(v => v > 0);
  const scoreEleve = scorePondere >= 3.0;
  const scoreMoyen = scorePondere >= 2.0 && scorePondere < 3.0;

  useEffect(() => {
    if (!tousNotes) setDecision('refuse');
    else if (scoreEleve) setDecision('accepte');
    else if (scoreMoyen) setDecision('reserve');
    else setDecision('refuse');
  }, [notes, tousNotes, scoreEleve, scoreMoyen]);

  const addReserve = () => {
    if (newReserve.trim()) { setReserves([...reserves, newReserve.trim()]); setNewReserve(''); }
  };

  const getProfilContexte = () => {
    const profil = profilsRisque[ecart?.aerodrome_id || '']; if (!profil) return null;
    return {
      score_global: profil.score_global, tendance: profil.tendance, c4: profil.c4,
      nb_ecarts_critiques: ecarts.filter(e => e.aerodrome_id === ecart?.aerodrome_id && e.niveau_risque === 'critique').length,
      type_inspection: ecart?.surveillance_id ? 'surveillance' : 'evenement',
      delai_restant: ecart?.delai_pac ? Math.floor((new Date(ecart.delai_pac).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 30,
    };
  };

  const handleSubmit = async () => {
    if ((decision === 'refuse' || decision === 'reserve') && !commentaire.trim()) { alert('Veuillez fournir un commentaire'); return; }
    if (decision === 'reserve' && reserves.length === 0 && !commentaire.trim()) { alert('Ajoutez au moins une réserve'); return; }
    setIsSubmitting(true);
    try {
      await evaluerPAC(ecartId, {
        note_pertinence: notes.pertinence, note_exhaustivite: notes.exhaustivite, note_precision: notes.precision,
        note_specificite: notes.specificite, note_coherence: notes.coherence, note_tracabilite: notes.realisme,
        note_globale: Math.round(scorePondere * 10) / 10,
        decision: decision === 'reserve' ? 'refuse' as const : decision as 'accepte' | 'refuse',
        commentaire_refus: decision === 'reserve' ? `Réserves: ${reserves.join('; ')}${commentaire ? ` — ${commentaire}` : ''}` : commentaire,
        evalue_par: user?.id || '', evalue_le: new Date().toISOString(),
      });
      addNotification({ user_id: user?.id || '', type: 'success', title: 'Évaluation enregistrée', message: `PAC ${decision === 'accepte' ? 'accepté' : decision === 'reserve' ? 'accepté avec réserves' : 'refusé'}`, canal: 'in_app' });
      setShowFeedback(true);
    } catch (error) {
      console.error('Erreur:', error);
      addNotification({ user_id: user?.id || '', type: 'danger', title: 'Erreur', message: 'Erreur lors de l\'évaluation', canal: 'in_app' });
    } finally { setIsSubmitting(false); }
  };

  const handleFeedback = (utilite: 'oui' | 'peu' | 'non') => {
    const contexte = getProfilContexte();
    if (contexte) {
      learningEnginePAC.enregistrerFeedbackPAC(ecartId, ecart!.aerodrome_id, contexte, [],
        Object.entries(notes).filter(([_, v]) => v >= 3).map(([k]) => k), false as any,
        (decision === 'reserve' ? 'refuse' : decision) as 'accepte' | 'refuse', utilite, commentaire);
    }
    setShowFeedback(false); onSuccess();
  };

  if (!ecart) {
    return <div className="text-center py-8 text-muted-foreground"><AlertTriangle className="w-12 h-12 mx-auto mb-4" /><p>Écart non trouvé</p><button type="button" onClick={onCancel} className="btn btn-secondary mt-4">Fermer</button></div>;
  }

  const actions = ecart.pac?.actions || [];

  return (
    <div data-role={userRole} data-module="evaluation-pac">
      <div className="space-y-5">
        {/* INFOS ÉCART */}
        <div className="p-4 rounded-lg border border-border bg-muted/20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><p className="text-[10px] text-muted-foreground uppercase">Référence</p><p className="font-mono font-medium">{ecart.reference}</p></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Niveau</p><p className="font-medium capitalize">{ecart.niveau_risque}</p></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Aérodrome</p><p className="font-medium">{ecart.aerodrome_id}</p></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Soumis le</p><p className="font-medium">{ecart.pac?.soumis_le ? new Date(ecart.pac.soumis_le).toLocaleDateString('fr-FR') : '—'}</p></div>
          </div>
          <p className="text-sm mt-2">{ecart.libelle}</p>
        </div>

        {/* ACTIONS PROPOSÉES */}
        {actions.length > 0 && (
          <details>
            <summary className="text-xs font-semibold uppercase tracking-wider text-role-primary cursor-pointer mb-2">
              Actions proposées ({actions.length})
            </summary>
            <div className="space-y-1.5">
              {actions.map((action: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 text-sm py-2 px-3 rounded border border-border">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-role-primary text-white text-[10px] font-bold flex-shrink-0 mt-0.5">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{action.description}</p>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{action.responsable}</span>
                      {action.date_debut && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(action.date_debut).toLocaleDateString('fr-FR')}</span>}
                      {action.date_prevue && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(action.date_prevue).toLocaleDateString('fr-FR')}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* CRITÈRES AVEC SCORING 0-4 */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-role-primary">Critères d'évaluation</span>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">Notez chaque critère de 0 (insuffisant) à 4 (excellent)</p>
          <div className="space-y-2">
            {CRITERES.map((critere) => {
              const noteActuelle = notes[critere.id] || 0;
              return (
                <div key={critere.id} className="py-2 px-3 rounded border border-border">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{critere.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{Math.round(critere.ponderation * 100)}%</span>
                    </div>
                    {noteActuelle > 0 && <span className={`text-sm font-bold ${NIVEAUX_SCORE[noteActuelle]?.color}`}>{noteActuelle}/4</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{critere.description}</p>
                  <div className="flex gap-1.5">
                    {NIVEAUX_SCORE.map((niveau) => (
                      <button key={niveau.valeur} type="button"
                        onClick={() => setNotes({ ...notes, [critere.id]: niveau.valeur })}
                        className={`flex-1 py-1.5 rounded text-[10px] font-medium border ${
                          noteActuelle === niveau.valeur ? `${niveau.bg} ${niveau.color} ${niveau.border}` : 'border-border text-muted-foreground'
                        }`}>
                        {niveau.label}
                      </button>
                    ))}
                  </div>
                  {noteActuelle > 0 && noteActuelle <= 2 && <p className="text-[10px] text-danger mt-1">⚠ {critere.mauvaisExemple}</p>}
                  {noteActuelle >= 3 && <p className="text-[10px] text-success mt-1">✓ {critere.bonExemple}</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* SCORE */}
        {tousNotes && (
          <div className={`p-3 rounded border-2 ${
            scoreEleve ? 'border-success/30 bg-success/5' : scoreMoyen ? 'border-warning/30 bg-warning/5' : 'border-danger/30 bg-danger/5'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {scoreEleve ? <CheckCircle2 className="w-5 h-5 text-success" /> : scoreMoyen ? <MinusCircle className="w-5 h-5 text-warning" /> : <XCircle className="w-5 h-5 text-danger" />}
                <div>
                  <p className="font-semibold text-sm">Score: {scorePondere.toFixed(1)}/4 ({scorePourcentage}%)</p>
                  <p className="text-xs text-muted-foreground">
                    {scoreEleve ? 'Validation recommandée' : scoreMoyen ? 'Acceptation avec réserves possible' : 'Refus recommandé'}
                  </p>
                </div>
              </div>
              <div className="progress w-32 h-2">
                <div className={`progress-bar ${scoreEleve ? 'progress-faible' : scoreMoyen ? 'progress-moyen' : 'progress-critique'}`} style={{ width: `${scorePourcentage}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* DÉCISION */}
        <div className="space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-role-primary">Décision</span>
          <div className="flex gap-3">
            <label className={`flex-1 p-3 rounded border-2 text-center ${decision === 'accepte' ? 'border-success bg-success/10' : 'border-border'}`}>
              <input type="radio" name="decision" checked={decision === 'accepte'} onChange={() => scoreEleve && setDecision('accepte')} className="hidden" />
              <CheckCircle2 className={`w-5 h-5 mx-auto mb-1 ${decision === 'accepte' ? 'text-success' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold">Accepter</p>
              <p className="text-[10px] text-muted-foreground">Score ≥ 75%</p>
            </label>
            <label className={`flex-1 p-3 rounded border-2 text-center ${decision === 'reserve' ? 'border-warning bg-warning/10' : 'border-border'}`}>
              <input type="radio" name="decision" checked={decision === 'reserve'} onChange={() => setDecision('reserve')} className="hidden" />
              <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${decision === 'reserve' ? 'text-warning' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold">Réserves</p>
              <p className="text-[10px] text-muted-foreground">Score 50-75%</p>
            </label>
            <label className={`flex-1 p-3 rounded border-2 text-center ${decision === 'refuse' ? 'border-danger bg-danger/10' : 'border-border'}`}>
              <input type="radio" name="decision" checked={decision === 'refuse'} onChange={() => setDecision('refuse')} className="hidden" />
              <XCircle className={`w-5 h-5 mx-auto mb-1 ${decision === 'refuse' ? 'text-danger' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold">Refuser</p>
              <p className="text-[10px] text-muted-foreground">Score &lt; 50%</p>
            </label>
          </div>

          {decision === 'reserve' && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-role-primary">Réserves</span>
              <div className="flex gap-2">
                <input type="text" value={newReserve} onChange={e => setNewReserve(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addReserve()}
                  placeholder="Ajouter une réserve..." className="flex-1 h-9 px-3 rounded border border-border text-sm" />
                <button type="button" onClick={addReserve} className="btn btn-sm btn-primary">Ajouter</button>
              </div>
              {reserves.length > 0 && (
                <div className="space-y-1">
                  {reserves.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded border border-warning/30 bg-warning/5 text-sm">
                      <span>{r}</span>
                      <button type="button" onClick={() => setReserves(reserves.filter((_, j) => j !== i))} className="text-muted-foreground"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(decision === 'refuse' || decision === 'reserve') && (
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-role-primary">Commentaire</span>
              <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
                placeholder={decision === 'refuse' ? 'Raisons du refus...' : 'Corrections attendues...'}
                rows={3} className={`form-textarea w-full mt-1 ${focusClass}`} />
            </div>
          )}
        </div>

        <hr className="border-border" />

        {/* FOOTER */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary">Annuler</button>
          <button type="button" onClick={handleSubmit}
            disabled={isSubmitting || !tousNotes || (decision !== 'accepte' && !commentaire.trim()) || (decision === 'reserve' && reserves.length === 0 && !commentaire.trim())}
            className={`btn ${decision === 'accepte' ? 'btn-success' : decision === 'reserve' ? 'btn-warning' : 'btn-danger'}`}>
            {isSubmitting ? 'En cours...' : decision === 'accepte' ? 'Accepter' : decision === 'reserve' ? 'Accepter avec réserves' : 'Refuser'}
          </button>
        </div>
      </div>

      {/* FEEDBACK MODAL */}
      {showFeedback && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background rounded-2xl max-w-md w-full border-t-4 border-t-role-primary">
            <div className="modal-header">
              <div className="modal-title flex items-center gap-2"><HelpCircle className="w-5 h-5 text-role-primary" />Votre avis nous intéresse</div>
              <button className="modal-close" onClick={() => { setShowFeedback(false); onSuccess(); }}><X className="w-4 h-4" /></button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <p className="text-sm">Cette évaluation vous a-t-elle été utile ?</p>
              <div className="flex gap-3">
                <button onClick={() => handleFeedback('oui')} className="btn btn-success flex-1">Oui</button>
                <button onClick={() => handleFeedback('peu')} className="btn btn-warning flex-1">Peu</button>
                <button onClick={() => handleFeedback('non')} className="btn btn-danger flex-1">Non</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
