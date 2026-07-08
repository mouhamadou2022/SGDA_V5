// components/modules/evenements/EvenementRapport.tsx
'use client'

import { useState, useCallback } from 'react'
import { useAppStore } from '@/lib/store'
import { Download, Printer, FileText, X, Loader2 } from 'lucide-react'
import { generatePDFFromHTMLString } from '@/lib/pdfGenerator'

interface EvenementRapportProps {
  evenementId: string
  onClose?: () => void
}

const FALLBACK = {
  id: 'evt-demo',
  reference: 'EVT-2024-001',
  type: 'Incident de piste',
  gravite: 'ORANGE',
  date: '2024-04-20',
  heure: '14:35',
  localisation: 'Piste 01/19 — Aérodrome GOBD (Dakar-Blaise Diagne)',
  description:
    'Sortie de piste d\'un aéronef léger lors d\'un atterrissage par vent traversier. Pas de blessés. Légères avaries sur l\'aéronef. L\'aéronef de type Cessna 172 immatriculé 6V-AFX effectuait une approche à vue sur la piste 01 lorsqu\'une rafale de vent traversier a entraîné la sortie de piste.',
  aerodrome_id: 'GOBD',
  aeronef: {
    immatriculation: '6V-AFX',
    type: 'Cessna 172',
    exploitant: 'Sénégal Air Formation',
  },
  services_alertes: ['Tour de contrôle GOBD', 'SSLIA GOBD', 'Gendarmerie nationale', 'ANACIM Direction'],
  actions_immediates:
    'Fermeture temporaire de la piste 01/19. Dépêche du véhicule SSLIA. Inspection de la piste effectuée. Rapport initial transmis à la direction.',
  inspecteur_id: 'ins-01',
  blesses: { mortels: 0, graves: 0, legers: 0, indemnes: 1 },
}

const GRAVITE_LABELS: Record<string, string> = {
  CRITIQUE: 'Critique', ORANGE: 'Élevé', JAUNE: 'Moyen', BLEU: 'Faible', GRIS: 'Faible',
}

