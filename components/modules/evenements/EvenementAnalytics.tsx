// components/modules/evenements/EvenementAnalytics.tsx
// Dashboard analytique — tendances, comparaisons, prédictions
// Piloté par le profil de risque (C5)

'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  BarChart3, PieChart, Activity, Target, Calendar, Zap, Shield,
  Loader2, Sparkles
} from 'lucide-react'
import { BarChart } from '@/components/ui/charts/BarChart'
import { PieChart as PieChartComponent } from '@/components/ui/charts/PieChart'
import { computeSaisonStats } from '@/lib/risque/predictions'
import { computeICaoMatrix, getICaoLabels } from '@/lib/risque/icaoMatrix'
import type { NiveauRisqueICAO } from '@/lib/risque/icaoMatrix'
import { Card } from '@/components/ui/card'
interface Props {
  aerodromeId?: string
  userRole?: string
}

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

const MOIS_COMPLET = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

const GRAVITE_LABELS: Record<string, string> = {
  CRITIQUE: 'Critique', ORANGE: 'Orange', JAUNE: 'Jaune', GRIS: 'Gris', BLEU: 'Bleu'
}

export default function EvenementAnalytics({ aerodromeId, userRole = 'inspector' }: Props) {
  const evenements = useAppStore(s => s.evenements)
  const aerodromes = useAppStore(s => s.aerodromes)
  const profilsRisque = useAppStore(s => s.profilsRisque)

  // Filtrer
  const filtered = useMemo(() => {
    let evts = evenements || []
    if (aerodromeId) evts = evts.filter(e => e.aerodrome_id === aerodromeId)
    return evts
  }, [evenements, aerodromeId])

  const now = new Date()
  const cetteAnnee = now.getFullYear()
  const anneePassee = cetteAnnee - 1

  // ── KPIs ──
  const stats = useMemo(() => {
    const cetteAnneeEvts = filtered.filter(e => new Date(e.date).getFullYear() === cetteAnnee)
    const anneePasseeEvts = filtered.filter(e => new Date(e.date).getFullYear() === anneePassee)
    const critiquess = cetteAnneeEvts.filter(e => e.gravite === 'CRITIQUE').length
    const clotures = cetteAnneeEvts.filter(e => e.statut === 'cloture').length
    const total = cetteAnneeEvts.length
    const totalPassee = anneePasseeEvts.length
    const variation = totalPassee > 0 ? Math.round(((total - totalPassee) / totalPassee) * 100) : 0
    const tauxCloture = total > 0 ? Math.round((clotures / total) * 100) : 0

    return { total, critiquess, clotures, variation, tauxCloture, totalPassee }
  }, [filtered, cetteAnnee, anneePassee])

  // ── Courbe tendance 12 mois ──
  const trendData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const m = d.getMonth()
      const y = d.getFullYear()
      const moisEvts = filtered.filter(e => {
        const ed = new Date(e.date)
        return ed.getMonth() === m && ed.getFullYear() === y
      })
      return {
        mois: MOIS[m],
        Critiques: moisEvts.filter(e => e.gravite === 'CRITIQUE').length,
        Élevés: moisEvts.filter(e => e.gravite === 'ORANGE').length,
        Autres: moisEvts.filter(e => !['CRITIQUE', 'ORANGE'].includes(e.gravite || '')).length,
      }
    })
  }, [filtered, now])

  // ── Répartition par type ──
  const typeData = useMemo(() => {
    const groupes: Record<string, number> = {}
    filtered.forEach(e => {
      const t = e.type || 'Autre'
      groupes[t] = (groupes[t] || 0) + 1
    })
    return Object.entries(groupes).map(([type, valeur]) => ({ type: type.replace(/_/g, ' '), valeur }))
  }, [filtered])

  // ── Top 5 aérodromes ──
  const topAerodromes = useMemo(() => {
    const groupes: Record<string, number> = {}
    filtered.forEach(e => {
      const aero = aerodromes?.find(a => a.id === e.aerodrome_id)
      const label = aero?.code_oaci || e.aerodrome_id?.substring(0, 6) || '?'
      groupes[label] = (groupes[label] || 0) + 1
    })
    return Object.entries(groupes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, valeur]) => ({ label, valeur }))
  }, [filtered, aerodromes])

  // ── Prédictions IA (Groq) — chargement explicite via bouton
  const [iaPredictions, setIaPredictions] = useState<any[]>([])
  const [iaPredictionsLoading, setIaPredictionsLoading] = useState(false)
  const [iaNoteGlobale, setIaNoteGlobale] = useState('')
  const [iaPredictionsLoaded, setIaPredictionsLoaded] = useState(false)

  const saisonStats = useMemo(() => {
    const evts = filtered.map(e => ({ date: e.date || e.created_at, gravite: e.gravite, type: e.type }))
    return computeSaisonStats(evts)
  }, [filtered])

  const icaoMatrix = useMemo(() => {
    const evts = filtered.map(e => ({ type: e.type || '', gravite: e.gravite, date: e.date || e.created_at }))
    return computeICaoMatrix(evts)
  }, [filtered])

  const icaoLabels = useMemo(() => getICaoLabels(), [])

  const getNiveauCouleur = (niveau: NiveauRisqueICAO): string => {
    const map: Record<NiveauRisqueICAO, string> = {
      critique: 'text-danger border-danger/30 bg-danger/5',
      eleve: 'text-warning border-warning/30 bg-warning/5',
      moyen: 'text-primary border-primary/30 bg-primary/5',
      faible: 'text-success border-success/30 bg-success/5',
    }
    return map[niveau]
  }

  const getBadgeNiveau = (niveau: NiveauRisqueICAO): string => {
    const map: Record<NiveauRisqueICAO, string> = {
      critique: 'badge danger',
      eleve: 'badge warning',
      moyen: 'badge primary',
      faible: 'badge success',
    }
    return map[niveau]
  }

  const chargePredictionsIA = useCallback(async () => {
    const evts = filtered.map(e => ({ date: e.date || e.created_at, gravite: e.gravite, type: e.type }))
    if (evts.length === 0) { setIaPredictions([]); setIaNoteGlobale(''); return }
    setIaPredictionsLoading(true)
    try {
      const aerodrome = aerodromeId ? aerodromes?.find(a => a.id === aerodromeId) : undefined
      const res = await fetch('/api/ai/evenement-predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evenements: evts, aerodrome_code: aerodrome?.code_oaci || aerodromeId || '' }),
      })
      const data = await res.json()
      const loaded = Array.isArray(data?.predictions) ? data.predictions : []
      setIaPredictions(loaded)
      setIaNoteGlobale(data?.noteGlobale || '')
      setIaPredictionsLoaded(true)
    } catch (err) {
      console.error('Erreur chargement predictions IA:', err)
      setIaPredictions([])
    } finally {
      setIaPredictionsLoading(false)
    }
  }, [filtered, aerodromeId, aerodromes])

  // ── Top événements récents ──
  const recents = useMemo(() =>
    filtered
      .filter(e => e.gravite === 'CRITIQUE' || e.gravite === 'ORANGE')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5),
    [filtered]
  )

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="evenement-analytics">
      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft"><Activity className="w-5 h-5 text-role-primary" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Total {cetteAnnee}</div>
            <div className="kpi-value">{stats.total}</div>
            <div className={`kpi-trend ${stats.variation > 0 ? 'down' : 'up'}`}>
              {stats.variation > 0 ? `+${stats.variation}%` : `${stats.variation}%`} vs {anneePassee}
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft"><AlertTriangle className="w-5 h-5 text-danger" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Critiques</div>
            <div className="kpi-value">{stats.critiquess}</div>
            <div className="kpi-trend down">{stats.total > 0 ? Math.round((stats.critiquess / stats.total) * 100) : 0}% du total</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft"><CheckCircle2 className="w-5 h-5 text-success" /></div>
          <div className="kpi-content">
            <div className="kpi-label">Taux clôture</div>
            <div className="kpi-value">{stats.tauxCloture}%</div>
            <div className="progress h-1.5 mt-1"><div className="progress-bar" style={{ width: `${stats.tauxCloture}%` }} /></div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft"><Zap className="w-5 h-5 text-warning" /></div>
          <div className="kpi-content">
            <div className="kpi-label">C5 (Profil)</div>
            <div className="kpi-value">{aerodromeId && profilsRisque?.[aerodromeId]?.c5 || 'N/A'}/100</div>
            <div className="kpi-trend down">Impact 25% score global</div>
          </div>
        </div>
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card icon={<TrendingUp />} title="Tendance 12 mois">
            <BarChart
              data={trendData}
              xKey="mois"
              bars={[
                { key: 'Critiques', name: 'Critiques' },
                { key: 'Élevés', name: 'Élevés' },
                { key: 'Autres', name: 'Autres' },
              ]}
              height={250}
            />
        </Card>

        <Card icon={<PieChart />} title="Répartition par type">
            <PieChartComponent
              data={typeData}
              nameKey="type"
              valueKey="valeur"
              height={250}
            />
        </Card>
      </div>

      {/* Top 5 aérodromes + Prédictions + Matrice ICAO */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card icon={<Target />} title="Top 5 aérodromes les plus touchés">
            {topAerodromes.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">Aucun événement</p>
            ) : (
              <div className="space-y-2">
                {topAerodromes.map((a, i) => (
                  <div key={a.label} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                    <span className="code-oaci-badge text-xs">{a.label}</span>
                    <div className="flex-1 progress h-2">
                      <div className="progress-bar" style={{ width: `${(a.valeur / topAerodromes[0].valeur) * 100}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-foreground">{a.valeur}</span>
                  </div>
                ))}
              </div>
            )}
        </Card>

        <Card heading={<div className="flex items-center justify-between w-full"><div className="flex items-center gap-2"><Zap className="w-4 h-4" />Prédictions — 3 prochains mois</div>{!iaPredictionsLoaded && !iaPredictionsLoading && (<button onClick={chargePredictionsIA} className="btn btn-sm btn-primary gap-1.5"><Sparkles className="w-3.5 h-3.5" />Charger l'analyse IA</button>)}</div>}>
          <div className="space-y-2">
            {iaPredictionsLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyse IA des tendances...
              </div>
            ) : !iaPredictionsLoaded ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                {filtered.length === 0 ? 'Aucun événement — pas de prédiction disponible' : 'Cliquez sur « Charger l\'analyse IA » pour générer les prédictions'}
              </p>
            ) : (
              <>
                {iaPredictions.map((p, i) => {
                  const auDessusMoyenne = p.critiques > saisonStats.moyenneCritiques + saisonStats.ecartType
                  return (
                    <div key={i} className={`p-3 rounded-lg border ${auDessusMoyenne ? 'border-danger/30 bg-danger/5' : 'border-border'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{p.mois}</span>
                        <span className={`badge ${auDessusMoyenne ? 'danger' : 'warning'} text-[10px]`}>
                          ~{p.critiques} critique(s) prévu(s)
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{p.tendance}</p>
                      {p.risquesContextuels?.slice(0, 2).map((r: string, ri: number) => (
                        <p key={ri} className="text-[10px] text-warning italic flex items-center gap-1">
                          <AlertTriangle className="w-2.5 h-2.5" />{r}
                        </p>
                      ))}
                      {p.saisons?.map((s: string, si: number) => (
                        <p key={si} className="text-[10px] text-muted-foreground italic">{s}</p>
                      ))}
                    </div>
                  )
                })}
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[10px] text-muted-foreground italic">
                    Analyse saisonnière — moy. {saisonStats.moyenneCritiques}/mois, écart-type {saisonStats.ecartType}
                  </p>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Sparkles className="w-2.5 h-2.5" />IA
                  </span>
                </div>
                {iaNoteGlobale && (
                  <p className="text-[10px] text-role-primary italic pt-0.5">{iaNoteGlobale}</p>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Matrice ICAO dynamique */}
      <Card icon={<Shield />} title="Matrice risque ICAO (dynamique)">
        {icaoMatrix.size === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">Aucun événement — pas de matrice disponible</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-xs w-full">
              <thead>
                <tr>
                  <th className="text-left">Type d'événement</th>
                  <th className="text-center">Fréquence/an</th>
                  <th className="text-center">Probabilité</th>
                  <th className="text-center">Sévérité</th>
                  <th className="text-center">Niveau risque</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(icaoMatrix.entries()).map(([type, cell]) => (
                  <tr key={type}>
                    <td className="font-medium">{type.replace(/_/g, ' ')}</td>
                    <td className="text-center">{cell.freqObservee}/an</td>
                    <td className="text-center text-muted-foreground">{icaoLabels.probabilite.find(p => p.value === cell.probabilite)?.label || cell.probabilite}</td>
                    <td className="text-center text-muted-foreground">{icaoLabels.severite.find(s => s.value === cell.severite)?.label || cell.severite}</td>
                    <td className="text-center"><span className={getBadgeNiveau(cell.niveau)}>{icaoLabels.niveaux.find(n => n.value === cell.niveau)?.label || cell.niveau}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Événements critiquess récents */}
      {recents.length > 0 && (
        <Card icon={<AlertTriangle className="text-danger" />} title="Événements critiquess récents">
            <div className="table-container">
              <table className="table text-xs">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Référence</th>
                    <th>Type</th>
                    <th>Gravité</th>
                    <th>Aérodrome</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {recents.map(e => {
                    const aero = aerodromes?.find(a => a.id === e.aerodrome_id)
                    return (
                      <tr key={e.id}>
                        <td>{new Date(e.date).toLocaleDateString('fr-FR')}</td>
                        <td className="font-mono">{e.reference}</td>
                        <td>{e.type?.replace(/_/g, ' ') || '-'}</td>
                        <td><span className={`badge ${e.gravite === 'CRITIQUE' ? 'danger' : 'warning'} text-[10px]`}>{GRAVITE_LABELS[e.gravite || ''] || e.gravite}</span></td>
                        <td><span className="code-oaci-badge text-[10px]">{aero?.code_oaci || '?'}</span></td>
                        <td><span className={`badge ${e.statut === 'cloture' ? 'success' : 'warning'} text-[10px]`}>{e.statut}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
        </Card>
      )}
    </div>
  )
}
