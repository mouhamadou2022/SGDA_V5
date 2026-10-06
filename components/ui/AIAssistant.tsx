// components/ui/AIAssistant.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Brain, X, Send, Loader2, Minimize2, Maximize2, Trash2, RefreshCw, Mic, MicOff, Zap } from 'lucide-react';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import type { ActionSuggestion, SourceReference } from '@/lib/ia/agents/assistantAgent';
import { Markdown } from '@/components/ui/markdown';
import { executerPilote } from '@/lib/ia/pilote/bouclePilote';
import { erreurIaEnClair } from '@/lib/ia/aiClient';
import { useAppStore } from '@/lib/store';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ActionSuggestion[];
  sources?: SourceReference[];
}

/** Dimensions du panneau (w-96 + en-tête/liste/saisie) : servent à le garder visible à l'ouverture. */
const PANNEAU_L = 384;
const PANNEAU_H = 540;

/** Borne une position pour que le panneau reste entièrement visible. */
function bornerPosition(x: number, y: number): { x: number; y: number } {
  if (typeof window === 'undefined') return { x, y };
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - PANNEAU_L - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - PANNEAU_H - 8)),
  };
}

/** Cibles d'actions IA → modules réels (les cibles inconnues sont ignorées). */
const MODULES_NAVIGATION: Record<string, string> = {
  'risque': 'risque',
  'plans-actions': 'plans-actions',
  'planning': 'planning',
  'certification': 'certification',
  'homologation': 'homologation',
  'surveillance': 'surveillance',
  'checklist': 'surveillance',
  'evenements': 'evenements',
  'formation': 'formation',
  'registres': 'registres',
  'messagerie': 'messagerie',
  'dossiers': 'dossiers',
  'aerodromes': 'aerodromes',
  'kit': 'kit',
  'enquetes': 'enquetes',
  'charge': 'charge',
  'signatures': 'signatures',
};

