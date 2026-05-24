/**
 * Placeholder declarativo. La logica vive en CesiumMap.tsx (imperativa por
 * razones de rendimiento del motor 3D). Este modulo existe para que el
 * indice de la estructura este completo y para futura migracion a Resium.
 */
import type { Track } from '@/types/tracks';

export interface TrackEntityProps {
  track: Track;
}

export function TrackEntity(_props: TrackEntityProps): null {
  // Reservado: la sincronizacion real con Cesium ocurre en CesiumMap.tsx
  return null;
}
