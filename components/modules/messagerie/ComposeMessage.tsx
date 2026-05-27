// components/modules/messagerie/ComposeMessage.tsx
'use client'

import { useState, useMemo } from 'react'
import { FormShell } from '@/components/ui/FormShell'
import { useAppStore } from '@/lib/store'
import { messagerieUtils } from '@/lib/messagerieUtils'
import { Paperclip, X, FileText, Send, AlertCircle, Mail, MessageSquare, Users } from 'lucide-react'

interface ComposeMessageProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  canal: 'interne' | 'exploitant'
  onSuccess?: () => void
  userRole?: string
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

export function ComposeMessage({
  open,
  onOpenChange,
  canal,
  onSuccess,
  userRole = 'inspector'
}: ComposeMessageProps) {
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const user = useAppStore(s => s.user);
  const envoyerMessage = useAppStore(s => s.envoyerMessage);

  const [formData, setFormData] = useState({
    to: '',
    cc: [] as string[],
    subject: '',
    body: '',
    attachments: [] as File[]
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const progress = useMemo(() => {
    const filled = [formData.to, formData.subject, formData.body].filter(v => v.trim()).length
    return Math.round((filled / 3) * 100)
  }, [formData.to, formData.subject, formData.body])

  const getDestinatairesPossibles = () => {
    if (canal === 'interne') {
      return utilisateurs.filter(u =>
        ['admin', 'inspector', 'dg_anacim'].includes(u.role) && u.id !== user?.id
      )
    }
    if (user?.role === 'admin' || user?.role === 'inspector' || user?.role === 'dg_anacim') {
      return utilisateurs.filter(u => ['dg_operator', 'focal_operator', 'staff_operator'].includes(u.role))
    }
    return utilisateurs.filter(u => ['admin', 'inspector', 'dg_anacim'].includes(u.role))
  }

  const getDestinatairesCCPossibles = () => {
    const base = getDestinatairesPossibles()
    return base.filter(u => u.id !== formData.to)
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      admin: 'Administrateur', inspector: 'Inspecteur', dg_anacim: 'DG ANACIM',
      dg_operator: 'DG Exploitant', focal_operator: 'Point Focal',
      staff_operator: 'Personnel', guest: 'Invité'
    }
    return labels[role] || role
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const validation = messagerieUtils.validerPiecesJointes(Array.from(e.target.files))
      if (validation.valide) {
        setFormData({ ...formData, attachments: [...formData.attachments, ...Array.from(e.target.files)] })
      } else {
        alert(validation.erreurs.join('\n'))
      }
    }
  }

  const handleAddCC = (userId: string) => {
    if (!formData.cc.includes(userId)) setFormData({ ...formData, cc: [...formData.cc, userId] })
  }

  const handleRemoveCC = (userId: string) => {
    setFormData({ ...formData, cc: formData.cc.filter(id => id !== userId) })
  }

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {}
    if (!formData.to) newErrors.to = "Destinataire requis"
    if (!formData.subject.trim()) newErrors.subject = "Objet requis"
    if (!formData.body.trim()) newErrors.body = "Message requis"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsSubmitting(true)
    try {
      const destinataire = utilisateurs.find(u => u.id === formData.to)
      if (!destinataire) return

      const attachments = formData.attachments.map(file => ({
        nom: file.name, url: URL.createObjectURL(file), taille: file.size, type: file.type
      }))

      envoyerMessage({
        canal,
        from_id: user?.id || '',
        from_nom: `${user?.prenom} ${user?.nom}`,
        from_role: user?.role || '',
        to_id: formData.to,
        cc_id: formData.cc.length > 0 ? formData.cc : undefined,
        subject: formData.subject,
        body: formData.body,
        attachments: attachments.length > 0 ? attachments : undefined,
        created_at: new Date().toISOString()
      } as any)

      setFormData({ to: '', cc: [], subject: '', body: '', attachments: [] })
      setErrors({})
      onOpenChange(false)
      onSuccess?.()
      setIsSubmitting(false)
    } catch (error) {
      console.error("Erreur lors de l'envoi:", error)
      alert('Une erreur est survenue lors de l\'envoi du message')
      setIsSubmitting(false)
    }
  }

  const TitleIcon = canal === 'interne' ? Mail : MessageSquare

  return (
    <FormShell
      open={open}
      onClose={() => onOpenChange(false)}
      title={`Nouveau message ${canal === 'interne' ? 'interne' : 'à un exploitant'}`}
      icon={TitleIcon}
      size="2xl"
      dataRole={userRole}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn btn-primary gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? <><div className="spinner spinner-sm" />Envoi...</>
              : <><Send className="w-4 h-4" />Envoyer</>
            }
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Destinataire principal */}
        <div className="form-field">
          <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
            <Users className="h-3 w-3" />
            Destinataire <span className="text-danger">*</span>
          </label>
          <select
            value={formData.to}
            onChange={(e) => setFormData({ ...formData, to: e.target.value })}
            className={`form-select w-full ${focusClass}${errors.to ? ' border-danger' : ''}`}
            style={selectStyle}
          >
            <option value="">Sélectionner un destinataire</option>
            {getDestinatairesPossibles().map(dest => (
              <option key={dest.id} value={dest.id}>
                {dest.prenom} {dest.nom} — {getRoleLabel(dest.role)}
              </option>
            ))}
          </select>
          {errors.to && <span className="field-error">{errors.to}</span>}
        </div>

        {/* CC */}
        <div className="form-field">
          <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
            <Users className="h-3 w-3" />
            CC (copie)
          </label>
          <div className="flex gap-2 flex-wrap">
            <select
              onChange={(e) => handleAddCC(e.target.value)}
              value=""
              className={`form-select w-48 ${focusClass}`}
              style={selectStyle}
            >
              <option value="">Ajouter un CC</option>
              {getDestinatairesCCPossibles().map(dest => (
                <option key={dest.id} value={dest.id}>
                  {dest.prenom} {dest.nom}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              {formData.cc.map(ccId => {
                const dest = utilisateurs.find(u => u.id === ccId)
                if (!dest) return null
                return (
                  <div key={ccId} className="flex items-center gap-1 px-2 py-1 bg-role-primary-soft rounded-full text-xs">
                    <span>{dest.prenom} {dest.nom}</span>
                    <button type="button" onClick={() => handleRemoveCC(ccId)} className="text-danger">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Objet */}
        <div className="form-field">
          <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
            <FileText className="h-3 w-3" />
            Objet <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            placeholder="Objet du message"
            className={`form-input w-full ${focusClass}${errors.subject ? ' border-danger' : ''}`}
          />
          {errors.subject && <span className="field-error">{errors.subject}</span>}
        </div>

        {/* Message */}
        <div className="form-field">
          <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            Message <span className="text-danger">*</span>
          </label>
          <textarea
            value={formData.body}
            onChange={(e) => setFormData({ ...formData, body: e.target.value })}
            placeholder="Écrivez votre message..."
            rows={6}
            className={`form-textarea w-full ${focusClass}${errors.body ? ' border-danger' : ''}`}
          />
          {errors.body && <span className="field-error">{errors.body}</span>}
        </div>

        {/* Pièces jointes */}
        <div className="form-field">
          <label className="text-role-primary text-xs uppercase font-semibold flex items-center gap-1">
            <Paperclip className="h-3 w-3" />
            Pièces jointes
          </label>
          <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-role-primary transition-colors">
            <input
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              id="message-attachments"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
            />
            <label htmlFor="message-attachments" className="cursor-pointer flex flex-col items-center gap-2">
              <Paperclip className="w-8 h-8 text-muted-foreground" />
              <span className="text-small text-muted-foreground">Cliquez pour ajouter des fichiers</span>
              <span className="text-xs text-muted-foreground">PDF, Word, Excel, images (max 10 Mo)</span>
            </label>
          </div>

          {formData.attachments.length > 0 && (
            <div className="space-y-2 mt-2">
              {formData.attachments.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between bg-role-primary-soft p-3 rounded-xl">
                  <div className="flex items-center gap-2 flex-1">
                    <FileText className="w-4 h-4 text-role-primary" />
                    <span className="text-small truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({messagerieUtils.formatTailleFichier(file.size)})
                    </span>
                  </div>
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => setFormData({ ...formData, attachments: formData.attachments.filter((_, i) => i !== idx) })}
                  >
                    <X className="w-4 h-4 text-danger" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Information canal */}
        <div className={`alert alert-${canal === 'interne' ? 'info' : 'teal'}`}>
          {canal === 'interne'
            ? <Mail className="alert-icon w-4 h-4" />
            : <MessageSquare className="alert-icon w-4 h-4" />
          }
          <div className="alert-content">
            <div className="alert-description">
              {canal === 'interne'
                ? "Ce message sera visible uniquement par les utilisateurs ANACIM"
                : "Ce message sera envoyé au portail exploitant"}
            </div>
          </div>
        </div>
      </div>
    </FormShell>
  )
}
