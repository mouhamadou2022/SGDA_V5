'use client';

// components/modules/checklist/StylusCanvas.tsx
// Canvas de saisie manuscrite partagé (stylet/doigt) — source unique.
// Remplace les copies locales (ChecklistStandardTable, SGSEvaluation) :
// même comportement (SignaturePad → PNG dataURL), mêmes classes CSS
// (.checklist-stylus-canvas, .stylus-hint, .checklist-stylus-clear).
// La valeur est une image PNG (observation_stylus_data) : AUCUNE
// reconnaissance d'écriture ici — voir ChampObservationMixte pour la
// transcription vision (validation humaine obligatoire).

import React, { useState, useRef, useEffect } from 'react';
import SignaturePad from 'signature_pad';
import { X } from 'lucide-react';

export function StylusCanvas({ value, onChange, height = 80 }: {
  value: string; onChange: (data: string) => void; height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const valueRef = useRef(value);
  // Écriture du ref DANS un effet (react-hooks/refs) : l'assigner pendant le
  // rendu est un anti-pattern. La valeur initiale vient du useRef ci-dessus,
  // donc les gestionnaires SignaturePad lisent toujours la bonne valeur.
  useEffect(() => { valueRef.current = value; }, [value]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 2);
    const width = canvas.parentElement?.clientWidth || 300;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);
    const sp = new SignaturePad(canvas, { penColor: 'rgb(0,0,0)', minWidth: 1, maxWidth: 2 });
    sigPadRef.current = sp;
    const onBegin = () => setIsDrawing(true);
    const onEnd = () => { setIsDrawing(false); onChange(sp.toDataURL('image/png')); };
    sp.addEventListener('beginStroke', onBegin);
    sp.addEventListener('endStroke', onEnd);
    if (valueRef.current) sp.fromDataURL(valueRef.current);
    return () => { sp.removeEventListener('beginStroke', onBegin); sp.removeEventListener('endStroke', onEnd); };
  }, [height, onChange]);

  useEffect(() => {
    if (value && sigPadRef.current && !isDrawing) {
      sigPadRef.current.clear();
      sigPadRef.current.fromDataURL(value);
    }
  }, [value, isDrawing]);

  return (
    <div className="checklist-stylus-canvas">
      <canvas ref={canvasRef} className="canvas-dynamic" style={{ height: `${height}px` } as React.CSSProperties} />
      {!isDrawing && !value && <div className="stylus-hint">✍️ Écrire ici avec le stylet ou le doigt</div>}
      {value && (
        <button type="button" onClick={() => { sigPadRef.current?.clear(); onChange(''); }} className="checklist-stylus-clear" title="Effacer">
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
