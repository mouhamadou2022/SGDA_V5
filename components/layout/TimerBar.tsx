// components/layout/TimerBar.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clock, Calendar, Plane, Timer, Radar, Wifi } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { SyncStatus } from './SyncStatus';

export function TimerBar() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sessionStart] = useState(new Date());
  const [elapsed, setElapsed] = useState('00:00:00');
  const [isHovered, setIsHovered] = useState(false);
  const [showPlane, setShowPlane] = useState(false);
  const user = useAppStore(s => s.user);
  const planeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      
      const diff = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
      const hours = Math.floor(diff / 3600).toString().padStart(2, '0');
      const minutes = Math.floor((diff % 3600) / 60).toString().padStart(2, '0');
      const seconds = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${hours}:${minutes}:${seconds}`);
    }, 1000);

    planeIntervalRef.current = setInterval(() => {
      setShowPlane(true);
      setTimeout(() => setShowPlane(false), 2000);
    }, 30000);

    return () => {
      clearInterval(timer);
      if (planeIntervalRef.current) clearInterval(planeIntervalRef.current);
    };
    }, []);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const nextPlaneAnimation = () => {
    const now = new Date();
    const seconds = now.getSeconds();
    const nextAnimation = 30 - (seconds % 30);
    return nextAnimation;
  };

  return (
    <div 
      className="timer-bar group relative overflow-hidden" 
      data-role={user?.role}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Effet radar en arrière-plan */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-32 h-32 rounded-full border-2 border-white/30 animate-ping" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-0 right-1/4 w-24 h-24 rounded-full border-2 border-white/30 animate-ping delay-1000" style={{ animationDuration: '5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full border border-white/20 animate-radar" />
      </div>

      {/* Avion qui traverse périodiquement */}
      {showPlane && (
        <div className="absolute top-1/2 -translate-y-1/2 animate-takeoff z-20">
          <div className="flex items-center gap-1 bg-white/20 backdrop-blur rounded-full px-2 py-0.5">
            <Plane className="w-3 h-3 text-white fill-white/20" />
            <span className="text-[8px] text-white/80 font-mono">SGDA</span>
          </div>
        </div>
      )}

      {/* Avion qui décolle au survol */}
      {isHovered && (
        <div className="absolute -right-4 top-1/2 -translate-y-1/2 animate-takeoff z-20" style={{ animationDuration: '0.8s' }}>
          <Plane className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Effet de piste d'atterrissage */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/50 to-transparent opacity-30 animate-pulse" />

      {/* Contenu principal - TOUT EN BLANC POUR CONTRASTE */}
      <div className="relative z-10 flex items-center justify-between w-full text-white">
        {/* Date */}
        <div className="date group/date">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Calendar className="h-3.5 w-3.5 text-white/80 transition-transform group-hover/date:scale-110" />
              {isHovered && (
                <div className="absolute -top-6 -left-2 whitespace-nowrap bg-white/20 backdrop-blur text-white text-[9px] px-1.5 py-0.5 rounded-full animate-fade-up">
                  {formatDate(currentTime).split(' ')[0]}
                </div>
              )}
            </div>
            <span className="hidden sm:inline text-white font-bold text-xs">{formatDate(currentTime)}</span>
            <span className="sm:hidden text-white font-bold text-[10px]">{formatDate(currentTime).split(' ').slice(0, 2).join(' ')}</span>
          </div>
        </div>

        {/* Section droite */}
        <div className="flex items-center gap-3 md:gap-5">
          {/* Heure */}
          <div className="time group/time relative">
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Clock className="h-3.5 w-3.5 text-white/80 transition-transform group-hover/time:rotate-12" />
                <div className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <span className="font-mono text-sm tracking-wider text-white font-bold">{formatTime(currentTime)}</span>
            </div>
          </div>

          {/* Séparateur */}
          <div className="w-px h-5 bg-white/30 group-hover:bg-white/50 transition-colors" />

          {/* Durée session */}
          <div className="session-timer group/session relative">
            <div className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5 text-white/80 transition-transform group-hover/session:rotate-6" />
              <span className="hidden xs:inline text-white/60 text-[10px] uppercase tracking-wider">Session</span>
              <span className="font-mono text-sm font-bold tracking-wider text-white">
                {elapsed}
              </span>
            </div>
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white/20 backdrop-blur text-white text-[9px] px-2 py-0.5 rounded-full opacity-0 group-hover/session:opacity-100 transition-opacity pointer-events-none">
              Temps de connexion
            </div>
          </div>

          {/* Séparateur */}
          <div className="w-px h-5 bg-white/30 hidden md:block" />

          {/* Indicateur synchronisation */}
          <div className="hidden md:block">
            <SyncStatus compact />
          </div>

          {/* Indicateur sécurisé */}
          <div className="hidden lg:flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[8px] text-white/60 font-mono uppercase tracking-wider">Secure</span>
          </div>
        </div>
      </div>

      {/* Message "Prochain décollage" au survol */}
      {isHovered && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-white/20 backdrop-blur text-white text-[9px] px-2 py-0.5 rounded-full animate-fade-up z-20">
          Prochain décollage dans {nextPlaneAnimation()}s
        </div>
      )}
    </div>
  )
}