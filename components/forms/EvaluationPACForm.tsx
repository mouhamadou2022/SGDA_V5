'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import {
  Star, AlertTriangle, CheckCircle2, XCircle, FileText, X, HelpCircle, User, Calendar,
  Clock, MinusCircle,
} from 'lucide-react';
import { AideMemoirePAC } from '@/components/modules/plans-actions/AideMemoirePAC';
import { learningEnginePAC } from '@/lib/learningEnginePAC';
import { getCellColor, getRiskLevelFromCell, getOACIValue, getRiskLevelBgColor } from '@/lib/risque';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent";

interface Critere {
  id: string; label: string; description: string; bonExemple: string; mauvaisExemple: string; ponderation: number;
}

const CRITERES: Critere[] = [
  { id: 'pertinence', label: 'Pertinence', description: 'Le PAC s\'attaque-t-il aux causes profondes ?', bonExemple: 'Analyse des causes racines avec actions ciblées', mauvaisExemple: 'Action générique non liée à l\'écart', ponderation: 0.20 },
  { id: 'exhaustivite', label: 'Exhaustivité', description: 'Couvre-t-il toutes les dimensions du problème ?', bonExemple: 'Actions sur le processus, la formation, le contrôle', mauvaisExemple: 'Ne traite qu\'un symptôme', ponderation: 0.18 },
  { id: 'precision', label: 'Précision', description: 'Les actions sont-elles suffisamment détaillées ?', bonExemple: 'Calendrier, livrables, critères de succès définis', mauvaisExemple: 'Action vague sans résultat attendu', ponderation: 0.18 },
  { id: 'specificite', label: 'Spécificité', description: 'Les responsabilités sont-elles claires ?', bonExemple: 'Responsable nommé avec rôle explicite', mauvaisExemple: 'Responsable non défini', ponderation: 0.16 },
  { id: 'realisme', label: 'Réalisme', description: 'Les délais et ressources sont-ils réalistes ?', bonExemple: 'Délais cohérents avec la charge de travail', mauvaisExemple: 'Délais trop courts', ponderation: 0.15 },
  { id: 'coherence', label: 'Cohérence', description: 'Cohérent avec les autres actions en cours ?', bonExemple: 'Compatible avec les PAC précédents', mauvaisExemple: 'Contredit une action déjà validée', ponderation: 0.13 },
];

