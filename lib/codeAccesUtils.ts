// lib/codeAccesUtils.ts
// Utilitaires pour la génération et la validation des codes d'accès exploitant.
// Format officiel : OACI-ROLE-LLLLL9999
//   OACI  = code OACI de l'aérodrome (4 lettres, ex: GOBD)
//   ROLE  = identifiant du type d'accès (DG, FP, ST)
//   LLLLL = 5 lettres majuscules aléatoires (sans ambigus O/I/0/1)
//   9999  = 4 chiffres aléatoires
// Exemple : GOBD-DG-ABCDE1234

// ── Alphabets ────────────────────────────────────────────────────────────────
// On exclut O, I (confus avec 0 et 1) et les caractères ambigus
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ'  // 23 lettres
const DIGITS = '23456789'                  // 8 chiffres (sans 0 et 1)

// ── Types de codes ───────────────────────────────────────────────────────────
export const CODE_TYPES: { id: string; label: string; description: string }[] = [
  { id: 'DG',  label: 'Directeur Général',      description: 'Accès direction — consultation stratégique' },
  { id: 'FP',  label: 'Point Focal',             description: 'Accès opérationnel complet — toutes actions' },
  { id: 'ST',  label: 'Personnel exploitant',    description: 'Accès consultation — événements et documentation' },
]

// ── Génération ────────────────────────────────────────────────────────────────

function randomChars(alphabet: string, length: number): string {
  return Array.from(
    { length },
    () => alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join('')
}

/**
 * Génère un code au format OACI-ROLE-LLLLL9999
 * @param codeOaci   Code OACI de l'aérodrome (ex: "GOBD")
 * @param codeType   Identifiant de rôle (ex: "DG")
 */
function genererCode(codeOaci: string, codeType: string): string {
  const oaci = (codeOaci || 'XXXX').toUpperCase().slice(0, 4).padEnd(4, 'X')
  const role = (codeType || 'FP').toUpperCase()
  const lettres = randomChars(ALPHA, 5)
  const chiffres = randomChars(DIGITS, 4)
  return `${oaci}-${role}-${lettres}${chiffres}`
}

/**
 * Génère un code unique en évitant les collisions avec les codes existants.
 * Tente jusqu'à 20 fois — la probabilité de collision est négligeable
 * (23^5 × 8^4 = ~2.7 milliards de combinaisons par type).
 */
function genererCodeUnique(
  codesExistants: string[],
  codeOaci: string,
  codeType: string
): string {
  const existingSet = new Set(codesExistants)
  for (let i = 0; i < 20; i++) {
    const code = genererCode(codeOaci, codeType)
    if (!existingSet.has(code)) return code
  }
  // Fallback avec timestamp si collision persistante (très improbable)
  return `${codeOaci}-${codeType}-${randomChars(ALPHA, 3)}${Date.now().toString().slice(-4)}`
}

// ── Masquage ──────────────────────────────────────────────────────────────────

/**
 * Masque un code pour affichage public.
 * GOBD-DG-ABCDE1234  →  GOBD-DG-*****
 * Conserve le préfixe OACI-ROLE lisible pour identification, masque le secret.
 */
function masquerCode(code: string): string {
  if (!code) return '****-**-*****'
  const parts = code.split('-')
  // Format attendu : ['GOBD', 'DG', 'ABCDE1234']
  if (parts.length >= 3) {
    return `${parts[0]}-${parts[1]}-${'*'.repeat(parts.slice(2).join('-').length)}`
  }
  // Fallback : masquer tout sauf les 4 premiers caractères
  return code.slice(0, 4) + '*'.repeat(Math.max(0, code.length - 4))
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Valide le format d'un code (avant vérification en base).
 * Retourne true si le code respecte le format OACI-ROLE-LLLLL9999.
 */
function validerFormatCode(code: string): boolean {
  if (!code) return false
  // Format : 4 lettres - 2-3 lettres - 5 lettres + 4 chiffres
  return /^[A-Z]{4}-[A-Z]{2,3}-[A-Z]{5}[0-9]{4}$/.test(code.trim().toUpperCase())
}

/**
 * Normalise un code saisi par l'utilisateur (trim + uppercase + tirets).
 */
function normaliserCode(code: string): string {
  return code.trim().toUpperCase()
}

// ── Export ────────────────────────────────────────────────────────────────────

export const codeAccesUtils = {
  genererCode,
  genererCodeUnique,
  masquerCode,
  validerFormatCode,
  normaliserCode,
}
