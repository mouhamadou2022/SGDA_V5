'use client'

import { useState, useEffect, useRef } from 'react'

interface AerorisqResult {
  message: string
}

export function useAerorisqText(prompt: string, moduleKey?: string) {
  const [result, setResult] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef(0)

  useEffect(() => {
    const id = ++ref.current

    async function doFetch() {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/ia/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: prompt,
            contexte: { module: moduleKey || 'aerorisq-portal' },
          }),
        })

        if (!res.ok) throw new Error('Erreur API')

        const data: AerorisqResult = await res.json()
        if (ref.current === id) setResult(data.message)
      } catch (e) {
        if (ref.current === id) setError((e as Error).message)
      } finally {
        if (ref.current === id) setIsLoading(false)
      }
    }

    doFetch()
  }, [prompt, moduleKey])

  return { result, isLoading, error }
}
