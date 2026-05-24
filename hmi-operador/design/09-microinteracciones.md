# 09 — Microinteracciones

> Animaciones funcionales, sin decoración. **Operador en estado de alerta no espera animaciones.** Todo movimiento debe transmitir cambio de estado, jamás sentirse "agradable".

---

## 1. Reglas duras

| Regla | Aplicación |
|---|---|
| Duración máxima | **200 ms** para cualquier transición. Excepción: Cesium camera tween 800 ms cuando slew-to-cue (operador lo solicita explícitamente). |
| Easing | `ease-out` (`cubic-bezier(0, 0, 0.2, 1)`) o lineal. **PROHIBIDO**: ease-in-out, bounce, elastic, anticipate. |
| Iteración | Generalmente 1. Loops solo para pulse de amenaza (máx 3 ciclos) y spinners en loading state. |
| `prefers-reduced-motion` | Respetado. Animaciones reducidas a 0.01 ms salvo countdown crítico. |
| Latencia | Toda acción del operador (click, tecla) produce respuesta visual en < 100 ms (incluso si la acción de red tarda más, hay feedback inmediato). |

---

## 2. Animaciones permitidas (whitelist)

| Nombre | Duración | Easing | Iteración | Uso |
|---|---|---|---|---|
| `fade-in` | 150 ms | ease-out | 1 | Tooltip, dropdown, banner aparición |
| `fade-out` | 100 ms | ease-out | 1 | Tooltip, dropdown ocultar |
| `slide-down` | 200 ms | ease-out | 1 | Banner top, AlertBanner aparición |
| `slide-up` | 150 ms | ease-out | 1 | Banner top desaparición, toast |
| `scale-press` | 80 ms | ease-out | 1 | Button click feedback (scale 1 → 0.98 → 1) |
| `pulse-threat` | 1500 ms | ease-out | infinite (máx 3 ciclos por evento) | Halo de track HOSTIL recién detectado |
| `pulse-defcon-up` | 2000 ms | ease-out | 1 | Cambio de nivel DEFCON a más alto |
| `spin-loading` | 600 ms | linear | infinite | Spinner pequeño en loading state |
| `progress-countdown` | linear | linear | 1 | Barra de progreso del countdown de EngagementAuthDialog |
| `flash-success` | 300 ms | ease-out | 1 | Confirmación de autorización (un flash verde en bordel del modal) |
| `flash-error` | 300 ms | ease-out | 1 | Falló doble factor en EngagementAuthDialog |

### Detalle: `pulse-threat`

```css
@keyframes pulse-threat {
  0% {
    box-shadow: 0 0 0 0 rgba(229, 72, 77, 0.6);
  }
  100% {
    box-shadow: 0 0 0 8px rgba(229, 72, 77, 0);
  }
}

.threat-pulse {
  animation: pulse-threat 1.5s ease-out;
  animation-iteration-count: 3;
}
```

Después de los 3 ciclos, el pulse se detiene. Si el operador no acusa el track, queda en estático con el borde rojo (semánticamente "ya visto, sigue activo").

### Detalle: `scale-press`

```css
.button-press {
  transition: transform 80ms ease-out;
}
.button-press:active {
  transform: scale(0.98);
}
```

Único feedback de click en botones. NO se permiten ripples Material-style.

---

## 3. Animaciones PROHIBIDAS

| Tipo | Por qué prohibida |
|---|---|
| Bounce (`cubic-bezier(0.68, -0.55, 0.265, 1.55)`) | Distrae, sensación lúdica inadecuada |
| Elastic | Igual que bounce |
| Parallax al scroll | Innecesario, ralentiza percepción |
| Splash screen / loading screen | No ahorra tiempo, retarda primer dato |
| Auto-play de transiciones (carousel) | Quita control al operador |
| Hover scale (cards "growing" al hover) | Confunde con click feedback |
| Color cycling decorativo | Asociaciones cromáticas son semánticas, no decorativas |
| Animaciones de entrada en cascada de listas | Retrasan acceso a datos |
| Confetti / partículas | — |

---

## 4. Estados de loading

### 4.1 Skeleton screens (preferido)

Para listas y cards en carga inicial:

```
┌──────────────────────────────────────┐
│ ████████  ████  ███████  ███         │   ← shimmer suave 1500 ms linear
│ ████████  ████  ███████  ███         │
└──────────────────────────────────────┘
```

- Color shimmer: `linear-gradient(90deg, transparent 0%, var(--bg-elevated) 50%, transparent 100%)`.
- Animación 1500 ms (más lenta que las demás porque es de fondo, no urgente).
- Retorna al estado normal sin transición (corte).

### 4.2 Spinner inline (cuando skeleton no aplica)

Solo en botones durante acción remota:

```
[●] AUTORIZANDO...
```

- Spinner 14 px, color heredado del botón.
- Texto del botón cambia al imperativo en gerundio.

### 4.3 Indeterminate progress bar

Solo en banners de operación larga (carga de ROE policy, exportación de audit log):

```css
@keyframes indeterminate {
  0%   { left: -40%; right: 100%; }
  100% { left: 100%; right: -40%; }
}
```

---

## 5. Transiciones entre estados

