// lib/services/bulletinMensuel.ts
// Bulletin mensuel de sécurité PDF — ton administratif cohérent avec lettres de mise en demeure
// Utilise html2canvas + jsPDF via pdfGenerator.ts

'use client'

import { downloadBlob } from '@/lib/pdfGenerator'

interface BulletinData {
  mois: number
  annee: number
  aerodromes: Array<{
    nom: string
    code: string
    scoreGlobal: number
    tendance: string
    niveauRisque: string
    ecartsCritiques: number
    c2: number
  }>
  stats: {
    totalAerodromes: number
    scoreMoyen: number
    ecartsCritiquesTotal: number
    risqueCritique: number
    risqueEleve: number
  }
  recommandationDuMois: string
  redacteur?: string
}

function moisLabel(m: number): string {
  const labels = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  return labels[m - 1] || ''
}

function buildBulletinHTML(data: BulletinData): string {
  const { mois, annee, aerodromes, stats, recommandationDuMois, redacteur } = data
  const dateStr = `${moisLabel(mois).charAt(0).toUpperCase() + moisLabel(mois).slice(1)} ${annee}`
  const scoreColor = stats.scoreMoyen >= 60 ? '#166534' : stats.scoreMoyen >= 40 ? '#92400e' : '#991b1b'

  const aerodromeRows = aerodromes
    .sort((a, b) => a.scoreGlobal - b.scoreGlobal)
    .map(a => {
      const riskColor = a.niveauRisque === 'critique' ? '#dc2626' : a.niveauRisque === 'eleve' ? '#d97706' : a.niveauRisque === 'moyen' ? '#2563eb' : '#16a34a'
      const tendIcon = a.tendance === 'baisse' ? '↘' : a.tendance === 'hausse' ? '↗' : '→'
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${a.nom} (${a.code})</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;color:${riskColor}">${a.scoreGlobal}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${tendIcon}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${a.ecartsCritiques}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center">${a.c2}</td>
      </tr>`
    }).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  @page { margin: 20mm; }
  body { font-family: 'Times New Roman', Times, serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
  .page-de-garde { text-align: center; padding-top: 80px; page-break-after: always; }
  .page-de-garde h1 { font-size: 22pt; font-weight: bold; margin-bottom: 8px; color: #1e3a5f; }
  .page-de-garde .sous-titre { font-size: 14pt; color: #475569; margin-bottom: 40px; }
  .page-de-garde .entete { font-size: 10pt; color: #64748b; margin-bottom: 60px; }
  .page-de-garde .date-publication { font-size: 12pt; margin-top: 40px; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 20px 0; }
  h2 { font-size: 14pt; font-weight: bold; color: #1e3a5f; margin-top: 24px; margin-bottom: 12px; }
  h3 { font-size: 12pt; font-weight: bold; color: #334155; margin-top: 18px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: #1e3a5f; color: #fff; padding: 8px 10px; text-align: left; font-size: 10pt; }
  td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
  .kpi-grid { display: flex; gap: 12px; margin: 16px 0; }
  .kpi-box { flex:1; text-align:center; padding:12px; border:1px solid #e2e8f0; border-radius:4px; }
  .kpi-value { font-size:18pt; font-weight:bold; }
  .kpi-label { font-size:9pt; color:#64748b; }
  .recommandation { background:#f0fdf4; border-left:4px solid #16a34a; padding:12px; margin:12px 0; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 9pt; color: #64748b; text-align: center; }
</style></head>
<body>

<div class="page-de-garde">
  <div class="entete">RÉPUBLIQUE DU SÉNÉGAL<br>AGENCE NATIONALE DE L'AVIATION CIVILE ET DE LA MÉTÉOROLOGIE</div>
  <h1>BULLETIN MENSUEL DE SÉCURITÉ</h1>
  <div class="sous-titre">Surveillance des aérodromes — ${dateStr}</div>
  <hr style="width:200px;margin:30px auto;">
  <div class="date-publication">Publié le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  ${redacteur ? `<div style="margin-top:20px;font-size:10pt;color:#64748b">Rédacteur : ${redacteur}</div>` : ''}
  <div style="margin-top:60px;font-size:9pt;color:#94a3b8">Document confidentiel — diffusion restreinte</div>
</div>

<h2>1. RÉSUMÉ EXÉCUTIF</h2>
<p>Le présent bulletin rend compte de l'état de sécurité des ${stats.totalAerodromes} aérodromes sous surveillance au titre du mois de ${moisLabel(mois)} ${annee}. Le score de risque moyen pondéré s'établit à <strong style="color:${scoreColor}">${stats.scoreMoyen}/100</strong>.</p>

<div class="kpi-grid">
  <div class="kpi-box"><div class="kpi-value" style="color:${scoreColor}">${stats.scoreMoyen}</div><div class="kpi-label">Score moyen</div></div>
  <div class="kpi-box"><div class="kpi-value" style="color:#dc2626">${stats.ecartsCritiquesTotal}</div><div class="kpi-label">Écarts critiques</div></div>
  <div class="kpi-box"><div class="kpi-value" style="color:#dc2626">${stats.risqueCritique}</div><div class="kpi-label">Aérodromes risque critique</div></div>
  <div class="kpi-box"><div class="kpi-value" style="color:#d97706">${stats.risqueEleve}</div><div class="kpi-label">Aérodromes risque élevé</div></div>
</div>

<h2>2. SYNTHÈSE PAR AÉRODROME</h2>
<p>Situation détaillée par plateforme, classée du plus dégradé au plus favorable :</p>
<table>
  <thead><tr><th>Aérodrome</th><th style="text-align:center">Score</th><th style="text-align:center">Tendance</th><th style="text-align:center">Écarts critiques</th><th style="text-align:center">C2 (PAC)</th></tr></thead>
  <tbody>${aerodromeRows}</tbody>
</table>

<h2>3. FAITS MARQUANTS</h2>
<p>Analyse des principaux signaux détectés par le système AERORISQ au cours de la période :</p>
<ul>
  ${aerodromes.filter(a => a.niveauRisque === 'critique').map(a => `<li><strong>${a.nom} (${a.code})</strong> : score ${a.scoreGlobal}/100, ${a.ecartsCritiques} écart(s) critique(s). La tendance ${a.tendance === 'baisse' ? 'baissière appelle une vigilance renforcée' : a.tendance === 'hausse' ? 'haussière est encourageante' : 'est stable'}.</li>`).join('')}
  ${aerodromes.filter(a => a.niveauRisque === 'eleve').slice(0, 3).map(a => `<li><strong>${a.nom} (${a.code})</strong> : score ${a.scoreGlobal}/100, C2=${a.c2} — efficacité PAC à surveiller.</li>`).join('')}
</ul>

<h2>4. RECOMMANDATION DU MOIS</h2>
<div class="recommandation">
  <p style="margin:0;font-size:10pt">${recommandationDuMois}</p>
</div>

<h2>5. CONCLUSION</h2>
<p>Le présent bulletin est établi sur la base des données consolidées du système de surveillance et des analyses produites par AERORISQ. Les actions correctives assignées dans le cadre des plans d'action correctives (PAC) feront l'objet d'un suivi dans le prochain bulletin.</p>

<div class="footer">
  <p>ANACIM — Direction de la Sécurité et de la Sûreté<br>
  Aéroport International Blaise Diagne — BP 8184 Aéroport de Dakar<br>
  Ce document est confidentiel. Toute diffusion hors du circuit autorisé est interdite.</p>
</div>

</body></html>`
}

export async function exporterBulletinMensuel(
  mois: number,
  annee: number,
  redacteur?: string
): Promise<void> {
  const { useAppStore } = await import('@/lib/store')
  const state = useAppStore.getState()
  const aerodromes = state.aerodromes || []
  const profils = state.profilsRisque || {}

  const aerodromeData = aerodromes.map(aero => {
    const p = profils[aero.id]
    return {
      nom: aero.nom || '',
      code: aero.code_oaci || aero.id,
      scoreGlobal: p?.score_global ?? 50,
      tendance: p?.tendance ?? 'stable',
      niveauRisque: p?.niveau ?? 'moyen',
      ecartsCritiques: (state.ecarts || []).filter(e => e.aerodrome_id === aero.id && e.niveau_risque === 'critique').length,
      c2: p?.c2 ?? 50,
    }
  })

  const stats = {
    totalAerodromes: aerodromeData.length,
    scoreMoyen: aerodromeData.length > 0
      ? Math.round(aerodromeData.reduce((s, a) => s + a.scoreGlobal, 0) / aerodromeData.length)
      : 0,
    ecartsCritiquesTotal: aerodromeData.reduce((s, a) => s + a.ecartsCritiques, 0),
    risqueCritique: aerodromeData.filter(a => a.niveauRisque === 'critique').length,
    risqueEleve: aerodromeData.filter(a => a.niveauRisque === 'eleve').length,
  }

  const data: BulletinData = {
    mois, annee,
    aerodromes: aerodromeData,
    stats,
    recommandationDuMois: 'La priorité du mois est la réduction des écarts critiques et le renforcement de l\'efficacité des PAC. Une attention particulière sera portée aux aérodromes en tendance baissière et à ceux présentant un C2 inférieur à 40.',
    redacteur,
  }

  const renderBulletin = buildBulletinHTML(data)
  const container = document.createElement('div')
  container.innerHTML = renderBulletin
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.width = '210mm'
  container.style.background = '#fff'
  document.body.appendChild(container)

  try {
    const html2canvas = (await import('html2canvas')).default
    const jsPDF = (await import('jspdf')).default

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      width: 794,
    } as any)

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = 210
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width

    let remainingHeight = pdfHeight
    let srcY = 0
    let page = 0

    while (remainingHeight > 0) {
      if (page > 0) pdf.addPage()
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = Math.min(canvas.height - srcY, 297 * (canvas.width / pdfWidth))
      const ctx = pageCanvas.getContext('2d')!
      ctx.drawImage(canvas, 0, srcY, canvas.width, pageCanvas.height, 0, 0, pageCanvas.width, pageCanvas.height)
      const pageImgData = pageCanvas.toDataURL('image/png')
      pdf.addImage(pageImgData, 'PNG', 0, 0, pdfWidth, (pageCanvas.height * pdfWidth) / canvas.width)
      srcY += pageCanvas.height
      remainingHeight -= pageCanvas.height
      page++
    }

    const filename = `bulletin_securite_${moisLabel(mois)}_${annee}.pdf`
    pdf.save(filename)
  } finally {
    document.body.removeChild(container)
  }
}
