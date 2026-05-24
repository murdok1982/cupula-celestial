# 02 — Tipografía

> La tipografía soporta tres ejes: legibilidad bajo fatiga visual, densidad informativa, y numerales tabulares perfectos para telemetría.

---

## 1. Familias tipográficas

| Rol | Familia primaria | Fallback | Uso |
|---|---|---|---|
| **Mono operacional** | `JetBrains Mono` | `"Berkeley Mono", "IBM Plex Mono", Consolas, monospace` | Track IDs, coordenadas, telemetría, código JSON del LLM, hashes de auditoría |
| **Sans operativo** | `Inter Tight` | `"IBM Plex Sans", "Inter", system-ui, sans-serif` | Toda UI general (labels, botones, body) |
| **Sans display** | `IBM Plex Sans Condensed` | `"Inter Tight", "Arial Narrow", sans-serif` | Titulares de alerta, headers de panel, banners DEFCON |

### Razones tácticas

- **JetBrains Mono** tiene **diferenciación clara entre 0/O, 1/l/I, 8/B** — crítico para leer coordenadas WGS84 y track IDs (formato `T-####` o `T-####-##`). Glyphs amplios para fatiga ocular.
- **Inter Tight** ofrece un x-height alto y formas geométricas que son legibles a 11 px en monitores 4K densos sin el peso visual de Inter regular. Es la fuente operativa por defecto.
- **IBM Plex Sans Condensed** comprime horizontalmente los headers para maximizar uso de barras de panel sin perder peso visual. Su diseño nace en contextos de ingeniería (IBM) y mantiene autoridad sin decoración.

### Cargas

Las fuentes se sirven autohospedadas (no Google Fonts CDN) por requisito de soberanía y operación offline. Ver `hmi-operador/public/fonts/` (Frontend gestiona).

---

## 2. Escala tipográfica

Escala fija de 9 tamaños. **No se usan tamaños fuera de esta escala.**

| Token | px | rem | Line-height | Letter-spacing | Uso recomendado |
|---|---|---|---|---|---|
| `text-2xs` | 11 | 0.6875 | 14 px (1.27) | +0.02em | Metadatos terciarios: timestamps secundarios, etiquetas APP-6 sobre el mapa, hash de log abreviado |
| `text-xs` | 12 | 0.75 | 16 px (1.33) | +0.01em | Labels de inputs, badges, captions de cards |
| `text-sm` | 13 | 0.8125 | 18 px (1.38) | 0 | Cuerpo en filas densas (TrackRow, listas) |
| `text-base` | 14 | 0.875 | 20 px (1.43) | 0 | UI por defecto, botones secundarios, body de cards |
| `text-md` | 16 | 1.0 | 24 px (1.5) | 0 | Texto destacado dentro de cards, labels de modal |
| `text-lg` | 18 | 1.125 | 26 px (1.44) | -0.005em | Botones primarios, títulos de panel |
| `text-xl` | 20 | 1.25 | 28 px (1.4) | -0.01em | Botón ENGAGE, contadores grandes |
| `text-2xl` | 24 | 1.5 | 32 px (1.33) | -0.015em | Headers de pantalla, número DEFCON |
| `text-3xl` | 32 | 2.0 | 40 px (1.25) | -0.02em | Alerta crítica, número de amenazas activas |

**Razón táctica:** la escala omite el 15 px y el 28 px porque generan confusión visual con vecinos en monitores densos. Los saltos son perceptibles a 60 cm de distancia.

---

## 3. Pesos tipográficos

| Peso | Valor | Uso |
|---|---|---|
| Regular | 400 | Cuerpo, texto secundario |
| Medium | 500 | Énfasis suave, números importantes |
| Semibold | 600 | Botones primarios, labels críticos, encabezados de tabla |
| Bold | 700 | Headers de panel, badges de threat |
| ExtraBold | 800 | Solo DEFCON 1 banner y contador grande de alertas activas |

**Razón táctica:** se evita el `Light` (300) y el `Thin` (200) porque son ilegibles en fatiga visual y a distancia. El peso mínimo en producción es 400.

---

## 4. Numerales tabulares — OBLIGATORIO

**Todo dato numérico operativo usa numerales tabulares.** Esto previene "saltos" de la columna numérica cuando el track varía su distancia / velocidad / altura.

```css
.font-tabular,
.font-mono,
[data-numeric] {
  font-feature-settings: 'tnum' 1, 'lnum' 1;
  font-variant-numeric: tabular-nums lining-nums;
}
```

Se aplica a:

- Coordenadas WGS84 (lat/lon).
- Distancia (m, km, NM).
- Altitud (ft, m).
- Velocidad (kt, m/s).
- Heading (deg).
- Hora Zulu y timestamps locales.
- Track IDs.
- Probabilidad de éxito (Pk).
- Cualquier número en una columna de tabla.

---

## 5. Tabla de uso por componente

