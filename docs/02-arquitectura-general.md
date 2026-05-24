# 02 — Arquitectura general

## Vista de capas

```
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 4 — EFECTORES (Enjambre interceptor)                      │
│  N x drones loitering con VLM embarcado + carga cinética/red    │
│  Mesh MANET, autonomía terminal bajo ROE                        │
└─────────────────────────────────────────────────────────────────┘
                ▲   comandos cifrados   │   telemetría/vídeo
                │                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 3 — C2 / ORQUESTADOR (el "cerebro")                       │
│  - Track manager (fusión multisensor JPDAF/MHT)                 │
│  - Threat classifier (ensemble: CNN + reglas + XGBoost)         │
│  - Weapon-Target Assignment (WTA: Hungarian + munkres + LP)     │
│  - Engagement recommender (LLM táctico, RAG sobre doctrina)     │
│  - Operator HMI (Cesium 3D + alertas + slewing manual)          │
└─────────────────────────────────────────────────────────────────┘
                ▲   pistas + clasificación                        ▲
                │                                                 │
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 2 — FUSIÓN LOCAL DE NODO                                  │
│  Edge aggregator por batería: pre-fusión, asociación,           │
│  filtrado de clutter, IFF cross-check.                          │
│  Hardware: Jetson AGX Orin 64GB / x86 ruggerizado               │
└─────────────────────────────────────────────────────────────────┘
                ▲    streams sensor crudo / detección                ▲
                │                                                 │
┌─────────────────────────────────────────────────────────────────┐
│  CAPA 1 — SENSORES DISTRIBUIDOS                                 │
│  • Radar AESA banda X (0,01 m² @ 8 km)                          │
│  • Radar pasivo / multilateración                               │
│  • RF spectrum sensing (detección de C2/telemetría enemiga)     │
│  • Acústica array (8–16 micrófonos MEMS)                        │
│  • EO/IR gimbal (long range, slew-to-cue)                       │
│  • Feed satelital (LEO observation: PAZ, Ingenio, comercial)    │
│  • ADS-B + transpondedor IFF Mode 5                             │
└─────────────────────────────────────────────────────────────────┘
```

## Vista de servicios (microservicios)

```
                  ┌──────────────────────┐
                  │   sensor-ingest      │  (Rust + Axum)
                  │  gRPC streams, Kafka │
                  └──────────┬───────────┘
                             ▼
                  ┌──────────────────────┐
                  │   track-fusion       │  (Rust + nalgebra)
                  │  JPDAF, MHT, IMM     │
                  └──────────┬───────────┘
                             ▼
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐      ┌──────────────┐
│ threat-class │    │ correlation  │      │  iff-check   │
│ (Python/ONNX)│    │  (radar/EO)  │      │  (Mode5/ADS) │
└──────┬───────┘    └──────┬───────┘      └──────┬───────┘
       └────────────────────┴─────────────────────┘
                            ▼
                  ┌──────────────────────┐
                  │  decision-engine     │  (Python + Ray)
                  │  WTA + LLM recommender│
                  └──────────┬───────────┘
                             ▼
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐      ┌──────────────┐
│  operator-   │    │  swarm-       │     │  audit-log   │
│  hmi-gw      │    │  controller   │     │  (immutable) │
│  (WebSocket) │    │  (MAVLink2)   │     │              │
└──────────────┘    └──────────────┘      └──────────────┘
```

## Flujo nominal de un engagement

1. **t=0** Radar AESA detecta firma micro-Doppler compatible con UAV a 6 km.
2. **t=0,3 s** `sensor-ingest` publica detección. `track-fusion` abre track tentativo.
3. **t=0,8 s** Pasive RF sensing confirma huella espectral 2,4/5,8 GHz. Confianza ↑.
4. **t=1,2 s** EO/IR slew-to-cue, gimbal apunta. CNN clasifica: "rotary-UAV cuadricóptero".
5. **t=1,5 s** `iff-check` no encuentra transpondedor amigo. Track → **HOSTIL**.
6. **t=2 s** `decision-engine` evalúa: distancia, vector, valor del activo defendido.
7. **t=2,3 s** LLM táctico genera recomendación: "Engagement con 2 interceptores
   desde nodo NE, ventana 4 s, Pk estimada 0,89". Mostrado en HMI.
8. **t=3 s** Operador autoriza con doble-tap biométrico (huella + token físico).
9. **t=3,2 s** `swarm-controller` envía waypoint cifrado a 2 interceptores en alerta.
10. **t=3–8 s** Drones cruise hacia el objetivo, telemetría en vivo.
11. **t=8 s** A 80 m del objetivo, el VLM embarcado verifica visualmente: "objeto
    coincide con perfil enemigo, sin marca de aliado, sin civil colateral".
12. **t=8,3 s** Terminal homing: kinetic kill o red de captura.
13. **t=8,5 s** `audit-log` registra cadena de decisión completa para revisión.

**Latencia sensor-to-shooter total: ~3 s.** Tiempo total a kill: ~8–10 s.

## Modos degradados

| Fallo | Comportamiento |
|-------|----------------|
| Pérdida GPS | Navegación VIO (visual-inertial odometry) + waypoint relativo |
| Pérdida link operador | Modo "loiter & hold" hasta restauración o RTH |
| Pérdida orquestador | Líder de enjambre asume rol, ROE pre-cargado |
| Jamming RF | Frequency-hopping LPI/LPD + relé satelital |
| Sensor único caído | Degradación de Pd, no de funcionamiento |
