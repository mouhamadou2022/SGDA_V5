// components/modules/profil-risque/ScenarioSimulator.tsx
// Simulateur what-if avec sliders interactifs, suggestions IA, sauvegarde/chargement

'use client'

import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { FlaskConical, RotateCcw, Save, Trash2, ChevronDown, ChevronUp, Sparkles, TrendingUp, TrendingDown, Brain, Lightbulb, ArrowRight, X, Minus } from 'lucide-react'
import { useAppStore, ProfilRisque } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { calculateGlobalScore } from '@/lib/risque'
import { normaliserPoidsSomme100 } from '@/lib/ia/weightController'
import {
  niveauAvecSeuils, validerSeuils, calculerImpacts,
  SEUILS_NIVEAUX_DEFAUT, type SeuilsNiveaux, type NiveauCle, type ImpactCalibrage,
} from '@/lib/simulationCalibrage'
import { usePoidsAppris } from './usePoidsAppris'
interface Props { profil: ProfilRisque; aerodromeName: string; userRole: string }

interface CritereSimule { key: 'c1' | 'c2' | 'c3' | 'c4' | 'c5'; label: string; poids: number; description: string }

interface ScenarioSauvegarde { id: string; nom: string; c1: number; c2: number; c3: number; c4: number; c5: number; scoreSimule: number; createdAt: string; impactDescription?: string }

interface SmartSuggestion { id: string; titre: string; description: string; actions: { critere: keyof ProfilRisque; delta: number }[]; gainEstime: number; probabiliteSucces: number; effort: 'faible' | 'moyen' | 'eleve'; roi: number }

const CRITERES: CritereSimule[] = [
  { key: 'c1', label: 'C1 — Maturité & Culture SGS', poids: 20, description: 'Renforcer la culture sécurité' },
  { key: 'c2', label: 'C2 — Efficacité PAC', poids: 25, description: 'Accélérer traitement PAC' },
  { key: 'c3', label: 'C3 — Conformité Technique', poids: 20, description: 'Améliorer conformité' },
  { key: 'c4', label: 'C4 — Charge Critique', poids: 20, description: 'Réduire écarts critiques' },
  { key: 'c5', label: 'C5 — Résilience', poids: 15, description: 'Renforcer prévention' },
]

const STORAGE_KEY = 'sgda_scenarios_v3'

function getNiveauLabel(score: number): string {
  if (score >= 80) return 'Excellent'; if (score >= 60) return 'Bon'
  if (score >= 30) return 'Modéré'; return 'Critique'
}
function getNiveauBadge(score: number): string {
  if (score >= 80) return 'badge success'; if (score >= 60) return 'badge primary'
  if (score >= 30) return 'badge warning'; return 'badge danger'
}
function getNiveauColor(score: number): string {
  if (score >= 80) return 'text-success'; if (score >= 60) return 'text-primary'
  if (score >= 30) return 'text-warning'; return 'text-danger'
}

