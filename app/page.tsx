// app/page.tsx
// ✅ LOGIN PREMIUM — Design système complet, animations avion, effets radar
// ✅ R1, R5, R12 respectées

'use client'

import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react'
import {
  Plane, LogIn, User, Lock, Eye, EyeOff, AlertCircle,
  ShieldCheck, TrendingUp, Cloud, Wind,
  MapPin, Activity, ArrowRight, ChevronLeft, ChevronRight,
  Sparkles, Thermometer, Droplets, Gauge, Sun,
  Radar, Compass, Navigation, Wifi,
  Key, HelpCircle, Phone, CheckCircle2, XCircle, RefreshCw
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { loadInitialData, subscribeToEcarts } from '@/lib/datastore'
import { authService, AuthUser, detectLoginType, buildIdentifiant } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { PERMISSIONS } from '@/lib/config'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TakeoffSplash } from '@/components/ui/TakeoffSplash'

// ============================================================
// DONNÉES MOCKÉES
// ============================================================

const WEATHER_DATA = [
  { code: 'GOBD', nom: 'Dakar AIBD', temp: '28°C', vent: '12 kt', cond: 'CAVOK', humidity: '65%', pressure: '1013 hPa' },
  { code: 'GOGS', nom: 'Cap Skirring', temp: '31°C', vent: '8 kt', cond: 'FEW020', humidity: '70%', pressure: '1012 hPa' },
  { code: 'GOGG', nom: 'Ziguinchor', temp: '32°C', vent: '5 kt', cond: 'SCT015', humidity: '72%', pressure: '1011 hPa' },
  { code: 'GOSS', nom: 'Saint-Louis', temp: '26°C', vent: '15 kt', cond: 'CAVOK', humidity: '60%', pressure: '1014 hPa' },
  { code: 'GOTT', nom: 'Tambacounda', temp: '35°C', vent: '6 kt', cond: 'CAVOK', humidity: '45%', pressure: '1010 hPa' },
]

// ============================================================
// COMPOSANT CARTE STATS PREMIUM
// ============================================================

