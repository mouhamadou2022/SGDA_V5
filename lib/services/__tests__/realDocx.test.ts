import fs from 'fs'
import { parseChecklistWord } from '../checklistParser'

const buffer = fs.readFileSync('CHCKLIT SC CSK 102025.docx')
const bufferAb = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
const file = {
  arrayBuffer: () => Promise.resolve(bufferAb),
  name: 'CHCKLIT SC CSK 102025.docx',
} as unknown as File

async function main() {
  const result = await parseChecklistWord(file)

  console.log('=== TEMPLATE ===')
  console.log(JSON.stringify(result.template, null, 2))

  console.log('\n=== DOMAINES ===')
  result.hierarchie.forEach((d, i) => {
    console.log(`\n--- Domaine ${i}: ${d.nom} (${d.description}) — ${d.items?.length ?? 0} items ---`)
    d.items?.slice(0, 3).forEach(item => {
      console.log(`  ${item.numero}`)
      console.log(`    ref_reg: ${item.reference_reglementaire}`)
      console.log(`    question: ${item.point_verification?.substring(0, 100)}`)
      console.log(`    directive: ${(item.directive_preuve || '').substring(0, 150)}`)
    })
    if ((d.items?.length ?? 0) > 3) console.log(`  ... et ${(d.items?.length ?? 0) - 3} autres items`)
  })

  console.log('\n=== STATS ===')
  const totalItems = result.hierarchie.reduce((s, d) => s + (d.items?.length ?? 0), 0)
  const withGuides = result.hierarchie.reduce((s, d) => s + (d.items?.filter(i => i.directive_preuve).length ?? 0), 0)
  const withRefs = result.hierarchie.reduce((s, d) => s + (d.items?.filter(i => i.reference_reglementaire && i.reference_reglementaire !== i.numero).length ?? 0), 0)
  console.log(`Total items: ${totalItems}`)
  console.log(`Items with directives: ${withGuides}`)
  console.log(`Items with real refs: ${withRefs}`)
}

describe('realDocx', () => {
  it('parses QSC docx with correct fields', async () => {
    const result = await parseChecklistWord(file)
    expect(result.template.type).toBe('QSC')
    const totalItems = result.hierarchie.reduce((s, d) => s + (d.items?.length ?? 0), 0)
    expect(totalItems).toBeGreaterThan(100)
    const withRefs = result.hierarchie.reduce((s, d) => s + (d.items?.filter(i => i.reference_reglementaire && i.reference_reglementaire !== i.numero).length ?? 0), 0)
    expect(withRefs).toBeGreaterThan(100)
  })
})

main()
