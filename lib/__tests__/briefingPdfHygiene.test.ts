// lib/__tests__/briefingPdfHygiene.test.ts
// Hygiène du PDF briefing : glyphes supportés, référence lisible,
// type de mission sans doublon (bugs constatés : UUID brut, « !’ », débordement).
import { textePdf, idCourtPdf } from '../pdfText'
import { normaliserTypeMission } from '../services/ficheBriefingPDF'
import { normaliserReferenceBriefing } from '../ia/agents/kitDocAgent'

describe('textePdf (polices standard WinAnsi)', () => {
  it('convertit la flèche → en tiret (sinon rendue « !’ »)', () => {
    expect(textePdf('02/10/2026 → 04/10/2026')).toBe('02/10/2026 - 04/10/2026')
  })

  it('conserve les accents et la ponctuation courante', () => {
    expect(textePdf("l'aérodrome — vérifié")).toBe("l'aérodrome - vérifié")
  })

  it('supprime emojis et caractères invisibles', () => {
    expect(textePdf('Alerte ✅\u200Burgente')).toBe('Alerte urgente')
  })

  it('idCourtPdf tronque les UUID, garde les références courtes', () => {
    expect(idCourtPdf('87470ba1-11a5-42d0-9883-1f029672c4cd')).toBe('87470BA1')
    expect(idCourtPdf('QSC-2026-014')).toBe('QSC-2026-014')
    expect(idCourtPdf('')).toBe('—')
  })
})

describe('normaliserTypeMission', () => {
  it('évite « mission de surveillance Surveillance de… »', () => {
    expect(normaliserTypeMission('Surveillance de maintien')).toBe('de maintien')
    expect(normaliserTypeMission('Maintien')).toBe('Maintien')
    expect(normaliserTypeMission('')).toBe('non précisé')
  })
})

describe('normaliserReferenceBriefing', () => {
  it('refuse un UUID brut (bug constaté)', () => {
    const uuid = '87470ba1-11a5-42d0-9883-1f029672c4cd'
    expect(normaliserReferenceBriefing(uuid, 'plan-12345678')).toBe('PLAN-123')
  })

  it('conserve une référence courte lisible', () => {
    expect(normaliserReferenceBriefing('QSC-2026-014', 'plan-x')).toBe('QSC-2026-014')
  })

  it('repli sans planning', () => {
    expect(normaliserReferenceBriefing('', undefined)).toMatch(/^BRIEF-\d{8}$/)
  })
})