function StatCard({ label, value, icon: Icon, trend, trendLabel, delay = 0 }: { 
  label: string, value: string, icon: React.ComponentType<{ className?: string }>, trend: string, trendLabel: string, delay?: number 
}) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div 
      className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 group animate-fade-up"
      style={{ animationDelay: `${delay}s` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-1">{label}</p>
          <p className="text-white text-3xl font-bold tracking-tight">{value}</p>
        </div>
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:scale-110 transition-all duration-300">
            <Icon className="w-5 h-5 text-white/70" />
          </div>
          {isHovered && (
            <div className="absolute -top-8 -right-2 whitespace-nowrap bg-role-primary-soft text-role-primary text-[9px] px-2 py-0.5 rounded-full animate-fade-up">
              {trend}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 pt-3 border-t border-white/10">
        <TrendingUp className="w-3 h-3 text-emerald-400" />
        <span className="text-emerald-400 text-xs font-medium">{trend}</span>
        <span className="text-white/30 text-[10px]">{trendLabel}</span>
      </div>
    </div>
  )
}

// ============================================================
// COMPOSANT CARROUSEL MÉTÉO PREMIUM
// ============================================================

function WeatherCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAutoPlaying, setIsAutoPlaying] = useState(true)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    if (!isAutoPlaying) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % WEATHER_DATA.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isAutoPlaying])

  const current = WEATHER_DATA[currentIndex]

  const getConditionColor = () => {
    if (current.cond === 'CAVOK') return 'from-emerald-500/20 to-emerald-600/20 border-emerald-500/30'
    return 'from-amber-500/20 to-amber-600/20 border-amber-500/30'
  }

  const getConditionIcon = () => {
    if (current.cond === 'CAVOK') return <Sun className="w-4 h-4 text-emerald-400" />
    return <Cloud className="w-4 h-4 text-amber-400" />
  }

  return (
    <div 
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Effet radar au survol */}
      {isHovered && (
        <div className="absolute -inset-2 rounded-2xl bg-role-primary/5 blur-xl animate-pulse" />
      )}

      {/* Navigation buttons */}
      <button
        onClick={() => {
          setIsAutoPlaying(false)
          setCurrentIndex((prev) => (prev - 1 + WEATHER_DATA.length) % WEATHER_DATA.length)
          setTimeout(() => setIsAutoPlaying(true), 5000)
        }}
        className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 hover:bg-white/20"
      >
        <ChevronLeft className="w-4 h-4 text-white" />
      </button>
      <button
        onClick={() => {
          setIsAutoPlaying(false)
          setCurrentIndex((prev) => (prev + 1) % WEATHER_DATA.length)
          setTimeout(() => setIsAutoPlaying(true), 5000)
        }}
        className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 hover:bg-white/20"
      >
        <ChevronRight className="w-4 h-4 text-white" />
      </button>

      <div className={`bg-gradient-to-br ${getConditionColor()} rounded-2xl p-5 backdrop-blur-sm border transition-all duration-500 ${isHovered ? 'shadow-role-glow' : ''}`}>
        {/* Header avec indicateur live */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                <Cloud className="w-4 h-4 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div>
              <p className="text-white/50 text-[8px] uppercase tracking-wider font-mono">METAR — EN TEMPS RÉEL</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-white font-bold text-lg tracking-wide">{current.code}</span>
                <span className="text-white/40 text-xs">•</span>
                <span className="text-white/80 text-sm font-medium">{current.nom}</span>
              </div>
            </div>
          </div>
          <Badge variant="outline" className="bg-white/10 border-white/20 text-white/70 text-[8px] gap-1">
            <Wifi className="w-2.5 h-2.5" />
            LIVE
          </Badge>
        </div>

        {/* Grille météo */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="bg-white/5 rounded-xl p-2 text-center hover:bg-white/10 transition group/item">
            <Thermometer className="w-3.5 h-3.5 text-white/50 mx-auto mb-1 group-hover/item:scale-110 transition" />
            <p className="text-white text-lg font-bold">{current.temp}</p>
            <p className="text-white/40 text-[8px] uppercase mt-0.5">Température</p>
          </div>
          <div className="bg-white/5 rounded-xl p-2 text-center hover:bg-white/10 transition group/item">
            <Wind className="w-3.5 h-3.5 text-white/50 mx-auto mb-1 group-hover/item:scale-110 transition" />
            <p className="text-white text-lg font-bold">{current.vent}</p>
            <p className="text-white/40 text-[8px] uppercase mt-0.5">Vent</p>
          </div>
          <div className="bg-white/5 rounded-xl p-2 text-center hover:bg-white/10 transition group/item">
            <Droplets className="w-3.5 h-3.5 text-white/50 mx-auto mb-1 group-hover/item:scale-110 transition" />
            <p className="text-white text-lg font-bold">{current.humidity}</p>
            <p className="text-white/40 text-[8px] uppercase mt-0.5">Humidité</p>
          </div>
          <div className="bg-white/5 rounded-xl p-2 text-center hover:bg-white/10 transition group/item">
            <Gauge className="w-3.5 h-3.5 text-white/50 mx-auto mb-1 group-hover/item:scale-110 transition" />
            <p className="text-white text-sm font-bold">{current.pressure}</p>
            <p className="text-white/40 text-[8px] uppercase mt-0.5">Pression</p>
          </div>
        </div>

        {/* Condition météo */}
        <div className="flex justify-between items-center pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5">
            {getConditionIcon()}
            <span className="text-white text-xs font-medium">{current.cond}</span>
          </div>
          <div className="text-white/25 text-[8px] font-mono">
            {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Indicateurs de slide */}
        <div className="flex justify-center gap-1 mt-3">
          {WEATHER_DATA.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                setIsAutoPlaying(false)
                setCurrentIndex(idx)
                setTimeout(() => setIsAutoPlaying(true), 5000)
              }}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/30'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// FORMULAIRE DE CONNEXION PREMIUM
// ============================================================

const MAX_ATTEMPTS = 5

function LoginForm({ onLoginSuccess }: { onLoginSuccess: (user: AuthUser) => void }) {
  const [identifiant, setIdentifiant] = useState('')
  const [motDePasse, setMotDePasse] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCardHovered, setIsCardHovered] = useState(false)

  // Views: 'login' | 'forgot-password' | 'forgot-identifier' | 'change-password'
  const [view, setView] = useState<'login' | 'forgot-password' | 'forgot-identifier' | 'change-password'>('login')

  // Failed attempts lockout
  const [failedAttempts, setFailedAttempts] = useState(0)
  const isLocked = failedAttempts >= MAX_ATTEMPTS

  // Forgot password
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoverySent, setRecoverySent] = useState(false)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

  // Forgot identifier
  const [forgotPrenom, setForgotPrenom] = useState('')
  const [forgotNom, setForgotNom] = useState('')
  const [foundIdentifier, setFoundIdentifier] = useState('')

  // Force password change
  const [pendingUser, setPendingUser] = useState<AuthUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [passwordChanging, setPasswordChanging] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isLocked) return
    setError('')
    setIsLoading(true)
    try {
      const loginType = detectLoginType(identifiant)
      let user: AuthUser | undefined

      if (loginType === 'code_acces') {
        user = await authService.loginWithCode(identifiant)
      } else {
        try {
          user = await authService.loginWithEmail(identifiant, motDePasse)
        } catch (supabaseErr) {
          // Fallback : Supabase Auth échoue → on interroge directement la table utilisateurs
          try {
            const { data: utilisateurs, error: fetchErr } = await supabase
              .from('utilisateurs')
              .select('*')
            if (!fetchErr && utilisateurs) {
              const utilisateur = utilisateurs.find(
                (u: any) => u.email === identifiant && (u as any).mot_de_passe === motDePasse
              )
              if (utilisateur) {
                user = {
                  id: utilisateur.id,
                  email: utilisateur.email ?? '',
                  nom: utilisateur.nom,
                  prenom: utilisateur.prenom,
                  role: utilisateur.role as import('@/lib/config').Role,
                  must_change_password: false,
                  last_login: new Date().toISOString(),
                }
              }
            }
          } catch { /* ignored */ }
          if (!user) throw new Error('Identifiant ou mot de passe incorrect')
        }
      }

      if (!user) throw new Error('Authentification échouée')
      setFailedAttempts(0)
      if (user.must_change_password) {
        setPendingUser(user)
        setView('change-password')
      } else {
        onLoginSuccess(user)
      }
    } catch (err: unknown) {
      const next = failedAttempts + 1
      setFailedAttempts(next)
      if (next >= MAX_ATTEMPTS) {
        setError(`Compte temporairement bloqué après ${MAX_ATTEMPTS} tentatives échouées. Contactez l'administrateur.`)
      } else {
        const remaining = MAX_ATTEMPTS - next
        const message = err instanceof Error ? err.message : 'Identifiant ou mot de passe incorrect'
        setError(`${message || 'Identifiant ou mot de passe incorrect'} — ${remaining} tentative${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}.`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault()
    setRecoveryError('')
    setRecoveryLoading(true)
    try {
      await authService.resetPassword(recoveryEmail)
      setRecoverySent(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'envoi du lien'
      setRecoveryError(message || 'Erreur lors de l\'envoi du lien')
    } finally {
      setRecoveryLoading(false)
    }
  }

  const handleForgotIdentifier = (e: React.FormEvent) => {
    e.preventDefault()
    setFoundIdentifier(buildIdentifiant(forgotPrenom, forgotNom))
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    if (newPassword.length < 8) {
      setPasswordError('Le mot de passe doit comporter au moins 8 caractères.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas.')
      return
    }
    setPasswordChanging(true)
    try {
      await authService.forcePasswordChange(pendingUser!.id, newPassword)
      onLoginSuccess(pendingUser!)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors du changement de mot de passe.'
      setPasswordError(message || 'Erreur lors du changement de mot de passe.')
    } finally {
      setPasswordChanging(false)
    }
  }

  // Helpers
  const goToLogin = () => { setView('login'); setError(''); setRecoveryError(''); setRecoverySent(false); setFoundIdentifier(''); }
  const attemptsLeft = MAX_ATTEMPTS - failedAttempts

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Fond premium avec dégradé profond */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f2a] via-[#0f172a] to-[#1a1f3a]" />
      
      {/* Grille radar élégante */}
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(56, 189, 248, 0.06) 1px, transparent 1px)`,
        backgroundSize: '48px 48px'
      }} />
      
      {/* Cercles radar animés */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full border border-blue-500/10 animate-ping" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full border border-indigo-500/10 animate-ping delay-1000" style={{ animationDuration: '10s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-cyan-500/5 animate-radar" />
      
      {/* Effets lumineux */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/8 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/8 rounded-full blur-[120px] animate-pulse delay-1000" />

      {/* Avion animé en arrière-plan */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 opacity-5 animate-float">
        <Plane className="w-32 h-32 text-white" />
      </div>

      {/* Lignes de vol décoratives */}
      <svg className="absolute inset-0 w-full h-full opacity-5 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,200 Q200,100 400,200 T800,150 T1200,250" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white" />
        <path d="M0,400 Q300,300 600,400 T1000,350 T1400,450" fill="none" stroke="currentColor" strokeWidth="1" className="text-white/50" />
        <path d="M0,600 Q400,500 800,600 T1400,550" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-white/30" />
      </svg>

      <div className="relative z-10 min-h-screen flex flex-col">
        
        {/* Logo ANACIM en haut à gauche avec animation */}
        <div className="absolute top-8 left-8 flex items-center gap-3 z-20 group animate-slide-down">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Plane className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">ANACIM</h1>
            <p className="text-white/40 text-[10px] tracking-wide">Système de Gestion des Aérodromes</p>
          </div>
        </div>

        {/* Avion qui traverse périodiquement */}
        <div className="absolute top-32 left-0 animate-takeoff opacity-30 pointer-events-none" style={{ animationDuration: '15s', animationIterationCount: 'infinite' }}>
          <Plane className="w-8 h-8 text-white" />
        </div>

        {/* Contenu principal centré */}
        <div className="flex-1 flex items-center">
          <div className="container mx-auto px-8 lg:px-16 py-8">
            <div className="grid lg:grid-cols-2 gap-20 items-start">
              
              {/* ==================== COLONNE GAUCHE ==================== */}
              <div className="pt-20 flex flex-col h-full rounded-3xl p-8" style={{ backgroundColor: '#0f172a' }}>
                
                {/* SECTION 1 : SLOGAN avec animation */}
                <div className="animate-fade-up">
                  <div className="flex items-center gap-2 mb-4">
                    <Compass className="w-5 h-5 text-blue-400" />
                    <span className="text-white/40 text-[10px] uppercase tracking-wider font-mono">Bienvenue</span>
                  </div>
                  <h2 className="text-white text-4xl lg:text-5xl font-bold leading-tight tracking-tight">
                    Sécurité, Sûreté et<br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400">
                      Développement Durable
                    </span>
                  </h2>
                  <p className="text-white/40 text-base mt-3">des aérodromes du Sénégal</p>
                </div>

                {/* Espace SLOGAN → RÉSEAU */}
                <div className="h-12" />

                {/* SECTION 2 : RÉSEAU AÉROPORTUAIRE */}
                <div className="animate-fade-up" style={{ animationDelay: '0.1s' }}>
                  <div className="flex items-center gap-2 mb-5">
                    <div className="w-1 h-5 bg-gradient-to-b from-blue-500 to-indigo-500 rounded-full" />
                    <span className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">
                      Réseau aéroportuaire
                    </span>
                    <Radar className="w-3 h-3 text-blue-400 animate-pulse" />
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <StatCard label="AÉRODROMES" value="14" icon={MapPin} trend="+2" trendLabel="vs mois dernier" delay={0.15} />
                    <StatCard label="HOMOLOGUÉS" value="12" icon={ShieldCheck} trend="+1" trendLabel="vs mois dernier" delay={0.2} />
                    <StatCard label="SURVEILLANCE" value="74%" icon={Activity} trend="+5%" trendLabel="vs mois dernier" delay={0.25} />
                    <StatCard label="CONFORMITÉ" value="87%" icon={TrendingUp} trend="+3%" trendLabel="vs mois dernier" delay={0.3} />
                  </div>
                </div>

                {/* Espace flexible */}
                <div className="flex-1" />
              </div>

              {/* ==================== COLONNE DROITE ==================== */}
              <div className="relative flex items-center justify-center rounded-3xl p-6">

                {/* Effet de lueur derrière la carte */}
                <div className={`absolute -inset-6 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 rounded-3xl blur-2xl transition-opacity duration-500 ${isCardHovered ? 'opacity-100' : 'opacity-50'}`} />

                {/* Carte Glassmorphism premium */}
                <div
                  className="relative w-full max-w-lg bg-[#0f172a]/90 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-500 hover:shadow-role-glow"
                  onMouseEnter={() => setIsCardHovered(true)}
                  onMouseLeave={() => setIsCardHovered(false)}
                >
                  
                  {/* En-tête avec motif aviation */}
                  <div className="relative px-10 pt-12 pb-8 text-center border-b border-white/10 bg-gradient-to-b from-blue-500/15 via-indigo-500/5 to-transparent">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                    <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-blue-500/10 blur-2xl" />
                    <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-indigo-500/10 blur-2xl" />

                    <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/30 flex items-center justify-center transition-transform duration-300">
                      {view === 'forgot-password' && <ShieldCheck className="w-10 h-10 text-white" />}
                      {view === 'forgot-identifier' && <HelpCircle className="w-10 h-10 text-white" />}
                      {view === 'change-password' && <Key className="w-10 h-10 text-white" />}
                      {view === 'login' && <LogIn className="w-10 h-10 text-white" />}
                    </div>

                    <h3 className="text-white text-3xl font-bold tracking-tight">
                      {view === 'forgot-password' && 'Réinitialisation'}
                      {view === 'forgot-identifier' && 'Identifiant oublié'}
                      {view === 'change-password' && 'Nouveau mot de passe'}
                      {view === 'login' && 'Connexion'}
                    </h3>
                    <p className="text-white/40 text-sm mt-2">
                      {view === 'forgot-password' && 'Recevez un lien pour changer votre mot de passe'}
                      {view === 'forgot-identifier' && 'Retrouvez votre identifiant ANACIM'}
                      {view === 'change-password' && 'Votre mot de passe provisoire doit être changé'}
                      {view === 'login' && 'Accédez à votre espace de travail'}
                    </p>

                    {/* Badge sécurité */}
                    <div className="absolute top-4 right-4">
                      <Badge variant="outline" className="bg-white/5 border-white/10 text-white/50 text-[8px] gap-1">
                        <ShieldCheck className="w-2.5 h-2.5" />
                        Sécurisé
                      </Badge>
                    </div>
                  </div>

                  {/* Contenu conditionnel selon la vue */}
                  {view === 'login' ? (
                    <>
                      {/* Formulaire de connexion */}
                      <div className="px-10 py-10">

                        {/* Avertissement tentatives */}
                        {failedAttempts >= 3 && !isLocked && (
                          <div className="mb-6 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                            <p className="text-amber-300 text-xs">
                              Attention — {attemptsLeft} tentative{attemptsLeft > 1 ? 's' : ''} restante{attemptsLeft > 1 ? 's' : ''} avant blocage.
                            </p>
                          </div>
                        )}

                        {/* Blocage compte */}
                        {isLocked && (
                          <div className="mb-6 space-y-3">
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                              <div className="flex items-start gap-3">
                                <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-red-300 text-sm font-medium">Compte temporairement bloqué</p>
                                  <p className="text-red-300/70 text-xs mt-1">
                                    {MAX_ATTEMPTS} tentatives échouées. Contactez l'administrateur.
                                  </p>
                                </div>
                              </div>
                            </div>
                            <a
                              href="mailto:admin@anacim.sn?subject=Déverrouillage compte SGDA&body=Bonjour, mon compte SGDA est bloqué après plusieurs tentatives de connexion. Merci de m'aider."
                              className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all text-sm"
                            >
                              <Phone className="w-4 h-4" />
                              Contacter l'administrateur
                            </a>
                            <button
                              type="button"
                              onClick={() => { setFailedAttempts(0); setError(''); }}
                              className="flex items-center justify-center gap-2 w-full py-2 text-white/30 hover:text-white/60 transition-colors text-xs"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Réessayer
                            </button>
                          </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-8">
                          
                          {/* Champ identifiant */}
                          <div className="space-y-2.5">
                            <label className="text-white/60 text-[11px] uppercase tracking-wider font-medium flex items-center gap-2">
                              <User size={12} />
                              Email ou code d'accès
                            </label>
                            <div className="relative group">
                              <input
                                type="text"
                                value={identifiant}
                                onChange={(e) => setIdentifiant(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-5 pl-12 text-white text-base placeholder-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:bg-white/10 transition-all outline-none"
                                placeholder="prenom.nom@anacim.sn"
                                required
                              />
                              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-focus-within:translate-x-full transition-transform duration-1000 pointer-events-none" />
                            </div>
                            <p className="text-white/25 text-[11px]">
                              Format: prenom.nom@anacim.sn ou code GOXX-XXXXXXX
                            </p>
                          </div>

                          {/* Champ mot de passe (conditionnel) */}
                          {detectLoginType(identifiant) === 'email' && (
                            <div className="space-y-2.5 animate-fade-up">
                              <label className="text-white/60 text-[11px] uppercase tracking-wider font-medium flex items-center gap-2">
                                <Lock size={12} />
                                Mot de passe
                              </label>
                              <div className="relative group">
                                <input
                                  type={showPassword ? 'text' : 'password'}
                                  value={motDePasse}
                                  onChange={(e) => setMotDePasse(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-5 pl-12 pr-12 text-white text-base placeholder-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:bg-white/10 transition-all outline-none"
                                  placeholder="••••••••"
                                  required
                                />
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword(!showPassword)}
                                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                                >
                                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-focus-within:translate-x-full transition-transform duration-1000 pointer-events-none" />
                              </div>
                            </div>
                          )}

                          {/* Bouton connexion avec animation avion */}
                          <button
                            type="submit"
                            disabled={isLoading}
                            className="relative w-full group pt-4"
                          >
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-300" />
                            <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl py-4 px-6 text-white font-semibold text-base overflow-hidden group-hover:scale-[1.02] transition-transform">
                              {isLoading ? (
                                <>
                                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  <span>Connexion en cours...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
                                  <span>Se connecter</span>
                                  <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform duration-300" />
                                  <Plane className="absolute -right-10 top-1/2 -translate-y-1/2 w-6 h-6 text-white/20 group-hover:right-6 transition-all duration-700 group-hover:animate-takeoff" />
                                </>
                              )}
                            </div>
                          </button>

                          {/* Message d'erreur avec animation */}
                          {error && (
                            <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 animate-shake">
                              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5 animate-pulse" />
                              <p className="text-red-300 text-sm">{error}</p>
                            </div>
                          )}
                        </form>

                        {/* Liens aide */}
                        <div className="mt-6 flex items-center justify-center gap-4">
                          <button
                            type="button"
                            onClick={() => { setView('forgot-password'); setError(''); }}
                            className="text-white/30 text-[10px] hover:text-white/60 transition-colors"
                          >
                            Mot de passe oublié ?
                          </button>
                          <span className="w-px h-3 bg-white/15" />
                          <button
                            type="button"
                            onClick={() => { setView('forgot-identifier'); setError(''); }}
                            className="text-white/30 text-[10px] hover:text-white/60 transition-colors"
                          >
                            Identifiant oublié ?
                          </button>
                        </div>
                      </div>
                    </>
                  ) : view === 'forgot-password' ? (
                    <>
                      {/* Vue : Mot de passe oublié */}
                      <div className="px-10 py-10">
                        {recoverySent ? (
                          <div className="text-center space-y-6 animate-fade-up">
                            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                            </div>
                            <p className="text-white/80 text-sm">
                              Lien de réinitialisation envoyé à<br />
                              <span className="text-white font-semibold">{recoveryEmail}</span>
                            </p>
                            <p className="text-white/40 text-xs">Vérifiez votre boîte de réception et vos spams.</p>
                            <button onClick={() => { goToLogin(); setRecoverySent(false); setRecoveryEmail(''); }} className="relative w-full group pt-4">
                              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-300" />
                              <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl py-4 px-6 text-white font-semibold text-base overflow-hidden">
                                <ArrowRight className="w-5 h-5 rotate-180" />
                                <span>Revenir à la connexion</span>
                              </div>
                            </button>
                          </div>
                        ) : (
                          <form onSubmit={handleRecovery} className="space-y-8">
                            <div className="space-y-2.5">
                              <label className="text-white/60 text-[11px] uppercase tracking-wider font-medium flex items-center gap-2">
                                <User size={12} />Adresse email ANACIM
                              </label>
                              <div className="relative group">
                                <input
                                  type="email"
                                  value={recoveryEmail}
                                  onChange={(e) => setRecoveryEmail(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl py-4 px-5 pl-12 text-white text-base placeholder-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:bg-white/10 transition-all outline-none"
                                  placeholder="prenom.nom@anacim.sn"
                                  required
                                />
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                              </div>
                            </div>
                            <button type="submit" disabled={recoveryLoading} className="relative w-full group pt-4">
                              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-300" />
                              <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl py-4 px-6 text-white font-semibold text-base overflow-hidden group-hover:scale-[1.02] transition-transform">
                                {recoveryLoading ? (
                                  <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Envoi...</span></>
                                ) : (
                                  <><Sparkles className="w-5 h-5" /><span>Envoyer le lien</span><ArrowRight className="w-5 h-5" /></>
                                )}
                              </div>
                            </button>
                            {recoveryError && (
                              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                <p className="text-red-300 text-sm">{recoveryError}</p>
                              </div>
                            )}
                          </form>
                        )}
                        <div className="mt-6 text-center">
                          <button onClick={goToLogin} className="text-white/30 text-[10px] hover:text-white/60 transition-colors">
                            ← Revenir à la connexion
                          </button>
                        </div>
                      </div>
                    </>
                  ) : view === 'forgot-identifier' ? (
                    <>
                      {/* Vue : Identifiant oublié */}
                      <div className="px-10 py-10 space-y-6">
                        {foundIdentifier ? (
                          <div className="space-y-5 animate-fade-up">
                            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                              <p className="text-white/60 text-xs mb-2">Votre identifiant ANACIM est :</p>
                              <p className="text-white font-mono text-sm font-bold break-all">{foundIdentifier}</p>
                            </div>
                            <p className="text-white/30 text-xs text-center">
                              Utilisez cet identifiant avec votre mot de passe pour vous connecter.
                            </p>
                            <button
                              type="button"
                              onClick={() => { setIdentifiant(foundIdentifier); goToLogin(); }}
                              className="relative w-full group"
                            >
                              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-300" />
                              <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl py-3 px-6 text-white font-semibold text-sm overflow-hidden">
                                <LogIn className="w-4 h-4" />
                                <span>Se connecter avec cet identifiant</span>
                              </div>
                            </button>
                            <button type="button" onClick={() => setFoundIdentifier('')} className="w-full text-white/30 text-[10px] hover:text-white/60 transition-colors">
                              Chercher un autre identifiant
                            </button>
                          </div>
                        ) : (
                          <form onSubmit={handleForgotIdentifier} className="space-y-6">
                            <p className="text-white/50 text-sm">
                              Saisissez votre prénom et nom pour retrouver votre identifiant ANACIM.
                            </p>
                            <div className="space-y-2.5">
                              <label className="text-white/60 text-[11px] uppercase tracking-wider font-medium">Prénom</label>
                              <div className="relative group">
                                <input
                                  type="text"
                                  value={forgotPrenom}
                                  onChange={(e) => setForgotPrenom(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-5 pl-12 text-white text-base placeholder-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:bg-white/10 transition-all outline-none"
                                  placeholder="Ex : Mouhamadou"
                                  required
                                />
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                              </div>
                            </div>
                            <div className="space-y-2.5">
                              <label className="text-white/60 text-[11px] uppercase tracking-wider font-medium">Nom</label>
                              <div className="relative group">
                                <input
                                  type="text"
                                  value={forgotNom}
                                  onChange={(e) => setForgotNom(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-5 pl-12 text-white text-base placeholder-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:bg-white/10 transition-all outline-none"
                                  placeholder="Ex : Ba"
                                  required
                                />
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                              </div>
                            </div>
                            <button type="submit" className="relative w-full group">
                              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-300" />
                              <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl py-3 px-6 text-white font-semibold text-sm overflow-hidden">
                                <HelpCircle className="w-4 h-4" />
                                <span>Retrouver mon identifiant</span>
                              </div>
                            </button>
                          </form>
                        )}
                        <div className="text-center">
                          <button onClick={goToLogin} className="text-white/30 text-[10px] hover:text-white/60 transition-colors">
                            ← Revenir à la connexion
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Vue : Changement de mot de passe obligatoire */}
                      <div className="px-10 py-10">
                        <div className="mb-6 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                          <p className="text-amber-300 text-xs">
                            Votre mot de passe provisoire doit être changé avant d'accéder au système.
                          </p>
                        </div>
                        <form onSubmit={handlePasswordChange} className="space-y-6">
                          <div className="space-y-2.5">
                            <label className="text-white/60 text-[11px] uppercase tracking-wider font-medium flex items-center gap-2">
                              <Key size={12} />Nouveau mot de passe
                            </label>
                            <div className="relative group">
                              <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-5 pl-12 pr-12 text-white text-base placeholder-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:bg-white/10 transition-all outline-none"
                                placeholder="Minimum 8 caractères"
                                required
                                minLength={8}
                              />
                              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                              <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors">
                                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                            {newPassword.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {[...Array(4)].map((_, i) => (
                                  <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                    newPassword.length >= (i + 1) * 3
                                      ? i < 1 ? 'bg-red-400' : i < 2 ? 'bg-amber-400' : i < 3 ? 'bg-blue-400' : 'bg-emerald-400'
                                      : 'bg-white/10'
                                  }`} />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2.5">
                            <label className="text-white/60 text-[11px] uppercase tracking-wider font-medium flex items-center gap-2">
                              <Key size={12} />Confirmer le mot de passe
                            </label>
                            <div className="relative group">
                              <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-5 pl-12 text-white text-base placeholder-white/20 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 focus:bg-white/10 transition-all outline-none"
                                placeholder="Répétez le mot de passe"
                                required
                              />
                              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 group-focus-within:text-blue-400 transition-colors" />
                              {confirmPassword.length > 0 && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                  {newPassword === confirmPassword
                                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                    : <XCircle className="w-4 h-4 text-red-400" />
                                  }
                                </div>
                              )}
                            </div>
                          </div>
                          {passwordError && (
                            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                              <p className="text-red-300 text-xs">{passwordError}</p>
                            </div>
                          )}
                          <button type="submit" disabled={passwordChanging} className="relative w-full group pt-2">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-300" />
                            <div className="relative flex items-center justify-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl py-4 px-6 text-white font-semibold text-base overflow-hidden group-hover:scale-[1.02] transition-transform">
                              {passwordChanging ? (
                                <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>Enregistrement...</span></>
                              ) : (
                                <><Key className="w-5 h-5" /><span>Définir mon mot de passe</span><ArrowRight className="w-5 h-5" /></>
                              )}
                            </div>
                          </button>
                        </form>
                      </div>
                    </>
                  )}

                  {/* Footer carte */}
                  <div className="px-10 pb-8 text-center border-t border-white/10 pt-6">
                    <p className="text-white/25 text-[10px] tracking-wide">
                      Code d'accès temporaire fourni par l'ANACIM
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer centré avec animation */}
        <div className="relative z-10 py-6 text-center animate-fade-up" style={{ animationDelay: '0.5s' }}>
          <div className="flex items-center justify-center gap-4 text-white/20 text-xs tracking-wide">
            <span>© ANACIM Sénégal</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Version 5.0</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Mai 2026</span>
          </div>
          <p className="text-white/15 text-[9px] mt-2 font-mono">
            Système de Gestion des Aérodromes — Tous droits réservés
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// CHARGEMENT DES MODULES (lazy loading)
// ============================================================

