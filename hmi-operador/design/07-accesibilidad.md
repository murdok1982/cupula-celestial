# 07 — Accesibilidad

> El HMI cumple **WCAG 2.1 nivel AA mínimo** y aspira a **AAA en datos críticos de engagement**. Adicionalmente cumple **MIL-STD-1472** (Human Engineering, Design Criteria for Military Systems) en lo relevante a interfaces gráficas.

---

## 1. Contraste

| Caso | Mínimo WCAG | Mínimo Cúpula Celestial |
|---|---|---|
| Texto normal (< 18 pt regular / 14 pt bold) | 4.5:1 (AA) | 7:1 (AAA) en datos de track / engagement |
| Texto grande (≥ 18 pt regular / 14 pt bold) | 3:1 (AA) | 4.5:1 |
| Componentes UI (bordes, focus ring) | 3:1 | 3:1 |
| Iconos funcionales (no decorativos) | 3:1 | 3:1 |

**Verificación:** ver `audit/contrast-check.md` con la matriz completa de pares fg/bg verificados con WebAIM Contrast Checker.

---

## 2. Información no transmitida solo por color

Reforma cada componente para asegurar **redundancia color + símbolo + texto** o al menos color + texto:

| Componente | Redundancia |
|---|---|
| `ThreatBadge` | Color + símbolo APP-6 + etiqueta uppercase |
| `TrackRow` | Color de borde-left + dot color + texto badge + símbolo APP-6 |
| `AlertBanner` | Color borde + icono + texto |
| `Status dot conexión` | Color + texto "Online" / "Degraded" / "Offline" |
| `Battery level interceptor` | Color + porcentaje numérico + icono `BatteryFull/Medium/Low` |
| `DEFCON badge` | Color + número + etiqueta texto |
| Cesium tracks | Color + símbolo APP-6 SIDC + label con ID |

**Test rápido:** convertir mockup a escala de grises → todo dato crítico sigue legible.

---

## 3. Foco visible

Outline siempre visible con:

```css
*:focus-visible {
  outline: 2px solid var(--border-focus); /* #4D7BD8 */
  outline-offset: 2px;
}

[data-vision-mode='night-vision'] *:focus-visible {
  outline-color: #FF6B6B;
}
```

**Excepción:** botón `engage` en focus añade `shadow-engage` adicional para indicar criticidad.

**Nunca** se usa `outline: none` sin reemplazo visual equivalente.

---

## 4. Navegación por teclado

### 4.1 Atajos globales (siempre disponibles)

| Atajo | Acción |
|---|---|
| `Tab` / `Shift+Tab` | Navegación natural |
| `Esc` | Cerrar modal NO crítico, cancelar acción |
| `Ctrl+K` | Abrir command palette (búsqueda rápida tracks/comandos) |
| `Ctrl+B` | Toggle SideNav |
| `Ctrl+]` | Toggle AuxPanel |
| `Ctrl+Shift+M` | Cambiar modo visual (cycle Tactical → Night Vision → CUD) |
| `Ctrl+Shift+D` | Cambiar densidad (cycle Compact → Standard → Relaxed) |
| `Ctrl+1..7` | Saltar a pantalla 1..7 (Dashboard, Tracks, Engagements, Interceptors, Audit, Simulator, Settings) |
| `?` | Mostrar overlay de atajos |
| `Ctrl+L` | Bloquear sesión (requiere reauth) |

### 4.2 Atajos contextuales — Dashboard / Map

| Atajo | Acción |
|---|---|
| `Flechas` (en lista de tracks) | Navegar entre tracks |
| `Enter` | Seleccionar track / autorizar acción focuseada |
| `Space` | Toggle pin track |
| `+` / `-` | Zoom mapa |
| `0` | Reset cámara |
| `S` | Slew-to-cue track seleccionado |
| `H` | Toggle HUD overlay |
| `M` | Toggle mini-radar |
| `L` | Abrir panel de capas |

### 4.3 Atajos críticos — Engagement

| Atajo | Acción |
|---|---|
| `Ctrl+E` (en track hostil seleccionado) | Abrir EngagementAuthDialog |
| `Ctrl+Shift+A` | Abortar engagement activo |
| `Ctrl+Shift+R` | Reasignar interceptor |

> **Importante:** los atajos críticos (Engagement, Abort) **requieren modifier Ctrl+Shift** para prevenir activación accidental.

---

## 5. ARIA — guidelines

### 5.1 Landmarks

```html
<header role="banner">           ← App header
<nav role="navigation">          ← SideNav
<main role="main">               ← Vista principal
<aside role="complementary">     ← AuxPanel
<footer role="contentinfo">      ← StatusBar
```

### 5.2 Live regions

| Región | Tipo | Uso |
|---|---|---|
| Lista de tracks nuevos | `aria-live="polite"` | Nuevo track detectado → "Nuevo track T-4472, AMENAZA_PROBABLE" |
| EngagementAuthDialog countdown | `aria-live="assertive"` | últimos 5s del timer |
| AlertBanner crítico | `aria-live="assertive"` | Saturación, comms loss |
| Status bar metric changes | `aria-live="off"` (cambian demasiado frecuente, no anunciar) | — |
| Toast confirmación | `aria-live="polite"` | "Engagement autorizado para T-4471" |

