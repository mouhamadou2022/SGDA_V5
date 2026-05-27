// components/modules/dossiers/NotifModal.tsx
'use client'

import { useState } from 'react'
import { X, Send, Bell, Mail, Smartphone, AlertCircle, FolderOpen } from 'lucide-react'

interface NotifModalProps {
  dossierId: string
  userRole: string
  onClose: () => void
}

export function NotifModal({ dossierId, userRole, onClose }: NotifModalProps) {
  const [type, setType] = useState('email')
  const [destinataire, setDestinataire] = useState('')
  const [sujet, setSujet] = useState('')
  const [message, setMessage] = useState('')
  const [priorite, setPriorite] = useState('normale')
  const [envoi, setEnvoi] = useState(false)
  const [succes, setSucces] = useState(false)

  const getTypeIcon = () => {
    switch(type) {
      case 'email': return <Mail className="w-4 h-4 text-role-primary" />
      case 'sms': return <Smartphone className="w-4 h-4 text-role-primary" />
      case 'in_app': return <Bell className="w-4 h-4 text-role-primary" />
      default: return <Send className="w-4 h-4 text-role-primary" />
    }
  }

  const getPrioriteClass = () => {
    switch(priorite) {
      case 'urgente': return 'badge danger animate-pulse'
      case 'haute': return 'badge warning'
      default: return 'badge neutral'
    }
  }

  const envoyer = () => {
    if (!destinataire || !sujet || !message) return
    setEnvoi(true)
    setTimeout(() => {
      setEnvoi(false)
      setSucces(true)
      setTimeout(() => {
        setSucces(false)
        onClose()
      }, 1500)
    }, 1000)
  }

  return (
    <div className="modal-overlay" data-role={userRole} onClick={onClose}>
      <div className="modal-content sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Send className="w-5 h-5 text-role-primary" />
            Envoyer une notification
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body">
          {succes ? (
            <div className="alert alert-success animate-fade-in">
              <CheckCircle2 className="w-5 h-5" />
              <div className="alert-content">
                <div className="alert-title">Notification envoyée avec succès !</div>
                <div className="alert-description">Le destinataire a bien été notifié.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Type de notification */}
              <div className="form-field">
                <label>Type de notification</label>
                <div className="flex gap-2">
                  {[
                    { id: 'email', label: 'Email', icon: Mail },
                    { id: 'sms', label: 'SMS', icon: Smartphone },
                    { id: 'in_app', label: 'In-App', icon: Bell },
                  ].map((t) => {
                    const Icon = t.icon
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setType(t.id)}
                        className={`flex-1 py-2 px-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
                          type === t.id 
                            ? 'border-role-primary bg-role-primary-soft text-role-primary' 
                            : 'border-border bg-background text-muted-foreground hover:border-role-primary-light'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{t.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Destinataire */}
              <div className="form-field">
                <label>Destinataire *</label>
                <input
                  type="text"
                  placeholder={type === 'email' ? 'email@exemple.sn' : 'Numéro de téléphone ou nom'}
                  value={destinataire}
                  onChange={(e) => setDestinataire(e.target.value)}
                  className={!destinataire ? '' : ''}
                />
              </div>

              {/* Sujet */}
              <div className="form-field">
                <label>Sujet *</label>
                <input
                  type="text"
                  placeholder="Sujet de la notification"
                  value={sujet}
                  onChange={(e) => setSujet(e.target.value)}
                />
              </div>

              {/* Message */}
              <div className="form-field">
                <label>Message *</label>
                <textarea
                  placeholder="Corps du message..."
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {/* Priorité */}
              <div className="form-field">
                <label>Priorité</label>
                <select 
                  value={priorite} 
                  onChange={(e) => setPriorite(e.target.value)}
                  className="form-select"
                >
                  <option value="normale">Normale</option>
                  <option value="haute">Haute ⚠️</option>
                  <option value="urgente">Urgente 🔴</option>
                </select>
              </div>

              {/* Information dossier */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-role-primary-soft text-small">
                <FolderOpen className="w-4 h-4 text-role-primary" />
                <span className="text-foreground">Dossier: <span className="font-mono font-medium">{dossierId}</span></span>
                <span className={`ml-auto ${getPrioriteClass()}`}>
                  {priorite === 'urgente' ? 'Priorité urgente' : priorite === 'haute' ? 'Haute priorité' : 'Priorité normale'}
                </span>
              </div>
            </div>
          )}
        </div>

        {!succes && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose} disabled={envoi}>
              Annuler
            </button>
            <button 
              className="btn btn-primary gap-2" 
              onClick={envoyer} 
              disabled={envoi || !destinataire || !sujet || !message}
            >
              {envoi ? (
                <>
                  <div className="spinner spinner-sm" />
                  Envoi...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Envoyer
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Composant CheckCircle2 manquant si non importé
import { CheckCircle2 } from 'lucide-react'

export default NotifModal