// components/modules/plans-actions/SoumissionPACModal.tsx
'use client'

import { createPortal } from 'react-dom'
import { X, FileText } from 'lucide-react'
import { SoumissionPACForm } from '@/components/forms/SoumissionPACForm'

interface SoumissionPACModalProps {
  isOpen: boolean
  onClose: () => void
  ecartId: string
}

const AideMemoirePAC = () => (
  <details className="alert alert-info">
    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-role-primary">
      Aide-mémoire — Plan d'Actions Correctives
    </summary>
    <div className="text-xs mt-2 space-y-1 text-muted-foreground">
      <p>Un PAC doit contenir au moins une action corrective.</p>
      <p>Chaque action doit préciser : la description, le responsable, la date de début et la date de fin.</p>
      <p>Les pièces jointes sont optionnelles (toute preuve utile à l'évaluation).</p>
    </div>
  </details>
)

export function SoumissionPACModal({ isOpen, onClose, ecartId }: SoumissionPACModalProps) {
  if (!isOpen) return null

  return typeof window !== 'undefined' ? createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-6xl w-full max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
            <h2 className="modal-title flex items-center gap-2">
              <FileText className="w-5 h-5 text-role-primary" />
              Soumettre un Plan d'Actions Correctives (PAC)
            </h2>
            <button type="button" className="modal-close" onClick={onClose}>
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="modal-body p-5">
            <AideMemoirePAC />

            <SoumissionPACForm
              ecartId={ecartId}
              onSuccess={onClose}
              onCancel={onClose}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null
}
