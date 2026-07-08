// components/modules/certification/CertificationDocumentUpload.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, Eye, Loader2 } from 'lucide-react';

interface DocumentUploadProps {
  documents: Record<string, string | boolean>;
  onDocumentChange: (docKey: string, uploaded: boolean, file?: File, fileUrl?: string) => void;
  disabled?: boolean;
  type?: 'certification' | 'homologation';
  userRole?: string;
}

const DOCUMENTS_CERTIFICATION = [
  { key: 'lettre_demande_formelle', label: 'Lettre de demande formelle', required: true },
  { key: 'formulaire_demande_formelle', label: 'Formulaire de demande formelle', required: true },
  { key: 'plan_masse', label: 'Plan de masse', required: true },
  { key: 'plan_situation', label: 'Plan de situation', required: true },
  { key: 'manuel_aerodrome', label: "Manuel d'aérodrome", required: true },
  { key: 'manuel_sgs', label: 'Manuel SGS', required: true },
  { key: 'plan_urgence', label: "Plan d'urgence", required: false },
  { key: 'plan_enlevement', label: "Plan d'enlèvement", required: false },
];

const DOCUMENTS_HOMOLOGATION = [
  { key: 'demande_officielle', label: 'Demande officielle signée', required: true },
  { key: 'caracteristiques_techniques', label: 'Caractéristiques techniques', required: true },
  { key: 'plan_masse', label: 'Plan de masse', required: true },
  { key: 'procedures_locales', label: 'Procédures locales', required: true },
  { key: 'dispositifs_sslia', label: 'Dispositifs SSLIA', required: false },
];

