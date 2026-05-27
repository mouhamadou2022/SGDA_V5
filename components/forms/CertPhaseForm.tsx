'use client'
// ZÉRO @/components/ui/ import

import { Phase1 } from '@/components/modules/certification/Phase1'
import { Phase2 } from '@/components/modules/certification/Phase2'
import { Phase3 } from '@/components/modules/certification/Phase3'
import { Phase4 } from '@/components/modules/certification/Phase4'
import { Phase5 } from '@/components/modules/certification/Phase5'
import { useAppStore } from '@/lib/store'
import { X } from 'lucide-react'

interface CertPhaseFormProps {
  phase: 1 | 2 | 3 | 4 | 5
  certifId: string
  initialData?: any
  onSubmit: (data: any) => void
  onCancel: () => void
}

export function CertPhaseForm({ phase, certifId, initialData, onSubmit, onCancel }: CertPhaseFormProps) {
  const certifications = useAppStore(s => s.certifications)
  const certification = certifications.find(c => c.id === certifId)
  const estActive = certification?.phase_active === phase && certification?.statut_global === 'en_cours'

  const commonProps = {
    certifId,
    phaseData: initialData,
    estActive: estActive ?? false,
    onUpdate: onSubmit,
  }

  return (
    <div className="space-y-4 animate-fade-up">
      {phase === 1 && <Phase1 {...commonProps} />}
      {phase === 2 && <Phase2 {...commonProps} />}
      {phase === 3 && <Phase3 {...commonProps} />}
      {phase === 4 && <Phase4 {...commonProps} />}
      {phase === 5 && (
        <Phase5
          {...commonProps}
          certification={certification}
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

export default CertPhaseForm
