'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import KitChecklistPreview from '@/components/modules/kit-inspecteur/KitChecklistPreview'
import { ArrowLeft, Brain, FileText } from 'lucide-react'

export default function KitChecklistPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const kitPreviewDoc = useAppStore(s => s.kitPreviewDoc)
  const kitPreviewData = useAppStore(s => s.kitPreviewData)
  const kitAnalyseIA = useAppStore(s => s.kitAnalyseIA)
  const kitDocuments = useAppStore(s => s.kitDocuments)
  const user = useAppStore(s => s.user)
  const clearKitPreview = useAppStore(s => s.clearKitPreview)

  const handleBack = () => {
    clearKitPreview()
    router.push('/kit-inspecteur')
  }

  // ── data-role sur body pour les variables CSS de rôle (btn-primary, bg-role-gradient…) ──
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  useEffect(() => {
    if (!kitPreviewDoc && id) {
      const doc = kitDocuments.find(d => d.id === id)
      if (!doc) {
        router.push('/kit-inspecteur')
      }
    }
  }, [kitPreviewDoc, id, kitDocuments, router])

  if (!kitPreviewDoc || !kitPreviewData || !kitAnalyseIA) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Chargement de la checklist...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" data-role={user?.role} data-module="kit-checklist-preview">
      {/* Header sticky */}
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBack}
                className="btn btn-secondary btn-sm gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">
                    {kitPreviewDoc.nom}
                  </h1>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="badge outline text-xs">
                      v{kitPreviewDoc.version}
                    </span>
                    <span className="badge primary text-xs">
                      <FileText className="w-3 h-3 mr-1" />
                      {kitAnalyseIA.reference_base}
                    </span>
                    <span className="badge neutral text-xs">
                      {kitAnalyseIA.type_oaci_detecte}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="container mx-auto px-6 py-6">
        <KitChecklistPreview
          doc={kitPreviewDoc}
          analyse={kitAnalyseIA}
          preview={kitPreviewData}
          asPage
        />
      </div>
    </div>
  )
}
