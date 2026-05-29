// middleware.ts — Protection des routes SGDA
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Routes publiques
  const publicRoutes = ['/login', '/api/auth/login-code', '/api/auth/link-anonymous']
  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // Routes API — protégées par leur propre logique
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Fichiers statiques (images, polices, icônes)
  const staticExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.json', '.txt', '.pdf', '.woff', '.woff2']
  if (staticExtensions.some(ext => pathname.endsWith(ext))) {
    return NextResponse.next()
  }

  // Routes statiques Next.js
  if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon') || pathname === '/') {
    return NextResponse.next()
  }

  // Auth gérée côté client (app/page.tsx) — middleware laisse tout passer
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|json|txt|pdf|woff|woff2)$).*)'],
}
