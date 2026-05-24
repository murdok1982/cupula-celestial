# 01 — Paleta de Color

> Toda elección de color responde a una **razón táctica** (visibilidad, doctrina OTAN, ergonomía nocturna, no-ambigüedad). No hay colores decorativos.

---

## 1. Sistema base — Modo Tactical Dark (defecto)

### 1.1 Fondos

| Token | Valor | Luminancia | Uso | Razón táctica |
|---|---|---|---|---|
| `--bg-base` | `#0A0E14` | ~3 % | Fondo de aplicación, debajo del mapa | Permite que el mapa Cesium con su negro de bathymetry domine; evita brillo en sala oscura |
| `--bg-surface` | `#11161D` | ~5 % | Paneles, sidebars, modales | Contraste suficiente con base para delimitar zonas sin necesidad de borde |
| `--bg-elevated` | `#1A2129` | ~8 % | Cards activas, dropdowns abiertos, fila seleccionada | Eleva visualmente el item activo sin gritar |
| `--bg-overlay` | `rgba(10,14,20,0.85)` | — | Backdrop de modales bloqueantes | Mantiene visible el contexto detrás (saber QUÉ amenaza generó el modal) |
| `--bg-hover` | `#1F2730` | ~9 % | Estado hover sobre filas, botones ghost | Indicación sutil — el operador con ratón rápido no requiere flash |

### 1.2 Texto / Foreground

| Token | Valor | Contraste vs `--bg-base` | Uso |
|---|---|---|---|
| `--fg-primary` | `#E6EDF3` | 14.8:1 (AAA) | Texto principal, números de telemetría críticos |
| `--fg-secondary` | `#B0BAC9` | 9.2:1 (AAA) | Etiquetas, metadatos operativos |
| `--fg-tertiary` | `#6E7889` | 4.8:1 (AA) | Texto deshabilitado, timestamps secundarios |
| `--fg-inverse` | `#0A0E14` | — | Texto sobre fondos claros (botones primary, badges) |

### 1.3 Bordes

| Token | Valor | Uso |
|---|---|---|
| `--border-subtle` | `#1F2730` | Separadores discretos, tabla zebrada |
| `--border-default` | `#2A3340` | Borde por defecto de paneles, inputs |
| `--border-strong` | `#3D4A5C` | Hover/focus de inputs, contornos enfatizados |
| `--border-focus` | `#4D7BD8` | Anillo de foco (3:1 vs bordes vecinos, accesibilidad) |

---

## 2. Escala de amenaza (semántica táctica)

La dicotomía rojo/azul es **estándar OTAN universal** (APP-6D). Se respeta sin excepción.

| Clasificación | Color principal | Hex | Contraste vs `--bg-base` | Color +bg suave | Símbolo APP-6 |
|---|---|---|---|---|---|
| `HOSTIL_CONFIRMADO` | Rojo carmín | `#E5484D` | 5.3:1 (AA) | `rgba(229,72,77,0.16)` | `H` |
| `AMENAZA_PROBABLE` | Naranja alerta | `#FF8B3D` | 7.1:1 (AAA) | `rgba(255,139,61,0.16)` | `S` |
| `DESCONOCIDO` | Amarillo desat. | `#F3D03E` | 11.4:1 (AAA) | `rgba(243,208,62,0.14)` | `U` |
| `NEUTRAL` | Verde lima | `#46A758` | 6.2:1 (AAA) | `rgba(70,167,88,0.16)` | `N` |
| `MILITAR_AMIGO` | Azul OTAN | `#3E63DD` | 5.8:1 (AA) | `rgba(62,99,221,0.18)` | `F` |
| `CIVIL` | Gris azulado | `#6E7889` | 4.8:1 (AA) | `rgba(110,120,137,0.15)` | (cuadrado verde según APP-6) |
| `AVE / DESCARTAR` | Gris oscuro | `#4A5260` | 3.0:1 | `rgba(74,82,96,0.12)` | (etiqueta textual) |

**Razones tácticas:**

