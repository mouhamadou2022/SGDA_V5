// components/forms/KitDocForm.tsx
// Formulaire réel « Ajouter / Modifier un document » du Kit Inspecteur.
// Extraits de KitInspecteurModule pour alléger le module.

'use client'

import React, { useState, useRef, useEffect } from 'react'
import {
  X, ChevronDown, Check, FileText, Upload,
  Brain, Calendar, RefreshCw, Tag, Briefcase,
} from 'lucide-react'
import { FormShell, FormProgressContext } from '@/components/ui/FormShell'
import { Card } from '@/components/ui/card'
import { useFormProgress } from '@/hooks/useFormProgress'
import {
  TYPES_DOCUMENTS, TYPES_OACI, FORMATS_FICHIER, ETATS_DOCUMENT, DOMAINES,
} from '@/lib/kitOptions'
import type { KitDocument, TypeDocumentOACI, FormatDocument } from '@/lib/store'

export interface KitDocFormProps {
  showForm: boolean
  setShowForm: (v: boolean) => void
  resetForm: () => void
  selectedDocument: KitDocument | null
  isSubmitting: boolean
  handleSubmit: (e: React.FormEvent) => Promise<void>
  formData: any
  setFormData: any
  formErrors: Record<string, string>
  userRole: string
  focusClass: string
  selectStyle: React.CSSProperties
}

