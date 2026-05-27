// components/forms/CodeAccesForm.tsx
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Key, Copy, CheckCircle2, AlertCircle, Calendar, FileText,
  X, RefreshCw, Eye, EyeOff, User, Phone, Mail,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { codeAccesUtils, CODE_TYPES } from '@/lib/codeAccesUtils';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
};
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide";

interface CodeAccesFormProps {
  mode: 'generation' | 'revocation';
  codeId?: string;
  aerodromeId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  userRole: string;
  onProgressChange?: (n: number) => void;
}

export function CodeAccesForm({
  mode,
  codeId,
  aerodromeId,
  onSuccess,
  onCancel,
  userRole,
  onProgressChange,
}: CodeAccesFormProps) {
  const codesAcces = useAppStore(s => s.codesAcces)
  const aerodromes = useAppStore(s => s.aerodromes)
  const genererCode = useAppStore(s => s.genererCode)
  const revoquerCode = useAppStore(s => s.revoquerCode);

  const [formData, setFormData] = useState({
    aerodrome_id: aerodromeId || '',
    code_type: 'DG',
    dg_prenom: '',
    dg_nom: '',
    focal_prenom: '',
    focal_nom: '',
    staff_prenom: '',
    staff_nom: '',
    telephone: '',
    email: '',
    description: '',
    expires_at: '',
    code_genere: '',
  });

  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [codesExistants, setCodesExistants] = useState<string[]>([]);

  // Charger les codes existants pour éviter les doublons
  useEffect(() => {
    const hashes = codesAcces?.map(c => c.code) || [];
    setCodesExistants(hashes);
  }, [codesAcces]);

  // Générer un code automatiquement
  // useCallback pour référence stable dans les useEffect
  const genererNouveauCode = useCallback(() => {
    const aerodrome = aerodromes.find(a => a.id === formData.aerodrome_id)
    const codeOaci = aerodrome?.code_oaci || 'XXXX'
    const code = codeAccesUtils.genererCodeUnique(codesExistants, codeOaci, formData.code_type)
    setFormData(prev => ({ ...prev, code_genere: code }))
  }, [aerodromes, codesExistants, formData.aerodrome_id, formData.code_type])

  // Générer dès qu'un aérodrome est sélectionné (si pas encore de code)
  useEffect(() => {
    if (mode === 'generation' && formData.aerodrome_id && !formData.code_genere) {
      genererNouveauCode()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, formData.aerodrome_id])

  // Regénérer si le type de code change
  useEffect(() => {
    if (mode === 'generation' && formData.aerodrome_id) {
      genererNouveauCode()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.code_type])

  const onProgressRef = useRef(onProgressChange)
  onProgressRef.current = onProgressChange
  useEffect(() => {
    const filled = [formData.aerodrome_id, formData.code_type, formData.code_genere].filter(Boolean).length
    onProgressRef.current?.(Math.round((filled / 3) * 100))
  }, [formData.aerodrome_id, formData.code_type, formData.code_genere])

  const validerFormulaire = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.aerodrome_id) {
      newErrors.aerodrome_id = "L'aérodrome est requis";
    }

    if (formData.expires_at) {
      const dateExp = new Date(formData.expires_at);
      const aujourdhui = new Date();
      if (dateExp <= aujourdhui) {
        newErrors.expires_at = "La date d'expiration doit être future";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (mode === 'revocation') {
      setIsSubmitting(true)
      try {
        await revoquerCode(codeId!)
        onSuccess?.()
      } catch (error) {
        console.error('Erreur révocation:', error)
        setErrors({ global: 'Une erreur est survenue lors de la révocation' })
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    if (!validerFormulaire()) return

    // Vérifier le format du code avant envoi
    if (!codeAccesUtils.validerFormatCode(formData.code_genere)) {
      setErrors({ code_genere: 'Format de code invalide — régénérez le code' })
      return
    }

    setIsSubmitting(true)
    try {
      await genererCode(
        formData.aerodrome_id,
        formData.description,
        formData.expires_at || undefined,
        formData.code_genere,
        formData.code_type,
        formData.dg_prenom,
        formData.dg_nom,
        formData.focal_prenom,
        formData.focal_nom,
        formData.staff_prenom,
        formData.staff_nom,
        formData.telephone,
        formData.email,
      )
      onSuccess?.()
    } catch (error) {
      console.error('Erreur génération:', error)
      setErrors({ global: 'Une erreur est survenue lors de la génération' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(formData.code_genere);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const aerodrome = aerodromes.find(a => a.id === formData.aerodrome_id);

  if (mode === 'revocation') {
    return (
      <div className="form-container max-w-md mx-auto space-y-6 text-center" data-role={userRole}>
        <div className="mx-auto w-12 h-12 bg-danger/20 rounded-full flex items-center justify-center">
          <Key className="w-6 h-6 text-danger" />
        </div>
        <h3 className="heading-3 text-xl">Révoquer le code d'accès</h3>
        <AlertCircle className="w-12 h-12 mx-auto text-warning" />
        <p className="text-body text-gray-600">
          Êtes-vous sûr de vouloir révoquer ce code d'accès ?
        </p>
        <p className="text-sm text-gray-500">
          Cette action est irréversible. L'exploitant sera immédiatement déconnecté.
        </p>
        {errors.global && (
          <p className="field-error flex items-center gap-1 justify-center">
            <AlertCircle className="w-3 h-3" />{errors.global}
          </p>
        )}
        <div className="flex justify-center gap-4 pt-2">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <><div className="spinner spinner-sm mr-2" />Révocation...</>
            ) : (
              'Confirmer la révocation'
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="form-container" data-role={userRole}>
      <form onSubmit={handleSubmit}>
        <div className="space-y-6">

          {/* Aérodrome */}
          <div className="form-field">
            <label className={labelClass}>
              Aérodrome <span className="text-danger">*</span>
            </label>
            <select
              className={`form-select ${focusClass}${errors.aerodrome_id ? ' border-danger' : ''}`}
              style={selectStyle}
              value={formData.aerodrome_id}
              onChange={(e) => setFormData({ ...formData, aerodrome_id: e.target.value })}
            >
              <option value="">Sélectionner un aérodrome</option>
              {aerodromes?.map(a => (
                <option key={a.id} value={a.id}>
                  {a.code_oaci} — {a.nom}
                </option>
              ))}
            </select>
            {errors.aerodrome_id && (
              <p className="field-error flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{errors.aerodrome_id}
              </p>
            )}
          </div>

          {/* Type de code */}
          <div className="form-field">
            <label className={labelClass}>
              Type de code <span className="text-danger">*</span>
            </label>
            <select
              className={`form-select ${focusClass}`}
              style={selectStyle}
              value={formData.code_type}
              onChange={(e) => setFormData({ ...formData, code_type: e.target.value })}
            >
              {CODE_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Identité du titulaire */}
          <div className="bg-role-primary-soft rounded-xl border border-border p-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-role-primary" />
              <label className={labelClass}>Identité du titulaire</label>
            </div>

            {(formData.code_type === 'DG' || formData.code_type === 'ALL') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label className="text-xs font-medium text-role-primary">Prénom du DG</label>
                  <input
                    type="text"
                    className={`form-input ${focusClass}`}
                    value={formData.dg_prenom}
                    onChange={(e) => setFormData({ ...formData, dg_prenom: e.target.value })}
                    placeholder="Prénom"
                  />
                </div>
                <div className="form-field">
                  <label className="text-xs font-medium text-role-primary">Nom du DG</label>
                  <input
                    type="text"
                    className={`form-input ${focusClass}`}
                    value={formData.dg_nom}
                    onChange={(e) => setFormData({ ...formData, dg_nom: e.target.value })}
                    placeholder="Nom"
                  />
                </div>
              </div>
            )}

            {(formData.code_type === 'FP' || formData.code_type === 'ALL') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label className="text-xs font-medium text-role-primary">Prénom du Point Focal</label>
                  <input
                    type="text"
                    className={`form-input ${focusClass}`}
                    value={formData.focal_prenom}
                    onChange={(e) => setFormData({ ...formData, focal_prenom: e.target.value })}
                    placeholder="Prénom"
                  />
                </div>
                <div className="form-field">
                  <label className="text-xs font-medium text-role-primary">Nom du Point Focal</label>
                  <input
                    type="text"
                    className={`form-input ${focusClass}`}
                    value={formData.focal_nom}
                    onChange={(e) => setFormData({ ...formData, focal_nom: e.target.value })}
                    placeholder="Nom"
                  />
                </div>
              </div>
            )}

            {(formData.code_type === 'STAFF' || formData.code_type === 'ALL') && (
              <div className="grid grid-cols-2 gap-4">
                <div className="form-field">
                  <label className="text-xs font-medium text-role-primary">Prénom du Personnel</label>
                  <input
                    type="text"
                    className={`form-input ${focusClass}`}
                    value={formData.staff_prenom}
                    onChange={(e) => setFormData({ ...formData, staff_prenom: e.target.value })}
                    placeholder="Prénom"
                  />
                </div>
                <div className="form-field">
                  <label className="text-xs font-medium text-role-primary">Nom du Personnel</label>
                  <input
                    type="text"
                    className={`form-input ${focusClass}`}
                    value={formData.staff_nom}
                    onChange={(e) => setFormData({ ...formData, staff_nom: e.target.value })}
                    placeholder="Nom"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Coordonnées */}
          <div className="grid grid-cols-2 gap-4">
            <div className="form-field">
              <label className={labelClass}><Phone className="w-3.5 h-3.5 inline mr-1" />Téléphone</label>
              <input type="tel" className={`form-input ${focusClass}`} value={formData.telephone} onChange={e => setFormData({ ...formData, telephone: e.target.value })} placeholder="+221 77 123 45 67" />
            </div>
            <div className="form-field">
              <label className={labelClass}><Mail className="w-3.5 h-3.5 inline mr-1" />Email</label>
              <input type="email" className={`form-input ${focusClass}${errors.email ? ' border-danger' : ''}`} value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="exploitant@exemple.com" />
              {errors.email && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.email}</p>}
            </div>
          </div>

          {/* Description */}
          <div className="form-field">
            <label className={`${labelClass} flex items-center gap-1`}>
              <FileText className="w-4 h-4" />
              Description
            </label>
            <textarea
              className={`form-textarea ${focusClass}`}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Ex: Code pour accès portail exploitant - GOBD"
              rows={2}
            />
            <p className="field-description">Description optionnelle pour identifier l'utilisation du code</p>
          </div>

          {/* Date d'expiration */}
          <div className="form-field">
            <label className={`${labelClass} flex items-center gap-1`}>
              <Calendar className="w-4 h-4" />
              Date d'expiration (optionnelle)
            </label>
            <input
              type="date"
              className={`form-input ${focusClass}${errors.expires_at ? ' border-danger' : ''}`}
              value={formData.expires_at}
              onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
            />
            {errors.expires_at && (
              <p className="field-error flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />{errors.expires_at}
              </p>
            )}
            <p className="field-description">Laissez vide pour un code sans expiration</p>
          </div>

          {/* Code généré */}
          <div className="bg-role-primary-soft rounded-xl border border-border p-4">
            <div className="flex items-center justify-between mb-2">
              <label className={labelClass}>Code d'accès généré</label>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={genererNouveauCode}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Régénérer
              </button>
            </div>

            <div className="relative">
              <input
                value={formData.code_genere}
                readOnly
                type={showCode ? 'text' : 'password'}
                className={`form-input text-lg text-center font-mono pr-20 ${focusClass}`}
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="action-button p-1"
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="action-button p-1"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="alert alert-warning mt-3">
              <AlertCircle className="alert-icon w-4 h-4" />
              <div className="alert-content">
                <div className="alert-description">
                  Ce code ne sera affiché qu'une seule fois. Copiez-le et transmettez-le à l'exploitant de manière sécurisée.
                </div>
              </div>
            </div>
            {errors.code_genere && (
              <p className="field-error flex items-center gap-1 mt-2">
                <AlertCircle className="w-3 h-3" />{errors.code_genere}
              </p>
            )}
          </div>

          {/* Informations sur l'aérodrome sélectionné */}
          {aerodrome && (
            <div className="p-3 bg-role-primary-soft rounded-lg">
              <p className="text-sm text-foreground">
                <strong>Code pour :</strong> {aerodrome.nom} ({aerodrome.code_oaci})
              </p>
            </div>
          )}

        </div>

        <div className="form-actions">
          {errors.global && (
            <p className="field-error flex items-center gap-1 mr-auto">
              <AlertCircle className="w-3 h-3" />{errors.global}
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            <X className="w-4 h-4 mr-2" />
            Annuler
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <><div className="spinner spinner-sm mr-2" />Génération...</>
            ) : (
              <><Key className="w-4 h-4 mr-2" />Générer le code</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
