# Cupula Celestial - HMI Operador

HMI tactico C2 para el sistema contra-UAS **Cupula Celestial** del Ministerio de
Defensa de Espana. Implementa el control humano significativo (Meaningful Human
Control, MHC) sobre las decisiones de engagement letal mediante autorizacion de
doble factor (PIN + FIDO2).

> Este modulo es un sub-sistema del programa. Para el contexto global ver
> [`../docs/01-vision-y-doctrina.md`](../docs/01-vision-y-doctrina.md) y
> [`../docs/02-arquitectura-general.md`](../docs/02-arquitectura-general.md).

---

## Stack

| Capa | Tecnologia |
|------|------------|
| Lenguaje | TypeScript 5.6 strict |
| Framework | React 19 + Vite 6 |
| Estilos | Tailwind 3.4 + shadcn/ui + lucide-react |
| Mapa 3D | CesiumJS 1.122 (terreno offline o Ion opcional) |
| Estado | Zustand 4 + TanStack Query 5 |
| Forms | react-hook-form + Zod |
| WebSocket | API nativa con reconexion exponencial |
| i18n | i18next (es / en / fr OTAN) |
| Test | Vitest + Testing Library + Playwright |
| Mocks | MSW 2 (modo offline) |

---

## Arranque rapido (offline con mocks)

```bash
pnpm install
pnpm msw:init              # genera public/mockServiceWorker.js (ya commiteado)
pnpm dev                   # http://127.0.0.1:5173
```

Credenciales mock: cualquier usuario + password >= 8 caracteres.
La MFA FIDO2 se simula automaticamente cuando `VITE_USE_MOCKS=true`.

## Arranque conectado al backend (Rust hmi-gateway)

1. Copiar `.env.example` a `.env.local` y poner `VITE_USE_MOCKS=false`.
2. Apuntar `VITE_API_BASE_URL` y `VITE_WS_URL` al `hmi-gateway` real.
3. `pnpm dev`.

## Comandos

```bash
pnpm dev                   # servidor de desarrollo Vite (puerto 5173)
pnpm build                 # bundle de produccion (tsc + vite build)
pnpm preview               # servidor estatico del bundle
pnpm test                  # Vitest unitarios
pnpm test:coverage         # cobertura V8
pnpm test:e2e              # Playwright headless con MSW
pnpm test:e2e:ui           # Playwright modo interactivo
pnpm lint                  # ESLint sin warnings permitidos
pnpm typecheck             # tsc --noEmit
pnpm format                # Prettier
```

## Variables de entorno

Ver [`.env.example`](.env.example). Todas las URLs y flags vienen de
`import.meta.env` y se validan con Zod al arranque (ver `src/env.ts`). Una
configuracion invalida detiene la app antes de pintar nada.

| Variable | Por defecto | Descripcion |
|----------|-------------|-------------|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8080` | hmi-gateway Rust |
| `VITE_WS_URL` | `ws://127.0.0.1:8080/ws` | WebSocket pistas/recomendaciones/alertas |
| `VITE_AUDIT_URL` | `http://127.0.0.1:9300` | audit-log service |
| `VITE_SWARM_URL` | `http://127.0.0.1:9200` | swarm-controller |
| `VITE_DECISION_URL` | `http://127.0.0.1:8002` | decision-engine (LLM) |
| `VITE_CESIUM_ION_TOKEN` | (vacio) | token Ion opcional. Sin token usa terreno offline |
| `VITE_USE_MOCKS` | `true` | activa MSW para desarrollo offline |
| `VITE_DEFAULT_LOCALE` | `es` | idioma inicial (`es`/`en`/`fr`) |
| `VITE_IDLE_TIMEOUT_MS` | `600000` | auto-logout por inactividad (10 min) |
| `VITE_AUTH_DIALOG_TIMEOUT_MS` | `30000` | timeout del modal de autorizacion (MIL-STD-1472) |

---

## Arquitectura del cliente

```
src/
  env.ts                   <- variables de entorno tipadas (Zod)
  main.tsx                 <- bootstrap: MSW opcional + escenario default
  router.tsx               <- React Router + ProtectedLayout
  App.tsx                  <- QueryClient + TooltipProvider + ErrorBoundary
  i18n.ts                  <- i18next es/en/fr

  api/                     <- cliente HTTP con JWT auto, refresh, traza ID
  auth/                    <- AuthProvider, useAuth, MfaFido2 (WebAuthn)
  store/                   <- Zustand (auth, tracks, recommendations, alerts, ...)
  hooks/                   <- useWebSocket, useTracks, useHotkeys, useIdleLogout
  components/
    ui/                    <- primitivos shadcn (button, dialog, alert, ...)
    tactical/              <- ThreatBadge, RecommendationCard, EngagementAuthDialog, ...
    map/                   <- CesiumMap, MapControls, GeofenceLayer
    layout/                <- AppShell, TopBar, StatusBar, ErrorBoundary
  pages/                   <- LoginPage, DashboardPage, AuditLogPage, SimulatorPage, ...
  lib/                     <- threat, time (Zulu DTG), coords, tti, validators (Zod)
  locales/                 <- es.json, en.json, fr.json
  mocks/                   <- MSW handlers + escenarios sinteticos
  tests/                   <- Vitest unitarios + Playwright E2E
```

