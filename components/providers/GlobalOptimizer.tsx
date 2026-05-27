// components/providers/GlobalOptimizer.tsx
'use client';

import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { PerformanceProvider } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { Toaster } from '@/components/ui/Toaster';

// Composant qui optimise globalement les événements DOM
function GlobalEventOptimizer() {
  useEffect(() => {
    // Optimiser les événements de scroll
    const passiveHandler = { passive: true };
    
    // Appliquer passive event listeners pour améliorer le scroll
    window.addEventListener('scroll', () => {}, passiveHandler);
    window.addEventListener('wheel', () => {}, passiveHandler);
    window.addEventListener('touchmove', () => {}, passiveHandler);
    
    return () => {
      window.removeEventListener('scroll', () => {});
      window.removeEventListener('wheel', () => {});
      window.removeEventListener('touchmove', () => {});
    };
  }, []);
  
  return null;
}

function HydrationGate({ children }: { children: React.ReactNode }) {
  const hydrated = useAppStore((s) => s._hydrated)

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted/20">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-role-primary" />
          <p className="text-sm text-muted-foreground">Chargement de l'application...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function GlobalOptimizer({ children }: { children: React.ReactNode }) {
  return (
    <PerformanceProvider>
      <GlobalEventOptimizer />
      <HydrationGate>
        {children}
      </HydrationGate>
      <Toaster />
    </PerformanceProvider>
  );
}