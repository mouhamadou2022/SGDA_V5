// lib/__tests__/workflowLogic.test.ts — Phase suivante (saga workflow)
// Logique pure extraite dans lib/workflow/ : extraction HTML, règles de
// signature, conversion brouillon→officiel. Testée isolément (aucun store).

import {
  stripHtmlToText,
  normalizeEcartNiveau,
  extractEcartsFromRapportHtml,
} from '../workflow/extractionEcarts'
import {
  fusionnerSignatures,
  evaluerAvancement,
  buildPatchSignatureDelegation,
} from '../workflow/reglesSignature'
import { buildEcartOfficiel } from '../workflow/conversionEcarts'

const SURV = {
  id: 's1',
  aerodrome_id: 'a1',
  portee: ['SGS'],
  chef_id: 'chef-1',
  transmitted_at: '2026-01-10T00:00:00.000Z',
  updated_at: '2026-01-09T00:00:00.000Z',
}

describe('extractionEcarts', () => {
  test('stripHtmlToText décode les entités', () => {
    expect(stripHtmlToText('<p>a&nbsp;&amp;&nbsp;b</p>')).toBe('a & b')
  })

  test('normalizeEcartNiveau insensible accents/casse', () => {
    expect(normalizeEcartNiveau('Critique')).toBe('critique')
    expect(normalizeEcartNiveau('ÉLEVÉ')).toBe('eleve')
    expect(normalizeEcartNiveau('faible')).toBe('faible')
    expect(normalizeEcartNiveau('???')).toBe('moyen')
  })

  test('sans rapport → vide', () => {
    expect(extractEcartsFromRapportHtml({ ...SURV, rapport_html: '' } as never)).toEqual([])
  })

  test('lignes <tr> extraites, "aucun écart" ignoré (chemin DOM + repli regex)', () => {
    // Structure valide pour les DEUX chemins : <h3> après le tableau
    // (le repli regex s'arrête au premier <h3>, le DOM remonte au parent).
    const html = `<div>Annexe A-2<table><tbody>
      <tr><td>E-01</td><td>REF-1</td><td>Libellé un</td><td>Critique</td></tr>
      <tr><td colspan="4">aucun écart constaté</td></tr>
    </tbody></table><h3>Écarts constatés</h3></div>`
    const res = extractEcartsFromRapportHtml({ ...SURV, rapport_html: html } as never)
    const refs = res.map(r => r.reference)
    expect(refs).toContain('E-01')
    expect(refs).not.toContain('aucun écart constaté')
  })
})

describe('reglesSignature', () => {
  test('fusionnerSignatures : re-signature remplace, autres conservées', () => {
    const avant = [
      { signataire_id: 'a', signataire_nom: 'A', date_signature: 't0', signature_url: 'u0' },
      { signataire_id: 'b', signataire_nom: 'B', date_signature: 't0', signature_url: 'u0' },
    ]
    const apres = fusionnerSignatures(avant, { signataire_id: 'a', signataire_nom: 'A', signature_url: 'u1' }, 't1')
    expect(apres).toHaveLength(2)
    expect(apres.find(s => s.signataire_id === 'a')).toMatchObject({ signature_url: 'u1', date_signature: 't1' })
  })

  test('avancement : tous signataires + SGS + standard requis', () => {
    const base = {
      statut: 'en_cours' as const,
      portee: ['SGS', 'PHY'],
      delegatedIds: ['a', 'b'],
      signatures: [
        { signataire_id: 'a', signataire_nom: 'A', date_signature: 't', signature_url: 'u' },
        { signataire_id: 'b', signataire_nom: 'B', date_signature: 't', signature_url: 'u' },
      ],
      marqueSgs: true,
      scoreGlobalPropose: 80,
    }
    expect(evaluerAvancement(base).peutAvancer).toBe(true)
    // Délégué manquant → bloqué avec raison délégués.
    expect(evaluerAvancement({ ...base, delegatedIds: ['a', 'b', 'c'] }))
      .toMatchObject({ peutAvancer: false, raison: expect.stringContaining('délégués') })
    // SGS non signé (workflow SGS existant via prépa) → bloqué, raison SGS.
    // (Sans aucun marqueur SGS, la porte SGS est skippée — règle d'origine.)
    expect(evaluerAvancement({ ...base, marqueSgs: false, sgsEvaluationPrepa: {} }))
      .toMatchObject({ peutAvancer: false, raison: expect.stringContaining('SGS') })
    // Statut terminal → pas d'avancement, pas de raison.
    expect(evaluerAvancement({ ...base, statut: 'transmise' as never }))
      .toMatchObject({ peutAvancer: false, raison: undefined })
  })

  test('buildPatchSignatureDelegation : patch complet horodaté', () => {
    expect(buildPatchSignatureDelegation('u', 'now')).toMatchObject({
      statut: 'checklist_signee', progression: 100,
      checklist_signature_url: 'u', checklist_signe_le: 'now',
    })
  })
})

describe('conversionEcarts', () => {
  test('buildEcartOfficiel : id normalisé, délais barème, fallbacks', () => {
    const brouillon = {
      id: 'ecart-123-abc',
      reference: 'E-01',
      ref_reglementaire: 'R1',
      libelle: 'Libellé',
      niveau: 'critique',
      domaine: '',
      created_at: '2026-01-01T00:00:00.000Z',
    }
    const ecart = buildEcartOfficiel(brouillon as never, SURV as never, '2026-01-10T00:00:00.000Z', () => 'uuid-test')
    expect(ecart.id).toBe('uuid-test')
    expect(ecart.statut).toBe('pac_attendu')
    expect(ecart.domaine).toBe('SGS')
    expect(ecart.inspecteur_ref_id).toBe('chef-1')
    expect(ecart.delai_pac).toBeTruthy()
    expect(ecart.delai_regularisation).toBeTruthy()
  })
})
