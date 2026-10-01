// scripts/build-aerorisq-modelfile.mjs
// Distillation SANS entraînement : compile un Modelfile Ollama « aerorisq »
// depuis (1) les exemples validés par les utilisateurs (ia_training_dataset,
// votes 👍 ou sorties IA réelles non rejetées), puis (2) un socle curé
// intégré (rôle, règles, terminologie ANACIM).
// Usage : node scripts/build-aerorisq-modelfile.mjs [--base qwen3:8b] [--out Modelfile.aerorisq]
// Puis : ollama create aerorisq -f Modelfile.aerorisq
// Relancez ce script quand de nouveaux exemples sont validés : le modèle
// local devient concrètement « vôtre », sans GPU ni fine-tuning.

import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')

function lireEnv(cle) {
  try {
    const lignes = readFileSync(join(RACINE, '.env.local'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
    for (const l of lignes) {
      const m = l.match(new RegExp(`^${cle}=(.*)$`))
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* pas de .env.local */ }
  return process.env[cle] || ''
}

const BASE = (process.argv.find((a, i) => process.argv[i - 1] === '--base') || 'qwen3:8b').trim()
const SORTIE = process.argv.find((a, i) => process.argv[i - 1] === '--out') || 'Modelfile.aerorisq'

// Socle curé : identité, règles, terminologie — toujours présent.
const SOCLE = `Tu es AERORISQ, l'inspecteur virtuel de l'ANACIM (Agence Nationale de l'Aviation Civile et de la Météorologie du Sénégal).

RÔLE
- Tu assistes les inspecteurs : surveillance des aérodromes, certification, homologation, écarts, plans d'actions correctives (PAC), profil de risque, maturité SGS.
- Tu parles français, précis et actionnable. Tu ne fabriques jamais de référence, de constat ou de donnée.

RÈGLES DE FORME (affichage applicatif en Markdown simple, sans LaTeX)
- **gras** pour l'essentiel, listes à puces, titres ## sobres.
- Maths et symboles en clair Unicode (K, α, β, Δ, Σ, √, ≤, ≥, ×, ², ₁). JAMAIS de notation $...$ ou \\\\frac.
- Termine si utile par une question de relance courte.

DOMAINE MÉTIER
- Score de risque 0-100 (plus = meilleur), critères C1-C5 (C1 = maturité SGS : N1 Absent → N5 Efficace).
- Niveaux : critique (<40), élevé (40-60), moyen (60-80), faible (≥80).
- Domaines : SGS, PHY (pistes), OLS (obstacles), OPS (exploitation), COP (compétences), ELEC, MFP (balisage), SLI (secours-incendie), RA (animalier).
- Cycle : planning → surveillance (checklist) → écarts → PAC → suivi → clôture.`

async function chargerExemplesValides() {
  const url = lireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const cle = lireEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !cle) {
    console.log('[aerorisq] Supabase non configurée — socle curé uniquement.')
    return []
  }
  try {
    const res = await fetch(
      `${url}/rest/v1/ia_training_dataset?select=module,texte&or=(vote.eq.up,and(fallback_ia.eq.false,vote.is.null))&order=created_at.desc&limit=30`,
      { headers: { apikey: cle, Authorization: `Bearer ${cle}` }, signal: AbortSignal.timeout(20000) },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const lignes = await res.json()
    const exemples = (Array.isArray(lignes) ? lignes : [])
      .filter(r => typeof r.texte === 'string' && r.texte.trim().length > 40)
      .slice(0, 20)
    console.log(`[aerorisq] ${exemples.length} exemple(s) validé(s) récupéré(s).`)
    return exemples
  } catch (err) {
    console.log(`[aerorisq] Dataset inaccessible (${err.message}) — socle curé uniquement.`)
    return []
  }
}

function construireModelfile(exemples) {
  const nettoyer = (t) => t.replace(/"""/g, "'''").slice(0, 900)
  const fewshots = exemples.map((e, i) =>
    `\nExemple validé ${i + 1} (module ${e.module || 'général'}) — imite ce style et cette terminologie :\n---\n${nettoyer(e.texte)}\n---`).join('\n')
  return `# Modelfile AERORISQ — généré le ${new Date().toISOString().slice(0, 10)} (${exemples.length} exemples validés + socle ANACIM)
# Recréer : ollama create aerorisq -f ${SORTIE}
FROM ${BASE}

PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_ctx 32768

SYSTEM """${SOCLE}${fewshots}
"""`.trim() + '\n'
}

const exemples = await chargerExemplesValides()
const contenu = construireModelfile(exemples)
writeFileSync(join(RACINE, SORTIE), contenu, 'utf8')
console.log(`[aerorisq] Modelfile écrit : ${SORTIE} (${contenu.length} caractères, base ${BASE}).`)
console.log(`[aerorisq] Puis : ollama create aerorisq -f ${SORTIE}`)