export function KitDocForm({
  showForm, setShowForm, resetForm, selectedDocument, isSubmitting,
  handleSubmit, formData, setFormData, formErrors, userRole, focusClass, selectStyle,
}: KitDocFormProps) {
  const [domDropdown, setDomDropdown] = useState(false);
  const domDropdownRef = useRef<HTMLDivElement>(null);

  const progress = useFormProgress(formData as Record<string, unknown>, [
    'nom', 'type_document_oaci', 'fichier', 'domaines', 'resume',
  ]);
  const setProgress = React.useContext(FormProgressContext);
  useEffect(() => { setProgress(progress) }, [progress, setProgress]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (domDropdownRef.current && !domDropdownRef.current.contains(e.target as Node)) {
        setDomDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!showForm) return null;
  return (
    <FormShell
      open={showForm}
      onClose={() => { setShowForm(false); resetForm(); }}
      title={selectedDocument ? 'Modifier le document' : 'Ajouter un document'}
      icon={Briefcase}
      size="3xl"
      dataRole={userRole}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); resetForm(); }}>
            Annuler
          </button>
          <button type="submit" form="kit-document-form" disabled={isSubmitting} className="btn btn-primary gap-2">
            {isSubmitting ? 'Sauvegarde...' : (selectedDocument ? 'Modifier' : 'Ajouter')}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6" id="kit-document-form">
        <div className="form-grid grid-cols-2 gap-4">
          <div className="form-field col-span-2">
            <label className="filter-label">
              <FileText className="w-3 h-3 inline mr-1" />
              Nom du document *
            </label>
            <input
              type="text"
              value={formData.nom}
              onChange={(e) => setFormData({...formData, nom: e.target.value})}
              placeholder="Ex: RAS 14 - Section 9.2"
              className={`form-input w-full ${focusClass} ${formErrors.nom ? 'border-danger' : ''}`}
            />
            {formErrors.nom && <span className="field-error">{formErrors.nom}</span>}
          </div>

          <div className="form-field">
            <label className="filter-label">Catégorie *</label>
            <select
              value={formData.type_document}
              onChange={(e) => setFormData({...formData, type_document: e.target.value})}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              {TYPES_DOCUMENTS.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="filter-label">
              <Brain className="w-3 h-3 inline mr-1" />
              Type OACI / Référence
            </label>
            <select
              value={formData.type_document_oaci}
              onChange={(e) => setFormData({...formData, type_document_oaci: e.target.value as TypeDocumentOACI | ''})}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              <option value="">— Sélectionner (optionnel) —</option>
              {TYPES_OACI.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <p className="field-description">Référence OACI du document (optionnel)</p>
          </div>

          <div className="form-field">
            <label className="filter-label">Version *</label>
            <input
              type="text"
              value={formData.version}
              onChange={(e) => setFormData({...formData, version: e.target.value})}
              placeholder="v1.0"
              className={`form-input w-full ${focusClass} ${formErrors.version ? 'border-danger' : ''}`}
            />
            {formErrors.version && <span className="field-error">{formErrors.version}</span>}
          </div>

          <div className="form-field">
            <label className="filter-label">Format</label>
            <select
              value={formData.format}
              onChange={(e) => setFormData({...formData, format: e.target.value as FormatDocument})}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              {FORMATS_FICHIER.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label className="filter-label">
              <Calendar className="w-3 h-3 inline mr-1" />
              Date de révision *
            </label>
            <input
              type="date"
              value={formData.date_revision}
              onChange={(e) => setFormData({...formData, date_revision: e.target.value})}
              className={`form-input w-full ${focusClass}`}
            />
          </div>

          <div className="form-field">
            <label className="filter-label">
              <RefreshCw className="w-3 h-3 inline mr-1" />
              État *
            </label>
            <select
              value={formData.etat}
              onChange={(e) => setFormData({...formData, etat: e.target.value})}
              className={`form-select w-full ${focusClass}`}
              style={selectStyle}
            >
              {ETATS_DOCUMENT.map(e => (
                <option key={e.id} value={e.id}>{e.label}</option>
              ))}
            </select>
          </div>

          <div className="form-field col-span-2">
            <label className="filter-label">
              <Tag className="w-3 h-3 inline mr-1" />
              Domaines concernés *
            </label>
            <div ref={domDropdownRef} className="relative">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setDomDropdown(o => !o)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDomDropdown(o => !o) } }}
                className={`w-full min-h-10 flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background text-foreground cursor-pointer transition-all ${focusClass} ${formErrors.domaines ? 'border-danger' : ''} ${domDropdown ? 'ring-2 ring-role-primary border-transparent' : ''}`}
              >
                {formData.domaines.length === 0 ? (
                  <span className="text-muted-foreground text-sm">-- Sélectionner des domaines --</span>
                ) : (
                  formData.domaines.map((d: string) => (
                    <span key={d}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-role-primary-soft/60 text-role-primary"
                      title={DOMAINES.find(x => x.id === d)?.label || d}>
                      {d}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setFormData({...formData, domaines: formData.domaines.filter((id: string) => id !== d)}) }}
                        className="hover:text-danger transition-colors"
                        title={`Retirer ${d}`}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
                <ChevronDown className={`w-4 h-4 ml-auto shrink-0 text-muted-foreground transition-transform ${domDropdown ? 'rotate-180' : ''}`} />
              </div>

              {domDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-xl shadow-lg overflow-hidden">
                  <div className="max-h-60 overflow-y-auto">
                    {DOMAINES.map(d => {
                      const selected = formData.domaines.includes(d.id)
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            if (d.id === 'AGA') {
                              setFormData({...formData, domaines: selected ? [] : ['AGA']})
                            } else {
                              const next = selected
                                ? formData.domaines.filter((id: string) => id !== d.id && id !== 'AGA')
                                : [...formData.domaines.filter((id: string) => id !== 'AGA'), d.id]
                              setFormData({...formData, domaines: next})
                            }
                          }}
                          className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors ${selected ? 'bg-role-primary-soft text-role-primary font-medium' : 'text-foreground hover:bg-role-primary-soft'}`}
                        >
                          <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${selected ? 'bg-role-primary border-role-primary text-white' : 'border-border text-transparent'}`}>
                            <Check className="w-3 h-3" />
                          </span>
                          <span className="truncate">{d.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            {formErrors.domaines && <span className="field-error">{formErrors.domaines}</span>}
            <p className="field-description mt-1">Cliquez pour ouvrir, cochez les domaines — les sélections s'affichent en étiquettes</p>
          </div>

          <div className="form-field col-span-2">
            <label className="filter-label">
              <Tag className="w-3 h-3 inline mr-1" />
              Mots-clés
            </label>
            <input
              type="text"
              value={formData.mots_cles.join(', ')}
              onChange={(e) => setFormData({...formData, mots_cles: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean)})}
              placeholder="sgs, sécurité, inspection..."
              className={`form-input w-full ${focusClass}`}
            />
            <p className="field-description">Séparés par des virgules</p>
          </div>

          <div className="form-field col-span-2">
            <label className="filter-label">Résumé</label>
            <textarea
              value={formData.resume}
              onChange={(e) => setFormData({...formData, resume: e.target.value})}
              placeholder="Description succincte du document..."
              rows={3}
              className={`form-textarea w-full ${focusClass}`}
            />
          </div>

          <div className="form-field col-span-2">
            <label className="filter-label">
              <Upload className="w-3 h-3 inline mr-1" />
              Fichier *
            </label>
            <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-role-primary transition-colors">
              <input
                type="file"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  if (e.target.files && e.target.files[0]) {
                    setFormData({...formData, fichier: e.target.files[0]});
                  }
                }}
                className="hidden"
                id="kit-fichier"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              />
              <label htmlFor="kit-fichier" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-small text-muted-foreground">
                  {formData.fichier ? formData.fichier.name : (selectedDocument?.fichier_nom || 'Cliquez pour ajouter un fichier')}
                </span>
                <span className="text-xs text-muted-foreground">PDF, Word, Excel, PowerPoint (max 10 Mo)</span>
              </label>
            </div>
            {formErrors.fichier && <span className="field-error">{formErrors.fichier}</span>}
          </div>

          <Card variant="glass" className="col-span-2" contentClassName="!p-0">
            <label className="flex items-center gap-3 p-3 cursor-pointer">
              <input
                type="checkbox"
                id="accessible_exploitant"
                checked={formData.accessible_exploitant}
                onChange={(e) => setFormData({...formData, accessible_exploitant: e.target.checked})}
                className="form-checkbox"
              />
              <span className="text-sm cursor-pointer">
                Rendre accessible aux exploitants (visible dans leur portail)
              </span>
            </label>
          </Card>
        </div>
      </form>
    </FormShell>
  );
}

export default KitDocForm
