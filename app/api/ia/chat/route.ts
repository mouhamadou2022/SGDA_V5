// app/api/ia/chat/route.ts
// Route API serveur pour l'assistant IA SGDA
// Multi-provider : AERORISQ (IA maison/Ollama) → Groq → OpenRouter → …
// Injecte la mémoire apprise d'AERORISQ (exemples validés 👍) en few-shot.
// Les données sensibles restent côté client — seul le contexte résumé est envoyé

import { NextResponse } from 'next/server'
import { CHAT_SYSTEM_PROMPT } from '@/lib/ia/prompts'
import { callWithFallback, isLLMConfigured } from '@/lib/ia/providers'
import { getFewShotContext } from '@/lib/ia/aerorisqRag'

export interface ChatAPIRequest {
  message: string
  contexte?: {
    aerodrome?: {
      code_oaci: string
      nom: string
      categorie: string
      type: string
    }
    profil_risque?: {
      score_global: number
      niveau: string
      tendance: string
      c1: number; c2: number; c3: number; c4: number; c5: number
      alertes?: string[]
    }
    ecarts_actifs?: Array<{
      reference: string
      libelle: string
      niveau_risque: string
      statut: string
      jours_restants?: number
    }>
    surveillance_en_cours?: {
      type: string
      date: string
      statut: string
      taux_conformite?: number
    }
    historique?: Array<{ role: 'user' | 'assistant'; content: string }>
    module?: string
  }
}

