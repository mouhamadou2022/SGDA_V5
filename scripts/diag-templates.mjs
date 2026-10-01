// scripts/diag-templates.mjs — diagnostic lecture seule : états des templates.
// Usage : node scripts/diag-templates.mjs
import { readFileSync } from 'node:fs'

const txt = readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
const get = (k) => {
  const l = txt.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : ''
}
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
const res = await fetch(url + '/rest/v1/checklist_templates?select=etat,actif,type,code,created_by', {
  headers: { apikey: key, Authorization: 'Bearer ' + key },
})
const rows = await res.json()
if (!Array.isArray(rows)) {
  console.log('ERREUR:', JSON.stringify(rows).slice(0, 300))
  process.exit(1)
}
const parEtat = {}
for (const x of rows) {
  const k = (x.etat || '?') + '/' + (x.actif ? 'actif' : 'inactif')
  parEtat[k] = (parEtat[k] || 0) + 1
}
console.log('TOTAL:', rows.length)
console.log(JSON.stringify(parEtat, null, 1))
console.log('SANS-CREATEUR:', rows.filter((x) => !x.created_by).length)
const brouillons = rows.filter((x) => x.etat === 'brouillon')
console.log('BROUILLONS:', brouillons.map((b) => `${b.type}_${b.code}`).join(', ') || '(aucun)')
