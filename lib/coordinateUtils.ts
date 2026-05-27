// lib/coordinateUtils.ts

export const coordinateUtils = {
  /**
   * Convertit des degrés décimaux en DMS (Degrés Minutes Secondes)
   */
  toDMS(lat: number, lon: number): string {
    const toDMSString = (value: number, isLat: boolean): string => {
      const absolute = Math.abs(value);
      const degrees = Math.floor(absolute);
      const minutesFull = (absolute - degrees) * 60;
      const minutes = Math.floor(minutesFull);
      const seconds = ((minutesFull - minutes) * 60).toFixed(1);
      const direction = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
      return `${degrees}°${minutes}'${seconds}"${direction}`;
    };
    
    return `${toDMSString(lat, true)} ${toDMSString(lon, false)}`;
  },

  /**
   * Convertit des degrés décimaux en UTM
   * (Simulation - à remplacer par une vraie librairie si besoin)
   */
  toUTM(lat: number, lon: number): string {
    // Simulation UTM - à remplacer par calcul réel
    const zone = Math.floor((lon + 180) / 6) + 1;
    const hemisphere = lat >= 0 ? 'N' : 'S';
    const easting = Math.floor((lon + 180) * 10000) % 1000000;
    const northing = Math.floor((lat + 90) * 10000) % 10000000;
    return `${zone}${hemisphere} ${easting} ${northing}`;
  },

  /**
   * Convertit une chaîne DMS en degrés décimaux
   */
  dmsToDecimal(dms: string): { latitude: number; longitude: number } | null {
    const regex = /(\d+)°(\d+)'([\d.]+)"([NS])\s+(\d+)°(\d+)'([\d.]+)"([EW])/i;
    const match = dms.match(regex);
    
    if (!match) return null;
    
    const latDeg = parseInt(match[1]);
    const latMin = parseInt(match[2]);
    const latSec = parseFloat(match[3]);
    const latDir = match[4];
    const lonDeg = parseInt(match[5]);
    const lonMin = parseInt(match[6]);
    const lonSec = parseFloat(match[7]);
    const lonDir = match[8];
    
    let latitude = latDeg + latMin / 60 + latSec / 3600;
    let longitude = lonDeg + lonMin / 60 + lonSec / 3600;
    
    if (latDir === 'S') latitude = -latitude;
    if (lonDir === 'W') longitude = -longitude;
    
    return { latitude, longitude };
  },

  /**
   * Détecte le format de coordonnées et convertit
   */
  detectAndConvert(input: string): { latitude: number; longitude: number } | null {
    // Nettoyer l'entrée
    const clean = input.trim().replace(/\s+/g, ' ');
    
    // Essayer le format DMS
    const dmsResult = this.dmsToDecimal(clean);
    if (dmsResult) return dmsResult;
    
    // Essayer le format décimal (ex: 14.7168, -17.4675 ou -17.4675, 14.7168)
    const decimalPattern = /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/;
    const decimalMatch = clean.match(decimalPattern);
    if (decimalMatch) {
      let lat = parseFloat(decimalMatch[1]);
      let lon = parseFloat(decimalMatch[2]);
      
      // Vérifier les plages
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return { latitude: lat, longitude: lon };
      }
      // Si inversé (lon, lat)
      if (Math.abs(lat) <= 180 && Math.abs(lon) <= 90) {
        return { latitude: lon, longitude: lat };
      }
    }
    
    // Essayer le format "lat, lon" sans virgule
    const spacePattern = /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/;
    const spaceMatch = clean.match(spacePattern);
    if (spaceMatch) {
      let lat = parseFloat(spaceMatch[1]);
      let lon = parseFloat(spaceMatch[2]);
      
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        return { latitude: lat, longitude: lon };
      }
      if (Math.abs(lat) <= 180 && Math.abs(lon) <= 90) {
        return { latitude: lon, longitude: lat };
      }
    }
    
    // Essayer le format UTM (simplifié)
    const utmPattern = /^(\d+)([NS])\s+(\d+)\s+(\d+)$/i;
    const utmMatch = clean.match(utmPattern);
    if (utmMatch) {
      // Simulation de conversion UTM -> Décimal
      // À remplacer par une vraie conversion
      const zone = parseInt(utmMatch[1]);
      const hemisphere = utmMatch[2];
      const easting = parseInt(utmMatch[3]);
      const northing = parseInt(utmMatch[4]);
      
      // Conversion approximative pour démo
      const lon = (zone - 1) * 6 - 180 + (easting / 1000000) * 6;
      const lat = (northing / 10000000) * 180 - 90;
      
      return { 
        latitude: hemisphere === 'N' ? lat : -lat, 
        longitude: lon 
      };
    }
    
    return null;
  }
};