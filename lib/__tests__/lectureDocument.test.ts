import {
  promptTranscription,
  promptTranscriptionManuscrit,
  assemblerTranscriptions,
  extraireTexteReponseVision,
  estErreurModeleAbsent,
} from '../ia/lectureDocument'

describe('lectureDocument', () => {
  test('prompt : fidélité, pas de résumé', () => {
    const p = promptTranscription('etude.pdf', 2, 5)
    expect(p).toContain('2/5')
    expect(p).toContain('FIDÈLEMENT')
    expect(p).toContain('aucun commentaire ni résumé')
  })

  test('assemblage trié par page', () => {
    const t = assemblerTranscriptions([
      { page: 2, texte: 'suite' },
      { page: 1, texte: 'début' },
    ])
    expect(t.indexOf('Page 1')).toBeLessThan(t.indexOf('Page 2'))
  })

  test('parse réponse Ollama (string et parties)', () => {
    expect(extraireTexteReponseVision({ choices: [{ message: { content: '  bonjour ' } }] })).toBe('bonjour')
    expect(extraireTexteReponseVision({
      choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }],
    })).toBe('a\nb')
    expect(extraireTexteReponseVision({})).toBe('')
  })

  test('détection modèle absent', () => {
    expect(estErreurModeleAbsent('model "qwen2.5vl:7b" not found')).toBe(true)
    expect(estErreurModeleAbsent('connection refused')).toBe(false)
  })
})

describe('promptTranscriptionManuscrit', () => {
  test('consigne manuscrit : contexte repris, [illisible], zero invention', () => {
    const p = promptTranscriptionManuscrit('Observation PAC AV-001')
    expect(p).toContain('Observation PAC AV-001')
    expect(p).toContain('[illisible]')
    expect(p).toMatch(/n'invente rien/)
    expect(p).toMatch(/UNIQUEMENT/)
  })
})
