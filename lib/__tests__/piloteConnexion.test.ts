// lib/__tests__/piloteConnexion.test.ts
// Connexion navigateur → Ollama : URL configurable + bascule auto
// localhost/127.0.0.1 (cas classique ::1 vs IPv4).
import { configPilote, variantesUrlOllama, URL_OLLAMA, MODELE_PILOTE } from '../ia/pilote/bouclePilote'

describe('configPilote', () => {
  const OLD_ENV = process.env
  beforeEach(() => { process.env = { ...OLD_ENV } })
  afterAll(() => { process.env = OLD_ENV })

  it('défauts localhost + modèle aerorisq', () => {
    delete process.env.NEXT_PUBLIC_OLLAMA_URL
    delete process.env.NEXT_PUBLIC_PILOTE_MODEL
    expect(configPilote()).toEqual({ url: URL_OLLAMA, modele: MODELE_PILOTE })
  })

  it('surcharges via env (Docker, autre modèle)', () => {
    process.env.NEXT_PUBLIC_OLLAMA_URL = 'http://192.168.1.20:11434/'
    process.env.NEXT_PUBLIC_PILOTE_MODEL = 'mistral'
    expect(configPilote()).toEqual({ url: 'http://192.168.1.20:11434', modele: 'mistral' })
  })
})

describe('variantesUrlOllama', () => {
  it('localhost → + variante 127.0.0.1', () => {
    expect(variantesUrlOllama('http://localhost:11434')).toEqual([
      'http://localhost:11434',
      'http://127.0.0.1:11434',
    ])
  })

  it('127.0.0.1 → + variante localhost', () => {
    expect(variantesUrlOllama('http://127.0.0.1:11434')).toEqual([
      'http://127.0.0.1:11434',
      'http://localhost:11434',
    ])
  })

  it('hôte distant → inchangé (une seule variante)', () => {
    expect(variantesUrlOllama('http://192.168.1.20:11434')).toEqual(['http://192.168.1.20:11434'])
  })
})
