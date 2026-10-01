import { doitProposer } from '../instructionValidation'

describe('doitProposer', () => {
  test('pas de chef = décision directe', () => {
    expect(doitProposer(undefined, 'insp1', 'inspector')).toBe(false)
  })
  test('chef lui-même = décision directe', () => {
    expect(doitProposer('chef1', 'chef1', 'inspector')).toBe(false)
  })
  test('membre avec chef désigné = proposition', () => {
    expect(doitProposer('chef1', 'insp1', 'inspector')).toBe(true)
  })
  test('admin = décision directe même avec chef', () => {
    expect(doitProposer('chef1', 'admin1', 'admin')).toBe(false)
  })
})
