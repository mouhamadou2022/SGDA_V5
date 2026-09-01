'use client';

export interface RapportImportResult {
  sections: {
    resume: string;
    introduction: string;
    methodologie: string;
    preoccupations: string;
    recommandations: string;
    conclusion: string;
    resultsIntro: string;
    resultsAnalysis: string;
    deroulement: {
      preparation: string;
      reunionOuverture: string;
      verificationSite: string;
      reunionCloture: string;
    };
  };
  pageGarde: Record<string, string>;
  rawHtml: string;
}

type SectionKey = keyof RapportImportResult['sections'];
type DeroulementKey = keyof RapportImportResult['sections']['deroulement'];

// Normalise un texte pour la détection d'en-tête : minuscules, sans accents,
// sans numérotation ni ponctuation de début (« 1. », « 2.1 », « - », etc.).
function normalizeHeading(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[\s\d._\-–—:)]+/, '')
    .trim();
}

const DEROULEMENT_SUB_MAP: Record<string, DeroulementKey> = {
  'preparation': 'preparation',
  'preparations': 'preparation',
  'reunion douverture': 'reunionOuverture',
  'reunion ouverture': 'reunionOuverture',
  'reunion de lancement': 'reunionOuverture',
  'verification sur site': 'verificationSite',
  'verification site': 'verificationSite',
  'visite sur site': 'verificationSite',
  'visite terrain': 'verificationSite',
  'verification terrain': 'verificationSite',
  'reunion de cloture': 'reunionCloture',
  'reunion cloture': 'reunionCloture',
  'cloture': 'reunionCloture',
};

// Détection de section racine (best-effort pour une structure libre).
function detectSectionKey(text: string): SectionKey | null {
  const t = normalizeHeading(text);
  if (!t || t.length > 120) return null;

  if (t.includes('resume executif') || t === 'resume' || t.startsWith('resume ') || t.includes('synthese'))
    return 'resume';
  if (t.includes('recommandation')) return 'recommandations';
  if (t.includes('conclusion')) return 'conclusion';
  if (t.includes('analyse des resultat') || t.includes('analyse resultat') || t.includes('interpretation'))
    return 'resultsAnalysis';
  if (t.includes('resultat') || t.includes('constatation') || t.includes('constats') || t.includes('ecart'))
    return 'resultsIntro';
  if (t.includes('introduction') || t.includes('contexte') || t.includes('information generale')
    || t.includes('vuedensemble') || t.includes('vue densemble') || t.includes('objet du rapport'))
    return 'introduction';
  if (t.includes('deroulement') || t.includes('mission') || t.includes('developpement'))
    return 'deroulement';
  if (t.includes('methodologie') || t.includes('methodes') || t.includes('methode')
    || t.includes('approche') || t.includes('referentiel') || t.includes('portee'))
    return 'methodologie';
  if (t.includes('preoccupation') || t.includes('sujet de securite') || t.includes('probleme de securite'))
    return 'preoccupations';

  return null;
}

export function isSectionHeader(el: Element): boolean {
  const tag = el.nodeName.toLowerCase();
  if (/^h[1-6]$/.test(tag)) return true;
  const text = (el.textContent || '').trim();
  if (!text || text.length > 120 || text.includes('\n')) return false;
  return detectSectionKey(text) !== null;
}

function outerHTML(el: Element): string {
  const wrap = document.createElement('div');
  wrap.appendChild(el.cloneNode(true));
  return wrap.innerHTML;
}