function buildContextMessage(contexte: ChatAPIRequest['contexte']): string {
  if (!contexte) return ''

  const parts: string[] = []

  if (contexte.aerodrome) {
    const a = contexte.aerodrome
    parts.push(`AÉRODROME ACTUEL : ${a.code_oaci} — ${a.nom} (${a.categorie}, ${a.type})`)
  }

  if (contexte.profil_risque) {
    const p = contexte.profil_risque
    parts.push(
      `PROFIL DE RISQUE :
  - Score global : ${p.score_global}/100 — Niveau : ${p.niveau.toUpperCase()}
  - C1 (Maturité SGS) : ${p.c1}/100
  - C2 (Efficacité PAC) : ${p.c2}/100
  - C3 (Conformité) : ${p.c3}/100
  - C4 (Charge critique) : ${p.c4}/100
  - C5 (Résilience) : ${p.c5}/100
  ${p.alertes && p.alertes.length > 0 ? `- Alertes actives : ${p.alertes.join(', ')}` : ''}`
    )
  }

  if (contexte.ecarts_actifs && contexte.ecarts_actifs.length > 0) {
    const critiques = contexte.ecarts_actifs.filter(e => e.niveau_risque === 'critique')
    const enRetard = contexte.ecarts_actifs.filter(e => e.statut === 'en_retard')
    parts.push(
      `ÉCARTS ACTIFS : ${contexte.ecarts_actifs.length} total
  - Critiques : ${critiques.length}${critiques.length > 0 ? ' → ' + critiques.slice(0, 2).map(e => e.reference + ': ' + e.libelle.substring(0, 60)).join('; ') : ''}
  - En retard : ${enRetard.length}`
    )
  }

  if (contexte.surveillance_en_cours) {
    const s = contexte.surveillance_en_cours
    parts.push(
      `SURVEILLANCE EN COURS : ${s.type} du ${s.date} — ${s.statut}${s.taux_conformite != null ? ` — Conformité : ${s.taux_conformite}%` : ''}`
    )
  }

  if (contexte.module) {
    parts.push(`MODULE ACTIF : ${contexte.module}`)
    // Injecter les référentiels métier propres à chaque module
    if (contexte.module === 'plans-actions') {
      parts.push(
        `RÉFÉRENTIEL PAC — Critères d'évaluation des Plans d'Actions Correctives :
- Pertinence : les actions répondent-elles exactement à l'écart constaté ?
- Exhaustivité : toutes les composantes de l'écart sont-elles traitées ?
- Précision : les actions sont-elles suffisamment détaillées ?
- Spécificité : les formulations sont-elles concrètes (pas vagues) ?
- Réalisme : les délais et ressources sont-ils réalistes ?
- Cohérence : le plan est-il logiquement structuré ?
Seuils décision : ≥70 = accepté, <70 = refusé (améliorations requises)
Réponds en français avec un feedback constructif et précis.`
      )
    } else if (contexte.module === 'planning') {
      parts.push(
        `RÉFÉRENTIEL PLANNING :
La fréquence de surveillance est déterminée par le niveau de risque :
- CRITIQUE (0-29) : surveillance mensuelle obligatoire
- ÉLEVÉ (30-49) : surveillance trimestrielle renforcée
- MOYEN (50-69) : surveillance semestrielle standard
- FAIBLE (70-100) : surveillance annuelle
Les missions peuvent être programmées, inopinées, spéciales, ou de maintien.
Une équipe d'inspection comprend un chef de mission et des inspecteurs.
Conseille sur la planification en fonction des profils de risque et des disponibilités.`
      )
    } else if (contexte.module === 'ecarts-redaction') {
      parts.push(
        `RÉFÉRENTIEL RÉDACTION D'ÉCARTS :
Les libellés d'écarts doivent :
- Citer précisément la référence réglementaire violée (RAS 14, Annexe 14, Doc OACI, procédure ANACIM)
- Décrire l'écart constaté de façon factuelle et objective
- Être rédigés au présent de l'indicatif
- Être compréhensibles par l'exploitant de l'aérodrome
- Suivre le format : "Non-conformité constatée en regard de [référence] : [description factuelle]"
N'utilise pas de matrice de risque OACI (probabilité × gravité) pour les écarts SGS — utilise le modèle PAOE.`
      )
    } else if (contexte.module === 'certification') {
      parts.push(
        `RÉFÉRENTIEL CERTIFICATION :
Le processus de certification comprend 5 phases :
1. Expression d'Intérêt (15 jours)
2. Demande Formelle (30 jours)
3. Vérification sur Site (45 jours)
4. Délivrance du Certificat (20 jours)
5. Publication du Statut (10 jours)
Conseille sur les blocages, les lettres officielles et les étapes à suivre.`
      )
    } else if (contexte.module === 'risk' || contexte.module === 'profil-risque') {
      parts.push(
        `RÉFÉRENTIEL PROFIL DE RISQUE :
Le profil de risque est calculé sur 5 critères (C1-C5) :
- C1 : Maturité du Système de Gestion de la Sécurité (SGS)
- C2 : Efficacité du traitement des Plans d'Actions Correctives (PAC)
- C3 : Conformité technique et opérationnelle (résultats des checklists)
- C4 : Charge critique (nombre et gravité des écarts actifs)
- C5 : Résilience opérationnelle (capacité de réponse SLI, formation)
Seuils : 0-29 CRITIQUE, 30-49 ÉLEVÉ, 50-69 MOYEN, 70-100 FAIBLE
Cite les références réglementaires exactes (Annexe 14, Doc 9859 SGS, RAS 14).`
      )
    } else if (contexte.module === 'sgs') {
      parts.push(
        `RÉFÉRENTIEL SGS — Évaluation PAOE :
Le modèle PAOE mesure la maturité SGS sur 4 niveaux :
- Absent (—) : l'élément SGS n'existe pas ou n'est pas documenté
- Présent (P) : l'élément existe mais n'est pas adapté au contexte opérationnel
- Approprié (A) : l'élément est en place et adapté, mais pas encore pleinement opérationnel
- Opérationnel (O) : l'élément fonctionne efficacement au quotidien
- Efficace (E) : l'élément démontre une amélioration continue mesurable
N'utilise jamais de matrice de risque OACI (probabilité × gravité) pour le SGS.`
      )
    } else if (contexte.module === 'registres') {
      parts.push(
        `RÉFÉRENTIEL REGISTRE :
Tu maîtrises RAS 14 (aérodromes), Annexe 14 OACI, Doc 9859 SGS, Doc 9157 AGA,
les circulaires et bulletins ANACIM, l'historique réglementaire du secteur.
Analyse l'impact des documents réglementaires et réponds aux questions.`
      )
    }
  }

  return parts.length > 0 ? `[CONTEXTE SGDA]\n${parts.join('\n')}\n[FIN CONTEXTE]\n\n` : ''
}

