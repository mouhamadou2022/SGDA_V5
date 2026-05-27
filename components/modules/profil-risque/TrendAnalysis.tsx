// components/modules/profil-risque/TrendAnalysis.tsx
// Analyse des tendances avec graphiques et détection d'inflexions
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// - .card, .card-header, .card-content, .card-title
// - .badge, .badge.success, .badge.warning, .badge.danger
// - .progress, .progress-bar
// - .alert, .alert-info, .alert-warning
// 0 style inline, 0 fetch direct

'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Activity, Calendar, Info, AlertTriangle } from 'lucide-react'
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
import { TrendAnalysis as TrendAnalysisType, InflexionPoint } from '@/lib/risque/trends'

interface TrendAnalysisProps {
  historiqueScores: { date: string; score: number }[]
  longTermTrend: TrendAnalysisType
  shortTermTrend: TrendAnalysisType
  inflexions: InflexionPoint[]
  domaine?: string
}

function getTrendIcon(tendance: string) {
  if (tendance === 'hausse') return <TrendingUp className="w-4 h-4 text-green-500" />
  if (tendance === 'baisse') return <TrendingDown className="w-4 h-4 text-red-500 animate-pulse" />
  return <Minus className="w-4 h-4 text-gray-400" />
}

function getTrendClass(tendance: string): string {
  if (tendance === 'hausse') return 'text-green-600'
  if (tendance === 'baisse') return 'text-red-600'
  return 'text-gray-500'
}

function getTrendBadge(tendance: string): string {
  if (tendance === 'hausse') return 'badge success'
  if (tendance === 'baisse') return 'badge danger'
  return 'badge neutral'
}

