// components/modules/planning/PlanningNPlus1.tsx
// Deux colonnes : planning existant (gauche) | propositions (droite)
// Validation avec feedback, badge N+1 pulsé, header AerodromeDetail
'use client'

import React, { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore, Planning } from '@/lib/store'
import {
  Calendar, CheckCircle2, XCircle, X, TrendingUp, AlertTriangle,
  Shield, Target, Zap
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
const PRIORITE_BADGE: Record<string, string> = { critique: 'badge danger', haute: 'badge warning', moyenne: 'badge primary', basse: 'badge success' }
const PRIORITE_LABEL: Record<string, string> = { critique: 'Critique', haute: 'Élevée', moyenne: 'Moyen', basse: 'Faible' }

export default function PlanningNPlus1({ onClose, userRole = 'admin' }: Props) {
  const aerodromes = useAppStore(s => s.aerodromes)
  const plannings = useAppStore(s => s.plannings)
  const propositionsN1 = useAppStore(s => s.propositionsN1)
  const setPropositionsN1 = useAppStore(s => s.setPropositionsN1)
  const genererPlanningN1 = useAppStore(s => s.genererPlanningN1)
  const validerPropositionN1 = useAppStore(s => s.validerPropositionN1)
  const refuserPropositionN1 = useAppStore(s => s.refuserPropositionN1)
  const user = useAppStore(s => s.user)

  const anneeN1 = new Date().getFullYear() + 1
  const [generating, setGenerating] = useState(false)
  const [selectedAero, setSelectedAero] = useState('')
  const [refusModal, setRefusModal] = useState<{ id: string; motif: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const planningsN1 = useMemo(() =>
    plannings.filter(p => p.annee_cible === anneeN1 && !p.deleted_at),
    [plannings, anneeN1]
  )

  const grouped = useMemo(() => {
    const map = new Map<string, { aero: any; existants: Planning[]; propositions: Planning[] }>()
    for (const a of aerodromes) { if (!a.deleted_at) map.set(a.id, { aero: a, existants: [], propositions: [] }) }
    for (const p of planningsN1) { const g = map.get(p.aerodrome_id); if (g) g.existants.push(p) }
    for (const p of propositionsN1) {
      const g = map.get(p.aerodrome_id)
      if (g) g.propositions.push(p)
      else { const a = aerodromes.find(x => x.id === p.aerodrome_id); if (a) map.set(p.aerodrome_id, { aero: a, existants: [], propositions: [p] }) }
    }
    return Array.from(map.values()).filter(g => selectedAero === '' || g.aero.id === selectedAero)
  }, [aerodromes, planningsN1, propositionsN1, selectedAero])

  const stats = useMemo(() => ({
    total: propositionsN1.length,
    carryOver: propositionsN1.filter(p => (p as any).source?.type?.startsWith('carryover')).length,
    certif: propositionsN1.filter(p => (p as any).source?.type === 'certification_renouvellement').length,
    conflits: propositionsN1.filter(p => planningsN1.some(pe => pe.aerodrome_id === p.aerodrome_id && overlap(p, pe))).length,
  }), [propositionsN1, planningsN1])

  const handleGenerer = async () => {
    setGenerating(true)
    try {
      const toutes: Planning[] = []
      for (const g of grouped) { const props = genererPlanningN1(g.aero.id, anneeN1); if (props?.length) toutes.push(...props) }
      setPropositionsN1(toutes)
    } catch (e) { console.error('[N+1] Erreur:', e) } finally { setGenerating(false) }
  }

  const handleValider = async (id: string) => { setIsLoading(true); try { await validerPropositionN1(id) } catch {} finally { setIsLoading(false) } }
  const handleRefuser = (id: string) => setRefusModal({ id, motif: '' })
  const confirmRefus = () => { if (refusModal) { refuserPropositionN1(refusModal.id, refusModal.motif || MOTIFS_REFUS[0]); setRefusModal(null) } }

  const role = userRole || user?.role || ''

  const overlap = (a: Planning, b: Planning) => a.aerodrome_id === b.aerodrome_id
    && new Date(a.date_debut).getTime() < new Date(b.date_fin).getTime()
    && new Date(b.date_debut).getTime() < new Date(a.date_fin).getTime()

  return (
    <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary" data-role={role}>
      <div className="modal-header border-b border-border bg-role-primary-soft">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center text-white"><TrendingUp className="w-5 h-5" /></div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Planning N+1 — {anneeN1}</h2>
            <p className="text-sm text-muted-foreground">{propositionsN1.length > 0 ? `${propositionsN1.length} propositions · ${stats.carryOver} carry-over · ${stats.certif} certif` : 'Générez le planning'}</p>
          </div>
        </div>
        {onClose && <button onClick={onClose} className="btn btn-secondary gap-2"><X className="h-4 w-4" />Fermer</button>}
      </div>

      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={handleGenerer} disabled={generating} className="btn btn-primary gap-2">
            <Zap className="w-4 h-4" />{generating ? 'Génération...' : propositionsN1.length > 0 ? `Régénérer ${anneeN1}` : `Générer ${anneeN1}`}
          </button>
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
          </div>
        )}

        {propositionsN1.length === 0 && (
          <div className="text-center py-12 text-muted-foreground"><Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Aucune proposition pour {anneeN1}</p></div>
        )}

        {grouped.map(g => (
          <div key={g.aero.id} className="border border-border rounded-xl overflow-hidden">
            <div className="bg-role-primary-soft/30 px-4 py-2 flex items-center gap-3">
              <span className="code-oaci-badge text-sm">{g.aero.code_oaci}</span>
              <span className="font-semibold text-sm text-foreground">{g.aero.nom}</span>
              <span className="text-sm text-muted-foreground ml-auto">{g.existants.length} planning(s) · {g.propositions.length} proposition(s)</span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="p-4 space-y-2">
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
              <div className="p-4 space-y-2">
                <p className="text-sm font-semibold text-muted-foreground uppercase">Propositions N+1</p>
                {g.propositions.length === 0 ? <p className="text-sm text-muted-foreground italic">Aucune</p> : g.propositions.map((prop, pi) => {
                  const conflict = overlap(prop, g.existants.find(e => e.aerodrome_id === prop.aerodrome_id) ? [g.existants.find(e => e.aerodrome_id === prop.aerodrome_id)!] : [])
                  const source = (prop as any).source
                  return (
                    <div key={prop.id || `prop-${pi}`} className={`p-3 rounded-lg border text-sm ${conflict ? 'border-warning/50 bg-warning/5' : 'border-border bg-role-primary-soft/10'}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {TYPE_ICONS[prop.type] || <Calendar className="w-4 h-4" />}
                        <span className="font-medium">{TYPE_LABELS[prop.type] || prop.type}</span>
                        {source && <span className={`${SOURCE_CLS[source.type] || 'badge-outline'} text-xs`}>{SOURCE_LABEL[source.type] || ''}</span>}
                        <span className={`badge text-xs ${PRIORITE_BADGE[prop.priorite] || 'badge neutral'}`}>{PRIORITE_LABEL[prop.priorite] || prop.priorite}</span>
                        {conflict && <span className="badge warning text-xs">Conflit</span>}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1.5">
                        <span>{prop.date_debut ? new Date(prop.date_debut).toLocaleDateString('fr-FR') : '?'} → {prop.date_fin ? new Date(prop.date_fin).toLocaleDateString('fr-FR') : '?'}</span>
                        {prop.portee?.length > 0 && <span className="font-medium text-foreground">{prop.portee.slice(0, 3).join(', ')}</span>}
                      </div>
                      {source?.raison && <p className="text-sm text-muted-foreground mt-1.5 italic">{source.raison}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => handleValider(prop.id!)} disabled={isLoading} className="btn btn-sm btn-success gap-1 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Valider</button>
                        <button onClick={() => handleRefuser(prop.id!)} disabled={isLoading} className="btn btn-sm btn-secondary gap-1 text-xs"><XCircle className="w-3.5 h-3.5" />Refuser</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

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
    </div>
  )
}
