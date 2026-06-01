// components/modules/profil-risque/BowTieAnalyzer.tsx
// Analyse Bow-Tie data-driven : dangers, barrières, conséquences, bénéfices
// Dérivé des données réelles (profils, écarts, surveillances, événements)

'use client'

import { useState, useMemo } from 'react'
import { ProfilRisque, Ecart, Surveillance } from '@/lib/store'
import { BowTieModele, Barriere } from '@/lib/risque/types'
import { Shield, AlertTriangle, CheckCircle2, XCircle, Target, Zap, TrendingUp, Clock } from 'lucide-react'

interface Props {
  profil: ProfilRisque
  ecarts: Ecart[]
  surveillances: Surveillance[]
}

const DOMAINES = ['SGS', 'PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']

function getNiveauRisque(prob: number): 'critique' | 'eleve' | 'moyen' | 'faible' {
  if (prob > 60) return 'critique'; if (prob > 40) return 'eleve'
  if (prob > 20) return 'moyen'; return 'faible'
}

function generateBowTieModels(profil: ProfilRisque, ecarts: Ecart[], surveillances: Surveillance[]): BowTieModele[] {
  const c2Score = profil.c2 // PAC effectiveness → barrier strength
  const c1Score = profil.c1 // SGS maturity → preventive barrier strength
  const c3Score = profil.c3 // compliance → barrier reliability

  return DOMAINES.map(domaine => {
    // Dériver les dangers des vrais écarts actifs dans ce domaine
    const ecartsDom = ecarts.filter(e => e.domaine === domaine && e.statut !== 'cloture')
    const ecartsCritiques = ecartsDom.filter(e => e.niveau_risque === 'critique')
    const surveillancesDom = surveillances.filter(s => (s.portee || []).includes(domaine))

    // Danger : basé sur le nombre et la criticité des écarts réels
    const hazardCount = ecartsDom.length
    const danger = hazardCount > 0
      ? `${hazardCount} écart(s) actif(s)${ecartsCritiques.length > 0 ? ` dont ${ecartsCritiques.length} critique(s)` : ''}`
      : `${domaine} — Conformité nominale`

    // Défaillance : basée sur le score C3 (conformité) et les écarts de ce domaine
    const defaillance = c3Score < 40 ? 'Maintenance insuffisante — score critique'
      : c3Score < 60 ? 'Surveillance sous-optimale'
      : 'Fonctionnement nominal'

    // Scénario : lié au danger → défaillance → conséquence
    const scenario = danger.includes('critique') ? 'Défaillance probable avec impact sur la sécurité'
      : hazardCount > 0 ? 'Risque modéré — surveiller'
      : 'Aucun écart détecté'

    // Conséquence : basée sur C5 (résilience/incidents)
    const consequence = profil.c5 < 40 ? 'Incidents probables — impact sécurité'
      : profil.c5 < 60 ? 'Non-conformité documentaire'
      : 'Impact opérationnel mineur'

    // Barrières préventives — basées sur C1 (SGS)
    const barrieresPreventives: Barriere[] = [
      {
        id: `prev-sgs-${domaine}`, nom: `Maturité SGS (C1)`, type: 'preventive',
        efficace: c1Score > 50, efficacite: c1Score,
        dernierTest: profil.computed_at,
        remarque: c1Score < 40 ? 'Maturité insuffisante — documenter les processus' : c1Score < 60 ? 'En progression' : 'SGS efficace'
      },
      {
        id: `prev-audit-${domaine}`, nom: `Audits ${domaine}`, type: 'preventive',
        efficace: surveillancesDom.length > 0, efficacite: surveillancesDom.length > 0 ? 70 : 30,
        dernierTest: surveillancesDom[0]?.date_fin || 'Non audité',
        remarque: surveillancesDom.length > 0 ? `${surveillancesDom.length} inspection(s) réalisée(s)` : 'Aucune inspection — programmer une visite'
      },
    ]

    // Barrières correctives — basées sur C2 (PAC)
    const barrieresCorrectives: Barriere[] = [
      {
        id: `corr-pac-${domaine}`, nom: `Plans d'action correctifs`, type: 'corrective',
        efficace: c2Score > 50, efficacite: c2Score,
        dernierTest: profil.computed_at,
        remarque: c2Score < 30 ? 'PAC inefficaces — accélérer' : c2Score < 60 ? 'Progression nécessaire' : 'PAC efficaces'
      },
      {
        id: `corr-suivi-${domaine}`, nom: `Suivi des écarts ${domaine}`, type: 'corrective',
        efficace: ecartsDom.filter(e => e.statut !== 'en_retard').length > 0, efficacite: ecartsDom.length > 0 ? Math.max(20, 100 - ecartsDom.length * 10) : 100,
        dernierTest: ecartsDom[0]?.created_at || 'N/A',
        remarque: ecartsDom.length > 0 ? `${ecartsDom.length} écart(s) en suivi` : 'Aucun écart à suivre'
      },
    ]

    // Probabilité résiduelle = combinaison C1-C5 + efficacité barrières
    const barrierEffAvg = (c1Score + c2Score) / 2
    const probResiduelle = Math.max(5, Math.min(95, 100 - (profil.score_global + barrierEffAvg) / 2))

    return {
      id: `bt-${domaine}`,
      domaine,
      danger,
      defaillance,
      scenario,
      consequence,
      barrieresPreventives,
      barrieresCorrectives,
      probabiliteResiduelle: Math.round(probResiduelle),
      niveauRisqueResiduel: getNiveauRisque(probResiduelle),
      lastAssessed: profil.computed_at,
    }
  })
}

