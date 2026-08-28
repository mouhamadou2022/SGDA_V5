'use client'

import { useMemo, useState, useEffect } from 'react'
import { ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { CloudRain, Calendar, Sun, Shield, Sparkles, Loader2 } from 'lucide-react'
import { detectAllTriggers } from '@/lib/risque/triggers'
import { expliquerRisquesSaisoniersEnClair, MOIS_LABELS, RISQUES_SAISONNIERS } from '@/lib/ia/facteursExplicationIA'

interface Props {
  profil: ProfilRisque
  nbEcartsCritiques: number
}

export function ExogenousFactorsCard({ profil, nbEcartsCritiques }: Props) {
  const now = new Date()
  const month = now.getMonth()

  const saisonActive = useMemo(() => {
    const t = detectAllTriggers({
      nbEcartsCritiques,
      nbDelaisDepasses: 0,
      nbIncidentsRecents: 0,
      moisDepuisChangement: null,
      joursDepuisDerniereInspection: null,
    })
    return t.find(x => x.type === 'saison_pluies')?.actif ?? false
  }, [nbEcartsCritiques])

  // Risques saisonniers expliqués par IA (fallback déterministe immédiat sinon)
  const [risques, setRisques] = useState<string[]>(() => RISQUES_SAISONNIERS[month] ?? [])
  const [iaEnCours, setIaEnCours] = useState(true)
  const [iaActif, setIaActif] = useState(false)
  const [prevInputs, setPrevInputs] = useState({ month, profil })
  if (prevInputs.month !== month || prevInputs.profil !== profil) {
    setPrevInputs({ month, profil })
    setIaEnCours(true)
    setIaActif(false)
    setRisques(RISQUES_SAISONNIERS[month] ?? [])
  }

  useEffect(() => {
    let actif = true
    expliquerRisquesSaisoniersEnClair(month, profil).then((res) => {
      if (!actif) return
      setRisques(res.risques)
      setIaActif(!res.fallbackIA)
      setIaEnCours(false)
    }).catch(() => {
      if (!actif) return
      setIaEnCours(false)
    })
    return () => { actif = false }
  }, [month, profil])

  return (
    <Card variant="role" title="Facteurs exogènes" icon={<Calendar className="w-4 h-4" />}>
      <div className="space-y-3">
        {/* Mois et saison */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${saisonActive ? 'bg-danger/10' : 'bg-primary-soft'}`}>
            {month >= 6 && month <= 8
              ? <CloudRain className={`w-5 h-5 ${saisonActive ? 'text-danger' : 'text-role-primary'}`} />
              : month >= 11 || month <= 1
                ? <Sun className={`w-5 h-5 ${saisonActive ? 'text-danger' : 'text-role-primary'}`} />
                : <Calendar className={`w-5 h-5 ${saisonActive ? 'text-danger' : 'text-role-primary'}`} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{MOIS_LABELS[month]}</span>
              {saisonActive && <span className="badge danger text-[10px] animate-pulse">Saison des pluies</span>}
            </div>
            {iaEnCours ? (
              <p className="flex items-center gap-1.5 text-[11px] text-primary mt-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Risques saisonniers en analyse…
              </p>
            ) : (
              <div className="flex flex-wrap gap-1 mt-1">
                {risques.map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-muted/30 text-foreground border border-border/50">
                    {r}
                  </span>
                ))}
              </div>
            )}
            {!iaEnCours && iaActif && risques.length > 0 && (
              <p className="flex items-center gap-1.5 text-[10px] text-primary mt-1">
                <Sparkles className="w-3 h-3" /> Langage clair IA
              </p>
            )}
          </div>
        </div>

        {/* Profil infrastructure */}
        {profil.infrastructure && (
          <div className="flex items-center gap-2 pt-2 border-t border-border text-xs text-foreground">
            <Shield className="w-3 h-3 shrink-0 text-role-primary" />
            <span>
              {profil.infrastructure.type_entite.replace('_', ' ')} · {profil.infrastructure.horaires === 'h24' ? 'H24' : 'Jour'} · 
              Cat. {profil.infrastructure.categorie_sslia}
            </span>
          </div>
        )}
      </div>
    </Card>
  )
}
