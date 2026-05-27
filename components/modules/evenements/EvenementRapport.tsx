// components/modules/evenements/EvenementRapport.tsx
'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Download, Printer, FileText, AlertTriangle, MapPin, Calendar, Clock, Plane, Users, Phone, Mail, X, Loader2 } from 'lucide-react'
import { exportElementToPDF } from '@/lib/pdfGenerator'

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

function EvenementRapport({ evenementId, onClose }: EvenementRapportProps) {
  const [isExporting, setIsExporting] = useState(false)
  const evenements = useAppStore((s) => s.evenements)
  const ecarts = useAppStore((s) => s.ecarts)
  const utilisateurs = useAppStore((s) => s.utilisateurs)
  const evt = (evenements?.find((e) => e.id === evenementId) as typeof FALLBACK | undefined) ?? FALLBACK

  const ecartLie = ecarts?.find(e => e.evenement_id === evenementId)
  const inspecteur = evt.inspecteur_id ? utilisateurs?.find(u => u.id === evt.inspecteur_id) : null

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = async () => {
    setIsExporting(true)
    try {
      await exportElementToPDF('rapport-content', `rapport-${evt.reference}.pdf`)
    } catch (err) {
      console.error('[EvenementRapport] Échec export PDF:', err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary" id="rapport-content">

      {/* Header modal premium */}
      <div className="modal-header border-b border-border bg-role-primary-soft print:hidden">
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
            <Printer className="w-3.5 h-3.5" />
            Imprimer
          </button>
          <button onClick={handleDownload} disabled={isExporting} className="btn btn-primary btn-sm gap-1">
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {isExporting ? 'Génération...' : 'Télécharger'}
          </button>
          {onClose && (
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Contenu du rapport */}
      <div className="modal-body p-8 print:p-4">

      {/* En-tête officiel */}
      <header className="text-center mb-8 print:mb-6">
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-role-primary flex items-center justify-center text-white font-bold text-xl print:w-12 print:h-12">
            AN
          </div>
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
      </header>

      <div className="border-t border-border my-6" />

      {/* Section 1 */}
      <section className="mb-6">
        <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">
          1. Identification de l'événement
        </h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-small">
          <div>
            <span className="font-medium text-muted-foreground">Type d'événement:</span> {evt.type}
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Niveau de gravité:</span>{' '}
            <span className={`font-bold ${
              evt.gravite === 'CRITIQUE' ? 'text-danger' :
              evt.gravite === 'ORANGE' ? 'text-warning' : 'text-foreground'
            }`}>{evt.gravite}</span>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Aérodrome:</span> {evt.aerodrome_id}
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Date et heure:</span> {evt.date} à {evt.heure} UTC
          </div>
          <div className="col-span-2">
            <span className="font-medium text-muted-foreground">Localisation précise:</span> {evt.localisation}
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Référence rapport:</span> {evt.reference}
          </div>
        </div>
      </section>

      {/* Section 2 */}
      <section className="mb-6">
        <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">
          2. Description des faits
        </h2>
        <p className="text-small leading-relaxed">{evt.description}</p>
      </section>

      {/* Section 3 */}
      <section className="mb-6">
        <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">
          3. Parties impliquées
        </h2>
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
          <ul className="list-disc pl-8 text-small">
            {evt.services_alertes.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      </section>

      {/* Section 4 */}
      <section className="mb-6">
        <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">
          4. Actions immédiates
        </h2>
        <p className="text-small leading-relaxed">{evt.actions_immediates}</p>
      </section>

      {/* Section 5 */}
      <section className="mb-6">
        <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">
          5. Analyse des causes
        </h2>
        {ecartLie ? (
          <div>
            <p className="text-small font-medium mb-2">Écart lié: <span className="font-mono">{ecartLie.reference}</span></p>
            <p className="text-small leading-relaxed">{ecartLie.libelle}</p>
            {ecartLie.pac && ecartLie.pac.actions && ecartLie.pac.actions.length > 0 && (
              <div className="mt-3">
                <p className="text-small font-medium mb-1">Actions correctives:</p>
                <ul className="list-disc pl-6 text-small space-y-1">
                  {ecartLie.pac.actions.map((action: any, idx: number) => (
                    <li key={idx}>{action.description} — Resp: {action.responsable}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-small leading-relaxed text-muted-foreground italic">
            Analyse en cours — rapport d'investigation à joindre après clôture de l'enquête.
          </p>
        )}
      </section>

      {/* Section 6 */}
      <section className="mb-6">
        <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-3 text-role-primary">
          6. Recommandations
        </h2>
        {ecartLie?.pac?.observations ? (
          <p className="text-small leading-relaxed">{ecartLie.pac.observations}</p>
        ) : (
          <p className="text-small leading-relaxed text-muted-foreground italic">
            Recommandations en cours d'élaboration.
          </p>
        )}
      </section>

      {/* Section 7 */}
      <section className="mb-8">
        <h2 className="text-base font-bold uppercase tracking-wide border-b border-role-primary pb-1 mb-4 text-role-primary">
          7. Signature de l'inspecteur responsable
        </h2>
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
      <footer className="mt-4 text-center text-xs text-muted-foreground print:block">
        ANACIM — Document officiel — {evt.reference} — Dakar, Sénégal
      </footer>
      </div>
    </div>
  )
}

export { EvenementRapport }
export default EvenementRapport