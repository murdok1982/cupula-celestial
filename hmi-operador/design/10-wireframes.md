# 10 — Wireframes

> Descripción textual y ASCII art de cada pantalla del HMI. Dimensiones aproximadas en monitor base 1920×1080. La maqueta presupone densidad **compact** (defecto).

---

## 1. LoginPage

Pantalla previa a sesión. Sobria, sin marca decorativa.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                                                                                │
│                                                                                │
│                                                                                │
│                                                                                │
│                       ╔══════════════════════════════╗                         │
│                       ║                              ║                         │
│                       ║  CÚPULA CELESTIAL            ║                         │
│                       ║  HMI Operador · v0.1         ║                         │
│                       ║                              ║                         │
│                       ║  ─────────────────────────   ║                         │
│                       ║                              ║                         │
│                       ║  ID Operador                 ║                         │
│                       ║  [_______________________]   ║                         │
│                       ║                              ║                         │
│                       ║  PIN                         ║                         │
│                       ║  [● ● ● ● ● ●]               ║                         │
│                       ║                              ║                         │
│                       ║  Token FIDO2                 ║                         │
│                       ║  [⬤ Conecte el token físico] ║                         │
│                       ║                              ║                         │
│                       ║  [          ACCEDER       ]  ║                         │
│                       ║                              ║                         │
│                       ║  Sistema clasificado · MdD   ║                         │
│                       ║                              ║                         │
│                       ╚══════════════════════════════╝                         │
│                                                                                │
│                                                                                │
│                                                                                │
│                                                                                │
│                                                                                │
│  Servidor: ccelestial-c2-01 · 14:32 Z · Build 0.1.0+abc1234                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Notas:**

- Card centrada vertical y horizontal, máx 420 px ancho.
- Fondo `bg-base`, card `bg-surface` con border 1px `border-default`.
- Texto identidad sistema en footer pequeño (text-2xs `fg-tertiary`).
- Estados:
  - **default**: campos vacíos, botón disabled.
  - **typing PIN**: dots opacos según chars introducidos.
  - **token-detected**: el indicador del token pasa a verde con texto "Token detectado".
  - **submitting**: botón con spinner "AUTENTICANDO...", inputs disabled.
  - **error**: borde rojo en input culpable + mensaje específico debajo (sin shake animación — innecesaria).

---

## 2. DashboardPage (vista principal)

Vista por defecto al iniciar sesión. Mapa Cesium 3D + lista de tracks + AuxPanel con recomendación activa.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [CC] Cúpula Celestial · DASHBOARD              [DEFCON 3 ELEVATED] [Op. J.GARCÍA ▾]   │ ← 40 px header
├─────┬──────────────────────────────────────────────────────────────────────┬───────────┤
│     │ ┌─ Capas ▾ ─┐  ┌─ 3D / 2D ─┐  ┌─ WGS84 ─┐                              │ RECOMEN-  │
│ [M] │                                                                       │ DACIÓN    │
│  ●  │                                                                       │ T-4471    │
│     │                                                                       │           │
│ [L] │                                                                       │ ENGAGE    │
│     │                                                                       │           │
│ [Z] │                  ╔══════════════════════════╗                         │ Inter-    │
│     │                  ║                          ║                         │ ceptores: │
│ [P] │                  ║         CESIUM           ║                         │ I-12,I-19 │
│     │                  ║      mapa 3D táctico     ║                         │           │
│ [D] │                  ║                          ║                         │ Pk: 89.0% │
│     │                  ║      ● T-4471 (rojo)     ║                         │ Riesgo:   │
│ [S] │                  ║      ◠ I-12 (cyan)       ║                         │ BAJO      │
│     │                  ║      ◠ I-19 (cyan)       ║                         │           │
│ [⚙] │                  ║                          ║                         │ Justifi-  │
│ ──  │                  ╚══════════════════════════╝                         │ cación:   │
│     │                                                                       │ "Trayec-  │
│     │                                                                       │  toria    │
│     │ ┌─ [+] [-] [⌖] [⌂] ─┐                       ┌─ [▣ mini-radar] ────┐    │  balís-  │
│     │                                              │ ●●  ●     ● ●       │   │  tica   │
│     │                                              │   ●     ●   ●  ●    │   │  hacia  │
│     │ ─── LISTA DE TRACKS (top 5 por prioridad) ───┴─────────────────────┘   │  activo  │
│     │                                                                       │  C-3..." │
│     │ [●H] T-4471 HOSTIL Quad·táct. 40.42N,-3.70W 120m +04:18 ⚠               │           │
│     │ [●S] T-4476 PROB.  ? Quad      40.41N,-3.69W 95 m +05:42                │ ROE-7    │
│     │ [●U] T-4480 UNK.   Fixed-wing  40.39N,-3.68W 230m +08:11                │ aplica   │
│     │ [●F] T-4482 AMIGO  Patrol-UAV  40.42N,-3.71W 380m  --                   │           │
│     │ [●N] T-4485 NEUTRO Mat. EASA   40.43N,-3.72W 80 m  --                   │ [Rechaz.] │
│     │                                                            [Ver todos] │ [→ AUTOR] │
├─────┴──────────────────────────────────────────────────────────────────────┴───────────┤
│ ● Online · WS 28ms · API 12ms │ Op: J.GARCÍA │ Sensores: 4/4 │ DEFCON 3 │ 14:32:18 Z   │ ← 32 px status
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Distribución:**

