'use client';

import { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertCircle,
  Filter,
  PenLine,
  Upload,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { FileUploader } from '@/components/ui/FileUploader';
import { useAppStore, ChecklistItem } from '@/lib/store';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

// ─── Types ────────────────────────────────────────────────────────────────────

type Resultat = 'SA' | 'NS' | 'NA' | 'NV';

interface StyletChecklistFillerProps {
  surveillanceId: string;
  typeChecklist: 'standard' | 'suivi_ecarts' | 'pac';
  onValider: () => void;
}

// ─── Données simulées cohérentes RAS-14 ──────────────────────────────────────

const CHECKLIST_LOCALE: Omit<ChecklistItem, 'surveillance_id' | 'type_checklist' | 'resultat' | 'observation' | 'fichiers' | 'last_modified' | 'modified_by'>[] = [
  {
    id: 'cl-001', ordre: 1, categorie: 'SGS', domaine: 'SGS',
    reference_ras14: 'RAS 14 – 14.1.1', description: 'Le gestionnaire d\'aérodrome dispose d\'un SGS formalisé et documenté.',
    directive_preuve: 'Manuel SGS, organigramme, politique de sécurité signée par le DG',
  },
  {
    id: 'cl-002', ordre: 2, categorie: 'SGS', domaine: 'SGS',
    reference_ras14: 'RAS 14 – 14.1.2', description: 'Une politique de sécurité est diffusée et comprise par tout le personnel.',
    directive_preuve: 'Affichage de la politique, compte-rendu de diffusion, quiz personnel',
  },
  {
    id: 'cl-003', ordre: 3, categorie: 'SGS', domaine: 'SGS',
    reference_ras14: 'RAS 14 – 14.1.3', description: 'Les objectifs de sécurité sont mesurables et suivis périodiquement.',
    directive_preuve: 'Tableau de bord sécurité, PV de revue de direction, KPIs définis',
  },
  {
    id: 'cl-004', ordre: 4, categorie: 'SLI', domaine: 'SLI',
    reference_ras14: 'RAS 14 – 14.2.1', description: 'Le plan de sauvetage et de lutte contre l\'incendie (SLI) est à jour.',
    directive_preuve: 'Plan SLI daté et signé, dernière révision < 12 mois',
  },
  {
    id: 'cl-005', ordre: 5, categorie: 'SLI', domaine: 'SLI',
    reference_ras14: 'RAS 14 – 14.2.2', description: 'Les véhicules d\'intervention sont disponibles, entretenus et conformes à la catégorie SSLiA.',
    directive_preuve: 'Carnet d\'entretien des véhicules, certificats de conformité, tests d\'intervention',
  },
  {
    id: 'cl-006', ordre: 6, categorie: 'SLI', domaine: 'SLI',
    reference_ras14: 'RAS 14 – 14.2.3', description: 'Les exercices d\'urgence sont organisés selon la fréquence réglementaire.',
    directive_preuve: 'PV des exercices, liste de présence, rapport d\'évaluation post-exercice',
  },
  {
    id: 'cl-007', ordre: 7, categorie: 'PHY', domaine: 'PHY',
    reference_ras14: 'RAS 14 – 14.3.1', description: 'Les aires de mouvement sont inspectées quotidiennement selon la procédure en vigueur.',
    directive_preuve: 'Registre d\'inspections quotidiennes, fiche de contrôle signée, photos éventuelles',
  },
  {
    id: 'cl-008', ordre: 8, categorie: 'PHY', domaine: 'PHY',
    reference_ras14: 'RAS 14 – 14.3.2', description: 'Le balisage lumineux de piste est fonctionnel et conforme.',
    directive_preuve: 'Rapport de contrôle PAPI, VASIS, seuils et axes — test nocturne récent',
  },
  {
    id: 'cl-009', ordre: 9, categorie: 'PHY', domaine: 'PHY',
    reference_ras14: 'RAS 14 – 14.3.3', description: 'Les clôtures et périmètre de sûreté sont intègres.',
    directive_preuve: 'Rapport d\'inspection du périmètre, registre des anomalies et réparations',
  },
  {
    id: 'cl-010', ordre: 10, categorie: 'OPS', domaine: 'OPS',
    reference_ras14: 'RAS 14 – 14.4.1', description: 'Les procédures opérationnelles sont documentées et accessibles aux agents.',
    directive_preuve: 'Manuel d\'exploitation, liste des procédures en vigueur, version datée',
  },
  {
    id: 'cl-011', ordre: 11, categorie: 'OPS', domaine: 'OPS',
    reference_ras14: 'RAS 14 – 14.4.2', description: 'La coordination avec les services de navigation aérienne est formalisée.',
    directive_preuve: 'Protocole de coordination ANA-exploitant, comptes-rendus de réunions de coordination',
  },
  {
    id: 'cl-012', ordre: 12, categorie: 'COP', domaine: 'COP',
    reference_ras14: 'RAS 14 – 14.5.1', description: 'Le personnel opérationnel dispose des licences et formations requises en cours de validité.',
    directive_preuve: 'Registre des licences, planning des formations, dates d\'expiration',
  },
  {
    id: 'cl-013', ordre: 13, categorie: 'COP', domaine: 'COP',
    reference_ras14: 'RAS 14 – 14.5.2', description: 'Un programme de formation continue est mis en oeuvre et documenté.',
    directive_preuve: 'Plan de formation annuel, PV de formation, évaluations post-formation',
  },
  {
    id: 'cl-014', ordre: 14, categorie: 'MFP', domaine: 'MFP',
    reference_ras14: 'RAS 14 – 14.6.1', description: 'La documentation réglementaire (AIP, NOTAM, circulaires) est disponible et à jour.',
    directive_preuve: 'Liste de diffusion des circulaires, accusés de réception, classement mis à jour',
  },
];

const DOMAINES = ['Tous', 'SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS'];
const RESULTATS_FILTRES = ['Tous', 'SA', 'NS', 'NA', 'NV'] as const;

// ─── Config des résultats ─────────────────────────────────────────────────────

const RESULTAT_CONFIG: Record<Resultat, { label: string; icon: React.ElementType; bgClass: string; textClass: string; borderClass: string; badgeVariant: string }> = {
  SA: { label: 'SA', icon: CheckCircle2, bgClass: 'bg-green-50', textClass: 'text-green-700', borderClass: 'border-green-500', badgeVariant: 'success' },
  NS: { label: 'NS', icon: XCircle, bgClass: 'bg-red-50', textClass: 'text-red-700', borderClass: 'border-red-500', badgeVariant: 'danger' },
  NA: { label: 'NA', icon: MinusCircle, bgClass: 'bg-gray-50', textClass: 'text-gray-500', borderClass: 'border-gray-400', badgeVariant: 'neutral' },
  NV: { label: 'NV', icon: AlertCircle, bgClass: 'bg-orange-50', textClass: 'text-orange-600', borderClass: 'border-orange-400', badgeVariant: 'warning' },
};

// ─── État local par item ──────────────────────────────────────────────────────

interface ItemState {
  resultat: Resultat;
  observation: string;
  fichiers: { nom: string; url: string }[];
}

// ─── Sous-composant: bouton résultat ─────────────────────────────────────────

function ResultatButton({
  resultat,
  selected,
  onClick,
}: {
  resultat: Resultat;
  selected: boolean;
  onClick: () => void;
}) {
  const cfg = RESULTAT_CONFIG[resultat];
  const Icon = cfg.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition-all
        ${selected ? `${cfg.bgClass} ${cfg.textClass} ${cfg.borderClass}` : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}
      aria-pressed={selected}
    >
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </button>
  );
}

