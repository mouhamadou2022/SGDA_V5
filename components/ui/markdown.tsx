// components/ui/markdown.tsx
// Mini-rendu Markdown SÛR (sans dangerouslySetInnerHTML : pas de XSS) pour
// les réponses IA : gras, italique, code inline, titres, listes, paragraphes.
// Suffisant pour la prose des agents ; pas un parseur complet.

'use client'

import React from 'react'

const COMMANDES_LATEX: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', varsigma: 'ς', tau: 'τ',
  upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  times: '×', div: '÷', pm: '±', mp: '∓', cdot: '⋅', ast: '∗',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡',
  infty: '∞', partial: '∂', sum: 'Σ', prod: 'Π', to: '→', rightarrow: '→',
  leftarrow: '←', propto: '∝', perp: '⊥', angle: '∠', prime: '′', forall: '∀',
  exists: '∃', emptyset: '∅', cap: '∩', cup: '∪', subset: '⊂', supset: '⊃',
  ldots: '…', mid: '∣', sim: '∼', cong: '≅',
}

const EXPOSANTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', i: 'ⁱ', j: 'ʲ', k: 'ᵏ', l: 'ˡ',
  m: 'ᵐ', n: 'ⁿ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
  A: 'ᴬ', B: 'ᴮ', D: 'ᴰ', E: 'ᴱ', G: 'ᴳ', H: 'ᴴ', I: 'ᴵ', J: 'ᴶ', K: 'ᴷ', L: 'ᴸ', M: 'ᴹ',
  N: 'ᴺ', O: 'ᴼ', P: 'ᴾ', R: 'ᴿ', T: 'ᵀ', U: 'ᵁ', V: 'ⱽ', W: 'ᵂ',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
}

const INDICES: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ',
  r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
}

const transcrireGroupe = (g: string, table: Record<string, string>) =>
  [...g].map(c => table[c] ?? c).join('')

/** Convertit une expression LaTeX simple en texte Unicode lisible. */
export function convertirLatex(expr: string): string {
  let s = expr.trim()
  s = s.replace(/\\text\{([^}]*)\}/g, '$1')
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
  s = s.replace(/\\(?:d|s)?frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
  s = s.replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
  s = s.replace(/\\sqrt\s+([a-zA-Z0-9])/g, '√$1')
  s = s.replace(/\\([a-zA-Z]+)/g, (m, cmd: string) => COMMANDES_LATEX[cmd] ?? m.replace('\\', ''))
  s = s.replace(/\^\{([^}]*)\}/g, (_, g: string) => transcrireGroupe(g, EXPOSANTS))
  s = s.replace(/\^([0-9a-zA-Z+\-()])/g, (_, c: string) => EXPOSANTS[c] ?? c)
  s = s.replace(/_\{([^}]*)\}/g, (_, g: string) => transcrireGroupe(g, INDICES))
  s = s.replace(/_([0-9a-zA-Z+\-()])/g, (_, c: string) => INDICES[c] ?? c)
  s = s.replace(/[{}]/g, '')
  return s
}

/** Rend l'inline : $maths$, **gras**, *italique*, `code`. */
function renderInline(texte: string, prefixe: string): React.ReactNode[] {
  // Maths d'abord : $K$, $\alpha = 0,05$, $$\frac{a}{b}$$ — l'intérieur ne
  // doit pas contenir d'espace (hors $$...$$) pour ne pas avaler un « $ »
  // monétaire (« 5 $ par unité » reste intact).
  const parties = texte.split(/(\$\$[^$]+\$\$|\$[^\s$][^$]*\$)/g)
  return parties.flatMap((morceau, i): React.ReactNode[] => {
    const cle = `${prefixe}-${i}`
    if ((morceau.startsWith('$$') && morceau.endsWith('$$')) || (morceau.startsWith('$') && morceau.endsWith('$'))) {
      const display = morceau.startsWith('$$')
      const interne = display ? morceau.slice(2, -2) : morceau.slice(1, -1)
      // Garde-fou « $ » monétaire : $...$ n'est des maths que sans espace aux
      // bords et (display, ou commande ^ _ / =, ou expression courte).
      const estMaths = display ||
        (!/^\s|\s$/.test(interne) && (/\\/.test(interne) || /[\^_/=]/.test(interne) || interne.length <= 12))
      if (!estMaths) return [renderGrasItaliqueCode(morceau, cle)]
      return [<em key={cle} className="font-serif">{convertirLatex(interne)}</em>]
    }
    return [renderGrasItaliqueCode(morceau, cle)]
  })
}

