// components/modules/profil-risque/RiskMap.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  MapPin,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  ZoomIn,
  ZoomOut,
  Maximize,
  Info,
  Plane,
  X,
} from 'lucide-react'
import { ProfilRisque, Aerodrome } from '@/lib/store'
import { useAppStore } from '@/lib/store'

interface RiskMapProps {
  onSelectAerodrome?: (aerodromeId: string) => void
}

interface RegionData {
  name: string
  riskLevel: 'critical' | 'high' | 'moderate' | 'low' | 'unknown'
  averageScore: number
  aerodromesCount: number
  trend: 'up' | 'down' | 'stable'
  color: string
  bgColor: string
  borderColor: string
}

const REGIONS_DATA: Record<string, { center: { x: number; y: number }; bounds?: { minX: number; maxX: number; minY: number; maxY: number } }> = {
  'Dakar': { center: { x: 45, y: 35 } },
  'Thiès': { center: { x: 40, y: 40 } },
  'Saint-Louis': { center: { x: 38, y: 20 } },
  'Louga': { center: { x: 35, y: 28 } },
  'Fatick': { center: { x: 42, y: 48 } },
  'Kaolack': { center: { x: 45, y: 55 } },
  'Kaffrine': { center: { x: 50, y: 52 } },
  'Tambacounda': { center: { x: 65, y: 45 } },
  'Kédougou': { center: { x: 72, y: 58 } },
  'Kolda': { center: { x: 58, y: 68 } },
  'Sédhiou': { center: { x: 55, y: 62 } },
  'Ziguinchor': { center: { x: 48, y: 75 } },
  'Diourbel': { center: { x: 38, y: 45 } },
  'Matam': { center: { x: 55, y: 25 } },
}

function getRiskLevel(score: number): 'critical' | 'high' | 'moderate' | 'low' | 'unknown' {
  if (score < 30) return 'critical'
  if (score < 50) return 'high'
  if (score < 70) return 'moderate'
  return 'low'
}

function getRiskColor(level: string): string {
  switch (level) {
    case 'critical': return 'bg-red-500 text-white border-red-600'
    case 'high': return 'bg-orange-500 text-white border-orange-600'
    case 'moderate': return 'bg-yellow-500 text-white border-yellow-600'
    case 'low': return 'bg-green-500 text-white border-green-600'
    default: return 'bg-gray-300 text-gray-600 border-gray-400'
  }
}

function getRiskBadge(level: string): string {
  switch (level) {
    case 'critical': return 'badge danger'
    case 'high': return 'badge warning'
    case 'moderate': return 'badge primary'
    case 'low': return 'badge success'
    default: return 'badge neutral'
  }
}

function getTrendIcon(trend: string) {
  if (trend === 'up') return <TrendingUp className="w-3 h-3 text-green-500" />
  if (trend === 'down') return <TrendingDown className="w-3 h-3 text-red-500 animate-pulse" />
  return <div className="w-3 h-0.5 bg-gray-400 rounded-full" />
}

