'use client';

// components/modules/checklist/ChampObservationMixte.tsx
// Champ d'observation unifie clavier / stylet / mixte :
//   - clavier -> textarea texte ;
//   - stylet  -> canvas manuscrit (PNG, observation_stylus_data) ;
//   - mixte   -> les deux, conserves separement.
// Bouton Transcrire : envoie le PNG au modele de vision local
// (POST /api/ia/lire-document, mode 'manuscrit') et affiche le resultat
// dans une zone de VALIDATION HUMAINE editable — rien n'est insere sans
// clic explicite (Ajouter a la suite / Remplacer / Annuler).
// Best-effort : Ollama absent ou illisible -> message, jamais bloquant.

import React, { useState, useCallback } from 'react';
import { Sparkles, Loader2, AlertTriangle, X } from 'lucide-react';
import type { ModeSaisie } from '@/types/checklist';
import { StylusCanvas } from './StylusCanvas';

interface ChampObservationMixteProps {
  texte: string;
  stylusData?: string;
  onChange: (texte: string, stylusData?: string) => void;
  mode: ModeSaisie;
  readOnly?: boolean;
  placeholder?: string;
  rows?: number;
  transcriptionLabel: string;
  textClassName?: string;
}

type TranscriptionState =
  | { phase: 'idle' }
  | { phase: 'chargement' }
  | { phase: 'apercu'; texte: string }
  | { phase: 'erreur'; message: string; aide?: string };

export function ChampObservationMixte({
  texte,
  stylusData,
  onChange,
  mode,
  readOnly = false,
  placeholder = 'Observation terrain...',
  rows = 2,
  transcriptionLabel,
  textClassName = 'form-textarea w-full text-[13px] resize-none',
}: ChampObservationMixteProps) {
  const [transcription, setTranscription] = useState<TranscriptionState>({ phase: 'idle' });

  const showClavier = mode === 'clavier' || mode === 'mixte';
  const showStylet = mode === 'stylet' || mode === 'mixte';

  const handleTexte = useCallback((v: string) => {
    onChange(v, stylusData || undefined);
  }, [onChange, stylusData]);

  const handleStylus = useCallback((data: string) => {
    onChange(texte, data || undefined);
  }, [onChange, texte]);

  const lancerTranscription = useCallback(async () => {
    if (!stylusData || readOnly) return;
    setTranscription({ phase: 'chargement' });
    try {
      const res = await fetch('/api/ia/lire-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: transcriptionLabel, images: [stylusData], mode: 'manuscrit' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.texte) {
        setTranscription({
          phase: 'erreur',
          message: data?.error || 'Transcription impossible.',
          aide: data?.aide,
        });
        return;
      }
      setTranscription({ phase: 'apercu', texte: String(data.texte).trim() });
    } catch (err) {
      setTranscription({ phase: 'erreur', message: (err as Error)?.message || 'Transcription impossible.' });
    }
  }, [stylusData, readOnly, transcriptionLabel]);

  const insererTranscription = useCallback((strategie: 'suite' | 'remplace') => {
    if (transcription.phase !== 'apercu') return;
    const ajout = transcription.texte.trim();
    if (!ajout) { setTranscription({ phase: 'idle' }); return; }
    const nouveau = strategie === 'remplace' || !texte.trim()
      ? ajout
      : `${texte.trim()}\n${ajout}`;
    onChange(nouveau, stylusData || undefined);
    setTranscription({ phase: 'idle' });
  }, [transcription, texte, onChange, stylusData]);

  return (
    <div className="space-y-1.5">
      {showClavier && (
        <textarea
          value={texte}
          onChange={e => handleTexte(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={readOnly}
          className={textClassName}
        />
      )}
      {showStylet && !readOnly && (
        <StylusCanvas value={stylusData || ''} onChange={handleStylus} height={60} />
      )}
      {showStylet && readOnly && stylusData && (
        // Lecture seule : l'image manuscrite reste visible.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={stylusData} alt="Note manuscrite" className="max-w-full rounded border border-border" />
      )}
      {showStylet && !!stylusData && !readOnly && transcription.phase === 'idle' && (
        <button
          type="button"
          onClick={lancerTranscription}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border border-primary/30 text-primary hover:bg-primary/5"
          title="Transcrire l'ecriture manuscrite en texte (modele de vision local, a valider)"
        >
          <Sparkles className="w-3 h-3" /> Transcrire le manuscrit
        </button>
      )}
      {transcription.phase === 'chargement' && (
        <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" /> Lecture du manuscrit par la vision locale…
        </p>
      )}
      {transcription.phase === 'erreur' && (
        <div className="rounded border border-warning/40 bg-warning/5 p-1.5 text-[11px]">
          <p className="inline-flex items-center gap-1 font-medium">
            <AlertTriangle className="w-3 h-3" /> {transcription.message}
          </p>
          {transcription.aide && <p className="text-muted-foreground mt-0.5">{transcription.aide}</p>}
          <button type="button" onClick={() => setTranscription({ phase: 'idle' })} className="mt-1 underline">Fermer</button>
        </div>
      )}
      {transcription.phase === 'apercu' && (
        <div className="rounded border border-primary/30 bg-primary/5 p-1.5 space-y-1.5">
          <p className="text-[11px] font-medium">Verifiez la transcription avant insertion :</p>
          <textarea
            value={transcription.texte}
            onChange={e => setTranscription({ phase: 'apercu', texte: e.target.value })}
            rows={3}
            className="form-textarea w-full text-[12px]"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => insererTranscription('suite')}
              className="btn btn-sm px-2 py-0.5 btn-primary text-[11px]"
            >
              Ajouter a la suite
            </button>
            <button
              type="button"
              onClick={() => insererTranscription('remplace')}
              className="btn btn-sm px-2 py-0.5 btn-secondary text-[11px]"
            >
              Remplacer
            </button>
            <button
              type="button"
              onClick={() => setTranscription({ phase: 'idle' })}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-muted-foreground hover:underline"
            >
              <X className="w-3 h-3" /> Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}