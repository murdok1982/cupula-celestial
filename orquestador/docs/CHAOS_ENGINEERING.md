# Chaos Engineering — Cúpula Celestial

## ¿Qué es Chaos Engineering?

Chaos Engineering es la disciplina de experimentar con un sistema para
ganar confianza en su capacidad de resistir condiciones turbulentas en
producción. En lugar de esperar que algo falle, **provocamos fallos de
forma controlada** y observamos cómo responde el sistema.

### Por qué en C-UAS

El sistema Cúpula Celestial es un sistema de defensa aérea C-UAS que debe
operar bajo condiciones extremas:

- **Pérdida de comunicaciones** con drones o sensores
- **Degradación de sensores** por EW (electronic warfare)
- **Picos de carga** durante ataques con enjambre (swarm)
- **Fallos de infraestructura** (Kafka, Postgres, Redis)
- **Latencia de red** entre componentes distribuidos

Si un componente falla, el sistema debe degradar **gracefully** — no colapsar.
Chaos Engineering verifica que los mecanismos de degradación funcionan.

## Experimentos Disponibles

### KillServiceExperiment
| Propiedad | Descripción |
|---|---|
| **Qué hace** | Detiene un contenedor Docker, espera, lo revive |
| **Verifica** | Servicio responde /health tras recuperación |
| **Uso** | `kill_service: redpanda, postgres, decision-engine, ...` |
| **Escenario** | Caída de infraestructura crítica |

### NetworkPartitionExperiment
| Propiedad | Descripción |
|---|---|
| **Qué hace** | Desconecta un contenedor de la red Docker |
| **Verifica** | Reconexión exitosa tras el experimento |
| **Uso** | `network_partition: hmi-gateway → audit-log` |
| **Escenario** | Aislamiento de red entre servicios |

### LatencyInjectionExperiment
| Propiedad | Descripción |
|---|---|
| **Qué hace** | Inyecta latencia con `tc netem` vía nsenter |
| **Verifica** | Limpieza del qdisc tras el experimento |
| **Uso** | `latency_injection: track-fusion 500ms ±100ms` |
| **Escenario** | Degradación de red por congestión o EW |

### PacketLossExperiment
| Propiedad | Descripción |
|---|---|
| **Qué hace** | Inyecta pérdida de paquetes con `tc netem` |
| **Verifica** | Limpieza del qdisc |
| **Uso** | `packet_loss: sensor-ingest 10%` |
| **Escenario** | Enlace satelital degradado |

### ResourceExhaustionExperiment
| Propiedad | Descripción |
|---|---|
| **Qué hace** | Limita CPU/memoria del contenedor vía Docker |
| **Verifica** | Contenedor sigue running tras restaurar recursos |
| **Uso** | `resource_exhaustion: threat-classifier CPU 90%` |
| **Escenario** | Contienda de recursos en edge node |

### KafkaFailureExperiment
| Propiedad | Descripción |
|---|---|
| **Qué hace** | Pausa Redpanda (Kafka), verifica degraded mode |
| **Verifica** | Servicios responden /health sin Kafka |
| **Uso** | `kafka_failure` |
| **Escenario** | Caída del message broker |

### DatabaseFailoverExperiment
| Propiedad | Descripción |
|---|---|
| **Qué hace** | Pausa Postgres, verifica servicios sin DB |
| **Verifica** | Servicios responden /health sin Postgres |
| **Uso** | `database_failover` |
| **Escenario** | Caída de base de datos principal |

### CertExpirationExperiment
| Propiedad | Descripción |
|---|---|
| **Qué hace** | Modifica certificados mTLS (fecha futura), reinicia servicios |
| **Verifica** | Servicios responden /health con certs alterados |
| **Uso** | `cert_expiration` |
| **Escenario** | Certificado mTLS expirado |

## Probes de Verificación

