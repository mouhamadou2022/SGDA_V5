// components/modules/fta/FtaModule.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAppStore, type EvenementSecurite } from '@/lib/store'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { Card } from '@/components/ui/card'
import { Role, GRAVITE_EVENEMENT } from '@/lib/config'
import {
  calculerArbre,
  marquerCausesDepuisEvenement,
  getNiveauProbaArbre,
  PROBA_ARBRE_COULEURS,
  FACTEUR_LABELS,
  type ArbreFTA,
  type NoeudFTA,
  type PorteFTA,
} from '@/lib/risque/ftaEngine'
import {
  GitBranch, Plus, CheckCircle2, XCircle, MinusCircle,
  RefreshCw, Trash2, Search, Filter, AlertTriangle, ListTree, ChevronRight,
} from 'lucide-react'

interface FtaModuleProps {
  user?: { role?: string; aerodrome_id?: string; id?: string; prenom?: string; nom?: string }
  userRole?: Role
  aerodromeId?: string
}

const GRAVITE_COULEURS: Record<string, string> = {
  CRITIQUE: '#dc2626',
  ORANGE: '#ea580c',
  JAUNE: '#ca8a04',
  GRIS: '#64748b',
  BLEU: '#2563eb',
}

function cycleEtat(noeud: NoeudFTA): boolean | null {
  if (noeud.estPresent === true) return false
  if (noeud.estPresent === false) return null
  return true
}

