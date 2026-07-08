'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import {
  FileText, CheckCircle2, XCircle, X, Eye, AlertTriangle, HelpCircle, Sparkles, AlertCircle, MinusCircle, User, Calendar, Star, Clock,
} from 'lucide-react';
import { learningEnginePAC } from '@/lib/learningEnginePAC';
import { ecartAgent } from '@/lib/ia/agents/ecartAgent';
import { getCellColor, getRiskLevelBgColor } from '@/lib/risque';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

interface Critere {
  id: string;
  label: string;
  description: string;
  bonExemple: string;
  mauvaisExemple: string;
  ponderation: number;
}

const CRITERES_PREUVES: Critere[] = [
  {
    id: 'completude',
    label: 'Complétude',
    description: 'Tous les livrables attendus sont-ils fournis ?',
    bonExemple: 'Facture + photo après travaux + rapport de test',
    mauvaisExemple: 'Facture uniquement, sans preuve de réalisation',
    ponderation: 0.25,
  },
  {
    id: 'qualite',
    label: 'Qualité',
    description: 'Les documents sont-ils lisibles ? Les photos identifiables ?',
    bonExemple: 'Photo datée avec légende, document PDF signé',
    mauvaisExemple: 'Photo floue sans date, document illisible',
    ponderation: 0.20,
  },
  {
    id: 'pertinence',
    label: 'Pertinence',
    description: 'Les preuves démontrent-elles réellement la réalisation des actions ?',
    bonExemple: 'Photo de l\'équipement après réparation',
    mauvaisExemple: 'Photo générique non liée à l\'action',
    ponderation: 0.25,
  },
  {
    id: 'tracabilite',
    label: 'Traçabilité',
    description: 'Les preuves sont-elles datées et signées ?',
    bonExemple: 'Document daté et signé par le responsable',
    mauvaisExemple: 'Document sans date ni signature',
    ponderation: 0.15,
  },
  {
    id: 'efficacite',
    label: 'Efficacité',
    description: 'L\'action a-t-elle réellement résolu l\'écart ?',
    bonExemple: 'Rapport de test confirmant le bon fonctionnement',
    mauvaisExemple: 'Preuve de réalisation mais problème persistant',
    ponderation: 0.15,
  },
];

