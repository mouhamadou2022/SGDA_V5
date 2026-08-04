'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { parseChecklistWord } from '@/lib/services/checklistParser'
import { Card } from '@/components/ui/card'
import {
  ArrowLeft, Upload, FileText, CheckCircle2, XCircle, Loader2,
  Trash2, AlertTriangle, Download,
} from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  IT: 'Inspection Technique',
  SOP: 'Procédures d\'Exploitation Normalisées',
  QSC: 'QSC — Surveillance Continue',
  SGS: 'SGS — PAOE',
  VALIDATION_SITE: 'Validation de site (construction)',
  HMG: 'Homologation',
  COP: 'COP',
  AUT: 'Autres checklist',
}

export default function ChecklistTemplatesPage() {
  const router = useRouter()
  const masterChecklists = useAppStore(s => s.masterChecklists)
  const setMasterChecklist = useAppStore(s => s.setMasterChecklist)
  const deleteMasterChecklist = useAppStore(s => s.deleteMasterChecklist)
  const addNotification = useAppStore(s => s.addNotification)

  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{
    template: { type: string; code: string; nom: string; version: string; portee: string[] }
    hierarchie: any[]
    filename: string
  } | null>(null)
  const [importing, setImporting] = useState(false)

  const user = useAppStore(s => s.user)
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role)
      return () => { document.body.removeAttribute('data-role') }
    }
  }, [user?.role])

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.docx')) {
      setError('Seuls les fichiers .docx (Word) sont acceptés.')
      return
    }
    setError(null)
    setParsing(true)
    setPreview(null)
    try {
      const result = await parseChecklistWord(file)
      setPreview({
        template: result.template,
        hierarchie: result.hierarchie,
        filename: file.name,
      })
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l\'analyse du fichier.')
    } finally {
      setParsing(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleImport = useCallback(async () => {
    if (!preview) return
    setImporting(true)
    try {
      const type = preview.template.type
      const code = preview.template.code
      const templateId = `${type}_${code}`
      setMasterChecklist(templateId, preview.hierarchie)
      const itemsCount = preview.hierarchie.reduce((s: number, d: any) => s + totalItems(d), 0)

      // Catégorie déduite du type (cohérent avec le wizard Kit Inspecteur)
      const categorie = type === 'HMG' ? 'homologation'
        : type === 'VALIDATION_SITE' ? 'validation_site'
        : type === 'AUT' ? 'autres'
        : type === 'QSC' ? 'surveillance_continue'
        : 'certification'

      const { importTemplateToSupabase } = await import('@/lib/services/checklistTemplateService')
      await importTemplateToSupabase(type as any, code, preview.template.nom, preview.template.portee, preview.hierarchie, {
        categorie,
        type_entite_cible: 'aerodrome',
        version: preview.template.version || '1.0',
        source_fichier: preview.filename,
        etat: 'publie',
        archivePrevious: true,
      })

      addNotification({
        user_id: '', type: 'success', title: 'Template importé',
        message: `${preview.template.nom} (${preview.hierarchie.length} domaines, ${itemsCount} items)`,
        canal: 'in_app',
      })
      setPreview(null)
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l\'import.')
    } finally {
      setImporting(false)
    }
  }, [preview, setMasterChecklist, addNotification])

  const totalItems = (d: any) =>
    (d.items?.length || 0) +
    (d.sousDomaines || []).reduce((s: number, sd: any) =>
      s + (sd.items?.length || 0) +
      (sd.sousSousDomaines || []).reduce((s2: number, ssd: any) =>
        s2 + (ssd.items?.length || 0), 0), 0)

  return (
    <div className="min-h-screen bg-gray-50" data-role={user?.role} data-module="checklist-templates">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => router.push('/')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Import de templates ANACIM</h1>
              <p className="text-xs text-muted-foreground">Importer les modèles Word officiels (IT, SOP, QSC, SGS)</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6 max-w-4xl">
        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-danger/20 rounded">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Upload zone */}
        <Card variant="level" levelColor="primary" className="mb-6">
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
              ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-gray-50'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = '.docx'
              input.onchange = (e: any) => { if (e.target?.files?.[0]) handleFile(e.target.files[0]) }
              input.click()
            }}
          >
            {parsing ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Analyse du document en cours...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Déposer un fichier .docx ici</p>
                <p className="text-xs text-muted-foreground">ou cliquer pour sélectionner un modèle Word ANACIM</p>
              </div>
            )}
          </div>
        </Card>

        {/* Preview */}
        {preview && (
          <Card variant="level" levelColor="success" className="mb-6">
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">{preview.template.nom}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{preview.filename}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {TYPE_LABELS[preview.template.type] || preview.template.type}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Code</p>
                  <p className="text-sm font-medium text-foreground">{preview.template.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Version</p>
                  <p className="text-sm font-medium text-foreground">{preview.template.version || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Domaines</p>
                  <p className="text-sm font-medium text-foreground">{preview.template.portee.join(', ') || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total items</p>
                  <p className="text-sm font-medium text-foreground">
                    {preview.hierarchie.reduce((s: number, d: any) => s + totalItems(d), 0)}
                  </p>
                </div>
              </div>

              {/* Domaine preview list */}
              <div className="space-y-2 mb-4">
                {preview.hierarchie.map((d: any, i: number) => (
                  <div key={d.id || i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground">{d.nom}</span>
                      {d.description && d.description !== d.nom && (
                        <span className="text-xs text-muted-foreground">— {d.description}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{totalItems(d)} items</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {importing ? 'Import...' : 'Importer ce template'}
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Templates déjà importés */}
        <Card variant="level" levelColor="warning">
          <div className="p-5">
            <h3 className="font-semibold text-foreground mb-4">Templates importés ({Object.keys(masterChecklists).length})</h3>
            {Object.keys(masterChecklists).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Aucun template importé pour le moment.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(masterChecklists).map(([id, checklist]) => {
                  const itemsCount = checklist.reduce((s: number, d: any) => s + totalItems(d), 0)
                  const domaines = checklist.map(d => d.nom).join(', ')
                  return (
                    <div key={id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-foreground">{id}</p>
                          <p className="text-xs text-muted-foreground">{domaines} — {itemsCount} items</p>
                        </div>
                      </div>
                      <button
                        onClick={() => { deleteMasterChecklist(id) }}
                        className="p-2 text-muted-foreground hover:text-danger transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
