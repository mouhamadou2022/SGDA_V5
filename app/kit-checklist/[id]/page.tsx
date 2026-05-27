'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { ChecklistTableEditor } from '@/components/checklist-editor/ChecklistTableEditor'
import { ChatIALateral } from '@/components/checklist-editor/ChatIALateral'

import {
  ArrowLeft, Save, CheckCircle2, RefreshCw, Search, FileText,
  Info, AlertTriangle, CheckCircle, XCircle, MinusCircle, AlertCircle,
  Brain, Sparkles, Loader2,
} from 'lucide-react'

export default function KitChecklistEditorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const masterChecklists = useAppStore(s => s.masterChecklists)
  const setMasterChecklist = useAppStore(s => s.setMasterChecklist)
  const kitDocuments = useAppStore(s => s.kitDocuments)
  const addNotification = useAppStore(s => s.addNotification)

  const [domaines, setDomaines] = useState<any[]>([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validated, setValidated] = useState(false)
  const [checkingRefs, setCheckingRefs] = useState(false)
  const [refIssues, setRefIssues] = useState<{ itemId: string; ref: string; found: boolean }[]>([])
  const [showRefCheck, setShowRefCheck] = useState(false)

  // Charger la checklist depuis le store
  useEffect(() => {
    const stored = masterChecklists?.[id]
    if (stored && stored.length > 0) {
      setDomaines(stored as any)
    }
  }, [id, masterChecklists])

  const stats = useMemo(() => {
    let total = 0, sa = 0, ns = 0, nv = 0, na = 0
    const walk = (items: any[]) => {
      (items || []).forEach(item => {
        total++
        const r = item.resultat || item.prediction || 'NV'
        if (r === 'SA') sa++; else if (r === 'NS') ns++; else if (r === 'NA') na++; else nv++
      })
    }
    domaines.forEach((d: any) => {
      walk(d.items || [])
      ;(d.sousDomaines || []).forEach((sd: any) => {
        walk(sd.items || [])
        ;(sd.sousSousDomaines || []).forEach((ssd: any) => walk(ssd.items || []))
      })
    })
    const renseignes = sa + ns + na
    const progression = total > 0 ? Math.round((renseignes / total) * 100) : 0
    return { total, sa, ns, nv, na, progression }
  }, [domaines])

  const handleSave = useCallback(() => {
    setSaving(true)
    setMasterChecklist(id, domaines)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
    addNotification({
      user_id: '', type: 'success', title: 'Checklist sauvegardée',
      message: `${stats.total} item(s) sauvegardé(s)`, canal: 'in_app',
    })
  }, [id, domaines, setMasterChecklist, addNotification, stats.total])

  const handleValidate = useCallback(() => {
    setMasterChecklist(id, domaines)
    setValidated(true)
    addNotification({
      user_id: '', type: 'success', title: 'Checklist validée',
      message: 'La checklist est prête à être utilisée par le planning', canal: 'in_app',
    })
  }, [id, domaines, setMasterChecklist, addNotification])

  const handleRegenerate = useCallback(() => {
    if (window.confirm('Régénérer la checklist ? Les modifications non sauvegardées seront perdues.')) {
      router.push(`/kit-inspecteur`)
    }
  }, [router])

  const handleCheckReferences = useCallback(() => {
    setCheckingRefs(true)
    setRefIssues([])
    const docs = kitDocuments || []
    const issues: { itemId: string; ref: string; found: boolean }[] = []

    const checkItems = (items: any[]) => {
      (items || []).forEach(item => {
        if (!item.reference_reglementaire) return
        const ref = item.reference_reglementaire.toLowerCase()
        const found = docs.some(d =>
          d.nom?.toLowerCase().includes(ref.split('§')[0].trim()) ||
          (d.reference_base || '').toLowerCase().includes(ref.split('§')[0].trim())
        )
        issues.push({ itemId: item.id, ref: item.reference_reglementaire, found })
      })
    }

    domaines.forEach((d: any) => {
      checkItems(d.items || [])
      ;(d.sousDomaines || []).forEach((sd: any) => {
        checkItems(sd.items || [])
        ;(sd.sousSousDomaines || []).forEach((ssd: any) => checkItems(ssd.items || []))
      })
    })

    setRefIssues(issues)
    setShowRefCheck(true)
    setCheckingRefs(false)
  }, [domaines, kitDocuments])

  const handleChatUpdate = useCallback((updated: any[]) => {
    setDomaines(prev => {
      // Merge IA update: keep existing IDs, replace matching ones, add new ones
      const merged = prev.map(d => {
        const match = updated.find((u: any) => u.id === d.id)
        return match ? (match as any) : d
      })
      // Add any new domaines from IA
      updated.forEach((u: any) => {
        if (!merged.find((m: any) => m.id === u.id)) merged.push(u)
      })
      return merged
    })
  }, [])

  const goBack = () => router.push('/kit-inspecteur')

  const getProgressColor = (p: number) => {
    if (p >= 80) return 'bg-green-500'
    if (p >= 50) return 'bg-blue-500'
    if (p >= 25) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ── Top Bar ── */}
      <div className="shrink-0 bg-white border-b border-blue-200 px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={goBack}
            className="btn btn-sm btn-icon-only btn-secondary text-blue-600" title="Retour">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-blue-800">Édition checklist maîtresse</h1>
            <p className="text-[10px] text-blue-400">{id?.slice(0, 8)}... — {stats.total} item(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Stats badges */}
          <div className="flex items-center gap-1.5 mr-4">
            {(['SA', 'NS', 'NA', 'NV'] as const).map(r => {
              const badgeColors: Record<string, string> = {
                SA: 'bg-green-500', NS: 'bg-red-500', NA: 'bg-gray-400', NV: 'bg-amber-500',
              };
              const count = stats[r.toLowerCase() as keyof typeof stats] as number;
              return (
                <span key={r} className={`${badgeColors[r]} text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm`}>
                  {r} {count}
                </span>
              );
            })}
          </div>
          <button onClick={handleCheckReferences} disabled={checkingRefs}
            className="btn btn-sm btn-secondary text-blue-600 gap-1.5 disabled:opacity-50">
            {checkingRefs ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            Réfs
          </button>
          <button onClick={handleRegenerate}
            className="btn btn-sm btn-secondary text-blue-600 gap-1.5">
            <RefreshCw className="w-3 h-3" /> Régénérer
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn btn-sm btn-secondary text-blue-600 gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <CheckCircle2 className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {saved ? 'Sauvegardée' : 'Sauvegarder'}
          </button>
          <button onClick={handleValidate}
            className="btn btn-sm btn-secondary text-blue-600 gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Valider
          </button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="shrink-0 h-1 bg-blue-100">
        <div className={`h-full ${getProgressColor(stats.progression)} transition-all duration-500`} style={{ width: `${stats.progression}%` }} />
      </div>

      {/* ── Corps : Chat Gauche + Tableau Droite ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat IA - gauche */}
        <ChatIALateral checklistJson={domaines as any} onChecklistUpdate={handleChatUpdate} />

        {/* Tableau éditeur - droite */}
        <div className="flex-1 overflow-y-auto p-4">
          {validated && (
            <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4" />
              Checklist validée — disponible pour le planning
            </div>
          )}

          {showRefCheck && refIssues.length > 0 && (
            <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-blue-700">Vérification des références ({refIssues.length})</span>
                <button onClick={() => setShowRefCheck(false)} className="p-0.5 text-blue-400 hover:text-blue-600"><XCircle className="w-3 h-3" /></button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {refIssues.filter(i => !i.found).slice(0, 10).map(issue => (
                  <div key={issue.itemId} className="flex items-center gap-2 text-[10px] text-amber-700">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="font-mono">{issue.ref}</span>
                    <span className="text-amber-400">— non trouvé dans les documents</span>
                  </div>
                ))}
                {refIssues.filter(i => i.found).slice(0, 5).map(issue => (
                  <div key={issue.itemId} className="flex items-center gap-2 text-[10px] text-green-600">
                    <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                    <span className="font-mono">{issue.ref}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ChecklistTableEditor
            domaines={domaines}
            onChange={setDomaines}
            onAddDomaine={() => {
              const code = prompt('Code du nouveau domaine (ex: SEC)')
              if (!code) return
              const nom = prompt('Nom du nouveau domaine')
              if (!nom) return
              setDomaines(prev => [...prev, {
                id: `dom-${Date.now()}`,
                nom: nom.toUpperCase(),
                description: code.toUpperCase(),
                items: [],
                sousDomaines: [],
                isExpanded: true,
                progression: 0,
                ordre: prev.length,
              }])
            }}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 bg-white border-t border-blue-200 px-4 py-2 flex items-center justify-between text-[10px] text-blue-400">
        <div className="flex items-center gap-4">
          <span><FileText className="w-3 h-3 inline mr-1" />{stats.total} item(s)</span>
          <span className={`font-medium ${stats.progression >= 100 ? 'text-green-600' : ''}`}>
            Progression: {stats.progression}%
          </span>
        </div>
        <div className="flex items-center gap-3">
          {validated && <span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Validée</span>}
          {saved && <span className="text-blue-600">Dernière sauvegarde à l'instant</span>}
          <span className="text-blue-300">Kit Checklist v1</span>
        </div>
      </div>
    </div>
  )
}
