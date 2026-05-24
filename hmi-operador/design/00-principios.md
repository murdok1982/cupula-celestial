# 00 — Principios de Diseño

> El HMI del operador no es una interfaz: es **una superficie crítica para decisiones letales bajo control humano significativo**. Su diseño se subordina al Derecho Internacional Humanitario, al MIL-STD-1472 y a la doctrina de Meaningful Human Control (ver `docs/08-roe-etica-marco-legal.md`).

---

## 1. Usuario objetivo

**Operador C2 / Oficial de Operaciones (OPS-OFFICER)**

| Atributo | Valor |
|---|---|
| Edad | 28 – 50 años |
| Formación | Militar profesional, certificado en sistemas C-UAS |
| Contexto | Sala de operaciones oscura, monitores 4K 27"+ a 60-80 cm |
| Iluminación ambiente | < 50 lux (penumbra controlada) |
| Sesiones | Turnos de 4–6 h continuadas, posible fatiga visual |
| Posición corporal | Sentado, headset comms, dos manos teclado + ratón |
| Periféricos adicionales | Token FIDO2, lector biométrico, segundo monitor opcional |
| Estado cognitivo | Alerta sostenida, posible estrés agudo en pico de actividad |
| Idioma | Español (operativo) + nomenclatura OTAN en inglés |

**Implicaciones de diseño:**

- Pantalla en **modo oscuro permanente** (luminancia base ≤ 6 % en HSL).
- Tipografía **lo bastante grande para fatiga visual sostenida** sin sacrificar densidad (mínimo 12 px en datos, 14 px en UI general, 11 px solo para metadatos terciarios).
- **Mínima carga decorativa**: cada pixel transmite información o reduce ambigüedad.
- **Atajos de teclado para todo flujo crítico** — el ratón se reserva al mapa.
- Foco visual gestionado: una sola amenaza prioritaria activa a la vez.

---

## 2. Doctrina visual

### 2.1 Sobriedad operacional

Inspirado en **Anduril Lattice, Palantir Gotham, Cesium Tactical, Indra ARMS**. NO inspirado en consumer SaaS, dashboards de marketing ni interfaces de videojuego.

- **Sin gradientes decorativos.** Único uso de gradiente permitido: superposición de leader-line de tracks en Cesium.
- **Sin glassmorphism abusivo.** Capas translúcidas solo para overlays sobre vídeo o mapa, con `backdrop-filter: blur(8px)` y opacidad ≤ 0.85.
- **Sin emojis.** Excepción: símbolos OTAN APP-6 SVG, símbolos universales de aviso (`⚠`, `⛔`) en alertas mil-spec.
- **Sin splash screens, sin animaciones de bienvenida.** Carga inmediata, esqueleto si > 200 ms.

### 2.2 Densidad informativa máxima

Una pantalla típica del HMI muestra simultáneamente:

- ≥ 30 tracks en lista lateral.
- 1 mapa 3D con ≥ 100 entidades.
- 1 panel de recomendación LLM activo.
- 4–8 feeds de vídeo de interceptores.
- Barra de estado con WS, latencia, DEFCON, hora Zulu.

El diseño **prioriza densidad sobre whitespace generoso**. La regla es: si el operador necesita scrollear para ver una amenaza prioritaria, el diseño falló.

### 2.3 Jerarquía visual de un golpe de vista

Tres niveles, no más:

1. **Nivel 1 — Alerta crítica**: pulso rojo, banner global, sonido mil-spec. Se interrumpe la atención.
2. **Nivel 2 — Información operativa activa**: paneles con borde 1 px en color de threat, sin pulso.
3. **Nivel 3 — Contexto y metadatos**: texto secundario, gris, sin acentos.

Si todo grita, nada grita. **El uso del rojo se reserva exclusivamente para HOSTIL_CONFIRMADO y errores críticos de sistema.**

### 2.4 Latencia cognitiva mínima

El operador debe poder identificar la naturaleza de una pantalla en **< 500 ms**. Esto exige:

