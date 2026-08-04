'use client';

import React, { useCallback } from 'react';
import { ChecklistStandardTable, DomainePicker } from '@/components/modules/checklist/ChecklistStandardTable';
import type { NouveauDomaineInfo } from '@/components/modules/checklist/ChecklistStandardTable';
import type { DomaineChecklist, ChecklistItem, ResultatChecklist, ModeSaisie, SousDomaine, SousSousDomaine } from '@/types/checklist';

export type { ResultatChecklist, ModeSaisie, ChecklistItem } from '@/types/checklist';
export type { SousSousDomaine as EditorSousSousDomaine, SousDomaine as EditorSousDomaine } from '@/types/checklist';
export type { NouveauDomaineInfo } from '@/components/modules/checklist/ChecklistStandardTable';

const RESULTAT_LABELS: Record<ResultatChecklist, string> = {
  SA: 'Satisfaisant', NS: 'Non Satisfaisant', NV: 'Non Validé', NA: 'Non Applicable',
};
export { RESULTAT_LABELS };

export interface ChecklistTableEditorProps {
  domaines: any[];
  onChange: (domaines: any[]) => void;
  readOnly?: boolean;
  onAddDomaine?: (info: NouveauDomaineInfo) => void;
}

function updateItemInDomaines(domaines: DomaineChecklist[], updated: ChecklistItem): DomaineChecklist[] {
  return domaines.map(d => {
    const updateItems = (items?: ChecklistItem[]) =>
      (items || []).map(i => (i.id === updated.id ? updated : i))
    return {
      ...d,
      items: updateItems(d.items),
      sousDomaines: (d.sousDomaines || []).map(sd => ({
        ...sd,
        items: updateItems(sd.items),
        sousSousDomaines: (sd.sousSousDomaines || []).map(ssd => ({
          ...ssd,
          items: updateItems(ssd.items),
        })),
      })),
    }
  })
}

export function ChecklistTableEditor({ domaines, onChange, readOnly = false, onAddDomaine }: ChecklistTableEditorProps) {
  const handleUpdateItem = useCallback((updated: ChecklistItem) => {
    onChange(updateItemInDomaines(domaines as DomaineChecklist[], updated))
  }, [domaines, onChange])

  const handleUpdateDomaines = useCallback((d: DomaineChecklist[]) => {
    onChange(d)
  }, [onChange])

  return (
    <div className="space-y-3">
      {!readOnly && onAddDomaine && (
        <div className="flex justify-center">
          <DomainePicker domaines={domaines} onPick={onAddDomaine} />
        </div>
      )}
      <ChecklistStandardTable
        domaines={domaines as DomaineChecklist[]}
        onUpdateItem={handleUpdateItem}
        onUpdateDomaines={handleUpdateDomaines}
        readOnly={readOnly}
      />
      {!readOnly && onAddDomaine && (
        <div className="flex justify-center pt-2">
          <DomainePicker domaines={domaines} onPick={onAddDomaine} />
        </div>
      )}
    </div>
  );
}
