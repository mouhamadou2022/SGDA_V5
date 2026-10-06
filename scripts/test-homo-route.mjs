// scripts/test-homo-route.mjs — test bout-en-bout de /api/homologations (création + nettoyage).
// Usage : node scripts/test-homo-route.mjs
import { readFileSync } from 'node:fs'

const txt = readFileSync('.env.local', 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
const get = (k) => {
  const l = txt.find((x) => x.startsWith(k + '='))
  return l ? l.slice(k.length + 1).trim().replace(/^["']|["']$/g, '') : ''
}
const url = get('NEXT_PUBLIC_SUPABASE_URL')
const key = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: key, Authorization: 'Bearer ' + key }

const base = process.env.SGDA_URL || 'http://localhost:3000'

// Aérodrome réel (contrainte FK)
const aeroRes = await fetch(`${url}/rest/v1/aerodromes?select=id,code_oaci&limit=1`, { headers: H })
const aero = (await aeroRes.json())[0]
if (!aero) {
  console.log('AUCUN AERODROME — test impossible')
  process.exit(1)
}
console.log('AERODROME:', aero.code_oaci)

// 1. Création via la route (comme le portail exploitant)
const creation = await fetch(`${base}/api/homologations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    aerodrome_id: aero.id,
    reference: 'HOMO-TEST-SMOKE',
    phase_active: 1,
    phases_data: { phase1: { statut: 'en_attente' } },
    statut_global: 'en_cours',
  }),
})
const cree = await creation.json()
console.log('CREATE:', creation.status, cree.data?.id || cree.error)
if (!cree.data?.id) process.exit(1)

// 2. Mise à jour via la route (révision / instruction)
const maj = await fetch(`${base}/api/homologations`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: cree.data.id, phases_data: { phase1: { statut: 'accuse' } } }),
})
console.log('UPDATE:', maj.status, maj.ok ? 'OK' : await maj.text())

// 3. Relecture directe (l'admin la voit-elle ?)
const lecture = await fetch(
  `${url}/rest/v1/homologations?select=id,reference&reference=eq.HOMO-TEST-SMOKE`,
  { headers: H },
)
const lignes = await lecture.json()
console.log('VISIBLE ADMIN:', Array.isArray(lignes) && lignes.length === 1 ? 'OUI' : `NON (${JSON.stringify(lignes).slice(0, 120)})`)

// 4. Nettoyage
await fetch(`${url}/rest/v1/homologations?id=eq.${cree.data.id}`, { method: 'DELETE', headers: H })
console.log('NETTOYÉ')
