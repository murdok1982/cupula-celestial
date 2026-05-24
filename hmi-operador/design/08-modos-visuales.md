# 08 — Modos visuales

> Tres paletas alternativas completas. El operador alterna con `Ctrl+Shift+M`. La preferencia persiste en `localStorage` y se aplica a `<html data-vision-mode="...">`.

---

## 1. Tactical Dark (default)

Ver `01-paleta.md`. Modo por defecto en estación de operaciones bajo iluminación controlada (< 50 lux). Optimizado para discriminación cromática y densidad informativa.

```css
[data-vision-mode='tactical'] {
  --ccelestial-bg-base: #0A0E14;
  --ccelestial-bg-surface: #11161D;
  --ccelestial-bg-elevated: #1A2129;
  --ccelestial-fg-primary: #E6EDF3;
  --ccelestial-fg-secondary: #B0BAC9;
  --ccelestial-fg-tertiary: #6E7889;
  --ccelestial-threat-hostile: #E5484D;
  --ccelestial-threat-probable: #FF8B3D;
  --ccelestial-threat-unknown: #F3D03E;
  --ccelestial-threat-neutral: #46A758;
  --ccelestial-threat-friend: #3E63DD;
  --ccelestial-threat-civil: #6E7889;
  --ccelestial-status-success: #2BA968;
  --ccelestial-status-warning: #E8A800;
  --ccelestial-status-error: #E5484D;
  --ccelestial-status-info: #4D7BD8;
  --ccelestial-accent-primary: #4D7BD8;
  --ccelestial-accent-engage: #E5484D;
  --ccelestial-accent-cyan: #4FB6D9;
}
```

---

## 2. Night Vision (red monochromatic)

Para sala de operaciones con doctrina de oscuridad sostenida o cuando el operador alterna con visión sin amplificación (visión a la salida o gafas NVG). El espectro rojo conserva la adaptación a la oscuridad (sensibilidad de los bastones retinianos).

Características:

- **Todos los colores se mapean a escala monocromática roja** sobre negro absoluto.
- **Animaciones pulse se atenúan a 50 % amplitud** para no fatigar la retina adaptada a oscuridad.
- **Brightness reducido un 20 %** en todos los acentos.

```css
[data-vision-mode='night-vision'] {
  --ccelestial-bg-base: #000000;
  --ccelestial-bg-surface: #1A0303;
  --ccelestial-bg-elevated: #260505;
  --ccelestial-bg-hover: #330707;

  --ccelestial-border-subtle: #1F0404;
  --ccelestial-border-default: #330707;
  --ccelestial-border-strong: #660F0F;
  --ccelestial-border-focus: #FF6B6B;

  --ccelestial-fg-primary: #FF6B6B;
  --ccelestial-fg-secondary: #CC4444;
  --ccelestial-fg-tertiary: #7A2424;
  --ccelestial-fg-inverse: #000000;

  /* Threat: discriminación por símbolo + texto, no por color */
  --ccelestial-threat-hostile: #FF1F1F;       /* + pulse + símbolo H */
  --ccelestial-threat-probable: #CC5555;       /* + símbolo S */
  --ccelestial-threat-unknown: #993333;        /* + símbolo U */
  --ccelestial-threat-neutral: #663030;        /* + símbolo N */
  --ccelestial-threat-friend: #4D2020;         /* + símbolo F. Deliberadamente atenuado para que destaque hostil */
  --ccelestial-threat-civil: #5A2828;

  --ccelestial-status-success: #993333;
  --ccelestial-status-warning: #FF4444;        /* + animación */
  --ccelestial-status-error: #FF1F1F;
  --ccelestial-status-info: #993333;

  --ccelestial-accent-primary: #993333;
  --ccelestial-accent-engage: #FF1F1F;
  --ccelestial-accent-cyan: #663030;
}
```

### Reglas adicionales en Night Vision

- **Símbolos APP-6 se muestran con outline blanco 1 px** para discriminar formas en monocromo.
- **El símbolo se acompaña SIEMPRE de la letra de afiliación** (H, S, U, N, F) en mono al lado.
- **Los feeds de vídeo** se cambian a IR/monocromo automáticamente.
- **El mapa Cesium**: terrain bathymetry pasa a `#0A0000`, terreno `#1A0606`, tracks en colores anteriores. Imagery (aerial) se desactiva.

### Razón táctica

El espectro rojo (longitudes de onda > 620 nm) no estimula los bastones retinianos, preservando la adaptación a la oscuridad acumulada en 20–30 minutos. Si el operador necesita apartar la vista del monitor (ej. mirar otra estación, lectura en papel con linterna roja), recupera su visión nocturna instantáneamente. Esta práctica deriva del estándar US Navy MIL-DTL-43511D para iluminación de cabinas de buques de guerra.

