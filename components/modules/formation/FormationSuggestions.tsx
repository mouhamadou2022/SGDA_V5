// components/modules/formation/FormationSuggestions.tsx
'use client'

import { useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { AlertTriangle, CheckCircle2, Lightbulb, Calendar, User, FileText, Sparkles, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/card'

const PLANNING_PERIODE = ['T1 2026', 'T2 2026', 'T3 2026', 'T4 2026', 'T1 2027']

interface Props { userRole: string }

export function FormationSuggestions({ userRole }: Props) {
  const inspecteurs = useAppStore(s => s.inspecteurs)
  const kitDocuments = useAppStore(s => s.kitDocuments)
  const formations = useAppStore(s => s.formations)
  const [view, setView] = useState<'suggestions' | 'planning'>('suggestions')
  const [selectedInsp, setSelectedInsp] = useState<string>('tous')
  const [prisEnCompte, setPrisEnCompte] = useState<Set<string>>(new Set())

  const suggestions = useMemo(() => {
    const result: Array<{ id: string; inspecteur: string; titre: string; raison: string; priorite: 'CRITIQUE' | 'HAUTE' | 'MOYENNE'; domaine: string }> = []

    inspecteurs.filter(i => !i.deleted_at).forEach(ins => {
      const nom = `${ins.prenom} ${ins.nom}`

      // Compétences faibles → formation requise
      ;(ins.competences || []).forEach(c => {
        const niveau = typeof c.niveau === 'number' ? c.niveau : parseInt(c.niveau as any) || 1
        if (niveau <= 2) {
          result.push({
            id: `comp-${ins.id}-${c.domaine}`, inspecteur: nom,
            titre: `Formation ${c.domaine}`, raison: `Niveau ${niveau}/5 — mise à niveau requise`,
            priorite: niveau <= 1 ? 'CRITIQUE' : 'HAUTE', domaine: c.domaine,
          })
        }
      })

      // Nouvelles normes OACI dans le kit → formation suggérée
      const nouvellesNormes = kitDocuments.filter(d =>
        d.type_document_oaci && d.domaines?.some(dd => (ins.competences || []).some(c => c.domaine === dd))
      )
      nouvellesNormes.forEach(doc => {
        const id = `kit-${ins.id}-${doc.id}`
        if (!result.some(r => r.id === id)) {
          result.push({
            id, inspecteur: nom, titre: `Nouveau: ${doc.nom}`,
            raison: `${doc.type_document_oaci} — ${doc.version} — ${doc.date_revision?.split('T')[0] || ''}`,
            priorite: 'MOYENNE', domaine: doc.domaines?.[0] || 'Général',
          })
        }
      })
    })

    return result.sort((a, b) => {
      const order = { CRITIQUE: 0, HAUTE: 1, MOYENNE: 2 }
      return order[a.priorite] - order[b.priorite]
    })
  }, [inspecteurs, kitDocuments])

  const actifs = inspecteurs.filter(i => !i.deleted_at)
  const filtered = selectedInsp === 'tous' ? suggestions : suggestions.filter(s => {
    const ins = actifs.find(i => `${i.prenom} ${i.nom}` === s.inspecteur)
    return ins?.id === selectedInsp
  })
  const nonPrises = filtered.filter(s => !prisEnCompte.has(s.id))

  // Planning annuel par inspecteur
  const planningParInsp = useMemo(() => {
    const map: Record<string, { inspecteur: string; formations: string[]; periode: string; priorite: string }[]> = {}
    actifs.forEach(ins => {
      const nom = `${ins.prenom} ${ins.nom}`
      const insSuggestions = suggestions.filter(s => s.inspecteur === nom)
      if (insSuggestions.length === 0) return
      const hasCritical = insSuggestions.some(s => s.priorite === 'CRITIQUE')
      const hasHaute = insSuggestions.some(s => s.priorite === 'HAUTE')
      map[ins.id] = [
        { inspecteur: nom, formations: insSuggestions.filter(s => s.priorite === 'CRITIQUE' || s.priorite === 'HAUTE').map(s => s.titre), periode: 'T1 2026', priorite: hasCritical ? 'CRITIQUE' : 'HAUTE' },
        { inspecteur: nom, formations: insSuggestions.filter(s => s.priorite === 'MOYENNE').map(s => s.titre), periode: 'T2 2026', priorite: 'MOYENNE' },
      ]
    })
    return map
  }, [actifs, suggestions])

  return (
    <div className="space-y-4 animate-fade-up" data-role={userRole}>
      <div className="view-toggle">
        <button className={view === 'suggestions' ? 'active' : ''} onClick={() => setView('suggestions')}>
          <Lightbulb className="w-4 h-4" /> Suggestions
        </button>
        <button className={view === 'planning' ? 'active' : ''} onClick={() => setView('planning')}>
          <Calendar className="w-4 h-4" /> Planning annuel
        </button>
      </div>

      {view === 'suggestions' && (
        <div className="space-y-3">
          <select className="form-select" value={selectedInsp} onChange={e => setSelectedInsp(e.target.value)}>
            <option value="tous">Tous les inspecteurs</option>
            {actifs.map(i => <option key={i.id} value={i.id}>{i.prenom} {i.nom}</option>)}
          </select>

          {nonPrises.length === 0 && (
            <div className="text-center py-10"><CheckCircle2 className="w-10 h-10 text-success mx-auto mb-2" /><p className="font-medium">Toutes les formations sont planifiées</p></div>
          )}

          {nonPrises.map(s => (
            <div key={s.id} className={`card p-4 border-l-4 ${s.priorite === 'CRITIQUE' ? 'border-l-danger' : s.priorite === 'HAUTE' ? 'border-l-warning' : 'border-l-role-primary'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge ${s.priorite === 'CRITIQUE' ? 'danger' : s.priorite === 'HAUTE' ? 'warning' : 'primary'}`}>{s.priorite}</span>
                    <span className="font-medium text-sm">{s.titre}</span>
                  </div>
                  <p className="text-xs text-muted-foreground"><User className="w-3 h-3 inline mr-1" />{s.inspecteur} — {s.raison}</p>
                </div>
                <button className="btn btn-sm btn-primary shrink-0" onClick={() => setPrisEnCompte(prev => new Set(prev).add(s.id))}><Sparkles className="w-3.5 h-3.5" /> Planifier</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'planning' && (
        <div className="space-y-4">
          <p className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="w-4 h-4 text-role-primary" />Plan annuel de formation des inspecteurs</p>
          {actifs.map(ins => {
            const plan = planningParInsp[ins.id]
            if (!plan) return null
            return (
              <Card key={ins.id} className="overflow-hidden border-border"
                heading={<div className="flex items-center gap-2"><User className="w-4 h-4 text-role-primary" /><span className="font-semibold">{ins.prenom} {ins.nom}</span><span className="text-xs text-muted-foreground">{ins.service}</span></div>}
              >
                  <table className="table table-compact w-full">
                    <thead><tr><th>Période</th><th>Formation</th><th>Priorité</th></tr></thead>
                    <tbody>
                      {plan.map((p, i) => (
                        <tr key={i}>
                          <td className="text-xs font-medium">{p.periode}</td>
                          <td className="text-xs">{p.formations.join(', ') || '—'}</td>
                          <td><span className={`badge ${p.priorite === 'CRITIQUE' ? 'danger' : p.priorite === 'HAUTE' ? 'warning' : 'primary'}`}>{p.priorite}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </Card>
            )
          })}
          {Object.keys(planningParInsp).length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">Aucun besoin de formation identifié</div>
          )}
        </div>
      )}
    </div>
  )
}

export default FormationSuggestions