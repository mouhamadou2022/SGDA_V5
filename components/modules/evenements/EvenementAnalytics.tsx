// components/modules/evenements/EvenementAnalytics.tsx
// Dashboard analytique — tendances, comparaisons, prédictions
// Piloté par le profil de risque (C5)

'use client'

import React, { useMemo, useState } from 'react'
import { useAppStore } from '@/lib/store'
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  BarChart3, PieChart, Activity, Target, Calendar, Zap, Shield
} from 'lucide-react'
import { BarChart } from '@/components/ui/charts/BarChart'
import { PieChart as PieChartComponent } from '@/components/ui/charts/PieChart'

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
    const critiques = cetteAnneeEvts.filter(e => e.gravite === 'CRITIQUE').length
    const clotures = cetteAnneeEvts.filter(e => e.statut === 'cloture').length
    const total = cetteAnneeEvts.length
    const totalPassee = anneePasseeEvts.length
    const variation = totalPassee > 0 ? Math.round(((total - totalPassee) / totalPassee) * 100) : 0
    const tauxCloture = total > 0 ? Math.round((clotures / total) * 100) : 0

    return { total, critiques, clotures, variation, tauxCloture, totalPassee }
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

  // ── Prédictions 3 mois ──
  const predictions = useMemo(() => {
    const moisProchain = (now.getMonth() + 1) % 12
    const critParMois = filtered.filter(e => {
      const ed = new Date(e.date)
      return ed.getFullYear() === now.getFullYear() && e.gravite === 'CRITIQUE'
    }).length
    const moyMensuelle = critParMois / Math.max(now.getMonth() + 1, 1)
    const c5Actuel = profilsRisque && aerodromeId ? profilsRisque[aerodromeId]?.c5 : null

    return [
      { mois: MOIS_COMPLET[moisProchain], critique: Math.round(moyMensuelle * 1.1), tendance: c5Actuel && c5Actuel < 50 ? '⬆ Hausse probable' : '→ Stable' },
      { mois: MOIS_COMPLET[(moisProchain + 1) % 12], critique: Math.round(moyMensuelle * 1.2), tendance: c5Actuel && c5Actuel < 40 ? '⬆ Hausse probable' : '→ Stable' },
      { mois: MOIS_COMPLET[(moisProchain + 2) % 12], critique: Math.round(moyMensuelle * 1.3), tendance: c5Actuel && c5Actuel < 30 ? '⬆ Hausse probable' : '→ Stable' },
    ]
  }, [filtered, now, profilsRisque, aerodromeId])

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
            <div className="kpi-value">{stats.critiques}</div>
            <div className="kpi-trend down">{stats.total > 0 ? Math.round((stats.critiques / stats.total) * 100) : 0}% du total</div>
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
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-role-primary" />
              Tendance 12 mois
            </div>
          </div>
          <div className="card-content">
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
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <PieChart className="w-4 h-4 text-role-primary" />
              Répartition par type
            </div>
          </div>
          <div className="card-content">
            <PieChartComponent
              data={typeData}
              nameKey="type"
              valueKey="valeur"
              height={250}
            />
          </div>
        </div>
      </div>

      {/* Top 5 aérodromes + Prédictions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Target className="w-4 h-4 text-role-primary" />
              Top 5 aérodromes les plus touchés
            </div>
          </div>
          <div className="card-content">
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
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Zap className="w-4 h-4 text-role-primary" />
              Prédictions — 3 prochains mois
            </div>
          </div>
          <div className="card-content space-y-2">
            {predictions.map((p, i) => (
              <div key={i} className={`p-3 rounded-lg border ${p.critique > 2 ? 'border-danger/30 bg-danger/5' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{p.mois}</span>
                  <span className={`badge ${p.critique > 2 ? 'danger' : 'warning'} text-[10px]`}>
                    ~{p.critique} événement(s) critique(s)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.tendance}</p>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground italic pt-1">
              Basé sur la moyenne mensuelle et le score C5 du profil de risque
            </p>
          </div>
        </div>
      </div>

      {/* Événements critiques récents */}
      {recents.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-danger" />
              Événements critiques récents
            </div>
          </div>
          <div className="card-content">
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
          </div>
        </div>
      )}
    </div>
  )
}
