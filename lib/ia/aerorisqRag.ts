// lib/ia/aerorisqRag.ts
// Boucle d'apprentissage d'AERORISQ — côté serveur.
// Le cron quotidien (aerorisq-train-langage-clair) alimente ia_training_dataset
// avec les textes validés 👍 ; ce module les relit et les injecte en few-shot
// dans les prompts LLM. Chaque vote utilisateur améliore donc concrètement les
// réponses futures : apprentissage incrémental de l'IA maison, sans fine-tuning.

export interface ExempleValide {
  module: string
  texte: string
}

// Récupère les derniers exemples fiables d'un module.
// Retourne [] silencieusement si Supabase est absent ou en erreur :
// l'apprentissage ne doit jamais bloquer une réponse IA.
export async function getExemplesValides(module?: string, limit = 3): Promise<ExempleValide[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey || !module) return []

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    // Exemples retenus : votés 👍, ou générés par IA réelle (non-fallback) sans vote négatif.
    const { data, error } = await sb
      .from('ia_training_dataset')
      .select('module, texte')
      .eq('module', module)
      .or('vote.eq.up,and(fallback_ia.eq.false,vote.is.null)')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return data.filter(
      (r): r is { module: string; texte: string } => typeof r.texte === 'string' && r.texte.length > 20
    )
  } catch {
    return []
  }
}

// Formate le bloc few-shot à injecter dans un prompt système ('' si aucun exemple).
export function formatFewShotBlock(exemples: ExempleValide[]): string {
  if (exemples.length === 0) return ''
  const lignes = exemples.map((e, i) =>
    `Exemple ${i + 1} (validé par l'utilisateur) :\n"""\n${e.texte.slice(0, 800)}\n"""`,
  )
  return [
    "[MÉMOIRE APPRISE D'AERORISQ]",
    'Réponses antérieures validées par les utilisateurs pour ce module.',
    'Imite leur style, leur niveau de détail et leur terminologie métier ;',
    'adapte toujours le contenu aux données actuelles du contexte.',
    ...lignes,
    '[FIN MÉMOIRE APPRISE]',
  ].join('\n')
}

// Raccourci : récupère + formate en un seul appel.
export async function getFewShotContext(module?: string, limit = 3): Promise<string> {
  const exemples = await getExemplesValides(module, limit)
  return formatFewShotBlock(exemples)
}
