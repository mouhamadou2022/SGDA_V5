'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { ChecklistTableEditor } from '@/components/checklist-editor/ChecklistTableEditor'
import { ChatIALateral } from '@/components/checklist-editor/ChatIALateral'
import { SGSEvaluationContent } from '@/components/modules/surveillance/SGSEvaluation'
import { buildSGSTemplateFromImport } from '@/lib/services/checklistParser'
import { inspecteurVirtuel } from '@/lib/ia/agents/inspecteurVirtuelAgent'
import type { DomaineChecklist } from '@/types/checklist'
import { SGS_COMPOSANTES_STRUCTURE } from '@/types/checklist'

import {
  ArrowLeft, Save, CheckCircle2, RefreshCw, Search, FileText,
  Info, AlertTriangle, CheckCircle, XCircle, MinusCircle, AlertCircle,
  Brain, Sparkles, Loader2, FileDown, FileSpreadsheet, Shield, Undo2, Redo2,
} from 'lucide-react'

const VALID_TEMPLATE_TYPES = ['IT', 'SOP', 'QSC', 'SGS', 'VALIDATION_SITE'] as const

function parseTemplateId(id: string): { type: string; code: string } | null {
  for (const t of VALID_TEMPLATE_TYPES) {
    if (id.startsWith(t + '_')) return { type: t, code: id.slice(t.length + 1) }
  }
  return null
}

// Renomme les IDs d'items dupliqués (même item.id dans une même liste) pour
// garantir des clés React uniques. Les données importées avant la correction
// peuvent contenir des doublons (ex. QSC_CONTINUE_QSC08 en double).
function normalizeChecklistIds(domaines: DomaineChecklist[]): DomaineChecklist[] {
  const dedupe = (items: any[]) => {
    const used = new Set<string>()
    return items.map(item => {
      let id = item?.id || ''
      if (!id) {
        id = `item-${Math.random().toString(36).slice(2, 8)}`
      } else if (used.has(id)) {
        let base = id
        let n = 2
        while (used.has(`${base}_${n}`)) n++
        id = `${base}_${n}`
      }
      used.add(id)
      return { ...item, id }
    })
  }
  return (domaines || []).map(d => ({
    ...d,
    items: dedupe(d?.items || []),
    sousDomaines: (d?.sousDomaines || []).map(sd => ({
      ...sd,
      items: dedupe(sd?.items || []),
      sousSousDomaines: (sd?.sousSousDomaines || []).map(ssd => ({ ...ssd, items: dedupe(ssd?.items || []) })),
    })),
  }))
}

// Chemin d'accès d'un item dans l'arbre : domaines → sousDomaines → sousSousDomaines
type ItemPath = number[]

// Applique un patch immuable à l'item repéré par son chemin
function patchItemAtPath(domaines: any[], path: ItemPath, patch: Record<string, unknown>): any[] {
  const clone = (domaines || []).map(d => ({ ...d }))
  const node = clone[path[0]]
  if (!node) return domaines
  const applyItems = (items: any[], idx: number) =>
    (items || []).map((it: any, i: number) => (i === idx ? { ...it, ...patch } : it))
  if (path.length === 2) {
    node.items = applyItems(node.items, path[1])
  } else if (path.length === 3) {
    node.sousDomaines = (node.sousDomaines || []).map((sd: any, i: number) =>
      i === path[1] ? { ...sd, items: applyItems(sd.items, path[2]) } : sd)
  } else if (path.length === 4) {
    node.sousDomaines = (node.sousDomaines || []).map((sd: any, i: number) =>
      i === path[1]
        ? { ...sd, sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any, j: number) =>
            j === path[2] ? { ...ssd, items: applyItems(ssd.items, path[3]) } : ssd) }
        : sd)
  }
  return clone
}

