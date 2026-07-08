'use client'

import { useServerInsertedHTML } from 'next/navigation'

export function ThemeScript({ themeScript }: { themeScript: string }) {
  useServerInsertedHTML(() => (
    <script id="theme-init" dangerouslySetInnerHTML={{ __html: themeScript }} />
  ))
  return null
}
