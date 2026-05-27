'use client'

import { useEffect, useRef } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToastStore, type ToastType } from '@/lib/toast'

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-green-500" />,
  error: <XCircle className="w-5 h-5 text-red-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
}

const BG_CLASSES: Record<ToastType, string> = {
  success: 'border-l-green-500 bg-green-50 dark:bg-green-950/20',
  error: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
  warning: 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
  info: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
}

function ToastItem({ toast: t }: { toast: { id: string; type: ToastType; title?: string; message: string; duration: number } }) {
  const removeToast = useToastStore((s) => s.removeToast)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => removeToast(t.id), t.duration)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [t.id, t.duration, removeToast])

  return (
    <div
      className={`flex items-start gap-3 p-4 mb-2 rounded-lg shadow-lg border-l-4 ${BG_CLASSES[t.type]} animate-slide-right max-w-sm`}
      role="alert"
    >
      <div className="shrink-0 mt-0.5">{ICONS[t.type]}</div>
      <div className="flex-1 min-w-0">
        {t.title && <p className="text-sm font-semibold">{t.title}</p>}
        <p className="text-sm text-muted-foreground">{t.message}</p>
      </div>
      <button onClick={() => removeToast(t.id)} className="shrink-0 p-0.5 hover:bg-black/5 dark:hover:bg-white/5 rounded">
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </div>
  )
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col items-end pointer-events-none">
      <div className="pointer-events-auto space-y-1">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </div>
  )
}
