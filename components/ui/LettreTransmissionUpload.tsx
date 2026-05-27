// components/ui/LettreTransmissionUpload.tsx
'use client';

import React, { useState } from 'react';
import { Upload, Eye, Trash2, CheckCircle, Loader2, Mail } from 'lucide-react';

export interface LettreTransmissionUploadProps {
  label?: string;
  currentUrl?: string | null;
  currentFileName?: string | null;
  currentDate?: string | null;
  onUpload: (url: string, fileName: string, date: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
  required?: boolean;
  accept?: string;
}

export function LettreTransmissionUpload({
  label = 'Lettre de transmission',
  currentUrl,
  currentFileName,
  currentDate,
  onUpload,
  onRemove,
  disabled = false,
  required = true,
  accept = '.pdf,.doc,.docx',
}: LettreTransmissionUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (file: File) => {
    setUploading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const url = URL.createObjectURL(file);
    onUpload(url, file.name, new Date().toISOString());
    setUploading(false);
  };

  const triggerFileInput = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFileSelect(file);
    };
    input.click();
  };

  const isUploaded = !!currentUrl;

  return (
    <div className={`p-3 rounded-xl border transition-all ${
      isUploaded
        ? 'border-success/30 bg-success/5'
        : required
          ? 'border-warning/30 bg-warning/5'
          : 'border-border bg-muted/5'
    }`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isUploaded ? 'bg-success/20' : required ? 'bg-warning/20' : 'bg-muted/30'
          }`}>
            {isUploaded
              ? <CheckCircle className="h-4 w-4 text-success" />
              : <Mail className="h-4 w-4 text-warning" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-small font-medium text-foreground">
              {label}
              {required && <span className="text-danger ml-1">*</span>}
            </p>
            {currentFileName && (
              <p className="text-xs text-success truncate">{currentFileName}</p>
            )}
            {currentDate && (
              <p className="text-xs text-muted">
                Chargé le {new Date(currentDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
            )}
            {!isUploaded && (
              <p className="text-xs text-muted">Charger le document signé (PDF)</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {uploading ? (
            <div className="flex items-center gap-2 px-2">
              <Loader2 className="h-4 w-4 text-role-primary animate-spin" />
              <span className="text-xs text-muted">Chargement...</span>
            </div>
          ) : isUploaded ? (
            <>
              <button
                className="action-button"
                title="Ouvrir"
                onClick={() => window.open(currentUrl!, '_blank')}
                disabled={disabled}
              >
                <Eye className="h-4 w-4" />
              </button>
              {!disabled && onRemove && (
                <button
                  className="action-button hover:text-danger"
                  title="Remplacer"
                  onClick={onRemove}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </>
          ) : !disabled ? (
            <button
              type="button"
              className="btn btn-secondary gap-1.5 text-xs"
              onClick={triggerFileInput}
            >
              <Upload className="h-3.5 w-3.5" />
              Charger
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
