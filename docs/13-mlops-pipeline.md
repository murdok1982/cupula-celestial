# MLOps Pipeline — Cúpula Celestial

## Arquitectura

```
                    ┌──────────────────────┐
                    │   DVC Remote Cache    │
                    │  (S3 / MinIO / Local) │
                    └─────────┬────────────┘
                              │ dvc pull/push
                              ▼
┌────────────┐    ┌──────────────────────┐    ┌──────────────────┐
│  Data Eng  │───▶│   Training Pipeline  │───▶│  MLflow Tracking │
│ (dvc add)  │    │ (GH Actions + GPU)   │    │ (experiments +   │
│            │    │ train_classifier.py  │    │  metrics/params) │
└────────────┘    └──────────┬───────────┘    └────────┬─────────┘
                             │                         │
                             ▼                         ▼
                    ┌──────────────────────┐    ┌──────────────────┐
                    │  Model Registry      │◀───│  Artifact Store  │
                    │ (MLflow Registry)    │    │ (S3 / MinIO)     │
                    │  None→Staging→Prod   │    └──────────────────┘
                    └──────────┬───────────┘
                               │ promote
                               ▼
                    ┌──────────────────────┐    ┌──────────────────┐
                    │  Sign + Bundle       │───▶│  OTA Deployment  │
                    │ (Ed25519 signature)  │    │  (drone fleet)   │
                    └──────────────────────┘    └──────────────────┘
```

## DVC — Data & Model Version Control

### Añadir datos

```bash
# Trackear dataset
dvc add data/raw/drone_images

# Subir a remote
dvc push

# Commit metadatos
git add data/raw/drone_images.dvc .gitignore
git commit -m "feat(data): dataset drone_images v3"
```

### Entrenar con versiones específicas

```bash
# Checkout versión específica de datos
git checkout <hash> data/raw/drone_images.dvc
dvc checkout

# Entrenar
python edge-llm/training/train_classifier.py --data-dir data/processed
```

### Cambiar remote

```bash
dvc remote default minio
dvc push -r minio
```

## MLflow — Experiment Tracking & Registry

### Experiments

Cada entrenamiento se registra como un experimento en MLflow:

| Artefacto             | Propósito                          |
|-----------------------|------------------------------------|
| `params`              | backbone, epochs, lr, lora_r       |
| `metrics`             | train_loss, val_loss, val_accuracy |
| `artifacts/model`     | ONNX/PyTorch model                 |
| `artifacts/lora`      | LoRA weights (si aplica)           |

### Model Registry

Ciclo de vida de un modelo registrado:

```
None ──→ Staging ──→ Production ──→ Archived
         (testing)   (drones)        (retirado)
```

Promover manualmente desde MLflow UI o via `ml-promote.yml` workflow.

## CI/CD — Pipelines de ML

### `ml-training.yml` — Entrenamiento automático

**Trigger**: push a `edge-llm/training/`, `data/processed/`, o `pyproject.toml`.

Flujo:
1. Checkout + setup Python 3.11
2. `dvc pull` — baja datos procesados
3. `pip install -e edge-llm[torch]` — instala dependencias
4. `train_classifier.py` — entrena modelo con params del `workflow_dispatch`
5. Registra modelo en MLflow Registry
6. `dvc add models/` + commit — versiona el modelo en DVC

### `ml-promote.yml` — Promoción a Staging/Production

**Trigger**: manual via `workflow_dispatch`.

Flujo:
1. Transiciona modelo en MLflow Registry: None → Staging → Production
2. Firma el bundle del modelo (Ed25519)
3. Dispara webhook OTA para desplegar a flota de drones

## OTA — De Registry a Dron en Vuelo

```
MLflow Registry  ──▶  SignedRegistryClient  ──▶  SignedModelLoader
       │                                                     │
       │ download_and_verify()                               │ verify_bundle()
       ▼                                                     ▼
   model.onnx + manifest.json + manifest.sig           load_or_raise()
```

1. `SignedRegistryClient` descarga el modelo Production desde MLflow
2. Verifica firma Ed25519 contra `pubkey.bin` embebido en el firmware
3. Si firma válida y sha256 coincide → carga en memoria
4. Si falla → rollback automático al modelo anterior

## Seguridad

| Capa               | Mecanismo                          |
|--------------------|------------------------------------|
| Model signing      | Ed25519 + sha256 manifest          |
| Transport          | mTLS entre registry y edge-llm     |
| Storage            | S3 cifrado (SSE-S3 o KMS)          |
| CI/CD secrets      | GitHub Actions secrets             |
| Rollback           | Versión anterior en DVC siempre disponible |
| Degraded mode      | Registry client funciona sin MLflow |

## Comandos rápidos

```bash
# Ver datasets trackeados
dvc list

# Ver remote actual
dvc remote list

# Ver historial de experimentos
mlflow ui  # http://localhost:5000

# Descargar último modelo production
python -m registry.client --tracking-uri http://localhost:5000 download

# Promover modelo a production
# GH Actions → ml-promote.yml o MLflow UI → Stage → Production
```
