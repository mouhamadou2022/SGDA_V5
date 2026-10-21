// app/api/ia/rediger-ecart/route.ts
// Endpoint léger pour redigérer le libellé d'un écart à partir des items sélectionnés
// Utilisé par le bouton "Suggestion IA" inline dans le formulaire d'écarts

import { NextResponse } from 'next/server'
import { callWithFallback } from '@/lib/ia/providers'
import { construireContexteAvecDocs } from '@/lib/ia/rag/reglementaireRag'
import type { KitDocument } from '@/lib/store'
import { supabase } from '@/lib/supabase'

// Extrait le libellé brut d'une réponse IA qui peut, malgré les consignes,
// renvoyer du JSON (avec ou sans fences Markdown) ou du texte entouré d'explications.
function extraireLibelleBrut(content: string | undefined | null): string {
  const texte = (content || '').trim()
  if (!texte) return ''

  // 1. Retire les fences Markdown (```json ... ``` ou ``` ... ```), gère \n et \r\n
  let sansFences = texte
    .replace(/^```[a-zA-Z]*\s*\r?\n/, '')
    .replace(/\r?\n\s*```\s*$/, '')
    .trim()

  if (!sansFences) return ''

  // 2. Si c'est du JSON pur, extrait le champ libelle
  try {
    const parse = JSON.parse(sansFences)
    if (parse && typeof parse === 'object' && typeof parse.libelle === 'string' && parse.libelle.trim()) {
      return parse.libelle.trim()
    }
  } catch { /* pas du JSON complet */ }

  // 3. Tente de repérer un objet { "libelle": "..." } à l'intérieur du texte
  const debut = sansFences.indexOf('{')
  const fin = sansFences.lastIndexOf('}')
  if (debut !== -1 && fin !== -1 && fin > debut) {
    const candidat = sansFences.slice(debut, fin + 1)
    try {
      const parse = JSON.parse(candidat)
      if (parse && typeof parse.libelle === 'string' && parse.libelle.trim()) {
        return parse.libelle.trim()
      }
    } catch { /* pas un JSON valide à l'intérieur */ }
  }

  // 4. Dernier recours : extrait la valeur de "libelle" par regex si présent.
  // Accepte aussi une valeur tronquée sans guillemet fermant ni accolade
  // (réponse IA coupée prématurément).
  const regex = /"libelle"\s*:\s*"?([^"}]*)/
  const m = sansFences.match(regex)
  if (m?.[1]) return m[1].trim().replace(/\\(.)/g, '$1')

  // 5. Rien de reconnu → retourne le texte brut (déjà nettoyé des fences)
  return sansFences
}

// RAG serveur : charge le Kit Inspecteur depuis Supabase (le store Zustand est
// client uniquement — ne pas l'importer dans une route serveur).
async function construireContexteReglementaireServeur(params: Parameters<typeof construireContexteAvecDocs>[1]) {
  const { data } = await supabase.from('kit_documents').select('*')
  return construireContexteAvecDocs((data ?? []) as KitDocument[], params)
}

export async function POST(request: Request) {
  try {
    const { items, domaine, aerodromeCode, aerodromeNom, isSGS, constatation } = await request.json()

    // Mode reformulation : on reformule une constatation déjà rédigée
    // au lieu de générer un libellé depuis les items NS/NV sélectionnés.
    const constatationTexte = (constatation || '').trim()
    if (constatationTexte.length > 0) {
      const contexteReglementaire = await construireContexteReglementaireServeur({
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
      return NextResponse.json({ libelle: extraireLibelleBrut(result.content), ok: true, model: result.model, reformule: true })
    }

    if (!items?.length) {
      return NextResponse.json({ error: 'items requis' }, { status: 400 })
    }

    // Contexte réglementaire RAG (borné pour limiter la taille du prompt
    // envoyé aux providers — Groq tier gratuit plafonne à ~6000 tokens).
    const contexteReglementaire = await construireContexteReglementaireServeur({
      domaines: [domaine],
      requete: items.map((i: any) => i.description || i.point_verification || '').join(' '),
      maxChars: 1200,
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
        const desc = (i.description || i.point_verification || '').slice(0, 180)
        const obs = (i.justification || i.observation || '').slice(0, 120)
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
        const desc = (i.point_verification || i.description || '').slice(0, 180)
        const obs = (i.observation || i.justification || '').slice(0, 120)
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

    return NextResponse.json({ libelle: extraireLibelleBrut(result.content), ok: true, model: result.model })
  } catch (error) {
    console.error('[/api/ia/rediger-ecart]', error)
    return NextResponse.json({ libelle: '', ok: false, error: (error as Error).message })
  }
}
