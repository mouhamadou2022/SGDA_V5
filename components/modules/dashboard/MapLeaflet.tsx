'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/store'

export function MapLeaflet({ userRole }: { userRole: string }) {
  const [isClient, setIsClient] = useState(false)
  useEffect(() => { setIsClient(true) }, [])
  if (!isClient) return <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
  return <MapInner userRole={userRole} />
}

function MapInner({ userRole }: { userRole: string }) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const profilsRisque = useAppStore(s => s.profilsRisque);

  useEffect(() => {
    // Dynamic import Leaflet only on client
    let map: any = null
    let L: any = null

    const initMap = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        L = require('leaflet')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('leaflet/dist/leaflet.css')

        const container = document.getElementById('sgda-leaflet-map')
        if (!container) return

        // Prevent double init
        if ((container as any)._leaflet_id) return

        map = L.map(container, {
          center: [14.4974, -14.4524],
          zoom: 7,
          zoomControl: true,
          attributionControl: true,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 18,
        }).addTo(map)

        aerodromes.forEach(aero => {
          if (!aero.lat || !aero.lon) return

          const profil = profilsRisque[aero.id]
          const score = profil?.score_global ?? null

          let couleur = '#6b7280' // gris si pas de profil
          if (score !== null) {
            if (score < 30) couleur = '#ef4444'       // rouge
            else if (score < 60) couleur = '#f97316'  // orange
            else if (score < 80) couleur = '#3b82f6'  // bleu
            else couleur = '#22c55e'                  // vert
          }

          const icon = L.divIcon({
            className: '',
            html: `<div style="
              width:14px;height:14px;border-radius:50%;
              background:${couleur};border:2px solid white;
              box-shadow:0 1px 4px rgba(0,0,0,0.4);
            "></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          })

          const certStatut = score !== null
            ? (score >= 60 ? 'Certifié' : 'Non certifié')
            : 'Statut inconnu'

          const popupHtml = `
            <div style="min-width:160px;font-family:sans-serif;">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${aero.nom}</div>
              <div style="font-size:11px;color:#6b7280;margin-bottom:6px;">Code OACI : <b>${aero.code_oaci}</b></div>
              ${score !== null
                ? `<div style="font-size:11px;margin-bottom:4px;">Score risque : <b style="color:${couleur}">${score}/100</b></div>`
                : ''
              }
              <div style="font-size:11px;">Certification : <b>${certStatut}</b></div>
            </div>
          `

          L.marker([aero.lat, aero.lon], { icon })
            .addTo(map)
            .bindPopup(popupHtml)
        })
      } catch {
        // Leaflet unavailable (SSR guard already handled above)
      }
    }

    initMap()

    return () => {
      if (map) {
        map.remove()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aerodromes, profilsRisque])

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <div id="sgda-leaflet-map" className="h-96 w-full z-0" />
      {/* Légende */}
      <div className="absolute bottom-3 right-3 bg-white bg-opacity-95 rounded-lg shadow px-3 py-2 text-xs space-y-1 z-10 border border-gray-100">
        <div className="font-semibold text-gray-700 mb-1">Score risque</div>
        {[
          { couleur: '#ef4444', label: 'Critique (< 30)' },
          { couleur: '#f97316', label: 'Modéré (30–59)' },
          { couleur: '#3b82f6', label: 'Bon (60–79)' },
          { couleur: '#22c55e', label: 'Excellent (≥ 80)' },
        ].map(({ couleur, label }) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full border border-white shadow"
              style={{ background: couleur }}
            />
            <span className="text-gray-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default MapLeaflet
