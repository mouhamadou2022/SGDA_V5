// components/modules/audit/AuditExport.tsx
// ✅ Export de logs avec design system premium

'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, FileJson, Calendar, Users, Filter } from 'lucide-react'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

interface EntreeAudit {
  date: string
  module: string
  action: string
  utilisateur: string
  details: string
}

interface Props {
  entries: EntreeAudit[]
}

export function AuditExport({ entries }: Props) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv')
  const [dateDe, setDateDe] = useState('')
  const [dateA, setDateA] = useState('')

  const filtrees = entries.filter(e => {
    const d = new Date(e.date)
    const okDe = !dateDe || d >= new Date(dateDe)
    const okA = !dateA || d <= new Date(dateA)
    return okDe && okA
  })

  const apercu = filtrees.slice(0, 5)

  const telecharger = () => {
    if (format === 'csv') {
      const header = 'Date,Module,Action,Utilisateur,Détails'
      const rows = filtrees.map(e =>
        `"${e.date}","${e.module}","${e.action}","${e.utilisateur}","${e.details.replace(/"/g, '""')}"`
      )
      const content = [header, ...rows].join('\n')
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit_anacim_sgda_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } else {
      const content = JSON.stringify(filtrees, null, 2)
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit_anacim_sgda_${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="card-title flex items-center gap-2">
          <Download className="h-5 w-5 text-role-primary" />
          Exporter les logs
        </h3>
      </div>
      <div className="card-content space-y-5">

        {/* Format d'export */}
        <div className="form-field">
          <label className="filter-label">Format d'export</label>
          <div className="flex gap-4">
            <label className="form-radio flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="format"
                value="csv"
                checked={format === 'csv'}
                onChange={() => setFormat('csv')}
                className="form-radio-input"
              />
              <FileSpreadsheet className="w-4 h-4 text-success" />
              <span className="text-small text-foreground">CSV</span>
            </label>
            <label className="form-radio flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="format"
                value="json"
                checked={format === 'json'}
                onChange={() => setFormat('json')}
                className="form-radio-input"
              />
              <FileJson className="w-4 h-4 text-primary" />
              <span className="text-small text-foreground">JSON</span>
            </label>
          </div>
        </div>

        {/* Filtres date */}
        <div className="form-grid grid-cols-2 gap-3">
          <div className="form-field">
            <label className="filter-label flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Date de
            </label>
            <input
              type="date"
              className={`form-input ${focusClass}`}
              value={dateDe}
              onChange={e => setDateDe(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label className="filter-label flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Date à
            </label>
            <input
              type="date"
              className={`form-input ${focusClass}`}
              value={dateA}
              onChange={e => setDateA(e.target.value)}
            />
          </div>
        </div>

        {/* Statistiques de sélection */}
        <div className="flex items-center gap-3 text-small text-muted">
          <div className="flex items-center gap-1">
            <Filter className="w-3 h-3" />
            <span>{filtrees.length} entrées sélectionnées</span>
          </div>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            <span>{new Set(filtrees.map(e => e.utilisateur)).size} utilisateurs</span>
          </div>
        </div>

        {/* Aperçu */}
        <div className="space-y-2">
          <p className="text-small font-medium text-foreground flex items-center gap-2">
            Aperçu
            <span className="badge neutral text-[10px]">
              {Math.min(apercu.length, 5)} / {filtrees.length}
            </span>
          </p>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr className="bg-muted/30">
                  <th className="px-3 py-2 text-left text-xs">Date</th>
                  <th className="px-3 py-2 text-left text-xs">Module</th>
                  <th className="px-3 py-2 text-left text-xs">Action</th>
                  <th className="px-3 py-2 text-left text-xs">Utilisateur</th>
                  <th className="px-3 py-2 text-left text-xs">Détails</th>
                </tr>
              </thead>
              <tbody>
                {apercu.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted">
                      <Download className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      Aucune entrée pour cette période
                    </td>
                  </tr>
                )}
                {apercu.map((e, i) => (
                  <tr key={i} className="even:bg-muted/10 hover:bg-role-primary-soft transition-colors">
                    <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">{e.date}</td>
                    <td className="px-3 py-2 text-xs">{e.module}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`badge ${
                        e.action === 'suppression' ? 'danger' :
                        e.action === 'modification' ? 'warning' :
                        e.action === 'creation' ? 'primary' : 'neutral'
                      } text-[10px]`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{e.utilisateur}</td>
                    <td className="px-3 py-2 text-xs max-w-xs truncate text-muted">{e.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bouton d'export */}
        <button
          onClick={telecharger}
          disabled={filtrees.length === 0}
          className={`btn btn-primary w-full gap-2 ${filtrees.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Download className="w-4 h-4" />
          Télécharger ({filtrees.length} entrées) — {format.toUpperCase()}
        </button>
      </div>
    </div>
  )
}

export default AuditExport
