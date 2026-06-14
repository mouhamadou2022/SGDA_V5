// components/modules/enquetes/EnqueteStats.tsx
'use client'

import { useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { Download, TrendingUp, Users, Calendar, Star } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface EnqueteStatsProps {
  enqueteId: string
  userRole?: string
}

export function EnqueteStats({ enqueteId, userRole = 'inspector' }: EnqueteStatsProps) {
  const enquetes = useAppStore((s) => s.enquetes)
  const reponsesEnquetes = useAppStore((s) => s.reponsesEnquetes)
  const aerodromes = useAppStore((s) => s.aerodromes)

  const enquete = enquetes?.find((e) => e.id === enqueteId)
  const titre = enquete?.titre ?? 'Enquête'

  const reponses = useMemo(
    () => (reponsesEnquetes ?? []).filter((r) => r.enquete_id === enqueteId),
    [reponsesEnquetes, enqueteId]
  )

  const totalReponses = reponses.length

  // Taux de réponse = réponses reçues / aérodromes ciblés (min 1)
  const nbCibles = enquete?.aerodrome_ids?.length ?? 0
  const tauxReponse = nbCibles > 0 ? Math.min(100, Math.round((totalReponses / nbCibles) * 100)) : 0

  const scoreMoyen = useMemo(() => {
    const avecScore = reponses.filter((r) => r.score_c1 != null)
    if (avecScore.length === 0) return null
    return (avecScore.reduce((s, r) => s + (r.score_c1 ?? 0), 0) / avecScore.length).toFixed(1)
  }, [reponses])

  const derniereReponse = useMemo(() => {
    if (reponses.length === 0) return null
    return reponses
      .map((r) => r.submitted_at)
      .sort()
      .at(-1)!
  }, [reponses])

  const reponseParAerodrome = useMemo(() => {
    const counts: Record<string, number> = {}
    reponses.forEach((r) => {
      const code = aerodromes.find((a) => a.id === r.aerodrome_id)?.code_oaci ?? r.aerodrome_id
      counts[code] = (counts[code] ?? 0) + 1
    })
    return Object.entries(counts).map(([aerodrome, reponses]) => ({ aerodrome, reponses }))
  }, [reponses, aerodromes])

  const distributionLikert = useMemo(() => {
    const dist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    reponses.forEach((r) => {
      if (r.score_c1 != null) {
        const note = Math.round(r.score_c1).toString()
        if (note in dist) dist[note]++
      }
    })
    return Object.entries(dist).map(([note, count]) => ({ note, count }))
  }, [reponses])

  const getScoreBadgeClass = (score: number) => {
    if (score >= 4) return 'badge success'
    if (score >= 3) return 'badge warning'
    return 'badge danger'
  }

  const handleExportCSV = () => {
    const headers = 'Aérodrome,Répondant,Date,Score C1\n'
    const rows = reponses.map((r) => {
      const code = aerodromes.find((a) => a.id === r.aerodrome_id)?.code_oaci ?? r.aerodrome_id
      return `${code},${r.repondant_nom},${r.submitted_at.slice(0, 10)},${r.score_c1 ?? ''}`
    }).join('\n')
    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stats-enquete-${enqueteId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (reponses.length === 0) {
    return (
      <div className="space-y-6 animate-fade-up" data-role={userRole}>
        <h2 className="heading-4 text-role-primary">{titre}</h2>
        <Card className="text-center">
          Aucune réponse reçue pour cette enquête.
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole}>
      <div className="flex items-center justify-between">
        <h2 className="heading-4 text-role-primary">{titre}</h2>
        <button className="btn btn-secondary gap-2" onClick={handleExportCSV}>
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <Users className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Réponses reçues</div>
          <div className="kpi-value">{totalReponses}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Taux de réponse</div>
          <div className="kpi-value">{tauxReponse}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-primary-soft">
            <Star className="w-5 h-5 text-primary" />
          </div>
          <div className="kpi-label">Score C1 moyen</div>
          <div className="kpi-value">{scoreMoyen ?? '—'}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <Calendar className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">Dernière réponse</div>
          <div className="kpi-value text-base">
            {derniereReponse ? new Date(derniereReponse).toLocaleDateString('fr-FR') : '—'}
          </div>
        </div>
      </div>

      {/* Bar chart réponses par aérodrome */}
      {reponseParAerodrome.length > 0 && (
        <Card>
          <p className="font-medium mb-4 text-role-primary">Réponses par aérodrome</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={reponseParAerodrome} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="aerodrome" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="reponses" name="Réponses" fill="var(--role-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Distribution Likert */}
      <Card>
        <p className="font-medium mb-4 text-role-primary">Distribution des scores C1</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={distributionLikert} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="note" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="count" name="Réponses" fill="var(--success)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Tableau */}
      <Card>
        <p className="font-medium mb-3 text-role-primary">Détail des réponses</p>
        <div className="table-container overflow-x-auto">
          <table className="table text-sm">
            <thead>
              <tr>
                <th>Aérodrome</th>
                <th>Répondant</th>
                <th>Date</th>
                <th>Score C1</th>
              </tr>
            </thead>
            <tbody>
              {reponses.map((r, idx) => {
                const code = aerodromes.find((a) => a.id === r.aerodrome_id)?.code_oaci ?? r.aerodrome_id
                return (
                  <tr key={idx}>
                    <td>
                      <span className="code-oaci-badge">{code}</span>
                    </td>
                    <td>{r.repondant_nom}</td>
                    <td>{new Date(r.submitted_at).toLocaleDateString('fr-FR')}</td>
                    <td>
                      {r.score_c1 != null ? (
                        <span className={getScoreBadgeClass(r.score_c1)}>{r.score_c1.toFixed(1)}</span>
                      ) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export default EnqueteStats