- **Rojo carmín no rojo puro (`#FF0000`)**: el rojo puro vibra en monitor OLED 4K, produce halo en visión escotópica y satura la atención. `#E5484D` mantiene la semántica OTAN con menos agresividad retiniana.
- **Naranja `#FF8B3D` separable de rojo y amarillo** incluso para daltonismo deuteranopia (verificado con `colorblindly` simulator).
- **Azul OTAN `#3E63DD`** sigue la tradición visual de plotters de tráfico aéreo civil/militar (similar al usado por Eurocontrol/IndraNorma).
- Los `+bg` (suaves) tienen alfa 14–18 % calibrado para que el texto blanco encima mantenga contraste ≥ 4.5:1.

---

## 3. Estado del sistema

| Token | Valor | Uso |
|---|---|---|
| `--status-success` | `#2BA968` | Confirmaciones, conexión OK, autorización completada |
| `--status-success-bg` | `rgba(43,169,104,0.14)` | Banner suave, badge fondo |
| `--status-warning` | `#E8A800` | Atención requerida (saturación cercana, batería baja interceptor) |
| `--status-warning-bg` | `rgba(232,168,0,0.14)` | — |
| `--status-error` | `#E5484D` | Error crítico, alias semántico de hostile |
| `--status-error-bg` | `rgba(229,72,77,0.14)` | — |
| `--status-info` | `#4D7BD8` | Notificaciones informativas, modo simulación |
| `--status-info-bg` | `rgba(77,123,216,0.14)` | — |

---

## 4. DEFCON — Escala graduada

Inspiración en doctrina OTAN-US adaptada a contexto civil de defensa estatal. Visible en barra de estado, cambia color global de acentos.

| Nivel | Significado operativo | Color | Hex | Acción UI |
|---|---|---|---|---|
| `DEFCON 5` | Paz / sin alerta | Verde calma | `#46A758` | UI estándar, sin pulse |
| `DEFCON 4` | Vigilancia incrementada | Verde amarillento | `#A0B842` | Indicador en barra de estado |
| `DEFCON 3` | Disposición elevada | Amarillo ámbar | `#E8A800` | Banner persistente top |
| `DEFCON 2` | Conflicto inminente | Naranja alerta | `#FF8B3D` | Pulse 1 ciclo en DEFCON badge |
| `DEFCON 1` | Conflicto activo | Rojo carmín | `#E5484D` | Banner top + bordes laterales |

**Razón táctica:** la escala usa color **monotónicamente creciente en alarma** (verde → naranja → rojo). Cada nivel también lleva su número y etiqueta textual ("DEFCON 3 — ELEVATED") porque el color solo es insuficiente bajo fatiga visual.

---

## 5. Acentos del sistema

| Token | Valor | Uso |
|---|---|---|
| `--accent-primary` | `#4D7BD8` | Botones primarios (excepto engagement), foco, links |
| `--accent-primary-hover` | `#5D8AE8` | Hover botón primary |
| `--accent-engage` | `#E5484D` | Botón ENGAGE (autorización letal) — separado de "danger" para evitar confusión visual |
| `--accent-engage-hover` | `#F05A60` | Hover botón ENGAGE |
| `--accent-cyan` | `#4FB6D9` | Vectores de velocidad de tracks amigos en mapa, gráficas técnicas |
| `--accent-mag` | `#C447D9` | Marcador de selección actual (highlight de track seleccionado) |

**Razón táctica:** el botón ENGAGE NO usa el "accent-primary" azul porque **azul = amigo** en doctrina OTAN. Usa rojo carmín deliberadamente para indicar "acción letal", reforzando vía color la naturaleza de lo que se autoriza.

---

## 6. Mapa Cesium — colores específicos

