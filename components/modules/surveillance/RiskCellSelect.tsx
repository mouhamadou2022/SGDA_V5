// components/modules/surveillance/RiskCellSelect.tsx
// Extrait de SurveillanceEcartsRedaction (comportement identique).
'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

// Liste déroulante fiable : la valeur choisie s'affiche toujours dans le champ.
interface RiskCellSelectProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  widthClass?: string;
}
export function RiskCellSelect<T extends string | number>({ value, options, onChange, widthClass }: RiskCellSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label ?? String(value);

  return (
    <div ref={ref} className={`relative ${widthClass || 'w-14'}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between gap-1.5 h-8 w-full px-2 rounded-lg border-2 border-[hsl(var(--border))] bg-white text-sm font-semibold text-foreground hover:border-[var(--role-primary)] transition-all"
      >
        <span>{selectedLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-border bg-white shadow-lg overflow-hidden">
          {options.map(o => (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`block w-full text-left px-2.5 py-1.5 text-sm hover:bg-[hsl(var(--muted))] transition-colors ${o.value === value ? 'font-bold text-[var(--role-primary)] bg-[hsl(var(--muted))]' : 'text-foreground'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
