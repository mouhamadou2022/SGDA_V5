// components/modules/ml-monitoring/SimulationSurveillanceCard.tsx
// Carte 11 — Simulation de surveillance AERORISQ.
// À partir des données réelles d'un aérodrome (profil C1-C5, écarts, historique,
// items du Kit Inspecteur), simule une surveillance : checklist pré-remplie
// SA/NS/NA/NV avec confiance, écarts probables proposés, statistiques de
// conformité et rapport de surveillance (PDF via le builder ANACIM existant).
// Strictement additif : ne crée ni ne modifie aucune donnée (lecture seule).

'use client'

import { useMemo, useState } from 'react'
import { ClipboardCheck, Download, RotateCcw, AlertTriangle, ShieldAlert, ClipboardList } from 'lucide-react'
import { useAppStore, type Ecart, type EvenementSecurite, type ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { simulerSurveillance, construireRapportSimulation, type ResultatSimulation } from '@/lib/ia/simulationSurveillance'

interface Props {
  profilsRisque: Record<string, ProfilRisque>
  ecarts: Ecart[]
  evenements: EvenementSecurite[]
}

const TYPES_SURVEILLANCE = [
  { code: 'periodique', label: 'Inspection périodique' },
  { code: 'inopine', label: 'Inspection inopinée' },
  { code: 'maintien', label: 'Suivi du maintien de la sécurité' },
  { code: 'suivi_ecarts', label: 'Suivi des écarts' },
  { code: 'certification', label: 'Certification' },
  { code: 'homologation', label: 'Homologation' },
]

const PORTEE_OPTIONS = [
  { code: 'AGA', label: 'Tous les domaines (AGA)' },
  { code: 'SGS', label: 'SGS — Système de Gestion de la Sécurité' },
  { code: 'SLI', label: 'SLI — Sauvetage et Lutte Incendie' },
  { code: 'PHY', label: 'PHY — Caractéristiques physiques' },
  { code: 'OLS', label: 'OLS — Surfaces de limitation d\'obstacles' },
  { code: 'RA', label: 'RA — Risque animalier' },
  { code: 'ELEC', label: 'ELEC — Réseaux électriques' },
  { code: 'MFP', label: 'MFP — Marques, feux et panneaux' },
  { code: 'COP', label: 'COP — Compétences & personnel' },
  { code: 'OPS', label: 'OPS — Procédures opérationnelles' },
]

const BADGE_NIVEAU: Record<string, string> = {
  critique: 'danger', eleve: 'warning', moyen: 'primary', faible: 'success',
}

const BADGE_RESULTAT: Record<string, string> = {
  SA: 'success', NS: 'danger', NA: 'neutral', NV: 'warning',
}

export default function SimulationSurveillanceCard({ profilsRisque, ecarts, evenements }: Props) {
  const aerodromes = useAppStore(s => s.aerodromes)
  const kitDocuments = useAppStore(s => s.kitDocuments)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const getHistoricalScoresForAerodrome = useAppStore(s => s.getHistoricalScoresForAerodrome)

  const profilsList = useMemo(() => Object.values(profilsRisque ?? {}), [profilsRisque])
  const premierId = profilsList[0]?.aerodrome_id ?? ''

  const [aerodromeId, setAerodromeId] = useState<string>(premierId)
  const [typeSurveillance, setTypeSurveillance] = useState('periodique')
  const [portee, setPortee] = useState<string[]>(['AGA'])
  const [resultat, setResultat] = useState<ResultatSimulation | null>(null)
  const [telechargement, setTelechargement] = useState<'idle' | 'encours'>('idle')

  const aerodrome = useMemo(() => aerodromes.find(a => a.id === aerodromeId) ?? null, [aerodromes, aerodromeId])
  const profil = useMemo(() => profilsRisque?.[aerodromeId] ?? null, [profilsRisque, aerodromeId])
  const historique = useMemo(
    () => (aerodromeId ? getHistoricalScoresForAerodrome(aerodromeId) : []),
    [aerodromeId, getHistoricalScoresForAerodrome],
  )

  const evenementsReels = useMemo(
    () => evenements.filter(e => e.aerodrome_id === aerodromeId).length,
    [evenements, aerodromeId],
  )

  const kitItems = useMemo(() => {
    const actifs = (kitDocuments ?? []).filter(d => d.etat === 'a_jour' || d.etat === 'en_revision')
    return actifs.flatMap(d => d.items_generes ?? [])
  }, [kitDocuments])

  const togglePortee = (code: string) => {
    setPortee(prev => {
      if (code === 'AGA') return ['AGA']
      const sansAga = prev.filter(p => p !== 'AGA')
      if (sansAga.includes(code)) return sansAga.length > 0 ? sansAga : ['AGA']
      return [...sansAga, code]
    })
  }

  const lancerSimulation = () => {
    if (!aerodromeId) return
    const r = simulerSurveillance({
      aerodrome,
      profil,
      ecartsReels: ecarts,
      evenementsReels,
      historique,
      kitItems,
      typeSurveillance,
      portee,
      typeEntite: aerodrome?.type_entite ?? 'aerodrome',
      utilisateurs,
      prefixNumero: typeSurveillance === 'certification' ? 'CERT' : typeSurveillance === 'homologation' ? 'HMG' : 'QSC',
    })
    setResultat(r)
  }

  const telechargerRapport = async () => {
    if (!aerodromeId) return
    setTelechargement('encours')
    try {
      const { batirRapportSurveillancePdf } = await import('@/lib/services/rapportSurveillancePdf')
      const { rapport } = construireRapportSimulation({
        aerodrome,
        profil,
        ecartsReels: ecarts,
        evenementsReels,
        historique,
        kitItems,
        typeSurveillance,
        portee,
        typeEntite: aerodrome?.type_entite ?? 'aerodrome',
        utilisateurs,
        prefixNumero: typeSurveillance === 'certification' ? 'CERT' : typeSurveillance === 'homologation' ? 'HMG' : 'QSC',
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

  if (profilsList.length === 0) {
    return (
      <Card icon={<ClipboardCheck className="h-4 w-4 text-role-primary" />} title="11. Simulation de surveillance AERORISQ">
        <p className="text-sm text-muted text-center py-8">Complétez un profil de risque pour simuler une surveillance.</p>
      </Card>
    )
  }

  return (
    <Card icon={<ClipboardCheck className="h-4 w-4 text-role-primary" />} title="11. Simulation de surveillance AERORISQ" badge={
      <span className="badge text-xs">{resultat ? `${resultat.items.length} items` : 'en attente'}</span>
    }>
      <p className="text-sm text-muted-foreground mb-4">
        Simule une surveillance sur un aérodrome à partir de ses données réelles : profil de risque C1-C5, écarts ouverts, historique des scores et items du Kit Inspecteur. Lecture seule — aucune donnée créée ni modifiée.
      </p>

      {/* ── PARAMÈTRES DE LA SIMULATION ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground">Aérodrome</label>
          <select value={aerodromeId} onChange={e => { setAerodromeId(e.target.value); setResultat(null) }} className="form-select text-sm w-full mt-1">
            {profilsList.map(p => {
              const a = aerodromes.find(x => x.id === p.aerodrome_id)
              return (
                <option key={p.aerodrome_id} value={p.aerodrome_id}>
                  {a ? `${a.nom} (${a.code_oaci})` : p.aerodrome_id}
                </option>
              )
            })}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Type de surveillance</label>
          <select value={typeSurveillance} onChange={e => setTypeSurveillance(e.target.value)} className="form-select text-sm w-full mt-1">
            {TYPES_SURVEILLANCE.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={lancerSimulation} className="btn btn-primary btn-sm gap-1.5 flex-1">
            <ClipboardList className="h-4 w-4" />Simuler la surveillance
          </button>
          {resultat && (
            <button onClick={telechargerRapport} disabled={telechargement === 'encours'} className="btn btn-secondary btn-sm gap-1.5">
              <Download className="h-4 w-4" />{telechargement === 'encours' ? 'Génération…' : 'Rapport PDF'}
            </button>
          )}
        </div>
      </div>

      {/* ── PORTÉE ── */}
      <div className="mb-5">
        <p className="text-xs text-muted-foreground mb-1.5">Portée ({portee.includes('AGA') ? 'tous les domaines' : `${portee.length} domaine(s)`})</p>
        <div className="flex flex-wrap gap-1.5">
          {PORTEE_OPTIONS.map(o => {
            const actif = portee.includes(o.code)
            return (
              <button
                key={o.code}
                onClick={() => togglePortee(o.code)}
                className={`px-2.5 py-1 rounded-full border text-[11px] ${actif ? 'border-role-primary bg-role-primary-soft text-foreground' : 'border-border text-muted-foreground hover:border-role-primary/40'}`}
              >
                {o.code}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── RÉSULTATS ── */}
      {resultat ? (
        <div className="space-y-4">
          {/* Contexte */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="bg-role-primary-soft rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Score réel</p>
              <p className="text-lg font-bold">{resultat.contexte.scoreGlobal ?? 'N/A'}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{resultat.contexte.niveau}</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Conformité estimée</p>
              <p className={`text-lg font-bold ${resultat.stats.tauxConformite >= 80 ? 'text-success' : resultat.stats.tauxConformite >= 50 ? 'text-warning' : 'text-danger'}`}>{resultat.stats.tauxConformite}%</p>
              <p className="text-[10px] text-muted-foreground">{resultat.stats.sa} SA · {resultat.stats.ns} NS · {resultat.stats.na} NA · {resultat.stats.nv} NV</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Écarts proposés</p>
              <p className={`text-lg font-bold ${resultat.ecartsProposes.length > 0 ? 'text-warning' : 'text-success'}`}>{resultat.ecartsProposes.length}</p>
              <p className="text-[10px] text-muted-foreground">{resultat.ecartsProposes.filter(e => e.niveau_risque === 'critique').length} critiques</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Écarts réels ouverts</p>
              <p className="text-lg font-bold">{resultat.contexte.ecartsOuvertsReels}</p>
              <p className="text-[10px] text-muted-foreground">maturité SGS {resultat.contexte.maturiteSgs}</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground">Référence</p>
              <p className="text-[11px] font-mono text-foreground break-all">{resultat.reference}</p>
            </div>
          </div>

          {/* Écarts proposés */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-lg border border-border p-3">
              <h4 className="text-sm mb-2 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-warning" />Écarts probables proposés ({resultat.ecartsProposes.length})</h4>
              {resultat.ecartsProposes.length === 0 ? (
                <p className="text-sm text-muted text-center py-5">Aucun écart proposé — conformité estimée satisfaisante.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {resultat.ecartsProposes.map(e => (
                    <div key={e.id} className="p-2.5 rounded-lg border border-border/60">
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <span className={`badge text-[10px] ${BADGE_NIVEAU[e.niveau_risque]}`}>{e.niveau_risque}</span>
                          <span className="font-mono text-[10px]">{e.reference}</span>
                          <span className="text-muted-foreground">{e.domaine}</span>
                        </span>
                      </div>
                      <p className="text-xs text-foreground">{e.libelle}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{e.justification}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Items par état */}
            <div className="rounded-lg border border-border p-3">
              <h4 className="text-sm mb-2 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-role-primary" />Répartition simulée de la checklist</h4>
              <div className="space-y-1.5">
                {(['SA', 'NS', 'NA', 'NV'] as const).map(r => {
                  const count = r === 'SA' ? resultat.stats.sa : r === 'NS' ? resultat.stats.ns : r === 'NA' ? resultat.stats.na : resultat.stats.nv
                  const pct = resultat.stats.total > 0 ? Math.round((count / resultat.stats.total) * 100) : 0
                  return (
                    <div key={r} className="flex items-center gap-2 text-xs">
                      <span className={`badge text-[10px] w-8 text-center ${BADGE_RESULTAT[r]}`}>{r}</span>
                      <span className="text-foreground w-6 text-right font-mono">{count}</span>
                      <div className="progress h-1.5 flex-1"><div className="progress-bar" style={{ width: `${pct}%` }} /></div>
                      <span className="text-muted-foreground font-mono w-9 text-right">{pct}%</span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-1.5">Conformité estimée par domaine</p>
                <div className="space-y-1">
                  {Object.entries(resultat.stats.parDomaine).map(([domaine, sd]) => (
                    <div key={domaine} className="flex items-center gap-2 text-xs">
                      <span className="text-foreground w-12 truncate">{domaine}</span>
                      <div className="progress h-1 flex-1"><div className="progress-bar" style={{ width: `${sd.taux}%` }} /></div>
                      <span className="text-muted-foreground font-mono w-8 text-right">{sd.taux}%</span>
                      <span className="text-muted-foreground text-[10px] w-10 text-right">{sd.ns} NS</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Items en alerte */}
          <div className="rounded-lg border border-border p-3">
            <h4 className="text-sm mb-2 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-role-primary" />Items en alerte ({resultat.items.filter(i => i.alerte).length})</h4>
            {resultat.items.filter(i => i.alerte).length === 0 ? (
              <p className="text-sm text-muted text-center py-3">Aucun item en alerte dans la simulation.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {resultat.items.filter(i => i.alerte).map(i => (
                  <div key={i.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/20 text-xs">
                    <span className={`badge text-[10px] mt-0.5 ${BADGE_RESULTAT[i.prediction]}`}>{i.prediction}</span>
                    <div className="min-w-0">
                      <p className="text-foreground font-medium">{i.point_verification}</p>
                      <p className="text-muted-foreground text-[10px] mt-0.5">{i.numero} · {i.domaine} · confiance {i.confiance}% — {i.justification}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <ClipboardCheck className="h-6 w-6 text-role-primary mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Configurez les paramètres puis lancez la simulation pour voir la checklist pré-remplie, les écarts probables et le rapport.</p>
          <p className="text-[11px] text-muted-foreground mt-1">{kitItems.length} item(s) réglementaire(s) disponibles depuis le Kit Inspecteur.</p>
        </div>
      )}

      {/* Interprétation */}
      {resultat && (
        <div className="mt-5 rounded-lg p-3 text-sm bg-muted/20">
          <div className="flex items-center gap-2 mb-1">
            <RotateCcw className="w-4 h-4 text-role-primary" />
            <p className="font-medium text-foreground">Lecture de la simulation</p>
          </div>
          <p className="text-foreground">
            {resultat.ecartsProposes.length === 0
              ? 'La simulation n\'identifie aucune non-conformité probable : l\'état réel de l\'aérodrome suggère un résultat satisfaisant.'
              : `La simulation propose ${resultat.ecartsProposes.length} écart(s) probable(s) (${resultat.ecartsProposes.filter(e => e.niveau_risque === 'critique').length} critique(s)), à confirmer par une surveillance réelle. Conformité estimée ${resultat.stats.tauxConformite}% sur ${resultat.stats.total} items.`}{' '}
            Le rapport téléchargeable reprend le gabarit ANACIM existant avec les données simulées.
          </p>
        </div>
      )}
    </Card>
  )
}
