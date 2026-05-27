// types/aerodrome.ts
export interface AerodromeTab {
  label: string
  icon: string
  id: 'details' | 'map' | 'qr' | 'contacts' | 'equip' | 'incidents' | 'histo'
}

export const AERODROME_TABS: AerodromeTab[] = [
  { label: 'Détails', icon: 'FileText', id: 'details' },
  { label: 'Carte', icon: 'Map', id: 'map' },
  { label: 'QR Code', icon: 'QrCode', id: 'qr' },
  { label: 'Contacts', icon: 'Users', id: 'contacts' },
  { label: 'Équipements', icon: 'Wrench', id: 'equip' },
  { label: 'Incidents', icon: 'AlertTriangle', id: 'incidents' },
  { label: 'Historique', icon: 'Clock', id: 'histo' },
]
