'use client'

import { Aerodrome } from '@/lib/store'

function simpleHash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff
  return Math.abs(h)
}

function genererGrille(code: string): boolean[][] {
  const h = simpleHash(code)
  const taille = 21
  const grille: boolean[][] = []

  for (let row = 0; row < taille; row++) {
    grille[row] = []
    for (let col = 0; col < taille; col++) {
      // Patterns fixes: finders (coins) + timing
      const estFinder =
        (row < 8 && col < 8) || // haut-gauche
        (row < 8 && col >= taille - 8) || // haut-droite
        (row >= taille - 8 && col < 8) // bas-gauche

      const estTiming =
        (row === 6 && col > 7 && col < taille - 8) ||
        (col === 6 && row > 7 && row < taille - 8)

      if (estFinder) {
        const lr = row < 8 ? row : row - (taille - 8)
        const lc = col < 8 ? col : col - (taille - 8)
        // Motif finder: anneau 7x7 -> 5x5 vide -> 3x3 plein
        const maxFinderRow = row >= taille - 8 ? taille - 1 - row : row
        const maxFinderCol = col >= taille - 8 ? taille - 1 - col : col
        const r = Math.min(maxFinderRow, maxFinderCol < 0 ? 7 : lc, lr, 6)
        grille[row][col] = !(r === 1 || r === 2 || r === 3)
      } else if (estTiming) {
        grille[row][col] = (row === 6 ? col : row) % 2 === 0
      } else {
        // Module data: déterministe depuis hash
        const idx = row * taille + col
        const hShifted = simpleHash(code + idx)
        grille[row][col] = (hShifted + idx) % 3 !== 0
      }
    }
  }

  return grille
}

interface Props {
  aerodrome: Aerodrome
}

export function QrCodeGenerator({ aerodrome }: Props) {
  const grille = genererGrille(aerodrome.code_oaci)
  const taille = grille.length
  const cellSize = 10
  const svgSize = taille * cellSize

  const imprimer = () => window.print()

  const copierLien = () => {
    const url = `${window.location.origin}/aerodromes/${aerodrome.code_oaci}`
    navigator.clipboard.writeText(url)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        viewBox={`0 0 ${svgSize + 10} ${svgSize + 10}`}
        className="w-56 h-56"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Fond blanc */}
        <rect x="0" y="0" width={svgSize + 10} height={svgSize + 10} fill="white" />
        {/* Modules */}
        {grille.map((row, ri) =>
          row.map((val, ci) =>
            val ? (
              <rect
                key={`${ri}-${ci}`}
                x={ci * cellSize + 5}
                y={ri * cellSize + 5}
                width={cellSize}
                height={cellSize}
                fill="black"
              />
            ) : null
          )
        )}
      </svg>

      <div className="text-center">
        <p className="font-bold text-lg">{aerodrome.code_oaci}</p>
        <p className="text-sm text-muted">{aerodrome.nom}</p>
      </div>

      <div className="flex gap-2">
        <button onClick={imprimer} className="btn btn-secondary">
          Imprimer
        </button>
        <button onClick={copierLien} className="btn btn-secondary">
          Copier le lien
        </button>
      </div>
    </div>
  )
}

export default QrCodeGenerator
