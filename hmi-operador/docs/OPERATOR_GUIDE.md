# Guia del Operador - HMI Cupula Celestial

Documento operativo para el personal de la unidad C-UAS. No reemplaza al
manual completo de la doctrina (S2/S3 del MdD), solo cubre la interaccion con
este HMI.

## 1. Acceso

1. Insertar tarjeta del operador o introducir identificador manualmente.
2. Introducir password (minimo 8 caracteres, politica del MdD aplica).
3. Cuando el sistema pida segundo factor, presentar el token FIDO2 (DIGENECO
   emite uno por operador; en banco se conservan tokens de respaldo).
4. Confirmar con el sensor biometrico del token o el boton fisico segun modelo.

Si el segundo factor falla 3 veces, la cuenta se bloquea y debe contactarse al
S6 de la unidad.

## 2. Panel principal (`/dashboard`)

```
+--------------------+------------------+------------------+
|  PISTAS            |     MAPA 3D      |  RECOMENDACION   |
|  ordenadas por TTI |  CesiumJS        |  LLM tactico     |
|                    |                  |                  |
|  TrackRow x N      |  Madrid centro   |  Pk, colateral,  |
|                    |  geofences NO-FLY|  ventana, rationale|
|                    |                  |                  |
|                    |                  |  AUTORIZAR  RECH |
+--------------------+------------------+------------------+
|     BARRA DE ESTADO: WS, DEFCON, hora Zulu, operador     |
+----------------------------------------------------------+
```

### Lista de pistas (izquierda)

- Ordenadas por **prioridad descendente**: amenazas confirmadas con TTI bajo
  primero. Vea `src/lib/tti.ts` para la formula exacta.
- Cada fila lleva borde izquierdo de severidad:
  - Rojo intenso pulsante: TTI < 10 s (engagement inminente).
  - Ambar: TTI < 30 s.
  - Cyan: TTI < 120 s.
  - Gris: sin TTI o > 120 s.
- Etiqueta `REC` parpadeante en cyan indica que la pista tiene una
  recomendacion LLM **PENDING** (no autorizada todavia).

### Mapa 3D (centro)

- Centro inicial: Madrid (Castellana 40.4168 N, 3.7038 O), altura 6 km, pitch
  -45 grados.
- **Simbologia NATO APP-6D**: diamante rojo = HOSTIL, rectangulo azul = AMIGO,
  cuadrado verde = NEUTRAL, circulo amarillo con `?` = DESCONOCIDO.
- Lineas leader **cyan** muestran el vector velocidad proyectado a 30 s.
- Circulos rojos translucidos: zonas NO-FLY (hospitales, escuelas, embajadas).
  Por defecto activos. Toggle desde panel superior derecho del mapa.
- Click sobre pista: selecciona (panel derecho actualiza).
- Doble-click sobre pista: la camara vuela hasta encuadrarla (slew-to-cue).

### Panel derecho (recomendacion)

Muestra la recomendacion activa con todos los campos clave:

- `recommendation`: ENGAGE / WARN / TRACK / OBSERVE / ABORT.
- `pk_estimated`: probabilidad de neutralizacion calculada por WTA + LLM.
- `collateral_risk`: NEGLIGIBLE / LOW / MEDIUM / HIGH.
- Ventana de engagement con countdown (caduca cuando el target queda fuera
  de cobertura efectiva).
- `rationale` del LLM en lenguaje natural (la justificacion humana revisable).
- Interceptores propuestos por el WTA.
- ROE consultadas.

## 3. Autorizacion de engagement

Solo aparece el boton si:

- La recomendacion es `ENGAGE`.
- `operator_action_required: true`.
- El rol del operador cubre el `authorization_level` requerido:
  - `OPS-OFFICER` -> OPERADOR o superior.
  - `OFICIAL_TACTICO` -> Oficial tactico o superior.
  - `JEFE_FUEGO` -> solo Jefe de Fuego.

Procedimiento (botones o `Ctrl+A`):

1. Aparece modal **bloqueante** con recapitulacion.
2. **Paso 1**: introducir PIN de 6 digitos. El PIN se hashea en cliente con
   SHA-256 antes de salir del navegador.
