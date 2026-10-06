/**
 * @jest-environment node
 */
// lib/__tests__/agentsBench.test.ts — MINI-BANC AGENTS (local vs cloud).
// Exécution EXPLICITE : SGDA_EVAL_LIVE=1 (Ollama requis) [+ SGDA_EVAL_CLOUD=1].
//   $env:SGDA_EVAL_LIVE='1'; npm run eval:agents
// 6 tâches hermétiques avec les VRAIS prompts des agents (lib/ia/prompts) :
// mesure la qualité du MOTEUR (local aerorisq vs cloud Groq) à tâche égale.
// Le plumbing (store, outils) est identique quel que soit le moteur : seule
// la qualité de génération compte pour décider SGDA_LOCAL_FIRST.
// Règle de décision (miroir du banc pilote) : parité qualité ±5 ET globale
// locale ≥ 80 → local d'abord (clouds en secours).
import { normaliserRecherche } from '../domaines';
import {
  GENERER_ITEMS_CHECKLIST_PROMPT,
  SUGGEST_DIRECTIVES_PROMPT,
  SUGGEST_QUESTION_PROMPT,
  SUGGEST_GUIDE_PROMPT,
  GENERER_SGS_QUESTIONS_PROMPT,
} from '../ia/prompts';

const LIVE = process.env.SGDA_EVAL_LIVE === '1';
const CLOUD = process.env.SGDA_EVAL_CLOUD === '1';
const FILTRE = (process.env.SGDA_EVAL_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);

if (CLOUD) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: '.env.local' });
}

const MODELE_LOCAL = process.env.NEXT_PUBLIC_PILOTE_MODEL || 'aerorisq';
const URLS_OLLAMA = ['http://127.0.0.1:11434', 'http://localhost:11434'];
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELES = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

interface CasAgent {
  id: string;
  systeme: string;
  question: string;
  maxTokens: number;
  /** Mots (normalisés) devant figurer dans la réponse (60 pts). */
  mots: string[];
  /** Chaînes interdites — inventions typiques (20 pts). */
  interdits: string[];
  /** Vérification structurelle du JSON extrait (20 pts, null = sans objet). */
  verifJson: ((json: unknown) => boolean) | null;
}

/** Extrait le premier objet JSON équilibré (code fences tolérés). */
function extraireJson(texte: string): unknown | null {
  const propre = (texte || '').replace(/```(?:json)?/gi, '');
  const debut = propre.indexOf('{');
  if (debut === -1) return null;
  let profondeur = 0;
  let guillemets = false;
  let echappe = false;
  for (let i = debut; i < propre.length; i++) {
    const ch = propre[i];
    if (echappe) { echappe = false; continue; }
    if (ch === '\\' && guillemets) { echappe = true; continue; }
    if (ch === '"') { guillemets = !guillemets; continue; }
    if (guillemets) continue;
    if (ch === '{') profondeur++;
    else if (ch === '}') {
      profondeur--;
      if (profondeur === 0) {
        try { return JSON.parse(propre.slice(debut, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

const EXTRAIT_RAS = `RAS 14 Volume I — §3.1.2 Longueur de piste : la longueur de piste déclarée doit être conforme aux performances des avions critiques. §9.2.1 Balisage lumineux : le balisage lumineux doit être maintenu en état de fonctionnement permanent.`;

const CAS: CasAgent[] = [
  {
    id: 'items-json',
    systeme: GENERER_ITEMS_CHECKLIST_PROMPT,
    question: `Document: "RAS 14 Vol I" (RAS 14 Vol I)\nDomaine cible: PHY\n\nTexte réglementaire :\n${EXTRAIT_RAS}\n\nGénère les items de checklist standard pour le domaine PHY. Format attendu : { "items": [{ "numero": "01", "reference_reglementaire": "réf. précise", "point_verification": "question claire ?" }] }`,
    maxTokens: 2000,
    mots: ['piste', 'balisage'],
    interdits: ['§9.9', 'XXXX'],
    verifJson: (j) => {
      const items = (j as { items?: Array<{ point_verification?: string }> })?.items;
      return Array.isArray(items) && items.length >= 2
        && items.every(i => typeof i.point_verification === 'string' && i.point_verification.length > 10);
    },
  },
  {
    id: 'directives',
    systeme: SUGGEST_DIRECTIVES_PROMPT,
    question: `QUESTION À VÉRIFIER : La longueur de piste déclarée est-elle conforme aux performances des avions critiques ?\nGuide : Étape 1 : Demander le manuel d'aérodrome avec les distances déclarées. Étape 2 : Mesurer la longueur physique (seuil : conforme si écart < 1 %). Étape 3 : Observer le balisage de seuil.`,
    maxTokens: 1200,
    mots: ['satisfaisant', 'conforme'],
    interdits: [],
    verifJson: (j) => {
      const o = (j || {}) as Record<string, string>;
      return ['directive_sa', 'directive_ns', 'directive_nv', 'directive_na']
        .every(k => typeof o[k] === 'string' && o[k].length > 10);
    },
  },
  {
    id: 'question',
    systeme: SUGGEST_QUESTION_PROMPT,
    question: `CONTEXTE : exigence RAS 14 I §3.1.2 — la longueur de piste déclarée doit être conforme aux performances des avions critiques (GOBD).`,
    maxTokens: 600,
    mots: ['piste'],
    interdits: [],
    verifJson: (j) => typeof (j as { question?: string })?.question === 'string'
      && ((j as { question?: string }).question as string).length > 10,
  },
  {
    id: 'guide',
    systeme: SUGGEST_GUIDE_PROMPT,
    question: `QUESTION À VÉRIFIER : La longueur de piste déclarée est-elle conforme ?`,
    maxTokens: 800,
    mots: ['tape'],
    interdits: [],
    verifJson: (j) => typeof (j as { guide?: string })?.guide === 'string'
      && ((j as { guide?: string }).guide as string).length > 20,
  },
  {
    id: 'sgs',
    systeme: GENERER_SGS_QUESTIONS_PROMPT,
    question: `Élément SGS : politique et objectifs de sécurité (composante Politique). Texte : Doc 9859 Ch.3 — la direction définit une politique de sécurité signée, communiquée à tout le personnel et revue périodiquement.`,
    maxTokens: 1500,
    mots: ['politique', 'SGS'],
    interdits: ['§9.9'],
    verifJson: (j) => {
      if (!j || typeof j !== 'object') return false;
      const texte = JSON.stringify(j);
      return /question/i.test(texte) && texte.length > 100;
    },
  },
  {
    id: 'synthese',
    systeme: `Tu es AERORISQ, l'inspecteur virtuel de l'ANACIM (Sénégal). Réponds en français, précis et concis. Fonde-toi UNIQUEMENT sur les faits fournis, sans inventer ni référence ni acteur.`,
    question: `Faits : GOBD score 72/100 (moyen). Écart ECA-2026-001 « Fissures piste », critique, ouvert, PAC dû le 2026-12-15. Rédige une synthèse en 5 phrases pour la DG, en citant codes, référence et date.`,
    maxTokens: 600,
    mots: ['GOBD', 'ECA-2026-001', '2026-12-15'],
    interdits: ['Boeing', 'Airbus', '§9.9'],
    verifJson: null,
  },
];

