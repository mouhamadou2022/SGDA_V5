// components/modules/certification/CertDashboard.tsx
'use client'

import { useMemo } from 'react'
import {
  FileText,
  Users,
  AlertTriangle,
  Globe,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  AlertCircle,
  TrendingUp,
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
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import type { Certification } from '@/lib/store'

interface CertDashboardProps {
  userRole: string;
}

const COLORS = ['#22c55e', '#eab308', '#ef4444', '#6b7280'];

export function CertDashboard({ userRole }: CertDashboardProps) {
  const certifications = useOptimizedStore(s => s.certifications);
  const aerodromes = useOptimizedStore(s => s.aerodromes);
  const utilisateurs = useOptimizedStore(s => s.utilisateurs);
  const ecarts = useOptimizedStore(s => s.ecarts);

  const stats = useMemo(() => {
    const now = new Date()
    const total = certifications.length
    const enCours = certifications.filter(c => c.statut_global === 'en_cours').length
    const certifies = certifications.filter(c => c.statut_global === 'certifie').length
    const expires = certifications.filter(c => c.statut_global === 'expire').length
    const suspendus = certifications.filter(c => c.statut_global === 'suspendu').length

    // Alertes expiration
    const alertesExpiration = certifications.filter(c => {
      if (!c.date_expiration) return false
      const diffJ = Math.floor(
        (new Date(c.date_expiration).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      return diffJ >= 0 && diffJ < 180
    })

    // Alertes critiques (< 30 jours)
    const alertesCritiques = certifications.filter(c => {
      if (!c.date_expiration) return false
      const diffJ = Math.floor(
        (new Date(c.date_expiration).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      return diffJ >= 0 && diffJ < 30
    })

    // Phases bloquées (> 60 jours sans activité)
    const phasesBloquees = certifications.reduce((acc, cert) => {
      const phaseActive = cert.phase_active || 1
      const phaseData = cert.phases_data?.[`phase${phaseActive}`] as any
      if (phaseData?.last_activity) {
        const lastActivity = new Date(phaseData.last_activity)
        const daysInactive = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
        if (daysInactive > 60) acc++
      } else if (phaseData?.date_reception) {
        const dateReception = new Date(phaseData.date_reception)
        const daysSince = Math.floor((now.getTime() - dateReception.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSince > 60) acc++
      }
      return acc
    }, 0)

    // Distribution par phase
    const parPhase = [1, 2, 3, 4, 5].map(phase => ({
      phase: `Phase ${phase}`,
      count: certifications.filter(
        c => c.statut_global === 'en_cours' && c.phase_active === phase
      ).length,
    }))

    // Distribution par statut pour camembert
    const statutDistribution = [
      { name: 'Certifiés', value: certifies, color: '#22c55e' },
      { name: 'En cours', value: enCours, color: '#eab308' },
      { name: 'Expirés', value: expires, color: '#ef4444' },
      { name: 'Suspendus', value: suspendus, color: '#6b7280' },
    ].filter(s => s.value > 0)

    // Évolution mensuelle (simulée à partir des dates de certification)
    const evolutionMensuelle = []
    const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
    for (let i = 0; i < 12; i++) {
      const count = certifications.filter(c => {
        if (!c.created_at) return false
        return new Date(c.created_at).getMonth() === i
      }).length
      evolutionMensuelle.push({ mois: mois[i], certifies: count })
    }

    const tauxReussite = total > 0 ? Math.round((certifies / total) * 100) : 0
    const renouvellementsPrevus = certifications.filter(c => {
      if (!c.date_expiration) return false
      const diffJ = Math.floor(
        (new Date(c.date_expiration).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      return diffJ >= 0 && diffJ < 180
    }).length

    // Délai moyen par phase
    const delaiMoyenParPhase = [1, 2, 3, 4, 5].map(phase => {
      const durees: number[] = []
      certifications.forEach(cert => {
        const phaseData = (cert.phases_data as any)?.[`phase${phase}`]
        if (phaseData?.date_reception && phaseData?.cloture_le) {
          const debut = new Date(phaseData.date_reception)
          const fin = new Date(phaseData.cloture_le)
          const duree = Math.ceil((fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24))
          durees.push(duree)
        }
      })
      const moyenne = durees.length > 0 ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) : 0
      return { phase: `Phase ${phase}`, duree: moyenne }
    })

    return { 
      total, 
      enCours, 
      certifies, 
      expires,
      suspendus,
      alertesExpiration: alertesExpiration.length,
      alertesCritiques: alertesCritiques.length,
      phasesBloquees,
      parPhase, 
      statutDistribution,
      evolutionMensuelle,
      tauxReussite, 
      renouvellementsPrevus,
      delaiMoyenParPhase
    }
  }, [certifications])

  const kpis = [
    {
      label: 'Total éligibles',
      value: stats.total,
      icon: <Globe className="h-5 w-5" />,
      trend: `${stats.tauxReussite}% certifiés`,
      trendUp: true,
    },
    {
      label: 'En cours',
      value: stats.enCours,
      icon: <Clock className="h-5 w-5" />,
      trend: `${stats.parPhase.reduce((acc, p) => acc + p.count, 0)} phases actives`,
      trendUp: false,
    },
    {
      label: 'Certifiés',
      value: stats.certifies,
      icon: <ShieldCheck className="h-5 w-5" />,
      trend: `+${stats.certifies} depuis janvier`,
      trendUp: true,
    },
    {
      label: 'Expirés',
      value: stats.expires,
      icon: <ShieldAlert className="h-5 w-5" />,
      trend: stats.expires > 0 ? 'Action requise' : 'OK',
      trendUp: false,
      danger: stats.expires > 0,
    },
    {
      label: 'Alertes expiration',
      value: stats.alertesExpiration,
      icon: <Calendar className="h-5 w-5" />,
      trend: `${stats.alertesCritiques} critiques < 30j`,
      trendUp: false,
      warning: stats.alertesExpiration > 0,
    },
    {
      label: 'Phases bloquées',
      value: stats.phasesBloquees,
      icon: <AlertCircle className="h-5 w-5" />,
      trend: '> 60j sans activité',
      trendUp: false,
      danger: stats.phasesBloquees > 0,
    },
  ]

  const barColor = 'var(--role-primary)'

  return (
    <div className="space-y-6 animate-fade-in" data-module="cert-dashboard" data-role={userRole}>

      {/* KPIs */}
      <div className="kpi-grid">
        {kpis.map((kpi, idx) => (
          <div key={kpi.label} className="kpi-card animate-fade-up" style={{ animationDelay: `${idx * 0.05}s` }}>
            <div className="kpi-icon">{kpi.icon}</div>
            <div className="kpi-content">
              <div className="kpi-label">{kpi.label}</div>
              <div className={`kpi-value ${kpi.danger ? 'text-danger' : kpi.warning ? 'text-warning' : ''}`}>
                {kpi.value}
              </div>
              <div className={`kpi-trend ${kpi.trendUp ? 'up' : 'down'}`}>{kpi.trend}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Alertes critiques */}
      {stats.alertesCritiques > 0 && (
        <div className="alert alert-error animate-fade-up">
          <AlertTriangle className="alert-icon" />
          <div className="alert-content flex-1">
            <div className="alert-title">Alertes critiques d'expiration</div>
            <div className="alert-description">
              {stats.alertesCritiques} certification(s) expirent dans moins de 30 jours. Une action immédiate est requise.
            </div>
          </div>
          <button className="btn btn-sm btn-danger">Voir les alertes</button>
        </div>
      )}

      {/* Bloc info phases bloquées */}
      {stats.phasesBloquees > 0 && (
        <div className="alert alert-warning animate-fade-up">
          <AlertCircle className="alert-icon" />
          <div className="alert-content flex-1">
            <div className="alert-title">Phases sans évolution</div>
            <div className="alert-description">
              {stats.phasesBloquees} phase(s) sont bloquées depuis plus de 60 jours sans activité.
            </div>
          </div>
          <button className="btn btn-sm btn-warning">Examiner</button>
        </div>
      )}

      {/* Taux de réussite + Renouvellements */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card col-span-1 animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="card-header pb-2">
            <div className="card-title text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-role-primary" />
              Taux de certification
            </div>
          </div>
          <div className="card-content">
            <div className="text-center">
              <div className="text-4xl font-bold text-role-primary mb-2">{stats.tauxReussite}%</div>
              <div className="progress h-2">
                <div className="progress-bar" style={{ width: `${stats.tauxReussite}%` }} />
              </div>
              <p className="text-small text-muted mt-3">
                {stats.certifies} aérodromes certifiés sur {stats.total} éligibles
              </p>
            </div>
          </div>
        </div>

        <div className="card col-span-2 animate-fade-up" style={{ animationDelay: '0.25s' }}>
          <div className="card-header pb-2">
            <div className="card-title text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 text-role-primary" />
              Renouvellements prévus (6 mois)
            </div>
          </div>
          <div className="card-content">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-role-primary">{stats.renouvellementsPrevus}</div>
                <p className="text-small text-muted">certifications à renouveler</p>
              </div>
              {stats.renouvellementsPrevus > 0 && (
                <span className="badge warning pulse">Planifier les renouvellements</span>
              )}
            </div>
            {stats.renouvellementsPrevus > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>Progression des renouvellements</span>
                  <span>0%</span>
                </div>
                <div className="progress h-1">
                  <div className="progress-bar" style={{ width: '0%' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BarChart - Certifications par phase */}
        <div className="card animate-fade-up" style={{ animationDelay: '0.3s' }}>
          <div className="card-header pb-2">
            <div className="card-title text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-role-primary" />
              Certifications en cours par phase
            </div>
          </div>
          <div className="card-content">
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
          </div>
        </div>

        {/* PieChart - Distribution des statuts */}
        <div className="card animate-fade-up" style={{ animationDelay: '0.35s' }}>
          <div className="card-header pb-2">
            <div className="card-title text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-role-primary" />
              Distribution des statuts
            </div>
          </div>
          <div className="card-content">
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
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
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
          </div>
        </div>

        {/* LineChart - Évolution mensuelle */}
        <div className="card animate-fade-up" style={{ animationDelay: '0.4s' }}>
          <div className="card-header pb-2">
            <div className="card-title text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-role-primary" />
              Évolution des certifications
            </div>
          </div>
          <div className="card-content">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.evolutionMensuelle} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mois" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
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
                <Line 
                  type="monotone" 
                  dataKey="certifies" 
                  name="Certifications" 
                  stroke={barColor} 
                  strokeWidth={2}
                  dot={{ fill: barColor, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BarChart - Délai moyen par phase */}
        <div className="card animate-fade-up" style={{ animationDelay: '0.45s' }}>
          <div className="card-header pb-2">
            <div className="card-title text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-role-primary" />
              Délai moyen par phase (jours)
            </div>
          </div>
          <div className="card-content">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.delaiMoyenParPhase} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="phase" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--background)',
                    borderColor: 'var(--border)',
                    borderRadius: 'var(--border-radius-lg)',
                    color: 'var(--foreground)'
                  }}
                  formatter={(value) => [`${value} jours`, 'Délai moyen']}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: 'var(--foreground)' }}
                  formatter={(value) => <span className="text-muted-foreground">{value}</span>}
                />
                <Bar dataKey="duree" name="Délai moyen" fill={barColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CertDashboard