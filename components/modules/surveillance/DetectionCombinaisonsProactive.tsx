// components/modules/surveillance/DetectionCombinaisonsProactive.tsx
// Composant partagé : détecte en temps réel les combinaisons possibles parmi
// des items non traités (même référence réglementaire), affiche un bouton
// clignotant quand des combinaisons existent, et ouvre une grande MODALE pour
// les examiner. La validation d'un combo renvoie les items au parent via
// onValidate — le workflow aval (suggestion IA, application de l'écart) reste à
// la charge du parent.
// La modale est rendue via createPortal → elle ne perturbe jamais la mise en
// page des cartes voisines (le bouton reste lui dans/en-tête du parent).
// Spécificité SGS : deux éléments d'une même référence mais de niveaux PAOE
// différents (Absent / Présent / Approprié) décrivent des états distincts et ne
// sont pas combinables en un seul constat → la clé de regroupement inclut PAOE.
// Détection 100% locale, aucun appel IA.
'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, CheckCircle, X } from 'lucide-react';

export interface ProactiveItem {
  id: string;
  numero: string;
  description: string;
  reference_reglementaire: string;
  /** Spécificité SGS : niveau PAOE réel (absent | present | approprie) */
  paoeLevel?: 'absent' | 'present' | 'approprie';
  /** Domaine (ex. SGS) */
  domaine?: string;
  /** Sous-domaine (composante PAOE pour le SGS) */
  sousDomaine?: string;
  /** Résultat (NS | NV) */
  resultat?: 'NS' | 'NV';
}

interface DetectionCombinaisonsProactiveProps {
  /** Items non encore traités à analyser */
  items: ProactiveItem[];
  /** Ids déjà sélectionnés (masqués de l'analyse) */
  selectedIds?: string[];
  /** Appelé à la validation d'une combinaison avec ses items */
  onValidate: (items: ProactiveItem[]) => void;
  /** Classes supplémentaires pour le bouton (positionnement dans le parent) */
  buttonClassName?: string;
}

const PAOE_LABEL: Record<string, string> = {
  absent: 'Absent',
  present: 'Présent',
  approprie: 'Approprié',
};

export default function DetectionCombinaisonsProactive({
  items,
  selectedIds = [],
  onValidate,
  buttonClassName = '',
}: DetectionCombinaisonsProactiveProps) {
  const [showModal, setShowModal] = useState(false);
  const [refusedKeys, setRefusedKeys] = useState<string[]>([]);

  // Regroupe les items restants par référence réglementaire + niveau PAOE,
  // en écartant les groupes déjà refusés et les items déjà sélectionnés.
  const combos = (() => {
    const groups = new Map<string, { key: string; reference: string; paoeLevel?: 'absent' | 'present' | 'approprie'; items: ProactiveItem[] }>();
    for (const item of items) {
      const ref = (item.reference_reglementaire || '').trim();
      if (!ref || selectedIds.includes(item.id)) continue;
      const key = `${ref}|${item.paoeLevel ?? ''}`;
      const entry = groups.get(key) || { key, reference: ref, paoeLevel: item.paoeLevel, items: [] };
      entry.items.push(item);
      groups.set(key, entry);
    }
    return Array.from(groups.values())
      .filter(entry => !refusedKeys.includes(entry.key))
      .filter(entry => entry.items.length >= 2)
      .map(entry => ({ key: entry.key, reference: entry.reference, items: entry.items }));
  })();

  if (combos.length === 0) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={() => setShowModal(false)}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-background rounded-2xl shadow-2xl border border-border flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border sticky top-0 bg-background">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-600" />
            <h3 className="text-base font-semibold text-foreground">
              Combinaisons de questions possibles
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(false)}
            className="btn btn-sm btn-secondary shrink-0"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-muted-foreground">
            {combos.length} groupement(s) détecté(s) : plusieurs questions partagent la même
            référence réglementaire. Vous pouvez les combiner en un seul écart.
            {combos.some(c => c.items[0]?.paoeLevel) && (
              <span className="text-xs text-muted-foreground inline">
                {' '}SGS : seules les questions de même niveau PAOE sont groupées, car un état
                « Absent » n'est pas combinable avec un état « Présent » ou « Approprié ».
              </span>
            )}
          </p>

          {combos.map(combo => (
            <div
              key={combo.key}
              className="flex items-start justify-between gap-3 p-3 border border-border rounded-xl bg-background"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">Réf: {combo.reference}</span>
                  <span className="badge outline text-[10px]">{combo.items.length} questions</span>
                  {combo.items[0]?.paoeLevel && (
                    <span className="badge warning text-[10px] uppercase">PAOE {PAOE_LABEL[combo.items[0].paoeLevel]}</span>
                  )}
                </div>
                <ul className="text-sm text-muted-foreground mt-2 list-disc pl-5 space-y-0.5">
                  {combo.items.map(it => (
                    <li key={it.id}>
                      <span className="font-semibold text-foreground">{it.numero}</span> — {it.description}
                    </li>
                  ))}
                </ul>
                {combo.items[0]?.domaine && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {combo.items[0].domaine && <span className="badge outline text-[10px]">{combo.items[0].domaine}</span>}
                    {combo.items[0].sousDomaine && <span className="badge outline text-[10px]">{combo.items[0].sousDomaine}</span>}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-stretch gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onValidate(combo.items);
                    setShowModal(false);
                  }}
                  className="btn btn-sm px-3 py-1 btn-primary gap-1 whitespace-nowrap"
                >
                  <CheckCircle className="w-3.5 h-3.5" /> Valider
                </button>
                <button
                  type="button"
                  onClick={() => setRefusedKeys(prev => [...new Set([...prev, combo.key])])}
                  className="btn btn-sm px-3 py-1 btn-secondary gap-1 whitespace-nowrap"
                >
                  <X className="w-3.5 h-3.5" /> Ignorer
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={`ai-proposed-row inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 shrink-0 animate-pulse ${buttonClassName}`.trim()}
        title={`${combos.length} combinaison(s) de questions non traitées détectée(s) sur la même référence réglementaire — cliquer pour les examiner`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        Combinaisons possibles
        <span className="badge badge-primary text-[10px]">{combos.length}</span>
      </button>
      {showModal && typeof window !== 'undefined' && createPortal(modalContent, document.body)}
    </>
  );
}
