'use client';

import React, { useState, useMemo } from 'react';
import { Send, MessageSquare, Filter } from 'lucide-react';
import { Card } from '@/components/ui/card';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

// ─── Types ────────────────────────────────────────────────────────────────────

interface CommentsFilProps {
  ecartId: string;
  userRole: string;
}

type TypeCommentaire = 'commentaire_inspecteur' | 'retour_exploitant' | 'note_interne';

interface Commentaire {
  id: string;
  ecart_id: string;
  type: TypeCommentaire;
  auteur_id: string;
  auteur_nom: string;
  auteur_role: string;
  message: string;
  created_at: string;
}

// ─── Données initiales simulées ───────────────────────────────────────────────

function genererCommentairesInitiaux(ecartId: string): Commentaire[] {
  return [
    {
      id: 'cmt-001',
      ecart_id: ecartId,
      type: 'commentaire_inspecteur',
      auteur_id: 'insp-001',
      auteur_nom: 'Mamadou Diallo',
      auteur_role: 'Inspecteur ANACIM',
      message:
        "L'écart a été constaté lors de la vérification des équipements SSLIA. Le véhicule principal dépasse le délai réglementaire de maintenance de 45 jours. Une action corrective urgente est requise.",
      created_at: '2025-11-15T09:30:00.000Z',
    },
    {
      id: 'cmt-002',
      ecart_id: ecartId,
      type: 'retour_exploitant',
      auteur_id: 'exp-002',
      auteur_nom: 'Oumar Seck',
      auteur_role: 'Point Focal GOBD',
      message:
        "Nous avons pris note de l'écart. Le contrat de maintenance est en cours de renouvellement avec le prestataire SOGETEX. Le PAC sera soumis dans les délais impartis avec les justificatifs correspondants.",
      created_at: '2025-11-17T14:12:00.000Z',
    },
    {
      id: 'cmt-003',
      ecart_id: ecartId,
      type: 'note_interne',
      auteur_id: 'insp-001',
      auteur_nom: 'Mamadou Diallo',
      auteur_role: 'Inspecteur ANACIM',
      message:
        "Note interne : Vérifier également l'état du véhicule de secours lors de la prochaine visite. Coordonner avec l'équipe SGS pour le suivi rapproché de cet aérodrome.",
      created_at: '2025-11-18T08:45:00.000Z',
    },
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'À l\'instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
}

function initiales(nom: string): string {
  return nom
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const CONFIG_TYPE: Record<
  TypeCommentaire,
  { label: string; badgeCls: string; bulleOwnerCls: string; bulleOtherCls: string }
> = {
  commentaire_inspecteur: {
    label: 'Commentaire inspecteur',
    badgeCls: 'bg-blue-100 text-blue-700 border-blue-300',
    bulleOwnerCls: 'bg-blue-600 text-white',
    bulleOtherCls: 'bg-blue-50 border border-blue-200 text-gray-900',
  },
  retour_exploitant: {
    label: 'Retour exploitant',
    badgeCls: 'bg-green-100 text-green-700 border-green-300',
    bulleOwnerCls: 'bg-green-600 text-white',
    bulleOtherCls: 'bg-green-50 border border-green-200 text-gray-900',
  },
  note_interne: {
    label: 'Note interne',
    badgeCls: 'bg-gray-100 text-gray-700 border-gray-300',
    bulleOwnerCls: 'bg-gray-500 text-white',
    bulleOtherCls: 'bg-gray-50 border border-gray-200 text-gray-900',
  },
};

// ─── Composant ────────────────────────────────────────────────────────────────

export function CommentsFil({ ecartId, userRole }: CommentsFilProps) {
  const [commentaires, setCommentaires] = useState<Commentaire[]>(() =>
    genererCommentairesInitiaux(ecartId)
  );
  const [filtreType, setFiltreType] = useState<TypeCommentaire | 'tous'>('tous');
  const [newMessage, setNewMessage] = useState('');
  const [newType, setNewType] = useState<TypeCommentaire>('commentaire_inspecteur');

  const ownId = 'insp-001';

  const commentairesFiltres = useMemo(() => {
    if (filtreType === 'tous') return commentaires;
    return commentaires.filter((c) => c.type === filtreType);
  }, [commentaires, filtreType]);

  function handleEnvoyer() {
    const msg = newMessage.trim();
    if (!msg) return;

    const nouveau: Commentaire = {
      id: `cmt-${Date.now()}`,
      ecart_id: ecartId,
      type: newType,
      auteur_id: ownId,
      auteur_nom: 'Mamadou Diallo',
      auteur_role: 'Inspecteur ANACIM',
      message: msg,
      created_at: new Date().toISOString(),
    };

    setCommentaires((prev) => [...prev, nouveau]);
    setNewMessage('');
  }

  return (
    <Card data-role={userRole} heading={
        <div className="flex items-center justify-between w-full">
          <h3 className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Fil de commentaires
            <span className="badge neutral">{commentaires.length}</span>
          </h3>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={filtreType}
              onChange={(e) => setFiltreType(e.target.value as TypeCommentaire | 'tous')}
              className={`form-select h-8 w-48 text-xs ${focusClass}`}
              style={selectStyle}
            >
              <option value="tous">Tous les types</option>
              <option value="commentaire_inspecteur">Inspecteur</option>
              <option value="retour_exploitant">Exploitant</option>
              <option value="note_interne">Note interne</option>
            </select>
          </div>
        </div>
      }>
        {/* Liste des commentaires */}
        <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
          {commentairesFiltres.length === 0 && (
            <p className="text-center text-small text-gray-400 py-6">
              Aucun commentaire pour ce filtre.
            </p>
          )}

          {commentairesFiltres.map((cmt) => {
            const isOwn = cmt.auteur_id === ownId;
            const cfg = CONFIG_TYPE[cmt.type];

            return (
              <div
                key={cmt.id}
                className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div className="h-8 w-8 rounded-full bg-role-gradient flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {initiales(cmt.auteur_nom)}
                </div>

                <div className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs font-semibold text-gray-700">{cmt.auteur_nom}</span>
                    <span className="text-xs text-gray-400">{cmt.auteur_role}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${cfg.badgeCls}`}>
                      {cfg.label}
                    </span>
                  </div>

                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      isOwn ? cfg.bulleOwnerCls : cfg.bulleOtherCls
                    }`}
                  >
                    {cmt.message}
                  </div>

                  <span className="text-xs text-gray-400 mt-1">
                    {dateRelative(cmt.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Formulaire */}
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex gap-2">
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as TypeCommentaire)}
              className={`form-select h-8 w-52 text-xs ${focusClass}`}
              style={selectStyle}
            >
              <option value="commentaire_inspecteur">Commentaire inspecteur</option>
              <option value="retour_exploitant">Retour exploitant</option>
              <option value="note_interne">Note interne</option>
            </select>
          </div>

          <div className="flex gap-2">
            <textarea
              placeholder="Rédigez votre commentaire..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              rows={2}
              className={`form-textarea flex-1 resize-none text-sm ${focusClass}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) handleEnvoyer();
              }}
            />
            <button
              type="button"
              onClick={handleEnvoyer}
              disabled={!newMessage.trim()}
              className={`btn btn-primary self-end h-10 w-10 flex items-center justify-center p-0 ${!newMessage.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-gray-400">Ctrl+Entrée pour envoyer</p>
        </div>
    </Card>
  );
}

export default CommentsFil;
