// scripts/diag-tables.mjs — vérifie les tables d'apprentissage (lecture seule).
import { readFileSync } from 'node:fs'

const txt = readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
const get = (k) => {
  const l = txt.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : ''
}
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: key, Authorization: 'Bearer ' + key }

for (const t of ['prediction_suivi', 'ia_training_dataset', 'ml_samples']) {
  const r = await fetch(`${url}/rest/v1/${t}?select=id&limit=1`, { headers: H })
  console.log(`${t}: ${r.ok ? 'OK' : `ABSENTE (${r.status})`}`)
}
