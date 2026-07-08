import type { Ecart } from '@/lib/store'
import { getDomaineLabel } from '@/lib/domaines'

export interface SousZone {
  nom: string
  motsCles: string[]
  poids: number
}

export interface AnalyseSousZone {
  domaine: string
  domaineLabel: string
  sousZones: Array<{
    nom: string
    nbEcarts: number
    ecartsCritiques: number
    sousZonesFilles?: Array<{ nom: string; nbEcarts: number }>
  }>
  priorite: 'critique' | 'haute' | 'moyenne' | 'basse'
}

const SOUS_ZONES_PAR_DOMAINE: Record<string, { nom: string; motsCles: string[]; sousZones?: { nom: string; motsCles: string[] }[] }[]> = {
  PHY: [
    { nom: 'Piste', motsCles: ['piste', 'runway', 'chaussée', 'revêtement', 'bande', 'strip', 'résistance', 'portance', 'friction', 'drainage', 'déclivité', 'pente', 'accotement', 'shoulder'],
      sousZones: [
        { nom: 'Géométrie', motsCles: ['largeur', 'pente', 'distance', 'dimension', 'longueur'] },
        { nom: 'État de surface', motsCles: ['friction', 'revêtement', 'drainage', 'nid de poule', 'fissure', 'dégradation'] },
        { nom: 'Bande de piste', motsCles: ['strip', 'dégagement', 'résistance', 'portance'] },
      ] },
    { nom: 'Voies de circulation', motsCles: ['voie de circulation', 'taxiway', 'circulation', 'accès'],
      sousZones: [
        { nom: 'Marquage', motsCles: ['marquage', 'signalisation', 'panneau'] },
        { nom: 'Dégagements', motsCles: ['dégagement', 'distance', 'séparation'] },
      ] },
    { nom: 'Aires de trafic', motsCles: ['aire de trafic', 'parking', 'stationnement', 'fret', 'tarmac'],
      sousZones: [
        { nom: 'Marquage', motsCles: ['marquage', 'signalisation', 'ligne'] },
        { nom: 'Résistance', motsCles: ['résistance', 'portance', 'PCN', 'charge'] },
      ] },
    { nom: 'Aides visuelles', motsCles: ['balisage', 'balise', 'feu', 'PAPI', 'approach', 'seuil', 'feux', 'lumière', 'éclairage'] },
  ],
  SGS: [
    { nom: 'Documentation', motsCles: ['manuel', 'documentation', 'politique', 'procédure', 'procedure', 'policy'] },
    { nom: 'Gestion des risques', motsCles: ['risque', 'danger', 'risk', 'assessment', 'évaluation', 'safety'] },
    { nom: 'Reporting', motsCles: ['reporting', 'compte rendu', 'occurrence', 'notification', 'incident'] },
    { nom: 'Audit interne', motsCles: ['audit', 'inspection', 'vérification', 'verification', 'review'] },
  ],
  SLI: [
    { nom: 'Véhicules SSLIA', motsCles: ['véhicule', 'vehicle', 'camion', 'truck', 'SSLIA', 'RFFS', 'incendie', 'fire'],
      sousZones: [
        { nom: 'Temps d\'intervention', motsCles: ['temps', 'intervention', 'response', 'délai', 'delay'] },
        { nom: 'Équipements', motsCles: ['extincteur', 'extinguisher', 'mousse', 'foam', 'lance', 'canon'] },
      ] },
    { nom: 'Personnel SSLIA', motsCles: ['personnel', 'pompier', 'firefighter', 'équipe', 'team', 'formation'],
      sousZones: [
        { nom: 'Formation', motsCles: ['formation', 'training', 'entraînement', 'drill', 'exercice'] },
        { nom: 'Habilitation', motsCles: ['habilitation', 'certification', 'qualification', 'permis'] },
      ] },
    { nom: 'Infrastructure', motsCles: ['local', 'station', 'garage', 'bâtiment', 'building', 'réserve', 'stockage'] },
  ],
  OLS: [
    { nom: 'Surfaces de dégagement', motsCles: ['surface', 'dégagement', 'degagement', 'cône', 'cone', 'approche', 'transition'] },
    { nom: 'Obstacles', motsCles: ['obstacle', 'hauteur', 'height', 'bâtiment', 'building', 'antenne', 'crane', 'grue'] },
    { nom: 'Marquage des obstacles', motsCles: ['marquage', 'balisage', 'obstacle', 'feu', 'light', 'signalisation'] },
  ],
  RA: [
    { nom: 'Faune', motsCles: ['faune', 'fauna', 'oiseau', 'bird', 'animal', 'mammifère', 'troupeau', 'herd'] },
    { nom: 'Prévention', motsCles: ['prévention', 'prevention', 'effarouchement', 'chasse', 'hunt', 'contrôle', 'control', 'barrière', 'fence', 'clôture'] },
    { nom: 'Gestion des risques', motsCles: ['risque', 'risk', 'danger', 'fray', 'strike', 'collision', 'atténuation', 'mitigation'] },
  ],
  ELEC: [
    { nom: 'Balisage lumineux', motsCles: ['balisage', 'lumière', 'light', 'feu', 'PAPI', 'phare', 'beacon', 'aéronautique', 'aeronautical'],
      sousZones: [
        { nom: 'Alimentation', motsCles: ['alimentation', 'power', 'câble', 'cable', 'générateur', 'generator', 'électricité'] },
        { nom: 'Intensité', motsCles: ['intensité', 'intensity', 'puissance', 'power', 'réglage', 'setting'] },
      ] },
    { nom: 'Réseau électrique', motsCles: ['réseau', 'network', 'câble', 'cable', 'distribution', 'transformateur', 'tableau'] },
    { nom: 'Groupe électrogène', motsCles: ['groupe', 'generator', 'génératrice', 'genset', 'secours', 'backup', 'urgence'] },
  ],
  MFP: [
    { nom: 'Marquage au sol', motsCles: ['marquage', 'marking', 'ligne', 'line', 'peinture', 'paint', 'signalisation'] },
    { nom: 'Panneaux', motsCles: ['panneau', 'sign', 'signal', 'indicateur', 'indicator'] },
    { nom: 'Feux', motsCles: ['feu', 'light', 'balise', 'beacon', 'obstacle', 'manche à air', 'wind cone'] },
  ],
  COP: [
    { nom: 'Formation', motsCles: ['formation', 'training', 'qualification', 'compétence', 'competence', 'habilitation'] },
    { nom: 'Personnel', motsCles: ['personnel', 'staff', 'équipe', 'team', 'effectif', 'poste'] },
  ],
  OPS: [
    { nom: 'Procédures', motsCles: ['procédure', 'procedure', 'processus', 'process', 'instruction', 'manuel', 'manual'] },
    { nom: 'Coordination', motsCles: ['coordination', 'communication', 'coopération', 'cooperation', 'concertation'] },
    { nom: 'Gestion des vols', motsCles: ['vol', 'flight', 'décollage', 'take-off', 'atterrissage', 'landing', 'approche', 'départ', 'departure'] },
  ],
}

