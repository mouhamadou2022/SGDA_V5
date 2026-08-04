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

// Extrait tout le texte d'un paragraphe DOCX depuis le XML
function extractParaText(paraEl: Element): string {
  const texts: string[] = [];
  const runs = paraEl.querySelectorAll('w\\:r, w\\:t');
  paraEl.querySelectorAll('w\\:r w\\:t, w\\:t').forEach((t: Element) => {
    if (t.textContent) texts.push(t.textContent);
  });
  return texts.join('').trim();
}

// Détecte le style d'un paragraphe
function getParaStyle(paraEl: Element): string {
  const styleEl = paraEl.querySelector('w\\:pStyle');
  return styleEl?.getAttribute('w:val') || 'Normal';
}

// Détecte si un paragraphe est un titre
function getHeadingLevel(paraEl: Element): number {
  const style = getParaStyle(paraEl);
  const match = style.match(/^Heading(\d)$/i);
  if (match) return parseInt(match[1]);
  if (style === 'Title') return 1;
  if (style === 'Subtitle') return 2;
  if (style === 'TOC1') return 1;
  if (style === 'TOC2') return 2;
  return 0;
}

// Map de titres de sections → clé sections
const SECTION_TITLE_MAP: Record<string, string> = {
  'resume executif': 'resume',
  'résumé exécutif': 'resume',
  'introduction': 'introduction',
  'contexte': 'introduction',
  'information generale': 'introduction',
  'information générale': 'introduction',
  'methodologie': 'methodologie',
  'méthodologie': 'methodologie',
  'deroulement': 'deroulement',
  'déroulement': 'deroulement',
  'preoccupation': 'preoccupations',
  'préoccupation': 'preoccupations',
  'recommandation': 'recommandations',
  'conclusion': 'conclusion',
  'resultats': 'resultsIntro',
  'résultats': 'resultsIntro',
  'analyse': 'resultsAnalysis',
};

const DEROULEMENT_SUB_MAP: Record<string, string> = {
  'preparation': 'preparation',
  'préparation': 'preparation',
  'reunion ouverture': 'reunionOuverture',
  'réunion ouverture': 'reunionOuverture',
  'reunion d\'ouverture': 'reunionOuverture',
  'réunion d\'ouverture': 'reunionOuverture',
  'verification': 'verificationSite',
  'vérification': 'verificationSite',
  'visite': 'verificationSite',
  'site': 'verificationSite',
  'reunion cloture': 'reunionCloture',
  'réunion clôture': 'reunionCloture',
  'reunion de cloture': 'reunionCloture',
  'réunion de clôture': 'reunionCloture',
  'cloture': 'reunionCloture',
  'clôture': 'reunionCloture',
};

function detectSectionKey(paraText: string): string | null {
  const lower = paraText.toLowerCase().replace(/[0-9._\-\s]+/g, ' ').trim();
  for (const [key, val] of Object.entries(SECTION_TITLE_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

function detectDeroulementSubKey(paraText: string): string | null {
  const lower = paraText.toLowerCase();
  for (const [key, val] of Object.entries(DEROULEMENT_SUB_MAP)) {
    if (lower.includes(key)) return val;
  }
  return null;
}

export async function parseRapportDOCX(arrayBuffer: ArrayBuffer): Promise<RapportImportResult> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const docXmlStr = await zip.file('word/document.xml')?.async('string');
  if (!docXmlStr) throw new Error('word/document.xml introuvable dans le fichier DOCX');

  const parser = new DOMParser();
  const docXml = parser.parseFromString(docXmlStr, 'text/xml');

  // Récupérer tous les paragraphes
  const paragraphs = docXml.querySelectorAll('w\\:p');
  // Fallback: essayer sans namespace
  const paras = paragraphs.length > 0
    ? paragraphs
    : docXml.querySelectorAll('p');

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
    rawHtml: '',
  };

  let currentSection: string | null = null;
  let currentDeroulementSub: string | null = null;
  let inPageGarde = true;
  const htmlParts: string[] = [];

  for (const para of Array.from(paras)) {
    const text = extractParaText(para);
    const style = getParaStyle(para);
    const headingLevel = getHeadingLevel(para);
    const isHeading = headingLevel > 0 || style === 'Title';

    if (!text && !isHeading) continue;

    // Détection de section
    const sectionKey = detectSectionKey(text);
    const isDeroulementSub = detectDeroulementSubKey(text);

    if (sectionKey) {
      currentSection = sectionKey;
      currentDeroulementSub = null;
      inPageGarde = false;
      if (isHeading || text.length < 60) continue;
    }

    if (currentSection === 'deroulement' && isDeroulementSub) {
      currentDeroulementSub = isDeroulementSub;
      if (isHeading || text.length < 60) continue;
    }

    if (inPageGarde && text.includes('République') || text.includes('ANACIM') || text.includes('DNA') || text.includes('Ministère')) {
      continue;
    }
    if (inPageGarde && text.includes(':')) {
      const [k, ...v] = text.split(':');
      if (k && v.length) result.pageGarde[k.trim()] = v.join(':').trim();
      continue;
    }

    // Après quelques lignes vides, sortir de la page de garde
    if (inPageGarde && (text.includes('Rapport') || text.includes('surveillance'))) {
      inPageGarde = false;
      continue;
    }

    // Si c'est un titre, on continue (déjà géré par sectionKey)
    if (isHeading && sectionKey) continue;

    // Construire le HTML
    const paraHtml = text ? `<p>${text}</p>` : '';

    if (currentSection && currentSection !== 'deroulement') {
      const sec = currentSection as keyof typeof result.sections;
      const sectionVal = result.sections[sec];
      if (typeof sectionVal === 'string') {
        (result.sections as any)[sec] = sectionVal + paraHtml;
      }
    } else if (currentSection === 'deroulement' && currentDeroulementSub) {
      const sub = currentDeroulementSub as keyof typeof result.sections.deroulement;
      result.sections.deroulement[sub] += paraHtml;
    } else {
      htmlParts.push(paraHtml);
    }
  }

  result.rawHtml = htmlParts.join('\n');

  // Nettoyer les valeurs vides
  for (const key of Object.keys(result.sections)) {
    if (key === 'deroulement') continue;
    const k = key as keyof typeof result.sections;
    const sectionVal = result.sections[k];
    if (typeof sectionVal === 'string' && !sectionVal.trim()) {
      (result.sections as any)[k] = '';
    }
  }

  return result;
}

export async function importRapportFromFile(
  file: File,
): Promise<RapportImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  return parseRapportDOCX(arrayBuffer);
}