export function RiskMap({ onSelectAerodrome }: RiskMapProps) {
  const [zoom, setZoom] = useState(1)
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [hoveredAerodrome, setHoveredAerodrome] = useState<string | null>(null)

  const aerodromes = useAppStore((state) => state.aerodromes)
  const profilsRisque = useAppStore((state) => state.profilsRisque)

  const regions = useMemo(() => {
    const regionMap = new Map<string, { scores: number[]; aerodromes: typeof aerodromes; trends: string[] }>()

    aerodromes.forEach(aero => {
      const region = aero.region || 'Autre'
      if (!regionMap.has(region)) {
        regionMap.set(region, { scores: [], aerodromes: [], trends: [] })
      }
      const data = regionMap.get(region)!
      data.aerodromes.push(aero)

      const profil = profilsRisque[aero.id]
      if (profil) {
        data.scores.push(profil.score_global)
        data.trends.push(profil.tendance)
      }
    })

    const result: RegionData[] = []
    for (const [name, data] of regionMap) {
      const avgScore = data.scores.length > 0
        ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        : 0

      const upCount = data.trends.filter(t => t === 'hausse').length
      const downCount = data.trends.filter(t => t === 'baisse').length
      const trend = upCount > downCount ? 'up' : downCount > upCount ? 'down' : 'stable'

      result.push({
        name,
        riskLevel: getRiskLevel(avgScore),
        averageScore: Math.round(avgScore),
        aerodromesCount: data.aerodromes.length,
        trend,
        color: getRiskColor(getRiskLevel(avgScore)),
        bgColor: '',
        borderColor: '',
      })
    }

    return result.sort((a, b) => b.averageScore - a.averageScore)
  }, [aerodromes, profilsRisque])

  const stats = useMemo(() => {
    const scores = Object.values(profilsRisque).map(p => p.score_global)
    const critical = scores.filter(s => s < 30).length
    const high = scores.filter(s => s >= 30 && s < 50).length
    const moderate = scores.filter(s => s >= 50 && s < 70).length
    const low = scores.filter(s => s >= 70).length

    return { critical, high, moderate, low, total: scores.length }
  }, [profilsRisque])

  const selectedRegionData = regions.find(r => r.name === selectedRegion)

  return (
    <div className="card border-l-4 border-l-role-primary">
      <div className="card-header pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="card-title flex items-center gap-2">
              <Navigation className="w-5 h-5 text-blue-600" />
              Carte des risques par région
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Visualisation géographique des niveaux de risque - Sénégal
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-gray-500">Critique</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="text-gray-500">Élevé</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-gray-500">Modéré</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-500">Bas</span>
              </div>
            </div>
            <button
              type="button"
              className="action-button w-7 h-7 p-0"
              title="Légende des niveaux de risque"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="card-content space-y-4">
        {/* Carte SVG stylisée */}
        <div className="relative bg-gradient-to-br from-blue-50 to-gray-100 rounded-xl p-4 border border-gray-200 overflow-hidden">
          <div className="absolute top-2 right-2 flex gap-1 z-10">
            <button
              type="button"
              className="action-button w-7 h-7 p-0 bg-white/80 backdrop-blur"
              onClick={() => setZoom(z => Math.min(2, z + 0.1))}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="action-button w-7 h-7 p-0 bg-white/80 backdrop-blur"
              onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="action-button w-7 h-7 p-0 bg-white/80 backdrop-blur"
              onClick={() => setZoom(1)}
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </div>

          <svg
            viewBox="0 0 200 220"
            className="w-full aspect-[5/6]"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
          >
            {/* Fond océan */}
            <rect x="0" y="0" width="200" height="220" fill="#e0f2fe" rx="8" />

            {/* Contour simplifié du Sénégal */}
            <path d="M95,10 L110,15 L125,20 L140,18 L148,25 L155,35 L160,45 L165,55 L170,65 L168,75 L162,82 L155,88 L148,95 L145,105 L140,115 L135,125 L130,132 L120,138 L110,142 L105,148 L98,155 L92,160 L85,158 L78,152 L72,145 L68,138 L65,130 L62,120 L58,110 L55,100 L50,90 L48,80 L45,70 L42,60 L40,50 L42,40 L45,32 L50,25 L55,20 L60,18 L68,15 L78,12 L88,10 Z"
              fill="#cfe8c0" stroke="#86b37b" strokeWidth="0.8" opacity="0.5" />

            {/* Régions */}
            {regions.map((region) => {
              const coords = REGIONS_DATA[region.name] || { center: { x: 100, y: 100 } }
              const riskConfig = getRiskColor(region.riskLevel)
              const fillColor = riskConfig.split(' ')[0].replace('bg-', '').replace('text-white', '')
              let fillHex = '#9ca3af'
              if (fillColor === 'red-500') fillHex = '#ef4444'
              if (fillColor === 'orange-500') fillHex = '#f97316'
              if (fillColor === 'yellow-500') fillHex = '#eab308'
              if (fillColor === 'green-500') fillHex = '#22c55e'

              const radius = 4 + Math.min(6, region.aerodromesCount * 2)

              return (
                <g
                  key={region.name}
                  onClick={() => setSelectedRegion(selectedRegion === region.name ? null : region.name)}
                  onMouseEnter={() => setHoveredAerodrome(region.name)}
                  onMouseLeave={() => setHoveredAerodrome(null)}
                  style={{ cursor: 'pointer' }}
                  className="transition-all duration-200"
                >
                  <circle
                    cx={coords.center.x * 1.5 + 25}
                    cy={coords.center.y * 1.5 + 10}
                    r={radius + (hoveredAerodrome === region.name ? 2 : 0)}
                    fill={fillHex}
                    fillOpacity={0.85 + (hoveredAerodrome === region.name ? 0.15 : 0)}
                    stroke="#ffffff"
                    strokeWidth="2"
                    className="transition-all duration-200"
                  />
                  <text
                    x={coords.center.x * 1.5 + 25}
                    y={coords.center.y * 1.5 + 10 - radius - 3}
                    textAnchor="middle"
                    fontSize="4"
                    fill="#1f2937"
                    fontWeight="bold"
                  >
                    {region.name}
                  </text>
                  {region.trend === 'up' && (
                    <TrendingUp x={coords.center.x * 1.5 + 25 + radius + 2} y={coords.center.y * 1.5 + 10 - radius - 2} width="4" height="4" color="#22c55e" />
                  )}
                  {region.trend === 'down' && (
                    <TrendingDown x={coords.center.x * 1.5 + 25 + radius + 2} y={coords.center.y * 1.5 + 10 - radius - 2} width="4" height="4" color="#ef4444" />
                  )}
                </g>
              )
            })}

            {/* Légende */}
            <rect x="8" y="195" width="80" height="20" fill="white" fillOpacity="0.9" rx="3" />
            <text x="10" y="205" fontSize="3" fill="#ef4444">● Critique</text>
            <text x="26" y="205" fontSize="3" fill="#f97316">● Élevé</text>
            <text x="42" y="205" fontSize="3" fill="#eab308">● Modéré</text>
            <text x="60" y="205" fontSize="3" fill="#22c55e">● Bas</text>

          </svg>

          {aerodromes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
              <div className="text-center text-gray-500">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Aucun aérodrome configuré</p>
                <p className="text-xs">Ajoutez des aérodromes pour voir la carte des risques</p>
              </div>
            </div>
          )}
        </div>

        {/* Détail de la région sélectionnée */}
        {selectedRegionData && (
          <div className="animate-fade-up">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                {selectedRegion}
              </h3>
              <button
                type="button"
                className="action-button w-6 h-6 p-0"
                onClick={() => setSelectedRegion(null)}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">Niveau de risque</span>
                  <span className={getRiskBadge(selectedRegionData.riskLevel)}>
                    {selectedRegionData.riskLevel === 'critical' ? 'Critique' :
                     selectedRegionData.riskLevel === 'high' ? 'Élevé' :
                     selectedRegionData.riskLevel === 'moderate' ? 'Modéré' : 'Bas'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Score moyen</span>
                  <span className={`text-lg font-bold ${
                    selectedRegionData.averageScore >= 70 ? 'text-green-600' :
                    selectedRegionData.averageScore >= 50 ? 'text-yellow-600' :
                    selectedRegionData.averageScore >= 30 ? 'text-orange-600' :
                    'text-red-600'
                  }`}>
                    {selectedRegionData.averageScore}/100
                  </span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">Aérodromes</span>
                  <span className="text-sm font-semibold">{selectedRegionData.aerodromesCount}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-500">Tendance</span>
                  <div className="flex items-center gap-1">
                    {getTrendIcon(selectedRegionData.trend)}
                    <span className="text-xs">
                      {selectedRegionData.trend === 'up' ? 'Amélioration' :
                       selectedRegionData.trend === 'down' ? 'Dégradation' : 'Stable'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">Recommandation</p>
                <p className="text-xs text-gray-600">
                  {selectedRegionData.riskLevel === 'critical' &&
                    'Priorité absolue - Programmer des inspections immédiates dans tous les aérodromes de la région'}
                  {selectedRegionData.riskLevel === 'high' &&
                    'Surveillance renforcée recommandée - Planifier des inspections ciblées dans les 30 jours'}
                  {selectedRegionData.riskLevel === 'moderate' &&
                    'Maintien de la vigilance - Suivi régulier des indicateurs de risque'}
                  {selectedRegionData.riskLevel === 'low' &&
                    'Situation satisfaisante - Maintenir le planning de surveillance existant'}
                </p>
                {selectedRegionData.trend === 'down' && (
                  <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Tendance à la dégradation - Action préventive recommandée
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Liste des régions */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <Plane className="w-3.5 h-3.5" />
            Régions par niveau de risque
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {regions.map((region) => (
              <div
                key={region.name}
                className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                  selectedRegion === region.name
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
                onClick={() => setSelectedRegion(region.name)}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    region.riskLevel === 'critical' ? 'bg-red-500' :
                    region.riskLevel === 'high' ? 'bg-orange-500' :
                    region.riskLevel === 'moderate' ? 'bg-yellow-500' : 'bg-green-500'
                  }`} />
                  <span className="text-sm font-medium text-gray-700">{region.name}</span>
                  <span className="badge outline text-[10px]">
                    {region.aerodromesCount} aéro{region.aerodromesCount > 1 ? 'ports' : 'port'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${
                    region.averageScore >= 70 ? 'text-green-600' :
                    region.averageScore >= 50 ? 'text-yellow-600' :
                    region.averageScore >= 30 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {region.averageScore}
                  </span>
                  {getTrendIcon(region.trend)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Résumé des risques */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-gray-100">
          <div className="text-center">
            <div className="text-xl font-bold text-red-600">{stats.critical}</div>
            <p className="text-xs text-gray-500">Critique</p>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-orange-600">{stats.high}</div>
            <p className="text-xs text-gray-500">Élevé</p>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-yellow-600">{stats.moderate}</div>
            <p className="text-xs text-gray-500">Modéré</p>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-600">{stats.low}</div>
            <p className="text-xs text-gray-500">Bas</p>
          </div>
        </div>

        {/* Note */}
        <div className="text-[10px] text-gray-400 pt-2 border-t border-gray-100 flex items-center justify-between">
          <span>🗺️ Carte des risques par région | Données en temps réel</span>
          <span>{stats.total} aérodromes analysés</span>
        </div>
      </div>
    </div>
  )
}

export default RiskMap
