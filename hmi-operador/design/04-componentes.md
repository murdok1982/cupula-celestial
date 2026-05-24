# 04 — Componentes

> Cada componente declara: **anatomía** (qué partes lo forman), **estados** (default, hover, focus, active, disabled, loading, error), **tokens** (qué variables CSS usa), **accesibilidad** (ARIA + keyboard), **variantes**, y **razón táctica** (por qué se diseña así).

---

## A. Primitivas (shadcn/ui base)

### A.1 Button

Variantes según criticidad de acción.

| Variante | Color de fondo | Texto | Uso | Atajo |
|---|---|---|---|---|
| `primary` | `accent-primary` (`#4D7BD8`) | `fg-inverse` | Acciones afirmativas no letales (guardar, autenticar) | `Enter` con foco |
| `engage` | `accent-engage` (`#E5484D`) | `#FFFFFF` | **Solo botón ENGAGE.** Letal | requiere doble-factor |
| `danger` | transparent + border `status-error` + texto `status-error` | — | Acciones destructivas no letales (cancelar engagement, eliminar geofence) | `Esc` no aplica |
| `secondary` | `bg-elevated` + border `border-default` | `fg-primary` | Acciones secundarias | — |
| `ghost` | transparent | `fg-secondary` | Acciones terciarias, en barras | — |
| `icon` | transparent | `fg-secondary` | Botón solo-icono 32×32 (cerrar, zoom, etc.) | Aria-label requerido |

**Anatomía:**

```
┌──────────────────────────────┐
│ [icon]  Texto del botón  [→] │   ← gap-2 entre icon, texto, trailing
└──────────────────────────────┘
   padding-x: space-4, padding-y: space-2
   height: 36 px (sm) / 40 px (md, default) / 48 px (lg) / 64 px (xl = engage)
   border-radius: radius-md (4 px)
```

**Estados:**

| Estado | Variant primary | Variant engage |
|---|---|---|
| `default` | bg `accent-primary` | bg `accent-engage` |
| `hover` | bg `accent-primary-hover`, transition 150ms | bg `accent-engage-hover` + `shadow-engage` |
| `focus-visible` | outline 2px `--border-focus`, offset 2px | outline 2px `#FFFFFF`, offset 2px |
| `active` | scale(0.98), 80ms | scale(0.98), 80ms |
| `disabled` | bg `bg-elevated`, fg `fg-tertiary`, cursor not-allowed | bg `#4A1B1D`, fg `fg-tertiary`, cursor not-allowed |
| `loading` | spinner mini 14px reemplaza icon trailing, texto inalterado | igual + texto "AUTORIZANDO..." |

**Tokens:**

- `padding`: `space-4` x, `space-2` y
- `font-size`: `text-base` (primary), `text-lg` (engage, uppercase)
- `font-weight`: 600 (primary), 700 (engage)
- `border-radius`: `radius-md`
- `transition`: 150ms ease-out (color, box-shadow)

**Accesibilidad:**

- `role="button"` implícito vía `<button>`.
- `aria-disabled="true"` cuando disabled.
- `aria-busy="true"` durante loading.
- Variante `icon` requiere `aria-label` siempre.
- Foco visible obligatorio.
- `Enter`/`Space` activan.

**Razón táctica:** el botón `engage` es la única variante con altura 64 px y texto uppercase, deliberadamente distinta del resto para que **sea imposible confundirlo con un botón normal**. Su estado focus añade `shadow-engage` (halo rojo) para reforzar criticidad.

---

### A.2 Input

| Variante | Uso |
|---|---|
| `text` | Notas operativas, búsqueda de tracks |
| `number` | Coordenadas manuales, altitudes, distancias |
| `password` | PIN del operador en login y reautenticación |
| `search` | Filtros de listas |

**Anatomía:**

