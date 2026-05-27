'use client'

export function useFormProgress(
  values: Record<string, unknown>,
  required: string[]
): number {
  if (!required.length) return 0
  const filled = required.filter(key => {
    const v = values[key]
    if (v === null || v === undefined || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return true
  })
  return Math.round((filled.length / required.length) * 100)
}