- **Header**: 40 px alto.
- **SideNav** (izq.): 64 px colapsado. Iconos verticales: Map, List, Zap (engagements), Plane (interceptors), Database (audit), Activity (simulator), Settings. Active = bg-elevated + border-left 2px accent-cyan.
- **MainView**: dividida verticalmente — 60 % superior mapa Cesium full-bleed; 40 % inferior lista de tracks (top 5 por prioridad).
- **AuxPanel** (der.): 360 px, RecommendationCard del track seleccionado o detalle del último engagement autorizado.
- **StatusBar**: 32 px alto.

**Estados:**

- **Sin tracks activos**: mensaje en lista "No hay tracks activos. Sensores escaneando." + ícono `Radar` 32 px en gris.
- **Sin recomendación**: AuxPanel muestra "Seleccione un track para ver la recomendación táctica."
- **LLM analizando**: skeleton en RecommendationCard con texto "Analizando con LLM táctico…"
- **Comms loss**: banner top crítico + tracks del mapa en opacidad 50 % + leyenda "Última actualización: hace 24 s".

---

## 3. TrackListPage

Vista listado denso de todos los tracks activos, sin mapa.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [CC] · TRACKS                                  [DEFCON 3] [Op. J.GARCÍA ▾]              │
├─────┬──────────────────────────────────────────────────────────────────────┬───────────┤
│     │ Filtros: [HOSTIL ▾] [Distancia ▾] [TTI ▾]            [Search 🔍 ___]│ DETALLE   │
│ [M] │ ────────────────────────────────────────────────────────────────────│ T-4471    │
│     │ ID      Clase     Plataforma   Posición          Alt    TTI   Acción│           │
│ [L●]│ ────────────────────────────────────────────────────────────────────│ Clasifi-  │
│     │ T-4471 [●H]HOST.  Quad-tact.   40.4168,-3.7038   120m  +04:18  [→]  │ cación:   │
│ [Z] │ T-4476 [●S]PROB.  Quad         40.4135,-3.6982   95m   +05:42  [→]  │ HOSTIL    │
│     │ T-4478 [●H]HOST.  Quad-tact.   40.4150,-3.6960   180m  +06:01  [→]  │           │
│ [P] │ T-4480 [●U]UNK.   Fixed-wing   40.3945,-3.6810   230m  +08:11       │ Modelo:   │
│     │ T-4481 [●U]UNK.   ?            40.3950,-3.6800   220m  +08:20       │ DJI-M30   │
│ [D] │ T-4482 [●F]FRND.  Patrol-UAV   40.4180,-3.7100   380m  --           │           │
│     │ T-4485 [●N]NEUT.  EASA Mat.    40.4250,-3.7200   80m   --           │ Sensores: │
│ [S] │ T-4486 [●N]NEUT.  EASA Mat.    40.4220,-3.7180   85m   --           │ R3, EO2,  │
│     │ T-4487 [●F]FRND.  Patrol-UAV   40.4200,-3.7050   400m  --           │ IR1, RF4  │
│ [⚙] │ T-4490 [●U]UNK.   Slow mov.    40.4100,-3.7000   60m   +12:00       │           │
│ ──  │ T-4491 [●H]HOST.  Quad-tact.   40.4090,-3.6990   140m  +07:30  [→]  │ Vel: 12kt │
│     │ T-4493 [●S]PROB.  Quad         40.4080,-3.6985   130m  +09:00       │ HDG: 087° │
│     │ T-4495 [●U]UNK.   Fixed-wing   40.4070,-3.6970   210m  +11:00       │           │
│     │ ...                                                                  │ Pk LLM:   │
│     │                                                                      │ 89.0%     │
│     │ 32 tracks activos · 4 hostiles · 6 probables · 5 desconocidos        │           │
│     │                                                                      │ [Pin] [→] │
├─────┴──────────────────────────────────────────────────────────────────────┴───────────┤
│ ● Online · WS 28ms · API 12ms │ Op: J.GARCÍA │ Sensores: 4/4 │ DEFCON 3 │ 14:32:18 Z   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Estados:**