```
┌─ Label (text-xs, fg-secondary) ────────────┐
│                                            │
│ ┌────────────────────────────────────────┐ │
│ │ [icon]  valor del input         [✗ ]  │ │   ← height 36 px (compact), 40 px standard
│ └────────────────────────────────────────┘ │
│   border: 1px var(--border-default)
│   border-radius: radius-sm (2 px)
│   padding: space-3 x, space-2 y
│                                            │
│ Helper / error (text-2xs, fg-tertiary o status-error)
└────────────────────────────────────────────┘
```

**Estados:**

| Estado | Borde | Background |
|---|---|---|
| `default` | `border-default` | `bg-surface` |
| `hover` | `border-strong` | `bg-elevated` |
| `focus` | `accent-primary` + ring `0 0 0 2px rgba(77,123,216,0.3)` | `bg-elevated` |
| `error` | `status-error` + ring `0 0 0 2px rgba(229,72,77,0.3)` | `bg-surface` |
| `disabled` | `border-subtle` | `bg-surface`, opacity 0.5 |

**Accesibilidad:**

- `<label>` siempre presente y vinculado por `htmlFor`.
- `aria-invalid="true"` cuando error.
- `aria-describedby` apuntando al helper/error message.
- Inputs numéricos: `inputMode="numeric"` + `pattern` cuando aplica.

---

### A.3 Card

```
┌─────────────────────────────────────────┐
│ Header (opcional)                       │  ← padding space-4
├─────────────────────────────────────────┤
│                                         │
│ Body                                    │  ← padding space-4
│                                         │
├─────────────────────────────────────────┤
│ Footer (opcional, acciones)             │  ← padding space-3 x, space-2 y
└─────────────────────────────────────────┘
  bg-surface, border 1px border-default, radius-md
```

Variantes:

- `default`: fondo `bg-surface`
- `interactive`: con hover (`bg-elevated`, cursor pointer, transition 150ms)
- `highlighted`: borde 1px `accent-primary`, fondo `bg-surface` — para track seleccionado
- `threat-hostile`: borde 1px `threat-hostile`, fondo `threat-hostile-bg`

---

### A.4 Badge

```
┌──────────────┐
│ ●  HOSTIL    │   ← height 18 px, padding space-1.5, text-2xs uppercase, weight 700
└──────────────┘
   radius-sm, border 1px del color de threat
```

Variantes (todas siguen `01-paleta.md` sección 2):

| Variante | bg | text |
|---|---|---|
| `hostile` | `threat-hostile-bg` | `threat-hostile` |
| `probable` | `threat-probable-bg` | `threat-probable` |
| `unknown` | `threat-unknown-bg` | `threat-unknown` |
| `friend` | `threat-friend-bg` | `threat-friend` |
| `civil` | `threat-civil-bg` | `threat-civil` |
| `success` | `status-success-bg` | `status-success` |
| `warning` | `status-warning-bg` | `status-warning` |
| `error` | `status-error-bg` | `status-error` |
| `neutral` | `bg-elevated` | `fg-secondary` |

**Accesibilidad:** badges con solo color añaden símbolo (●) al inicio. En modo CUD se añade glyph adicional.

---

### A.5 Dialog (Radix Dialog)

Base para `EngagementAuthDialog` y otros modales.

```
┌──── Backdrop (z-modal-backdrop, bg-overlay) ────┐
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  Header                          [✗]      │   │
│   ├──────────────────────────────────────────┤   │
│   │                                          │   │
│   │  Body                                    │   │
│   │                                          │   │
│   ├──────────────────────────────────────────┤   │
│   │  Footer: [Cancelar]    [Confirmar →]     │   │
│   └──────────────────────────────────────────┘   │
│      bg-surface, shadow-modal, radius-lg
│      min-width 480 px, max-width 720 px
│      padding: space-6
│                                                  │
└──────────────────────────────────────────────────┘
```

**Tokens:** ver tabla específica de EngagementAuthDialog abajo.

**Accesibilidad:**

