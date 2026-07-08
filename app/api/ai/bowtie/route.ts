// app/api/ai/bowtie/route.ts
// Analyse Bow-Tie HIRM contextualisée via Groq avec fallback déterministe
// Recoit les données réelles d'un domaine → retourne danger, barrières, scénario, conséquence

import { NextRequest, NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'
import { generateDomaineBowTie } from '@/lib/risque/bowTieEngine'
import type { GenerateBowTieParams } from '@/lib/risque/bowTieEngine'

const SYSTEM_PROMPT = `Tu es un expert HIRM (Safety Management System) pour l'ANACIM Sénégal.
À partir des données réelles d'un domaine de sécurité aérodrome, tu génères une analyse Bow-Tie contextualisée.

Analyse :
1. Le DANGER réel à partir des écarts, événements, inspections
2. La DÉFAILLANCE technique ou organisationnelle sous-jacente
3. Le SCÉNARIO d'incident le plus probable
4. La CONSÉQUENCE la plus grave envisageable
5. Les BARRIÈRES PRÉVENTIVES existantes et leur efficacité réelle estimée
6. Les BARRIÈRES CORRECTIVES recommandées (action concrètes, pas génériques)

Règles :
- Utilise UNIQUEMENT les données fournies — ne PAS inventer de faits
- Les barrières doivent être 2-3 préventives et 2-3 correctives, concrètes
- Efficacité : 0-100%, basée sur les vrais scores (C1-C5) et données terrain
- Scénario : cohérent avec le domaine + les écarts réels
- Écris en français technique aéronautique pour inspecteur ANACIM
- Ne pas utiliser de métriques internes (pas de C1,C5 dans le texte)
- Chaque barrière doit avoir un nom explicite et une remarque factuelle
- Si les données sont minimales, reste prudent dans l'analyse

Réponds UNIQUEMENT un objet JSON avec :
{
  "danger": "description concise du danger",
  "defaillance": "défaillance sous-jacente",
  "scenario": "scénario d'incident probable",
  "consequence": "conséquence la plus grave",
  "barrieresPreventives": [
    { "nom": "...", "efficacite": 0-100, "remarque": "..." }
  ],
  "barrieresCorrectives": [
    { "nom": "...", "efficacite": 0-100, "remarque": "..." }
  ]
}`

export async function POST(req: NextRequest) {
  let params: GenerateBowTieParams & { aerodrome_nom?: string } = { domaine: '', scoreGlobal: 50, c1: 50, c2: 50, c3: 50, c5: 50, ecartsDom: [], surveillancesDom: [] }
  try {
    const body = await req.json()
    params = { ...params, ...body }

    if (!params.domaine) {
      return NextResponse.json({ error: 'Missing domaine' }, { status: 400 })
    }

    const ecartsResume = params.ecartsDom?.length
      ? params.ecartsDom.map(e => `- ${e.niveau_risque}: ${e.libelle?.slice(0, 100) || 'n/a'} (statut ${e.statut})`).join('\n')
      : 'Aucun écart actif'

    const evenementsResume = params.evenementsDom?.length
      ? params.evenementsDom.map(e => `- [${e.gravite}] ${e.type}: ${e.description?.slice(0, 100) || 'n/a'} (${e.date})`).join('\n')
      : 'Aucun événement'

    const inspectionsResume = params.surveillancesDom?.length
      ? `${params.surveillancesDom.length} inspection(s) réalisée(s)`
      : 'Aucune inspection récente'

    const userPrompt = `Analyse Bow-Tie pour le domaine "${params.domaine}" (${params.aerodrome_nom || 'aérodrome'}).

Scores réels :
- Score global: ${params.scoreGlobal}/100
- C1 (SGS): ${params.c1}/100
- C2 (PAC): ${params.c2}/100
- C3 (Maint.): ${params.c3}/100
- C5 (Sécurité): ${params.c5}/100

Écarts du domaine :
${ecartsResume}

Événements sécurité :
${evenementsResume}

Inspections :
${inspectionsResume}

Génère l'analyse Bow-Tie contextualisée pour ce domaine.`

    let raw: string
    try {
      const result = await callWithFallback({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      })
      raw = result.content
    } catch {
      // Fallback déterministe
      const fallback = generateDomaineBowTie(params)
      return NextResponse.json({
        source: 'deterministic_fallback',
        domaine: fallback.domaine,
        danger: fallback.danger,
        defaillance: fallback.defaillance,
        scenario: fallback.scenario,
        consequence: fallback.consequence,
        barrieresPreventives: fallback.barrieresPreventives.map(b => ({ nom: b.nom, efficacite: b.efficacite, remarque: b.remarque })),
        barrieresCorrectives: fallback.barrieresCorrectives.map(b => ({ nom: b.nom, efficacite: b.efficacite, remarque: b.remarque })),
      })
    }

    const parsed = JSON.parse(raw)
    return NextResponse.json({
      source: 'groq_llm',
      modele: 'llama-3.3-70b',
      domaine: params.domaine,
      danger: parsed.danger || `Analyse du domaine ${params.domaine}`,
      defaillance: parsed.defaillance || 'À déterminer',
      scenario: parsed.scenario || 'Scénario non disponible',
      consequence: parsed.consequence || 'Conséquence non disponible',
      barrieresPreventives: Array.isArray(parsed.barrieresPreventives) ? parsed.barrieresPreventives.slice(0, 4) : [],
      barrieresCorrectives: Array.isArray(parsed.barrieresCorrectives) ? parsed.barrieresCorrectives.slice(0, 4) : [],
    })
  } catch (err) {
    console.error('AI bowtie error, fallback de sécurité:', err)
    const fallback = generateDomaineBowTie(params)
    return NextResponse.json({
      source: 'deterministic_fallback',
      domaine: fallback.domaine,
      danger: fallback.danger,
      defaillance: fallback.defaillance,
      scenario: fallback.scenario,
      consequence: fallback.consequence,
      barrieresPreventives: fallback.barrieresPreventives.map(b => ({ nom: b.nom, efficacite: b.efficacite, remarque: b.remarque })),
      barrieresCorrectives: fallback.barrieresCorrectives.map(b => ({ nom: b.nom, efficacite: b.efficacite, remarque: b.remarque })),
    })
  }
}
