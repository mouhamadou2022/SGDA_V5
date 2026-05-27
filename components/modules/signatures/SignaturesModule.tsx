// components/modules/signatures/SignaturesModule.tsx
// Module Signatures DG ANACIM — signature des rapports et lettres de surveillance.
// ✅ R1 : 0 style inline
// ✅ R3 : Données via useAppStore uniquement
'use client'

import { useMemo, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  PenLine,
  FileText,
  CheckCircle2,
  Clock,
  Eye,
  Shield,
  Plane,
  Calendar,
  User,
  AlertCircle,
  X,
  Info,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { SignatureSection } from './SignatureSection'

interface SignaturesModuleProps {
  userRole: string
  userId: string
}

type DocumentType = 'rapport' | 'lettre'

interface DocumentASignerItem {
  id: string
  type: DocumentType
  surveillanceId: string
  aerodromeName: string
  aerodromeCode: string
  dateDebut: string
  inspecteurNom: string
  statut: string
  htmlContent?: string
}

export default function SignaturesModule({ userRole, userId }: SignaturesModuleProps) {
  const surveillances = useAppStore(s => s.surveillances);
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const [selectedDoc, setSelectedDoc] = useState<DocumentASignerItem | null>(null)
  const [tab, setTab] = useState<'pending' | 'signed'>('pending')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const getAerodrome = (id: string) => aerodromes.find((a) => a.id === id)
  const getUser = (id: string) => utilisateurs.find((u) => u.id === id)

  const rapportsASigner = useMemo<DocumentASignerItem[]>(() => {
    return surveillances
      .filter((s) => s.statut === 'rapport_signe')
      .map((s) => {
        const aero = getAerodrome(s.aerodrome_id)
        const chef = getUser(s.chef_id)
        return {
          id: `rapport-${s.id}`,
          type: 'rapport' as DocumentType,
          surveillanceId: s.id,
          aerodromeName: aero?.nom ?? '—',
          aerodromeCode: aero?.code_oaci ?? '—',
          dateDebut: s.date_debut,
          inspecteurNom: chef ? `${chef.prenom} ${chef.nom}` : '—',
          statut: s.statut,
          htmlContent: s.rapport_html,
        }
      })
  }, [surveillances, aerodromes, utilisateurs])

  const lettresASigner = useMemo<DocumentASignerItem[]>(() => {
    return surveillances
      .filter((s) => s.statut === 'ecarts_signes')
      .map((s) => {
        const aero = getAerodrome(s.aerodrome_id)
        const chef = getUser(s.chef_id)
        return {
          id: `lettre-${s.id}`,
          type: 'lettre' as DocumentType,
          surveillanceId: s.id,
          aerodromeName: aero?.nom ?? '—',
          aerodromeCode: aero?.code_oaci ?? '—',
          dateDebut: s.date_debut,
          inspecteurNom: chef ? `${chef.prenom} ${chef.nom}` : '—',
          statut: s.statut,
          htmlContent: s.lettre_html,
        }
      })
  }, [surveillances, aerodromes, utilisateurs])

  const documentsSigmes = useMemo<DocumentASignerItem[]>(() => {
    return surveillances
      .filter((s) => ['lettre_signee', 'transmise', 'archivee'].includes(s.statut))
      .flatMap((s) => {
        const aero = getAerodrome(s.aerodrome_id)
        const chef = getUser(s.chef_id)
        const base = {
          aerodromeName: aero?.nom ?? '—',
          aerodromeCode: aero?.code_oaci ?? '—',
          dateDebut: s.date_debut,
          inspecteurNom: chef ? `${chef.prenom} ${chef.nom}` : '—',
          statut: s.statut,
          surveillanceId: s.id,
        }
        return [
          { ...base, id: `rapport-done-${s.id}`, type: 'rapport' as DocumentType, htmlContent: s.rapport_html },
          { ...base, id: `lettre-done-${s.id}`, type: 'lettre' as DocumentType, htmlContent: s.lettre_html },
        ]
      })
  }, [surveillances, aerodromes, utilisateurs])

  const pendingItems = [...rapportsASigner, ...lettresASigner]
  const pendingCount = pendingItems.length

  const handleSign = (sigUrl: string) => {
    if (!selectedDoc) return
    const s = surveillances.find((sv) => sv.id === selectedDoc.surveillanceId)
    if (!s) return

    if (selectedDoc.type === 'rapport') {
      updateSurveillance(s.id, {
        rapport_sig_url: sigUrl,
        rapport_signe_par: userId,
        rapport_signe_le: new Date().toISOString(),
        statut: 'ecarts_signes',
      })
    } else {
      updateSurveillance(s.id, {
        lettre_signee_url: sigUrl,
        statut: 'lettre_signee',
      })
    }
    setSelectedDoc(null)
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <ModuleHeader
        icon={<PenLine className="w-6 h-6 text-indigo-600" />}
        title="Signatures DG"
        description="Documents en attente de votre signature — Directeur Général ANACIM"
        actions={pendingCount > 0 && (
          <span className="badge danger text-sm px-3 py-1">
            {pendingCount} en attente
          </span>
        )}
      />

      {/* Note : Signature électronique à venir */}
      <div className="alert alert-info">
        <Info className="alert-icon" />
        <div className="alert-content">
          <strong>Signature électronique avancée</strong> — La signature numérique avec certificat électronique qualifié (conforme eIDAS) sera disponible dans une prochaine version du système. En attendant, les lettres de transmission sont chargées au format PDF après signature physique.
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card border-orange-200 bg-orange-50">
          <div className="card-content pt-4 flex items-center gap-3">
            <Clock className="w-8 h-8 text-orange-500" />
            <div>
              <p className="text-xs text-orange-600 font-medium uppercase tracking-wide">Rapports à signer</p>
              <p className="text-2xl font-bold text-orange-700">{rapportsASigner.length}</p>
            </div>
          </div>
        </div>
        <div className="card border-blue-200 bg-blue-50">
          <div className="card-content pt-4 flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Lettres à signer</p>
              <p className="text-2xl font-bold text-blue-700">{lettresASigner.length}</p>
            </div>
          </div>
        </div>
        <div className="card border-green-200 bg-green-50">
          <div className="card-content pt-4 flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Documents signés</p>
              <p className="text-2xl font-bold text-green-700">{documentsSigmes.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="tabs">
        <button
          className={`tab ${tab === 'pending' ? 'active' : ''}`}
          onClick={() => setTab('pending')}
        >
          En attente
          {pendingCount > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          className={`tab ${tab === 'signed' ? 'active' : ''}`}
          onClick={() => setTab('signed')}
        >
          Signés ({documentsSigmes.length})
        </button>
      </div>

      <div className="tab-content">
        {/* Documents en attente */}
        {tab === 'pending' && (
          <div className="animate-fade-in space-y-3">
            {pendingItems.length === 0 ? (
              <div className="card">
                <div className="card-content py-12 text-center text-gray-400">
                  <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Aucun document en attente</p>
                  <p className="text-sm mt-1">Tous les documents ont été traités.</p>
                </div>
              </div>
            ) : (
              pendingItems.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} onSign={() => setSelectedDoc(doc)} />
              ))
            )}
          </div>
        )}

        {/* Documents déjà signés */}
        {tab === 'signed' && (
          <div className="animate-fade-in space-y-3">
            {documentsSigmes.length === 0 ? (
              <div className="card">
                <div className="card-content py-12 text-center text-gray-400">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Aucun document signé pour le moment.</p>
                </div>
              </div>
            ) : (
              documentsSigmes.map((doc) => (
                <DocumentCard key={doc.id} doc={doc} signed />
              ))
            )}
          </div>
        )}
      </div>

      {/* Modal de signature */}
      {mounted && !!selectedDoc && createPortal(
        <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div className="modal-content max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden bg-background">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent border-b border-border">
                <div className="modal-title flex items-center gap-2">
                  <PenLine className="w-5 h-5 text-indigo-600" />
                  Signer {selectedDoc?.type === 'rapport' ? 'le Rapport' : 'la Lettre'} —{' '}
                  {selectedDoc?.aerodromeCode}
                </div>
                <button className="modal-close" onClick={() => setSelectedDoc(null)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="modal-body">
                {selectedDoc?.htmlContent && (
                  <iframe
                    srcDoc={selectedDoc.htmlContent}
                    sandbox="allow-same-origin"
                    className="w-full h-64 border rounded-lg bg-gray-50"
                    title="Aperçu du document"
                  />
                )}

                {!selectedDoc?.htmlContent && (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    Le contenu du document n'est pas encore généré.
                  </div>
                )}

                <SignatureSection
                  documentType={selectedDoc?.type === 'rapport' ? 'lettre' : 'lettre'}
                  documentId={selectedDoc?.surveillanceId || ''}
                  signataireNom="Directeur Général ANACIM"
                  onSigned={handleSign}
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Carte document ────────────────────────────────────────────
function DocumentCard({
  doc,
  onSign,
  signed = false,
}: {
  doc: DocumentASignerItem
  onSign?: () => void
  signed?: boolean
}) {
  return (
    <div className={`card border ${signed ? 'border-green-200 bg-green-50/30' : 'border-orange-200 hover:border-orange-300 transition-colors'}`}>
      <div className="card-content pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${signed ? 'bg-green-100' : 'bg-orange-100'}`}>
              {doc.type === 'rapport'
                ? <FileText className={`w-5 h-5 ${signed ? 'text-green-600' : 'text-orange-600'}`} />
                : <PenLine className={`w-5 h-5 ${signed ? 'text-green-600' : 'text-orange-600'}`} />
              }
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                {doc.type === 'rapport' ? 'Rapport de surveillance' : 'Lettre de surveillance'}
              </p>
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Plane className="w-3 h-3" />
                  {doc.aerodromeCode} — {doc.aerodromeName}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(doc.dateDebut).toLocaleDateString('fr-FR')}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {doc.inspecteurNom}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {signed ? (
              <span className="badge success text-xs flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Signé
              </span>
            ) : (
              <button className="btn btn-primary btn-sm gap-1.5" onClick={onSign}>
                <PenLine className="w-3.5 h-3.5" />
                Signer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