export function AIAssistant({ hideTrigger = false }: { hideTrigger?: boolean } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  // Position par défaut : bas-droite, panneau entièrement visible (pas de déplacement requis).
  const [position, setPosition] = useState(() =>
    bornerPosition(
      typeof window !== 'undefined' ? window.innerWidth - PANNEAU_L - 16 : 20,
      typeof window !== 'undefined' ? window.innerHeight - PANNEAU_H - 16 : 500,
    ));
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  // Progression du pilote (étapes outils en direct) + interruption.
  const [tracePilote, setTracePilote] = useState<string[]>([]);
  const requeteId = useRef(0);
  // Mode action AERORISQ : l'IA exécute via ses outils (écritures confirmées).
  const [modePilote, setModePilote] = useState(false);
  // Rapports auto : PDF/Word sans demander (lecture seule). Le reste confirmé.
  const [autoRapports, setAutoRapports] = useState(() => {
    try { return localStorage.getItem('sgda_auto_rapports') === '1' } catch { return false }
  });
  const basculerAutoRapports = (v: boolean) => {
    setAutoRapports(v);
    try { localStorage.setItem('sgda_auto_rapports', v ? '1' : '0') } catch { /* stockage indisponible */ }
  };
  const [confirmation, setConfirmation] = useState<{
    outil: string
    args: Record<string, unknown>
    resoudre: (ok: boolean) => void
  } | null>(null);
  const user = useAppStore(s => s.user);
  const setActiveModule = useAppStore(s => s.setActiveModule);
  // Assistant flottant global : mêmes rôles que le bouton des en-têtes de modules.
  // Jamais aux exploitants (portail opérateur inchangé visuellement).
  const peutVoirAssistant = ['admin', 'inspector', 'dg_anacim'].includes(user?.role || '');
  // Réservé aux rôles IA internes — jamais aux exploitants.
  const peutPiloter = peutVoirAssistant;
  const addNotification = useAppStore(s => s.addNotification);
  const currentAerodrome = useAppStore(s => s.currentAerodrome);
  const activeModule = useAppStore(s => s.activeModule);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Interruption réelle du streaming (AbortController du fetch Ollama).
  const abortRef = useRef<AbortController | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ia-button-position');
      if (saved) {
        const pos = JSON.parse(saved);
        // Rebornée au viewport actuel : une position mémorisée sur grand écran
        // ne doit jamais rouvrir le panneau hors champ.
        const bornee = bornerPosition(pos.x ?? 20, pos.y ?? 500);
        setPosition(bornee);
      }
    } catch (e) {}
  }, []);

  const savePosition = (pos: { x: number; y: number }) => {
    try {
      localStorage.setItem('ia-button-position', JSON.stringify(pos));
    } catch (e) {}
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (buttonRef.current && !isOpen) {
      setIsDragging(true);
      const rect = buttonRef.current.getBoundingClientRect();
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      // On peut déplacer librement, mais on rebornera à la réouverture.
      const maxX = window.innerWidth - 60;
      const maxY = window.innerHeight - 60;
      setPosition({ x: Math.min(Math.max(0, newX), maxX), y: Math.min(Math.max(0, newY), maxY) });
    }
  };

  const handleMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      savePosition(position);
    }
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handlePanelMouseDown = (e: React.MouseEvent) => {
    if (panelRef.current && !isMinimized) {
      setIsDragging(true);
      const rect = panelRef.current.getBoundingClientRect();
      setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      e.preventDefault();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'fr-FR';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setMessage(transcript);
        setIsDictating(false);
      };
      recognitionRef.current.onerror = () => setIsDictating(false);
      recognitionRef.current.onend = () => setIsDictating(false);
    }
  }, []);

  const toggleDictation = () => {
    if (!recognitionRef.current) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Non supporté',
        message: 'La dictée vocale n\'est pas supportée par ce navigateur',
        canal: 'in_app',
      });
      return;
    }
    if (isDictating) {
      recognitionRef.current.stop();
      setIsDictating(false);
    } else {
      recognitionRef.current.start();
      setIsDictating(true);
    }
  };

  // Relance la dernière question en Mode action (bouton « Générer le PDF ») :
  // active le pilote puis réenvoie tel quel — les écritures restent confirmées.
  const relancerEnPilote = () => {
    if (!peutPiloter || isLoading) return;
    const dernierUser = [...conversation].reverse().find(m => m.role === 'user');
    if (!dernierUser?.content.trim()) return;
    setModePilote(true);
    envoyerTexte(dernierUser.content, true);
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    envoyerTexte(message);
  };

  const interrompre = () => {
    // Interruption réelle : le fetch Ollama est annulé (aucun outil ne démarre
    // après abort) + la réponse tardive est ignorée. Les écritures déjà
    // approuvées restent appliquées (jamais d'action sans approbation).
    abortRef.current?.abort();
    abortRef.current = null;
    requeteId.current++;
    setIsLoading(false);
    setConfirmation(null);
    setTracePilote([]);
    setConversation(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: 'Requête interrompue à votre demande — reformulez ou réessayez.',
      timestamp: new Date(),
    }]);
  };

  const envoyerTexte = async (texte: string, forcerPilote = false) => {
    if (!texte.trim()) return;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: texte,
      timestamp: new Date(),
    };
    setConversation(prev => [...prev, userMessage]);
    setMessage('');
    setTracePilote([]);
    setIsLoading(true);
    const jeton = ++requeteId.current;
    try {
      if ((forcerPilote || modePilote) && peutPiloter) {
        // Message placeholder : le texte s'affiche au fil de la génération.
        const placeholderId = `pilote-${Date.now()}`;
        setConversation(prev => [...prev, {
          id: placeholderId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        }]);
        const controleur = new AbortController();
        abortRef.current = controleur;
        const ajouterTokens = (texte: string) => {
          if (requeteId.current !== jeton) return;
          setConversation(prev => prev.map(m =>
            m.id === placeholderId ? { ...m, content: m.content + texte } : m));
        };
        const resultat = await executerPilote({
          instruction: userMessage.content,
          historique: conversation.map(m => ({ role: m.role, content: m.content })),
          // Contexte utilisateur tenu à jour à chaque envoi (rôle vérifié côté outil).
          contexte: {
            userId: user?.id,
            userRole: user?.role,
            userName: [user?.prenom, user?.nom].filter(Boolean).join(' ') || undefined,
          },
          onConfirmer: (outil, args) => {
            if (autoRapports && (outil === 'generer_rapport_pdf' || outil === 'generer_rapport_word')) {
              setTracePilote(prev => [...prev, `✅ ${outil} (auto — rapports sans demander)`]);
              return Promise.resolve(true);
            }
            return new Promise<boolean>(resoudre => {
            if (controleur.signal.aborted) { resoudre(false); return; }
            const surAbort = () => resoudre(false);
            controleur.signal.addEventListener('abort', surAbort, { once: true });
            setConfirmation({ outil, args, resoudre: (ok) => {
              controleur.signal.removeEventListener('abort', surAbort);
              resoudre(ok);
            } });
            });
          },
          onTrace: (etape) => setTracePilote(prev => [...prev.slice(-5), etape]),
          onToken: ajouterTokens,
          signal: controleur.signal,
        });
        abortRef.current = null;
        if (requeteId.current !== jeton) return;
        if (resultat.interrompu) return;
        const resumeActions = resultat.actions.length > 0
          ? `\n\n---\n**Actions :** ${resultat.actions.map(a => `${a.outil} (${a.statut})`).join(', ')}`
          : '';
        // Ollama local absent/injoignable : guider vers le mode conseil (sans Ollama).
        const ollamaKO = resultat.modeleAbsent || /injoignable|absent|démarré/i.test(resultat.reponse);
        const conseil = ollamaKO
          ? `\n\n---\n**Astuce :** le Mode action exige Ollama + le modèle « aerorisq » sur ce poste. Décochez « Mode action » pour une réponse immédiate en mode conseil (aucune installation requise).`
          : '';
        setConversation(prev => prev.map(m =>
          m.id === placeholderId
            ? { ...m, content: resultat.reponse + resumeActions + conseil }
            : m));
      } else {
        const result = await assistantAgent.chat({
          message: userMessage.content,
          contexte: {
            module: activeModule || 'global',
            ...(currentAerodrome?.id ? { aerodromeId: currentAerodrome.id } : {}),
            ...(user?.id ? { userId: user.id } : {}),
          },
          userRole: user?.role || 'inspector',
        });
        if (requeteId.current !== jeton) return;
        setConversation(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.message,
          timestamp: new Date(),
          actions: result.actions,
          sources: result.sources,
        }]);
      }
    } catch (err) {
      if (requeteId.current !== jeton) return;
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: erreurIaEnClair((err as Error)?.message),
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      setConfirmation(null);
      setTracePilote([]);
    }
  };

  const handleNewConversation = () => {
    setConversation([]);
    addNotification({ user_id: user?.id || '', type: 'info', title: 'Nouvelle conversation', message: 'L\'historique a été effacé', canal: 'in_app' });
  };

  const handleClearHistory = () => {
    setConversation([]);
    addNotification({ user_id: user?.id || '', type: 'info', title: 'Historique effacé', message: 'Tous les messages ont été supprimés', canal: 'in_app' });
  };

  // Ouverture : reborne toujours (une position mémorisée peut être hors champ
  // après redimensionnement ou changement d'écran).
  const ouvrirRef = useRef(() => {});
  ouvrirRef.current = () => {
    setPosition((pos) => bornerPosition(pos.x, pos.y));
    setIsOpen(true);
    setTimeout(() => document.getElementById('ia-message-input')?.focus(), 100);
  };

  useEffect(() => {
    // Garde anti-rôles en lecture directe du store (pas de closure périmée).
    const roleAutorise = () =>
      ['admin', 'inspector', 'dg_anacim'].includes(useAppStore.getState().user?.role || '');
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+J dédié (Ctrl+K = palette de commandes) — évite la double ouverture.
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        if (!roleAutorise()) return;
        e.preventDefault();
        ouvrirRef.current();
      }
    };
    const handleOpenIA = (e: Event) => {
      if (!roleAutorise()) return;
      const detail = (e as CustomEvent).detail;
      if (detail?.anchorRight !== undefined) {
        // Sous le bouton si ça tient, sinon AU-DESSUS — jamais hors écran.
        const x = detail.anchorRight - PANNEAU_L;
        const yDessous = (detail.anchorBottom ?? 0) + 8;
        const y = yDessous + PANNEAU_H + 8 <= window.innerHeight
          ? yDessous
          : (detail.anchorBottom ?? 0) - PANNEAU_H - 8;
        setPosition(bornerPosition(x, y));
      }
      ouvrirRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-ia', handleOpenIA);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-ia', handleOpenIA);
    };
  }, []);

  if (!isOpen) {
    if (hideTrigger || !peutVoirAssistant) return null;
    return (
      <button
        ref={buttonRef}
        onClick={() => ouvrirRef.current()}
        className="fixed z-50 w-12 h-12 rounded-full bg-role-gradient shadow-role-glow flex items-center justify-center hover:scale-110 transition-all duration-300 cursor-grab active:cursor-grabbing"
        style={{ left: position.x, top: position.y }}
        onMouseDown={handleMouseDown}
      >
        <Brain className="w-5 h-5 text-white" />
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      className={`fixed z-50 bg-background rounded-2xl shadow-2xl border border-border transition-all duration-300 ${isMinimized ? 'w-80' : 'w-96'} max-w-[calc(100vw-2rem)]`}
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="flex items-center justify-between p-3 border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent rounded-t-2xl cursor-grab active:cursor-grabbing"
        onMouseDown={handlePanelMouseDown}
      >
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-sm">Assistant AERORISQ</span>
          <span className="text-[10px] text-muted-foreground">Ctrl+J</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleNewConversation} className="action-button w-7 h-7 p-0" title="Nouvelle conversation">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleClearHistory} className="action-button w-7 h-7 p-0" title="Effacer l'historique">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setIsMinimized(!isMinimized)} className="action-button w-7 h-7 p-0">
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="action-button w-7 h-7 p-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {peutPiloter && (
          <div className="px-4 pt-2">
            <label className="flex items-center gap-1.5 cursor-pointer w-fit" title="Le mode conseil répond ; le mode action EXÉCUTE via des outils (chaque écriture demande votre approbation).">
              <input
                type="checkbox"
                checked={modePilote}
                onChange={(e) => setModePilote(e.target.checked)}
                className="accent-warning w-3.5 h-3.5"
              />
              <span className="text-[11px] font-medium text-foreground/80 flex items-center gap-1">
                <Zap className="w-3 h-3 text-warning" /> Mode action — l’IA exécute
              </span>
            </label>
            {modePilote && (
              <label className="flex items-center gap-1.5 cursor-pointer w-fit" title="PDF/Word générés et téléchargés aussitôt, sans demander. Ne concerne QUE les rapports (lecture seule) — planifications et écarts restent confirmés un par un.">
                <input
                  type="checkbox"
                  checked={autoRapports}
                  onChange={(e) => basculerAutoRapports(e.target.checked)}
                  className="accent-success w-3 h-3"
                />
                <span className="text-[11px] text-foreground/70">Rapports auto (PDF/Word sans demander)</span>
              </label>
            )}
          </div>
          )}
          <div className="p-4 min-h-[300px] max-h-[400px] overflow-y-auto space-y-3">
            {conversation.length === 0 ? (
              <div className="text-center text-muted-foreground">
                <Brain className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Posez-moi une question sur l'application</p>
                <p className="text-xs mt-1">Ex: "Détaille l'écart ECA-2026-042" ou "Rapport de surveillance pour GOOY"</p>
              </div>
            ) : (
              conversation.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg ${msg.role === 'user' ? 'bg-role-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
                    {msg.role === 'user'
                      ? <p className="text-sm">{msg.content}</p>
                      : <Markdown texte={msg.content} className="text-sm" />}
                    {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-1">Sources (données SGDA)</p>
                        {msg.sources.map((s, i) => (
                          <p key={i} className="text-[11px] opacity-80">• {s.title}{s.reference ? ` — ${s.reference}` : ''}</p>
                        ))}
                      </div>
                    )}
                    {msg.role === 'assistant' && msg.actions && msg.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.actions
                          .filter(a => a.type === 'navigate' && a.target && MODULES_NAVIGATION[a.target])
                          .map(a => (
                            <button
                              key={a.id}
                              onClick={() => { setActiveModule(MODULES_NAVIGATION[a.target!] as never); setIsOpen(false); }}
                              className="btn btn-secondary h-7 px-2.5 text-[11px] gap-1"
                              title={a.description}
                            >
                              {a.label} →
                            </button>
                          ))}
                        {peutPiloter && msg.actions
                          .filter(a => a.type === 'generate')
                          .map(a => (
                            <button
                              key={a.id}
                              onClick={relancerEnPilote}
                              className="btn btn-primary h-7 px-2.5 text-[11px] gap-1"
                              title="Bascule en Mode action et régénère le vrai document PDF téléchargeable (chaque écriture reste confirmée)"
                            >
                              {a.label} ⬇
                            </button>
                          ))}
                      </div>
                    )}
                    <p className="text-[9px] opacity-50 mt-1">{msg.timestamp.toLocaleTimeString()}</p>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg space-y-1.5 max-w-[85%]">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs text-muted-foreground">AERORISQ travaille…</span>
                    <button
                      onClick={interrompre}
                      className="btn btn-secondary h-6 px-2 text-[10px] ml-auto"
                    >
                      Interrompre
                    </button>
                  </div>
                  {tracePilote.map((etape, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground font-mono">{etape}</p>
                  ))}
                </div>
              </div>
            )}
            {confirmation && (
              <div className="rounded-xl border-2 border-warning bg-warning/5 p-2.5">
                <p className="text-xs font-semibold text-foreground">✋ Approbation requise : <span className="font-mono">{confirmation.outil}</span></p>
                <pre className="mt-1 max-h-24 overflow-auto rounded bg-card p-1.5 text-[10px] text-foreground/80">
                  {JSON.stringify(confirmation.args, null, 2)}
                </pre>
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    onClick={() => { confirmation.resoudre(true); setConfirmation(null); }}
                    className="btn btn-primary h-7 px-3 text-[11px]"
                  >
                    Approuver
                  </button>
                  <button
                    onClick={() => { confirmation.resoudre(false); setConfirmation(null); }}
                    className="btn btn-secondary h-7 px-3 text-[11px]"
                  >
                    Refuser
                  </button>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-border flex gap-2">
            <button
              onClick={toggleDictation}
              className={`action-button w-9 h-9 p-0 ${isDictating ? 'text-danger' : ''}`}
              title={isDictating ? 'Arrêter la dictée' : 'Dictée vocale'}
            >
              {isDictating ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input
              id="ia-message-input"
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={isDictating ? '🎙️ Parlez maintenant...' : 'Posez votre question...'}
              className="flex-1 form-input text-sm"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !message.trim()}
              className="btn btn-primary gap-1 h-9"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </>
      )}

      {isMinimized && (
        <div className="p-2 text-xs text-muted-foreground text-center">Cliquez pour agrandir</div>
      )}
    </div>
  );
}