| Probe | Qué verifica | Endpoint |
|---|---|---|
| **HealthProbe** | Todos los servicios UP | `/health` |
| **PipelineProbe** | Pipeline recomienda | `POST /v1/recommend` |
| **LatencyProbe** | P50/P95/P99 vía Prometheus | PromQL query |
| **IntegrityProbe** | Cadena Merkle intacta | `/v1/verify_chain` |

## SLOs y Umbrales

| Métrica | SLO | Unidad |
|---|---|---|
| `pipeline_latency_p95` | < 200 | ms |
| `ingestion_rate` | > 10 | Hz |
| `error_rate` | < 5 | % |

## Cómo Ejecutar Localmente

### Requisitos
- Docker + Docker Compose
- Python 3.12+
- `pip install pyyaml docker httpx structlog`

### Battery completa (config.yaml por defecto)
```bash
cd orquestador/chaos
./run.sh
```

### Experimento único
```bash
./run.sh --experiment kill_service --service redpanda --duration 30
./run.sh --experiment latency_injection --service track-fusion --latency-ms 500
./run.sh --experiment kafka_failure
```

### Ver plan sin ejecutar
```bash
./run.sh --dry-run
```

### Listar experimentos
```bash
./run.sh --list
```

### Battery personalizada
```bash
./run.sh --config mi-config.yaml --strategy random
```

### Estrategias de ejecución
- **sequential**: ejecuta experimentos uno tras otro (default)
- **random**: orden aleatorio
- **continuous**: 3 iteraciones con orden aleatorio

## Cómo Añadir un Nuevo Experimento

1. Crear clase en `orquestador/chaos/experiments.py`:

```python
class MiExperimento(BaseExperiment):
    def __init__(self, param1: str, duration: int = 15) -> None:
        super().__init__()
        self.param1 = param1
        self._duration = duration
        self.name = f"mi_exp_{param1}"
        self.description = f"Mi experimento con {param1}"

    def _inject(self) -> dict:
        # Lógica de inyección del caos
        return {"param": self.param1}

    def _recover(self) -> None:
        # Limpieza obligatoria (try/finally garantizado por BaseExperiment)

    def _verify(self, details: dict) -> bool:
        # Verificar que el sistema está sano
```

2. Registrar en `EXPERIMENT_REGISTRY` al final del archivo.
3. Añadir entrada en `run.sh` CLI parser si requiere parámetros.
4. Añadir al config YAML.
5. Documentar en esta guía.

## Interpretación de Resultados

El runner genera un reporte HTML + JSON en `chaos-report/`:

```
chaos-report/
├── chaos_report.html    # Reporte visual con tabla y timeline
└── chaos_report.json    # Exportación para CI
```

### Criterios de evaluación
- **PASS**: experimento inyectó, mantuvo, recuperó y verificó correctamente
- **FAIL**: alguna fase falló o el sistema no toleró la condición

### En CI
- Los experimentos FAIL **no bloquean el pipeline** (warning)
- El reporte se publica como artifact descargable
- Los logs del stack se archivan si hay fallos

## Arquitectura del Framework

```
orquestador/chaos/
├── __init__.py          # Package init, exports públicos
├── __main__.py          # Entry point python -m chaos
├── experiments.py       # Experimentos (8 tipos)
├── runner.py            # ChaosRunner (estrategias, CLI, configuración)
├── probes.py            # Probes de verificación (4 tipos)
├── report.py            # Generación reporte HTML+JSON
├── config.yaml          # Config por defecto (battery FASE 3)
└── run.sh               # Script de entrada
```

### Flujo de ejecución
```
run.sh → python -m chaos.runner
              → load_config(YAML) → BatteryConfig
              → ChaosRunner.run()
                  → probes_before (Health, Pipeline, Integrity)
                  → for cada experimento:
                      → experiment._inject()
                      → time.sleep(duration)
                      → experiment._verify()
                      → experiment._recover() (try/finally)
                  → probes_after
                  → ChaosReport.save()
```
