// components/modules/planning/OrchestrateurDiagnosticPrepa.tsx
// Diagnostic multi-agents AERORISQ dans la modale de préparation de surveillance.
// Exécute l'orchestrateur (lib/ia/orchestrateur) sur les données réelles de
// l'aérodrome et affiche le verdict consolidé pour éclairer le choix du type de
// surveillance. Lecture seule — aucun workflow modifié.

'use client'

import { useState } from 'react'
import { Play, Workflow, Sparkles, History } from 'lucide-react'
import { useAppStore, type Ecart, type ProfilRisque, type Surveillance } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { lancerDiagnosticOrchestrateur, lireDernierDiagnostic } from '@/lib/ia/orchestrateur'
import type { ResultatOrchestrateur } from '@/lib/ia/orchestrateur'

interface Props {
  aerodromeId: string
  aerodromeNom?: string
  profil: ProfilRisque
  ecarts: Ecart[]
  surveillances: Surveillance[]
}

const NIVEAU_BADGE: Record<string, string> = {
  critique: 'danger',
  eleve: 'warning',
  moyen: 'primary',
  faible: 'success',
}

export default function OrchestrateurDiagnosticPrepa({ aerodromeId, aerodromeNom, profil, ecarts, surveillances }: Props) {
  const rfModelInfo = useAppStore(s => s.rfModelInfo)
  const benchmarkOutcome = useAppStore(s => s.benchmarkOutcome)
  const activeModelName = useAppStore(s => s.activeModelName)

  const [resultat, setResultat] = useState<ResultatOrchestrateur | null>(() =>
    lireDernierDiagnostic(aerodromeId),
  )

  const lancer = () => {
    const res = lancerDiagnosticOrchestrateur({
      aerodromeId,
      aerodromeNom,
      profil,
      ecarts,
      surveillances,
      contexteML: {
        rfAccuracy: rfModelInfo?.accuracy ?? 0,
        benchmarkMeilleurScore: benchmarkOutcome?.ranked?.[0]?.score ?? 0,
        modeleActifNom: activeModelName ?? undefined,
      },
    })
    setResultat(res)
  }

  return (
    <Card icon={<Workflow className="h-4 w-4 text-role-primary" />} title="Diagnostic multi-agents AERORISQ" badge={
      resultat ? <span className={`badge text-xs ${NIVEAU_BADGE[resultat.niveau] ?? 'primary'}`}>{resultat.niveau}</span> : undefined
    }>
      <p className="text-sm text-muted-foreground mb-3">
        Exécute la chaîne de 5 agents déterministes (risque, conformité OACI, modèles ML, inspecteur virtuel, pertinence) et fusionne les votes pondérés par la confiance pour consolider le diagnostic avant de fixer le type de surveillance.
      </p>
      <button type="button" onClick={lancer} className="btn btn-primary btn-sm gap-1.5">
        <Play className="w-3.5 h-3.5" />Lancer le diagnostic multi-agents
      </button>

      {!resultat ? (
        <p className="text-sm text-muted text-center py-4 mt-2">Aucun diagnostic encore lancé pour cet aérodrome.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-role-primary-soft rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Dégradation</p>
              <p className={`text-xl font-bold ${resultat.indiceGlobal >= 65 ? 'text-danger' : resultat.indiceGlobal >= 40 ? 'text-warning' : 'text-success'}`}>{resultat.indiceGlobal}/100</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Niveau</p>
              <p className="text-xl font-bold capitalize">{resultat.niveau}</p>
            </div>
            <div className="bg-role-primary-soft rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Confiance</p>
              <p className="text-xl font-bold">{resultat.confianceGlobale}%</p>
            </div>
          </div>

          <p className="text-sm text-foreground">{resultat.interpretation}</p>

          <div className="rounded-lg bg-role-primary-soft/40 p-3 text-sm">
            <p className="font-medium mb-1">Recommandation de l&apos;orchestrateur :</p>
            <p className="text-muted-foreground">{resultat.recommandation}</p>
          </div>

          <div>
            <h4 className="text-xs mb-1.5 flex items-center gap-1.5"><Sparkles className="w-3 h-3 text-role-primary" />Votes des agents</h4>
            <div className="space-y-1.5">
              {resultat.votes.map(v => (
                <div key={v.agent} className="p-2 rounded-lg border border-border/60 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground font-medium truncate">{v.label}</span>
                    {v.statut === 'erreur'
                      ? <span className="badge badge-secondary text-[9px] shrink-0">Non applicable</span>
                      : <span className="text-foreground font-bold shrink-0">{v.degradation}/100</span>}
                  </div>
                  <p className="text-muted-foreground mt-0.5 line-clamp-2">{v.interpretation}</p>
                </div>
              ))}
            </div>
          </div>

          <details>
            <summary className="text-xs font-medium text-muted-foreground flex items-center gap-1 cursor-pointer select-none">
              <History className="w-3 h-3" /> Journal du raisonnement ({resultat.journal.length} étapes)
            </summary>
            <div className="mt-2 space-y-1.5">
              {resultat.journal.map((etp, i) => (
                <div key={i} className="p-2 rounded bg-muted/20 text-[11px]">
                  <p className="text-foreground font-medium">{etp.etape}</p>
                  <p className="text-muted-foreground truncate">{etp.sortie}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </Card>
  )
}
