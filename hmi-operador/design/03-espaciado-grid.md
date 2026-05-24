# 03 — Espaciado y Grid

> Densidad informativa militar sin claustrofobia visual. Sistema de 4 px alineado pixel-perfect en monitores 4K.

---

## 1. Escala de espaciado (base 4 px)

| Token | px | rem | Uso principal |
|---|---|---|---|
| `space-0` | 0 | 0 | Sin separación |
| `space-px` | 1 | — | Borde 1 px exacto |
| `space-0.5` | 2 | 0.125 | Separación interna de íconos compactos |
| `space-1` | 4 | 0.25 | Gap entre etiqueta y valor inline |
| `space-1.5` | 6 | 0.375 | Espacio interno de badges |
| `space-2` | 8 | 0.5 | Gap entre íconos de StatusBar |
| `space-3` | 12 | 0.75 | Padding interno de TrackRow |
| `space-4` | 16 | 1.0 | Padding por defecto de cards y paneles |
| `space-5` | 20 | 1.25 | Gap entre cards en columna |
| `space-6` | 24 | 1.5 | Padding mayor de modales y formularios |
| `space-8` | 32 | 2.0 | Margen alrededor de grupos en formulario |
| `space-10` | 40 | 2.5 | Separación entre secciones mayores de modal |
| `space-12` | 48 | 3.0 | Espacio top de header de pantalla |
| `space-16` | 64 | 4.0 | Solo en pantalla Login (vacío contextual) |

**Razón táctica:** la base 4 px alinea con la grid de pixel exacta de monitores 4K (3840×2160 → divisor entero). Se omite la escala 28 / 36 px porque introduce inconsistencia visual en agrupaciones de bordes.

---

## 2. Densidad togglable

El operador puede cambiar densidad en `Settings > Pantalla`. Las tres densidades modifican los tokens de padding/gap por escala uniforme:

| Densidad | Multiplicador | Para usuario |
|---|---|---|
| **COMPACT** | × 1.0 (defecto militar) | Operador en sala de operaciones con monitor 27"+ |
| **STANDARD** | × 1.25 | Operador en tablet táctica 10" |
| **RELAXED** | × 1.5 | Modo entrenamiento, monitor pequeño, fatiga visual extrema |

Implementación: una clase raíz `[data-density='compact'|'standard'|'relaxed']` cambia las variables CSS:

```css
[data-density='compact']  { --density-multiplier: 1.0; }
[data-density='standard'] { --density-multiplier: 1.25; }
[data-density='relaxed']  { --density-multiplier: 1.5; }

.card-padding { padding: calc(var(--space-4) * var(--density-multiplier)); }
```

> **Decisión:** Tailwind no aplica el multiplicador de forma automática. Frontend debe crear utilities personalizadas en `src/styles/utilities.css` que respeten el multiplicador. Lo más simple: las clases `p-card`, `p-panel`, `gap-row` etc. en lugar de `p-4`.

---

## 3. Breakpoints

| Token | Min-width | Uso |
|---|---|---|
| `bp-tablet` | 1024 px | Tablet táctica (Panasonic Toughpad, etc.) |
| `bp-secondary` | 1280 px | Monitor secundario de operador |
| `bp-workstation` | 1920 px | **Defecto.** Estación principal del operador |
| `bp-quad` | 2560 px | Monitor 27" QHD |
| `bp-4k` | 3840 px | Monitor 4K 32"+ |

**Decisión:** la web del HMI **no soporta móvil**. Por debajo de 1024 px se muestra una pantalla `LowResolutionWarning` con texto:

> "Esta interfaz requiere una resolución mínima de 1024×768. Consulte con su administrador para acceso desde tablet táctica certificada."

No hay versión móvil porque el operador en campo no autoriza engagements desde móvil — es contrario a doctrina de MHC.

---

## 4. Sistema de grid

Grid de **12 columnas** con gutter variable según densidad:

| Densidad | Gutter | Margin lateral |
|---|---|---|
| Compact | 12 px | 16 px |
| Standard | 16 px | 24 px |
| Relaxed | 20 px | 32 px |

Container max-width: **`none`** (full width). El HMI es una aplicación de pantalla completa, no un documento centrado.

---

## 5. Layout maestro — AppShell

