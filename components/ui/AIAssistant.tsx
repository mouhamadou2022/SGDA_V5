// components/ui/AIAssistant.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Brain, X, Send, Loader2, Minimize2, Maximize2, Trash2, RefreshCw, Mic, MicOff } from 'lucide-react';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import { useAppStore } from '@/lib/store';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function AIAssistant({ hideTrigger = false }: { hideTrigger?: boolean } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: typeof window !== 'undefined' ? window.innerHeight - 80 : 500 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState('');
  const [conversation, setConversation] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const user = useAppStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('ia-button-position');
      if (saved) {
        const pos = JSON.parse(saved);
        const maxX = window.innerWidth - 60;
        const maxY = window.innerHeight - 60;
        setPosition({
          x: Math.min(Math.max(0, pos.x), maxX),
          y: Math.min(Math.max(0, pos.y), maxY),
        });
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

  const handleSend = async () => {
    if (!message.trim()) return;
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    setConversation(prev => [...prev, userMessage]);
    setMessage('');
    setIsLoading(true);
    try {
      const result = await assistantAgent.chat({
        message: userMessage.content,
        contexte: { module: 'global' },
        userRole: user?.role || 'inspector',
      });
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.message,
        timestamp: new Date(),
      }]);
    } catch {
      setConversation(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Désolé, une erreur est survenue. Veuillez réessayer.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => document.getElementById('ia-message-input')?.focus(), 100);
      }
    };
    const handleOpenIA = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.anchorRight !== undefined) {
        const panelWidth = 384;
        const x = Math.max(8, Math.min(detail.anchorRight - panelWidth, window.innerWidth - panelWidth - 8));
        const y = detail.anchorBottom + 8;
        setPosition({ x, y });
      }
      setIsOpen(true);
      setTimeout(() => document.getElementById('ia-message-input')?.focus(), 100);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-ia', handleOpenIA);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-ia', handleOpenIA);
    };
  }, []);

  if (!isOpen) {
    if (hideTrigger) return null;
    return (
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(true)}
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
          <span className="font-semibold text-sm">Assistant IA</span>
          <span className="text-[10px] text-muted-foreground">Ctrl+K</span>
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
          <div className="p-4 min-h-[300px] max-h-[400px] overflow-y-auto space-y-3">
            {conversation.length === 0 ? (
              <div className="text-center text-muted-foreground">
                <Brain className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Posez-moi une question sur l'application</p>
                <p className="text-xs mt-1">Ex: "Comment créer un planning ?"</p>
              </div>
            ) : (
              conversation.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg ${msg.role === 'user' ? 'bg-role-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'}`}>
                    <p className="text-sm">{msg.content}</p>
                    <p className="text-[9px] opacity-50 mt-1">{msg.timestamp.toLocaleTimeString()}</p>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin" />
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
