// components/modules/formation/EcheanceAlert.tsx
'use client'

import { useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Calendar, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { Card } from '@/components/ui/card'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

interface Props { userRole: string }

function groupColor(jours: number): string {
  if (jours < 30) return 'bg-danger-soft border-danger'
  if (jours < 60) return 'bg-warning-soft border-warning'
  return 'bg-role-primary-soft border-role-primary'
}

export function EcheanceAlert({ userRole }: Props) {
  const inspecteurs = useAppStore(s => s.inspecteurs)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const [resolus, setResolus] = useState<Set<string>>(new Set())

  const alertes = useMemo(() => {
    const result: Array<{ id: string; inspecteur: string; typeFormation: string; joursRestants: number; priorite: 'rouge' | 'orange' | 'jaune' }> = []
    const now = Date.now()

    inspecteurs.filter(i => !i.deleted_at).forEach(ins => {
      ;(ins.competences || []).forEach(c => {
        const niveau = typeof c.niveau === 'number' ? c.niveau : parseInt(c.niveau as any) || 1
        if (niveau <= 2) {
          const jours = niveau <= 1 ? 15 : 45
          result.push({
            id: `echeance-${ins.id}-${c.domaine}`, inspecteur: `${ins.prenom} ${ins.nom}`,
            typeFormation: `${c.domaine} — niveau ${niveau}/5`, joursRestants: jours,
            priorite: jours < 30 ? 'rouge' : jours < 60 ? 'orange' : 'jaune',
          })
        }
      })
    })

    Object.values(profilsRisque || {}).forEach(profil => {
      if (profil && profil.c1 < 30) {
        result.push({ id: `risk-${profil.aerodrome_id}`, inspecteur: `Aérodrome ${profil.aerodrome_id}`, typeFormation: 'Renforcement SGS — C1 critique', joursRestants: 30, priorite: 'rouge' })
      }
    })

    return result.sort((a, b) => a.joursRestants - b.joursRestants).slice(0, 20)
  }, [inspecteurs, profilsRisque])

  const nonResolus = alertes.filter(a => !resolus.has(a.id))
  const rouge = nonResolus.filter(a => a.priorite === 'rouge')
  const orange = nonResolus.filter(a => a.priorite === 'orange')
  const jaune = nonResolus.filter(a => a.priorite === 'jaune')

  if (alertes.length === 0 || nonResolus.length === 0) {
    return (
      <Card variant="alert" alertBg="success" className="animate-fade-in">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-success" />
          <div><p className="font-semibold text-success">Toutes les formations sont à jour</p><p className="text-small text-muted-foreground">Aucune échéance critique.</p></div>
        </div>
      </Card>
    )
  }

  const renderGroupe = (liste: typeof alertes, titre: string, icon?: React.ReactNode) => {
    if (liste.length === 0) return null
    return (
      <div className="space-y-2">
        <p className="font-semibold text-small flex items-center gap-2">{icon}{titre} ({liste.length})</p>
        {liste.map(a => (
          <div key={a.id} className={`card p-3 border-l-4 ${groupColor(a.joursRestants)}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${a.joursRestants < 30 ? 'danger' : a.joursRestants < 60 ? 'warning' : 'neutral'}`}>{a.joursRestants}j</span>
                  <span className="font-medium text-small">{a.inspecteur}</span>
                </div>
                <p className="text-xs text-muted-foreground">{a.typeFormation}</p>
              </div>
              <button className="btn btn-sm btn-ghost shrink-0" onClick={() => setResolus(prev => new Set(prev).add(a.id))}><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {renderGroupe(rouge, 'Urgent — moins de 30 jours', <AlertTriangle className="h-4 w-4 text-danger" />)}
      {renderGroupe(orange, 'Prioritaire — 30 à 60 jours', <AlertTriangle className="h-4 w-4 text-warning" />)}
      {renderGroupe(jaune, 'À surveiller — 60 à 90 jours', <Calendar className="h-4 w-4 text-role-primary" />)}
    </div>
  )
}

export default EcheanceAlert