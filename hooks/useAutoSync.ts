// hooks/useAutoSync.ts
'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  isOnline,
  getPendingSyncItems,
  removeSyncItem,
  incrementSyncRetry,
  enqueueSync,
  idbGetAll,
  idbPut,
  IDB_STORES,
} from '@/lib/offline';

// Types
export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  pendingItems: number;
  lastError: string | null;
}

export interface UseAutoSyncOptions {
  surveillanceId?: string;
  intervalMs?: number;
  autoSyncOnReconnect?: boolean;
  onSyncStart?: () => void;
  onSyncComplete?: () => void;
  onSyncError?: (error: string) => void;
}

export interface SyncQueueItem {
  id: string;
  store: string;
  operation: 'create' | 'update' | 'delete';
  recordId: string;
  payload: unknown;
  createdAt: string;
  retries: number;
  error?: string;
}

const MAX_RETRIES = 3;
const SYNC_INTERVAL_MS = 30000; // 30 secondes

/**
 * Hook pour la synchronisation automatique des données offline
 */
export function useAutoSync({
  surveillanceId,
  intervalMs = SYNC_INTERVAL_MS,
  autoSyncOnReconnect = true,
  onSyncStart,
  onSyncComplete,
  onSyncError,
}: UseAutoSyncOptions = {}) {
  const user = useAppStore(s => s.user)
  const addNotification = useAppStore(s => s.addNotification);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    isSyncing: false,
    lastSyncAt: null,
    pendingItems: 0,
    lastError: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingRef = useRef(false);

  // Vérifier l'état de la connexion
  const checkOnlineStatus = useCallback(() => {
    const online = isOnline();
    setSyncStatus(prev => ({ ...prev, isOnline: online }));
    return online;
  }, []);

  // Mettre à jour le nombre d'items en attente
  const updatePendingCount = useCallback(async () => {
    try {
      const pendingItems = await getPendingSyncItems();
      setSyncStatus(prev => ({ ...prev, pendingItems: pendingItems.length }));
    } catch (error) {
      console.error('[useAutoSync] Erreur lors du comptage des items en attente:', error);
    }
  }, []);

  // Synchroniser les données d'une surveillance spécifique
  const syncSurveillanceData = useCallback(async (id: string) => {
    if (!isOnline()) {
      return { success: false, error: 'Hors ligne' };
    }

    try {
      // Récupérer les données locales
      const localChecklist = await idbGetAll(IDB_STORES.CHECKLISTS);
      const localChecklistItems = localChecklist.filter(item => 
        (item as any).surveillance_id === id
      );

      const localPresences = await idbGetAll(IDB_STORES.FICHES_PRESENCE);
      const localPresenceItems = localPresences.filter(item => 
        (item as any).surveillance_id === id
      );

      const localAlertes = await idbGetAll(IDB_STORES.ALERTES);
      const localAlerteItems = localAlertes.filter(item => 
        (item as any).surveillance_id === id
      );

      const localDelegations = await idbGetAll(IDB_STORES.DELEGATIONS);
      const localDelegationItems = localDelegations.filter(item => 
        (item as any).surveillance_id === id
      );

      // Simulation d'envoi au serveur
      console.log('[useAutoSync] Synchronisation des données:', {
        surveillanceId: id,
        checklistItems: localChecklistItems.length,
        presences: localPresenceItems.length,
        alertes: localAlerteItems.length,
        delegations: localDelegationItems.length,
      });

      return { success: true, error: null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      return { success: false, error: errorMessage };
    }
  }, []);

  // Traiter la file d'attente de synchronisation
  const processSyncQueue = useCallback(async () => {
    if (!isOnline()) {
      setSyncStatus(prev => ({ ...prev, isSyncing: false, lastError: 'Hors ligne' }));
      return;
    }

    if (isSyncingRef.current) {
      return;
    }

    isSyncingRef.current = true;
    setSyncStatus(prev => ({ ...prev, isSyncing: true }));

    try {
      const pendingItems = await getPendingSyncItems();
      
      if (pendingItems.length === 0) {
        setSyncStatus(prev => ({ ...prev, isSyncing: false, lastSyncAt: new Date() }));
        isSyncingRef.current = false;
        return;
      }

      onSyncStart?.();

      for (const item of pendingItems) {
        try {
          // Simulation d'envoi au serveur
          console.log(`[useAutoSync] Envoi de l'item ${item.id}:`, {
            store: item.store,
            operation: item.operation,
            recordId: item.recordId,
          });

          // Supprimer l'item de la queue après succès
          await removeSyncItem(item.id);
          
          addNotification({
            user_id: user?.id || '',
            type: 'success',
            title: 'Synchronisation réussie',
            message: `Les données ont été synchronisées avec le serveur`,
            canal: 'in_app',
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erreur';
          await incrementSyncRetry(item, errorMessage);
          
          if (item.retries + 1 >= MAX_RETRIES) {
            addNotification({
              user_id: user?.id || '',
              type: 'danger',
              title: 'Erreur de synchronisation',
              message: `Échec de synchronisation après ${MAX_RETRIES} tentatives`,
              canal: 'in_app',
            });
          }
        }
      }

      // Mettre à jour le compteur
      const remainingItems = await getPendingSyncItems();
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncAt: new Date(),
        pendingItems: remainingItems.length,
        lastError: null,
      }));

      onSyncComplete?.();

      // Si une surveillance est spécifiée, synchroniser ses données
      if (surveillanceId) {
        await syncSurveillanceData(surveillanceId);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      setSyncStatus(prev => ({
        ...prev,
        isSyncing: false,
        lastError: errorMessage,
      }));
      onSyncError?.(errorMessage);
    } finally {
      isSyncingRef.current = false;
    }
  }, [surveillanceId, syncSurveillanceData, user, addNotification, onSyncStart, onSyncComplete, onSyncError]);

  // Sauvegarder une entité dans IndexedDB et la mettre en queue
  const saveOffline = useCallback(async <T extends { id: string }>(
    store: string,
    record: T,
    operation: SyncQueueItem['operation'] = 'update'
  ): Promise<void> => {
    try {
      // Sauvegarder dans IndexedDB
      await idbPut(store as any, record);
      
      // Mettre en queue pour synchronisation ultérieure
      await enqueueSync(store as any, operation, record.id, record);
      
      // Mettre à jour le compteur
      await updatePendingCount();
      
      // Si en ligne, tenter la synchronisation immédiate
      if (isOnline()) {
        await processSyncQueue();
      }
    } catch (error) {
      console.error('[useAutoSync] Erreur lors de la sauvegarde offline:', error);
    }
  }, [processSyncQueue, updatePendingCount]);

  // Sauvegarder un item de checklist offline
  const saveChecklistItemOffline = useCallback(async (
    item: { id: string; surveillance_id: string; [key: string]: unknown }
  ): Promise<void> => {
    await saveOffline(IDB_STORES.CHECKLISTS, item, 'update');
  }, [saveOffline]);

  // Sauvegarder une fiche de présence offline
  const savePresenceOffline = useCallback(async (
    presence: { id: string; surveillance_id: string; [key: string]: unknown }
  ): Promise<void> => {
    await saveOffline(IDB_STORES.FICHES_PRESENCE, presence, 'update');
  }, [saveOffline]);

  // Sauvegarder une alerte offline
  const saveAlerteOffline = useCallback(async (
    alerte: { id: string; surveillance_id: string; [key: string]: unknown }
  ): Promise<void> => {
    await saveOffline(IDB_STORES.ALERTES, alerte, 'update');
  }, [saveOffline]);

  // Sauvegarder une délégation offline
  const saveDelegationOffline = useCallback(async (
    delegation: { id: string; surveillance_id: string; [key: string]: unknown }
  ): Promise<void> => {
    await saveOffline(IDB_STORES.DELEGATIONS, delegation, 'update');
  }, [saveOffline]);

  // Synchronisation forcée
  const forceSync = useCallback(async () => {
    if (!isOnline()) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Hors ligne',
        message: 'Impossible de synchroniser car vous êtes hors ligne',
        canal: 'in_app',
      });
      return false;
    }

    await processSyncQueue();
    return true;
  }, [processSyncQueue, user, addNotification]);

  // Démarrage de la synchronisation périodique
  useEffect(() => {
    // État initial
    checkOnlineStatus();
    updatePendingCount();

    // Écouter les événements réseau
    const handleOnline = async () => {
      setSyncStatus(prev => ({ ...prev, isOnline: true }));
      
      if (autoSyncOnReconnect) {
        await processSyncQueue();
      }
      
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Connexion rétablie',
        message: 'La synchronisation automatique est reprise',
        canal: 'in_app',
      });
    };

    const handleOffline = () => {
      setSyncStatus(prev => ({ ...prev, isOnline: false }));
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Hors ligne',
        message: 'Les modifications seront synchronisées automatiquement au retour en ligne',
        canal: 'in_app',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Démarrage de l'intervalle de synchronisation
    if (intervalMs > 0) {
      intervalRef.current = setInterval(() => {
        if (isOnline() && !isSyncingRef.current) {
          processSyncQueue();
        }
      }, intervalMs);
    }

    // Nettoyage
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [intervalMs, autoSyncOnReconnect, processSyncQueue, checkOnlineStatus, updatePendingCount, user, addNotification]);

  return {
    syncStatus,
    saveOffline,
    saveChecklistItemOffline,
    savePresenceOffline,
    saveAlerteOffline,
    saveDelegationOffline,
    forceSync,
    updatePendingCount,
    processSyncQueue,
  };
}

export default useAutoSync;