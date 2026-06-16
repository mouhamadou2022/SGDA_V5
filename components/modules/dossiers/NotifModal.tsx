'use client'

import { useState } from 'react'
import { X, Send, Bell, Mail, Smartphone, AlertCircle, FolderOpen, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { FormShell } from '@/components/ui/FormShell'

interface NotifModalProps {
  dossierId: string
  userRole: string
  onClose: () => void
}

export function NotifModal({ dossierId, userRole, onClose }: NotifModalProps) {
  const addNotification = useAppStore(s => s.addNotification)
  const user = useAppStore(s => s.user)
  const dossiers = useAppStore(s => s.dossiers)
  const dossier = dossiers?.find(d => d.id === dossierId)

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

    const typeNotif = priorite === 'urgente' ? 'danger' : priorite === 'haute' ? 'warning' : 'info'

    addNotification({
      user_id: user?.id || 'system',
      type: typeNotif,
      title: sujet,
      message: `${message}\n\nDossier: ${dossier?.reference || dossierId}\nCanal: ${type}`,
      canal: type === 'in_app' ? 'in_app' : type === 'sms' ? 'sms' : 'email'
    })

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
    <FormShell
      open={true}
      onClose={onClose}
      title="Envoyer une notification"
      icon={Send}
      size="lg"
      dataRole={userRole}
      footer={
        !succes ? (
          <div className="flex gap-2">
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
        ) : undefined
      }
    >
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

          <div className="form-field">
            <label>Destinataire *</label>
            <input
              type="text"
              placeholder={type === 'email' ? 'email@exemple.sn' : 'Numéro de téléphone ou nom'}
              value={destinataire}
              onChange={(e) => setDestinataire(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label>Sujet *</label>
            <input
              type="text"
              placeholder="Sujet de la notification"
              value={sujet}
              onChange={(e) => setSujet(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label>Message *</label>
            <textarea
              placeholder="Corps du message..."
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label>Priorité</label>
            <select
              value={priorite}
              onChange={(e) => setPriorite(e.target.value)}
              className="form-select"
            >
              <option value="normale">Normale</option>
              <option value="haute">Haute</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-xl bg-role-primary-soft text-small">
            <FolderOpen className="w-4 h-4 text-role-primary" />
            <span className="text-foreground">Dossier: <span className="font-mono font-medium">{dossier?.reference || dossierId}</span></span>
            <span className={`ml-auto ${getPrioriteClass()}`}>
              {priorite === 'urgente' ? 'Priorité urgente' : priorite === 'haute' ? 'Haute priorité' : 'Priorité normale'}
            </span>
          </div>
        </div>
      )}
    </FormShell>
  )
}

export default NotifModal
