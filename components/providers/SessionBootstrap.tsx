// components/providers/SessionBootstrap.tsx
// 'use client'
// Composant racine (monté dans GlobalOptimizer, donc sur TOUTES les pages,
// y compris en accès direct sans passer par l'accueil).
//
// Corrige deux problèmes liés à la session :
// 1. Le user n'est PAS persisté dans Zustand (absent du `partialize`) et n'était
//    restauré depuis localStorage('sgda_user') que sur l'accueil (app/page.tsx).
//    Sur un hard-refresh direct vers une page (ex: /surveillance/[id]/ecarts),
//    personne ne chargeait le user → data-role jamais posé sur <body> → les
//    variables CSS de rôle (--role-primary, etc.) étaient indéfinies → fonds et
//    couleurs disparaissaient jusqu'à repasser par l'accueil.
// 2. Cette restauration globale garantit aussi que les drapeaux de permission
//    (userRole, canEdit…) sont renseignés sur toutes les pages.
import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import type { AuthUser } from '@/lib/auth';

const SGDA_USER_KEY = 'sgda_user';

export function SessionBootstrap() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);
  const restoredRef = useRef(false);

  // 1) Restaurer la session depuis localStorage si le store n'a pas de user.
  //    Idempotent : une seule tentative, ne fait rien si déjà présent.
  useEffect(() => {
    if (restoredRef.current) return;
    if (user) { restoredRef.current = true; return; }
    restoredRef.current = true;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(SGDA_USER_KEY) : null;
    if (stored) {
      try {
        const u = JSON.parse(stored) as AuthUser;
        if (u?.id && u?.role) setUser(u);
      } catch {
        window.localStorage.removeItem(SGDA_USER_KEY);
      }
    }
  }, [user, setUser]);

  // 2) Poser data-role sur <body> de façon idempotente dès que le rôle est connu.
  //    Exécuté après CHAQUE rendu (sans tableau de dép) : certaines pages retirent
  //    l'attribut via un cleanup dans leur propre useEffect ; ici on le ré-applique
  //    systématiquement pour que les couleurs ne disparaissent jamais de façon durable.
  //    setAttribute identique = no-op, coût négligeable.
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
    }
  });

  return null;
}
