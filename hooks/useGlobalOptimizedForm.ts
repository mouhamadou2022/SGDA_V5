// hooks/useGlobalOptimizedForm.ts
'use client';

import { useCallback, useRef } from 'react';
import { useForm, UseFormProps } from 'react-hook-form';

function useDebouncedCallback<T extends (...args: any[]) => any>(fn: T, delay: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback((...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export function useGlobalOptimizedForm<T extends Record<string, any>>(
  props?: UseFormProps<T>
) {
  const form = useForm<T>(props);

  // Debouncer les validateurs
  const triggerDebounced = useDebouncedCallback(
    async (name?: string) => form.trigger(name as any),
    300
  );

  // Optimiser les changements de valeur
  const handleChange = (field: keyof T, value: any) => {
    form.setValue(field as any, value, { shouldDirty: true, shouldValidate: false });
    triggerDebounced(field as string);
  };

  return {
    ...form,
    handleChange,
    triggerDebounced,
  };
}
