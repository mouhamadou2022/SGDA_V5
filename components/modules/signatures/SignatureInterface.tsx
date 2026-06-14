'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { SignaturePadWithColor } from './SignaturePadWithColor'

interface DocSignature {
  id: string
  titre: string
  type: 'Checklist' | 'Rapport' | 'Lettre' | 'PAC'
  aerodrome: string
  datedemande: string
  urgent: boolean
  statut: 'en_attente' | 'signe' | 'refuse'
  raisonRefus?: string
}

const DOCS_INITIAUX: DocSignature[] = [
  { id: 'doc-1', titre: 'Checklist Surveillance AIBD Avril 2026', type: 'Checklist', aerodrome: 'AIBD Dakar', datedemande: '2026-04-24', urgent: true, statut: 'en_attente' },
  { id: 'doc-2', titre: 'Rapport Inspection Ziguinchor', type: 'Rapport', aerodrome: 'Ziguinchor', datedemande: '2026-04-23', urgent: true, statut: 'en_attente' },
  { id: 'doc-3', titre: 'Lettre de Transmission Kaolack', type: 'Lettre', aerodrome: 'Kaolack', datedemande: '2026-04-20', urgent: false, statut: 'en_attente' },
  { id: 'doc-4', titre: 'PAC Écarts Saint-Louis Q1 2026', type: 'PAC', aerodrome: 'Saint-Louis', datedemande: '2026-04-18', urgent: false, statut: 'en_attente' },
]

const TYPE_COLORS: Record<DocSignature['type'], string> = {
  Checklist: 'bg-blue-100 text-blue-700',
  Rapport: 'bg-green-100 text-green-700',
  Lettre: 'bg-orange-100 text-orange-700',
  PAC: 'bg-purple-100 text-purple-700',
}

function isUrgent(datedemande: string): boolean {
  const d = new Date(datedemande)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60)
  return diff < 48
}

interface Props {
  userId: string
  userRole: string
}

export function SignatureInterface({ userId, userRole }: Props) {
  const [docs, setDocs] = useState<DocSignature[]>(DOCS_INITIAUX)
  const [signerDoc, setSignerDoc] = useState<DocSignature | null>(null)
  const [refuserDoc, setRefuserDoc] = useState<DocSignature | null>(null)
  const [raisonRefus, setRaisonRefus] = useState('')
  const [signatureData, setSignatureData] = useState('')
  const [showSignes, setShowSignes] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const enAttente = docs.filter(d => d.statut === 'en_attente')
  const signes = docs.filter(d => d.statut === 'signe' || d.statut === 'refuse')

  const confirmerSignature = () => {
    if (!signerDoc) return
    setDocs(prev => prev.map(d => d.id === signerDoc.id ? { ...d, statut: 'signe' } : d))
    setSignerDoc(null)
    setSignatureData('')
  }

  const confirmerRefus = () => {
    if (!refuserDoc || !raisonRefus) return
    setDocs(prev => prev.map(d => d.id === refuserDoc.id ? { ...d, statut: 'refuse', raisonRefus } : d))
    setRefuserDoc(null)
    setRaisonRefus('')
  }

  return (
    <>
      <div className="space-y-6">
        {/* Documents en attente */}
        <div className="space-y-3">
          <p className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Documents en attente ({enAttente.length})
          </p>
          {enAttente.length === 0 && (
            <Card className="text-center">
              Aucun document en attente de signature
            </Card>
          )}
          {enAttente.map(doc => (
            <Card key={doc.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{doc.titre}</span>
                    {doc.urgent && (
                      <span className="badge danger text-xs">Urgent</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[doc.type]}`}>
                      {doc.type}
                    </span>
                    <span className="text-xs text-muted-foreground">{doc.aerodrome}</span>
                    <span className="text-xs text-muted-foreground">Demandé le {doc.datedemande}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="btn btn-primary btn-sm" onClick={() => setSignerDoc(doc)}>Signer</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setRefuserDoc(doc)}>Refuser</button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Documents signés — accordion natif */}
        {signes.length > 0 && (
          <div className="border rounded-lg px-4">
            <button
              className="w-full flex items-center justify-between py-3 text-left"
              onClick={() => setShowSignes(!showSignes)}
            >
              <span className="flex items-center gap-2">
                <span className="font-semibold">Documents traités</span>
                <span className="badge neutral">{signes.length}</span>
              </span>
              <span className="text-muted-foreground text-xs">{showSignes ? '▲' : '▼'}</span>
            </button>
            {showSignes && (
              <div className="space-y-2 pb-2">
                {signes.map(doc => (
                  <div key={doc.id} className="flex items-center justify-between text-sm py-1">
                    <span className="truncate">{doc.titre}</span>
                    <span className={`badge ml-2 ${doc.statut === 'signe' ? 'primary' : 'danger'}`}>
                      {doc.statut === 'signe' ? 'Signé' : 'Refusé'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialog Signature */}
      {mounted && !!signerDoc && createPortal(
        <div className="modal-overlay" onClick={() => setSignerDoc(null)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden bg-background">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent border-b border-border">
                <div className="modal-title">Signer le document</div>
                <button className="modal-close" onClick={() => setSignerDoc(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="modal-body space-y-4">
                <p className="text-sm font-medium">{signerDoc.titre}</p>
                <SignaturePadWithColor onSave={setSignatureData} onCancel={() => setSignerDoc(null)} />
              </div>
              <div className="modal-footer border-t border-border">
                <button className="btn btn-secondary" onClick={() => setSignerDoc(null)}>Annuler</button>
                <button className="btn btn-primary" onClick={confirmerSignature}>Confirmer la signature</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Dialog Refus */}
      {mounted && !!refuserDoc && createPortal(
        <div className="modal-overlay" onClick={() => setRefuserDoc(null)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden bg-background">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent border-b border-border">
                <div className="modal-title">Refuser le document</div>
                <button className="modal-close" onClick={() => setRefuserDoc(null)}><X className="w-4 h-4" /></button>
              </div>
              <div className="modal-body space-y-4">
                <p className="text-sm font-medium">{refuserDoc.titre}</p>
                <div className="space-y-1">
                  <label className="text-role-primary text-xs uppercase font-semibold">Motif du refus</label>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    placeholder="Expliquez la raison du refus..."
                    value={raisonRefus}
                    onChange={e => setRaisonRefus(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer border-t border-border">
                <button className="btn btn-secondary" onClick={() => setRefuserDoc(null)}>Annuler</button>
                <button
                  className="btn btn-danger"
                  onClick={confirmerRefus}
                  disabled={!raisonRefus}
                >
                  Confirmer le refus
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

export default SignatureInterface