- `role="dialog"`, `aria-modal="true"`.
- Foco se transfiere automáticamente al primer elemento focuseable.
- `Esc` cierra (excepto EngagementAuthDialog que requiere botón Cancelar explícito).
- Foco-trap.

---

### A.6 Tabs

Variante horizontal subrayada (no pills):

```
[ Tracks ] [ Engagements ] [ Interceptors ] [ Audit ]
─────────                                              ← underline 2px accent-primary en activa
```

- Texto `text-sm`, peso 500 default / 600 activa.
- Padding `space-3` x, `space-2` y.
- Hover: `bg-hover` debajo.
- Foco: `outline 2px accent-primary`.

---

### A.7 Tooltip

```
   ┌──────────────────────┐
   │ Texto del tooltip    │   ← bg #1A2129, border 1px border-strong, text-xs, padding space-2
   └──────────▽───────────┘
              │
        [elemento]
```

- Delay-show: **400 ms** (no instantáneo — evita molestar con hover involuntario).
- Delay-hide: **100 ms**.
- Side: top por defecto, ajustable.
- Animación: fade-in 100 ms (omitida si `prefers-reduced-motion`).

---

### A.8 ScrollArea (Radix)

Scrollbars custom de 8 px ancho, fondo transparent, thumb `border-strong` con hover `fg-tertiary`. Aplicado a:

- Lista de tracks.
- Aux panel.
- Lista de audit log.
- Listas dentro de modales largos.

---

### A.9 Alert

```
┌─────────────────────────────────────────────────┐
│ [icon]  Título de la alerta                     │   ← text-md, weight 700
│         Detalle del incidente, multilínea       │   ← text-sm, weight 400
│                                                 │
│         [Acción primaria]  [Descartar]           │
└─────────────────────────────────────────────────┘
   bg-{variant}-bg, border-left 4px var(--{variant}), padding space-4
```

Variantes: `info`, `success`, `warning`, `error`. Banner-style alerts (top-bar) usan el componente `AlertBanner` separado.

---

### A.10 Separator

Línea horizontal o vertical de 1 px, color `border-subtle`. Margin top/bottom space-3.

---

## B. Componentes específicos del HMI

### B.1 ThreatBadge

**Anatomía:**

```
┌────────────────────────────────┐
│ [SVG APP-6 16px]  HOSTIL  T-4471 │   ← height 24 px, gap space-2
└────────────────────────────────┘
   border 1px var(--threat-hostile), bg var(--threat-hostile-bg)
   padding space-2 x, space-1 y, radius-sm
```

**Partes:**

1. **Símbolo APP-6 SVG** (ver `05-simbologia-nato.md`). Dimensiones 16×16.
2. **Etiqueta de clasificación** uppercase, weight 700, color del threat.
3. **Track ID** opcional (mono, weight 500, color `fg-secondary`).

**Estados:**

| Estado | Tratamiento |
|---|---|
| `default` | Estático |
| `pulsing` (HOSTIL + activo) | Halo 0→8 px en color threat, 1.2 s, infinito; solo si NO `prefers-reduced-motion` |
| `selected` | Outline 2px `accent-mag` |

**Accesibilidad:**

- `role="status"` para el lector de pantalla.
- `aria-label="HOSTIL CONFIRMADO track T-4471"`.

**Razón táctica:** el badge combina **color + símbolo APP-6 + texto** = redundancia triple para no depender de ninguno solo bajo fatiga visual / daltonismo.

---

### B.2 TrackRow

Fila densa de la lista de tracks. Altura 36 px en compact, 40 px en standard.

**Anatomía:**

