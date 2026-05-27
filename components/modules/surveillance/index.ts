// components/modules/surveillance/index.ts
// ✅ R4 : Centralisation des exports du module surveillance

export { SurveillanceChecklistStandard } from './SurveillanceChecklistStandard';
export { SurveillanceChecklistSuiviEcarts } from './SurveillanceChecklistSuiviEcarts';
export { SurveillanceChecklistPAC } from './SurveillanceChecklistPAC';
export { SurveillanceChecklistItem } from './SurveillanceChecklistItem';
export { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
export { FileUploader } from '@/components/ui/FileUploader';

export type { ResultatChecklist } from './SurveillanceChecklistItem';
export type { ChecklistItemData, ChecklistItemState } from './SurveillanceChecklistItem';

export const RESULTAT_LABELS = {
  SA: { label: 'Satisfaisant', color: 'badge success' },
  NS: { label: 'Non satisfaisant', color: 'badge danger' },
  NA: { label: 'Non applicable', color: 'badge neutral' },
  NV: { label: 'Non vérifié', color: 'badge warning' },
} as const;