export default function BowTieAnalyzer({ profil, ecarts, surveillances }: Props) {
  const [selectedDomaine, setSelectedDomaine] = useState(DOMAINES[0])

  const models = useMemo(() => generateBowTieModels(profil, ecarts, surveillances), [profil, ecarts, surveillances])
  const current = models.find(m => m.domaine === selectedDomaine)

  const getEffCls = (v: number) => v >= 80 ? 'bg-success text-white' : v >= 60 ? 'bg-primary text-white' : v >= 40 ? 'bg-warning text-white' : 'bg-danger text-white'
  const getRiskCls = (p: number) => p >= 50 ? 'badge danger animate-pulse' : p >= 30 ? 'badge warning' : p >= 15 ? 'badge primary' : 'badge success'

  return (
    <div className="card border-border">
      <div className="card-header border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-3 w-full">
          <div className="card-title flex items-center gap-2"><Shield className="w-5 h-5 text-role-primary" />Analyse Bow-Tie — Barrières de défense</div>
          <select className="form-select py-1.5 text-sm" value={selectedDomaine} onChange={e => setSelectedDomaine(e.target.value)}>
            {DOMAINES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="card-content p-4 space-y-5">
        {!current ? (
          <div className="text-center py-8 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Aucune donnée pour ce domaine</p></div>
        ) : (
          <>
            {/* Chaîne Danger → Défaillance → Scénario → Conséquence */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              {[
                { label: 'Danger', value: current.danger, icon: AlertTriangle, cls: 'border-danger/30 bg-danger-soft' },
                { label: 'Défaillance', value: current.defaillance, icon: Target, cls: 'border-warning/30 bg-warning-soft' },
                { label: 'Scénario', value: current.scenario, icon: Zap, cls: 'border-primary/30 bg-primary-soft' },
                { label: 'Conséquence', value: current.consequence, icon: Shield, cls: 'border-purple-300 bg-purple-50' },
              ].map(({ label, value, icon: Icon, cls }) => (
                <div key={label} className={`rounded-xl p-3 border text-center ${cls}`}>
                  <div className="flex items-center justify-center gap-1 mb-1"><Icon className="w-4 h-4" /><span className="text-xs font-semibold">{label}</span></div>
                  <p className="text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>

            {/* Barrières préventives */}
            <div>
              <div className="flex items-center gap-2 mb-3"><Shield className="w-4 h-4 text-success" /><span className="text-sm font-semibold">Barrières préventives ({current.barrieresPreventives.length})</span></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {current.barrieresPreventives.map(b => (
                  <div key={b.id} className={`p-3 rounded-lg border ${b.efficace ? 'border-success/30 bg-success-soft/30' : 'border-danger/30 bg-danger-soft/30'}`}>
                    <div className="flex items-start justify-between">
                      <div><p className="text-sm font-medium">{b.nom}</p><p className="text-xs text-muted-foreground">Dernier test: {b.dernierTest ? new Date(b.dernierTest).toLocaleDateString('fr-FR') : 'N/A'}</p></div>
                      {b.efficace ? <CheckCircle2 className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-danger" />}
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-0.5"><span>Efficacité</span><span className="font-semibold">{b.efficacite}%</span></div>
                      <div className="progress h-1.5"><div className={`progress-bar h-1.5 rounded-full ${getEffCls(b.efficacite)}`} style={{ width: `${b.efficacite}%` }} /></div>
                    </div>
                    {b.remarque && <p className="text-xs text-muted-foreground mt-2 italic">{b.remarque}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Barrières correctives */}
            <div>
              <div className="flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-warning" /><span className="text-sm font-semibold">Barrières correctives ({current.barrieresCorrectives.length})</span></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {current.barrieresCorrectives.map(b => (
                  <div key={b.id} className={`p-3 rounded-lg border ${b.efficace ? 'border-success/30 bg-success-soft/30' : 'border-danger/30 bg-danger-soft/30'}`}>
                    <div className="flex items-start justify-between">
                      <div><p className="text-sm font-medium">{b.nom}</p><p className="text-xs text-muted-foreground">Dernier test: {b.dernierTest ? new Date(b.dernierTest).toLocaleDateString('fr-FR') : 'N/A'}</p></div>
                      {b.efficace ? <CheckCircle2 className="w-5 h-5 text-success" /> : <XCircle className="w-5 h-5 text-danger" />}
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs mb-0.5"><span>Efficacité</span><span className="font-semibold">{b.efficacite}%</span></div>
                      <div className="progress h-1.5"><div className={`progress-bar h-1.5 rounded-full ${getEffCls(b.efficacite)}`} style={{ width: `${b.efficacite}%` }} /></div>
                    </div>
                    {b.remarque && <p className="text-xs text-muted-foreground mt-2 italic">{b.remarque}</p>}
                  </div>
                ))}
              </div>
            </div>

            {/* Risque résiduel + Bénéfices + Impact C1-C5 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-muted/20 border border-border">
                <p className="text-xs text-muted-foreground">Risque résiduel</p>
                <p className={`text-2xl font-bold mt-1 ${current.probabiliteResiduelle >= 50 ? 'text-danger' : current.probabiliteResiduelle >= 30 ? 'text-warning' : 'text-primary'}`}>{current.probabiliteResiduelle}%</p>
                <span className={getRiskCls(current.probabiliteResiduelle)}>{current.niveauRisqueResiduel}</span>
                <div className="progress h-2 mt-3"><div className="progress-bar" style={{ width: `${current.probabiliteResiduelle}%` }} /></div>
                <p className="text-xs text-muted-foreground mt-2">Probabilité d'incident malgré les barrières</p>
              </div>

              <div className="p-4 rounded-xl bg-success-soft/30 border border-success/20">
                <p className="text-xs text-muted-foreground">Bénéfices estimés</p>
                <div className="mt-2 space-y-1 text-xs">
                  {profil.survival_metrics && <p className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-success" />Hazard 90j réduit: {Math.round(profil.survival_metrics.hazard90d * 40)}%</p>}
                  <p className="flex items-center gap-1"><Clock className="w-3 h-3 text-success" />Délai réponse: {profil.c2 > 50 ? 'Rapide' : 'À améliorer'}</p>
                  <p className="flex items-center gap-1"><Shield className="w-3 h-3 text-success" />Domaines protégés: {models.filter(m => m.probabiliteResiduelle < 30).length}/{models.length}</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-role-primary-soft/30 border border-role-primary/20">
                <p className="text-xs text-muted-foreground">Impact C1-C5 estimé</p>
                <div className="mt-2 space-y-1">
                  {[
                    { c: 'C1', v: profil.c1, w: 20 },
                    { c: 'C2', v: profil.c2, w: 20 },
                    { c: 'C3', v: profil.c3, w: 20 },
                    { c: 'C4', v: profil.c4, w: 15 },
                    { c: 'C5', v: profil.c5, w: 25 },
                  ].map(({ c, v, w }) => (
                    <div key={c} className="flex items-center justify-between text-xs">
                      <span>{c} <span className="text-muted-foreground">(poids {w}%)</span></span>
                      <span className={`font-semibold ${v < 40 ? 'text-danger' : v < 60 ? 'text-warning' : 'text-success'}`}>{v}/100</span>
                    </div>
                  ))}
                  <div className="border-t border-border pt-1 mt-1 flex justify-between text-xs">
                    <span className="font-semibold">Impact global sur score</span>
                    <span className={`font-bold ${profil.score_global < 40 ? 'text-danger' : profil.score_global < 60 ? 'text-warning' : 'text-success'}`}>{profil.score_global}/100</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
              Dernière évaluation: {current.lastAssessed ? new Date(current.lastAssessed).toLocaleDateString('fr-FR') : 'N/A'}
              {' · '}{ecarts.filter(e => e.statut !== 'cloture').length} écarts actifs
              {' · '}{surveillances.length} inspections
            </div>
          </>
        )}
      </div>
    </div>
  )
}
