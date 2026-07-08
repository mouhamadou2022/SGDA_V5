// components/modules/profil-risque/BowTieSelfAssessment.tsx
// Auto-évaluation exploitant — checklist par domaine avec checkbox + observations
// Design : l'exploitant coche des actions, note ses observations, voit l'impact en temps réel

'use client'

import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Barriere } from '@/lib/risque/types'
import type { ProfilRisque } from '@/lib/store'
import { Shield, AlertTriangle, CheckCircle2, Target, Zap, ArrowUp, Brain, X, Plus, FileText } from 'lucide-react'
import { getRiskLevelVariant } from '@/lib/risque'

function getScoreClr(s: number) {
  if (s >= 80) return 'text-success'; if (s >= 60) return 'text-primary'
  if (s >= 30) return 'text-warning'; return 'text-danger'
}
function getScoreBg(s: number) {
  if (s >= 80) return 'bg-success-soft'; if (s >= 60) return 'bg-primary-soft'
  if (s >= 30) return 'bg-warning-soft'; return 'bg-danger-soft'
}
function getBarColor(v: number) {
  return v >= 80 ? 'bg-success' : v >= 60 ? 'bg-primary' : v >= 40 ? 'bg-warning' : 'bg-danger'
}

function computeGain(currentEff: number, targetVal: number): number {
  return Math.max(1, Math.round((targetVal - Math.min(currentEff, targetVal)) * 0.25))
}

// Génère une action concrète depuis les données de la barrière
function buildActionTexte(barriere: Barriere, domaine: string, profil: ProfilRisque): string {
  const nom = barriere.nom.toLowerCase()
  if (nom.includes('sgs') || nom.includes('maturité')) {
    if (profil.c1 < 30) return 'Rédiger le manuel SGS et le faire valider par la direction — c\'est votre responsabilité d\'exploitant'
    if (profil.c1 < 50) return 'Former le personnel aux procédures SGS et organiser une réunion sécurité mensuelle'
    return 'Mettre en place des indicateurs de performance SGS avec suivi mensuel'
  }
  if (nom.includes('audit') || nom.includes('inspection')) {
    return 'Préparer vos infrastructures et équipements ' + domaine + ' pour la prochaine inspection ANACIM'
  }
  if (nom.includes('pac') || nom.includes('plan')) {
    if (profil.c2 < 30) return 'Ouvrir des plans d\'action pour chaque écart et désigner un responsable — c\'est à vous de proposer les actions'
    if (profil.c2 < 50) return 'Suivre l\'avancement des PAC chaque semaine et relancer les retardataires'
    return 'Clôturer les PAC avec preuves et soumettre à l\'ANACIM'
  }
  if (nom.includes('mesure') || nom.includes('ia') || nom.includes('nouvelle')) {
    return 'Appliquer les mesures correctives suggérées et documenter les résultats pour la prochaine surveillance'
  }
  return 'Faire votre propre évaluation de "' + barriere.nom + '" dans le domaine ' + domaine + ' — l\'ANACIM vérifiera lors de la prochaine visite'
}

// But par défaut : niveau "En place" (60%)
const CIBLE_DEFAUT = 60

export interface AutoEvalAction {
  id: string
  barriereId: string
  texte: string
  gain: number
  isCustom?: boolean
}

interface Props {
  domaines: any[]
  score: number
  aerodromeCode: string
  aerodromeName: string
  onClose: () => void
  profil: ProfilRisque
}

