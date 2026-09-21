// lib/store/eventBus.ts — Monolithe modulaire (synchronisation par événements)
// Bus typé, SYNCHRONE : l'émission exécute les abonnés dans l'ordre
// d'abonnement, comme un appel direct — aucun changement de timing,
// aucune promesse flottante. Les erreurs d'un abonné n'interrompent pas
// les suivants (comportement documenté + testé).
//
// Règle : un slice n'appelle jamais l'action d'un autre slice directement.
// Il ÉMET un événement du catalogue ci-dessous ; le slice propriétaire
// S'ABONNE (voir registerStoreSubscriptions dans lib/store.ts).

import type { Notification } from './notificationsSlice';
import type { Message } from './messagerieSlice';
import type { Ecart } from './ecartsSlice';
import type { RegistreEntry } from './registresSlice';

export interface StoreEventMap {
  /** Un changement métier invalide le profil de risque d'un aérodrome. */
  'risque:recalcul-demande': { aerodrome_id: string };
  /** Une surveillance transmise/archivée termine son planning lié. */
  'planning:mission-terminee': { planning_id: string; surveillance_id: string };
  /** Une surveillance supprimée restaure son planning lié à planifiée. */
  'planning:mission-annulee': { planning_id: string };
  /**
   * Demande d'envoi d'une notification (infra transverse).
   * Même charge que addNotification (sans id ni sent_at, générés par le slice).
   */
  'notification:envoyer': Omit<Notification, 'id' | 'sent_at'>;
  /** Ajouter une entrée au registre (journal append-only). */
  'registre:ajouter': RegistreEntry;
  /** Envoyer un message (canal interne ou exploitant). */
  'message:envoyer': Omit<Message, 'id' | 'created_at'>;
  /** Supprimer un utilisateur lié (cascade code d'accès). */
  'utilisateur:supprimer-lie': { user_id: string };
  /** Désactiver un utilisateur lié (repli si suppression impossible). */
  'utilisateur:desactiver': { user_id: string };
  /** Synchroniser la fiche inspecteur depuis l'utilisateur. */
  'inspecteur:synchroniser': { inspecteur_id: string; patch: Record<string, unknown> };
  /** Intégrer un écart construit ailleurs (création depuis événement). */
  'ecart:integrer-externe': Ecart;
  /** Marquer les flags de rappels envoyés d'un planning. */
  'planning:marquer-rappels': {
    planning_id: string;
    rappels: { j30?: boolean; j15?: boolean; j7?: boolean; overdue?: boolean };
  };
  /** Nettoyer le lien vers une surveillance supprimée (phase certif). */
  'certification:nettoyer-lien-surveillance': { aerodrome_id: string; surveillance_id: string };
  /** Nettoyer le lien vers une surveillance supprimée (phase homologation). */
  'homologation:nettoyer-lien-surveillance': { aerodrome_id: string; surveillance_id: string };
  /** Nettoyer le lien vers un planning supprimé (phase certif). */
  'certification:nettoyer-lien-planning': { aerodrome_id: string; planning_id: string };
  /** Nettoyer le lien vers un planning supprimé (phase homologation). */
  'homologation:nettoyer-lien-planning': { aerodrome_id: string; planning_id: string };
}

export type StoreEventName = keyof StoreEventMap;
export type StoreEventHandler<N extends StoreEventName> = (payload: StoreEventMap[N]) => void;

type AnyHandler = (payload: never) => void;

export class StoreEventBus {
  private handlers = new Map<StoreEventName, Set<AnyHandler>>();
  private warnedSync = new Set<string>();

  on<N extends StoreEventName>(name: N, handler: StoreEventHandler<N>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as AnyHandler);
    return () => {
      set!.delete(handler as AnyHandler);
    };
  }

  emit<N extends StoreEventName>(name: N, payload: StoreEventMap[N]): void {
    const set = this.handlers.get(name);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      try {
        handler(payload as never);
      } catch (error) {
        // Un abonné en panne ne doit jamais bloquer les autres ni l'émetteur.
        // Dédupliqué par message pour ne pas inonder les logs en boucle.
        const key = `${name}:${error instanceof Error ? error.message : String(error)}`;
        if (!this.warnedSync.has(key)) {
          this.warnedSync.add(key);
          console.error(`[eventBus] Abonné '${name}' en échec:`, error);
        }
      }
    }
  }

  /** Réservé aux tests : nombre d'abonnés (zéro effet de bord). */
  subscriberCount<N extends StoreEventName>(name: N): number {
    return this.handlers.get(name)?.size ?? 0;
  }

  /** Réservé aux tests : réinitialise le bus. */
  resetForTests(): void {
    this.handlers.clear();
    this.warnedSync.clear();
  }
}

/** Instance partagée (les abonnements vivent dans registerStoreSubscriptions). */
export const storeEvents = new StoreEventBus();
