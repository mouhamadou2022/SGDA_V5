// components/modules/surveillance/IaAssistant.tsx
// Extrait de SurveillanceEcartsRedaction (comportement identique).
'use client';

import { useState } from 'react';
import { Brain, Loader2, Send } from 'lucide-react';
import { focusClass } from './ecartsRedactionUtils';

// ─────────────────────────────────────────────────────────────
// COMPOSANT: IaAssistant
// ─────────────────────────────────────────────────────────────
export function IaAssistant({ onQuestion, isAsking }: { onQuestion: (question: string) => void; isAsking: boolean }) {
  const [question, setQuestion] = useState('');
  const [show, setShow] = useState(false);

  const handleAsk = () => {
    if (question.trim()) {
      onQuestion(question);
      setQuestion('');
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="action-button text-role-primary"
        title="Assistant AERORISQ"
      >
        <Brain className="w-4 h-4" />
      </button>

      {show && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-xl shadow-lg z-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-role-primary" />
            <span className="text-sm font-semibold">Assistant AERORISQ</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Posez une question sur la rédaction des écarts..."
              className={`flex-1 form-input text-sm ${focusClass}`}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
            />
            <button
              onClick={handleAsk}
              disabled={isAsking || !question.trim()}
              className="btn btn-sm px-3 py-1 btn-primary"
            >
              {isAsking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
