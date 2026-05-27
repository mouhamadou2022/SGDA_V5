// components/modules/profil-risque/FeedbackModal.tsx
// Modal de collecte de feedback inspecteur pour l'auto-apprentissage
// UTILISE TOUTES LES CLASSES CSS EXISTANTES
// - .modal, .modal-overlay, .modal-content, .modal-header, .modal-body, .modal-footer
// - .form-input, .form-textarea, .form-label
// - .btn, .btn-primary, .btn-secondary
// - .badge, .badge.success, .badge.warning, .badge.danger
// 0 style inline, 0 fetch direct

'use client'

import { useState } from 'react'
import { X, Send, AlertTriangle, CheckCircle, ThumbsUp, ThumbsDown, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (feedback: {
    type: 'prediction_3m' | 'prediction_6m' | 'alerte' | 'recommandation'
    valeurPredite: number
    valeurReelle: number
    commentaire: string
  }) => void
  predictionType: 'prediction_3m' | 'prediction_6m'
  predictedValue: number
  aerodromeName: string
}

const PREDICTION_LABELS = {
  prediction_3m: 'Prédiction à 3 mois',
  prediction_6m: 'Prédiction à 6 mois',
}

export function FeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  predictionType,
  predictedValue,
  aerodromeName,
}: FeedbackModalProps) {
  const [valeurReelle, setValeurReelle] = useState<number | ''>('')
  const [commentaire, setCommentaire] = useState('')
  const [precision, setPrecision] = useState<'exacte' | 'proche' | 'erronnee' | null>(null)
  const [error, setError] = useState('')
  
  if (!isOpen) return null
  
  const handleSubmit = () => {
    if (valeurReelle === '') {
      setError('Veuillez saisir le score réel observé')
      return
    }
    
    const realValue = Number(valeurReelle)
    if (realValue < 0 || realValue > 100) {
      setError('Le score doit être compris entre 0 et 100')
      return
    }
    
    onSubmit({
      type: predictionType,
      valeurPredite: predictedValue,
      valeurReelle: realValue,
      commentaire,
    })
    
    onClose()
  }
  
  const erreur = valeurReelle !== '' ? Math.abs(Number(valeurReelle) - predictedValue) : null
  const erreurPourcentage = erreur !== null ? (erreur / predictedValue) * 100 : null
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
          <div className="modal-header border-b border-gray-100 bg-gradient-to-r from-blue-50 to-transparent p-5">
            <div className="modal-title flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-gray-800">Évaluation de la prédiction</span>
            </div>
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="modal-body p-5 space-y-4">
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Aérodrome</p>
              <p className="text-sm font-semibold text-gray-800">{aerodromeName}</p>
              <p className="text-xs text-gray-500 mt-2">Prédiction</p>
              <p className="text-2xl font-bold text-blue-600">{predictedValue}/100</p>
              <p className="text-xs text-gray-400">{PREDICTION_LABELS[predictionType]}</p>
            </div>
            
            <div className="space-y-2">
              <label className="form-label">Score réel observé <span className="text-red-500">*</span></label>
              <input
                type="number"
                value={valeurReelle}
                onChange={(e) => {
                  setValeurReelle(e.target.value === '' ? '' : Number(e.target.value))
                  setError('')
                }}
                placeholder="0-100"
                className="form-input"
                min={0}
                max={100}
              />
              {valeurReelle !== '' && erreur !== null && (
                <div className={`flex items-center gap-2 text-xs ${erreur <= 10 ? 'text-green-600' : erreur <= 20 ? 'text-orange-600' : 'text-red-600'}`}>
                  {erreur <= 10 ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  <span>Erreur de {erreur} points ({erreurPourcentage?.toFixed(1)}%)</span>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <label className="form-label">Précision de la prédiction</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPrecision('exacte')}
                  className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border-2 transition-all ${
                    precision === 'exacte'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span className="text-sm">Exacte</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrecision('proche')}
                  className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border-2 transition-all ${
                    precision === 'proche'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-orange-300'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm">Proche</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrecision('erronnee')}
                  className={`flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border-2 transition-all ${
                    precision === 'erronnee'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 hover:border-red-300'
                  }`}
                >
                  <ThumbsDown className="w-4 h-4" />
                  <span className="text-sm">Erronée</span>
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="form-label">Commentaire (optionnel)</label>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Qu'est-ce qui a été mal évalué ? Qu'avons-nous manqué ?"
                className="form-textarea"
                rows={3}
              />
            </div>
            
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          
          <div className="modal-footer border-t border-gray-100 p-5 flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} className="btn btn-secondary">
              Annuler
            </Button>
            <Button onClick={handleSubmit} className="btn btn-primary gap-2">
              <Send className="w-4 h-4" />
              Envoyer le feedback
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FeedbackModal