```
┌────────────────────────────────────────────────────────────────────────┐
│ [●H] T-4471  HOSTIL  Quad. táctico  40.4168,-3.7038  120 m  +04:18 ⚠  │
└────────────────────────────────────────────────────────────────────────┘
  │   │       │       │              │                  │      │       │
  │   │       │       │              │                  │      │       └─ Indicador atención
  │   │       │       │              │                  │      └─ TTI (mono, weight 600)
  │   │       │       │              │                  └─ Altitud (mono)
  │   │       │       │              └─ Coordenadas (mono)
  │   │       │       └─ Modelo de plataforma (sans, fg-secondary)
  │   │       └─ Badge clasificación
  │   └─ Track ID (mono, weight 500)
  └─ Indicador color + símbolo APP-6 16px
```

**Estados:**

| Estado | Tratamiento |
|---|---|
| `default` | bg transparent |
| `hover` | bg `bg-hover` (10 % azul claro) |
| `selected` | bg `bg-elevated`, border-left 3px `accent-mag` |
| `pulsing` (nuevo + hostil) | Borde left 3px pulsando 0→100 % opacity 1.5 s, máx 3 ciclos |
| `engaged` (en proceso de engagement activo) | Border-left 3px `accent-engage`, badge "EN ENGAGEMENT" |

**Accesibilidad:**

- `role="row"` dentro de un `role="grid"` parent.
- Navegación con flechas verticales.
- `Enter` selecciona y abre detalle en AuxPanel.
- `aria-selected="true"` cuando seleccionado.

**Razón táctica:** la fila combina información de alta cardinalidad (12+ datos) en 36 px de alto sin scrolleable horizontal. La distancia inter-data está calibrada a la sacada media de un operador entrenado (~3°).

---

### B.3 RecommendationCard

Card que muestra una recomendación del LLM táctico (Llama-3.1-8B fine-tuned). Aparece en AuxPanel cuando se selecciona un track con recomendación pendiente.

**Anatomía:**

```
┌─────────────────────────────────────────────┐
│ [icon LLM] RECOMENDACIÓN            T-4471  │   ← header: text-xs uppercase, weight 600
├─────────────────────────────────────────────┤
│                                             │
│  ENGAGE                                     │   ← acción: text-2xl, weight 700, color por tipo
│                                             │
│  Interceptores propuestos:                  │
│  I-12, I-19                                 │   ← mono
│                                             │
│  Ventana de engagement:                     │
│  0 ms — 4 200 ms                            │
│                                             │
│  ┌─────────────┐  ┌─────────────┐           │
│  │ Pk: 89.0 %  │  │ Riesgo: BAJO│           │   ← KPI mini-cards
│  └─────────────┘  └─────────────┘           │
│                                             │
│  Justificación:                             │
│  "Trayectoria balística hacia activo        │
│   crítico C-3. Sin amigos en línea de       │
│   fuego. ROE-7 permite engagement           │
│   automático."                              │
│                                             │
│  Nivel de autorización: OPS-OFFICER         │
│                                             │
├─────────────────────────────────────────────┤
│  [✗ Rechazar]            [→ AUTORIZAR]      │   ← footer: botones
└─────────────────────────────────────────────┘
  bg-surface, border-left 4px del color del threat
```

**Variantes (color de borde izquierdo):**

- Recomendación `ENGAGE` sobre `HOSTIL_CONFIRMADO` → border-left `accent-engage`
- Recomendación `MONITOR` sobre `AMENAZA_PROBABLE` → border-left `status-warning`
- Recomendación `IGNORE` sobre `DESCONOCIDO/CIVIL` → border-left `fg-tertiary`
- Recomendación `INVESTIGATE` sobre `DESCONOCIDO` → border-left `threat-unknown`

**Estados:**

| Estado | Tratamiento |
|---|---|
| `pending` | Default |
| `loading` (LLM aún calculando) | Skeleton, texto "Analizando con LLM táctico..." |
| `accepted` | Banner verde top "Autorización iniciada" → transición a EngagementAuthDialog |
| `rejected` | Card colapsada, texto "Recomendación rechazada por operador" + razón |
| `stale` | Si > 30 s desde generación → badge "OBSOLETA" + acción "Regenerar" |

