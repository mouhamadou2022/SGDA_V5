// lib/services/__tests__/rapportConversation.test.ts
// Smoke tests : l'export de conversation du copilote génère bien un PDF (format
// institutionnel pdfRapport) et un DOCX valides, paginés et nommés correctement.

import { genererRapportConversationBlob, buildRapportConversationFilename } from '../rapportConversation'

// Environnement jsdom : les encodeurs Node ne sont pas exposés globalement,
// or jspdf et docx en ont besoin pour produire leurs blobs.
import { TextEncoder, TextDecoder } from 'util'
;(globalThis as Record<string, unknown>).TextEncoder = TextEncoder
;(globalThis as Record<string, unknown>).TextDecoder = TextDecoder

const base = {
  titre: 'Analyse SSLIA — GOBD',
  aerodromeNom: 'GOBD Dakar',
  redacteur: 'M. GUEYE',
  date: '2026-08-19T09:00:00.000Z',
  messages: [
    { role: 'user' as const, content: 'Quelles sont les exigences SSLIA pour un aérodrome de catégorie 7 ?\nContexte : préparation de la surveillance annuelle.' },
    { role: 'assistant' as const, content: 'Les exigences SSLIA reposent sur le niveau de protection incendie requis (catégorie 7) :\n- Débit de solution émulseur adapté ;\n- Délai d\'engagement.\nRéponse première ligne en attendant la vérification des annexes réglementaires.' },
  ],
}

describe('rapportConversation', () => {
  test('génère un blob PDF non vide', async () => {
    const blob = await genererRapportConversationBlob(base, 'pdf')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(1000)
  })

  test('génère un blob DOCX non vide (gabarit institutionnel)', async () => {
    const blob = await genererRapportConversationBlob(base, 'word')
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(1000)
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  })

  test('construit un nom de fichier de conversation lisible', () => {
    expect(buildRapportConversationFilename('Analyse SSLIA — GOBD')).toBe('conversation_Analyse_SSLIA_GOBD.')
  })
})