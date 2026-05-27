import React, { useState } from 'react'
import { X, AlertTriangle, Trash2, Eye, ChevronDown, ChevronUp } from 'lucide-react'

interface CascadeItem {
  type: string
  count: number
  status?: string
  kept?: boolean
}

interface ConfirmationSuppressionAvanceeProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  entity: string
  entityName: string
  cascadeItems: CascadeItem[]
  isLoading?: boolean
}

export default function ConfirmationSuppressionAvancee({
  isOpen,
  onClose,
  onConfirm,
  entity,
  entityName,
  cascadeItems,
  isLoading = false
}: ConfirmationSuppressionAvanceeProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [doubleConfirm, setDoubleConfirm] = useState(false)

  if (!isOpen) return null

  const itemsToDelete = cascadeItems.filter(item => !item.kept)
  const itemsKept = cascadeItems.filter(item => item.kept)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header border-b border-danger/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-danger/10 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-danger" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-danger">
                Suppression {entity}
              </h2>
              <p className="text-sm text-muted-foreground">
                Cette action est irréversible
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="modal-close-btn"
            disabled={isLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body space-y-6">
          {/* Entity Info */}
          <div className="bg-danger/5 border border-danger/20 rounded-lg p-4">
            <p className="font-semibold text-danger mb-1">
              Vous êtes sur le point de supprimer :
            </p>
            <p className="text-lg font-bold">{entityName}</p>
          </div>

          {/* Cascade Preview */}
          {itemsToDelete.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-danger" />
                Éléments qui seront supprimés
              </h3>
              
              <div className="space-y-2">
                {itemsToDelete.map((item, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between p-3 bg-danger/5 border border-danger/20 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-danger" />
                      <span className="font-medium">{item.type}</span>
                      {item.status && (
                        <span className="text-xs px-2 py-1 bg-muted rounded">
                          {item.status}
                        </span>
                      )}
                    </div>
                    <span className="badge badge-danger">
                      {item.count} élément(s)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kept Items */}
          {itemsKept.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-sm font-semibold mb-3 hover:text-primary transition-colors"
              >
                <Eye className="w-4 h-4" />
                Éléments qui seront conservés (archivés/terminés)
                {showDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              
              {showDetails && (
                <div className="space-y-2 ml-6">
                  {itemsKept.map((item, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-3 bg-success/5 border border-success/20 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-success" />
                        <span className="font-medium">{item.type}</span>
                        {item.status && (
                          <span className="text-xs px-2 py-1 bg-muted rounded">
                            {item.status}
                          </span>
                        )}
                      </div>
                      <span className="badge badge-success">
                        {item.count} élément(s)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Double Confirmation */}
          <div className="bg-warning/5 border border-warning/20 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={doubleConfirm}
                onChange={(e) => setDoubleConfirm(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm">
                Je comprends que cette suppression supprimera également les éléments en cours ou planifiés liés à cet élément. Les données archivées ou terminées seront conservées.
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer border-t border-border">
          <button
            onClick={onClose}
            className="btn btn-secondary"
            disabled={isLoading}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="btn btn-danger gap-2"
            disabled={!doubleConfirm || isLoading}
          >
            {isLoading ? (
              <>
                <div className="spinner w-4 h-4" />
                Suppression en cours...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Supprimer définitivement
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
