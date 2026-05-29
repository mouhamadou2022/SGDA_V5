// app/not-found.tsx
// ✅ Page 404 premium avec animations avion et design système

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Plane, Compass, Radar, MapPin, Home, Navigation, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  const router = useRouter()
  const [isHovered, setIsHovered] = useState(false)
  const [seconds, setSeconds] = useState(5)

  // Compte à rebours pour redirection automatique
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          router.push('/')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [router])

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      
      {/* Fond décoratif avec grille radar */}
      <div className="absolute inset-0">
        {/* Grille de fond */}
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(0,0,0,0.05) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />
        
        {/* Cercles radar */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full border-2 border-role-primary/10 animate-ping" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full border-2 border-role-primary/5 animate-ping delay-1000" style={{ animationDuration: '6s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-role-primary/5 animate-radar" />
        
        {/* Ligne de vol décorative */}
        <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
          <path 
            d="M0,200 Q200,100 400,200 T800,150 T1200,250" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            className="text-role-primary"
          />
          <path 
            d="M0,400 Q300,300 600,400 T1000,350 T1400,450" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5"
            className="text-role-primary-light"
          />
        </svg>
      </div>

      {/* Avion animé */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 animate-float opacity-30">
        <Plane className="w-16 h-16 text-role-primary/20" />
      </div>

      {/* Contenu principal */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        
        {/* Badge 404 avec effet */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-role-primary/20 rounded-full blur-xl animate-pulse" />
          <div className="relative flex items-center gap-2 px-6 py-3 rounded-full bg-role-primary-soft border border-role-primary/20 shadow-role-glow">
            <Radar className="w-5 h-5 text-role-primary animate-spin" style={{ animationDuration: '3s', animationDirection: 'reverse' }} />
            <span className="text-role-primary font-mono font-bold text-sm tracking-wider">ERREUR 404</span>
            <AlertCircle className="w-4 h-4 text-warning animate-pulse" />
          </div>
        </div>

        {/* Message principal avec animation */}
        <div className="text-center space-y-4 mb-8 animate-fade-up">
          <h1 className="text-8xl lg:text-9xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-role-primary via-role-primary-light to-role-primary bg-clip-text text-transparent animate-pulse">
              404
            </span>
          </h1>
          
          <div className="space-y-2">
            <h2 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center justify-center gap-2">
              <Compass className="w-7 h-7 text-role-primary" />
              Page non trouvée
              <Navigation className="w-7 h-7 text-role-primary" />
            </h2>
            <div className="w-20 h-1 bg-gradient-to-r from-transparent via-role-primary to-transparent mx-auto rounded-full" />
          </div>
          
          <p className="text-muted max-w-md mx-auto">
            La page que vous recherchez a peut-être été déplacée, supprimée, ou n'a jamais existé.
            Comme un avion hors de sa trajectoire, nous allons vous guider vers la bonne piste.
          </p>
        </div>

        {/* Suggestions avec icônes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full mb-10 animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <Link 
            href="/"
            className="group flex items-center gap-3 p-4 rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-border hover:border-role-primary/30 hover:shadow-role-glow transition-all duration-300"
          >
            <div className="w-10 h-10 rounded-full bg-role-primary-soft flex items-center justify-center group-hover:scale-110 transition-transform">
              <Home className="w-5 h-5 text-role-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Accueil</p>
              <p className="text-xs text-muted">Retour au tableau de bord</p>
            </div>
          </Link>
          
          <button 
            onClick={() => window.history.back()}
            className="group flex items-center gap-3 p-4 rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border border-border hover:border-role-primary/30 hover:shadow-role-glow transition-all duration-300"
          >
            <div className="w-10 h-10 rounded-full bg-role-primary-soft flex items-center justify-center group-hover:scale-110 transition-transform">
              <Navigation className="w-5 h-5 text-role-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Page précédente</p>
              <p className="text-xs text-muted">Revenir en arrière</p>
            </div>
          </button>
        </div>

        {/* Compte à rebours */}
        <div className="text-center animate-fade-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2 text-sm text-muted mb-4">
            <MapPin className="w-4 h-4" />
            <span>Redirection automatique vers l'accueil dans</span>
            <span className="font-mono font-bold text-role-primary bg-role-primary-soft px-2 py-0.5 rounded-full">
              {seconds} seconde{seconds > 1 ? 's' : ''}
            </span>
          </div>
          
          {/* Bouton principal avec animation avion */}
          <Link href="/">
            <Button 
              className="btn-primary group relative overflow-hidden"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              <span>Retour à l'accueil</span>
              <Plane className={`w-4 h-4 ml-2 transition-all duration-500 ${isHovered ? 'translate-x-2 -translate-y-1' : ''}`} />
              {isHovered && (
                <div className="absolute inset-0 bg-white/10 translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
              )}
            </Button>
          </Link>
        </div>

        {/* Citation aviation */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="text-[10px] text-muted/50 flex items-center justify-center gap-2">
            <span className="w-8 h-px bg-gradient-to-r from-transparent to-muted/30" />
            "Le décollage est facultatif, l'atterrissage est obligatoire"
            <span className="w-8 h-px bg-gradient-to-l from-transparent to-muted/30" />
          </p>
        </div>
      </div>

      {/* Effet de brouillard en bas */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-role-primary/5 to-transparent pointer-events-none" />
    </div>
  )
}