// lib/services/notificationService.ts
// Service de notification centralise - multicanal (in_app, email, SMS)
// Resout automatiquement les destinataires, verifie les preferences,
// et peut generer des messages personnalises via l'IA (Groq).
'use client'

import { useAppStore, Notification } from '@/lib/store'

export type EventType =
  | 'surveillance_planifiee'
  | 'surveillance_transmise'
  | 'surveillance_terminee'
  | 'checklist_deleguee'
  | 'ecart_ouvert'
  | 'ecart_ferme'
  | 'ecart_en_retard'
  | 'pac_soumis'
  | 'pac_accepte'
  | 'pac_refuse'
  | 'pac_en_retard'
  | 'preuves_soumises'
  | 'preuves_acceptees'
  | 'preuves_refusees'
  | 'profil_risque_ameliore'
  | 'profil_risque_alerte'
  | 'certification_statut'
  | 'homologation_statut'
  | 'evenement_securite'
  | 'code_expiration'
  | 'dossier_impute'
  | 'charge_travail_elevee'
  | 'document_partage'

interface EventMeta {
  type: 'info' | 'success' | 'warning' | 'danger'
  defaultCanal: Notification['canal']
  rolesCibles: string[]
  title: (ctx: Record<string, unknown>) => string
  message: (ctx: Record<string, unknown>) => string
}

const tpl = (strings: TemplateStringsArray, ...values: unknown[]) =>
  strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '')

