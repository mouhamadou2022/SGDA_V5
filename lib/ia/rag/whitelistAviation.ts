// lib/ia/rag/whitelistAviation.ts
// Liste blanche des sites d'autorités / organismes d'aviation reconnus.
// La recherche web d'AERORISQ ne s'appuie QUE sur ces sources fiables,
// pour la conformité et la protection des données (aucun moteur général
// de confiance inconnue, aucune donnée envoyée à des sites tiers non reconnus).

export const AUTORITES_AVIATION: Record<string, string> = {
  'icao.int': 'OACI',
  'elibrary.icao.int': 'OACI Library',
  'store.icao.int': 'OACI Store',
  'easa.europa.eu': 'EASA',
  'faa.gov': 'FAA',
  'ecfr.gov': 'FAA — Code of Federal Regulations',
  'iata.org': 'IATA',
  'aci.aero': 'ACI World',
  'skybrary.aero': 'SKYbrary (reference aviation)',
  'ecologie.gouv.fr': 'DGAC France',
  'aip.enaire.fr': 'SIA DGAC France',
  'tc.canada.ca': 'Transport Canada',
  'anacim.sn': 'ANACIM (Sénégal)',
  'asecna.aero': 'ASECNA',
  'anac.cd': 'ANAC RDC',
  'anac-ci.org': 'ANAC Côte d\'Ivoire',
  'anac.gov.ng': 'ANAC Nigeria',
  'anac.ma': 'ANAC Maroc',
  'anac.tn': 'OACA Tunisie',
  'ecac-ceac.org': 'AFI/CAAF',
  'aviation.gov.au': 'CASA Australie',
}

/** Domaines racinaux reconnus pour la vérification d'un hôte. */
const DOMAINES_RACINE = Object.keys(AUTORITES_AVIATION)

function normaliserDomaine(hostname: string): string {
  return (hostname || '').toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '')
}

/** Vérifie qu'un hôte appartient bien à une autorité d'aviation reconnue. */
export function estAutoriteAviation(hostname: string): boolean {
  const h = normaliserDomaine(hostname)
  return DOMAINES_RACINE.some(d => h === d || h.endsWith(`.${d}`))
}

/** Retourne le libellé de l'autorité pour un hôte, ou null. */
export function autoritePourHostname(hostname: string): string | null {
  const h = normaliserDomaine(hostname)
  for (const d of DOMAINES_RACINE) {
    if (h === d || h.endsWith(`.${d}`)) return AUTORITES_AVIATION[d]
  }
  return null
}

export interface ResultatWebAutorite {
  titre: string
  url: string
  extrait: string
  source: string // nom de l'autorité
}