**Razón táctica:** la jerarquía visual prioriza la **acción recomendada (text-2xl)** y los KPI **Pk + riesgo colateral** como las dos métricas que pesan en la decisión humana. La justificación del LLM se muestra completa, sin truncar, porque la trazabilidad del razonamiento es obligatoria por DIH.

---

### B.4 EngagementAuthDialog

Modal bloqueante para autorización letal. Doble factor visual + funcional.

**Anatomía:**

```
┌─────────────────────────────────────────────────────────┐
│ ⚠ AUTORIZACIÓN DE ENGAGEMENT             [✗ Cancelar]   │
│   Esta acción es letal e irreversible.                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Objetivo:    T-4471  ●  HOSTIL_CONFIRMADO              │
│  Tipo:        UAV cuadricóptero, payload sospechoso     │
│  Coordenadas: 40.416775°N, -3.703790°W                  │
│  Altitud:     120 m                                     │
│  TTI:         +04:18                                    │
│                                                         │
│  Interceptores:  I-12 (Pk 0.87), I-19 (Pk 0.92)         │
│  Pk combinada:   0.89                                   │
│  Riesgo colateral: BAJO                                 │
│  ROE aplicable:  ROE-7 (engagement autorizado)          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Resumen del LLM:                                 │   │
│  │ "Trayectoria balística hacia activo crítico..."  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Doble factor:                                          │
│                                                         │
│  PIN operador:    [● ● ● ● ● ●]                         │
│  Token FIDO2:     [⬤ Detectando token físico... ]       │
│  Huella biom.:    [⬤ Esperando lectura... ]             │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │       Ventana de autorización: 00:23 / 00:30     │   │   ← countdown grande
│  └──────────────────────────────────────────────────┘   │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Abortar]                              [AUTORIZAR →]   │
└─────────────────────────────────────────────────────────┘
   bg-surface, border 2px accent-engage, shadow-modal
   min-width 600 px, max-width 800 px
```

**Estados del flujo:**

1. `pending` — esperando los 3 factores
2. `validating` — los 3 factores OK, contactando HSM para firma
3. `authorized` — engagement enviado, dialog se cierra con toast "Engagement autorizado" + banner inferior
4. `denied` — algún factor falló, mensaje específico, contador no resetea
5. `expired` — timeout: dialog se cierra automáticamente con banner "Ventana de autorización expirada"
6. `aborted` — operador presionó Abortar, dialog se cierra con confirmación

**Reglas:**

- El modal **no se cierra con Esc** (excepción a regla general). Requiere botón Abortar explícito.
- El contador descendente es **visualmente prominente** (text-3xl mono tabular).
- En los últimos 5 segundos, el contador pasa a `pulsing` en `accent-engage`.
- El botón AUTORIZAR está **disabled hasta que los 3 factores son OK**.
- El backdrop NO permite click-through.

**Accesibilidad:**

- `role="alertdialog"` (no solo "dialog" — para forzar lectura de pantalla).
- `aria-modal="true"`, `aria-labelledby`, `aria-describedby`.
- Foco-trap obligatorio.
- Contador anunciado cada 10 s vía `aria-live="polite"`; últimos 5 s `aria-live="assertive"`.

**Razón táctica:** la doble redundancia (3 factores físicos + ventana temporal) implementa MHC obligatorio. La ventana de 30 s previene "autorización por inercia" — si el operador no actúa con intencionalidad, expira.

---

### B.5 AlertBanner

Banner persistente top de pantalla. 4 niveles de severidad.

**Anatomía:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠  SATURACIÓN INMINENTE        18 tracks no asignados   [Ver]  [✗] │
└─────────────────────────────────────────────────────────────────────┘
   altura 40 px, padding space-4 x, bg de la severidad
