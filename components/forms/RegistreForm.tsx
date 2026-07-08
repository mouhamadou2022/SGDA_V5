// components/forms/RegistreForm.tsx
'use client';
// ZÉRO @/components/ui/ import

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  FileText, Upload, X, Calendar,
  Tag, AlertCircle, Save, Trash2, Link as LinkIcon,
  Shield, Scale, User,
} from 'lucide-react';
import { useAppStore, RegistreEntry } from '@/lib/store';
import { registreUtils } from '@/lib/registreUtils';
import { useFormProgress } from '@/hooks/useFormProgress';
import { uploadFile } from '@/lib/datastore';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

interface RegistreFormProps {
  mode: 'creation' | 'modification';
  registreId?: string;
  aerodromeId?: string;
  typeRegistre?: string;
  sourceData?: any;
  onSuccess?: () => void;
  onCancel?: () => void;
  userRole: string;
  onProgressChange?: (n: number) => void;
}

const TYPES_REGISTRES = [
  { id: 'formations', label: 'Formation' },
  { id: 'evenements', label: 'Événement' },
  { id: 'surveillances', label: 'Surveillance' },
  { id: 'certifications', label: 'Certification' },
  { id: 'homologations', label: 'Homologation' },
  { id: 'ecarts', label: 'Écart' },
  { id: 'exploitation', label: 'Exploitation' },
];

const STATUTS_REGISTRE = [
  { id: 'provisoire', label: 'Provisoire', cls: 'badge warning' },
  { id: 'valide', label: 'Validé', cls: 'badge success' },
  { id: 'archive', label: 'Archivé', cls: 'badge neutral' },
];

