# 12 — Flujos críticos

> Recorridos paso a paso de los flujos operativos más sensibles. Cada paso especifica: lo que ve el operador, lo que puede hacer, qué atajos están disponibles, qué errores se pueden producir.

---

## 1. Flujo de autorización de engagement letal

**Objetivo:** desde la detección de un track hostil hasta la confirmación de orden cinética enviada al interceptor.

**Actor:** OPS-OFFICER autenticado.

**Latencia objetivo:** desde recomendación visible hasta autorización: **< 30 segundos**.

### Paso 1 — Detección automática

- El sistema detecta un track nuevo (sensor fusión → JPDAF → classifier).
- Si clasificación = `HOSTIL_CONFIRMADO` o `AMENAZA_PROBABLE`:
  - **Visual:** Track aparece en lista (slide-down 200 ms), pulse-threat 3 ciclos. En mapa Cesium aparece símbolo APP-6 rojo/naranja con halo pulsante.
  - **Audio (opcional):** beep mil-spec 800 Hz / 150 ms.
  - **Live region** anuncia "Nuevo track T-4471, HOSTIL CONFIRMADO".
- Live region: `aria-live="polite"` para lectores de pantalla.

### Paso 2 — Operador selecciona el track

- Click o `Enter` con flechas en lista → fila resaltada con border-left `accent-mag`.
- AuxPanel actualiza: muestra `RecommendationCard` en estado `loading` (skeleton + "Analizando con LLM táctico…").
- Backend invoca LLM (`Llama-3.1-8B`) con contexto: track data + sensores + ROE + geografía.

### Paso 3 — Recomendación LLM disponible

- `RecommendationCard` se renderiza con:
  - Acción: `ENGAGE` en text-2xl color `accent-engage`.
  - Interceptores propuestos: `I-12, I-19`.
  - Pk: `89.0 %`.
  - Riesgo colateral: `BAJO`.
  - Justificación textual completa (sin truncar).
  - Nivel de autorización: `OPS-OFFICER`.
- Footer: `[Rechazar]` (ghost) + `[→ AUTORIZAR]` (engage variant).

### Paso 4 — Operador presiona AUTORIZAR

- `Ctrl+E` global con track seleccionado, o click en botón AUTORIZAR.
- `EngagementAuthDialog` abre (modal bloqueante).
- Backdrop opacidad 0.85; el contexto detrás sigue visible (el operador sigue viendo el mapa y la lista).
- Foco se transfiere al input PIN automáticamente.

### Paso 5 — Doble factor (dialog activo)

El operador debe completar 3 factores en cualquier orden:

1. **PIN (6 dígitos)**: input password, dots opacos según chars.
2. **Token FIDO2 físico**: dialog espera tap del token (WebAuthn API). Indicador "⬤ Detectando…" → "✓ Token validado".
3. **Huella biométrica**: requiere tap en lector. Indicador "⬤ Esperando lectura…" → "✓ Huella validada".

Mientras tanto, **countdown de 30 segundos** baja en text-3xl mono tabular. Color cambia a `accent-engage` en los últimos 5 segundos con pulse 1.5s × 2.

**Si un factor falla:**

- Mensaje específico: "PIN incorrecto. Intento 1/3." en color `status-error`.
- El countdown NO se reinicia.
- Tras 3 intentos fallidos en cualquier factor: dialog cierra automáticamente, sesión bloqueada, audit log evento `AUTH_FAILED_THREE_TIMES`.

### Paso 6 — Los 3 factores OK

- Botón AUTORIZAR pasa de disabled a enabled (background `accent-engage`).
- Operador clica AUTORIZAR (o `Enter` con foco en el botón).
- Estado `validating`: spinner inline + texto "AUTORIZANDO…".
- Backend firma con HSM, valida ROE final, envía orden cinética al interceptor.

### Paso 7 — Confirmación o denegación

**Caso éxito:**

- `flash-success` 300 ms en borde del dialog (verde).
- Dialog se cierra.
- Banner top success "Engagement autorizado para T-4471. Interceptores I-12, I-19 en ruta. Hash auditoría: 0xab12cd…" (visible 5s, después se mueve al audit log).
- Beep mil-spec dual 1200 + 1500 Hz (opcional).
- Lista de tracks: row del T-4471 ahora muestra badge "EN ENGAGEMENT" + border-left `accent-engage`.
- `EngagementsPage` muestra el engagement como activo.

**Caso denegación (ROE invalida en último momento):**

- Mensaje persistente "Engagement DENEGADO: civil detectado en zona de impacto. ROE-3 invalida."
- Beep grave 200 Hz / 250 ms.
- Botón "Acuse de recibo" obligatorio para cerrar.
- Audit log: evento `AUTH_DENIED_BY_ROE`.

**Caso timeout (30 s sin completar):**

- Dialog cierra automáticamente con banner amber "Ventana de autorización expirada. Si la amenaza persiste, repita el flujo."
- Audit log: `AUTH_TIMEOUT`.

