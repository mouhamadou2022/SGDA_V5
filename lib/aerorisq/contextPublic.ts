// lib/aerorisq/contextPublic.ts
// Contexte factuel AERORISQ pour le portail "Invité" (consultation publique).
//
// Objectif : "grounder" l'IA sur les VRAIES données des modules métier
// (certification, homologation, surveillance, écarts, aérodromes) pour éviter
// toute hallucination. Les valeurs renvoyées sont TOUJOURS agrégées et
// anonymisées : aucun score interne, aucun nom d'aérodrome en situation
// critique, aucune donnée brute sensible.
//
// Exposé :
//  - PHASES_CERTIFICATION / PHASES_HOMOLOGATION : définitions réelles des phases
//  - chargerContextePublic()  : lit les tables via service-role et agrège
//  - formaterContexte(contexte): texte lisible à injecter dans un prompt
//  - fallbackChat(message, contexte) : réponse locale ancrée sur les données

export interface PhaseInfo {
  numero: number
  nom: string
  description: string
  delaiEstimeJours: number
}

export const PHASES_CERTIFICATION: PhaseInfo[] = [
  { numero: 1, nom: 'Expression d\u2019Intérêt', description: 'Dépôt de la demande initiale', delaiEstimeJours: 15 },
  { numero: 2, nom: 'Demande Formelle', description: 'Analyse du dossier technique', delaiEstimeJours: 30 },
  { numero: 3, nom: 'Vérification sur Site', description: 'Visite de vérification sur site', delaiEstimeJours: 45 },
  { numero: 4, nom: 'Délivrance du Certificat', description: 'Émission du certificat', delaiEstimeJours: 20 },
  { numero: 5, nom: 'Publication Statut', description: 'Publication officielle', delaiEstimeJours: 10 },
]

export const PHASES_HOMOLOGATION: PhaseInfo[] = [
  { numero: 1, nom: 'Demande Formelle', description: 'Instruction du dossier d\u2019homologation', delaiEstimeJours: 15 },
  { numero: 2, nom: 'Vérification sur Site', description: 'Visite de vérification terrain', delaiEstimeJours: 30 },
  { numero: 3, nom: 'Délivrance Décision', description: 'Décision d\u2019homologation', delaiEstimeJours: 20 },
]

export const TYPE_INSPECTIONS = [
  'périodique', 'inopinée', 'de maintien', 'certification', 'homologation',
  'suivi des écarts', 'mise en œuvre PAC', 'programmée', 'spéciale',
  'de surveillance', 'd\u2019événement', 'audit complet', 'd\u2019urgence',
]

export const STATUTS_CERTIFICATION = ['non_certifie', 'en_cours', 'certifie']
export const STATUTS_HOMOLOGATION = ['non_homologue', 'en_cours', 'homologue']
export const STATUTS_SURVEILLANCE = [
  'planifiee', 'en_cours', 'checklist_signee', 'ecarts_signes',
  'rapport_signe', 'lettre_signee', 'transmise', 'archivee',
]

export interface AerodromeInfo {
  nom?: string
  type?: string
  region?: string
}

export interface ContextePublic {
  aerodromes: AerodromeInfo[]
  totalAerodromes: number
  internationaux: number
  certifies: number
  certificationsEnCours: number
  homologues: number
  homologationsEnCours: number
  surveillances: {
    total: number
    parStatut: Record<string, number>
    parType: Record<string, number>
    anneeCourante: number
  }
  ecarts: {
    total: number
    ouverts: number
    parStatut: Record<string, number>
    parNiveau: Record<string, number>
  }
  generatedAt: string
}

interface ContexteBrut {
  aerodromes: AerodromeInfo[]
  certifications: Array<{ statut_global?: string }>
  homologations: Array<{ statut?: string }>
  surveillances: Array<{ type?: string; statut?: string; date_debut?: string; created_at?: string }>
  ecarts: Array<{ statut?: string; etat?: string; niveau_risque?: string }>
}

