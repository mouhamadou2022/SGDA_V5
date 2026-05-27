'use client'
// ZÉRO @/components/ui/ import

import { HomoPhase1 } from '@/components/modules/homologation/HomoPhase1'
import { HomoPhase2 } from '@/components/modules/homologation/HomoPhase2'
import { HomoPhase3 } from '@/components/modules/homologation/HomoPhase3'
import { useAppStore } from '@/lib/store'
import { X } from 'lucide-react'

interface HomoPhaseFormProps {
  phase: 1 | 2 | 3
  homoId: string
  initialData?: any
  onSubmit: (data: any) => void
  onCancel: () => void
}

export function HomoPhaseForm({ phase, homoId, initialData, onSubmit, onCancel }: HomoPhaseFormProps) {
  const homologations = useAppStore(s => s.homologations)
  const homologation = homologations.find(h => h.id === homoId)
  const estActive = homologation?.phase_active === phase && homologation?.statut_global === 'en_cours'

  const commonProps = {
    homoId,
    phaseData: initialData,
    estActive: estActive ?? false,
    onUpdate: onSubmit,
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {phase === 1 && <HomoPhase1 {...commonProps} />}
      {phase === 2 && <HomoPhase2 {...commonProps} />}
      {phase === 3 && (
        <HomoPhase3
          {...commonProps}
          homologation={homologation}
        />
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          <X className="w-4 h-4 inline mr-1" />Annuler
        </button>
      </div>
    </div>
  )
}

export default HomoPhaseForm
