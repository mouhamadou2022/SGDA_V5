// components/modules/profil-risque/RiskReportExport.tsx
'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FileText,
  Download,
  Calendar,
  Printer,
  Mail,
  Share2,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Plane,
  MapPin,
  Clock,
  FileDown,
  Loader2,
  X,
} from 'lucide-react'
import { useAppStore, ProfilRisque, Aerodrome } from '@/lib/store'

interface RiskReportExportProps {
  aerodromeId?: string
  onExport?: (format: 'pdf' | 'csv' | 'json') => void
}

interface ReportSection {
  id: string
  title: string
  subtitle?: string
  selected: boolean
  icon: React.ElementType
}

export function RiskReportExport({ aerodromeId, onExport }: RiskReportExportProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'csv' | 'json'>('pdf')
  const [includeCharts, setIncludeCharts] = useState(true)
  const [includeTables, setIncludeTables] = useState(true)

  const aerodromes = useAppStore((state) => state.aerodromes)
  const profilsRisque = useAppStore((state) => state.profilsRisque)
  const historiqueScores = useAppStore((state) => state.historiqueScores)
  const proactiveAlerts = useAppStore((state) => state.proactiveAlerts)
  const changePoints = useAppStore((state) => state.changePoints)

  const sections: ReportSection[] = [
    { id: 'summary', title: 'Résumé exécutif', subtitle: "Vue d'ensemble du profil de risque", selected: true, icon: FileText },
    { id: 'scores', title: 'Scores détaillés', subtitle: 'C1 à C5 avec évolution', selected: true, icon: TrendingUp },
    { id: 'predictions', title: 'Prédictions', subtitle: 'N+1, N+2, N+3 mois', selected: true, icon: Calendar },
    { id: 'alerts', title: 'Alertes proactives', subtitle: 'Recommandations et actions', selected: true, icon: AlertTriangle },
    { id: 'timeline', title: 'Timeline', subtitle: 'Événements critiques', selected: true, icon: Clock },
    { id: 'recommendations', title: 'Recommandations', subtitle: 'Actions prioritaires', selected: true, icon: CheckCircle2 },
  ]

  const selectedAerodrome = aerodromeId
    ? aerodromes.find(a => a.id === aerodromeId)
    : null

  const profil = aerodromeId && profilsRisque[aerodromeId]
    ? profilsRisque[aerodromeId]
    : null

  const historique = aerodromeId && historiqueScores[aerodromeId]
    ? historiqueScores[aerodromeId]
    : []

  const alerts = aerodromeId
    ? proactiveAlerts.filter(a => a.aerodrome_id === aerodromeId && !a.resolved_at)
    : proactiveAlerts.filter(a => !a.resolved_at)

  const changes = aerodromeId
    ? changePoints.filter(c => c.aerodrome_id === aerodromeId)
    : changePoints

  const stats = useMemo(() => {
    if (!profil) return null

    const historiqueRecents = historique.slice(-6)
    const evolution = historiqueRecents.length >= 2
      ? historiqueRecents[historiqueRecents.length - 1].score - historiqueRecents[0].score
      : 0

    const tendance = profil.tendance
    const niveauActuel = profil.niveau
    const alertesCritiques = alerts.filter(a => a.niveau_urgence === 'critique').length
    const ameliorations = changes.filter(c => c.direction === 'amelioration').length
    const degradations = changes.filter(c => c.direction === 'degradation').length

    return {
      evolution,
      tendance,
      niveauActuel,
      alertesCritiques,
      ameliorations,
      degradations,
      totalHistorique: historique.length,
      dernierCalcul: profil.computed_at ? new Date(profil.computed_at).toLocaleDateString('fr-FR') : 'N/A',
    }
  }, [profil, historique, alerts, changes])

  const handleGenerateReport = async () => {
    setIsGenerating(true)

    await new Promise(resolve => setTimeout(resolve, 2000))

    if (onExport) {
      onExport(selectedFormat)
    }

    setIsGenerating(false)
    setShowDialog(false)

    useAppStore.getState().addNotification({
      user_id: useAppStore.getState().user?.id || '',
      type: 'success',
      title: 'Rapport généré',
      message: `Le rapport au format ${selectedFormat.toUpperCase()} a été généré avec succès`,
      canal: 'in_app'
    })
  }

  const getNiveauBadge = (niveau: string) => {
    switch (niveau) {
      case 'faible': return 'badge success'
      case 'moyen': return 'badge primary'
      case 'eleve': return 'badge warning'
      case 'critique': return 'badge danger'
      default: return 'badge neutral'
    }
  }

  return (
    <>
      {/* Bouton d'export */}
      <button
        type="button"
        title="Générer un rapport complet au format PDF/CSV/JSON"
        onClick={() => setShowDialog(true)}
        className="btn btn-secondary gap-2"
        disabled={!profil && aerodromeId !== undefined}
      >
        <FileText className="w-4 h-4" />
        Exporter le rapport
      </button>

      {/* Modal de configuration */}
      {showDialog && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setShowDialog(false)}>
          <div
            className="modal-content max-w-2xl border-t-4 border-t-role-primary rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <h2 className="modal-title flex items-center gap-2 text-base">
                <FileDown className="w-5 h-5 text-role-primary" />
                Export du rapport de risque
              </h2>
              <button type="button" className="action-button" onClick={() => setShowDialog(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body p-5 space-y-5">
              {/* Aperçu */}
              {selectedAerodrome && profil && (
                <div className="card p-3 border-l-4 border-l-role-primary">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center">
                      <Plane className="w-5 h-5 text-role-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {selectedAerodrome.code_oaci} — {selectedAerodrome.nom}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedAerodrome.region} · Score: {profil.score_global}/100
                      </p>
                    </div>
                    <span className={getNiveauBadge(profil.niveau)}>
                      {profil.niveau}
                    </span>
                  </div>
                </div>
              )}

              {/* Format */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Format d'export</p>
                <div className="flex gap-3">
                  {(['pdf', 'csv', 'json'] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all ${
                        selectedFormat === format
                          ? 'border-role-primary bg-role-primary-soft text-role-primary'
                          : 'border-border hover:border-role-primary/30'
                      }`}
                      onClick={() => setSelectedFormat(format)}
                    >
                      <FileText className="w-4 h-4" />
                      <span className="text-sm uppercase">{format}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sections */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Sections à inclure</p>
                <div className="grid grid-cols-2 gap-2">
                  {sections.map((section) => {
                    const Icon = section.icon
                    return (
                      <label
                        key={section.id}
                        className="form-checkbox cursor-pointer p-2 rounded-lg border border-border hover:border-role-primary/30 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={section.selected}
                          onChange={() => {}}
                        />
                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-foreground">{section.title}</p>
                          <p className="text-[10px] text-muted-foreground">{section.subtitle}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Options</p>
                <div className="space-y-2">
                  <label className="form-checkbox cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCharts}
                      onChange={(e) => setIncludeCharts(e.target.checked)}
                    />
                    <span className="text-sm text-foreground">Inclure les graphiques</span>
                  </label>
                  <label className="form-checkbox cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeTables}
                      onChange={(e) => setIncludeTables(e.target.checked)}
                    />
                    <span className="text-sm text-foreground">Inclure les tableaux détaillés</span>
                  </label>
                </div>
              </div>

              {/* Statistiques rapides */}
              {stats && (
                <div className="grid grid-cols-2 gap-2 p-3 bg-role-primary-soft/30 rounded-xl border border-role-primary/10">
                  <div>
                    <p className="text-[10px] text-role-primary font-medium">Score actuel</p>
                    <p className="text-lg font-bold text-foreground">{profil?.score_global}/100</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-role-primary font-medium">Évolution</p>
                    <div className="flex items-center gap-1">
                      {stats.evolution > 0 && <TrendingUp className="w-3 h-3 text-success" />}
                      {stats.evolution < 0 && <TrendingDown className="w-3 h-3 text-danger" />}
                      <span className={`text-sm font-semibold ${stats.evolution > 0 ? 'text-success' : stats.evolution < 0 ? 'text-danger' : 'text-muted-foreground'}`}>
                        {stats.evolution > 0 ? '+' : ''}{stats.evolution} pts
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-role-primary font-medium">Alertes critiques</p>
                    <p className="text-lg font-bold text-danger">{stats.alertesCritiques}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-role-primary font-medium">Dernier calcul</p>
                    <p className="text-xs font-medium text-foreground">{stats.dernierCalcul}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer border-t border-border p-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDialog(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className={`btn btn-primary gap-2 ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handleGenerateReport}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Générer le rapport
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Aperçu du rapport */}
      {profil && !aerodromeId && (
        <div className="card mt-4 border-l-4 border-l-role-primary">
          <div className="card-header">
            <h3 className="card-title flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Aperçu du rapport
            </h3>
          </div>
          <div className="card-content space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plane className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{selectedAerodrome?.code_oaci}</span>
              </div>
              <span className={getNiveauBadge(profil.niveau)}>
                {profil.niveau}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-muted-foreground">Score global</p>
                <p className="text-base font-bold">{profil.score_global}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Prédiction 3m</p>
                <p className="text-base font-bold">{profil.prediction_3m}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Prédiction 6m</p>
                <p className="text-base font-bold">{profil.prediction_6m}</p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary w-full gap-2"
              onClick={() => setShowDialog(true)}
            >
              <Download className="w-4 h-4" />
              Télécharger le rapport complet
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default RiskReportExport
