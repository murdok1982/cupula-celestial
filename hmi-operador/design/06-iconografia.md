# 06 — Iconografía táctica

> Iconos auxiliares de UI (no APP-6, que están en `05-simbologia-nato.md`). Set minimalista, lineal, geometría 90°.

---

## 1. Estilo

- **Trazo:** 1.5 px (en grid 24×24).
- **Stroke linecap:** `square`.
- **Stroke linejoin:** `miter` (esquinas a 90°, sin redondeo).
- **Container:** 24×24 px por defecto.
- **Color:** hereda `currentColor` (controlado por CSS).

**Fuente:** `lucide-react` (instalado como dependencia, ver `package.json`). Se complementa con iconos custom propios (carpeta `src/components/icons/` que crea Frontend) para los símbolos militares no presentes en Lucide.

---

## 2. Set completo

| Icono | Lucide name / custom | Uso |
|---|---|---|
| Radar | `Radar` | Sensores radar en barra de estado, capas de mapa |
| Satélite | `Satellite` | Sensores satélite, capa imagery |
| Dron | `Plane` (genérico) o **custom** `drone-quad-icon` | Tracks, interceptores |
| Helicóptero | `Plane` rotado o **custom** `heli-icon` | Tracks aéreos rotorcraft |
| Interceptor | **custom** `interceptor-icon` (dron con asterisco) | Interceptores propios |
| Jammer | **custom** `jammer-icon` (radio + ondas) | Indicador EW activo |
| Target lock | `Crosshair` | HUD video, slew-to-cue |
| No-fly zone | `BanIcon` superpuesto a `Plane` | Geofences civiles |
| Abort | `Octagon` con `X` central, o `OctagonAlert` | Botón abortar engagement |
| Fire (engage) | `Zap` o **custom** `engage-icon` (flecha con punta a llama) | Indicador engagement activo |
| Retreat | `Undo2` | Comando retornar interceptor a base |
| MFA Token | `KeyRound` o **custom** `token-fido2-icon` | Login + EngagementAuth |
| Huella biométrica | `Fingerprint` | EngagementAuth segundo factor |
| Friendly IFF | `ShieldCheck` | Track amigo IFF confirmado |
| Geofence | `Hexagon` | Mapa controls, capas |
| Alerta | `AlertTriangle` | Banners warning |
| Crítico | `OctagonX` (custom) o `AlertOctagon` | Banners críticos, comms loss |
| Info | `Info` | Tooltips, alerts informativas |
| Mute | `VolumeX` | Silenciar audio alertas (con confirmación) |
| Volumen | `Volume2` | Control de audio |
| Capa | `Layers` | Capa de mapa |
| Capas activas | `Layers3` | Multi-layer Cesium |
| Zoom in | `ZoomIn` | Cesium / video |
| Zoom out | `ZoomOut` | — |
| Home | `Home` | Volver vista por defecto del mapa |
| Bookmark | `Bookmark` | Track marcado |
| Hora Zulu | `Clock` | Status bar reloj |
| Settings | `Settings` | Acceso a configuración |
| User | `User` | Perfil operador |
| Logout | `LogOut` | Cerrar sesión |
| Lock | `Lock` | Estado sistema bloqueado |
| Unlock | `Unlock` | Sistema desbloqueado |
| Eye | `Eye` | Ver detalle |
| Eye-off | `EyeOff` | Ocultar capa |
| Filter | `Filter` | Filtros de lista |
| Sort | `ArrowUpDown` | Ordenar columna |
| Search | `Search` | Búsqueda |
| Plus | `Plus` | Añadir |
| Minus | `Minus` | Quitar |
| Check | `Check` | Confirmación |
| X (close) | `X` | Cerrar modal, descartar alerta |
| Refresh | `RefreshCw` | Recargar datos |
| Download | `Download` | Exportar audit log |
| Upload | `Upload` | Cargar ROE policy |
| Chevron-right | `ChevronRight` | Expandir, navegar |
| Chevron-down | `ChevronDown` | Expandir vertical |
| Chevron-left | `ChevronLeft` | Cerrar aux panel |
| Chevron-up | `ChevronUp` | Colapsar |
| Wifi | `Wifi` | Estado conexión OK |
| Wifi-off | `WifiOff` | Comms loss |
| Battery | `BatteryFull` / `Medium` / `Low` | Interceptor battery status |
| Signal | `Signal` / `SignalLow` | RSSI sensor / interceptor |
| Activity | `Activity` | Healthbar sensor |
| Database | `Database` | Audit log |
| Shield | `Shield` | ROE / política |
| Map | `Map` | Volver al mapa |
| List | `List` | Vista lista |
| Grid | `LayoutGrid` | Vista grid de feeds |

