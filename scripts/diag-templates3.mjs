// scripts/diag-templates3.mjs — domaines réels dans chaque hiérarchie.
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
  url + '/rest/v1/checklist_templates?select=type,code,etat,actif,hierarchie',
  { headers: H },
)
const rows = await res.json()
const compter = (d, acc) => {
  acc.items += (d.items || []).length
  for (const sd of d.sousDomaines || []) compter(sd, acc)
  for (const sd of d.sousSousDomaines || []) compter(sd, acc)
}
for (const r of rows) {
  const h = Array.isArray(r.hierarchie) ? r.hierarchie : []
  const acc = { items: 0 }
  h.forEach((d) => compter(d, acc))
  console.log(`${r.type}_${r.code} [${r.etat}]: domaines=[${h.map((d) => d.nom).join(', ')}] items=${acc.items}`)
}