async function interrogerLocal(cas: CasAgent): Promise<{ texte: string; dureeMs: number }> {
  const debut = Date.now();
  let dernierErreur = '';
  for (const base of URLS_OLLAMA) {
    try {
      const res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODELE_LOCAL,
          messages: [
            { role: 'system', content: cas.systeme },
            { role: 'user', content: cas.question },
          ],
          stream: false,
          think: false,
          keep_alive: '30m',
          options: { temperature: 0.2, num_ctx: 8192, num_predict: cas.maxTokens },
        }),
        signal: AbortSignal.timeout(240000),
      });
      if (!res.ok) { dernierErreur = `HTTP ${res.status}`; continue; }
      const data = await res.json().catch(() => null);
      const texte = (data?.message?.content || '').trim();
      if (texte) return { texte, dureeMs: Date.now() - debut };
      dernierErreur = 'réponse vide';
    } catch (e) {
      dernierErreur = (e as Error)?.message || String(e);
    }
  }
  throw new Error(`Ollama injoignable : ${dernierErreur}`);
}

async function interrogerCloud(cas: CasAgent): Promise<{ texte: string; dureeMs: number }> {
  const cle = process.env.GROQ_API_KEY || '';
  if (!cle) throw new Error('GROQ_API_KEY absente (.env.local)');
  const debut = Date.now();
  let dernierErreur = '';
  for (const modele of GROQ_MODELES) {
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modele,
          messages: [
            { role: 'system', content: cas.systeme },
            { role: 'user', content: cas.question },
          ],
          temperature: 0.3,
          max_tokens: cas.maxTokens,
        }),
        signal: AbortSignal.timeout(90000),
      });
      if (res.status === 404) { dernierErreur = `${modele} retiré`; continue; }
      if (!res.ok) { dernierErreur = `HTTP ${res.status}`; continue; }
      const data = await res.json().catch(() => null);
      const texte = (data?.choices?.[0]?.message?.content || '').trim();
      if (texte) return { texte, dureeMs: Date.now() - debut };
      dernierErreur = 'réponse vide';
    } catch (e) {
      dernierErreur = (e as Error)?.message || String(e);
    }
  }
  throw new Error(`Groq injoignable : ${dernierErreur}`);
}

