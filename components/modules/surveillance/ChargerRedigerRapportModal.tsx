// components/modules/surveillance/ChargerRedigerRapportModal.tsx
'use client'

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { FileText, FileUp, FileDown, X, AlertCircle, Loader2 } from 'lucide-react'

interface ChargerRedigerRapportModalProps {
  surveillanceId: string
  onClose: () => void
}

export function ChargerRedigerRapportModal({ surveillanceId, onClose }: ChargerRedigerRapportModalProps) {
  const router = useRouter()
  const updateSurveillance = useAppStore(s => s.updateSurveillance)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleCharger = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const maxSize = 20 * 1024 * 1024 // 20 Mo
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
    if (!allowedTypes.includes(file.type)) {
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

  const handleRediger = () => {
    onClose()
    router.push(`/surveillance/${surveillanceId}/rapport`)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <FileText className="h-5 w-5 text-role-primary" />
            Rapport de surveillance
          </div>
          <button onClick={onClose} className="modal-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="modal-body">
          <p className="text-sm text-muted mb-6">
            Comment souhaitez-vous procéder pour le rapport de cette surveillance ?
          </p>

          <div className="space-y-3">
            <button
              onClick={handleCharger}
              disabled={uploadState === 'loading'}
              className="w-full p-4 rounded-xl border-2 border-dashed border-border hover:border-role-primary hover:bg-role-primary-soft transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-role-primary-soft flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileUp className="w-6 h-6 text-role-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Charger un rapport existant</p>
                  <p className="text-xs text-muted mt-0.5">
                    PDF, Word ou image — vous avez déjà rédigé et signé votre rapport en dehors du système
                  </p>
                </div>
              </div>
            </button>

            <button
              onClick={handleRediger}
              className="w-full p-4 rounded-xl border-2 border-border hover:border-role-primary hover:bg-role-primary-soft transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-role-primary-soft flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileDown className="w-6 h-6 text-role-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Rédiger avec le système</p>
                  <p className="text-xs text-muted mt-0.5">
                    Utiliser le template prérempli par l'IA — gagnez du temps avec un rapport généré automatiquement
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
    </div>
  )
}

export default ChargerRedigerRapportModal
