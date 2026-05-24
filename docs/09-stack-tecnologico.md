# 09 — Stack tecnológico

## Resumen por capa

| Capa | Tecnología | Razón |
|------|-----------|-------|
| **Sensor ingest** | Rust (Axum) + tokio + Quinn (QUIC) | Latencia mínima, memoria segura |
| **Bus de eventos** | Apache Kafka + Redpanda (alternativa) | Throughput, retention, replay |
| **Fusión** | Rust + nalgebra + custom IMM/JPDAF | Tiempo real, sin GC pauses |
| **ML / clasificación** | Python (PyTorch) + ONNX Runtime + Triton | Ecosistema ML maduro |
| **Decision engine** | Python (Ray Serve) + llama.cpp / vLLM | LLM táctico hospedado local |
| **Policy / ROE** | OPA Rego (Open Policy Agent) | Auditable, declarativo |
| **DB pistas / telemetría** | PostgreSQL + TimescaleDB + PostGIS | Series temporales + geoespacial |
| **Cache / pub-sub interno** | Redis Streams | Latencia ms, simple |
| **Audit log inmutable** | PostgreSQL append-only + Merkle tree + S3 (MinIO) WORM | Cumplimiento legal |
| **HMI Operador** | TypeScript + React 19 + CesiumJS + Zustand + Tailwind + shadcn/ui | Cartografía 3D rendimiento |
| **Realtime HMI** | WebSocket + WebRTC (vídeo) + Server-Sent Events | Bajo overhead |
| **Dron firmware base** | PX4 / ArduPilot custom fork + ROS 2 Jazzy (Humble LTS) | Comunidad, certificable |
| **Dron edge AI** | TensorRT, ONNX Runtime, llama.cpp (CUDA) | Inferencia optimizada Jetson |
| **Containers** | Docker + Podman (rootless en producción) | Estándar |
| **Orquestación** | k3s (Kubernetes ligero) + Argo CD | Suficiente, menor superficie |
| **Observabilidad** | OpenTelemetry + Prometheus + Grafana + Loki + Tempo | Estándar abierto |
| **CI/CD** | GitLab CE self-hosted + Renovate + Gitleaks | Soberanía, sin nube extranjera |
| **IaC** | Terraform + Ansible + Packer | Reproducibilidad |
| **Simulación** | Gazebo Harmonic + AirSim + Unreal Engine 5 + NVIDIA Isaac Sim | Digital twin del teatro |
| **Datasets ML** | DVC + MLflow + LakeFS | Versionado, linaje |

## Política de lenguajes

- **Rust** para todo lo crítico en latencia y memoria-safety (sensor ingest,
  fusión, comunicaciones, kernel del swarm controller). Aprovecha Axum,
  tokio, nalgebra, ndarray.
- **Python** para ML, scripting de datos, herramientas internas. Producción
  con `uv` + `ruff` + `mypy --strict`.
- **TypeScript** para HMI. `strict: true`, sin `any` salvo bridge externo.
- **C++** mínimo necesario, solo dentro de PX4/ROS2 fork y drivers de hardware.
- **Dart/Flutter** para tablet portátil de oficial táctico desplegado en campo
  (vista reducida del HMI principal).

## Diagrama de despliegue (PoC)

```
                                ┌──────────────────────┐
                                │   Operador (HMI)     │
                                │  Workstation + 2 4K  │
                                └──────────┬───────────┘
                                           │ TLS 1.3 + FIDO2
                                           ▼
┌──────────────────────────────────────────────────────────┐
│  CLUSTER C2 (k3s, 3 nodos)                               │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ sensor-ingest│  │ track-fusion │  │ decision-eng │    │
│  │ (Rust)       │  │ (Rust)       │  │ (Python+LLM) │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ threat-class │  │ swarm-ctrl   │  │ hmi-gateway  │    │
│  │ (Py+ONNX)    │  │ (Rust+MAVLnk)│  │ (Rust)       │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Kafka cluster│  │ PostgreSQL HA│  │ Redis cluster│    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────┬──────────────────────┬─────────────────────┬───────┘
      │                      │                     │
      ▼                      ▼                     ▼
 Radares AESA          Estaciones EO/IR         Mesh MANET
 banda X (4 unid.)     gimbal (2 unid.)         ↕
                                            Enjambre drones
                                            (24 interceptores)
```

## Estándares de codificación

- Rust: `cargo clippy -- -D warnings`, `cargo fmt`, `cargo audit`, `cargo deny`.
- Python: `ruff`, `black`, `mypy --strict`, `pytest --cov ≥85%`.
- TS: ESLint, Prettier, `tsc --noEmit`, `vitest`.
- Pull requests obligan a 2 revisiones humanas + CI verde + escaneo de secretos.

## Open Source vs propietario

- **Open Source preferido** para infraestructura (Rust, Postgres, Kafka, k3s).
- **Propietario aceptado** sólo donde no hay alternativa libre madura (drivers
  específicos de radar, módulos cripto certificados CC EAL).
- **Auditabilidad** del código propietario obligatoria (cláusula contractual).
- **No SaaS extranjero** en infraestructura crítica.