### Flujo nominal de un engagement

1. Operador entra en `/login`, autentica con identificador + password.
2. Backend responde con `requires_mfa=true`. Se muestra paso 2: token FIDO2.
3. Tras MFA OK -> `/dashboard`. Se abre WebSocket autenticado.
4. Llegan pistas (`tracks.confirmed`) y recomendaciones (`recommendations`).
5. Si una recomendacion lleva `recommendation: "ENGAGE"` y
   `operator_action_required: true`, el panel derecho la muestra con el boton
   AUTORIZAR habilitado solo si el rol del operador supera
   `authorization_level`.
6. Al pulsar AUTORIZAR (o `Ctrl+A`), modal bloqueante:
   - Recapitulacion (pista, rationale LLM, interceptores propuestos).
   - PIN de 6 digitos (hash SHA-256 en cliente).
   - FIDO2 (token fisico / biometrica) via `navigator.credentials.get`.
   - Timeout 30 s con countdown visible.
7. POST a `/engagement/authorize` con `pin_hash` + `fido2_assertion`.
8. Entrada inmutable en `audit-log`. Estado de la recomendacion -> AUTHORIZED.

---

## Seguridad cliente

- **JWT en memoria** (Zustand). No localStorage / sessionStorage. Refrescar la
  pagina obliga a re-autenticar; es por diseno: una estacion de operador C-UAS
  no debe persistir credenciales en disco.
- `refresh_token` deberia rotarse via cookie `HttpOnly SameSite=Strict` desde el
  gateway. Si llega como JSON (modo bridge) se mantiene tambien en memoria.
- **CSP estricta** en `index.html` y `nginx.conf` (produccion).
- **Cabeceras**: X-Frame-Options DENY, X-Content-Type-Options nosniff,
  Referrer-Policy no-referrer, Permissions-Policy denegando camara/microfono/geo.
- **Auto-logout** por inactividad (10 min por defecto). Eventos: mousedown,
  keydown, wheel, touchstart.
- **Sin telemetria a terceros.** Errores van al `audit-log` propio del programa.
- **CSP `unsafe-eval`** es necesaria por los WebAssembly Workers de Cesium. Es
  trade-off conocido; el bundle se sirve con `Cross-Origin-Embedder-Policy:
  require-corp` y subresources `integrity`.

---

## Accesibilidad

Objetivo: **MIL-STD-1472H + WCAG 2.1 AA**.

- Contraste minimo 7:1 en informacion critica (HOSTIL, autorizacion).
- Tamano de fuente escalable (85%-150%) desde Settings.
- Modo daltonico (deuteranopia) y modo vision nocturna (rojo monocromo).
- Foco visible siempre (cyan 2 px outline + 2 px offset).
- Atajos de teclado documentados en
  [`docs/KEYBOARD_SHORTCUTS.md`](docs/KEYBOARD_SHORTCUTS.md).
- `aria-label` en simbolos NATO, ThreatBadge, controles de mapa.
- `aria-live` en countdowns y resultados de autorizacion.
- No se transmite informacion solo por color (siempre icono + texto + simbolo).

---

## Modos especiales

- **Tactico** (defecto): oscuro con luminancia ~5%, acento cyan.
- **Vision nocturna**: filtro rojo monocromo, preserva legibilidad bajo NVG.
- **Daltonico**: hostiles -> magenta, neutrales -> azul.

Se cambian desde `/settings` o por hotkey (configurable).

---

## Docker

```bash
docker build -t cupula-hmi:dev \
  --build-arg VITE_API_BASE_URL=https://hmi-gw.cupula.defensa.gob.es \
  --build-arg VITE_WS_URL=wss://hmi-gw.cupula.defensa.gob.es/ws \
  .
docker run --rm -p 8443:8443 cupula-hmi:dev
```

Imagen final: `nginx:1.27-alpine` no-root con healthcheck en `/health` y
cabeceras de seguridad estrictas (ver `nginx.conf`).

---

## Pendientes

- Integracion real con `hmi-gateway` (queda esperar contrato firme del Backend).
- WebRTC real para video EO/IR de interceptores (actualmente stub canvas).
- Modulo de exportacion forense STANAG 4774/4778 (queda en backend audit-log).
- Internalizacion completa (algunos strings tacticos siguen en es-codigo).

## Licencia

Software clasificado para uso del Ministerio de Defensa de Espana. No
distribuir. Ver clasula de propiedad en
[`../docs/00-resumen-ideas.md`](../docs/00-resumen-ideas.md).
