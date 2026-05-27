// hooks/useNotifications.ts
'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/lib/store';

export function useNotifications(userId?: string) {
  const notifications = useAppStore(s => s.notifications)
  const unreadCount = useAppStore(s => s.unreadCount)
  const markAsRead = useAppStore(s => s.markAsRead)
  const markAllAsRead = useAppStore(s => s.markAllAsRead);

  // Marquer comme lu automatiquement après 5 secondes (optionnel)
  useEffect(() => {
    if (!userId) return;

    const timer = setTimeout(() => {
      notifications.forEach(notif => {
        if (!notif.read_at) {
          markAsRead(notif.id);
        }
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, [notifications, userId, markAsRead]);

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  };
}