```

| Nivel | bg | border | icono | Usado para |
|---|---|---|---|---|
| `info` | `status-info-bg` | border-bottom 2px `status-info` | ℹ | Modo simulación activo, mantenimiento programado |
| `warning` | `status-warning-bg` | border-bottom 2px `status-warning` | ⚠ | Saturación cercana, batería interceptor baja, latencia alta |
| `critical` | `status-error-bg` | border-bottom 2px `status-error` | ⚠ | Comms loss, saturación severa, sensor radar caído |
| `defcon-up` | `defcon-1-bg` (`rgba(229,72,77,0.18)`) | border-bottom 2px `defcon-1` + pulse 2 ciclos | ⚠ | Subida de DEFCON, intrusión confirmada masiva |

**Razón táctica:** los banners se acumulan apilados verticalmente (máximo 3 visibles). Por encima de 3 → drawer "Más alertas (n)" expandible. NO usar toasts efímeros para estos eventos.

---

### B.6 DefconIndicator

Indicador en StatusBar y en banner DEFCON (cuando cambia).

**Anatomía:**

```
┌────────────────┐
│ DEFCON 3       │   ← bg color del DEFCON, text-md, weight 700, uppercase
│ ELEVATED       │   ← text-2xs, weight 500
└────────────────┘
   padding space-2, radius-sm
```

**Estados:**

- Cambio de nivel: animación de cross-fade 200 ms entre colores.
- DEFCON 1: pulse en el borde, 1 ciclo de 2 s.

**Accesibilidad:**

- `role="status"`, `aria-live="polite"`.
- Cambios anuncian "DEFCON cambiado a nivel 3, ELEVATED".

---

### B.7 InterceptorStatus

Card de interceptor desplegado en panel `InterceptorsPage` o aux side.

**Anatomía:**

```
┌──────────────────────────────────┐
│ I-12  Interceptor Alpha          │   ← header
│ [▮▮▮▮▮▮▮▯▯▯] 73 %  ↑ 120 m       │   ← batería + altitud
│ Lat: 40.4168°N, Lon: -3.7038°W   │
│ Estado: [EN RUTA T-4471]         │   ← badge
│                                  │
│ [Reasignar]  [Retornar]  [Abort] │
└──────────────────────────────────┘
   bg-surface, border-left 4px del estado (cyan en ruta, verde idle, ámbar baja batería, rojo problema)
```

**Variantes según estado:**

- `idle` → border `status-success`
- `enroute` → border `accent-cyan`
- `engaged` → border `accent-engage` + pulse
- `low-battery` → border `status-warning`
- `comms-lost` → border `status-error`, badge "COMMS LOST"
- `recovered` → border `fg-tertiary`

---

### B.8 VideoFeed

Canvas WebRTC con overlay HUD militar.

**Anatomía:**

```
┌──────────────────────────────────────┐
│                                      │   ← canvas video
│  I-12  /  T-4471  /  EO  4.2 km     │   ← HUD top: source, target, sensor, range (mono tabular)
│                                      │
│              ┼ crosshair            │   ← cross-hair lock-target
│                                      │
│                                      │
│  ALT 120 m  HDG 087°  SPD 18 kt     │   ← HUD bottom
│                                      │
│  ● REC 14:32:18Z                    │   ← record indicator
└──────────────────────────────────────┘
   bg-base, border 1px border-default