export async function chargerContextePublic(): Promise<ContextePublic> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const vide: ContextePublic = {
    aerodromes: [],
    totalAerodromes: 0,
    internationaux: 0,
    certifies: 0,
    certificationsEnCours: 0,
    homologues: 0,
    homologationsEnCours: 0,
    surveillances: { total: 0, parStatut: {}, parType: {}, anneeCourante: 0 },
    ecarts: { total: 0, ouverts: 0, parStatut: {}, parNiveau: {} },
    generatedAt: new Date().toISOString(),
  }

  if (!supabaseUrl || !serviceKey) return vide

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const [aerodromesRes, certificationsRes, homologationsRes, surveillancesRes, ecartsRes] = await Promise.all([
      supabaseAdmin.from('aerodromes').select('nom, type, region').is('deleted_at', null),
      supabaseAdmin.from('certifications').select('statut_global'),
      supabaseAdmin.from('homologations').select('statut'),
      supabaseAdmin.from('surveillances').select('type, statut, date_debut, created_at').is('deleted_at', null),
      supabaseAdmin.from('ecarts').select('statut, etat, niveau_risque'),
    ])

    const brut: ContexteBrut = {
      aerodromes: (aerodromesRes.data ?? []) as AerodromeInfo[],
      certifications: (certificationsRes.data ?? []) as ContexteBrut['certifications'],
      homologations: (homologationsRes.data ?? []) as ContexteBrut['homologations'],
      surveillances: (surveillancesRes.data ?? []) as ContexteBrut['surveillances'],
      ecarts: (ecartsRes.data ?? []) as ContexteBrut['ecarts'],
    }

    const anneeCourante = new Date().getFullYear()
    const compter = (items: Array<Record<string, unknown>>, cle: string): Record<string, number> => {
      const out: Record<string, number> = {}
      for (const item of items) {
        const v = item[cle]
        const k = typeof v === 'string' ? v : 'indetermine'
        out[k] = (out[k] ?? 0) + 1
      }
      return out
    }

    const surveillanceAnnee = brut.surveillances.filter((s) => {
      const d = new Date(s.date_debut || s.created_at || '')
      return !isNaN(d.getTime()) && d.getFullYear() === anneeCourante
    }).length

    const surveillancesParStatut = compter(brut.surveillances as unknown as Array<Record<string, unknown>>, 'statut')
    const surveillancesParType = compter(brut.surveillances as unknown as Array<Record<string, unknown>>, 'type')
    const ecartsParStatut = compter(brut.ecarts as unknown as Array<Record<string, unknown>>, 'statut')
    const ecartsParNiveau = compter(brut.ecarts as unknown as Array<Record<string, unknown>>, 'niveau_risque')

    return {
      aerodromes: brut.aerodromes,
      totalAerodromes: brut.aerodromes.length,
      internationaux: brut.aerodromes.filter((a) => a.type === 'international').length,
      certifies: brut.certifications.filter((c) => c.statut_global === 'certifie').length,
      certificationsEnCours: brut.certifications.filter((c) =>
        ['en_cours', 'phase1', 'phase2', 'phase3', 'phase4', 'phase5'].includes(c.statut_global ?? '')
      ).length,
      homologues: brut.homologations.filter((h) => ['active', 'validee', 'homologue'].includes(h.statut ?? '')).length,
      homologationsEnCours: brut.homologations.filter((h) => ['en_cours', 'phase1', 'phase2', 'phase3'].includes(h.statut ?? '')).length,
      surveillances: {
        total: brut.surveillances.length,
        parStatut: surveillancesParStatut,
        parType: surveillancesParType,
        anneeCourante: surveillanceAnnee,
      },
      ecarts: {
        total: brut.ecarts.length,
        ouverts: brut.ecarts.filter((e) => e.statut === 'ouvert' || e.etat === 'ouvert').length,
        parStatut: ecartsParStatut,
        parNiveau: ecartsParNiveau,
      },
      generatedAt: new Date().toISOString(),
    }
  } catch (err) {
    console.error('[aerorisq/contextPublic] Erreur de chargement:', err)
    return vide
  }
}

export function formaterContextePublic(ctx: ContextePublic): string {
  const lignes: string[] = []

  lignes.push(`Réseau : ${ctx.totalAerodromes} aérodrome(s) dont ${ctx.internationaux} international(aux).`)
  if (ctx.certifies > 0 || ctx.certificationsEnCours > 0) {
    lignes.push(`Certification : ${ctx.certifies} certifié(s), ${ctx.certificationsEnCours} processus en cours.`)
  }
  if (ctx.homologues > 0 || ctx.homologationsEnCours > 0) {
    lignes.push(`Homologation : ${ctx.homologues} homologué(s), ${ctx.homologationsEnCours} processus en cours.`)
  }
  if (ctx.surveillances.total > 0) {
    lignes.push(`Surveillance : ${ctx.surveillances.total} opération(s) enregistrée(s), dont ${ctx.surveillances.anneeCourante} cette année.`)
  }
  if (ctx.ecarts.total > 0) {
    lignes.push(`Écarts : ${ctx.ecarts.total} écart(s) au total, ${ctx.ecarts.ouverts} encore ouvert(s).`)
  }

  lignes.push('')
  lignes.push('Processus de certification (5 phases) : ' + PHASES_CERTIFICATION.map((p) => p.nom).join(' → ') + '.')
  lignes.push('Processus d\u2019homologation (3 phases) : ' + PHASES_HOMOLOGATION.map((p) => p.nom).join(' → ') + '.')
  lignes.push('Types de surveillance pratiqués : ' + TYPE_INSPECTIONS.join(', ') + '.')

  return lignes.join('\n')
}

