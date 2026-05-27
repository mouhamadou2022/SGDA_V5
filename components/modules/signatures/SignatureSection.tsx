// components/modules/signatures/SignatureSection.tsx
'use client';

import React, { useState } from 'react';
import { PenLine, CheckCircle, AlertCircle } from 'lucide-react';
import { SignaturePadComponent } from '@/components/ui/SignaturePad';
import { useAppStore } from '@/lib/store';

interface SignatureSectionProps {
  documentType: 'lettre' | 'certificat' | 'decision';
  documentId: string;
  onSigned?: (signatureUrl: string) => void;
  signataireNom?: string;
  dateSignature?: string;
  disabled?: boolean;
}

export function SignatureSection({
  documentType,
  documentId,
  onSigned,
  signataireNom = "DG ANACIM",
  dateSignature,
  disabled = false,
}: SignatureSectionProps) {
  const user = useAppStore(s => s.user);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signed, setSigned] = useState(!!dateSignature);

  // Vérifier que l'utilisateur est bien le DG ANACIM
  const canSign = user?.role === 'dg_anacim';

  const handleSign = async (signatureUrl: string) => {
    setSigned(true);
    setShowSignaturePad(false);
    onSigned?.(signatureUrl);
  };

  if (signed) {
    return (
      <div className="p-4 bg-success/10 border border-success rounded-lg">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-success" />
          <div>
            <p className="text-small font-medium text-success-800">Document signé</p>
            <p className="text-xs text-success-600">
              Par {signataireNom} le {dateSignature ? new Date(dateSignature).toLocaleDateString('fr-FR') : ''}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="flex items-center gap-3">
          <PenLine className="h-5 w-5 text-gray-400" />
          <div>
            <p className="text-small font-medium text-gray-600">Signature requise</p>
            <p className="text-xs text-gray-500">Cette phase nécessite la signature du DG ANACIM</p>
          </div>
        </div>
      </div>
    );
  }

  // Si l'utilisateur n'est pas le DG, on ne montre pas le bouton de signature
  if (!canSign) {
    return (
      <div className="p-4 bg-warning/10 border border-warning rounded-lg">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-warning" />
          <div>
            <p className="text-small font-medium text-warning-800">En attente de signature</p>
            <p className="text-xs text-warning-600">Seul le DG ANACIM peut signer ce document</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!showSignaturePad ? (
        <button
          type="button"
          onClick={() => setShowSignaturePad(true)}
          disabled={disabled}
          className={`btn btn-primary gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <PenLine className="h-4 w-4" />
          Signer le document
        </button>
      ) : (
        <div className="border border-border rounded-lg p-4 card">
          <SignaturePadComponent
            user={user!}
            documentType={documentType}
            documentId={documentId}
            onSigned={handleSign}
            onCancel={() => setShowSignaturePad(false)}
          />
        </div>
      )}
    </div>
  );
}
