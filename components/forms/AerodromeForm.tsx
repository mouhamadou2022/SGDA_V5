// components/forms/AerodromeForm.tsx
'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LazyLoad } from '@/lib/performance/globalOptimizer';
import { z } from 'zod';
import {
  Plane, MapPin, Ruler, Save, X, AlertCircle, Globe, Phone,
  Mail, User, Plus, Compass, ArrowUp, Gauge, Search as SearchIcon,
  Loader2, Sparkles, HelpCircle, Target, Building2, Flag,
  ChevronRight, ChevronLeft, Check, CheckCircle2, Brain, Info, Clock,
  Radio, Fuel, Zap, CalendarDays, Navigation, Waves, Weight, Flame, Shield, Hash,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useAppStore, Aerodrome, type TypeEntiteAerodrome } from '@/lib/store';
import { REGIONS } from '@/lib/config';
import { useFormProgress } from '@/hooks/useFormProgress';
import { FormProgressContext } from '@/components/ui/FormShell';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import type { HelistationData, TypeInstallation, MoyenCom } from '@/lib/types/helistation';
import { TYPE_INSTALLATION_LABELS, MOYEN_COM_LABELS } from '@/lib/types/helistation';

// ── Import dynamique de la carte ────────────────────────────────────────────
const LocationPicker = dynamic(() => import('@/components/modules/aerodromes/LocationPicker'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] bg-role-primary-soft rounded-xl flex flex-col items-center justify-center gap-2 animate-pulse">
      <MapPin className="h-8 w-8 text-role-primary" />
      <p className="text-small text-muted-foreground">Chargement de la carte…</p>
    </div>
  ),
});

// ── Constantes ──────────────────────────────────────────────────────────────
const CATEGORIES_SSLIA = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const REVETEMENTS = ['Béton bitumineux', 'Bitume', 'Latérite', 'Herbe', 'Terre'];
const MATURITE_SGS = [
  { value: 1, label: 'N1 - Absent',       description: 'Aucun système de gestion de la sécurité formalisé' },
  { value: 2, label: 'N2 - Présent',      description: 'Documentation SGS existante mais non appliquée' },
  { value: 3, label: 'N3 - Approprié',    description: "SGS adapté à la taille et complexité de l'aérodrome" },
  { value: 4, label: 'N4 - Opérationnel', description: 'SGS pleinement opérationnel et appliqué' },
  { value: 5, label: 'N5 - Efficace',     description: 'SGS démontrant son efficacité par des indicateurs' },
];
const TYPE_ENTITE_OPTIONS: { value: TypeEntiteAerodrome; label: string; description: string; icon: string }[] = [
  { value: 'aerodrome',   label: 'Aérodrome',  icon: '✈',    description: 'Piste(s) fixe(s) — RAS 14 Partie I' },
  { value: 'helistation', label: 'Hélistation', icon: '🚁',  description: 'FATO/TLOF uniquement — RAS 14 Partie II' },
  { value: 'mixte',       label: 'Mixte',       icon: '✈ / 🚁', description: 'Piste(s) + FATO — deux référentiels' },
];

const focusClass = 'focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all';
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
};

// ── Étapes du wizard ─────────────────────────────────────────────────────────
const BASE_STEPS = [
  { id: 1, key: 'localisation',   label: 'Localisation',  icon: MapPin },
  { id: 2, key: 'ia',             label: 'Validation IA', icon: Sparkles },
  { id: 3, key: 'general',        label: 'Général',       icon: Plane },
  { id: 4, key: 'exploitant',     label: 'Exploitant',    icon: Building2 },
  { id: 5, key: 'infrastructure', label: 'Infrastructure',icon: Ruler },
  { id: 6, key: 'sgs',            label: 'SGS & Statut',  icon: Gauge },
] as const;

function getStep5Label(te: TypeEntiteAerodrome): string {
  if (te === 'helistation') return 'FATO & TLOF';
  if (te === 'mixte')       return 'Piste & FATO';
  return 'Infrastructure';
}

// Champs à valider à chaque étape (communs)
const COMMON_STEP_FIELDS: Record<number, string[]> = {
  1: ['latitude', 'longitude', 'altitude'],
  2: [],
  3: ['nom', 'code_oaci', 'type', 'type_entite', 'categorie_sslia', 'region'],
  4: [],
  // Étape 5 : pas de validation bloquante — les champs infrastructure
  // ont des valeurs vides par défaut légitimes (à remplir progressivement).
  // La validation complète se fait à la soumission finale via superRefine.
  5: [],
  6: ['maturite_sgs', 'statut'],
};

function getStep5Fields(te: TypeEntiteAerodrome): string[] {
  const piste = ['piste_principale.longueur', 'piste_principale.largeur', 'piste_principale.revetement', 'piste_principale.code_reference'];
  const heli  = ['helistation.valeur_d', 'helistation.cap'];
  if (te === 'aerodrome')   return piste;
  if (te === 'helistation') return heli;
  return [...piste, ...heli];
}

// ── Types IA ─────────────────────────────────────────────────────────────────
interface AiSuggestionField {
  value: string | number;
  confidence: number;
  source: 'training' | 'websearch' | 'nominatim' | 'estimate' | '';
}

interface AiSuggestion {
  nom: AiSuggestionField;
  code_oaci: AiSuggestionField;
  region: AiSuggestionField;
  type: AiSuggestionField;
  type_entite: AiSuggestionField;
  categorie_sslia: AiSuggestionField;
  exploitant_nom: AiSuggestionField;
  exploitant_adresse: AiSuggestionField;
  exploitant_telephone: AiSuggestionField;
  piste_longueur: AiSuggestionField;
  piste_largeur: AiSuggestionField;
  piste_orientation: AiSuggestionField;
  piste_revetement: AiSuggestionField;
  piste_pcr: AiSuggestionField;
  piste_code_reference: AiSuggestionField;
  piste_avion_reference: AiSuggestionField;
  piste_type_approche: AiSuggestionField;
  heli_valeur_d: AiSuggestionField;
  heli_cap: AiSuggestionField;
  heli_altitude_ft: AiSuggestionField;
  heli_mtom: AiSuggestionField;
  heli_moyen_com: AiSuggestionField;
  heli_frequence_com: AiSuggestionField;
  heli_indicatif_rt: AiSuggestionField;
  heli_identification: AiSuggestionField;
  heli_marque_distinctive: AiSuggestionField;
  heli_type_installation: AiSuggestionField;
  heli_hauteur_maximale_ft: AiSuggestionField;
  heli_hauteur_obstacle_ft: AiSuggestionField;
  heli_avitaillement: AiSuggestionField;
  heli_gpu: AiSuggestionField;
  heli_equipement_incendie: AiSuggestionField;
  heli_date_revision: AiSuggestionField;
  altitude: AiSuggestionField;
  horaires: AiSuggestionField;
  maturite_sgs_suggered: AiSuggestionField;
  statut: AiSuggestionField;
  statut_sgs: AiSuggestionField;
  statut_certification: AiSuggestionField;
  aides_visuelles: AiSuggestionField;
  notes?: string;
}

// ── Mapping Nominatim → régions ──────────────────────────────────────────────
function mapNominatimToRegion(state: string): string {
  const s = state.toLowerCase().trim();
  const map: [string, string][] = [
    ['dakar', 'Dakar'], ['thiès', 'Thiès'], ['thies', 'Thiès'],
    ['saint-louis', 'Saint-Louis'], ['saint louis', 'Saint-Louis'],
    ['diourbel', 'Diourbel'], ['fatick', 'Fatick'], ['kaolack', 'Kaolack'],
    ['ziguinchor', 'Ziguinchor'], ['kolda', 'Kolda'], ['tambacounda', 'Tambacounda'],
    ['matam', 'Matam'], ['kédougou', 'Kédougou'], ['kedougou', 'Kédougou'],
    ['sédhiou', 'Sédhiou'], ['sedhiou', 'Sédhiou'], ['kaffrine', 'Kaffrine'], ['louga', 'Louga'],
  ];
  for (const [key, val] of map) { if (s.includes(key)) return val; }
  return '';
}