export function fallbackChat(message: string, ctx: ContextePublic | null = null): string {
  const m = message.toLowerCase()

  if (m.includes('différence') && m.includes('homolog')) {
    const cert = PHASES_CERTIFICATION.map((p) => `${p.numero}. ${p.nom}`).join(' → ')
    const homo = PHASES_HOMOLOGATION.map((p) => `${p.numero}. ${p.nom}`).join(' → ')
    return `La certification et l\u2019homologation sont deux reconnaissances officielles de conformité aux normes OACI, mais elles diffèrent par leur portée et leur déroulement. La certification (${ctx && ctx.certifies > 0 ? `${ctx.certifies} aérodrome(s) certifié(s) actuellement` : 'reconnaissance complète de l\u2019aérodrome'} ) compte 5 phases : ${cert}. L\u2019homologation (${ctx && ctx.homologues > 0 ? `${ctx.homologues} aérodrome(s) homologué(s) actuellement` : 'reconnaissance d\u2019un aérodrome pour un usage défini'} ) est plus courte : 3 phases : ${homo}. En résumé, la certification valide la conformité générale d\u2019un aérodrome ; l\u2019homologation valide son aptitude pour des opérations spécifiques.`
  }

  if (m.includes('certif')) {
    const phases = PHASES_CERTIFICATION.map((p) => `${p.numero}. ${p.nom} (${p.description})`).join(' ; ')
    const etat = ctx && (ctx.certifies > 0 || ctx.certificationsEnCours > 0)
      ? `Actuellement, ${ctx.certifies} aérodrome(s) sont certifié(s) et ${ctx.certificationsEnCours} processus de certification sont en cours. `
      : ''
    return `La certification d\u2019un aérodrome reconnaît officiellement sa conformité aux normes OACI (Annexe 14). Le processus de l\u2019ANACIM compte 5 phases : ${phases}. ${etat}L\u2019ANACIM accompagne les exploitants à chaque étape, avec des délais et des documents attendus précis.`
  }

  if (m.includes('homolog')) {
    const phases = PHASES_HOMOLOGATION.map((p) => `${p.numero}. ${p.nom} (${p.description})`).join(' ; ')
    const etat = ctx && (ctx.homologues > 0 || ctx.homologationsEnCours > 0)
      ? `Actuellement, ${ctx.homologues} aérodrome(s) sont homologué(s) et ${ctx.homologationsEnCours} processus d\u2019homologation sont en cours. `
      : ''
    return `L\u2019homologation d\u2019un aérodrome est le processus par lequel l\u2019ANACIM reconnaît qu\u2019un aérodrome répond aux exigences de sécurité pour ses opérations. Contrairement à la certification (5 phases), l\u2019homologation compte 3 phases : ${phases}. ${etat}Le statut final est une décision officielle d\u2019homologation.`
  }

  if (m.includes('surveillance') || m.includes('supervis') || m.includes('contrôle') || m.includes('inopin')) {
    const types = TYPE_INSPECTIONS.join(', ')
    const etat = ctx && ctx.surveillances.total > 0
      ? `Le système a enregistré ${ctx.surveillances.total} opération(s) de surveillance au total, dont ${ctx.surveillances.anneeCourante} cette année. `
      : ''
    return `L\u2019ANACIM exerce une surveillance continue des aérodromes. Les types de surveillance pratiqués incluent : ${types}. Chaque opération vérifie la conformité via des checklists, et les écarts constatés font l\u2019objet de plans d\u2019actions correctives (PAC) suivis dans le temps. ${etat}La fréquence et le type de surveillance dépendent du profil de risque de l\u2019aérodrome.`
  }

  if (m.includes('écart') || m.includes('ecart') || m.includes('non-conformité') || m.includes('pac')) {
    const etat = ctx && ctx.ecarts.total > 0
      ? `Actuellement, ${ctx.ecarts.total} écart(s) sont référencés dans le système, dont ${ctx.ecarts.ouverts} encore ouvert(s). `
      : ''
    return `Un écart est un manquement constaté lors d\u2019une surveillance (checklist) à une exigence de sécurité ou de réglementation. Chaque écart est évalué selon sa criticité, un délai de traitement est fixé, et un plan d\u2019actions correctives (PAC) doit être soumis par l\u2019exploitant puis évalué par l\u2019ANACIM jusqu\u2019à la levée complète de l\u2019écart. ${etat}`
  }

  if (m.includes('risque') || m.includes('sécurit') || m.includes('aérorisq') || m.includes('aerorisq')) {
    return 'AERORISQ est l\u2019intelligence artificielle de l\u2019ANACIM : elle analyse les profils de risque des aérodromes (maturité SGS, conformité, charge critique, résilience), détecte les tendances et aide les décideurs à prioriser la supervision là où le risque est le plus élevé — c\u2019est la démarche fondée sur le risque.'
  }

  if (m.includes('sgda') || m.includes('application') || m.includes('plateforme')) {
    return 'SGDA (Système de Gestion des Aérodromes) est la plateforme de l\u2019ANACIM qui centralise la supervision : planification des surveillances, checklists terrain, gestion des écarts, profils de risque et rapports. AERORISQ enrichit SGDA avec des analyses IA et des synthèses en langage clair.'
  }

  return 'Je suis AERORISQ, l\u2019assistant de l\u2019ANACIM. Je peux vous renseigner sur la supervision des aérodromes du Sénégal, le processus de certification et d\u2019homologation, la surveillance continue, et l\u2019analyse de risque. Posez-moi votre question, ou essayez les suggestions rapides ci-dessous !'
}
