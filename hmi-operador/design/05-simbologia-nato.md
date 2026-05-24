# 05 — Simbología NATO APP-6D / MIL-STD-2525D

> El HMI usa simbología militar OTAN estándar para que el operador trasladado de cualquier sistema aliado lea correctamente Cúpula Celestial sin reentrenamiento.

---

## 1. Estándar de referencia

- **APP-6D** (Allied Procedural Publication 6, edición D): estándar OTAN.
- **MIL-STD-2525D**: estándar US Department of Defense (compatible APP-6D salvo matices).

Cúpula Celestial implementa **APP-6D**, con identificación SIDC de **15 caracteres**.

Librería propuesta para Frontend: [`milsymbol`](https://github.com/spatialillusions/milsymbol) (open source, ISC license). Renderiza SVG a partir de SIDC.

---

## 2. Estructura del SIDC (15 caracteres)

```
position:  1  2  3  4  5  6  7  8  9  10 11 12 13 14 15
chars:     S  H  A  P  -  -  -  -  -  -  -  -  -  -  -
            │  │  │  │     │
            │  │  │  │     └─ Status (P=presente, A=anticipated)
            │  │  │  └─ Functional ID
            │  │  └─ Battle dimension (P=air, G=ground, S=sea surface)
            │  └─ Affiliation (H=hostile, F=friend, N=neutral, U=unknown, P=pending)
            └─ Coding scheme (S=war fighting symbols)
```

| Pos | Significado | Valores comunes |
|---|---|---|
| 1 | Coding scheme | `S` = war fighting |
| 2 | Affiliation | `F` = FRIEND, `H` = HOSTILE, `N` = NEUTRAL, `U` = UNKNOWN, `P` = PENDING, `A` = ASSUMED FRIEND, `S` = SUSPECT |
| 3 | Battle dimension | `P` = air, `G` = ground unit, `S` = sea surface, `U` = subsurface, `F` = sof, `Z` = unknown |
| 4 | Status | `P` = presente, `A` = anticipated/planned |
| 5–10 | Functional ID | Tipo específico (UAV, helicopter, infantry…) |
| 11 | Symbol modifier | — |
| 12 | Country code | `ES` = España, `US`, `RU` etc. (cuando aplica) |
| 13–15 | Order of battle | — |

---

## 3. Mapeo classification → SIDC en Cúpula Celestial

Tabla de conversión que el frontend usará:

| Clasificación interna | SIDC (15 chars) | Glyph | Color renderizado |
|---|---|---|---|
| `HOSTIL_CONFIRMADO` (UAV) | `SHAP-----------` | Air / hostile (rombo rojo) | `#E5484D` |
| `AMENAZA_PROBABLE` (UAV) | `SSAP-----------` | Air / suspect (rombo + ?) | `#FF8B3D` |
| `DESCONOCIDO` (UAV) | `SUAP-----------` | Air / unknown (cuadro + ?) | `#F3D03E` |
| `NEUTRAL` (UAV) | `SNAP-----------` | Air / neutral (cuadrado verde) | `#46A758` |
| `MILITAR_AMIGO` (UAV) | `SFAP-----------` | Air / friend (semicírculo azul) | `#3E63DD` |
| `CIVIL_AMIGO` (UAV) | `SFAPMFQ--------` | Air / friend / civilian | `#3E63DD` + interior bandera |
| `AVE / FAUNA` | `SUAP-----------` + etiqueta "BIO" | unknown air + override etiqueta | `#4A5260` |
| `INTERCEPTOR PROPIO` | `SFAPMFQ--------` | Air / friend / our asset | `#4FB6D9` cyan |
| Activo crítico (suelo) | `SFGP-----------` | Ground / friend / installation | `#3E63DD` |
| Sensor radar amigo | `SFGPESS--------` | Ground / friend / sensor | `#3E63DD` |

---

## 4. Glyphs según afiliación (battle dimension AIR)

| Afiliación | Forma | Color OTAN | Color Cúpula Celestial |
|---|---|---|---|
| FRIEND | Semicírculo (esquina inferior) | Azul (cyan) | `#3E63DD` |
| HOSTILE | Rombo con punta abajo | Rojo | `#E5484D` |
| NEUTRAL | Cuadrado | Verde | `#46A758` |
| UNKNOWN | Cuadrado | Amarillo | `#F3D03E` |
| SUSPECT | Rombo con borde discontinuo + `?` | Naranja (custom Cúpula Celestial — APP-6 usa amarillo) | `#FF8B3D` |
| PENDING | Cuadrado con `?` | Amarillo | `#F3D03E` |

Decisión: APP-6D usa amarillo para SUSPECT y UNKNOWN indistintamente. Cúpula Celestial **separa SUSPECT → naranja, UNKNOWN → amarillo** para reducir ambigüedad táctica. Esta es una extensión documentada, no una desviación del estándar (las formas siguen siendo OTAN).

---

## 5. Tamaños estandarizados

| Tamaño | Uso |
|---|---|
| `16 px` | Inline en TrackRow (lista densa) |
| `24 px` | Badges en headers, leyenda |
| `32 px` | Marker sobre mapa Cesium (default) |
| `48 px` | Cesium en zoom alto (≥ 15 km vista) o detalle expandido |

Implementación con `milsymbol`:

```ts
import ms from 'milsymbol';

const symbol = new ms.Symbol('SHAP-----------', {
  size: 32,
  monoColor: '#E5484D',
  outlineColor: '#0A0E14',
  outlineWidth: 1,
});

const svgString = symbol.asSVG();
```

---

## 6. Símbolos compuestos (con modificadores)

APP-6D permite agregar modificadores como echelon, country, mobility. Cúpula Celestial usa solo los siguientes:

| Modificador | Posición | Uso |
|---|---|---|
| Etiqueta de texto sobre símbolo | top | Track ID (`T-4471`) |
| Etiqueta debajo | bottom | Plataforma (`DJI-M30`, `QUAD-SUS`) |
| Direction line | flecha | Heading visualizado como leader-line |
| Speed leader | longitud | Vector de velocidad escalado a 1 minuto de proyección |

---

## 7. Render en mapa Cesium

Cada `Entity` de Cesium usa un `BillboardGraphics` con la propiedad `image` apuntando a un `data:image/svg+xml;base64,…` generado por `milsymbol`.

```ts
viewer.entities.add({
  id: track.id,
  position: Cartesian3.fromDegrees(track.lon, track.lat, track.alt),
  billboard: {
    image: ms.Symbol(sidc, { size: 32 }).asCanvas(),
    scaleByDistance: new NearFarScalar(1.5e2, 1.2, 1.5e7, 0.6),
    pixelOffset: new Cartesian2(0, -16),
    eyeOffset: new Cartesian3(0, 0, -10),
  },
  label: {
    text: track.id,
    font: '11px JetBrains Mono',
    fillColor: Color.fromCssColorString('#E6EDF3'),
    outlineColor: Color.fromCssColorString('#0A0E14'),
    outlineWidth: 2,
    style: LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cartesian2(0, 18),
    distanceDisplayCondition: new DistanceDisplayCondition(0, 5e5),
  },
});
```

---

## 8. Leyenda visible en HMI

La pantalla `DashboardPage` muestra una leyenda colapsable (botón "Leyenda APP-6") en mapa controls. Contiene 5 entradas mínimas:

| Símbolo | Significado |
|---|---|
| ◇ rojo | Hostil confirmado |
| ◇ naranja | Amenaza probable |
| □ amarillo | Desconocido |
| □ verde | Neutral |
| ◠ azul | Amigo |

La leyenda incluye una nota: "Conforme a OTAN APP-6D ed. 2017".

---

## 9. Símbolos relevantes para escenarios futuros (no MVP)

Si Cúpula Celestial se extiende a defensa marítima de puertos (FASE 2+), se añadirían:

| SIDC | Glyph | Significado |
|---|---|---|
| `SHSP-----------` | Sea surface hostile | Buque hostil |
| `SHSPI----------` | Sea surface hostile / fast attack craft | Lancha rápida hostil |
| `SHUP-----------` | Subsurface hostile | Submarino / UUV hostil |
| `SHGPE----------` | Ground equipment hostile | Pieza artillería hostil |

Por ahora (FASE 0) solo aire y suelo amigo (instalaciones a proteger).

---

## 10. Trazabilidad y auditoría

Toda entidad renderizada en el HMI registra en su tooltip el **SIDC completo** + la versión del estándar:

> "T-4471 · SIDC: SHAP----------- · APP-6D (2017)"

Esto permite al auditor militar reconstruir lo que el operador vio exactamente.