export default function ScenarioSimulator({ profil, aerodromeName, userRole }: Props) {
  const [simC1, setSimC1] = useState(profil.c1); const [simC2, setSimC2] = useState(profil.c2)
  const [simC3, setSimC3] = useState(profil.c3); const [simC4, setSimC4] = useState(profil.c4)
  const [simC5, setSimC5] = useState(profil.c5)
  const [dialogOpen, setDialogOpen] = useState(false); const [nomScenario, setNomScenario] = useState(''); const [saveError, setSaveError] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [scenarios, setScenarios] = useState<ScenarioSauvegarde[]>(() => { try { const r = localStorage.getItem(`${STORAGE_KEY}_${profil.aerodrome_id}`); return r ? JSON.parse(r) : [] } catch { return [] } })
  const [listOpen, setListOpen] = useState(false)

  // ── Mode Règles (calibrage, admin uniquement) : mêmes cartes, pas d'onglet ──
  const peutCalibrer = userRole === 'admin'
  const [mode, setMode] = useState<'valeurs' | 'regles'>('valeurs')
  // Poids simulés bruts (null = suivre les poids du moteur) ; seuils simulés.
  const [poidsSim, setPoidsSim] = useState<Record<string, number> | null>(null)
  const [seuilsSim, setSeuilsSim] = useState<SeuilsNiveaux>({ ...SEUILS_NIVEAUX_DEFAUT })
  const [nomBrouillon, setNomBrouillon] = useState('')
  const [brouillons, setBrouillons] = useState<Array<{ id: string; nom: string; poids: Record<string, number> | null; seuils: SeuilsNiveaux; createdAt: string }>>(() => {
    try { const r = localStorage.getItem('sgda_calibrage_brouillons'); return r ? JSON.parse(r) : [] } catch { return [] }
  })
  const tousProfils = useAppStore(s => s.profilsRisque)
  const tousAerodromes = useAppStore(s => s.aerodromes)

  const simValues = { c1: simC1, c2: simC2, c3: simC3, c4: simC4, c5: simC5 }
  const setters: Record<string, (v: number) => void> = { c1: setSimC1, c2: setSimC2, c3: setSimC3, c4: setSimC4, c5: setSimC5 }

  // Poids appris par l'IA (mêmes que le moteur de score) — repli défauts.
  // Sans ceci, le simulateur raisonnait en 20/25/20/20/15 fixe alors que le
  // score réel utilise les poids appris : recommandations faussées.
  const { poids: poidsBruts, personnalises: poidsPersonnalises } = usePoidsAppris();
  const criteresPoids = useMemo(
    () => CRITERES.map(c => {
      const w = typeof poidsBruts[c.key] === 'number' ? poidsBruts[c.key] : 20
      return { ...c, poids: Math.round(w * 10) / 10 }
    }),
    [poidsBruts],
  );

  const scoreSimule = useMemo(() => calculateGlobalScore(simValues, poidsBruts), [simC1, simC2, simC3, simC4, simC5, poidsBruts])
  const deltaScore = scoreSimule - profil.score_global
  const isReadOnly = userRole === 'guest'

  // ── Dérivés du mode Règles (après poidsBruts : dépendance d'ordre) ──
  const poidsBrutsSim = poidsSim ?? poidsBruts
  const poidsNormSim = useMemo(() => normaliserPoidsSomme100(poidsBrutsSim), [poidsBrutsSim])
  const erreurSeuils = validerSeuils(seuilsSim)
  const scoreCalibre = useMemo(
    () => calculateGlobalScore({ c1: profil.c1, c2: profil.c2, c3: profil.c3, c4: profil.c4, c5: profil.c5 }, poidsNormSim),
    [profil, poidsNormSim],
  )
  const niveauCalibre: NiveauCle | null = erreurSeuils ? null : niveauAvecSeuils(scoreCalibre, seuilsSim)
  const impacts: { total: number; changements: ImpactCalibrage[] } = useMemo(() => {
    if (erreurSeuils) return { total: 0, changements: [] };
    const liste = Object.values(tousProfils || {}) as Array<{ aerodrome_id: string; score_global?: number; c1?: number; c2?: number; c3?: number; c4?: number; c5?: number; niveau?: string }>;
    return calculerImpacts(liste, poidsNormSim, seuilsSim);
  }, [tousProfils, poidsNormSim, seuilsSim, erreurSeuils]);
  const nomAero = (id: string): string => {
    const a = (tousAerodromes || []).find((x: { id: string; code_oaci?: string; nom?: string }) => x.id === id);
    return a?.code_oaci || a?.nom || id;
  };
  const NIVEAU_CALIBRE_TXT: Record<NiveauCle, { label: string; badge: string; color: string }> = {
    FAIBLE: { label: 'Excellent', badge: 'badge success', color: 'text-success' },
    MOYEN: { label: 'Bon', badge: 'badge primary', color: 'text-primary' },
    ELEVE: { label: 'Modéré', badge: 'badge warning', color: 'text-warning' },
    CRITIQUE: { label: 'Critique', badge: 'badge danger', color: 'text-danger' },
  };
  const reinitialiserCalibrage = () => { setPoidsSim(null); setSeuilsSim({ ...SEUILS_NIVEAUX_DEFAUT }); };
  const sauvegarderBrouillon = () => {
    const n = nomBrouillon.trim();
    if (!n || brouillons.length >= 5) return;
    const b = { id: Date.now().toString(), nom: n, poids: poidsSim, seuils: seuilsSim, createdAt: new Date().toISOString() };
    const u = [b, ...brouillons];
    setBrouillons(u);
    try { localStorage.setItem('sgda_calibrage_brouillons', JSON.stringify(u)) } catch { /* stockage indisponible */ }
    setNomBrouillon('');
  };
  const chargerBrouillon = (id: string) => {
    const b = brouillons.find(x => x.id === id);
    if (!b) return;
    setPoidsSim(b.poids);
    setSeuilsSim({ ...b.seuils });
  };
  const supprimerBrouillon = (id: string) => {
    const u = brouillons.filter(x => x.id !== id);
    setBrouillons(u);
    try { localStorage.setItem('sgda_calibrage_brouillons', JSON.stringify(u)) } catch { /* stockage indisponible */ }
  };

  const suggestions = useMemo((): SmartSuggestion[] => {
    const list: SmartSuggestion[] = []
    const current = { c1: profil.c1, c2: profil.c2, c3: profil.c3, c4: profil.c4, c5: profil.c5 }
    const weights: Record<string, number> = {
      c1: (typeof poidsBruts.c1 === 'number' ? poidsBruts.c1 : 20) / 100,
      c2: (typeof poidsBruts.c2 === 'number' ? poidsBruts.c2 : 25) / 100,
      c3: (typeof poidsBruts.c3 === 'number' ? poidsBruts.c3 : 20) / 100,
      c4: (typeof poidsBruts.c4 === 'number' ? poidsBruts.c4 : 20) / 100,
      c5: (typeof poidsBruts.c5 === 'number' ? poidsBruts.c5 : 15) / 100,
    }

    if (profil.score_global < 80) {
      const target = profil.score_global >= 60 ? 80 : profil.score_global >= 30 ? 60 : 30
      const needed = target - profil.score_global
      const sorted = Object.entries(current).sort((a, b) => a[1] - b[1])
      const actions: { critere: keyof ProfilRisque; delta: number }[] = []
      let rem = needed
      for (const [key, val] of sorted) {
        if (rem <= 0) break
        const d = Math.min(30, 100 - val, Math.ceil(rem / (weights[key] || 0.2)))
        if (d > 0) { actions.push({ critere: key as keyof ProfilRisque, delta: d }); rem -= d * (weights[key] || 0.2) }
      }
      list.push({ id: 'next-level', titre: `Atteindre ${target >= 80 ? 'Excellent' : 'Bon'}`, description: `Passer de ${profil.score_global} à ${target} (+${needed} pts)`, actions, gainEstime: needed, probabiliteSucces: needed <= 15 ? 85 : needed <= 25 ? 65 : 45, effort: needed <= 10 ? 'faible' : needed <= 25 ? 'moyen' : 'eleve', roi: needed <= 10 ? 4.5 : 2.8 })
    }
    const weakest = Object.entries(current).sort((a, b) => a[1] - b[1])[0]
    if (weakest && weakest[1] < 70) { const k = weakest[0] as keyof ProfilRisque; const imp = Math.min(30, 100 - weakest[1]); list.push({ id: 'weakest', titre: `Renforcer ${k.toUpperCase()}`, description: `${CRITERES.find(c => c.key === k)?.label || ''} : ${weakest[1]} → ${weakest[1] + imp}`, actions: [{ critere: k, delta: imp }], gainEstime: Math.round(imp * (weights[k] || 0.2)), probabiliteSucces: 75, effort: imp > 20 ? 'eleve' : 'moyen', roi: 3.2 }) }
    // ROI piloté par les poids appris (jamais C2+C4 en dur) : top-2 leviers.
    const topLeviers = (Object.keys(weights) as (keyof ProfilRisque)[])
      .sort((a, b) => (weights[b as string] || 0) - (weights[a as string] || 0))
      .slice(0, 2)
      .map(k => {
        const cle = k as string
        const courant = (current as Record<string, number>)[cle] ?? 50
        const delta = Math.min(20, 100 - courant)
        return { critere: k, delta, gain: Math.round(delta * (weights[cle] || 0.2)) }
      })
      .filter(a => a.delta > 0);
    if (topLeviers.length > 0) {
      const gainTotal = topLeviers.reduce((s, a) => s + a.gain, 0)
      const noms = topLeviers.map(a => String(a.critere).toUpperCase()).join(' + ')
      list.push({ id: 'roi', titre: 'Actions à fort ROI', description: `Focus ${noms} pour gain maximal (poids appris)`, actions: topLeviers.map(({ critere, delta }) => ({ critere, delta })), gainEstime: gainTotal, probabiliteSucces: 80, effort: 'moyen', roi: 4.2 })
    }
    return list.sort((a, b) => b.roi - a.roi)
  }, [profil, poidsBruts])

  const handleApplySuggestion = (s: SmartSuggestion) => { for (const a of s.actions) { const cv = (simValues as Record<string, number>)[a.critere] ?? 0; (setters as Record<string, (v: number) => void>)[a.critere](Math.min(100, cv + a.delta)) } setShowSuggestions(false) }
  const handleLoad = (s: ScenarioSauvegarde) => { setSimC1(s.c1); setSimC2(s.c2); setSimC3(s.c3); setSimC4(s.c4); setSimC5(s.c5) }
  const handleDelete = (id: string) => { const u = scenarios.filter(x => x.id !== id); setScenarios(u); localStorage.setItem(`${STORAGE_KEY}_${profil.aerodrome_id}`, JSON.stringify(u)) }
  const handleSave = () => { const n = nomScenario.trim(); if (!n) { setSaveError('Nom requis'); return }
    if (scenarios.length >= 8) { setSaveError('Max 8 scénarios'); return }
    const s: ScenarioSauvegarde = { id: Date.now().toString(), nom: n, c1: simC1, c2: simC2, c3: simC3, c4: simC4, c5: simC5, scoreSimule, createdAt: new Date().toISOString(), impactDescription: deltaScore > 5 ? `+${deltaScore} pts` : deltaScore < -5 ? `${deltaScore} pts` : 'stable' }
    const u = [s, ...scenarios]; setScenarios(u); localStorage.setItem(`${STORAGE_KEY}_${profil.aerodrome_id}`, JSON.stringify(u)); setDialogOpen(false); setListOpen(true) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center"><FlaskConical className="w-5 h-5 text-role-primary" /></div><div><h2 className="text-base font-semibold text-foreground">Simulateur de Scénarios</h2><p className="text-xs text-foreground">{aerodromeName} — Analyse what-if</p></div><span className={`badge text-[10px] ${poidsPersonnalises ? 'primary' : 'neutral'}`} title={poidsPersonnalises ? 'Mêmes poids que le moteur de score (appris par l’IA)' : 'Poids par défaut — identiques au moteur faute d’apprentissage'}>{poidsPersonnalises ? 'Poids IA appris' : 'Poids par défaut'}</span></div>
        <div className="flex items-center gap-2">
          {peutCalibrer && (
            <div className="inline-flex rounded-lg border border-border overflow-hidden" role="tablist" aria-label="Mode du simulateur">
              {(['valeurs', 'regles'] as const).map(m => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${mode === m ? 'bg-role-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                  {m === 'valeurs' ? 'Valeurs C1-C5' : 'Règles (poids/seuils)'}
                </button>
              ))}
            </div>
          )}
          {mode === 'valeurs' && <button onClick={() => setShowSuggestions(!showSuggestions)} className="btn btn-secondary btn-sm gap-2"><Lightbulb className="w-4 h-4" />Suggestions AERORISQ</button>}
        </div>
      </div>

      {mode === 'regles' && peutCalibrer ? (
      <div className="space-y-6 animate-fade-up">
        <Card variant="role" title="Règles simulées — rien n’est appliqué" subtitle="Poids C1-C5 et seuils de niveaux modifiables pour voir l’impact. La C1 reste dérivée du PAOE (méthodologie non modifiable ici)." icon={<FlaskConical className="w-4 h-4 text-role-primary" />} size="sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Poids C1-C5 (normalisés à 100{poidsSim ? '' : ' — suit le moteur'})</p>
              {CRITERES.map(c => {
                const brut = typeof poidsBrutsSim[c.key] === 'number' ? poidsBrutsSim[c.key] : 20;
                const effectif = (poidsNormSim as Record<string, number>)[c.key] ?? brut;
                return (
                  <div key={c.key} className="space-y-0.5 py-1 border-b border-border last:border-b-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{c.label}</span>
                      <span className="text-xs text-foreground">{brut} → <strong>{effectif}%</strong></span>
                    </div>
                    <input type="range" value={brut} onChange={e => setPoidsSim({ ...poidsBrutsSim, [c.key]: Number(e.target.value) })} min={5} max={60} step={1} className="w-full h-1.5 rounded-lg cursor-pointer accent-role-primary" disabled={isReadOnly} aria-label={`Poids ${c.label}`} />
                  </div>
                );
              })}
              <button onClick={reinitialiserCalibrage} className="btn btn-ghost btn-sm text-xs gap-1"><RotateCcw className="w-3 h-3" />Reprendre les poids du moteur</button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-foreground">Seuils de niveaux (ordre strict requis)</p>
              {(['faible', 'moyen', 'eleve'] as const).map(k => (
                <label key={k} className="flex items-center justify-between gap-3 text-xs text-foreground">
                  <span>Score ≥ {k === 'faible' ? 'FAIBLE' : k === 'moyen' ? 'MOYEN' : 'ÉLEVÉ'}</span>
                  <input type="number" value={seuilsSim[k]} onChange={e => setSeuilsSim({ ...seuilsSim, [k]: Number(e.target.value) })} min={0} max={100} step={5} className="form-input w-24 py-1 px-2 text-sm text-right" disabled={isReadOnly} aria-label={`Seuil ${k}`} />
                </label>
              ))}
              {erreurSeuils
                ? <p className="text-xs text-danger font-medium">{erreurSeuils} — impact suspendu.</p>
                : <p className="text-xs text-muted-foreground">Défauts moteur : 80 / 60 / 30.</p>}
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-semibold text-foreground mb-1">Impact — {aerodromeName}</p>
                {niveauCalibre && (
                  <p className="text-sm text-foreground">
                    <span className={`text-2xl font-bold ${NIVEAU_CALIBRE_TXT[niveauCalibre].color}`}>{scoreCalibre}</span>
                    <span className="text-xs">/100</span>{' '}
                    <span className={`badge text-xs ${NIVEAU_CALIBRE_TXT[niveauCalibre].badge}`}>{NIVEAU_CALIBRE_TXT[niveauCalibre].label}</span>{' '}
                    <span className="text-xs text-muted-foreground">(actuel : {profil.score_global})</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card variant="role" title={`Impact multi-aérodromes — ${impacts.changements.length} changement(s) sur ${impacts.total}`} icon={<TrendingUp className="w-4 h-4 text-role-primary" />} size="sm">
          {erreurSeuils ? (
            <p className="text-sm text-foreground">Corrigez les seuils pour voir l’impact.</p>
          ) : impacts.changements.length === 0 ? (
            <p className="text-sm text-foreground">Aucun changement de niveau avec ce jeu de règles.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {impacts.changements.slice(0, 20).map(ch => (
                <div key={ch.aerodrome_id} className="flex items-center justify-between gap-3 p-2 rounded-lg border border-border">
                  <span className="text-sm font-medium text-foreground truncate">{nomAero(ch.aerodrome_id)}</span>
                  <span className="text-xs text-foreground shrink-0">
                    {ch.avantScore} ({ch.avantNiveau}) → <strong>{ch.apresScore} ({ch.apresNiveau})</strong>{' '}
                    <span className={ch.delta >= 0 ? 'text-success' : 'text-danger'}>{ch.delta >= 0 ? '+' : ''}{ch.delta}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {!isReadOnly && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="text" value={nomBrouillon} onChange={e => setNomBrouillon(e.target.value)} placeholder="Nom du brouillon (ex : C2 renforcé)" maxLength={60} className="form-input flex-1 min-w-40 py-1.5 px-3 text-sm" aria-label="Nom du brouillon" />
            <button onClick={sauvegarderBrouillon} disabled={!nomBrouillon.trim() || brouillons.length >= 5} className="btn btn-sm gap-2 bg-role-primary hover:bg-role-primary/80 text-white disabled:opacity-40"><Save className="w-4 h-4" />Enregistrer le brouillon</button>
            <span className="text-[11px] text-muted-foreground">Local uniquement — rien n’est appliqué au moteur.</span>
          </div>
        )}
        {brouillons.length > 0 && (
          <Card variant="role" title={`Brouillons (${brouillons.length}/5)`} size="sm">
            <div className="space-y-2">
              {brouillons.map(b => (
                <div key={b.id} className="flex items-center justify-between gap-3 p-2 rounded-lg border border-border hover:border-role-primary/30 cursor-pointer" onClick={() => chargerBrouillon(b.id)}>
                  <div><p className="text-sm font-medium text-foreground">{b.nom}</p><p className="text-[11px] text-muted-foreground">{new Date(b.createdAt).toLocaleDateString('fr-FR')}</p></div>
                  <button onClick={e => { e.stopPropagation(); supprimerBrouillon(b.id); }} className="btn btn-ghost btn-sm p-0 w-8 h-8 text-foreground hover:text-danger" aria-label={`Supprimer ${b.nom}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      ) : (
      <>

      {mode === 'valeurs' && showSuggestions && (
        <Card heading={<div className="flex items-center justify-between w-full"><div className="flex items-center gap-2"><Brain className="w-4 h-4 text-role-primary" />Scénarios AERORISQ</div><button className="btn btn-ghost btn-sm p-0 w-7 h-7" onClick={() => setShowSuggestions(false)}><X className="w-4 h-4" /></button></div>}>
          <div className="space-y-2">
            {suggestions.map(s => (
              <div key={s.id} className="p-3 rounded-xl border border-border hover:border-role-primary/30 cursor-pointer" onClick={() => handleApplySuggestion(s)}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap"><h4 className="text-sm font-semibold text-foreground">{s.titre}</h4><span className={`badge text-xs ${s.probabiliteSucces >= 70 ? 'success' : s.probabiliteSucces >= 50 ? 'warning' : 'neutral'}`}>{s.probabiliteSucces}% succès</span></div>
                    <p className="text-xs text-foreground mt-1">{s.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs"><span className="text-success font-medium">+{s.gainEstime} pts</span><span className={s.effort === 'faible' ? 'text-success' : s.effort === 'moyen' ? 'text-warning' : 'text-danger'}>{s.effort === 'faible' ? 'Facile' : s.effort === 'moyen' ? 'Moyen' : 'Difficile'}</span><span className="text-primary">ROI {s.roi}x</span></div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-role-primary shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actuel */}
        <Card variant="role" title="Scénario actuel" icon={<span className="w-2 h-2 rounded-full bg-primary animate-pulse" />} size="sm">
          <div className="space-y-3">
            <div className="text-center">
              <span className={`text-2xl font-bold ${getNiveauColor(profil.score_global)}`}>{profil.score_global}</span>
              <span className="text-xs text-foreground">/100</span>
              <div className="mt-0.5"><span className={`badge text-xs ${getNiveauBadge(profil.score_global)}`}>{getNiveauLabel(profil.score_global)}</span></div>
            </div>
            <div className="space-y-0">
              {criteresPoids.map(c => { const v = profil[c.key]; return (
                <div key={c.key} className="flex items-center justify-between py-1.5 border-b border-border last:border-b-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-foreground">{c.label}</span>
                    <span className="badge neutral text-[10px]" title={poidsPersonnalises ? 'Poids appris par l’IA (moteur de score)' : 'Poids par défaut (IA sans apprentissage)'}>{c.poids}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="progress w-24 h-2">
                      <div className={`progress-bar ${v >= 80 ? 'bg-success' : v >= 60 ? 'bg-primary' : v >= 30 ? 'bg-warning' : 'bg-danger'}`} style={{ width: `${v}%` }} />
                    </div>
                    <span className={`text-xs font-semibold ${getNiveauColor(v)} w-6 text-right`}>{v}</span>
                  </div>
                </div>
              )})}
            </div>
          </div>
        </Card>

        {/* Simulé */}
        <Card variant="role" heading={<div className="flex items-center justify-between w-full"><div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-role-primary" />Scénario simulé</div><button onClick={() => { setSimC1(profil.c1); setSimC2(profil.c2); setSimC3(profil.c3); setSimC4(profil.c4); setSimC5(profil.c5) }} className="btn btn-ghost btn-sm text-xs" disabled={isReadOnly}><RotateCcw className="w-3 h-3" /></button></div>} size="sm">
          <div className="space-y-3">
            <div className="text-center">
              <span className={`text-2xl font-bold ${getNiveauColor(scoreSimule)}`}>{scoreSimule}</span>
              <span className="text-xs text-foreground">/100</span>
              <div className="mt-0.5"><span className={`badge text-xs ${getNiveauBadge(scoreSimule)}`}>{getNiveauLabel(scoreSimule)}</span></div>
            </div>
            <div className="space-y-2">
              {CRITERES.map(c => {
                const delta = simValues[c.key] - profil[c.key]
                return (<div key={c.key} className="space-y-0.5 py-1.5 border-b border-border last:border-b-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{c.label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-foreground">{profil[c.key]}</span>
                      <span className="text-sm font-bold w-6 text-right text-foreground">{simValues[c.key]}</span>
                      {delta !== 0 && <span className={`badge text-[10px] ${delta > 0 ? 'success' : 'danger'}`}>{delta > 0 ? '+' : ''}{delta}</span>}
                    </div>
                  </div>
                  <input type="range" value={simValues[c.key]} onChange={e => setters[c.key](Number(e.target.value))} min={0} max={100} step={5} className="w-full h-1.5 rounded-lg cursor-pointer accent-role-primary" disabled={isReadOnly} />
                </div>)
              })}
            </div>
          </div>
        </Card>
      </div>

      {/* Intreprétation */}
      <Card variant={deltaScore > 0 ? 'alert' : deltaScore < 0 ? 'alert' : 'default'} alertBg={deltaScore > 0 ? 'success' : deltaScore < 0 ? 'danger' : 'none'}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {deltaScore > 0 ? <TrendingUp className="w-5 h-5 text-success" /> : deltaScore < 0 ? <TrendingDown className="w-5 h-5 text-danger" /> : <Minus className="w-5 h-5 text-foreground" />}
            <p className="text-sm font-semibold text-foreground">Interprétation</p>
          </div>
          {deltaScore !== 0 ? (<><p className="text-sm text-foreground">Ce scénario <span className={`font-semibold ${deltaScore > 0 ? 'text-success' : 'text-danger'}`}>{deltaScore > 0 ? 'améliorerait' : 'dégraderait'}</span> le profil de <span className="font-semibold text-foreground">{getNiveauLabel(profil.score_global)}</span> {(profil.score_global >= 80 && deltaScore > 0) || (profil.score_global < 30 && deltaScore < 0) ? '' : `à ${getNiveauLabel(scoreSimule)}`} (<span className={`font-bold ${deltaScore > 0 ? 'text-success' : 'text-danger'}`}>{deltaScore > 0 ? '+' : ''}{deltaScore} pts</span>).</p>
          <div className="grid grid-cols-5 gap-2 text-xs">{CRITERES.map(c => { const d = simValues[c.key] - profil[c.key]; if (d === 0) return null; return <div key={c.key} className={`${d > 0 ? 'text-success' : 'text-danger'}`}>{c.key.toUpperCase()} {d > 0 ? '+' : ''}{d}</div> })}</div></>) : <p className="text-sm text-foreground">Valeurs identiques au scénario actuel.</p>}
        </div>
      </Card>

      {/* Actions */}
      {!isReadOnly && (<div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { setSimC1(profil.c1); setSimC2(profil.c2); setSimC3(profil.c3); setSimC4(profil.c4); setSimC5(profil.c5) }} className="btn btn-secondary btn-sm gap-2"><RotateCcw className="w-4 h-4" />Réinitialiser</button>
        <button onClick={() => { setDialogOpen(true); setNomScenario(''); setSaveError('') }} className="btn btn-sm gap-2 bg-role-primary hover:bg-role-primary/80 text-white"><Save className="w-4 h-4" />Sauvegarder</button>
        {scenarios.length > 0 && <button className="text-xs text-foreground underline" onClick={() => setListOpen(v => !v)}>{scenarios.length} sauvegardé(s) {listOpen ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}</button>}
      </div>)}

      {/* Scénarios sauvegardés */}
      {listOpen && scenarios.length > 0 && (<Card variant="role" title={`Sauvegardés (${scenarios.length}/8)`}>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {scenarios.map(s => (<div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-role-primary/30 hover:bg-role-primary-soft cursor-pointer group" onClick={() => handleLoad(s)}><div className="flex-1"><p className="text-sm font-medium text-foreground">{s.nom}</p><div className="flex items-center gap-2 mt-1 text-xs"><span className={getNiveauColor(s.scoreSimule)}>{s.scoreSimule}/100</span><span className="text-foreground">{new Date(s.createdAt).toLocaleDateString('fr-FR')}</span></div></div><button onClick={e => { e.stopPropagation(); handleDelete(s.id) }} className="btn btn-ghost btn-sm p-0 w-8 h-8 text-foreground hover:text-danger opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button></div>))}
        </div>
      </Card>)}

      {/* Save dialog */}
      {dialogOpen && createPortal(<div className="modal-overlay" onClick={() => setDialogOpen(false)}><div className="modal-content max-w-md" onClick={e => e.stopPropagation()}><div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary"><div className="modal-header border-b border-border"><div className="modal-title flex items-center gap-2"><Save className="w-4 h-4 text-role-primary" />Nommer le scénario</div><button className="modal-close" onClick={() => setDialogOpen(false)}><X className="w-4 h-4" /></button></div><div className="modal-body space-y-4 py-4"><input type="text" value={nomScenario} onChange={e => { setNomScenario(e.target.value); setSaveError('') }} placeholder="Ex: Amélioration C2 et C4" className="form-input w-full" maxLength={60} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSave() }} />{saveError && <p className="text-xs text-danger">{saveError}</p>}<div className={`rounded-xl p-3 ${scoreSimule >= 80 ? 'bg-success-soft' : scoreSimule >= 60 ? 'bg-primary-soft' : scoreSimule >= 30 ? 'bg-warning-soft' : 'bg-danger-soft'}`}><div className="flex justify-between"><span className="text-xs text-foreground">Score</span><span className={`text-lg font-bold ${getNiveauColor(scoreSimule)}`}>{scoreSimule}/100</span></div><div className="grid grid-cols-5 gap-1 mt-2 text-center text-xs font-mono text-foreground"><span>C1:{simC1}</span><span>C2:{simC2}</span><span>C3:{simC3}</span><span>C4:{simC4}</span><span>C5:{simC5}</span></div></div></div><div className="modal-footer border-t border-border gap-2"><button className="btn btn-secondary btn-sm" onClick={() => setDialogOpen(false)}>Annuler</button><button className="btn btn-sm bg-role-primary hover:bg-role-primary/80 text-white" onClick={handleSave}>Sauvegarder</button></div></div></div></div>, document.body)}
      </>
      )}
    </div>
  )
}
