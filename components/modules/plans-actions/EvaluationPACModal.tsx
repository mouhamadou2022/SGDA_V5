// components/modules/plans-actions/EvaluationPACModal.tsx
'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { FileText, X } from 'lucide-react';
import { EvaluationPACForm } from '@/components/forms/EvaluationPACForm';
import { AideMemoirePAC } from './AideMemoirePAC';

interface EvaluationPACModalProps {
  isOpen: boolean;
  onClose: () => void;
  ecartId: string;
  userRole: string;
}

export function EvaluationPACModal({ isOpen, onClose, ecartId, userRole }: EvaluationPACModalProps) {
  const ecarts = useOptimizedStore(s => s.ecarts);
  const ecart = ecarts.find(e => e.id === ecartId);

  if (!ecart || !isOpen) return null;

  return typeof window !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-background rounded-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden border-t-4 border-t-role-primary flex flex-col"
        data-role={userRole}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
          <div className="modal-title flex items-center gap-2">
            <FileText className="w-5 h-5 text-role-primary" />
            Évaluation du PAC - {ecart.reference}
            <AideMemoirePAC type="pac" />
          </div>
          <button type="button" className="action-button" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body overflow-y-auto">
          <EvaluationPACForm
            ecartId={ecartId}
            onSuccess={onClose}
            onCancel={onClose}
            userRole={userRole}
          />
        </div>
      </div>
    </div>,
    document.body
  ) : null;
}

export default EvaluationPACModal;
