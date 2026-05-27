'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { ChecklistFormContent, RESULTAT_LABELS } from '@/components/modules/checklist/ChecklistFormContent';
import type { DomaineChecklist } from '@/types/checklist';

// Re-exported for backward compatibility with Kit page imports
export type { ResultatChecklist, ModeSaisie, ChecklistItem } from '@/types/checklist';
export type { SousSousDomaine as EditorSousSousDomaine, SousDomaine as EditorSousDomaine } from '@/types/checklist';
export { RESULTAT_LABELS };

export interface ChecklistTableEditorProps {
  domaines: any[];
  onChange: (domaines: any[]) => void;
  readOnly?: boolean;
  onAddDomaine?: () => void;
}

export function ChecklistTableEditor({ domaines, onChange, readOnly = false, onAddDomaine }: ChecklistTableEditorProps) {
  return (
    <div className="space-y-3">
      <ChecklistFormContent
        domaines={domaines as DomaineChecklist[]}
        onChange={(d) => onChange(d as any[])}
        readOnly={readOnly}
        showObservationIntegration={false}
      />
      {!readOnly && onAddDomaine && (
        <div className="flex justify-center pt-2">
          <button onClick={onAddDomaine}
            className="px-4 py-2 text-xs font-medium text-blue-600 bg-white hover:bg-blue-50 border-2 border-dashed border-blue-300 rounded-xl transition-colors">
            <Plus className="w-3.5 h-3.5 inline mr-1" /> Ajouter un domaine
          </button>
        </div>
      )}
    </div>
  );
}
