// scripts/test-pilote-tools.mjs — smoke test du function-calling d'aerorisq.
// Usage : node scripts/test-pilote-tools.mjs
const res = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'aerorisq',
    messages: [{ role: 'user', content: 'Quel est le profil de risque de GOOY ?' }],
    tools: [{
      type: 'function',
      function: {
        name: 'consulter_profil_risque',
        description: 'Profil de risque actuel',
        parameters: { type: 'object', properties: { site: { type: 'string' } }, required: ['site'] },
      },
    }],
    stream: false,
    options: { temperature: 0.2 },
  }),
  signal: AbortSignal.timeout(180000),
})
const data = await res.json()
console.log('CONTENT:', JSON.stringify(data.message?.content || ''))
console.log('TOOLS:', JSON.stringify(data.message?.tool_calls || []))
