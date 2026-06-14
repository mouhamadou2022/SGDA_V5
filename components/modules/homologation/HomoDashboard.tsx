// components/modules/homologation/HomoDashboard.tsx
'use client'

import { useMemo } from 'react'
import {
  Scale,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MapPin,
  AlertCircle,
  ClipboardList,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { getPhaseStats } from '@/lib/homologationUtils'

interface HomoDashboardProps {
  userRole: string
}

const COLORS = ['#22c55e', '#eab308', '#6b7280'];

export function HomoDashboard({ userRole }: HomoDashboardProps) {
  const homologations = useAppStore(s => s.homologations);
  const aerodromes = useAppStore(s => s.aerodromes);

  const stats = useMemo(() => {
    const total = homologations.length
    const enCours = homologations.filter(h => h.statut_global === 'en_cours').length
    const homologues = homologations.filter(h => h.statut_global === 'homologue').length
    const suspendus = homologations.filter(h => h.statut_global === 'suspendu').length

    // Distribution par phase
    const parPhase = [1, 2, 3].map(phase => ({
      phase: `Phase ${phase}`,
      count: homologations.filter(
        h => h.statut_global === 'en_cours' && h.phase_active === phase
      ).length,
    }))

    // Distribution par statut
    const statutDistribution = [
      { name: 'Homologués', value: homologues, color: '#22c55e' },
      { name: 'En cours', value: enCours, color: '#eab308' },
      { name: 'Suspendus', value: suspendus, color: '#6b7280' },
    ].filter(s => s.value > 0)

    // Phases bloquées
    const blockedPhases = homologations.reduce((acc, homo) => {
      const phaseStats = getPhaseStats(homo);
      return acc + phaseStats.blocked;
    }, 0);

    const inactivePhases = homologations.reduce((acc, homo) => {
      const phaseStats = getPhaseStats(homo);
      return acc + phaseStats.inactive;
    }, 0);

    const tauxReussite = total > 0 ? Math.round((homologues / total) * 100) : 0

    return {
      total,
      enCours,
      homologues,
      suspendus,
      blockedPhases,
      inactivePhases,
      parPhase,
      statutDistribution,
      tauxReussite
    }
  }, [homologations])

  const kpis = [
    { label: 'Total aérodromes', value: stats.total, icon: <MapPin className="h-5 w-5" />, color: 'text-role-primary' },
    { label: 'En cours', value: stats.enCours, icon: <Clock className="h-5 w-5" />, color: 'text-warning' },
    { label: 'Homologués', value: stats.homologues, icon: <CheckCircle2 className="h-5 w-5" />, color: 'text-success' },
    { label: 'Phases bloquées', value: stats.blockedPhases, icon: <AlertCircle className="h-5 w-5" />, color: 'text-danger' },
    { label: 'Phases inactives', value: stats.inactivePhases, icon: <AlertTriangle className="h-5 w-5" />, color: 'text-warning' },
  ]

  const barColor = 'var(--role-primary)'

  return (
    <div className="space-y-6 animate-fade-in" data-role={userRole} data-module="homologation-dashboard">

      {/* KPIs */}
      <div className="kpi-grid">
        {kpis.map((kpi, idx) => (
          <div key={kpi.label} className="kpi-card animate-fade-up" style={{ animationDelay: `${idx * 0.05}s` }}>
            <div className="kpi-icon bg-role-primary-soft">
              {kpi.icon}
            </div>
            <div className="kpi-label">{kpi.label}</div>
            <div className={`kpi-value ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Taux de réussite */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <Card icon={<CheckCircle2 className="h-4 w-4 text-role-primary" />} title="Taux d'homologation">
            <div className="text-center">
              <div className="text-4xl font-bold text-role-primary mb-2">{stats.tauxReussite}%</div>
              <div className="progress h-2">
                <div className="progress-bar" style={{ width: `${stats.tauxReussite}%` }} />
              </div>
              <p className="text-small text-muted mt-3">
                {stats.homologues} aérodromes homologués sur {stats.total} éligibles
              </p>
            </div>
          </Card>
        </div>

        {/* Bloc info phases bloquées */}
        {stats.blockedPhases > 0 && (
          <div className="animate-fade-up" style={{ animationDelay: '0.25s' }}>
            <Card icon={<AlertCircle className="h-4 w-4 text-danger" />} title="Phases sans évolution" levelColor="danger">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-bold text-danger">{stats.blockedPhases}</div>
                  <p className="text-small text-muted">phase(s) bloquée(s) depuis plus de 60 jours</p>
                </div>
                <span className="badge danger pulse">Action requise</span>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BarChart - Homologations par phase */}
        <div className="animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <Card icon={<ClipboardList className="h-4 w-4 text-role-primary" />} title="Homologations en cours par phase">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.parPhase} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="phase" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--background)',
                    borderColor: 'var(--border)',
                    borderRadius: 'var(--border-radius-lg)',
                    color: 'var(--foreground)'
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }}
                  formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                />
                <Bar dataKey="count" name="En cours" fill={barColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* PieChart - Distribution des statuts */}
        <div className="animate-fade-up" style={{ animationDelay: '0.35s' }}>
          <Card icon={<Scale className="h-4 w-4 text-role-primary" />} title="Distribution des statuts">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={stats.statutDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                   label={({ name, percent }: any) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                  labelLine={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
                >
                  {stats.statutDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--background)',
                    borderColor: 'var(--border)',
                    borderRadius: 'var(--border-radius-lg)',
                    color: 'var(--foreground)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default HomoDashboard