// components/modules/surveillance/ChargerRedigerRapportModal.tsx
'use client'

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { FileText, FileUp, FileDown, X, AlertCircle, Loader2, Upload, PenLine, Sparkles } from 'lucide-react'
import { importRapportFromFile } from '@/lib/services/rapportImportService'

interface ChargerRedigerRapportModalProps {
  surveillanceId: string
  onClose: () => void
}

export function ChargerRedigerRapportModal({ surveillanceId, onClose }: ChargerRedigerRapportModalProps) {
  const router = useRouter()
  const updateSurveillance = useAppStore(s => s.updateSurveillance)
  const surveillances = useAppStore(s => s.surveillances)
  const addNotification = useAppStore(s => s.addNotification)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [uploadState, setUploadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [importState, setImportState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle')
  const [importError, setImportError] = useState<string | null>(null)
  const surveillance = surveillances.find(s => s.id === surveillanceId)

  const handleCharger = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
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

  const handleImportDocx = () => {
    importFileRef.current?.click()
  }

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.match(/\.docx$/i)) {
      setImportState('error')
      setImportError('Seuls les fichiers .docx sont supportés pour l\'import éditable.')
      return
    }

    try {
      setImportState('loading')
      setImportError(null)

      const result = await importRapportFromFile(file)

      updateSurveillance(surveillanceId, {
        rapport_sections: JSON.stringify(result.sections),
        rapport_type: 'redige',
        rapport_fichier_nom: file.name,
        rapport_html: result.rawHtml || '<p>Rapport importé et prêt à être modifié.</p>',
      })

      addNotification({
        user_id: useAppStore.getState().user?.id || '',
        type: 'success',
        title: 'Rapport importé',
        message: 'Le document a été parsé et est prêt à être édité.',
        canal: 'in_app',
      })

      setImportState('done')
      onClose()
      router.push(`/surveillance/${surveillanceId}/rapport`)
    } catch (err) {
      setImportState('error')
      setImportError(err instanceof Error ? err.message : 'Erreur lors du parsage du document')
    }
  }

  const handleRediger = () => {
    onClose()
    router.push(`/surveillance/${surveillanceId}/rapport`)
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

          <div className="space-y-3">
            {/* Option 1: Importer un DOCX et l'éditer */}
            <button
              onClick={handleImportDocx}
              disabled={importState === 'loading'}
              className="w-full p-4 rounded-xl border-2 border-dashed border-role-primary/50 hover:border-role-primary hover:bg-role-primary-soft transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-role-primary-soft flex items-center justify-center group-hover:scale-110 transition-transform">
                  {importState === 'loading' ? <Loader2 className="w-6 h-6 animate-spin text-role-primary" /> : <Upload className="w-6 h-6 text-role-primary" />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Importer un document Word et l'éditer</p>
                  <p className="text-xs text-muted mt-0.5">
                    Importez un rapport .docx existant — le système extrait le contenu dans l'éditeur pour le modifier et l'enrichir avec l'IA
                  </p>
                </div>
              </div>
            </button>

            {/* Option 2: Rédiger avec le système */}
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
                    L'IA génère un rapport automatique depuis les données de la surveillance — vous pouvez ensuite le modifier librement
                  </p>
                </div>
              </div>
            </button>

            {/* Option 3: Charger un fichier existant (tel quel) */}
            <button
              onClick={handleCharger}
              disabled={uploadState === 'loading'}
              className="w-full p-4 rounded-xl border-2 border-dashed border-border hover:border-muted-foreground/30 hover:bg-gray-50 transition-all text-left group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileUp className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Charger un rapport existant (tel quel)</p>
                  <p className="text-xs text-muted mt-0.5">
                    PDF, Word ou image — vous avez déjà rédigé et signé votre rapport en dehors du système (lecture seule)
                  </p>
                </div>
              </div>
            </button>
          </div>

          {importState === 'loading' && (
            <div className="mt-4 p-3 rounded-lg bg-role-primary-soft flex items-center gap-3 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-role-primary" />
              <span>Parsage du document Word en cours...</span>
            </div>
          )}

          {importState === 'error' && (
            <div className="mt-4 p-3 rounded-lg bg-danger-soft border border-red-500/20 flex items-start gap-3 text-sm">
              <AlertCircle className="w-4 h-4 text-danger mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-danger">Erreur d'import</p>
                <p className="text-danger/80">{importError}</p>
              </div>
            </div>
          )}

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
        <input
          ref={importFileRef}
          type="file"
          accept=".docx"
          onChange={handleImportFileSelected}
          className="hidden"
        />
      </div>
    </div>
  )
}

export default ChargerRedigerRapportModal