- Selección actual: row con bg `bg-elevated`, border-left 3px `accent-mag`.
- Hover: bg `bg-hover`.
- **Track recién detectado (< 5s)**: pulse-threat en border-left (3 ciclos).
- **Track en engagement activo**: badge "EN ENGAGEMENT" + border-left `accent-engage`.
- **Track perdido (no detectado en últimos 10s)**: opacidad 50 %, badge "LOST".

---

## 4. EngagementsPage

Lista histórica y activos de engagements ejecutados / cancelados.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [CC] · ENGAGEMENTS                              [DEFCON 3] [Op. J.GARCÍA ▾]             │
├─────┬──────────────────────────────────────────────────────────────────────────────────┤
│     │ Tabs: [Activos (2)] [Hoy (8)] [Histórico] [Cancelados]                            │
│     │ ──────────────────────────────────────────────────────────────────────────────────│
│ [M] │                                                                                  │
│     │ ENG-2026-05-23-001 · T-4471 · INICIADO 14:31:42 · 4m 18s restantes                │
│ [L] │ Interceptores: I-12, I-19 · Pk: 89.0% · Estado: EN VUELO                          │
│     │ [Ver detalle]  [Abortar]                                                          │
│ [Z●]│ ─────                                                                             │
│     │                                                                                  │
│ [P] │ ENG-2026-05-23-002 · T-4476 · INICIADO 14:34:11 · 5m 02s restantes                │
│     │ Interceptores: I-15 · Pk: 76.0% · Estado: DESPEGANDO                              │
│ [D] │ [Ver detalle]  [Abortar]                                                          │
│     │ ─────                                                                             │
│ [S] │                                                                                  │
│     │ HOY (8 completados):                                                              │
│ [⚙] │ ─────                                                                             │
│ ──  │ 13:42 · ENG-...-008 · T-4458 · EXITOSO · Pk realizada 0.91                        │
│     │ 12:18 · ENG-...-007 · T-4452 · ABORTADO · Razón: civil en zona de impacto         │
│     │ 11:05 · ENG-...-006 · T-4441 · EXITOSO · Pk realizada 0.83                        │
│     │ ...                                                                              │
│     │                                                                                  │
│     │ [Exportar audit log ▾]                                                            │
├─────┴──────────────────────────────────────────────────────────────────────────────────┤
│ ● Online · WS 28ms · API 12ms │ Op: J.GARCÍA │ Sensores: 4/4 │ DEFCON 3 │ 14:32:18 Z   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. InterceptorsPage

Grid de interceptores de la flota con estado y feed de vídeo.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [CC] · INTERCEPTORES                            [DEFCON 3] [Op. J.GARCÍA ▾]             │
├─────┬──────────────────────────────────────────────────────────────────────────────────┤
│     │ Filtros: [Todos ▾]  [Disponibles ▾]                                                │
│     │ ──────────────────────────────────────────────────────────────────────────────────│
│ [M] │ ┌─ I-12 ─────────────┐  ┌─ I-15 ─────────────┐  ┌─ I-19 ─────────────┐             │
│     │ │ Interceptor Alpha   │  │ Interceptor Bravo   │  │ Interceptor Charlie │             │
│ [L] │ │ [████████▯▯] 73%   │  │ [██████▯▯▯▯] 56%   │  │ [█████████▯] 89%   │             │
│     │ │ Alt: 120m HDG:087° │  │ Alt: ---  En base   │  │ Alt: 130m HDG:082° │             │
│ [Z] │ │ Estado: EN RUTA    │  │ Estado: DESPEG.    │  │ Estado: EN RUTA    │             │
│     │ │ Target: T-4471     │  │ Target: T-4476     │  │ Target: T-4471     │             │
│ [P●]│ │ [Video feed]       │  │ [Video feed]       │  │ [Video feed]       │             │
│     │ │ ┌──────────────┐   │  │ ┌──────────────┐   │  │ ┌──────────────┐   │             │
│ [D] │ │ │ ▣ vídeo EO   │   │  │ │   --no feed--│   │  │ │ ▣ vídeo IR   │   │             │
│     │ │ │              │   │  │ │              │   │  │ │              │   │             │
│ [S] │ │ │     ┼ lock   │   │  │ │              │   │  │ │     ┼        │   │             │
│     │ │ └──────────────┘   │  │ └──────────────┘   │  │ └──────────────┘   │             │
│ [⚙] │ │ [Reasig][Retor][X] │  │ [Reasig][Retor][X] │  │ [Reasig][Retor][X] │             │
│ ──  │ └────────────────────┘  └────────────────────┘  └────────────────────┘             │
│     │                                                                                  │
│     │ ┌─ I-22 ─────────────┐  ┌─ I-25 ─────────────┐  ┌─ I-27 ─────────────┐             │
│     │ │ Disponible          │  │ Cargando            │  │ Mantenimiento       │             │
│     │ │ [█████████████ 95%] │  │ [████▯▯▯▯▯▯▯ 32%]  │  │ [N/A]               │             │
│     │ │ Base                │  │ Base                │  │ Hangar 3            │             │
│     │ │ Estado: IDLE        │  │ Estado: CARGA       │  │ Estado: MAINT       │             │
│     │ │ Disponible para     │  │ Disponible en 18m   │  │ ETA disponibilidad: │             │
│     │ │ engagement          │  │                     │  │ T+2h 30m            │             │
│     │ └────────────────────┘  └────────────────────┘  └────────────────────┘             │
├─────┴──────────────────────────────────────────────────────────────────────────────────┤
│ ● Online · WS 28ms · API 12ms │ Op: J.GARCÍA │ Sensores: 4/4 │ DEFCON 3 │ 14:32:18 Z   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Notas:**

