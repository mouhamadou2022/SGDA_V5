// lib/performance/globalOptimizer.ts
'use client';

import React, { useEffect, useRef, createContext, useContext, ReactNode, useState, useCallback, useTransition, useMemo } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore, type AppStore } from '@/lib/store';

// ============================================================
// 1. CACHE DE MODULES (pour navigation instantanée)
// ============================================================
const moduleCache = new Map<string, React.ReactNode>();
const moduleLoadingQueue = new Map<string, Promise<React.ReactNode>>();

export async function getCachedModule(
  key: string, 
  loader: () => Promise<{ default: React.ComponentType<any> }>,
  props: any
): Promise<React.ReactNode> {
  if (moduleCache.has(key)) {
    return moduleCache.get(key)!;
  }
  
  if (moduleLoadingQueue.has(key)) {
    return moduleLoadingQueue.get(key)!;
  }
  
  const promise = loader().then(module => {
    const element = React.createElement(module.default, props);
    moduleCache.set(key, element);
    moduleLoadingQueue.delete(key);
    return element;
  });
  
  moduleLoadingQueue.set(key, promise);
  return promise;
}

// ============================================================
// 2. HOOK STORE OPTIMISÉ
// ============================================================
export function useOptimizedStore<T>(selector: (state: AppStore) => T): T {
  return useAppStore(useShallow(selector));
}

export const useAerodromesOptimized = () => 
  useOptimizedStore(state => state.aerodromes);

export const useProfilsRisqueOptimized = () => 
  useOptimizedStore(state => state.profilsRisque);

export const useSurveillancesOptimized = () => 
  useOptimizedStore(state => state.surveillances);

export const useEcartsOptimized = () => 
  useOptimizedStore(state => state.ecarts);

// ============================================================
// 3. DEBOUNCE GLOBAL
// ============================================================
export function useGlobalDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  
  return debouncedValue;
}

// ============================================================
// 4. TRANSITION GLOBALE
// ============================================================
export function useGlobalTransition() {
  const [isPending, startTransition] = useTransition();
  return { isPending, startTransition };
}

// ============================================================
// 5. COMPOSANT LAZY LOAD
// ============================================================
export function LazyLoad({ 
  children, 
  fallback 
}: { 
  children: React.ReactNode; 
  fallback?: React.ReactNode 
}) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    
    const element = ref.current;
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);
  
  
  // eslint-disable-next-line react-hooks/refs
  return React.createElement('div', { ref },
    isVisible ? children : (fallback || React.createElement('div', { className: 'min-h-[200px]' }))
  );
}

// ============================================================
// 6. CACHE DE DONNÉES
// ============================================================
const dataCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL
): Promise<T> {
  const cached = dataCache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }
  
  const data = await fetcher();
  dataCache.set(key, { data, expiry: Date.now() + ttl });
  return data;
}

export function invalidateCache(key?: string) {
  if (key) {
    dataCache.delete(key);
  } else {
    dataCache.clear();
  }
}

// ============================================================
// 7. PROVIDER GLOBAL DE PERFORMANCE
// ============================================================
const PerformanceContext = createContext<{
  mark: (name: string) => void;
  measure: (name: string, fn: () => void) => void;
}>({ mark: () => {}, measure: (_, fn) => fn() });

export function PerformanceProvider({ children }: { children: ReactNode }) {
  const marks = useRef<Map<string, number>>(new Map());
  
  const mark = (name: string) => {
    if (process.env.NODE_ENV === 'development') {
      marks.current.set(name, performance.now());
    }
  };
  
  const measure = (name: string, fn: () => void) => {
    if (process.env.NODE_ENV === 'development') {
      const start = performance.now();
      fn();
      console.log(`⚡ [Perf] ${name}: ${(performance.now() - start).toFixed(2)}ms`);
    } else {
      fn();
    }
  };
  
  const ctxValue = useMemo(() => ({ mark, measure }), []);
  // eslint-disable-next-line react-hooks/refs
  return React.createElement(PerformanceContext.Provider, { value: ctxValue }, children);
}

export const usePerformance = () => useContext(PerformanceContext);