function EvenementRapport({ evenementId, onClose }: EvenementRapportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const evenements = useAppStore((s) => s.evenements)
  const ecarts = useAppStore((s) => s.ecarts)
  const utilisateurs = useAppStore((s) => s.utilisateurs)
  const aerodromes = useAppStore((s) => s.aerodromes)
  const evt = (evenements?.find((e) => e.id === evenementId) as typeof FALLBACK | undefined) ?? FALLBACK
  const aerodromeNom = aerodromes?.find(a => a.id === evt.aerodrome_id)?.nom || evt.aerodrome_id

  const ecartLie = ecarts?.find(e => e.evenement_id === evenementId)
  const inspecteur = evt.inspecteur_id ? utilisateurs?.find(u => u.id === evt.inspecteur_id) : null

  const genererRapportHTML = useCallback(() => {
    const graviteLabel = GRAVITE_LABELS[evt.gravite] || evt.gravite
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Rapport événement — ${evt.reference}</title>
<style>
  @page { margin: 20mm 15mm; size: A4; }
  @media print { html, body { background: white; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #1a1a1a; background: white; }
  .header { text-align: center; margin-bottom: 30pt; }
  .header .logo { width: 60px; height: 60px; border-radius: 50%; background: #1a237e; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 20pt; margin: 0 auto 10pt; }
  .header .republique { font-size: 10pt; color: #666; }
  .header .agence { font-size: 14pt; font-weight: 600; }
  .header .rapport-titre { border: 2pt solid #1a237e; padding: 12pt 30pt; display: inline-block; margin-top: 15pt; }
  .header .rapport-titre h1 { font-size: 18pt; font-weight: 700; color: #1a237e; }
  h2 { font-size: 13pt; font-weight: 700; margin: 18pt 0 10pt; color: #1a237e; border-bottom: 1pt solid #1a237e; padding-bottom: 4pt; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10pt; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10pt; }
  .grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10pt; }
  .label { color: #666; }
  p { margin: 6pt 0; text-align: justify; }
  ul { padding-left: 20pt; margin: 6pt 0; }
  .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30pt; margin-top: 20pt; }
  .signature-line { border-bottom: 1pt solid #333; width: 180pt; margin-top: 40pt; }
  footer { margin-top: 20pt; padding-top: 10pt; border-top: 1pt solid #ccc; text-align: center; font-size: 9pt; color: #666; }
</style></head><body>
<div class="header">
  <div class="logo">AN</div>
  <p class="republique">RÉPUBLIQUE DU SÉNÉGAL</p>
  <p class="agence">Agence Nationale de l'Aviation Civile et de la Météorologie</p>
  <p style="font-size:9pt;color:#666">ANACIM</p>
  <div class="rapport-titre">
    <h1>RAPPORT D'ÉVÉNEMENT DE SÉCURITÉ</h1>
    <p style="margin-top:4pt">Référence: ${evt.reference}</p>
    <p style="font-size:10pt;color:#666">Date: ${evt.date} à ${evt.heure}</p>
  </div>
</div>

<h2>1. Identification de l'événement</h2>
<div class="grid-2">
  <div><span class="label">Type d'événement:</span> ${evt.type}</div>
  <div><span class="label">Niveau de gravité:</span> <strong>${graviteLabel}</strong></div>
  <div><span class="label">Aérodrome:</span> ${aerodromeNom}</div>
  <div><span class="label">Date et heure:</span> ${evt.date} à ${evt.heure} UTC</div>
  <div style="grid-column:1/-1"><span class="label">Localisation précise:</span> ${evt.localisation}</div>
  <div><span class="label">Référence rapport:</span> ${evt.reference}</div>
</div>

<h2>2. Description des faits</h2>
<p>${evt.description}</p>

<h2>3. Parties impliquées</h2>
${evt.aeronef ? `
<p style="font-weight:600;color:#1a237e">Aéronef impliqué:</p>
<div class="grid-3">
  <div><span class="label">Immatriculation:</span> ${evt.aeronef.immatriculation}</div>
  <div><span class="label">Type:</span> ${evt.aeronef.type}</div>
  <div><span class="label">Exploitant:</span> ${evt.aeronef.exploitant}</div>
</div>` : ''}
${evt.blesses ? `
<p style="font-weight:600;color:#1a237e;margin-top:10pt">Bilan humain:</p>
<div class="grid-4">
  <div><span class="label">Décès:</span> ${evt.blesses.mortels}</div>
  <div><span class="label">Graves:</span> ${evt.blesses.graves}</div>
  <div><span class="label">Légers:</span> ${evt.blesses.legers}</div>
  <div><span class="label">Indemnes:</span> ${evt.blesses.indemnes}</div>
</div>` : ''}
<p style="font-weight:600;color:#1a237e;margin-top:10pt">Services alertés:</p>
<ul>${evt.services_alertes.map(s => `<li>${s}</li>`).join('')}</ul>

<h2>4. Actions immédiates</h2>
<p>${evt.actions_immediates}</p>

<h2>5. Analyse des causes</h2>
${ecartLie ? `
<p style="font-weight:600">Écart lié: <span style="font-family:monospace">${ecartLie.reference}</span></p>
<p>${ecartLie.libelle}</p>
${ecartLie.pac?.actions?.length ? `
<p style="font-weight:600;margin-top:10pt">Actions correctives:</p>
<ul>${ecartLie.pac.actions.map((a: any) => `<li>${a.description} — Resp: ${a.responsable}</li>`).join('')}</ul>` : ''}
` : '<p style="font-style:italic;color:#666">Analyse en cours — rapport d\'investigation à joindre après clôture de l\'enquête.</p>'}

<h2>6. Recommandations</h2>
${ecartLie?.pac?.observations ? `<p>${ecartLie.pac.observations}</p>` : '<p style="font-style:italic;color:#666">Recommandations en cours d\'élaboration.</p>'}

<h2>7. Signature de l'inspecteur responsable</h2>
<div class="signature-grid">
  <div>
    <p><span class="label">Nom:</span> ${inspecteur ? `${inspecteur.prenom} ${inspecteur.nom}` : 'Inspecteur non assigné'}</p>
    <p style="margin-top:10pt"><span class="label">Qualité:</span> Inspecteur — ANACIM</p>
    <p style="margin-top:10pt"><span class="label">Date:</span> ${new Date().toLocaleDateString('fr-FR')}</p>
  </div>
  <div>
    <p class="label" style="margin-bottom:30pt">Signature:</p>
    <div class="signature-line"></div>
    <p style="font-size:9pt;color:#666;margin-top:4pt">Signature et cachet ANACIM</p>
  </div>
</div>

<footer>ANACIM — Document officiel — ${evt.reference} — Dakar, Sénégal</footer>
</body></html>`
  }, [evt, aerodromeNom, ecartLie, inspecteur])

  const handlePrint = () => {
    const html = genererRapportHTML()
    const win = window.open('', '_blank')
    if (!win) { alert('Veuillez autoriser les popups pour l\'impression.'); return }
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  const handleDownload = async () => {
    setIsExporting(true)
    try {
      const html = genererRapportHTML()
      const result = await generatePDFFromHTMLString(html)
      if (result.success && result.blob) {
        const url = URL.createObjectURL(result.blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `rapport-${evt.reference}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('[EvenementRapport] Échec export PDF:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary">
      <div className="modal-header border-b border-border bg-role-primary-soft">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="modal-title text-base">Rapport d'événement</div>
            <div className="text-xs text-muted-foreground">{evt.reference} — {evt.type}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="btn btn-secondary btn-sm gap-1">
            <Printer className="w-3.5 h-3.5" />Imprimer
          </button>
          <button onClick={handleDownload} disabled={isExporting} className="btn btn-primary btn-sm gap-1">
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {isExporting ? 'Génération...' : 'Télécharger'}
          </button>
          {onClose && <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="modal-body p-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-role-primary flex items-center justify-center text-white font-bold text-xl">AN</div>
            <div>
              <p className="text-small font-medium text-muted-foreground">REPUBLIQUE DU SÉNÉGAL</p>
              <p className="text-base font-semibold text-foreground">Agence Nationale de l'Aviation Civile et de la Météorologie</p>
              <p className="text-xs text-muted-foreground">ANACIM</p>
            </div>
          </div>
          <div className="border-2 border-role-primary py-3 px-6 inline-block rounded-xl">
            <p className="text-lg font-bold tracking-wide text-role-primary">RAPPORT D'ÉVÉNEMENT DE SÉCURITÉ</p>
            <p className="text-small font-medium mt-1">Référence: {evt.reference}</p>
            <p className="text-small text-muted-foreground">Date: {evt.date} à {evt.heure}</p>
          </div>
        </div>

        <div className="border-t border-border my-6" />

        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">1. Identification de l'événement</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-small">
            <div><span className="font-medium text-muted-foreground">Type d'événement:</span> {evt.type}</div>
            <div><span className="font-medium text-muted-foreground">Niveau de gravité:</span> <strong>{GRAVITE_LABELS[evt.gravite] || evt.gravite}</strong></div>
            <div><span className="font-medium text-muted-foreground">Aérodrome:</span> {aerodromeNom}</div>
            <div><span className="font-medium text-muted-foreground">Date et heure:</span> {evt.date} à {evt.heure} UTC</div>
            <div className="col-span-2"><span className="font-medium text-muted-foreground">Localisation précise:</span> {evt.localisation}</div>
            <div><span className="font-medium text-muted-foreground">Référence rapport:</span> {evt.reference}</div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">2. Description des faits</h2>
          <p className="text-small leading-relaxed">{evt.description}</p>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">3. Parties impliquées</h2>
          {evt.aeronef && (
            <div className="mb-4">
              <p className="text-small font-medium mb-2 text-role-primary">Aéronef impliqué:</p>
              <div className="grid grid-cols-3 gap-4 text-small pl-4">
                <div><span className="text-muted-foreground">Immatriculation:</span> {evt.aeronef.immatriculation}</div>
                <div><span className="text-muted-foreground">Type:</span> {evt.aeronef.type}</div>
                <div><span className="text-muted-foreground">Exploitant:</span> {evt.aeronef.exploitant}</div>
              </div>
            </div>
          )}
          {evt.blesses && (
            <div className="mb-4">
              <p className="text-small font-medium mb-2 text-role-primary">Bilan humain:</p>
              <div className="grid grid-cols-4 gap-4 text-small pl-4">
                <div><span className="text-muted-foreground">Décès:</span> {evt.blesses.mortels}</div>
                <div><span className="text-muted-foreground">Graves:</span> {evt.blesses.graves}</div>
                <div><span className="text-muted-foreground">Légers:</span> {evt.blesses.legers}</div>
                <div><span className="text-muted-foreground">Indemnes:</span> {evt.blesses.indemnes}</div>
              </div>
            </div>
          )}
          <div>
            <p className="text-small font-medium mb-2 text-role-primary">Services alertés:</p>
            <ul className="list-disc pl-8 text-small">{evt.services_alertes.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">4. Actions immédiates</h2>
          <p className="text-small leading-relaxed">{evt.actions_immediates}</p>
        </section>

        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">5. Analyse des causes</h2>
          {ecartLie ? (
            <div>
              <p className="text-small font-medium mb-2">Écart lié: <span className="font-mono">{ecartLie.reference}</span></p>
              <p className="text-small leading-relaxed">{ecartLie.libelle}</p>
              {ecartLie.pac?.actions?.length ? (
                <div className="mt-3">
                  <p className="text-small font-medium mb-1">Actions correctives:</p>
                  <ul className="list-disc pl-6 text-small space-y-1">
                    {ecartLie.pac.actions.map((action: any, idx: number) => (
                      <li key={idx}>{action.description} — Resp: {action.responsable}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-small leading-relaxed text-muted-foreground italic">Analyse en cours — rapport d'investigation à joindre après clôture de l'enquête.</p>
          )}
        </section>

        <section className="mb-6">
          <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">6. Recommandations</h2>
          {ecartLie?.pac?.observations ? <p className="text-small leading-relaxed">{ecartLie.pac.observations}</p>
            : <p className="text-small leading-relaxed text-muted-foreground italic">Recommandations en cours d'élaboration.</p>}
        </section>

        <section className="mb-8">
          <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-4 text-role-primary">7. Signature de l'inspecteur responsable</h2>
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-small font-medium text-muted-foreground">Nom:</p>
              <p className="text-small mt-1">{inspecteur ? `${inspecteur.prenom} ${inspecteur.nom}` : 'Inspecteur non assigné'}</p>
              <p className="text-small font-medium mt-3 text-muted-foreground">Qualité:</p>
              <p className="text-small mt-1">Inspecteur — ANACIM</p>
              <p className="text-small font-medium mt-3 text-muted-foreground">Date:</p>
              <p className="text-small mt-1">{new Date().toLocaleDateString('fr-FR')}</p>
            </div>
            <div>
              <p className="text-small font-medium mb-8 text-muted-foreground">Signature:</p>
              <div className="border-b border-border w-48 mt-12" />
              <p className="text-xs text-muted-foreground mt-1">Signature et cachet ANACIM</p>
            </div>
          </div>
        </section>

        <div className="border-t border-border" />
        <footer className="mt-4 text-center text-xs text-muted-foreground">ANACIM — Document officiel — {evt.reference} — Dakar, Sénégal</footer>
      </div>
    </div>
  )
}

export { EvenementRapport }
export default EvenementRapport