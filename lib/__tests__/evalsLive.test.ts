/**
 * @jest-environment node
 */
// lib/__tests__/evalsLive.test.ts — BANC D'ESSAI AERORISQ (mesure réelle).
// Exécution EXPLICITE uniquement : SGDA_EVAL_LIVE=1 (Ollama requis).
//   $env:SGDA_EVAL_LIVE=1; npm test -- lib/__tests__/evalsLive --runInBand
// Filtre : SGDA_EVAL_ONLY=etat-site,plannings. Rapport JSON dans le dossier temp.
// Les écritures sont REFUSÉES par le harnais : l'outil PROPOSÉ prouve le bon
// choix, sans aucun effet de bord (zéro écriture, zéro notification).
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { useAppStore } from '../store';
import { executerPilote } from '../ia/pilote/bouclePilote';
import { GOLDEN_SET } from '../ia/evals/golden';
import { noterCas, noteGlobale, noteQualite } from '../ia/evals/score';

const LIVE = process.env.SGDA_EVAL_LIVE === '1';
const FILTRE = (process.env.SGDA_EVAL_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const STRICT = process.env.SGDA_EVAL_STRICT === '1';
// Comparatif cloud : SGDA_EVAL_CLOUD=1 ajoute la passe cloud (meilleur provider
// disponible) + la recommandation de bascule. Clés via .env.local (dotenv).
const CLOUD = process.env.SGDA_EVAL_CLOUD === '1';

const SYSTEME_COMPARAISON = `Tu es AERORISQ, l'inspecteur virtuel de l'ANACIM (Sénégal). Réponds en français, précis et concis.`;

if (CLOUD) {
  // Clés (.env.local) pour la passe cloud — fichier git-ignoré, jamais commité.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: '.env.local' });
}

const CAS = FILTRE.length > 0 ? GOLDEN_SET.filter(c => FILTRE.includes(c.id)) : GOLDEN_SET;

function seedFixtures() {
  useAppStore.setState({
    aerodromes: [
      { id: 'a-gobd', code_oaci: 'GOBD', nom: 'Blaise Diagne', type: 'international', region: 'Dakar' },
      { id: 'a-gott', code_oaci: 'GOTT', nom: 'Tambacounda', type: 'national', region: 'Tambacounda' },
      { id: 'a-gooy', code_oaci: 'GOOY', nom: 'Léopold Sédar Senghor', type: 'international', region: 'Dakar' },
      { id: 'a-gogz', code_oaci: 'GOGZ', nom: 'Ziguinchor', type: 'national', region: 'Ziguinchor' },
    ],
    ecarts: [
      {
        id: 'e-1', reference: 'ECA-2026-001', libelle: 'Fissures longitudinales sur la piste principale',
        domaine: 'PHY', niveau_risque: 'critique', statut: 'ouvert', aerodrome_id: 'a-gobd',
        delai_pac: '2026-12-31', delai_regularisation: '2027-03-31', inspecteur_ref_id: 'eval',
        created_at: '2026-09-01', updated_at: '2026-09-01',
      },
    ],
    plannings: [
      {
        id: 'p-1', aerodrome_id: 'a-gobd', type: 'periodique', statut: 'planifiee',
        date_debut: '2026-11-10', date_fin: '2026-11-12', portee: ['PHY'], equipe_ids: [],
        est_proposition: false, annee_cible: 2026,
      },
    ],
    surveillances: [],
    profilsRisque: {},
    evenements: [],
    // Corpus RAG minimal (miroir de la prod) : 2 docs, 3 § citables.
    kitDocuments: [
      {
        id: 'kit-ras14', nom: 'RAS 14 Volume I', type_document: 'reglementation',
        type_document_oaci: 'RAS-14', reference_base: 'RAS 14 Vol I',
        version: 'v1.0', date_revision: '2026-01-01', etat: 'a_jour',
        domaines: ['PHY', 'ELEC'], fichier_url: '', fichier_nom: 'ras14.pdf',
        fichier_taille: 0, mots_cles: ['piste', 'balisage'], resume: '',
        accessible_exploitant: false, telechargements: 0,
        created_at: '2026-01-01', updated_at: '2026-01-01', created_by: 'eval',
        contenu_complet: 'RAS 14 Volume I — §3.1.2 Longueur de piste : la longueur de piste déclarée doit être conforme aux performances des avions critiques. §9.2.1 Balisage lumineux : le balisage lumineux doit être maintenu en état de fonctionnement permanent.',
        extraits: [
          {
            reference: 'RAS 14 I §3.1.2', titre: 'Longueur de piste',
            contenu_resume: 'La longueur de piste déclarée doit être conforme aux performances des avions critiques.',
            statut: 'ACTIF', domaines: ['PHY'], type_entite_cible: 'tous',
            source_document_id: 'kit-ras14', detecte_le: '2026-01-01',
          },
          {
            reference: 'RAS 14 I §9.2.1', titre: 'Balisage lumineux',
            contenu_resume: 'Le balisage lumineux doit être maintenu en état de fonctionnement permanent.',
            statut: 'ACTIF', domaines: ['ELEC'], type_entite_cible: 'tous',
            source_document_id: 'kit-ras14', detecte_le: '2026-01-01',
          },
        ],
      },
      {
        id: 'kit-9859', nom: 'Doc 9859, Manuel SGS', type_document: 'guide',
        type_document_oaci: 'Guides', reference_base: 'Doc 9859',
        version: 'v1.0', date_revision: '2026-01-01', etat: 'a_jour',
        domaines: ['SGS'], fichier_url: '', fichier_nom: 'doc9859.pdf',
        fichier_taille: 0, mots_cles: ['sgs', 'suivi'], resume: '',
        accessible_exploitant: false, telechargements: 0,
        created_at: '2026-01-01', updated_at: '2026-01-01', created_by: 'eval',
        contenu_complet: 'Doc 9859 — Chapitre 8 Suivi des écarts : chaque écart ouvert fait l objet d un suivi documenté jusqu à clôture, avec plan d actions correctives accepté.',
        extraits: [
          {
            reference: 'Doc 9859 Ch.8', titre: 'Suivi des écarts',
            contenu_resume: 'Chaque écart ouvert fait l objet d un suivi documenté jusqu à clôture.',
            statut: 'ACTIF', domaines: ['SGS'], type_entite_cible: 'tous',
            source_document_id: 'kit-9859', detecte_le: '2026-01-01',
          },
        ],
      },
    ],
  } as never);
}

jest.mock('localforage', () => {
  // localforage exige IndexedDB/WebSQL/localStorage (absents en node) :
  // instance mémoire pour le banc (cache IA + persist store).
  const mem = new Map<string, unknown>();
  const instance = () => ({
    getItem: async (k: string) => (mem.has(k) ? mem.get(k) : null),
    setItem: async (k: string, v: unknown) => { mem.set(k, v); return v; },
    removeItem: async (k: string) => { mem.delete(k); },
    clear: async () => { mem.clear(); },
    keys: async () => [...mem.keys()],
    length: async () => mem.size,
    key: async (i: number) => [...mem.keys()][i] ?? null,
    iterate: async () => {},
  });
  return {
    __esModule: true,
    default: { createInstance: () => instance() },
  };
});

jest.mock('../persistence/iaStorage', () => {
  const mem = new Map<string, unknown>();
  const cle = (s: string, k: string) => `${s}::${k}`;
  return {
    // Stockage mémoire : la persistance best-effort (IDB, absent en node)
    // ne doit jamais faire échouer une mesure.
    iaStorage: {
      get: async (s: string, k: string) => mem.has(cle(s, k)) ? mem.get(cle(s, k)) : null,
      set: async (s: string, k: string, v: unknown) => { mem.set(cle(s, k), v); },
      remove: async (s: string, k: string) => { mem.delete(cle(s, k)); },
      clear: async () => { mem.clear(); },
    },
    mergeArrayById: <T extends { id: string }>(existing: T[], incoming: T[]) => {
      const map = new Map(existing.map(e => [e.id, e]));
      for (const e of incoming) map.set(e.id, e);
      return [...map.values()];
    },
  };
});

(LIVE ? describe : describe.skip)('banc essai AERORISQ (live Ollama)', () => {
  beforeAll(async () => {
    // Garde honnête : sans Ollama joignable, les notes seraient fictives.
    let joignable = false;
    let derniereErreur = '';
    for (const base of ['http://127.0.0.1:11434', 'http://localhost:11434']) {
      try {
        const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) { joignable = true; break; }
        derniereErreur = `HTTP ${res.status}`;
      } catch (e) {
        derniereErreur = (e as Error)?.message || String(e);
      }
    }
    if (!joignable) throw new Error(`Banc annulé : Ollama injoignable (localhost et 127.0.0.1) — détail : ${derniereErreur}. Démarrez-le avant de mesurer.`);
    seedFixtures();
    if (typeof URL.createObjectURL !== 'function') {
      (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:mock';
    }
  }, 30000);

  test.each(CAS.map(c => [c.id, c] as const))('%s', async (_id, cas) => {
    const debut = Date.now();
    const trace: string[] = [];
    const res = await executerPilote({
      instruction: cas.question,
      historique: [],
      contexte: { userId: 'eval', userRole: 'inspector', userName: 'Banc essai' },
      onConfirmer: async () => false,
      onTrace: (e) => { trace.push(e); },
    });
    const dureeMs = Date.now() - debut;
    const note = noterCas(cas, {
      outilsLances: res.actions.map(a => a.outil),
      reponse: res.reponse,
      dureeMs,
      interrompu: res.interrompu,
    });
    let noteCloud: number | null = null;
    let dureeCloudS: number | null = null;
    if (CLOUD) {
      const debutCloud = Date.now();
      try {
        const { callWithFallback } = await import('../ia/providers');
        const cloud = await callWithFallback({
          messages: [
            { role: 'system', content: SYSTEME_COMPARAISON },
            { role: 'user', content: cas.question },
          ],
          temperature: 0.3,
          max_tokens: 600,
        });
        dureeCloudS = Math.round((Date.now() - debutCloud) / 1000);
        const noteC = noterCas(cas, {
          outilsLances: [],
          reponse: cloud.content || '',
          dureeMs: Date.now() - debutCloud,
        });
        noteCloud = noteQualite(noteC);
      } catch {
        noteCloud = null;
      }
    }
    (globalThis as Record<string, unknown>).__sgdaEvalNotes =
      ((globalThis as Record<string, unknown>).__sgdaEvalNotes as Array<unknown> || []).concat([{
        id: cas.id, note: note.note, qualiteLocale: noteQualite(note),
        dureeS: Math.round(dureeMs / 1000),
        outils: res.actions.map(a => `${a.outil}(${a.statut})`),
        details: note.details,
        noteCloud, dureeCloudS,
      }]);
    if (STRICT) expect(note.note).toBeGreaterThanOrEqual(80);
    else expect(true).toBe(true);
  }, 600000);

  afterAll(() => {
    const notes = ((globalThis as Record<string, unknown>).__sgdaEvalNotes as Array<{
      id: string; note: number; qualiteLocale: number; dureeS: number;
      outils: string[]; details: string[]; noteCloud: number | null; dureeCloudS: number | null;
    }>) || [];
    const global = noteGlobale(notes.map(n => ({
      note: n.note, outilsOk: true, motsOk: true, interditsOk: true,
      depassementDuree: false, details: n.details,
    })));
    const avecCloud = notes.filter(n => n.noteCloud != null);
    const qualiteLocaleMoy = notes.length > 0
      ? Math.round(notes.reduce((s, n) => s + (n.qualiteLocale ?? 0), 0) / notes.length) : 0;
    const qualiteCloudMoy = avecCloud.length > 0
      ? Math.round(avecCloud.reduce((s, n) => s + (n.noteCloud as number), 0) / avecCloud.length) : null;
    const dureeLocaleMoy = notes.length > 0
      ? Math.round(notes.reduce((s, n) => s + n.dureeS, 0) / notes.length) : 0;
    const dureeCloudMoy = avecCloud.length > 0
      ? Math.round(avecCloud.reduce((s, n) => s + (n.dureeCloudS || 0), 0) / avecCloud.length) : null;
    // Règle de bascule : parité qualité ±5 + outils OK → local d'abord.
    const outilsOk = notes.filter(n => n.details.every(d => !d.startsWith('outils:'))).length;
    let recommandation: string;
    if (qualiteCloudMoy == null) {
      recommandation = 'Passe locale seule — relancez avec SGDA_EVAL_CLOUD=1 pour le comparatif et la décision de bascule.';
    } else if (qualiteLocaleMoy >= qualiteCloudMoy - 5 && global >= 80) {
      recommandation = `BASCULE RECOMMANDÉE : parité qualité (local ${qualiteLocaleMoy} vs cloud ${qualiteCloudMoy}), note globale ${global}/100. Activez SGDA_LOCAL_FIRST=true (clouds en secours). Reste l'écart vitesse : local ~${dureeLocaleMoy}s vs cloud ~${dureeCloudMoy ?? '?'}s par cas.`;
    } else {
      recommandation = `BASCULE PRÉMATURÉE : qualité locale ${qualiteLocaleMoy} vs cloud ${qualiteCloudMoy} (seuil : parité ±5 et globale ≥80, ici ${global}). Pistes : exemples en or ciblés sur les cas faibles, puis fine-tuning LoRA, puis re-mesure.`;
    }
    const rapport = {
      date: new Date().toISOString(), noteGlobale: global,
      qualiteLocaleMoy, qualiteCloudMoy, dureeLocaleMoyS: dureeLocaleMoy, dureeCloudMoyS: dureeCloudMoy,
      outilsOkCount: `${outilsOk}/${notes.length}`, recommandation, cas: notes,
    };
    const fichier = path.join(os.tmpdir(), `sgda-eval-${Date.now()}.json`);
    fs.writeFileSync(fichier, JSON.stringify(rapport, null, 2));
    // eslint-disable-next-line no-console
    console.log('\n===== BANC ESSAI AERORISQ =====');
    for (const n of notes) {
      const cloud = n.noteCloud != null ? `  | cloud ${n.noteCloud} (${n.dureeCloudS}s)` : '';
      // eslint-disable-next-line no-console
      console.log(`${String(n.note).padStart(3)}/100  ${n.id.padEnd(16)} ${n.dureeS}s  [${n.outils.join(', ')}]${cloud}${n.details.length > 0 ? `  ← ${n.details.join(' ; ')}` : ''}`);
    }
    // eslint-disable-next-line no-console
    console.log(`NOTE GLOBALE : ${global}/100 — rapport : ${fichier}`);
    // eslint-disable-next-line no-console
    console.log(`DÉCISION : ${recommandation}`);
  });
});