| Componente | Token | Peso | Familia |
|---|---|---|---|
| `AppShell > navItem` | `text-sm` | 500 | Sans |
| `AppShell > navItem.active` | `text-sm` | 600 | Sans |
| `StatusBar > metric value` | `text-sm` | 500 | Mono (tabular) |
| `StatusBar > metric label` | `text-2xs` | 500 | Sans |
| `StatusBar > DEFCON badge` | `text-md` | 700 | Sans Display |
| `TrackRow > id` | `text-xs` | 500 | Mono |
| `TrackRow > classification badge` | `text-2xs` | 700 | Sans (mayúsculas) |
| `TrackRow > coord` | `text-xs` | 400 | Mono (tabular) |
| `TrackRow > tti` | `text-sm` | 600 | Mono (tabular) |
| `RecommendationCard > title` | `text-lg` | 600 | Sans |
| `RecommendationCard > rationale` | `text-base` | 400 | Sans |
| `RecommendationCard > pk` | `text-2xl` | 700 | Mono (tabular) |
| `EngagementAuthDialog > title` | `text-xl` | 700 | Sans Display |
| `EngagementAuthDialog > countdown` | `text-3xl` | 800 | Mono (tabular) |
| `EngagementAuthDialog > rationale block` | `text-base` | 400 | Sans |
| `Button.primary` | `text-base` | 600 | Sans |
| `Button.engage` (ENGAGE letal) | `text-lg` | 700 | Sans Display, uppercase |
| `Input > value` | `text-base` | 400 | Sans (Mono si numérico) |
| `Input > label` | `text-xs` | 500 | Sans |
| `Input > helper` | `text-2xs` | 400 | Sans |
| `AlertBanner > title` | `text-md` | 700 | Sans Display |
| `AlertBanner > body` | `text-sm` | 400 | Sans |
| `Tooltip` | `text-xs` | 400 | Sans |
| `Tabs > trigger` | `text-sm` | 500 | Sans |
| `Tabs > trigger.active` | `text-sm` | 600 | Sans |
| `VideoFeed > HUD overlay` | `text-2xs` | 500 | Mono (tabular) |

---

## 6. Reglas de escritura

### 6.1 Mayúsculas y minúsculas

- **MAYÚSCULAS** solo en:
  - Etiquetas de clasificación: `HOSTIL_CONFIRMADO`, `AMENAZA_PROBABLE`.
  - Códigos OTAN: `DEFCON 3`, `BRAVO`, `ZULU`.
  - Botones de acción letal: `AUTORIZAR ENGAGEMENT`, `ABORTAR`.
  - Headers de columna de tabla.
- **Title Case** (Primera Letra de Cada Palabra): no se usa en español (es anglicismo).
- **Sentence case** (Primera letra de la frase): default para botones secundarios, descripciones, labels.

### 6.2 Términos OTAN y militares

Se mantienen en inglés cuando son **códigos estándar**:

- `DEFCON`, `BRAVO ZULU`, `STAND-BY`, `WILCO`, `ROGER`, `OUT`.
- `FRIEND / FOE / UNKNOWN` en interfaces IFF (paréntesis con traducción al lado solo en tooltips).

Se traducen al español:

- "Amenaza", "Engagement" → "Engagement" (no traducible operativamente, se acepta anglicismo).
- "Interceptor", "Sensor", "Radar", "Track" (estos últimos también aceptados en español operativo).

### 6.3 Números y unidades

- Coordenadas: formato decimal con 6 decimales (`40.416775°N`, `-3.703790°W`).
- Distancias cortas: metros (`1240 m`); largas: km (`4.2 km`) o nm (`2.3 nm`) según contexto operativo.
- Altitudes: ft (estándar aviación) con metros entre paréntesis cuando es la primera mención.
- Velocidades: nudos (`kt`) en aviación.
- Tiempo: hora Zulu (`13:42:18 Z`) en barra de estado; relativa (`+04:18`) en contadores.
- Pk (probability of kill): porcentaje con 1 decimal (`89.0 %`).

### 6.4 Separadores

- **Separador de miles**: espacio fino (` `, U+202F) no la coma (en español ISO).
- **Separador decimal**: coma (`0,89`) para texto literario; **punto** (`0.89`) para tabular en columnas mono (consistencia internacional).
- **En JSON / código**: siempre punto.

---

## 6. Smoothing y antialiasing

```css
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
```

En modo Night Vision se desactiva `text-rendering: optimizeLegibility` (rinde a `geometricPrecision`) para reducir halo cromático en sub-pixel.

---

## 7. Cargado web

```css
@font-face {
  font-family: 'Inter Tight';
  src: url('/fonts/InterTight-Variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}

@font-face {
  font-family: 'JetBrains Mono';
  src: url('/fonts/JetBrainsMono-Variable.woff2') format('woff2-variations');
  font-weight: 100 800;
  font-display: swap;
}

@font-face {
  font-family: 'IBM Plex Sans Condensed';
  src: url('/fonts/IBMPlexSansCondensed-Variable.woff2') format('woff2-variations');
  font-weight: 100 700;
  font-display: swap;
}
```

`font-display: swap` para garantizar que el HMI nunca quede en blanco esperando fuentes — fallback `system-ui` se renderiza inmediatamente.