---

## 2. Flujo de saturación

**Disparador:** > 20 tracks no asignados a interceptores con TTI < 60s.

### Paso 1 — Detección

- Backend marca estado `SATURATION_NEAR` o `SATURATION_CRITICAL`.

### Paso 2 — Alerta visual

- Banner warning top: "Saturación inminente: 23 tracks no asignados con TTI crítico" (compacto, 40 px).
- StatusBar dot pasa a amarillo si NEAR, rojo si CRITICAL.
- En lista de tracks, los > 20 tracks sin asignar reciben badge "NO ASIG." amarillo.

### Paso 3 — Acción sugerida

- Botón en banner: "Activar WTA emergencia (greedy)".
- Click → confirmación: "El modo greedy asigna interceptores por prioridad TTI sin optimización global. ¿Continuar?"
- Sí → backend cambia algoritmo WTA. Banner actualiza a "Modo WTA emergencia activo".

### Paso 4 — Asignaciones masivas

- Las recomendaciones del LLM cambian: en lugar de una sola, aparecen múltiples en lista vertical en AuxPanel.
- Cada una con sus propios botones AUTORIZAR / Rechazar.
- Opción "Autorizar todas las clase HOSTIL_CONFIRMADO" con doble factor único — autoriza el batch.

### Paso 5 — Reset

- Cuando saturación cae a < 10 tracks no asignados: banner cambia a "Saturación normalizada" success y se auto-cierra en 5s.

---

## 3. Flujo de pérdida de comunicaciones (Comms Loss)

**Disparador:** WebSocket sin respuesta > 5s, o latencia API > 2000 ms.

### Paso 1 — Degradación detectada

- StatusBar dot pasa a amarillo, latencia mostrada en rojo (e.g., "WS 2540ms").

### Paso 2 — Degradación confirmada (timeout 5s)

- Banner crítico top: "COMMS DEGRADADO — última actualización hace 8s".
- StatusBar dot pasa a rojo.
- Tracks del mapa: opacidad 60%, etiqueta "STALE" en label.
- Beep mil-spec sweep 600 → 300 Hz (comms loss).
- Botones de engagement: disabled con tooltip "Comms degradado — engagements bloqueados".
- AuxPanel: si había `EngagementAuthDialog` activo, NO se cierra pero muestra warning "Comms degradado — autorización pausada".

### Paso 3 — Modo offline visible

- Sidebar: cada pantalla recibe overlay sutil rayado diagonal en navItems no disponibles offline.
- Vista AuditLog: sigue accesible (último estado cacheado).
- Mapa Cesium: sigue mostrando última posición conocida con timestamp visible "Última actualización: 14:30:08 Z".

### Paso 4 — Restauración

- WebSocket reconecta → backend resincroniza.
- Banner success "Comms restaurado. Sincronización completa." (5s, auto-cierra).
- Tracks vuelven a opacidad 100 %, badges "STALE" desaparecen.
- Beep mil-spec sweep 300 → 600 Hz.

### Paso 5 — Audit log

- Eventos `COMMS_DEGRADED` y `COMMS_RECOVERED` registrados con duración total del incidente.

---

## 4. Flujo de cambio de DEFCON

**Disparador:** decisión del oficial jefe de fuego o automática (sistema detecta múltiples hostiles).

### Paso 1 — Comunicación de cambio

- Backend WebSocket emite evento `DEFCON_CHANGED` con nuevo nivel y razón.

### Paso 2 — Banner cambio

- Banner full-width 80 px alto, color del nuevo DEFCON, slide-down 200 ms.
- Texto: "DEFCON ahora en NIVEL 2 — INMINENT ACTION. Razón: múltiples hostiles confirmados."
- Botón "Acuse de recibo" obligatorio.
- Beep mil-spec triple (1000 Hz, 3 × 100 ms).

### Paso 3 — Cambios sistémicos en UI

- `DefconIndicator` en StatusBar: cross-fade 200 ms al nuevo color.
- En DEFCON 1: bordes laterales del viewport pulsan 1 ciclo durante 2 s. Después, persiste un borde sutil de 2 px en `defcon-1`.

### Paso 4 — Confirmación

- Operador acusa recibo → banner se cierra.
- Audit log: `DEFCON_ACKNOWLEDGED_BY_OPERATOR`.

### Paso 5 — Cambios a la baja

- Si DEFCON baja: banner verde slide-down, sin pulse, mensaje sobrio "DEFCON ahora en NIVEL 4 — INCREASED READINESS".
- Sin sonido (no urgencia).

---

## 5. Flujo de aborto de engagement en curso

**Disparador:** operador detecta civil entrando en zona de impacto, o LLM emite alerta sobrevenida.

### Paso 1 — Trigger

- Operador presiona `Ctrl+Shift+A` con engagement seleccionado, o clica botón [Abortar] en EngagementsPage.

### Paso 2 — Confirmación

