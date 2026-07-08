'use client'

import { useMemo } from 'react'
import { ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { CloudRain, Calendar, Sun, AlertTriangle, Shield } from 'lucide-react'
import { detectAllTriggers } from '@/lib/risque/triggers'

interface Props {
  profil: ProfilRisque
  nbEcartsCritiques: number
}

const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

const RISQUES_SAISONNIERS: Record<number, string[]> = {
  0: ['Harmattan — visibilité réduite', 'Poussière et FOD sur piste'],
  1: ['Pic harmattan — poussière', 'Vents secs — FOD'],
  2: ['Transition saisonnière', 'Début vents de sable'],
  3: ['Orages isolés', 'Birdstrike modéré'],
  4: ['Conditions stables', 'FOD modéré'],
  5: ['Début saison des pluies', 'Piste glissante'],
  6: ['Pic pluies — contamination piste', 'Risque foudre', 'FOD très élevé'],
  7: ['Pluies — inondations localisées', 'Birdstrike accru (migration)'],
  8: ['Fin pluies — herbes hautes', 'Pic birdstrike', 'Risque animalier'],
  9: ['Vérification drainage', 'Birdstrike en baisse'],
  10: ['Saison sèche — FOD sable', 'Brume sèche'],
  11: ['Conditions stables', 'Risque modéré'],
}

function getSeasonIcon(month: number): React.ElementType {
  if (month >= 6 && month <= 8) return CloudRain
  if (month >= 11 || month <= 1) return Sun
  return Calendar
}

export function ExogenousFactorsCard({ profil, nbEcartsCritiques }: Props) {
  const now = new Date()
  const month = now.getMonth()
  const SeasonIcon = getSeasonIcon(month)

  const triggers = useMemo(() => {
    const t = detectAllTriggers({
      nbEcartsCritiques,
      nbDelaisDepasses: 0,
      nbIncidentsRecents: 0,
      moisDepuisChangement: null,
      joursDepuisDerniereInspection: null,
    })
    return t
  }, [nbEcartsCritiques])

  const saisonActive = triggers.find(t => t.type === 'saison_pluies')?.actif ?? false
  const risquesMois = RISQUES_SAISONNIERS[month] || []

  return (
    <Card variant="role" title="Facteurs exogènes" icon={<Calendar className="w-4 h-4" />}>
      <div className="space-y-3">
        {/* Mois et saison */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${saisonActive ? 'bg-danger/10' : 'bg-primary-soft'}`}>
            <SeasonIcon className={`w-5 h-5 ${saisonActive ? 'text-danger' : 'text-role-primary'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">{MOIS_LABELS[month]}</span>
              {saisonActive && <span className="badge danger text-[10px] animate-pulse">Saison des pluies</span>}
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {risquesMois.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-muted/30 text-foreground border border-border/50">
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Triggers actifs */}
        {triggers.filter(t => t.actif).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-foreground uppercase tracking-wide font-semibold">Facteurs actifs</p>
            {triggers.filter(t => t.actif).map(t => (
              <div key={t.type} className="flex items-center gap-2 text-xs text-foreground py-1">
                <AlertTriangle className={`w-3 h-3 shrink-0 ${t.type === 'ecart_critique' ? 'text-danger' : 'text-warning'}`} />
                <span>{t.description}</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">×{t.poids.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}

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
