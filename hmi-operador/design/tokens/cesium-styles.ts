/**
 * Cupula Celestial — Estilos para entidades Cesium.
 *
 * Frontend importa funciones helper para configurar el viewer:
 *
 *   import { applyCesiumTheme, entityColors, geofenceStyle } from '../design/tokens/cesium-styles';
 *   applyCesiumTheme(viewer, 'tactical');
 *
 * Nota: este archivo solo exporta valores y funciones puras. No importa Cesium
 * en modulo top-level para evitar circular deps y para que pueda compilarse
 * sin Cesium presente. Las funciones reciben el viewer como argumento.
 */

import type { Viewer } from 'cesium';

export type VisionMode = 'tactical' | 'night-vision' | 'cud';

/**
 * Mapeo classification interna -> color (hex string CSS).
 *
 * Frontend convierte a Cesium.Color via:
 *   Cesium.Color.fromCssColorString(entityColors.tactical.HOSTIL_CONFIRMADO)
 */
export const entityColors = {
  tactical: {
    HOSTIL_CONFIRMADO:  '#E5484D',
    AMENAZA_PROBABLE:   '#FF8B3D',
    DESCONOCIDO:        '#F3D03E',
    NEUTRAL:            '#46A758',
    MILITAR_AMIGO:      '#3E63DD',
    CIVIL:              '#6E7889',
    INTERCEPTOR_PROPIO: '#4FB6D9',
    SENSOR_AMIGO:       '#3E63DD',
  },
  'night-vision': {
    HOSTIL_CONFIRMADO:  '#FF1F1F',
    AMENAZA_PROBABLE:   '#CC5555',
    DESCONOCIDO:        '#993333',
    NEUTRAL:            '#663030',
    MILITAR_AMIGO:      '#4D2020',
    CIVIL:              '#5A2828',
    INTERCEPTOR_PROPIO: '#993333',
    SENSOR_AMIGO:       '#4D2020',
  },
  cud: {
    HOSTIL_CONFIRMADO:  '#D55E00',
    AMENAZA_PROBABLE:   '#E69F00',
    DESCONOCIDO:        '#F0E442',
    NEUTRAL:            '#009E73',
    MILITAR_AMIGO:      '#0072B2',
    CIVIL:              '#CC79A7',
    INTERCEPTOR_PROPIO: '#56B4E9',
    SENSOR_AMIGO:       '#0072B2',
  },
} as const;

/**
 * Configuracion de terreno y atmosfera por modo visual.
 */
export const terrainTheme = {
  tactical: {
    baseColor:       '#1B2330',
    ocean:           '#08111C',
    imageryAlpha:    0.55,
    imagerySaturation: 0.4,
    imageryBrightness: 0.75,
    imageryContrast:  1.10,
    showSkyAtmosphere: false,
    showFog: false,
  },
  'night-vision': {
    baseColor:       '#1A0606',
    ocean:           '#0A0000',
    imageryAlpha:    0.20,
    imagerySaturation: 0,
    imageryBrightness: 0.50,
    imageryContrast:  1.20,
    showSkyAtmosphere: false,
    showFog: false,
  },
  cud: {
    baseColor:       '#1B2330',
    ocean:           '#08111C',
    imageryAlpha:    0.55,
    imagerySaturation: 0.4,
    imageryBrightness: 0.75,
    imageryContrast:  1.10,
    showSkyAtmosphere: false,
    showFog: false,
  },
} as const;

/**
 * Estilos de geofences por modo.
 *
 * Frontend renderiza polygons en Cesium asi:
 *
 *   viewer.entities.add({
 *     polygon: {
 *       hierarchy: [...],
 *       material: Cesium.Color.fromCssColorString(geofenceStyle.tactical.civil.fill),
 *       outlineColor: Cesium.Color.fromCssColorString(geofenceStyle.tactical.civil.stroke),
 *       outlineWidth: geofenceStyle.tactical.civil.strokeWidth,
 *       outline: true,
 *     },
 *   });
 *
 * Recuerda: el `material` de polygon recibe el color con alpha aplicado. Usa
 *   Color.fromCssColorString(hex).withAlpha(alpha)
 */
export const geofenceStyle = {
  tactical: {
    civil: {
      stroke: '#E5484D',
      strokeAlpha: 0.80,
      strokeWidth: 2,
      fill: '#E5484D',
      fillAlpha: 0.08,
      label: 'NO-FIRE',
    },
    military: {
      stroke: '#3E63DD',
      strokeAlpha: 0.60,
      strokeWidth: 2,
      fill: '#3E63DD',
      fillAlpha: 0.05,
      label: 'FREE-FIRE',
    },
    nofly: {
      stroke: '#F3D03E',
      strokeAlpha: 0.80,
      strokeWidth: 2,
      fill: '#F3D03E',
      fillAlpha: 0.06,
      label: 'NO-FLY',
    },
  },
  'night-vision': {
    civil: {
      stroke: '#FF1F1F',
      strokeAlpha: 0.80,
      strokeWidth: 2,
      fill: '#FF1F1F',
      fillAlpha: 0.10,
      label: 'NO-FIRE',
    },
    military: {
      stroke: '#7A2424',
      strokeAlpha: 0.60,
      strokeWidth: 2,
      fill: '#7A2424',
      fillAlpha: 0.05,
      label: 'FREE-FIRE',
    },
    nofly: {
      stroke: '#CC5555',
      strokeAlpha: 0.80,
      strokeWidth: 2,
      fill: '#CC5555',
      fillAlpha: 0.06,
      label: 'NO-FLY',
    },
  },
  cud: {
    civil: {
      stroke: '#D55E00',
      strokeAlpha: 0.80,
      strokeWidth: 2,
      fill: '#D55E00',
      fillAlpha: 0.08,
      label: 'NO-FIRE',
    },
    military: {
      stroke: '#0072B2',
      strokeAlpha: 0.60,
      strokeWidth: 2,
      fill: '#0072B2',
      fillAlpha: 0.05,
      label: 'FREE-FIRE',
    },
    nofly: {
      stroke: '#F0E442',
      strokeAlpha: 0.80,
      strokeWidth: 2,
      fill: '#F0E442',
      fillAlpha: 0.06,
      label: 'NO-FLY',
    },
  },
} as const;

