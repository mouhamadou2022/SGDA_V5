// tailwind.config.ts — SGDA V5
// Tailwind v4 : la configuration principale est dans globals.css (@theme).
// Les safelist dynamiques sont gérées via @source dans globals.css.
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
}

export default config
