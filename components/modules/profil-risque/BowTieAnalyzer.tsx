// components/modules/profil-risque/BowTieAnalyzer.tsx
// Analyse Bow-Tie data-driven + IA (Groq) : dangers, barrières, conséquences, facteurs d'escalation

'use client'

import { useState, useMemo, useEffect } from 'react'
import { ProfilRisque, Ecart, Surveillance, EvenementSecurite } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { generateBowTieModels, generateAIBowTieDomain, DOMAINES_BT } from '@/lib/risque/bowTieEngine'
import type { BowTieModele, Barriere } from '@/lib/risque/types'
import type { AIBowTieResult } from '@/lib/risque/bowTieEngine'
import { computeBarrierEfficacite, getConfianceLabel, getConfianceDot } from '@/lib/risque/bayesianNetwork'
import { Card } from '@/components/ui/card'
import { Shield, AlertTriangle, CheckCircle2, XCircle, Target, Zap, TrendingUp, Clock, BarChart3, ExternalLink, Sparkles, Users } from 'lucide-react'

interface Props {
  profil: ProfilRisque
  ecarts: Ecart[]
  surveillances: Surveillance[]
  evenements?: EvenementSecurite[]
}

function getEffCls(v: number) {
  return v >= 80 ? 'bg-success text-white' : v >= 60 ? 'bg-primary text-white' : v >= 40 ? 'bg-warning text-white' : 'bg-danger text-white'
}
function getRiskCls(p: number) {
  return p >= 50 ? 'badge danger' : p >= 30 ? 'badge warning' : p >= 15 ? 'badge primary' : 'badge success'
}
function getNiveauLabel(n: string): string {
  const m: Record<string, string> = { critique: 'Critique', eleve: 'Élevé', moyen: 'Moyen', faible: 'Faible', tres_faible: 'Très faible' }
  return m[n] || n
}
function getNiveauColor(v: number): string {
  if (v >= 80) return 'text-success'; if (v >= 60) return 'text-primary'; if (v >= 30) return 'text-warning'; return 'text-danger'
}

function aiResultToBowTieModele(result: AIBowTieResult, original: BowTieModele): BowTieModele {
  return {
    ...original,
    danger: result.danger,
    defaillance: result.defaillance,
    scenario: result.scenario,
    consequence: result.consequence,
    barrieresPreventives: result.barrieresPreventives.map((b, i) => ({
      id: `ai-prev-${original.domaine}-${i}`,
      nom: `${b.nom} ${result.source === 'groq_llm' ? '🧠' : ''}`,
      type: 'preventive' as const,
      efficace: b.efficacite > 50,
      efficacite: b.efficacite,
      dernierTest: original.lastAssessed,
      remarque: b.remarque,
    })),
    barrieresCorrectives: result.barrieresCorrectives.map((b, i) => ({
      id: `ai-corr-${original.domaine}-${i}`,
      nom: `${b.nom} ${result.source === 'groq_llm' ? '🧠' : ''}`,
      type: 'corrective' as const,
      efficace: b.efficacite > 50,
      efficacite: b.efficacite,
      dernierTest: original.lastAssessed,
      remarque: b.remarque,
    })),
  }
}