export function RegistreForm({
  mode, registreId, aerodromeId, typeRegistre = 'formations',
  sourceData, onSuccess, onCancel, userRole, onProgressChange
}: RegistreFormProps) {
  const registreEntries = useAppStore(s => s.registreEntries);
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const user = useAppStore(s => s.user);
  const addRegistreEntry = useAppStore(s => s.addRegistreEntry);
  const updateRegistreEntry = useAppStore(s => s.updateRegistreEntry);

  const dgUser = useMemo(() => {
    const dg = utilisateurs?.find(u => u.role === 'dg' || u.role === 'admin' || u.role === 'directeur')
    if (dg) return dg
    return null
  }, [utilisateurs])

  const [formData, setFormData] = useState({
    type: typeRegistre,
    reference: '',
    date_entree: new Date().toISOString().split('T')[0],
    objet: '',
    description: '',
    aerodrome_id: aerodromeId || '',
    signataire_id: 'DG ANACIM',
    signataire_nom: '',
    fichiers: [] as File[],
    statut: 'provisoire' as 'provisoire' | 'valide' | 'archive',
    lien_id: '',
    lien_type: '',
    // Certification-specific
    numero_certificat: '',
    date_delivrance: '',
    duree: 3,
    statut_officiel: 'en_cours' as 'en_cours' | 'revoque' | 'suspendu' | 'annule',
    exemption_date: '',
    exemption_type: '',
    exemption_numero: '',
    reference_aip: '',
    restriction: '',
    // Homologation-specific
    numero_decision: '',
  });

  const [existingFichiers, setExistingFichiers] = useState<any[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCertification = formData.type === 'certifications' || formData.type === 'certification';
  const isHomologation = formData.type === 'homologations' || formData.type === 'homologation';

  useEffect(() => {
    if (dgUser && !formData.signataire_nom) {
      setFormData(prev => ({ ...prev, signataire_nom: `${dgUser.prenom} ${dgUser.nom}` }))
    }
  }, [dgUser])

  const mapType = (t: string) => {
    if (t === 'certification' || t === 'certifications') return 'certifications'
    if (t === 'homologation' || t === 'homologations') return 'homologations'
    if (t === 'formation' || t === 'formations') return 'formations'
    if (t === 'evenement' || t === 'evenements') return 'evenements'
    if (t === 'surveillance' || t === 'surveillances') return 'surveillances'
    if (t === 'ecart' || t === 'ecarts') return 'ecarts'
    return t
  }

  useEffect(() => {
    if (mode === 'modification' && registreId) {
      const registre = registreEntries?.find(r => r.id === registreId) as any;
      if (registre) {
        const m = registre.metadata || {}
        setFormData({
          type: mapType(registre.type) || mapType(typeRegistre),
          reference: registre.reference || '',
          date_entree: registre.date_entree?.split('T')[0] || new Date().toISOString().split('T')[0],
          objet: registre.titre || registre.objet || '',
          description: registre.description || '',
          aerodrome_id: registre.aerodrome_id || '',
          signataire_id: registre.signataire_id || '',
          signataire_nom: registre.signataire_nom || '',
          fichiers: [],
          statut: registre.statut || 'provisoire',
          lien_id: registre.source_id || registre.lien_id || '',
          lien_type: registre.source_type || registre.lien_type || '',
          numero_certificat: m.numero_certificat || '',
          date_delivrance: m.date_delivrance?.slice(0, 10) || '',
          duree: m.duree ?? 3,
          statut_officiel: m.statut_officiel || 'en_cours',
          exemption_date: m.exemption?.date || '',
          exemption_type: m.exemption?.type || '',
          exemption_numero: m.exemption?.numero || '',
          reference_aip: m.reference_aip || '',
          restriction: m.restriction || '',
          numero_decision: m.numero_decision || '',
        });
        setExistingFichiers(registre.fichiers || []);
      }
    } else if (sourceData) {
      // Si sourceData est déjà un RegistreEntry (venant de la modification)
      if (sourceData.metadata) {
        const m = sourceData.metadata as any
        setFormData(prev => ({
          ...prev,
          type: mapType(sourceData.type) || prev.type,
          objet: sourceData.titre || '',
          description: sourceData.description || '',
          lien_id: sourceData.source_id || '',
          lien_type: sourceData.source_type || '',
          numero_certificat: m.numero_certificat || '',
          numero_decision: m.numero_decision || '',
          date_delivrance: m.date_delivrance?.slice(0, 10) || '',
          duree: m.duree ?? 3,
          statut_officiel: m.statut_officiel || 'en_cours',
          reference_aip: m.reference_aip || '',
          restriction: m.restriction || '',
          exemption_date: m.exemption?.date || '',
          exemption_type: m.exemption?.type || '',
          exemption_numero: m.exemption?.numero || '',
        }));
        setExistingFichiers(sourceData.fichiers || []);
      } else {
        const isCert = sourceData.statut_global === 'certifie' || sourceData.statut_global === 'en_cours' && sourceData.phase_active <= 5
        const isHomo = sourceData.statut_global === 'homologue' || sourceData.statut_global === 'en_cours' && !isCert
        const prefix = sourceData.statut_global === 'certifie' ? 'Certification' : sourceData.statut_global === 'homologue' ? 'Homologation' : ''
        setFormData(prev => ({
          ...prev,
          type: isCert ? 'certifications' : 'homologations',
          objet: prefix
            ? `${prefix} ${sourceData.numero_cert || sourceData.numero_decision || sourceData.reference || ''}`
            : (sourceData.titre || sourceData.type || ''),
          description: prefix
            ? `${prefix === 'Certification' ? 'Certifiée' : 'Délivrée'} le ${sourceData.date_delivrance?.slice(0, 10) || '—'} — Phase ${sourceData.phase_active}/${sourceData.phase_active === 5 ? 5 : 3}`
            : (sourceData.description || sourceData.objectifs || ''),
          lien_id: sourceData.id,
          lien_type: isCert ? 'certification' : 'homologation',
          numero_certificat: sourceData.numero_cert || '',
          numero_decision: sourceData.numero_decision || '',
          date_delivrance: sourceData.date_delivrance?.slice(0, 10) || '',
          duree: sourceData.date_expiration && sourceData.date_delivrance
            ? Math.round((new Date(sourceData.date_expiration).getTime() - new Date(sourceData.date_delivrance).getTime()) / 31536000000)
            : 3,
          statut_officiel: sourceData.statut_global === 'certifie' || sourceData.statut_global === 'homologue'
            ? 'en_cours' : (sourceData.statut_global === 'suspendu' ? 'suspendu' : 'en_cours'),
          reference_aip: sourceData.phases_data?.phase5?.reference_aip || '',
          restriction: sourceData.phases_data?.phase4?.limitations || sourceData.phases_data?.phase4?.conditions_exploitation || sourceData.phases_data?.phase3?.conditions_exploitation || '',
        }));
      }
    }
  }, [mode, registreId, sourceData, registreEntries, typeRegistre]);

  const validerFormulaire = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!isCertification && !isHomologation) {
      if (!formData.objet.trim()) newErrors.objet = "L'objet est requis";
      if (!formData.description.trim()) newErrors.description = "La description est requise";
    }
    if (!formData.date_entree) newErrors.date_entree = "La date est requise";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter(f => f.size <= 10 * 1024 * 1024);
      const invalidFiles = newFiles.filter(f => f.size > 10 * 1024 * 1024);
      if (invalidFiles.length > 0) alert(`${invalidFiles.length} fichier(s) dépassent la taille maximale de 10 Mo`);
      setFormData({ ...formData, fichiers: [...formData.fichiers, ...validFiles] });
    }
  };

  const removeFile = (index: number) => setFormData({ ...formData, fichiers: formData.fichiers.filter((_, i) => i !== index) });
  const removeExistingFile = (index: number) => setExistingFichiers(existingFichiers.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validerFormulaire()) return;
    setIsSubmitting(true);
    try {
      const entryId = crypto.randomUUID()
      const now = new Date().toISOString()

      // Upload des nouveaux fichiers vers Supabase Storage
      const uploadedFiles = await Promise.all(
        formData.fichiers.map(async file => {
          const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
          const storagePath = `registre/${entryId}/${safeName}`
          const result = await uploadFile('documents', storagePath, file)
          if (result.error) throw new Error(result.error)
          return {
            nom: file.name,
            url: result.data!.url,
            taille: file.size,
            type: file.type,
          }
        })
      );
      const tousFichiers = [...existingFichiers, ...uploadedFiles];
      const reference = formData.reference ||
        registreUtils.genererReference(formData.type, new Date().getFullYear(), (registreEntries?.length || 0) + 1);

      const entryType = formData.type === 'certifications' ? 'certification' :
            formData.type === 'homologations' ? 'homologation' :
            formData.type === 'formations' ? 'formation' :
            formData.type === 'evenements' ? 'evenement' :
            formData.type === 'surveillances' ? 'surveillance' :
            formData.type === 'ecarts' ? 'ecart' : 'document'

      const buildRegistreEntry = (): RegistreEntry => ({
        id: entryId,
        type: entryType,
        reference,
        titre: formData.objet,
        description: formData.description,
        date_entree: formData.date_entree,
        aerodrome_id: formData.aerodrome_id || undefined,
        fichiers: tousFichiers.map(f => ({ nom: f.nom, url: f.url })),
        timeline: [],
        statut: formData.statut === 'archive' ? 'archive' : 'valide',
        auto_generated: false,
        source_id: formData.lien_id || undefined,
        source_type: formData.lien_type || undefined,
        metadata: formData.lien_type === 'certification' ? {
          numero_certificat: formData.numero_certificat,
          date_delivrance: formData.date_delivrance,
          duree: formData.duree,
          statut_officiel: formData.statut_officiel,
          exemption: formData.exemption_date ? {
            date: formData.exemption_date,
            type: formData.exemption_type,
            numero: formData.exemption_numero,
          } : undefined,
          reference_aip: formData.reference_aip,
          restriction: formData.restriction,
        } : formData.lien_type === 'homologation' ? {
          numero_decision: formData.numero_decision,
          date_delivrance: formData.date_delivrance,
          statut_officiel: formData.statut_officiel,
          exemption: formData.exemption_date ? {
            date: formData.exemption_date,
            type: formData.exemption_type,
            numero: formData.exemption_numero,
          } : undefined,
          restriction: formData.restriction,
        } : undefined,
        created_at: now,
        created_by: user?.id || '',
      })

      if (mode === 'creation') {
        const entry = buildRegistreEntry()
        await addRegistreEntry(entry)
      } else if (registreId) {
        await updateRegistreEntry(registreId, buildRegistreEntry())
      }

      onSuccess?.();
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      alert('Une erreur est survenue lors de la sauvegarde');
    } finally {
      setIsSubmitting(false);
    }
  };

  const progress = useFormProgress(formData as Record<string, unknown>, [
    'date_entree',
    ...(isCertification || isHomologation
      ? ['numero_certificat' as string, 'numero_decision' as string]
      : ['objet', 'description']),
  ])

  const onProgressRef = useRef(onProgressChange)
  onProgressRef.current = onProgressChange
  useEffect(() => { onProgressRef.current?.(progress) }, [progress])

  return (
    <div className="form-container animate-fade-up" data-role={userRole} data-module="registre-form">
      <form onSubmit={handleSubmit}>
        <div className="space-y-4 animate-fade-in">
          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Détails de l'entrée</p>
              <div className="form-grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-field">
                  <label className={labelClass}>Type de registre</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    disabled={mode === 'modification' || isCertification || isHomologation || !!sourceData}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    {TYPES_REGISTRES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>

                {!isCertification && !isHomologation && (
                <div className="form-field">
                  <label className={labelClass}>
                    <Calendar className="w-4 h-4" />Date <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.date_entree}
                    onChange={e => setFormData({ ...formData, date_entree: e.target.value })}
                    className={`form-input ${focusClass}${errors.date_entree ? ' border-danger' : ''}`}
                  />
                  {errors.date_entree && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.date_entree}</p>}
                </div>
                )}
              </div>

              {!isCertification && !isHomologation && (
                <div className="form-field">
                  <label className={labelClass}>
                    <Tag className="w-4 h-4" />Objet <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.objet}
                    onChange={e => setFormData({ ...formData, objet: e.target.value })}
                    placeholder="Objet de l'entrée"
                    className={`form-input ${focusClass}${errors.objet ? ' border-danger' : ''}`}
                  />
                  {errors.objet && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.objet}</p>}
                </div>
              )}

              {!isCertification && !isHomologation && (
              <div className="form-field">
                <label className={labelClass}>Description détaillée <span className="text-danger">*</span></label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description complète..."
                  rows={4}
                  className={`form-textarea ${focusClass}${errors.description ? ' border-danger' : ''}`}
                />
                {errors.description && <p className="field-error flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.description}</p>}
              </div>
              )}

              <div className="form-grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="form-field">
                  <label className={labelClass}>Aérodrome</label>
                  <select
                    value={formData.aerodrome_id}
                    onChange={e => setFormData({ ...formData, aerodrome_id: e.target.value })}
                    disabled={isCertification || isHomologation || !!sourceData}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    <option value="N/A">Non spécifié</option>
                    {aerodromes?.map(a => (
                      <option key={a.id} value={a.id}>{a.code_oaci} — {a.nom}</option>
                    ))}
                  </select>
                </div>

                {!isCertification && !isHomologation && (
                <div className="form-field">
                  <label className={labelClass}>Statut</label>
                  <select
                    value={formData.statut}
                    onChange={e => setFormData({ ...formData, statut: e.target.value as any })}
                    className={`form-select ${focusClass}`}
                    style={selectStyle}
                  >
                    {STATUTS_REGISTRE.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                )}
              </div>

              {/* Signataire */}
              <div className="p-3 bg-role-primary-soft rounded-lg space-y-3">
                <p className="text-xs font-semibold text-role-primary uppercase tracking-wide">
                  {isCertification || isHomologation ? 'DG ANACIM (signataire)' : 'Signataire'}
                </p>
                <div className="form-grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="form-field">
                    <label className={labelClass}>ID Signataire</label>
                    <input
                      type="text"
                      value={formData.signataire_id}
                      onChange={e => setFormData({ ...formData, signataire_id: e.target.value })}
                      placeholder={isCertification || isHomologation ? 'DG ANACIM' : "ID de l'utilisateur"}
                      className={`form-input ${focusClass}`}
                    />
                  </div>
                  <div className="form-field">
                    <label className={labelClass}>Nom du signataire</label>
                    <input
                      type="text"
                      value={formData.signataire_nom}
                      onChange={e => setFormData({ ...formData, signataire_nom: e.target.value })}
                      placeholder={dgUser ? `${dgUser.prenom} ${dgUser.nom}` : 'Nom complet'}
                      className={`form-input ${focusClass}`}
                    />
                  </div>
                </div>
                {dgUser && (isCertification || isHomologation) && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <User className="w-3 h-3" /> {dgUser.prenom} {dgUser.nom} ({dgUser.role})
                  </p>
                )}
              </div>

              {isCertification && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5" /> Données de certification
                  </p>
                  <div className="form-grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="form-field">
                      <label className="filter-label">Numéro de certificat</label>
                      <input type="text" value={formData.numero_certificat}
                        onChange={e => setFormData({ ...formData, numero_certificat: e.target.value })}
                        placeholder="Ex: 02122/ANACIM/DG" className={`form-input ${focusClass}`} />
                    </div>
                    <div className="form-field">
                      <label className="filter-label">Date de délivrance</label>
                      <input type="date" value={formData.date_delivrance}
                        onChange={e => setFormData({ ...formData, date_delivrance: e.target.value })}
                        className={`form-input ${focusClass}`} />
                    </div>
                    <div className="form-field">
                      <label className="filter-label">Durée (ans)</label>
                      <input type="number" value={formData.duree}
                        onChange={e => setFormData({ ...formData, duree: Number(e.target.value) })}
                        min={1} max={10} className={`form-input ${focusClass}`} />
                    </div>
                  </div>
                  <div className="form-grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="form-field">
                      <label className="filter-label">Référence AIP</label>
                      <input type="text" value={formData.reference_aip}
                        onChange={e => setFormData({ ...formData, reference_aip: e.target.value })}
                        placeholder="Ex: AIP Sénégal AD 1.5" className={`form-input ${focusClass}`} />
                    </div>
                    <div className="form-field">
                      <label className="filter-label">Statut officiel</label>
                      <select value={formData.statut_officiel}
                        onChange={e => setFormData({ ...formData, statut_officiel: e.target.value as any })}
                        className={`form-select ${focusClass}`} style={selectStyle}>
                        <option value="en_cours">En cours</option>
                        <option value="revoque">Révoqué</option>
                        <option value="suspendu">Suspendu</option>
                        <option value="annule">Annulé</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">Restriction éventuelle</label>
                    <textarea value={formData.restriction}
                      onChange={e => setFormData({ ...formData, restriction: e.target.value })}
                      rows={2} placeholder="Limitations d'exploitation, conditions particulières..."
                      className={`form-textarea ${focusClass}`} />
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-amber-100">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Exemption</p>
                    <div className="form-grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="form-field">
                        <label className="filter-label">Date</label>
                        <input type="date" value={formData.exemption_date}
                          onChange={e => setFormData({ ...formData, exemption_date: e.target.value })}
                          className={`form-input ${focusClass}`} />
                      </div>
                      <div className="form-field">
                        <label className="filter-label">Type</label>
                        <input type="text" value={formData.exemption_type}
                          onChange={e => setFormData({ ...formData, exemption_type: e.target.value })}
                          placeholder="Type d'exemption" className={`form-input ${focusClass}`} />
                      </div>
                      <div className="form-field">
                        <label className="filter-label">Numéro</label>
                        <input type="text" value={formData.exemption_numero}
                          onChange={e => setFormData({ ...formData, exemption_numero: e.target.value })}
                          placeholder="N° exemption" className={`form-input ${focusClass}`} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isHomologation && (
                <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg space-y-3">
                  <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide flex items-center gap-1">
                    <Scale className="w-3.5 h-3.5" /> Données d'homologation
                  </p>
                  <div className="form-grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="form-field">
                      <label className="filter-label">Numéro de décision</label>
                      <input type="text" value={formData.numero_decision}
                        onChange={e => setFormData({ ...formData, numero_decision: e.target.value })}
                        placeholder="Ex: 02122/ANACIM/DG" className={`form-input ${focusClass}`} />
                    </div>
                    <div className="form-field">
                      <label className="filter-label">Date de délivrance</label>
                      <input type="date" value={formData.date_delivrance}
                        onChange={e => setFormData({ ...formData, date_delivrance: e.target.value })}
                        className={`form-input ${focusClass}`} />
                    </div>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">Statut officiel</label>
                    <select value={formData.statut_officiel}
                      onChange={e => setFormData({ ...formData, statut_officiel: e.target.value as any })}
                      className={`form-select ${focusClass}`} style={selectStyle}>
                      <option value="en_cours">En cours</option>
                      <option value="revoque">Révoqué</option>
                      <option value="suspendu">Suspendu</option>
                      <option value="annule">Annulé</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">Restriction éventuelle</label>
                    <textarea value={formData.restriction}
                      onChange={e => setFormData({ ...formData, restriction: e.target.value })}
                      rows={2} placeholder="Limitations d'exploitation, conditions particulières..."
                      className={`form-textarea ${focusClass}`} />
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-teal-100">
                    <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">Exemption</p>
                    <div className="form-grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="form-field">
                        <label className="filter-label">Date</label>
                        <input type="date" value={formData.exemption_date}
                          onChange={e => setFormData({ ...formData, exemption_date: e.target.value })}
                          className={`form-input ${focusClass}`} />
                      </div>
                      <div className="form-field">
                        <label className="filter-label">Type</label>
                        <input type="text" value={formData.exemption_type}
                          onChange={e => setFormData({ ...formData, exemption_type: e.target.value })}
                          placeholder="Type d'exemption" className={`form-input ${focusClass}`} />
                      </div>
                      <div className="form-field">
                        <label className="filter-label">Numéro</label>
                        <input type="text" value={formData.exemption_numero}
                          onChange={e => setFormData({ ...formData, exemption_numero: e.target.value })}
                          placeholder="N° exemption" className={`form-input ${focusClass}`} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {formData.lien_id && (
                <div className="p-3 bg-role-primary-soft rounded-lg flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-role-primary" />
                  <span className="text-small">Lié à l'entité : {formData.lien_type} #{formData.lien_id}</span>
                </div>
              )}
          </div>

          {/* Pièces justificatives */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-role-primary uppercase tracking-wide pb-2 border-b border-border">Pièces justificatives</p>
              {existingFichiers.length > 0 && (
                <div className="space-y-2">
                  <p className={labelClass}>Documents déjà joints</p>
                  {existingFichiers.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-role-primary" />
                        <div>
                          <p className="font-medium text-small">{f.nom}</p>
                          <p className="text-xs text-muted-foreground">
                            {f.date_upload ? new Date(f.date_upload).toLocaleDateString('fr-FR') : 'Date inconnue'} • {Math.round(f.taille / 1024)} Ko
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeExistingFile(idx)} className="btn btn-ghost btn-sm text-danger" title="Supprimer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="form-field">
                <p className={labelClass}>Ajouter des documents</p>
                <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-role-primary transition-colors">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    id="registre-files"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  />
                  <label htmlFor="registre-files" className="cursor-pointer flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-muted-foreground" />
                    <span className="text-small font-medium">Cliquez pour ajouter des fichiers</span>
                    <span className="text-xs text-muted-foreground">PDF, Word, images (max 10 Mo)</span>
                  </label>
                </div>
              </div>

              {formData.fichiers.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className={labelClass}>Nouveaux documents à ajouter</p>
                  {formData.fichiers.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-role-primary" />
                        <div>
                          <p className="font-medium text-small">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} Ko</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeFile(idx)} className="btn btn-ghost btn-sm text-danger" title="Supprimer">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary gap-2">
            <X className="w-4 h-4" />Annuler
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary min-w-[140px] gap-2">
            {isSubmitting
              ? <><div className="spinner spinner-sm mr-2 inline-block" />Sauvegarde...</>
              : <><Save className="w-4 h-4 inline mr-2" />{mode === 'creation' ? "Créer l'entrée" : 'Enregistrer'}</>
            }
          </button>
        </div>
      </form>
    </div>
  );
}