```

- HUD textos sobre `rgba(0,0,0,0.5)` con border-bottom de color cyan según sensor (EO=cyan, IR=ámbar, radar=verde).
- Crosshair: 24 px, color `accent-cyan` cuando target lock OK, `status-warning` cuando perdido.
- Sin scrollbar, sin controles play/pause (es feed live).

---

### B.9 NatoSymbol

Renderiza un símbolo OTAN APP-6D a partir de un SIDC de 15 caracteres. Ver `05-simbologia-nato.md`.

**Anatomía:**

- SVG generado por `milsymbol` (librería npm).
- Tamaños estandarizados: 16, 24, 32, 48 px.
- Outline 1px sobre el color del threat.

**Props:**

```ts
<NatoSymbol sidc="SHAP-----------" size={32} />
```

---

### B.10 MapControls

Controles flotantes sobre el canvas Cesium.

```
Top-left:    [Capas ▾]  [3D / 2D]  [Coord WGS84 ▾]
Top-right:   Coord cursor: 40.4168°N, -3.7038°W  / Alt: 230 m AGL
Bottom-left: [+] [-]  [⌖ slew-to-cue]  [⌂ home]
Bottom-right: [▣ mini-radar]
```

- Cada grupo en card translúcida `bg-surface/85 backdrop-blur-sm`, padding space-2.
- Slew-to-cue lleva cámara al track seleccionado en 800 ms (Cesium camera tween).

---

### B.11 StatusBar

Barra inferior siempre visible, 32 px alto.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ● Online · WS 28ms · API 12ms │ Op: J.GARCÍA │ Sensores: 4/4 │ DEFCON 3 │ 14:32:18 Z │
└──────────────────────────────────────────────────────────────────────────────┘
   bg-surface, border-top 1px border-default
```

**Segmentos (de izq. a der.):**

1. **Estado conexión**: dot color (`status-success` / `status-warning` / `status-error`) + "Online" / "Degraded" / "Offline" + latencia WS + latencia REST.
2. **Operador autenticado**: rol + iniciales del operador.
3. **Sensores activos**: contador "4/4" con color verde / ámbar / rojo según ratio.
4. **DEFCON**: ver `DefconIndicator`.
5. **Hora Zulu**: HH:MM:SS Z, mono tabular, actualización 1 Hz.

**Separadores:** `│` (border vertical 1px `border-default`).

Hover sobre segmento → tooltip con detalle (e.g., hover sobre WS muestra historia de últimos 60 s).

---

### B.12 AppShell

Layout maestro. Ver `03-espaciado-grid.md` sección 5.

Compuesto por:

- `Header` (40 px)
- `SideNav` (64 px colapsado / 240 px expandido)
- `MainView` (flex 1)
- `AuxPanel` (360 px colapsable)
- `StatusBar` (32 px)

**Accesibilidad:**

- Skip-links: "Saltar a vista principal", "Saltar a panel auxiliar".
- Landmarks ARIA: `header`, `nav`, `main`, `aside`, `footer` (StatusBar).

---

## C. Resumen de matriz de uso

| Componente | Pantalla(s) | Ubicación |
|---|---|---|
| `Button` | Todas | Toda UI |
| `Input` | Login, Settings, Filters, EngagementAuthDialog | — |
| `Card` | Todas | — |
| `Badge` | Threat list, Track detail, Filters | — |
| `Dialog` | EngagementAuth, Confirm, Settings advanced | — |
| `Tabs` | TrackListPage, AuditLogPage | — |
| `Tooltip` | Toda UI con datos abreviados | — |
| `ScrollArea` | Lista tracks, AuxPanel | — |
| `Alert` | Notificaciones inline | — |
| `Separator` | Card sections, footer | — |
| `ThreatBadge` | TrackRow, AuxPanel header, map overlay label | — |
| `TrackRow` | TrackListPage main, aux pinned tracks | — |
| `RecommendationCard` | AuxPanel cuando track seleccionado | — |
| `EngagementAuthDialog` | Global, modal flotante | — |
| `AlertBanner` | Top de pantalla, encima Header | — |
| `DefconIndicator` | StatusBar, banner DEFCON change | — |
| `InterceptorStatus` | InterceptorsPage, aux side cuando interceptor seleccionado | — |
| `VideoFeed` | DashboardPage grid, InterceptorsPage detail | — |
| `NatoSymbol` | ThreatBadge, TrackRow, mapa Cesium entities | — |
| `MapControls` | DashboardPage overlay sobre Cesium | — |
| `StatusBar` | AppShell footer fijo | — |