- **Layouts estables**: las zonas funcionales no se mueven entre vistas.
- **Colores semánticos consistentes**: rojo SIEMPRE hostil, azul SIEMPRE amigo, en TODAS las pantallas, incluido el mapa.
- **Símbolos NATO APP-6** como anclaje universal — un operador entrenado los reconoce subconscientemente.

---

## 3. Restricciones técnicas

- **Tecnología**: React 19 + TypeScript estricto + TailwindCSS 3 + shadcn/ui (Radix Primitives) + Cesium 1.122.
- **Bundle CSS**: el design system aporta cero peso runtime (tokens como TS plano → Tailwind purga).
- **Sin librerías de animación pesadas** (no Framer Motion en componentes hot — solo CSS keyframes).
- **Compatibilidad navegador**: Chromium 120+ embebido (no IE, no Safari < 17). Si despliegue militar exige otro stack, los tokens son neutros.
- **Idioma**: TODO el texto y todos los nombres de tokens en español, excepto códigos OTAN (HOSTILE, FRIEND, DEFCON) que mantienen su forma estándar.

---

## 4. Principios rectores (decálogo)

1. **Distinguir** combatientes de civiles: la UI hace visible la clasificación con redundancia color + símbolo + texto.
2. **Proporcionalidad** visible: cada recomendación de engagement muestra el riesgo colateral estimado.
3. **Reversibilidad**: toda acción crítica admite cancelación dentro de la ventana operativa (botón ABORTAR persistente).
4. **Trazabilidad visual**: el operador siempre ve quién/qué/cuándo en la última acción ejecutada.
5. **Sin sorpresas**: ninguna animación involuntaria, ningún cambio de layout no provocado.
6. **Fail-safe visual**: si se pierden datos sensoriales, el sistema lo grita en banner amarillo, no degrada en silencio.
7. **Atajos universales**: Esc cancela / aborta, Enter confirma sólo si el foco está en CTA primario.
8. **Estado siempre presente**: barra de estado fija inferior con WS, latencia, DEFCON, operador autenticado.
9. **Modo nocturno y daltónico** disponibles en un comando.
10. **Auditabilidad**: cada interacción se registra; la UI muestra discretamente el ID de la sesión y el hash del último log.

---

## 5. Anti-patrones explícitamente prohibidos

| Anti-patrón | Por qué prohibido | Alternativa |
|---|---|---|
| Toast notifications efímeras para alertas críticas | Pueden perderse si el operador mira el mapa | Banner persistente + log lateral |
| Splash / loading screen > 200 ms | Latencia cognitiva | Skeleton estático del layout final |
| Colores degradados decorativos | Ambiguos en visión cansada | Color sólido + borde |
| Spinners infinitos | No comunican progreso real | Skeleton + texto "Esperando sensor X" |
| Modales con "X" sutil | El operador puede no encontrarlo | Botón CANCELAR explícito + Esc |
| Drag-and-drop para reorganizar paneles | Riesgo de mover algo crítico por accidente | Layout fijo + perfiles configurables por admin |
| Hover-only tooltips para info esencial | El operador con tablet no tiene hover | Info siempre visible o acceso por click |
| Sonidos largos / musicales | Fatiga auditiva en turnos largos | Beeps mil-spec ≤ 200 ms |
| Animaciones bounce / elastic | Distractoras, infantiles | Cubic-bezier lineal o ease-out simple |
| Color como único indicador | Falla daltónico + falla con fatiga visual | Color + símbolo + texto |

---

## 6. Definición de "terminado" del diseño

Un componente está terminado cuando:

- [x] Tiene anatomía documentada (partes, dimensiones).
- [x] Define todos sus estados (default, hover, focus, active, disabled, loading, error).
- [x] Sus tokens están en `tokens/design-tokens.json`.
- [x] Tiene atributos ARIA y navegación por teclado documentados.
- [x] Tiene contraste verificado en `audit/contrast-check.md`.
- [x] Tiene variante para los 3 modos visuales (Tactical, Night Vision, CUD).
- [x] Tiene un ejemplo HTML autocontenido en `examples/` (cuando aplique).
- [x] Está descrito en `04-componentes.md` con razón táctica de cada decisión.
