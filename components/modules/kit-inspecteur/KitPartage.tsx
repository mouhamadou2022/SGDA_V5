// components/modules/kit-inspecteur/KitPartage.tsx
'use client'

import { useMemo, useState } from 'react'
import { Share2, X, Download } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/lib/store'

interface DocPartageRecu {
  id: string
  titre: string
  partage_par: string
  date: string
  aerodrome_cible: string
}

interface DocPartageEmis {
  id: string
  document_id: string
  aerodrome_id: string
  titre: string
  destinataire: string
  date: string
  aerodrome: string
  revoque: boolean
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

interface KitPartageProps {
  userRole: string
}

function KitPartage({ userRole }: KitPartageProps) {
  const aerodromes = useAppStore(s => s.aerodromes)
  const kitDocuments = useAppStore(s => s.kitDocuments)
  const messages = useAppStore(s => s.messages)
  const partagerKitDocumentExploitant = useAppStore(s => s.partagerKitDocumentExploitant)
  const revoquerPartageKitDocument = useAppStore(s => s.revoquerPartageKitDocument)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState('')
  const [selectedAerodrome, setSelectedAerodrome] = useState('')
  const [message, setMessage] = useState('')

  const docsEmis = useMemo<DocPartageEmis[]>(() => {
    return kitDocuments.flatMap(doc =>
      (doc.partage_exploitant || []).map(partage => {
        const aerodrome = aerodromes.find(a => a.id === partage.aerodrome_id)
        return {
          id: partage.id,
          document_id: doc.id,
          aerodrome_id: partage.aerodrome_id,
          titre: doc.nom,
          destinataire: aerodrome?.exploitant_nom || 'Exploitant',
          date: partage.partage_le,
          aerodrome: aerodrome ? `${aerodrome.code_oaci} - ${aerodrome.nom}` : partage.aerodrome_id,
          revoque: !partage.actif,
        }
      })
    ).sort((a, b) => new Date(b.date || '-').getTime() - new Date(a.date || '-').getTime())
  }, [aerodromes, kitDocuments])

  const docsRecus = useMemo<DocPartageRecu[]>(() => {
    return messages
      .filter(msg => msg.canal === 'exploitant' && msg.attachments?.length)
      .flatMap(msg => (msg.attachments || []).map((att, index) => ({
        id: `${msg.id}-${index}`,
        titre: att.nom,
        partage_par: msg.from_nom,
        date: msg.created_at,
        aerodrome_cible: aerodromes.find(a => a.id === msg.aerodrome_id)?.code_oaci || msg.aerodrome_id || '',
      })))
      .sort((a, b) => new Date(b.date || '-').getTime() - new Date(a.date || '-').getTime())
  }, [aerodromes, messages])

  const handlePartager = () => {
    if (!selectedDoc || !selectedAerodrome) return
    partagerKitDocumentExploitant(selectedDoc, selectedAerodrome, message)
    setDialogOpen(false)
    setSelectedDoc('')
    setSelectedAerodrome('')
    setMessage('')
  }

  const handleRevoquer = (doc: DocPartageEmis) => {
    revoquerPartageKitDocument(doc.document_id, doc.aerodrome_id)
  }

  const ShareDialog = () => {
    if (!dialogOpen) return null
    return createPortal(
      <div className="modal-overlay" data-role={userRole} onClick={() => setDialogOpen(false)}>
        <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <div className="modal-title flex items-center gap-2">
                <Share2 className="w-5 h-5 text-role-primary" />
                Partager un document
              </div>
              <button className="modal-close" onClick={() => setDialogOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <div className="form-field">
                <label className="text-role-primary text-xs uppercase font-semibold">Document</label>
                <select
                  value={selectedDoc}
                  onChange={e => setSelectedDoc(e.target.value)}
                  className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl appearance-none ${focusClass}`}
                  style={selectStyle}
                >
                  <option value="">Sélectionner un document…</option>
                  {kitDocuments.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="text-role-primary text-xs uppercase font-semibold">Aérodrome cible</label>
                <select
                  value={selectedAerodrome}
                  onChange={e => setSelectedAerodrome(e.target.value)}
                  className={`form-select w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl appearance-none ${focusClass}`}
                  style={selectStyle}
                >
                  <option value="">Sélectionner un aérodrome…</option>
                  {aerodromes.map(a => <option key={a.id} value={a.id}>{a.code_oaci} — {a.nom}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="text-role-primary text-xs uppercase font-semibold">Message (optionnel)</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                  rows={3}
                  placeholder="Message d'accompagnement…"
                />
              </div>
            </div>
            <div className="modal-footer border-t border-border p-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setDialogOpen(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={handlePartager} disabled={!selectedDoc || !selectedAerodrome}>
                Partager
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole}>
      <div className="flex items-center justify-between">
        <h2 className="heading-4 text-role-primary">Partage de documents</h2>
        <button onClick={() => setDialogOpen(true)} className="btn btn-primary gap-2">
          <Share2 className="w-4 h-4" />
          Partager un document
        </button>
      </div>

      {/* Documents reçus */}
      <section className="space-y-3">
        <h3 className="font-medium text-muted-foreground">Documents reçus</h3>
        <div className="space-y-3">
          {docsRecus.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucun document reçu</p>
          ) : (
            docsRecus.map(doc => (
            <div key={doc.id} className="card p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-medium text-foreground">{doc.titre}</p>
                <p className="text-small text-muted-foreground mt-0.5">
                  Partagé par <span className="font-medium text-role-primary">{doc.partage_par}</span> — {doc.date} — Aérodrome:{' '}
                  <span className="badge outline">{doc.aerodrome_cible}</span>
                </p>
              </div>
              <button className="btn btn-secondary btn-sm gap-1">
                <Download className="w-3 h-3" />
                Télécharger
              </button>
            </div>
            ))
          )}
        </div>
      </section>

      {/* Historique des partages émis */}
      <section className="space-y-3">
        <h3 className="font-medium text-muted-foreground">Historique des partages effectués</h3>
        <div className="table-container overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 pr-4">Document</th>
                <th className="pb-2 pr-4">Destinataire</th>
                <th className="pb-2 pr-4">Aérodrome</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {docsEmis.map(d => (
                <tr key={d.id} className="border-b border-border">
                  <td className="py-2 pr-4 font-medium text-foreground">{d.titre}</td>
                  <td className="py-2 pr-4 text-foreground">{d.destinataire}</td>
                  <td className="py-2 pr-4"><span className="badge outline">{d.aerodrome}</span></td>
                  <td className="py-2 pr-4 text-foreground">{d.date}</td>
                  <td className="py-2 pr-4">
                    {d.revoque ? (
                      <span className="badge danger">Révoqué</span>
                    ) : (
                      <span className="badge success">Actif</span>
                    )}
                  </td>
                  <td className="py-2">
                    {!d.revoque && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleRevoquer(d)}>
                        Révoquer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ShareDialog />
    </div>
  )
}

export { KitPartage }
export default KitPartage
