// lib/ia/pilote/outils.ts
// Registre d'outils du pilote AERORISQ : l'IA locale AGIT sur l'application
// via des outils déclarés (function-calling Ollama), au lieu de seulement répondre.
// - Outils LECTURE (sans confirmation) : profil de risque, écarts, état site, réglementation.
// - Outils ÉCRITURE (confirmation humaine OBLIGATOIRE côté UI) : proposer une
//   surveillance (brouillon est_proposition — jamais d'action destructive directe).

'use client'

import { useAppStore } from '@/lib/store'
import { getSgsMaturiteLabel } from '@/lib/utils'
import { normalizePlanningType } from '@/lib/planning'

export interface ContexteOutils {
  userId?: string
}

export interface OutilPilote {
  nom: string
  description: string
  /** Vrai = exécution soumise à confirmation explicite de l'utilisateur. */
  ecriture: boolean
  parametres: Record<string, unknown>
  requis?: string[]
  executer: (args: Record<string, unknown>, ctx: ContexteOutils) => Promise<string>
}

function trouverAerodrome(codeOuNom: string) {
  const etat = useAppStore.getState()
  const cle = (codeOuNom || '').trim().toLowerCase()
  return (etat.aerodromes || []).find(a =>
    a.code_oaci?.toLowerCase() === cle || a.nom?.toLowerCase().includes(cle),
  )
}

