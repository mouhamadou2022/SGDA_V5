'use client';

// components/modules/dashboard/FileTraitement.tsx
// Bloc compact « À traiter » : compteurs cliquables (filtres) + lignes les
// plus urgentes avec UNE action claire chacune. Présentationnel uniquement :
// les données viennent des sélecteurs purs lib/triage.ts (dérivé du store,
// aucune table, aucun trigger). Réutilisable par rôle (admin d'abord).

import React, { useMemo, useState } from 'react';
import { Inbox, AlertTriangle, Clock, Info, CheckCircle2, Send } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { TriageItem, TriageCompteurs, TriageFiltre } from '@/lib/triage';
import { filtresDe, TRIAGE_FILTRE_LABELS } from '@/lib/triage';
import { badgeNiveauRisque } from '@/lib/risque';

const NIVEAU_STYLE: Record<TriageItem['niveau'], { bordure: string; icone: React.ReactNode; libelle: string }> = {
  danger: { bordure: 'border-l-danger', icone: <AlertTriangle className="w-4 h-4 text-danger" />, libelle: 'Urgent' },
  warning: { bordure: 'border-l-warning', icone: <Clock className="w-4 h-4 text-warning" />, libelle: 'À traiter' },
  info: { bordure: 'border-l-primary', icone: <Info className="w-4 h-4 text-primary" />, libelle: 'Info' },
};

const COMPTEURS_ORDRE: Array<{ cle: TriageFiltre; valeur: (c: TriageCompteurs) => number }> = [
  { cle: 'nonAssignes', valeur: (c) => c.nonAssignes },
  { cle: 'enRetard', valeur: (c) => c.enRetard },
  { cle: 'aValider', valeur: (c) => c.aValider },
  { cle: 'messages', valeur: (c) => c.messages },
  { cle: 'alertes', valeur: (c) => c.alertes },
];

export function FileTraitement({ titre, sousTitre, items, compteurs, onOuvrir, onRelancer, labelsCompteurs, maxItems = 6 }: {
  titre: string;
  sousTitre?: string;
  items: TriageItem[];
  compteurs: TriageCompteurs;
  onOuvrir: (module: string) => void;
  /** Relance automatique (admin) : envoi du rappel pré-rédigé à l'inspecteur. */
  onRelancer?: (item: TriageItem) => void;
  /** Surcharge des libellés de compteurs par rôle (ex. admin : « En attente inspecteurs »). */
  labelsCompteurs?: Partial<Record<TriageFiltre, string>>;
  maxItems?: number;
}) {
  const [filtre, setFiltre] = useState<TriageFiltre | null>(null);
  // Relances envoyées cette session (anti-double-clic ; l'historique fait foi dans la messagerie).
  const [relancesEnvoyees, setRelancesEnvoyees] = useState<Set<string>>(new Set());

  const libelle = (cle: TriageFiltre): string => labelsCompteurs?.[cle] || TRIAGE_FILTRE_LABELS[cle];

  const visibles = useMemo(() => {
    const filtres = filtre ? items.filter((i) => filtresDe(i).includes(filtre)) : items;
    return filtres.slice(0, maxItems);
  }, [items, filtre, maxItems]);

  const totalRestants = (filtre ? items.filter((i) => filtresDe(i).includes(filtre)) : items).length - visibles.length;

  return (
    <Card
      icon={<Inbox className="h-4 w-4 text-role-primary" />}
      title={titre}
      subtitle={sousTitre || 'Ce qui attend une action — par urgence'}
      badge={compteurs.total > 0
        ? <span className="badge danger text-xs">{compteurs.total}</span>
        : <span className="badge success text-xs">À jour ✓</span>}
    >
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          type="button"
          onClick={() => setFiltre(null)}
          className={`badge text-xs cursor-pointer ${filtre === null ? 'badge-primary' : 'badge-outline'}`}
        >
          Tous ({compteurs.total})
        </button>
        {COMPTEURS_ORDRE.map(({ cle, valeur }) => (
          <button
            key={cle}
            type="button"
            onClick={() => setFiltre(filtre === cle ? null : cle)}
            className={`badge text-xs cursor-pointer ${filtre === cle ? 'badge-primary' : 'badge-outline'}`}
          >
            {libelle(cle)} ({valeur(compteurs)})
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Tout est à jour ✓</p>
      ) : (
        <div className="space-y-2">
          {visibles.map((item) => {
            const style = NIVEAU_STYLE[item.niveau];
            const relancable = !!item.relance && !!onRelancer;
            const dejaRelance = relancesEnvoyees.has(item.id);
            return (
              <div key={item.id} className={`flex items-center gap-3 p-2.5 rounded-lg border border-border/50 border-l-4 ${style.bordure} bg-muted/20`}>
                <span className="shrink-0">{style.icone}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {item.titre} <span className="text-[10px] font-normal text-muted-foreground">· {style.libelle}</span>
                    {item.niveauRisque && (
                      <span className={`badge text-[10px] ml-1.5 ${badgeNiveauRisque(item.niveauRisque)}`}>
                        {item.niveauRisque}
                      </span>
                    )}
                  </p>
                  {item.detail && <p className="text-xs text-muted-foreground truncate">{item.detail}</p>}
                  {item.enRetard && <p className="text-[11px] text-danger font-medium">En retard{item.echeance ? ` depuis le ${item.echeance}` : ''}</p>}
                  {!item.enRetard && item.echeance && <p className="text-[11px] text-muted-foreground">Échéance : {item.echeance}</p>}
                </div>
                {relancable ? (
                  <button
                    type="button"
                    disabled={dejaRelance}
                    onClick={() => {
                      onRelancer(item);
                      setRelancesEnvoyees((prev) => new Set([...prev, item.id]));
                    }}
                    className="btn btn-sm btn-primary shrink-0 text-xs gap-1 disabled:opacity-60"
                    title={dejaRelance ? 'Rappel déjà envoyé cette session (voir messagerie)' : `Envoyer un rappel automatique à l'inspecteur concerné`}
                  >
                    {dejaRelance ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                    {dejaRelance ? 'Relancé ✓' : item.action}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOuvrir(item.module)}
                    className="btn btn-sm btn-secondary shrink-0 text-xs"
                  >
                    {item.action}
                  </button>
                )}
              </div>
            );
          })}
          {totalRestants > 0 && (
            <p className="text-xs text-muted-foreground text-center">+ {totalRestants} autre{totalRestants > 1 ? 's' : ''} — ouvrez le module pour tout voir</p>
          )}
        </div>
      )}
    </Card>
  );
}