```
┌──────────────────────────────────────────────────────────────────┐
│                       HEADER (40 px alto)                        │  ← title + user + DEFCON badge
├────────┬────────────────────────────────────────────┬────────────┤
│        │                                            │            │
│ SIDE   │             MAIN VIEW                      │  AUX PANEL │
│ NAV    │  (mapa Cesium / lista tracks /             │ (recomenda │
│        │   feeds vídeo / etc.)                      │  ción LLM, │
│ 64 px  │                                            │  detalle)  │
│        │                                            │            │
│        │                                            │  360 px    │
│        │                                            │            │
├────────┴────────────────────────────────────────────┴────────────┤
│                    STATUS BAR (32 px alto)                       │  ← WS, latencia, hora Zulu, sensores
└──────────────────────────────────────────────────────────────────┘
```

| Zona | Dimensión | Notas |
|---|---|---|
| Header | altura **40 px** (compact), 48 px (standard), 56 px (relaxed) | Logo cúpula + título de pantalla + perfil + DEFCON |
| SideNav | ancho **64 px** colapsado, 240 px expandido | Iconos verticales con tooltip; expansión sticky |
| Main view | flex 1 | Vista principal de cada pantalla |
| AuxPanel | ancho **360 px** fijo (collapsible) | Contexto del item seleccionado (recomendación LLM, ficha técnica) |
| Status bar | altura **32 px** | Compactísima, números siempre legibles |

**Reglas:**

- El header y la status bar **NUNCA se ocultan** (excepto en modo "presentación" para briefing, opt-in explícito).
- El sidenav se puede colapsar con `Ctrl+B`.
- El AuxPanel se puede colapsar con `Ctrl+]`.
- El layout es fijo: el operador puede colapsar paneles, no reorganizarlos. Esto previene errores de configuración accidental.

---

## 6. Z-index — escala

| Token | Valor | Uso |
|---|---|---|
| `z-base` | 0 | Capa por defecto |
| `z-map` | 1 | Cesium canvas |
| `z-map-overlay` | 10 | Overlays sobre mapa (HUD, leader-line labels) |
| `z-panel` | 100 | Paneles laterales y aux |
| `z-header` | 200 | Header sticky |
| `z-statusbar` | 200 | Status bar (mismo nivel header) |
| `z-dropdown` | 500 | Menús desplegables |
| `z-tooltip` | 800 | Tooltips |
| `z-modal-backdrop` | 1000 | Backdrop modales |
| `z-modal` | 1010 | Modal content |
| `z-toast` | 1100 | Toasts (en HMI casi no se usan; solo confirmaciones técnicas) |
| `z-critical-banner` | 1200 | Banner DEFCON 1 / saturación / comms loss (encima de modales) |

---

## 7. Border radius

Sobriedad militar = esquinas mínimas. Nunca pills.

| Token | px | Uso |
|---|---|---|
| `radius-none` | 0 | Status bar, banners DEFCON, paneles maestros |
| `radius-sm` | 2 | Badges, inputs |
| `radius-md` | 4 | Botones, cards |
| `radius-lg` | 6 | Modales, dropdowns elevados |
| `radius-full` | 9999 | **Solo** indicadores circulares de track en lista (punto de color) |

**Decisión consciente:** los botones tienen `radius-md` (4 px), no más. Botones redondeados (8 px+) sugieren consumer SaaS y reducen la sensación de criticidad.

---

## 8. Sombras

Las sombras se reservan para indicar elevación / urgencia.

| Token | Valor | Uso |
|---|---|---|
| `shadow-none` | `none` | Layout base — sin sombra |
| `shadow-panel` | `0 1px 0 0 var(--border-default)` | Línea bajo paneles (simula elevación 1 dp) |
| `shadow-card` | `0 2px 4px rgba(0,0,0,0.3)` | Cards activas o seleccionadas |
| `shadow-modal` | `0 10px 32px rgba(0,0,0,0.6)` | Modal flotante |
| `shadow-engage` | `0 0 0 2px rgba(229,72,77,0.45), 0 0 16px rgba(229,72,77,0.35)` | Botón ENGAGE en focus / hover, anillo de urgencia |
| `shadow-focus` | `0 0 0 2px var(--accent-primary)` | Foco accesible |

---

## 9. Aplicación de la grid en Cesium

Cesium canvas es full-bleed dentro de Main view. Los overlays sobre el mapa (HUD de coordenadas, mini-radar) siguen el sistema 4 px:

```
Cesium canvas (relative)
├── HUD coords (absolute, top: 16, right: 16, p-3)
├── Mini-radar (absolute, bottom: 16, right: 16, w-240 h-240)
├── Camera controls (absolute, bottom: 16, left: 16, gap: 8)
└── Layer toggle (absolute, top: 16, left: 16, p-2)
```

Todos los overlays usan `bg-bg-surface/85` con `backdrop-blur-sm` y border 1 px.
