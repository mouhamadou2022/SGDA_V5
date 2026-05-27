// components/modules/aerodromes/AerodromeMap.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { Aerodrome } from '@/lib/store';
import { useAppStore } from '@/lib/store';
;

// ✅ Correction des icônes Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// R1-EXCEPTION : L.divIcon attend une chaîne HTML brute — style= inévitable ici
const createCustomIcon = (type: string, typeEntite: string | undefined, score: number) => {
  const safeScore = isNaN(score) ? 0 : score;

  // Couleur de fond selon type international/national
  const color = type === 'international' ? '#1e40af' : '#0f766e';
  const scoreColor =
    safeScore >= 80 ? '#22c55e' :
    safeScore >= 60 ? '#3b82f6' :
    safeScore >= 30 ? '#f97316' : '#ef4444';

  // Icône SVG selon la nature : avion ou hélicoptère
  const iconSvg = typeEntite === 'helistation'
    ? `<text x="20" y="26" text-anchor="middle" font-size="18" fill="white">🚁</text>`
    : typeEntite === 'mixte'
    ? `<text x="20" y="26" text-anchor="middle" font-size="13" fill="white">✈🚁</text>`
    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="position:absolute;top:10px;left:10px">
        <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8l-8.2-1.8L2 9l7 3 2 2-5 3 1 2 4-2 3 3 3-4 2 4 1-2-1.2-3.8z"/>
       </svg>`;

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 40px; height: 40px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        border: 3px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        position: relative;
      ">
        <svg width="40" height="40" viewBox="0 0 40 40">
          ${iconSvg}
        </svg>
        <div style="
          position: absolute; top: -5px; right: -5px;
          background-color: ${scoreColor}; color: white;
          border-radius: 12px; padding: 2px 6px;
          font-size: 10px; font-weight: bold; border: 2px solid white;
        ">${safeScore}%</div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
};

interface AerodromeMapProps {
  aerodromes: Aerodrome[];
}

const DEFAULT_CENTER: [number, number] = [14.5, -14.5];

export default function AerodromeMap({ aerodromes }: AerodromeMapProps) {
  const [isClient, setIsClient] = useState(false);
  const profilsRisque = useAppStore((state) => state.profilsRisque);
  
  const getRiskScore = (a: Aerodrome) =>
    profilsRisque[a.id]?.score_global ?? 0;
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  const validAerodromes = aerodromes.filter(a => 
    a && 
    typeof a.lat === 'number' && 
    typeof a.lon === 'number' && 
    !isNaN(a.lat) && 
    !isNaN(a.lon) && 
    a.lat >= -90 && 
    a.lat <= 90 && 
    a.lon >= -180 && 
    a.lon <= 180
  );

  const getMapCenter = (): [number, number] => {
    if (validAerodromes.length === 0) return DEFAULT_CENTER;
    const sumLat = validAerodromes.reduce((sum, a) => sum + a.lat, 0);
    const sumLng = validAerodromes.reduce((sum, a) => sum + a.lon, 0);
    return [sumLat / validAerodromes.length, sumLng / validAerodromes.length];
  };

  if (!isClient) {
    return (
      <div className="h-[600px] bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-500">Chargement de la carte...</p>
        </div>
      </div>
    );
  }

  const center = getMapCenter();

  return (
    <div className="h-[600px] rounded-lg border overflow-hidden">
      <MapContainer
        key={`map-${validAerodromes.length}`}
        center={center}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {validAerodromes.map((aerodrome) => {
          if (!aerodrome || isNaN(aerodrome.lat) || isNaN(aerodrome.lon)) return null;

          const score = getRiskScore(aerodrome);
          const icon = createCustomIcon(aerodrome.type, aerodrome.type_entite, score);

          // Ligne technique dans le popup : piste pour aérodrome/mixte, FATO pour hélistation
          const isHeli = aerodrome.type_entite === 'helistation';
          const isMixte = aerodrome.type_entite === 'mixte';
          const heliData = (aerodrome as any).helistation;

          return (
            <Marker
              key={aerodrome.id}
              position={[aerodrome.lat, aerodrome.lon]}
              icon={icon}
            >
              <Popup>
                <div className="p-2 min-w-[220px]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-lg">{aerodrome.code_oaci}</h3>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`badge ${aerodrome.type === 'international' ? 'primary' : 'teal'}`}>
                        {aerodrome.type === 'international' ? 'International' : 'National'}
                      </span>
                      {aerodrome.type_entite === 'helistation' && <span className="badge warning text-[9px]">🚁 Hélistation</span>}
                      {aerodrome.type_entite === 'mixte'       && <span className="badge purple  text-[9px]">✈🚁 Mixte</span>}
                    </div>
                  </div>
                  <p className="font-medium text-body mb-2">{aerodrome.nom}</p>

                  <div className="space-y-1 text-small">
                    <div className="flex items-center gap-2">
                      <span className="text-muted">Région:</span>
                      <span>{aerodrome.region}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted">Statut:</span>
                      <span className={`badge ${
                        aerodrome.statut === 'actif'     ? 'success' :
                        aerodrome.statut === 'brouillon' ? 'neutral' :
                        aerodrome.statut === 'suspendu'  ? 'warning' : 'danger'
                      }`}>
                        {aerodrome.statut === 'actif' ? 'En service' : aerodrome.statut}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted">Score risque:</span>
                      <span className={`risk-badge ${score >= 80 ? 'faible' : score >= 60 ? 'moyen' : score >= 30 ? 'eleve' : 'critique'} text-xs py-0 px-2`}>
                        {score}%
                      </span>
                    </div>

                    {/* Ligne technique conditionnelle */}
                    {!isHeli && aerodrome.piste_principale?.longueur && aerodrome.piste_principale.longueur > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted">Piste:</span>
                        <span>{aerodrome.piste_principale!.longueur}m × {aerodrome.piste_principale!.largeur}m</span>
                      </div>
                    )}
                    {!isHeli && aerodrome.piste_principale?.code_reference && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted">Code réf:</span>
                        <span className="font-mono">{aerodrome.piste_principale!.code_reference}</span>
                      </div>
                    )}
                    {(isHeli || isMixte) && heliData?.valeur_d && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted">Valeur D (FATO):</span>
                        <span className="font-mono">{heliData.valeur_d} m</span>
                      </div>
                    )}
                    {(isHeli || isMixte) && heliData?.cap !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted">Cap:</span>
                        <span className="font-mono">{heliData.cap}°</span>
                      </div>
                    )}
                    {(isHeli || isMixte) && heliData?.mtom && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted">MTOM:</span>
                        <span className="font-mono">{heliData.mtom} t</span>
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {validAerodromes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="text-center p-6">
              <MapPin className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-muted">Aucun aérodrome avec des coordonnées valides</p>
            </div>
          </div>
        )}
      </MapContainer>
    </div>
  );
}