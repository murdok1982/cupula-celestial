/**
 * Subset minimo de simbologia NATO APP-6D para visualizar en HMI.
 * Genera markers SVG que se pueden inlinear en Cesium o como icono UI.
 *
 * Convenciones APP-6 utilizadas:
 *  - HOSTIL: diamante rojo
 *  - AMIGO: rectangulo azul
 *  - NEUTRAL: cuadrado verde (girado 0deg)
 *  - DESCONOCIDO: trebol amarillo (aprox - diamante con esquinas)
 */
import type { ThreatClassification } from '@/types/tracks';
import { threatColorKey, threatHex } from './threat';

export type SymbolShape = 'diamond' | 'rectangle' | 'square' | 'cloverleaf';

export function symbolForClassification(c: ThreatClassification): SymbolShape {
  switch (threatColorKey(c)) {
    case 'hostile':
      return 'diamond';
    case 'friend':
      return 'rectangle';
    case 'neutral':
      return 'square';
    default:
      return 'cloverleaf';
  }
}

/**
 * Genera un SVG inline para un punto tactico. Util para marker overlay y leyenda.
 * @param size lado del SVG en px
 */
export function natoSvg(c: ThreatClassification, size = 24): string {
  const color = threatHex(c);
  const shape = symbolForClassification(c);
  const stroke = '#0a0e14';
  const sw = 2;
  const inner = size - sw * 2;

  switch (shape) {
    case 'diamond':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><polygon points="${size / 2},${sw} ${size - sw},${size / 2} ${size / 2},${size - sw} ${sw},${size / 2}" fill="${color}" stroke="${stroke}" stroke-width="${sw}" /></svg>`;
    case 'rectangle':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect x="${sw}" y="${size * 0.25}" width="${inner}" height="${size * 0.5}" fill="${color}" stroke="${stroke}" stroke-width="${sw}" rx="2" /></svg>`;
    case 'square':
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect x="${sw}" y="${sw}" width="${inner}" height="${inner}" fill="${color}" stroke="${stroke}" stroke-width="${sw}" /></svg>`;
    case 'cloverleaf':
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - sw}" fill="${color}" stroke="${stroke}" stroke-width="${sw}" /><text x="50%" y="55%" font-family="monospace" font-size="${size * 0.5}" text-anchor="middle" fill="${stroke}" font-weight="bold">?</text></svg>`;
  }
}

/** Devuelve un Data URL para usar como icon billboard en Cesium. */
export function natoSymbolDataUrl(c: ThreatClassification, size = 32): string {
  const svg = natoSvg(c, size);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
