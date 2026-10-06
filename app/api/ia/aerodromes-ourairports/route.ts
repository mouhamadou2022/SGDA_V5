// app/api/ia/aerodromes-ourairports/route.ts
// Lookup OurAirports côté serveur (le CSV fait ~30 Mo : jamais côté navigateur,
// jamais de CORS). GET ?code=GOOY | ?nom=Tambacounda&lat=..&lon=..

import { NextResponse } from 'next/server';
import { chargerOurAirports, rechercherMeilleur } from '@/lib/ia/ourAirports';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get('code') || '').toUpperCase();
    const nom = url.searchParams.get('nom') || '';
    const lat = Number(url.searchParams.get('lat'));
    const lon = Number(url.searchParams.get('lon'));
    const rows = await chargerOurAirports();
    const match = rechercherMeilleur(rows, {
      code: code || undefined,
      nom: nom || undefined,
      lat: isFinite(lat) ? lat : undefined,
      lon: isFinite(lon) ? lon : undefined,
    });
    return NextResponse.json({ match });
  } catch {
    return NextResponse.json({ match: null });
  }
}
