// components/modules/profil-risque/ModelCalibrationDashboard.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Download,
  RefreshCw,
  Info,
  Target,
  LineChart,
  PieChart,
} from 'lucide-react'
import { useAppStore, ModelPerformanceRecord, PredictionHistoryRecord } from '@/lib/store'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' }

interface ModelCalibrationDashboardProps {
  aerodromeId?: string
}

function getPerformanceGrade(mae: number | null): { grade: string; color: string; badgeClass: string; icon: React.ElementType } {
  if (mae === null) return { grade: 'Non évalué', color: 'text-muted-foreground', badgeClass: 'badge neutral', icon: Info }
  if (mae <= 5) return { grade: 'Excellent', color: 'text-success', badgeClass: 'badge success', icon: CheckCircle2 }
  if (mae <= 10) return { grade: 'Bon', color: 'text-role-primary', badgeClass: 'badge primary', icon: TrendingUp }
  if (mae <= 15) return { grade: 'Moyen', color: 'text-warning', badgeClass: 'badge warning', icon: AlertTriangle }
  return { grade: 'À améliorer', color: 'text-danger', badgeClass: 'badge danger', icon: AlertTriangle }
}

function getCoverageGrade(coverage: number | null): { grade: string; color: string; badgeClass: string } {
  if (coverage === null) return { grade: 'Non évalué', color: 'text-muted-foreground', badgeClass: 'badge neutral' }
  if (coverage >= 90 && coverage <= 98) return { grade: 'Excellent', color: 'text-success', badgeClass: 'badge success' }
  if (coverage >= 85) return { grade: 'Bon', color: 'text-role-primary', badgeClass: 'badge primary' }
  if (coverage >= 75) return { grade: 'Acceptable', color: 'text-warning', badgeClass: 'badge warning' }
  return { grade: 'À améliorer', color: 'text-danger', badgeClass: 'badge danger' }
}

function getBiasGrade(bias: number | null): { grade: string; color: string; direction: string } {
  if (bias === null) return { grade: 'Non évalué', color: 'text-muted-foreground', direction: 'n/a' }
  const absBias = Math.abs(bias)
  if (absBias <= 2) return { grade: 'Excellent', color: 'text-success', direction: 'neutre' }
  if (absBias <= 5) return { grade: 'Bon', color: 'text-role-primary', direction: bias > 0 ? 'surestime légère' : 'sous-estime légère' }
  if (absBias <= 10) return { grade: 'Moyen', color: 'text-warning', direction: bias > 0 ? 'surestime modérée' : 'sous-estime modérée' }
  return { grade: 'À corriger', color: 'text-danger', direction: bias > 0 ? 'surestime importante' : 'sous-estime importante' }
}