const NIVEAUX_SCORE = [
  { valeur: 0, label: 'Non évalué', color: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-muted' },
  { valeur: 1, label: 'Insuffisant', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger' },
  { valeur: 2, label: 'Partiel', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning' },
  { valeur: 3, label: 'Satisfaisant', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary' },
  { valeur: 4, label: 'Excellent', color: 'text-success', bg: 'bg-success/10', border: 'border-success' },
];

export interface EvaluationDraftData {
  notes: Record<string, number>
  decision: 'accepte' | 'reserve' | 'refuse'
  commentaire: string
  reserves: string[]
}

interface EvaluationPACFormProps {
  ecartId: string; onSuccess: () => void; onCancel: () => void; userRole?: string;
  onSaveDraft?: (evaluation: EvaluationDraftData) => void;
  initialEvaluation?: Partial<EvaluationDraftData>;
}

export function EvaluationPACForm({ ecartId, onSuccess, onCancel, userRole = 'focal_operator', onSaveDraft, initialEvaluation }: EvaluationPACFormProps) {
  const ecarts = useOptimizedStore(s => s.ecarts);
  const user = useOptimizedStore(s => s.user);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const aerodromes = useOptimizedStore(s => s.aerodromes);
  const evaluerPAC = useAppStore(s => s.evaluerPAC);
  const addNotification = useAppStore(s => s.addNotification);
  const ecart = ecarts.find(e => e.id === ecartId);

  const [notes, setNotes] = useState<Record<string, number>>(
    initialEvaluation?.notes || { pertinence: 0, exhaustivite: 0, precision: 0, specificite: 0, realisme: 0, coherence: 0 }
  );
  const [commentaire, setCommentaire] = useState(initialEvaluation?.commentaire || '');
  const [decision, setDecision] = useState<'accepte' | 'reserve' | 'refuse'>(initialEvaluation?.decision || 'refuse');
  const [reserves, setReserves] = useState<string[]>(initialEvaluation?.reserves || []);
  const [newReserve, setNewReserve] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showAiHelp, setShowAiHelp] = useState(false);
  const [attestationRisque, setAttestationRisque] = useState(false);
  const userChangedDecision = useRef(false);

  // Données risque OACI de l'écart — cohérence garantie entre cellule et niveau
  const ecartCelluleBrut = ecart?.cellule_risque_oaci || (ecart ? getOACIValue(ecart) : '') || '';
  const ecartCellule = /^[1-5][A-E]$/.test(ecartCelluleBrut) ? ecartCelluleBrut : '';
  const ecartNiveau = ecartCellule ? getRiskLevelFromCell(ecartCellule) : (ecart?.niveau_risque || 'moyen');

  // Seuils adaptatifs selon la criticité de l'écart
  const SEUILS: Record<string, { accept: number; reserve: number }> = {
    critique: { accept: 85, reserve: 60 },
    eleve: { accept: 80, reserve: 55 },
    moyen: { accept: 75, reserve: 50 },
    faible: { accept: 65, reserve: 40 },
  };
  const seuil = SEUILS[ecartNiveau] || SEUILS.moyen;

  const scorePondere = Object.entries(notes).reduce((sum, [key, note]) => {
    const critere = CRITERES.find(c => c.id === key);
    return sum + (note || 0) * (critere?.ponderation || 0.16);
  }, 0);

  // Risque résiduel cible — suggestion enrichie par le score d'évaluation
  const scorePourcentage = Math.round((scorePondere / 4) * 100);
  const tousNotes = Object.values(notes).every(v => v > 0);
  const scoreEleve = scorePondere >= 3.0;
  const scoreMoyen = scorePondere >= 2.0 && scorePondere < 3.0;
  function suggererResiduel(niveau: string, cellule: string, score: number): { niveau: string; cellule: string } {
    // Faible → reste faible mais descend dans la plage (ex: 3E → 1E)
    if (niveau === 'faible' || niveau === 'tres_faible') {
      const cells = ['3E', '2C', '2D', '2E', '1A', '1B', '1C', '1D', '1E'];
      const curIdx = cells.indexOf(cellule);
      if (curIdx === -1) return { niveau: 'faible', cellule: '2D' };
      const steps = score >= 80 ? cells.length : score >= 60 ? 3 : 1;
      const targetIdx = Math.min(curIdx + steps, cells.length - 1);
      return { niveau: 'faible', cellule: cells[targetIdx] };
    }
    // Moyen → toujours faible
    if (niveau === 'moyen') {
      const cells = ['3E', '2C', '2D', '2E', '1A', '1B', '1C', '1D', '1E'];
      if (score >= 80) return { niveau: 'faible', cellule: '1E' };
      return { niveau: 'faible', cellule: '2D' };
    }
    // Élevé ou Critique → moyen (par défaut) ou faible (bon score)
    if (niveau === 'eleve' || niveau === 'critique') {
      if (score >= 80) return { niveau: 'faible', cellule: '1E' };
      if (score >= 60) return { niveau: 'faible', cellule: '2D' };
      return { niveau: 'moyen', cellule: '3C' };
    }
    return { niveau: 'faible', cellule: '2D' };
  }
  const [residuelChoisi, setResiduelChoisi] = useState<{ niveau: string; cellule: string }>({ niveau: 'moyen', cellule: '3C' });
  const userChangedResiduel = useRef(false);
  useEffect(() => {
    if (!userChangedResiduel.current) {
      setResiduelChoisi(suggererResiduel(ecartNiveau, ecartCellule, scorePourcentage));
    }
  }, [scorePourcentage, ecartNiveau]);
  // Liste des cellules disponibles pour le niveau résiduel choisi
  const CELLULES_PAR_NIVEAU: Record<string, string[]> = {
    critique: ['5A', '5B', '4A', '4B'],
    eleve: ['5C', '5D', '4C', '3A', '3B'],
    moyen: ['4D', '4E', '3C', '3D', '2A', '2B'],
    faible: ['3E', '2C', '2D', '2E', '1A', '1B', '1C', '1D', '1E'],
  };
  const cellulesDispo = CELLULES_PAR_NIVEAU[residuelChoisi.niveau] || [];
  const suggestionCourante = suggererResiduel(ecartNiveau, ecartCellule, scorePourcentage);

  // Vérifications d'objectivité
  const critereZero = Object.entries(notes).filter(([_, v]) => v === 0).map(([k]) => CRITERES.find(c => c.id === k)!.label);
  const peutAccepter = tousNotes && scorePourcentage >= seuil.accept && critereZero.length === 0;
  const peutReserver = tousNotes && scorePourcentage >= seuil.reserve;

  // Alerte cohérence : pattern inhabituel
  const alerteCohérence = (() => {
    const items: string[] = [];
    const p = notes.pertinence || 0;
    const r = notes.realisme || 0;
    const ex = notes.exhaustivite || 0;
    const pr = notes.precision || 0;
    const sp = notes.specificite || 0;
    const co = notes.coherence || 0;
    if (p >= 3 && r <= 1) items.push('Pertinence élevée mais Réalisme faible — une action pertinente doit être réaliste');
    if (ex >= 3 && pr <= 1) items.push('Exhaustivité élevée mais Précision faible — difficile d\'être exhaustif sans être précis');
    if (sp >= 3 && co <= 1) items.push('Spécificité élevée mais Cohérence faible — une action spécifique devrait être cohérente');
    if (p <= 1 && ex <= 1 && pr <= 1 && sp <= 1 && r <= 1 && co <= 1 && tousNotes) items.push('Tous les critères sont faibles — vérifier que le PAC n\'est pas simplement inacceptable');
    return items;
  })();

  // Impact par critère (pondéré)
  const impactCritere = CRITERES.map(c => ({
    ...c,
    note: notes[c.id] || 0,
    contrib: (notes[c.id] || 0) * c.ponderation,
    maxContrib: 4 * c.ponderation,
    pctContrib: Math.round(((notes[c.id] || 0) / 4) * 100),
  })).sort((a, b) => a.pctContrib - b.pctContrib);
  const critereFaible = impactCritere.filter(c => c.note <= 1);
  const critereFort = impactCritere.filter(c => c.note >= 3);

  // Stats IA
  const learningStats = learningEnginePAC.getLearningStatsPAC();

  useEffect(() => {
    if (userChangedDecision.current) return;
    if (!tousNotes) setDecision('refuse');
    else if (peutAccepter) setDecision('accepte');
    else if (peutReserver) setDecision('reserve');
    else setDecision('refuse');
  }, [notes, tousNotes, peutAccepter, peutReserver]);

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
    if (!onSaveDraft && (decision === 'refuse' || decision === 'reserve') && !commentaire.trim()) { alert('Veuillez fournir un commentaire'); return; }
    if (!onSaveDraft && !attestationRisque) { alert('Veuillez confirmer l\'impact sur le risque résiduel'); return; }
    setIsSubmitting(true);
    try {
      const evaluationData = {
        note_pertinence: notes.pertinence, note_exhaustivite: notes.exhaustivite, note_precision: notes.precision,
        note_specificite: notes.specificite, note_realisme: notes.realisme, note_tracabilite: notes.realisme, note_coherence: notes.coherence,
        note_globale: Math.round(scorePondere * 10) / 10,
        decision: decision as 'accepte' | 'reserve' | 'refuse',
        commentaire_refus: commentaire,
        evalue_par: user?.id || '', evalue_le: new Date().toISOString(),
        risque_residuel_cible_niveau: residuelChoisi.niveau as 'critique' | 'eleve' | 'moyen' | 'faible',
        risque_residuel_cible_cellule: residuelChoisi.cellule,
      };

      if (onSaveDraft) {
        onSaveDraft({ notes, decision, commentaire, reserves });
        onSuccess();
        return;
      }

      await evaluerPAC(ecartId, evaluationData);
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
        {/* INFOS ÉCART + RISQUE OACI */}
        <div className="p-4 rounded-lg border border-border bg-muted/20">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <div><p className="text-[10px] text-muted-foreground uppercase">Référence</p><p className="font-mono font-medium">{ecart.reference}</p></div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Niveau risque</p>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${ecartNiveau === 'critique' ? 'badge danger animate-pulse' : ecartNiveau === 'eleve' ? 'badge warning' : ecartNiveau === 'moyen' ? 'badge primary' : 'badge success'}`}>
                  {ecartNiveau === 'eleve' ? 'Élevé' : ecartNiveau.charAt(0).toUpperCase() + ecartNiveau.slice(1)}
                </span>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Indice OACI</p>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {ecartCellule && /^[1-5][A-E]$/.test(ecartCellule) ? (
                  <span className={`inline-flex items-center justify-center rounded font-bold text-[10px] px-1.5 py-0.5 font-mono ${getCellColor(ecartCellule)}`}>
                    {ecartCellule}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">—</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Risque résiduel cible</p>
              <div className="flex items-center gap-1 mt-0.5">
                <select value={residuelChoisi.niveau}
                  onChange={e => { userChangedResiduel.current = true; const cells = CELLULES_PAR_NIVEAU[e.target.value] || []; setResiduelChoisi({ niveau: e.target.value, cellule: cells.includes(residuelChoisi.cellule) ? residuelChoisi.cellule : cells[Math.floor(cells.length / 2)] }); }}
                  className="h-7 text-[10px] px-1.5 rounded border border-border bg-background cursor-pointer">
                  {[
                    ...(ecartNiveau === 'critique' ? [{ niveau: 'critique', label: 'Critique' }] : []),
                    ...(ecartNiveau === 'critique' || ecartNiveau === 'eleve' ? [{ niveau: 'eleve', label: 'Élevé' }] : []),
                    ...(ecartNiveau === 'critique' || ecartNiveau === 'eleve' || ecartNiveau === 'moyen' ? [{ niveau: 'moyen', label: 'Moyen' }] : []),
                    { niveau: 'faible', label: 'Faible' },
                  ].map(opt => (
                    <option key={opt.niveau} value={opt.niveau}>{opt.label}</option>
                  ))}
                </select>
                <select value={residuelChoisi.cellule}
                  onChange={e => { userChangedResiduel.current = true; setResiduelChoisi(prev => ({ ...prev, cellule: e.target.value })); }}
                  className="h-7 text-[10px] px-1.5 rounded border border-border bg-background cursor-pointer font-mono">
                  {cellulesDispo.map(cell => (
                    <option key={cell} value={cell}
                      className={getRiskLevelBgColor(residuelChoisi.niveau)}>
                      {cell}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Aérodrome</p><p className="font-medium">{aerodromes?.find((a: any) => a.id === ecart.aerodrome_id)?.nom || ecart.aerodrome_id}</p></div>
            <div><p className="text-[10px] text-muted-foreground uppercase">Soumis le</p><p className="font-medium">{ecart.pac?.soumis_le ? new Date(ecart.pac.soumis_le).toLocaleDateString('fr-FR') : '—'}</p></div>
          </div>
          <p className="text-sm mt-2">{ecart.libelle}</p>
        </div>

        {/* Délai d'évaluation inspecteur */}
        {ecart.evaluation_pac?.deadline && (() => {
          const deadline = new Date(ecart.evaluation_pac!.deadline!)
          const maintenant = new Date()
          const joursRestants = Math.ceil((deadline.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24))
          const depasse = joursRestants < 0
          const couleur = depasse ? 'text-danger bg-danger/10 border-danger/30' :
            joursRestants <= 3 ? 'text-warning bg-warning/10 border-warning/30' :
            'text-success bg-success/10 border-success/30'
          return (
            <div className={`flex items-center gap-2 px-3 py-2 rounded border ${couleur}`}>
              <Clock className="w-4 h-4 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-semibold">Délai d'évaluation</p>
                <p>
                  {depasse
                    ? `Dépassé de ${Math.abs(joursRestants)}j — le ${deadline.toLocaleDateString('fr-FR')}`
                    : `${joursRestants}j restant${joursRestants > 1 ? 's' : ''} — avant le ${deadline.toLocaleDateString('fr-FR')}`
                  }
                </p>
              </div>
            </div>
          )
        })()}

        {/* ACTIONS PROPOSÉES */}
        {actions.length > 0 && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-role-primary mb-2 block">
              Actions proposées ({actions.length})
            </span>
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
          </div>
        )}

        {/* CRITÈRES AVEC SCORING 0-4 — TABLEAU COMPACT 6 COLONNES */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-role-primary">Critères d'évaluation</span>
            <button type="button" onClick={() => setShowAiHelp(!showAiHelp)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
              <Star className="w-3 h-3" /> Aide IA
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">Notez chaque critère de 0 (insuffisant) à 4 (excellent)</p>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-center table-fixed">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {CRITERES.map((critere) => (
                    <th key={critere.id} className="px-1 py-2 border-r border-border last:border-r-0 text-[11px] font-bold text-foreground" title={critere.description}>
                      {critere.label}
                      <span className="block text-[10px] font-medium text-muted-foreground mt-0.5">{Math.round(critere.ponderation * 100)}%</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {CRITERES.map((critere) => {
                    const noteActuelle = notes[critere.id] || 0;
                    const ic = impactCritere.find(c => c.id === critere.id)!;
                    return (
                      <td key={critere.id} className="px-1 py-1.5 border-r border-border last:border-r-0 align-top">
                        <div className="flex flex-col items-center gap-0.5">
                          {NIVEAUX_SCORE.map((niveau) => (
                            <button key={niveau.valeur} type="button"
                              title={niveau.label}
                              onClick={() => setNotes({ ...notes, [critere.id]: niveau.valeur })}
                              className={`w-full py-1 rounded text-[10px] font-medium border transition-all cursor-pointer ${
                                noteActuelle === niveau.valeur
                                  ? niveau.valeur === 0
                                    ? 'bg-gray-700 text-white border-gray-800 hover:opacity-80'
                                    : `${niveau.bg} ${niveau.color} ${niveau.border} hover:opacity-80`
                                  : 'border-border text-muted-foreground hover:bg-muted/50'
                              }`}>
                              {niveau.valeur}
                            </button>
                          ))}
                          {noteActuelle > 0 && ic.pctContrib <= 33 && (
                            <span className="text-[8px] text-danger font-bold mt-0.5">▼</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-t border-border">
                  {CRITERES.map((critere) => {
                    const noteActuelle = notes[critere.id] || 0;
                    return (
                      <td key={critere.id} className="px-1 py-1 border-r border-border last:border-r-0 min-h-[28px]">
                        {noteActuelle > 0 && noteActuelle <= 2 ? (
                          <span className="text-[9px] text-danger break-words leading-tight block" title={critere.mauvaisExemple}>⚠ {critere.mauvaisExemple}</span>
                        ) : noteActuelle >= 3 ? (
                          <span className="text-[9px] text-success break-words leading-tight block" title={critere.bonExemple}>✓ {critere.bonExemple}</span>
                        ) : (
                          <span className="text-[9px] text-transparent">&nbsp;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Alertes de cohérence */}
          {tousNotes && alerteCohérence.length > 0 && (
            <div className="mt-2 space-y-1">
              {alerteCohérence.map((msg, i) => (
                <div key={i} className="flex items-start gap-1.5 p-2 rounded bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-3 h-3 text-amber-600 mt-0.5 flex-shrink-0" />
                  <span className="text-[11px] text-amber-800">{msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Vue impact critères faibles */}
          {tousNotes && critereFaible.length > 0 && (
            <div className="mt-2 p-2 rounded bg-red-50 border border-red-200">
              <p className="text-[10px] font-semibold text-red-700 uppercase mb-1">Points d'attention</p>
              <div className="flex flex-wrap gap-2">
                {critereFaible.map(c => (
                  <span key={c.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-medium">
                    {c.label}: {c.note}/4 (pèse {Math.round(c.ponderation * 100)}% du score)
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Aide IA */}
          {showAiHelp && (
            <div className="mt-2 p-3 rounded bg-blue-50 border border-blue-200 space-y-2">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-blue-600" />
                <span className="text-[11px] font-semibold text-blue-800">Analyse IA de l'évaluation</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-blue-900">
                <p>• {tousNotes ? `Score pondéré : ${scorePondere.toFixed(1)}/4 (${scorePourcentage}%)` : 'Évaluez tous les critères pour obtenir une analyse'}</p>
                <p>• Seuils adaptés au risque <strong className="capitalize">{ecartNiveau}</strong> : Accepté ≥ {seuil.accept}%, Réserves ≥ {seuil.reserve}%</p>
                {tousNotes && (
                  <>
                    <p>• D'après l'historique ({learningStats.total_feedbacks} évaluations), le taux de concordance est de <strong>{Math.round(learningStats.taux_concordance)}%</strong></p>
                    {peutAccepter && <p className="text-success">✓ L'évaluation est cohérente avec les seuils — <strong>Acceptation recommandée</strong></p>}
                    {!peutAccepter && peutReserver && <p className="text-amber-700">⚠ Score insuffisant pour acceptation directe — <strong>Réserves recommandées</strong></p>}
                    {!peutReserver && <p className="text-red-700">✗ Score insuffisant — <strong>Refus recommandé</strong></p>}
                    {critereZero.length > 0 && (
                      <p className="text-red-700">✗ Critères à 0 : <strong>{critereZero.join(', ')}</strong> — un critère non noté bloque l'acceptation</p>
                    )}
                  </>
                )}
              </div>
              <details>
                <summary className="text-[10px] text-blue-600 cursor-pointer font-medium">Pondérations apprises par l'IA</summary>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
                  {Object.entries(learningStats.ponderations_criteres).map(([k, v]) => (
                    <span key={k} className="px-1 py-0.5 rounded bg-blue-100/50">
                      {k}: {v !== undefined ? (v as number).toFixed(2) : 'N/A'}
                    </span>
                  ))}
                </div>
              </details>
            </div>
          )}
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
            <label className={`flex-1 p-3 rounded border-2 text-center ${decision === 'accepte' ? 'border-success bg-success/10' : 'border-border'} ${!peutAccepter && decision !== 'accepte' ? 'opacity-50' : ''}`}>
              <input type="radio" name="decision" checked={decision === 'accepte'} onChange={() => { userChangedDecision.current = true; setDecision('accepte'); }} className="hidden" disabled={!peutAccepter} />
              <CheckCircle2 className={`w-5 h-5 mx-auto mb-1 ${decision === 'accepte' ? 'text-success' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold">Accepter</p>
              <p className="text-[10px] text-muted-foreground">Score ≥ {seuil.accept}%</p>
              {!peutAccepter && <p className="text-[9px] text-danger">Non disponible</p>}
            </label>
            <label className={`flex-1 p-3 rounded border-2 text-center ${decision === 'reserve' ? 'border-warning bg-warning/10' : 'border-border'} ${!peutReserver && decision !== 'reserve' ? 'opacity-50' : ''}`}>
              <input type="radio" name="decision" checked={decision === 'reserve'} onChange={() => { userChangedDecision.current = true; setDecision('reserve'); }} className="hidden" disabled={!peutReserver} />
              <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${decision === 'reserve' ? 'text-warning' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold">Réserves</p>
              <p className="text-[10px] text-muted-foreground">Score ≥ {seuil.reserve}%</p>
              {!peutReserver && <p className="text-[9px] text-danger">Non disponible</p>}
            </label>
            <label className={`flex-1 p-3 rounded border-2 text-center ${decision === 'refuse' ? 'border-danger bg-danger/10' : 'border-border'}`}>
              <input type="radio" name="decision" checked={decision === 'refuse'} onChange={() => { userChangedDecision.current = true; setDecision('refuse'); }} className="hidden" />
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
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addReserve(); } }}
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

        {/* RISQUE RÉSIDUEL — attestation inspecteur */}
        <div className="p-3 rounded border border-border bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Risque résiduel après évaluation</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Actuel :</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${getRiskLevelBgColor(ecartNiveau)}`}>
                {ecartNiveau === 'eleve' ? 'Élevé' : ecartNiveau.charAt(0).toUpperCase() + ecartNiveau.slice(1)}
              </span>
              {ecartCellule && /^[1-5][A-E]$/.test(ecartCellule) && (
                <span className={`inline-flex items-center justify-center rounded font-bold text-[10px] px-1.5 py-0.5 font-mono ${getCellColor(ecartCellule)}`}>
                  {ecartCellule}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">→ Cible :</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${getRiskLevelBgColor(residuelChoisi.niveau)}`}>
                {residuelChoisi.niveau === 'eleve' ? 'Élevé' : residuelChoisi.niveau.charAt(0).toUpperCase() + residuelChoisi.niveau.slice(1)}
              </span>
              <span className={`inline-flex items-center justify-center rounded font-bold text-[10px] px-1.5 py-0.5 font-mono ${getRiskLevelBgColor(residuelChoisi.niveau)}`}>
                {residuelChoisi.cellule}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between mb-2 -mt-1">
            <span className="text-[9px] text-muted-foreground">Suggestion système : <strong>{suggestionCourante.niveau === 'eleve' ? 'Élevé' : suggestionCourante.niveau.charAt(0).toUpperCase() + suggestionCourante.niveau.slice(1)} ({suggestionCourante.cellule})</strong></span>
            {userChangedResiduel.current && <span className="text-[9px] text-amber-600">Modifié par l'inspecteur</span>}
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={attestationRisque} onChange={e => setAttestationRisque(e.target.checked)} className="mt-0.5" />
            <span className="text-[11px] text-muted-foreground leading-snug">
              Je confirme que ma décision (<strong>{decision === 'accepte' ? 'Acceptation' : decision === 'reserve' ? 'Acceptation avec réserves' : 'Refus'}</strong>) aura un impact sur le niveau de risque résiduel de l'écart, et que les actions correctives associées permettent d'atteindre le niveau cible.
            </span>
          </label>
        </div>

        <hr className="border-border" />

        {/* FOOTER */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary">Annuler</button>
          <button type="button" onClick={handleSubmit}
            disabled={isSubmitting || (onSaveDraft ? false : !tousNotes || (decision !== 'accepte' && !commentaire.trim()) || (decision === 'accepte' && !peutAccepter) || !attestationRisque)}
            className={`btn ${onSaveDraft ? 'btn-primary' : decision === 'accepte' ? 'btn-success' : decision === 'reserve' ? 'btn-warning' : 'btn-danger'}`}>
            {isSubmitting ? 'En cours...' : onSaveDraft ? 'Enregistrer le brouillon' : decision === 'accepte' ? 'Accepter' : decision === 'reserve' ? 'Accepter avec réserves' : 'Refuser'}
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
