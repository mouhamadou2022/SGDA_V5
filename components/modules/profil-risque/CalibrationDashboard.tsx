// components/modules/profil-risque/CalibrationDashboard.tsx
// Dashboard de performance des modèles et auto-calibration
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// 0 style inline, 0 fetch direct

'use client'

import { useMemo, useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown, Activity, AlertTriangle, CheckCircle2, Calendar, RefreshCw, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MatricePerformance, CorrectionModele } from '@/lib/risque'

interface CalibrationDashboardProps {
  performance: MatricePerformance
  corrections: CorrectionModele[]
  onCalibrate: () => void
  isCalibrating?: boolean
}

function getPerformanceGrade(mae: number | null): { grade: string; color: string; badgeClass: string } {
  if (mae === null) return { grade: 'Non évalué', color: 'text-gray-400', badgeClass: 'badge neutral' }
  if (mae <= 5) return { grade: 'Excellent', color: 'text-green-600', badgeClass: 'badge success' }
  if (mae <= 10) return { grade: 'Bon', color: 'text-blue-600', badgeClass: 'badge primary' }
  if (mae <= 15) return { grade: 'Moyen', color: 'text-orange-600', badgeClass: 'badge warning' }
  return { grade: 'À améliorer', color: 'text-red-600', badgeClass: 'badge danger' }
}

function getBiasGrade(bias: number | null): { grade: string; color: string; direction: string } {
  if (bias === null) return { grade: 'Non évalué', color: 'text-gray-400', direction: 'n/a' }
  const absBias = Math.abs(bias)
  if (absBias <= 2) return { grade: 'Excellent', color: 'text-green-600', direction: 'neutre' }
  if (absBias <= 5) return { grade: 'Bon', color: 'text-blue-600', direction: bias > 0 ? 'surestime légère' : 'sous-estime légère' }
  if (absBias <= 10) return { grade: 'Moyen', color: 'text-orange-600', direction: bias > 0 ? 'surestime modérée' : 'sous-estime modérée' }
  return { grade: 'À corriger', color: 'text-red-600', direction: bias > 0 ? 'surestime importante' : 'sous-estime importante' }
}

export function CalibrationDashboard({ performance, corrections, onCalibrate, isCalibrating }: CalibrationDashboardProps) {
  const [showDetails, setShowDetails] = useState(false)
  
  const performanceGrade = getPerformanceGrade(performance.mae3m)
  const biasGrade = getBiasGrade(performance.biais3m)
  
  const besoinCorrection = useMemo(() => {
    if (performance.mae3m && performance.mae3m > 10) return true
    if (performance.biais3m && Math.abs(performance.biais3m) > 5) return true
    if (performance.coverage95 && performance.coverage95 < 85) return true
    return false
  }, [performance])
  
  return (
    <Card className="card-premium">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Calibration des modèles
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Performance des modèles prédictifs et auto-calibration
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onCalibrate}
            disabled={isCalibrating}
            className="gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCalibrating ? 'animate-spin' : ''}`} />
            {isCalibrating ? 'Calibration...' : 'Lancer calibration'}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-5">
        {/* Métriques de performance */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">MAE 3 mois</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>Erreur moyenne absolue - plus bas est mieux</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${performanceGrade.color}`}>
                {performance.mae3m !== null ? performance.mae3m : '—'}
              </span>
              <span className="text-xs text-gray-400">points</span>
            </div>
            <Progress
              value={performance.mae3m ? Math.max(0, 100 - (performance.mae3m / 30) * 100) : 0}
              className={`h-1.5 mt-2 ${
                (performance.mae3m || 0) <= 5 ? 'progress-faible' :
                (performance.mae3m || 0) <= 10 ? 'progress-moyen' :
                (performance.mae3m || 0) <= 15 ? 'progress-eleve' : 'progress-critique'
              }`}
            />
            <Badge className={`${performanceGrade.badgeClass} mt-2`}>
              {performanceGrade.grade}
            </Badge>
          </div>
          
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Biais (erreur systématique)</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>Tendance à sur/sous-estimer - proche de 0 est idéal</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${biasGrade.color}`}>
                {performance.biais3m !== null ? (performance.biais3m > 0 ? '+' : '') + performance.biais3m : '—'}
              </span>
              <span className="text-xs text-gray-400">points</span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.abs(performance.biais3m || 0) * 5)}%`, marginLeft: performance.biais3m && performance.biais3m > 0 ? '50%' : '0' }}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">{biasGrade.direction}</p>
          </div>
          
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Couverture IC95%</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3 h-3 text-gray-400 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>Pourcentage des prédictions dans l'intervalle de confiance</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-800">
                {performance.coverage95 !== null ? `${performance.coverage95}%` : '—'}
              </span>
            </div>
            <Progress
              value={performance.coverage95 || 0}
              className={`h-1.5 mt-2 ${
                (performance.coverage95 || 0) >= 90 ? 'progress-faible' :
                (performance.coverage95 || 0) >= 85 ? 'progress-moyen' :
                (performance.coverage95 || 0) >= 75 ? 'progress-eleve' : 'progress-critique'
              }`}
            />
            <p className="text-xs text-gray-500 mt-2">Cible: 95%</p>
          </div>
        </div>
        
        {/* Alerte si correction nécessaire */}
        {besoinCorrection && (
          <div className="alert alert-warning">
            <span className="alert-icon">⚠️</span>
            <div className="alert-content">
              <p className="alert-title">Calibration recommandée</p>
              <p className="alert-description">
                Les performances du modèle se sont dégradées. Lancez la calibration pour ajuster les seuils et les poids.
              </p>
            </div>
          </div>
        )}
        
        {/* Historique des corrections */}
        {corrections.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" />
                Historique des corrections
              </p>
              <Button variant="ghost" size="sm" onClick={() => setShowDetails(!showDetails)} className="text-xs">
                {showDetails ? 'Masquer' : 'Afficher'} les détails
              </Button>
            </div>
            
            {showDetails && (
              <div className="table-container">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Modèle</th>
                      <th>Type</th>
                      <th>Ancienne</th>
                      <th>Nouvelle</th>
                      <th>Raison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corrections.slice(-10).reverse().map((corr) => (
                      <tr key={corr.id}>
                        <td className="text-xs">{corr.appliqueeLe ? new Date(corr.appliqueeLe).toLocaleDateString('fr-FR') : 'N/A'}</td>
                        <td className="text-xs capitalize">{corr.modele}</td>
                        <td className="text-xs">{corr.typeCorrection}</td>
                        <td className="text-xs font-mono">{corr.ancienneValeur}</td>
                        <td className="text-xs font-mono text-green-600">{corr.nouvelleValeur}</td>
                        <td className="text-xs text-gray-500">{corr.raison.substring(0, 40)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        
        {/* Note */}
        <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100 flex items-center justify-between">
          <span>📊 Dernière calibration: {performance.derniereCalibration ? new Date(performance.derniereCalibration).toLocaleDateString('fr-FR') : 'Jamais'}</span>
          <span>{performance.nbObservations} observations analysées</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default CalibrationDashboard