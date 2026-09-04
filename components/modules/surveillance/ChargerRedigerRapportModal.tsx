// components/modules/surveillance/ChargerRedigerRapportModal.tsx
'use client'

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { FileText, FileUp, X, AlertCircle, AlertTriangle, Loader2, Sparkles } from 'lucide-react'

interface ChargerRedigerRapportModalProps {
  surveillanceId: string
  onClose: () => void
}

export function ChargerRedigerRapportModal({ surveillanceId, onClose }: ChargerRedigerRapportModalProps) {
  const router = useRouter()
  const updateSurveillance = useAppStore(s => s.updateSurveillance)
  const surveillances = useAppStore(s => s.surveillances)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'charger' | 'rediger' | null>(null)
  const surveillance = surveillances.find(s => s.id === surveillanceId)

  const isCharged = surveillance?.rapport_type === 'charge' && !!surveillance?.rapport_fichier_url
  const isRedige = surveillance?.rapport_type === 'redige' || (!surveillance?.rapport_type && !!surveillance?.rapport_sections)
  const hasExistingRapport = isCharged || isRedige

  const handleCharger = () => {
    if (hasExistingRapport) {
      const variant = isCharged ? 'charger' : 'rediger'
      setConfirmAction(variant)
    } else {
      fileInputRef.current?.click()
    }
  }

  const handleRediger = () => {
    if (hasExistingRapport) {
      setConfirmAction('rediger')
    } else {
      onClose()
      router.push(`/surveillance/${surveillanceId}/rapport`)
    }
  }

  const handleConfirmCharger = () => {
    setConfirmAction(null)
    fileInputRef.current?.click()
  }

  const handleConfirmRediger = () => {
    setConfirmAction(null)
    onClose()
    router.push(`/surveillance/${surveillanceId}/rapport`)
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const maxSize = 20 * 1024 * 1024
    if (file.size > maxSize) {
      setUploadState('error')
      setUploadError('Le fichier est trop volumineux (max 20 Mo)')
      return
    }

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
    ]
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|jpg|jpeg|png)$/i)) {
      setUploadState('error')
      setUploadError('Format non supporté. Utilisez PDF, Word (.doc/.docx) ou une image (JPEG/PNG).')
      return
    }

    try {
      setUploadState('loading')
      setUploadError(null)

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Erreur de lecture du fichier'))
        reader.readAsDataURL(file)
      })

      updateSurveillance(surveillanceId, {
        rapport_fichier_url: base64,
        rapport_fichier_nom: file.name,
        rapport_type: 'charge',
        rapport_html: `<p>Rapport chargé : ${file.name}</p>`,
      })

      onClose()
      router.push(`/surveillance/${surveillanceId}/rapport`)
    } catch {
      setUploadState('error')
      setUploadError('Erreur lors du chargement du fichier')
    }
  }

  const typeLabel = (surveillance?.type || 'surveillance').replace(/_/g, ' ')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FileText className="h-5 w-5 text-role-primary" />
            Rapport de {typeLabel}
          </div>
          <button onClick={onClose} className="modal-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-body">
          <p className="text-sm text-muted mb-6">
            Comment souhaitez-vous procéder pour le rapport de cette {typeLabel} ?
          </p>

          {/* Alerte si un rapport existe déjà */}
          {hasExistingRapport && (
            <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="text-xs text-warning-800">
                <p className="font-semibold">Un rapport existe déjà</p>
                <p className="mt-0.5">
                  {isCharged && 'Un rapport chargé est présent. Choisir une option l\'écrasera.'}
                  {isRedige && 'Un rapport généré par l\'IA est présent. Choisir une option l\'écrasera.'}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {/* Option 1: Rédiger avec AERORISQ */}
            <button
              onClick={handleRediger}
              className="w-full p-4 rounded-xl border-2 border-border hover:border-role-primary hover:bg-role-primary-soft transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-role-primary-soft flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Sparkles className="w-6 h-6 text-role-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Rédiger avec AERORISQ</p>
                  <p className="text-xs text-muted mt-0.5">
                    {isCharged
                      ? 'Remplacer le rapport chargé par un rapport généré par l\'IA — vous pourrez ensuite le modifier librement'
                      : 'L\'IA génère un rapport automatique depuis les données de la surveillance — vous pouvez ensuite le modifier librement'}
                  </p>
                </div>
              </div>
            </button>

            {/* Option 2: Charger un fichier existant */}
            <button
              onClick={handleCharger}
              disabled={uploadState === 'loading'}
              className="w-full p-4 rounded-xl border-2 border-dashed border-border hover:border-muted-foreground/30 hover:bg-gray-50 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {uploadState === 'loading' ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : <FileUp className="w-6 h-6 text-muted-foreground" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Charger un rapport existant</p>
                  <p className="text-xs text-muted mt-0.5">
                    {isCharged
                      ? 'Remplacer le fichier chargé actuel (PDF, Word ou image)'
                      : 'PDF, Word ou image — rapport déjà rédigé et signé en dehors du système, modifiable directement'}
                  </p>
                </div>
              </div>
            </button>
          </div>

          {uploadState === 'loading' && (
            <div className="mt-4 p-3 rounded-lg bg-role-primary-soft flex items-center gap-3 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-role-primary" />
              <span>Chargement du fichier...</span>
            </div>
          )}

          {uploadState === 'error' && (
            <div className="mt-4 p-3 rounded-lg bg-danger-soft border border-red-500/20 flex items-start gap-3 text-sm">
              <AlertCircle className="w-4 h-4 text-danger mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-danger">Erreur</p>
                <p className="text-danger/80">{uploadError}</p>
              </div>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={handleFileSelected}
          className="hidden"
        />
      </div>

      {/* Modal de confirmation garde-fou */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={() => setConfirmAction(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {confirmAction === 'charger' ? 'Remplacer le rapport chargé ?' : 'Remplacer le rapport IA ?'}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                {confirmAction === 'charger'
                  ? 'Un rapport chargé est déjà présent. Le charger de nouveau l\'écrasera. Cette action est irréversible.'
                  : 'Un rapport généré par l\'IA est déjà présent. Choisir une action l\'écrasera. Voulez-vous continuer ?'}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmAction === 'charger' ? handleConfirmCharger : handleConfirmRediger}
                  className="btn btn-primary"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChargerRedigerRapportModal
