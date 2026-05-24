/**
 * Cupula Celestial — Tokens de diseno exportables a tailwind.config.ts
 *
 * Frontend integra asi:
 *
 *   import { ccelestialTokens } from './design/tokens/tailwind-tokens';
 *
 *   export default {
 *     darkMode: 'class',
 *     content: ['./index.html', './src/**\/*.{ts,tsx}'],
 *     theme: { extend: { ...ccelestialTokens } },
 *   } satisfies Config;
 *
 * Los valores aqui son la fuente unica de verdad para el HMI. Cualquier cambio
 * cromatico debe pasar primero por `design/01-paleta.md` y `audit/contrast-check.md`.
 */

export const ccelestialColors = {
  // Backgrounds
  bg: {
    base: '#0A0E14',
    surface: '#11161D',
    elevated: '#1A2129',
    hover: '#1F2730',
    overlay: 'rgba(10, 14, 20, 0.85)',
  },
  // Foreground (texto)
  fg: {
    primary: '#E6EDF3',
    secondary: '#B0BAC9',
    tertiary: '#6E7889',
    inverse: '#0A0E14',
  },
  // Bordes
  border: {
    subtle: '#1F2730',
    DEFAULT: '#2A3340',
    strong: '#3D4A5C',
    focus: '#4D7BD8',
  },
  // Escala de amenaza (OTAN APP-6D)
  threat: {
    hostile: '#E5484D',
    'hostile-bg': 'rgba(229, 72, 77, 0.16)',
    probable: '#FF8B3D',
    'probable-bg': 'rgba(255, 139, 61, 0.16)',
    unknown: '#F3D03E',
    'unknown-bg': 'rgba(243, 208, 62, 0.14)',
    neutral: '#46A758',
    'neutral-bg': 'rgba(70, 167, 88, 0.16)',
    friend: '#3E63DD',
    'friend-bg': 'rgba(62, 99, 221, 0.18)',
    civil: '#6E7889',
    'civil-bg': 'rgba(110, 120, 137, 0.15)',
    discard: '#4A5260',
    'discard-bg': 'rgba(74, 82, 96, 0.12)',
  },
  // Estado del sistema
  status: {
    success: '#2BA968',
    'success-bg': 'rgba(43, 169, 104, 0.14)',
    warning: '#E8A800',
    'warning-bg': 'rgba(232, 168, 0, 0.14)',
    error: '#E5484D',
    'error-bg': 'rgba(229, 72, 77, 0.14)',
    info: '#4D7BD8',
    'info-bg': 'rgba(77, 123, 216, 0.14)',
  },
  // DEFCON levels
  defcon: {
    1: '#E5484D',
    2: '#FF8B3D',
    3: '#E8A800',
    4: '#A0B842',
    5: '#46A758',
  },
  // Acentos del sistema
  accent: {
    primary: '#4D7BD8',
    'primary-hover': '#5D8AE8',
    engage: '#E5484D',
    'engage-hover': '#F05A60',
    cyan: '#4FB6D9',
    magenta: '#C447D9',
  },
  // Mapa Cesium (referencia, normalmente se consume desde cesium-styles.ts)
  cesium: {
    terrain: '#1B2330',
    ocean: '#08111C',
    'admin-border': '#3D4A5C',
    'geofence-civil': '#E5484D',
    'geofence-military': '#3E63DD',
    'geofence-nofly': '#F3D03E',
  },

  // Aliases shadcn/ui (mantiene compat con componentes Radix base)
  background: '#0A0E14',
  foreground: '#E6EDF3',
  primary: {
    DEFAULT: '#4D7BD8',
    foreground: '#0A0E14',
  },
  secondary: {
    DEFAULT: '#11161D',
    foreground: '#E6EDF3',
  },
  destructive: {
    DEFAULT: '#E5484D',
    foreground: '#FFFFFF',
  },
  muted: {
    DEFAULT: '#11161D',
    foreground: '#B0BAC9',
  },
  card: {
    DEFAULT: '#11161D',
    foreground: '#E6EDF3',
  },
  popover: {
    DEFAULT: '#1A2129',
    foreground: '#E6EDF3',
  },
} as const;

export const ccelestialFontFamily = {
  sans: ['"Inter Tight"', '"IBM Plex Sans"', 'Inter', 'system-ui', 'sans-serif'],
  mono: ['"JetBrains Mono"', '"Berkeley Mono"', '"IBM Plex Mono"', 'Consolas', 'monospace'],
  display: ['"IBM Plex Sans Condensed"', '"Inter Tight"', '"Arial Narrow"', 'sans-serif'],
} as const;

