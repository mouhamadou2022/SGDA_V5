// scripts/diag-templates2.mjs — conformité des templates à la classification (lecture seule).
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
  url + '/rest/v1/checklist_templates?select=type,code,nom,version,etat,actif,nature,categorie,regime,portee,type_entite_cible,sous_type_entite,source_fichier&order=type,code',
  { headers: H },
)
const rows = await res.json()
for (const r of rows) {
  console.log(`--- ${r.type}_${r.code} [${r.etat}/${r.actif ? 'actif' : 'inactif'}]`)
  console.log(`    nom=${(r.nom || '').slice(0, 60)} version=${r.version || '—'}`)
  console.log(`    nature=${r.nature || 'NULL'} categorie=${r.categorie || 'NULL'} regime=${r.regime || 'NULL'}`)
  console.log(`    portee=${JSON.stringify(r.portee)} entite=${r.type_entite_cible || 'NULL'} sous=${r.sous_type_entite || 'NULL'} src=${r.source_fichier || 'NULL'}`)
}