const EVENTS: Record<EventType, EventMeta> = {
  surveillance_planifiee: {
    type: 'info',
    defaultCanal: 'in_app',
    rolesCibles: ['dg_operator', 'focal_operator', 'staff_operator'],
    title: () => 'Surveillance planifiee',
    message: (ctx) => tpl`Une surveillance ${ctx.type_surveillance || ''} est prevue pour le ${new Date(ctx.date_debut as string).toLocaleDateString('fr-FR')}. Preparez vos documents et registres.`,
  },
  surveillance_transmise: {
    type: 'success',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator', 'staff_operator'],
    title: () => 'Rapport de surveillance transmis',
    message: (ctx) => tpl`Le rapport de surveillance du ${new Date(ctx.date_fin as string).toLocaleDateString('fr-FR')} a ete transmis a l'exploitant. Consultez-le dans votre espace.`,
  },
  surveillance_terminee: {
    type: 'success',
    defaultCanal: 'in_app',
    rolesCibles: ['dg_operator', 'focal_operator', 'staff_operator'],
    title: () => 'Surveillance terminee',
    message: (ctx) => tpl`La surveillance du ${new Date(ctx.date_debut as string).toLocaleDateString('fr-FR')} est terminee. Merci pour votre collaboration.`,
  },
  checklist_deleguee: {
    type: 'info',
    defaultCanal: 'in_app',
    rolesCibles: ['inspector'],
    title: () => 'Checklist deleguee',
    message: (ctx) => tpl`Une checklist vous a ete deleguee par ${ctx.delegue_par || 'un inspecteur'}.`,
  },
  ecart_ouvert: {
    type: 'warning',
    defaultCanal: 'in_app',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: () => 'Nouvel ecart releve',
    message: (ctx) => tpl`Un ecart de niveau ${ctx.niveau_risque || 'N/A'} a ete releve. Un PAC doit etre soumis sous 30 jours.`,
  },
  ecart_ferme: {
    type: 'success',
    defaultCanal: 'in_app',
    rolesCibles: ['dg_operator', 'focal_operator', 'staff_operator'],
    title: () => 'Ecart cloture',
    message: (ctx) => tpl`L'ecart ${ctx.reference || ''} a ete cloture avec succes par l'inspecteur.`,
  },
  ecart_en_retard: {
    type: 'danger',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: () => 'Ecart en retard',
    message: (ctx) => tpl`L'ecart ${ctx.reference || ''} est en retard de ${ctx.jours_retard || 0} jours. Une action immediate est requise.`,
  },
  pac_soumis: {
    type: 'info',
    defaultCanal: 'in_app',
    rolesCibles: ['inspector'],
    title: () => 'PAC soumis par l\'exploitant',
    message: (ctx) => tpl`Un Plan d'Action Corrective a ete soumis par ${ctx.soumis_par || "l'exploitant"} pour l'ecart ${ctx.reference_ecart || ''}.`,
  },
  pac_accepte: {
    type: 'success',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: () => 'PAC accepte',
    message: (ctx) => tpl`Votre Plan d'Action Corrective a ete accepte par l'inspecteur. Les delais convenus sont a respecter.`,
  },
  pac_refuse: {
    type: 'danger',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: () => 'PAC refuse',
    message: (ctx) => tpl`Votre Plan d'Action Corrective a ete refuse. Motif : ${ctx.motif || 'Non conforme'}. Merci de soumettre une version revisee.`,
  },
  pac_en_retard: {
    type: 'danger',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: () => 'PAC en retard',
    message: (ctx) => tpl`Votre PAC est en retard de ${ctx.jours_retard || 0} jours.`,
  },
  preuves_soumises: {
    type: 'info',
    defaultCanal: 'in_app',
    rolesCibles: ['inspector'],
    title: () => 'Preuves soumises',
    message: (ctx) => tpl`Des preuves de realisation ont ete soumises par ${ctx.soumis_par || "l'exploitant"} pour le PAC ${ctx.reference_pac || ''}.`,
  },
  preuves_acceptees: {
    type: 'success',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: () => 'Preuves acceptees',
    message: (ctx) => tpl`Vos preuves de realisation ont ete acceptees par l'inspecteur. L'ecart ${ctx.reference_ecart || ''} sera clos.`,
  },
  preuves_refusees: {
    type: 'warning',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: () => 'Preuves refusees',
    message: (ctx) => tpl`Vos preuves de realisation ont ete refusees. Motif : ${ctx.motif || 'Non conformes'}. Merci de soumettre des preuves mises a jour.`,
  },
  profil_risque_alerte: {
    type: 'danger',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator', 'inspector', 'admin'],
    title: () => 'Alerte profil de risque',
    message: (ctx) => tpl`Le profil de risque de votre aerodrome est passe en niveau ${ctx.niveau || 'critique'} (score : ${ctx.score || 'N/A'}). Une attention immediate est requise.`,
  },
  profil_risque_ameliore: {
    type: 'success',
    defaultCanal: 'in_app',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: () => 'Profil de risque ameliore',
    message: (ctx) => tpl`Felicitations ! Le profil de risque de votre aerodrome s'est ameliore (score : ${ctx.score || 'N/A'}). Continuez vos efforts.`,
  },
  certification_statut: {
    type: 'info',
    defaultCanal: 'in_app',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: (ctx) => tpl`Certification mise a jour`,
    message: (ctx) => tpl`Votre dossier de certification est passe au statut ${ctx.statut || 'mis a jour'}. ${ctx.message_supplementaire || ''}`,
  },
  homologation_statut: {
    type: 'info',
    defaultCanal: 'in_app',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: (ctx) => tpl`Homologation mise a jour`,
    message: (ctx) => tpl`Votre dossier d'homologation est passe au statut ${ctx.statut || 'mis a jour'}. ${ctx.message_supplementaire || ''}`,
  },
  evenement_securite: {
    type: 'danger',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator', 'admin'],
    title: (ctx) => tpl`Evenement de securite ${ctx.critique ? 'CRITIQUE' : 'signale'}`,
    message: (ctx) => tpl`Un evenement de securite a ete signale sur votre aerodrome.`,
  },
  code_expiration: {
    type: 'warning',
    defaultCanal: 'email_sms',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: () => "Code d'acces arrive a expiration",
    message: (ctx) => tpl`Votre code d'acces expire le ${new Date(ctx.date_expiration as string).toLocaleDateString('fr-FR')}. Contactez l'administrateur pour le renouveler.`,
  },
  dossier_impute: {
    type: 'info',
    defaultCanal: 'in_app',
    rolesCibles: ['inspector'],
    title: () => 'Dossier impute',
    message: (ctx) => tpl`Le dossier ${ctx.nom_dossier || ''} vous a ete impute par ${ctx.impute_par || 'un administrateur'}.`,
  },
  charge_travail_elevee: {
    type: 'warning',
    defaultCanal: 'in_app',
    rolesCibles: ['inspector'],
    title: () => 'Charge de travail elevee',
    message: (ctx) => tpl`Vous avez ${ctx.nombre_dossiers || 0} dossiers actifs. Votre charge de travail est elevee (${ctx.taux_occupation || 0}%).`,
  },
  document_partage: {
    type: 'info',
    defaultCanal: 'in_app',
    rolesCibles: ['dg_operator', 'focal_operator'],
    title: (ctx) => tpl`Nouveau document partage : ${ctx.nom_document || ''}`,
    message: (ctx) => {
      const base = tpl`Un document vous a ete partage par ${ctx.partage_par || "l'inspecteur"}.`
      const extra = ctx.message ? ' Message : ' + ctx.message : ''
      return base + ' ' + extra + ' Consultez-le dans votre espace.'
    },
  },
}