type PermissionsEntry = { all?: boolean; modules?: string[]; readOnly?: boolean; writeModules?: string[] }

type AnyModule = React.ComponentType<{ user: AuthUser }> & Record<string, unknown>

function resolveModule(mod: Record<string, unknown>, exportName: string): { default: AnyModule } {
  const named = mod[exportName] as AnyModule | undefined
  const defaultExport = mod.default as AnyModule | undefined
  return { default: (named || defaultExport) as AnyModule }
}

const MODULES = {
  dashboard: lazy(() => import('@/components/modules/dashboard/DashboardModule').then((m) => resolveModule(m, 'DashboardModule'))),
  aerodromes: lazy(() => import('@/components/modules/aerodromes/AerodromesModule').then((m) => resolveModule(m, 'AerodromesModule'))),
  certification: lazy(() => import('@/components/modules/certification/CertificationModule').then((m) => resolveModule(m, 'CertificationModule'))),
  homologation: lazy(() => import('@/components/modules/homologation/HomologationModule').then((m) => resolveModule(m, 'HomologationModule'))),
  planning: lazy(() => import('@/components/modules/planning/PlanningModule').then((m) => resolveModule(m, 'PlanningModule'))),
  surveillance: lazy(() => import('@/components/modules/surveillance/SurveillanceModule').then((m) => resolveModule(m, 'SurveillanceModule'))),
  'plans-actions': lazy(() => import('@/components/modules/plans-actions/PlansActionsModule').then((m) => resolveModule(m, 'PlansActionsModule'))),
  registres: lazy(() => import('@/components/modules/registres/RegistresModule').then((m) => resolveModule(m, 'RegistresModule'))),
  dossiers: lazy(() => import('@/components/modules/dossiers/DossiersModule').then((m) => resolveModule(m, 'DossiersModule'))),
  formation: lazy(() => import('@/components/modules/formation/FormationModule').then((m) => resolveModule(m, 'FormationModule'))),
  kit: lazy(() => import('@/components/modules/kit-inspecteur/KitInspecteurModule').then((m) => resolveModule(m, 'KitInspecteurModule'))),
  evenements: lazy(() => import('@/components/modules/evenements/EvenementsModule').then((m) => resolveModule(m, 'EvenementsModule'))),
  enquetes: lazy(() => import('@/components/modules/enquetes/EnquetesModule').then((m) => resolveModule(m, 'EnquetesModule'))),
  messagerie: lazy(() => import('@/components/modules/messagerie/MessagerieModule').then((m) => resolveModule(m, 'MessagerieModule'))),
  risque: lazy(() => import('@/components/modules/profil-risque/RisqueModule').then((m) => resolveModule(m, 'RisqueModule'))),
  signatures: lazy(() => import('@/components/modules/signatures/SignaturesModule').then((m) => resolveModule(m, 'SignaturesModule'))),
  charge: lazy(() => import('@/components/modules/charge-travail/ChargeTravailModule').then((m) => resolveModule(m, 'ChargeTravailModule'))),
  utilisateurs: lazy(() => import('@/components/modules/utilisateurs/UtilisateursModule').then((m) => resolveModule(m, 'UtilisateursModule'))),
  codes: lazy(() => import('@/components/modules/codes-acces/CodesAccesModule').then((m) => resolveModule(m, 'CodesAccesModule'))),
  audit: lazy(() => import('@/components/modules/audit/AuditModule').then((m) => resolveModule(m, 'AuditModule'))),
  'operator-dashboard': lazy(() => import('@/components/modules/portail-exploitant/OperatorDashboardModule').then((m) => resolveModule(m, 'OperatorDashboardModule'))),
  'dg-operator-dashboard': lazy(() => import('@/components/modules/portail-exploitant/DgOperatorDashboardModule').then((m) => resolveModule(m, 'DgOperatorDashboardModule'))),
  'operator-situation-securite': lazy(() => import('@/components/modules/portail-exploitant/SituationSecuriteModule').then((m) => resolveModule(m, 'SituationSecuriteModule'))),
  'operator-conformite-echeances': lazy(() => import('@/components/modules/portail-exploitant/ConformiteEcheancesModule').then((m) => resolveModule(m, 'ConformiteEcheancesModule'))),
  'operator-impact-decisions': lazy(() => import('@/components/modules/portail-exploitant/ImpactDecisionsModule').then((m) => resolveModule(m, 'ImpactDecisionsModule'))),
  'operator-ecarts': lazy(() => import('@/components/modules/portail-exploitant/OperatorEcartsModule').then((m) => resolveModule(m, 'OperatorEcartsModule'))),
  'operator-pac-consolide': lazy(() => import('@/components/modules/portail-exploitant/OperatorPACConsolideModule').then((m) => resolveModule(m, 'OperatorPACConsolideModule'))),
  'operator-planning': lazy(() => import('@/components/modules/portail-exploitant/OperatorPlanningModule').then((m) => resolveModule(m, 'OperatorPlanningModule'))),
  'operator-self-assessment': lazy(() => import('@/components/modules/portail-exploitant/OperatorSelfAssessment').then((m) => resolveModule(m, 'OperatorSelfAssessment'))),
  'operator-evenements': lazy(() => import('@/components/modules/portail-exploitant/OperatorEvenementsModule').then((m) => resolveModule(m, 'OperatorEvenementsModule'))),
  'operator-documentations': lazy(() => import('@/components/modules/portail-exploitant/OperatorKitModule').then((m) => resolveModule(m, 'OperatorKitModule'))),
  'operator-enquetes': lazy(() => import('@/components/modules/portail-exploitant/OperatorEnquetesModule').then((m) => resolveModule(m, 'OperatorEnquetesModule'))),
  'operator-messagerie': lazy(() => import('@/components/modules/portail-exploitant/OperatorMessagerie').then((m) => resolveModule(m, 'OperatorMessagerie'))),
  'operator-certification': lazy(() => import('@/components/modules/portail-exploitant/OperatorCertificationModule').then((m) => resolveModule(m, 'OperatorCertificationModule'))),
  'operator-homologation': lazy(() => import('@/components/modules/portail-exploitant/OperatorHomologationModule').then((m) => resolveModule(m, 'OperatorHomologationModule'))),
  'dg-dashboard': lazy(() => import('@/components/modules/dashboard/DgDashboardModule').then((m) => resolveModule(m, 'DgDashboardModule'))),
  'dg-pilotage-securite': lazy(() => import('@/components/modules/dashboard/PilotageSecuriteModule').then((m) => resolveModule(m, 'PilotageSecuriteModule'))),
  'dg-conformite-controle': lazy(() => import('@/components/modules/dashboard/ConformiteControleModule').then((m) => resolveModule(m, 'ConformiteControleModule'))),
  'dg-decisions-impact': lazy(() => import('@/components/modules/dashboard/DecisionsImpactModule').then((m) => resolveModule(m, 'DecisionsImpactModule'))),
  'guest-dashboard': lazy(() => import('@/components/modules/dashboard/GuestDashboardModule').then((m) => resolveModule(m, 'GuestDashboardModule'))),
  'admin-dashboard': lazy(() => import('@/components/modules/dashboard/AdminDashboardModule').then((m) => resolveModule(m, 'AdminDashboardModule'))),
  'ml-monitoring': lazy(() => import('@/components/modules/ml-monitoring/MLMonitoringModule').then((m) => resolveModule(m, 'MLMonitoringModule'))),
} as Record<string, React.LazyExoticComponent<React.ComponentType<{ user: AuthUser }>>>

