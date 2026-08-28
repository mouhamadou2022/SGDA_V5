'use client'

import { useEffect, useState } from 'react'
import { ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { Sparkles, Loader2, Workflow } from 'lucide-react'
import { expliquerChaineQualitative, type ChaineQualitativeExplication } from '@/lib/ia/qualitativeChainIA'

interface QualitativeChainSectionProps {
  profil: ProfilRisque
}

/**
 * Interprétation AERORISQ en langage clair de la « chaîne qualitative » :
 * le diagnostic combiné des quatre outils (AMDEC, BowTie, FTA, Bayésien).
 * S'affiche uniquement quand le profil embarque un DiagnosticQualitatif ;
 * le texte est généré par l'agent IA (fallback déterministe data-driven sinon).
 */
export function QualitativeChainSection({ profil }: QualitativeChainSectionProps) {
  const diag = profil.qualitative_metrics

  const [explication, setExplication] = useState<ChaineQualitativeExplication | null>(null)
  const [iaEnCours, setIaEnCours] = useState(true)
  const [iaActif, setIaActif] = useState(false)
  const [prevDiagnostic, setPrevDiagnostic] = useState(diag)
  if (prevDiagnostic !== diag) {
    setPrevDiagnostic(diag)
    setIaEnCours(true)
    setIaActif(false)
    setExplication(null)
  }

  useEffect(() => {
    if (!diag) return
    let actif = true
    expliquerChaineQualitative({
      diagnostic: diag,
      aerodromeId: profil.aerodrome_id,
    }).then((res) => {
      if (!actif) return
      setExplication(res)
      setIaActif(!res.fallbackIA)
      setIaEnCours(false)
    }).catch(() => {
      if (!actif) return
      setIaEnCours(false)
    })
    return () => { actif = false }
  }, [diag, profil.aerodrome_id])

  if (!diag) return null

  return (
    <Card
      variant="level"
      levelColor={diag.indiceGlobal >= 70 ? 'danger' : diag.indiceGlobal >= 45 ? 'warning' : diag.indiceGlobal >= 25 ? 'primary' : 'success'}
      heading="Chaîne qualitative — 4 outils combinés"
      icon={<Workflow className="w-5 h-5 text-role-primary" />}
      badge={(
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
          <Sparkles className="w-3.5 h-3.5" />
          {iaEnCours ? 'AERORISQ en cours…' : iaActif ? 'Langage clair AERORISQ' : 'Analyse déterministe'}
        </span>
      )}
    >
      <div className="space-y-5">
        {/* Indice de dégradation global de la chaîne */}
        <div className="flex items-center gap-6 flex-wrap">
          <div>
            <span className="text-xs text-muted-foreground">Indice de dégradation</span>
            <p className={`text-2xl font-bold ${diag.indiceGlobal >= 70 ? 'text-danger' : diag.indiceGlobal >= 45 ? 'text-warning' : diag.indiceGlobal >= 25 ? 'text-primary' : 'text-success'}`}>
              {diag.indiceGlobal}/100
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Domaines analysés</span>
            <p className="text-2xl font-bold text-foreground">{diag.scenarios.length}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Confiance</span>
            <p className="text-2xl font-bold text-foreground">{diag.confiance}%</p>
          </div>
          {diag.barrieresCritiquesGlobales.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground">Barrières critiques</span>
              <p className="text-2xl font-bold text-danger">{diag.barrieresCritiquesGlobales.length}</p>
            </div>
          )}
        </div>

        {iaEnCours && !explication ? (
          <p className="text-sm text-primary flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Interprétation AERORISQ en cours…
          </p>
        ) : explication ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground leading-relaxed">{explication.synthese}</p>
            <p className="text-sm text-foreground leading-relaxed">{explication.outils}</p>
            <div className="rounded-lg border border-border bg-muted/10 p-4">
              <span className="text-xs font-semibold text-foreground uppercase">Barrières</span>
              <p className="text-sm text-foreground mt-1 leading-relaxed">{explication.barrieres}</p>
            </div>
            <div className="rounded-lg border border-border bg-primary/5 p-4">
              <span className="text-xs font-semibold text-foreground uppercase">Recommandation</span>
              <p className="text-sm text-foreground mt-1 leading-relaxed">{explication.recommandation}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground leading-relaxed">
            {diag.interpretation}
          </p>
        )}

        {/* Structure par domaine — les sources engagées et les barrières critiques */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {diag.scenarios.map((s) => (
            <div
              key={`${s.domaine}-${s.defaillance}`}
              className={`rounded-lg border border-border bg-card p-4 border-l-4 ${s.probabiliteResiduelle >= 60 ? 'border-l-danger' : s.probabiliteResiduelle >= 40 ? 'border-l-warning' : 'border-l-primary'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground capitalize">{s.domaine}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{s.sources.join(' + ')}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.defaillance}</p>
              <div className="flex items-center gap-4 mt-2 text-xs">
                <span className="text-foreground">Menace {s.probabiliteMenace}%</span>
                <span className="text-foreground">Résiduel {s.probabiliteResiduelle}%</span>
                {s.modesCritiquesAmdec.length > 0 && (
                  <span className="text-warning">{s.modesCritiquesAmdec.length} mode(s) AMDEC</span>
                )}
                {s.coupesMinimales.length > 0 && (
                  <span className="text-primary">{s.coupesMinimales.length} coupe(s) FTA</span>
                )}
              </div>
              {s.barrieresCritiques.length > 0 && (
                <p className="text-xs text-danger mt-2">
                  Barrières critiques : {s.barrieres
                    .filter((b) => b.efficaciteAjustee < 60)
                    .map((b) => b.nom)
                    .join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}