export default function BowTieAnalyzer({ profil, ecarts, surveillances, evenements }: Props) {
  const [selectedDomaine, setSelectedDomaine] = useState<string>('__all__')
  const [showAll, setShowAll] = useState(false)
  const [aiEnriched, setAiEnriched] = useState<Record<string, BowTieModele>>({})
  const [loadingAi, setLoadingAi] = useState<string | null>(null)
  const aerodromeBT = useAppStore(s => s.aerodromes).find(a => a.id === profil.aerodrome_id)
  const statut_sgs = aerodromeBT?.statut_sgs

  const baseModels = useMemo(() => {
    if (profil.bowtie_metrics && profil.bowtie_metrics.length > 0 && !evenements) {
      return profil.bowtie_metrics
    }
    return generateBowTieModels(profil, ecarts, surveillances, evenements, statut_sgs)
  }, [profil, ecarts, surveillances, evenements, statut_sgs])

  const models = useMemo(() => {
    return baseModels.map(m => aiEnriched[m.domaine] || m)
  }, [baseModels, aiEnriched])

  const domainesDisponibles = useMemo(() => models.map(m => m.domaine), [models])

  const current: BowTieModele | undefined = selectedDomaine === '__all__' ? undefined : models.find(m => m.domaine === selectedDomaine)

  // Reset selection si le domaine n'est plus disponible (ex: SGS devient non_applicable)
  useEffect(() => {
    if (selectedDomaine !== '__all__' && domainesDisponibles.length > 0 && !domainesDisponibles.includes(selectedDomaine)) {
      setSelectedDomaine('__all__')
    }
  }, [selectedDomaine, domainesDisponibles])

  const isAiCurrent = current ? !!aiEnriched[current.domaine] : false

  // Enrichissement bayésien : remplace les efficacités recopiées par des valeurs causales
  const bayesianEnrich = useMemo(() => {
    if (!current || isAiCurrent) return null
    return computeBarrierEfficacite(current, profil.c1, profil.c2, 50, profil.c5)
  }, [current, isAiCurrent, profil.c1, profil.c2, profil.c5])

  // Modèle affiché : déterministe enrichi par bayésien, ou IA enrichi
  const displayModel = useMemo(() => {
    if (!current) return null
    if (isAiCurrent) return current
    if (!bayesianEnrich) return current
    return {
      ...current,
      barrieresPreventives: bayesianEnrich.barrieresPreventives,
      barrieresCorrectives: bayesianEnrich.barrieresCorrectives.filter(b => !b.id.includes('new-')),
      probabiliteResiduelle: bayesianEnrich.probabiliteResiduelle,
    }
  }, [current, isAiCurrent, bayesianEnrich])

  const confianceReseau = bayesianEnrich?.confiance ?? 0

  const escalation = useMemo(() => {
    if (!displayModel) return null
    const allBarriers = [...displayModel.barrieresPreventives, ...displayModel.barrieresCorrectives]
    const weakest = [...allBarriers].sort((a, b) => a.efficacite - b.efficacite)[0]
    if (!weakest) return null
    const gainEstime = Math.round((Math.min(90, weakest.efficacite + 20) - weakest.efficacite) * 0.4)
    return { weakest, gainEstime }
  }, [displayModel])

  const handleAIEnrich = async () => {
    if (!displayModel || loadingAi) return
    setLoadingAi(displayModel.domaine)
    try {
      const ecartsDom = ecarts.filter(e => e.domaine === displayModel.domaine)
      const surveillancesDom = surveillances.filter(s => (s.portee || []).includes(displayModel.domaine))
      const evenementsDom = evenements?.filter(e => displayModel.domaine && (e.type?.toLowerCase().includes(displayModel.domaine.toLowerCase())))
      const result = await generateAIBowTieDomain({
        c1: profil.c1, c2: profil.c2, c3: profil.c3, c5: profil.c5,
        scoreGlobal: profil.score_global,
        ecartsDom, surveillancesDom, evenementsDom,
        domaine: displayModel.domaine,
      })
      const enriched = aiResultToBowTieModele(result, displayModel)
      setAiEnriched(prev => ({ ...prev, [displayModel.domaine]: enriched }))
    } catch {}
    setLoadingAi(null)
  }

  const handleResetAI = () => {
    if (!displayModel) return
    setAiEnriched(prev => {
      const next = { ...prev }
      delete next[displayModel.domaine]
      return next
    })
  }

  return (
    <Card heading={<div className="flex items-center justify-between flex-wrap gap-3 w-full">
      <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-role-primary" />Analyse Bow-Tie — Barrières de défense</div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={e => { setShowAll(e.target.checked); if (!e.target.checked) setSelectedDomaine('__all__') }} className="form-checkbox" />
          Vue globale
        </label>
        {!showAll && domainesDisponibles.length > 0 && (
          <select className="form-select py-1.5 text-sm" value={selectedDomaine === '__all__' || !domainesDisponibles.includes(selectedDomaine) ? domainesDisponibles[0] : selectedDomaine} onChange={e => setSelectedDomaine(e.target.value)}>
            {domainesDisponibles.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>
    </div>}>
      {showAll ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="p-2 text-left text-foreground font-medium">Domaine</th>
                <th className="p-2 text-center text-foreground font-medium">IA</th>
                <th className="p-2 text-center text-foreground font-medium">Écarts</th>
                <th className="p-2 text-center text-foreground font-medium">Risque résiduel</th>
                <th className="p-2 text-center text-foreground font-medium">Barrière prév. faible</th>
                <th className="p-2 text-center text-foreground font-medium">Barrière corr. faible</th>
                <th className="p-2 text-center text-foreground font-medium">Gain estimé</th>
              </tr>
            </thead>
            <tbody>
              {models.map(m => {
                const weakestPrev = [...m.barrieresPreventives].sort((a, b) => a.efficacite - b.efficacite)[0]
                const weakestCorr = [...m.barrieresCorrectives].sort((a, b) => a.efficacite - b.efficacite)[0]
                const gain = weakestPrev ? Math.round((Math.min(90, weakestPrev.efficacite + 20) - weakestPrev.efficacite) * 0.4) : 0
                const nbEcarts = parseInt(m.danger.match(/(\d+)/)?.[0] || '0')
                const hasAI = !!aiEnriched[m.domaine]
                return (
                  <tr key={m.domaine} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => { setShowAll(false); setSelectedDomaine(m.domaine) }}>
                    <td className="p-2 font-medium text-foreground flex items-center gap-1">{m.domaine}</td>
                    <td className="p-2 text-center">{hasAI ? <Sparkles className="w-3.5 h-3.5 text-primary mx-auto" /> : <span className="text-foreground">—</span>}</td>
                    <td className="p-2 text-center"><span className={nbEcarts > 0 ? 'text-danger font-bold' : 'text-foreground'}>{nbEcarts}</span></td>
                    <td className="p-2 text-center"><span className={getRiskCls(m.probabiliteResiduelle)}>{m.probabiliteResiduelle}%</span></td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-16 progress h-1.5"><div className={`progress-bar h-1.5 rounded-full ${getEffCls(weakestPrev?.efficacite || 0)}`} style={{ width: `${weakestPrev?.efficacite || 0}%` }} /></div>
                        <span className={`text-[10px] ${getNiveauColor(weakestPrev?.efficacite || 0)}`}>{weakestPrev?.efficacite || 0}%</span>
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="w-16 progress h-1.5"><div className={`progress-bar h-1.5 rounded-full ${getEffCls(weakestCorr?.efficacite || 0)}`} style={{ width: `${weakestCorr?.efficacite || 0}%` }} /></div>
                        <span className={`text-[10px] ${getNiveauColor(weakestCorr?.efficacite || 0)}`}>{weakestCorr?.efficacite || 0}%</span>
                      </div>
                    </td>
                    <td className="p-2 text-center"><span className="text-success font-semibold">+{gain}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-xs text-foreground mt-2">Cliquez sur une ligne pour voir le détail du domaine.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {!displayModel ? (
            <div className="text-center py-8 text-foreground"><Shield className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Aucune donnée pour ce domaine</p></div>
          ) : (
            <>
              {/* Boutons IA */}
              <div className="flex items-center justify-end gap-2">
                {!isAiCurrent ? (
                  <button onClick={handleAIEnrich} disabled={loadingAi === displayModel.domaine}
                    className="btn btn-sm btn-primary gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />{loadingAi === displayModel.domaine ? 'Analyse IA en cours...' : 'Enrichir avec IA (Groq)'}
                  </button>
                ) : (
                  <button onClick={handleResetAI}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted text-foreground hover:bg-muted/80">
                    <XCircle className="w-3.5 h-3.5" />Revenir au mode déterministe
                  </button>
                )}
              </div>

              {/* Chaîne Danger → Défaillance → Scénario → Conséquence */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[
                  { label: 'Danger', value: displayModel.danger, icon: AlertTriangle, cls: 'border-danger/30 bg-danger-soft' },
                  { label: 'Défaillance', value: displayModel.defaillance, icon: Target, cls: 'border-warning/30 bg-warning-soft' },
                  { label: 'Scénario', value: displayModel.scenario, icon: Zap, cls: 'border-primary/30 bg-primary-soft' },
                  { label: 'Conséquence', value: displayModel.consequence, icon: Shield, cls: 'border-role-primary/30 bg-role-primary-soft' },
                ].map(({ label, value, icon: Icon, cls }) => (
                  <div key={label} className={`rounded-xl p-3 border text-center ${cls}`}>
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Icon className="w-4 h-4" />
                      <span className="text-xs font-semibold text-foreground">{label}</span>
                      {isAiCurrent && <Sparkles className="w-3 h-3 text-primary" />}
                    </div>
                    <p className="text-sm font-medium text-foreground">{value}</p>
                  </div>
                ))}
              </div>
              {isAiCurrent && (
                <p className="text-xs text-primary text-center">Analyse générée par IA (Groq — llama-3.3-70b) à partir des données réelles</p>
              )}

              {/* Facteur d'escalation — barrière la plus faible */}
              {escalation && escalation.weakest.efficacite < 60 && (
                <div className="rounded-xl border-2 border-danger/30 bg-danger-soft/20 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-danger">Facteur d'escalation détecté</p>
                      <p className="text-xs text-foreground mt-1">
                        La barrière <strong>{escalation.weakest.nom}</strong> est la plus faible (efficacité {escalation.weakest.efficacite}%).
                        {escalation.weakest.type === 'preventive' ? ' Renforcer cette barrière préventive réduirait la probabilité de défaillance.' : ' Améliorer cette barrette corrective accélérerait le retour à la conformité.'}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-foreground">Actuel:</span>
                          <div className="progress w-16 h-1.5"><div className="progress-bar bg-danger h-1.5 rounded-full" style={{ width: `${escalation.weakest.efficacite}%` }} /></div>
                          <span className="text-xs font-bold text-danger">{escalation.weakest.efficacite}%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-foreground">Cible:</span>
                          <div className="progress w-16 h-1.5"><div className="progress-bar bg-success h-1.5 rounded-full" style={{ width: `${Math.min(90, escalation.weakest.efficacite + 20)}%` }} /></div>
                          <span className="text-xs font-bold text-success">{Math.min(90, escalation.weakest.efficacite + 20)}%</span>
                        </div>
                        <span className="text-xs font-bold text-success">Gain estimé: +{escalation.gainEstime} pts</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Barrières préventives */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-success" />
                  <span className="text-sm font-semibold text-foreground">Barrières préventives ({displayModel.barrieresPreventives.length})</span>
                  {isAiCurrent && <Sparkles className="w-3 h-3 text-primary" />}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {displayModel.barrieresPreventives.map(b => (
                    <div key={b.id} className={`p-3 rounded-lg border ${b.efficace ? 'border-success/30 bg-success-soft/30' : 'border-danger/30 bg-danger-soft/30'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{b.nom}</p>
                          <p className="text-xs text-foreground">Dernier test: {b.dernierTest ? new Date(b.dernierTest).toLocaleDateString('fr-FR') : 'N/A'}</p>
                          {!isAiCurrent && <span className="text-xs text-foreground mt-0.5 block">{getConfianceDot(confianceReseau)} {getConfianceLabel(confianceReseau)}</span>}
                        </div>
                        {b.efficace ? <CheckCircle2 className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-danger" />}
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-0.5"><span className="text-foreground">Efficacité</span><span className="font-semibold text-foreground">{b.efficacite}%</span></div>
                        <div className="progress h-1.5"><div className={`progress-bar h-1.5 rounded-full ${getEffCls(b.efficacite)}`} style={{ width: `${b.efficacite}%` }} /></div>
                      </div>
                      {b.remarque && <p className="text-xs text-foreground mt-2 italic">{b.remarque}</p>}
                      {b.efficacite < 50 && <p className="text-xs text-danger mt-1 font-semibold">⚠ Action prioritaire requise</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Barrières correctives */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-warning" />
                  <span className="text-sm font-semibold text-foreground">Barrières correctives ({displayModel.barrieresCorrectives.length})</span>
                  {isAiCurrent && <Sparkles className="w-3 h-3 text-primary" />}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {displayModel.barrieresCorrectives.map(b => (
                    <div key={b.id} className={`p-3 rounded-lg border ${b.efficace ? 'border-success/30 bg-success-soft/30' : 'border-danger/30 bg-danger-soft/30'}`}>
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{b.nom}</p>
                          <p className="text-xs text-foreground">Dernier test: {b.dernierTest ? new Date(b.dernierTest).toLocaleDateString('fr-FR') : 'N/A'}</p>
                          {!isAiCurrent && <span className="text-xs text-foreground mt-0.5 block">{getConfianceDot(confianceReseau)} {getConfianceLabel(confianceReseau)}</span>}
                        </div>
                        {b.efficace ? <CheckCircle2 className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-danger" />}
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-0.5"><span className="text-foreground">Efficacité</span><span className="font-semibold text-foreground">{b.efficacite}%</span></div>
                        <div className="progress h-1.5"><div className={`progress-bar h-1.5 rounded-full ${getEffCls(b.efficacite)}`} style={{ width: `${b.efficacite}%` }} /></div>
                      </div>
                      {b.remarque && <p className="text-xs text-foreground mt-2 italic">{b.remarque}</p>}
                      <button onClick={() => useAppStore.getState().setActiveModule('plans-actions')}
                        className="mt-2 text-xs text-primary hover:underline flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />Voir les PAC du domaine {displayModel.domaine}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Facteurs organisationnels — visible pour tous les domaines quand le réseau bayésien est actif */}
              {!isAiCurrent && confianceReseau > 0 && displayModel.domaine && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-semibold text-foreground">Facteurs organisationnels</span>
                    <span className="text-xs text-foreground ml-2">{getConfianceDot(confianceReseau)} {getConfianceLabel(confianceReseau)}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { id: 'charge_travail', label: 'Charge de travail', source: 'planning.tauxOccupation' },
                      { id: 'formation_adequation', label: "Adéquation formation", source: 'écarts COP / compétences' },
                      { id: 'supervision_quality', label: 'Qualité supervision', source: 'ratio chefs disponibles' },
                    ].map(f => (
                      <div key={f.id} className="p-3 rounded-lg border border-purple-200/30 bg-purple-50/10">
                        <p className="text-sm font-medium text-foreground">{f.label}</p>
                        <p className="text-xs text-foreground mt-1">{f.source}</p>
                        <div className="mt-2 flex items-center gap-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground">À calculer</span>
                          <span className="text-[10px] text-foreground">— impact estimé via réseau bayésien</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risque résiduel + Bénéfices + Impact C1-C5 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-muted/20 border border-border">
                  <p className="text-xs text-foreground">Risque résiduel</p>
                  <p className={`text-2xl font-bold mt-1 ${displayModel.probabiliteResiduelle >= 50 ? 'text-danger' : displayModel.probabiliteResiduelle >= 30 ? 'text-warning' : 'text-primary'}`}>{displayModel.probabiliteResiduelle}%</p>
                  <span className={getRiskCls(displayModel.probabiliteResiduelle)}>{getNiveauLabel(displayModel.niveauRisqueResiduel)}</span>
                  <div className="progress h-2 mt-3"><div className="progress-bar" style={{ width: `${displayModel.probabiliteResiduelle}%` }} /></div>
                  <p className="text-xs text-foreground mt-2">Probabilité d'incident malgré les barrières</p>
                </div>
                <div className="p-4 rounded-xl bg-success-soft/30 border border-success/20">
                  <p className="text-xs text-foreground">Bénéfices estimés</p>
                  <div className="mt-2 space-y-1 text-xs">
                    {escalation && <p className="flex items-center gap-1 text-foreground"><TrendingUp className="w-3 h-3 text-success" />Gain possible: +{escalation.gainEstime} pts (barrière {escalation.weakest.nom.split('(')[0].trim()})</p>}
                    {profil.survival_metrics && <p className="flex items-center gap-1 text-foreground"><Clock className="w-3 h-3 text-success" />Hazard 90j: {Math.round(profil.survival_metrics.hazard90d * 100)}%</p>}
                    <p className="flex items-center gap-1 text-foreground"><Shield className="w-3 h-3 text-success" />Domaines stables: {models.filter(m => m.probabiliteResiduelle < 30).length}/{models.length}</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-role-primary-soft/30 border border-role-primary/20">
                  <p className="text-xs text-foreground">Impact C1-C5 estimé</p>
                  <div className="mt-2 space-y-1">
                    {[ { c: 'C1', v: profil.c1, w: 20 }, { c: 'C2', v: profil.c2, w: 25 }, { c: 'C3', v: profil.c3, w: 20 }, { c: 'C4', v: profil.c4, w: 20 }, { c: 'C5', v: profil.c5, w: 15 } ].map(({ c, v, w }) => (
                      <div key={c} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{c} <span className="text-foreground">(poids {w}%)</span></span>
                        <span className={`font-semibold ${v < 40 ? 'text-danger' : v < 60 ? 'text-warning' : 'text-success'}`}>{v}/100</span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-1 mt-1 flex justify-between text-xs">
                      <span className="font-semibold text-foreground">Impact global</span>
                      <span className={`font-bold ${profil.score_global < 40 ? 'text-danger' : profil.score_global < 60 ? 'text-warning' : 'text-success'}`}>{profil.score_global}/100</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-xs text-foreground pt-2 border-t border-border">
                <span>Dernière évaluation: {displayModel.lastAssessed ? new Date(displayModel.lastAssessed).toLocaleDateString('fr-FR') : 'N/A'}</span>
                <span>{ecarts.filter(e => e.statut !== 'cloture').length} écarts actifs</span>
                <span>{surveillances.length} inspections</span>
                <span>{evenements?.length || 0} événements</span>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