- Grid 3 columnas. En monitor 4K se expande a 4. En 1024 px → 2.
- Cada interceptor card = ver `04-componentes.md` B.7 InterceptorStatus.

---

## 6. AuditLogPage

Audit log inmutable. Vista cronológica filtrable.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [CC] · AUDIT LOG                                [DEFCON 3] [Op. J.GARCÍA ▾]             │
├─────┬──────────────────────────────────────────────────────────────────────────────────┤
│     │ Filtros: [Hoy ▾] [Todos los operadores ▾] [Todas las acciones ▾]   [Exportar ▾]   │
│     │ ──────────────────────────────────────────────────────────────────────────────────│
│ [M] │                                                                                  │
│     │ 14:31:42 · J.GARCÍA · ENGAGE_AUTHORIZED · T-4471 → I-12,I-19                      │
│ [L] │   Pk: 0.89 · Riesgo: BAJO · ROE-7 · Hash: 0xab12cd...                              │
│     │   [Expandir]                                                                     │
│ [Z] │ ─────                                                                             │
│     │                                                                                  │
│ [P] │ 14:30:08 · J.GARCÍA · TRACK_PINNED · T-4471                                       │
│     │                                                                                  │
│ [D●]│ 14:29:55 · SYSTEM · TRACK_DETECTED · T-4471 · HOSTIL_CONFIRMADO                   │
│     │                                                                                  │
│ [S] │ 14:28:30 · J.GARCÍA · RECOMMENDATION_VIEWED · T-4471                              │
│     │                                                                                  │
│ [⚙] │ 13:42:18 · J.GARCÍA · ENGAGEMENT_COMPLETED · T-4458 · EXITOSO                     │
│ ──  │   Pk realizada: 0.91 · Hash chain: 0x39ff21...                                    │
│     │                                                                                  │
│     │ 12:18:42 · J.GARCÍA · ENGAGEMENT_ABORTED · T-4452                                 │
│     │   Razón: civil detectado en zona de impacto · ROE-3 invalida engagement           │
│     │                                                                                  │
│     │ ... (paginación)                                                                  │
│     │                                                                                  │
│     │                                                              [Anterior] [1/27] [Siguiente]│
├─────┴──────────────────────────────────────────────────────────────────────────────────┤
│ ● Online · WS 28ms · API 12ms │ Op: J.GARCÍA │ Sensores: 4/4 │ DEFCON 3 │ 14:32:18 Z   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Notas:**

- Cada entrada tabular mono.
- Hash en mono truncado al final, copiable al click (icono `Copy` aparece al hover).
- Exportar genera archivo STANAG 4774/4778 conforme.

---

## 7. SimulatorPage