export function FtaModule({ user: userProp, userRole: userRoleProp, aerodromeId: aerodromeIdProp }: FtaModuleProps) {
  const user = useAppStore((s) => s.user)
  const userRole = (userRoleProp ?? userProp?.role ?? user?.role ?? 'inspector') as Role
  const userAerodrome = aerodromeIdProp ?? userProp?.aerodrome_id ?? user?.aerodrome_id
  const aerodromes = useAppStore((s) => s.aerodromes)
  const evenements = useAppStore((s) => s.evenements)
  const ftaAnalyses = useAppStore((s) => s.ftaAnalyses)
  const initializeFtaForEvenement = useAppStore((s) => s.initializeFtaForEvenement)
  const setFtaNoeuds = useAppStore((s) => s.setFtaNoeuds)
  const updateFtaAnalyse = useAppStore((s) => s.updateFtaAnalyse)
  const deleteFtaAnalyse = useAppStore((s) => s.deleteFtaAnalyse)
  const addNotification = useAppStore((s) => s.addNotification)

  const [selectedAerodrome, setSelectedAerodrome] = useState<string>(userAerodrome || 'tous')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEvenementId, setSelectedEvenementId] = useState<string | null>(null)
  const [noeuds, setNoeuds] = useState<NoeudFTA[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (userAerodrome) setSelectedAerodrome(userAerodrome)
  }, [userAerodrome])

  const evenementsFiltres = useMemo(() => {
    let list = evenements
    if (selectedAerodrome !== 'tous') list = list.filter((e) => e.aerodrome_id === selectedAerodrome)
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter((e) =>
        (e.reference || '').toLowerCase().includes(q) ||
        (e.type || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime())
  }, [evenements, selectedAerodrome, searchTerm])

  const selectedArbre = useMemo(() => {
    if (!selectedEvenementId) return null
    return ftaAnalyses.find((a) => a.evenementId === selectedEvenementId) || null
  }, [selectedEvenementId, ftaAnalyses])

  const selectedEvenement = useMemo(
    () => evenements.find((e) => e.id === selectedEvenementId) || null,
    [evenements, selectedEvenementId]
  )

  useEffect(() => {
    if (selectedArbre) setNoeuds(selectedArbre.noeuds)
  }, [selectedArbre?.id])

  const calc = useMemo(() => {
    if (!selectedArbre) return null
    return calculerArbre({ ...selectedArbre, noeuds })
  }, [selectedArbre, noeuds])

  const niveauProba = calc ? getNiveauProbaArbre(calc.probabiliteSommet) : 'faible'

  const analyserEvenement = async (ev: EvenementSecurite) => {
    const arbre = await initializeFtaForEvenement(ev)
    if (arbre) {
      setSelectedEvenementId(ev.id)
      addNotification({ user_id: '', type: 'success', title: 'Analyse FTA créée', message: `Arbre de défaillance initialisé pour ${ev.reference}`, canal: 'in_app' })
    }
  }

  const toggleCause = (id: string) => {
    setNoeuds((prev) => {
      const suivant = prev.map((n) => n.id === id && n.type === 'cause' ? { ...n, estPresent: cycleEtat(n) } : n)
      if (selectedArbre) setFtaNoeuds(selectedArbre.id, suivant)
      return suivant
    })
  }

  const togglePorte = (id: string) => {
    setNoeuds((prev) => {
      const suivant = prev.map((n) => n.id === id && n.type !== 'cause' ? { ...n, porte: n.porte === 'ET' ? 'OU' : 'ET' as PorteFTA } : n)
      if (selectedArbre) setFtaNoeuds(selectedArbre.id, suivant)
      return suivant
    })
  }

  const syncCauses = () => {
    if (!selectedArbre || !selectedEvenement) return
    const marques = marquerCausesDepuisEvenement(noeuds, selectedEvenement)
    setNoeuds(marques)
    setFtaNoeuds(selectedArbre.id, marques)
    addNotification({ user_id: '', type: 'info', title: 'Causes synchronisées', message: 'Causes pré-remplies depuis les données de l\'événement', canal: 'in_app' })
  }

  const terminerAnalyse = async () => {
    if (!selectedArbre) return
    const nouveauStatut = selectedArbre.statut === 'termine' ? 'en_cours' : 'termine'
    await updateFtaAnalyse(selectedArbre.id, { statut: nouveauStatut })
  }

  const renderNoeud = (noeud: NoeudFTA, depth: number): React.ReactNode => {
    const enfants = noeuds.filter((n) => n.parentId === noeud.id)
    const prob = calc?.noeuds.find((n) => n.id === noeud.id)?.probabilite ?? noeud.probabilite
    return (
      <div key={noeud.id} className="ml-4 border-l border-border/60 pl-3" style={{ marginLeft: depth === 0 ? 0 : 16 }}>
        <div className="flex items-center gap-2 py-1.5">
          {/* Porte / icône */}
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
            <button
              onClick={() => toggleCause(noeud.id)}
              title="Cliquer pour basculer : Présent → Absent → Inconnu"
              className="shrink-0"
            >
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

  const coupeLabels = (coupe: string[]): string => {
    return coupe.map((id) => noeuds.find((n) => n.id === id)?.label || id).join(' + ')
  }

  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundPosition: 'right 0.75rem center',
    backgroundRepeat: 'no-repeat'
  }

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="fta">
      <ModuleHeader
        icon={<GitBranch className="w-6 h-6" />}
        title="Arbre de Défaillance"
        description="Analyse causale top-down des événements (FTA) — portes ET/OU, probabilité de l'événement sommet et coupes minimales"
      />

      {!userAerodrome && (
        <Card variant="role" size="sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-foreground">Aérodrome :</label>
            <select
              value={selectedAerodrome}
              onChange={(e) => setSelectedAerodrome(e.target.value)}
              className="appearance-none rounded-md border border-border bg-card px-3 py-2 pr-8 text-sm text-foreground"
              style={selectStyle}
            >
              <option value="tous">Tous les aérodromes</option>
              {aerodromes.map((a) => (
                <option key={a.id} value={a.id}>{a.nom}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-sm text-foreground/50">
              <Search className="w-4 h-4" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher un événement..."
                className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-role-primary"
              />
            </div>
          </div>
        </Card>
      )}

      {/* Liste des événements */}
      <Card variant="role" title={`Événements (${evenementsFiltres.length})`} icon={<ListTree className="w-4 h-4" />}>
        {evenementsFiltres.length === 0 && (
          <p className="py-6 text-center text-foreground/50">Aucun événement pour les critères sélectionnés.</p>
        )}
        <div className="space-y-2">
          {evenementsFiltres.slice(0, 50).map((ev) => {
            const arbre = ftaAnalyses.find((a) => a.evenementId === ev.id)
            const estSelectionne = selectedEvenementId === ev.id
            return (
              <button
                key={ev.id}
                onClick={() => setSelectedEvenementId(ev.id)}
                className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${estSelectionne ? 'border-role-primary bg-role-primary/5' : 'border-border hover:bg-muted/20'}`}
              >
                <span
                  className="shrink-0 w-2 h-8 rounded-full"
                  style={{ backgroundColor: GRAVITE_COULEURS[ev.gravite] || '#64748b' }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{ev.reference}</span>
                    <span className="text-[11px] text-foreground/50">{new Date(ev.date || ev.created_at).toLocaleDateString('fr-FR')}</span>
                    {arbre && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-role-primary">
                        {arbre.probabilite_sommet !== undefined ? `${arbre.probabilite_sommet} %` : 'FTA'}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm text-foreground/70">{ev.type || ev.description}</div>
                </div>
                {arbre ? (
                  <ChevronRight className="w-4 h-4 text-foreground/40" />
                ) : (
                  <span
                    role="button"
                    onClick={(e) => { e.stopPropagation(); analyserEvenement(ev) }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-role-primary px-2 py-1 text-xs font-medium text-foreground hover:opacity-90"
                  >
                    <Plus className="w-3.5 h-3.5" /> Analyser
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </Card>

      {/* Détail de l'arbre */}
      {selectedEvenementId && !selectedArbre && (
        <Card variant="alert" alertBg="warning" size="sm">
          <p className="text-foreground">
            Aucune analyse FTA pour cet événement. Cliquez sur « Analyser » dans la liste pour générer l'arbre de défaillance.
          </p>
        </Card>
      )}

      {selectedArbre && calc && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Arbre */}
          <Card
            variant="level"
            levelColor={niveauProba === 'critique' ? 'danger' : niveauProba === 'eleve' ? 'warning' : niveauProba === 'moyen' ? 'teal' : 'success'}
            title="Arbre de défaillance"
            subtitle={selectedArbre.evenementLabel}
            icon={<GitBranch className="w-4 h-4" />}
            contentClassName="max-h-[60vh] overflow-auto"
          >
            <div className="space-y-1">
              {noeuds.filter((n) => n.parentId === undefined).map((n) => renderNoeud(n, 0))}
            </div>
            <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-2">
              <button onClick={syncCauses} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted/30">
                <RefreshCw className="w-3.5 h-3.5" /> Sync causes événement
              </button>
              <button onClick={terminerAnalyse} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> {selectedArbre.statut === 'termine' ? 'Rouvrir' : 'Terminer'}
              </button>
              <button onClick={() => deleteFtaAnalyse(selectedArbre.id)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-danger hover:bg-danger/10">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            </div>
          </Card>

          {/* Synthèse */}
          <div className="lg:col-span-2 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card variant="level" size="sm" levelColor="danger" title="Événement sommet" icon={<AlertTriangle className="w-4 h-4" />}>
                <div className="text-3xl font-bold" style={{ color: PROBA_ARBRE_COULEURS[niveauProba] }}>{calc.probabiliteSommet} %</div>
                <div className="text-[13px] text-foreground/50">Probabilité de l'événement sommet</div>
              </Card>
              <Card variant="level" size="sm" levelColor={niveauProba === 'critique' ? 'danger' : niveauProba === 'eleve' ? 'warning' : 'success'} title="Niveau" icon={<Filter className="w-4 h-4" />}>
                <div className="text-3xl font-bold text-foreground capitalize">{niveauProba}</div>
                <div className="text-[13px] text-foreground/50">{selectedArbre.templateId}</div>
              </Card>
              <Card variant="level" size="sm" levelColor="primary" title="Causes identifiées" icon={<CheckCircle2 className="w-4 h-4" />}>
                <div className="text-3xl font-bold text-foreground">{calc.noeuds.filter((n) => n.type === 'cause' && n.estPresent === true).length}</div>
                <div className="text-[13px] text-foreground/50">causes fondamentales présentes</div>
              </Card>
            </div>

            <Card variant="role" title={`Coupes minimales (${calc.coupesMinimales.length})`} icon={<ListTree className="w-4 h-4" />}>
              {calc.coupesMinimales.length === 0 && <p className="text-foreground/50">Aucune coupe minimale calculable.</p>}
              <ol className="space-y-1.5 list-decimal list-inside">
                {calc.coupesMinimales.map((coupe, i) => (
                  <li key={i} className="text-sm text-foreground/90">{coupeLabels(coupe)}</li>
                ))}
              </ol>
              <p className="mt-3 text-[13px] text-foreground/50">
                Une coupe minimale est une combinaison de causes fondamentales qui suffit à déclencher l'événement sommet.
                Les causes marquées « présentes » (✓) et incluses dans une coupe minimale sont à traiter en priorité (PAC).
              </p>
            </Card>

            {selectedArbre.causes_identifiees && selectedArbre.causes_identifiees.length > 0 && (
              <Card variant="alert" alertBg={niveauProba === 'critique' || niveauProba === 'eleve' ? 'warning' : 'success'} size="sm" title="Causes présentes" icon={<CheckCircle2 className="w-4 h-4" />}>
                <ul className="space-y-1">
                  {selectedArbre.causes_identifiees.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <CheckCircle2 className="w-4 h-4 text-success shrink-0" /> {c}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      {!selectedEvenementId && mounted && null}
    </div>
  )
}
