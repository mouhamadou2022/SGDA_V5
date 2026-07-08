// lib/ia/regulatoryRefs.ts
// Références réglementaires pour justifier chaque recommandation
// Ancrage : Doc 9981 (PANS-AER), Annexe 14, Réglementation nationale

export interface RegulatoryRef {
  regulation: string
  article: string
  title: string
  text: string
  domain: 'SGS' | 'PAC' | 'CONFORMITE' | 'SECURITE' | 'EXPLOITATION' | 'CERTIFICATION'
}

const REFS: Record<string, RegulatoryRef[]> = {
  'c1': [
    {
      regulation: 'Doc 9981 (PANS-AER)',
      article: 'Partie I, Chapitre 2',
      title: 'Système de gestion de la sécurité',
      text: 'L\'exploitant doit établir un SGS documenté couvrant les 4 piliers PAOE : Politique, Gestion des risques, Assurance, Promotion.',
      domain: 'SGS',
    },
    {
      regulation: 'Annexe 14 — Volume I',
      article: '§1.4',
      title: 'Certification et SGS',
      text: 'Tout aérodrome certifié doit maintenir un SGS proportionné à la complexité des opérations.',
      domain: 'SGS',
    },
  ],
  'c2': [
    {
      regulation: 'Doc 9981 (PANS-AER)',
      article: 'Partie II, Chapitre 5',
      title: 'Plan d\'actions correctives',
      text: 'Tout écart identifié doit faire l\'objet d\'un plan d\'actions correctives avec échéancier et responsable désigné.',
      domain: 'PAC',
    },
    {
      regulation: 'Règlement national',
      article: 'Article R-432-7',
      title: 'Délai de traitement des écarts',
      text: 'Les écarts de niveau critique doivent être résorbés sous 30 jours, les écarts élevés sous 90 jours.',
      domain: 'PAC',
    },
  ],
  'c3': [
    {
      regulation: 'Annexe 14 — Volume I',
      article: '§3 (Piste), §5 (Balisage), §8 (SSLIA)',
      title: 'Conformité des infrastructures',
      text: 'Les infrastructures critiques (piste, balisage lumineux, SSLIA) doivent être conformes aux spécifications techniques de l\'Annexe 14.',
      domain: 'CONFORMITE',
    },
    {
      regulation: 'Doc 9981 (PANS-AER)',
      article: 'Partie I, Chapitre 3',
      title: 'Surveillance de la conformité',
      text: 'L\'autorité de surveillance doit vérifier périodiquement la conformité réglementaire de chaque aérodrome certifié.',
      domain: 'CONFORMITE',
    },
  ],
  'c4': [
    {
      regulation: 'Doc 9981 (PANS-AER)',
      article: 'Partie II, Chapitre 6',
      title: 'Gestion des charges critiques',
      text: 'Une accumulation d\'écarts non résolus constitue un indicateur de charge critique nécessitant une action de l\'autorité.',
      domain: 'SECURITE',
    },
  ],
  'c5': [
    {
      regulation: 'Doc 9859 (SMS)',
      article: 'Chapitre 4',
      title: 'Résilience organisationnelle',
      text: 'La capacité d\'absorption et de reprise après un événement est un indicateur clé de maturité du SGS.',
      domain: 'SECURITE',
    },
    {
      regulation: 'Annexe 19',
      article: '§3.2',
      title: 'Culture de sécurité juste',
      text: 'L\'exploitant doit promouvoir une culture de sécurité qui encourage le signalement sans crainte de représailles.',
      domain: 'SECURITE',
    },
  ],
  'default': [
    {
      regulation: 'Doc 9981 (PANS-AER)',
      article: 'Partie I, Chapitre 1',
      title: 'Principes généraux',
      text: 'L\'autorité de surveillance doit fonder ses décisions sur une approche fondée sur les risques.',
      domain: 'CERTIFICATION',
    },
  ],
}

export function getRegulatoryRefs(domain: string): RegulatoryRef[] {
  const key = domain?.toLowerCase()?.replace(/\s+/g, '') || 'default'
  if (REFS[key]) return REFS[key]
  if (key.startsWith('c')) return REFS[key as keyof typeof REFS] || REFS['default']
  return REFS['default']
}

export function getRegulatoryRefByDim(dimKey: string): RegulatoryRef[] {
  return REFS[dimKey] || REFS['default']
}

export function formatRegulatoryRef(ref: RegulatoryRef): string {
  return `${ref.regulation}, ${ref.article} — ${ref.text}`
}
