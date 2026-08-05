// components/modules/profil-risque/OaciGraphSection.tsx
// Graphe unifié OACI → risques → écarts dans l'onglet Diagnostic du profil.
// Chaîne causale : Critère OACI (C1-C5) → Barrière Bow-Tie → Domaine → Écart.
// Réutilise le moteur lib/ia/oaciGraph.ts (construireGrapheOaci +
// calculerImpactCritere). Lecture seule — aucun workflow modifié.

'use client'

import { useMemo, useState } from 'react'
import { Network, Shield, CheckCircle2, AlertTriangle, Layers, GitBranch } from 'lucide-react'
import { type Ecart, type EvenementSecurite, type ProfilRisque, type Surveillance, useAppStore } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { construireGrapheOaci, calculerImpactCritere, libelleNoeud, type CleCritereOaci } from '@/lib/ia/oaciGraph'

interface Props {
  profil: ProfilRisque
  ecarts: Ecart[]
  surveillances: Surveillance[]
  evenements?: EvenementSecurite[]
}

const CRITERES: CleCritereOaci[] = ['c1', 'c2', 'c3', 'c4', 'c5']

const BADGE: Record<string, string> = {
  critique: 'danger', eleve: 'warning', moyen: 'primary', faible: 'success',
}

const TYPE_LABEL: Record<string, string> = {
  critere: 'Critère', domaine: 'Domaine', barriere: 'Barrière', ecart: 'Écart',
}

