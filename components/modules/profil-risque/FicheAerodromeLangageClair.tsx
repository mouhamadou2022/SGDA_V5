// components/modules/profil-risque/FicheAerodromeLangageClair.tsx

// Encart « Fiche de l'aérodrome — en langage clair » : résumé factuel des
// données du formulaire aérodrome (identité, piste, exploitant, horaires,
// SGS, contacts). 100 % déterministe (aucun LLM, aucune invention) + votes
// qui alimentent la boucle d'apprentissage comme les autres encarts.

'use client'

import { useMemo, useState } from 'react'
import { Building2, ChevronDown, ChevronUp } from 'lucide-react'
import type { Aerodrome } from '@/lib/store/aerodromesSlice'
import { resumerFicheAerodrome } from '@/lib/ficheAerodromeResume'
import { LangageClairFeedback } from '@/components/modules/profil-risque/LangageClairFeedback'

export default function FicheAerodromeLangageClair({ aerodrome }: { aerodrome: Aerodrome }) {
  const lignes = useMemo(() => resumerFicheAerodrome(aerodrome), [aerodrome]);
  const [ouvert, setOuvert] = useState(true);
  if (lignes.length === 0) return null;
  const texte = lignes.join(' ');
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary-soft/10 p-4" data-module="fiche-aerodrome-langage-clair">
      <button onClick={() => setOuvert((o) => !o)} className="w-full flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Building2 className="w-4 h-4 text-role-primary" /> Fiche de l'aérodrome — en langage clair
        </span>
        <span className="flex items-center gap-2">
          {ouvert ? <ChevronUp className="w-4 h-4 text-foreground" /> : <ChevronDown className="w-4 h-4 text-foreground" />}
        </span>
      </button>
      {ouvert && (
        <div className="mt-3 text-xs text-foreground">
          <ul className="space-y-1.5">
            {lignes.map((l, i) => (
              <li key={i} className="leading-relaxed">• {l}</li>
            ))}
          </ul>
          <LangageClairFeedback module="fiche-aerodrome" aerodromeId={aerodrome.code_oaci} contexte={{}} texte={texte} fallbackIA={true} />
        </div>
      )}
    </div>
  );
}
