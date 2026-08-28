// app/api/ia/rediger-ecart/route.ts
// Endpoint léger pour redigérer le libellé d'un écart à partir des items sélectionnés
// Utilisé par le bouton "Suggestion IA" inline dans le formulaire d'écarts

import { NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'
import { construireContexteReglementaire } from '@/lib/ia/rag/reglementaireRag'

export async function POST(request: Request) {
  try {
    const { items, domaine, aerodromeCode, aerodromeNom, isSGS, constatation } = await request.json()

    // Mode reformulation : on reformule une constatation déjà rédigée
    // au lieu de générer un libellé depuis les items NS/NV sélectionnés.
    const constatationTexte = (constatation || '').trim()
    if (constatationTexte.length > 0) {
      const contexteReglementaire = construireContexteReglementaire({
        domaines: [domaine],
        requete: constatationTexte,
        maxChars: 2500,
      })

      const systemPrompt = `Tu es un inspecteur ANACIM expert sécurité aéronautique.
Tu RE-FORMULES une constatation d'écart déjà rédigée par l'inspecteur.
STYLE : réglementaire, concis, factuel, professionnel. Phrases COURTES et simples.
Buts :
- Conserver TOUS les faits, chiffres, dates et références réglementaires cités (ne rien inventer, ne rien retirer).
- Clarifier la syntaxe, la grammaire et l'orthographe.
- Supprimer le superflu (répétitions, digressions, ton familier).
- Décrire l'état constaté de manière objective et vérifiable.
- Si la constatation porte sur plusieurs points distincts, structure la en PUCEs (liste à puces « - »), UN point par constatation, avec des phrases courtes et simples pour l'exploitant.
Ne retourne que le texte brut reformulé (puces ou phrases courtes), pas de JSON, pas de markdown.`

      const userMessage = `Reformule la constatation suivante :\n« ${constatationTexte} »\n${contexteReglementaire ? `\n${contexteReglementaire}` : ''}`

      const result = await callWithFallback({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 400,
      })

      if (!result.content?.trim()) {
        return NextResponse.json({ libelle: '', ok: false, error: 'Réponse IA vide' })
      }
      return NextResponse.json({ libelle: result.content.trim(), ok: true, model: result.model, reformule: true })
    }

    if (!items?.length) {
      return NextResponse.json({ error: 'items requis' }, { status: 400 })
    }

    // Contexte réglementaire RAG
    const contexteReglementaire = construireContexteReglementaire({
      domaines: [domaine],
      requete: items.map((i: any) => i.description || i.point_verification || '').join(' '),
      maxChars: 2500,
    })

    let userMessage: string
    let systemPrompt: string

    if (isSGS) {
      systemPrompt = `Tu es un inspecteur ANACIM expert SGS (Système de Gestion de la Sécurité).
Tu rédiges des constats d'écarts au format PAOE (Annexe 19 OACI).
STYLE : réglementaire, concis, factuel. Phrases COURTES et simples.
L'exploitant doit comprendre l'écart sans effort : évite les phrases longues et alambiquées.
- Si plusieurs questions/éléments sont sélectionnés (2 ou 3), structure le constat en PUCEs ou en numérotation (liste à puces « - » ou « 1. », « 2. », « 3. »), UN point par élément. Chaque puce = une constatation simple et autonome.
- Si une seule question est sélectionnée, rédige une seule constatation de 1 à 3 phrases courtes (pas de liste).
- Cite la référence réglementaire exacte dans chaque puce concernée.
Tu décris l'ÉTAT CONSTATÉ (ce qui manque ou est insuffisant), pas la question.
Si des observations de l'inspecteur sont fournies, tu t'en sers comme base du constat.
Ne retourne que le texte brut du libellé (puces ou phrases courtes), pas de JSON, pas de markdown.`

      const itemsCtx = items.map((i: any) => {
        const paoeLabel = i.paoeLevel === 'absent' ? 'Absent'
          : i.paoeLevel === 'present' ? 'Présent'
          : i.paoeLevel === 'approprie' ? 'Approprié'
          : i.resultat || 'NS'
        const desc = i.description || i.point_verification || ''
        const obs = i.justification || i.observation || ''
        return `- [${paoeLabel}] ${desc}${obs ? ` (Obs: ${obs})` : ''}${i.reference_reglementaire ? ` [Réf: ${i.reference_reglementaire}]` : ''}`
      }).join('\n')

      userMessage = `Rédige le libellé du constat SGS pour :\nAérodrome : ${aerodromeCode ?? ''} — ${aerodromeNom ?? ''}\nÉléments :\n${itemsCtx}\n${contexteReglementaire ? `\n${contexteReglementaire}` : ''}`
    } else {
      systemPrompt = `Tu es un inspecteur ANACIM expert sécurité aéronautique.
Tu rédiges des constats d'écarts réglementaires.
STYLE : réglementaire, concis, factuel. Phrases COURTES et simples.
L'exploitant doit comprendre l'écart sans effort : évite les phrases longues et alambiquées.
- Si plusieurs questions/items sont sélectionnés (2 ou 3), structure le constat en PUCEs ou en numérotation (liste à puces « - » ou « 1. », « 2. », « 3. »), UN point par item. Chaque puce = une constatation simple et autonome.
- Si une seule question est sélectionnée, rédige une seule constatation de 1 à 3 phrases courtes (pas de liste).
- Cite la référence réglementaire exacte dans chaque puce concernée.
Tu décris le constat basé sur les résultats NS/NV.
Ne retourne que le texte brut du libellé (puces ou phrases courtes), pas de JSON, pas de markdown.`

      const itemsCtx = items.map((i: any) => {
        const desc = i.point_verification || i.description || ''
        const obs = i.observation || i.justification || ''
        return `- [${i.resultat ?? 'NS'}] ${desc}${obs ? ` (Obs: ${obs})` : ''}${i.reference_reglementaire ? ` [Réf: ${i.reference_reglementaire}]` : ''}`
      }).join('\n')

      userMessage = `Rédige le libellé du constat pour :\nAérodrome : ${aerodromeCode ?? ''} — ${aerodromeNom ?? ''}\nDomaine : ${domaine}\nItems :\n${itemsCtx}\n${contexteReglementaire ? `\n${contexteReglementaire}` : ''}`
    }

    const result = await callWithFallback({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 400,
    })

    if (!result.content?.trim()) {
      return NextResponse.json({ libelle: '', ok: false, error: 'Réponse IA vide' })
    }

    return NextResponse.json({ libelle: result.content.trim(), ok: true, model: result.model })
  } catch (error) {
    console.error('[/api/ia/rediger-ecart]', error)
    return NextResponse.json({ libelle: '', ok: false, error: (error as Error).message })
  }
}
