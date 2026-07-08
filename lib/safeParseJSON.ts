// lib/safeParseJSON.ts
// Stratégies de récupération de parsing JSON pour les réponses LLM

function extractBalancedJSON(text: string): string | null {
  let depth = 0
  let start = -1
  let inString = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') {
      if (start === -1) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) return text.slice(start, i + 1)
    }
  }
  return null
}

export function safeParseJSON<T>(content: string): T | null {
  const tentatives: Array<() => T | null> = [
    // Direct parse
    () => JSON.parse(content),
    // Bloc markdown ```json ... ```
    () => {
      const m = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      return m ? JSON.parse(m[1]) : null
    },
    // Premier objet JSON { ... } — extraction par comptage d'accolades (supporte l'imbrication)
    () => {
      const json = extractBalancedJSON(content)
      return json ? JSON.parse(json) : null
    },
    // Réparation JSON tronqué : ferme les guillemets/accolades/crochets manquants
    () => {
      let fixed = content.trim()
      const stack: string[] = []
      let inString = false
      let escape = false
      for (const ch of fixed) {
        if (escape) { escape = false; continue }
        if (ch === '\\') { escape = true; continue }
        if (ch === '"') { inString = !inString; continue }
        if (inString) continue
        if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']')
        if (ch === '}' || ch === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop()
        }
      }
      if (inString) fixed += '"'
      for (let i = stack.length - 1; i >= 0; i--) fixed += stack[i]
      return JSON.parse(fixed)
    },
  ]

  for (const t of tentatives) {
    try {
      const parsed = t()
      if (parsed !== null) return parsed as T
    } catch {
      continue
    }
  }

  return null
}