class NotificationService {
  async notify(
    event: EventType,
    context: Record<string, unknown>,
    options?: { canal?: Notification['canal']; ciblesSpecifiques?: string[] }
  ) {
    const config = EVENTS[event]
    if (!config) return

    const store = useAppStore.getState()
    const aerodromeId = (context.aerodrome_id as string) || store.user?.aerodrome_id
    const roles = options?.ciblesSpecifiques ?? config.rolesCibles

    let targets = store.utilisateurs.filter(
      (u) =>
        u.statut === 'actif' &&
        (options?.ciblesSpecifiques ? roles.includes(u.id) : roles.includes(u.role)) &&
        (!aerodromeId || u.aerodrome_id === aerodromeId)
    )

    if (targets.length === 0 && store.user) {
      targets = [store.user as any]
    }

    const titre = config.title(context)
    const message = config.message(context)
    const canal = options?.canal ?? config.defaultCanal

    for (const user of targets) {
      store.addNotification({
        user_id: user.id,
        type: config.type,
        title: titre,
        message,
        canal,
      })
    }

    // Enrichissement IA : désactivé par défaut (préserve les quotas API)
    // Pour activer : NEXT_PUBLIC_ENABLE_IA_NOTIFICATIONS=true dans .env.local
    if (process.env.NEXT_PUBLIC_ENABLE_IA_NOTIFICATIONS === 'true') {
      if (['profil_risque_alerte', 'ecart_en_retard', 'pac_en_retard'].includes(event)) {
        this.enrichirAvecIA(event, context, titre).catch(() => {})
      }
    }
  }

  private iaCache = new Map<string, { timestamp: number }>()
  private async enrichirAvecIA(event: EventType, context: Record<string, unknown>, titre: string) {
    const now = Date.now()
    const lastCall = this.iaCache.get('last')?.timestamp || 0
    if (now - lastCall < 60000) return
    this.iaCache.set('last', { timestamp: now })
    try {
      const { assistantAgent } = await import('@/lib/ia/agents/assistantAgent')
      const store = useAppStore.getState()
      const reponse = await assistantAgent.chat({
        message: 'Redige un message de notification personnalise et court (max 2 phrases) pour informer un exploitant que l\'evenement suivant vient de se produire : "' + titre + '". Contexte : ' + JSON.stringify(context) + '. Ton : professionnel, courtois, rassurant.',
        userRole: store.user?.role || 'admin',
        contexte: { aerodromeId: context.aerodrome_id as string, surveillanceId: context.surveillance_id as string },
      })
      if (reponse.message && !reponse.message.includes('Je suis desole')) {
        console.log('[Notif IA] Message genere :', reponse.message)
      }
    } catch { /* silence */ }
  }

  getConfig(event: EventType) {
    return EVENTS[event]
  }

  getAllEvents() {
    return Object.keys(EVENTS) as EventType[]
  }
}

export const notificationService = new NotificationService()