/** Rend l'inline hors maths : **gras**, *italique*, `code`. */
function renderGrasItaliqueCode(texte: string, prefixe: string): React.ReactNode {
  const parties = texte.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  if (parties.length === 1) return <React.Fragment key={prefixe}>{texte}</React.Fragment>
  return (
    <React.Fragment key={prefixe}>
      {parties.map((morceau, i) => {
        const cle = `${prefixe}-${i}`
        if (morceau.startsWith('**') && morceau.endsWith('**') && morceau.length > 4) {
          return <strong key={cle} className="font-semibold">{morceau.slice(2, -2)}</strong>
        }
        if (morceau.startsWith('*') && morceau.endsWith('*') && morceau.length > 2) {
          return <em key={cle}>{morceau.slice(1, -1)}</em>
        }
        if (morceau.startsWith('`') && morceau.endsWith('`') && morceau.length > 2) {
          return <code key={cle} className="rounded bg-foreground/10 px-1 text-[0.9em]">{morceau.slice(1, -1)}</code>
        }
        return <React.Fragment key={cle}>{morceau}</React.Fragment>
      })}
    </React.Fragment>
  )
}

/**
 * Convertit du Markdown IA en texte brut lisible (exports PDF/Word, logs) :
 * gras/italique/code délimités, titres aplatis, puces en « • », LaTeX converti.
 */
export function markdownVersTexte(texte: string): string {
  return (texte || '')
    .split('\n')
    .map(ligne => {
      let l = ligne
      l = l.replace(/\$\$([^$]+)\$\$/g, (_, expr: string) => convertirLatex(expr))
      l = l.replace(/\$([^\s$][^$]*)\$/g, (m, expr: string) =>
        !/^\s|\s$/.test(expr) && (/\\/.test(expr) || /[\^_/=]/.test(expr) || expr.length <= 12)
          ? convertirLatex(expr) : m)
      l = l.replace(/^#{1,4}\s+/, '')
      l = l.replace(/^[-•*]\s+/, '• ')
      l = l.replace(/^\d+[.)]\s+/, '• ')
      l = l.replace(/\*\*([^*]+)\*\*/g, '$1')
      l = l.replace(/(^|\W)\*([^*\n]+)\*/g, '$1$2')
      l = l.replace(/`([^`]+)`/g, '$1')
      return l.trimEnd()
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function Markdown({ texte, className }: { texte: string; className?: string }) {
  const lignes = texte.split('\n')
  const blocs: React.ReactNode[] = []
  let puces: string[] = []

  const viderPuces = (cle: string) => {
    if (puces.length > 0) {
      blocs.push(
        <ul key={cle} className="my-1 ml-4 list-disc space-y-0.5">
          {puces.map((p, i) => <li key={i}>{renderInline(p, `${cle}-li${i}`)}</li>)}
        </ul>,
      )
      puces = []
    }
  }

  lignes.forEach((ligne, idx) => {
    const t = ligne.trim()
    const puce = t.match(/^[-•*]\s+(.+)$/)
    const titre = t.match(/^(#{1,4})\s+(.+)$/)
    if (puce) {
      puces.push(puce[1])
      return
    }
    viderPuces(`ul-${idx}`)
    if (!t) return
    if (titre) {
      const contenu = renderInline(titre[2], `h${idx}`)
      const classes = titre[1].length <= 2 ? 'mt-2 text-sm font-semibold' : 'mt-1.5 text-[13px] font-semibold'
      blocs.push(<p key={idx} className={classes}>{contenu}</p>)
    } else {
      blocs.push(<p key={idx} className="my-0.5">{renderInline(t, `p${idx}`)}</p>)
    }
  })
  viderPuces('ul-fin')

  return <div className={className}>{blocs}</div>
}

export default Markdown
