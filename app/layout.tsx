// app/layout.tsx
import type { Metadata, Viewport } from 'next'
import { Sora, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import { GlobalOptimizer } from '@/components/providers/GlobalOptimizer'
import './globals.css'

const sora = Sora({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sora',
  weight: ['300', '400', '500', '600', '700', '800'],
  preload: true,
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  preload: true,
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sgda.anacim.sn'),
  title: {
    default: 'SGDA — ANACIM Sénégal',
    template: '%s | SGDA — ANACIM',
  },
  description: 'Système de Gestion des Aérodromes du Sénégal — Sécurité, Sûreté et Développement Durable',
  authors: [{ name: 'ANACIM Sénégal', url: 'https://anacim.sn' }],
  keywords: [
    'aérodromes', 
    'sécurité aérienne', 
    'ANACIM', 
    'Sénégal', 
    'surveillance', 
    'aviation civile',
    'météorologie',
    'certification aérodrome',
    'homologation'
  ],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SGDA ANACIM',
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  openGraph: {
    title: 'SGDA — ANACIM Sénégal',
    description: 'Système de Gestion des Aérodromes du Sénégal',
    url: 'https://sgda.anacim.sn',
    siteName: 'SGDA ANACIM',
    locale: 'fr_FR',
    type: 'website',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'SGDA — Système de Gestion des Aérodromes',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SGDA — ANACIM Sénégal',
    description: 'Système de Gestion des Aérodromes du Sénégal',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/apple-icon.png', sizes: '180x180' },
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1a237e' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  colorScheme: 'light dark',
}

const themeScript = `
  (function() {
    try {
      const savedTheme = localStorage.getItem('sgda-theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = savedTheme === 'dark' || (savedTheme !== 'light' && prefersDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {}
  })();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html 
      lang="fr" 
      suppressHydrationWarning 
      className={`${sora.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <link rel="dns-prefetch" href="https://api.anacim.sn" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="application-name" content="SGDA ANACIM" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SGDA" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#1a237e" />
        <meta name="msapplication-tap-highlight" content="no" />
        <meta name="geo.region" content="SN" />
        <meta name="geo.placename" content="Dakar" />
        <meta name="geo.position" content="14.6937;-17.4441" />
        <meta name="ICBM" content="14.6937, -17.4441" />
      </head>
      <body 
        className={`${sora.className} antialiased min-h-screen bg-gradient-to-br from-background to-muted/20`}
        suppressHydrationWarning
      >
        <GlobalOptimizer>
          {children}
        </GlobalOptimizer>
      </body>
    </html>
  )
}