const NIVEAUX_SCORE = [
  { valeur: 0, label: 'Non évalué', color: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-muted' },
  { valeur: 1, label: 'Insuffisant', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger' },
  { valeur: 2, label: 'Partiel', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning' },
  { valeur: 3, label: 'Satisfaisant', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary' },
  { valeur: 4, label: 'Excellent', color: 'text-success', bg: 'bg-success/10', border: 'border-success' },
];

interface VerificationIA {
  conforme: boolean;
  niveauConfiance: number;
  elementsManquants: string[];
  preuvesSuffisantes: boolean;
}

interface EvaluationPreuvesFormProps {
  ecartId: string;
  actionId?: string;
  onSuccess: () => void;
  onCancel: () => void;
  userRole?: string;
}

export function EvaluationPreuvesForm({
  ecartId,
  actionId,
  onSuccess,
  onCancel,
  userRole = 'focal_operator'
}: EvaluationPreuvesFormProps) {
  const ecarts = useOptimizedStore(s => s.ecarts);
  const user = useOptimizedStore(s => s.user);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const evaluerPreuves = useAppStore(s => s.evaluerPreuves);
  const addNotification = useAppStore(s => s.addNotification);
  const ecart = ecarts.find(e => e.id === ecartId);

  const [notes, setNotes] = useState<Record<string, number>>({
    completude: 0,
    qualite: 0,
    pertinence: 0,
    tracabilite: 0,
    efficacite: 0,
  });
  const [commentaire, setCommentaire] = useState('');
  const [decision, setDecision] = useState<'valide' | 'refuse' | 'reserve'>('valide');
  const [reserves, setReserves] = useState<string[]>([]);
  const [newReserve, setNewReserve] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [verificationIA, setVerificationIA] = useState<VerificationIA | null>(null);
  const [isVerifyingIA, setIsVerifyingIA] = useState(false);
  const [showAiHelp, setShowAiHelp] = useState(false);
  const userChangedDecision = useRef(false);
  const [residuelChoisi, setResiduelChoisi] = useState<{ niveau: string; cellule: string }>({ niveau: 'moyen', cellule: '3C' });
  const [attestationRisque, setAttestationRisque] = useState(false);
  const userChangedResiduel = useRef(false);

  useEffect(() => {
    if (ecart) {
      runVerificationIA();
    }
  }, [ecartId]);

  const runVerificationIA = async () => {
    if (!ecart?.preuves?.fichiers?.length) return;
    setIsVerifyingIA(true);
    try {
      const result = await ecartAgent.verifyPreuves({
        ecartId,
        preuves: ecart.preuves,
      }, {});
      setVerificationIA({
        conforme: result.conforme,
        niveauConfiance: result.niveauConfiance,
        elementsManquants: result.elementsManquants,
        preuvesSuffisantes: result.preuvesSuffisantes,
      });
    } catch (e) {
      console.error('Erreur vérification IA:', e);
    } finally {
      setIsVerifyingIA(false);
    }
  };

  if (!ecart) {
    return (
      <div className="form-container text-center py-8" data-role={userRole}>
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-body text-muted-foreground">Écart non trouvé</p>
        <button type="button" onClick={onCancel} className="btn btn-secondary mt-4 gap-2">
          <X className="w-4 h-4" />Fermer
        </button>
      </div>
    );
  }

  const preuves = ecart.preuves?.fichiers || [];
  const nbFichiers = preuves.length;
  const minFichiersRequis = ecart.niveau_risque === 'critique' ? 3 : ecart.niveau_risque === 'eleve' ? 2 : 1;
  const fichiersSuffisants = nbFichiers >= minFichiersRequis;

  // Feedback dynamique basé sur les preuves réelles (remplace les exemples statiques)
  const getDynamicFeedback = (critereId: string, note: number): string => {
    const nomsFichiers = preuves.map(f => f.nom).join(', ');
    const avecDescription = preuves.filter(f => f.description?.trim()).length;
    const types = [...new Set(preuves.map(f => f.type).filter(Boolean))];
    const commentaireExploitant = ecart.preuves?.commentaire?.trim();
    const prefix = `Noté ${note}/4 — `;

    switch (critereId) {
      case 'completude':
        if (note >= 3) return `${prefix}${nbFichiers} fichier${nbFichiers > 1 ? 's' : ''} fourni${nbFichiers > 1 ? 's' : ''} (min. ${minFichiersRequis})`;
        return `${prefix}${nbFichiers}/${minFichiersRequis} fichier${minFichiersRequis > 1 ? 's' : ''} requis — ${nomsFichiers || 'aucun fichier'}`;
      case 'qualite':
        if (note >= 3) return `${prefix}${avecDescription}/${nbFichiers} fichier${nbFichiers > 1 ? 's' : ''} avec description${types.length > 0 ? ` (${types.join(', ')})` : ''}`;
        return `${prefix}${nbFichiers - avecDescription} fichier${nbFichiers - avecDescription > 1 ? 's' : ''} sans description — vérifier la lisibilité`;
      case 'pertinence':
        if (note >= 3) return `${prefix}Preuves${commentaireExploitant ? ` : "${commentaireExploitant.substring(0, 60)}"` : ''} — ${nomsFichiers.substring(0, 80)}`;
        return `${prefix}Lien avec les actions correctives non démontré — ${nomsFichiers.substring(0, 80) || 'aucune preuve'}`;
      case 'tracabilite':
        if (note >= 3) return `${prefix}${avecDescription}/${nbFichiers} fichiers documentés${commentaireExploitant ? ' + commentaire exploitant' : ''}`;
        return `${prefix}${nbFichiers - avecDescription} fichier${nbFichiers - avecDescription > 1 ? 's' : ''} sans description — date et signature manquantes`;
      case 'efficacite':
        if (note >= 3) return `${prefix}${nbFichiers} preuve${nbFichiers > 1 ? 's' : ''} démontrant la réalisation des actions${commentaireExploitant ? ` («${commentaireExploitant.substring(0, 50)}») ` : ' '}`;
        return `${prefix}Impact réel sur l'écart à vérifier — ${nomsFichiers.substring(0, 80) || 'preuves insuffisantes'}`;
      default:
        return note >= 3 ? `${prefix}Conforme` : `${prefix}À vérifier`;
    }
  };

  const scorePondere = Object.entries(notes).reduce((sum, [key, note]) => {
    const critere = CRITERES_PREUVES.find(c => c.id === key);
    return sum + (note || 0) * (critere?.ponderation || 0.2);
  }, 0);

  const scoreMax = 4;
  const scorePourcentage = Math.round((scorePondere / scoreMax) * 100);

  const tousNotes = Object.values(notes).every(v => v > 0);
  const scoreEleve = scorePondere >= 3.2;
  const scoreMoyen = scorePondere >= 2.0 && scorePondere < 3.2;
  const peutAccepter = tousNotes && scoreEleve;
  const peutReserver = tousNotes && scoreMoyen;

  // Impact par critère
  const impactCritere = CRITERES_PREUVES.map(c => ({
    ...c,
    note: notes[c.id] || 0,
    contrib: (notes[c.id] || 0) * c.ponderation,
    maxContrib: 4 * c.ponderation,
    pctContrib: Math.round(((notes[c.id] || 0) / 4) * 100),
  })).sort((a, b) => a.pctContrib - b.pctContrib);
  const critereFaible = impactCritere.filter(c => c.note <= 1);
  const critereFort = impactCritere.filter(c => c.note >= 3);
  const critereZero = Object.entries(notes).filter(([_, v]) => v === 0).map(([k]) => CRITERES_PREUVES.find(c => c.id === k)!.label);

  // Alertes de cohérence pour l'évaluation des preuves
  const alerteCohérence = (() => {
    const items: string[] = [];
    const co = notes.completude || 0;
    const q = notes.qualite || 0;
    const p = notes.pertinence || 0;
    const t = notes.tracabilite || 0;
    const ef = notes.efficacite || 0;
    if (co >= 3 && q <= 1) items.push('Complétude élevée mais Qualité faible — des fichiers nombreux mais illisibles ne sont pas exploitables');
    if (p >= 3 && ef <= 1) items.push('Pertinence élevée mais Efficacité faible — des preuves pertinentes devraient démontrer l\'efficacité');
    if (t >= 3 && co <= 1) items.push('Traçabilité élevée mais Complétude faible — des preuves tracées mais incomplètes manquent leur objectif');
    if (p <= 1 && co <= 1 && q <= 1 && t <= 1 && ef <= 1 && tousNotes) items.push('Tous les critères sont faibles — vérifier que les preuves ne sont pas simplement insuffisantes');
    return items;
  })();

  const learningStats = learningEnginePAC.getLearningStatsPAC();

  function suggererResiduel(niveau: string, cellule: string, score: number): { niveau: string; cellule: string } {
    if (niveau === 'faible' || niveau === 'tres_faible') {
      const cells = ['3E', '2C', '2D', '2E', '1A', '1B', '1C', '1D', '1E'];
      const curIdx = cells.indexOf(cellule);
      if (curIdx === -1) return { niveau: 'faible', cellule: '2D' };
      const steps = score >= 80 ? cells.length : score >= 60 ? 3 : 1;
      const targetIdx = Math.min(curIdx + steps, cells.length - 1);
      return { niveau: 'faible', cellule: cells[targetIdx] };
    }
    if (niveau === 'moyen') {
      const cells = ['3E', '2C', '2D', '2E', '1A', '1B', '1C', '1D', '1E'];
      if (score >= 80) return { niveau: 'faible', cellule: '1E' };
      return { niveau: 'faible', cellule: '2D' };
    }
    if (niveau === 'eleve' || niveau === 'critique') {
      if (score >= 80) return { niveau: 'faible', cellule: '1E' };
      if (score >= 60) return { niveau: 'faible', cellule: '2D' };
      return { niveau: 'moyen', cellule: '3C' };
    }
    return { niveau: 'faible', cellule: '2D' };
  }
  const CELLULES_PAR_NIVEAU: Record<string, string[]> = {
    critique: ['5A', '5B', '4A', '4B'],
    eleve: ['5C', '5D', '4C', '3A', '3B'],
    moyen: ['4D', '4E', '3C', '3D', '2A', '2B'],
    faible: ['3E', '2C', '2D', '2E', '1A', '1B', '1C', '1D', '1E'],
  };
  const ecartNiveau = ecart.niveau_risque || 'moyen';
  const ecartCellule = ecart.cellule_risque_oaci || '3C';
  const cellulesDispo = CELLULES_PAR_NIVEAU[residuelChoisi.niveau] || [];
  const suggestionResiduelle = suggererResiduel(ecartNiveau, ecartCellule, scorePourcentage);

  useEffect(() => {
    if (userChangedDecision.current) return;
    if (!tousNotes) {
      setDecision('refuse');
    } else if (scoreEleve) {
      setDecision('valide');
    } else if (scoreMoyen) {
      setDecision('reserve');
    } else {
      setDecision('refuse');
    }
  }, [notes, tousNotes, scoreEleve, scoreMoyen]);

  useEffect(() => {
    if (userChangedResiduel.current) return;
    const ciblePAC = ecart?.evaluation_pac;
    if (ciblePAC?.risque_residuel_cible_niveau && ciblePAC?.risque_residuel_cible_cellule) {
      setResiduelChoisi({
        niveau: ciblePAC.risque_residuel_cible_niveau,
        cellule: ciblePAC.risque_residuel_cible_cellule,
      });
    } else {
      setResiduelChoisi(suggererResiduel(ecart.niveau_risque || 'moyen', ecart.cellule_risque_oaci || '3C', scorePourcentage));
    }
  }, [scorePourcentage, ecart.niveau_risque, ecart?.evaluation_pac?.risque_residuel_cible_niveau]);

  const addReserve = () => {
    if (newReserve.trim()) {
      setReserves([...reserves, newReserve.trim()]);
      setNewReserve('');
    }
  };

  const handleSubmit = async () => {
    if (decision === 'refuse' && !commentaire.trim()) {
      alert('Veuillez fournir un commentaire expliquant le refus');
      return;
    }
    if (decision === 'reserve' && (reserves.length === 0 && !commentaire.trim())) {
      alert('Veuillez ajouter au moins une réserve ou un commentaire pour l\'acceptation avec réserves');
      return;
    }
    if (!fichiersSuffisants) {
      alert(`Minimum ${minFichiersRequis} fichier(s) requis pour un écart de niveau ${ecart.niveau_risque}. ${nbFichiers} fourni(s).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await evaluerPreuves(ecartId, {
        decision,
        commentaire: decision === 'reserve' ? `Réserves: ${reserves.join('; ')}${commentaire ? ` — ${commentaire}` : ''}` : commentaire,
        valide_par: user?.id || '',
        valide_le: new Date().toISOString(),
        notes_criteres: {
          completude: notes.completude || 0,
          qualite: notes.qualite || 0,
          pertinence: notes.pertinence || 0,
          tracabilite: notes.tracabilite || 0,
          efficacite: notes.efficacite || 0,
        },
        note_globale: Math.round(scorePondere * 10) / 10,
        verification_ia: verificationIA || undefined,
        reserves: decision === 'reserve' ? reserves : undefined,
        niveau_risque_reevalue: residuelChoisi.niveau as 'critique' | 'eleve' | 'moyen' | 'faible',
        cellule_risque_oaci_reevaluee: residuelChoisi.cellule,
      });

      addNotification({
        user_id: user?.id || '',
        type: decision === 'valide' ? 'success' : decision === 'reserve' ? 'warning' : 'danger',
        title: decision === 'valide' ? 'Preuves validées' : decision === 'reserve' ? 'Accepté avec réserves' : 'Preuves refusées',
        message: `Les preuves pour l'écart ${ecart.reference} ont été ${decision === 'valide' ? 'validées' : decision === 'reserve' ? 'acceptées avec réserves' : 'refusées'}`,
        canal: 'in_app',
      });

      setShowFeedback(true);
    } catch (error) {
      console.error('Erreur lors de l\'évaluation des preuves:', error);
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: 'Une erreur est survenue lors de l\'évaluation',
        canal: 'in_app',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedback = (utilite: 'oui' | 'peu' | 'non') => {
    const contexte = profilsRisque[ecart.aerodrome_id];
    if (contexte) {
      learningEnginePAC.enregistrerFeedbackPreuves(
        ecartId,
        ecart.aerodrome_id,
        { score_global: contexte.score_global, nb_preuves: nbFichiers, delai_restant: 30 },
        [],
        Object.entries(notes).filter(([_, v]) => v >= 3).map(([k]) => k),
        false as any,
        (decision === 'reserve' ? 'refuse' : decision) as 'valide' | 'refuse',
        utilite,
        commentaire
      );
    }
    setShowFeedback(false);
    onSuccess();
  };

  return (
    <div data-role={userRole} data-module="evaluation-preuves">
      <div className="space-y-5">
        {/* Informations écart */}
        <div className="p-4 rounded-lg border border-border bg-muted/20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Référence</p>
              <p className="font-mono font-medium">{ecart.reference}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Niveau risque</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${getRiskLevelBgColor(ecart.niveau_risque || '')}`}>
                {ecart.niveau_risque === 'eleve' ? 'Élevé' : ecart.niveau_risque?.charAt(0).toUpperCase() + ecart.niveau_risque?.slice(1)}
              </span>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Indice OACI</p>
              {(() => {
                const cell = ecart.cellule_risque_oaci;
                return cell && /^[1-5][A-E]$/.test(cell) ? (
                  <span className={`inline-flex items-center justify-center rounded font-bold text-[10px] px-1.5 py-0.5 font-mono ${getCellColor(cell)}`}>
                    {cell}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">—</span>
                );
              })()}
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Preuves</p>
              <p className="font-medium">{preuves.length} fichier(s)</p>
            </div>
          </div>
          <p className="text-sm mt-2">{ecart.libelle}</p>
        </div>

        {/* Délai de validation inspecteur */}
        {ecart.validation_preuves?.deadline && (() => {
          const deadline = new Date(ecart.validation_preuves!.deadline!)
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
                <p className="font-semibold">Délai de validation des preuves</p>
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

        {/* Actions correctives associées */}
        {ecart.pac?.actions && ecart.pac.actions.length > 0 && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-role-primary mb-2 block">
              Actions correctives ({ecart.pac.actions.length})
            </span>
            <div className="space-y-1.5">
              {ecart.pac.actions.map((action, idx) => (
                <div key={idx} className="flex items-start gap-3 text-sm py-2 px-3 rounded border border-border">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-role-primary text-white text-[10px] font-bold flex-shrink-0 mt-0.5">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{action.description}</p>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{action.responsable}</span>
                      {action.date_prevue && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(action.date_prevue).toLocaleDateString('fr-FR')}</span>}
                      {action.livrables?.length > 0 && (
                        <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{action.livrables.join(', ')}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vérification IA */}
        {isVerifyingIA ? (
          <div className="card border-primary/30 bg-primary/5 p-4 rounded-lg flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
            <div>
              <p className="text-sm font-medium">Vérification IA en cours...</p>
              <p className="text-xs text-muted-foreground">Analyse des preuves soumises</p>
            </div>
          </div>
        ) : verificationIA ? (
          <div className={`card p-4 rounded-lg border-2 ${verificationIA.conforme ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">Vérification automatique IA</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${verificationIA.conforme ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                Confiance: {verificationIA.niveauConfiance}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                {verificationIA.preuvesSuffisantes ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-danger" />}
                <span>Preuves suffisantes: {nbFichiers} fichier(s) (min: {minFichiersRequis})</span>
              </div>
              <div className="flex items-center gap-1">
                {verificationIA.conforme ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                <span>Conformité: {verificationIA.conforme ? 'OK' : 'Éléments manquants'}</span>
              </div>
            </div>
            {verificationIA.elementsManquants.length > 0 && (
              <div className="mt-2 p-2 bg-danger/5 rounded text-xs text-danger">
                <p className="font-medium mb-1">Éléments manquants détectés :</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {verificationIA.elementsManquants.map((el, i) => (
                    <li key={i}>{el}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {/* Alert fichiers insuffisants */}
        {!fichiersSuffisants && (
          <div className="alert alert-danger">
            <AlertTriangle className="alert-icon" />
            <div className="alert-content">
              <p className="alert-title">Nombre de fichiers insuffisant</p>
              <p className="alert-description">
                Pour un écart de niveau <strong>{ecart.niveau_risque}</strong>, minimum <strong>{minFichiersRequis}</strong> fichier(s) requis. {nbFichiers} fourni(s).
              </p>
            </div>
          </div>
        )}

        {/* Preuves soumises */}
        {preuves.length > 0 && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-role-primary mb-2 block">
              Preuves soumises ({preuves.length})
            </span>
            <div className="space-y-1.5">
              {preuves.map((preuve: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded border border-border">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" />
                    <div>
                      <span className="text-sm font-medium">{preuve.nom}</span>
                      {preuve.description && <p className="text-[10px] text-muted-foreground">{preuve.description}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => window.open(preuve.url, '_blank')}
                    className="action-button"
                    title="Voir le fichier"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Critères d'évaluation — tableau 5 colonnes */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-role-primary">Critères d'évaluation des preuves</span>
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
                  {CRITERES_PREUVES.map((critere) => (
                    <th key={critere.id} className="px-1 py-2 border-r border-border last:border-r-0 text-[11px] font-bold text-foreground" title={critere.description}>
                      {critere.label}
                      <span className="block text-[10px] font-medium text-muted-foreground mt-0.5">{Math.round(critere.ponderation * 100)}%</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {CRITERES_PREUVES.map((critere) => {
                    const noteActuelle = notes[critere.id] || 0;
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
                        </div>
                      </td>
                    );
                  })}
                </tr>
                <tr className="border-t border-border">
                  {CRITERES_PREUVES.map((critere) => {
                    const noteActuelle = notes[critere.id] || 0;
                    return (
                      <td key={critere.id} className="px-1 py-1 border-r border-border last:border-r-0 min-h-[28px]">
                        {noteActuelle > 0 && noteActuelle <= 2 ? (
                          <span className="text-[9px] text-danger break-words leading-tight block" title={critere.mauvaisExemple}>⚠ {getDynamicFeedback(critere.id, noteActuelle)}</span>
                        ) : noteActuelle >= 3 ? (
                          <span className="text-[9px] text-success break-words leading-tight block" title={critere.bonExemple}>✓ {getDynamicFeedback(critere.id, noteActuelle)}</span>
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

          {/* Points d'attention critères faibles */}
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
                <span className="text-[11px] font-semibold text-blue-800">Analyse IA de l'évaluation des preuves</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-blue-900">
                <p>• {tousNotes ? `Score pondéré : ${scorePondere.toFixed(1)}/4 (${scorePourcentage}%)` : 'Évaluez tous les critères pour obtenir une analyse'}</p>
                <p>• Seuils : Validation ≥ 80%, Réserves ≥ 50%, Refus &lt; 50%</p>
                {tousNotes && (
                  <>
                    <p>• D'après l'historique ({learningStats.total_feedbacks} évaluations), le taux de concordance est de <strong>{Math.round(learningStats.taux_concordance)}%</strong></p>
                    {scoreEleve && <p className="text-success">✓ Score suffisant — <strong>Validation recommandée</strong></p>}
                    {!scoreEleve && scoreMoyen && <p className="text-amber-700">⚠ Score partiel — <strong>Réserves recommandées</strong></p>}
                    {!scoreMoyen && tousNotes && <p className="text-red-700">✗ Score insuffisant — <strong>Refus recommandé</strong></p>}
                    {critereZero.length > 0 && (
                      <p className="text-red-700">✗ Critères à 0 : <strong>{critereZero.join(', ')}</strong> — un critère non noté bloque la validation</p>
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

        {/* Score */}
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

        {/* Décision */}
        <div className="space-y-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-role-primary">Décision</span>
          <div className="flex gap-3">
            <label className={`flex-1 p-3 rounded border-2 text-center ${decision === 'valide' ? 'border-success bg-success/10' : 'border-border'} ${!peutAccepter && decision !== 'valide' ? 'opacity-50' : ''}`}>
              <input type="radio" name="decision" checked={decision === 'valide'} onChange={() => { userChangedDecision.current = true; setDecision('valide'); }} className="hidden" disabled={!peutAccepter} />
              <CheckCircle2 className={`w-5 h-5 mx-auto mb-1 ${decision === 'valide' ? 'text-success' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold">Valider</p>
              <p className="text-[10px] text-muted-foreground">Score ≥ 80%</p>
              {!peutAccepter && <p className="text-[9px] text-danger">Non disponible</p>}
            </label>
            <label className={`flex-1 p-3 rounded border-2 text-center ${decision === 'reserve' ? 'border-warning bg-warning/10' : 'border-border'} ${!peutReserver && decision !== 'reserve' ? 'opacity-50' : ''}`}>
              <input type="radio" name="decision" checked={decision === 'reserve'} onChange={() => { userChangedDecision.current = true; setDecision('reserve'); }} className="hidden" disabled={!peutReserver} />
              <AlertTriangle className={`w-5 h-5 mx-auto mb-1 ${decision === 'reserve' ? 'text-warning' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold">Réserves</p>
              <p className="text-[10px] text-muted-foreground">Score 50-80%</p>
              {!peutReserver && <p className="text-[9px] text-danger">Non disponible</p>}
            </label>
            <label className={`flex-1 p-3 rounded border-2 text-center ${decision === 'refuse' ? 'border-danger bg-danger/10' : 'border-border'}`}>
              <input type="radio" name="decision" checked={decision === 'refuse'} onChange={() => { userChangedDecision.current = true; setDecision('refuse'); }} className="hidden" />
              <XCircle className={`w-5 h-5 mx-auto mb-1 ${decision === 'refuse' ? 'text-danger' : 'text-muted-foreground'}`} />
              <p className="text-xs font-semibold">Refuser</p>
              <p className="text-[10px] text-muted-foreground">Score &lt; 50%</p>
            </label>
          </div>

          {/* Réserves */}
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

          {/* Commentaire */}
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
            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Risque résiduel après évaluation des preuves</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Initial :</span>
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
            <span className="text-[9px] text-muted-foreground">
              {ecart?.evaluation_pac?.risque_residuel_cible_niveau
                ? <>Cible fixée lors de l'évaluation PAC : <strong>{suggestionResiduelle.niveau === 'eleve' ? 'Élevé' : suggestionResiduelle.niveau.charAt(0).toUpperCase() + suggestionResiduelle.niveau.slice(1)} ({suggestionResiduelle.cellule})</strong></>
                : <>Suggestion système : <strong>{suggestionResiduelle.niveau === 'eleve' ? 'Élevé' : suggestionResiduelle.niveau.charAt(0).toUpperCase() + suggestionResiduelle.niveau.slice(1)} ({suggestionResiduelle.cellule})</strong></>}
            </span>
            {userChangedResiduel.current && <span className="text-[9px] text-amber-600">Modifié par l'inspecteur</span>}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[10px] text-muted-foreground">Niveau cible :</label>
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
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={attestationRisque} onChange={e => setAttestationRisque(e.target.checked)} className="mt-0.5" />
            <span className="text-[11px] text-muted-foreground leading-snug">
              Je confirme que les preuves soumises démontrent la réalisation des actions correctives et permettent d'atteindre le niveau de risque résiduel cible (<strong>{residuelChoisi.niveau === 'eleve' ? 'Élevé' : residuelChoisi.niveau.charAt(0).toUpperCase() + residuelChoisi.niveau.slice(1)} – {residuelChoisi.cellule}</strong>).
            </span>
          </label>
        </div>

        <hr className="border-border" />

        {/* Footer */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary">Annuler</button>
          <button type="button" onClick={handleSubmit}
            disabled={isSubmitting || !fichiersSuffisants || (decision !== 'valide' && !commentaire.trim()) || (decision === 'valide' && !peutAccepter) || !attestationRisque}
            className={`btn ${decision === 'valide' ? 'btn-success' : decision === 'reserve' ? 'btn-warning' : 'btn-danger'}`}>
            {isSubmitting ? 'En cours...' : decision === 'valide' ? 'Valider les preuves' : decision === 'reserve' ? 'Accepter avec réserves' : 'Refuser les preuves'}
          </button>
        </div>
      </div>

      {/* Modal feedback */}
      {showFeedback && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-background rounded-2xl max-w-md w-full border-t-4 border-t-role-primary">
            <div className="modal-header">
              <div className="modal-title flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-role-primary" />
                Votre avis nous intéresse
              </div>
              <button className="modal-close" onClick={() => setShowFeedback(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <p className="text-sm">Cette suggestion du profil de risque vous a-t-elle été utile ?</p>
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
