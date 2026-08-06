// app/api/aerorisq/supervision-publique/route.ts
// Synthèse AERORISQ pour le dashboard "Invité" (consultation publique).
// Lit les données agrégées via service-role (le guest ne voit jamais les
// données brutes), calcule des indicateurs synthétiques et génère un texte
// en langage clair via l'IA (fallback multi-provider).
// Retourne : { synthese, indicateurs, generatedAt }
//
// Anti-hallucination : les indicateurs et la synthèse sont ancrés sur les
// VRAIES données des modules (via lib/aerorisq/contextPublic.ts). Aucun
// chiffre inventé, aucune donnée sensible brute renvoyée.

import { NextResponse } from 'next/server'
import { callWithFallback, isLLMConfigured } from '@/lib/ia/providers'
import {
  chargerContextePublic,
  formaterContextePublic,
  PHASES_CERTIFICATION,
  PHASES_HOMOLOGATION,
} from '@/lib/aerorisq/contextPublic'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `Tu es AERORISQ, l'assistant d'intelligence artificielle de l'ANACIM (Agence Nationale de l'Aviation Civile et de la Météorologie du Sénégal).
Tu rédiges une synthèse publique, pédagogique et rassurante sur la supervision de la sécurité des aérodromes du Sénégal.

Contexte : un visiteur consulte le portail public. Il n'a pas de compétences techniques poussées.
Ton objectif : lui donner une idée claire de l'état de la supervision et de l'utilité de l'application, sans jamais révéler de données sensibles, de scores bruts par aérodrome, ou d'informations confidentielles.

À partir des indicateurs fournis, rédige un texte de 3 à 5 phrases maximum en français :
- Commence par l'état général du réseau (nombre d'aérodromes, répartition de la supervision)
- Mentionne le processus de certification, d'homologation et la surveillance continue
- Explique en une phrase ce que fait AERORISQ (analyse des risques, tendances, aide à la décision)
- Termine par une note de transparence et de fiabilité

Référentiel exact (ne t'en écarte pas) :
- Certification : ${PHASES_CERTIFICATION.map((p) => p.nom).join(' → ')}
- Homologation : ${PHASES_HOMOLOGATION.map((p) => p.nom).join(' → ')}

Règles :
- Utilise les VRAIS chiffres fournis (ne les invente pas)
- Ton professionnel, accessible, sans jargon
- Ne mentionne pas de scores individuels ni de noms d'aérodromes en situation critique
- Pas d'emojis, pas de markdown, pas de listes
- Réponds UNIQUEMENT avec le texte de la synthèse`

export async function POST() {
  try {
    const contexte = await chargerContextePublic()

    const indicateurs = {
      totalAerodromes: contexte.totalAerodromes,
      internationaux: contexte.internationaux,
      certifies: contexte.certifies,
      certificationsEnCours: contexte.certificationsEnCours,
      homologationsActives: contexte.homologues,
      surveillancesAnnee: contexte.surveillances.anneeCourante,
      ecartsOuverts: contexte.ecarts.ouverts,
    }

    const { totalAerodromes: total, internationaux, certifies, certificationsEnCours, homologationsActives, surveillancesAnnee, ecartsOuverts } = indicateurs

    const fallbackSynthese = `Le réseau des aérodromes du Sénégal comprend actuellement ${total} aérodrome${total > 1 ? 's' : ''}, dont ${internationaux} international${internationaux > 1 ? 'x' : ''}. ${certifies} ${certifies > 1 ? 'sont certifiés' : 'est certifié'} et ${certificationsEnCours} processus de certification ${certificationsEnCours > 1 ? 'sont en cours' : 'est en cours'}, avec ${homologationsActives} homologation${homologationsActives > 1 ? 's' : ''} active${homologationsActives > 1 ? 's' : ''}. La surveillance continue a enregistré ${surveillancesAnnee} opération${surveillancesAnnee > 1 ? 's' : ''} cette année et ${ecartsOuverts} écart${ecartsOuverts > 1 ? 's' : ''} restent à traiter. AERORISQ analyse ces données pour accompagner une supervision fondée sur le risque des aérodromes du Sénégal.`

    if (!isLLMConfigured()) {
      return NextResponse.json({
        synthese: fallbackSynthese,
        indicateurs,
        generatedAt: new Date().toISOString(),
        iaDisponible: false,
      })
    }

    const userPrompt = `Voici les indicateurs agrégés de la supervision des aérodromes du Sénégal :
${JSON.stringify(indicateurs, null, 2)}

Contexte métier :
${formaterContextePublic(contexte)}

Rédige la synthèse publique en langage clair (3-5 phrases).`

    const { content: raw } = await callWithFallback({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 500,
    })

    const synthese = (raw || '').trim()

    return NextResponse.json({
      synthese: synthese || fallbackSynthese,
      indicateurs,
      generatedAt: new Date().toISOString(),
      iaDisponible: true,
    })
  } catch (err) {
    console.error('[aerorisq/supervision-publique] Erreur:', err)
    return NextResponse.json({ error: 'Synthèse AERORISQ momentanément indisponible' }, { status: 500 })
  }
}
