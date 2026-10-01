// scripts/diag-pac2.mjs — structure réelle de evaluation_pac (lecture seule).
import { readFileSync } from 'node:fs'

const txt = readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
const get = (k) => {
  const l = txt.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : ''
}
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: key, Authorization: 'Bearer ' + key }

const res = await fetch(
  url + '/rest/v1/ecarts?select=reference,evaluation_pac&limit=5',
  { headers: H },
)
const rows = await res.json()
for (const r of rows.slice(0, 3)) {
  console.log('===', r.reference)
  console.log(JSON.stringify(r.evaluation_pac, null, 1)?.slice(0, 800))
}
