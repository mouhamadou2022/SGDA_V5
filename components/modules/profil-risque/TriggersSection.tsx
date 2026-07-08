'use client'

import { useMemo } from 'react'
import { ProfilRisque } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { AlertTriangle, Bell, Clock, CloudRain, RefreshCw, UserPlus, Activity } from 'lucide-react'
import { detectAllTriggers, computeTriggersImpact } from '@/lib/risque/triggers'

interface Props {
  profil: ProfilRisque
  nbEcartsCritiques: number
}

const TRIGGER_CONFIG: Record<string, { icon: React.ElementType; label: string }> = {
  ecart_critique: { icon: AlertTriangle, label: 'Écarts critiques' },
  delai_expire: { icon: Clock, label: 'Délais expirés' },
  incident: { icon: Activity, label: 'Incidents récents' },
  changement_exploitant: { icon: UserPlus, label: 'Changement exploitant' },
  saison_pluies: { icon: CloudRain, label: 'Saison des pluies' },
  post_inspection: { icon: RefreshCw, label: 'Post-inspection' },
}

const LEAD_LAG_INSIGHTS: Record<string, string> = {
  ecart_critique: 'Les écarts critiques non résolus dégradent le score C4 et, en cascade, le score global dans les 30 à 60 jours.',
  delai_expire: 'Les délais expirés sur les PAC indiquent une perte de réactivité — C2 est généralement le premier impacté.',
  incident: 'Les incidents récents sont un indicateur avancé fiable : une hausse des incidents précède une baisse du score global de 15-30 jours.',
  changement_exploitant: 'Un changement d\'exploitant introduit une période de vulnérabilité de 6 mois — C1 (maturité SGS) en pâtit le premier.',
  saison_pluies: 'Facteur exogène majeur au Sénégal : juillet-septembre voit une hausse des FOD, birdstrikes et infiltrations.',
  post_inspection: 'Période post-inspection : les écarts identifiés sont en cours de traitement, le score peut temporairement baisser avant de s\'améliorer.',
}

function TriggerIcon({ type, active }: { type: string; active: boolean }) {
  const config = TRIGGER_CONFIG[type]
  if (!config) return null
  const Icon = config.icon
  return <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-danger' : 'text-muted-foreground'}`} />
}

export function TriggersSection({ profil, nbEcartsCritiques }: Props) {
  const allEcarts = useAppStore(s => s.ecarts)
  const ecartsAerodrome = useMemo(
    () => allEcarts?.filter(e => e.aerodrome_id === profil.aerodrome_id) ?? [],
    [allEcarts, profil.aerodrome_id]
  )

  const { triggers, impact } = useMemo(() => {
    const nbDelais = ecartsAerodrome.filter(e => {
      const d = (e as any).date_limite
      return d && new Date(d) < new Date() && e.statut !== 'cloture'
    }).length

    const t = detectAllTriggers({
      nbEcartsCritiques,
      nbDelaisDepasses: nbDelais,
      nbIncidentsRecents: 0,
      moisDepuisChangement: null,
      joursDepuisDerniereInspection: null,
    })
    const i = computeTriggersImpact(t)
    return { triggers: t, impact: i }
  }, [nbEcartsCritiques, ecartsAerodrome])

  const actifs = triggers.filter(t => t.actif)
  const inactifs = triggers.filter(t => !t.actif)

  const impactLevel = impact >= 1.5 ? 'critique' : impact >= 1.2 ? 'eleve' : impact >= 1.0 ? 'moyen' : 'normal'

  const impactColor = impactLevel === 'critique' ? 'var(--color-danger)' : impactLevel === 'eleve' ? 'var(--color-warning)' : impactLevel === 'moyen' ? 'var(--color-primary)' : 'var(--color-success)'

  return (
    <Card
      variant={impactLevel === 'critique' || impactLevel === 'eleve' ? 'alert' : 'role'}
      alertBg={impactLevel === 'critique' ? 'danger' : impactLevel === 'eleve' ? 'warning' : undefined}
      title="Indicateurs avancés"
      icon={<Bell className="w-4 h-4" />}
      badge={actifs.length > 0 ? <span className={`badge ${impactLevel === 'critique' ? 'danger' : impactLevel === 'eleve' ? 'warning' : 'primary'} text-[10px]`}>Impact {impact.toFixed(2)}×</span> : undefined}
    >
      <div className="space-y-3">
        {/* Baromètre impact */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="progress h-2">
              <div className="progress-bar" style={{ width: `${Math.min(100, (impact - 1) * 100)}%`, background: impactColor }} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs font-mono font-bold" style={{ color: impactColor }}>×{impact.toFixed(2)}</span>
            <p className="text-[10px] text-muted-foreground">Multiplicateur</p>
          </div>
        </div>

        {/* Liste des triggers */}
        <div className="space-y-0.5">
          <p className="text-[10px] text-foreground uppercase tracking-wide font-semibold mb-1">
            Déclencheurs ({actifs.length}/{triggers.length} actifs)
          </p>

          {actifs.map(t => {
            const config = TRIGGER_CONFIG[t.type]
            return (
              <div key={t.type} className="flex items-start gap-2 p-2 rounded-lg bg-danger/5 border border-danger/10">
                <TriggerIcon type={t.type} active />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{config?.label || t.type}</span>
                    <span className="badge danger text-[10px]">Actif</span>
                  </div>
                  <p className="text-[10px] text-foreground mt-0.5">{t.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 italic leading-relaxed">
                    {LEAD_LAG_INSIGHTS[t.type] || ''}
                  </p>
                </div>
              </div>
            )
          })}

          {inactifs.map(t => {
            const config = TRIGGER_CONFIG[t.type]
            return (
              <div key={t.type} className="flex items-center gap-2 p-2 rounded-lg opacity-60">
                <TriggerIcon type={t.type} active={false} />
                <span className="text-xs text-foreground">{config?.label || t.type}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{t.description}</span>
              </div>
            )
          })}
        </div>

        {/* Résumé actions */}
        {actifs.length > 0 && (
          <div className="p-2 rounded-lg bg-muted/20 border border-border text-xs text-foreground leading-relaxed">
            <span className="font-semibold">Action suggérée :</span>{' '}
            {impact >= 1.5
              ? 'Multiplicateur critique — activation immédiate du plan de surveillance renforcée. Inspection inopinée recommandée.'
              : impact >= 1.2
                ? 'Surveillance renforcée conseillée — les déclencheurs actifs augmentent le risque de dégradation du profil.'
                : 'Surveillance normale — maintenir la fréquence de surveillance programmée.'}
          </div>
        )}
      </div>
    </Card>
  )
}
