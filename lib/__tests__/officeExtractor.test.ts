import PizZip from 'pizzip'
import {
  detecterFormatOffice,
  estVieuxFormatBinaire,
  serialExcelVersIso,
  extractTextFromOffice,
} from '../services/officeExtractor'

function zipDe(fichiers: Record<string, string>): ArrayBuffer {
  const zip = new PizZip()
  for (const [chemin, contenu] of Object.entries(fichiers)) zip.file(chemin, contenu)
  const u8 = zip.generate({ type: 'uint8array' }) as Uint8Array
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer
}

const DOCX = () => zipDe({
  'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Rapport de visite</w:t></w:r></w:p><w:p><w:r><w:t>Piste en bon état</w:t></w:r></w:p></w:body></w:document>`,
})

const XLSX = () => zipDe({
  'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Ecarts" sheetId="1"/></sheets></workbook>`,
  'xl/sharedStrings.xml': `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Fissure piste</t></si></sst>`,
  'xl/styles.xml': `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts/><cellXfs><xf numFmtId="0"/></cellXfs></styleSheet>`,
  'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>3</v></c></row></sheetData></worksheet>`,
})

const PPTX = () => zipDe({
  'ppt/presentation.xml': `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId/></p:sldIdLst></p:presentation>`,
  'ppt/slides/slide1.xml': `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Sécurité des pistes</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
})

describe('officeExtractor', () => {
  test('détection formats', () => {
    expect(detecterFormatOffice('rapport.DOCX')).toBe('docx')
    expect(detecterFormatOffice('suivi.xlsx')).toBe('xlsx')
    expect(detecterFormatOffice('expo.pptx')).toBe('pptx')
    expect(detecterFormatOffice('scan.pdf')).toBeNull()
    expect(estVieuxFormatBinaire('vieux.doc')).toBe(true)
    expect(estVieuxFormatBinaire('neuf.docx')).toBe(false)
  })

  test('serial Excel → ISO', () => {
    expect(serialExcelVersIso(45658)).toBe('2025-01-01')
  })

  test('docx : paragraphes', async () => {
    const r = await extractTextFromOffice(DOCX(), 'rapport.docx')
    expect(r.format).toBe('docx')
    expect(r.texte).toContain('Rapport de visite')
    expect(r.texte).toContain('Piste en bon état')
  })

  test('xlsx : chaînes partagées + nombres', async () => {
    const r = await extractTextFromOffice(XLSX(), 'suivi.xlsx')
    expect(r.format).toBe('xlsx')
    expect(r.unite).toBe('feuilles')
    expect(r.nbUnites).toBe(1)
    expect(r.texte).toContain('Ecarts')
    expect(r.texte).toContain('Fissure piste')
    expect(r.texte).toContain('3')
  })

  test('pptx : diapositives', async () => {
    const r = await extractTextFromOffice(PPTX(), 'expo.pptx')
    expect(r.format).toBe('pptx')
    expect(r.unite).toBe('diapositives')
    expect(r.texte).toContain('Diapositive 1')
    expect(r.texte).toContain('Sécurité des pistes')
  })

  test('vieux .doc refusé avec message de conversion', async () => {
    await expect(extractTextFromOffice(new ArrayBuffer(8), 'vieux.doc')).rejects.toThrow('Convertissez')
  })
})
