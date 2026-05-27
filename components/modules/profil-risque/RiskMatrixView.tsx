// components/modules/profil-risque/RiskMatrixView.tsx
// Visualisation de la matrice OACI 5×5 avec codes couleur et interactivité
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// - .card, .card-header, .card-content, .card-title
// - .badge, .badge.danger, .badge.warning, .badge.success
// - .tooltip, .animate-pulse, .animate-fade-up
// 0 style inline, 0 fetch direct

'use client'

import { useMemo, useState } from 'react'
import { Info, AlertTriangle, CheckCircle, XCircle, Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  NiveauProbabilite,
  NiveauGravite,
  NiveauRisqueMatrice,
  RisqueDomaine,
} from '@/lib/risque'

interface RiskMatrixViewProps {
  domainRisks: RisqueDomaine[]
  onDomainClick?: (domaine: string) => void
  showLegend?: boolean
}

// Configuration des probabilités
const PROBABILITE_LABELS: Record<NiveauProbabilite, { label: string; description: string }> = {
  5: { label: 'Fréquent', description: 'Se produit plusieurs fois par an' },
  4: { label: 'Occasionnel', description: 'Se produit environ une fois par an' },
  3: { label: 'Faible', description: 'Se produit rarement (1-2 occurrences)' },
  2: { label: 'Improbable', description: 'Peu probable (0-1 occurrence)' },
  1: { label: 'Extr. improbable', description: 'Quasiment impossible' },
}

// Configuration des gravités
const GRAVITE_LABELS: Record<NiveauGravite, { label: string; description: string; icon: React.ElementType }> = {
  A: { label: 'Catastrophique', description: 'Accident mortel, perte de l\'aéronef', icon: AlertTriangle },
  B: { label: 'Dangereux', description: 'Incident grave, blessures graves', icon: AlertTriangle },
  C: { label: 'Majeur', description: 'Incident significatif, dommages', icon: Info },
  D: { label: 'Mineur', description: 'Incident mineur, sans conséquence', icon: Info },
  E: { label: 'Négligeable', description: 'Écart mineur, sans impact', icon: CheckCircle },
}

