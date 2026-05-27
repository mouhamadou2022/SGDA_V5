'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Trash2, ChevronDown, Eye, Plus, Copy, MoveUp, MoveDown, MessageSquare } from 'lucide-react';

export interface ChefDeBordChecklistItemToolbarProps {
  itemId: string;
  readOnly: boolean;
  showObservationIntegration: boolean;
  hasObservation: boolean;
  onDelete: (id: string) => void;
  onOpenObservation: (id: string) => void;
}

export function ChefDeBordChecklistItemToolbar({
  itemId,
  readOnly,
  showObservationIntegration,
  hasObservation,
  onDelete,
  onOpenObservation,
}: ChefDeBordChecklistItemToolbarProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-1">
      {showObservationIntegration && (
        hasObservation ? (
          <button
            type="button"
            onClick={() => onOpenObservation(itemId)}
            className="btn btn-sm px-2 py-1 gap-1"
            title="Voir les observations"
          >
            <Eye className="w-3 h-3" />
            <span className="text-[10px]">Voir</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenObservation(itemId)}
            className="btn btn-sm px-2 py-1 gap-1"
            title="Ajouter une observation"
          >
            <MessageSquare className="w-3 h-3" />
            <span className="text-[10px]">Obs.</span>
          </button>
        )
      )}

      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => onDelete(itemId)}
            className="btn btn-sm px-2 py-1 btn-danger"
            title="Supprimer"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              className="btn btn-sm px-2 py-1"
              title="Plus"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            {showMenu && (
              <div className="dropdown-menu absolute right-0 top-full mt-1 z-50 min-w-[150px]">
                <button className="dropdown-item w-full text-left">
                  <Copy className="w-3 h-3 mr-2" />
                  Dupliquer
                </button>
                <button className="dropdown-item w-full text-left">
                  <MoveUp className="w-3 h-3 mr-2" />
                  Déplacer vers le haut
                </button>
                <button className="dropdown-item w-full text-left">
                  <MoveDown className="w-3 h-3 mr-2" />
                  Déplacer vers le bas
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