export default function OaciGraphSection({ profil, ecarts, surveillances, evenements }: Props) {
  const [selected, setSelected] = useState<CleCritereOaci | null>(null)
  const aerodrome = useAppStore(s => s.aerodromes.find(a => a.id === profil.aerodrome_id))

  const graphe = useMemo(
    () => construireGrapheOaci({ profil, ecarts, surveillances, evenements, statut_sgs: aerodrome?.statut_sgs }),
    [profil, ecarts, surveillances, evenements, aerodrome?.statut_sgs],
  )

  const impact = useMemo(
    () => (selected ? calculerImpactCritere(graphe, `critere_${selected}`) : []),
    [graphe, selected],
  )

  const domaines = graphe.noeuds.filter(n => n.type === 'domaine') as Extract<typeof graphe.noeuds[number], { type: 'domaine' }>[]
  const ecartsParDomaine = new Map<string, Extract<typeof graphe.noeuds[number], { type: 'ecart' }>[]>()
  graphe.noeuds.forEach(n => {
    if (n.type === 'ecart') {
      const list = ecartsParDomaine.get(n.domaine ?? '') ?? []
      list.push(n)
      ecartsParDomaine.set(n.domaine ?? '', list)
    }
  })

  return (
    <Card icon={<Network className="h-4 w-4 text-role-primary" />} title="Graphe unifié OACI → risques → écarts" badge={
      <span className="badge text-xs">{graphe.noeuds.length} nœuds · {graphe.stats.nbAretes} liens</span>
    }>
      <p className="text-sm text-muted-foreground mb-4">
        Chaîne causale : <span className="font-medium text-foreground">Critère OACI</span> → <span className="font-medium text-foreground">Barrière Bow-Tie</span> → <span className="font-medium text-foreground">Domaine</span> → <span className="font-medium text-foreground">Écart</span>. Construit sur les modèles Bow-Tie réels de l&apos;aérodrome ({graphe.stats.nbDomaines} domaines).
      </p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
        <div className="bg-role-primary-soft rounded-lg p-2.5 text-center"><p className="text-[10px] text-muted-foreground">Domaines</p><p className="text-lg font-bold">{graphe.stats.nbDomaines}</p></div>
        <div className="bg-role-primary-soft rounded-lg p-2.5 text-center"><p className="text-[10px] text-muted-foreground">Barrières</p><p className="text-lg font-bold">{graphe.stats.nbBarrieres}<span className="text-xs text-warning font-normal"> ({graphe.stats.barrieresFaibles} faibles)</span></p></div>
        <div className="bg-role-primary-soft rounded-lg p-2.5 text-center"><p className="text-[10px] text-muted-foreground">Écarts</p><p className="text-lg font-bold">{graphe.stats.nbEcarts}<span className="text-xs text-danger font-normal"> ({graphe.stats.ecartsCritiques} crit.)</span></p></div>
        <div className="bg-role-primary-soft rounded-lg p-2.5 text-center"><p className="text-[10px] text-muted-foreground">Domaines dégradés</p><p className={`text-lg font-bold ${graphe.stats.domainesDegrades > 0 ? 'text-warning' : 'text-success'}`}>{graphe.stats.domainesDegrades}</p></div>
        <div className="bg-role-primary-soft rounded-lg p-2.5 text-center"><p className="text-[10px] text-muted-foreground">Liens</p><p className="text-lg font-bold">{graphe.stats.nbAretes}</p></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Critères + impact */}
        <div className="space-y-4">
          <h4 className="text-sm flex items-center gap-1.5"><GitBranch className="w-3.5 h-3.5 text-role-primary" />Critères OACI & propagation d&apos;impact</h4>
          <div className="flex flex-wrap gap-1.5">
            {CRITERES.map(cle => {
              const n = graphe.noeuds.find(x => x.id === `critere_${cle}`)
              if (!n || n.type !== 'critere') return null
              const actif = selected === cle
              return (
                <button
                  key={cle}
                  type="button"
                  onClick={() => setSelected(actif ? null : cle)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${actif ? 'border-role-primary bg-role-primary-soft' : 'border-border hover:border-role-primary/40'}`}
                >
                  <span className={`badge text-[10px] ${BADGE[n.force]}`}>{cle.toUpperCase()}</span>
                  <span className="text-foreground font-medium">{n.valeur}</span>
                  <span className="text-muted-foreground">poids {n.poids}%</span>
                </button>
              )
            })}
          </div>

          {selected ? (
            <div className="rounded-lg border border-border p-3">
              <h5 className="text-xs font-medium mb-2 text-foreground">Impact de {selected.toUpperCase()} dans le graphe ({impact.length} nœuds atteints)</h5>
              {impact.length === 0 ? (
                <p className="text-xs text-muted">Aucun nœud atteint depuis ce critère.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {impact.map(i => (
                    <div key={i.id} className="flex items-center gap-2 text-xs">
                      <span className={`badge text-[10px] ${i.type === 'domaine' ? 'primary' : i.type === 'ecart' ? 'danger' : i.type === 'barriere' ? 'warning' : 'neutral'}`}>{TYPE_LABEL[i.type]}</span>
                      <span className="text-foreground truncate">{libelleNoeud(i.id)}</span>
                      <div className="progress h-1 flex-1"><div className="progress-bar" style={{ width: `${i.impact * 100}%` }} /></div>
                      <span className="text-muted-foreground font-mono w-9 text-right">{Math.round(i.impact * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground mt-2">L&apos;impact décroît le long de la chaîne (critère → barrière ×0.7 → domaine ×0.5 → écart ×0.85).</p>
            </div>
          ) : (
            <p className="text-sm text-muted text-center py-6">Sélectionnez un critère pour tracer son impact dans le graphe.</p>
          )}
        </div>

        {/* Domaines Bow-Tie */}
        <div className="space-y-4">
          <h4 className="text-sm flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-role-primary" />Domaines Bow-Tie & barrières</h4>
          {domaines.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Aucun domaine Bow-Tie significatif pour cet aérodrome.</p>
          ) : (
            <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
              {domaines.map(d => {
                const barrieres = graphe.noeuds.filter(n => n.type === 'barriere' && n.domaine === d.code) as Extract<typeof graphe.noeuds[number], { type: 'barriere' }>[]
                const ecartsDom = ecartsParDomaine.get(d.code) ?? []
                return (
                  <div key={d.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{d.code}</span>
                      <div className="flex items-center gap-2">
                        <span className={`badge text-[10px] ${BADGE[d.niveauRisque]}`}>risque {d.niveauRisque}</span>
                        <span className="text-[10px] text-muted-foreground">prob. résiduelle {d.probabiliteResiduelle}%</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {barrieres.map(b => (
                        <div key={b.id} className="flex items-center gap-2 text-xs">
                          {b.typeBar === 'preventive' ? <Shield className={`w-3 h-3 shrink-0 ${b.efficacite < 50 ? 'text-danger' : b.efficacite < 70 ? 'text-warning' : 'text-success'}`} /> : <CheckCircle2 className={`w-3 h-3 shrink-0 ${b.efficacite < 50 ? 'text-danger' : b.efficacite < 70 ? 'text-warning' : 'text-success'}`} />}
                          <span className="text-foreground truncate">{b.nom}</span>
                          <div className="progress h-1 flex-1"><div className="progress-bar" style={{ width: `${b.efficacite}%`, backgroundColor: b.efficacite < 50 ? 'var(--danger)' : b.efficacite < 70 ? 'var(--warning)' : 'var(--success)' }} /></div>
                          <span className="text-muted-foreground font-mono w-8 text-right">{b.efficacite}%</span>
                        </div>
                      ))}
                    </div>
                    {ecartsDom.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border flex flex-wrap gap-1.5">
                        <span className="text-[10px] text-muted-foreground mr-1">Écarts :</span>
                        {ecartsDom.map(e => (
                          <span key={e.id} className={`badge text-[10px] ${BADGE[e.niveau] ?? 'neutral'}`}>{e.ecartId} {e.statut}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <AlertTriangle className="w-3 h-3 text-warning" />
            {graphe.stats.barrieresFaibles > 0 ? `${graphe.stats.barrieresFaibles} barrière(s) sous les 50% d'efficacité — risque de perte de maîtrise.` : 'Toutes les barrières sont au-dessus de 50% d\'efficacité.'}
          </div>
        </div>
      </div>
    </Card>
  )
}