// Découpe le HTML converti en sections de l'éditeur standard. BEST-EFFORT :
// le contenu n'est jamais perdu — tout ce qui n'est rattaché à aucune section
// est conservé dans rawHtml et affiché tel quel par l'éditeur libre.
export function splitRapportHtml(html: string): RapportImportResult {
  const result: RapportImportResult = {
    sections: {
      resume: '',
      introduction: '',
      methodologie: '',
      preoccupations: '',
      recommandations: '',
      conclusion: '',
      resultsIntro: '',
      resultsAnalysis: '',
      deroulement: { preparation: '', reunionOuverture: '', verificationSite: '', reunionCloture: '' },
    },
    pageGarde: {},
    rawHtml: html,
  };

  if (!html) return result;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="doc">${html}</div>`, 'text/html');
  const root = doc.getElementById('doc');
  if (!root) return result;

  let currentSection: SectionKey | null = null;
  let currentDeroulementSub: DeroulementKey | null = null;
  const pending: string[] = [];

  const appendToSection = (section: SectionKey, block: string) => {
    if (section === 'deroulement' || !block) return;
    const key = section as Exclude<SectionKey, 'deroulement'>;
    result.sections[key] = result.sections[key] ? result.sections[key] + block : block;
  };

  const appendToDeroulement = (sub: DeroulementKey, block: string) => {
    if (!block) return;
    result.sections.deroulement[sub] = result.sections.deroulement[sub]
      ? result.sections.deroulement[sub] + block
      : block;
  };

  const flushPending = (target: SectionKey) => {
    if (!pending.length) return;
    appendToSection(target, pending.join(''));
    pending.length = 0;
  };

  for (const block of Array.from(root.children)) {
    const blockText = (block.textContent || '').trim();
    const tag = block.nodeName.toLowerCase();

    if (/^h[1-6]$/.test(tag) || isSectionHeader(block)) {
      const sectionKey = detectSectionKey(blockText);
      if (sectionKey) {
        flushPending(sectionKey === 'deroulement' ? 'methodologie' : sectionKey);
        currentSection = sectionKey;
        currentDeroulementSub = null;
        continue;
      }
    }

    if (currentSection === 'deroulement') {
      const sub = detectDeroulementSubKeyText(blockText);
      if (sub && blockText.length <= 80 && !/\n/.test(blockText)) {
        currentDeroulementSub = sub;
        continue;
      }
    }

    const blockHtml = outerHTML(block);
    if (!blockHtml) continue;

    if (currentSection === 'deroulement') {
      if (currentDeroulementSub) appendToDeroulement(currentDeroulementSub, blockHtml);
      else pending.push(blockHtml);
    } else if (currentSection) {
      appendToSection(currentSection, blockHtml);
    } else {
      pending.push(blockHtml);
    }
  }

  if (pending.length) {
    flushPending(currentSection && currentSection !== 'deroulement' ? currentSection : 'resultsIntro');
  }

  return result;
}

function detectDeroulementSubKeyText(text: string): DeroulementKey | null {
  const t = normalizeHeading(text);
  if (!t) return null;
  for (const [key, val] of Object.entries(DEROULEMENT_SUB_MAP)) {
    if (t.includes(key)) return val;
  }
  return null;
}

// ── Parseur DOCX : conversion mammoth (navigateur) ────────────────────────
// Le HTML de sortie (mammoth) est fidèle : textes, tableaux, listes, gras/italique…
// Il est retourné tel quel dans rawHtml pour être édité librement.
// Mappage des styles Word nommés vers les balises/classes déjà stylées dans
// `.rapport-a4 .rapport-content` (h2/h3, encadrés, tableaux), afin de préserver
// la hiérarchie des titres et les mises en forme récurrentes de nos gabarits
// ANACIM à l'import, sans reformatage manuel.
const RAPPORT_STYLE_MAP: string[] = [
  "p[style-name='Titre 1'] => h2:fresh",
  "p[style-name='Titre 2'] => h3:fresh",
  "p[style-name='Titre 3'] => h3:fresh",
  "p[style-name='Heading 1'] => h2:fresh",
  "p[style-name='Heading 2'] => h3:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Titre'] => h2:fresh",
  "p[style-name='Titre section'] => h2.rapport-section-accent:fresh",
  "p[style-name='Section'] => h2.rapport-section-accent:fresh",
  "p[style-name='Encadré'] => p.rapport-callout:fresh",
  "p[style-name='Encadre'] => p.rapport-callout:fresh",
  "table[style-name='Tableau synthèse'] => table.rapport-table-colored",
  "table[style-name='Tableau synthese'] => table.rapport-table-colored",
];

export async function parseRapportDOCX(arrayBuffer: ArrayBuffer): Promise<RapportImportResult> {
  const mammoth = await import('mammoth');
  const conversion = await mammoth.convertToHtml({ arrayBuffer }, { styleMap: RAPPORT_STYLE_MAP });
  const html = conversion?.value ?? '';
  return splitRapportHtml(html);
}

export async function importRapportFromFile(file: File): Promise<RapportImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  return parseRapportDOCX(arrayBuffer);
}
