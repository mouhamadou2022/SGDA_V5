// components/modules/messagerie/MessagerieModule.tsx
'use client'

import { useState, useMemo, useCallback } from 'react'
import { FormShell } from '@/components/ui/FormShell'
import { useAppStore, type Message } from '@/lib/store'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { Role } from '@/lib/config'
import { formatDate } from '@/lib/utils'
import type { Utilisateur } from '@/lib/store'
import {
  Mail, MessageSquare, Send, Inbox, FileText,
  Paperclip, Download, Trash2, Archive, Star,
  Search, Users, Building, Clock, Reply, Forward, Plus
} from 'lucide-react'
import { ComposeMessage } from './ComposeMessage'
import type { AuthUser } from '@/lib/auth'

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

export function MessagerieModule({ user: userProp }: { user: AuthUser }) {
  const messages = useAppStore((s) => s.messages);
  const utilisateurs = useAppStore((s) => s.utilisateurs);
  const envoyerMessage = useAppStore((s) => s.envoyerMessage);
  const marquerCommeLu = useAppStore((s) => s.marquerCommeLu);
  const supprimerMessage = useAppStore((s) => s.supprimerMessage);
  const archiverMessage = useAppStore((s) => s.archiverMessage);
  const marquerCommeNonLu = useAppStore((s) => s.marquerCommeNonLu);
  const storeUser = useAppStore((s) => s.user);
  const user = userProp || storeUser
  const userId = user?.id || ''
  const userRole = user?.role || 'inspector'

  const [canal, setCanal] = useState<'interne' | 'exploitant'>(
    userRole === 'dg_operator' || userRole === 'focal_operator' || userRole === 'staff_operator'
      ? 'exploitant'
      : 'interne'
  )
  const [view, setView] = useState<'inbox' | 'sent' | 'archived'>('inbox')
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [showCompose, setShowCompose] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [replyContent, setReplyContent] = useState('')
  const [showReply, setShowReply] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null)

  const isOperator = userRole === 'dg_operator' || userRole === 'focal_operator' || userRole === 'staff_operator'

  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      const estExpediteur = msg.from_id === userId
      const estDestinataire = Array.isArray(msg.to_id) ? msg.to_id.includes(userId) : msg.to_id === userId
      const msgExt = msg as Message & { cc_id?: string[]; archived_by?: string[] }
      const estEnCC = msgExt.cc_id && Array.isArray(msgExt.cc_id) && msgExt.cc_id.includes(userId)
      const estArchive = msgExt.archived_by?.includes(userId) || false

      if (view === 'inbox' && !estDestinataire && !estEnCC) return false
      if (view === 'sent' && !estExpediteur) return false
      if (view === 'archived' && !estArchive) return false
      if (msg.canal !== canal) return false

      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matches = msg.subject?.toLowerCase().includes(term) ||
          msg.body.toLowerCase().includes(term) ||
          msg.from_nom.toLowerCase().includes(term)
        if (!matches) return false
      }

      return true
    })
  }, [messages, userId, view, canal, searchTerm])

  const nonLusCount = useMemo(() => {
    return messages.filter(msg => {
      const estDestinataire = Array.isArray(msg.to_id) ? msg.to_id.includes(userId) : msg.to_id === userId
      const estNonLu = !msg.read_at && (!msg.read_by?.includes(userId))
      return estDestinataire && estNonLu && msg.canal === canal && !(msg as Message & { archived_by?: string[] }).archived_by?.includes(userId)
    }).length
  }, [messages, userId, canal])

  const nonLusInterneCount = useMemo(() => {
    return messages.filter(msg => {
      const estDestinataire = Array.isArray(msg.to_id) ? msg.to_id.includes(userId) : msg.to_id === userId
      const estNonLu = !msg.read_at && (!msg.read_by?.includes(userId))
      return estDestinataire && estNonLu && msg.canal === 'interne' && !(msg as Message & { archived_by?: string[] }).archived_by?.includes(userId)
    }).length
  }, [messages, userId])

  const nonLusExploitantCount = useMemo(() => {
    return messages.filter(msg => {
      const estDestinataire = Array.isArray(msg.to_id) ? msg.to_id.includes(userId) : msg.to_id === userId
      const estNonLu = !msg.read_at && (!msg.read_by?.includes(userId))
      return estDestinataire && estNonLu && msg.canal === 'exploitant' && !(msg as Message & { archived_by?: string[] }).archived_by?.includes(userId)
    }).length
  }, [messages, userId])

  const sentCount = useMemo(() => {
    return messages.filter(msg => msg.from_id === userId && msg.canal === canal).length
  }, [messages, userId, canal])

  const archivedCount = useMemo(() => {
    return messages.filter(msg => (msg as Message & { archived_by?: string[] }).archived_by?.includes(userId) && msg.canal === canal).length
  }, [messages, userId, canal])

  const getInitials = (nom: string, prenom: string) => `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase()

  const getDestinataireNom = (msg: Message) => {
    if (view === 'sent') {
      if (Array.isArray(msg.to_id)) {
        return msg.to_id.map((id: string) => {
          const u = utilisateurs.find(u => u.id === id)
          return u ? `${u.prenom} ${u.nom}` : id
        }).join(', ')
      }
      const dest = utilisateurs.find(u => u.id === msg.to_id)
      return dest ? `${dest.prenom} ${dest.nom}` : msg.to_id
    }
    return msg.from_nom
  }

  const handleSendReply = () => {
    if (!selectedMessage || !replyContent.trim()) return
    envoyerMessage({
      canal: selectedMessage.canal,
      from_id: userId,
      from_nom: user?.nom || '',
      from_role: userRole,
      to_id: selectedMessage.from_id,
      subject: `Re: ${selectedMessage.subject}`,
      body: replyContent,
    } as Omit<Message, 'id' | 'created_at'>)
    setReplyContent('')
    setShowReply(false)
  }

  const handleDeleteMessage = () => {
    if (messageToDelete) {
      supprimerMessage(messageToDelete, userId)
      if (selectedMessage?.id === messageToDelete) setSelectedMessage(null)
      setShowDeleteConfirm(false)
      setMessageToDelete(null)
    }
  }

  const handleArchiveMessage = (msgId: string) => {
    archiverMessage(msgId, userId)
    if (selectedMessage?.id === msgId) setSelectedMessage(null)
  }

  const handleMarkAsUnread = (msgId: string) => marquerCommeNonLu(msgId, userId)

  const handleMessageClick = (msg: Message) => {
    setSelectedMessage(msg)
    setShowReply(false)
    const estDestinataire = Array.isArray(msg.to_id) ? msg.to_id.includes(userId) : msg.to_id === userId
    const estNonLu = !msg.read_at && (!msg.read_by?.includes(userId))
    if (estDestinataire && estNonLu) marquerCommeLu(msg.id)
  }

  const DeleteConfirmModal = () => (
    <FormShell
      open={showDeleteConfirm}
      onClose={() => setShowDeleteConfirm(false)}
      title="Confirmer la suppression"
      icon={Trash2}
      size="md"
      dataRole={userRole}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Annuler</button>
          <button className="btn btn-danger" onClick={handleDeleteMessage}>Supprimer</button>
        </>
      }
    >
      <p className="text-foreground">Êtes-vous sûr de vouloir supprimer ce message ?</p>
      <p className="text-small text-muted-foreground mt-2">Cette action est irréversible.</p>
    </FormShell>
  );

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="messagerie">
      
      {/* En-tête */}
      <ModuleHeader
        icon={<Mail />}
        title="Messagerie"
        description="Communication interne et avec les exploitants"
        actions={<button onClick={() => setShowCompose(true)} className="btn btn-primary gap-2 shadow-role-glow">
          <Plus className="w-4 h-4" /> Nouveau message
        </button>}
      />

      {/* Barre d'outils - Style view-toggle comme PlanningModule */}
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Groupe CANAL - Style view-toggle avec icône + texte */}
          <div className="view-toggle">
            <button
              onClick={() => !isOperator && setCanal('interne')}
              disabled={isOperator}
              className={canal === 'interne' ? 'active' : ''}
              title="Messagerie interne"
            >
              <Users className="w-4 h-4" />
              <span>Interne</span>
              {nonLusInterneCount > 0 && (
                <span className="inline-flex items-center ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 border border-red-200 animate-pulse">
                  {nonLusInterneCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setCanal('exploitant')}
              className={canal === 'exploitant' ? 'active' : ''}
              title="Messagerie exploitants"
            >
              <Building className="w-4 h-4" />
              <span>Exploitant</span>
              {nonLusExploitantCount > 0 && (
                <span className="inline-flex items-center ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 border border-red-200 animate-pulse">
                  {nonLusExploitantCount}
                </span>
              )}
            </button>
          </div>

          {/* Groupe VUES - Style view-toggle avec icône + texte - AVEC BADGE PULSE */}
          <div className="view-toggle">
            <button
              className={view === 'inbox' ? 'active' : ''}
              onClick={() => setView('inbox')}
              title="Messages reçus"
            >
              <Inbox className="w-4 h-4" />
              <span>Réception</span>
              {nonLusCount > 0 && (
                <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 animate-pulse">
                  {nonLusCount}
                </span>
              )}
            </button>
            <button
              className={view === 'sent' ? 'active' : ''}
              onClick={() => setView('sent')}
              title="Messages envoyés"
            >
              <Send className="w-4 h-4" />
              <span>Envoyés</span>
              {sentCount > 0 && (
                <span className="inline-flex items-center ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                  {sentCount}
                </span>
              )}
            </button>
            <button
              className={view === 'archived' ? 'active' : ''}
              onClick={() => setView('archived')}
              title="Messages archivés"
            >
              <Archive className="w-4 h-4" />
              <span>Archivés</span>
              {archivedCount > 0 && (
                <span className="inline-flex items-center ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                  {archivedCount}
                </span>
              )}
            </button>
          </div>

          {/* Recherche */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un message..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>
        </div>
      </div>

      {/* Grille des messages */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Liste des messages */}
        <div className="card col-span-1 overflow-hidden animate-fade-in border-border shadow-md">
          <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent border-b border-border py-3 px-4">
            <div className="card-title text-sm font-semibold text-foreground">
              {view === 'inbox' && '📥 Messages reçus'}
              {view === 'sent' && '📤 Messages envoyés'}
              {view === 'archived' && '📦 Messages archivés'}
            </div>
          </div>
          <div className="card-content p-0 max-h-[500px] overflow-y-auto">
            {filteredMessages.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground animate-fade-in">
                <Mail className="w-14 h-14 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Aucun message trouvé</p>
                <p className="text-xs mt-1">Modifiez vos critères de recherche</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredMessages
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((msg, idx) => {
                    const estNonLu = view === 'inbox' && !msg.read_at && 
                      (Array.isArray(msg.to_id) ? !msg.read_by?.includes(userId) : msg.to_id === userId && !msg.read_at)
                    const msgAny = msg as any; const estEnCC = msgAny.cc_id && Array.isArray(msgAny.cc_id) && msgAny.cc_id.includes(userId)
                    
                    return (
                      <div
                        key={msg.id}
                        className={`p-4 cursor-pointer hover:bg-role-primary-soft transition-all duration-200 ${
                          estNonLu ? 'bg-role-primary-soft' : ''
                        } ${selectedMessage?.id === msg.id ? 'border-l-4 border-l-role-primary bg-role-primary-soft/30' : ''}`}
                        onClick={() => handleMessageClick(msg)}
                        style={{ animationDelay: `${idx * 30}ms` }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-role-primary-soft flex items-center justify-center flex-shrink-0 shadow-md">
                            <span className="text-role-primary font-semibold text-sm">
                              {getInitials(msg.from_nom.split(' ')[1] || '', msg.from_nom.split(' ')[0] || '')}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between flex-wrap gap-1 mb-0.5">
                              <span className="font-semibold text-foreground text-sm truncate">
                                {view === 'sent' ? 'À: ' + getDestinataireNom(msg) : msg.from_nom}
                              </span>
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                {formatDate(msg.created_at, 'relative')}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-foreground truncate mb-0.5">{msg.subject}</p>
                            <p className="text-xs text-muted-foreground truncate line-clamp-2">{msg.body}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {estNonLu && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 animate-pulse">
                                  Nouveau
                                </span>
                              )}
                              {estEnCC && <span className="badge outline text-[10px] px-2 py-0.5">CC</span>}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <span className="badge outline text-[10px] px-2 py-0.5">
                                  <Paperclip className="w-3 h-3 inline mr-0.5" />
                                  {msg.attachments.length}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Détail du message */}
        <div className="card col-span-2 animate-fade-in border-border shadow-md" style={{ animationDelay: '100ms' }}>
          {selectedMessage ? (
            <>
              <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent border-b border-border flex items-center justify-between flex-wrap gap-3 py-4 px-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-role-primary-soft flex items-center justify-center shadow-md">
                    <span className="text-role-primary font-semibold text-base">
                      {getInitials(selectedMessage.from_nom.split(' ')[1] || '', selectedMessage.from_nom.split(' ')[0] || '')}
                    </span>
                  </div>
                  <div>
                    <div className="card-title text-lg font-bold text-foreground">{selectedMessage.from_nom}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(selectedMessage.created_at, 'long')}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="action-button w-8 h-8 rounded-full hover:bg-role-primary-soft transition-all flex items-center justify-center" onClick={() => setShowReply(!showReply)} title="Répondre">
                    <Reply className="w-4 h-4" />
                  </button>
                  <button className="action-button w-8 h-8 rounded-full hover:bg-role-primary-soft transition-all flex items-center justify-center" onClick={() => handleArchiveMessage(selectedMessage.id)} title="Archiver">
                    <Archive className="w-4 h-4" />
                  </button>
                  <button className="action-button w-8 h-8 rounded-full hover:bg-role-primary-soft transition-all flex items-center justify-center" onClick={() => handleMarkAsUnread(selectedMessage.id)} title="Marquer comme non lu">
                    <Star className="w-4 h-4" />
                  </button>
                  <button className="action-button w-8 h-8 rounded-full hover:bg-danger-soft transition-all flex items-center justify-center" onClick={() => {
                    setMessageToDelete(selectedMessage.id)
                    setShowDeleteConfirm(true)
                  }} title="Supprimer">
                    <Trash2 className="w-4 h-4 text-danger" />
                  </button>
                </div>
              </div>
              <div className="card-content p-5 space-y-4">
                <div>
                  <h3 className="heading-3 text-foreground mb-2">{selectedMessage.subject}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {new Date(selectedMessage.created_at).toLocaleString('fr-FR')}
                  </div>
                  {(selectedMessage as any).cc_id && (selectedMessage as any).cc_id.length > 0 && (
                    <div className="mt-3 p-3 bg-role-primary-soft rounded-lg text-xs">
                      <span className="font-semibold text-role-primary">CC:</span> {(selectedMessage as any).cc_id.map((id: string) => {
                        const u = utilisateurs.find(u => u.id === id)
                        return u ? `${u.prenom} ${u.nom}` : id
                      }).join(', ')}
                    </div>
                  )}
                </div>
                <div className="bg-role-primary-soft/30 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                  <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
                    {selectedMessage.body}
                  </div>
                </div>
                {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                  <div className="border-t border-border pt-4">
                    <h4 className="text-sm font-semibold text-role-primary flex items-center gap-2 mb-2">
                      <Paperclip className="w-4 h-4" />
                      Pièces jointes ({selectedMessage.attachments.length})
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {(selectedMessage.attachments || []).map((att: NonNullable<Message['attachments']>[number], i: number) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-role-primary-soft rounded-lg hover:shadow-role-glow transition-all">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-role-primary" />
                            <span className="text-xs truncate text-foreground">{att.nom}</span>
                          </div>
                          <button className="action-button w-7 h-7 rounded-full hover:bg-background transition-all flex items-center justify-center" onClick={() => window.open(att.url, '_blank')}>
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Zone de réponse */}
                {showReply && (
                  <div className="border-t border-border pt-4 mt-2 animate-fade-in">
                    <label className="text-role-primary text-xs uppercase font-semibold mb-2 block">
                      ✏️ Votre réponse
                    </label>
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Écrivez votre réponse..."
                      className={`form-textarea w-full min-h-[100px] bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-lg ${focusClass} text-sm`}
                    />
                    <div className="flex justify-end gap-2 mt-3">
                      <button className="btn btn-secondary px-4 py-1.5 text-sm" onClick={() => setShowReply(false)}>Annuler</button>
                      <button onClick={handleSendReply} disabled={!replyContent.trim()} className="btn btn-primary gap-2 shadow-role-glow px-4 py-1.5 text-sm">
                        <Send className="w-4 h-4" />
                        Envoyer
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground animate-fade-in">
              <Mail className="w-20 h-20 mb-4 opacity-20" />
              <p className="text-lg font-medium text-foreground/60">Sélectionnez un message</p>
              <p className="text-sm mt-1">Choisissez un message dans la liste pour afficher son contenu</p>
            </div>
          )}
        </div>
      </div>

      {/* Modales */}
      <ComposeMessage open={showCompose} onOpenChange={setShowCompose} canal={canal} userRole={userRole} onSuccess={() => {}} />
      {showDeleteConfirm && DeleteConfirmModal()}
    </div>
  )
}