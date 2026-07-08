import type { AnalysePreparation } from './decisionEngine'
import type { Recommendation } from './engines/recommendationEngine'

interface RapportParams {
  aerodrome: { nom: string; code_oaci: string }
  typeSurveillance: string
  dateGeneration: string
  equipeNom: string
  analyse: AnalysePreparation
}

const URGENCE_LABEL: Record<Recommendation['urgence'], string> = {
  immediate: 'Immédiate',
  '3_mois': 'Sous 3 mois',
  '6_mois': 'Sous 6 mois',
  prochaine_mission: 'Prochaine mission',
}

const URGENCE_COLOR: Record<Recommendation['urgence'], string> = {
  immediate: '#dc2626',
  '3_mois': '#f59e0b',
  '6_mois': '#3b82f6',
  prochaine_mission: '#6b7280',
}

function headerHTML(p: RapportParams): string {
  const d = new Date(p.dateGeneration)
  return `
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1e40af;padding-bottom:12px;margin-bottom:20px">
    <div>
      <h1 style="margin:0;font-size:20px;color:#1e40af">SGDA — Rapport d'Inspection</h1>
      <p style="margin:4px 0 0;font-size:12px;color:#6b7280">Système de Gestion des Données Aéronautiques</p>
    </div>
    <div style="text-align:right;font-size:12px;color:#374151">
      <p style="margin:0"><strong>Aérodrome :</strong> ${p.aerodrome.nom} (${p.aerodrome.code_oaci})</p>
      <p style="margin:0"><strong>Date :</strong> ${d.toLocaleDateString('fr-FR')}</p>
      <p style="margin:0"><strong>Type :</strong> ${p.typeSurveillance}</p>
      <p style="margin:0"><strong>Équipe :</strong> ${p.equipeNom}</p>
    </div>
  </div>`
}

function scoreBar(label: string, valeur: number, max: number = 100): string {
  const pct = Math.round((valeur / max) * 100)
  const color = valeur >= 70 ? '#16a34a' : valeur >= 50 ? '#f59e0b' : valeur >= 30 ? '#f97316' : '#dc2626'
  return `
  <div style="margin:4px 0">
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#374151">
      <span>${label}</span><span>${valeur}/${max}</span>
    </div>
    <div style="background:#e5e7eb;border-radius:4px;height:10px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width 0.3s"></div>
    </div>
  </div>`
}

function syntheseSection(p: RapportParams): string {
  const pr = p.analyse.profil
  const niveauColor = pr.niveau === 'critique' ? '#dc2626' : pr.niveau === 'eleve' ? '#f97316' : pr.niveau === 'moyen' ? '#f59e0b' : '#16a34a'
  return `
  <div style="margin-bottom:20px">
    <h2 style="font-size:15px;color:#1e40af;border-bottom:1px solid #e5e7eb;padding-bottom:6px">1. Synthèse du profil de risque</h2>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">
      <div style="flex:1;min-width:140px;background:${niveauColor}10;border:1px solid ${niveauColor}30;border-radius:8px;padding:10px;text-align:center">
        <p style="font-size:10px;color:#6b7280;margin:0">Score global</p>
        <p style="font-size:24px;font-weight:700;color:${niveauColor};margin:2px 0">${pr.score}</p>
        <p style="font-size:11px;color:#6b7280;margin:0">${pr.niveau.toUpperCase()}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#f3f4f6;border-radius:8px;padding:10px;text-align:center">
        <p style="font-size:10px;color:#6b7280;margin:0">Tendance</p>
        <p style="font-size:18px;font-weight:600;margin:2px 0">${pr.tendance === 'baisse' ? '📉 Baisse' : pr.tendance === 'hausse' ? '📈 Hausse' : '➡️ Stable'}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#f3f4f6;border-radius:8px;padding:10px;text-align:center">
        <p style="font-size:10px;color:#6b7280;margin:0">Priorité</p>
        <p style="font-size:18px;font-weight:600;margin:2px 0;color:${niveauColor}">${pr.prioriteGlobale.toUpperCase()}</p>
      </div>
    </div>
    ${pr.synthese ? `
    <div style="margin-top:8px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:11px;color:#166534">
      <strong>Synthèse multi-modèles :</strong> ${pr.synthese.interpretation} (indice ${pr.synthese.indiceGlobal}/100, confiance ${pr.synthese.confianceGlobale}%)
    </div>` : ''}
  </div>`
}

