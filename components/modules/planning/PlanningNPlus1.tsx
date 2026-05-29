// components/modules/planning/PlanningNPlus1.tsx
// N+1 : génération + revue individuelle avec réajustements + consolidation style AerodromeDetail
'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore, Planning, Aerodrome, ProfilRisque } from '@/lib/store'
import { DOMAINES_SURVEILLANCE, getDomaineLabel } from '@/lib/domaines'
import {
  Calendar, CheckCircle2, XCircle, X, TrendingUp, AlertTriangle,
  Shield, Target, Zap, Edit2, Save, MapPin, Users, Clock, Brain,
  FileText
} from 'lucide-react'

interface Props { onClose?: () => void; userRole?: string }

const TYPE_LABELS: Record<string, string> = {
  certification: 'Certification', suivi_ecarts: 'Suivi écarts',
  mise_oeuvre_pac: 'Mise en œuvre PAC', maintien: 'Maintien',
  audit_complet: 'Audit complet', periodique: 'Périodique', programmee: 'Périodique',
}
const TYPE_ICONS: Record<string, React.ReactNode> = {
  certification: <Shield className="w-4 h-4" />, suivi_ecarts: <AlertTriangle className="w-4 h-4" />,
  mise_oeuvre_pac: <CheckCircle2 className="w-4 h-4" />, maintien: <Target className="w-4 h-4" />,
  audit_complet: <Target className="w-4 h-4" />, periodique: <Calendar className="w-4 h-4" />,
}
const SOURCE_CLS: Record<string, string> = {
  profil_risque: 'badge primary', carryover_ecart: 'badge danger',
  carryover_pac: 'badge warning', certification_renouvellement: 'badge success', injection: 'badge neutral',
}
const SOURCE_LABEL: Record<string, string> = {
  profil_risque: 'Profil', carryover_ecart: 'Écart', carryover_pac: 'PAC', certification_renouvellement: 'Certificat',
}
const MOTIFS_REFUS = ['Déjà planifié', 'Fréquence trop élevée', 'Domaines non pertinents', 'Période inadaptée', 'Doublon avec un planning existant']
const SURVEILLANCE_TYPES = ['periodique', 'maintien', 'suivi_ecarts', 'mise_oeuvre_pac', 'audit_complet', 'certification']
const PRIORITE_BADGE: Record<string, string> = { critique: 'badge danger', haute: 'badge warning', moyenne: 'badge primary', basse: 'badge success' }
const PRIORITE_LABEL: Record<string, string> = { critique: 'Critique', haute: 'Élevée', moyenne: 'Moyen', basse: 'Faible' }

