// scripts/diag-pac3.mjs — clés de evaluation_pac sur les 40 écarts.
import { readFileSync } from 'node:fs'

const txt = readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
const get = (k) => {
  const l = txt.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : ''
}
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: key, Authorization: 'Bearer ' + key }

const res = await fetch(url + '/rest/v1/ecarts?select=reference,evaluation_pac&order=reference', { headers: H })
const rows = await res.json()
let avecEval = 0
for (const r of rows) {
  const ev = r.evaluation_pac
  const keys = ev && typeof ev === 'object' ? Object.keys(ev).join(',') : String(ev)
  if (ev) {
    avecEval++
    console.log(`${r.reference} → ${keys}`.slice(0, 160))
  }
}
console.log(`\nAVEC evaluation_pac: ${avecEval}/${rows.length}`)
const sans = rows.filter((r) => !r.evaluation_pac).map((r) => r.reference)
console.log('SANS:', sans.join(', '))