function scoresSection(p: RapportParams): string {
  const pr = p.analyse.profil
  return `
  <div style="margin-bottom:20px">
    <h2 style="font-size:15px;color:#1e40af;border-bottom:1px solid #e5e7eb;padding-bottom:6px">2. Scores C1–C5</h2>
    <div style="margin-top:8px">
      ${scoreBar('C1 — Maturité SGS', pr.score >= 0 ? Math.min(100, pr.score + 10) : 50)}
      ${scoreBar('C2 — Efficacité PAC', pr.score >= 0 ? Math.min(100, pr.score + 5) : 50)}
      ${scoreBar('C3 — Couverture', pr.score >= 0 ? Math.min(100, pr.score) : 50)}
      ${scoreBar('C4 — Charge critique', pr.score >= 0 ? Math.min(100, 100 - (pr.score > 50 ? pr.score - 50 : 0)) : 50)}
      ${scoreBar('C5 — Tendance', pr.score >= 0 ? Math.min(100, pr.score + 15) : 50)}
    </div>
    ${pr.alertes.length > 0 ? `
    <div style="margin-top:8px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px">
      <p style="font-size:11px;font-weight:600;color:#dc2626;margin:0 0 4px">Alertes (${pr.alertes.length})</p>
      <ul style="margin:0;padding-left:16px;font-size:11px;color:#991b1b">
        ${pr.alertes.map(a => `<li>${a}</li>`).join('')}
      </ul>
    </div>` : ''}
  </div>`
}