---

## 3. Color-blind safe (CUD — Color Universal Design)

Paleta Okabe & Ito (2008) extendida. Distinguible para los 3 principales tipos de daltonismo (protanopia, deuteranopia, tritanopia) y para acromatopsia parcial.

**Regla absoluta:** en este modo, **todos los indicadores que en Tactical Dark dependían parcialmente de color añaden un símbolo geométrico complementario**.

```css
[data-vision-mode='cud'] {
  --ccelestial-bg-base: #0A0E14;
  --ccelestial-bg-surface: #11161D;
  --ccelestial-bg-elevated: #1A2129;
  --ccelestial-fg-primary: #E6EDF3;
  --ccelestial-fg-secondary: #B0BAC9;
  --ccelestial-fg-tertiary: #6E7889;

  /* Paleta Okabe & Ito */
  --ccelestial-threat-hostile: #D55E00;        /* vermillón + glyph ▼ */
  --ccelestial-threat-probable: #E69F00;       /* naranja + glyph ◆ */
  --ccelestial-threat-unknown: #F0E442;        /* amarillo + glyph ? */
  --ccelestial-threat-neutral: #009E73;        /* verde bluish + glyph ○ */
  --ccelestial-threat-friend: #0072B2;         /* azul + glyph ▲ */
  --ccelestial-threat-civil: #CC79A7;          /* rosa + glyph □ */

  --ccelestial-status-success: #009E73;
  --ccelestial-status-warning: #E69F00;
  --ccelestial-status-error: #D55E00;
  --ccelestial-status-info: #56B4E9;

  --ccelestial-accent-primary: #0072B2;
  --ccelestial-accent-engage: #D55E00;
  --ccelestial-accent-cyan: #56B4E9;
}
```

### Símbolos redundantes obligatorios en CUD

```
HOSTIL_CONFIRMADO  →  ▼ + "HOSTIL"
AMENAZA_PROBABLE   →  ◆ + "PROBABLE"
DESCONOCIDO        →  ? + "DESCONOC."
NEUTRAL            →  ○ + "NEUTRAL"
MILITAR_AMIGO      →  ▲ + "AMIGO"
CIVIL              →  □ + "CIVIL"
```

Frontend renderiza estos glyphs Unicode dentro del badge ANTES del color (a la izquierda del texto). En `ThreatBadge` el SVG APP-6 se conserva además del glyph.

### Validación

Cada release del HMI se valida pasando capturas por:

- [Coblis (Color Blindness Simulator)](https://www.color-blindness.com/coblis-color-blindness-simulator/)
- Filtros de Chrome DevTools (Achromatopsia, Deuteranopia, Protanopia, Tritanopia)

---

## 4. Conmutador en runtime

```ts
// src/lib/vision-mode.ts (Frontend)
type VisionMode = 'tactical' | 'night-vision' | 'cud';

export function setVisionMode(mode: VisionMode) {
  document.documentElement.dataset.visionMode = mode;
  localStorage.setItem('ccelestial:vision-mode', mode);
  // Anuncia a screen reader
  announce(`Modo visual cambiado a ${labelOf(mode)}`);
}

export function cycleVisionMode() {
  const current = (localStorage.getItem('ccelestial:vision-mode') ?? 'tactical') as VisionMode;
  const next: Record<VisionMode, VisionMode> = {
    tactical: 'night-vision',
    'night-vision': 'cud',
    cud: 'tactical',
  };
  setVisionMode(next[current]);
}
```

Bind a `Ctrl+Shift+M` global.

---

## 5. Transición entre modos

- Sin animación de cross-fade (puede ser confusa en modo crítico).
- Cambio instantáneo de variables CSS.
- Banner toast de 2 segundos: "Modo visual: Night Vision activo".
- Si en EngagementAuthDialog, el modal NO se cierra al cambiar (continúa el flujo).

---

## 6. Aplicación a Cesium

El mapa Cesium requiere actualización de su tema al cambiar modo. Frontend importa de `tokens/cesium-styles.ts`:

```ts
import { cesiumThemeFor } from '../design/tokens/cesium-styles';

const visionMode = document.documentElement.dataset.visionMode;
const theme = cesiumThemeFor(visionMode);
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(theme.terrain);
// Update all entities to use theme.threat[classification]
```

---

## 7. Modo daltonismo + Night Vision combinados

NO se permite combinar. Si el operador activa Night Vision, el modo CUD se desactiva implícitamente (la paleta Night Vision ya es monocromática y compatible con todos los daltonismos por definición).

Si el operador requiere AMBAS adaptaciones, debe consultarse con el oficial médico militar — el caso es excepcional y suele requerir adaptación individual del puesto.
