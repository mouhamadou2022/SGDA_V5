// lib/ia/pilote/outils.ts
// Registre d'outils du pilote AERORISQ : l'IA locale AGIT sur l'application
// via des outils déclarés (function-calling Ollama), au lieu de seulement répondre.
// - Outils LECTURE (sans confirmation) : profil de risque, écarts, état site, réglementation.
// - Outils ÉCRITURE (confirmation humaine OBLIGATOIRE côté UI) : proposer une
//   surveillance (brouillon est_proposition — jamais d'action destructive directe).

'use client'

import { useAppStore, normaliserDomaineCompetence, normaliserNiveauCompetence } from '@/lib/store'
import { getSgsMaturiteLabel } from '@/lib/utils'
import { normalizePlanningType } from '@/lib/planning'
import { normaliserRecherche } from '@/lib/domaines'

export interface ContexteOutils {
  userId?: string
  /** Rôle de l'utilisateur demandeur — vérifié CÔTÉ OUTIL avant toute écriture. */
  userRole?: string
  /** Nom d'affichage (rédacteur des rapports générés). */
  userName?: string
}

/** Rôles autorisés à déclencher les outils d'écriture (lecture : tous les rôles connectés). */
export const ROLES_ECRITURE_IA = ['admin', 'inspector', 'dg_anacim']

