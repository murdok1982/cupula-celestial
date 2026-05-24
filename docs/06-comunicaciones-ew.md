# 06 — Comunicaciones y resiliencia EW

## Arquitectura de enlaces

```
Operador ───TLS 1.3/QUIC───  Orquestador C2  ──Link 16/SATCOM─── Otro C2/CMD
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
      ┌───────▼─────┐     ┌───────▼─────┐     ┌───────▼─────┐
      │ Nodo sensor │     │ Nodo sensor │     │ Estación    │
      │ banda X     │     │ RF/acústica │     │ EO/IR       │
      └─────────────┘     └─────────────┘     └─────────────┘
              │
              ▼   enlace de mando interceptores
        ┌──────────────────────────────────────────┐
        │ MANET mesh malla (frequency-hopping)     │
        │ 1,7 / 2,4 / 5,8 GHz + banda L SATCOM RTH │
        └──────────────────────────────────────────┘
              │     │     │     │     │
             D1    D2    D3    ...    Dn   (drones interceptores)
```

## Enlace dron ↔ C2

**Capa física propuesta:**
- Radio MIMO 2x2 con frequency-hopping LPI/LPD
- Bandas: 1,7 GHz (rural, alcance), 2,4 GHz (urbano), 5,8 GHz (alta tasa)
- Anti-jamming: chirp spread spectrum + adaptive notch filters
- Beamforming en estaciones de tierra dirigible

**Capa enlace:**
- MAC TDMA + sliced para baja latencia (< 5 ms)
- Mesh routing OLSR/BATMAN-adv para resiliencia

**Capa aplicación:**
- MAVLink 2.0 firmado (signing keys rotables)
- Frames de telemetría: posición, batería, FOV, target lock, vídeo H.265 baja tasa.
- Frames de comando: waypoints, ROE update, abort, RTH.

## Resiliencia ante guerra electrónica (EW)

### GPS jamming/spoofing

Vector ya empleado masivamente en Ucrania. Contramedidas:
- **CRPA** (Controlled Reception Pattern Antenna) — anula direcciones de jamming.
- **GALILEO PRS** (Public Regulated Service) — señal cifrada gubernamental europea.
- **Navegación inercial** grado táctico (IMU MEMS calibrada + magnetómetro).
- **Visual-Inertial Odometry (VIO)** — cámara downlooking + algoritmo tipo VINS-Mono.
- **Terrain Reference Navigation (TRN)** — barómetro + DEM PNOA.
- **Celestial backup** — estrellas de día con cámara UV (largo plazo).

### RF jamming del enlace

- Frequency-hopping pseudoaleatorio sembrado pre-misión.
- Detección de jamming (sensores SDR a bordo) → cambio automático de banda.
- Fallback satelital banda L (Iridium Certus, Globalstar STX3) para señal RTH.
- **Modo "silent mode"**: el dron continúa misión autónoma con ROE pre-cargado.

### Ciber

Ver doc 07.

## Interoperabilidad OTAN

- **Link 16 (MIDS-LVT-3)** para integración con NASAMS/NATO IADS.
- **STANAG 4586** ed. 4 para control de UAS interoperable.
- **STANAG 4609** (motion imagery) para vídeo táctico.
- **ADatP-3** (MTF) y **NFFI** (NATO Friendly Force Information).
- **Cursor on Target (CoT)** para integración con Android Team Awareness Kit (ATAK).

## Estaciones y movilidad

- **Estación fija**: rack 42U ruggerizado, redundancia N+1, UPS 30 min, generador diésel respaldo.
- **Estación móvil**: contenedor ISO 20' con generador, climatización, mástil telescópico.
- **Estación táctica**: dos pelícanos (radar + C2) trasladables por dos operarios.

## Tiempos objetivo

| Operación | Latencia objetivo |
|-----------|-------------------|
| Sensor → C2 | < 50 ms (LAN) |
| C2 → operador (HMI) | < 100 ms |
| Autorización → dron | < 200 ms |
| Telemetría drone → HMI | < 150 ms |
| Vídeo de dron → HMI (low-latency) | < 400 ms (H.265 + WebRTC) |
