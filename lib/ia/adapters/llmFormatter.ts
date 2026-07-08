import type { AnalysePreparation } from '../decisionEngine'

export interface FormattedOutput {
  titre: string
  resume: string
  objectifsRediges: string
  recommandationsListe: string[]
  analyseComplete: string
}

export class LlmFormatter {
  formaterAnalyse(analyse: AnalysePreparation): FormattedOutput {
    const { profil, conformite, certificat, declencheurs, recommandations, portee } = analyse

    const resume = `Analyse de risque: ${profil.niveau}. Conformite ${conformite.conformiteGlobale}%. ${portee.justification}`

    const objectifsRediges = portee.objectifs.length > 0
      ? portee.objectifs.map(o => `- ${o}`).join('\n')
      : '- Evaluation generale de la conformite'

    const recommandationsListe = recommandations.length > 0
      ? recommandations.map(r => r.action)
      : ['Aucune recommandation specifique']

    const lignesAnalyse = [
      `Niveau de risque: ${profil.niveau}`,
      `Certificat: ${certificat.action}`,
      `Justification: ${certificat.justification}`,
    ]
    if (certificat.conditions?.length) {
      lignesAnalyse.push(`Conditions: ${certificat.conditions.join(', ')}`)
    }
    for (const d of declencheurs) {
      lignesAnalyse.push(`Declencheur [${d.urgence}]: ${d.description}`)
    }
    if (profil.signauxAvances) {
      if (profil.signauxAvances.hmm) {
        lignesAnalyse.push(`Modele HMM: etat ${profil.signauxAvances.hmm.etat}${profil.signauxAvances.hmm.transition ? ', transition en cours' : ''}`)
      }
      if (profil.signauxAvances.extreme?.queueLourde) {
        lignesAnalyse.push(`Modele EVT: risque extreme detecte (tail risk ${(profil.signauxAvances.extreme.risqueQueue * 100).toFixed(0)}%)`)
      }
      if (profil.signauxAvances.copule) {
        lignesAnalyse.push(`Modele Copules: pire cas a ${(profil.signauxAvances.copule.probabilitePireCas * 100).toFixed(0)}%`)
      }
      if (profil.signauxAvances.survie) {
        lignesAnalyse.push(`Modele Survie: danger a 90j ${(profil.signauxAvances.survie.danger90j * 100).toFixed(0)}%`)
      }
    }

    return {
      titre: `Analyse AERORISQ - niveau ${profil.niveau}`,
      resume,
      objectifsRediges,
      recommandationsListe,
      analyseComplete: lignesAnalyse.join('\n'),
    }
  }

  async formaterAvecLlm(analyse: AnalysePreparation, useLlm: boolean = false): Promise<FormattedOutput> {
    const base = this.formaterAnalyse(analyse)
    if (!useLlm) return base
    try {
      const { aiClient } = await import('../aiClient')
      const response = await aiClient.callJSON({
        systemPrompt: 'Tu es un expert en securite aerienne. Reformule l analyse suivante de maniere professionnelle et concise pour un inspecteur ANACIM.',
        userMessage: JSON.stringify(base),
        temperature: 0.3,
        responseFormat: 'json_object',
      }, base)
      return { ...base, ...response, analyseComplete: base.analyseComplete }
    } catch {
      return base
    }
  }
}

export const llmFormatter = new LlmFormatter()