/** Retourne un message d'erreur si le rôle du contexte n'autorise pas l'écriture, sinon null. */
function refuserSiRoleInsuffisant(ctx: ContexteOutils, outil: string): string | null {
  if (!ROLES_ECRITURE_IA.includes(ctx.userRole || '')) {
    return JSON.stringify({
      erreur: `Outil « ${outil} » réservé aux inspecteurs ANACIM (rôle « ${ctx.userRole || 'inconnu'} » non autorisé).`,
    })
  }
  return null
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
    description: "Profil de risque d'un site : score, niveau, C1-C5, maturité SGS, prédictions.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
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
    description: 'Écarts non clôturés (site ou réseau), triés par gravité.',
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom (optionnel)" },
        gravite: { type: 'string', description: 'critique, eleve, moyen, faible (optionnel)' },
        limite: { type: 'number', description: 'Max (défaut 10)' },
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
            reference: e.reference || null,
            titre: e.libelle || e.reference || '(sans titre)',
            gravite: e.niveau_risque, statut: e.statut,
          }
        })
      return JSON.stringify({ total_ouverts: liste.length, affiches: items })
    },
  },
  {
    nom: 'etat_site',
    description: "Conformité d'un site : certification, homologation, expirations, surveillances.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
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
    description: 'KIT RÉGLEMENTAIRE : dès que la demande cite un Doc, RAS, Annexe, § ou une exigence/conformité (ex. « Selon le RAS 14… », « Que dit le Doc 9859… », « Quel § impose… ? »), appelle CET outil UNE fois avec la question — jamais rechercher_web pour le réglementaire (le web est réservé aux publications externes à jour : AIP, SUP, actus). Retourne les extraits citables (§ exact).',
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
    description: "PROPOSE une surveillance (brouillon à valider, jamais d'action directe). Quand l'utilisateur demande de planifier.",
    ecriture: true,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
        type: { type: 'string', description: 'periodique, inopine, certification, homologation, suivi_ecarts, mise_oeuvre_pac' },
        date_debut: { type: 'string', description: 'AAAA-MM-JJ' },
        portee: { type: 'string', description: 'Domaines séparés par virgules (défaut AGA)' },
        motif: { type: 'string', description: 'Justification' },
      },
    },
    requis: ['site', 'date_debut'],
    executer: async (args, ctx) => {
      const refus = refuserSiRoleInsuffisant(ctx, 'proposer_surveillance')
      if (refus) return refus
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
    description: "Digest d'un site : profil, écarts par gravité, PAC en retard, surveillances, événements graves.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
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
    description: 'COMPARAISON : dès que la demande dit Compare/Comparer/comparaison de 2 à 4 sites (ex. "Compare GOBD et GOTT"), appelle CET outil UNE fois avec sites="GOBD,GOTT" — jamais de comparaison manuelle via etat_site/profil/rechercher_web. Retourne score, SGS, critiques ouverts, PAC en retard.',
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        sites: { type: 'string', description: "Codes OACI séparés par virgules" },
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
    description: "Recalcule le profil de risque d'un site. Sans danger.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
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
    description: 'Surveillances planifiées, en cours, récentes (site ou réseau).',
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom (optionnel)" },
        statut: { type: 'string', description: 'planifiee, en_cours, transmise (optionnel)' },
        limite: { type: 'number', description: 'Max (défaut 10)' },
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
    description: "CRÉE un écart ouvert (brouillon à instruire). Référence et délais auto.",
    ecriture: true,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
        domaine: { type: 'string', description: 'SGS, PHY, OLS, OPS, COP, ELEC, MFP, SLI, RA' },
        libelle: { type: 'string', description: "Constat précis" },
        niveau_risque: { type: 'string', description: 'critique, eleve, moyen, faible' },
        reference_reglementaire: { type: 'string', description: 'OACI/ANACIM (optionnel)' },
      },
    },
    requis: ['site', 'domaine', 'libelle', 'niveau_risque'],
    executer: async (args, ctx) => {
      const refus = refuserSiRoleInsuffisant(ctx, 'creer_ecart')
      if (refus) return refus
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
  {
    nom: 'etat_checklist',
    description: "Avancement checklists d'un site : items, SA/NS/NV/NA, conformité.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
        limite: { type: 'number', description: 'Max surveillances (défaut 5)' },
      },
    },
    requis: ['site'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const { flattenHierarchyItems } = await import('@/lib/store/checklistSlice')
      const limite = Math.min(10, Math.max(1, Number(args.limite) || 5))
      const survs = (etat.surveillances || [])
        .filter(s => s.aerodrome_id === aero.id && !['transmise', 'archivee'].includes(s.statut))
        .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())
        .slice(0, limite)
      const itemsParSurv: Record<string, Array<{ resultat?: string }>> = (etat.checklistItems || {}) as never
      const lignes = survs.map(s => {
        let items: Array<{ resultat?: string }> = itemsParSurv[s.id] || []
        if (items.length === 0 && (s as any).checklist_hierarchy) {
          items = flattenHierarchyItems((s as any).checklist_hierarchy) as never
        }
        const norm = (r?: string) => (r || '').toUpperCase()
        const compte = (v: string) => items.filter(i => norm(i.resultat) === v).length
        const renseignes = items.filter(i => ['SA', 'NS', 'NV', 'NA'].includes(norm(i.resultat))).length
        const sa = compte('SA')
        return {
          surveillance: s.id.slice(0, 8), type: (s as any).type, statut: s.statut, date: s.date_debut,
          items_total: items.length, items_renseignes: renseignes,
          SA: sa, NS: compte('NS'), NV: compte('NV'), NA: compte('NA'),
          taux_conformite: renseignes > 0 ? Math.round((sa / renseignes) * 100) : null,
        }
      })
      return JSON.stringify({ site: aero.code_oaci, surveillances_suivies: lignes })
    },
  },
  {
    nom: 'lister_evenements',
    description: 'Événements de sécurité récents (site ou réseau), avec gravité.',
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom (optionnel)" },
        gravite: { type: 'string', description: 'critique, eleve, moyen, faible (optionnel)' },
        jours: { type: 'number', description: 'Fenêtre jours (défaut 90)' },
        limite: { type: 'number', description: 'Max (défaut 10)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      const gravite = String(args.gravite || '').toLowerCase()
      const jours = Math.min(365, Math.max(1, Number(args.jours) || 90))
      const seuil = Date.now() - jours * 86400000
      let liste = [...(etat.evenements || [])].filter(e => e.date && new Date(e.date).getTime() >= seuil)
      if (args.site) {
        const aero = trouverAerodrome(String(args.site))
        if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
        liste = liste.filter(e => e.aerodrome_id === aero.id)
      }
      if (gravite) liste = liste.filter(e => (e.gravite || '').toLowerCase() === gravite)
      const limite = Math.min(20, Math.max(1, Number(args.limite) || 10))
      const items = liste
        .sort((a, b) => new Date(b.date || '-').getTime() - new Date(a.date || '-').getTime())
        .slice(0, limite)
        .map(e => {
          const aero = (etat.aerodromes || []).find(a => a.id === e.aerodrome_id)
          return {
            site: aero?.code_oaci || e.aerodrome_id,
            reference: (e as any).reference || e.id.slice(0, 8),
            type: e.type, gravite: e.gravite, statut: e.statut, date: e.date,
          }
        })
      return JSON.stringify({ total_periode: liste.length, fenetre_jours: jours, affiches: items })
    },
  },
  {
    nom: 'preparer_checklist',
    description: "PRÉPARE une checklist (brouillon à valider) : portée recommandée depuis écarts+profil. Puis page Préparation.",
    ecriture: true,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
        type: { type: 'string', description: 'periodique, inopine, certification, homologation, suivi_ecarts, mise_oeuvre_pac' },
        date_debut: { type: 'string', description: 'AAAA-MM-JJ' },
        motif: { type: 'string', description: 'Justification' },
      },
    },
    requis: ['site', 'date_debut'],
    executer: async (args, ctx) => {
      const refus = refuserSiRoleInsuffisant(ctx, 'preparer_checklist')
      if (refus) return refus
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const date = String(args.date_debut || '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return JSON.stringify({ erreur: `Date « ${date} » invalide — format AAAA-MM-JJ requis.` })
      }
      // Portée recommandée : top domaines par écarts ouverts + SGS si C1 faible et applicable.
      const ouverts = (etat.ecarts || []).filter(e => e.aerodrome_id === aero.id && e.statut !== 'cloture')
      const parDomaine: Record<string, number> = {}
      for (const e of ouverts) {
        const d = (e.domaine || '').toUpperCase()
        if (d) parDomaine[d] = (parDomaine[d] || 0) + 1
      }
      const topDomaines = Object.entries(parDomaine).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([d]) => d)
      const profil = (etat.profilsRisque || {})[aero.id]
      const sgsApplicable = aero.statut_sgs !== 'non_applicable' && (aero as any).type_entite !== 'helistation'
      if (sgsApplicable && profil && profil.c1 < 60 && !topDomaines.includes('SGS')) topDomaines.unshift('SGS')
      const portee = topDomaines.length > 0 ? topDomaines : ['AGA']
      const motif = String(args.motif || 'Préparation checklist proposée par AERORISQ — à valider.')
      const planning = {
        id: crypto.randomUUID(),
        aerodrome_id: aero.id,
        type: normalizePlanningType(String(args.type || 'periodique')),
        date_debut: date,
        date_fin: date,
        portee,
        equipe_ids: [],
        chef_id: undefined,
        statut: 'planifiee',
        priorite: 'moyenne',
        declencheur: 'manuel',
        objectifs: `${motif} Portée recommandée : ${portee.join(', ')} (${ouverts.length} écart(s) ouvert(s) analysé(s)).`,
        observations: 'Préparation proposée par le pilote AERORISQ — valider, désigner une équipe, puis générer la checklist depuis la page Préparation.',
        est_proposition: true,
        annee_cible: new Date(date).getFullYear(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      await etat.addPlanning(planning as never)
      return JSON.stringify({
        preparation_proposee: true,
        site: aero.code_oaci, type: planning.type, date_debut: date,
        portee_recommandee: portee,
        note: 'Brouillon enregistré — valider dans le module Planning, puis générer la checklist depuis la page Préparation.',
      })
    },
  },
  {
    nom: 'generer_rapport_pdf',
    description: "RAPPORT PDF / BRIEFING PDF : dès que la demande dit briefing/checklist/certification/homologation + PDF (ex. « Génère le briefing de GOBD en PDF »), appelle CET outil UNE fois avec type=\"briefing\" et site=\"GOBD\". GÉNÈRE et TÉLÉCHARGE un vrai rapport PDF ANACIM (données réelles).",
    ecriture: true,
    parametres: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'briefing, checklist (par site) | certification, homologation (national)' },
        site: { type: 'string', description: "Code OACI ou nom (requis briefing/checklist)" },
      },
    },
    requis: ['type'],
    executer: async (args, ctx) => {
      const refus = refuserSiRoleInsuffisant(ctx, 'generer_rapport_pdf')
      if (refus) return refus
      const etat = useAppStore.getState()
      const type = String(args.type || '').toLowerCase()
      const redacteur = ctx.userName || undefined
      if (type === 'certification') {
        const { genererRapportCertification } = await import('@/lib/services/exportCertification')
        const res = await genererRapportCertification()
        return JSON.stringify({ rapport_genere: true, fichier: res.fichier, synthese_aerorisq: res.syntheseAerorisq })
      }
      if (type === 'homologation') {
        const { genererRapportHomologation } = await import('@/lib/services/exportHomologation')
        const res = await genererRapportHomologation()
        return JSON.stringify({ rapport_genere: true, fichier: (res as any).fichier || 'Rapport_Homologations.pdf' })
      }
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site requis et introuvable pour un rapport « ${type} » — indiquez un code OACI.` })
      if (type === 'briefing') {
        const plannings = (etat.plannings || [])
          .filter(p => p.aerodrome_id === aero.id)
          .sort((a, b) => new Date(b.date_debut).getTime() - new Date(a.date_debut).getTime())
        const planning = plannings.find(p => p.statut === 'planifiee') || plannings[0]
        if (!planning) {
          return JSON.stringify({ erreur: `Aucun planning pour ${aero.code_oaci} — programmez d'abord une surveillance (proposer_surveillance), puis régénérez le briefing.` })
        }
        const { kitDocAgent } = await import('@/lib/ia/agents/kitDocAgent')
        const fiche = await kitDocAgent.genererFicheBriefing({ planningId: planning.id, aerodromeId: aero.id })
        const { exporterFicheBriefing } = await import('@/lib/services/ficheBriefingPDF')
        await exporterFicheBriefing({
          fiche,
          planning: {
            date_debut: planning.date_debut, date_fin: planning.date_fin,
            annee_cible: planning.annee_cible, priorite: planning.priorite,
            statut: planning.statut, declencheur: planning.declencheur,
          },
          aerodrome: { code_oaci: aero.code_oaci, nom: aero.nom },
          redacteur,
        })
        return JSON.stringify({ rapport_genere: true, site: aero.code_oaci, planning: planning.id.slice(0, 8), note: 'Fiche de briefing téléchargée (PDF).' })
      }
      if (type === 'checklist') {
        const surv = (etat.surveillances || [])
          .filter(s => s.aerodrome_id === aero.id && (s.checklist_hierarchy || []).length > 0)
          .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())[0]
        if (!surv) {
          return JSON.stringify({ erreur: `Aucune checklist disponible pour ${aero.code_oaci} (préparez d'abord une surveillance).` })
        }
        const { exportChecklistPDF } = await import('@/lib/services/exportChecklist')
        await exportChecklistPDF(surv.checklist_hierarchy as never[], {
          titre: `Checklist - ${aero.code_oaci}`,
          code: surv.id.slice(0, 12),
          portee: surv.portee || [],
        })
        return JSON.stringify({ rapport_genere: true, site: aero.code_oaci, surveillance: surv.id.slice(0, 8), note: 'Checklist téléchargée (PDF).' })
      }
      return JSON.stringify({ erreur: `Type « ${args.type} » inconnu — briefing, checklist, certification ou homologation.` })
    },
  },
  {
    nom: 'generer_rapport_word',
    description: "GÉNÈRE et TÉLÉCHARGE un vrai rapport Word ANACIM (données réelles).",
    ecriture: true,
    parametres: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'briefing, checklist (par site) | certification, homologation (national)' },
        site: { type: 'string', description: "Code OACI ou nom (requis briefing/checklist)" },
      },
    },
    requis: ['type'],
    executer: async (args, ctx) => {
      const refus = refuserSiRoleInsuffisant(ctx, 'generer_rapport_word')
      if (refus) return refus
      const etat = useAppStore.getState()
      const type = String(args.type || '').toLowerCase()
      const redacteur = ctx.userName || undefined
      if (type === 'certification') {
        const { genererRapportWordCertification } = await import('@/lib/services/rapportWord')
        const res = await genererRapportWordCertification()
        return JSON.stringify({ rapport_genere: true, format: 'word', fichier: res.fichier })
      }
      if (type === 'homologation') {
        const { genererRapportWordHomologation } = await import('@/lib/services/rapportWord')
        const res = await genererRapportWordHomologation()
        return JSON.stringify({ rapport_genere: true, format: 'word', fichier: res.fichier })
      }
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site requis et introuvable pour un rapport « ${type} » — indiquez un code OACI.` })
      if (type === 'briefing') {
        const plannings = (etat.plannings || [])
          .filter(p => p.aerodrome_id === aero.id)
          .sort((a, b) => new Date(b.date_debut).getTime() - new Date(a.date_debut).getTime())
        const planning = plannings.find(p => p.statut === 'planifiee') || plannings[0]
        if (!planning) {
          return JSON.stringify({ erreur: `Aucun planning pour ${aero.code_oaci} — programmez d'abord une surveillance (proposer_surveillance), puis régénérez le briefing.` })
        }
        const { kitDocAgent } = await import('@/lib/ia/agents/kitDocAgent')
        const fiche = await kitDocAgent.genererFicheBriefing({ planningId: planning.id, aerodromeId: aero.id })
        const { genererRapportWordBriefing } = await import('@/lib/services/rapportWord')
        const res = await genererRapportWordBriefing(fiche, {
          codeOaci: aero.code_oaci, nom: aero.nom, redacteur,
        })
        return JSON.stringify({ rapport_genere: true, format: 'word', site: aero.code_oaci, planning: planning.id.slice(0, 8), fichier: res.fichier, note: 'Fiche de briefing téléchargée (Word).' })
      }
      if (type === 'checklist') {
        const surv = (etat.surveillances || [])
          .filter(s => s.aerodrome_id === aero.id && (s.checklist_hierarchy || []).length > 0)
          .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())[0]
        if (!surv) {
          return JSON.stringify({ erreur: `Aucune checklist disponible pour ${aero.code_oaci} (préparez d'abord une surveillance).` })
        }
        const { genererRapportWordChecklist } = await import('@/lib/services/rapportWord')
        const res = await genererRapportWordChecklist(surv.checklist_hierarchy as never[], {
          titre: `Checklist - ${aero.code_oaci}`,
          code: surv.id.slice(0, 12),
          portee: surv.portee || [],
        })
        return JSON.stringify({ rapport_genere: true, format: 'word', site: aero.code_oaci, surveillance: surv.id.slice(0, 8), fichier: res.fichier, note: 'Checklist téléchargée (Word).' })
      }
      return JSON.stringify({ erreur: `Type « ${args.type} » inconnu — briefing, checklist, certification ou homologation.` })
    },
  },
  {
    nom: 'detail_ecart',
    description: "Détail complet d'un écart (PAC, évaluation, preuves). Dès qu'on parle d'un écart précis.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: "Référence de l'écart (ex. ECA-2026-042)" },
      },
    },
    requis: ['reference'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const ref = String(args.reference || '').toUpperCase()
      const e = (etat.ecarts || []).find(x => (x.reference || '').toUpperCase() === ref)
      if (!e) return JSON.stringify({ erreur: `Écart « ${args.reference} » introuvable.` })
      const aero = (etat.aerodromes || []).find(a => a.id === e.aerodrome_id)
      const surv = e.surveillance_id ? (etat.surveillances || []).find(s => s.id === e.surveillance_id) : undefined
      return JSON.stringify({
        reference: e.reference, site: aero?.code_oaci,
        libelle: e.libelle, domaine: e.domaine, ref_reglementaire: e.ref_reglementaire,
        niveau_risque: e.niveau_risque, statut: e.statut,
        delai_pac: (e as any).delai_pac, delai_regularisation: (e as any).delai_regularisation,
        surveillance_liee: surv ? { type: (surv as any).type, date: surv.date_debut, statut: surv.statut } : null,
        pac: e.pac ? {
          nb_actions: e.pac.actions?.length || 0,
          actions: (e.pac.actions || []).map(a => ({ description: a.description, responsable: a.responsable, date_prevue: a.date_prevue })),
          soumis_le: e.pac.soumis_le, soumis_par: e.pac.soumis_par, version: e.pac.version,
          observations: e.pac.observations,
        } : null,
        evaluation_pac: e.evaluation_pac ? {
          note_globale: e.evaluation_pac.note_globale, decision: e.evaluation_pac.decision,
          commentaire: e.evaluation_pac.commentaire_refus, evalue_le: e.evaluation_pac.evalue_le,
        } : null,
        preuves: e.preuves ? {
          nb_fichiers: e.preuves.fichiers?.length || 0,
          fichiers: (e.preuves.fichiers || []).map(f => f.nom),
          commentaire: e.preuves.commentaire, soumis_le: e.preuves.soumis_le,
          validation: e.validation_preuves?.decision || null,
        } : null,
      })
    },
  },
  {
    nom: 'rapport_surveillance',
    description: "Contenu d'une surveillance (la plus récente du site) : statut, score, écarts liés.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
      },
    },
    requis: ['site'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const surv = (etat.surveillances || [])
        .filter(s => s.aerodrome_id === aero.id)
        .sort((a, b) => new Date(b.date_debut || '-').getTime() - new Date(a.date_debut || '-').getTime())[0]
      if (!surv) return JSON.stringify({ site: aero.code_oaci, erreur: 'Aucune surveillance pour ce site.' })
      const lies = (etat.ecarts || []).filter(e => e.surveillance_id === surv.id)
      return JSON.stringify({
        site: aero.code_oaci, type: (surv as any).type,
        date_debut: surv.date_debut, date_fin: surv.date_fin, statut: surv.statut,
        score_global: surv.score_global ?? null, portee: surv.portee || [],
        rapport_disponible: !!(surv.rapport_html || surv.rapport_type || surv.rapport_fichier_url),
        observations: (surv.observations || '').substring(0, 500),
        ecarts_lies: lies.map(e => ({ reference: e.reference, niveau: e.niveau_risque, statut: e.statut })),
      })
    },
  },
  {
    nom: 'rechercher_aerodrome',
    description: "Retrouve un site par fragment (code partiel, nom, ville). Si code incertain : appeler d'abord, jamais deviner.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        recherche: { type: 'string', description: 'Fragment (code, nom, ville)' },
        limite: { type: 'number', description: 'Max (défaut 5)' },
      },
    },
    requis: ['recherche'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const norm = (s: unknown) => normaliserRecherche(String(s || ''))
      const q = norm(args.recherche)
      if (!q) return JSON.stringify({ erreur: 'Précisez un fragment de recherche (code, nom, ville).' })
      const candidats = (etat.aerodromes || [])
        .filter(a => !(a as any).deleted_at)
        .map(a => {
          const code = norm(a.code_oaci)
          const nom = norm((a as any).nom)
          const ville = norm((a as any).ville || (a as any).region)
          let score = -1
          if (code === q) score = 100
          else if (code.startsWith(q) || q.startsWith(code)) score = 80
          else if (nom.includes(q)) score = 60
          else if (q.split(' ').filter(w => w.length >= 4).some(w => nom.includes(w))) score = 50
          else if (ville && (ville.includes(q) || q.split(' ').filter(w => w.length >= 4).some(w => ville.includes(w)))) score = 40
          const ini = nom.split(' ').filter(w => w.length > 2).map(w => w[0]).join('')
          if (score < 0 && ini.length >= 3 && q.replace(/ /g, '') === ini) score = 70
          return { a, score }
        })
        .filter(c => c.score >= 0)
        .sort((x, y) => y.score - x.score)
      const limite = Math.min(10, Math.max(1, Number(args.limite) || 5))
      const items = candidats.slice(0, limite).map(({ a }) => {
        const p = (etat.profilsRisque || {})[a.id]
        return {
          site: a.code_oaci, nom: (a as any).nom, type: a.type, region: (a as any).region,
          score: p != null ? Math.round(p.score_global) : null, niveau: (p as any)?.niveau ?? null,
        }
      })
      if (items.length === 0) return JSON.stringify({ recherche: String(args.recherche), resultats: [], note: 'Aucun site trouvé — essayez un autre fragment (nom, ville, région).' })
      return JSON.stringify({ recherche: String(args.recherche), resultats: items })
    },
  },
  {
    nom: 'lister_aerodromes',
    description: "Aérodromes du réseau : score, niveau, SGS, critiques ouverts.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'international, national (optionnel)' },
        region: { type: 'string', description: 'Région (optionnel)' },
        limite: { type: 'number', description: 'Max (défaut 15)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      let liste = [...(etat.aerodromes || [])].filter(a => !(a as any).deleted_at)
      if (args.type) liste = liste.filter(a => ((a.type || '') as string).toLowerCase() === String(args.type).toLowerCase())
      if (args.region) liste = liste.filter(a => ((a.region || '') as string).toLowerCase().includes(String(args.region).toLowerCase()))
      const limite = Math.min(30, Math.max(1, Number(args.limite) || 15))
      const items = liste.slice(0, limite).map(a => {
        const p = (etat.profilsRisque || {})[a.id]
        const critiques = (etat.ecarts || []).filter(e => e.aerodrome_id === a.id && e.niveau_risque === 'critique' && e.statut !== 'cloture').length
        return {
          site: a.code_oaci, nom: a.nom, type: a.type, region: a.region,
          score: p != null ? Math.round(p.score_global) : null, niveau: p?.niveau ?? null,
          sgs: a.statut_sgs === 'non_applicable' ? 'non applicable' : (a.statut_sgs || 'complet'),
          ecarts_critiques_ouverts: critiques,
        }
      })
      return JSON.stringify({ total: liste.length, affiches: items })
    },
  },
  {
    nom: 'dossier_certification',
    description: "Certification d'un site : statut, phase /5, expiration.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
      },
    },
    requis: ['site'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const cert = (etat.certifications || []).find(c => c.aerodrome_id === aero.id)
      if (!cert) return JSON.stringify({ site: aero.code_oaci, dossier: null, note: 'Aucun dossier de certification.' })
      const phases = [1, 2, 3, 4, 5].map(n => {
        const p = (cert.phases_data as any)?.[`phase${n}`] || {}
        return { phase: n, cloturee: !!p.cloture_le, cloture_le: p.cloture_le || null }
      })
      const exp = (cert as any).date_expiration || (cert.phases_data as any)?.phase4?.date_expiration || null
      const jours = exp ? Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000) : null
      return JSON.stringify({
        site: aero.code_oaci, reference: (cert as any).reference,
        statut_global: cert.statut_global, phase_active: `${cert.phase_active}/5`,
        type_demande: (cert as any).type_certification || null,
        phases, date_expiration: exp, jours_restants: jours,
      })
    },
  },
  {
    nom: 'dossier_homologation',
    description: "Homologation d'un site : statut, phase /3, expiration.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
      },
    },
    requis: ['site'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const homo = (etat.homologations || []).find((h: any) => h.aerodrome_id === aero.id)
      if (!homo) return JSON.stringify({ site: aero.code_oaci, dossier: null, note: "Aucun dossier d'homologation." })
      const phases = [1, 2, 3].map(n => {
        const p = (homo.phases_data as any)?.[`phase${n}`] || {}
        return { phase: n, cloturee: !!p.cloture_le, cloture_le: p.cloture_le || null }
      })
      const exp = (homo as any).date_expiration || (homo.phases_data as any)?.phase3?.date_expiration || null
      const jours = exp ? Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000) : null
      return JSON.stringify({
        site: aero.code_oaci, reference: (homo as any).reference,
        statut_global: (homo as any).statut_global, phase_active: `${(homo as any).phase_active || 1}/3`,
        phases, date_expiration: exp, jours_restants: jours,
      })
    },
  },
  {
    nom: 'lister_dossiers',
    description: "Dossiers techniques : liste filtrée ou détail par référence.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: 'Référence pour le détail (optionnel)' },
        statut: { type: 'string', description: 'en_attente, en_cours, termine, archive (optionnel)' },
        categorie: { type: 'string', description: 'reglementaire, technique, operationnel, surveillance, formation, financier (optionnel)' },
        limite: { type: 'number', description: 'Max (défaut 10)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      const dossiers = (etat.dossiers || []) as any[]
      if (args.reference) {
        const ref = String(args.reference).toLowerCase()
        const d = dossiers.find(x => (x.reference || '').toLowerCase() === ref || x.id === args.reference)
        if (!d) return JSON.stringify({ erreur: `Dossier « ${args.reference} » introuvable.` })
        const aero = d.aerodrome_id ? (etat.aerodromes || []).find(a => a.id === d.aerodrome_id) : undefined
        return JSON.stringify({
          reference: d.reference, titre: d.titre, site: aero?.code_oaci || null,
          categorie: d.categorie, statut: d.statut, progression: d.progression,
          service: d.service_assigne, inspecteur_id: d.inspecteur_id || null,
          date_limite: d.date_limite, nb_fichiers: (d.fichiers || []).length,
          nb_etapes_historique: (d.historique || []).length,
        })
      }
      let liste = [...dossiers]
      if (args.statut) liste = liste.filter(d => d.statut === String(args.statut))
      if (args.categorie) liste = liste.filter(d => d.categorie === String(args.categorie))
      const limite = Math.min(20, Math.max(1, Number(args.limite) || 10))
      const items = liste.slice(0, limite).map(d => ({
        reference: d.reference, titre: (d.titre || '').substring(0, 80),
        categorie: d.categorie, statut: d.statut, progression: d.progression,
        date_limite: d.date_limite,
      }))
      return JSON.stringify({ total: liste.length, affiches: items })
    },
  },
  {
    nom: 'etat_formation',
    description: "Formations : synthèse globale ou fiche d'un inspecteur.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        inspecteur: { type: 'string', description: 'Nom ou matricule (optionnel : synthèse si absent)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      const formations = (etat.formations || []) as any[]
      if (args.inspecteur) {
        const cle = String(args.inspecteur).trim().toLowerCase()
        const ins = (etat.inspecteurs || []).find(i =>
          !i.deleted_at && (
            `${i.prenom} ${i.nom}`.toLowerCase().includes(cle) ||
            (i.matricule || '').toLowerCase() === cle
          ))
        if (!ins) return JSON.stringify({ erreur: `Inspecteur « ${args.inspecteur} » introuvable.` })
        const perso = formations.filter(f => (f.participants || []).includes(ins.id))
        const parStatut: Record<string, number> = {}
        for (const f of perso) parStatut[f.statut || '?'] = (parStatut[f.statut || '?'] || 0) + 1
        const comps = (ins.competences || []).map(c => ({
          domaine: normaliserDomaineCompetence((c as any).domaine) || '?',
          niveau: normaliserNiveauCompetence((c as any).niveau),
        }))
        return JSON.stringify({
          inspecteur: `${ins.prenom} ${ins.nom}`, matricule: ins.matricule, statut: ins.statut,
          type: ins.type, service: ins.service,
          formations_total: perso.length, par_statut: parStatut,
          competences: comps,
        })
      }
      const parStatut: Record<string, number> = {}
      for (const f of formations) parStatut[f.statut || '?'] = (parStatut[f.statut || '?'] || 0) + 1
      const maintenant = Date.now()
      const enRetard = formations.filter(f => f.statut === 'planifiee' && f.date && new Date(f.date).getTime() < maintenant).length
      const inspecteurs = (etat.inspecteurs || []).filter(i => !i.deleted_at)
      const enFormation = inspecteurs.filter(i =>
        formations.some(f => (f.participants || []).includes(i.id) && f.statut === 'en_cours')).length
      return JSON.stringify({
        formations_total: formations.length, par_statut: parStatut, en_retard: enRetard,
        inspecteurs_total: inspecteurs.length, inspecteurs_en_formation: enFormation,
        taux_execution: formations.length > 0 ? Math.round(((parStatut['terminee'] || 0) / formations.length) * 100) : 0,
      })
    },
  },
  {
    nom: 'etat_ml',
    description: "ML monitoring : modèle actif, précision, alertes de recalibrage.",
    ecriture: false,
    parametres: { type: 'object', properties: {} },
    executer: async () => {
      const etat = useAppStore.getState() as any
      let stats: any = null
      try { stats = etat.getDetailedLearningStats ? etat.getDetailedLearningStats() : null } catch { /* ignore */ }
      let alertes: any[] = []
      try { alertes = etat.getPendingAlerts ? etat.getPendingAlerts() : (etat.recalibrationAlerts || []).filter((a: any) => !a.traitee) } catch { /* ignore */ }
      return JSON.stringify({
        modele_actif: etat.activeModelName || etat.currentModel?.nom || null,
        modele_entraine_le: etat.activeModelTrainedAt || etat.currentModel?.trained_at || etat.rfModelInfo?.trained_at || null,
        precision: etat.modelMetrics?.random_forest?.accuracy ?? etat.rfModelInfo?.accuracy ?? null,
        echantillons_rf: etat.rfSamplesCount ?? etat.rfModelInfo?.training_samples ?? 0,
        entrainement_auto: etat.modelTrainingConfig?.auto_train_enabled ?? null,
        feedbacks_total: stats?.total_feedbacks ?? (etat.learningFeedbacks || []).length,
        taux_justesse: stats?.taux_justesse ?? null,
        alertes_recalibrage_en_attente: alertes.length,
        alertes: alertes.slice(0, 5).map((a: any) => ({ id: a.id, message: a.message || a.titre || a.raison || 'alerte', date: a.created_at || a.date || null })),
        dernier_recalibrage: stats?.dernier_recalibrage || null,
      })
    },
  },
  {
    nom: 'messages_recents',
    description: "Mes messages reçus (non-lus + derniers). Connecté uniquement.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        limite: { type: 'number', description: 'Max (défaut 5)' },
        non_lus_uniquement: { type: 'boolean', description: 'Seulement non-lus (optionnel)' },
      },
    },
    executer: async (args, ctx) => {
      if (!ctx.userId) return JSON.stringify({ erreur: 'Utilisateur non identifié — connectez-vous pour lire la messagerie.' })
      const etat = useAppStore.getState()
      const recus = (etat.messages || []).filter((m: any) => {
        const dest = Array.isArray(m.to_id) ? m.to_id.includes(ctx.userId) : m.to_id === ctx.userId
        const cc = Array.isArray(m.cc_id) && m.cc_id.includes(ctx.userId)
        return dest || cc
      })
      const nonLus = recus.filter((m: any) => !(m.read_by || []).includes(ctx.userId))
      const limite = Math.min(10, Math.max(1, Number(args.limite) || 5))
      const cible = (args.non_lus_uniquement ? nonLus : recus)
        .sort((a: any, b: any) => new Date(b.created_at || b.date || '-').getTime() - new Date(a.created_at || a.date || '-').getTime())
        .slice(0, limite)
        .map((m: any) => ({
          de: m.from_nom || m.from_id, objet: m.subject || '(sans objet)',
          date: m.created_at || m.date || null, canal: m.canal || null,
          lu: (m.read_by || []).includes(ctx.userId),
        }))
      return JSON.stringify({ non_lus: nonLus.length, total_recus: recus.length, affiches: cible })
    },
  },
  {
    nom: 'fiche_aerodrome',
    description: "Fiche d'un site : identité, SGS, SSLIA, piste, exploitant, certification.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom" },
      },
    },
    requis: ['site'],
    executer: async (args) => {
      const etat = useAppStore.getState()
      const aero = trouverAerodrome(String(args.site || ''))
      if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
      const p = (etat.profilsRisque || {})[aero.id]
      return JSON.stringify({
        site: aero.code_oaci, nom: aero.nom, type: aero.type, type_entite: (aero as any).type_entite,
        region: aero.region, statut: aero.statut, categorie_sslia: aero.categorie_sslia,
        sgs: aero.statut_sgs || 'complet', maturite_sgs: (aero as any).maturite_sgs ?? null,
        horaires: (aero as any).horaires || null,
        piste: aero.piste_principale ? {
          longueur: aero.piste_principale.longueur, largeur: aero.piste_principale.largeur,
          orientation: aero.piste_principale.orientation, revetement: aero.piste_principale.revetement,
        } : null,
        exploitant: (aero as any).exploitant_nom || null,
        contacts: ((aero.contacts || []) as any[]).map(c => ({ nom: c.nom, poste: c.poste })),
        statut_certification: (aero as any).statut_certification || null,
        numero_certificat: (aero as any).numero_certificat || null,
        score_risque: p != null ? Math.round(p.score_global) : null,
        niveau_risque: p?.niveau ?? null,
      })
    },
  },
  {
    nom: 'consulter_registre',
    description: "Archives : liste filtrée ou détail par référence.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        reference: { type: 'string', description: 'Référence exacte pour le détail (optionnel)' },
        type: { type: 'string', description: 'certification, homologation, surveillance, evenement, ecart, dossier, document, formation (optionnel)' },
        site: { type: 'string', description: 'Code OACI ou nom (optionnel)' },
        limite: { type: 'number', description: 'Max (défaut 10)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      const entrees = ((etat as any).registreEntries || []) as any[]
      if (args.reference) {
        const ref = String(args.reference).toLowerCase()
        const e = entrees.find(x => (x.reference || '').toLowerCase() === ref || x.id === args.reference)
        if (!e) return JSON.stringify({ erreur: `Entrée « ${args.reference} » introuvable au registre.` })
        const aero = e.aerodrome_id ? (etat.aerodromes || []).find(a => a.id === e.aerodrome_id) : undefined
        return JSON.stringify({
          reference: e.reference, titre: (e.titre || '').substring(0, 200), type: e.type,
          site: aero?.code_oaci || null, date_entree: e.date_entree, statut: e.statut,
          nb_fichiers: (e.fichiers || []).length, nb_etapes: (e.timeline || []).length,
          dernieres_etapes: (e.timeline || []).slice(-3).map((t: any) => ({ etape: t.etape, date: t.date, acteur: t.acteur })),
        })
      }
      let liste = [...entrees]
      if (args.type) liste = liste.filter(e => e.type === String(args.type))
      if (args.site) {
        const aero = trouverAerodrome(String(args.site))
        if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
        liste = liste.filter(e => e.aerodrome_id === aero.id)
      }
      const limite = Math.min(20, Math.max(1, Number(args.limite) || 10))
      const items = liste
        .sort((a, b) => new Date(b.date_entree || '-').getTime() - new Date(a.date_entree || '-').getTime())
        .slice(0, limite)
        .map(e => {
          const aero = e.aerodrome_id ? (etat.aerodromes || []).find(a => a.id === e.aerodrome_id) : undefined
          return { reference: e.reference, titre: (e.titre || '').substring(0, 80), type: e.type, site: aero?.code_oaci || null, date: e.date_entree, statut: e.statut }
        })
      return JSON.stringify({ total: liste.length, affiches: items })
    },
  },
  {
    nom: 'alertes_risque',
    description: "Alertes proactives et risque de cascade (site ou top réseau).",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom (optionnel)" },
        limite: { type: 'number', description: 'Max sites (défaut 5)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      const { computeHawkesContagion } = await import('@/lib/risque')
      const scorer = (aeroId: string) => {
        const ecarts = (etat.ecarts || []).filter(e => e.aerodrome_id === aeroId)
        const hawkes = computeHawkesContagion(ecarts.map(e => ({ createdAt: e.created_at, niveau: e.niveau_risque })))
        const p = (etat.profilsRisque || {})[aeroId]
        return { hawkes, profil: p }
      }
      if (args.site) {
        const aero = trouverAerodrome(String(args.site))
        if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
        const { hawkes, profil } = scorer(aero.id)
        return JSON.stringify({
          site: aero.code_oaci,
          score: profil != null ? Math.round(profil.score_global) : null,
          niveau: (profil as any)?.niveau ?? null,
          alerte_proactive: (profil as any)?.proactive_alert?.message_court || (profil as any)?.proactive_alert || null,
          risque_cascade_30j: ((hawkes as any).riskNext30Days ?? (hawkes as any).risque) || null,
        })
      }
      const limite = Math.min(10, Math.max(1, Number(args.limite) || 5))
      const lignes = (etat.aerodromes || [])
        .filter(a => !(a as any).deleted_at)
        .map(a => {
          const p = (etat.profilsRisque || {})[a.id]
          const { hawkes } = scorer(a.id)
          return {
            site: a.code_oaci, nom: a.nom,
            score: p != null ? Math.round(p.score_global) : 999,
            niveau: (p as any)?.niveau ?? null,
            risque_cascade_30j: (hawkes as any).riskNext30Days ?? null,
          }
        })
        .sort((x, y) => (x.score ?? 999) - (y.score ?? 999))
        .slice(0, limite)
      return JSON.stringify({ sites_prioritaires: lignes })
    },
  },
  {
    nom: 'etat_enquetes',
    description: "Enquêtes : liste, taux de réponse, focus par type.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        statut: { type: 'string', description: 'brouillon, active, terminee, archivee (optionnel)' },
        type: { type: 'string', description: 'Type (saisie libre acceptée, optionnel)' },
        limite: { type: 'number', description: 'Max (défaut 10)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState() as any
      let liste = [...(etat.enquetes || [])]
      if (args.statut) liste = liste.filter(e => e.statut === String(args.statut))
      if (args.type) liste = liste.filter(e => (e.type_enquete || '').toLowerCase().includes(String(args.type).toLowerCase()))
      const limite = Math.min(20, Math.max(1, Number(args.limite) || 10))
      const items = liste.slice(0, limite).map(e => {
        const reps = (etat.reponsesEnquetes || []).filter((r: any) => r.enquete_id === e.id)
        return {
          reference: e.reference, titre: (e.titre || '').substring(0, 80),
          type: e.type_enquete, statut: e.statut, deadline: e.deadline,
          nb_reponses: reps.length,
          nb_aerodromes_cibles: (e.aerodrome_ids || []).length,
        }
      })
      return JSON.stringify({ total: liste.length, affichees: items })
    },
  },
  {
    nom: 'documents_kit',
    description: "Kit inspecteur : recherche documentaire (mot-clé, domaine, type).",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        recherche: { type: 'string', description: 'Mot-clé' },
        domaine: { type: 'string', description: 'SGS, PHY, OLS, OPS, COP, ELEC, MFP, SLI, RA (optionnel)' },
        nouveautes_uniquement: { type: 'boolean', description: 'OACI récents uniquement (optionnel)' },
        limite: { type: 'number', description: 'Max (défaut 8)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      let liste = [...(etat.kitDocuments || [])]
      if (args.nouveautes_uniquement) liste = liste.filter(d => (d as any).type_document_oaci)
      if (args.domaine) {
        const dom = String(args.domaine).toUpperCase()
        liste = liste.filter(d => (d.domaines || []).map(x => (x || '').toUpperCase()).includes(dom))
      }
      if (args.recherche) {
        const q = String(args.recherche).toLowerCase()
        liste = liste.filter(d =>
          (d.nom || '').toLowerCase().includes(q) ||
          (d.mots_cles || []).some((m: string) => (m || '').toLowerCase().includes(q)) ||
          (d.resume || '').toLowerCase().includes(q))
      }
      const limite = Math.min(15, Math.max(1, Number(args.limite) || 8))
      const items = liste.slice(0, limite).map(d => ({
        nom: d.nom, type: d.type_document, version: d.version, etat: d.etat,
        domaines: d.domaines || [], norme_oaci: (d as any).type_document_oaci || null,
        impact_ia: (d as any).ia_impact || null,
      }))
      return JSON.stringify({ total: liste.length, affiches: items })
    },
  },
  {
    nom: 'cours_du_soir',
    description: "DEVOIRS DU SOIR du Kit : réchauffe Ollama et extrait le texte des documents sans contenu (3 max par appel, sans doublon). Option ocr=true : transcrit en plus les PDF scannés par vision (lent, relance pour continuer). Quand l'utilisateur demande de réviser/préparer le kit, mettre les documents à jour, ou « fais tes devoirs ». Lecture seule métier (remplit les blancs, ne modifie aucun contenu).",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        max_docs: { type: 'number', description: 'Max documents (défaut 3, max 10)' },
        ocr: { type: 'boolean', description: 'Inclure l OCR vision des scans (lent, avec reprise)' },
      },
    },
    executer: async (args) => {
      const { coursDuSoir } = await import('@/lib/ia/coursDuSoir')
      const traces: string[] = []
      const r = await coursDuSoir({
        maxDocs: Number(args.max_docs) || 3,
        ocr: args.ocr === true,
        onEtape: (m) => { traces.push(m) },
      })
      return JSON.stringify({
        chaud_ollama: r.chaud,
        deja_en_cours: r.dejaEnCours,
        examines: r.examines,
        extraits: r.extraits,
        caracteres_ajoutes: r.caracteresAjoutes,
        echecs: r.echecs,
        ocr_pages: r.ocrPages,
        ocr_termines: r.ocrTermines,
        extraits_crees: r.extraitsCrees,
        reste_sans_texte: r.reste,
        duree_s: Math.round(r.dureeMs / 1000),
        journal: traces,
        note: r.reste === 0
          ? 'Kit à jour — l IA peut citer tous les documents.'
          : `Relance l outil pour traiter les ${r.reste} restant(s).`,
      })
    },
  },
  {
    nom: 'charge_travail',
    description: "Charge des inspecteurs : tâches, retards — équipe ou fiche individuelle.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        inspecteur: { type: 'string', description: 'Nom ou matricule (optionnel : synthèse si absent)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      const { chargeUtils } = await import('@/lib/chargeUtils')
      const aeros = etat.aerodromes || []
      const taches: Array<any> = []
      for (const s of (etat.surveillances || [])) {
        for (const id of (s.equipe_ids || [])) {
          taches.push({ ...chargeUtils.surveillanceVersTache(s, aeros as any), lien_id: id })
        }
      }
      for (const e of (etat.ecarts || [])) {
        if ((e as any).inspecteur_ref_id) {
          taches.push({ ...chargeUtils.ecartVersTache(e, aeros as any), lien_id: (e as any).inspecteur_ref_id })
          const tP = chargeUtils.ecartVersTacheEvaluationPAC(e, aeros as any)
          if (tP) taches.push({ ...tP, lien_id: (e as any).inspecteur_ref_id })
          const tV = chargeUtils.ecartVersTacheValidationPreuves(e, aeros as any)
          if (tV) taches.push({ ...tV, lien_id: (e as any).inspecteur_ref_id })
        }
      }
      for (const v of (etat.evenements || [])) {
        if ((v as any).inspecteur_id) taches.push({ ...chargeUtils.evenementVersTache(v, aeros as any), lien_id: (v as any).inspecteur_id })
      }
      for (const d of ((etat as any).dossiers || [])) {
        if (d.inspecteur_id) taches.push({ ...chargeUtils.dossierVersTache(d, aeros as any), lien_id: d.inspecteur_id })
      }
      const nomDe = (id: string) => {
        const ins = (etat.inspecteurs || []).find(i => i.id === id)
        if (ins && !ins.deleted_at) return `${ins.prenom} ${ins.nom}`
        const u = (etat.utilisateurs || []).find(x => x.id === id || (x as any).inspecteur_id === id)
        return u ? `${(u as any).prenom || ''} ${(u as any).nom || ''}`.trim() || id.slice(0, 8) : id.slice(0, 8)
      }
      if (args.inspecteur) {
        const cle = String(args.inspecteur).trim().toLowerCase()
        const ins = (etat.inspecteurs || []).find(i =>
          !i.deleted_at && (`${i.prenom} ${i.nom}`.toLowerCase().includes(cle) || (i.matricule || '').toLowerCase() === cle))
        const id = ins?.id || (etat.utilisateurs || []).find(u =>
          (`${(u as any).prenom} ${(u as any).nom}`.toLowerCase().includes(cle)))?.id
        if (!id && !ins) return JSON.stringify({ erreur: `Inspecteur « ${args.inspecteur} » introuvable.` })
        const perso = taches.filter(t => t.lien_id === (ins?.id || id))
        const charge = chargeUtils.calculerChargeInspecteur(ins?.id || (id as string), ins ? `${ins.prenom} ${ins.nom}` : nomDe(id as string), perso)
        return JSON.stringify({
          inspecteur: charge.inspecteur_nom, matricule: (ins as any)?.matricule || null,
          total_taches: charge.total_taches, par_statut: charge.taches_par_statut,
          par_priorite: charge.taches_par_priorite, charge_pct: charge.charge,
          en_retard: perso.filter(t => t.statut === 'en_retard').map(t => ({ titre: t.titre, echeance: t.date_echeance })).slice(0, 8),
        })
      }
      const parInsp = new Map<string, any[]>()
      for (const t of taches) {
        if (!parInsp.has(t.lien_id)) parInsp.set(t.lien_id, [])
        parInsp.get(t.lien_id)!.push(t)
      }
      const charges = Array.from(parInsp.entries()).map(([id, ts]) =>
        chargeUtils.calculerChargeInspecteur(id, nomDe(id), ts))
      const stats = chargeUtils.calculerStatistiquesGlobales(charges)
      const topCharge = [...charges].sort((a, b) => b.charge - a.charge).slice(0, 5).map(c => ({
        inspecteur: c.inspecteur_nom, charge_pct: c.charge,
        en_retard: c.taches_par_statut.en_retard, total: c.total_taches,
      }))
      return JSON.stringify({ ...stats, inspecteurs_suivis: charges.length, plus_charges: topCharge })
    },
  },
  {
    nom: 'journal_audit',
    description: "Journal d'audit (admin/DG) : actions tracées par module.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        module: { type: 'string', description: 'Module (optionnel)' },
        limite: { type: 'number', description: 'Max (défaut 15)' },
      },
    },
    executer: async (args, ctx) => {
      if (!['admin', 'dg_anacim'].includes(ctx.userRole || '')) {
        return JSON.stringify({ erreur: 'Journal d’audit réservé aux administrateurs (rôle « ' + (ctx.userRole || 'inconnu') + ' » non autorisé).' })
      }
      const etat = useAppStore.getState() as any
      let logs = [...(etat.auditLogs || [])]
      if (args.module) logs = logs.filter(l => (l.module || '').toLowerCase().includes(String(args.module).toLowerCase()))
      const limite = Math.min(30, Math.max(1, Number(args.limite) || 15))
      const items = logs
        .sort((a, b) => new Date(b.created_at || b.date || '-').getTime() - new Date(a.created_at || a.date || '-').getTime())
        .slice(0, limite)
        .map(l => ({ action: l.action, module: l.module || null, utilisateur: l.utilisateur || l.user_id || null, date: l.created_at || l.date || null }))
      return JSON.stringify({ total: logs.length, affichees: items })
    },
  },
  {
    nom: 'rechercher_web',
    description: "Web autorités aviation (ASECNA, ANACIM, OACI…) : AD-2, SUP, guides. Pour toute info externe — citer l'URL.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        recherche: { type: 'string', description: 'Mots-clés (ex. "AD-2 GOBD")' },
        max: { type: 'number', description: 'Max résultats (défaut 4)' },
      },
    },
    requis: ['recherche'],
    executer: async (args) => {
      const q = String(args.recherche || '').trim()
      if (!q) return JSON.stringify({ erreur: 'Précisez une recherche.' })
      const max = Math.min(8, Math.max(1, Number(args.max) || 4))
      const { rechercherAutorite } = await import('@/lib/ia/rag/rechercheWeb')
      const resultats = await rechercherAutorite(q, { max })
      if (resultats.length === 0) {
        return JSON.stringify({ recherche: q, resultats: [], note: 'Rien trouvé sur les sites autorités — reformulez (code OACI, nom, n° SUP).' })
      }
      return JSON.stringify({
        recherche: q,
        resultats: resultats.map(r => ({ source: r.source, titre: r.titre, extrait: (r.extrait || '').slice(0, 300), url: r.url })),
      })
    },
  },
  {
    nom: 'lister_plannings',
    description: "Plannings (site ou année) : type, dates, statut, brouillon ou ferme.",
    ecriture: false,
    parametres: {
      type: 'object',
      properties: {
        site: { type: 'string', description: "Code OACI ou nom (optionnel)" },
        annee: { type: 'number', description: 'Année (optionnel)' },
        statut: { type: 'string', description: 'planifiee, en_cours, terminee (optionnel)' },
        limite: { type: 'number', description: 'Max (défaut 10)' },
      },
    },
    executer: async (args) => {
      const etat = useAppStore.getState()
      let liste = [...(etat.plannings || [])]
      if (args.site) {
        const aero = trouverAerodrome(String(args.site))
        if (!aero) return JSON.stringify({ erreur: `Site « ${args.site} » introuvable.` })
        liste = liste.filter(p => p.aerodrome_id === aero.id)
      }
      if (args.annee) liste = liste.filter(p => p.annee_cible === Number(args.annee))
      if (args.statut) liste = liste.filter(p => p.statut === String(args.statut))
      const limite = Math.min(20, Math.max(1, Number(args.limite) || 10))
      const items = liste
        .sort((a, b) => new Date(a.date_debut).getTime() - new Date(b.date_debut).getTime())
        .slice(0, limite)
        .map(p => {
          const aero = (etat.aerodromes || []).find(a => a.id === p.aerodrome_id)
          return {
            site: aero?.code_oaci || p.aerodrome_id, type: p.type,
            date_debut: p.date_debut, date_fin: p.date_fin, statut: p.statut,
            proposition: !!p.est_proposition, portee: p.portee || [],
          }
        })
      return JSON.stringify({ total: liste.length, affiches: items })
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