export default function BowTieSelfAssessment({
  domaines, score, aerodromeCode, aerodromeName, onClose, profil,
}: Props) {
  // État local : actions cochées + observations + actions personnalisées
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [observations, setObservations] = useState<Record<string, string>>({})
  const [customActions, setCustomActions] = useState<AutoEvalAction[]>([])

  // Génère les actions pour toutes les barrières faibles des domaines
  const actions = useMemo(() => {
    const result: AutoEvalAction[] = []
    domaines.forEach((b: any) => {
      const toutes = [...(b.barrieresPreventives || []), ...(b.barrieresCorrectives || [])]
      toutes.forEach((p: Barriere) => {
        if (p.efficacite >= CIBLE_DEFAUT) return
        const gain = computeGain(p.efficacite, CIBLE_DEFAUT)
        result.push({
          id: 'action-' + p.id,
          barriereId: p.id,
          texte: buildActionTexte(p, b.domaine, profil),
          gain,
        })
      })
    })
    return result
  }, [domaines, profil])

  // Toutes les actions (générées + personnalisées)
  const toutesActions = useMemo(() => [...actions, ...customActions], [actions, customActions])

  // Gain total = somme des gains des actions cochées
  const gainReel = useMemo(() =>
    toutesActions.filter(a => checked[a.id]).reduce((s, a) => s + a.gain, 0),
    [checked, toutesActions]
  )

  const scoreProjete = Math.min(100, score + gainReel)
  const nbChecked = Object.values(checked).filter(Boolean).length
  const nbTotal = toutesActions.length

  // Ajouter une action personnalisée
  const handleAddCustom = useCallback(() => {
    const id = 'custom-' + Date.now()
    setCustomActions(prev => [...prev, { id, barriereId: '', texte: '', gain: 1, isCustom: true }])
    // Scroll to it after render
    setTimeout(() => {
      const el = document.getElementById('action-' + id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
  }, [])

  const handleCustomTextChange = useCallback((id: string, texte: string) => {
    setCustomActions(prev => prev.map(a => a.id === id ? { ...a, texte } : a))
  }, [])

  const handleCustomGainChange = useCallback((id: string, gain: number) => {
    setCustomActions(prev => prev.map(a => a.id === id ? { ...a, gain: Math.max(1, Math.min(20, gain)) } : a))
  }, [])

  const handleRemoveCustom = useCallback((id: string) => {
    setCustomActions(prev => prev.filter(a => a.id !== id))
    setChecked(prev => { const n = { ...prev }; delete n[id]; return n })
    setObservations(prev => { const n = { ...prev }; delete n[id]; return n })
  }, [])

  // Regroupe les actions par domaine pour l'affichage
  const actionsParDomaine = useMemo(() => {
    const map: Record<string, { domaine: string; danger: string; niveau: string; prob: number; defaillance: string; consequence: string; barrieres: Barriere[]; actions: AutoEvalAction[] }> = {}
    domaines.forEach((b: any) => {
      map[b.domaine] = {
        domaine: b.domaine,
        danger: b.danger,
        niveau: b.niveauRisqueResiduel,
        prob: b.probabiliteResiduelle,
        defaillance: b.defaillance || b.scenario || '',
        consequence: b.consequence || '',
        barrieres: [...(b.barrieresPreventives || []), ...(b.barrieresCorrectives || [])],
        actions: [],
      }
    })
    toutesActions.forEach(a => {
      // Trouve le domaine de cette action
      for (const b of domaines) {
        const toutes = [...(b.barrieresPreventives || []), ...(b.barrieresCorrectives || [])]
        if (toutes.some((p: Barriere) => p.id === a.barriereId)) {
          if (map[b.domaine]) map[b.domaine].actions.push(a)
          break
        }
      }
      // Actions customs sans barriereId → les mettre dans le premier domaine
      if (a.isCustom && !a.barriereId && domaines.length > 0) {
        map[domaines[0].domaine].actions.push(a)
      }
    })
    return Object.values(map).filter(d => d.actions.length > 0)
  }, [domaines, toutesActions])

  // Top 3 actions prioritaires (non cochées, classées par gain)
  const topPriorites = useMemo(() =>
    toutesActions
      .filter(a => !checked[a.id])
      .sort((a, b) => b.gain - a.gain)
      .slice(0, 3),
    [toutesActions, checked]
  )

  return createPortal(
    <div className="modal-overlay z-[100]" onClick={onClose}>
      <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary shadow-2xl">
          {/* Header */}
          <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title flex items-center gap-2">
              <FileText className="w-5 h-5 text-role-primary" />
              Auto-évaluation — {aerodromeCode}
            </div>
            <button className="modal-close" onClick={onClose}><X className="w-5 h-5" /></button>
          </div>

          <div className="modal-body p-5 space-y-5">

            {/* Score overview */}
            <div className={`rounded-xl p-4 ${getScoreBg(scoreProjete)} border border-border/50`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Score de risque</p>
                  <p className="text-[10px] text-muted-foreground">
                    {nbChecked}/{nbTotal} action{nbTotal > 1 ? 's' : ''} cochée{nbChecked > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">{score} → </span>
                  <span className={`text-2xl font-bold ${getScoreClr(scoreProjete)}`}>{scoreProjete}/100</span>
                  <span className="text-sm text-success font-semibold ml-1">+{gainReel}</span>
                </div>
              </div>
              <div className="progress h-2.5">
                <div className={`progress-bar ${scoreProjete >= 80 ? 'bg-success' : scoreProjete >= 60 ? 'bg-primary' : scoreProjete >= 30 ? 'bg-warning' : 'bg-danger'}`}
                  style={{ width: `${scoreProjete}%`, transition: 'width 0.3s ease' }} />
              </div>
            </div>

            {/* Domaines */}
            <div className="space-y-4">
              {actionsParDomaine.map(d => (
                <div key={d.domaine} className={`rounded-xl border-2 overflow-hidden ${d.niveau === 'critique' ? 'border-danger/30' : d.niveau === 'eleve' ? 'border-warning/30' : 'border-border'}`}>
                  {/* Entête domaine */}
                  <div className={`p-3 ${d.niveau === 'critique' ? 'bg-danger-soft/10' : d.niveau === 'eleve' ? 'bg-warning-soft/10' : 'bg-muted/10'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-foreground">{d.domaine}</span>
                      <span className={`badge text-[10px] ${getRiskLevelVariant(d.niveau)}`}>
                        {d.niveau}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto">Risque résiduel {d.prob}%</span>
                    </div>
                  </div>

                  <div className="p-3 space-y-3">
                    {/* Bow tie résumé */}
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div className="bg-danger-soft/10 rounded-lg p-2">
                        <p className="font-semibold text-danger mb-0.5">⚠ Défaillance</p>
                        <p className="text-foreground">{d.defaillance || d.danger}</p>
                      </div>
                      <div className="bg-primary-soft/10 rounded-lg p-2">
                        <p className="font-semibold text-primary mb-0.5">🛡 Barrières existantes</p>
                        {d.barrieres.map(b => (
                          <div key={b.id} className="flex items-center gap-1 text-[9px]">
                            <span className="text-foreground truncate">{b.nom}</span>
                            <span className={`font-semibold shrink-0 ${getScoreClr(b.efficacite)}`}>{b.efficacite}%</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-warning-soft/10 rounded-lg p-2">
                        <p className="font-semibold text-warning mb-0.5">💥 Conséquence</p>
                        <p className="text-foreground">{d.consequence || 'Non-conformité OACI'}</p>
                      </div>
                    </div>

                    {/* Tableau des actions */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="text-left p-1.5 text-foreground font-semibold w-8"></th>
                            <th className="text-left p-1.5 text-foreground font-semibold">Actions à mener</th>
                            <th className="text-center p-1.5 text-foreground font-semibold w-16">Gain</th>
                            <th className="text-left p-1.5 text-foreground font-semibold">Observations</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.actions.map(a => (
                            <tr key={a.id} id={'action-' + a.id} className="border-b border-border/20 hover:bg-muted/10 transition-colors">
                              <td className="p-1.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={!!checked[a.id]}
                                  onChange={() => setChecked(prev => ({ ...prev, [a.id]: !prev[a.id] }))}
                                  className="w-4 h-4 rounded border-border accent-role-primary cursor-pointer"
                                />
                              </td>
                              <td className="p-1.5">
                                {a.isCustom ? (
                                  <input
                                    type="text"
                                    value={a.texte}
                                    onChange={e => handleCustomTextChange(a.id, e.target.value)}
                                    placeholder="Décrivez votre action..."
                                    className="w-full bg-transparent border-b border-border/50 text-foreground text-xs focus:outline-none focus:border-role-primary"
                                  />
                                ) : (
                                  <span className={`text-foreground ${checked[a.id] ? 'line-through text-muted-foreground' : ''}`}>{a.texte}</span>
                                )}
                              </td>
                              <td className="p-1.5 text-center">
                                {a.isCustom ? (
                                  <input
                                    type="number"
                                    value={a.gain}
                                    min={1}
                                    max={20}
                                    onChange={e => handleCustomGainChange(a.id, parseInt(e.target.value) || 1)}
                                    className="w-12 text-center bg-transparent border border-border/50 rounded text-xs text-foreground"
                                  />
                                ) : (
                                  <span className={checked[a.id] ? 'text-success font-semibold' : 'text-muted-foreground'}>
                                    +{a.gain}
                                  </span>
                                )}
                              </td>
                              <td className="p-1.5">
                                <input
                                  type="text"
                                  value={observations[a.id] || ''}
                                  onChange={e => setObservations(prev => ({ ...prev, [a.id]: e.target.value }))}
                                  placeholder="Notes personnelles..."
                                  className="w-full bg-muted/20 rounded px-1.5 py-1 text-[10px] text-foreground placeholder:text-muted-foreground/50 border border-transparent focus:border-role-primary focus:outline-none"
                                />
                              </td>
                              {a.isCustom && (
                                <td className="p-1.5">
                                  <button onClick={() => handleRemoveCustom(a.id)} className="text-danger hover:text-danger/70 text-xs">
                                    <X className="w-3 h-3" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Score domaine */}
                    {(() => {
                      const gainDomaine = d.actions.filter(a => checked[a.id]).reduce((s, a) => s + a.gain, 0)
                      if (gainDomaine <= 0) return null
                      return (
                        <div className="text-[10px] text-success font-semibold text-right">
                          +{gainDomaine} pt{gainDomaine > 1 ? 's' : ''} sur ce domaine
                        </div>
                      )
                    })()}
                  </div>
                </div>
              ))}
            </div>

            {/* Ajouter une action */}
            <button onClick={handleAddCustom} className="w-full btn btn-sm btn-outline gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              Ajouter une action personnalisée
            </button>

            {/* Top 3 priorités restantes */}
            {topPriorites.length > 0 && (
              <div className="bg-danger-soft/10 border border-danger/20 rounded-xl p-4">
                <p className="text-xs font-bold text-danger flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Actions prioritaires restantes
                </p>
                <div className="space-y-1.5">
                  {topPriorites.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-xs">
                      <button
                        onClick={() => setChecked(prev => ({ ...prev, [a.id]: !prev[a.id] }))}
                        className="w-4 h-4 rounded border border-border hover:border-role-primary flex items-center justify-center shrink-0"
                      >
                        {checked[a.id] && <CheckCircle2 className="w-3 h-3 text-success" />}
                      </button>
                      <span className="flex-1 text-foreground">{a.texte}</span>
                      <span className="text-success font-semibold">+{a.gain}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bouton fermer */}
            <button onClick={onClose} className="btn btn-primary w-full gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Terminer — {nbChecked} action{nbChecked > 1 ? 's' : ''} planifiée{nbChecked > 1 ? 's' : ''}
            </button>

          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