/**
 * Estilos para labels sobre el mapa (track ID, geofence name, etc.).
 */
export const cesiumLabelStyle = {
  tactical: {
    fillColor: '#E6EDF3',
    outlineColor: '#0A0E14',
    outlineWidth: 2,
    font: '11px "JetBrains Mono"',
    backgroundColor: 'rgba(17, 22, 29, 0.85)',
  },
  'night-vision': {
    fillColor: '#FF6B6B',
    outlineColor: '#000000',
    outlineWidth: 2,
    font: '11px "JetBrains Mono"',
    backgroundColor: 'rgba(26, 3, 3, 0.85)',
  },
  cud: {
    fillColor: '#E6EDF3',
    outlineColor: '#0A0E14',
    outlineWidth: 2,
    font: '11px "JetBrains Mono"',
    backgroundColor: 'rgba(17, 22, 29, 0.85)',
  },
} as const;

/**
 * Configuracion de leader-line (vector de velocidad de tracks).
 */
export const leaderLineStyle = {
  width: 2,
  glowPower: 0.15,
  projectionSeconds: 60, // proyecta posicion a 60 s
};

/**
 * Configuracion del trail historico (ultimas N posiciones).
 */
export const trailStyle = {
  width: 1.5,
  maxPositions: 8,
  alphaStart: 0.4, // primer segmento mas opaco
  alphaEnd: 0.05,  // ultimo casi transparente
};

/**
 * Configuracion de halo pulsante para HOSTIL_CONFIRMADO.
 */
export const hostilePulseStyle = {
  innerSize: 6,
  outerSize: 18,
  periodMs: 1500,
  iterations: 3, // se detiene tras 3 ciclos por evento
  baseAlpha: 0.30,
};

/**
 * Tamano del simbolo APP-6 en mapa segun zoom.
 */
export const symbolSize = {
  list: 16,
  badge: 24,
  map: 32,
  expanded: 48,
};

/**
 * Helper: dado un viewer Cesium, aplica el tema indicado.
 * Frontend invoca esto al iniciar y al cambiar de modo visual.
 *
 * NOTA: la implementacion concreta llamando a Cesium.Color.fromCssColorString
 * la pone Frontend en su modulo (src/lib/cesium-theme.ts). Este archivo solo
 * provee la configuracion declarativa.
 */
export function getCesiumThemeConfig(mode: VisionMode) {
  return {
    terrain: terrainTheme[mode],
    entities: entityColors[mode],
    geofences: geofenceStyle[mode],
    labels: cesiumLabelStyle[mode],
    leaderLine: leaderLineStyle,
    trail: trailStyle,
    hostilePulse: hostilePulseStyle,
    symbolSize,
  };
}

/**
 * Aplica el tema a un viewer Cesium concreto. Requiere `Cesium` global o pasarlo.
 * Frontend re-implementa esto si necesita evitar tree-shaking issues.
 */
export function applyCesiumTheme(
  viewer: Viewer,
  mode: VisionMode,
  CesiumNS: typeof import('cesium'),
) {
  const cfg = getCesiumThemeConfig(mode);
  viewer.scene.globe.baseColor = CesiumNS.Color.fromCssColorString(cfg.terrain.baseColor);
  viewer.scene.skyAtmosphere.show = cfg.terrain.showSkyAtmosphere;
  viewer.scene.fog.enabled = cfg.terrain.showFog;
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.globe.enableLighting = false;

  if (viewer.imageryLayers.length > 0) {
    const layer = viewer.imageryLayers.get(0);
    layer.alpha = cfg.terrain.imageryAlpha;
    layer.saturation = cfg.terrain.imagerySaturation;
    layer.brightness = cfg.terrain.imageryBrightness;
    layer.contrast = cfg.terrain.imageryContrast;
  }
}

/**
 * Color en formato CSS para una clasificacion dada y un modo visual.
 */
export function colorForClassification(
  classification: keyof typeof entityColors.tactical,
  mode: VisionMode = 'tactical',
): string {
  return entityColors[mode][classification];
}

/**
 * Tipos para que Frontend tenga IntelliSense.
 */
export type Classification = keyof typeof entityColors.tactical;
export type GeofenceType = keyof typeof geofenceStyle.tactical;
