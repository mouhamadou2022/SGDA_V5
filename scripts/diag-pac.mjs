// scripts/diag-pac.mjs — états PAC des écarts (lecture seule).
// Usage : node scripts/diag-pac.mjs
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
  url + '/rest/v1/ecarts?select=id,reference,libelle,statut,niveau_risque,surveillance_id,aerodrome_id,pac,evaluation_pac&order=reference',
  { headers: H },
)
const rows = await res.json()
console.log('TOTAL ECARTS:', rows.length)
const parSurv = {}
for (const e of rows) parSurv[e.surveillance_id || '(sans surveillance)'] = (parSurv[e.surveillance_id || '(sans surveillance)'] || 0) + 1
console.log('PAR SURVEILLANCE:', JSON.stringify(parSurv, null, 1))
// Doublons : même libellé
const parLib = {}
for (const e of rows) {
  const k = (e.libelle || '').trim().toLowerCase().slice(0, 80)
  if (!parLib[k]) parLib[k] = []
  parLib[k].push(e.reference)
}
const doublons = Object.entries(parLib).filter(([, v]) => v.length > 1)
console.log('DOUBLONS LIBELLÉ:', doublons.length)
for (const [k, v] of doublons.slice(0, 10)) console.log(`   "${k.slice(0, 60)}" → ${v.join(', ')}`)
// États : pac évalué ou non
for (const e of rows) {
  const evalPac = e.evaluation_pac
  const aNote = evalPac && (evalPac.note_pertinence != null || evalPac.note_exhaustivite != null)
  const pacSoumis = e.pac && e.pac.actions && e.pac.actions.length > 0
  console.log(`${e.reference} | ${e.statut} | ${e.niveau_risque} | PAC:${pacSoumis ? 'soumis' : '—'} | ÉVAL:${aNote ? 'oui' : 'NON'} | ${(e.libelle || '').slice(0, 50)}`)
}