// Configuration des couleurs par cellule
const CELLULE_COULEURS: Record<string, { bg: string; text: string; border: string }> = {
  '5A': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700' },
  '5B': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700' },
  '5C': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700' },
  '4A': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700' },
  '4B': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700' },
  '3A': { bg: 'bg-red-600', text: 'text-white', border: 'border-red-700' },
  '5D': { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600' },
  '4C': { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600' },
  '3B': { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600' },
  '2A': { bg: 'bg-orange-500', text: 'text-white', border: 'border-orange-600' },
  '5E': { bg: 'bg-yellow-500', text: 'text-white', border: 'border-yellow-600' },
  '4D': { bg: 'bg-yellow-500', text: 'text-white', border: 'border-yellow-600' },
  '3C': { bg: 'bg-yellow-500', text: 'text-white', border: 'border-yellow-600' },
  '2B': { bg: 'bg-yellow-500', text: 'text-white', border: 'border-yellow-600' },
  '1A': { bg: 'bg-yellow-500', text: 'text-white', border: 'border-yellow-600' },
}

const COULEUR_DEFAUT = { bg: 'bg-green-500', text: 'text-white', border: 'border-green-600' }

// Configuration des niveaux de risque
const NIVEAU_CONFIG: Record<NiveauRisqueMatrice, { badgeClass: string; icon: string; label: string }> = {
  critique: { badgeClass: 'badge danger pulse', icon: '🔴', label: 'Critique' },
  eleve: { badgeClass: 'badge warning', icon: '🟠', label: 'Élevé' },
  moyen: { badgeClass: 'badge primary', icon: '🟡', label: 'Moyen' },
  faible: { badgeClass: 'badge success', icon: '🟢', label: 'Faible' },
}

function getCelluleCouleur(cellule: string) {
  return CELLULE_COULEURS[cellule] || COULEUR_DEFAUT
}

export function RiskMatrixView({ domainRisks, onDomainClick, showLegend = true }: RiskMatrixViewProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)

  // Grouper les risques par cellule
  const domainesParCellule = useMemo(() => {
    const map = new Map<string, RisqueDomaine[]>()
    for (const risk of domainRisks) {
      if (!map.has(risk.cellule)) {
        map.set(risk.cellule, [])
      }
      map.get(risk.cellule)!.push(risk)
    }
    return map
  }, [domainRisks])

  // Statistiques globales
  const stats = useMemo(() => {
    const byLevel = { critique: 0, eleve: 0, moyen: 0, faible: 0 }
    for (const risk of domainRisks) {
      byLevel[risk.niveau]++
    }
    return byLevel
  }, [domainRisks])

  return (
    <Card className="card-premium">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-gray-800 flex items-center gap-2">
              <span className="text-lg">📊</span>
              Matrice des risques OACI (5×5)
            </CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">
              Basée sur le Doc 9859 — Probabilité × Gravité
            </p>
          </div>
          {showLegend && (
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-600" />
                <span className="text-gray-500">Critique</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="text-gray-500">Élevé</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-gray-500">Moyen</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-500">Faible</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* KPIs rapides */}
        <div className="grid grid-cols-4 gap-2">
          {Object.entries(stats).map(([niveau, count]) => {
            const config = NIVEAU_CONFIG[niveau as NiveauRisqueMatrice]
            return (
              <div key={niveau} className={`text-center p-2 rounded-lg ${
                niveau === 'critique' ? 'bg-red-50' :
                niveau === 'eleve' ? 'bg-orange-50' :
                niveau === 'moyen' ? 'bg-yellow-50' : 'bg-green-50'
              }`}>
                <div className="text-lg">{config.icon}</div>
                <p className="text-xs font-bold">{config.label}</p>
                <p className="text-xl font-bold">{count}</p>
              </div>
            )
          })}
        </div>

        {/* Matrice 5×5 */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr>
                <th className="p-2 w-20"></th>
                {(['A', 'B', 'C', 'D', 'E'] as NiveauGravite[]).map((g) => {
                  const gravite = GRAVITE_LABELS[g]
                  const GraviteIcon = gravite.icon
                  return (
                    <th key={g} className="p-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col items-center cursor-help">
                              <span className="text-lg font-bold">{g}</span>
                              <GraviteIcon className="w-4 h-4 text-gray-500" />
                              <span className="text-[10px] text-gray-400 hidden md:inline">
                                {gravite.label.substring(0, 8)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-semibold">{gravite.label}</p>
                            <p className="text-xs">{gravite.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {([5, 4, 3, 2, 1] as NiveauProbabilite[]).map((p) => {
                const proba = PROBABILITE_LABELS[p]
                return (
                  <tr key={p}>
                    <td className="p-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col items-center cursor-help">
                              <span className="text-lg font-bold">{p}</span>
                              <span className="text-[10px] text-gray-400 hidden md:inline">
                                {proba.label.substring(0, 8)}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-semibold">{proba.label}</p>
                            <p className="text-xs">{proba.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    {(['A', 'B', 'C', 'D', 'E'] as NiveauGravite[]).map((g) => {
                      const cellule = `${p}${g}`
                      const couleur = getCelluleCouleur(cellule)
                      const domaines = domainesParCellule.get(cellule) || []
                      const isHovered = hoveredCell === cellule
                      
                      return (
                        <td key={g} className="p-1">
                          <div
                            className={`relative rounded-lg transition-all duration-200 cursor-pointer ${couleur.bg} ${couleur.border} border-2 ${
                              isHovered ? 'scale-105 shadow-lg' : ''
                            } ${domaines.length > 0 ? 'animate-pulse' : ''}`}
                            onMouseEnter={() => setHoveredCell(cellule)}
                            onMouseLeave={() => setHoveredCell(null)}
                            onClick={() => {
                              if (domaines.length > 0 && onDomainClick) {
                                onDomainClick(domaines[0].domaine)
                              }
                            }}
                          >
                            <div className="p-2 min-w-[50px]">
                              <div className="text-sm font-bold text-white">
                                {cellule}
                              </div>
                              {domaines.length > 0 && (
                                <div className="text-[10px] text-white/80 mt-1 truncate">
                                  {domaines.map(d => d.domaine).join(', ').substring(0, 20)}
                                </div>
                              )}
                            </div>
                            {domaines.length > 0 && (
                              <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white animate-pulse`} />
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Détail des domaines par niveau */}
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-600 flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" />
            Domaines par niveau de risque
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(['critique', 'eleve', 'moyen', 'faible'] as NiveauRisqueMatrice[]).map((niveau) => {
              const domainesNiveau = domainRisks.filter(d => d.niveau === niveau)
              if (domainesNiveau.length === 0) return null
              const config = NIVEAU_CONFIG[niveau]
              
              return (
                <div
                  key={niveau}
                  className={`p-2 rounded-lg ${
                    niveau === 'critique' ? 'bg-red-50' :
                    niveau === 'eleve' ? 'bg-orange-50' :
                    niveau === 'moyen' ? 'bg-yellow-50' : 'bg-green-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{config.icon}</span>
                    <span className={`text-xs font-semibold ${config.badgeClass}`}>
                      {config.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({domainesNiveau.length} domaine{domainesNiveau.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {domainesNiveau.map((d) => (
                      <button
                        key={d.domaine}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                          selectedDomain === d.domaine
                            ? 'bg-gray-800 text-white'
                            : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                        }`}
                        onClick={() => {
                          setSelectedDomain(selectedDomain === d.domaine ? null : d.domaine)
                          if (onDomainClick) onDomainClick(d.domaine)
                        }}
                      >
                        {d.domaine}
                        {d.sousDomaine && ` / ${d.sousDomaine}`}
                        <span className="ml-1 opacity-70">({d.cellule})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Détail du domaine sélectionné */}
        {selectedDomain && (
          <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 animate-fade-up">
            {(() => {
              const domain = domainRisks.find(d => d.domaine === selectedDomain)
              if (!domain) return null
              const config = NIVEAU_CONFIG[domain.niveau]
              
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">
                        {domain.domaine}
                        {domain.sousDomaine && ` / ${domain.sousDomaine}`}
                      </span>
                      <Badge className={config.badgeClass}>
                        {config.label}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDomain(null)}
                      className="w-6 h-6 p-0"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center justify-between p-1.5 bg-white rounded">
                      <span className="text-gray-500">Probabilité</span>
                      <span className="font-semibold">
                        {PROBABILITE_LABELS[domain.probabilite]?.label} ({domain.probabilite})
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-white rounded">
                      <span className="text-gray-500">Gravité</span>
                      <span className="font-semibold">
                        {GRAVITE_LABELS[domain.gravite]?.label} ({domain.gravite})
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-white rounded">
                      <span className="text-gray-500">Cellule</span>
                      <span className="font-mono font-bold">{domain.cellule}</span>
                    </div>
                    <div className="flex items-center justify-between p-1.5 bg-white rounded">
                      <span className="text-gray-500">Confiance</span>
                      <div className="flex items-center gap-1">
                        <div className="progress w-12 h-1">
                          <div className="progress-bar" style={{ width: `${domain.confiance}%` }} />
                        </div>
                        <span>{domain.confiance}%</span>
                      </div>
                    </div>
                  </div>
                  {domain.volatilite > 20 && (
                    <div className="text-xs text-orange-600 bg-orange-50 p-1.5 rounded flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Volatilité élevée ({domain.volatilite.toFixed(1)}%) — Surveillance renforcée recommandée
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Note méthodologique */}
        <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">
          Matrice basée sur OACI Doc 9859 — Les cellules rouges nécessitent une action immédiate
        </div>
      </CardContent>
    </Card>
  )
}

export default RiskMatrixView