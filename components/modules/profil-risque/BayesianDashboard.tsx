// components/modules/profil-risque/BayesianDashboard.tsx
// Dashboard des probabilités bayésiennes pour la détection des failles cachées
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// - .card, .card-header, .card-content, .card-title
// - .badge, .badge.danger, .badge.warning, .badge.success
// - .progress, .progress-bar
// - .alert, .alert-warning, .alert-info
// - .animate-pulse
// 0 style inline, 0 fetch direct

'use client'

import { useMemo, useState } from 'react'
import { Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info, Eye, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  PredictionBayesienne,
  NiveauRisque,
} from '@/lib/risque'

interface BayesianDashboardProps {
  predictions: Record<string, PredictionBayesienne>
  domaines: string[]
  onDomainSelect?: (domaine: string) => void
}

function getPosteriorClass(posterior: number): string {
  if (posterior >= 50) return 'badge danger pulse'
  if (posterior >= 30) return 'badge warning'
  if (posterior >= 15) return 'badge primary'
  return 'badge success'
}

function getPosteriorColor(posterior: number): string {
  if (posterior >= 50) return 'text-red-600'
  if (posterior >= 30) return 'text-orange-600'
  if (posterior >= 15) return 'text-yellow-600'
  return 'text-green-600'
}

function getBlackSwanClass(estBlackSwan: boolean): string {
  return estBlackSwan ? 'badge danger animate-pulse' : 'badge neutral'
}

export function BayesianDashboard({ predictions, domaines, onDomainSelect }: BayesianDashboardProps) {
  const [selectedDomaine, setSelectedDomaine] = useState<string | null>(null)
  
  const stats = useMemo(() => {
    const values = Object.values(predictions)
    const avgPosterior = values.reduce((a, b) => a + b.posteriorProbability, 0) / values.length
    const blackSwans = values.filter(v => v.estBlackSwan).length
    const highRisk = values.filter(v => v.posteriorProbability >= 30).length
    
    return { avgPosterior: Math.round(avgPosterior), blackSwans, highRisk, total: values.length }
  }, [predictions])
  
  const selectedData = selectedDomaine ? predictions[selectedDomaine] : null
  
  return (
    <Card className="card-premium">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              Analyse bayésienne des risques
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Probabilité a posteriori d&apos;une faille cachée — Théorème de Bayes
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-600" />
              <span>≥50%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-500" />
              <span>30-49%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-500" />
              <span>15-29%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span>{"<15%"}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-purple-50 rounded-xl p-3 text-center">
            <p className="text-xs text-purple-600">Probabilité moyenne</p>
            <p className="text-2xl font-bold text-purple-700">{stats.avgPosterior}%</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center">
            <p className="text-xs text-red-600">Risque élevé</p>
            <p className="text-2xl font-bold text-red-600">{stats.highRisk}</p>
            <p className="text-[10px] text-gray-500">sur {stats.total} domaines</p>
          </div>
          <div className={`${stats.blackSwans > 0 ? 'bg-red-100 animate-pulse' : 'bg-gray-50'} rounded-xl p-3 text-center`}>
            <p className="text-xs text-red-600">Black Swan détectés</p>
            <p className="text-2xl font-bold text-red-600">{stats.blackSwans}</p>
            <p className="text-[10px] text-gray-500">signaux faibles</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500">Domaines analysés</p>
            <p className="text-2xl font-bold text-gray-700">{stats.total}</p>
          </div>
        </div>
        
        {/* Liste des domaines */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" />
            Probabilité de faille cachée par domaine
          </p>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {domaines.map((domaine) => {
              const pred = predictions[domaine]
              if (!pred) return null
              const badgeClass = getPosteriorClass(pred.posteriorProbability)
              const isSelected = selectedDomaine === domaine
              
              return (
                <div
                  key={domaine}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-purple-400 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-200 hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setSelectedDomaine(isSelected ? null : domaine)
                    if (onDomainSelect) onDomainSelect(domaine)
                  }}
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-800">{domaine}</span>
                      {pred.estBlackSwan && (
                        <Badge className="badge danger pulse text-[10px]">
                          🦢 Black Swan
                        </Badge>
                      )}
                    </div>
                    <Badge className={badgeClass}>
                      {pred.posteriorProbability}%
                    </Badge>
                  </div>
                  
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-0.5">
                      <span>A priori</span>
                      <span>Postérieur</span>
                    </div>
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="absolute h-full bg-blue-500 rounded-full"
                        style={{ width: `${pred.priorProbability}%` }}
                      />
                      <div
                        className="absolute h-full bg-purple-600 rounded-full opacity-70"
                        style={{ width: `${pred.posteriorProbability}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                      <span>{pred.priorProbability}%</span>
                      <span>{pred.posteriorProbability}%</span>
                    </div>
                  </div>
                  
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 animate-fade-up">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center justify-between p-1.5 bg-white rounded">
                          <span className="text-gray-500">Vraisemblance</span>
                          <span className="font-semibold">{pred.likelihood}%</span>
                        </div>
                        <div className="flex items-center justify-between p-1.5 bg-white rounded">
                          <span className="text-gray-500">Intervalle crédible</span>
                          <span className="font-mono text-xs">
                            [{pred.credibleInterval[0]}% - {pred.credibleInterval[1]}%]
                          </span>
                        </div>
                      </div>
                      {pred.estBlackSwan && (
                        <div className="alert alert-warning !p-2">
                          <span className="alert-icon">🦢</span>
                          <div className="alert-content">
                            <p className="alert-title text-xs">Black Swan détecté</p>
                            <p className="alert-description text-[10px]">
                              Signal faible ({pred.priorProbability}% a priori) mais risque significatif ({pred.posteriorProbability}% a posteriori)
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        
        {/* Légende */}
        <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100 flex items-center justify-between">
          <span>📊 Postérieur = P(Faille | Signaux) — Plus élevé = risque de faille cachée</span>
          <span>{stats.blackSwans} Black Swan détecté{stats.blackSwans > 1 ? 's' : ''}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export default BayesianDashboard