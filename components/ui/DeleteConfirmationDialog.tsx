// components/ui/DeleteConfirmationDialog.tsx
// ✅ R1 : 0 style=, uniquement Tailwind
// ✅ R6 : Handlers React uniquement
// ✅ Design system harmonisé

'use client';

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  itemName?: string;
  warnings?: string[];
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  itemName,
  warnings = [],
}: DeleteConfirmationDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="modal-content max-w-md">
        <AlertDialogHeader className="modal-header">
          <AlertDialogTitle className="modal-title flex items-center gap-2 text-danger">
            <AlertTriangle className="h-5 w-5" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4 text-muted">
            <p>{description}</p>
            {itemName && (
              <p className="code-oaci-badge inline-block mt-2">
                {itemName}
              </p>
            )}
            {warnings.length > 0 && (
              <div className="alert alert-warning mt-3">
                <AlertTriangle className="alert-icon" />
                <div className="alert-content">
                  <p className="alert-title">⚠️ Attention :</p>
                  <ul className="list-disc list-inside space-y-1">
                    {warnings.map((warning, index) => (
                      <li key={index} className="text-warning text-sm">
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="modal-footer">
          <AlertDialogCancel className="btn-secondary">Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="btn-danger"
          >
            Supprimer définitivement
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}