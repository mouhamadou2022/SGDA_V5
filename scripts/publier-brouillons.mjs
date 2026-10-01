// scripts/publier-brouillons.mjs — publie les brouillons (brouillon → publie).
// Usage : node scripts/publier-brouillons.mjs [TYPE_CODE...] (sans args = tous les brouillons actifs)
import { readFileSync } from 'node:fs'

const txt = readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
const get = (k) => {
  const l = txt.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : ''
}
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }

const cibles = process.argv.slice(2)
const res = await fetch(url + '/rest/v1/checklist_templates?select=id,type,code,etat&etat=eq.brouillon&actif=eq.true', { headers: H })
const rows = await res.json()
for (const r of rows) {
  const theme = `${r.type}_${r.code}`
  if (cibles.length > 0 && !cibles.includes(theme)) continue
  const up = await fetch(url + `/rest/v1/checklist_templates?id=eq.${r.id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ etat: 'publie' }),
  })
  console.log(theme, '→', up.ok ? 'PUBLIÉ' : `ÉCHEC ${up.status}`)
}
