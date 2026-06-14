// components/modules/enquetes/EnqueteExport.tsx
'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Download, FileText, FileJson, Filter, X } from 'lucide-react'

interface EnqueteExportProps {
  enqueteId: string
  userRole?: string
}

const AERODROMES = ['Tous', 'GOBD', 'GOGG', 'GOSS', 'GOYY', 'GOBY']

const TOUTES_LIGNES = [
  { aerodrome: 'GOBD', repondant: 'Ousmane Ndiaye', date: '2024-04-10', q1: 'Oui', q2: '4', q3: 'Satisfaisant', score_c1: '3.8' },
  { aerodrome: 'GOBD', repondant: 'Aissatou Diallo', date: '2024-04-11', q1: 'Non', q2: '5', q3: 'Très satisfaisant', score_c1: '4.1' },
  { aerodrome: 'GOGG', repondant: 'Ibrahima Sow', date: '2024-04-12', q1: 'Oui', q2: '3', q3: 'Moyen', score_c1: '2.9' },
  { aerodrome: 'GOSS', repondant: 'Fatou Ndoye', date: '2024-04-13', q1: 'Oui', q2: '4', q3: 'Satisfaisant', score_c1: '3.5' },
  { aerodrome: 'GOYY', repondant: 'Mamadou Diallo', date: '2024-04-14', q1: 'Oui', q2: '5', q3: 'Excellent', score_c1: '4.4' },
  { aerodrome: 'GOBY', repondant: 'Cheikh Fall', date: '2024-04-15', q1: 'Non', q2: '3', q3: 'Moyen', score_c1: '3.2' },
]

const HEADERS = ['Aérodrome', 'Répondant', 'Date', 'Q1 — Documentation SGS disponible ?', 'Q2 — Score formation (Likert)', 'Q3 — Appréciation générale', 'Score C1']
const KEYS = ['aerodrome', 'repondant', 'date', 'q1', 'q2', 'q3', 'score_c1'] as const

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

export function EnqueteExport({ enqueteId, userRole = 'inspector' }: EnqueteExportProps) {
  const [format, setFormat] = useState<'CSV' | 'JSON'>('CSV')
  const [aerodrome, setAerodrome] = useState('Tous')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')

  const filteredData = TOUTES_LIGNES.filter((row) => {
    if (aerodrome !== 'Tous' && row.aerodrome !== aerodrome) return false
    if (dateDebut && row.date < dateDebut) return false
    if (dateFin && row.date > dateFin) return false
    return true
  })

  const apercu = filteredData.slice(0, 5)

  const handleDownload = () => {
    let blob: Blob
    let filename: string

    if (format === 'CSV') {
      const csvContent =
        HEADERS.join(',') +
        '\n' +
        filteredData.map((row) => KEYS.map((k) => `"${row[k]}"`).join(',')).join('\n')
      blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      filename = `enquete-${enqueteId}-export.csv`
    } else {
      const jsonContent = JSON.stringify(filteredData, null, 2)
      blob = new Blob([jsonContent], { type: 'application/json' })
      filename = `enquete-${enqueteId}-export.json`
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundPosition: 'right 0.75rem center',
    backgroundRepeat: 'no-repeat'
  }

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole}>
      <h2 className="heading-4">Export des données</h2>

      {/* Options */}
      <div className="filters-panel p-4 space-y-4">
        <div className="space-y-2">
          <p className="text-small font-medium">Format d'export</p>
          <div className="flex gap-4">
            {(['CSV', 'JSON'] as const).map((f) => (
              <label key={f} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                  className="form-radio"
                />
                <span className="text-small font-medium">
                  {f === 'CSV' ? <FileText className="w-4 h-4 inline mr-1" /> : <FileJson className="w-4 h-4 inline mr-1" />}
                  {f}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="form-field">
            <label className="filter-label">Aérodrome</label>
            <select
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
              value={aerodrome}
              onChange={(e) => setAerodrome(e.target.value)}
            >
              {AERODROMES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="filter-label">Date de début</label>
            <input type="date" className={`form-input w-full ${focusClass}`} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="filter-label">Date de fin</label>
            <input type="date" className={`form-input w-full ${focusClass}`} value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Aperçu */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="font-medium text-small">Aperçu (5 premières lignes)</p>
          <p className="text-small text-muted-foreground">{filteredData.length} entrée(s) à exporter</p>
        </div>
        <div className="table-container overflow-x-auto">
          <table className="table text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                {HEADERS.map((h) => (
                  <th key={h} className="pb-2 pr-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {apercu.map((row, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  {KEYS.map((k) => (
                    <td key={k} className="py-1.5 pr-3 whitespace-nowrap">{row[k]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <button onClick={handleDownload} disabled={filteredData.length === 0} className="btn btn-primary gap-2">
        <Download className="w-4 h-4" />
        Télécharger ({filteredData.length} entrée{filteredData.length !== 1 ? 's' : ''}) — {format}
      </button>
    </div>
  )
}

export default EnqueteExport