const OUTILS: OutilPilote[] = [
  {
    nom: 'consulter_profil_risque',
    description: "Donne le profil de risque actuel d'un aérodrome : score, niveau, critères C1-C5, maturité SGS, prédictions 3 et 6 mois avec intervalles.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI (ex. GOOY) ou nom de l'aérodrome" },
      },
    },
    requis: ['site'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const p = etat.profilsRisque?.[aero.id]
      if (!p) return JSON.stringify({ site: aero.code_oaci, profil: null, note: 'Pas de profil calculé.' })
      const critiques = (etat.ecarts || []).filter(e =>
        e.aerodrome_id === aero.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length
      return JSON.stringify({
        site: aero.code_oaci, nom: aero.nom,
        score: Math.round(p.score_global), niveau: p.niveau, tendance: p.tendance,
        criteres: { C1: Math.round(p.c1), C2: Math.round(p.c2), C3: Math.round(p.c3), C4: Math.round(p.c4), C5: Math.round(p.c5) },
        maturite_sgs: aero.statut_sgs === 'non_applicable' ? 'non applicable' : getSgsMaturiteLabel(p.c1),
        prediction_3m: Math.round(p.prediction_3m),
        intervalle_3m: p.prediction_interval_3m ? [Math.round(p.prediction_interval_3m.lower), Math.round(p.prediction_interval_3m.upper)] : null,
        prediction_6m: Math.round(p.prediction_6m),
        intervalle_6m: p.prediction_interval_6m ? [Math.round(p.prediction_interval_6m.lower), Math.round(p.prediction_interval_6m.upper)] : null,
        ecarts_critiques_ouverts: critiques,
      })
    },
  },
  {
    nom: 'lister_ecarts',
    description: 'Liste les écarts non clôturés, pour un site ou tout le réseau, triés par gravité.',
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom (optionnel : tout le réseau si absent)" },
        gravite: { type: 'string', description: 'Filtre : critique, eleve, moyen, faible (optionnel)' },
        limite: { type: 'number', description: 'Nombre max (défaut 10, max 20)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      const gravite = String(args.gravite || '').toLowerCase()
      let liste = (etat.ecarts || []).filter(e => e.statut !== 'cloture')
      if (args.site) {
        const aero = trouverAerodrome(String(args.site))
        if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
        liste = liste.filter(e => e.aerodrome_id === aero.id)
      }
      if (gravite) liste = liste.filter(e => (e.niveau_risque || '').toLowerCase() === gravite)
      const ordre = (n: string) => ({ critique: 0, eleve: 1, moyen: 2, faible: 3 }[n] ?? 4)
      const limite = Math.min(20, Math.max(1, Number(args.limite) || 10))
      const items = liste
        .sort((a, b) => ordre(a.niveau_risque || '') - ordre(b.niveau_risque || ''))
        .slice(0, limite)
        .map(e => {
          const aero = (etat.aerodromes || []).find(a => a.id === e.aerodrome_id)
          return {
            site: aero?.code_oaci || e.aerodrome_id,
            titre: e.libelle || e.reference || '(sans titre)',
            gravite: e.niveau_risque, statut: e.statut,
          }
        })
      return JSON.stringify({ total_ouverts: liste.length, affiches: items })
    },
  },
  {
    nom: 'etat_site',
    description: "État de conformité d'un site : certification, homologation, expirations, dernière et prochaine surveillance.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI (ex. GOOY) ou nom de l'aérodrome" },
      },
    },
    requis: ['site'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const cert = (etat.certifications || []).find(c => c.aerodrome_id === aero.id)
      const homo = (etat.homologations || []).find(h => h.aerodrome_id === aero.id)
      const faites = (etat.surveillances || [])
        .filter(s => s.aerodrome_id === aero.id && ['transmise', 'archivee'].includes(s.statut))
        .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())
      const aVenir = (etat.surveillances || [])
        .filter(s => s.aerodrome_id === aero.id && s.statut === 'planifiee')
        .sort((a, b) => new Date(a.date_debut || '-').getTime() - new Date(b.date_debut || '-').getTime())
      const planPrep = (etat.plannings || [])
        .filter(p => p.aerodrome_id === aero.id && p.statut === 'planifiee' && !p.est_proposition)
        .sort((a, b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime())
      return JSON.stringify({
        site: aero.code_oaci, nom: aero.nom,
        certification: cert ? { statut: cert.statut_global, expiration: cert.date_expiration || null } : null,
        homologation: homo ? { statut: homo.statut_global, expiration: homo.date_expiration || null } : null,
        derniere_surveillance: faites[0]?.date_debut || null,
        prochaine_surveillance: aVenir[0]?.date_debut || planPrep[0]?.date_debut || null,
      })
    },
  },
  {
    nom: 'rechercher_reglementaire',
    description: 'Cherche dans le référentiel OACI / IATA / ANACIM (RAG du Kit Inspecteur).',
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        requete: { type: 'string', description: 'Question réglementaire' },
      },
    },
    requis: ['requete'],
    executer: async (args) => {
      const { construireContexteReglementaire } = await import('@/lib/ia/rag/reglementaireRagClient')
      const ctx = construireContexteReglementaire({
        requete: String(args.requete || ''),
        domaines: [], type_entite: 'aerodrome', maxChars: 3000,
      })
      return JSON.stringify({ extraits: ctx ? ctx.slice(0, 3000) : '(aucun extrait pertinent)' })
    },
  },
  {
    nom: 'proposer_surveillance',
    description: "PROPOSE (brouillon à valider par un humain, jamais d'action directe) une surveillance : site, type, date de début, portée (domaines), motif. À utiliser quand l'utilisateur demande de planifier.",
    ecriture: true,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI (ex. GOOY) ou nom de l'aérodrome" },
        type: { type: 'string', description: 'Type : periodique, inopine, certification, homologation, suivi_ecarts, mise_oeuvre_pac' },
        date_debut: { type: 'string', description: 'Date de début AAAA-MM-JJ' },
        portee: { type: 'string', description: 'Domaines séparés par des virgules (ex. SGS,PHY) — AGA par défaut' },
        motif: { type: 'string', description: 'Pourquoi cette surveillance (sera la justification)' },
      },
    },
    requis: ['site', 'date_debut'],
    executer: async (args, ctx) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const date = String(args.date_debut || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return JSON.stringify({ erreur: `Date « ${date} » invalide — format AAAA-MM-JJ requis.` })
      }
      const portee = String(args.portee || 'AGA').split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      const planning = {
        id: crypto.randomUUID(),
        aerodrome_id: aero.id,
        type: normalizePlanningType(String(args.type || 'periodique')),
        date_debut: date,
        date_fin: date,
        portee: portee.length > 0 ? portee : ['AGA'],
        equipe_ids: [],
        chef_id: undefined,
        statut: 'planifiee',
        priorite: 'moyenne',
        declencheur: 'manuel',
        objectifs: String(args.motif || 'Proposition AERORISQ — à valider.'),
        observations: 'Proposition créée par le pilote AERORISQ — en attente de validation humaine.',
        est_proposition: true,
        annee_cible: new Date(date).getFullYear(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await etat.addPlanning(planning as never)
      return JSON.stringify({
        proposition_creee: true,
        site: aero.code_oaci, type: planning.type, date_debut: date,
        note: 'Brouillon enregistré — à valider dans le module Planning.',
      })
    },
  },
  {
    nom: 'resumer_activite',
    description: "Digest d'un site pour décider vite : profil, écarts ouverts par gravité, PAC en retard, dernières surveillances, événements récents graves.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI (ex. GOOY) ou nom de l'aérodrome" },
      },
    },
    requis: ['site'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const p = etat.profilsRisque?.[aero.id]
      const ouverts = (etat.ecarts || []).filter(e => e.aerodrome_id === aero.id && e.statut !== 'cloture')
      const parGravite: Record<string, number> = {}
      for (const e of ouverts) parGravite[e.niveau_risque || '?'] = (parGravite[e.niveau_risque || '?'] || 0) + 1
      const maintenant = Date.now()
      const pacRetard = ouverts.filter(e => {
        if (!e.delai_regularisation) return false
        return new Date(e.delai_regularisation).getTime() < maintenant
      }).length
      const surv = (etat.surveillances || [])
        .filter(s => s.aerodrome_id === aero.id)
        .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())
        .slice(0, 3)
        .map(s => ({ type: s.type, statut: s.statut, date: s.date_debut, score: s.score_global ?? null }))
      const events = (etat.evenements || []).filter(e =>
        e.aerodrome_id === aero.id &&
        ['critique', 'eleve'].includes((e.gravite || '').toLowerCase()) &&
        e.date && (maintenant - new Date(e.date).getTime()) / 86400000 <= 90).length
      return JSON.stringify({
        site: aero.code_oaci, nom: aero.nom,
        score: p != null ? Math.round(p.score_global) : null,
        niveau: p?.niveau ?? null,
        ecarts_ouverts: ouverts.length, par_gravite: parGravite, pac_en_retard: pacRetard,
        dernieres_surveillances: surv,
        evenements_graves_90j: events,
      })
    },
  },
  {
    nom: 'comparer_sites',
    description: 'Compare 2 à 4 sites : score, niveau, maturité SGS, écarts critiques ouverts, PAC en retard, dernière surveillance.',
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        sites: { type: 'string', description: "Codes OACI séparés par des virgules (ex. GOOY,GOBD)" },
      },
    },
    requis: ['sites'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const codes = String(args.sites || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 4)
      if (codes.length < 2) return JSON.stringify({ erreur: 'Indiquez au moins 2 sites à comparer.' })
      const lignes = []
      for (const code of codes) {
        const aero = trouverAerodrome(code)
        if (!aero) {
          lignes.push({ site: code, erreur: 'introuvable' })
          continue
        }
        const p = etat.profilsRisque?.[aero.id]
        const ouverts = (etat.ecarts || []).filter(e => e.aerodrome_id === aero.id && e.statut !== 'cloture')
        const critiques = ouverts.filter(e => e.niveau_risque === 'critique').length
        const maintenant = Date.now()
        const pacRetard = ouverts.filter(e => e.delai_regularisation && new Date(e.delai_regularisation).getTime() < maintenant).length
        const derniere = (etat.surveillances || [])
          .filter(s => s.aerodrome_id === aero.id && ['transmise', 'archivee'].includes(s.statut))
          .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())[0]
        lignes.push({
          site: aero.code_oaci, nom: aero.nom,
          score: p != null ? Math.round(p.score_global) : null,
          niveau: p?.niveau ?? null,
          maturite_sgs: !p || aero.statut_sgs === 'non_applicable' ? null : getSgsMaturiteLabel(p.c1),
          ecarts_critiques: critiques, pac_en_retard: pacRetard,
          derniere_surveillance: derniere?.date_debut || null,
        })
      }
      return JSON.stringify({ comparaison: lignes })
    },
  },
  {
    nom: 'recalculer_profil_risque',
    description: "Recalcule le profil de risque d'un site depuis les données actuelles (écarts, surveillances, événements). Idempotent et sans danger.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI (ex. GOOY) ou nom de l'aérodrome" },
      },
    },
    requis: ['site'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      await etat.recalculerProfilRisque(aero.id)
      const p = useAppStore.getState().profilsRisque?.[aero.id]
      if (!p) return JSON.stringify({ site: aero.code_oaci, erreur: 'Recalcul impossible.' })
      return JSON.stringify({
        site: aero.code_oaci,
        score: Math.round(p.score_global), niveau: p.niveau, tendance: p.tendance,
        note: 'Profil recalculé depuis les données actuelles.',
      })
    },
  },
  {
    nom: 'suivi_surveillances',
    description: 'Liste les surveillances (planifiées, en cours, récentes) pour un site ou tout le réseau.',
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom (optionnel : tout le réseau)" },
        statut: { type: 'string', description: 'Filtre : planifiee, en_cours, transmise (optionnel)' },
        limite: { type: 'number', description: 'Nombre max (défaut 10, max 20)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      let liste = [...(etat.surveillances || [])]
      if (args.site) {
        const aero = trouverAerodrome(String(args.site))
        if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
        liste = liste.filter(s => s.aerodrome_id === aero.id)
      }
      if (args.statut) liste = liste.filter(s => s.statut === String(args.statut))
      const limite = Math.min(20, Math.max(1, Number(args.limite) || 10))
      const items = liste
        .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())
        .slice(0, limite)
        .map(s => {
          const aero = (etat.aerodromes || []).find(a => a.id === s.aerodrome_id)
          return {
            site: aero?.code_oaci || s.aerodrome_id,
            type: s.type, statut: s.statut, date: s.date_debut,
            score: s.score_global ?? null,
          }
        })
      return JSON.stringify({ total: liste.length, affichees: items })
    },
  },
  {
    nom: 'creer_ecart',
    description: "CRÉE un écart au statut ouvert (brouillon de terrain, à instruire ensuite) : site, domaine, libellé, niveau de risque. Référence et délais calculés automatiquement.",
    ecriture: true,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI (ex. GOOY) ou nom de l'aérodrome" },
        domaine: { type: 'string', description: 'Domaine : SGS, PHY, OLS, OPS, COP, ELEC, MFP, SLI, RA' },
        libelle: { type: 'string', description: "Libellé précis de l'écart constaté" },
        niveau_risque: { type: 'string', description: 'critique, eleve, moyen ou faible' },
        reference_reglementaire: { type: 'string', description: 'Référence OACI/ANACIM (optionnel)' },
      },
    },
    requis: ['site', 'domaine', 'libelle', 'niveau_risque'],
    executer: async (args, ctx) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const domaine = String(args.domaine || '').toUpperCase()
      const domainesValides = ['SGS', 'PHY', 'OLS', 'OPS', 'COP', 'ELEC', 'MFP', 'SLI', 'RA']
      if (!domainesValides.includes(domaine)) {
        return JSON.stringify({ erreur: `Domaine « ${args.domaine} » invalide — ${domainesValides.join(', ')}.` })
      }
      const niveau = String(args.niveau_risque || '').toLowerCase()
      if (!['critique', 'eleve', 'moyen', 'faible'].includes(niveau)) {
        return JSON.stringify({ erreur: `Niveau « ${args.niveau_risque} » invalide — critique, eleve, moyen, faible.` })
      }
      const { plansActionsUtils } = await import('@/lib/plansActionsUtils')
      const annee = new Date().getFullYear()
      const compteur = (etat.ecarts || []).filter(e =>
        e.reference?.startsWith(`ECA-${annee}-`)).length + 1
      const delais = plansActionsUtils.getDelaisParDefaut(niveau)
      const dansNJours = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
      const ecart = {
        id: crypto.randomUUID(),
        aerodrome_id: aero.id,
        domaine,
        reference: plansActionsUtils.genererReference(annee, compteur),
        ref_reglementaire: String(args.reference_reglementaire || ''),
        libelle: String(args.libelle),
        niveau_risque: niveau,
        statut: 'ouvert',
        delai_pac: dansNJours(delais.pac),
        delai_regularisation: dansNJours(delais.regularisation),
        inspecteur_ref_id: ctx.userId || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await etat.addEcart(ecart as never)
      return JSON.stringify({
        ecart_cree: true,
        reference: ecart.reference, site: aero.code_oaci,
        note: 'Écart ouvert — à instruire dans le module Écarts.',
      })
    },
  },
]

export function listerOutils(): OutilPilote[] {
  return OUTILS
}

export function trouverOutil(nom: string): OutilPilote | undefined {
  return OUTILS.find(o => o.nom === nom)
}

/** Déclaration Ollama /api/chat pour un outil. */
export function declarerOutil(o: OutilPilote): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: o.nom,
      description: o.description,
      parameters: {
        type: 'object',
        properties: o.parametres.properties ?? o.parametres,
        required: o.requis ?? [],
      },
    },
  }
}