export function CertificationDocumentUpload({ 
  documents, 
  onDocumentChange, 
  disabled = false,
  type = 'certification',
  userRole
}: DocumentUploadProps) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>(() => {
    const urls: Record<string, string> = {};
    for (const [key, val] of Object.entries(documents)) {
      if (typeof val === 'string') urls[key] = val;
    }
    return urls;
  });

  useEffect(() => {
    setFileUrls(prev => {
      const merged = { ...prev };
      for (const [key, val] of Object.entries(documents)) {
        if (typeof val === 'string') merged[key] = val;
      }
      return merged;
    });
  }, [documents]);

  const DOCS = type === 'certification' ? DOCUMENTS_CERTIFICATION : DOCUMENTS_HOMOLOGATION;

  const handleFileUpload = async (docKey: string, file: File) => {
    setUploading(docKey);
    setProgress(0);

    try {
      // Upload vers Supabase Storage
      const { uploadFile } = await import('@/lib/datastore');
      const aerodromeId = window.location.pathname.includes('portail')
        ? (document.querySelector('[data-aerodrome-id]')?.getAttribute('data-aerodrome-id') || 'general')
        : 'general';
      const path = `certifications/documents/${aerodromeId}/${Date.now()}_${file.name}`;
      const result = await uploadFile('documents', path, file);
      if (result.error) throw new Error(result.error);

      const url = result.data?.url || '';
      setFileUrls(prev => ({ ...prev, [docKey]: url }));
      setProgress(100);

      onDocumentChange(docKey, true, file, url);
    } catch (err) {
      console.error('[CertificationDocumentUpload] Upload error:', err);
    } finally {
      setUploading(null);
      setProgress(0);
    }
  };

  const handleRemoveDocument = (docKey: string) => {
    onDocumentChange(docKey, false);
    setFileUrls(prev => {
      const next = { ...prev };
      delete next[docKey];
      return next;
    });
  };

  const totalDocs = DOCS.length;
  const requiredDocs = DOCS.filter(d => d.required).length;
  const uploadedDocs = Object.values(documents).filter(Boolean).length;
  const uploadedRequiredDocs = DOCS.filter(d => d.required && documents[d.key]).length;
  const completude = totalDocs > 0 ? (uploadedDocs / totalDocs) * 100 : 0;
  const requiredCompletude = requiredDocs > 0 ? (uploadedRequiredDocs / requiredDocs) * 100 : 0;
  const isComplete = requiredCompletude === 100;

  return (
    <div className="space-y-5" data-role={userRole}>
      
      {/* Barre de complétude avec classes premium */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-role-primary" />
            <span className="text-small font-medium text-foreground">Documents requis</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`badge ${isComplete ? 'success' : 'warning'}`}>
              {uploadedRequiredDocs}/{requiredDocs}
            </span>
            <span className="text-small text-muted">{Math.round(completude)}%</span>
          </div>
        </div>
        <div className="progress h-2">
          <div 
            className={`progress-bar ${isComplete ? 'progress-eleve' : completude > 50 ? 'progress-moyen' : 'progress-faible'}`}
            style={{ width: `${completude}%` }}
          />
        </div>
        <p className="text-xs text-muted">
          {isComplete ? 'Tous les documents requis sont uploadés' : `${Math.round(100 - requiredCompletude)}% des documents requis manquants`}
        </p>
      </div>

      {/* Liste des documents avec design premium */}
      <div className="space-y-2">
        {DOCS.map((doc) => {
          const isUploaded = documents[doc.key];
          const isRequired = doc.required;
          
          return (
            <div
              key={doc.key}
              className={`p-3 rounded-xl border transition-all duration-300 ${
                isUploaded 
                  ? 'border-success/30 bg-success/5 hover:bg-success/10' 
                  : isRequired 
                    ? 'border-warning/30 bg-warning/5 hover:bg-warning/10' 
                    : 'border-border bg-muted/10 hover:bg-muted/20'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isUploaded ? 'bg-success/20' : isRequired ? 'bg-warning/20' : 'bg-muted/30'
                  }`}>
                    <FileText className={`h-4 w-4 ${
                      isUploaded ? 'text-success' : isRequired ? 'text-warning' : 'text-muted'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-small font-medium text-foreground truncate">
                      {doc.label}
                      {isRequired && <span className="text-danger ml-1">*</span>}
                    </p>
                    {isUploaded && (
                      <p className="text-xs text-success">Document uploadé</p>
                    )}
                    {!isUploaded && isRequired && (
                      <p className="text-xs text-warning">Document requis</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {uploading === doc.key ? (
                    <div className="flex items-center gap-2">
                      <div className="progress w-20 h-1">
                        <div className="progress-bar" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-xs text-muted">{progress}%</span>
                    </div>
                  ) : (
                    <>
                      {isUploaded ? (
                        <div className="flex items-center gap-1">
                          <a
                            href={fileUrls[doc.key] || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`action-button ${disabled ? 'pointer-events-none opacity-50' : ''}`}
                            onClick={e => { if (!fileUrls[doc.key]) e.preventDefault(); }}
                            title="Aperçu"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                          <button
                            className="action-button hover:text-danger"
                            onClick={() => handleRemoveDocument(doc.key)}
                            disabled={disabled}
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={disabled}
                          className="btn btn-secondary gap-1.5 text-xs"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.pdf,.doc,.docx,.jpg,.png';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) handleFileUpload(doc.key, file);
                            };
                            input.click();
                          }}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Uploader
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Message d'alerte si documents manquants */}
      {!isComplete && !disabled && (
        <div className="alert alert-warning animate-fade-up">
          <AlertCircle className="alert-icon" />
          <div className="alert-content">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span>
                {Math.round(requiredCompletude)}% des documents requis sont fournis.
                La phase ne pourra pas être clôturée tant que tous les documents requis ne sont pas uploadés.
              </span>
              <span className="badge warning pulse">
                {requiredDocs - uploadedRequiredDocs} manquant(s)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Message de succès */}
      {isComplete && !disabled && (
        <div className="alert alert-success animate-fade-up">
          <CheckCircle className="alert-icon" />
          <div className="alert-content">
            Tous les documents requis sont uploadés. Vous pouvez clôturer cette phase.
          </div>
        </div>
      )}
    </div>
  );
}