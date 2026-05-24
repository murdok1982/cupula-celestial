# MLflow Model Registry — Cúpula Celestial

Stack de MLOps para el sistema C-UAS.

## Stack

| Servicio       | Puerto | Credenciales        |
|----------------|--------|---------------------|
| MLflow UI      | 5000   | —                   |
| MinIO Console  | 9001   | minioadmin/minioadmin |
| MinIO S3 API   | 9000   | minioadmin/minioadmin |
| PostgreSQL     | 5432   | mlflow/mlflow       |

## Uso

### Iniciar stack

```bash
cd mlflow
make up              # docker compose up -d
```

### UI de MLflow

Abrir http://localhost:5000

### Registrar un modelo desde Python

```python
import mlflow

mlflow.set_tracking_uri("http://localhost:5000")
mlflow.set_experiment("cupula-celestial")

with mlflow.start_run():
    mlflow.log_param("backbone", "dinov2_s")
    mlflow.log_metric("val_accuracy", 0.956)
    mlflow.pytorch.log_model(model, "model")
    mlflow.register_model("runs:/<RUN_ID>/model", "cupula-classifier-dinov2_s")
```

### Promover modelo a Staging / Production

```bash
# Desde CLI
mlflow models -name cupula-classifier-dinov2_s -version 3 -stage Production

# Desde MLflow UI: Models → cupula-classifier-dinov2_s → Stage → Production
```

### Ciclo de vida de modelo

```
None ──→ Staging ──→ Production ──→ Archived
         (testing)   (despliegue)    (retirado)
```

### Gestión con Docker Compose

```bash
make down     # Parar servicios
make reset    # Borrar volúmenes (DB + artefactos)
make logs     # Logs de MLflow
make health   # Verificar estado de todos los servicios
```

## Variables de entorno

Copiar `.env.example` a `.env` y ajustar credenciales:

```bash
cp .env.example .env
```

## Integración con GitHub Actions

Los workflows en `.github/workflows/ml-training.yml` y `ml-promote.yml`
usan las secrets:

| Secret               | Descripción                        |
|----------------------|------------------------------------|
| `MLFLOW_TRACKING_URI`| URI del servidor MLflow            |
| `AWS_ACCESS_KEY_ID`  | Access key MinIO                   |
| `AWS_SECRET_ACCESS_KEY` | Secret key MinIO                |
| `OTA_WEBHOOK_URL`    | Webhook para OTA deployment        |
| `OTA_WEBHOOK_SECRET` | Token del webhook                  |
