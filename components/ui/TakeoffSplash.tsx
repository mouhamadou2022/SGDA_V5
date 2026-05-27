// components/ui/TakeoffSplash.tsx
// Splash screen de décollage — affiché pendant l'hydratation / sync Supabase
'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const MESSAGES = [
  'Initialisation du système SGDA…',
  'Chargement des aérodromes du Sénégal…',
  'Synchronisation des données ANACIM…',
  'Chargement des plannings et surveillances…',
  'Vérification des autorisations…',
  'Préparation de votre espace de travail…',
]

// ─── SVG avion — vue de côté, orienté vers la droite ────────────────────────
function PlaneSVG() {
  return (
    <svg width="96" height="48" viewBox="0 0 96 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Fuselage */}
      <path
        d="M12 24 Q24 21 58 21 Q76 21 87 24 Q76 27 58 27 Q24 27 12 24Z"
        fill="#e2e8f0"
      />
      {/* Nez */}
      <path d="M87 24 Q97 24 95 22 Q90 20 85 22 Z" fill="#cbd5e1" />
      <path d="M87 24 Q97 24 95 26 Q90 28 85 26 Z" fill="#cbd5e1" />
      {/* Pare-brise cockpit */}
      <path d="M78 21 Q84 19 88 21 L86 23 Q81 22 78 23 Z" fill="#7dd3fc" opacity="0.85" />
      {/* Aile principale haute */}
      <path d="M44 22 L22 5 L34 21 Z" fill="#94a3b8" />
      {/* Aile principale basse */}
      <path d="M44 26 L22 43 L34 27 Z" fill="#94a3b8" />
      {/* Empennage horizontal haut */}
      <path d="M17 23 L7 15 L17 22 Z" fill="#64748b" />
      {/* Empennage horizontal bas */}
      <path d="M17 25 L7 33 L17 26 Z" fill="#64748b" />
      {/* Dérive verticale */}
      <path d="M14 23 L10 11 L20 22 Z" fill="#64748b" />
      {/* Nacelle moteur */}
      <ellipse cx="32" cy="27" rx="9" ry="3.5" fill="#475569" />
      {/* Entrée d'air */}
      <ellipse cx="23" cy="27" rx="3" ry="2.5" fill="#1e293b" />
      {/* Flamme moteur */}
      <ellipse cx="24" cy="27" rx="2" ry="1.5" fill="#fb923c" opacity="0.9" />
      {/* Traînée chaleur */}
      <path d="M22 27 Q16 25 10 27 Q16 29 22 27Z" fill="#fde68a" opacity="0.35" />
      {/* Train d'atterrissage principal */}
      <line x1="46" y1="27" x2="46" y2="35" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="46" cy="37" rx="3.5" ry="2.5" fill="#334155" />
      {/* Train avant */}
      <line x1="32" y1="30" x2="32" y2="37" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="32" cy="38.5" rx="2.5" ry="2" fill="#334155" />
      {/* Hublots */}
      <circle cx="62" cy="24" r="2" fill="#7dd3fc" opacity="0.5" />
      <circle cx="70" cy="24" r="2" fill="#7dd3fc" opacity="0.5" />
    </svg>
  )
}

