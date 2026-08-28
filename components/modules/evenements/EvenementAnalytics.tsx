// components/modules/evenements/EvenementAnalytics.tsx
// Dashboard analytique — tendances, comparaisons, prédictions
// Piloté par le profil de risque (C5)

'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useAppStore, type EvenementSecurite } from '@/lib/store'
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  BarChart3, PieChart, Activity, Target, Calendar, Zap, Shield,
  Loader2, Sparkles
} from 'lucide-react'
import { BarChart } from '@/components/ui/charts/BarChart'
import { PieChart as PieChartComponent } from '@/components/ui/charts/PieChart'
import { computeSaisonStats } from '@/lib/risque/predictions'
import { computeICaoMatrix, getICaoLabels } from '@/lib/risque/icaoMatrix'
import { calculateC5 } from '@/lib/risque'
import type { NiveauRisqueICAO, ICaoCell } from '@/lib/risque/icaoMatrix'
import { Card } from '@/components/ui/card'
import { DataTable, type Column } from '@/components/ui/DataTable'
interface Props {
  aerodromeId?: string
  userRole?: string
}

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc']

const MOIS_COMPLET = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

const GRAVITE_LABELS: Record<string, string> = {
  CRITIQUE: 'Critique', ORANGE: 'Élevé', JAUNE: 'Moyen', GRIS: 'Faible', BLEU: 'Faible'
}

const GRAVITE_RISK: Record<string, { label: string; classe: string }> = {
  CRITIQUE: { label: 'Critique', classe: 'danger' },
  ORANGE:   { label: 'Élevé',    classe: 'eleve' },
  JAUNE:    { label: 'Moyen',    classe: 'moyen' },
  GRIS:     { label: 'Faible',   classe: 'success' },
  BLEU:     { label: 'Faible',   classe: 'success' },
}

export default function EvenementAnalytics({ aerodromeId, userRole = 'inspector' }: Props) {
  const evenements = useAppStore(s => s.evenements)
  const aerodromes = useAppStore(s => s.aerodromes)

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
    const critiquess = cetteAnneeEvts.filter(e => e.gravite === 'critique').length
    const clotures = cetteAnneeEvts.filter(e => e.statut === 'cloture').length
    const total = cetteAnneeEvts.length
    const totalPassee = anneePasseeEvts.length
    const variation = totalPassee > 0 ? Math.round(((total - totalPassee) / totalPassee) * 100) : 0
    const tauxCloture = total > 0 ? Math.round((clotures / total) * 100) : 0
    const c5Calcule = aerodromeId ? calculateC5(cetteAnneeEvts.map(e => ({ gravite: e.gravite, date: e.date }))) : 0

    return { total, critiquess, clotures, variation, tauxCloture, totalPassee, c5Calcule }
  }, [filtered, cetteAnnee, anneePassee, aerodromeId])

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
        Critiques: moisEvts.filter(e => e.gravite === 'critique').length,
        Élevés: moisEvts.filter(e => e.gravite === 'eleve').length,
        Autres: moisEvts.filter(e => !['critique', 'eleve'].includes(e.gravite || '')).length,
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
      eleve: 'text-eleve border-eleve/30 bg-eleve/5',
      moyen: 'text-moyen border-moyen/30 bg-moyen/5',
      faible: 'text-success border-success/30 bg-success/5',
    }
    return map[niveau]
  }

  const getBadgeNiveau = (niveau: NiveauRisqueICAO): string => {
    const map: Record<NiveauRisqueICAO, string> = {
      critique: 'badge danger',
      eleve: 'badge eleve',
      moyen: 'badge moyen',
      faible: 'badge success',
    }
    return map[niveau]
  }

  type IcaoMatrixRow = ICaoCell & { type: string }

  const icaoMatrixData = useMemo<IcaoMatrixRow[]>(
    () => Array.from(icaoMatrix.entries()).map(([type, cell]) => ({ type, ...cell })),
    [icaoMatrix]
  )

  const icaoMatrixColumns: Column<IcaoMatrixRow>[] = [
    { key: 'type', header: "Type d'événement", render: (item) => <span className="font-medium">{item.type.replace(/_/g, ' ')}</span> },
    { key: 'freqObservee', header: 'Fréquence/an', render: (item) => <span className="block text-center">{item.freqObservee}/an</span> },
    { key: 'probabilite', header: 'Probabilité', render: (item) => <span className="block text-center text-muted-foreground">{icaoLabels.probabilite.find(p => p.value === item.probabilite)?.label || item.probabilite}</span> },
    { key: 'severite', header: 'Sévérité', render: (item) => <span className="block text-center text-muted-foreground">{icaoLabels.severite.find(s => s.value === item.severite)?.label || item.severite}</span> },
    { key: 'niveau', header: 'Niveau risque', render: (item) => <span className="block text-center"><span className={getBadgeNiveau(item.niveau)}>{icaoLabels.niveaux.find(n => n.value === item.niveau)?.label || item.niveau}</span></span> },
  ]

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
      .filter(e => e.gravite === 'critique' || e.gravite === 'eleve')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [filtered]
  )

  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 20
  const paginatedRecents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return recents.slice(start, start + PAGE_SIZE)
  }, [recents, currentPage])

  const columns: Column<EvenementSecurite>[] = [
    { key: 'date', header: 'Date', render: (e) => <span>{new Date(e.date).toLocaleDateString('fr-FR')}</span> },
    { key: 'reference', header: 'Référence', render: (e) => <span className="font-mono">{e.reference}</span> },
    { key: 'type', header: 'Type', render: (e) => <span>{e.type?.replace(/_/g, ' ') || '-'}</span> },
    { key: 'gravite', header: 'Gravité', render: (e) => (
      <span className={`badge ${GRAVITE_RISK[e.gravite || '']?.classe || 'neutral'} text-[10px]`}>
        {GRAVITE_RISK[e.gravite || '']?.label || e.gravite}
      </span>
    )},
    { key: 'aerodrome', header: 'Aérodrome', render: (e) => {
      const aero = aerodromes?.find(a => a.id === e.aerodrome_id)
      return <span className="code-oaci-badge text-[10px]">{aero?.code_oaci || '?'}</span>
    }},
    { key: 'statut', header: 'Statut', render: (e) => (
      <span className={`badge ${e.statut === 'cloture' ? 'success' : 'warning'} text-[10px]`}>{e.statut}</span>
    )},
  ]

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
            <div className="kpi-label">C5 (Événements)</div>
            <div className="kpi-value">{stats.c5Calcule}/100</div>
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
          <DataTable
            data={icaoMatrixData}
            columns={icaoMatrixColumns}
            keyExtractor={(item) => item.type}
            headerClassName="bg-role-primary-soft/40"
          />
        )}
      </Card>

      {/* Événements critiquess récents */}
      {recents.length > 0 && (
        <DataTable
          data={paginatedRecents}
          columns={columns}
          keyExtractor={(e) => e.id}
          cardProps={{ icon: <AlertTriangle className="text-danger" />, title: 'Événements critiquess récents' }}
          headerClassName="bg-role-primary-soft/40"
          pagination={{ total: recents.length, current: currentPage, pageSize: PAGE_SIZE, onPageChange: setCurrentPage }}
        />
      )}
    </div>
  )
}
