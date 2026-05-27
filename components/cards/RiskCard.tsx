// components/cards/RiskCard.tsx
'use client'

import {
  TrendingUp, TrendingDown, Minus, Activity,
  Eye, BarChart2
} from 'lucide-react'

interface RiskCardProps {
  profil: {
    aerodrome_code: string
    aerodrome_nom?: string
    score: number
    niveau: 'critique' | 'eleve' | 'moyen' | 'faible'
    tendance: 'hausse' | 'baisse' | 'stable'
    prediction_n1?: number
    prediction_n3?: number
    last_updated: string
    criteres?: {
      c1_ecarts?: number
      c2_surveillance?: number
      c3_pac?: number
      c4_historique?: number
      c5_contexte?: number
    }
  }
  onViewDetails: () => void
  onSimulate?: () => void
  userRole: string
  compact?: boolean
}

export function RiskCard({
  profil,
  onViewDetails,
  onSimulate,
  userRole,
  compact = false
}: RiskCardProps) {

  const getNiveauBadge = (niveau: string) => {
    switch (niveau) {
      case 'critique': return { label: 'Critique', cls: 'badge danger animate-pulse' }
      case 'eleve': return { label: 'Élevé', cls: 'badge warning' }
      case 'moyen': return { label: 'Moyen', cls: 'badge primary' }
      case 'faible': return { label: 'Faible', cls: 'badge success' }
      default: return { label: niveau, cls: 'badge neutral' }
    }
  }

  const tendanceMap = {
    hausse: { icon: TrendingUp, color: 'text-danger', label: 'En hausse' },
    baisse: { icon: TrendingDown, color: 'text-success', label: 'En baisse' },
    stable: { icon: Minus, color: 'text-muted-foreground', label: 'Stable' },
  }

  const config = getNiveauBadge(profil.niveau)
  const tendance = tendanceMap[profil.tendance] || tendanceMap.stable
  const TendanceIcon = tendance.icon
  const canSimulate = ['admin', 'dg_anacim', 'inspector'].includes(userRole)

  const scoreColor = profil.score >= 70 ? 'text-danger' : profil.score >= 40 ? 'text-warning' : 'text-success'
  const predColor = (s: number) => s >= 70 ? 'text-danger' : s >= 40 ? 'text-warning' : 'text-success'

  if (compact) {
    return (
      <div
        className={`card card-compact p-3 hover:shadow-lg transition-all duration-300 ${profil.niveau === 'critique' ? 'border-l-4 border-l-danger' : 'border-l-4 border-l-role-primary'}`}
        data-role={userRole}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="code-oaci-badge text-xs">{profil.aerodrome_code}</span>
          <div className="flex items-center gap-1">
            <TendanceIcon className={`w-3 h-3 ${tendance.color}`} />
            <span className={config.cls}>{config.label}</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Score</span>
          <span className={`font-bold ${scoreColor}`}>{profil.score}/100</span>
        </div>
        <div className="progress h-1.5">
          <div className="progress-bar" style={{ width: `${profil.score}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`card hover:shadow-xl transition-all duration-300 ${profil.niveau === 'critique' ? 'border-l-4 border-l-danger' : 'card-accent border-l-4 border-l-role-primary'}`}
      data-role={userRole}
    >
      <div className="card-content p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-role-primary-soft flex items-center justify-center">
              <Activity className={`w-5 h-5 ${profil.niveau === 'critique' ? 'text-danger' : 'text-role-primary'}`} />
            </div>
            <span className="code-oaci-badge">{profil.aerodrome_code}</span>
          </div>
          <div className="flex items-center gap-1">
            <TendanceIcon className={`w-4 h-4 ${tendance.color}`} />
            <span className={config.cls}>
              {config.label}
            </span>
          </div>
        </div>

        {profil.aerodrome_nom && (
          <p className="text-sm font-medium mb-2 truncate">{profil.aerodrome_nom}</p>
        )}

        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground font-medium">Score de risque</span>
            <span className={`text-lg font-bold ${scoreColor}`}>{profil.score}/100</span>
          </div>
          <div className="progress h-2">
            <div className="progress-bar" style={{ width: `${profil.score}%` }} />
          </div>
        </div>

        {(profil.prediction_n1 !== undefined || profil.prediction_n3 !== undefined) && (
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs bg-role-primary-soft rounded-md p-2">
            {profil.prediction_n1 !== undefined && (
              <div>
                <p className="text-muted-foreground">Prédiction M+1</p>
                <p className={`font-semibold ${predColor(profil.prediction_n1)}`}>
                  {profil.prediction_n1}/100
                </p>
              </div>
            )}
            {profil.prediction_n3 !== undefined && (
              <div>
                <p className="text-muted-foreground">Prédiction M+3</p>
                <p className={`font-semibold ${predColor(profil.prediction_n3)}`}>
                  {profil.prediction_n3}/100
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">
            MAJ: {new Date(profil.last_updated).toLocaleDateString('fr-FR')}
          </span>
          <div className="flex gap-1">
            <button 
              className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
              onClick={onViewDetails} 
              aria-label="Voir détails"
            >
              <Eye className="w-4 h-4" />
            </button>
            {canSimulate && onSimulate && (
              <button 
                className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
                onClick={onSimulate} 
                aria-label="Simuler"
              >
                <BarChart2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}