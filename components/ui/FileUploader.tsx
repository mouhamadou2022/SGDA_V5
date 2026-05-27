// components/modules/FileUploader.tsx
'use client';

import React, { useRef } from 'react';
import { Upload, X, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileUploaderProps {
  onUpload: (file: { nom: string; url: string }) => void;
  onRemove?: () => void;
  accept?: string;
  maxSize?: number;
  uploadedFile?: { nom: string; url: string } | null;
  userRole?: string;
}

export function FileUploader({ 
  onUpload, 
  onRemove, 
  accept = ".pdf,.jpg,.jpeg,.png", 
  maxSize = 10,
  uploadedFile = null,
  userRole 
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSize * 1024 * 1024) {
      alert(`Le fichier ne doit pas dépasser ${maxSize} MB`);
      return;
    }

    const fakeUrl = URL.createObjectURL(file);
    
    onUpload({
      nom: file.name,
      url: fakeUrl,
    });

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="w-full" data-role={userRole}>
      {uploadedFile ? (
        <div className="flex items-center justify-between p-3 bg-success/10 border border-success/20 rounded-xl">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-success" />
            <div>
              <p className="text-sm font-medium text-foreground">{uploadedFile.nom}</p>
              <p className="text-xs text-success">Fichier uploadé avec succès</p>
            </div>
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="action-button !p-1 hover:text-danger"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <div className="form-upload">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center gap-2"
          >
            <Upload className="w-8 h-8 text-muted" />
            <span className="text-sm text-muted">
              Cliquez pour ajouter un fichier
            </span>
            <span className="text-xs text-muted">
              {accept.replace(/\./g, '').toUpperCase()} (max {maxSize} Mo)
            </span>
          </label>
        </div>
      )}
    </div>
  );
}