// ─── Composant principal ─────────────────────────────────────────────────────
export function TakeoffSplash() {
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setMsgIdx(i => (i + 1) % MESSAGES.length), 1300)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden select-none"
      style={{ background: 'linear-gradient(160deg, #06091f 0%, #0f172a 55%, #1a2744 100%)' }}
    >
      {/* ── Keyframes (inline pour éviter les imports CSS globaux) ─────────── */}
      <style>{`
        @keyframes sgda-plane-takeoff {
          0%   { transform: translateX(-120px) translateY(0px)   rotate(0deg)   scale(1);   opacity: 1; }
          42%  { transform: translateX(38vw)   translateY(0px)   rotate(0deg)   scale(1);   opacity: 1; }
          58%  { transform: translateX(55vw)   translateY(-8vh)  rotate(-14deg) scale(1);   opacity: 1; }
          78%  { transform: translateX(78vw)   translateY(-32vh) rotate(-20deg) scale(0.72); opacity: 0.7; }
          95%  { transform: translateX(105vw)  translateY(-60vh) rotate(-24deg) scale(0.4); opacity: 0; }
          96%  { transform: translateX(-120px) translateY(0px)   rotate(0deg)   scale(1);   opacity: 0; }
          100% { transform: translateX(-120px) translateY(0px)   rotate(0deg)   scale(1);   opacity: 1; }
        }
        @keyframes sgda-contrail {
          0%   { width: 0;    opacity: 0;   }
          42%  { width: 38vw; opacity: 0.5; }
          60%  { width: 56vw; opacity: 0.35;}
          80%  { width: 79vw; opacity: 0.15;}
          95%  { width: 105vw;opacity: 0;   }
          96%  { width: 0;    opacity: 0;   }
          100% { width: 0;    opacity: 0;   }
        }
        @keyframes sgda-edge-light {
          0%, 100% { opacity: 0.25; }
          50%      { opacity: 1; }
        }
        @keyframes sgda-fadeup {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sgda-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes sgda-progress-bar {
          from { width: 3%;  }
          to   { width: 88%; }
        }
        @keyframes sgda-beacon-pulse {
          0%, 100% { opacity: 0.06; transform: translate(-50%, -50%) scale(1); }
          50%      { opacity: 0.18; transform: translate(-50%, -50%) scale(1.3); }
        }
        @keyframes sgda-radar-ring {
          0%   { transform: translate(-50%,-50%) scale(0.3); opacity: 0.4; }
          100% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; }
        }
      `}</style>

      {/* ── Fond — grille radar ──────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(56,189,248,0.05) 1px, transparent 1px)',
          backgroundSize: '52px 52px',
        }}
      />

      {/* ── Anneau radar animé ───────────────────────────────────────────── */}
      {[0, 1.4, 2.8].map((delay, i) => (
        <div
          key={i}
          className="absolute rounded-full border"
          style={{
            top: '38%', left: '50%',
            width: '480px', height: '480px',
            borderColor: 'rgba(56,189,248,0.12)',
            animation: `sgda-radar-ring 4.2s ease-out infinite`,
            animationDelay: `${delay}s`,
          }}
        />
      ))}

      {/* ── Halo beacon ─────────────────────────────────────────────────── */}
      <div
        className="absolute rounded-full"
        style={{
          top: '38%', left: '50%',
          width: '520px', height: '520px',
          background: 'radial-gradient(circle, rgba(56,189,248,0.1) 0%, transparent 70%)',
          animation: 'sgda-beacon-pulse 3s ease-in-out infinite',
        }}
      />

      {/* ── Logo + titre ANACIM ──────────────────────────────────────────── */}
      <div
        className="relative z-10 flex flex-col items-center mb-20"
        style={{ animation: 'sgda-fadeup 0.7s ease-out forwards' }}
      >
        <div className="mb-5 rounded-2xl overflow-hidden shadow-2xl"
             style={{ filter: 'drop-shadow(0 0 24px rgba(56,189,248,0.45))' }}>
          <Image
            src="/logo-anacim.png"
            alt="ANACIM"
            width={88}
            height={88}
            priority
            className="object-contain"
          />
        </div>
        <h1 className="text-white text-4xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
          SGDA
        </h1>
        <p className="text-white/45 text-[11px] tracking-[0.25em] uppercase mt-1 font-medium">
          Système de Gestion des Aérodromes
        </p>
        <p className="text-white/20 text-[9px] font-mono mt-0.5 tracking-widest">
          ANACIM — République du Sénégal
        </p>
      </div>

      {/* ── Scène piste + avion ──────────────────────────────────────────── */}
      <div className="relative w-full" style={{ height: '110px' }}>

        {/* Surface de la piste */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: '56px',
            background: 'linear-gradient(to bottom, #1e293b 0%, #0f172a 100%)',
            borderTop: '2px solid rgba(255,255,255,0.08)',
          }}
        />

        {/* Barres de seuil de piste (touches de piano) */}
        <div className="absolute bottom-10 left-[6%] flex gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{ width: '28px', height: '10px', borderRadius: '3px', background: 'rgba(255,255,255,0.65)' }}
            />
          ))}
        </div>

        {/* Axe central de piste (tirets) */}
        <div
          className="absolute left-0 right-0 flex gap-8 px-[18%]"
          style={{ bottom: '22px', overflow: 'hidden' }}
        >
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              style={{
                flexShrink: 0,
                width: '36px',
                height: '4px',
                borderRadius: '2px',
                background: 'rgba(255,255,255,0.22)',
              }}
            />
          ))}
        </div>

        {/* Feux de bord de piste */}
        <div className="absolute left-0 right-0 flex justify-between px-6" style={{ bottom: '4px' }}>
          {Array.from({ length: 22 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: '6px', height: '6px',
                borderRadius: '50%',
                background: i < 3 || i > 18 ? '#fbbf24' : '#ffffff',
                animation: `sgda-edge-light ${1.6 + (i % 4) * 0.25}s ease-in-out infinite`,
                animationDelay: `${i * 0.09}s`,
              }}
            />
          ))}
        </div>

        {/* Numéro de piste */}
        <div
          className="absolute font-bold font-mono text-white/25"
          style={{ bottom: '30px', left: '2.5%', fontSize: '22px', letterSpacing: '-0.02em' }}
        >
          23
        </div>

        {/* Traînée de condensation */}
        <div
          style={{
            position: 'absolute',
            bottom: '72px',
            left: 0,
            height: '2px',
            background: 'linear-gradient(to right, transparent, rgba(147,197,253,0.5), rgba(147,197,253,0.1), transparent)',
            borderRadius: '999px',
            animation: 'sgda-contrail 5s cubic-bezier(0.4,0,0.6,1) infinite',
          }}
        />

        {/* ── L'avion ─────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'absolute',
            bottom: '50px',
            left: 0,
            animation: 'sgda-plane-takeoff 5s cubic-bezier(0.3,0,0.7,1) infinite',
            transformOrigin: 'center center',
          }}
        >
          <PlaneSVG />
        </div>
      </div>

      {/* ── Messages + barre de progression ─────────────────────────────── */}
      <div
        className="relative z-10 mt-10 flex flex-col items-center gap-4"
        style={{ animation: 'sgda-fadein 0.9s ease-out 0.4s both' }}
      >
        {/* Message rotatif */}
        <p
          key={msgIdx}
          className="text-white/40 text-[11px] font-mono tracking-wide"
          style={{ animation: 'sgda-fadeup 0.35s ease-out forwards', minHeight: '18px' }}
        >
          {MESSAGES[msgIdx]}
        </p>

        {/* Barre de chargement */}
        <div
          className="rounded-full overflow-hidden"
          style={{ width: '240px', height: '2px', background: 'rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(to right, #3b82f6, #818cf8, #6366f1)',
              animation: 'sgda-progress-bar 6s ease-out infinite',
            }}
          />
        </div>

        {/* Indicateur "Live" */}
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: '#34d399',
              animation: 'sgda-edge-light 1.4s ease-in-out infinite',
            }}
          />
          <span className="text-white/20 text-[9px] font-mono tracking-widest uppercase">
            Connexion sécurisée — ANACIM
          </span>
        </div>
      </div>

      {/* ── Pied de page ─────────────────────────────────────────────────── */}
      <div
        className="absolute bottom-5 text-center"
        style={{ animation: 'sgda-fadein 1s ease-out 0.8s both' }}
      >
        <p className="text-white/12 text-[8px] font-mono tracking-widest uppercase">
          © ANACIM Sénégal — Aviation Civile &amp; Météorologie — Version 5.0
        </p>
      </div>
    </div>
  )
}
