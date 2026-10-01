// scripts/diag-donnees.mjs — état des données liées aux checklists (lecture seule).
// Usage : node scripts/diag-donnees.mjs
import { readFileSync } from 'node:fs'

const txt = readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
const get = (k) => {
  const l = txt.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : ''
}
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: key, Authorization: 'Bearer ' + key }

async function compte(table, select = 'id') {
  const r = await fetch(`${url}/rest/v1/${table}?select=${select}`, { headers: { ...H, Prefer: 'count=exact' } })
  const range = r.headers.get('content-range') || ''
  const total = range.split('/')[1] || '?'
  const rows = await r.json().catch(() => [])
  return { total, rows: Array.isArray(rows) ? rows : [] }
}

for (const t of ['checklist_templates', 'surveillances', 'plannings', 'certifications', 'homologations', 'evenements_securite', 'ecarts']) {
  try {
    const sel = t === 'checklist_templates' ? 'id,type,code,etat,actif' : t === 'surveillances' ? 'id,statut,type' : 'id'
    const { total, rows } = await compte(t, sel)
    console.log(`${t}: ${total}`)
    if (t === 'checklist_templates') {
      for (const x of rows) console.log(`   - ${x.type}_${x.code} [${x.etat}/${x.actif ? 'actif' : 'inactif'}]`)
    }
    if (t === 'surveillances') {
      const parStatut = {}
      for (const s of rows) parStatut[s.statut || '?'] = (parStatut[s.statut || '?'] || 0) + 1
      console.log('   statuts:', JSON.stringify(parStatut))
    }
  } catch (e) {
    console.log(`${t}: ERREUR ${e.message}`)
  }
}
