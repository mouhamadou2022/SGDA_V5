// components/modules/kit-inspecteur/KitSearch.tsx
'use client'

import { useState } from 'react'
import { Search, X, FileText, Download, Eye } from 'lucide-react'
import { useAppStore } from '@/lib/store'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

const FORMAT_COLORS: Record<string, string> = {
  PDF: 'badge danger',
  DOCX: 'badge primary',
  XLS: 'badge success',
  PPT: 'badge warning',
  ZIP: 'badge neutral',
}

interface KitSearchProps {
  onSelect?: (docId: string) => void
  userRole?: string
}

function KitSearch({ onSelect, userRole = 'inspector' }: KitSearchProps) {
  const kitDocuments = useAppStore(s => s.kitDocuments)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('tous')
  const [formatFilter, setFormatFilter] = useState<string>('tous')

  const docs = kitDocuments ?? []

  const filtered = docs.filter(doc => {
    const matchSearch =
      search.trim() === '' ||
      doc.nom.toLowerCase().includes(search.toLowerCase()) ||
      doc.mots_cles?.some(m => m.toLowerCase().includes(search.toLowerCase())) ||
      doc.resume?.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'tous' || doc.type_document_oaci === typeFilter
    const matchFormat = formatFilter === 'tous' || doc.format === formatFilter
    return matchSearch && matchType && matchFormat
  })

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('tous')
    setFormatFilter('tous')
  }

  const types = [...new Set(docs.map(d => d.type_document_oaci).filter(Boolean))]
  const formats = [...new Set(docs.map(d => d.format).filter(Boolean))]

  return (
    <div className="space-y-4 animate-fade-up" data-role={userRole}>
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un document…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>
          {types.length > 0 && (
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
              style={selectStyle}
            >
              <option value="tous">Toutes catégories</option>
              {types.map(t => <option key={t} value={t!}>{t}</option>)}
            </select>
          )}
          {formats.length > 0 && (
            <select
              value={formatFilter}
              onChange={e => setFormatFilter(e.target.value)}
              className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
              style={selectStyle}
            >
              <option value="tous">Tous formats</option>
              {formats.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          {(search || typeFilter !== 'tous' || formatFilter !== 'tous') && (
            <button onClick={resetFilters} className="btn btn-secondary btn-sm gap-1">
              <X className="w-3 h-3" />
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="card p-12 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium text-foreground">Aucun document dans le kit</p>
          <p className="mt-1 text-small">Ajoutez des documents via le module Kit Inspecteur.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="font-medium text-foreground">Aucun document trouvé</p>
          <p className="mt-1 text-small">Modifiez vos critères de recherche ou réinitialisez les filtres.</p>
          <button className="btn btn-secondary mt-4" onClick={resetFilters}>
            Réinitialiser
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-small text-muted-foreground">{filtered.length} document(s) trouvé(s)</p>
          {filtered.map(doc => (
            <div key={doc.id} className="card p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{doc.nom}</p>
                <div className="mt-1 flex flex-wrap gap-2 items-center">
                  {doc.type_document_oaci && <span className="badge outline">{doc.type_document_oaci}</span>}
                  {doc.format && <span className={FORMAT_COLORS[doc.format] ?? 'badge neutral'}>{doc.format}</span>}
                  {doc.date_revision && (
                    <span className="text-xs text-muted-foreground">
                      Mis à jour: {new Date(doc.date_revision).toLocaleDateString('fr-FR')}
                    </span>
                  )}
                  {doc.fichier_taille && (
                    <span className="text-xs text-muted-foreground">
                      {(doc.fichier_taille / 1024 / 1024).toFixed(1)} Mo
                    </span>
                  )}
                  {doc.version && <span className="text-xs text-muted-foreground">{doc.version}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {doc.fichier_url && (
                  <a href={doc.fichier_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm gap-1">
                    <Download className="w-3 h-3" />
                    Télécharger
                  </a>
                )}
                {onSelect && (
                  <button className="btn btn-primary btn-sm gap-1" onClick={() => onSelect(doc.id)}>
                    <Eye className="w-3 h-3" />
                    Sélectionner
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export { KitSearch }
export default KitSearch
