# edge-llm — Pipeline VLM embarcado en el dron interceptor

Pipeline en cascada de 3 stages que corre en Jetson Orin Nano:

```
Frame (30 FPS)
   │
   ▼
Stage 1: YOLOv9-tiny / RT-DETR-S      (~10 ms,  TensorRT INT8)
   │  hay candidato?
   ▼
Stage 2: CNN clasificador propio       (~5 ms,   amigo/enemigo/civil)
   │  ambiguo o positivo?
   ▼
Stage 3: VLM (Moondream2)              (~80 ms,  verificación semántica)
   │
   ▼
Decisión + telemetría al swarm-controller (MAVLink2)
```

## Latencia E2E objetivo
≤100 ms por frame inspeccionado. El 95 % de frames terminan en Stage 1 o 2.

## Hardware soportado
- **Jetson Orin Nano 8 GB** (recomendado, 40 TOPS INT8, 7-15 W)
- **Hailo-8L** (alternativa, 13 TOPS, 2.5 W) — Stage 3 con SmolVLM
- Fallback CPU (sólo para tests/dev)

## Estructura

```
pipeline/
  stage1_detector.py     # YOLO ONNX → bboxes + class scores
  stage2_classifier.py   # CNN propio fine-tuned (amigo/enemigo/civil)
  stage3_vlm.py          # Moondream2 / SmolVLM cliente
  orchestrator.py        # Encadenado + decisión + JSON output validado
  telemetry.py           # MAVLink2 al swarm-controller
training/
  train_classifier.py    # PyTorch + DINOv2 backbone
  dataset.py · augmentation.py
models/                  # Placeholders (README explicando STUB)
tests/
  test_pipeline.py
```

## Quick start (dev)

```bash
pip install -e ".[dev]"
python -m pipeline.orchestrator --image samples/test_drone.jpg
```

## STUB

Los modelos en `models/` son placeholders. Si no existen `.onnx` reales o son
de tamaño <256 B, los stages caen a heurísticas determinísticas que generan
salidas válidas según `vlm_output.schema.json`. Esto permite probar el orquestador
sin GPUs ni datasets.

## OTA / actualización del VLM

Los pesos del VLM se actualizan vía **LoRA adapters** (5-30 MB) firmados.
Cada actualización pasa por banco de validación antes de despliegue.
Ver `04-edge-llm-drones.md` doctrina completa.