// Collecte les items ayant un guide d'évaluation mais sans critères SA/NS/NV/NA
function collectItemsNeedingDirectives(domaines: any[]): { path: ItemPath; item: any; domaine: string }[] {
  const targets: { path: ItemPath; item: any; domaine: string }[] = []
  const needs = (it: any) =>
    !!it?.directive_preuve &&
    !(it.directive_sa && it.directive_ns && it.directive_nv && it.directive_na)
  const push = (d: any, path: ItemPath, it: any) => targets.push({ path, item: it, domaine: d?.nom || '' })
  ;(domaines || []).forEach((d, di) => {
    ;(d?.items || []).forEach((it: any, i: number) => { if (needs(it)) push(d, [di, i], it) })
    ;(d?.sousDomaines || []).forEach((sd: any, si: number) => {
      ;(sd?.items || []).forEach((it: any, i: number) => { if (needs(it)) push(d, [di, si, i], it) })
      ;(sd?.sousSousDomaines || []).forEach((ssd: any, ssi: number) => {
        ;(ssd?.items || []).forEach((it: any, i: number) => { if (needs(it)) push(d, [di, si, ssi, i], it) })
      })
    })
  })
  return targets
}

export default function KitChecklistEditorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const masterChecklists = useAppStore(s => s.masterChecklists)
  const setMasterChecklist = useAppStore(s => s.setMasterChecklist)
  const addNotification = useAppStore(s => s.addNotification)

  const [domaines, setDomaines] = useState<any[]>([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [validated, setValidated] = useState(false)
  const [checkingRefs, setCheckingRefs] = useState(false)
  const [refIssues, setRefIssues] = useState<{ itemId: string; ref: string; found: boolean }[]>([])
  const [showRefCheck, setShowRefCheck] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingDocx, setExportingDocx] = useState(false)
  const [generatingDirectives, setGeneratingDirectives] = useState(false)
  const [directivesProgress, setDirectivesProgress] = useState({ done: 0, total: 0 })
  const [directivesComplete, setDirectivesComplete] = useState(false)
  const [sgsChatOpen, setSgsChatOpen] = useState(false)

  // ── Historique Annuler / Rétablir (comme Ctrl+Z dans Word) ──
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const undoStackRef = useRef<any[]>([])
  const redoStackRef = useRef<any[]>([])
  const historyPausedRef = useRef(false)

  const pushHistory = useCallback((prev: any[]) => {
    undoStackRef.current.push(prev)
    if (undoStackRef.current.length > 100) undoStackRef.current.shift()
    redoStackRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }, [])

  // Applique une mutation en historisant l'état précédent (Annuler)
  const setDomainesWithHistory = useCallback((updater: any[] | ((prev: any[]) => any[])) => {
    const prev = domainesRef.current
    const next = typeof updater === 'function' ? (updater as (p: any[]) => any[])(prev) : updater
    if (next === prev) return
    if (!historyPausedRef.current) {
      pushHistory(prev)
    }
    setDomaines(next)
  }, [pushHistory])

  // Applique une mutation SANS historisation (rechargement, restauration annuler/rétablir).
  // Garde la forme fonctionnelle : les workers IA font des patches concurrents qui
  // doivent chaîner sur le dernier état, pas sur domainesRef (potentiellement périmé).
  const setDomainesSilent = useCallback((updater: any[] | ((prev: any[]) => any[])) => {
    setDomaines(prev => {
      const next = typeof updater === 'function' ? (updater as (p: any[]) => any[])(prev) : updater
      return next === prev ? prev : next
    })
  }, [])

  const undo = useCallback(() => {
    const prev = domainesRef.current
    const previous = undoStackRef.current.pop()
    if (previous === undefined) return
    redoStackRef.current.push(prev)
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(true)
    setDomaines(previous)
  }, [])

  const redo = useCallback(() => {
    const prev = domainesRef.current
    const next = redoStackRef.current.pop()
    if (next === undefined) return
    undoStackRef.current.push(prev)
    setCanRedo(redoStackRef.current.length > 0)
    setCanUndo(true)
    setDomaines(next)
  }, [])

  // Raccourcis clavier Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isTyping) return
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo(); else undo()
      } else if (k === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const templateInfo = useMemo(() => parseTemplateId(id), [id])

  const user = useAppStore(s => s.user)
  // Page plein écran hors AppShell : activer les variables CSS de rôle (btn-primary, bg-role-gradient…)
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role)
      return () => { document.body.removeAttribute('data-role') }
    }
  }, [user?.role])

  const domainesRef = useRef<any[]>(domaines)
  domainesRef.current = domaines

  // Charger la checklist depuis le store (en dédupliquant les IDs d'items).
  // Ne recharger que si la source est DIFFÉRENTE de ce qu'on a déjà (l'autosave
  // écrit la même référence → on saute pour ne pas écraser les edits en cours).
  useEffect(() => {
    const stored = masterChecklists?.[id]
    if (stored && stored.length > 0 && stored !== domainesRef.current) {
      // Rechargement : on réinitialise l'historique Annuler/Rétablir
      undoStackRef.current = []
      redoStackRef.current = []
      setCanUndo(false)
      setCanRedo(false)
      setDomainesSilent(normalizeChecklistIds(stored as any))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, masterChecklists])

  // Auto-save debounce vers Supabase
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    if (domaines.length === 0) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      setMasterChecklist(id, domaines)
      if (templateInfo) {
        import('@/lib/services/checklistTemplateService').then(({ saveTemplateToSupabase }) => {
          saveTemplateToSupabase(
            id,
            templateInfo.type as any,
            templateInfo.code,
            templateInfo.type + ' - ' + templateInfo.code,
            '',
            [...new Set(domaines.map((d: any) => d.nom))],
            domaines,
          )
        }).catch(() => {})
      }
    }, 2000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [domaines, id, templateInfo, setMasterChecklist])

  const isSgs = templateInfo?.type === 'SGS'

  // Template SGS complet (fusion structure + metadata + edits persistés _sgsEditedTemplate)
  const sgsTemplate = useMemo(() => {
    if (!isSgs || domaines.length === 0) return undefined
    return buildSGSTemplateFromImport(domaines as any, templateInfo?.code)
  }, [isSgs, domaines, templateInfo])

  // Template STABLE passé à SGSEvaluationContent : capturé au premier chargement et
  // jamais recalculé, pour ne pas réinitialiser les edits de l'inspecteur quand
  // domaines[0]._sgsEditedTemplate est mis à jour (autosave → re-render).
  const sgsTemplateRef = useRef<any>(undefined)
  if (isSgs && sgsTemplate && !sgsTemplateRef.current) {
    sgsTemplateRef.current = sgsTemplate
  }

  // Remonte les modifications SGS (questions/directives/guide) dans domaines[0]
  // pour que l'autosave les persiste dans Supabase (_sgsEditedTemplate).
  const handleSGSChange = useCallback((edited: Record<string, { questions?: any[]; directives?: any; guideEtapes?: any[] }>) => {
    setDomainesSilent(prev => {
      if (!prev.length) return prev
      const [first, ...rest] = prev
      return [{ ...first, _sgsEditedTemplate: edited }, ...rest]
    })
  }, [setDomainesSilent])

  // Génération par IA du contenu d'un élément SGS (questions PAOE + directives + guide étapes)
  const handleGenerateSGSByIA = useCallback(async (composanteId: number, elementId: string) => {
    const docsActifs = (useAppStore.getState().kitDocuments || []).filter(d => d.etat === 'a_jour' && d.domaines.includes('SGS'))
    const elem = SGS_COMPOSANTES_STRUCTURE.find(c => c.id === composanteId)?.elements.find(e => e.id === elementId)
    try {
      const result = await inspecteurVirtuel.generateSGSEvaluation({
        aerodromeType: 'national',
        composanteId: composanteId as 1 | 2 | 3 | 4 | 5,
        elementId,
        elementLabel: elem?.label || elementId,
        documentsActifs: docsActifs,
      })
      return result
    } catch (err) {
      console.error('[KitChecklistEditor] Erreur génération SGS IA:', err)
      return null
    }
  }, [])

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
    if (templateInfo) {
      import('@/lib/services/checklistTemplateService').then(({ saveTemplateToSupabase }) => {
        saveTemplateToSupabase(
          id,
          templateInfo.type as any,
          templateInfo.code,
          templateInfo.type + ' - ' + templateInfo.code,
          '',
          [...new Set(domaines.map((d: any) => d.nom))],
          domaines,
        )
      }).catch(() => {})
    }
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
    addNotification({
      user_id: '', type: 'success', title: 'Checklist sauvegardée',
      message: `${stats.total} item(s) sauvegardé(s)`, canal: 'in_app',
    })
  }, [id, domaines, setMasterChecklist, addNotification, stats.total, templateInfo])

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
      router.push(`/`)
    }
  }, [router])

  const handleCheckReferences = useCallback(() => {
    setCheckingRefs(true)
    setRefIssues([])
    import('@/lib/store').then(({ useAppStore: store }) => {
      const docs = store.getState().kitDocuments || []
      const issues: { itemId: string; ref: string; found: boolean }[] = []
      const checkItems = (items: any[]) => {
        (items || []).forEach(item => {
          if (!item.reference_reglementaire) return
          const ref = item.reference_reglementaire.toLowerCase()
          const found = docs.some((d: any) =>
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
    })
  }, [domaines])

  const handleExportPDF = useCallback(async () => {
    setExportingPdf(true)
    try {
      const { exportChecklistPDF } = await import('@/lib/services/exportChecklist')
      await exportChecklistPDF(domaines as DomaineChecklist[], {
        titre: templateInfo ? `${templateInfo.type} - ${templateInfo.code}` : 'Checklist',
        code: templateInfo?.code || id,
        portee: [...new Set(domaines.map((d: any) => d.nom))],
        sgsTemplate: isSgs ? sgsTemplate : undefined,
      })
    } finally {
      setExportingPdf(false)
    }
  }, [domaines, templateInfo, id, isSgs, sgsTemplate])

  const handleExportDOCX = useCallback(async () => {
    setExportingDocx(true)
    try {
      const { exportChecklistDOCX } = await import('@/lib/services/documentTemplater')
      await exportChecklistDOCX(domaines as DomaineChecklist[], {
        titre: templateInfo ? `${templateInfo.type} - ${templateInfo.code}` : 'Checklist',
        code: templateInfo?.code || id,
        portee: [...new Set(domaines.map((d: any) => d.nom))],
        sgsTemplate: isSgs ? sgsTemplate : undefined,
      })
    } finally {
      setExportingDocx(false)
    }
  }, [domaines, templateInfo, id, isSgs, sgsTemplate])

  const markItemsProposed = (items: any[]): any[] =>
    (items || []).map((i: any) => ({ ...i, aiPropose: true }))

  const markDomaineProposed = (d: any): any => ({
    ...d,
    items: markItemsProposed(d.items),
    sousDomaines: (d.sousDomaines || []).map((sd: any) => ({
      ...sd,
      items: markItemsProposed(sd.items),
      sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any) => ({
        ...ssd,
        items: markItemsProposed(ssd.items),
      })),
    })),
  })

  const handleChatUpdate = useCallback((updated: any[]) => {
    setDomainesWithHistory(prev => {
      const merged = prev.map(d => {
        const match = updated.find((u: any) => u.id === d.id)
        return match ? (match as any) : d
      })
      updated.forEach((u: any) => {
        if (!merged.find((m: any) => m.id === u.id)) merged.push(u)
      })
      return merged.map(d => {
        const u = updated.find((x: any) => x.id === d.id)
        // Marque comme "proposé par l'IA" les domaines touchés → brillance en attente de validation
        return u ? markDomaineProposed(u) : d
      })
    })
  }, [setDomainesWithHistory])

  // Valide une proposition IA : retire la brillance (validation finale de l'inspecteur)
  const handleValidateProposal = useCallback((itemId: string) => {
    if (!itemId) return
    setDomainesWithHistory(prev => {
      const clear = (items: any[]) => (items || []).map((i: any) =>
        i.id === itemId ? { ...i, aiPropose: false } : i
      )
      return prev.map(d => ({
        ...d,
        items: clear(d.items),
        sousDomaines: (d.sousDomaines || []).map((sd: any) => ({
          ...sd,
          items: clear(sd.items),
          sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any) => ({
            ...ssd,
            items: clear(ssd.items),
          })),
        })),
      }))
    })
  }, [setDomainesWithHistory])

  // Items ayant un guide d'évaluation mais sans critères SA/NS/NV/NA
  const pendingDirectivesCount = useMemo(() => {
    if (isSgs) return 0
    return collectItemsNeedingDirectives(domaines).length
  }, [domaines, isSgs])

  // Génère les critères SA/NS/NV/NA par IA pour chaque item, en lisant le guide d'évaluation.
  // Exécution en parallèle limitée (4 requêtes simultanées) pour rester rapide sans saturer l'API.
  const generateDirectives = useCallback(async () => {
    if (isSgs || generatingDirectives) return
    const targets = collectItemsNeedingDirectives(domaines)
    if (targets.length === 0) return
    // Une seule entrée d'historique pour toute la génération IA (Annuler → état initial)
    if (domainesRef.current) {
      undoStackRef.current.push(domainesRef.current)
      redoStackRef.current = []
      setCanUndo(true)
      setCanRedo(false)
    }
    setGeneratingDirectives(true)
    setDirectivesProgress({ done: 0, total: targets.length })
    setDirectivesComplete(false)
    const { suggestDirectives } = await import('@/lib/ia/suggestDirectives')
    let done = 0
    const CONCURRENCE = 4
    let cursor = 0
    const worker = async () => {
      while (true) {
        const i = cursor++
        if (i >= targets.length) return
        const t = targets[i]
        try {
          const result = await suggestDirectives(
            t.item.directive_preuve || '',
            t.item.point_verification,
            t.item.reference_reglementaire || '',
            { domaine: t.domaine },
          )
          if (result.directive_sa || result.directive_ns || result.directive_nv || result.directive_na) {
            setDomainesSilent(prev => patchItemAtPath(prev, t.path, {
              directive_sa: result.directive_sa || undefined,
              directive_ns: result.directive_ns || undefined,
              directive_nv: result.directive_nv || undefined,
              directive_na: result.directive_na || undefined,
            }))
          }
        } catch {
          // silencieux — on continue sur les autres items
        }
        done++
        setDirectivesProgress({ done, total: targets.length })
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCE, targets.length) }, () => worker()))
    setGeneratingDirectives(false)
    if (done > 0) {
      addNotification({
        user_id: '', type: 'success',
        title: 'Critères SA/NS/NV/NA générés',
        message: `${done} item(s) analysé(s) par l'IA à partir des guides d'évaluation.`,
        canal: 'in_app',
      })
    }
  }, [domaines, isSgs, generatingDirectives, addNotification, setDomainesSilent])

  // Déclenchement automatique à l'ouverture (une fois par session et par template)
  const generateDirectivesRef = useRef(generateDirectives)
  useEffect(() => { generateDirectivesRef.current = generateDirectives })
  const autoRunKey = `kit-dirgen:${id}`
  useEffect(() => {
    if (isSgs || domaines.length === 0) return
    if (sessionStorage.getItem(autoRunKey)) return
    sessionStorage.setItem(autoRunKey, '1')
    const t = setTimeout(() => { generateDirectivesRef.current() }, 700)
    return () => clearTimeout(t)
  }, [id, isSgs, domaines.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Passe en état « tout rempli » quand une génération IA se termine
  // et qu'aucun item n'attend plus de critères SA/NS/NV/NA.
  const directivesRunRef = useRef(false)
  useEffect(() => {
    if (generatingDirectives) {
      directivesRunRef.current = true
    } else if (directivesRunRef.current && pendingDirectivesCount === 0) {
      setDirectivesComplete(true)
    }
  }, [generatingDirectives, pendingDirectivesCount])

  const goBack = () => router.push('/')

  const getProgressColor = (p: number) => {
    if (p >= 80) return 'bg-green-500'
    if (p >= 50) return 'bg-blue-500'
    if (p >= 25) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const exported = (n: number) => n > 0

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ── Top Bar ── */}
      <div className="shrink-0 bg-white border-b border-blue-200 px-4 py-2 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={goBack}
            className="btn btn-sm btn-icon-only btn-secondary" title="Retour">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-blue-200" />
          <button onClick={undo} disabled={!canUndo}
            className="btn btn-sm btn-icon-only btn-secondary disabled:opacity-40 disabled:cursor-not-allowed" title="Annuler (Ctrl+Z)">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={redo} disabled={!canRedo}
            className="btn btn-sm btn-icon-only btn-secondary disabled:opacity-40 disabled:cursor-not-allowed" title="Rétablir (Ctrl+Y)">
            <Redo2 className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-blue-800">{isSgs ? 'Template SGS — Évaluation PAOE' : 'Édition checklist maîtresse'}</h1>
            <p className="text-[10px] text-blue-400">{id?.slice(0, 24)} — {stats.total} item{stats.total > 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Stats badges (S/NS uniquement pour non-SGS) */}
          {!isSgs && (
            <div className="flex items-center gap-1.5 mr-4">
              {(['SA', 'NS', 'NA', 'NV'] as const).map(r => {
                const badgeColors: Record<string, string> = {
                  SA: 'bg-green-500', NS: 'bg-red-500', NA: 'bg-gray-400', NV: 'bg-amber-500',
                };
                const count = stats[r.toLowerCase() as keyof typeof stats] as number;
                return count > 0 ? (
                  <span key={r} className={`${badgeColors[r]} text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm`}>
                    {r} {count}
                  </span>
                ) : null;
              })}
            </div>
          )}
          <button onClick={handleCheckReferences} disabled={checkingRefs}
            className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50" title="Vérifier les références réglementaires">
            {checkingRefs ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Search className="w-3 h-3" />}
            Réfs
          </button>
          {!isSgs && (
            <button onClick={generateDirectives} disabled={generatingDirectives || pendingDirectivesCount === 0}
              className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50"
              title="Générer les critères SA/NS/NV/NA par IA depuis les guides d'évaluation">
              {generatingDirectives ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {generatingDirectives ? `IA ${directivesProgress.done}/${directivesProgress.total}` : pendingDirectivesCount > 0 ? `Critères IA (${pendingDirectivesCount})` : 'Critères IA'}
            </button>
          )}
          <button onClick={handleExportPDF} disabled={exportingPdf || !exported(stats.total)}
            className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50" title="Exporter en PDF">
            {exportingPdf ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <FileDown className="w-3 h-3" />}
            PDF
          </button>
          <button onClick={handleExportDOCX} disabled={exportingDocx || !exported(stats.total)}
            className="btn btn-sm btn-secondary gap-1.5 disabled:opacity-50" title="Exporter en Word">
            {exportingDocx ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <FileSpreadsheet className="w-3 h-3" />}
            Word
          </button>
          {isSgs && (
            <button onClick={() => setSgsChatOpen(open => !open)}
              className={`btn btn-sm gap-1.5 ${sgsChatOpen ? 'btn-primary' : 'btn-secondary'}`} title="Modifier ou améliorer la checklist SGS avec l'assistant IA">
              <Brain className="w-3 h-3" /> {sgsChatOpen ? 'Fermer Chat IA' : 'Chat IA'}
            </button>
          )}
          <button onClick={handleRegenerate}
            className="btn btn-sm btn-secondary gap-1.5">
            <RefreshCw className="w-3 h-3" /> Régénérer
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50">
            {saving ? <span className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" /> : saved ? <CheckCircle2 className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {saved ? 'Sauvegardée' : 'Sauvegarder'}
          </button>
          <button onClick={handleValidate}
            className="btn btn-sm btn-success gap-1.5">
            <CheckCircle2 className="w-3 h-3" /> Valider
          </button>
        </div>
      </div>

      {/* ── Progress bar (S/NS) ── */}
      {!isSgs && (
        <div className="shrink-0 h-1 bg-blue-100">
          <div className={`h-full ${getProgressColor(stats.progression)} transition-all duration-500`} style={{ width: `${stats.progression}%` }} />
        </div>
      )}

      {/* ── Corps ── */}
      {isSgs ? (
        /* Mode SGS : Chat IA (si actif) à côté de la checklist PAOE */
        <div className="flex-1 flex overflow-hidden">
          {sgsChatOpen && (
            <ChatIALateral
              checklistJson={domaines as any}
              onChecklistUpdate={handleChatUpdate}
              onClose={() => setSgsChatOpen(false)}
            />
          )}
          <div className="flex-1 overflow-y-auto">
            <SGSEvaluationContent
              aerodromeId=""
              surveillanceId={id}
              inspecteurId=""
              inspecteurNom=""
              sgsTemplate={sgsTemplateRef.current as any}
              readOnly={false}
              structureReadOnly={false}
              showSaveButton={false}
              onGenerateByIA={handleGenerateSGSByIA}
              onValidateProposal={handleValidateProposal}
              onChange={handleSGSChange}
              onSave={() => {}}
              onBack={goBack}
            />
          </div>
        </div>
      ) : (
        /* Mode standard : Chat Gauche + Tableau Droite */
        <div className="flex-1 flex overflow-hidden">
          <ChatIALateral checklistJson={domaines as any} onChecklistUpdate={handleChatUpdate} />

          <div className="flex-1 overflow-y-auto p-4">
            {!isSgs && (generatingDirectives || pendingDirectivesCount > 0 || directivesComplete) && (
              <div className={`mb-4 px-4 py-2.5 rounded-lg flex items-center gap-3 ${pendingDirectivesCount > 0 ? 'bg-purple-50 border border-purple-200' : 'bg-green-50 border border-green-200'}`}>
                {generatingDirectives ? (
                  <>
                    <Loader2 className="w-4 h-4 text-purple-600 animate-spin shrink-0" />
                    <span className="text-xs font-medium text-purple-800 whitespace-nowrap">
                      L'IA lit les guides d'évaluation et génère les critères SA/NS/NV/NA… {directivesProgress.done}/{directivesProgress.total}
                    </span>
                    <div className="flex-1 h-1 bg-purple-100 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 transition-all duration-300"
                        style={{ width: `${directivesProgress.total > 0 ? (directivesProgress.done / directivesProgress.total) * 100 : 0}%` }} />
                    </div>
                  </>
                ) : pendingDirectivesCount > 0 ? (
                  <>
                    <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="text-xs font-medium text-purple-800">
                      {pendingDirectivesCount} item{pendingDirectivesCount > 1 ? 's' : ''} ont un guide d'évaluation mais pas de critères SA/NS/NV/NA.
                    </span>
                    <button onClick={generateDirectives} className="ml-auto btn btn-sm btn-primary gap-1.5">
                      <Sparkles className="w-3 h-3" /> Générer par IA
                    </button>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-xs font-medium text-green-700">
                      Tous les items ont leurs critères SA/NS/NV/NA.
                    </span>
                  </>
                )}
              </div>
            )}
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
              onChange={setDomainesWithHistory}
              onAddDomaine={(info) => {
                setDomainesWithHistory(prev => [...prev, {
                  id: `dom-${Date.now()}`,
                  nom: info.code,
                  description: info.description || info.label,
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
      )}

      {/* ── Footer ── */}
      <div className="shrink-0 bg-white border-t border-blue-200 px-4 py-2 flex items-center justify-between text-[10px] text-blue-400">
        <div className="flex items-center gap-4">
          {!isSgs && (
            <>
              <span><FileText className="w-3 h-3 inline mr-1" />{stats.total} item(s)</span>
              <span className={`font-medium ${stats.progression >= 100 ? 'text-green-600' : ''}`}>
                Progression: {stats.progression}%
              </span>
            </>
          )}
          {isSgs && <span><Shield className="w-3 h-3 inline mr-1" />{stats.total} question(s) PAOE</span>}
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
