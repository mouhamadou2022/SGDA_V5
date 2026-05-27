'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

interface EntreeHistorique {
  id: string
  document: string
  type: 'Checklist' | 'Rapport' | 'Lettre' | 'PAC'
  date_signature: string
  signataire: string
  resultat: 'Signé' | 'Refusé'
  mois: string
}

const HISTORIQUE: EntreeHistorique[] = [
  { id: 'h-1', document: 'Checklist Surveillance AIBD Mars 2026', type: 'Checklist', date_signature: '2026-03-28', signataire: 'Moussa Diallo', resultat: 'Signé', mois: '3' },
  { id: 'h-2', document: 'Rapport Inspection Saint-Louis', type: 'Rapport', date_signature: '2026-03-25', signataire: 'Fatou Ndiaye', resultat: 'Signé', mois: '3' },
  { id: 'h-3', document: 'PAC Écarts Kaolack Q4 2025', type: 'PAC', date_signature: '2026-03-20', signataire: 'Ibrahima Sow', resultat: 'Refusé', mois: '3' },
  { id: 'h-4', document: 'Lettre Transmission Ziguinchor', type: 'Lettre', date_signature: '2026-03-18', signataire: 'Aminata Balde', resultat: 'Signé', mois: '3' },
  { id: 'h-5', document: 'Checklist Certification Tambacounda', type: 'Checklist', date_signature: '2026-02-28', signataire: 'Oumar Thiam', resultat: 'Signé', mois: '2' },
  { id: 'h-6', document: 'Rapport Audit Cap Skirring', type: 'Rapport', date_signature: '2026-02-22', signataire: 'Khady Diouf', resultat: 'Signé', mois: '2' },
  { id: 'h-7', document: 'PAC Homologation Matam', type: 'PAC', date_signature: '2026-02-15', signataire: 'Mamadou Cissé', resultat: 'Refusé', mois: '2' },
  { id: 'h-8', document: 'Lettre Conformité Thiès', type: 'Lettre', date_signature: '2026-02-10', signataire: 'Rokhaya Fall', resultat: 'Signé', mois: '2' },
  { id: 'h-9', document: 'Checklist Surveillance Kolda', type: 'Checklist', date_signature: '2026-01-30', signataire: 'Birame Gueye', resultat: 'Signé', mois: '1' },
  { id: 'h-10', document: 'Rapport Inspection Linguère', type: 'Rapport', date_signature: '2026-01-25', signataire: 'Aissatou Dieng', resultat: 'Signé', mois: '1' },
  { id: 'h-11', document: 'PAC Écarts Kédougou', type: 'PAC', date_signature: '2026-01-18', signataire: 'Lamine Ba', resultat: 'Signé', mois: '1' },
  { id: 'h-12', document: 'Lettre Transmission Bakel', type: 'Lettre', date_signature: '2026-01-12', signataire: 'Ndéye Sarr', resultat: 'Signé', mois: '1' },
  { id: 'h-13', document: 'Checklist Suivi Écarts Sédhiou', type: 'Checklist', date_signature: '2025-12-20', signataire: 'Seydou Kouyaté', resultat: 'Refusé', mois: '12' },
  { id: 'h-14', document: 'Rapport Certification Vélingara', type: 'Rapport', date_signature: '2025-12-15', signataire: 'Penda Mbaye', resultat: 'Signé', mois: '12' },
  { id: 'h-15', document: 'PAC Conformité Kaffrine', type: 'PAC', date_signature: '2025-12-08', signataire: 'Ibou Diallo', resultat: 'Signé', mois: '12' },
]

const MOIS_LABELS: Record<string, string> = {
  '1': 'Janvier', '2': 'Février', '3': 'Mars', '4': 'Avril',
  '5': 'Mai', '6': 'Juin', '7': 'Juillet', '8': 'Août',
  '9': 'Septembre', '10': 'Octobre', '11': 'Novembre', '12': 'Décembre',
}

interface Props {
  userId: string
}

export function SignatureHistory({ userId }: Props) {
  const [filtreType, setFiltreType] = useState('tous')
  const [filtreMois, setFiltreMois] = useState('tous')

  const donnees = HISTORIQUE.filter(h => {
    const typeOk = filtreType === 'tous' || h.type === filtreType
    const moisOk = filtreMois === 'tous' || h.mois === filtreMois
    return typeOk && moisOk
  })

  const exportCSV = () => {
    const header = 'Document,Type,Date,Signataire,Résultat'
    const rows = donnees.map(h =>
      `"${h.document}","${h.type}","${h.date_signature}","${h.signataire}","${h.resultat}"`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'historique_signatures_anacim.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="filter-label">Type</span>
          <select
            value={filtreType}
            onChange={(e) => setFiltreType(e.target.value)}
            className={`form-select w-36 ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous</option>
            <option value="Checklist">Checklist</option>
            <option value="Rapport">Rapport</option>
            <option value="Lettre">Lettre</option>
            <option value="PAC">PAC</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="filter-label">Mois</span>
          <select
            value={filtreMois}
            onChange={(e) => setFiltreMois(e.target.value)}
            className={`form-select w-36 ${focusClass}`}
            style={selectStyle}
          >
            <option value="tous">Tous</option>
            {Object.entries(MOIS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <button type="button" onClick={exportCSV} className="btn btn-secondary gap-2 ml-auto">
          <Download className="h-4 w-4" />
          Export CSV ({donnees.length})
        </button>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th className="text-left">Document</th>
              <th className="text-center">Type</th>
              <th className="text-center whitespace-nowrap">Date signature</th>
              <th className="text-left">Signataire</th>
              <th className="text-center">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {donnees.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-6">
                  Aucun résultat pour ces filtres
                </td>
              </tr>
            )}
            {donnees.map(h => (
              <tr key={h.id}>
                <td className="text-small">{h.document}</td>
                <td className="text-center">
                  <span className="badge outline text-xs">{h.type}</span>
                </td>
                <td className="text-center text-xs">{h.date_signature}</td>
                <td>{h.signataire}</td>
                <td className="text-center">
                  <span className={`badge ${h.resultat === 'Signé' ? 'success' : 'danger'} text-xs`}>
                    {h.resultat}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default SignatureHistory
