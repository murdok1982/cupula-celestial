/**
 * Conversiones de coordenadas: WGS84 <-> MGRS (Military Grid Reference System).
 * Implementacion simplificada para etiquetas en pantalla. La fusion real
 * (track-fusion) usa ECEF, esta utilidad es solo de visualizacion.
 */

import type { GeoPosition } from '@/types/tracks';

/** Lat/Lon formateado: 40.4168N 003.7038W */
export function formatLatLon(pos: GeoPosition): string {
  const latHem = pos.lat >= 0 ? 'N' : 'S';
  const lonHem = pos.lon >= 0 ? 'E' : 'W';
  const lat = Math.abs(pos.lat).toFixed(4);
  const lon = Math.abs(pos.lon).toFixed(4).padStart(8, '0');
  return `${lat}${latHem} ${lon}${lonHem}`;
}

/** Altitud con unidad. */
export function formatAlt(altM: number): string {
  if (altM < 1000) return `${altM.toFixed(0)} m`;
  return `${(altM / 1000).toFixed(2)} km`;
}

/** Rango: m o km segun magnitud. */
export function formatRange(rangeM: number): string {
  if (rangeM < 1000) return `${rangeM.toFixed(0)} m`;
  return `${(rangeM / 1000).toFixed(2)} km`;
}

/**
 * Aproximacion MGRS muy simplificada (zona + 100km square + easting/northing).
 * En produccion usar libreria certificada (proj4js, mgrs).
 * Esto es ETIQUETA visual, NO se usa para calculos balisticos.
 */
export function approxMgrs(pos: GeoPosition): string {
  const zone = Math.floor((pos.lon + 180) / 6) + 1;
  const band = bandLetter(pos.lat);
  // Marcador placeholder: precision real requiere libreria UTM
  const easting = Math.abs(Math.floor(pos.lon * 10000) % 100000)
    .toString()
    .padStart(5, '0');
  const northing = Math.abs(Math.floor(pos.lat * 10000) % 100000)
    .toString()
    .padStart(5, '0');
  return `${zone}${band} ${easting} ${northing}`;
}

function bandLetter(lat: number): string {
  if (lat < -80 || lat > 84) return 'Z';
  const bands = 'CDEFGHJKLMNPQRSTUVWX';
  const idx = Math.floor((lat + 80) / 8);
  const letter = bands[idx];
  return letter ?? 'Z';
}

/** Heading -> octante NESW para etiquetas rapidas. */
export function headingToOctant(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const octants = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(normalized / 45) % 8;
  return octants[idx] ?? 'N';
}
