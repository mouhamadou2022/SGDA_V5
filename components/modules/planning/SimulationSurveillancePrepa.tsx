// components/modules/planning/SimulationSurveillancePrepa.tsx
// Onglet « Simulation » de la modale de préparation de surveillance.
// Réutilise le moteur lib/ia/simulationSurveillance (lecture seule) pour
// projeter la surveillance planifiée : checklist SA/NS/NA/NV pré-remplie,
// écarts probables, taux de conformité estimé — sans créer ni modifier de donnée.

'use client'

import { useMemo, useState } from 'react'
import { ClipboardCheck, Download, AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { type Aerodrome, type Ecart, type EvenementSecurite, type KitChecklistItemGenere, type Planning, type ProfilRisque, type ScoreHistoryPoint, type Utilisateur } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { simulerSurveillance, construireRapportSimulation, type ResultatSimulation } from '@/lib/ia/simulationSurveillance'

interface Props {
  planning: Planning
  aerodrome?: Aerodrome | null
  profil?: ProfilRisque | null
  ecarts: Ecart[]
  evenements: EvenementSecurite[]
  historique: ScoreHistoryPoint[]
  kitItems: KitChecklistItemGenere[]
  utilisateurs: Utilisateur[]
}

const BADGE_NIVEAU: Record<string, string> = {
  critique: 'danger', eleve: 'warning', moyen: 'primary', faible: 'success',
}

export default function SimulationSurveillancePrepa({
  planning,
  aerodrome,
  profil,
  ecarts,
  evenements,
  historique,
  kitItems,
  utilisateurs,
}: Props) {
  const [resultat, setResultat] = useState<ResultatSimulation | null>(null)
  const [telechargement, setTelechargement] = useState<'idle' | 'encours'>('idle')

  const evenementsReels = useMemo(
    () => evenements.filter(e => e.aerodrome_id === planning.aerodrome_id).length,
    [evenements, planning.aerodrome_id],
  )

  const ecartsAerodrome = useMemo(
    () => ecarts.filter(e => e.aerodrome_id === planning.aerodrome_id),
    [ecarts, planning.aerodrome_id],
  )

  const portee = planning.portee?.length ? planning.portee : ['AGA']
  const typeSurveillance = planning.type || 'programmee'
  const prefixNumero = typeSurveillance === 'certification' ? 'CERT'
    : typeSurveillance === 'homologation' ? 'HMG'
    : typeSurveillance === 'inopine' || typeSurveillance === 'inopinee' ? 'INOP'
    : 'QSC'

  const lancerSimulation = () => {
    const r = simulerSurveillance({
      aerodrome,
      profil,
      ecartsReels: ecartsAerodrome,
      evenementsReels,
      historique,
      kitItems,
      typeSurveillance,
      portee,
      typeEntite: aerodrome?.type_entite ?? 'aerodrome',
      utilisateurs,
      prefixNumero,
    })
    setResultat(r)
  }

  const telechargerRapport = async () => {
    if (!resultat) return
    setTelechargement('encours')
    try {
      const { batirRapportSurveillancePdf } = await import('@/lib/services/rapportSurveillancePdf')
      const { rapport } = construireRapportSimulation({
        aerodrome,
        profil,
        ecartsReels: ecartsAerodrome,
        evenementsReels,
        historique,
        kitItems,
        typeSurveillance,
        portee,
        typeEntite: aerodrome?.type_entite ?? 'aerodrome',
        utilisateurs,
        prefixNumero,
      })
      const blob = await batirRapportSurveillancePdf(rapport)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${rapport.reference}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setTelechargement('idle')
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border p-3 bg-role-primary-soft/30">
        <p className="text-xs text-foreground">
          <span className="font-semibold">Simulation AERORISQ</span> — projette la surveillance « {typeSurveillance.replace(/_/g, ' ')} » sur la base des données réelles (profil C1-C5, {ecartsAerodrome.length} écart(s), historique, items du Kit Inspecteur). Lecture seule — aucune donnée créée ni modifiée.
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">{kitItems.length} item(s) réglementaire(s) disponible(s) pour la portée {portee.join(', ')}.</p>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={lancerSimulation} className="btn btn-primary btn-sm gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5" />Simuler la surveillance
        </button>
        {resultat && (
          <button type="button" onClick={telechargerRapport} disabled={telechargement === 'encours'} className="btn btn-secondary btn-sm gap-1.5">
            {telechargement === 'encours' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {telechargement === 'encours' ? 'Génération…' : 'Rapport PDF'}
          </button>
        )}
      </div>

      {!resultat ? (
        <div className="rounded-lg border border-dashed border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">Lancez la simulation pour visualiser la checklist pré-remplie et les écarts probables avant la surveillance réelle.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-muted/20 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Score réel</p>
              <p className="text-lg font-bold">{resultat.contexte.scoreGlobal ?? 'N/A'}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{resultat.contexte.niveau} · maturité SGS {resultat.contexte.maturiteSgs}</p>
            </div>
            <div className="bg-muted/20 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Conformité estimée</p>
              <p className={`text-lg font-bold ${resultat.stats.tauxConformite >= 80 ? 'text-success' : resultat.stats.tauxConformite >= 50 ? 'text-warning' : 'text-danger'}`}>{resultat.stats.tauxConformite}%</p>
              <p className="text-[10px] text-muted-foreground">{resultat.stats.sa} SA · {resultat.stats.ns} NS · {resultat.stats.na} NA · {resultat.stats.nv} NV</p>
            </div>
            <div className="bg-muted/20 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Écarts proposés</p>
              <p className={`text-lg font-bold ${resultat.ecartsProposes.length > 0 ? 'text-warning' : 'text-success'}`}>{resultat.ecartsProposes.length}</p>
              <p className="text-[10px] text-muted-foreground">{resultat.ecartsProposes.filter(e => e.niveau_risque === 'critique').length} critiques</p>
            </div>
            <div className="bg-muted/20 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Items simulés</p>
              <p className="text-lg font-bold">{resultat.items.length}</p>
              <p className="text-[10px] text-muted-foreground font-mono break-all">{resultat.reference}</p>
            </div>
          </div>

          <Card title={`Écarts probables (${resultat.ecartsProposes.length})`}>
            {resultat.ecartsProposes.length === 0 ? (
              <p className="text-sm text-muted text-center py-3">Aucun écart proposé — conformité estimée satisfaisante.</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {resultat.ecartsProposes.map(e => (
                  <div key={e.id} className="flex items-start gap-2 p-2 rounded-lg border border-border/60 text-xs">
                    <span className={`badge text-[10px] ${BADGE_NIVEAU[e.niveau_risque]}`}>{e.niveau_risque}</span>
                    <div className="min-w-0">
                      <p className="text-foreground font-medium flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{e.reference}</span>
                        <span className="text-muted-foreground">{e.domaine}</span>
                      </p>
                      <p className="text-foreground">{e.libelle}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="rounded-lg p-3 text-sm bg-muted/20">
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="w-3.5 h-3.5 text-role-primary" />
              <p className="font-medium text-foreground">Lecture de la simulation</p>
            </div>
            <p className="text-foreground">
              {resultat.ecartsProposes.length === 0
                ? 'Aucune non-conformité probable identifiée : l\'état réel de l\'aérodrome suggère un résultat satisfaisant pour cette surveillance.'
                : `${resultat.ecartsProposes.length} écart(s) probable(s) (${resultat.ecartsProposes.filter(e => e.niveau_risque === 'critique').length} critique(s)) à confirmer sur site. Conformité estimée ${resultat.stats.tauxConformite}% sur ${resultat.stats.total} items.`}
            </p>
          </div>

          {resultat.items.filter(i => i.alerte).length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="text-xs font-semibold flex items-center gap-1.5 text-warning mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />{resultat.items.filter(i => i.alerte).length} item(s) en alerte
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {resultat.items.filter(i => i.alerte).slice(0, 6).map(i => (
                  <p key={i.id} className="text-xs text-foreground">• {i.point_verification} <span className="text-muted-foreground">(confiance {i.confiance}%)</span></p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
