// scripts/test-local-json.mjs — le local tient-il un appel JSON raisonnable ?
const t0 = Date.now()
const res = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'aerorisq',
    messages: [{ role: 'user', content: 'Réponds en JSON strict : {"statut": "ok", "note": "test"}. Rien d’autre.' }],
    format: 'json',
    stream: false,
    keep_alive: '30m',
    options: { temperature: 0.1, num_ctx: 8192 },
  }),
  signal: AbortSignal.timeout(180000),
})
const data = await res.json()
console.log('HTTP:', res.status, `(${(Date.now() - t0) / 1000}s)`)
console.log('CONTENT:', (data.message?.content || '').slice(0, 200))