| De → A | Animación |
|---|---|
| Track entra a lista | slide-down 200 ms desde top |
| Track se selecciona | bg cross-fade 150 ms |
| Track desaparece (intercepted, lost) | fade-out 150 ms + delay 200 ms (operador alcanza a ver la transición) |
| AuxPanel cambia contenido | fade-cross 150 ms |
| Modal abre | fade-in backdrop 100 ms + scale-up 0.96→1.0 modal 150 ms |
| Modal cierra | fade-out 100 ms |
| Tab cambia | underline desliza 150 ms ease-out |
| Toast aparece | slide-down 150 ms |
| Toast desaparece (3s) | fade-out 200 ms |
| Vision mode change | sin animación (instantáneo) + toast confirmando |
| Density change | sin animación (instantáneo) |
| DEFCON sube | banner top slide-down + pulse 1 ciclo en badge DEFCON |
| DEFCON baja | banner top slide-down (color verde) + sin pulse |
| Comms loss | banner crítico slide-down + degradación gradual de colores de tracks (200 ms) |
| Comms recovered | banner success slide-down + restauración instantánea |

---

## 6. Sonidos mil-spec (opcional para Frontend implementar — todo opt-in del operador)

> Sonidos cortos, sin musicalidad, generados sintéticamente. NO sonidos sampled de UI consumer.

| Evento | Tipo | Frecuencia | Duración | Volumen relativo |
|---|---|---|---|---|
| Nuevo track HOSTIL_CONFIRMADO | Beep mil-spec | 800 Hz square | 150 ms | 0.7 |
| Nuevo track AMENAZA_PROBABLE | Beep | 600 Hz sine | 100 ms | 0.5 |
| Autorización completa OK | Confirmación dual | 1200 Hz + 1500 Hz, secuencia | 200 ms | 0.6 |
| Autorización denegada | Beep grave | 200 Hz square | 250 ms | 0.7 |
| Engagement enviado (irreversible) | Tres beeps cortos | 800 Hz, 3×80ms gap 80ms | 480 ms | 0.7 |
| Comms loss | Tono descendente | 600 Hz → 300 Hz sweep | 400 ms | 0.8 |
| Comms recovered | Tono ascendente | 300 Hz → 600 Hz sweep | 400 ms | 0.4 |
| DEFCON sube | Triple beep | 1000 Hz, 3×100ms gap 50ms | 400 ms | 0.8 |
| Modo simulación activo (cada 60 s) | Beep suave | 500 Hz sine | 50 ms | 0.2 |

### Implementación (Frontend, opcional FASE 0):

```ts
// src/lib/audio.ts
function beep(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.6) {
  const audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration / 1000);
}
```

### Reglas

- Volumen master controlable por el operador en StatusBar (icon Volume2/VolumeX).
- Silenciar requiere **confirmación explícita** ("¿Silenciar alertas audibles durante esta sesión?" Sí/No).
- Sonidos críticos (DEFCON, comms loss, hostil) **no se pueden silenciar individualmente**, solo el volumen master.
- Cada sonido se registra en el audit log: timestamp + tipo + acción que lo provocó.

---

## 7. Latencia de feedback

| Interacción | Latencia objetivo | Implementación |
|---|---|---|
| Click en botón | feedback visual < 50 ms | CSS `:active` |
| Tecla en input | char aparece < 50 ms | nativo |
| Selección de track en lista | row highlight < 100 ms | local state |
| Carga de detalle en AuxPanel | datos visibles < 300 ms o skeleton | React Query con cache |
| Carga inicial de mapa Cesium | mapa visible < 1500 ms | preload terrain |
| Autorización completa enviada → engagement confirmado | banner success < 500 ms tras OK del backend | WebSocket push |

Si una operación tarda más, **siempre se muestra estado intermedio** (skeleton, spinner inline, banner "Procesando…"). Nunca silencio.

---

## 8. Comportamiento bajo carga / degradación

- Si el WebSocket detecta latencia > 200 ms persistente: dot de StatusBar pasa a amarillo, tooltip muestra "Latencia elevada: 350 ms".
- Si > 1000 ms o disconnected: dot rojo + banner crítico "Comms degradado".
- En estado degradado, las animaciones no críticas (skeletons, transiciones) se **desactivan automáticamente** para preservar performance del navegador.

---

## 9. Tabla de keyframes (referencia para Frontend)

```css
@keyframes ccelestial-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes ccelestial-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}

@keyframes ccelestial-slide-down {
  from { transform: translateY(-8px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}

@keyframes ccelestial-pulse-threat {
  0%   { box-shadow: 0 0 0 0 rgba(229, 72, 77, 0.6); }
  100% { box-shadow: 0 0 0 8px rgba(229, 72, 77, 0); }
}

@keyframes ccelestial-pulse-defcon-up {
  0%, 100% { background-color: rgba(229, 72, 77, 0.3); }
  50%      { background-color: rgba(229, 72, 77, 0.6); }
}

@keyframes ccelestial-spin {
  to { transform: rotate(360deg); }
}

@keyframes ccelestial-progress {
  from { width: 100%; }
  to   { width: 0; }
}
```

Estas se exportan en `tokens/tailwind-tokens.ts` como `animation` y `keyframes`.
