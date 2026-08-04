'use client'

// components/modules/profil-risque/OngletExplicationCard.tsx
// Petit encart IA affiché au-dessus du contenu de chaque onglet du profil de
// risque : explique, en langage clair et à partir des données réelles du profil,
// à quoi sert l'onglet actif. Le fallback déterministe est affiché immédiatement
// (aucun écran vide), l'IA vient ensuite enrichir le texte si disponible.

import { useState, useEffect } from 'react'
import { ProfilRisque, ScoreHistoryPoint } from '@/lib/store'
import { Sparkles, Loader2 } from 'lucide-react'
import { expliquerOngletProfil, fallbackOnglet, type OngletProfilId } from '@/lib/ia/ongletExplicationIA'

interface Props {
  ongletId: OngletProfilId
  profil: ProfilRisque
  historiqueScores: ScoreHistoryPoint[]
}

export function OngletExplicationCard({ ongletId, profil, historiqueScores }: Props) {
  // Clé stable dérivée du contenu réel (l'array historiqueScores est recréé à chaque rendu)
  const historiqueKey = historiqueScores.map(h => `${h.date}:${h.score}`).join('|')

  const [explication, setExplication] = useState(() =>
    fallbackOnglet({ ongletId, profil, historiqueScores }).explication
  )
  const [iaEnCours, setIaEnCours] = useState(true)
  const [iaActif, setIaActif] = useState(false)

  useEffect(() => {
    let actif = true
    setIaEnCours(true)
    setIaActif(false)
    setExplication(fallbackOnglet({ ongletId, profil, historiqueScores }).explication)
    expliquerOngletProfil({ ongletId, profil, historiqueScores }).then((res) => {
      if (!actif) return
      setExplication(res.explication)
      setIaActif(!res.fallbackIA)
      setIaEnCours(false)
    }).catch(() => {
      if (!actif) return
      setIaEnCours(false)
    })
    return () => { actif = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ongletId, profil, historiqueKey])

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 mb-4" data-module="onglet-explication">
      <div className="flex items-start gap-3">
        <Sparkles className="w-4 h-4 mt-0.5 text-role-primary shrink-0" />
        <div className="flex-1 min-w-0">
          {iaEnCours ? (
            <p className="flex items-center gap-1.5 text-xs text-primary">
              <Loader2 className="w-3 h-3 animate-spin" /> Analyse en cours…
            </p>
          ) : (
            <>
              <p className="text-xs text-foreground leading-relaxed">{explication}</p>
              {iaActif && (
                <p className="flex items-center gap-1.5 text-[10px] text-primary mt-1">
                  <Sparkles className="w-3 h-3" /> Langage clair IA
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
