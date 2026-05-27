// components/modules/profil-risque/BowTieViewer.tsx
// Visualisation du modèle Boie-Tie (Bow-Tie) pour l'analyse des barrières
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// - .card, .card-header, .card-content, .card-title
// - .badge, .badge.danger, .badge.warning, .badge.success
// - .progress, .progress-bar
// - .alert, .alert-error, .alert-warning, .alert-success
// - .animate-pulse
// 0 style inline, 0 fetch direct

'use client'

import { useState } from 'react'
import { Shield, AlertTriangle, CheckCircle, XCircle, Plus, Minus, Target, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { BowTieModele, Barriere } from '@/lib/risque/types'

interface BowTieViewerProps {
  models: BowTieModele[]
  domaines: string[]
  onModelUpdate?: (model: BowTieModele) => void
}

function getEfficaciteClass(efficacite: number): string {
  if (efficacite >= 80) return 'badge success'
  if (efficacite >= 60) return 'badge primary'
  if (efficacite >= 40) return 'badge warning'
  return 'badge danger'
}

function getEfficaciteColor(efficacite: number): string {
  if (efficacite >= 80) return 'text-green-600'
  if (efficacite >= 60) return 'text-blue-600'
  if (efficacite >= 40) return 'text-orange-600'
  return 'text-red-600'
}

function getRisqueResiduelClass(probabilite: number): string {
  if (probabilite >= 50) return 'badge danger pulse'
  if (probabilite >= 30) return 'badge warning'
  if (probabilite >= 15) return 'badge primary'
  return 'badge success'
}

export function BowTieViewer({ models, domaines, onModelUpdate }: BowTieViewerProps) {
  const [selectedDomaine, setSelectedDomaine] = useState<string | null>(domaines[0] || null)
  
  const currentModel = models.find(m => m.domaine === selectedDomaine)
  
  return (
    <Card className="card-premium">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-600" />
              Modèle Boie-Tie — Analyse des barrières
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Identification des défaillances et évaluation des barrières préventives et correctives
            </p>
          </div>
          <select
            className="form-select text-sm py-1"
            value={selectedDomaine || ''}
            onChange={(e) => setSelectedDomaine(e.target.value)}
          >
            {domaines.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-5">
        {currentModel ? (
          <>
            {/* Danger → Défaillance → Scénario → Conséquence */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span className="text-xs font-semibold text-red-700">Danger</span>
                </div>
                <p className="text-sm font-medium text-gray-800">{currentModel.danger}</p>
              </div>
              
              <div className="relative flex items-center justify-center">
                <div className="w-full h-0.5 bg-gray-300" />
                <span className="absolute bg-background px-2 text-xs text-muted-foreground">→</span>
              </div>
              
              <div className="bg-orange-50 rounded-xl p-3 text-center border border-orange-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Target className="w-4 h-4 text-orange-600" />
                  <span className="text-xs font-semibold text-orange-700">Défaillance</span>
                </div>
                <p className="text-sm font-medium text-gray-800">{currentModel.defaillance}</p>
              </div>
              
              <div className="relative flex items-center justify-center">
                <div className="w-full h-0.5 bg-gray-300" />
                <span className="absolute bg-white px-2 text-xs text-gray-400">→</span>
              </div>
              
              <div className="bg-yellow-50 rounded-xl p-3 text-center border border-yellow-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Zap className="w-4 h-4 text-yellow-600" />
                  <span className="text-xs font-semibold text-yellow-700">Scénario</span>
                </div>
                <p className="text-sm font-medium text-gray-800">{currentModel.scenario}</p>
              </div>
              
              <div className="relative flex items-center justify-center">
                <div className="w-full h-0.5 bg-gray-300" />
                <span className="absolute bg-white px-2 text-xs text-gray-400">→</span>
              </div>
              
              <div className="bg-purple-50 rounded-xl p-3 text-center border border-purple-200">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertTriangle className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-semibold text-purple-700">Conséquence</span>
                </div>
                <p className="text-sm font-medium text-gray-800">{currentModel.consequence}</p>
              </div>
            </div>
            
            {/* Barrières préventives */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-600" />
                <h3 className="text-sm font-semibold text-gray-700">Barrières préventives</h3>
                <Badge variant="outline" className="text-[10px]">
                  {currentModel.barrieresPreventives.length} barrière(s)
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentModel.barrieresPreventives.map((barriere, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      barriere.efficace
                        ? 'border-green-200 bg-green-50'
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{barriere.nom}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Dernier test: {barriere.dernierTest || 'Non testé'}
                        </p>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {barriere.efficace ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-600" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            {barriere.efficace ? 'Barrière efficace' : 'Barrière inefficace'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-0.5">
                        <span>Efficacité</span>
                        <span className={getEfficaciteColor(barriere.efficacite)}>
                          {barriere.efficacite}%
                        </span>
                      </div>
                      <Progress
                        value={barriere.efficacite}
                        className={`h-1.5 ${
                          barriere.efficacite >= 80 ? 'progress-faible' :
                          barriere.efficacite >= 60 ? 'progress-moyen' :
                          barriere.efficacite >= 40 ? 'progress-eleve' : 'progress-critique'
                        }`}
                      />
                    </div>
                    {barriere.remarque && (
                      <p className="text-xs text-gray-500 mt-2 italic">{barriere.remarque}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Barrières correctives */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-700">Barrières correctives</h3>
                <Badge variant="outline" className="text-[10px]">
                  {currentModel.barrieresCorrectives.length} barrière(s)
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentModel.barrieresCorrectives.map((barriere, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border ${
                      barriere.efficace
                        ? 'border-green-200 bg-green-50'
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{barriere.nom}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Dernier test: {barriere.dernierTest || 'Non testé'}
                        </p>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {barriere.efficace ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-600" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent>
                            {barriere.efficace ? 'Barrière efficace' : 'Barrière inefficace'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-0.5">
                        <span>Efficacité</span>
                        <span className={getEfficaciteColor(barriere.efficacite)}>
                          {barriere.efficacite}%
                        </span>
                      </div>
                      <Progress
                        value={barriere.efficacite}
                        className={`h-1.5 ${
                          barriere.efficacite >= 80 ? 'progress-faible' :
                          barriere.efficacite >= 60 ? 'progress-moyen' :
                          barriere.efficacite >= 40 ? 'progress-eleve' : 'progress-critique'
                        }`}
                      />
                    </div>
                    {barriere.remarque && (
                      <p className="text-xs text-gray-500 mt-2 italic">{barriere.remarque}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
            
            {/* Risque résiduel */}
            <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs text-gray-500">Risque résiduel</p>
                  <p className="text-lg font-bold" style={{ color: getRisqueResiduelClass(currentModel.probabiliteResiduelle) === 'badge danger pulse' ? '#dc2626' : '#eab308' }}>
                    {currentModel.probabiliteResiduelle}%
                  </p>
                </div>
                <Badge className={getRisqueResiduelClass(currentModel.probabiliteResiduelle)}>
                  {currentModel.niveauRisqueResiduel === 'critique' ? 'Critique' :
                   currentModel.niveauRisqueResiduel === 'eleve' ? 'Élevé' :
                   currentModel.niveauRisqueResiduel === 'moyen' ? 'Moyen' : 'Faible'}
                </Badge>
                <p className="text-xs text-gray-500 max-w-md">
                  Probabilité qu&apos;un incident survienne malgré les barrières en place
                </p>
              </div>
              <Progress
                value={currentModel.probabiliteResiduelle}
                className={`h-2 mt-3 ${
                  currentModel.probabiliteResiduelle >= 50 ? 'progress-critique' :
                  currentModel.probabiliteResiduelle >= 30 ? 'progress-eleve' :
                  currentModel.probabiliteResiduelle >= 15 ? 'progress-moyen' : 'progress-faible'
                }`}
              />
            </div>
            
            {/* Dernière évaluation */}
            <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
              Dernière évaluation: {currentModel.lastAssessed ? new Date(currentModel.lastAssessed).toLocaleDateString('fr-FR') : 'N/A'}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">
            <Shield className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Aucun modèle Boie-Tie configuré pour ce domaine</p>
            <p className="text-xs mt-1">Veuillez configurer les barrières dans l&apos;administration</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default BowTieViewer