export default function Page() {
  const user = useAppStore(s => s.user)
  const setUser = useAppStore(s => s.setUser)
  const activeModule = useAppStore(s => s.activeModule)
  const [showWelcome, setShowWelcome] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [hydrationDone, setHydrationDone] = useState(false)
  const hasSyncedRef = useRef(false)

  // Attendre la fin de la réhydratation Zustand avant de charger Supabase.
  // IMPORTANT : si un utilisateur est déjà présent dans Zustand (persist),
  // on passe syncing=true dans le MÊME batch que hydrationDone=true pour éviter
  // qu'AppShell ne s'affiche un instant avec des données IndexedDB périmées,
  // ce qui provoquerait un « Rendered fewer hooks than expected » dans les modules.
  useEffect(() => {
    const afterHydration = () => {
      // Initialiser le subscriber de notifications (détection automatique
      // des changements de profil risque, certifications, homologations)
      import('@/lib/services/notificationSubscriber').then(m => m.initNotificationSubscriber())

      // Initialiser l'auto-création de surveillance pour les profils critiques
      import('@/lib/services/surveillanceAutoCreator').then(m => m.initSurveillanceAutoCreator())

      const zustandUser = useAppStore.getState().user
      if (zustandUser) {
        // Déclencher le syncing AVANT de révéler hydrationDone
        // React 18 batch ces deux setState → un seul rendu avec syncing=true
        setSyncing(true)
      }
      setHydrationDone(true)
    }
    if (useAppStore.persist.hasHydrated()) {
      afterHydration()
      return
    }
    const unsub = useAppStore.persist.onFinishHydration(afterHydration)
    return unsub
  }, [])

  const handleSyncData = useCallback(async (u: AuthUser) => {
    setSyncing(true)
    try {
      const { data, error } = await loadInitialData(u.id, u.role)
      if (error) {
        // Silencieux en production
      } else if (data) {
        const aeroCount = data.aerodromes?.length ?? 0
        const survCount = data.surveillances?.length ?? 0
        const ecartCount = data.ecarts?.length ?? 0
        const formCount = data.formations?.length ?? 0
        // Fusionner les inspecteurs existants (localStorage) avec ceux de Supabase
        const existingInspecteurs = useAppStore.getState().inspecteurs || []
        const supabaseInspecteurs = data.inspecteurs || []
        const existingIds = new Set(existingInspecteurs.map(i => i.id))
        const mergedInspecteurs = [
          ...existingInspecteurs,
          ...supabaseInspecteurs.filter(i => !existingIds.has(i.id))
        ]
        
         const existingMessages = useAppStore.getState().messages || []
         // Fusionner les dossiers locaux (Zustand persist) avec ceux de Supabase
         const existingDossiers = useAppStore.getState().dossiers || []
         const existingDossierIds = new Set(existingDossiers.map(d => d.id))
         const mergedDossiers = [
           ...existingDossiers,
           ...(data.dossiers || []).filter(d => !existingDossierIds.has(d.id))
         ]
         useAppStore.setState({
            aerodromes: data.aerodromes || [],
            surveillances: data.surveillances || [],
            ecarts: data.ecarts || [],
            dossiers: mergedDossiers,
            utilisateurs: data.utilisateurs || [],
           plannings: data.plannings || [],
           certifications: data.certifications || [],
           homologations: data.homologations || [],
           profilsRisque: data.profilsRisque ? Object.fromEntries(data.profilsRisque.map(p => [p.aerodrome_id, p])) : {},
           notifications: data.notifications || [],
           codesAcces: data.codesAcces || [],
           formations: data.formations || [],
           inspecteurs: mergedInspecteurs,
           competences: data.competences || [],
           kitDocuments: data.kitDocuments || [],
           messages: data.messages && data.messages.length > 0 ? data.messages : existingMessages,
           apiKeys: data.apiKeys || [],
         })
         if (aeroCount === 0) {
           // Aucun aérodrome — silencieux en production
         }
       }
     } catch (err) {
       // Erreur silencieuse en production
    } finally {
      setSyncing(false)
    }
  }, [])

  // Souscription temps réel — met à jour le store Zustand quand un écart change dans Supabase.
  // Indispensable pour que l'inspecteur voie les PAC soumis sans rafraîchir le navigateur.
  useEffect(() => {
    if (!user) return
    const channel = subscribeToEcarts((payload: any) => {
      const { eventType, new: newEcart, old: oldEcart } = payload
      if (eventType === 'UPDATE' && newEcart) {
        useAppStore.setState(state => ({
          ecarts: state.ecarts.map(e => e.id === newEcart.id ? { ...e, ...newEcart } : e)
        }))
      } else if (eventType === 'INSERT' && newEcart) {
        useAppStore.setState(state => ({
          ecarts: [newEcart, ...state.ecarts]
        }))
      } else if (eventType === 'DELETE' && oldEcart) {
        useAppStore.setState(state => ({
          ecarts: state.ecarts.filter(e => e.id !== oldEcart.id)
        }))
      }
    })
    return () => { channel.unsubscribe() }
  }, [user])

  useEffect(() => {
    if (!hydrationDone || hasSyncedRef.current) return
    hasSyncedRef.current = true

    if (user) {
      // Utilisateur déjà présent dans Zustand persist → sync Supabase quand même
      // pour garantir des données fraîches et cohérentes (évite "fewer hooks")
      handleSyncData(user)
    } else {
      // Pas d'utilisateur Zustand → vérifier localStorage
      const stored = typeof window !== 'undefined' ? localStorage.getItem('sgda_user') : null
      if (stored) {
        try {
          const u = JSON.parse(stored) as AuthUser
          setUser(u)
          handleSyncData(u)
        } catch {
          localStorage.removeItem('sgda_user')
        }
      }
    }
  }, [user, hydrationDone, setUser, handleSyncData])

  // Pendant l'hydratation Zustand (< 200 ms) on masque le flash LoginForm
  if (!hydrationDone) {
    return <TakeoffSplash />
  }

  if (!user) {
    return <LoginForm onLoginSuccess={(u) => {
      setUser(u)
      if (typeof window !== 'undefined') localStorage.setItem('sgda_user', JSON.stringify(u))
      setShowWelcome(true)
      handleSyncData(u)
    }} />
  }

  // Synchronisation Supabase en cours → animation de décollage
  if (syncing) {
    return <TakeoffSplash />
  }

  const handleLogout = () => {
    if (typeof window !== 'undefined') localStorage.removeItem('sgda_user')
    setUser(null)
  }

  return (
    <>
      {showWelcome && <WelcomeToast user={user} onClose={() => setShowWelcome(false)} />}
      <AppShell user={user} onLogout={handleLogout}>
        <ActiveModuleRenderer moduleKey={activeModule} user={user} />
      </AppShell>
    </>
  )
}