**Total: ~50 iconos.**

---

## 3. Tamaños

| Tamaño | Uso |
|---|---|
| `12 px` | Inline en texto secundario (estado, status badges) |
| `14 px` | Botones small, inputs |
| `16 px` | Botones default, badges con icono |
| `20 px` | Botones grandes, headers de card |
| `24 px` | Sidenav, header app |
| `32 px` | Empty states, headers principales |

Stroke se mantiene en 1.5 px regardless del tamaño (Lucide escala proporcionalmente).

---

## 4. Iconos custom — especificación SVG

Para iconos no presentes en Lucide, Frontend crea SVG con el siguiente template:

```tsx
// src/components/icons/InterceptorIcon.tsx
export function InterceptorIcon({ size = 24, ...props }: SVGProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      {...props}
    >
      {/* Drone outline + interceptor accent (star) */}
      <circle cx="12" cy="12" r="2" />
      <line x1="12" y1="4" x2="12" y2="10" />
      <line x1="12" y1="14" x2="12" y2="20" />
      <line x1="4" y1="12" x2="10" y2="12" />
      <line x1="14" y1="12" x2="20" y2="12" />
      <path d="M12 2 L13 4 L12 6 L11 4 Z" fill="currentColor" />
    </svg>
  );
}
```

---

## 5. Reglas de uso

- **Icono + texto** siempre, excepto en botones `icon` con `aria-label` y tooltip.
- **No icono solo en CTA principal** (los botones primarios SIEMPRE llevan texto, el icono es complementario).
- **Iconos en barra de navegación** llevan tooltip al hover.
- **Color del icono = color del texto** que lo acompaña (heredan `currentColor`).
- **No mezclar tipos**: en una misma vista no se mezclan iconos line con icons filled (todos line por defecto).

---

## 6. Iconos animados (raros, controlados)

| Icono | Animación | Trigger |
|---|---|---|
| `RefreshCw` | Spin 600ms infinito | Durante recarga activa |
| `Wifi` durante reconexión | Pulse opacity 0.4→1.0 | Estado "reconectando" |
| `Activity` en sensor degradado | Latido suave | RSSI bajo |

Las animaciones respetan `prefers-reduced-motion: reduce`.

---

## 7. Iconos PROHIBIDOS

- Emojis estilo (👀, 🚀, ✅) en UI funcional. **Excepción**: `⚠`, `⛔`, `▲▼` como caracteres Unicode universales en mensajes de error y modo CUD.
- Iconos con gradiente o color de fondo decorativo.
- Iconos "fun" (fuegos artificiales, partículas, etc.).
- Iconos con rasterización o sombras decorativas.

---

## 8. Mapeo a contexto operativo

```
SideNav:
├── Map        → vista DashboardPage
├── List       → TrackListPage
├── Zap        → EngagementsPage
├── Plane      → InterceptorsPage
├── Database   → AuditLogPage
├── Activity   → SimulatorPage
└── Settings   → SettingsPage

StatusBar:
├── Wifi/WifiOff → estado conexión
├── User       → operador autenticado
├── Radar/Satellite → sensores activos
├── ShieldCheck → DEFCON badge prefix
└── Clock      → hora Zulu

EngagementAuthDialog:
├── AlertTriangle → header warning
├── KeyRound   → PIN
├── Fingerprint → biométrica
├── ShieldCheck → token FIDO2
└── Zap        → AUTORIZAR button
```