Entorno de entrenamiento. Mismas pantallas pero con datos sintéticos. Banner persistente "MODO SIMULACIÓN — sin armas reales".

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ⓘ MODO SIMULACIÓN ACTIVO — ninguna acción afecta sistemas reales        [Salir simul.] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [CC] · SIMULADOR                                [DEFCON 3] [Op. J.GARCÍA ▾]             │
├─────┬──────────────────────────────────────────────────────────────────────────────────┤
│     │ Escenarios disponibles:                                                          │
│ [M] │ ─────────────                                                                    │
│     │ ◯ Escenario 1: Intrusión cuádruple en puerto                                      │
│ [L] │ ◯ Escenario 2: Saturación 30+ drones simultáneos                                  │
│     │ ◯ Escenario 3: Falso positivo civil                                               │
│ [Z] │ ◯ Escenario 4: Comms loss durante engagement                                      │
│     │ ◯ Escenario 5: Tutorial guiado (nuevo operador)                                   │
│ [P] │                                                                                  │
│     │ [Iniciar escenario seleccionado]                                                  │
│ [D] │                                                                                  │
│     │ ─────────────                                                                    │
│ [S●]│ Métricas recientes:                                                               │
│     │ - Engagements correctos: 23 / 25 (92.0%)                                          │
│ [⚙] │ - Falsos positivos: 1                                                            │
│ ──  │ - Falsos negativos: 1                                                            │
│     │ - Tiempo medio de autorización: 12.3 s                                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. SettingsPage

Configuración del operador y de la sesión.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [CC] · AJUSTES                                  [DEFCON 3] [Op. J.GARCÍA ▾]             │
├─────┬──────────────────────────────────────────────────────────────────────────────────┤
│     │ Tabs: [Pantalla] [Audio] [Atajos] [Operador] [Sesión]                             │
│     │ ──────────────────────────────────────────────────────────────────────────────────│
│     │                                                                                  │
│     │ PANTALLA                                                                         │
│     │ ─────────────                                                                    │
│     │                                                                                  │
│     │ Modo visual:                                                                     │
│     │   ◉ Tactical Dark   ◯ Night Vision   ◯ Color-blind safe                          │
│     │                                                                                  │
│     │ Densidad:                                                                        │
│     │   ◉ Compact (militar)   ◯ Standard   ◯ Relaxed                                    │
│     │                                                                                  │
│     │ Tamaño tipográfico:                                                              │
│     │   ◉ Compact   ◯ Standard   ◯ Relaxed   ◯ XLarge                                   │
│     │                                                                                  │
│     │ Reducir animaciones:  ◯ Off  ◉ Auto (sigue sistema)  ◯ On                         │
│     │                                                                                  │
│     │ ─────                                                                            │
│     │ Mostrar leyenda APP-6:  [✓] Activado                                              │
│     │ Mostrar coordenadas cursor:  [✓] Activado                                         │
│     │ Mostrar mini-radar:  [✓] Activado                                                 │
│     │                                                                                  │
│     │ [Aplicar y guardar]                              [Restaurar valores por defecto] │
├─────┴──────────────────────────────────────────────────────────────────────────────────┤
│ ● Online · WS 28ms · API 12ms │ Op: J.GARCÍA │ Sensores: 4/4 │ DEFCON 3 │ 14:32:18 Z   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Estados globales (overlays)

### 9.1 EngagementAuthDialog (modal)

Ver `04-componentes.md` B.4 + `12-flujos-criticos.md`.

### 9.2 Comms loss overlay

Cuando se pierde conexión con backend:

- Banner crítico top "COMMS LOSS — última actualización hace XX s".
- Tracks del mapa pasan a opacidad 50 %.
- StatusBar dot rojo.
- Botones de engagement disabled con tooltip "No se pueden enviar comandos sin comms".

### 9.3 DEFCON change overlay

Cuando sube nivel DEFCON:

- Banner full-width 80px alto, color del nuevo DEFCON, slide-down 200ms.
- Texto: "DEFCON ahora en NIVEL 2 — IMMINENT ACTION" + descripción.
- Botón "[Acuse de recibo]" obligatorio para cerrar el banner.
- Sonido alarma (configurable).

### 9.4 Saturation warning

Cuando > 20 tracks no asignados a interceptores:

- Banner warning persistente "Saturación: 23 tracks no asignados, considere modo emergencia WTA".
- Botón "[Activar modo WTA emergencia (greedy)]" con confirmación.

---

## 10. Notas de layout responsive

- Por debajo de 1280 px: AuxPanel se colapsa por defecto (operador debe abrir manualmente).
- Por debajo de 1024 px: pantalla `LowResolutionWarning` bloqueante.
- Por encima de 2560 px: el grid de interceptores pasa a 4 columnas; lista de tracks muestra más rows visibles.
- La proporción mapa : lista en Dashboard se mantiene 60:40 en monitor base; en monitor ultra-wide (3440×1440) se calcula como `flex 6 / flex 4`.
