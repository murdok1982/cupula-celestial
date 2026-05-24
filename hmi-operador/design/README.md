# Design System — Cúpula Celestial HMI Operador

Sistema de diseño táctico para el HMI del operador del orquestador C2 del programa **Cúpula Celestial** (Ministerio de Defensa de España, sistema C-UAS).

> Doctrina visual: **sobriedad operacional, densidad informativa, latencia cognitiva mínima**. Cada decisión visual se subordina a la velocidad y precisión con que un operador militar autoriza un engagement letal bajo control humano significativo (MHC).

---

## Índice

| # | Documento | Resumen |
|---|---|---|
| 00 | [Principios](./00-principios.md) | Doctrina de diseño, usuario objetivo, restricciones |
| 01 | [Paleta](./01-paleta.md) | Sistema de color táctico con justificación |
| 02 | [Tipografía](./02-tipografia.md) | Familias, escalas, numerales tabulares |
| 03 | [Espaciado y grid](./03-espaciado-grid.md) | Sistema 4 px, breakpoints, densidad |
| 04 | [Componentes](./04-componentes.md) | Anatomía, estados, tokens, accesibilidad |
| 05 | [Simbología NATO](./05-simbologia-nato.md) | APP-6D / MIL-STD-2525D aplicado |
| 06 | [Iconografía](./06-iconografia.md) | Set de iconos tácticos |
| 07 | [Accesibilidad](./07-accesibilidad.md) | WCAG 2.1 AA + MIL-STD-1472 |
| 08 | [Modos visuales](./08-modos-visuales.md) | Dark, Night Vision, Color-blind safe |
| 09 | [Microinteracciones](./09-microinteracciones.md) | Animaciones, sonidos mil-spec |
| 10 | [Wireframes](./10-wireframes.md) | Pantallas en ASCII |
| 11 | [Mapa Cesium](./11-mapa-cesium.md) | Estilo del mapa táctico 3D |
| 12 | [Flujos críticos](./12-flujos-criticos.md) | Engagement, saturación, comms loss |

---

## Estructura de archivos

```
design/
├── README.md                      ← este archivo
├── 00–12 *.md                     ← especificación textual
├── tokens/
│   ├── design-tokens.json         ← Style Dictionary (fuente única)
│   ├── tailwind-tokens.ts         ← export TS para tailwind.config.ts
│   └── cesium-styles.ts           ← estilos Cesium (terreno, tracks, geofences)
├── examples/                      ← HTML autocontenidos
│   ├── ThreatBadge.example.html
│   ├── RecommendationCard.example.html
│   ├── EngagementAuthDialog.example.html
│   ├── TrackRow.example.html
│   └── StatusBar.example.html
└── audit/
    └── contrast-check.md          ← matriz WCAG verificada
```

---

## Integración con Frontend

El agente Frontend trabaja en `hmi-operador/src/`. Para integrar este sistema:

1. **Tailwind config** (`hmi-operador/tailwind.config.ts`):

   ```ts
   import { ccelestialTokens } from './design/tokens/tailwind-tokens';

   export default {
     darkMode: 'class',
     content: ['./index.html', './src/**/*.{ts,tsx}'],
     theme: {
       extend: {
         colors: ccelestialTokens.colors,
         fontFamily: ccelestialTokens.fontFamily,
         fontSize: ccelestialTokens.fontSize,
         spacing: ccelestialTokens.spacing,
         borderRadius: ccelestialTokens.borderRadius,
         boxShadow: ccelestialTokens.boxShadow,
         animation: ccelestialTokens.animation,
         keyframes: ccelestialTokens.keyframes,
       },
     },
     plugins: [],
   };
   ```

2. **Variables CSS** en `src/styles/tokens.css` (importar en `main.tsx`):

   El JSON `design-tokens.json` puede compilarse con Style Dictionary a CSS custom properties (`--ccelestial-*`). En su defecto, ver el bloque `:root` del archivo `examples/StatusBar.example.html` como referencia inline.

3. **Cesium** (`src/lib/cesium-theme.ts`):

   ```ts
   import { entityColors, geofenceStyle, terrainTheme } from '../../design/tokens/cesium-styles';
   ```

4. **Cambio de modo visual** (Dark ↔ Night Vision ↔ CUD):

   Aplicar atributo `data-vision-mode="tactical"|"night-vision"|"cud"` al `<html>`. Las variables CSS cambian conjuntamente.

---

## Reglas duras (no negociables)

- **Toda decisión visual tiene una razón táctica documentada**. No hay decoración.
- **Ningún indicador depende solo del color** — siempre un símbolo APP-6 o un texto auxiliar (principio de inclusión + redundancia bajo estrés).
- **Animaciones ≤ 200 ms**, sin elasticidad/bounce/parallax.
- **Toda acción crítica tiene atajo de teclado**.
- **Contraste WCAG AA mínimo; AAA en datos de engagement** (verificado en `audit/contrast-check.md`).
- **Idioma operativo: español**. Códigos OTAN en formato original (DEFCON, HOSTILE, FRIENDLY).
- **Sin gradientes decorativos, sin glassmorphism abusivo, sin emojis** (excepto símbolos universales).

---

## Versión

`v0.1.0` — FASE 0 / Diseño inicial — 2026-05-23.