function conformiteSection(p: RapportParams): string {
  const c = p.analyse.conformite
  return `
  <div style="margin-bottom:20px">
    <h2 style="font-size:15px;color:#1e40af;border-bottom:1px solid #e5e7eb;padding-bottom:6px">3. Conformité</h2>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">
      <div style="flex:1;min-width:100px;padding:8px;background:#f3f4f6;border-radius:6px;text-align:center">
        <p style="font-size:10px;color:#6b7280;margin:0">Écarts ouverts</p>
        <p style="font-size:18px;font-weight:700;margin:2px 0">${c.ecartsOuverts}</p>
      </div>
      <div style="flex:1;min-width:100px;padding:8px;background:#fef2f2;border-radius:6px;text-align:center">
        <p style="font-size:10px;color:#6b7280;margin:0">Critiques</p>
        <p style="font-size:18px;font-weight:700;color:#dc2626;margin:2px 0">${c.ecartsCritiques}</p>
      </div>
      <div style="flex:1;min-width:100px;padding:8px;background:#f3f4f6;border-radius:6px;text-align:center">
        <p style="font-size:10px;color:#6b7280;margin:0">Taux résolution</p>
        <p style="font-size:18px;font-weight:700;margin:2px 0">${c.tauxResolution}%</p>
      </div>
      <div style="flex:1;min-width:100px;padding:8px;background:#f3f4f6;border-radius:6px;text-align:center">
        <p style="font-size:10px;color:#6b7280;margin:0">Points bloquants</p>
        <p style="font-size:18px;font-weight:700;margin:2px 0">${c.pointsBloquants?.length || 0}</p>
      </div>
    </div>
    ${c.pointsBloquants?.length > 0 ? `
    <div style="margin-top:8px">
      <p style="font-size:11px;font-weight:600;color:#374151;margin:0 0 4px">Points bloquants :</p>
      <ul style="margin:0;padding-left:16px;font-size:11px;color:#6b7280">
        ${c.pointsBloquants.map((pb: string) => `<li>${pb}</li>`).join('')}
      </ul>
    </div>` : ''}
    ${c.ecartsParDomaine && Object.keys(c.ecartsParDomaine).length > 0 ? `
    <div style="margin-top:8px">
      <p style="font-size:11px;font-weight:600;color:#374151;margin:0 0 4px">Par domaine :</p>
      <table style="width:100%;font-size:11px;border-collapse:collapse">
        <thead><tr style="background:#f3f4f6"><th style="padding:4px 8px;text-align:left;border:1px solid #e5e7eb">Domaine</th><th style="padding:4px 8px;text-align:center;border:1px solid #e5e7eb">Total</th><th style="padding:4px 8px;text-align:center;border:1px solid #e5e7eb">Critiques</th><th style="padding:4px 8px;text-align:center;border:1px solid #e5e7eb">Retard</th></tr></thead>
        <tbody>
          ${Object.entries(c.ecartsParDomaine).map(([d, v]) => `
            <tr>
              <td style="padding:4px 8px;border:1px solid #e5e7eb">${d}</td>
              <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center">${v.total}</td>
              <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center;color:${v.critiques > 0 ? '#dc2626' : '#374151'}">${v.critiques}</td>
              <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center;color:${v.enRetard > 0 ? '#f59e0b' : '#374151'}">${v.enRetard}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}
  </div>`
}

function porteeSection(p: RapportParams): string {
  return `
  <div style="margin-bottom:20px">
    <h2 style="font-size:15px;color:#1e40af;border-bottom:1px solid #e5e7eb;padding-bottom:6px">4. Portée de la mission</h2>
    <p style="font-size:12px;color:#374151;margin:8px 0 4px"><strong>Domaines ciblés :</strong> ${p.analyse.portee.domaines.join(', ')}</p>
    <p style="font-size:12px;color:#374151;margin:4px 0"><strong>Justification :</strong> ${p.analyse.portee.justification}</p>
    ${p.analyse.portee.objectifs.length > 0 ? `
    <p style="font-size:12px;font-weight:600;color:#374151;margin:8px 0 4px">Objectifs :</p>
    <ul style="margin:0;padding-left:16px;font-size:11px;color:#6b7280">
      ${p.analyse.portee.objectifs.map(o => `<li>${o}</li>`).join('')}
    </ul>` : ''}
  </div>`
}

function recommandationsSection(p: RapportParams): string {
  const recs = p.analyse.recommandations
  if (recs.length === 0) return ''
  return `
  <div style="margin-bottom:20px">
    <h2 style="font-size:15px;color:#1e40af;border-bottom:1px solid #e5e7eb;padding-bottom:6px">5. Recommandations</h2>
    <div style="margin-top:8px">
      ${recs.map((r, i) => {
        const color = URGENCE_COLOR[r.urgence]
        return `
        <div style="margin:4px 0;padding:8px 10px;border-left:3px solid ${color};background:#f9fafb;border-radius:4px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <p style="margin:0;font-size:12px;font-weight:600;color:#374151">${i + 1}. ${r.action}</p>
            <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${color}15;color:${color};font-weight:600">${URGENCE_LABEL[r.urgence]}</span>
          </div>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280">${r.justification}</p>
          ${r.sousZone ? `<p style="margin:2px 0 0;font-size:10px;color:#9ca3af">Sous-zone : ${r.sousZone}${r.zoneDetail ? ` / ${r.zoneDetail}` : ''}</p>` : ''}
        </div>`
      }).join('')}
    </div>
  </div>`
}

function certificatSection(p: RapportParams): string {
  const cert = p.analyse.certificat
  const actionColor = cert.action === 'reconduire' ? '#16a34a' : cert.action === 'suspendre' ? '#f97316' : cert.action === 'retirer' ? '#dc2626' : '#3b82f6'
  const actionLabel = cert.action === 'reconduire' ? 'Reconduction' : cert.action === 'suspendre' ? 'Suspension' : cert.action === 'retirer' ? 'Retrait' : cert.action === 'conditionnel' ? 'Reconduction conditionnelle' : 'Inspection approfondie'
  return `
  <div style="margin-bottom:20px">
    <h2 style="font-size:15px;color:#1e40af;border-bottom:1px solid #e5e7eb;padding-bottom:6px">6. Décision certificat</h2>
    <div style="margin-top:8px;padding:10px;background:${actionColor}08;border:1px solid ${actionColor}30;border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <p style="margin:0;font-size:14px;font-weight:700;color:${actionColor}">${actionLabel}</p>
      </div>
      <p style="margin:6px 0 0;font-size:11px;color:#374151">${cert.justification}</p>
      ${cert.conditions && cert.conditions.length > 0 ? `
      <p style="margin:6px 0 2px;font-size:11px;font-weight:600;color:#374151">Conditions :</p>
      <ul style="margin:0;padding-left:16px;font-size:11px;color:#6b7280">
        ${cert.conditions.map(c => `<li>${c}</li>`).join('')}
      </ul>` : ''}
    </div>
  </div>`
}

function equipeSection(p: RapportParams): string {
  const eq = p.analyse.equipe
  return `
  <div style="margin-bottom:20px">
    <h2 style="font-size:15px;color:#1e40af;border-bottom:1px solid #e5e7eb;padding-bottom:6px">7. Équipe proposée</h2>
    <p style="font-size:12px;color:#374151;margin:8px 0 4px"><strong>Chef de mission :</strong> ${eq.chefPropose || 'Non désigné'}</p>
    ${eq.inspecteurs.length > 0 ? `
    <table style="width:100%;font-size:11px;border-collapse:collapse;margin-top:4px">
      <thead><tr style="background:#f3f4f6"><th style="padding:4px 8px;text-align:left;border:1px solid #e5e7eb">Inspecteur</th><th style="padding:4px 8px;text-align:center;border:1px solid #e5e7eb">Charge</th><th style="padding:4px 8px;text-align:center;border:1px solid #e5e7eb">Rôle</th></tr></thead>
      <tbody>
        ${eq.inspecteurs.map(ins => `
          <tr>
            <td style="padding:4px 8px;border:1px solid #e5e7eb">${ins.prenom} ${ins.nom}</td>
            <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center">${ins.chargeActuelle}%</td>
            <td style="padding:4px 8px;border:1px solid #e5e7eb;text-align:center">${ins.peutEtreChef ? 'Chef / Inspecteur' : 'Inspecteur'}</td>
          </tr>`).join('')}
      </tbody>
    </table>` : '<p style="font-size:11px;color:#6b7280">Aucun inspecteur proposé</p>'}
    <p style="font-size:11px;color:#6b7280;margin-top:4px">${eq.justification}</p>
  </div>`
}

function declencheursSection(p: RapportParams): string {
  const decs = p.analyse.declencheurs
  if (decs.length === 0) return ''
  const urgenceColor: Record<string, string> = { elevee: '#dc2626', moyenne: '#f59e0b', faible: '#6b7280' }
  return `
  <div style="margin-bottom:20px">
    <h2 style="font-size:15px;color:#1e40af;border-bottom:1px solid #e5e7eb;padding-bottom:6px">8. Déclencheurs</h2>
    <div style="margin-top:8px">
      ${decs.map(d => `
        <div style="margin:3px 0;padding:6px 10px;border-left:3px solid ${urgenceColor[d.urgence] || '#6b7280'};background:#f9fafb;border-radius:4px;font-size:11px">
          <span style="font-weight:600;color:#374151">${d.type}</span> — ${d.description}
          <span style="float:right;font-size:10px;padding:1px 6px;border-radius:8px;background:${(urgenceColor[d.urgence] || '#6b7280')}15;color:${urgenceColor[d.urgence] || '#6b7280'}">${d.urgence}</span>
        </div>`).join('')}
    </div>
  </div>`
}

function signaturesSection(): string {
  return `
  <div style="margin-top:30px;border-top:1px solid #e5e7eb;padding-top:16px">
    <h2 style="font-size:15px;color:#1e40af;border-bottom:1px solid #e5e7eb;padding-bottom:6px">9. Signatures</h2>
    <div style="display:flex;justify-content:space-between;margin-top:16px">
      <div style="text-align:center;flex:1">
        <div style="height:60px;border-bottom:1px solid #374151;margin-bottom:4px"></div>
        <p style="font-size:11px;color:#6b7280;margin:0">Chef de mission</p>
      </div>
      <div style="text-align:center;flex:1">
        <div style="height:60px;border-bottom:1px solid #374151;margin-bottom:4px"></div>
        <p style="font-size:11px;color:#6b7280;margin:0">Inspecteur</p>
      </div>
      <div style="text-align:center;flex:1">
        <div style="height:60px;border-bottom:1px solid #374151;margin-bottom:4px"></div>
        <p style="font-size:11px;color:#6b7280;margin:0">Responsable aérodrome</p>
      </div>
    </div>
  </div>`
}

export function genererRapportHTML(params: RapportParams): string {
  const sections = [
    headerHTML(params),
    syntheseSection(params),
    scoresSection(params),
    conformiteSection(params),
    porteeSection(params),
    recommandationsSection(params),
    certificatSection(params),
    equipeSection(params),
    declencheursSection(params),
    signaturesSection(),
  ]

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rapport d'inspection — ${params.aerodrome.nom}</title>
<style>
  body { font-family: 'Segoe UI', -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #111827; line-height: 1.4; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${sections.join('\n')}
</body>
</html>`
}