- Modal AlertDialog (más simple que EngagementAuth): "¿Abortar ENG-2026-05-23-001? La acción es irreversible y los interceptores recibirán orden de abort."
- Botones: [Cancelar] (ghost) + [ABORTAR] (danger).

### Paso 3 — Ejecución

- Operador clica ABORTAR → backend envía orden abort a interceptores.
- Spinner inline "Enviando orden de abort…" 1–2 s.

### Paso 4 — Confirmación

- Banner success "Engagement ENG-001 abortado. Interceptores I-12, I-19 retornando a base."
- Lista de tracks: badge "EN ENGAGEMENT" → "ABORT" en color status-warning.
- Audit log: `ENGAGEMENT_ABORTED_BY_OPERATOR` + razón opcional (campo de texto en el modal de confirmación).

---

## 6. Flujo de modo simulación

**Objetivo:** entrenamiento sin afectar sistemas reales.

### Paso 1 — Entrada al simulador

- Navegación a SimulatorPage.
- Banner persistente top: "ⓘ MODO SIMULACIÓN ACTIVO — ninguna acción afecta sistemas reales".
- Color background sutilmente distinto (tinte azul muy ligero) para que el operador no confunda con producción.
- StatusBar muestra "SIM" badge.

### Paso 2 — Selección de escenario

- Lista de escenarios. Click → "Iniciar".
- Toda la app entra en modo simulación: tracks, recomendaciones, interceptores, todo sintético.

### Paso 3 — Operación

- Los flujos son idénticos al modo real: el operador autoriza engagements igual.
- Cada autorización registra evento `SIM_ENGAGEMENT_AUTHORIZED` (NO `ENGAGEMENT_AUTHORIZED`).
- Las métricas (tiempo de respuesta, decisiones correctas) se calculan.

### Paso 4 — Salida

- Click "Salir simul." → confirmación: "¿Salir del modo simulación? Los datos del escenario se guardarán en el histórico de entrenamiento."
- Sí → vuelve a modo real, banner desaparece.

---

## 7. Flujo de cambio de modo visual

**Disparador:** operador en sala muy oscura quiere preservar visión nocturna.

- `Ctrl+Shift+M` (cycle Tactical → Night Vision → CUD → Tactical).
- Cambio instantáneo de variables CSS (sin animación).
- Toast 2s: "Modo visual: Night Vision activo".
- Si en EngagementAuthDialog: el modal NO se cierra, continúa el flujo en nueva paleta.

---

## 8. Flujo de bloqueo de sesión

**Disparador:** operador presiona `Ctrl+L` o inactividad de 10 minutos.

### Paso 1 — Bloqueo

- Overlay full-screen `bg-overlay`.
- Card central "Sesión bloqueada. Reautentíquese para continuar."
- Input PIN + lector FIDO2.

### Paso 2 — Detrás del overlay

- El backend SIGUE recibiendo eventos, los tracks siguen actualizándose, pero el operador no los ve.
- Si un evento crítico ocurre (nuevo hostil), beep sonoro fuerte (sin silencio posible durante bloqueo).
- Después de 60 s sin reautenticación + evento crítico activo: alerta al oficial supervisor por canal lateral (no UI HMI).

### Paso 3 — Desbloqueo

- PIN OK + FIDO2 OK → overlay fade-out 100 ms.
- Audit log: `SESSION_LOCKED`, `SESSION_UNLOCKED` con duración entre ambos.

---

## 9. Flujo de regenerar recomendación LLM

**Disparador:** operador no está de acuerdo con la recomendación inicial, o cambian condiciones.

- Botón discreto en `RecommendationCard` header: "↻ Regenerar".
- Click → confirmación rápida "¿Regenerar recomendación con datos actuales?".
- Sí → estado loading, nueva invocación LLM.
- La recomendación nueva puede diferir; el audit log registra ambas y la decisión final.

---

## 10. Tabla resumen — flujos y tiempos objetivo

| Flujo | Operador presiona... | Sistema responde en... | Acción finaliza en... |
|---|---|---|---|
| Selección track | Click / Enter | < 100 ms (highlight + AuxPanel skeleton) | LLM responde 1–3s |
| Autorización engagement | Ctrl+E | < 100 ms (dialog abre) | 5–30 s (doble factor + envío) |
| Aborto engagement | Ctrl+Shift+A | < 100 ms (confirm modal) | 1–2s (backend ACK) |
| Saturation switch to greedy | Click botón en banner | < 200 ms (confirm) | 1–2s (algoritmo cambia) |
| Comms loss detection | (automático) | 5s timeout | inmediato (banner) |
| Comms recovery | (automático) | < 1s post-reconnect | inmediato |
| DEFCON change | (push from backend) | < 200 ms (banner slide) | hasta acuse |
| Modo visual cambio | Ctrl+Shift+M | < 50 ms (CSS vars) | inmediato |
| Sesión bloqueo | Ctrl+L | < 100 ms (overlay) | hasta reauth |