function noter(cas: CasAgent, texte: string): { note: number; details: string[] } {
  const details: string[] = [];
  let note = 0;
  const norm = normaliserRecherche(texte);
  const motsOk = cas.mots.length === 0 || cas.mots.every(m => norm.includes(normaliserRecherche(m)));
  if (motsOk) note += 60;
  else details.push(`mots manquants: [${cas.mots.filter(m => !norm.includes(normaliserRecherche(m))).join(', ')}]`);
  const interdits = cas.interdits || [];
  const interditsOk = !interdits.some(m => norm.includes(normaliserRecherche(m)));
  if (interditsOk) note += 20;
  else details.push(`interdits présents: [${interdits.filter(m => norm.includes(normaliserRecherche(m))).join(', ')}]`);
  if (!cas.verifJson) {
    note += 20;
  } else if (cas.verifJson(extraireJson(texte))) {
    note += 20;
  } else {
    details.push('JSON invalide ou structure inattendue');
  }
  return { note, details };
}

const CAS_ACTIFS = FILTRE.length > 0 ? CAS.filter(c => FILTRE.includes(c.id)) : CAS;

(LIVE ? describe : describe.skip)('mini-banc agents (local vs cloud)', () => {
  beforeAll(async () => {
    let joignable = false;
    for (const base of URLS_OLLAMA) {
      try {
        const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) { joignable = true; break; }
      } catch { /* variante suivante */ }
    }
    if (!joignable) throw new Error('Banc annulé : Ollama injoignable. Démarrez-le avant de mesurer.');
  }, 30000);

  test.each(CAS_ACTIFS.map(c => [c.id, c] as const))('%s', async (_id, cas) => {
    // Tolérant : une panne réseau/timeout donne 0 + détail, jamais de suite
    // avortée — le verdict porte sur les cas mesurés.
    let note = 0;
    let dureeS = 0;
    let details: string[] = [];
    try {
      const local = await interrogerLocal(cas);
      const n = noter(cas, local.texte);
      note = n.note;
      dureeS = Math.round(local.dureeMs / 1000);
      details = n.details;
    } catch (e) {
      details = [`local: ${(e as Error)?.message || String(e)}`];
    }
    let noteCloud: number | null = null;
    let dureeCloudS: number | null = null;
    if (CLOUD) {
      try {
        const cloud = await interrogerCloud(cas);
        dureeCloudS = Math.round(cloud.dureeMs / 1000);
        noteCloud = noter(cas, cloud.texte).note;
      } catch { noteCloud = null; }
    }
    const notes = (((globalThis as Record<string, unknown>).__sgdaAgentsNotes) as Array<unknown> | undefined) || [];
    (globalThis as Record<string, unknown>).__sgdaAgentsNotes = notes;
    notes.push({ id: cas.id, note, dureeS, details, noteCloud, dureeCloudS });
    expect(true).toBe(true);
  }, 600000);

  afterAll(() => {
    const notes = (((globalThis as Record<string, unknown>).__sgdaAgentsNotes) as Array<{
      id: string; note: number; dureeS: number; details: string[]; noteCloud: number | null; dureeCloudS: number | null;
    }>) || [];
    // eslint-disable-next-line no-console
    console.log('\n===== MINI-BANC AGENTS =====');
    for (const n of notes) {
      const cloud = n.noteCloud != null ? `  | cloud ${n.noteCloud} (${n.dureeCloudS}s)` : '';
      // eslint-disable-next-line no-console
      console.log(`${String(n.note).padStart(3)}/100  ${n.id.padEnd(12)} ${n.dureeS}s${cloud}${n.details.length > 0 ? `  ← ${n.details.join(' ; ')}` : ''}`);
    }
    const globale = notes.length > 0 ? Math.round(notes.reduce((s, n) => s + n.note, 0) / notes.length) : 0;
    const avecCloud = notes.filter(n => n.noteCloud != null);
    const cloudMoy = avecCloud.length > 0
      ? Math.round(avecCloud.reduce((s, n) => s + (n.noteCloud as number), 0) / avecCloud.length) : null;
    let decision: string;
    if (cloudMoy == null) {
      decision = `Passe locale seule : globale ${global}/100. Relancez avec SGDA_EVAL_CLOUD=1 pour le comparatif.`;
    } else if (globale >= cloudMoy - 5 && globale >= 80) {
      decision = `BASCULE RECOMMANDÉE : parité qualité (local ${globale} vs cloud ${cloudMoy}), globale ${globale}/100. SGDA_LOCAL_FIRST=true envisageable (clouds en secours).`;
    } else {
      decision = `BASCULE PRÉMATURÉE : local ${globale} vs cloud ${cloudMoy} (seuil : parité ±5 et globale ≥80, ici ${globale}).`;
    }
    // eslint-disable-next-line no-console
    console.log(`NOTE GLOBALE AGENTS : ${globale}/100`);
    // eslint-disable-next-line no-console
    console.log(`DÉCISION : ${decision}`);
  });
});