3. **Paso 2**: pulsar el token FIDO2 (huella o boton). El navegador firma el
   challenge del backend.
4. POST a `/engagement/authorize` con:
   ```json
   {
     "recommendation_id": "R-9821",
     "track_id": "T-4471",
     "decision": "AUTHORIZE",
     "pin_hash": "<base64 SHA-256>",
     "fido2_assertion": { ... }
   }
   ```
5. Si responde `authorized: true`, el comando va al `swarm-controller` y se
   registra una entrada **inmutable** en el `audit-log` (cadena Merkle +
   firma STANAG 4774/4778).

**Timeout 30 s**: si no completa los dos factores en ese plazo, el dialogo se
cierra y la accion se cancela (no se envia). Esto cumple MIL-STD-1472H.

### Rechazar o diferir

- `Ctrl+R`: rechaza la recomendacion. Requiere motivo en texto (obligatorio).
- `Ctrl+D`: difiere la decision. El LLM revisara con mas datos en el siguiente
  ciclo. Requiere motivo.

Ambos pasan tambien por doble factor (PIN + FIDO2) y quedan en audit log.

## 4. Vista de pistas detallada (`/tracks`)

Tabla de alta densidad con todos los atributos:
- Coordenadas WGS84 + MGRS aproximado (etiqueta, NO usar para tiro).
- Vector velocidad, rumbo, modo de movimiento (CV/CA/CT).
- Confianza de clasificacion (%).
- Contribuciones por sensor: pesos relativos del RADAR_AESA, EO_IR, RF,
  ACUSTICA, ADSB.

## 5. Interceptores (`/interceptors`)

Estado de cada efector:
- IDLE / READY / LAUNCH / CRUISE / TERMINAL / RTB / LOST / DESTROYED.
- Carga: KINETIC / NET_CAPTURE / DIRECTED_RF / NONE.
- Bateria, link quality, fuel remaining.
- Feed EO/IR sintetico (stub WebRTC en MVP). En produccion sera el video real
  embarcado, con telemetria overlaid (alt, spd, hdg, lock status).

## 6. Audit log (`/audit`)

- Lista paginada de eventos firmados (50 por pagina).
- Cada evento incluye `seq`, hora Zulu, tipo, actor, rol, hash truncado.
- Boton **Verificar cadena**: llama al endpoint
  `GET audit-log/v1/verify_chain`. Resultado se muestra como Alert verde si
  OK, rojo si la cadena esta rota (con el `seq` exacto del fallo).
- Las autorizaciones letales (`ENGAGEMENT_AUTHORIZED`,
  `ENGAGEMENT_EXECUTED`) se resaltan en rojo.

## 7. Simulador (`/simulator`) - solo desarrollo

Disponible solo si `VITE_USE_MOCKS=true`. Botones para inyectar escenarios:
- **Vigilancia**: sin amenazas.
- **Hostil unitario**: un dron HOSTIL + recomendacion LLM ENGAGE.
- **Enjambre**: 8 drones convergentes, DEFCON 2.
- **Spoofing GPS**: divergencia ADS-B vs radar primario.
- **Falso positivo**: ave migratoria clasificada inicialmente como pista.

## 8. Ajustes (`/settings`)

- **Modo de pantalla**: tactico / vision nocturna / daltonico.
- **Tamano de fuente**: 85-150%.
- **Alertas sonoras**: on/off.
- **Idioma**: es / en / fr.

Ningun ajuste afecta el comportamiento del backend; son solo de presentacion.

## 9. Salidas de emergencia

- `Ctrl+Shift+L`: logout inmediato. Limpia tokens en memoria.
- Cerrar pestana / refrescar pagina: limpia todo el estado (incluyendo
  tokens). Esto es **intencional**: la estacion no debe persistir credenciales.
- Tras 10 minutos sin actividad de raton/teclado, sesion se cierra
  automaticamente y vuelve al login.

## 10. Reportar incidencias

Toda anomalia del HMI (UI congelada, datos inconsistentes, alertas falsas)
debe reportarse al S6 con captura + hora Zulu exacta + `track_id`/`event_id`
implicado. La hora Zulu se muestra siempre en la barra de estado inferior.
