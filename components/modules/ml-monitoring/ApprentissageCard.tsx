// components/modules/ml-monitoring/ApprentissageCard.tsx
// CARTE 12 : tableau de bord d'apprentissage AERORISQ — ce que les autres
// cartes ne montrent pas : précision réelle des prédictions, dataset,
// derniers runs des 6 boucles, modèle local. Lecture seule, best-effort
// (chaque bloc affiche « — » si indisponible, jamais d'erreur bloquante).

'use client'

import React, { useEffect, useState } from 'react'
import { Brain } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EnClairNote } from './EnClairNote'
import {
  lireStatutApprentissage,
  libelleBiais,
  type StatutApprentissage,
} from '@/lib/ia/apprentissageStatus'
import { PLAN_APPRENTISSAGE } from '@/lib/ia/predictionLearning'

function valeur(v: number | null, suffixe = ''): string {
  return v == null ? '—' : `${v}${suffixe}`
}

export function ApprentissageCard({ aerodromeId }: { aerodromeId?: string }) {
  const [statut, setStatut] = useState<StatutApprentissage | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    let actif = true
    lireStatutApprentissage()
      .then(s => { if (actif) { setStatut(s); setChargement(false) } })
      .catch(() => { if (actif) setChargement(false) })
    return () => { actif = false }
  }, [])

  const p = statut?.precision
  const d = statut?.dataset
  const runs = new Map((statut?.runs || []).map(r => [r.job, r]))
  const aerorisqLocal = (statut?.modelesLocaux || []).some(m => m.startsWith('aerorisq'))

  return (
    <Card icon={<Brain className="h-4 w-4 text-role-primary" />} title="5. Apprentissage AERORISQ — données réelles">
      <EnClairNote
        module="ml-card-12"
        aerodromeId={aerodromeId}
        aQuoiCaSert="Montre si l'IA apprend vraiment : précision de ses prédictions, volume du dataset, derniers passages des boucles, modèle local."
        commentLire="MAE basse = prédictions justes ; biais neutre = ni optimiste ni pessimiste. Un compteur qui ne bouge pas = boucle à câbler."
      />
      {chargement ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Chargement du statut d’apprentissage…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Précision des prédictions */}
          <div className="space-y-3">
            <h4 className="text-sm">Précision des prédictions</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-muted/20">
                <p className="text-xs text-muted">Vérifiées 3 mois</p>
                <p className="text-sm font-bold">{valeur(p?.n3m ?? null)}</p>
              </div>
              <div className="p-2 rounded bg-muted/20">
                <p className="text-xs text-muted">Vérifiées 6 mois</p>
                <p className="text-sm font-bold">{valeur(p?.n6m ?? null)}</p>
              </div>
              <div className="p-2 rounded bg-muted/20">
                <p className="text-xs text-muted">Erreur moy. 3m</p>
                <p className="text-sm font-bold">{valeur(p?.mae3m ?? null, p?.mae3m != null ? ' pts' : '')}</p>
              </div>
              <div className="p-2 rounded bg-muted/20">
                <p className="text-xs text-muted">Erreur moy. 6m</p>
                <p className="text-sm font-bold">{valeur(p?.mae6m ?? null, p?.mae6m != null ? ' pts' : '')}</p>
              </div>
              <div className="p-2 rounded bg-muted/20">
                <p className="text-xs text-muted">Biais 3m</p>
                <p className="text-sm font-bold">{libelleBiais(p?.biais3m ?? null)}</p>
              </div>
              <div className="p-2 rounded bg-muted/20">
                <p className="text-xs text-muted">Biais 6m</p>
                <p className="text-sm font-bold">{libelleBiais(p?.biais6m ?? null)}</p>
              </div>
            </div>
          </div>

          {/* Dataset */}
          <div className="space-y-3">
            <h4 className="text-sm">Dataset (matière d’apprentissage)</h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Écarts résolus</p><p className="text-sm font-bold">{valeur(d?.pairesEcarts ?? null)}</p></div>
              <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Preuves transcrites</p><p className="text-sm font-bold">{valeur(d?.preuvesTranscrites ?? null)}</p></div>
              <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Rapports capitalisés</p><p className="text-sm font-bold">{valeur(d?.rapportsTransmis ?? null)}</p></div>
              <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Échantillons ML</p><p className="text-sm font-bold">{valeur(d?.mlSamples ?? null)}</p></div>
              <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Prédictions suivies</p><p className="text-sm font-bold">{valeur(d?.predictionsSuivies ?? null)}</p></div>
              <div className="p-2 rounded bg-muted/20"><p className="text-xs text-muted">Prédictions vérifiées</p><p className="text-sm font-bold">{valeur(d?.predictionsVerifiees ?? null)}</p></div>
            </div>
          </div>

          {/* Boucles + modèle local */}
          <div className="space-y-3">
            <h4 className="text-sm">Boucles (fréquence → dernier passage)</h4>
            <div className="space-y-1.5">
              {PLAN_APPRENTISSAGE.map(b => {
                const run = runs.get(b.job)
                return (
                  <div key={b.job} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium truncate" title={`${b.objet} — ${b.route}`}>{b.job}</span>
                    <span className="text-muted-foreground flex-shrink-0">{b.frequence}</span>
                    <span className={`flex-shrink-0 font-medium ${run?.dernierRun ? 'text-success' : 'text-muted-foreground'}`}>
                      {run?.dernierRun ? new Date(run.dernierRun).toLocaleDateString('fr-FR') : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="pt-2 border-t border-border text-xs">
              <p className="font-medium mb-1">Modèle local (Ollama)</p>
              {statut && statut.modelesLocaux.length === 0 ? (
                <p className="text-muted-foreground">Ollama injoignable depuis ce navigateur (normal hors poste local).</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(statut?.modelesLocaux || []).map(m => (
                    <span key={m} className={`badge text-[10px] ${m.startsWith('aerorisq') ? 'success' : 'neutral'}`}>{m}</span>
                  ))}
                </div>
              )}
              {statut && statut.modelesLocaux.length > 0 && !aerorisqLocal && (
                <p className="text-warning mt-1">Modèle « aerorisq » absent — créez-le : <span className="font-mono">npm run aerorisq:create</span></p>
              )}
              <p className="text-muted-foreground mt-1">Régénérer après validations : <span className="font-mono">npm run aerorisq:modelfile</span></p>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

export default ApprentissageCard