// ── WebSearch OurAirports ────────────────────────────────────────────────────
async function searchOurAirports(codeOACI: string): Promise<Record<string, string> | null> {
  try {
    const res = await fetch('https://ourairports.com/data/airports.csv');
    const csv = await res.text();
    for (const line of csv.split('\n')) {
      const cols = line.split(',');
      if (cols[1]?.replace(/"/g, '').toUpperCase() === codeOACI.toUpperCase()) {
        return {
          oaci: cols[1]?.replace(/"/g, '') || '',
          type: cols[2]?.replace(/"/g, '') || '',
          nom: cols[3]?.replace(/"/g, '') || '',
          latitude: cols[4]?.replace(/"/g, '') || '',
          longitude: cols[5]?.replace(/"/g, '') || '',
          altitude: cols[8]?.replace(/"/g, '') || '',
          region_iso: cols[7]?.replace(/"/g, '') || '',
        };
      }
    }
    return null;
  } catch { return null; }
}

function emptyField(): AiSuggestionField {
  return { value: '', confidence: 0, source: '' };
}

async function suggestAerodrome(nom: string, lat: number, lon: number): Promise<AiSuggestion | null> {
  try {
    // Tentative d'extraire un code OACI
    const oaciMatch = nom.match(/\bGO[A-Z]{2}\b/i);
    let ourAirports = null;
    if (oaciMatch) ourAirports = await searchOurAirports(oaciMatch[0].toUpperCase());

    const prompt = `Tu es un expert ICAO spécialiste des aérodromes d'Afrique de l'Ouest.
Aérodrome recherché : "${nom}"
Coordonnées : ${lat.toFixed(4)}, ${lon.toFixed(4)}
${ourAirports ? `Données OurAirports trouvées : ${JSON.stringify(ourAirports)}` : ''}

Retourne UNIQUEMENT un objet JSON valide, sans texte avant ni après.
Pour chaque champ, estime ta confiance (0-100) :

- 90-100 : valeur certaine (AIP, training, donnée publique vérifiée)
- 70-89 : valeur très probable
- 50-69 : estimation raisonnable
- 20-49 : supposition
- 0-19 : inconnu (mets value="" et confidence=0)

Format de réponse :
{
  "nom": { "value": "...", "confidence": 95, "source": "training" },
  "code_oaci": { "value": "GO..", "confidence": 95, "source": "training" },
  "region": { "value": "Dakar", "confidence": 90, "source": "training" },
  "type": { "value": "international", "confidence": 95, "source": "training" },
  "type_entite": { "value": "aerodrome", "confidence": 90, "source": "training" },
  "categorie_sslia": { "value": "9", "confidence": 85, "source": "training" },
  "exploitant_nom": { "value": "...", "confidence": 80, "source": "training" },
  "exploitant_adresse": { "value": "", "confidence": 0, "source": "" },
  "exploitant_telephone": { "value": "", "confidence": 0, "source": "" },
  "piste_longueur": { "value": 3500, "confidence": 95, "source": "training" },
  "piste_largeur": { "value": 60, "confidence": 95, "source": "training" },
  "piste_orientation": { "value": "18/36", "confidence": 90, "source": "training" },
  "piste_revetement": { "value": "Béton bitumineux", "confidence": 95, "source": "training" },
  "piste_pcr": { "value": 80, "confidence": 70, "source": "estimate" },
  "piste_code_reference": { "value": "4E", "confidence": 90, "source": "training" },
  "piste_avion_reference": { "value": "Boeing 777-300ER", "confidence": 60, "source": "estimate" },
  "piste_type_approche": { "value": "cat1", "confidence": 85, "source": "training" },
   "heli_valeur_d": { "value": "", "confidence": 0, "source": "" },
  "heli_cap": { "value": "", "confidence": 0, "source": "" },
  "heli_altitude_ft": { "value": "", "confidence": 0, "source": "" },
  "heli_mtom": { "value": "", "confidence": 0, "source": "" },
  "heli_moyen_com": { "value": "", "confidence": 0, "source": "" },
  "heli_frequence_com": { "value": "", "confidence": 0, "source": "" },
  "heli_indicatif_rt": { "value": "", "confidence": 0, "source": "" },
  "heli_identification": { "value": "GTA HUB", "confidence": 60, "source": "estimate" },
  "heli_marque_distinctive": { "value": "", "confidence": 0, "source": "" },
  "heli_type_installation": { "value": "helisurface", "confidence": 40, "source": "estimate" },
  "heli_hauteur_maximale_ft": { "value": "", "confidence": 0, "source": "" },
  "heli_hauteur_obstacle_ft": { "value": "", "confidence": 0, "source": "" },
  "heli_avitaillement": { "value": false, "confidence": 30, "source": "estimate" },
  "heli_gpu": { "value": false, "confidence": 30, "source": "estimate" },
  "heli_equipement_incendie": { "value": "", "confidence": 0, "source": "" },
  "heli_date_revision": { "value": "", "confidence": 0, "source": "" },
  "altitude": { "value": 20, "confidence": 80, "source": "training" },
  "horaires": { "value": "h24", "confidence": 80, "source": "training" },
  "maturite_sgs_suggered": { "value": 3, "confidence": 70, "source": "estimate" },
  "statut": { "value": "actif", "confidence": 90, "source": "estimate" },
  "statut_sgs": { "value": "simplifie", "confidence": 50, "source": "estimate" },
  "statut_certification": { "value": "non_certifie", "confidence": 60, "source": "estimate" },
  "aides_visuelles": { "value": "PAPI,balisage_lumineux,manche_a_air", "confidence": 40, "source": "estimate" },
  "notes": "optionnel: explique ici les doutes éventuels"
}

Champs à ne remplir que si type_entite="aerodrome" ou "mixte" : piste_longueur, piste_largeur, piste_orientation, piste_revetement, piste_pcr, piste_code_reference, piste_avion_reference, piste_type_approche
Champs à ne remplir que si type_entite="helistation" ou "mixte" : tous les champs heli_* (heli_valeur_d, heli_cap, heli_altitude_ft, heli_mtom, heli_moyen_com, heli_frequence_com, heli_indicatif_rt, heli_identification, heli_marque_distinctive, heli_type_installation, heli_hauteur_maximale_ft, heli_hauteur_obstacle_ft, heli_avitaillement, heli_gpu, heli_equipement_incendie, heli_date_revision)
Ne mets JAMAIS de valeur pour un champ qui ne correspond pas au type_entite.`;

    const aiResult = await assistantAgent.chat({ message: prompt, contexte: { module: 'aerodrome-enrichissement' }, userRole: 'inspector' });
    const m = aiResult.message.match(/\{[\s\S]*?\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      const suggestion: AiSuggestion = {
        nom: parsed.nom ?? emptyField(),
        code_oaci: parsed.code_oaci ?? emptyField(),
        region: parsed.region ?? emptyField(),
        type: parsed.type ?? emptyField(),
        type_entite: parsed.type_entite ?? emptyField(),
        categorie_sslia: parsed.categorie_sslia ?? emptyField(),
        exploitant_nom: parsed.exploitant_nom ?? emptyField(),
        exploitant_adresse: parsed.exploitant_adresse ?? emptyField(),
        exploitant_telephone: parsed.exploitant_telephone ?? emptyField(),
        piste_longueur: parsed.piste_longueur ?? emptyField(),
        piste_largeur: parsed.piste_largeur ?? emptyField(),
        piste_orientation: parsed.piste_orientation ?? emptyField(),
        piste_revetement: parsed.piste_revetement ?? emptyField(),
        piste_pcr: parsed.piste_pcr ?? emptyField(),
        piste_code_reference: parsed.piste_code_reference ?? emptyField(),
        piste_avion_reference: parsed.piste_avion_reference ?? emptyField(),
        piste_type_approche: parsed.piste_type_approche ?? emptyField(),
        heli_valeur_d: parsed.heli_valeur_d ?? emptyField(),
        heli_cap: parsed.heli_cap ?? emptyField(),
        heli_altitude_ft: parsed.heli_altitude_ft ?? emptyField(),
        heli_mtom: parsed.heli_mtom ?? emptyField(),
        heli_moyen_com: parsed.heli_moyen_com ?? emptyField(),
        heli_frequence_com: parsed.heli_frequence_com ?? emptyField(),
        heli_indicatif_rt: parsed.heli_indicatif_rt ?? emptyField(),
        heli_identification: parsed.heli_identification ?? emptyField(),
        heli_marque_distinctive: parsed.heli_marque_distinctive ?? emptyField(),
        heli_type_installation: parsed.heli_type_installation ?? emptyField(),
        heli_hauteur_maximale_ft: parsed.heli_hauteur_maximale_ft ?? emptyField(),
        heli_hauteur_obstacle_ft: parsed.heli_hauteur_obstacle_ft ?? emptyField(),
        heli_avitaillement: parsed.heli_avitaillement ?? emptyField(),
        heli_gpu: parsed.heli_gpu ?? emptyField(),
        heli_equipement_incendie: parsed.heli_equipement_incendie ?? emptyField(),
        heli_date_revision: parsed.heli_date_revision ?? emptyField(),
        altitude: parsed.altitude ?? emptyField(),
        horaires: parsed.horaires ?? emptyField(),
        maturite_sgs_suggered: parsed.maturite_sgs_suggered ?? emptyField(),
        statut: parsed.statut ?? emptyField(),
        statut_sgs: parsed.statut_sgs ?? emptyField(),
        statut_certification: parsed.statut_certification ?? emptyField(),
        aides_visuelles: parsed.aides_visuelles ?? emptyField(),
        notes: parsed.notes || '',
      };
      return suggestion;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Utilitaires coordonnées ──────────────────────────────────────────────────
const coordinateUtils = {
  toDMS(lat: number, lon: number): string {
    const f = (v: number, isLat: boolean) => { const a = Math.abs(v), d = Math.floor(a), mf = (a-d)*60, mi = Math.floor(mf), s = ((mf-mi)*60).toFixed(1); return `${d}°${mi}'${s}"${isLat ? (v>=0?'N':'S') : (v>=0?'E':'W')}`; };
    return `${f(lat, true)} ${f(lon, false)}`;
  },
  dmsToDecimal(dms: string): { latitude: number; longitude: number } | null {
    const rx = /(\d+)°(\d+)'([\d.]+)"?([NS])\s+(\d+)°(\d+)'([\d.]+)"?([EW])/i;
    const m = dms.match(rx);
    if (!m) return null;
    let la = +m[1] + +m[2]/60 + +m[3]/3600, lo = +m[5] + +m[6]/60 + +m[7]/3600;
    if (m[4]==='S') la=-la; if (m[8]==='W') lo=-lo;
    return { latitude: la, longitude: lo };
  },
  detectAndConvert(input: string): { latitude: number; longitude: number } | null {
    const c = input.trim().replace(/\s+/g, ' ');
    const d = this.dmsToDecimal(c); if (d) return d;
    const re = c.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (re) { const a=+re[1], b=+re[2]; if (Math.abs(a)<=90&&Math.abs(b)<=180) return {latitude:a,longitude:b}; }
    return null;
  },
  async searchByName(q: string): Promise<{lat:number;lon:number}|null> {
    try { const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`); const d = await r.json(); if (d?.length>0) return {lat:+d[0].lat,lon:+d[0].lon}; return null; } catch { return null; }
  },
};

// ── Composants UI partagés ───────────────────────────────────────────────────
const Label = ({ icon: Icon, children, required }: { icon?: React.ElementType; children: React.ReactNode; required?: boolean }) => (
  <label className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-1.5">
    {Icon && <Icon className="w-3.5 h-3.5 text-role-primary" />}
    <span>{children}</span>
    {required && <span className="text-danger text-xs ml-0.5">*</span>}
  </label>
);

const SectionTitle = ({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) => (
  <h3 className="text-base font-bold text-role-primary uppercase tracking-wide flex items-center gap-2 mb-6 pb-2 border-b border-role-primary/20">
    {Icon && <Icon className="w-5 h-5" />}{children}
  </h3>
);

const SubSectionTitle = ({ icon: Icon, children }: { icon?: React.ElementType; children: React.ReactNode }) => (
  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mt-6 mb-4">
    {Icon && <Icon className="w-4 h-4 text-role-primary" />}{children}
  </h4>
);

function BooleanToggle({ label, icon: Icon, value, onChange, description }: {
  label: string; icon?: React.ElementType; value: boolean; onChange: (v: boolean) => void; description?: string;
}) {
  return (
    <label className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${value ? 'border-role-primary/40 bg-role-primary-soft/20' : 'border-border hover:border-role-primary/20'}`}>
      {Icon && <Icon className={`w-5 h-5 shrink-0 ${value ? 'text-role-primary' : 'text-muted-foreground'}`} />}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${value ? 'text-role-primary' : 'text-foreground'}`}>{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div onClick={() => onChange(!value)} className={`relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0 ${value ? 'bg-role-primary' : 'bg-border'}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${value ? 'left-6' : 'left-1'}`} />
      </div>
    </label>
  );
}

// ── SmartCoordinateInput ─────────────────────────────────────────────────────
const SmartCoordinateInput = React.memo(({ latitude, longitude, onCoordinatesChange, error }: {
  latitude: number; longitude: number; onCoordinatesChange: (lat: number, lon: number) => void; error?: string;
}) => {
  const [inputValue,  setInputValue]  = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showHelper,  setShowHelper]  = useState(false);
  const [mode,        setMode]        = useState<'coords'|'search'>('coords');

  useEffect(() => {
    if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude))
      setInputValue(coordinateUtils.toDMS(latitude, longitude));
  }, [latitude, longitude]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const r = await coordinateUtils.searchByName(searchQuery);
    if (r) { onCoordinatesChange(r.lat, r.lon); setInputValue(coordinateUtils.toDMS(r.lat, r.lon)); }
    setIsSearching(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3 border-b border-border pb-3">
        {(['coords', 'search'] as const).map(m => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`btn gap-2 transition-all duration-200 ${
              mode === m
                ? 'btn-primary shadow-md'
                : 'btn-secondary hover:bg-role-primary-soft'
            }`}>
            {m==='coords' ? <Globe className="w-4 h-4" /> : <SearchIcon className="w-4 h-4" />}
            {m==='coords' ? 'Coordonnées' : 'Recherche lieu'}
          </button>
        ))}
      </div>
      {mode === 'search' ? (
        <div className="flex gap-3 p-4 bg-role-primary-soft/30 rounded-xl">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&handleSearch()} placeholder="Ex: Dakar, GOBD, Aéroport Blaise Diagne…"
              className={`form-input w-full pl-10 py-3 text-sm ${focusClass}`} />
          </div>
          <button type="button" onClick={handleSearch} disabled={isSearching} className="btn btn-primary gap-2 px-5">
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}Localiser
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-4 h-4 text-role-primary" />
            <input type="text" value={inputValue} onChange={e=>{setInputValue(e.target.value);const r=coordinateUtils.detectAndConvert(e.target.value);if(r)onCoordinatesChange(r.latitude,r.longitude);}}
              placeholder="14.7168, -17.4675 ou 14°43'0.5 N 17°28'3.5 W"
              className={`form-input w-full pl-10 pr-12 py-3 text-sm font-mono ${focusClass} ${error?'border-danger':'border-border'}`} />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 action-button p-1.5" onClick={()=>setShowHelper(!showHelper)}>
              <HelpCircle className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          {latitude&&longitude&&!isNaN(latitude)&&!isNaN(longitude)&&(
            <div className="p-3 bg-role-primary-soft/30 rounded-lg space-y-1 text-[11px] font-mono text-muted-foreground">
              <div className="flex gap-2"><Compass className="w-3.5 h-3.5 text-role-primary"/>{coordinateUtils.toDMS(latitude, longitude)}</div>
              <div className="flex gap-2"><Globe className="w-3.5 h-3.5 text-role-primary"/>{latitude.toFixed(6)}°, {longitude.toFixed(6)}°</div>
            </div>
          )}
          {showHelper && (
            <div className="p-4 bg-role-primary-soft rounded-lg text-xs border-l-4 border-l-role-primary">
              <p className="font-semibold text-role-primary mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4"/>Formats acceptés (détection auto)</p>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-1">Décimal</p><code className="font-mono bg-background px-2 py-1 rounded block">14.7168, -17.4675</code></div>
                <div><p className="text-muted-foreground text-[10px] uppercase tracking-wide mb-1">DMS</p><code className="font-mono bg-background px-2 py-1 rounded block">14°43'0.5 N 17°28'3.5 W</code></div>
              </div>
            </div>
          )}
          {error && <span className="field-error flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5"/>{error}</span>}
        </div>
      )}
    </div>
  );
});

// ── StepIndicator ────────────────────────────────────────────────────────────
function StepIndicator({ currentStep, completedSteps, typeEntite, onStepClick }: {
  currentStep: number; completedSteps: Set<number>; typeEntite: TypeEntiteAerodrome; onStepClick?: (id: number) => void;
}) {
  return (
    <div className="flex items-center justify-between mb-8 px-1">
      {BASE_STEPS.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isDone = completedSteps.has(step.id);
        const canClick = step.id === 1 || isDone || completedSteps.has(step.id - 1);
        const label = step.id === 5 ? getStep5Label(typeEntite) : step.label;
        
        return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onStepClick?.(step.id)}
              className={`flex flex-col items-center gap-1 min-w-[52px] transition-all duration-200 ${
                !canClick ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:scale-105'
              }`}
            >
              {/* Cercle TOUJOURS BLEU pour l'actif, gris pour les autres */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isActive
                    ? 'bg-role-primary border-role-primary shadow-md'
                    : 'bg-background border-border'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-muted-foreground'}`} />
              </div>
              
              {/* Texte : vert si complété, bleu si actif, gris sinon */}
              <span
                className={`text-[9px] font-medium text-center leading-tight max-w-[52px] transition-colors ${
                  isActive ? 'text-role-primary font-bold' : isDone ? 'text-success' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </button>
            
            {/* Ligne de connexion */}
            {index < BASE_STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-0.5 rounded-full transition-all duration-500 ${
                  completedSteps.has(BASE_STEPS[index].id) ? 'bg-success' : 'bg-border'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
// ── Définition des champs IA par section ──────────────────────────────────────
const AI_SECTIONS = [
  {
    id: 'general', title: 'Général', icon: Plane,
    fields: [
      { key: 'nom', label: "Nom de l'aérodrome", icon: Plane },
      { key: 'code_oaci', label: 'Code OACI', icon: Globe },
      { key: 'region', label: 'Région', icon: Flag },
      { key: 'type', label: 'Type', icon: Target },
      { key: 'type_entite', label: "Nature d'infrastructure", icon: Building2 },
      { key: 'categorie_sslia', label: 'Catégorie SSLIA', icon: Gauge },
    ],
  },
  {
    id: 'exploitant', title: 'Exploitant', icon: Building2,
    fields: [
      { key: 'exploitant_nom', label: "Nom de l'exploitant", icon: Building2 },
      { key: 'exploitant_adresse', label: 'Adresse', icon: MapPin },
      { key: 'exploitant_telephone', label: 'Téléphone', icon: Phone },
    ],
  },
  {
    id: 'piste', title: 'Piste principale', icon: Ruler,
    condition: (s: AiSuggestion) => s.type_entite?.value === 'aerodrome' || s.type_entite?.value === 'mixte',
    fields: [
      { key: 'piste_longueur', label: 'Longueur (m)', icon: Ruler },
      { key: 'piste_largeur', label: 'Largeur (m)', icon: Ruler },
      { key: 'piste_orientation', label: 'Orientation', icon: Compass },
      { key: 'piste_revetement', label: 'Revêtement', icon: Gauge },
      { key: 'piste_pcr', label: 'PCR', icon: Weight },
      { key: 'piste_code_reference', label: 'Code référence', icon: Plane },
      { key: 'piste_avion_reference', label: 'Avion de référence', icon: Plane },
      { key: 'piste_type_approche', label: "Type d'approche", icon: Navigation },
    ],
  },
  {
    id: 'helistation', title: 'FATO & TLOF', icon: Navigation,
    condition: (s: AiSuggestion) => s.type_entite?.value === 'helistation' || s.type_entite?.value === 'mixte',
    fields: [
      { key: 'heli_valeur_d', label: 'Valeur D (m)', icon: Ruler },
      { key: 'heli_cap', label: 'Cap (°)', icon: Navigation },
      { key: 'heli_altitude_ft', label: 'Altitude (pieds)', icon: ArrowUp },
      { key: 'heli_mtom', label: 'MTOM (tonnes)', icon: Weight },
      { key: 'heli_moyen_com', label: 'Moyen COM', icon: Radio },
      { key: 'heli_frequence_com', label: 'Fréquence COM', icon: Radio },
    ],
  },
  {
    id: 'sgs', title: 'SGS & Statut', icon: Shield,
    fields: [
      { key: 'altitude', label: 'Altitude (m)', icon: ArrowUp },
      { key: 'horaires', label: "Horaires d'exploitation", icon: Clock },
      { key: 'maturite_sgs_suggered', label: 'Maturité SGS suggérée', icon: Gauge },
    ],
  },
];

type SectionField = (typeof AI_SECTIONS)[number]['fields'][number];

function getConfidenceBadge(confidence: number) {
  if (confidence >= 80) return { cls: 'badge success', label: `${confidence}%` };
  if (confidence >= 50) return { cls: 'badge warning', label: `${confidence}%` };
  if (confidence > 0) return { cls: 'badge danger', label: `${confidence}%` };
  return { cls: 'badge neutral', label: '?' };
}

function formatFieldValue(key: string, value: string | number): string {
  if (key === 'code_oaci') return String(value).toUpperCase();
  if (key === 'type') return value === 'international' ? 'International' : 'National';
  if (key === 'categorie_sslia') return `Catégorie ${value}`;
  if (key === 'maturite_sgs_suggered') {
    const labels: Record<number, string> = { 1: 'N1 — Absent', 2: 'N2 — Présent', 3: 'N3 — Approprié', 4: 'N4 — Opérationnel', 5: 'N5 — Efficace' };
    return labels[Number(value)] || `N${value}`;
  }
  if (key === 'type_approche') {
    const labels: Record<string, string> = { a_vue: 'À vue', classique: 'Classique', cat1: 'CAT I', cat2: 'CAT II' };
    return labels[String(value)] || String(value);
  }
  if (key === 'horaires') return value === 'h24' ? 'H24' : 'Jour (08h–19h)';
  return String(value);
}

function AiSuggestionFieldRow({ field, value, onAccept, isAccepted }: {
  field: SectionField; value: AiSuggestionField; onAccept: () => void; isAccepted: boolean;
}) {
  const hasValue = value?.value !== '' && value?.value !== undefined && value?.value !== null && value?.value !== 0;
  const badge = hasValue ? getConfidenceBadge(value.confidence) : { cls: 'badge neutral', label: '?' };
  const isHigh = value?.confidence >= 80;
  const isLow = value?.confidence < 50 && hasValue;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
      isAccepted ? 'border-success bg-success/5' :
      isLow ? 'border-warning/40 bg-warning/5' :
      isHigh ? 'border-role-primary/20 bg-role-primary/5' :
      'border-border bg-background hover:border-role-primary/30'
    }`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        isAccepted ? 'bg-success text-white' :
        isLow ? 'bg-warning/20 text-warning' :
        'bg-role-primary-soft text-role-primary'
      }`}>
        <field.icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{field.label}</p>
          {hasValue && (
            <span className={`badge text-[9px] h-4 px-1.5 shrink-0 ${badge.cls}`}>{badge.label}</span>
          )}
        </div>
        {hasValue ? (
          <p className="text-sm font-semibold text-foreground truncate">
            {formatFieldValue(field.key, value.value)}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Non trouvé</p>
        )}
      </div>
      <button onClick={onAccept}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition-all ${
          isAccepted ? 'bg-success/10 text-success' : 'bg-role-primary/10 text-role-primary hover:bg-role-primary/20'
        }`}>
        {isAccepted ? <><Check className="w-3.5 h-3.5"/>Accepté</> : <><Plus className="w-3.5 h-3.5"/>Accepter</>}
      </button>
    </div>
  );
}

function AiSuggestionPanel({ suggestion, isLoading, acceptedFields, onAcceptField, onAcceptAll, onSkip, onToggle }: {
  suggestion: AiSuggestion|null; isLoading: boolean; acceptedFields: Set<string>;
  onAcceptField:(f: string, v: string | number) => void; onAcceptAll:()=>void; onSkip:()=>void; onToggle:(f: string)=>void;
}) {
  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-5 text-center">
      <div className="relative"><Brain className="w-14 h-14 text-role-primary"/><Loader2 className="w-5 h-5 text-role-primary animate-spin absolute -bottom-1 -right-1"/></div>
      <p className="font-semibold text-foreground text-lg">Analyse IA en cours…</p>
    </div>
  );
  if (!suggestion) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center text-muted-foreground">
      <MapPin className="w-14 h-14 opacity-20"/>
      <div><p className="font-medium text-foreground">Aucune suggestion IA</p><p className="text-sm mt-1">Positionnez l'infrastructure sur la carte à l'étape précédente.</p></div>
      <button onClick={onSkip} className="btn btn-secondary mt-2 gap-2"><ChevronRight className="w-4 h-4"/>Continuer sans IA</button>
    </div>
  );

  const visibleSections = AI_SECTIONS.filter(s => !s.condition || s.condition(suggestion));
  const hasAnyField = visibleSections.some(s => s.fields.some(f => {
    const v = (suggestion as any)[f.key];
    return v?.value !== '' && v?.value !== undefined && v?.value !== null;
  }));

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-role-primary/10 to-transparent rounded-xl border-l-4 border-l-role-primary">
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="w-5 h-5 text-role-primary shrink-0"/>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">
              Suggestions IA — {suggestion.nom?.value || suggestion.code_oaci?.value || 'Aérodrome'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sources : {[...new Set(Object.values(suggestion).filter((v): v is AiSuggestionField => 'source' in v).map(v => v.source).filter(Boolean))].join(', ') || 'Training'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={onAcceptAll} className="btn btn-primary btn-sm gap-1.5"><CheckCircle2 className="w-3.5 h-3.5"/>Tout accepter</button>
          <button onClick={onSkip} className="btn btn-secondary btn-sm gap-1.5"><X className="w-3.5 h-3.5"/>Ignorer</button>
        </div>
      </div>

      {!hasAnyField ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center text-muted-foreground">
          <Brain className="w-10 h-10 opacity-20"/>
          <p className="text-sm">L'IA n'a pas trouvé de données pour cet aérodrome.</p>
          <p className="text-xs">Vous pouvez remplir le formulaire manuellement ou réessayer avec un nom plus précis.</p>
        </div>
      ) : (
        visibleSections.map(section => {
          const sectionFields = section.fields.filter(f => {
            const v = (suggestion as any)[f.key];
            return v?.value !== '' && v?.value !== undefined && v?.value !== null;
          });
          if (!sectionFields.length) return null;
          return (
            <div key={section.id}>
              <h4 className="text-xs font-bold text-role-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <section.icon className="w-3.5 h-3.5" /> {section.title}
              </h4>
              <div className="space-y-1.5">
                {sectionFields.map(f => (
                  <AiSuggestionFieldRow
                    key={f.key}
                    field={f}
                    value={(suggestion as any)[f.key] as AiSuggestionField}
                    isAccepted={acceptedFields.has(f.key)}
                    onAccept={() => { onToggle(f.key); onAcceptField(f.key, (suggestion as any)[f.key]?.value); }}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}

      {suggestion.notes && (
        <div className="flex items-start gap-2 p-3 bg-role-primary-soft/30 rounded-xl text-xs text-role-primary border-l-4 border-l-role-primary">
          <Info className="w-4 h-4 shrink-0 mt-0.5"/>
          <span>{suggestion.notes}</span>
        </div>
      )}
    </div>
  );
}

// ── Schéma Zod ───────────────────────────────────────────────────────────────
const helistationSchema = z.object({
  indicatif_rt:        z.string().optional(),
  identification:      z.string().optional(),
  marque_distinctive:  z.string().optional(),
  type_installation:   z.string().optional(),
  valeur_d:            z.number().positive('La valeur D doit être positive').optional(),
  altitude_ft:         z.number().optional(),
  hauteur_maximale_ft: z.number().optional(),
  hauteur_obstacle_ft: z.number().optional(),
  cap:                 z.number().min(0).max(360, 'Cap entre 0° et 360°').optional(),
  mtom:                z.number().positive().optional(),
  moyen_com:           z.enum(['VHF','UHF','HF','SATCOM']).optional(),
  frequence_com:       z.string().optional(),
  avitaillement:       z.boolean().optional(),
  gpu:                 z.boolean().optional(),
  equipement_incendie: z.string().optional(),
  date_revision:       z.string().optional(),
});

const pisteSchema = z.object({
  longueur:       z.number().positive('Longueur requise').optional(),
  largeur:        z.number().positive('Largeur requise').optional(),
  orientation:    z.string().optional(),
  revetement:     z.string().optional(),
  pcr:            z.number().min(0).optional(),
  code_reference: z.string().optional(),
  avion_reference:z.string().optional(),
  type_approche:  z.enum(['a_vue','classique','cat1','cat2']).optional(),
});

const aerodromeSchema = z.object({
  nom:                  z.string().min(3, 'Minimum 3 caractères'),
  code_oaci:            z.string().length(4, 'Exactement 4 caractères').regex(/^[A-Z]{4}$/, 'Majuscules uniquement (ex: GOBD)'),
  type:                 z.enum(['international','national']),
  type_entite:          z.enum(['aerodrome','helistation','mixte']),
  categorie_sslia:      z.string().min(1, 'Requis'),
  region:               z.string().min(1, 'Requis'),
  exploitant_id:        z.string().optional(),
  exploitant_nom:       z.string().optional(),
  exploitant_adresse:   z.string().optional(),
  exploitant_telephone: z.string().optional(),
  latitude:             z.number().min(-90).max(90),
  longitude:            z.number().min(-180).max(180),
  altitude:             z.number().min(0),
  piste_principale:     pisteSchema.optional(),
  helistation:          helistationSchema.optional(),
  horaires:             z.enum(['jour','h24']).optional(),
  aides_visuelles:      z.array(z.string()).optional(),
  maturite_sgs:         z.number().min(1).max(5),
  statut:               z.enum(['brouillon','actif','suspendu','ferme']),
  statut_certification: z.enum(['certifie','homologue','non_certifie','non_homologue']).optional(),
  certifie_le:          z.string().optional(),
  numero_certificat:    z.string().optional(),
  homologue_le:         z.string().optional(),
  numero_homologation:  z.string().optional(),
  contacts: z.array(z.object({
    nom:z.string(), poste:z.string(),
    email:z.string().email('Email invalide').or(z.literal('')), telephone:z.string(),
  })).optional(),
});

type AerodromeFormData = z.infer<typeof aerodromeSchema>;

// ── Props ────────────────────────────────────────────────────────────────────
interface AerodromeFormProps {
  aerodrome?: Aerodrome;
  onClose: () => void;
  onSuccess: () => void;
  userRole: string;
  onProgressChange?: (n: number) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
export default function AerodromeForm({ aerodrome, onClose, onSuccess, userRole, onProgressChange }: AerodromeFormProps) {
  // ── Store — séparer actions et état pour éviter les re-renders sur toute mutation ──
  // Actions : références stables, jamais de re-render
  const addAerodrome    = useAppStore(s => s.addAerodrome);
  const updateAerodrome = useAppStore(s => s.updateAerodrome);
  const setLoading      = useAppStore(s => s.setLoading);
  const addNotification = useAppStore(s => s.addNotification);
  const setProfilRisque = useAppStore(s => s.setProfilRisque);
  const setActiveModule  = useAppStore(s => s.setActiveModule);
  const aerodromeFormLoading = useAppStore(s => s.isLoading?.aerodromeForm);
  // État ciblé : re-render uniquement si CE champ change
  const user       = useAppStore(s => s.user);
  const aerodromes = useAppStore(s => s.aerodromes);

  // Ref scroll — défile le conteneur modal, pas la page (window.scrollTo inutile dans un Dialog)
  const scrollRef  = useRef<HTMLDivElement>(null);
  const scrollToTop = useCallback(() => { scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

  // ── Wizard ───────────────────────────────────────────────────────────────
  const [currentStep,    setCurrentStep]    = useState(aerodrome ? 3 : 1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(aerodrome ? new Set([1,2,3,4,5]) : new Set());
  const [error,          setError]          = useState<string|null>(null);

  // ── IA ───────────────────────────────────────────────────────────────────
  const [aiSuggestion,   setAiSuggestion]   = useState<AiSuggestion|null>(null);
  const [isEnriching,    setIsEnriching]    = useState(false);
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());
  const [iaValidated,    setIaValidated]    = useState(false);
  const enrichDebounce = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);

  const [showRedirectModal, setShowRedirectModal] = useState(false);
  const [redirectTarget, setRedirectTarget] = useState<'certification'|'homologation'|null>(null);

  // ── Form ─────────────────────────────────────────────────────────────────
  const form = useForm<AerodromeFormData>({
    resolver: zodResolver(aerodromeSchema),
    defaultValues: aerodrome ? {
      nom: aerodrome.nom, code_oaci: aerodrome.code_oaci, type: aerodrome.type,
      type_entite: aerodrome.type_entite ?? 'aerodrome', categorie_sslia: aerodrome.categorie_sslia,
      region: aerodrome.region, exploitant_id: aerodrome.exploitant_id,
      exploitant_nom: aerodrome.exploitant_nom || '', exploitant_adresse: aerodrome.exploitant_adresse || '',
      exploitant_telephone: aerodrome.exploitant_telephone || '',
      latitude: aerodrome.lat, longitude: aerodrome.lon, altitude: aerodrome.altitude,
      piste_principale: aerodrome.piste_principale || undefined,
      helistation: (aerodrome as any).helistation || undefined,
      horaires: aerodrome.horaires, aides_visuelles: aerodrome.aides_visuelles || [],
      maturite_sgs: aerodrome.maturite_sgs, statut: aerodrome.statut, contacts: aerodrome.contacts || [],
      statut_certification: aerodrome.statut_certification || undefined,
      certifie_le: aerodrome.certifie_le || '', numero_certificat: aerodrome.numero_certificat || '',
      homologue_le: aerodrome.homologue_le || '', numero_homologation: aerodrome.numero_homologation || '',
    } : {
      nom:'', code_oaci:'', type:'national', type_entite:'aerodrome',
      categorie_sslia:'', region:'', exploitant_nom:'', exploitant_adresse:'', exploitant_telephone:'',
      latitude:14.7168, longitude:-17.4675, altitude:0,
      piste_principale: undefined,
      helistation: undefined,
      aides_visuelles:[], maturite_sgs:1, statut:'brouillon', contacts:[],
      statut_certification:'non_certifie', certifie_le:'', numero_certificat:'',
      homologue_le:'', numero_homologation:'',
    },
  });

  const { fields: contactFields, append: appendContact, remove: removeContact } = useFieldArray({ control: form.control, name: 'contacts' });

  // ── Watches groupés — 4 subscriptions au lieu de 12 ──────────────────────
  const watchPosition = useWatch({ control: form.control, name: 'latitude' }) as number;
  const watchCoords = useWatch({ control: form.control, name: 'longitude' }) as number;
  const currentLatitude = watchPosition;
  const currentLongitude = watchCoords;

// Watches individuels pour éviter les re-renders inutiles
const watchTypeEntite = useWatch({ control: form.control, name: 'type_entite' });
const watchType = useWatch({ control: form.control, name: 'type' });
const watchRegion = useWatch({ control: form.control, name: 'region' });
const watchNom = useWatch({ control: form.control, name: 'nom' });
const watchCodeOaci = useWatch({ control: form.control, name: 'code_oaci' });

  const watchMaturite = useWatch({ control: form.control, name: 'maturite_sgs' }) as number;
const watchStatut = useWatch({ control: form.control, name: 'statut' }) as string;
const watchStatutCertification = useWatch({ control: form.control, name: 'statut_certification' }) as string;

const watchAvitaillement = useWatch({ control: form.control, name: 'helistation.avitaillement' }) as boolean;
const watchGpu = useWatch({ control: form.control, name: 'helistation.gpu' }) as boolean;
const watchAides = useWatch({ control: form.control, name: 'aides_visuelles' }) as string[];

  // ── Logique métier ───────────────────────────────────────────────────────
  const aerodromesSimilaires = useMemo(() => {
  const type   = aerodrome?.type   ?? watchType;
  const region = aerodrome?.region ?? watchRegion;
  const entite = aerodrome?.type_entite ?? watchTypeEntite;
  if (!type || !region) return [];
  return aerodromes.filter(a => !a.deleted_at && a.type===type && a.region===region && a.id!==aerodrome?.id).slice(0,3);
}, [aerodromes, aerodrome, watchType, watchRegion, watchTypeEntite]);

  const maturiteMoyenne = useMemo(() => {
    if (!aerodromesSimilaires.length) return null;
    return Math.round(aerodromesSimilaires.reduce((acc,a)=>acc+a.maturite_sgs,0) / aerodromesSimilaires.length);
  }, [aerodromesSimilaires]);

  // ── Progression ─────────────────────────────────────────────────────────
  // CORRECTION : on n'inclut pas les champs pré-remplis automatiquement (type,
  // statut, latitude, longitude) dans la progression — ils ne représentent pas
  // un travail de saisie de l'utilisateur. Seuls les champs que l'utilisateur
  // doit saisir explicitement (nom, code_oaci, region, categorie_sslia) comptent.
  const watchCategorieSslia = useWatch({ control: form.control, name: 'categorie_sslia' });
  const progressValues = {
    nom:             watchNom,
    code_oaci:       watchCodeOaci,
    region:          watchRegion,
    categorie_sslia: watchCategorieSslia,
  };
  const PROGRESS_FIELDS = ['nom', 'code_oaci', 'region', 'categorie_sslia'];
  const progress = useFormProgress(progressValues as Record<string, unknown>, PROGRESS_FIELDS);

  // Récupérer le contexte pour la barre de progression dans FormShell
  const setProgress = React.useContext(FormProgressContext);

  // Mettre à jour la progression dans FormShell
  useEffect(() => {
    if (setProgress && progress !== undefined) {
      setProgress(progress);
    }
  }, [progress, setProgress]);

  // Debounce : évite de re-render AerodromesModule à chaque caractère tapé.
  const progressDebounce = useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(() => {
    clearTimeout(progressDebounce.current);
    progressDebounce.current = setTimeout(() => onProgressChange?.(progress), 300);
    return () => clearTimeout(progressDebounce.current);
  }, [progress, onProgressChange]);

  // ── Enrichissement IA ────────────────────────────────────────────────────
  useEffect(() => {
    if (aerodrome) return;
    if (currentStep !== 1) return;
    if (!currentLatitude||!currentLongitude||isNaN(currentLatitude)||isNaN(currentLongitude)) return;
    clearTimeout(enrichDebounce.current);
    enrichDebounce.current = setTimeout(async () => {
      setIsEnriching(true);
      try {
        // 1. Reverse geocode pour obtenir le nom du lieu
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${currentLatitude}&lon=${currentLongitude}&accept-language=fr&namedetails=1&zoom=14`);
        const geoData = await geoRes.json();
        const address = geoData.address || {};
        const name = geoData.namedetails?.name || address.aerodrome || address.airport || geoData.display_name?.split(',')[0]?.trim() || '';
        // 2. Suggérer tous les champs via l'IA
        setAiSuggestion(await suggestAerodrome(name, currentLatitude, currentLongitude));
      } catch {
        setAiSuggestion(null);
      }
      setIsEnriching(false);
    }, 1500);
    return () => clearTimeout(enrichDebounce.current);
  }, [currentLatitude, currentLongitude, aerodrome, currentStep]);

  // Reset statut_certification quand le type change
  useEffect(() => {
    if (watchType === 'international') {
      if (watchStatutCertification === 'homologue' || watchStatutCertification === 'non_homologue') {
        form.setValue('statut_certification', 'non_certifie');
      }
    } else if (watchType === 'national') {
      if (watchStatutCertification === 'certifie' || watchStatutCertification === 'non_certifie') {
        form.setValue('statut_certification', 'non_homologue');
      }
    }
  }, [watchType, form, watchStatutCertification]);

  // ── Handlers IA ──────────────────────────────────────────────────────────
  const handleAcceptField = useCallback((field: string, value: string | number) => {
    const map: Record<string, string> = {
      nom:'nom', code_oaci:'code_oaci', region:'region', type:'type', type_entite:'type_entite',
      categorie_sslia:'categorie_sslia',
      exploitant_nom:'exploitant_nom', exploitant_adresse:'exploitant_adresse', exploitant_telephone:'exploitant_telephone',
      altitude:'altitude', horaires:'horaires',
      piste_longueur:'piste_principale.longueur', piste_largeur:'piste_principale.largeur',
      piste_orientation:'piste_principale.orientation', piste_revetement:'piste_principale.revetement',
      piste_pcr:'piste_principale.pcr', piste_code_reference:'piste_principale.code_reference',
      piste_avion_reference:'piste_principale.avion_reference', piste_type_approche:'piste_principale.type_approche',
      heli_valeur_d:'helistation.valeur_d', heli_cap:'helistation.cap',
      heli_altitude_ft:'helistation.altitude_ft', heli_mtom:'helistation.mtom',
      heli_moyen_com:'helistation.moyen_com', heli_frequence_com:'helistation.frequence_com',
      heli_indicatif_rt:'helistation.indicatif_rt', heli_identification:'helistation.identification',
      heli_marque_distinctive:'helistation.marque_distinctive', heli_type_installation:'helistation.type_installation',
      heli_hauteur_maximale_ft:'helistation.hauteur_maximale_ft', heli_hauteur_obstacle_ft:'helistation.hauteur_obstacle_ft',
      heli_avitaillement:'helistation.avitaillement', heli_gpu:'helistation.gpu',
      heli_equipement_incendie:'helistation.equipement_incendie', heli_date_revision:'helistation.date_revision',
      maturite_sgs_suggered:'maturite_sgs',
      statut:'statut', statut_sgs:'statut_sgs', statut_certification:'statut_certification',
    };
    const formField = map[field];
    if (formField) {
      if (formField === 'aides_visuelles' && typeof value === 'string') {
        const arr = value.split(',').map(s => s.trim()).filter(Boolean);
        form.setValue(formField as any, arr as any, { shouldValidate: false, shouldDirty: true });
      } else {
        form.setValue(formField as any, value as any, { shouldValidate: false, shouldDirty: true });
      }
    }
  }, [form]);

  const handleToggle = useCallback((f: string) => {
    setAcceptedFields(prev => { const n = new Set(prev); n.has(f)?n.delete(f):n.add(f); return n; });
  }, []);

  const handleAcceptAll = useCallback(() => {
    if (!aiSuggestion) return;
    const accepted: string[] = [];
    Object.entries(aiSuggestion).forEach(([key, val]) => {
      if (val && typeof val === 'object' && 'value' in val) {
        const v = val as AiSuggestionField;
        if (v.value !== '' && v.value !== undefined && v.value !== null) {
          handleAcceptField(key, v.value);
          accepted.push(key);
        }
      }
    });
    setAcceptedFields(new Set(accepted));
    setIaValidated(true);
  }, [aiSuggestion, handleAcceptField]);

  // ── Navigation ───────────────────────────────────────────────────────────
  const handleNext = async () => {
    // Étape 2 (IA) — passage direct sans validation
    if (currentStep === 2) {
      setCompletedSteps(prev => new Set([...prev, 2]));
      setCurrentStep(3);
      scrollToTop();
      return;
    }

    const fields = COMMON_STEP_FIELDS[currentStep] || [];
    if (fields.length > 0 && !(await form.trigger(fields as any))) return;
    setError(null);
    setCompletedSteps(prev => new Set([...prev, currentStep]));
    setCurrentStep(prev => Math.min(prev + 1, 6));
    scrollToTop();
  };

  const handlePrev = () => { setError(null); setCurrentStep(prev => Math.max(prev-1, 1)); scrollToTop(); };
  const handleStepClick = (id: number) => { setError(null); setCurrentStep(id); scrollToTop(); };

  // ── Soumission ───────────────────────────────────────────────────────────
  const onSubmit = async (data: AerodromeFormData) => {
    try {
      setLoading('aerodromeForm', true); setError(null);

      // Validation conditionnelle selon le type d'entité
      if (data.type_entite === 'aerodrome' || data.type_entite === 'mixte') {
        if (!data.piste_principale?.longueur || data.piste_principale.longueur < 100) {
          setError('La longueur de la piste est requise (min 100m)');
          setCurrentStep(5);
          return;
        }
        if (!data.piste_principale?.largeur || data.piste_principale.largeur < 10) {
          setError('La largeur de la piste est requise (min 10m)');
          setCurrentStep(5);
          return;
        }
        if (!data.piste_principale?.revetement) {
          setError('Le revêtement de la piste est requis');
          setCurrentStep(5);
          return;
        }
        if (!data.piste_principale?.code_reference) {
          setError('Le code de référence de la piste est requis');
          setCurrentStep(5);
          return;
        }
      }

      if (data.type_entite === 'helistation' || data.type_entite === 'mixte') {
        if (!data.helistation?.valeur_d) {
          setError('La valeur D (FATO) est requise');
          setCurrentStep(5);
          return;
        }
        if (data.helistation?.cap === undefined || data.helistation.cap === null) {
          setError('Le cap de l\'hélistation est requis');
          setCurrentStep(5);
          return;
        }
      }

      const now = new Date().toISOString();

      // Nettoyage des données avant envoi à Supabase
      const cleanData: Record<string, unknown> = { ...data };
      // Pour hélistation pure : ne pas envoyer piste_principale
      if (data.type_entite === 'helistation') {
        delete cleanData.piste_principale;
      }
      // Pour aérodrome pur : ne pas envoyer helistation
      if (data.type_entite === 'aerodrome') {
        delete cleanData.helistation;
      }
      // Supprimer les champs undefined/vides
      Object.keys(cleanData).forEach(key => {
        if (cleanData[key] === undefined || cleanData[key] === '') delete cleanData[key];
      });
      // Supprimer latitude/longitude (le formulaire utilise ces noms mais Supabase utilise lat/lon)
      delete cleanData.latitude;
      delete cleanData.longitude;
      // Nettoyer les sous-objets
      if (cleanData.piste_principale && typeof cleanData.piste_principale === 'object') {
        const pp = cleanData.piste_principale as Record<string, unknown>;
        Object.keys(pp).forEach(k => { if (pp[k] === undefined || pp[k] === '') delete pp[k]; });
        if (Object.keys(pp).length === 0) delete cleanData.piste_principale;
      }
      if (cleanData.helistation && typeof cleanData.helistation === 'object') {
        const h = cleanData.helistation as Record<string, unknown>;
        Object.keys(h).forEach(k => { if (h[k] === undefined) delete h[k]; });
        if (Object.keys(h).length === 0) delete cleanData.helistation;
      }

      if (aerodrome) {
        await updateAerodrome(aerodrome.id, { ...cleanData, type_entite:data.type_entite as TypeEntiteAerodrome, maturite_sgs:data.maturite_sgs as 1|2|3|4|5, lat:data.latitude, lon:data.longitude, updated_at:now } as any);
        addNotification({ user_id:user?.id||'', type:'success', title:'Mis à jour', message:`${data.code_oaci} — ${data.nom}`, canal:'in_app' });
      } else {
        const newId = crypto.randomUUID();
        const newAero = { id:newId, ...cleanData, lat:data.latitude, lon:data.longitude, created_at:now, updated_at:now } as unknown as Aerodrome;
        await addAerodrome(newAero);
        const { calculerProfilInitial, resumeRisqueInitial } = await import('@/lib/risque/initialProfile');
        const ri = calculerProfilInitial(newAero);
        await setProfilRisque(newId, ri.profil);
        const entityLabel = data.type_entite==='helistation' ? 'Hélistation' : data.type_entite==='mixte' ? 'Site mixte' : 'Aérodrome';
        addNotification({ user_id:user?.id||'', type:ri.profil.niveau==='critique'||ri.profil.niveau==='eleve'?'warning':'success', title:`${entityLabel} créé — Profil initialisé`, message:`${data.code_oaci} — ${data.nom} · ${resumeRisqueInitial(ri)}`, canal:'in_app' });
      }
      const sc = data.statut_certification;
      if (sc === 'certifie' || sc === 'homologue') {
        setRedirectTarget(sc === 'certifie' ? 'certification' : 'homologation');
        setShowRedirectModal(true);
        return;
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading('aerodromeForm', false);
    }
  };

  const onValidationError = (errors: Record<string,unknown>) => {
    const tabs: string[] = [];
    if (errors.latitude||errors.longitude||errors.altitude) tabs.push('Localisation');
    if (errors.nom||errors.code_oaci||errors.type||errors.type_entite||errors.categorie_sslia||errors.region) tabs.push('Général');
    if (errors.piste_principale||errors.helistation) tabs.push('Infrastructure');
    if (errors.maturite_sgs||errors.statut) tabs.push('SGS & Statut');
    setError(`Champs requis manquants dans : ${tabs.join(', ')||'le formulaire'}`);
  };

  const showPiste = watchTypeEntite==='aerodrome' || watchTypeEntite==='mixte';
  const showHeli  = watchTypeEntite==='helistation' || watchTypeEntite==='mixte';

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div data-role={userRole} ref={scrollRef} className="overflow-y-auto">
      <StepIndicator currentStep={currentStep} completedSteps={completedSteps} typeEntite={watchTypeEntite as TypeEntiteAerodrome} onStepClick={handleStepClick}/>

      <form onSubmit={(e) => {
  e.preventDefault();
  if (currentStep === 6) {
    form.handleSubmit(onSubmit, onValidationError)(e);
  }
}} className="space-y-6">

        {error && (
          <div className="alert alert-error animate-fade-in border-l-4 border-l-danger">
            <AlertCircle className="alert-icon w-4 h-4"/>
            <div className="alert-content"><div className="alert-title">Erreur</div><div className="alert-description">{error}</div></div>
            <button type="button" onClick={()=>setError(null)} className="action-button"><X className="w-3 h-3"/></button>
          </div>
        )}

        {/* ═══ ÉTAPE 1 : LOCALISATION ══════════════════════════════════ */}
        {currentStep===1 && (
          <div className="space-y-6 animate-fade-up">
            <SectionTitle icon={MapPin}>Localisation géographique</SectionTitle>
            <SmartCoordinateInput latitude={currentLatitude} longitude={currentLongitude}
              onCoordinatesChange={(lat,lon)=>{ form.setValue('latitude',lat); form.setValue('longitude',lon); }}
              error={form.formState.errors.latitude?.message||form.formState.errors.longitude?.message}/>
            <div className="form-field">
              <Label icon={ArrowUp} required>Altitude (mètres)</Label>
              <input type="number" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                {...form.register('altitude',{valueAsNumber:true})} placeholder="0"/>
              {form.formState.errors.altitude && <span className="field-error">{form.formState.errors.altitude.message}</span>}
            </div>
            <div className="rounded-xl overflow-hidden border border-border h-[400px]">
  <LocationPicker latitude={currentLatitude} longitude={currentLongitude}
    onPositionChange={(lat:number,lon:number)=>{ form.setValue('latitude',lat); form.setValue('longitude',lon); }}/>
</div>
            <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1"><Info className="w-3 h-3" />Cliquez sur la carte — l'IA analysera la localisation automatiquement</p>
            {!aerodrome && (isEnriching||aiSuggestion) && (
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${isEnriching?'border-role-primary/30 bg-role-primary-soft/30':'border-success/30 bg-success/5'}`}>
                {isEnriching?<><Loader2 className="w-4 h-4 text-role-primary animate-spin"/><span className="text-sm text-role-primary">Analyse IA en cours…</span></>
                            :<><Check className="w-4 h-4 text-success"/><span className="text-sm text-success">Données IA prêtes — validez à l'étape suivante</span></>}
              </div>
            )}
          </div>
        )}

        {/* ═══ ÉTAPE 2 : VALIDATION IA ══════════════════════════════════ */}
        {currentStep===2 && (
          <div className="animate-fade-up">
            <SectionTitle icon={Sparkles}>Validation des suggestions IA</SectionTitle>
            <AiSuggestionPanel suggestion={aiSuggestion} isLoading={isEnriching} acceptedFields={acceptedFields}
              onAcceptField={handleAcceptField} onAcceptAll={handleAcceptAll}
              onSkip={()=>{ setIaValidated(true); setCompletedSteps(prev=>new Set([...prev,2])); setCurrentStep(3); }}
              onToggle={handleToggle}/>
          </div>
        )}

        {/* ═══ ÉTAPE 3 : INFORMATIONS GÉNÉRALES ════════════════════════ */}
        {currentStep===3 && (
          <div className="animate-fade-up space-y-6">
            <SectionTitle icon={Plane}>Informations générales</SectionTitle>
            <div className="grid grid-cols-2 gap-5">
              <div className="form-field col-span-2">
                <Label icon={Plane} required>Nom complet</Label>
                <input type="text" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                  {...form.register('nom')} placeholder="Aéroport International Blaise Diagne"/>
                {form.formState.errors.nom && <span className="field-error">{form.formState.errors.nom.message}</span>}
              </div>
              <div className="form-field">
                <Label icon={Globe} required>Code OACI</Label>
                <input type="text" className={`form-input w-full font-mono bg-background border-border text-foreground py-3 px-4 rounded-xl uppercase ${focusClass}`}
                  {...form.register('code_oaci',{setValueAs:(v:string)=>v.toUpperCase()})} placeholder="GOBD" maxLength={4}/>
                {form.formState.errors.code_oaci && <span className="field-error">{form.formState.errors.code_oaci.message}</span>}
              </div>
              <div className="form-field">
                <Label icon={Plane} required>Type</Label>
                <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                  style={selectStyle} {...form.register('type')} disabled={!!aerodrome}>
                  <option value="international">International</option>
                  <option value="national">National</option>
                </select>
              </div>

              {/* Nature de l'infrastructure — cartes visuelles */}
              <div className="form-field col-span-2">
                <Label icon={Target} required>Nature de l'infrastructure</Label>
                <div className="grid grid-cols-3 gap-3 mt-1">
                  {TYPE_ENTITE_OPTIONS.map(opt => {
                    const selected = watchTypeEntite===opt.value;
                    return (
                      <label key={opt.value} className={`flex flex-col gap-2 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${selected?'border-role-primary bg-role-primary-soft/20 shadow-md':'border-border hover:border-role-primary/30'}`}>
                        <input type="radio" value={opt.value} {...form.register('type_entite')} className="sr-only"/>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl">{opt.icon}</span>
                          {selected && <Check className="w-4 h-4 text-role-primary"/>}
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${selected?'text-role-primary':'text-foreground'}`}>{opt.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {form.formState.errors.type_entite && <span className="field-error mt-2">{form.formState.errors.type_entite.message}</span>}
              </div>

              <div className="form-field">
                <Label icon={Gauge} required>Catégorie SSLIA</Label>
                <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('categorie_sslia')}>
                  <option value="">Sélectionner</option>
                  {CATEGORIES_SSLIA.map(c=><option key={c} value={c}>Catégorie {c}</option>)}
                </select>
                {form.formState.errors.categorie_sslia && <span className="field-error">{form.formState.errors.categorie_sslia.message}</span>}
              </div>
              <div className="form-field">
                <Label icon={Flag} required>Région</Label>
                <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('region')}>
                  <option value="">Sélectionner</option>
                  {REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
                {form.formState.errors.region && <span className="field-error">{form.formState.errors.region.message}</span>}
              </div>
            </div>
          </div>
        )}

        {/* ═══ ÉTAPE 4 : EXPLOITANT ════════════════════════════════════ */}
        {currentStep===4 && (
          <div className="animate-fade-up space-y-6">
            <SectionTitle icon={Building2}>Exploitant</SectionTitle>
            <div className="grid grid-cols-1 gap-5">
              <div className="form-field"><Label icon={Building2}>Nom de l'exploitant</Label>
                <input type="text" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('exploitant_nom')} placeholder="Nom de la société"/></div>
              <div className="form-field"><Label icon={MapPin}>Adresse</Label>
                <input type="text" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('exploitant_adresse')}/></div>
              <div className="form-field"><Label icon={Phone}>Téléphone</Label>
                <input type="tel" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('exploitant_telephone')} placeholder="+221 33 XXX XX XX"/></div>
            </div>
          </div>
        )}

        {/* ═══ ÉTAPE 5 : INFRASTRUCTURE (CONDITIONNELLE) ════════════════ */}
        {currentStep===5 && (
          <div className="animate-fade-up space-y-6">

            {/* ── Piste principale (aerodrome & mixte) ── */}
            {showPiste && (
              <div>
                <SectionTitle icon={Ruler}>Piste principale</SectionTitle>
                <div className="grid grid-cols-2 gap-5">
                  <div className="form-field"><Label icon={Ruler} required>Longueur (m)</Label>
                    <input type="number" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('piste_principale.longueur',{valueAsNumber:true})} placeholder="3000"/>
                    {form.formState.errors.piste_principale?.longueur && <span className="field-error">{form.formState.errors.piste_principale.longueur.message}</span>}</div>
                  <div className="form-field"><Label icon={Ruler} required>Largeur (m)</Label>
                    <input type="number" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('piste_principale.largeur',{valueAsNumber:true})} placeholder="45"/>
                    {form.formState.errors.piste_principale?.largeur && <span className="field-error">{form.formState.errors.piste_principale.largeur.message}</span>}</div>
                  <div className="form-field"><Label icon={Compass} required>Orientation</Label>
                    <input type="text" placeholder="18/36" className={`form-input w-full font-mono bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('piste_principale.orientation')}/>
                    {form.formState.errors.piste_principale?.orientation && <span className="field-error">{form.formState.errors.piste_principale.orientation.message}</span>}</div>
                  <div className="form-field"><Label icon={Gauge} required>Revêtement</Label>
                    <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('piste_principale.revetement')}>
                      <option value="">Sélectionner</option>
                      {REVETEMENTS.map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                    {form.formState.errors.piste_principale?.revetement && <span className="field-error">{form.formState.errors.piste_principale.revetement.message}</span>}</div>
                  <div className="form-field"><Label icon={Gauge} required>PCR</Label>
                    <input type="number" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('piste_principale.pcr',{valueAsNumber:true})} placeholder="80"/></div>
                  <div className="form-field"><Label icon={Plane} required>Code référence</Label>
                    <input type="text" placeholder="4E" className={`form-input w-full font-mono bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('piste_principale.code_reference')}/>
                    {form.formState.errors.piste_principale?.code_reference && <span className="field-error">{form.formState.errors.piste_principale.code_reference.message}</span>}</div>
                  <div className="form-field"><Label icon={Plane}>Avion de référence</Label>
                    <input type="text" placeholder="Boeing 737-800…" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('piste_principale.avion_reference')}/></div>
                  <div className="form-field"><Label icon={Compass}>Type d'approche</Label>
                    <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('piste_principale.type_approche')}>
                      <option value="">Sélectionner</option>
                      <option value="a_vue">À vue</option><option value="classique">Classique</option>
                      <option value="cat1">CAT I</option><option value="cat2">CAT II</option>
                    </select></div>
                </div>
              </div>
            )}

            {/* Séparateur pour mixte */}
            {watchTypeEntite==='mixte' && (
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-border"/>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 flex items-center gap-1.5"><Navigation className="w-3 h-3"/>FATO & TLOF</span>
                <div className="flex-1 h-px bg-border"/>
              </div>
            )}

            {/* ── Hélistation (helistation & mixte) ── */}
            {showHeli && (
              <div>
                {watchTypeEntite!=='mixte' && <SectionTitle icon={Navigation}>FATO, TLOF & Équipements</SectionTitle>}

                <SubSectionTitle icon={Flag}>Identification</SubSectionTitle>
                <div className="grid grid-cols-2 gap-5">
                  <div className="form-field"><Label icon={Radio}>Indicatif d'appel R/T</Label>
                    <input type="text" placeholder="HUB RADIO" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.indicatif_rt')}/>
                    <p className="field-description mt-1">Indicatif radiotelephonique (ex: GOLF HOTEL UNIFORM)</p></div>
                  <div className="form-field"><Label icon={Flag}>Identification officielle</Label>
                    <input type="text" placeholder="GTA HUB" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.identification')}/></div>
                  <div className="form-field"><Label icon={Flag}>Marque distinctive latérale</Label>
                    <input type="text" placeholder="GTA HUB" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.marque_distinctive')}/>
                    <p className="field-description mt-1">Marque visible depuis l'air</p></div>
                  <div className="form-field"><Label icon={Building2}>Type d'installation</Label>
                    <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('helistation.type_installation')}>
                      <option value="">Sélectionner</option>
                      {(Object.entries(TYPE_INSTALLATION_LABELS) as [TypeInstallation,string][]).map(([v,l])=>(
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select></div>
                </div>

                <SubSectionTitle icon={Ruler}>Caractéristiques physiques</SubSectionTitle>
                <div className="grid grid-cols-2 gap-5">
                  <div className="form-field"><Label icon={Ruler} required>Valeur D — Diamètre FATO (m)</Label>
                    <input type="number" step="0.1" placeholder="21" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.valeur_d',{valueAsNumber:true})}/>
                    <p className="field-description mt-1">Diamètre de l'aéronef le plus grand admis (m)</p>
                    {form.formState.errors.helistation?.valeur_d && <span className="field-error">{form.formState.errors.helistation.valeur_d.message}</span>}</div>
                  <div className="form-field"><Label icon={Navigation} required>Cap de l'hélistation (°)</Label>
                    <input type="number" step="1" min="0" max="360" placeholder="100" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.cap',{valueAsNumber:true})}/>
                    <p className="field-description mt-1">Cap magnétique 0°–360°</p>
                    {form.formState.errors.helistation?.cap && <span className="field-error">{form.formState.errors.helistation.cap.message}</span>}</div>
                  <div className="form-field"><Label icon={ArrowUp}>Altitude (pieds)</Label>
                    <input type="number" placeholder="104" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.altitude_ft',{valueAsNumber:true})}/>
                    <p className="field-description mt-1">Au-dessus du niveau de la mer (ft)</p></div>
                  <div className="form-field"><Label icon={ArrowUp}>Hauteur maximale (pieds)</Label>
                    <input type="number" placeholder="216" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.hauteur_maximale_ft',{valueAsNumber:true})}/>
                    <p className="field-description mt-1">Hauteur maximale de la structure (ft)</p></div>
                  <div className="form-field"><Label icon={Waves}>Hauteur obstacle le plus élevé (ft)</Label>
                    <input type="number" placeholder="132" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.hauteur_obstacle_ft',{valueAsNumber:true})}/>
                    <p className="field-description mt-1">Obstacle le plus élevé sur la plate-forme (ft)</p></div>
                  <div className="form-field"><Label icon={Weight}>MTOM (tonnes)</Label>
                    <input type="number" step="0.1" placeholder="12.6" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.mtom',{valueAsNumber:true})}/>
                    <p className="field-description mt-1">Masse maximale au décollage admise (t)</p></div>
                </div>

                <SubSectionTitle icon={Radio}>Communications</SubSectionTitle>
                <div className="grid grid-cols-2 gap-5">
                  <div className="form-field"><Label icon={Radio}>Moyen de communication</Label>
                    <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('helistation.moyen_com')}>
                      <option value="">Sélectionner</option>
                      {(Object.entries(MOYEN_COM_LABELS) as [MoyenCom,string][]).map(([v,l])=>(
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select></div>
                  <div className="form-field"><Label icon={Radio}>Fréquence COM (MHz)</Label>
                    <input type="text" placeholder="133.4" className={`form-input w-full font-mono bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.frequence_com')}/></div>
                </div>

                <SubSectionTitle icon={Zap}>Équipements & Services</SubSectionTitle>
                <div className="grid grid-cols-2 gap-4 mb-5">
                  <BooleanToggle label="Avitaillement disponible" icon={Fuel} description="Carburant disponible sur la plate-forme"
                    value={!!watchAvitaillement} onChange={v=>form.setValue('helistation.avitaillement',v,{shouldDirty:true})}/>
                  <BooleanToggle label="GPU disponible" icon={Zap} description="Groupe de Puissance au Sol"
                    value={!!watchGpu} onChange={v=>form.setValue('helistation.gpu',v,{shouldDirty:true})}/>
                </div>
                <div className="form-field"><Label icon={Flame}>Équipement de lutte contre l'incendie</Label>
                  <input type="text" placeholder="3% AFFF et DIFFS Émulseur de performance B…"
                    className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`}
                    {...form.register('helistation.equipement_incendie')}/>
                  <p className="field-description mt-1">Description complète des agents et systèmes</p></div>

                <SubSectionTitle icon={CalendarDays}>Suivi documentaire</SubSectionTitle>
                <div className="form-field max-w-xs"><Label icon={CalendarDays}>Date de révision</Label>
                  <input type="date" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('helistation.date_revision')}/>
                  <p className="field-description mt-1">Dernière révision de la fiche technique</p></div>
              </div>
            )}

            {/* ── Horaires & Aides visuelles (communs) ── */}
            <div className="pt-4 border-t border-border space-y-4">
              <SubSectionTitle icon={Clock}>Horaires & Aides visuelles</SubSectionTitle>
              <div className="form-field max-w-xs"><Label icon={Clock}>Horaires d'exploitation</Label>
                <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('horaires')}>
                  <option value="">Sélectionner</option>
                  <option value="jour">Jour (08h – 19h)</option>
                  <option value="h24">H24</option>
                </select></div>
              <div className="form-field"><Label icon={Flag}>Aides visuelles</Label>
                <div className="grid grid-cols-3 gap-2 p-3 border border-border rounded-lg mt-2">
                  {[{value:'marques',label:'Marques',icon:Flag},{value:'balise',label:'Balises',icon:Radio},{value:'feux',label:'Feux',icon:Zap},{value:'panneaux',label:'Panneaux',icon:Flag},{value:'papi',label:'PAPI',icon:Navigation},{value:'indicateurs',label:'Indicateurs',icon:Compass}].map(aide=>{
                    const checked=(watchAides??[]).includes(aide.value);
                    const IconComp=aide.icon;
                    return (
                      <label key={aide.value} className="form-checkbox cursor-pointer">
                        <input type="checkbox" checked={checked} onChange={()=>{
                          const cur=form.getValues('aides_visuelles')||[];
                          form.setValue('aides_visuelles',checked?cur.filter(v=>v!==aide.value):[...cur,aide.value],{shouldDirty:true});
                        }}/>
                        <IconComp className={`w-4 h-4 ${checked?'text-role-primary':'text-muted-foreground'}`} />
                        <span className="text-xs">{aide.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ ÉTAPE 6 : SGS & STATUT ══════════════════════════════════ */}
        {currentStep===6 && (
          <div className="animate-fade-up space-y-6">
            <SectionTitle icon={Gauge}>SGS & Statut</SectionTitle>
            {!aerodrome && (maturiteMoyenne || aiSuggestion?.maturite_sgs_suggered?.value) && (
              <div className="alert alert-info border-l-4 border-l-role-primary">
                <Sparkles className="alert-icon"/>
                <div className="alert-content flex-1">
                  <div className="alert-title">Suggestion IA</div>
                  <div className="alert-description">
                    {maturiteMoyenne && <span>SGS moyen des infrastructures similaires: <strong>N{maturiteMoyenne}</strong></span>}
                    {aiSuggestion?.maturite_sgs_suggered?.value && maturiteMoyenne && <span> · </span>}
                    {aiSuggestion?.maturite_sgs_suggered?.value && (
                      <span>Suggestion IA: <strong>N{aiSuggestion.maturite_sgs_suggered.value}</strong>
                      {aiSuggestion.maturite_sgs_suggered.confidence > 0 && (
                        <span className={`badge text-[9px] ml-1.5 ${aiSuggestion.maturite_sgs_suggered.confidence >= 80 ? 'success' : aiSuggestion.maturite_sgs_suggered.confidence >= 50 ? 'warning' : 'danger'}`}>
                          {aiSuggestion.maturite_sgs_suggered.confidence}%
                        </span>
                      )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-5">
              <div className="form-field"><Label icon={Gauge} required>Maturité SGS</Label>
                <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('maturite_sgs',{valueAsNumber:true})}>
                  <option value="">Sélectionner</option>
                  {MATURITE_SGS.map(n=><option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
                <p className="field-description mt-1">{MATURITE_SGS.find(n=>n.value===watchMaturite)?.description}</p>
                {aiSuggestion?.maturite_sgs_suggered?.value && !aerodrome && (
                  <div className="mt-2 p-2 bg-role-primary-soft/20 rounded-lg text-xs flex items-center justify-between border-l-4 border-l-role-primary">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-role-primary"/>
                      Suggestion IA: <strong>N{aiSuggestion.maturite_sgs_suggered.value}</strong>
                      <span className={`badge text-[9px] ${aiSuggestion.maturite_sgs_suggered.confidence >= 80 ? 'success' : aiSuggestion.maturite_sgs_suggered.confidence >= 50 ? 'warning' : 'danger'}`}>
                        {aiSuggestion.maturite_sgs_suggered.confidence}%
                      </span>
                    </span>
                    <button type="button" onClick={()=>form.setValue('maturite_sgs',Number(aiSuggestion.maturite_sgs_suggered.value))} className="action-button hover:text-role-primary gap-1"><Check className="w-3.5 h-3.5" />Appliquer</button>
                  </div>
                )}
                {form.formState.errors.maturite_sgs && <span className="field-error">{form.formState.errors.maturite_sgs.message}</span>}</div>
              <div className="form-field"><Label icon={Plane} required>État</Label>
                <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('statut')}>
                  <option value="brouillon">Brouillon</option><option value="actif">En service</option>
                  <option value="suspendu">Suspendu</option><option value="ferme">Fermé</option>
                </select>
                <p className="field-description mt-1">
                  {watchStatut==='brouillon'&&'Non visible publiquement'}{watchStatut==='actif'&&'Officiellement en service'}
                  {watchStatut==='suspendu'&&'Exploitation suspendue'}{watchStatut==='ferme'&&'Fermé définitivement'}
                </p></div>
            </div>

            {(watchType === 'international' || watchType === 'national') && (
              <div className="pt-4 border-t border-border space-y-4">
                <SubSectionTitle icon={Shield}>
                  {watchType === 'international' ? 'Certification OACI' : 'Homologation nationale'}
                </SubSectionTitle>
                <div className="grid grid-cols-2 gap-5">
                  <div className="form-field col-span-2">
                    <Label icon={Shield} required>
                      {watchType === 'international' ? 'Statut certification' : 'Statut homologation'}
                    </Label>
                    <select className={`form-select w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} style={selectStyle} {...form.register('statut_certification')}>
                      {watchType === 'international' ? (
                        <>
                          <option value="non_certifie">Non certifié</option>
                          <option value="certifie">Certifié</option>
                        </>
                      ) : (
                        <>
                          <option value="non_homologue">Non homologué</option>
                          <option value="homologue">Homologué</option>
                        </>
                      )}
                    </select>
                  </div>
                  {watchStatutCertification === 'certifie' && (
                    <>
                      <div className="form-field">
                        <Label icon={CalendarDays}>Certifié le</Label>
                        <input type="date" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('certifie_le')}/>
                      </div>
                      <div className="form-field">
                        <Label icon={Hash}>N° certificat</Label>
                        <input type="text" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('numero_certificat')} placeholder="Ex: ANACIM/2024/001"/>
                      </div>
                    </>
                  )}
                  {watchStatutCertification === 'homologue' && (
                    <>
                      <div className="form-field">
                        <Label icon={CalendarDays}>Homologué le</Label>
                        <input type="date" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('homologue_le')}/>
                      </div>
                      <div className="form-field">
                        <Label icon={Hash}>N° homologation</Label>
                        <input type="text" className={`form-input w-full bg-background border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} {...form.register('numero_homologation')} placeholder="Ex: HOM/ANACIM/2024/001"/>
                      </div>
                    </>
                  )}
                </div>
                {watchStatutCertification === 'certifie' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success"/> Après création, vous serez redirigé vers le module de certification.
                  </p>
                )}
                {watchStatutCertification === 'homologue' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success"/> Après création, vous serez redirigé vers le module d'homologation.
                  </p>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-border">
              <SubSectionTitle icon={Phone}>Contacts</SubSectionTitle>
              <button type="button" className="btn btn-secondary gap-1.5 mb-4" onClick={()=>appendContact({nom:'',poste:'',email:'',telephone:''})}>
                <Plus className="h-3.5 w-3.5"/>Ajouter un contact
              </button>
              {contactFields.map((field,index)=>(
                <div key={field.id} className="relative p-4 mb-3 bg-role-primary-soft/30 rounded-xl border border-role-primary/10">
                  <button type="button" className="absolute top-2 right-2 p-1 rounded-full hover:bg-role-primary-soft/50 transition-all" onClick={()=>removeContact(index)}><X className="h-4 w-4 text-muted-foreground"/></button>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-field"><Label icon={User}>Nom</Label><input type="text" className={`form-input w-full bg-background border-border py-2 px-3 rounded-lg ${focusClass}`} {...form.register(`contacts.${index}.nom`)}/></div>
                    <div className="form-field"><Label icon={Building2}>Poste</Label><input type="text" className={`form-input w-full bg-background border-border py-2 px-3 rounded-lg ${focusClass}`} {...form.register(`contacts.${index}.poste`)}/></div>
                    <div className="form-field"><Label icon={Mail}>Email</Label><input type="email" className={`form-input w-full bg-background border-border py-2 px-3 rounded-lg ${focusClass}`} {...form.register(`contacts.${index}.email`)}/>
                      {form.formState.errors.contacts?.[index]?.email && <span className="field-error">{form.formState.errors.contacts[index]?.email?.message}</span>}</div>
                    <div className="form-field"><Label icon={Phone}>Téléphone</Label><input type="tel" className={`form-input w-full bg-background border-border py-2 px-3 rounded-lg ${focusClass}`} {...form.register(`contacts.${index}.telephone`)}/></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-border">
              <SubSectionTitle icon={CheckCircle2}>Récapitulatif</SubSectionTitle>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                  {label:'Code OACI',  value:watchCodeOaci||'—'},
                  {label:'Nom',        value:watchNom||'—'},
                  {label:'Nature',     value:TYPE_ENTITE_OPTIONS.find(o=>o.value===watchTypeEntite)?.label||'—'},
                  {label:'Type',       value:watchType||'—'},
                  {label:'Région',     value:watchRegion||'—'},
                  {label:'Coordonnées',value:`${currentLatitude?.toFixed(4)}, ${currentLongitude?.toFixed(4)}`},
                ].map(({label,value})=>(
                  <div key={label} className="p-3 bg-role-primary-soft/30 rounded-xl">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-sm font-semibold text-foreground truncate">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Navigation ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}><X className="w-4 h-4" />Annuler</button>
            {currentStep>1 && <button type="button" onClick={handlePrev} className="btn btn-secondary gap-2"><ChevronLeft className="w-4 h-4"/>Précédent</button>}
          </div>
          <div className="flex items-center gap-3">
  <span className="text-xs text-muted-foreground">Étape {currentStep} / {BASE_STEPS.length}</span>
  {currentStep < 6 ? (
    <button type="button" onClick={handleNext} className="btn btn-primary gap-2">
      Suivant <ChevronRight className="w-4 h-4"/>
    </button>
  ) : (
    <button type="button" onClick={() => form.handleSubmit(onSubmit, onValidationError)()} className="btn btn-primary gap-2" disabled={aerodromeFormLoading}>
      {aerodromeFormLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4"/>}
      {aerodromeFormLoading ? 'Enregistrement...' : (aerodrome ? 'Mettre à jour' : 'Créer')}
    </button>
  )}
</div>
        </div>
      </form>

      {/* ── Modale de redirection certification/homologation ─────────────── */}
      {showRedirectModal && redirectTarget && createPortal(
        <div className="modal-overlay">
          <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center">
                  <Shield className="w-5 h-5 text-role-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {aerodrome ? 'Mis à jour' : 'Créé avec succès'}
                  </h3>
                </div>
              </div>
              <button className="modal-close" onClick={() => { setShowRedirectModal(false); onSuccess(); }}><X className="w-4 h-4" /></button>
            </div>
            <div className="modal-body space-y-4">
              <p className="text-sm text-muted-foreground">
                {redirectTarget === 'certification'
                  ? "L'aérodrome est marqué comme certifié. Voulez-vous accéder au module de certification pour gérer les phases et les preuves ?"
                  : "L'aérodrome est marqué comme homologué. Voulez-vous accéder au module d'homologation pour gérer les phases et les preuves ?"}
              </p>
            </div>
            <div className="modal-footer flex justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => { setShowRedirectModal(false); onSuccess(); }}>
                <X className="w-4 h-4" />
                Rester ici
              </button>
              <button type="button" className="btn btn-primary gap-2" onClick={() => { setActiveModule(redirectTarget); onSuccess(); }}>
                <Shield className="w-4 h-4" />
                Aller à {redirectTarget === 'certification' ? 'la certification' : "l'homologation"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
