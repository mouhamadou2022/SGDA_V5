// components/modules/dossiers/OcrExtraction.tsx
'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, Copy, CheckCircle2, Loader2, Scan, FileUp } from 'lucide-react'

const TEXTE_SIMULE = `RAPPORT D'INSPECTION AERODROME — ANACIM
Date: 25/04/2026
Aérodrome: Léopold Sédar Senghor International (GOOY)

SECTION 1 — ÉTAT DE LA PISTE
Longueur piste 01/19: 3500m / Largeur: 60m
Revêtement: Bitumineux — PCR 85/F/B/W/T
Remarques: Légères fissures transversales à 800m du seuil 01.

SECTION 2 — SSLIA
Catégorie SSLIA: 9 — Équipements conformes RAS 14 Partie 9
Véhicules: 3 VPI opérationnels / 1 en maintenance préventive
Stock agent extincteur: 95% — Conforme.

SECTION 3 — BALISAGE
Balisage piste: 92% des feux opérationnels.
Défaut signalé: 3 feux de bord piste 01 côté gauche hors service.

SECTION 4 — CONCLUSION
Score de conformité global: 87/100
Niveau de risque: FAIBLE
Recommandation: Réparation des feux de balisage sous 15 jours.

Signé: Inspecteur Chef de Mission
Moussa Diallo — ANACIM/DSA`

interface OcrExtractionProps {
  onExtract: (texte: string) => void
  userRole?: string
}

export function OcrExtraction({ onExtract, userRole = 'inspector' }: OcrExtractionProps) {
  const [dragging, setDragging] = useState(false)
  const [fichier, setFichier] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [texte, setTexte] = useState('')
  const [copie, setCopie] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f) setFichier(f.name)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFichier(f.name)
  }

  const extraire = () => {
    if (!fichier) return
    setLoading(true)
    setTimeout(() => {
      setTexte(TEXTE_SIMULE)
      setLoading(false)
    }, 2000)
  }

  const copier = async () => {
    if (!texte) return
    await navigator.clipboard.writeText(texte)
    setCopie(true)
    setTimeout(() => setCopie(false), 2000)
  }

  return (
    <div className="space-y-5" data-role={userRole}>
      {/* Zone d'upload */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-200 ${
          dragging 
            ? 'border-role-primary bg-role-primary-soft shadow-role-glow' 
            : 'border-border bg-background hover:border-role-primary-light hover:bg-role-primary-soft/50'
        }`}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="p-4 rounded-full bg-role-primary-soft">
          <FileUp className="w-8 h-8 text-role-primary" />
        </div>
        <div className="text-center">
          <p className="text-body font-medium">
            {fichier ? (
              <span className="text-role-primary">{fichier}</span>
            ) : (
              <>Glissez un fichier ici ou <span className="text-role-primary underline">parcourez</span></>
            )}
          </p>
          <p className="text-small text-muted-foreground mt-1">
            PDF, PNG, JPG, TIFF acceptés (max 10 Mo)
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.tiff"
          onChange={onFileChange}
          onClick={e => e.stopPropagation()}
        />
      </div>

      {/* Bouton extraction */}
      <button 
        onClick={extraire} 
        disabled={!fichier || loading} 
        className="btn btn-primary w-full gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Extraction en cours...
          </>
        ) : (
          <>
            <Scan className="w-4 h-4" />
            Extraire le texte par OCR
          </>
        )}
      </button>

      {/* Résultat */}
      {texte && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <label className="text-small font-semibold text-foreground">Texte extrait (éditable)</label>
            <button onClick={copier} className="btn btn-ghost btn-sm gap-1">
              {copie ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-success" />
                  Copié !
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copier
                </>
              )}
            </button>
          </div>
          <textarea
            rows={12}
            value={texte}
            onChange={e => setTexte(e.target.value)}
            className="form-textarea font-mono text-xs"
          />
          <div className="flex gap-3">
            <button onClick={copier} className="btn btn-secondary flex-1 gap-2">
              <Copy className="w-4 h-4" />
              Copier le texte
            </button>
            <button onClick={() => onExtract(texte)} className="btn btn-primary flex-1 gap-2">
              <FileText className="w-4 h-4" />
              Insérer dans le dossier
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-3 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Extraction OCR — Traitement IA ANACIM v5
        </p>
      </div>
    </div>
  )
}

export default OcrExtraction