export default function PlanningNPlus1({ onClose, userRole = 'admin' }: Props) {
  const aerodromes = useAppStore(s => s.aerodromes)
  const plannings = useAppStore(s => s.plannings)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const propositionsN1 = useAppStore(s => s.propositionsN1)
  const setPropositionsN1 = useAppStore(s => s.setPropositionsN1)
  const genererPlanningN1 = useAppStore(s => s.genererPlanningN1)
  const refuserPropositionN1 = useAppStore(s => s.refuserPropositionN1)
  const consoliderPropositionsN1 = useAppStore(s => s.consoliderPropositionsN1)
  const user = useAppStore(s => s.user)
  const addNotification = useAppStore(s => s.addNotification)

  const anneeN1 = new Date().getFullYear() + 1
  const moisActuel = new Date().getMonth() + 1 // 1-12
  const isNovemberOrLater = moisActuel >= 11
  const [generating, setGenerating] = useState(false)
  const [selectedAero, setSelectedAero] = useState('')
  const [refusModal, setRefusModal] = useState<{ id: string; motif: string } | null>(null)
  const [validatedIds, setValidatedIds] = useState<Set<string>>(new Set())
  const [consolidating, setConsolidating] = useState(false)
  const [showConsolidation, setShowConsolidation] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Planning> & { observations?: string }>({})
  const [notified, setNotified] = useState(false)

  // Notification + auto-génération si novembre ou plus
  useEffect(() => {
    if (!notified && user?.id) {
      addNotification({
        user_id: user.id,
        type: 'info',
        title: `Planning N+1 ${anneeN1}`,
        message: isNovemberOrLater
          ? `Le planning de surveillance pour ${anneeN1} est disponible. Les propositions sont générées automatiquement.`
          : `Le planning de surveillance pour ${anneeN1} sera disponible dès novembre ${new Date().getFullYear()}.`,
        canal: 'in_app',
      })
      setNotified(true)
    }
    // Auto-génération si novembre+
    if (isNovemberOrLater && propositionsN1.length === 0 && !generating) {
      handleGenerer()
    }
  }, [notified, user?.id, anneeN1, isNovemberOrLater])

  const planningsN1 = useMemo(() =>
    plannings.filter(p => p.annee_cible === anneeN1 && !p.deleted_at),
    [plannings, anneeN1]
  )

  const overlap = (a: Planning, b: Planning) => a.aerodrome_id === b.aerodrome_id
    && new Date(a.date_debut).getTime() < new Date(b.date_fin).getTime()
    && new Date(b.date_debut).getTime() < new Date(a.date_fin).getTime()

  const grouped = useMemo(() => {
    const map = new Map<string, { aero: any; existants: Planning[]; propositions: Planning[]; profil?: ProfilRisque }>()
    for (const a of aerodromes) { if (!a.deleted_at) map.set(a.id, { aero: a, existants: [], propositions: [], profil: profilsRisque[a.id] }) }
    for (const p of planningsN1) { const g = map.get(p.aerodrome_id); if (g) g.existants.push(p) }
    for (const p of propositionsN1) {
      const g = map.get(p.aerodrome_id)
      if (g) g.propositions.push(p)
      else { const a = aerodromes.find(x => x.id === p.aerodrome_id); if (a) map.set(p.aerodrome_id, { aero: a, existants: [], propositions: [p], profil: profilsRisque[a.id] }) }
    }
    return Array.from(map.values()).filter(g => selectedAero === '' || g.aero.id === selectedAero)
  }, [aerodromes, planningsN1, propositionsN1, profilsRisque, selectedAero])

  const stats = useMemo(() => ({
    total: propositionsN1.length,
    carryOver: propositionsN1.filter(p => (p as any).source?.type?.startsWith('carryover')).length,
    certif: propositionsN1.filter(p => (p as any).source?.type === 'certification_renouvellement').length,
    conflits: propositionsN1.filter(p => planningsN1.some(pe => pe.aerodrome_id === p.aerodrome_id && overlap(p, pe))).length,
  }), [propositionsN1, planningsN1])

  const handleGenerer = async () => {
    setGenerating(true)
    setValidatedIds(new Set())
    try {
      const toutes: Planning[] = []
      for (const g of grouped) { const props = genererPlanningN1(g.aero.id, anneeN1); if (props?.length) toutes.push(...props) }
      setPropositionsN1(toutes)
    } catch (e) { console.error('[N+1] Erreur:', e) } finally { setGenerating(false) }
  }

  // Ouvrir l'édition inline
  const handleStartEdit = (prop: Planning) => {
    setEditingId(prop.id!)
    setEditForm({
      type: prop.type,
      date_debut: prop.date_debut?.split('T')[0] || '',
      date_fin: prop.date_fin?.split('T')[0] || '',
      portee: [...(prop.portee || [])],
      priorite: prop.priorite,
      equipe_ids: [...(prop.equipe_ids || [])],
      observations: ((prop as any).source?.raison || ''),
    })
  }

  const handleSaveEdit = (propId: string) => {
    setEditingId(null)
    setPropositionsN1(propositionsN1.map(p => p.id === propId ? {
      ...p,
      type: editForm.type || p.type,
      date_debut: editForm.date_debut ? new Date(editForm.date_debut).toISOString() : p.date_debut,
      date_fin: editForm.date_fin ? new Date(editForm.date_fin).toISOString() : p.date_fin,
      portee: editForm.portee || p.portee,
      priorite: editForm.priorite || p.priorite,
      equipe_ids: editForm.equipe_ids || p.equipe_ids,
      observations: editForm.observations || (p as any).observations,
    } as Planning : p))
  }

  const handleCancelEdit = () => { setEditingId(null); setEditForm({}) }

  const handleValider = (id: string) => {
    if (editingId === id) handleSaveEdit(id)
    setValidatedIds(prev => new Set(prev).add(id))
  }
  const handleUnvalider = (id: string) => setValidatedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  const handleRefuser = (id: string) => setRefusModal({ id, motif: '' })
  const confirmRefus = () => {
    if (!refusModal) return
    refuserPropositionN1(refusModal.id, refusModal.motif || MOTIFS_REFUS[0])
    setValidatedIds(prev => { const n = new Set(prev); n.delete(refusModal.id); return n })
    if (editingId === refusModal.id) handleCancelEdit()
    setRefusModal(null)
  }

  const handleConsolider = async () => {
    setConsolidating(true)
    try {
      const ids = Array.from(validatedIds)
      await consoliderPropositionsN1(ids)
      setValidatedIds(new Set())
      setShowConsolidation(false)
    } catch (e) { console.error('[N+1] Erreur consolidation:', e) } finally { setConsolidating(false) }
  }

  const toggleDomaine = (code: string) => {
    const current = editForm.portee || []
    setEditForm(f => ({ ...f, portee: current.includes(code) ? current.filter(d => d !== code) : [...current, code] }))
  }

  const role = userRole || user?.role || ''
  const validatedProps = propositionsN1.filter(p => validatedIds.has(p.id!))

  return (
    <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary" data-role={role}>
      <div className="modal-header border-b border-border bg-role-primary-soft">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center text-white"><TrendingUp className="w-5 h-5" /></div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Planning N+1 — {anneeN1}</h2>
            <p className="text-sm text-muted-foreground">
              {!isNovemberOrLater
                ? `Disponible dès novembre ${new Date().getFullYear()} — génération automatique via profil, écarts, PAC et certifications`
                : propositionsN1.length > 0
                  ? `${propositionsN1.length} propositions · ${validatedIds.size} validée(s) · ${stats.carryOver} carry-over · ${stats.certif} certif`
                  : 'Génération automatique en cours...'}
            </p>
          </div>
        </div>
        {onClose && <button onClick={onClose} className="btn btn-secondary gap-2"><X className="h-4 w-4" />Fermer</button>}
      </div>

      <div className="p-6 space-y-4">
        {/* Avant novembre : accès verrouillé */}
        {!isNovemberOrLater && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-role-primary-soft mx-auto flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-role-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">Planning N+1 — Disponible en novembre {new Date().getFullYear()}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Les propositions pour l'année {anneeN1} seront générées automatiquement à partir de novembre {new Date().getFullYear()}.
              Elles prendront en compte le profil de risque, les écarts actifs, les PAC et les certifications de chaque aérodrome.
            </p>
            <p className="text-xs text-muted-foreground mt-4">Mois actuel : {new Date().toLocaleDateString('fr-FR', { month: 'long' })} — revenez en novembre</p>
          </div>
        )}

        {isNovemberOrLater && (<>
        <div className="flex items-center gap-3 flex-wrap">
          {validatedIds.size > 0 && (
            <button onClick={() => setShowConsolidation(true)} className="btn btn-success gap-2 animate-fade-up">
              <CheckCircle2 className="w-4 h-4" />Consolider le planning N+1 ({validatedIds.size})
            </button>
          )}
          <div className="flex-1" />
          <select value={selectedAero} onChange={e => setSelectedAero(e.target.value)} className="form-select py-2 w-64">
            <option value="">Tous les aérodromes</option>
            {aerodromes?.filter(a => !a.deleted_at).map(a => <option key={a.id} value={a.id}>{a.code_oaci} — {a.nom}</option>)}
          </select>
        </div>

        {propositionsN1.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground bg-role-primary-soft/20 p-3 rounded-lg">
            <span className="font-semibold text-foreground">{stats.total} propositions</span>
            {stats.carryOver > 0 && <span className="badge danger text-xs">{stats.carryOver} carry-over</span>}
            {stats.certif > 0 && <span className="badge success text-xs">{stats.certif} certif</span>}
            {stats.conflits > 0 && <span className="badge warning text-xs">{stats.conflits} conflit(s)</span>}
            {validatedIds.size > 0 && <span className="badge success text-xs">{validatedIds.size} validée(s)</span>}
          </div>
        )}

        {propositionsN1.length === 0 && (
          <div className="text-center py-12 text-muted-foreground"><Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Aucune proposition pour {anneeN1}</p><p className="text-sm mt-1">Disponible dès novembre {new Date().getFullYear()} — cliquez sur Générer</p></div>
        )}

        {grouped.map(g => (
          <div key={g.aero.id} className="border border-border rounded-xl overflow-hidden">
            <div className="bg-role-primary-soft/30 px-4 py-2 flex items-center gap-3">
              <span className="code-oaci-badge text-sm">{g.aero.code_oaci}</span>
              <span className="font-semibold text-sm text-foreground">{g.aero.nom}</span>
              {g.profil && (
                <span className={`badge text-xs ${g.profil.score_global < 30 ? 'danger' : g.profil.score_global < 60 ? 'warning' : 'success'}`}>
                  Score {g.profil.score_global}/100
                </span>
              )}
              <span className="text-sm text-muted-foreground ml-auto">{g.existants.length} planning(s) · {g.propositions.length} proposition(s)</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="p-3 space-y-2">
                <p className="text-sm font-semibold text-muted-foreground uppercase">Planning {anneeN1} existant</p>
                {g.existants.length === 0 ? <p className="text-sm text-muted-foreground italic">Aucun</p> : g.existants.map(p => (
                  <div key={p.id} className="p-2 rounded-lg bg-muted/20 text-sm">
                    <div className="flex items-center gap-2">
                      {TYPE_ICONS[p.type] || <Calendar className="w-4 h-4" />}
                      <span className="font-medium">{TYPE_LABELS[p.type] || p.type}</span>
                      <span className="text-muted-foreground">{p.date_debut ? new Date(p.date_debut).toLocaleDateString('fr-FR') : '?'}</span>
                    </div>
                    {p.portee?.length > 0 && <p className="text-sm text-muted-foreground mt-0.5">{p.portee.slice(0, 4).join(', ')}</p>}
                  </div>
                ))}
              </div>
              <div className="p-3 space-y-2">
                <p className="text-sm font-semibold text-muted-foreground uppercase">Propositions N+1</p>
                {g.propositions.length === 0 ? <p className="text-sm text-muted-foreground italic">Aucune</p> : g.propositions.map((prop, pi) => {
                  const isValide = validatedIds.has(prop.id!)
                  const isEditing = editingId === prop.id
                  const conflict = !isValide && g.existants.some(e => overlap(prop, e))
                  const source = (prop as any).source
                  const aero = g.aero

                  if (isEditing) return (
                    <div key={prop.id || `prop-${pi}`} className="p-3 rounded-lg border border-role-primary/50 bg-role-primary-soft/5 text-sm space-y-3">
                      {/* Type */}
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Type de surveillance</label>
                        <select value={editForm.type || prop.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value as Planning['type'] }))} className="form-select py-1.5 text-sm w-full">
                          {SURVEILLANCE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
                        </select>
                      </div>
                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Début</label>
                          <input type="date" value={editForm.date_debut as string || ''} onChange={e => setEditForm(f => ({ ...f, date_debut: e.target.value }))} className="form-input py-1.5 text-sm w-full" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Fin</label>
                          <input type="date" value={editForm.date_fin as string || ''} onChange={e => setEditForm(f => ({ ...f, date_fin: e.target.value }))} className="form-input py-1.5 text-sm w-full" />
                        </div>
                      </div>
                      {/* Domaines */}
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Domaines ({editForm.portee?.length || 0})</label>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {DOMAINES_SURVEILLANCE.filter(d => d.code !== 'AGA').map(d => (
                            <button key={d.code} onClick={() => toggleDomaine(d.code)}
                              className={`px-2 py-0.5 rounded text-xs transition-colors ${(editForm.portee || []).includes(d.code) ? 'bg-role-primary text-white' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'}`}>
                              {d.code}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Observations */}
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Observations (profil / IA)</label>
                        <textarea value={editForm.observations as string || ''} onChange={e => setEditForm(f => ({ ...f, observations: e.target.value }))} className="form-input py-1.5 text-sm w-full resize-none" rows={2} placeholder="Notes, justification, remarques..." />
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => { handleSaveEdit(prop.id!); handleValider(prop.id!) }} className="btn btn-sm btn-success gap-1 text-xs"><Save className="w-3.5 h-3.5" />Enregistrer & Valider</button>
                        <button onClick={handleCancelEdit} className="btn btn-sm btn-secondary gap-1 text-xs"><X className="w-3.5 h-3.5" />Annuler</button>
                      </div>
                    </div>
                  )

                  return (
                    <div key={prop.id || `prop-${pi}`} className={`p-3 rounded-lg border text-sm transition-colors ${
                      isValide ? 'border-success/50 bg-success/5' : conflict ? 'border-warning/50 bg-warning/5' : 'border-border bg-role-primary-soft/10'
                    }`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {TYPE_ICONS[prop.type] || <Calendar className="w-4 h-4" />}
                        <span className="font-medium">{TYPE_LABELS[prop.type] || prop.type}</span>
                        {source && <span className={`${SOURCE_CLS[source.type] || 'badge-outline'} text-xs`}>{SOURCE_LABEL[source.type] || ''}</span>}
                        <span className={`badge text-xs ${PRIORITE_BADGE[prop.priorite] || 'badge neutral'}`}>{PRIORITE_LABEL[prop.priorite] || prop.priorite}</span>
                        {isValide && <span className="badge success text-xs">Validée</span>}
                        {conflict && <span className="badge warning text-xs">Conflit</span>}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5">
                        <span>{prop.date_debut ? new Date(prop.date_debut).toLocaleDateString('fr-FR') : '?'} → {prop.date_fin ? new Date(prop.date_fin).toLocaleDateString('fr-FR') : '?'}</span>
                        {prop.portee?.length > 0 && <span className="font-medium text-foreground">{prop.portee.slice(0, 4).join(', ')}</span>}
                      </div>
                      {source?.raison && <p className="text-xs text-muted-foreground mt-1 italic">{source.raison}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => handleStartEdit(prop)} className="btn btn-sm btn-secondary gap-1 text-xs"><Edit2 className="w-3 h-3" />Ajuster</button>
                        {isValide ? (
                          <button onClick={() => handleUnvalider(prop.id!)} className="btn btn-sm btn-secondary gap-1 text-xs"><X className="w-3.5 h-3.5" />Annuler val.</button>
                        ) : (
                          <button onClick={() => handleValider(prop.id!)} className="btn btn-sm btn-success gap-1 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Valider</button>
                        )}
                        <button onClick={() => handleRefuser(prop.id!)} className="btn btn-sm btn-secondary gap-1 text-xs"><XCircle className="w-3.5 h-3.5" />Refuser</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
        </>)}
      </div>

      {/* Consolidation + Refus — seulement si novembre+ */}
      {isNovemberOrLater && (<>
      {showConsolidation && createPortal(
        <div className="modal-overlay" data-role={role} onClick={() => setShowConsolidation(false)}>
          <div className="modal-content max-w-5xl max-h-[92vh] overflow-y-auto p-0" onClick={e => e.stopPropagation()}>
            <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-success" data-role={role}>
              <div className="modal-header border-b border-border bg-role-primary-soft">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-success" /></div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Consolidation du Planning {anneeN1}</h2>
                    <p className="text-sm text-muted-foreground">{validatedProps.length} surveillance(s) — validation définitive</p>
                  </div>
                </div>
                <button onClick={() => setShowConsolidation(false)} className="modal-close"><X className="w-4 h-4" /></button>
              </div>

              <div className="p-6 space-y-5">
                <div className="alert alert-info"><div className="alert-content"><div className="alert-title">Confirmation irréversible</div><div className="alert-description">Ces {validatedProps.length} surveillances seront ajoutées au planning officiel {anneeN1}. Vérifiez chaque élément avant de confirmer.</div></div></div>

                {validatedProps.map(prop => {
                  const aero = aerodromes.find(a => a.id === prop.aerodrome_id)
                  const profil = profilsRisque[prop.aerodrome_id]
                  const source = (prop as any).source

                  return (
                    <div key={prop.id} className="card border-border hover:shadow-md transition-shadow">
                      <div className="card-header border-b border-border bg-gradient-to-r from-role-primary/5 to-transparent">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="code-oaci-badge">{aero?.code_oaci || '?'}</span>
                          <span className="font-semibold text-foreground">{aero?.nom || prop.aerodrome_id}</span>
                          {profil && (
                            <span className={`badge text-xs ${profil.score_global < 30 ? 'danger' : profil.score_global < 60 ? 'warning' : 'success'}`}>
                              Risque {profil.niveau} ({profil.score_global}/100)
                            </span>
                          )}
                          <span className={`badge text-xs ${PRIORITE_BADGE[prop.priorite] || 'badge neutral'}`}>
                            {PRIORITE_LABEL[prop.priorite] || prop.priorite}
                          </span>
                        </div>
                      </div>
                      <div className="card-content p-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
                          <div className="flex items-start gap-2">
                            <Target className="w-4 h-4 text-role-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Type</p>
                              <p className="text-sm font-medium">{TYPE_LABELS[prop.type] || prop.type}</p>
                              {source && <span className={`${SOURCE_CLS[source.type] || 'badge-outline'} text-xs mt-0.5`}>{SOURCE_LABEL[source.type] || ''}</span>}
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Calendar className="w-4 h-4 text-role-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Période</p>
                              <p className="text-sm font-medium">{prop.date_debut ? new Date(prop.date_debut).toLocaleDateString('fr-FR') : '?'} → {prop.date_fin ? new Date(prop.date_fin).toLocaleDateString('fr-FR') : '?'}</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Users className="w-4 h-4 text-role-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Équipe</p>
                              <p className="text-sm font-medium">{prop.equipe_ids?.length || 0} inspecteur(s)</p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Brain className="w-4 h-4 text-role-primary mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs text-muted-foreground">Observations</p>
                              <p className="text-sm font-medium">{((prop as any).observations || source?.raison || '—').slice(0, 80)}</p>
                            </div>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1.5">Domaines</p>
                          <div className="flex flex-wrap gap-1">
                            {(prop.portee || []).map(d => <span key={d} className="code-oaci-badge text-xs">{d}</span>)}
                            {(!prop.portee || prop.portee.length === 0) && <span className="text-xs text-muted-foreground italic">Tous les domaines</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <button onClick={() => setShowConsolidation(false)} className="btn btn-secondary">Retour</button>
                  <button onClick={handleConsolider} disabled={consolidating} className="btn btn-success gap-2">
                    <CheckCircle2 className="w-4 h-4" />{consolidating ? 'Ajout en cours...' : `Confirmer l'ajout de ${validatedProps.length} planning(s)`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Refus modal */}
      {refusModal && createPortal(
        <div className="modal-overlay" data-role={role} onClick={() => setRefusModal(null)}>
          <div className="modal-content max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <div className="modal-title flex items-center gap-2"><XCircle className="w-4 h-4 text-danger" />Motif du refus</div>
              <button onClick={() => setRefusModal(null)} className="modal-close"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              {MOTIFS_REFUS.map(m => (
                <button key={m} onClick={() => setRefusModal({ ...refusModal, motif: m })}
                  className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${refusModal.motif === m ? 'bg-role-primary-soft border border-role-primary/30' : 'hover:bg-role-primary-soft/20'}`}>{m}</button>
              ))}
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <button onClick={() => setRefusModal(null)} className="btn btn-secondary btn-sm">Annuler</button>
                <button onClick={confirmRefus} className="btn btn-danger btn-sm gap-1"><XCircle className="w-3 h-3" />Confirmer le refus</button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}
      </>)}
    </div>
  )
}
