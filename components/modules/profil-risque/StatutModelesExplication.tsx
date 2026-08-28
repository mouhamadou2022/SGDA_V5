'use client'

// Composant d'explication IA de la carte « Statut des modèles » : quels modèles
// tournent, pourquoi les autres ne tournent pas (données manquantes) et comment
// lire la confiance / les intervalles. Le texte est généré par l'IA avec fallback
// déterministe ; la liste des modèles inactifs est toujours data-driven.

import { useState, useEffect } from 'react'
import { Loader2, Sparkles, XCircle } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import type { ProfilRisque } from '@/lib/store'
import type { DiagnosticUnifie } from '@/lib/risque/modelSynthesis'
import { calculerStatutModeles, enrichirStatutsAvecVotes, expliquerStatutModeles, type StatutModelesExplication } from '@/lib/ia/statutModelesIA'

interface Props {
  profil: ProfilRisque
  diagnostic: DiagnosticUnifie
}

export function StatutModelesExplication({ profil, diagnostic }: Props) {
  const rfModelInfo = useAppStore((s) => s.rfModelInfo)
  const [explication, setExplication] = useState<StatutModelesExplication | null>(null)
  const [enCours, setEnCours] = useState(true)
  const [prevProfil, setPrevProfil] = useState(profil)
  if (prevProfil !== profil) {
    setPrevProfil(profil)
    setEnCours(true)
    setExplication(null)
  }

  const statuts = enrichirStatutsAvecVotes(calculerStatutModeles(profil, rfModelInfo), diagnostic.votes)
  const inactifs = statuts.filter((s) => !s.actif)

  useEffect(() => {
    let actif = true
    expliquerStatutModeles(profil, diagnostic, rfModelInfo)
      .then((res) => {
        if (!actif) return
        setExplication(res)
        setEnCours(false)
      })
      .catch(() => {
        if (!actif) return
        setEnCours(false)
      })
    return () => {
      actif = false
    }
  }, [profil, diagnostic, rfModelInfo])

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-foreground">Lecture AERORISQ du statut des modèles</span>
        {enCours ? (
          <span className="inline-flex items-center gap-2 text-xs text-primary">
            <Loader2 className="w-4 h-4 animate-spin" /> Analyse IA en cours…
          </span>
        ) : explication ? (
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full ${explication.fallbackIA ? 'text-foreground/70 bg-muted' : 'text-primary bg-primary/10'}`}>
            {!explication.fallbackIA && <Sparkles className="w-3.5 h-3.5" />}
            {explication.fallbackIA ? 'Analyse déterministe' : 'Langage clair AERORISQ'}
          </span>
        ) : null}
      </div>

      {explication && (
        <div className="space-y-2.5 text-sm text-foreground leading-relaxed">
          <p>{explication.synthese}</p>
          {explication.actifs && <p>{explication.actifs}</p>}
          {explication.inactifs && (
            <p className={inactifs.length > 0 ? 'text-warning' : 'text-success'}>{explication.inactifs}</p>
          )}
          {explication.confiance && <p>{explication.confiance}</p>}
        </div>
      )}

      {inactifs.length > 0 && (
        <div className="pt-3 border-t border-border">
          <p className="text-xs font-semibold text-foreground mb-2">
            {inactifs.length} modèle{inactifs.length > 1 ? 's' : ''} non actif{inactifs.length > 1 ? 's' : ''} sur ce profil :
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {inactifs.map((i) => (
              <div key={i.id} className="flex items-start gap-1.5 text-xs text-foreground">
                <XCircle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
                <span>
                  <strong className="font-semibold">{i.nom}</strong>
                  <span className="text-muted-foreground"> — {i.raisonInactif}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
