// components/modules/evenements/FtaEvenementPanel.tsx
// Analyse causale FTA (Arbre de Défaillance) ancrée dans le workflow événement.
// Part d'un événement sommet, décompose les causes via portes ET/OU,
// synchronise les causes déclarées de l'événement.

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAppStore, type EvenementSecurite } from '@/lib/store'
import { Card } from '@/components/ui/card'
import {
  calculerArbre,
  marquerCausesDepuisEvenement,
  getNiveauProbaArbre,
  PROBA_ARBRE_COULEURS,
  FACTEUR_LABELS,
  type NoeudFTA,
  type PorteFTA,
} from '@/lib/risque/ftaEngine'
import { GitBranch, Plus, CheckCircle2, XCircle, MinusCircle, RefreshCw, AlertTriangle, ListTree } from 'lucide-react'

interface Props {
  evenement: EvenementSecurite
}

function cycleEtat(noeud: NoeudFTA): boolean | null {
  if (noeud.estPresent === true) return false
  if (noeud.estPresent === false) return null
  return true
}

export function FtaEvenementPanel({ evenement }: Props) {
  const ftaAnalyses = useAppStore((s) => s.ftaAnalyses)
  const initializeFtaForEvenement = useAppStore((s) => s.initializeFtaForEvenement)
  const setFtaNoeuds = useAppStore((s) => s.setFtaNoeuds)
  const updateFtaAnalyse = useAppStore((s) => s.updateFtaAnalyse)
  const deleteFtaAnalyse = useAppStore((s) => s.deleteFtaAnalyse)
  const addNotification = useAppStore((s) => s.addNotification)

  const [noeuds, setNoeuds] = useState<NoeudFTA[]>([])
  const [initLoading, setInitLoading] = useState(false)

  const arbre = useMemo(
    () => ftaAnalyses.find((a) => a.evenementId === evenement.id) || null,
    [ftaAnalyses, evenement.id],
  )

  useEffect(() => {
    if (arbre) setNoeuds(arbre.noeuds)
  }, [arbre?.id])

  const calc = useMemo(() => {
    if (!arbre) return null
    return calculerArbre({ ...arbre, noeuds })
  }, [arbre, noeuds])

  const niveauProba = calc ? getNiveauProbaArbre(calc.probabiliteSommet) : 'faible'

  const initialiser = async () => {
    setInitLoading(true)
    const nouveau = await initializeFtaForEvenement(evenement)
    setInitLoading(false)
    if (nouveau) {
      addNotification({ user_id: '', type: 'success', title: 'Analyse FTA créée', message: `Arbre de défaillance initialisé pour ${evenement.reference}`, canal: 'in_app' })
    }
  }

  const toggleCause = (id: string) => {
    setNoeuds((prev) => {
      const suivant = prev.map((n) => n.id === id && n.type === 'cause' ? { ...n, estPresent: cycleEtat(n) } : n)
      if (arbre) setFtaNoeuds(arbre.id, suivant)
      return suivant
    })
  }

  const togglePorte = (id: string) => {
    setNoeuds((prev) => {
      const suivant = prev.map((n) => n.id === id && n.type !== 'cause' ? { ...n, porte: n.porte === 'ET' ? 'OU' : 'ET' as PorteFTA } : n)
      if (arbre) setFtaNoeuds(arbre.id, suivant)
      return suivant
    })
  }

  const syncCauses = () => {
    if (!arbre) return
    const marques = marquerCausesDepuisEvenement(noeuds, evenement)
    setNoeuds(marques)
    setFtaNoeuds(arbre.id, marques)
    addNotification({ user_id: '', type: 'info', title: 'Causes synchronisées', message: 'Causes pré-remplies depuis les données de l\'événement', canal: 'in_app' })
  }

  const terminerAnalyse = async () => {
    if (!arbre) return
    await updateFtaAnalyse(arbre.id, { statut: arbre.statut === 'termine' ? 'en_cours' : 'termine' })
  }

  const renderNoeud = (noeud: NoeudFTA, depth: number): React.ReactNode => {
    const enfants = noeuds.filter((n) => n.parentId === noeud.id)
    const prob = calc?.noeuds.find((n) => n.id === noeud.id)?.probabilite ?? noeud.probabilite
    return (
      <div key={noeud.id} className="ml-4 border-l border-border/60 pl-3" style={{ marginLeft: depth === 0 ? 0 : 16 }}>
        <div className="flex items-center gap-2 py-1.5">
          {noeud.type === 'sommet' && (
            <span className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: PROBA_ARBRE_COULEURS[niveauProba] }}>
              {prob} %
            </span>
          )}
          {noeud.type === 'intermediaire' && (
            <button
              onClick={() => togglePorte(noeud.id)}
              title="Basculer la porte (ET = toutes les causes, OU = au moins une)"
              className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: noeud.porte === 'ET' ? '#2563eb' : '#7c3aed' }}
            >
              {noeud.porte === 'ET' ? 'ET' : 'OU'}
            </button>
          )}
          {noeud.type === 'cause' && (
            <button onClick={() => toggleCause(noeud.id)} title="Cliquer pour basculer : Présent → Absent → Inconnu" className="shrink-0">
              {noeud.estPresent === true && <CheckCircle2 className="w-4 h-4 text-success" />}
              {noeud.estPresent === false && <XCircle className="w-4 h-4 text-danger" />}
              {noeud.estPresent !== true && noeud.estPresent !== false && <MinusCircle className="w-4 h-4 text-foreground/30" />}
            </button>
          )}
          <span className={noeud.type === 'sommet' ? "font-semibold text-foreground" : "text-foreground/90"}>{noeud.label}</span>
          {noeud.type === 'cause' && noeud.facteur && (
            <span className="ml-auto shrink-0 rounded-full bg-muted/40 px-2 py-0.5 text-[11px] text-foreground/60">
              {FACTEUR_LABELS[noeud.facteur]}
            </span>
          )}
          {noeud.type !== 'cause' && enfants.length > 0 && (
            <span className="ml-auto shrink-0 text-[11px] text-foreground/50">{prob} %</span>
          )}
        </div>
        {enfants.map((e) => renderNoeud(e, depth + 1))}
      </div>
    )
  }

  if (!arbre) {
    return (
      <Card variant="level" levelColor="primary" heading="Analyse causale — Arbre de Défaillance (FTA)" icon={<GitBranch className="w-4 h-4" />}>
        <div className="py-4 text-center">
          <ListTree className="w-10 h-10 mx-auto mb-3 text-foreground/30" />
          <p className="text-foreground font-medium mb-2">Aucune analyse FTA pour cet événement</p>
          <p className="text-sm text-foreground/50 mb-4">Générez un arbre de défaillance top-down : l'événement sommet sera décomposé en causes via des portes ET/OU.</p>
          <button onClick={initialiser} disabled={initLoading} className="btn-primary inline-flex items-center gap-2 !text-foreground">
            <Plus className="w-4 h-4" /> {initLoading ? 'Initialisation…' : 'Initialiser l\'analyse FTA'}
          </button>
        </div>
      </Card>
    )
  }

  const c = calc
  if (!c) return null

  return (
    <Card
      variant="level"
      levelColor={niveauProba === 'critique' ? 'danger' : niveauProba === 'eleve' ? 'warning' : niveauProba === 'moyen' ? 'primary' : 'success'}
      heading="Analyse causale — Arbre de Défaillance (FTA)"
      subtitle={arbre.evenementLabel}
      icon={<GitBranch className="w-4 h-4" />}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 max-h-[60vh] overflow-auto">
          <div className="space-y-1">
            {noeuds.filter((n) => n.parentId === undefined).map((n) => renderNoeud(n, 0))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card variant="level" size="sm" levelColor={niveauProba === 'critique' ? 'danger' : niveauProba === 'eleve' ? 'warning' : 'success'} title="Probabilité sommet" icon={<AlertTriangle className="w-3.5 h-3.5" />}>
              <div className="text-2xl font-bold" style={{ color: PROBA_ARBRE_COULEURS[niveauProba] }}>{c.probabiliteSommet} %</div>
            </Card>
            <Card variant="level" size="sm" levelColor="primary" title="Causes présentes" icon={<CheckCircle2 className="w-3.5 h-3.5" />}>
              <div className="text-2xl font-bold text-foreground">{c.noeuds.filter((n) => n.type === 'cause' && n.estPresent === true).length}</div>
            </Card>
          </div>

          <Card variant="role" size="sm" title={`Coupes minimales (${c.coupesMinimales.length})`} icon={<ListTree className="w-3.5 h-3.5" />}>
            {c.coupesMinimales.length === 0 && <p className="text-foreground/50 text-sm">Aucune coupe minimale calculable.</p>}
            <ol className="space-y-1 list-decimal list-inside">
              {c.coupesMinimales.slice(0, 6).map((coupe, i) => (
                <li key={i} className="text-sm text-foreground/90">
                  {coupe.map((id) => noeuds.find((n) => n.id === id)?.label || id).join(' + ')}
                </li>
              ))}
            </ol>
          </Card>

          <div className="flex flex-wrap gap-2">
            <button onClick={syncCauses} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted/30">
              <RefreshCw className="w-3.5 h-3.5" /> Sync causes
            </button>
            <button onClick={terminerAnalyse} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted/30">
              <CheckCircle2 className="w-3.5 h-3.5" /> {arbre.statut === 'termine' ? 'Rouvrir' : 'Terminer'}
            </button>
            <button onClick={() => deleteFtaAnalyse(arbre.id)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-danger hover:bg-danger/10">
              <XCircle className="w-3.5 h-3.5" /> Supprimer
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default FtaEvenementPanel
