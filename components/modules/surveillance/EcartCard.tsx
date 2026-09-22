// components/modules/surveillance/EcartCard.tsx
// Extrait de SurveillanceEcartsRedaction (comportement identique).
'use client';

import { Target, FileText, PenLine, Trash2, Eye, Clock } from 'lucide-react';
import { AccordionSection } from '@/components/ui/AccordionSection';
import { getCellColor } from '@/lib/risque';
import type { EcartRedaction } from './EcartsRedactionTypes';
import { isValidOACI, NIVEAUX } from './ecartsRedactionUtils';

// ─────────────────────────────────────────────────────────────
// COMPOSANT: EcartCard
// ─────────────────────────────────────────────────────────────
export function EcartCard({
  ecart,
  onEdit,
  onDelete,
  onViewDetails,
  readOnly,
}: {
  ecart: EcartRedaction;
  onEdit: (ecart: EcartRedaction) => void;
  onDelete: (id: string) => void;
  onViewDetails: (ecart: EcartRedaction) => void;
  readOnly: boolean;
}) {

  const getNiveauBadge = () => {
    switch (ecart.niveau) {
      case 'critique': return 'badge danger';
      case 'eleve': return 'badge eleve';
      case 'moyen': return 'badge moyen';
      default: return 'badge neutral';
    }
  };

  const ecartIcon = ecart.domaine === 'SGS'
    ? <Target className="w-4 h-4 !text-white" />
    : <FileText className="w-4 h-4 !text-white" />;

  const ecartBadges = (
    <>
      {isValidOACI(ecart.cellule_risque_oaci) && ecart.cellule_risque_oaci !== 'N/A' && (
        <span className={`inline-flex items-center justify-center rounded font-bold text-[10px] px-1.5 py-0.5 font-mono ${getCellColor(ecart.cellule_risque_oaci)}`}>
          {ecart.cellule_risque_oaci}
        </span>
      )}
      {ecart.domaine === 'SGS' ? (
        <span className="badge warning text-[10px]">SGS</span>
      ) : (
        <span className={getNiveauBadge()}>{ecart.niveau}</span>
      )}
      <span className="text-[10px] text-muted-foreground">{ecart.item_ids.length} item(s)</span>
    </>
  );

  const ecartActions = !readOnly ? (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(ecart); }}
        className="action-button"
        title="Modifier"
      >
        <PenLine className="w-4 h-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(ecart.id); }}
        className="action-button text-danger"
        title="Supprimer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onViewDetails(ecart); }}
        className="action-button"
        title="Voir détails"
      >
        <Eye className="w-4 h-4" />
      </button>
    </>
  ) : (
    <button
      onClick={(e) => { e.stopPropagation(); onViewDetails(ecart); }}
      className="action-button"
      title="Voir détails"
    >
      <Eye className="w-4 h-4" />
    </button>
  );

  return (
    <AccordionSection
      icon={ecartIcon}
      title={<span className="text-sm font-mono">{ecart.reference}</span>}
      badges={ecartBadges}
      actions={ecartActions}
      className="mb-2"
    >
            <div>
              <p className="text-xs text-muted-foreground">Référence réglementaire</p>
              <p className="text-sm">{ecart.ref_reglementaire}</p>
            </div>
            <div className="flex items-center gap-3">
          {isValidOACI(ecart.cellule_risque_oaci) && ecart.cellule_risque_oaci !== 'N/A' && (
                <div>
                  <p className="text-xs text-muted-foreground">Cellule OACI</p>
                  <span className={`inline-flex items-center justify-center rounded font-bold text-xs px-2 py-0.5 font-mono tracking-wide mt-0.5 ${getCellColor(ecart.cellule_risque_oaci)}`}>
                    {ecart.cellule_risque_oaci}
                  </span>
                </div>
              )}
              {/* SGS : pas de niveau de risque — Standard : afficher le niveau + délais */}
              {ecart.domaine !== 'SGS' && (
                <div>
                  <p className="text-xs text-muted-foreground">Niveau de risque</p>
                  <span className={`${getNiveauBadge()} mt-0.5 inline-block`}>{ecart.niveau}</span>
                  {(() => {
                    const delais = NIVEAUX.find(n => n.value === ecart.niveau)?.delais;
                    if (!delais) return null;
                    return (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        PAC {delais.pac}j · Régul {delais.regularisation}j
                      </p>
                    );
                  })()}
                </div>
              )}
              {/* SGS : délais manuels */}
              {ecart.domaine === 'SGS' && (ecart.delai_pac || ecart.delai_regularisation) && (
                <div>
                  <p className="text-xs text-muted-foreground">Délais</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {ecart.delai_pac && `PAC ${ecart.delai_pac}j`}
                    {ecart.delai_pac && ecart.delai_regularisation && ' · '}
                    {ecart.delai_regularisation && `Régul ${ecart.delai_regularisation}j`}
                  </p>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Libellé</p>
              <p className="text-sm whitespace-pre-wrap">{ecart.libelle}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Questions associées</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {ecart.item_ids.map((itemId, idx) => (
                  <span key={idx} className="badge outline text-[10px]">{itemId}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Créé le {new Date(ecart.created_at).toLocaleDateString('fr-FR')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Modifié le {new Date(ecart.updated_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
    </AccordionSection>
  );
}