export function TrendAnalysis({ historiqueScores, longTermTrend, shortTermTrend, inflexions, domaine }: TrendAnalysisProps) {
  const [showInflexions, setShowInflexions] = useState(true)
  
  const dernierScore = historiqueScores[historiqueScores.length - 1]?.score || 0
  const premierScore = historiqueScores[0]?.score || 0
  const evolutionGlobale = dernierScore - premierScore
  const evolutionGlobalePercent = premierScore !== 0 ? (evolutionGlobale / premierScore) * 100 : 0
  
  const compareTrends = useMemo(() => {
    if (shortTermTrend.tendance === 'hausse' && longTermTrend.tendance === 'hausse') return 'Amélioration continue'
    if (shortTermTrend.tendance === 'hausse' && longTermTrend.tendance === 'baisse') return 'Inflexion positive — tendance qui se redresse'
    if (shortTermTrend.tendance === 'baisse' && longTermTrend.tendance === 'hausse') return '⚠️ Inflexion négative — début de dégradation'
    if (shortTermTrend.tendance === 'baisse' && longTermTrend.tendance === 'baisse') return 'Dégradation continue'
    if (shortTermTrend.tendance === 'stable' && longTermTrend.tendance === 'hausse') return 'Ralentissement de l\'amélioration'
    if (shortTermTrend.tendance === 'stable' && longTermTrend.tendance === 'baisse') return 'Stabilisation après dégradation'
    return 'Tendance stable'
  }, [shortTermTrend, longTermTrend])
  
  const getRecommendation = () => {
    if (shortTermTrend.tendance === 'baisse' && Math.abs(shortTermTrend.pente) > 2) {
      return 'Action immédiate requise — dégradation rapide'
    }
    if (shortTermTrend.tendance === 'baisse') {
      return 'Surveillance renforcée recommandée'
    }
    if (inflexions.length > 0 && inflexions[inflexions.length - 1].direction === 'baisse') {
      return 'Inflexion récente détectée — analyser les causes'
    }
    if (shortTermTrend.tendance === 'hausse' && longTermTrend.tendance === 'hausse') {
      return 'Maintenir les bonnes pratiques'
    }
    return 'Maintien de la surveillance programmée'
  }
  
  return (
    <Card className="card-premium">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-600" />
              Analyse des tendances
              {domaine && <span className="text-sm text-gray-400">— {domaine}</span>}
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Évolution du score sur 12 mois et détection des inflexions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInflexions(!showInflexions)}
              className="text-xs gap-1"
            >
              <Calendar className="w-3 h-3" />
              {showInflexions ? 'Masquer' : 'Afficher'} les inflexions
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-5">
        {/* Évolution globale */}
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Évolution sur 12 mois</span>
            <div className={`flex items-center gap-1 ${evolutionGlobale >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {evolutionGlobale >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="text-lg font-bold">
                {evolutionGlobale >= 0 ? '+' : ''}{evolutionGlobale} points
              </span>
              <span className="text-xs">
                ({evolutionGlobalePercent >= 0 ? '+' : ''}{evolutionGlobalePercent.toFixed(1)}%)
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2 text-xs">
            <span className="text-gray-400">Score initial: {premierScore}</span>
            <span className="text-gray-400">Score actuel: {dernierScore}</span>
          </div>
          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${evolutionGlobale >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, Math.abs(evolutionGlobale))}%`, marginLeft: evolutionGlobale >= 0 ? '0' : `${100 - Math.min(100, Math.abs(evolutionGlobale))}%` }}
            />
          </div>
        </div>
        
        {/* Graphique simplifié */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            {historiqueScores.slice(-12).map((point, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div
                  className={`w-1.5 rounded-full ${
                    point.score >= 80 ? 'bg-green-500' :
                    point.score >= 60 ? 'bg-blue-500' :
                    point.score >= 30 ? 'bg-orange-500' : 'bg-red-500'
                  }`}
                  style={{ height: `${point.score / 2}px` }}
                />
                <span className="text-[8px] mt-1">{point.date ? new Date(point.date).getMonth() + 1 : '-'}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Tendances */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Tendance long terme (12 mois)</span>
              <Badge className={getTrendBadge(longTermTrend.tendance)}>
                {longTermTrend.tendance === 'hausse' ? 'Hausse' : longTermTrend.tendance === 'baisse' ? 'Baisse' : 'Stable'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {getTrendIcon(longTermTrend.tendance)}
              <span className={`text-sm font-semibold ${getTrendClass(longTermTrend.tendance)}`}>
                Pente: {longTermTrend.pente > 0 ? '+' : ''}{longTermTrend.pente.toFixed(2)} pts/mois
              </span>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-0.5">
                <span>Corrélation (R²)</span>
                <span>{longTermTrend.coefficientCorrelation.toFixed(2)}</span>
              </div>
              <Progress value={longTermTrend.coefficientCorrelation * 100} className="h-1.5" />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Basé sur {longTermTrend.pointsAnalyse} points
            </p>
          </div>
          
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500">Tendance court terme (3 mois)</span>
              <Badge className={getTrendBadge(shortTermTrend.tendance)}>
                {shortTermTrend.tendance === 'hausse' ? 'Hausse' : shortTermTrend.tendance === 'baisse' ? 'Baisse' : 'Stable'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {getTrendIcon(shortTermTrend.tendance)}
              <span className={`text-sm font-semibold ${getTrendClass(shortTermTrend.tendance)}`}>
                Pente: {shortTermTrend.pente > 0 ? '+' : ''}{shortTermTrend.pente.toFixed(2)} pts/mois
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {compareTrends}
            </p>
          </div>
        </div>
        
        {/* Inflexions */}
        {showInflexions && inflexions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
              Points d&apos;inflexion détectés ({inflexions.length})
            </p>
            <div className="space-y-1.5">
              {inflexions.slice(-5).reverse().map((inf, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2">
                    {inf.direction === 'hausse' ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}
                    <span className="text-sm font-medium text-gray-700">
                      {inf.date ? new Date(inf.date).toLocaleDateString('fr-FR') : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">{inf.valeurAvant} → {inf.valeurApres}</span>
                    <span className={`font-semibold ${inf.direction === 'hausse' ? 'text-green-600' : 'text-red-600'}`}>
                      {inf.direction === 'hausse' ? '+' : ''}{inf.amplitude} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Recommandation */}
        <div className="alert alert-info">
          <span className="alert-icon">💡</span>
          <div className="alert-content">
            <p className="alert-title">Recommandation</p>
            <p className="alert-description">{getRecommendation()}</p>
          </div>
        </div>
        
        {/* Note */}
        <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
          Analyse des tendances basée sur {historiqueScores.length} points d&apos;historique
        </div>
      </CardContent>
    </Card>
  )
}

export default TrendAnalysis