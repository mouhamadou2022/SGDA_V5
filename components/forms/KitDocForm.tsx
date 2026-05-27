// components/forms/KitDocForm.tsx
// VERSION COMPLÈTE AVEC ANALYSE IA DES DOCUMENTS RÈGLEMENTAIRES

'use client'

import { useState, useRef, useEffect } from 'react'
import { 
  X, Plus, ChevronDown, FileText, Upload, 
  Brain, Loader2, AlertCircle, AlertTriangle, 
  Info, GraduationCap, Calendar, Eye, Download,
  CheckCircle, Clock, User, Shield, BookOpen
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { registreAgent } from '@/lib/ia/agents/registreAgent'
import type { RegulationAnalysisResult } from '@/lib/ia/agents/registreAgent'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

// Options pour les listes déroulantes
const CATEGORIE_OPTIONS = [
  { value: 'reglementation', label: 'Réglementation' },
  { value: 'procedure', label: 'Procédure' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'guide', label: 'Guide' },
  { value: 'modele_rapport', label: 'Modèle de rapport' },
  { value: 'autre', label: 'Autre' },
]

const TYPE_OPTIONS = [
  { value: 'RAS-14', label: 'RAS-14' },
  { value: 'Circulaires', label: 'Circulaires' },
  { value: 'Guides', label: 'Guides' },
  { value: 'Checklists', label: 'Checklists' },
  { value: 'Procédures', label: 'Procédures' },
  { value: 'Rapports', label: 'Rapports' },
  { value: 'Formulaires', label: 'Formulaires' },
]

const ETAT_OPTIONS = [
  { value: 'a_jour', label: 'À jour', color: 'success' },
  { value: 'en_revision', label: 'En révision', color: 'warning' },
  { value: 'obsolete', label: 'Obsolète', color: 'danger' },
]

const DOMAINE_OPTIONS = [
  { value: 'SGS', label: 'SGS - Système de Gestion de la Sécurité' },
  { value: 'SLI', label: 'SLI - Sauvetage et Lutte Incendie' },
  { value: 'PHY', label: 'PHY - Caractéristiques physiques' },
  { value: 'OPS', label: 'OPS - Procédures opérationnelles' },
  { value: 'AGA', label: 'AGA - Aérodrome' },
  { value: 'ELEC', label: 'ELEC - Réseaux électriques' },
  { value: 'ANIM', label: 'ANIM - Péril animalier' },
  { value: 'RH', label: 'RH - Ressources Humaines' },
  { value: 'CERTIF', label: 'CERTIF - Certification' },
  { value: 'HOMOL', label: 'HOMOL - Homologation' },
]

const FORMAT_OPTIONS = [
  { value: 'PDF', label: 'PDF' },
  { value: 'DOCX', label: 'DOCX' },
  { value: 'XLS', label: 'XLS' },
  { value: 'PPT', label: 'PPT' },
  { value: 'ZIP', label: 'ZIP' },
]

interface KitDocFormProps {
  onSubmit: (doc: any) => void
  onCancel: () => void
  initialData?: any
  mode?: 'creation' | 'modification'
}

export function KitDocForm({ onSubmit, onCancel, initialData, mode = 'creation' }: KitDocFormProps) {
  const user = useAppStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const addRegulationAnalysis = useAppStore(s => s.addRegulationAnalysis);
  const addFormationSuggestion = useAppStore(s => s.addFormationSuggestion);
  const getPendingRegulationAlerts = useAppStore(s => s.getPendingRegulationAlerts)
  
  const [titre, setTitre] = useState(initialData?.titre || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [categorie, setCategorie] = useState(initialData?.categorie || 'reglementation')
  const [type_document, setTypeDocument] = useState(initialData?.type_document || 'RAS-14')
  const [format, setFormat] = useState(initialData?.format || 'PDF')
  const [version, setVersion] = useState(initialData?.version || '')
  const [etat, setEtat] = useState(initialData?.etat || 'a_jour')
  const [date_mise_a_jour, setDateMaj] = useState(initialData?.date_mise_a_jour || '')
  const [domaines, setDomaines] = useState<string[]>(initialData?.domaines || [])
  const [mots_cles, setMotsCles] = useState<string[]>(initialData?.mots_cles || [])
  const [motCleTemp, setMotCleTemp] = useState('')
  const [domainesDropdownOpen, setDomainesDropdownOpen] = useState(false)
  const domainesDropdownRef = useRef<HTMLDivElement>(null)
  const [accessible_exploitant, setAccessibleExploitant] = useState(initialData?.accessible_exploitant || false)
  const [fichier, setFichier] = useState<File | null>(null)
  const [erreurs, setErreurs] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState('informations')
  
  // États pour l'analyse IA
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<RegulationAnalysisResult | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [existingFichierUrl, setExistingFichierUrl] = useState(initialData?.fichier_url || '')

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (domainesDropdownRef.current && !domainesDropdownRef.current.contains(e.target as Node)) {
        setDomainesDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const valider = () => {
    const errs: string[] = []
    if (!titre.trim()) errs.push('titre')
    if (!version.trim()) errs.push('version')
    if (domaines.length === 0) errs.push('domaines')
    if (!fichier && mode === 'creation' && !existingFichierUrl) errs.push('fichier')
    setErreurs(errs)
    return errs.length === 0
  }

  const hasErr = (field: string) => erreurs.includes(field)

  const ajouterMotCle = () => {
    if (motCleTemp.trim() && !mots_cles.includes(motCleTemp.trim())) {
      setMotsCles([...mots_cles, motCleTemp.trim()])
      setMotCleTemp('')
    }
  }

  const supprimerMotCle = (mot: string) => {
    setMotsCles(mots_cles.filter(m => m !== mot))
  }

  const ajouterDomaine = (domaine: string) => {
    if (domaine && !domaines.includes(domaine)) {
      setDomaines([...domaines, domaine])
    }
  }

  const supprimerDomaine = (domaine: string) => {
    setDomaines(domaines.filter(d => d !== domaine))
  }

  const getEtatBadgeClass = (etatValue: string) => {
    switch (etatValue) {
      case 'a_jour': return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-success'
      case 'en_revision': return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-warning'
      case 'obsolete': return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-danger'
      default: return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-slate-400'
    }
  }

  const getEtatLabel = (etatValue: string) => {
    switch (etatValue) {
      case 'a_jour': return '✅ À jour'
      case 'en_revision': return '🔄 En révision'
      case 'obsolete': return '⚠️ Obsolète'
      default: return etatValue
    }
  }

  // Analyse IA du document
  const analyzeDocument = async (documentData: any) => {
    setIsAnalyzing(true)
    try {
      const result = await registreAgent.analyzeRegulationDocument({
        documentId: documentData.id || `doc-${Date.now()}`,
        titre: documentData.titre,
        type: documentData.type_document,
        version_ancienne: initialData?.version || '',
        version_nouvelle: documentData.version,
        date_publication: documentData.date_mise_a_jour || new Date().toISOString(),
      })

      setAnalysisResult(result)
      setShowAnalysis(true)
      
      // Enregistrer dans le store
      addRegulationAnalysis({
        ...result,
        status: 'pending',
      })
      
      for (const formation of result.formations_suggerees) {
        addFormationSuggestion(formation)
      }
      
      addNotification({
        user_id: user?.id || '',
        type: 'info',
        title: 'Analyse réglementaire',
        message: `${result.formations_suggerees.length} formation(s) suggérée(s) suite à l'analyse du document`,
        canal: 'in_app',
      })
    } catch (error) {
      console.error('Erreur analyse IA:', error)
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur IA',
        message: error instanceof Error ? error.message : 'Analyse impossible',
        canal: 'in_app',
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSubmit = async () => {
    if (!valider()) {
      setActiveTab('informations')
      return
    }

    // Préparer les données du document
    const documentData = {
      titre,
      description,
      categorie,
      type_document,
      format,
      version,
      etat,
      date_mise_a_jour: date_mise_a_jour || new Date().toISOString().split('T')[0],
      domaines,
      mots_cles,
      accessible_exploitant,
      fichier,
    }

    // Appeler le callback onSubmit
    onSubmit(documentData)

    // Lancer l'analyse IA si c'est un document réglementaire
    if (categorie === 'reglementation' || type_document === 'RAS-14' || type_document === 'Circulaires') {
      await analyzeDocument(documentData)
    }
  }

  const tabs = [
    { id: 'informations', label: 'Informations', icon: FileText },
    { id: 'domaines', label: 'Domaines', icon: Shield },
    { id: 'analyse', label: 'Analyse IA', icon: Brain },
  ]

  return (
    <div className="space-y-6 animate-fade-up">
      
      {/* En-tête avec statut analyse */}
      {(isAnalyzing || (showAnalysis && analysisResult)) && (
        <div className={`p-3 rounded-lg ${isAnalyzing ? 'bg-info/10' : analysisResult?.impact === 'majeur' ? 'bg-danger/10' : analysisResult?.impact === 'modere' ? 'bg-warning/10' : 'bg-success/10'}`}>
          {isAnalyzing ? (
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-info" />
              <div>
                <p className="text-sm font-medium">Analyse IA en cours...</p>
                <p className="text-xs text-muted-foreground">Détection des impacts réglementaires et suggestions de formation</p>
              </div>
            </div>
          ) : analysisResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {analysisResult.impact === 'majeur' && <AlertCircle className="w-5 h-5 text-danger" />}
                {analysisResult.impact === 'modere' && <AlertTriangle className="w-5 h-5 text-warning" />}
                {analysisResult.impact === 'mineur' && <Info className="w-5 h-5 text-info" />}
                <span className="text-sm font-semibold">
                  Impact {analysisResult.impact === 'majeur' ? 'MAJEUR' : analysisResult.impact === 'modere' ? 'MODÉRÉ' : 'MINEUR'}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  Confiance: {analysisResult.confidence}%
                </span>
              </div>
              <p className="text-sm">{analysisResult.impact_description}</p>
              {analysisResult.formations_suggerees.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <GraduationCap className="w-3 h-3" />
                    Formations suggérées:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {analysisResult.formations_suggerees.map((f: any) => (
                      <span key={f.id} className="badge primary text-[10px]">{f.titre}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {tabs.map(tab => {
          const TabIcon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              className={`tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon className="w-4 h-4 mr-2 inline" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Onglet Informations */}
      {activeTab === 'informations' && (
        <div className="space-y-6 animate-fade-in">
          <div className="card border-l-4 border-l-role-primary rounded-l-xl">
            <div className="card-header">
              <div className="card-title text-base">Informations générales</div>
            </div>
            <div className="card-content space-y-4">
              {/* Titre */}
              <div className="form-field">
                <label className={labelClass}>Titre <span className="text-danger">*</span></label>
                <input
                  type="text"
                  placeholder="Titre du document"
                  value={titre}
                  onChange={e => setTitre(e.target.value)}
                  className={`form-input ${focusClass}${hasErr('titre') ? ' border-danger' : ''}`}
                />
                {hasErr('titre') && <p className="field-error">Le titre est requis</p>}
              </div>

              {/* Description */}
              <div className="form-field">
                <label className={labelClass}>Description</label>
                <textarea
                  placeholder="Description du document..."
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={`form-textarea ${focusClass}`}
                />
              </div>

              {/* Catégorie et Type */}
              <div className="form-grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label className={labelClass}>Catégorie</label>
                  <select
                    value={categorie}
                    onChange={e => setCategorie(e.target.value)}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    {CATEGORIE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className={labelClass}>Type de document</label>
                  <select
                    value={type_document}
                    onChange={e => setTypeDocument(e.target.value)}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    {TYPE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Format et Version */}
              <div className="form-grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label className={labelClass}>Format</label>
                  <select
                    value={format}
                    onChange={e => setFormat(e.target.value)}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    {FORMAT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label className={labelClass}>Version <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    placeholder="Ex: 2.1"
                    value={version}
                    onChange={e => setVersion(e.target.value)}
                    className={`form-input ${focusClass}${hasErr('version') ? ' border-danger' : ''}`}
                  />
                  {hasErr('version') && <p className="field-error">La version est requise</p>}
                </div>
              </div>

              {/* État et Date */}
              <div className="form-grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label className={labelClass}>État</label>
                  <select
                    value={etat}
                    onChange={e => setEtat(e.target.value)}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    {ETAT_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <div className="mt-2">
                    <span className={getEtatBadgeClass(etat)}>{getEtatLabel(etat)}</span>
                  </div>
                </div>
                <div className="form-field">
                  <label className={labelClass}>Date de mise à jour</label>
                  <input
                    type="date"
                    value={date_mise_a_jour}
                    onChange={e => setDateMaj(e.target.value)}
                    className={`form-input ${focusClass}`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Accessibilité et fichier */}
          <div className="card border-l-4 border-l-role-primary rounded-l-xl">
            <div className="card-header">
              <div className="card-title text-base">Publication et fichier</div>
            </div>
            <div className="card-content space-y-4">
              <div className="form-field">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accessible_exploitant}
                    onChange={e => setAccessibleExploitant(e.target.checked)}
                    className="form-checkbox"
                  />
                  <span className="filter-label">Accessible aux exploitants (portail)</span>
                </label>
                <p className="field-description">Les exploitants pourront consulter ce document sur leur portail</p>
              </div>

              <div className="form-field">
                <label className={labelClass}>Fichier <span className="text-danger">*</span></label>
                <input
                  type="file"
                  accept=".pdf,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                  onChange={(e) => setFichier(e.target.files?.[0] || null)}
                  className="form-input py-2 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:btn-primary cursor-pointer"
                />
                {existingFichierUrl && mode === 'modification' && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-success">
                    <CheckCircle className="w-3 h-3" />
                    Document existant: <a href={existingFichierUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Voir le fichier</a>
                  </div>
                )}
                <p className="field-description">Formats acceptés: PDF, DOCX, XLS, PPT, ZIP (max 20 Mo)</p>
                {hasErr('fichier') && <p className="field-error">Un fichier est requis</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onglet Domaines */}
      {activeTab === 'domaines' && (
        <div className="space-y-4 animate-fade-in">
          <div className="card border-l-4 border-l-role-primary rounded-l-xl">
            <div className="card-header">
              <div className="card-title text-base">Domaines concernés <span className="text-danger">*</span></div>
            </div>
            <div className="card-content">
              <div className="form-field">
                <label className={labelClass}>Domaines</label>
                <div ref={domainesDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setDomainesDropdownOpen(!domainesDropdownOpen)}
                    className={`w-full h-10 flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-background text-foreground transition-all ${focusClass} ${hasErr('domaines') ? 'border-danger' : ''} ${domainesDropdownOpen ? 'ring-2 ring-role-primary border-transparent' : ''}`}
                    style={selectStyle}
                  >
                    <span className={domaines.length === 0 ? 'text-muted-foreground' : 'text-foreground'}>
                      {domaines.length === 0
                        ? '-- Sélectionner des domaines --'
                        : domaines.map(d => DOMAINE_OPTIONS.find(o => o.value === d)?.label || d).join(', ')}
                    </span>
                    <ChevronDown className={`w-4 h-4 ml-2 transition-transform shrink-0 ${domainesDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {domainesDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden">
                      <div className="max-h-60 overflow-y-auto">
                        {DOMAINE_OPTIONS.map(opt => {
                          const selected = domaines.includes(opt.value)
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                if (selected) {
                                  setDomaines(domaines.filter(d => d !== opt.value))
                                } else {
                                  setDomaines([...domaines, opt.value])
                                }
                              }}
                              className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${selected ? 'bg-role-primary-soft text-role-primary font-medium' : 'text-foreground hover:bg-role-primary-soft'}`}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {hasErr('domaines') && <p className="field-error mt-1">Au moins un domaine doit être sélectionné</p>}
                <p className="field-description mt-2">Cliquez pour ouvrir et cocher les domaines concernés</p>
              </div>
            </div>
          </div>

          {/* Mots-clés */}
          <div className="card border-l-4 border-l-role-primary rounded-l-xl">
            <div className="card-header">
              <div className="card-title text-base">Mots-clés</div>
            </div>
            <div className="card-content">
              <div className="form-field">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ajouter un mot-clé..."
                    value={motCleTemp}
                    onChange={e => setMotCleTemp(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        ajouterMotCle();
                      }
                    }}
                    className={`form-input flex-1 ${focusClass}`}
                  />
                  <button
                    type="button"
                    onClick={ajouterMotCle}
                    className="btn btn-secondary btn-sm gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {mots_cles.map(mot => (
                    <div key={mot} className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full text-sm">
                      <span>{mot}</span>
                      <button
                        type="button"
                        onClick={() => supprimerMotCle(mot)}
                        className="text-muted-foreground hover:text-danger transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="field-description mt-2">Appuyez sur Entrée ou cliquez sur Ajouter pour valider</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Onglet Analyse IA */}
      {activeTab === 'analyse' && (
        <div className="space-y-4 animate-fade-in">
          <div className="card border-l-4 border-l-role-primary rounded-l-xl">
            <div className="card-header">
              <div className="card-title text-base flex items-center gap-2">
                <Brain className="w-4 h-4 text-role-primary" />
                Intelligence Artificielle - Analyse documentaire
              </div>
            </div>
            <div className="card-content">
              {isAnalyzing ? (
                <div className="text-center py-8">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-role-primary" />
                  <p className="text-muted-foreground">Analyse du document en cours...</p>
                  <p className="text-xs text-muted-foreground mt-1">Détection des impacts réglementaires et suggestions de formation</p>
                </div>
              ) : showAnalysis && analysisResult ? (
                <div className="space-y-4">
                  {/* Résumé de l'analyse */}
                  <div className={`p-4 rounded-lg ${analysisResult.impact === 'majeur' ? 'bg-danger/10 border border-danger' : analysisResult.impact === 'modere' ? 'bg-warning/10 border border-warning' : 'bg-info/10 border border-info'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {analysisResult.impact === 'majeur' && <AlertCircle className="w-5 h-5 text-danger" />}
                      {analysisResult.impact === 'modere' && <AlertTriangle className="w-5 h-5 text-warning" />}
                      {analysisResult.impact === 'mineur' && <Info className="w-5 h-5 text-info" />}
                      <span className="font-semibold">
                        Impact {analysisResult.impact === 'majeur' ? 'MAJEUR' : analysisResult.impact === 'modere' ? 'MODÉRÉ' : 'MINEUR'}
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">Confiance: {analysisResult.confidence}%</span>
                    </div>
                    <p className="text-sm">{analysisResult.impact_description}</p>
                    {analysisResult.chapitres_modifies.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground">Chapitres/ sections modifiées:</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {analysisResult.chapitres_modifies.map((ch: string, idx: number) => (
                            <span key={idx} className="badge outline text-[10px]">{ch}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-3 pt-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Délai de mise en conformité recommandé: {analysisResult.delai_mise_conformite} jours
                      </p>
                    </div>
                  </div>

                  {/* Formations suggérées */}
                  {analysisResult.formations_suggerees.length > 0 && (
                    <div className="card border-primary">
                      <div className="card-header bg-primary/10">
                        <div className="card-title text-sm flex items-center gap-2">
                          <GraduationCap className="w-4 h-4 text-role-primary" />
                          Formations suggérées ({analysisResult.formations_suggerees.length})
                        </div>
                      </div>
                      <div className="card-content space-y-3">
                        {analysisResult.formations_suggerees.map((formation: any) => (
                          <div key={formation.id} className="p-3 bg-role-primary-soft rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{formation.titre}</span>
                              <span className={`badge ${formation.priorite === 'haute' ? 'danger' : formation.priorite === 'moyenne' ? 'warning' : 'neutral'}`}>
                                {formation.priorite}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{formation.description}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Durée: {formation.duree_heures}h
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3" />
                                Public: {formation.public_cible.join(', ')}
                              </span>
                            </div>
                            <div className="flex gap-2 mt-3">
                              <button className="btn btn-xs btn-primary">Planifier cette formation</button>
                              <button className="btn btn-xs btn-secondary">Voir les détails</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Inspecteurs concernés */}
                  {analysisResult.inspecteurs_concernes.length > 0 && (
                    <div className="card border-warning">
                      <div className="card-header bg-warning/10">
                        <div className="card-title text-sm flex items-center gap-2">
                          <User className="w-4 h-4 text-warning" />
                          Inspecteurs concernés ({analysisResult.inspecteurs_concernes.length})
                        </div>
                      </div>
                      <div className="card-content">
                        <div className="flex flex-wrap gap-2">
                          {analysisResult.inspecteurs_concernes.map((id: string) => (
                            <span key={id} className="badge warning text-[10px]">Inspecteur {id.slice(-4)}</span>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Ces inspecteurs seront notifiés automatiquement.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground border-t border-border pt-3">
                    Analyse IA réalisée le {new Date(analysisResult.date_analyse).toLocaleString('fr-FR')}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Soumettez le document pour une analyse IA</p>
                  <p className="text-xs mt-1">L'IA détectera les impacts réglementaires et suggérera des formations</p>
                  <p className="text-xs text-muted-foreground mt-2">L'analyse se déclenche automatiquement à l'enregistrement</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="form-actions sticky bottom-0 bg-background pt-4 mt-4 border-t border-border">
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          Annuler
        </button>
        <button type="button" onClick={handleSubmit} className="btn btn-primary gap-2">
          {initialData ? 'Mettre à jour' : 'Ajouter le document'}
        </button>
      </div>
    </div>
  )
}

export default KitDocForm