// ─── Sous-composant: une ligne item ──────────────────────────────────────────

function ChecklistItemRow({
  item,
  state,
  onResultat,
  onObservation,
  onFichier,
}: {
  item: typeof CHECKLIST_LOCALE[number];
  state: ItemState;
  onResultat: (r: Resultat) => void;
  onObservation: (obs: string) => void;
  onFichier: (f: { nom: string; url: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const needsDetail = state.resultat === 'NS' || state.resultat === 'NV';

  return (
    <div className={`rounded-lg border transition-all ${state.resultat !== 'NV' ? RESULTAT_CONFIG[state.resultat].bgClass : 'bg-white'} border-gray-200`}>
      <div className="p-3 space-y-2">
        {/* Ligne principale */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="mt-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
            aria-label="Détails"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-gray-400">{item.reference_ras14}</span>
              <span className="badge neutral text-xs">{item.domaine}</span>
            </div>
            <p className="text-sm text-gray-800 mt-0.5">{item.description}</p>
          </div>
          {/* Boutons résultat */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {(['SA', 'NS', 'NA', 'NV'] as Resultat[]).map(r => (
              <ResultatButton
                key={r}
                resultat={r}
                selected={state.resultat === r}
                onClick={() => onResultat(r)}
              />
            ))}
          </div>
        </div>

        {/* Détails (directive de preuve) */}
        {expanded && (
          <div className="ml-7 p-2 bg-blue-50 rounded text-xs text-blue-700">
            <span className="font-semibold">Directive de preuve : </span>
            {item.directive_preuve}
          </div>
        )}

        {/* Zone observation + fichier si NS ou NV */}
        {needsDetail && (
          <div className="ml-7 space-y-2">
            <textarea
              placeholder="Observation obligatoire (décrivez la non-conformité ou la raison de non-vérification)..."
              value={state.observation}
              onChange={e => onObservation(e.target.value)}
              className={`form-textarea text-sm min-h-16 ${focusClass}`}
            />
            <FileUploader
              onUpload={onFichier}
              accept=".pdf,.jpg,.jpeg,.png"
              maxSize={10}
              uploadedFile={state.fichiers[0] ?? null}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────────

export function StyletChecklistFiller({
  surveillanceId,
  typeChecklist,
  onValider,
}: StyletChecklistFillerProps) {
  const checklistItems = useAppStore(s =>
    (s.checklistItems?.[surveillanceId] ?? []).filter(
      (ci: ChecklistItem) =>
        ci.type_checklist === typeChecklist
    )
  );

  const items = checklistItems.length > 0
    ? checklistItems.map((ci: ChecklistItem) => ({
        id: ci.id, ordre: ci.ordre, categorie: ci.categorie, domaine: ci.domaine,
        reference_ras14: ci.reference_ras14, description: ci.description,
        directive_preuve: ci.directive_preuve,
      }))
    : CHECKLIST_LOCALE;

  const [states, setStates] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      (items as any[]).map((i: any) => [i.id, { resultat: 'NV' as Resultat, observation: '', fichiers: [] }])
    )
  );

  const [filtreDomaine, setFiltreDomaine] = useState('Tous');
  const [filtreResultat, setFiltreResultat] = useState('Tous');

  // ─ Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const vals = Object.values(states);
    return {
      total: vals.length,
      remplis: vals.filter(s => s.resultat !== 'NV').length,
      SA: vals.filter(s => s.resultat === 'SA').length,
      NS: vals.filter(s => s.resultat === 'NS').length,
      NA: vals.filter(s => s.resultat === 'NA').length,
      NV: vals.filter(s => s.resultat === 'NV').length,
    };
  }, [states]);

  const progression = Math.round((stats.remplis / stats.total) * 100);
  const toutRempli = stats.NV === 0;

  // ─ Filtrage ──────────────────────────────────────────────────────────────

  const itemsFiltres = useMemo(
    () =>
      items.filter(item => {
        const domaineOk = filtreDomaine === 'Tous' || item.domaine === filtreDomaine;
        const resultatOk =
          filtreResultat === 'Tous' ||
          states[item.id]?.resultat === filtreResultat;
        return domaineOk && resultatOk;
      }),
    [items, filtreDomaine, filtreResultat, states]
  );

  // ─ Handlers ──────────────────────────────────────────────────────────────

  const handleResultat = (itemId: string, r: Resultat) => {
    setStates(prev => ({ ...prev, [itemId]: { ...prev[itemId], resultat: r } }));
  };

  const handleObservation = (itemId: string, obs: string) => {
    setStates(prev => ({ ...prev, [itemId]: { ...prev[itemId], observation: obs } }));
  };

  const handleFichier = (itemId: string, f: { nom: string; url: string }) => {
    setStates(prev => ({ ...prev, [itemId]: { ...prev[itemId], fichiers: [f] } }));
  };

  // ─ Groupement par domaine ─────────────────────────────────────────────────

  const groupes = useMemo(() => {
    const map: Record<string, typeof itemsFiltres> = {};
    itemsFiltres.forEach(item => {
      if (!map[item.categorie]) map[item.categorie] = [];
      map[item.categorie].push(item);
    });
    return map;
  }, [itemsFiltres]);

  return (
    <div className="space-y-6">
      {/* En-tête stats */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-blue-600" />
            <span className="font-semibold text-gray-800">
              Checklist {typeChecklist === 'standard' ? 'Standard RAS-14' : typeChecklist === 'suivi_ecarts' ? 'Suivi des Écarts' : 'PAC'}
            </span>
          </div>
          <span className="text-sm font-medium text-gray-600">
            {stats.remplis} / {stats.total} items remplis
          </span>
        </div>
        <div className="progress h-2.5">
          <div className="progress-bar" style={{ width: `${progression}%` }} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {(['SA', 'NS', 'NA', 'NV'] as Resultat[]).map(r => {
            const cfg = RESULTAT_CONFIG[r];
            return (
              <div key={r} className="flex items-center gap-1">
                <span className={`badge ${cfg.badgeVariant}`}>{r}</span>
                <span className="text-xs text-gray-600">{stats[r]}</span>
              </div>
            );
          })}
        </div>
      </div>

      <hr className="border-border" />

      {/* Filtres */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <select
          className={`form-select w-40 h-8 text-sm ${focusClass}`}
          style={selectStyle}
          value={filtreDomaine}
          onChange={e => setFiltreDomaine(e.target.value)}
        >
          {DOMAINES.map(d => (
            <option key={d} value={d}>{d === 'Tous' ? 'Tous les domaines' : d}</option>
          ))}
        </select>
        <select
          className={`form-select w-36 h-8 text-sm ${focusClass}`}
          style={selectStyle}
          value={filtreResultat}
          onChange={e => setFiltreResultat(e.target.value)}
        >
          {RESULTATS_FILTRES.map(r => (
            <option key={r} value={r}>{r === 'Tous' ? 'Tous résultats' : r}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{itemsFiltres.length} items affichés</span>
      </div>

      {/* Items groupés par domaine */}
      <div className="space-y-6">
        {Object.entries(groupes).map(([categorie, groupItems]) => (
          <div key={categorie} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">{categorie}</span>
              <hr className="flex-1 border-border" />
              <span className="text-xs text-gray-400">{groupItems.length} items</span>
            </div>
            <div className="space-y-2">
              {groupItems.map(item => (
                <ChecklistItemRow
                  key={item.id}
                  item={item}
                  state={states[item.id] ?? { resultat: 'NV', observation: '', fichiers: [] }}
                  onResultat={r => handleResultat(item.id, r)}
                  onObservation={obs => handleObservation(item.id, obs)}
                  onFichier={f => handleFichier(item.id, f)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bouton valider */}
      <div className="sticky bottom-0 bg-white/95 pt-4 pb-2 border-t">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {toutRempli
              ? 'Tous les items sont remplis — prêt pour signature.'
              : `${stats.NV} item(s) non encore vérifiés.`}
          </div>
          <button
            type="button"
            onClick={onValider}
            disabled={!toutRempli}
            className={`btn btn-primary gap-2 ${!toutRempli ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Upload className="w-4 h-4" />
            Valider et signer la checklist
          </button>
        </div>
      </div>
    </div>
  );
}

export default StyletChecklistFiller;
