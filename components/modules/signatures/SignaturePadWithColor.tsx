// components/modules/signatures/SignaturePadWithColor.tsx
'use client';

import React, { useRef, useEffect, useState } from 'react';
import SignaturePad from 'signature_pad';
import { Paintbrush, RotateCcw, Check, X, PenLine } from 'lucide-react';

interface SignaturePadWithColorProps {
  onSave: (signatureUrl: string) => void;
  onCancel: () => void;
  width?: number;
  height?: number;
  signataireNom?: string;
}

const COLORS = [
  { name: 'Noir', value: '#000000' },
  { name: 'Bleu', value: '#2563eb' },
  { name: 'Rouge', value: '#dc2626' },
  { name: 'Vert', value: '#16a34a' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Violet', value: '#9333ea' },
];

export function SignaturePadWithColor({
  onSave,
  onCancel,
  width = 600,
  height = 200,
  signataireNom = "Inspecteur"
}: SignaturePadWithColorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [signaturePad, setSignaturePad] = useState<SignaturePad | null>(null);
  const [color, setColor] = useState('#000000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [penSize, setPenSize] = useState(2);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);

  // Initialisation du canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Ajouter une ligne de guidage
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, height - 30);
      ctx.lineTo(width - 20, height - 30);
      ctx.stroke();

      // Ajouter un texte indicatif
      ctx.font = '12px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Signez ici', 20, height - 40);
    }

    const pad = new SignaturePad(canvas, {
      penColor: color,
      backgroundColor: '#ffffff',
      minWidth: 1,
      maxWidth: penSize,
      throttle: 16
    });

    setSignaturePad(pad);

    return () => {
      pad.off();
    };
  }, [width, height]);

  // Mettre à jour la couleur
  useEffect(() => {
    if (signaturePad) {
      signaturePad.penColor = color;
    }
  }, [color, signaturePad]);

  // Mettre à jour la taille du stylo
  useEffect(() => {
    if (signaturePad) {
      signaturePad.minWidth = 1;
      signaturePad.maxWidth = penSize;
    }
  }, [penSize, signaturePad]);

  const handleClear = () => {
    if (signaturePad) {
      signaturePad.clear();
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        // Remettre la ligne de guidage
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(20, height - 30);
        ctx.lineTo(width - 20, height - 30);
        ctx.stroke();

        ctx.font = '12px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Signez ici', 20, height - 40);
      }
    }
  };

  const handleSave = () => {
    if (!canvasRef.current || !signaturePad) return;

    if (signaturePad.isEmpty()) {
      alert('Veuillez signer avant de valider');
      return;
    }

    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="space-y-4 signature-container">
      {/* Barre d'outils */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Couleur */}
          <div className="relative">
            <button
              className="btn btn-secondary btn-sm gap-2"
              onClick={() => { setShowColorPicker(!showColorPicker); setShowSizePicker(false); }}
            >
              <Paintbrush className="h-4 w-4" />
              Couleur
            </button>
            {showColorPicker && (
              <div className="dropdown-menu absolute z-50 top-full left-0 mt-1 w-64 p-3 rounded-xl shadow-lg border border-border bg-background">
                <p className="text-xs font-medium text-gray-500 mb-2">Choisir une couleur</p>
                <div className="grid grid-cols-3 gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      className={`h-8 rounded-md border-2 transition-all ${color === c.value ? 'border-role-primary scale-105 ring-2 ring-gray-200' : 'border-transparent'}`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => { setColor(c.value); setShowColorPicker(false); }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Taille */}
          <div className="relative">
            <button
              className="btn btn-secondary btn-sm gap-2"
              onClick={() => { setShowSizePicker(!showSizePicker); setShowColorPicker(false); }}
            >
              <PenLine className="h-4 w-4" />
              Taille
            </button>
            {showSizePicker && (
              <div className="dropdown-menu absolute z-50 top-full left-0 mt-1 w-64 p-3 rounded-xl shadow-lg border border-border bg-background">
                <p className="text-xs font-medium text-gray-500 mb-2">Épaisseur du trait</p>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="0.5"
                    value={penSize}
                    onChange={(e) => setPenSize(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono w-8">{penSize.toFixed(1)}px</span>
                </div>
                <div className="flex justify-center mt-2">
                  <div
                    className="rounded-full bg-black"
                    style={{ width: penSize * 4, height: penSize * 4 }}
                  />
                </div>
              </div>
            )}
          </div>

          <button className="btn btn-secondary btn-sm gap-2" onClick={handleClear}>
            <RotateCcw className="h-4 w-4" />
            Effacer
          </button>
        </div>

        <div className="text-sm text-gray-500">
          {isDrawing ? 'Signez...' : 'Cliquez et glissez pour signer'}
        </div>
      </div>

      {/* Zone de signature avec cadre */}
      <div
        className="border-2 border-gray-300 rounded-lg bg-white p-1 cursor-crosshair shadow-inner"
        onMouseEnter={() => setIsDrawing(true)}
        onMouseLeave={() => setIsDrawing(false)}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-auto touch-none rounded"
          style={{ width: width + 'px', height: height + 'px' }}
        />
      </div>

      {/* Informations du signataire */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <div>Signataire: {signataireNom}</div>
        <div>Date: {new Date().toLocaleDateString('fr-FR')}</div>
      </div>

      {/* Boutons d'action */}
      <div className="form-actions pt-2">
        <button className="btn btn-secondary gap-2" onClick={onCancel}>
          <X className="h-4 w-4" />
          Annuler
        </button>
        <button className="btn btn-primary gap-2" onClick={handleSave}>
          <Check className="h-4 w-4" />
          Valider la signature
        </button>
      </div>
    </div>
  );
}