### 5.3 Roles específicos

- Tabs: `role="tablist"` + `role="tab"` + `role="tabpanel"`.
- Lista de tracks: `role="grid"` (no `list` porque cada row tiene columnas).
- Modales críticos: `role="alertdialog"` (no solo `dialog`).
- Status dots: `role="status"`.
- Badges semánticos: `role="img"` con `aria-label`.

### 5.4 Labels

- TODO botón `icon` tiene `aria-label`.
- TODO input tiene `<label>` asociado.
- TODO icono significativo tiene `aria-label` o el texto adyacente lo describe (en cuyo caso `aria-hidden="true"` en el icono para no duplicar).

---

## 6. MIL-STD-1472 — aplicación

Apartados relevantes (resumidos):

### 6.1 Sección 5.2 — visualización

| Requisito | Implementación |
|---|---|
| Carácter mínimo: 16 minutos de arco | A 60 cm de visión y monitor 4K 32", 12 px ≈ 17 minutos. **OK**. |
| Brillo monitor configurable | Frontend respeta brillo del sistema operativo + ofrece modo Night Vision |
| Resaltado por color: no único método | Cumplido (sección 2 de este doc) |
| Densidad de información: ≤ 25 % saturación con datos críticos | Cumplido por jerarquía visual de 3 niveles (ver `00-principios.md`) |

### 6.2 Sección 5.3 — controles

| Requisito | Implementación |
|---|---|
| Áreas de toque ≥ 19×19 mm para tablet | Botones default 40 px ≈ 10 mm en monitor 4K; en tablet táctica 1024×768 pasamos a densidad STANDARD donde alcanzan 50 px |
| Confirmación obligatoria para acciones críticas | EngagementAuthDialog con doble factor |
| Tiempo de respuesta < 200 ms | Microinteracciones todas ≤ 200 ms |

### 6.3 Sección 5.4 — alarmas

| Requisito | Implementación |
|---|---|
| Alarmas audibles distintivas | Beep mil-spec corto 800 Hz para hostil nuevo; 1200 Hz para confirmación; 400 Hz para comms loss |
| Persistencia visual hasta acción del operador | Banners no se auto-cierran (excepción: success toast 3 s) |
| Volumen configurable + silenciable con confirmación | StatusBar tiene icon `Volume2`/`VolumeX` |

---

## 7. Sin barreras motoras

- Todos los flujos críticos completables con teclado solo.
- Drag-and-drop **NUNCA** es el único método para una acción (alternativa siempre por menú o atajo).
- Click targets mínimos: **44×44 px** en cualquier elemento accionable (excepto filas densas que tienen 36 px alto pero ancho completo).
- Hover-only información: siempre disponible también por click (tooltips se muestran al focus también).

---

## 8. Daltonismo (modo CUD)

Activable en `Settings > Pantalla > Modo Visual > Color-blind safe`. Ver `08-modos-visuales.md` sección 3.

En este modo:

- Paleta sustituida por Okabe & Ito.
- Todos los componentes añaden un símbolo geométrico complementario al color.
- Test de validación: pasar todas las pantallas por simulador `colorblindly` para protanopia, deuteranopia y tritanopia → todo dato sigue distinguible.

---

## 9. Tamaño de fuente ajustable

`Settings > Pantalla > Tamaño tipográfico`: 4 escalones.

| Escalón | Multiplicador | Equivalente body |
|---|---|---|
| `compact` (defecto) | × 1.00 | 14 px body |
| `standard` | × 1.15 | 16 px body |
| `relaxed` | × 1.30 | 18 px body |
| `xlarge` | × 1.50 | 21 px body |

Implementación: variable CSS `--font-scale` en `<html>`, todos los `text-*` usan `font-size: calc(VAR * var(--font-scale))`.

---

## 10. Reducción de movimiento

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Excepciones (mantienen animación incluso con reduced-motion):

- **Countdown del EngagementAuthDialog** (sigue su tic visible — sin él la información se pierde).
- **DEFCON pulse en cambio de nivel** (1 ciclo único — es información, no decoración).

---

## 11. Lectura de pantalla — testing

| Lector | Validado en |
|---|---|
| NVDA (Windows) | Login, Dashboard, EngagementAuthDialog |
| JAWS (Windows) | Igual |
| VoiceOver (macOS) | Solo developer testing, no producción |
| Orca (Linux) | Si despliegue futuro en estaciones Linux militares |

Comando del operador para silenciar lector durante engagement (evita interferencia con audio mil-spec): `Ctrl+Shift+Q`.

---

## 12. Validación recurrente

Frontend implementa en CI:

- `axe-core` automático en pruebas e2e (Playwright).
- Lighthouse accessibility audit en build → fail si score < 95.
- Linter `eslint-plugin-jsx-a11y` con regla `strict`.

Cualquier PR que reduzca contraste o introduzca `outline: none` se bloquea.
