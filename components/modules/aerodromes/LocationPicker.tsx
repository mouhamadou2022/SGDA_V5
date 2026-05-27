// components/modules/aerodromes/LocationPicker.tsx
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin, Search, Navigation } from 'lucide-react';

// Correction des icônes Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function toDMS(lat: number, lon: number): string {
  const f = (v: number, isLat: boolean) => {
    const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = (((a - d) * 60 - m) * 60).toFixed(1);
    return `${d}°${m}'${s}"${isLat ? (v >= 0 ? 'N' : 'S') : (v >= 0 ? 'E' : 'W')}`;
  };
  return `${f(lat, true)} ${f(lon, false)}`;
}

// Icône personnalisée pour le marqueur
const customIcon = new L.Icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Composant pour gérer les clics sur la carte
function LocationMarker({ 
  position, 
  onPositionChange 
}: { 
  position: [number, number]; 
  onPositionChange: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return <Marker position={position} icon={customIcon} />;
}

interface LocationPickerProps {
  latitude: number;
  longitude: number;
  onPositionChange: (lat: number, lng: number) => void;
}

export default function LocationPicker({ 
  latitude, 
  longitude, 
  onPositionChange 
}: LocationPickerProps) {
  const mapRef = useRef<L.Map>(null);
  const [searchAddress, setSearchAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (mapRef.current && latitude && longitude) {
      mapRef.current.flyTo([latitude, longitude], mapRef.current.getZoom());
    }
  }, [latitude, longitude]);

  // Recherche par nom d'adresse
  const searchByName = async () => {
    if (!searchAddress.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchAddress)}&limit=1`
      );
      const data = await response.json();
      
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        onPositionChange(lat, lon);
        if (mapRef.current) {
          mapRef.current.flyTo([lat, lon], 12);
        }
      } else {
        console.warn('Aucun résultat trouvé');
      }
    } catch (err) {
      console.error('Erreur de recherche:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Géolocalisation de l'utilisateur
  const getUserLocation = () => {
    if (!navigator.geolocation) {
      console.warn('Géolocalisation non supportée');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        onPositionChange(latitude, longitude);
        if (mapRef.current) {
          mapRef.current.flyTo([latitude, longitude], 13);
        }
        setIsLocating(false);
      },
      (error) => {
        console.error('Erreur de géolocalisation:', error);
        setIsLocating(false);
      },
      { enableHighAccuracy: true }
    );
  };

  // Gestion de la touche Entrée
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchByName();
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Barre de recherche intégrée à la carte */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex gap-2">
        <div className="flex-1 bg-background rounded-lg shadow-lg border border-border overflow-hidden flex">
          <input
            type="text"
            value={searchAddress}
            onChange={(e) => setSearchAddress(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher un lieu (aérodrome, ville, région)..."
            className="flex-1 px-3 py-2 text-sm bg-background text-foreground outline-none"
          />
          <button
            onClick={searchByName}
            disabled={isSearching}
            className="px-3 py-2 bg-role-primary-soft hover:bg-role-primary-light transition-colors"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin text-role-primary" />
            ) : (
              <Search className="h-4 w-4 text-role-primary" />
            )}
          </button>
        </div>
        <button
          onClick={getUserLocation}
          disabled={isLocating}
          className="px-3 py-2 bg-background rounded-lg shadow-lg border border-border hover:bg-role-primary-soft transition-colors"
          title="Ma position"
        >
          {isLocating ? (
            <Loader2 className="h-4 w-4 animate-spin text-role-primary" />
          ) : (
            <Navigation className="h-4 w-4 text-role-primary" />
          )}
        </button>
      </div>

      {/* Carte Leaflet */}
      <MapContainer
        ref={mapRef}
        center={[latitude, longitude]}
        zoom={10}
        style={{ height: '100%', width: '100%', borderRadius: '0.75rem' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker 
          position={[latitude, longitude]} 
          onPositionChange={onPositionChange}
        />
      </MapContainer>

      {/* Info-bulle de coordonnées */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-background/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs font-mono text-foreground border border-border shadow-md space-y-0.5">
        <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-role-primary"/>{toDMS(latitude, longitude)}</div>
        <div className="text-[10px] text-muted-foreground">{latitude.toFixed(6)}°, {longitude.toFixed(6)}°</div>
      </div>
    </div>
  );
}