export function analyserSousZones(domaine: string, ecarts: Ecart[]): AnalyseSousZone {
  const sousZones = SOUS_ZONES_PAR_DOMAINE[domaine] || []
  const ecartsDomaine = ecarts.filter(e => e.domaine === domaine && e.statut !== 'cloture' && e.statut !== 'preuves_evaluees')
  const total = ecartsDomaine.length

  const resultats = sousZones.map(sz => {
    const motsCles = sz.motsCles.map(m => m.toLowerCase())
    const ecartsZone = ecartsDomaine.filter(e => {
      const libelle = (e.libelle || '').toLowerCase()
      const ref = (e.reference || '').toLowerCase()
      return motsCles.some(mc => libelle.includes(mc) || ref.includes(mc))
    })
    const critiques = ecartsZone.filter(e => e.niveau_risque === 'critique').length

    let sousZonesFilles: { nom: string; nbEcarts: number }[] | undefined
    if (sz.sousZones) {
      sousZonesFilles = sz.sousZones.map(szf => {
        const motsFilles = szf.motsCles.map(m => m.toLowerCase())
        const nb = ecartsDomaine.filter(e => {
          const libelle = (e.libelle || '').toLowerCase()
          return motsFilles.some(mc => libelle.includes(mc))
        }).length
        return { nom: szf.nom, nbEcarts: nb }
      }).filter(s => s.nbEcarts > 0)
    }

    return {
      nom: sz.nom,
      nbEcarts: ecartsZone.length,
      ecartsCritiques: critiques,
      ...(sousZonesFilles && sousZonesFilles.length > 0 ? { sousZonesFilles } : {}),
    }
  }).filter(s => s.nbEcarts > 0 || s.ecartsCritiques > 0)

  const nbCritiques = resultats.reduce((s, r) => s + r.ecartsCritiques, 0)
  const priorite: AnalyseSousZone['priorite'] = total === 0 ? 'basse' : nbCritiques >= 2 || total >= 5 ? 'critique' : nbCritiques >= 1 || total >= 3 ? 'haute' : total >= 1 ? 'moyenne' : 'basse'

  return {
    domaine,
    domaineLabel: getDomaineLabel(domaine),
    sousZones: resultats.length > 0 ? resultats : [{ nom: 'Général', nbEcarts: total, ecartsCritiques: ecartsDomaine.filter(e => e.niveau_risque === 'critique').length }],
    priorite,
  }
}

export function analyserTousDomaines(ecarts: Ecart[]): AnalyseSousZone[] {
  const domaines = [...new Set(ecarts.filter(e => e.statut !== 'cloture' && e.statut !== 'preuves_evaluees').map(e => e.domaine))]
  return domaines.map(d => analyserSousZones(d, ecarts)).filter(a => a.sousZones.length > 0)
}