function WelcomeToast({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  const messages: Record<string, string> = {
    admin: `Accès administrateur — Tous modules disponibles.`,
    inspector: `Inspecteur — Bon retour.`,
    dg_anacim: `Vue stratégique nationale disponible.`,
    dg_operator: `Portail Direction — Bienvenue.`,
    focal_operator: `Portail Exploitant — Bienvenue.`,
    staff_operator: `Mode consultation — Bienvenue.`,
    guest: `Mode consultation publique.`,
  }

  return (
    <div className="fixed top-20 right-6 z-[9999] animate-slide-right">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-3 min-w-[300px] border border-white/20 backdrop-blur-sm">
        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
          <Plane className="w-5 h-5" />
        </div>
        <div>
          <p className="font-semibold text-sm">Bienvenue, {user.prenom} {user.nom}</p>
          <p className="text-xs text-white">{messages[user.role] || 'Connecté avec succès'}</p>
        </div>
      </div>
    </div>
  )
}

const DASHBOARD_BY_ROLE: Record<string, string> = {
  admin: 'admin-dashboard',
  inspector: 'dashboard',
  dg_anacim: 'dg-dashboard',
  dg_operator: 'dg-operator-dashboard',
  focal_operator: 'operator-dashboard',
  staff_operator: 'operator-dashboard',
  guest: 'guest-dashboard',
}

function ActiveModuleRenderer({ moduleKey, user }: { moduleKey: string; user: AuthUser }) {
  const resolvedKey = moduleKey === 'dashboard' ? (DASHBOARD_BY_ROLE[user.role] ?? 'dashboard') : moduleKey

  const perms = PERMISSIONS[user.role] as PermissionsEntry
  const hasAccess = perms.all === true || moduleKey === 'dashboard' ||
    (perms.modules && perms.modules.includes(resolvedKey)) ||
    (perms.modules && perms.modules.includes(moduleKey))

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 max-w-md">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Accès refusé</h2>
          <p className="text-muted">Vous n'avez pas la permission d'accéder à ce module.</p>
          <Button className="mt-6 btn-primary" onClick={() => window.location.href = '/'}>
            Retour à l'accueil
          </Button>
        </div>
      </div>
    )
  }

  const ModuleComponent = MODULES[resolvedKey]
  if (!ModuleComponent) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center p-8 max-w-md">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-yellow-500/10 flex items-center justify-center">
            <AlertCircle className="w-12 h-12 text-yellow-500" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Module introuvable</h2>
          <p className="text-muted">Le module « {resolvedKey} » n'existe pas.</p>
          <Button className="mt-6 btn-primary" onClick={() => window.location.href = '/'}>
            Retour à l'accueil
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-role-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted">Chargement du module...</p>
        </div>
      </div>
    }>
      <ModuleComponent key={resolvedKey} user={user} />
    </Suspense>
  )
}