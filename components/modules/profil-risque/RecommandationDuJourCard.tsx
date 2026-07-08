// components/modules/profil-risque/RecommandationDuJourCard.tsx
// Carte "Recommandation du jour" avec Pourquoi ? déroulable + références réglementaires + export PDF

'use client'

import { useState } from 'react'
import { Lightbulb, AlertTriangle, ChevronDown, ChevronUp, TrendingUp, Clock, Shield, Activity, BookOpen, Cpu, FileText } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { RecommandationDuJour, PointMotivation } from '@/lib/ia/engines/recommendationEngine'

const SOURCE_ICONS: Record<PointMotivation['source'], React.ElementType> = {
  profil_risque: Shield,
  pac: Clock,
  evenement: Activity,
  hmm: TrendingUp,
  extreme: AlertTriangle,
  scenario: TrendingUp,
  tendance: TrendingUp,
  alerte_proactive: AlertTriangle,
  survie: Clock,
  orchestrateur: Cpu,
}

const IMPACT_COLORS: Record<PointMotivation['impact'], string> = {
  negatif: 'text-danger',
  positif: 'text-success',
  neutre: 'text-foreground',
}

const PRIORITE_CONFIG = {
  critique: { label: 'Critique', color: 'text-danger', bg: 'bg-danger-soft', border: 'border-danger/30', badge: 'badge danger' },
  haute: { label: 'Haute', color: 'text-warning', bg: 'bg-warning-soft', border: 'border-warning/30', badge: 'badge warning' },
  moyenne: { label: 'Moyenne', color: 'text-primary', bg: 'bg-primary-soft', border: 'border-primary/30', badge: 'badge primary' },
  basse: { label: 'Basse', color: 'text-success', bg: 'bg-success-soft', border: 'border-success/30', badge: 'badge success' },
} as const

interface Props {
  recommandation: RecommandationDuJour
}

export default function RecommandationDuJourCard({ recommandation }: Props) {
  const [showWhy, setShowWhy] = useState(false)
  const [showRefs, setShowRefs] = useState(false)
  const [exporting, setExporting] = useState(false)
  const cfg = PRIORITE_CONFIG[recommandation.priorite]

  const handleExport = async () => {
    setExporting(true)
    const { exporterBulletinMensuel } = await import('@/lib/services/bulletinMensuel')
    const now = new Date()
    await exporterBulletinMensuel(now.getMonth() + 1, now.getFullYear())
    setExporting(false)
  }

  return (
    <Card
      variant="role"
      headerGradient
      icon={<Lightbulb className="w-5 h-5" />}
      title="Recommandation du jour"
      badge={
        <div className="flex items-center gap-2">
          <span className={`badge ${cfg.badge} text-xs`}>{cfg.label}</span>
          {recommandation.confianceOrchestrateur > 0 && (
            <span className="text-[10px] text-foreground/60 font-mono" title="Confiance de l'orchestrateur">
              {recommandation.confianceOrchestrateur}%
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-foreground/70 hover:text-role-primary bg-muted/20 hover:bg-muted/40 rounded transition-colors disabled:opacity-50"
            title="Exporter le bulletin mensuel PDF"
          >
            <FileText className="w-3 h-3" />
            {exporting ? '...' : 'PDF'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground leading-snug">{recommandation.titre}</h3>
          <p className="text-sm text-foreground mt-2 leading-relaxed">{recommandation.action}</p>
          {recommandation.delai !== 'prochaine mission' && (
            <span className="inline-flex items-center gap-1 mt-2 text-xs text-foreground">
              <Clock className="w-3 h-3" />Échéance : {recommandation.delai}
            </span>
          )}
        </div>

        <div className="border-t border-border pt-3 text-xs text-foreground leading-relaxed">
          {recommandation.synthese}
        </div>

        {/* Orchestrateur info */}
        {recommandation.modelSelection && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs text-foreground">
            <Cpu className="w-3.5 h-3.5 text-role-primary shrink-0" />
            <span>Modèle sélectionné : <strong>{recommandation.modelSelection.selected}</strong> (confiance {recommandation.modelSelection.confidence}%)</span>
            {recommandation.modelSelection.alternatives.length > 0 && (
              <span className="text-foreground/60 ml-1">
                — alternatives : {recommandation.modelSelection.alternatives.map(a => `${a.model} (${a.confidence}%)`).join(', ')}
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => setShowWhy(v => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-role-primary hover:underline"
        >
          {showWhy ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showWhy ? 'Masquer les détails' : 'Pourquoi ? — voir l\'analyse croisée'}
        </button>

        {showWhy && (
          <div className="space-y-2">
            {recommandation.motivations.map((m, i) => {
              const Icon = SOURCE_ICONS[m.source]
              return (
                <div key={i} className="flex items-start gap-2.5 p-2 rounded-lg bg-muted/30">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${IMPACT_COLORS[m.impact]}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground">{m.label}</span>
                    <span className={`text-xs ml-2 font-medium ${IMPACT_COLORS[m.impact]}`}>
                      ({m.impact === 'negatif' ? '⚠ ' : m.impact === 'positif' ? '✓ ' : ''}{m.valeur})
                    </span>
                    {m.ref && (
                      <button
                        onClick={() => setShowRefs(v => !v)}
                        className="block mt-0.5 text-[11px] text-role-primary/70 hover:text-role-primary flex items-center gap-1"
                      >
                        <BookOpen className="w-3 h-3" />{m.ref.regulation} — {m.ref.article}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Références réglementaires détaillées */}
        {showRefs && (
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />Références réglementaires
            </p>
            {recommandation.motivations.filter(m => m.ref).map((m, i) => (
              <div key={i} className="text-xs text-foreground p-2 rounded-lg bg-muted/20">
                <span className="font-medium">{m.ref!.regulation}, {m.ref!.article}</span>
                <p className="text-foreground/80 mt-0.5">{m.ref!.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