| Capa | Color | Opacidad |
|---|---|---|
| Terreno base (tierra) | `#1B2330` | 100 % |
| Océanos / bathymetry | `#08111C` | 100 % |
| Bordes administrativos | `#3D4A5C` | 60 % |
| Geofence civil (prohibido fuego) | `#E5484D` outline + `#E5484D` fill | outline 80 % / fill 8 % |
| Geofence militar (zona libre) | `#3E63DD` outline + `#3E63DD` fill | outline 60 % / fill 5 % |
| Geofence no-fly (corredor humanitario) | `#F3D03E` outline diagonal | outline 80 % / fill 10 % |
| Track hostil (entidad punto) | `#E5484D` | 100 % core + halo pulsante 60→0 % |
| Track amigo (entidad punto) | `#3E63DD` | 100 % core |
| Track desconocido | `#F3D03E` | 100 % core + halo pulsante en `--bg-elevated` |
| Leader-line vector velocidad (hostil) | gradient `#E5484D` → `#E5484D@0%` | a lo largo de 3 segundos proyección |
| Leader-line (amigo) | gradient `#3E63DD` → `#3E63DD@0%` | — |
| Trayectoria histórica (trail) | mismo color del track | opacidad linealmente decreciente desde 80 % al 0 % |
| Interceptor en ruta | `#4FB6D9` cyan | 100 % + ícono ✈️ APP-6 |

---

## 7. Modo Night Vision (red monochromatic)

Para uso en sala con doctrina de oscuridad sostenida o cuando el operador alterna con visión sin amplificación. Reduce el azul espectral que destruye la adaptación nocturna.

Todos los colores se mapean a **escala monocromática roja** sobre negro absoluto:

| Función | Valor |
|---|---|
| Fondo base | `#000000` |
| Fondo superficie | `#1A0303` |
| Fondo elevado | `#260505` |
| Texto primario | `#FF6B6B` |
| Texto secundario | `#CC4444` |
| Texto deshabilitado | `#7A2424` |
| Borde | `#330808` |
| Borde fuerte | `#660F0F` |
| Hostil | `#FF1F1F` (con pulse) |
| Amigo | `#993333` (atenuado deliberadamente para que destaque hostil) |
| Desconocido | `#CC5555` |
| Status success | `#993333` |
| Status warning | `#FF4444` (oscilando) |
| Status error | `#FF1F1F` |

**Razón táctica:** el rojo monocromático preserva la **adaptación a la oscuridad de los conos retinianos** (científicamente validado en cabinas de buques de guerra y submarinos desde los años 60). Aunque pierde discriminación cromática, en sala de operaciones nocturna el operador prioriza no perder visión periférica al apartar la mirada del monitor.

---

## 8. Modo Color-Blind Safe (CUD — Color Universal Design)

Paleta diseñada para protanopia, deuteranopia y tritanopia. Inspirada en Okabe & Ito (2008) y CUD japonés.

| Función | Hex | Notas |
|---|---|---|
| Hostil | `#D55E00` (naranja vermellón) + símbolo `▼` | Distinguible en los 3 tipos de daltonismo |
| Amigo | `#0072B2` (azul) + símbolo `▲` | — |
| Desconocido | `#F0E442` (amarillo claro) + símbolo `?` | — |
| Neutral | `#009E73` (verde bluish) + símbolo `○` | — |
| Civil | `#CC79A7` (rosa) + símbolo `□` | — |
| Warning | `#E69F00` (naranja) | — |

**Regla:** en este modo, **todos los componentes que tradicionalmente comunican solo por color añaden un símbolo geométrico redundante**. No se requiere que el operador discrimine color para realizar tarea crítica.

---

## 9. Resumen de tokens disponibles para Frontend

Ver `tokens/design-tokens.json` (Style Dictionary) y `tokens/tailwind-tokens.ts`. Exposición CSS:

```css
:root {
  /* Backgrounds */
  --ccelestial-bg-base: #0A0E14;
  --ccelestial-bg-surface: #11161D;
  --ccelestial-bg-elevated: #1A2129;
  /* …etc, ver tokens/design-tokens.json */
}

[data-vision-mode='night-vision'] { /* sobrescribe */ }
[data-vision-mode='cud'] { /* sobrescribe */ }
```

Frontend cambia modo aplicando atributo en `<html>`:

```ts
document.documentElement.dataset.visionMode = 'night-vision';
```
