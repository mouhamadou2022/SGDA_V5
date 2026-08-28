// lib/ia/libelleMemory.ts
// Mémoire des libellés d'écarts réajustés par l'inspecteur.
// Boucle d'apprentissage textuelle : quand l'inspecteur corrige le libellé
// proposé par l'IA, on mémorise sa version finale comme « exemple de référence »,
// puis on la réinjecte (few-shot) dans le prompt des prochaines suggestions,
// afin que les formulations de l'inspecteur soient reproduites.

'use client'

export interface LibelleCorrectionRecord {
  id: string
  date: string
  isSGS: boolean
  /** Références réglementaires citées dans l'écart (inventaire du contexte) */
  references: string[]
  /** IDs des items de checklist sélectionnés (permet l'anticipation exacte) */
  itemIds: string[]
  /** Libellé proposé par l'IA (avant correction) */
  libellePropose: string
  /** Libellé final validé/corrigé par l'inspecteur */
  libelleCorrige: string
  /** Résumé court du contexte (items NS/NV + observations) pour similarité */
  contexte: string
  /** Avis watch-dog de l'IA (combiner/séparer les items) accepté par l'inspecteur */
  avis?: string
  /** Nombre d'écarts recommandé par l'IA et accepté par l'inspecteur */
  nbEcartsRecommande?: number
  /** true = l'inspecteur a validé le regroupement proposé ; false = il l'a refusé */
  regroupementValide?: boolean
}

const STORAGE_STORE = 'feedbacks'
const STORAGE_KEY = 'libelle_memory'
const MAX_MEMOIRES = 30

class LibelleMemory {
  private memoires: LibelleCorrectionRecord[] = []

  init(donnees: LibelleCorrectionRecord[]): void {
    if (!donnees || donnees.length === 0) return
    this.memoires = [...donnees].slice(-MAX_MEMOIRES)
  }

  initFromIDB(): void {
    if (typeof indexedDB === 'undefined') return
    import('@/lib/persistence/iaStorage').then(({ iaStorage }) =>
      iaStorage.get<LibelleCorrectionRecord[]>(STORAGE_STORE, STORAGE_KEY).then((stored) => {
        if (stored) this.init(stored)
      })
    ).catch(() => { /* best-effort : la mémoire ne bloque jamais l'IA */ })
  }

  /**
   * Enregistre un libellé corrigé comme exemple de référence.
   * N'enregistre que si l'inspecteur a réellement modifié le texte proposé.
   */
  enregistrerCorrection(input: {
    isSGS: boolean
    references: string[]
    itemIds: string[]
    libellePropose: string
    libelleCorrige: string
    contexte: string
    avis?: string
    nbEcartsRecommande?: number
    regroupementValide?: boolean
  }): LibelleCorrectionRecord | null {
    const propos = (input.libellePropose || '').trim()
    const corrige = (input.libelleCorrige || '').trim()
    // Refus de regroupement : on mémorise même si le libellé n'a pas changé.
    if (!corrige) return null
    if (corrige === propos && input.regroupementValide !== false) return null

    const record: LibelleCorrectionRecord = {
      id: `lib-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: new Date().toISOString(),
      isSGS: input.isSGS,
      references: input.references || [],
      itemIds: input.itemIds || [],
      libellePropose: propos,
      libelleCorrige: corrige,
      contexte: (input.contexte || '').slice(0, 400),
      avis: input.avis || undefined,
      nbEcartsRecommande: input.nbEcartsRecommande,
      regroupementValide: input.regroupementValide,
    }

    this.memoires = [...this.memoires, record].slice(-MAX_MEMOIRES)

    if (typeof indexedDB !== 'undefined') {
      import('@/lib/persistence/iaStorage').then(({ iaStorage }) =>
        iaStorage.set(STORAGE_STORE, STORAGE_KEY, this.memoires)
      ).catch(() => { /* best-effort */ })
    }

    return record
  }

  /**
   * Récupère les N derniers exemples de libellés corrigés (few-shot).
   * Filtre sur le domaine (SGS / standard) et la proximité des références.
   * Si aucun exemple ne correspond aux références, replie sur les exemples
   * récents du domaine afin que l'apprentissage soit toujours injecté.
   */
  getExemples(limit: number = 3, opts?: { isSGS?: boolean; references?: string[] }): LibelleCorrectionRecord[] {
    let result = [...this.memoires].reverse()

    if (opts?.isSGS !== undefined) {
      result = result.filter((r) => r.isSGS === opts.isSGS)
    }

    if (opts?.references && opts.references.length > 0) {
      const refs = opts.references
      const score = (r: LibelleCorrectionRecord) => {
        const overlap = r.references.filter((x) => refs.includes(x) || refs.some((y) => y.includes(x) || x.includes(y))).length
        return overlap
      }
      const scored = result
        .map((r) => ({ r, s: score(r) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.r)
      // Repli : si aucun exemple ne partage une référence, on garde les plus récents du domaine.
      result = scored.length > 0 ? scored : result
    }

    if (result.length === 0) return []
    return result.slice(0, limit)
  }

  getAll(): LibelleCorrectionRecord[] {
    return [...this.memoires]
  }

  /**
   * Anticipation : retrouve un libellé déjà validé par l'inspecteur pour le
   * MÊME ensemble d'items (mêmes IDs sélectionnés + même domaine). Permet de
   * répondre instantanément sans rappeler le LLM quand les mêmes questions
   * reviennent (surveillances périodiques récurrentes).
   * Retourne aussi les refus de regroupement (pour ne pas re-proposer).
   */
  findExactMatch(opts: { itemIds: string[]; isSGS: boolean }): LibelleCorrectionRecord | null {
    const ids = (opts.itemIds || []).filter(Boolean).sort().join('|')
    if (!ids) return null
    return this.memoires
      .filter(r => r.isSGS === opts.isSGS)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .find(r => (r.itemIds || []).filter(Boolean).sort().join('|') === ids) || null
  }

  /**
   * Retourne le refus de regroupement le plus récent pour cet ensemble d'items,
   * s'il existe (pour éviter de re-proposer un groupement refusé).
   */
  findRecentRefus(opts: { itemIds: string[]; isSGS: boolean }): LibelleCorrectionRecord | null {
    const ids = (opts.itemIds || []).filter(Boolean).sort().join('|')
    if (!ids) return null
    return this.memoires
      .filter(r => r.isSGS === opts.isSGS && r.regroupementValide === false)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .find(r => (r.itemIds || []).filter(Boolean).sort().join('|') === ids) || null
  }

  reset(): void {
    this.memoires = []
  }
}

export const libelleMemory = new LibelleMemory()
