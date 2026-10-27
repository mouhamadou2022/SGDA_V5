// scripts/clean-references.ts
// Nettoyage unique des références de questions en base :
//  - retire des questions les numéros d'items restés en tête (« 11 la pente … »)
//  - intègre ces numéros à la référence (« IT1.2.11 »)
//  - renumérote les références vides ou dupliquées
//
// Usage :
//   npx ts-node --transpile-only scripts/clean-references.ts           (simulation)
//   npx ts-node --transpile-only scripts/clean-references.ts --apply   (écriture)
//
// Une sauvegarde JSON des lignes modifiées est écrite avant toute écriture.

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { normaliserQuestionsEtReferences } from '../lib/checklistNumerotation'

const RACINE = join(__dirname, '..')

function chargerEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (const ligne of readFileSync(join(RACINE, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = ligne.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* ignore */ }
  return out
}

const env = chargerEnv()
const URL_BASE = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const CLE = env.SUPABASE_SERVICE_ROLE_KEY || ''
const APPLIQUER = process.argv.includes('--apply')
const ECHANTILLON = process.argv.includes('--sample')

if (!URL_BASE || !CLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants dans .env.local')
  process.exit(1)
}

const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' }

async function lire(table: string, select: string): Promise<any[]> {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=${select}`, { headers: entetes })
  if (!res.ok) throw new Error(`${table} → ${res.status} ${await res.text()}`)
  return res.json() as Promise<any[]>
}

async function ecrire(table: string, id: string, patch: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...entetes, Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`${table}/${id} → ${res.status} ${await res.text()}`)
  return res.status
}

async function main() {
  const [templates, plannings] = await Promise.all([
    lire('checklist_templates', 'id,code,hierarchie'),
    lire('plannings', 'id,statut,checklist_hierarchy'),
  ])

  const sauvegarde: any[] = []
  const bilan: string[] = []
  let totalQuestions = 0
  let totalRenommes = 0
  let lignesTouchees = 0

  const traiter = async (table: string, id: string, label: string, arbre: any[], colonne: string) => {
    if (!Array.isArray(arbre) || arbre.length === 0) return
    const { domaines, questionsNettoyees, renommes } = normaliserQuestionsEtReferences(arbre)
    if (questionsNettoyees === 0 && renommes === 0) return
    lignesTouchees++
    totalQuestions += questionsNettoyees
    totalRenommes += renommes
    bilan.push(`${label} : ${questionsNettoyees} question(s) nettoyée(s), ${renommes} référence(s) renumérotée(s)`)
    if (ECHANTILLON) {
      let n = 0
      const montrer = (avantNoeuds: any[], apresNoeuds: any[]) => (avantNoeuds || []).forEach((noeud, i) => {
        const apresNoeud = (apresNoeuds || [])[i] || {}
        const avItems = noeud.items || []
        const apItems = apresNoeud.items || []
        avItems.forEach((av: any, j: number) => {
          const apres: any = apItems[j] || {}
          if (n < 8 && (av.point_verification !== apres.point_verification || av.numero !== apres.numero)) {
            n++
            console.log(`  [${label}] ${av.numero} → ${apres.numero}\n    « ${String(av.point_verification).slice(0, 90)} »\n    « ${String(apres.point_verification).slice(0, 90)} »`)
          }
        })
        montrer(noeud.sousDomaines || [], apresNoeud.sousDomaines || [])
        montrer(noeud.sousSousDomaines || [], apresNoeud.sousSousDomaines || [])
      })
      montrer(arbre, domaines)
    }
    sauvegarde.push({ table, id, colonne, valeur: arbre })
    if (APPLIQUER) await ecrire(table, id, { [colonne]: domaines })
  }

  for (const t of templates) await traiter('checklist_templates', t.id, `template ${t.code || t.id}`, t.hierarchie, 'hierarchie')
  for (const p of plannings) await traiter('plannings', p.id, `planning ${p.id} (${p.statut || '?'})`, p.checklist_hierarchy, 'checklist_hierarchy')

  const dossier = join(RACINE, '..', 'AppData', 'Local', 'Temp', 'opencode')
  try { mkdirSync(dossier, { recursive: true }) } catch { /* ignore */ }
  const fichier = join(dossier, `sauvegarde-references-${Date.now()}.json`)
  writeFileSync(fichier, JSON.stringify(sauvegarde, null, 1), 'utf8')

  console.log(bilan.join('\n') || 'Aucune référence à corriger.')
  console.log(`\n${lignesTouchees} ligne(s), ${totalQuestions} question(s), ${totalRenommes} référence(s).`)
  console.log(`Sauvegarde : ${fichier}`)
  console.log(APPLIQUER ? 'Écriture effectuée.' : 'Simulation uniquement (ajouter --apply pour écrire).')
}

main().catch(e => { console.error(e); process.exit(1) })
