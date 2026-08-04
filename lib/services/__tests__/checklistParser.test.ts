import { parseChecklistWord } from '../checklistParser'

async function createDocxBlob(paragraphs: string[]): Promise<{ buffer: ArrayBuffer; name: string }> {
  const { zipSync, strToU8 } = await import('fflate')
  const xmlParagraphs = paragraphs.map(p => {
    const escaped = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:t>${escaped}</w:t></w:r></w:p>`
  })
  const docXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${xmlParagraphs.join('')}</w:body></w:document>`

  const buf = zipSync({
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
    'word/document.xml': strToU8(docXml),
  })
  return { buffer: buf.buffer as ArrayBuffer, name: 'IT_CHKLIST_OBSTACLES.docx' }
}

function makeFile(buffer: ArrayBuffer, name: string): File {
  return { arrayBuffer: () => Promise.resolve(buffer), name } as File
}

describe('checklistParser', () => {
  it('parses a minimal IT document and extracts questions', async () => {
    const content = [
      'IT — Inspection Technique',
      'Version 2024',
      '1. — Limitation des obstacles',
      'IT1.1 — RAS 14 § 5.1 Vérifier le balisage lumineux des obstacles',
      'Vérifier le balisage lumineux des obstacles de la zone de dégagement',
      'S  NS',
      'IT1.2 — RAS 14 § 5.2 Contrôler les surfaces de limitation',
      'Contrôler les surfaces de limitation des obstacles',
      'S  NS',
      '2. — Caractéristiques physiques',
      'IT2.1 — Doc 9157 Partie 1 § 3.2 Vérifier la largeur de piste',
      'S  NS',
    ]
    const { buffer, name } = await createDocxBlob(content)
    const file = makeFile(buffer, name)
    const result = await parseChecklistWord(file)

    expect(result.template.type).toBe('IT')
    expect(result.template.code).toContain('IT_CHKLIST')
    expect(result.hierarchie.length).toBeGreaterThanOrEqual(2)

    const firstDomaine = result.hierarchie[0]
    expect(firstDomaine.items?.length).toBe(2)
    expect(firstDomaine.items![0].point_verification).toContain('Vérifier')
    expect(firstDomaine.items![0].reference_reglementaire).toContain('RAS 14')
    expect(firstDomaine.items![0].numero).toMatch(/IT1\.\d/)
    expect(firstDomaine.items![0].directive_preuve).toBeDefined()
    expect(firstDomaine.items![0].ordre).toBeGreaterThan(0)
    expect(firstDomaine.items![0].prediction).toBe('NV')
  })

  it('detects VALIDATION_SITE type from filename', async () => {
    const content = [
      'Validation de site — Construction aérodrome',
      'Version 2025',
      '1. — Études préliminaires',
      'VS1.1 — RAS 14 § 3.2 Vérifier les études topographiques',
      'S  NS',
      '2. — Environnement',
      'VS2.1 — Annexe 14 Vol I § 4.1 Contrôler l\'étude d\'impact',
      'S  NS',
    ]
    const { buffer } = await createDocxBlob(content)
    const file = makeFile(buffer, 'VS_CONSTRUCTION.docx')
    const result = await parseChecklistWord(file)

    expect(result.template.type).toBe('VALIDATION_SITE')
    expect(result.template.portee.length).toBeGreaterThan(0)
    expect(result.hierarchie.length).toBeGreaterThanOrEqual(2)
    expect(result.hierarchie[0].items![0].point_verification).toContain('topographiques')
  })

  it('handles QSC continuous surveillance', async () => {
    const content = [
      'QSC — Surveillance Continue',
      'Version 2025',
      '1. — Pistes et aires de mouvement',
      'QSC1.1 — RAS 14 § 3.1 Vérifier l\'état général de la piste',
      'S  NS',
      'QSC1.2 — Doc 9137 § 5.3 Contrôler le balisage diurne',
      'S  NS',
    ]
    const { buffer } = await createDocxBlob(content)
    const file = makeFile(buffer, 'QSC_SURVEILLANCE.docx')
    const result = await parseChecklistWord(file)

    expect(result.template.type).toBe('QSC')
    expect(result.template.code).toContain('QSC')
    expect(result.hierarchie.length).toBe(1)
    expect(result.hierarchie[0].items![1].numero).toMatch(/QSC1\.2/)
  })
})