export const ccelestialFontSize = {
  '2xs': ['11px', { lineHeight: '14px', letterSpacing: '0.02em' }],
  xs:    ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
  sm:    ['13px', { lineHeight: '18px', letterSpacing: '0'      }],
  base:  ['14px', { lineHeight: '20px', letterSpacing: '0'      }],
  md:    ['16px', { lineHeight: '24px', letterSpacing: '0'      }],
  lg:    ['18px', { lineHeight: '26px', letterSpacing: '-0.005em' }],
  xl:    ['20px', { lineHeight: '28px', letterSpacing: '-0.01em'  }],
  '2xl': ['24px', { lineHeight: '32px', letterSpacing: '-0.015em' }],
  '3xl': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em'  }],
} as const;

export const ccelestialSpacing = {
  '0':   '0px',
  'px':  '1px',
  '0.5': '2px',
  '1':   '4px',
  '1.5': '6px',
  '2':   '8px',
  '3':   '12px',
  '4':   '16px',
  '5':   '20px',
  '6':   '24px',
  '8':   '32px',
  '10':  '40px',
  '12':  '48px',
  '16':  '64px',
} as const;

export const ccelestialBorderRadius = {
  none: '0px',
  sm:   '2px',
  md:   '4px',
  lg:   '6px',
  full: '9999px',
} as const;

export const ccelestialBoxShadow = {
  none:   'none',
  panel:  '0 1px 0 0 #2A3340',
  card:   '0 2px 4px rgba(0, 0, 0, 0.3)',
  modal:  '0 10px 32px rgba(0, 0, 0, 0.6)',
  engage: '0 0 0 2px rgba(229, 72, 77, 0.45), 0 0 16px rgba(229, 72, 77, 0.35)',
  focus:  '0 0 0 2px #4D7BD8',
} as const;

export const ccelestialAnimation = {
  'fade-in':         'ccelestial-fade-in 150ms cubic-bezier(0, 0, 0.2, 1)',
  'fade-out':        'ccelestial-fade-out 100ms cubic-bezier(0, 0, 0.2, 1)',
  'slide-down':      'ccelestial-slide-down 200ms cubic-bezier(0, 0, 0.2, 1)',
  'pulse-threat':    'ccelestial-pulse-threat 1500ms cubic-bezier(0, 0, 0.2, 1) 3',
  'pulse-defcon-up': 'ccelestial-pulse-defcon-up 2000ms cubic-bezier(0, 0, 0.2, 1) 1',
  'spin-loading':    'ccelestial-spin 600ms linear infinite',
  'progress':        'ccelestial-progress var(--countdown-duration, 30s) linear forwards',
} as const;

export const ccelestialKeyframes = {
  'ccelestial-fade-in': {
    from: { opacity: '0' },
    to:   { opacity: '1' },
  },
  'ccelestial-fade-out': {
    from: { opacity: '1' },
    to:   { opacity: '0' },
  },
  'ccelestial-slide-down': {
    from: { transform: 'translateY(-8px)', opacity: '0' },
    to:   { transform: 'translateY(0)',    opacity: '1' },
  },
  'ccelestial-pulse-threat': {
    '0%':   { boxShadow: '0 0 0 0 rgba(229, 72, 77, 0.6)' },
    '100%': { boxShadow: '0 0 0 8px rgba(229, 72, 77, 0)' },
  },
  'ccelestial-pulse-defcon-up': {
    '0%, 100%': { backgroundColor: 'rgba(229, 72, 77, 0.3)' },
    '50%':      { backgroundColor: 'rgba(229, 72, 77, 0.6)' },
  },
  'ccelestial-spin': {
    to: { transform: 'rotate(360deg)' },
  },
  'ccelestial-progress': {
    from: { width: '100%' },
    to:   { width: '0%' },
  },
} as const;

export const ccelestialZIndex = {
  base: 0,
  map: 1,
  'map-overlay': 10,
  panel: 100,
  header: 200,
  statusbar: 200,
  dropdown: 500,
  tooltip: 800,
  'modal-backdrop': 1000,
  modal: 1010,
  toast: 1100,
  'critical-banner': 1200,
} as const;

export const ccelestialScreens = {
  tablet: '1024px',
  secondary: '1280px',
  workstation: '1920px',
  quad: '2560px',
  '4k': '3840px',
} as const;

/**
 * Objeto unico que se vierte en `theme.extend` de tailwind.config.ts.
 */
export const ccelestialTokens = {
  colors: ccelestialColors,
  fontFamily: ccelestialFontFamily,
  fontSize: ccelestialFontSize,
  spacing: ccelestialSpacing,
  borderRadius: ccelestialBorderRadius,
  boxShadow: ccelestialBoxShadow,
  animation: ccelestialAnimation,
  keyframes: ccelestialKeyframes,
  zIndex: ccelestialZIndex,
  screens: ccelestialScreens,
} as const;

export type CCelestialTokens = typeof ccelestialTokens;