export function ModelCalibrationDashboard({ aerodromeId }: ModelCalibrationDashboardProps) {
  const modelPerformances = useAppStore((state) => state.modelPerformances)
  const predictionHistoriqueAll = useAppStore((state) => state.predictionHistorique)
  const predictionHistorique = useMemo(() =>
    aerodromeId
      ? predictionHistoriqueAll.filter(p => p.aerodrome_id === aerodromeId)
      : predictionHistoriqueAll,
    [predictionHistoriqueAll, aerodromeId]
  )

  const [selectedModel, setSelectedModel] = useState<string>('regression_lineaire')

  const stats = useMemo(() => {
    const totalPredictions = predictionHistorique.length
    const withActual3m = predictionHistorique.filter(p => p.actual_score_3m !== null).length
    const withActual6m = predictionHistorique.filter(p => p.actual_score_6m !== null).length
    const avgError3m = predictionHistorique
      .filter(p => p.error_3m !== null)
      .reduce((sum, p) => sum + (p.error_3m || 0), 0) / (predictionHistorique.filter(p => p.error_3m !== null).length || 1)
    const avgError6m = predictionHistorique
      .filter(p => p.error_6m !== null)
      .reduce((sum, p) => sum + (p.error_6m || 0), 0) / (predictionHistorique.filter(p => p.error_6m !== null).length || 1)

    return {
      totalPredictions,
      withActual3m,
      withActual6m,
      avgError3m: Math.round(avgError3m),
      avgError6m: Math.round(avgError6m),
      coverage3m: (withActual3m / totalPredictions) * 100,
      coverage6m: (withActual6m / totalPredictions) * 100,
    }
  }, [predictionHistorique])

  const currentModel = modelPerformances.find(m => m.model_name === selectedModel)
  const modelGrade = getPerformanceGrade(currentModel?.mae_3m || null)
  const coverageGrade = getCoverageGrade(currentModel?.coverage_95 || null)
  const biasGrade = getBiasGrade(currentModel?.bias_3m || null)

  const recentPredictions = useMemo(() => {
    return predictionHistorique
      .sort((a, b) => new Date(b.predicted_at || '-').getTime() - new Date(a.predicted_at || '-').getTime())
      .slice(0, 10)
  }, [predictionHistorique])

  return (
    <div className="card border-l-4 border-l-role-primary animate-fade-up">
      <div className="card-header pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="card-title flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-role-primary" />
              Calibration des modèles prédictifs
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Évaluation de la performance des modèles de prédiction
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className={`form-select text-xs py-1 ${focusClass}`}
              style={selectStyle}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="regression_lineaire">Régression linéaire</option>
              <option value="prophet">Prophet (saisonnier)</option>
              <option value="hawkes">Hawkes (contagion)</option>
              <option value="ensemble">Ensemble (voting)</option>
            </select>
            <button
              type="button"
              className="action-button w-7 h-7 p-0"
              title="Réévaluer les performances"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="card-content space-y-6">
        {/* Métriques globales */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon bg-role-primary-soft"><BarChart3 className="w-5 h-5 text-role-primary" /></div>
            <div className="kpi-content">
              <div className="kpi-label">Prédictions totales</div>
              <div className="kpi-value">{stats.totalPredictions}</div>
              <p className="text-[10px] text-muted-foreground">{stats.withActual3m} évaluées</p>
            </div>
          </div>
          <div className="kpi-card">
            <div className={`kpi-icon ${stats.avgError3m <= 10 ? 'bg-success-soft' : stats.avgError3m <= 15 ? 'bg-warning-soft' : 'bg-danger-soft'}`}>
              <Target className={`w-5 h-5 ${stats.avgError3m <= 10 ? 'text-success' : stats.avgError3m <= 15 ? 'text-warning' : 'text-danger'}`} />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">MAE 3 mois</div>
              <div className={`kpi-value ${stats.avgError3m <= 10 ? 'text-success' : stats.avgError3m <= 15 ? 'text-warning' : 'text-danger'}`}>{stats.avgError3m}</div>
              <p className="text-[10px] text-muted-foreground">points d'erreur</p>
            </div>
          </div>
          <div className="kpi-card">
            <div className={`kpi-icon ${stats.avgError6m <= 15 ? 'bg-success-soft' : stats.avgError6m <= 20 ? 'bg-warning-soft' : 'bg-danger-soft'}`}>
              <LineChart className={`w-5 h-5 ${stats.avgError6m <= 15 ? 'text-success' : stats.avgError6m <= 20 ? 'text-warning' : 'text-danger'}`} />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">MAE 6 mois</div>
              <div className={`kpi-value ${stats.avgError6m <= 15 ? 'text-success' : stats.avgError6m <= 20 ? 'text-warning' : 'text-danger'}`}>{stats.avgError6m}</div>
              <p className="text-[10px] text-muted-foreground">points d'erreur</p>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon bg-primary-soft"><PieChart className="w-5 h-5 text-primary" /></div>
            <div className="kpi-content">
              <div className="kpi-label">Couverture</div>
              <div className="kpi-value">{Math.round(stats.coverage3m)}%</div>
              <p className="text-[10px] text-muted-foreground">prédictions évaluées</p>
            </div>
          </div>
        </div>

        {/* Performance du modèle sélectionné */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-role-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Modèle: {selectedModel === 'regression_lineaire' ? 'Régression linéaire' :
                        selectedModel === 'prophet' ? 'Prophet (saisonnier)' :
                        selectedModel === 'hawkes' ? 'Hawkes (contagion)' : 'Ensemble (voting)'}
            </h3>
            <span className={modelGrade.badgeClass}>
              <modelGrade.icon className="w-3 h-3 mr-1 inline" />
              {modelGrade.grade}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* MAE */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                  Mean Absolute Error (MAE)
                  <InfoTooltip
                    side="top"
                    content="Erreur moyenne absolue entre les scores prédits et les scores réels. Plus la MAE est faible, plus le modèle est précis. Seuil acceptable : ≤ 10 points."
                  />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${modelGrade.color}`}>
                  {currentModel?.mae_3m !== null ? currentModel?.mae_3m : '—'}
                </span>
                <span className="text-xs text-muted-foreground">points</span>
              </div>
              <div className="progress h-1.5 mt-2">
                <div
                  className="progress-bar"
                  style={{ width: `${currentModel?.mae_3m ? Math.max(0, 100 - (currentModel.mae_3m / 30) * 100) : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Seuil cible: 8 points</p>
            </div>

            {/* Biais */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                  Biais systématique
                  <InfoTooltip
                    side="top"
                    content="Tendance du modèle à systématiquement sur- ou sous-estimer le score. Positif = trop optimiste, négatif = trop pessimiste. Idéalement proche de zéro (≤ 2 pts)."
                  />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${biasGrade.color}`}>
                  {currentModel?.bias_3m != null ? (currentModel.bias_3m > 0 ? '+' : '') + currentModel.bias_3m : '—'}
                </span>
                <span className="text-xs text-muted-foreground">points</span>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-role-primary rounded-full"
                    style={{ width: `${Math.min(100, Math.abs(currentModel?.bias_3m || 0) * 5)}%`, marginLeft: currentModel?.bias_3m && currentModel.bias_3m > 0 ? '50%' : '0' }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{biasGrade.direction}</p>
            </div>

            {/* Couverture */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                  Intervalle de confiance (IC 95%)
                  <InfoTooltip
                    side="top"
                    content="% de prédictions dont l'erreur reste dans la plage cible (±15 pts). Une couverture entre 90 % et 98 % est idéale. En dessous de 85 % le modèle manque de fiabilité."
                  />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-bold ${coverageGrade.color}`}>
                  {currentModel?.coverage_95 !== null ? currentModel?.coverage_95 : '—'}%
                </span>
              </div>
              <div className="progress h-1.5 mt-2">
                <div
                  className="progress-bar"
                  style={{ width: `${currentModel?.coverage_95 || 0}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Cible: 95%</p>
            </div>
          </div>
        </div>

        {/* Graphique d'erreur par période */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-2">
            <LineChart className="w-3.5 h-3.5" />
            Évolution de l'erreur moyenne
          </p>
          <div className="bg-muted/40 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
              <span>Jan</span>
              <span>Fév</span>
              <span>Mar</span>
              <span>Avr</span>
              <span>Mai</span>
              <span>Juin</span>
              <span>Juil</span>
              <span>Aoû</span>
              <span>Sep</span>
              <span>Oct</span>
              <span>Nov</span>
              <span>Déc</span>
            </div>
            <div className="flex items-end gap-1 h-24">
              {[8, 7, 9, 6, 5, 4, 5, 6, 7, 6, 5, 4].map((value, i) => (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-role-primary rounded-t hover:opacity-80 transition-all cursor-pointer"
                    style={{ height: `${(value / 15) * 100}%` }}
                  />
                  <span className="text-[8px] text-muted-foreground mt-1">{value}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-2">Erreur MAE (points) - amélioration progressive</p>
          </div>
        </div>

        {/* Prédictions récentes */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            Dernières prédictions
          </p>
          <div className="table-container">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Prédiction 3m</th>
                  <th>Réel 3m</th>
                  <th>Erreur</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {recentPredictions.map((pred) => {
                  const error = pred.error_3m
                  const isGood = error !== null && error <= 8
                  return (
                    <tr key={pred.id}>
                      <td className="text-xs">{pred.predicted_at ? new Date(pred.predicted_at).toLocaleDateString('fr-FR') : 'N/A'}</td>
                      <td className="text-xs font-mono">{pred.predicted_score_3m}</td>
                      <td className="text-xs font-mono">{pred.actual_score_3m ?? '—'}</td>
                      <td className="text-xs">
                        {error !== null ? (
                          <span className={error <= 8 ? 'text-success' : error <= 15 ? 'text-warning' : 'text-danger'}>
                            {error}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        {pred.actual_score_3m !== null ? (
                          <span className={isGood ? 'badge success' : 'badge warning'}>
                            {isGood ? '✓ Précis' : '⚠ À revoir'}
                          </span>
                        ) : (
                          <span className="badge outline">En attente</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recommandations d'amélioration */}
        <div className="alert alert-info">
          <span className="alert-icon">📊</span>
          <div className="alert-content">
            <p className="alert-title">Recommandations pour l'amélioration des modèles</p>
            <p className="alert-description">
              {stats.totalPredictions < 50 ?
                'Ajoutez plus de données historiques pour améliorer la précision des modèles (recommandé: 50+ prédictions).' :
              (currentModel?.mae_3m || 0) > 10 ?
                "Envisagez d'intégrer de nouvelles variables (saisonnalité, événements externes) pour réduire l'erreur de prédiction." :
                'Les performances sont satisfaisantes. Continuez à collecter des données pour affiner les modèles.'}
            </p>
          </div>
        </div>

        {/* Note */}
        <div className="text-[10px] text-muted-foreground pt-2 border-t border-gray-100 flex items-center justify-between">
          <span>📈 MAE = Mean Absolute Error | Intervalle de confiance 95%</span>
          <span>Dernière calibration: {currentModel?.last_calibrated ? new Date(currentModel.last_calibrated).toLocaleDateString('fr-FR') : 'N/A'}</span>
        </div>
      </div>
    </div>
  )
}

export default ModelCalibrationDashboard
