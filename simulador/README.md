# Simulador — Cúpula Celestial

Dos servicios:

- **sensor-simulator**: emite detecciones sintéticas (radar AESA + RF + EO/IR + acústica)
  contra el endpoint del `sensor-ingest`. Soporta varios escenarios.
- **drone-simulator**: escucha comandos MAVLink2 del `swarm-controller` y reporta
  telemetría ficticia.

## Escenarios disponibles

| Escenario | Descripción |
|-----------|-------------|
| `single` | Un Shahed-like a 6 km en aproximación constante (CV) |
| `saturation` | 12 amenazas simultáneas (FPV + Shahed mix) |
| `jammed` | RF GPS-jam simulado: solo radar AESA emite, ruido alto |
| `mixed`  | Mezcla amigos (IFF), civiles registrados (RemoteID) y hostiles |

## Quick start (aislado)

```bash
cd simulador
docker compose up
```

## Quick start (integrado con orquestador)

```bash
cd orquestador
make up                       # arranca todo el stack base
docker compose --profile simulate up sensor-simulator drone-simulator
```