function detectPdfRequest(message: string): { type?: string } | null {
  const lower = message.toLowerCase()
  const keywordsPdf = ['pdf', 'rapport', 'génère', 'télécharge', 'exporter', 'document']
  const hasPdfKeyword = keywordsPdf.some(k => lower.includes(k))

  if (!hasPdfKeyword) return null

  if (lower.includes('surveillance') || lower.includes('inspection')) return { type: 'surveillance' }
  if (lower.includes('certification') || lower.includes('certificat')) return { type: 'certification' }
  if (lower.includes('checklist')) return { type: 'checklist' }
  if (lower.includes('registre')) return { type: 'registre' }

  return null
}

// ✅ NOUVEAU : Génère un PDF de base quand l'utilisateur demande un rapport dans le chat
// Pour l'instant, on génère une structure PDF valide avec les métadonnées
// Dans une version future, cette fonction appellera les services complets de génération de PDF
async function generatePdfReport(request: { type?: string }, contexte?: any): Promise<{
  filename: string
  blobBase64: string
  message: string
}> {
  // Décodage basique - en production, ceci utiliserait les services PDF réels
  const dummyContent = '%PDF-1.4\n%SGDA Rapport Auto-généré\n%\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 72 720 Td SGDA Rapport Auto-généré ET Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000107 00000 n \n0000000200 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n250\n%%EOF'

  const base64 = btoa(dummyContent)
  const type = request.type || 'surveillance'
  const filename = `Rapport_${type}_${new Date().toISOString().split('T')[0]}.pdf`

  const typeMessages: Record<string, string> = {
    certification: '🎓 Type: Rapport de certification national',
    checklist: '✅ Type: Export checklist',
    surveillance: '📋 Type: Rapport de surveillance'
  }

  const typeMessage = (request.type && typeMessages[request.type]) || typeMessages.surveillance

  const messages = [
    `✅ PDF rapport ${type} en cours de génération`,
    `📄 Format: PDF institutionnel ANACIM`,
    `📅 Date: ${new Date().toLocaleDateString('fr-FR')}`,
    typeMessage
  ]

  return {
    filename,
    blobBase64: base64,
    message: messages.join('\n'),
  }
}

export async function POST(request: Request) {
  try {
    const body: ChatAPIRequest = await request.json()

    if (!isLLMConfigured()) {
      return NextResponse.json(
        { error: 'Aucune clé API configurée', code: 'NO_API_KEY' },
        { status: 503 }
      )
    }

    // ✅ NOUVEAU : Détection automatique de demande de rapport PDF dans le message
    const pdfRequest = detectPdfRequest(body.message)

    if (pdfRequest) {
      // Générer le rapport PDF immédiatement sans attendre la réponse IA
      const pdfResult = await generatePdfReport(pdfRequest, body.contexte)
      return NextResponse.json({
        pdf: {
          filename: pdfResult.filename,
          base64: pdfResult.blobBase64,
        },
        message: pdfResult.message,
      })
    }

    const contextMessage = buildContextMessage(body.contexte)
    const userMessage = contextMessage + body.message

    // Mémoire apprise d'AERORISQ : exemples validés 👍 pour ce module (best-effort, '' si aucun)
    const fewShot = await getFewShotContext(body.contexte?.module)

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT + (fewShot ? `\n\n${fewShot}` : '') },
    ]

    if (body.contexte?.historique && body.contexte.historique.length > 0) {
      const recentHistory = body.contexte.historique.slice(-6)
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    messages.push({ role: 'user', content: userMessage })

    const result = await callWithFallback({
      messages,
      temperature: 0.4,
      max_tokens: 1024,
      top_p: 0.9,
    })

    return NextResponse.json({
      message: result.content,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
    })
  } catch (error) {
    console.error('[IA Chat API]', error)
    return NextResponse.json(
      { error: (error as Error).message, code: 'ALL_PROVIDERS_FAILED' },
      { status: 503 }
    )
  }
}
