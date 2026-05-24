# OTA — LoRA adapter signing

LoRA adapters se distribuyen como bundle equivalente al de modelos completos.
Misma firma Ed25519, mismo `SignedModelLoader` para verificación.

## Estructura bundle

```
adapter-<task>-<version>.bundle/
    adapter.safetensors
    manifest.json
    manifest.sig
```

`manifest.json` añade campo adicional `base_model_sha256` para validar compat:

```json
{
  "model_name": "lora-uas-classifier",
  "version": "0.3.1",
  "format": "safetensors",
  "model_file": "adapter.safetensors",
  "sha256": "...",
  "base_model_sha256": "...",
  "train_dataset_hash": "sha256:...",
  "signed_by": "cupula-modelops",
  "signed_at": "2026-05-24T10:00:00Z",
  "trust_level": "staging"
}
```

## Firmar

```bash
python edge-llm/scripts/sign_model.py \\
   --model adapters/uas-classifier.safetensors \\
   --signing-key edge-llm/keys/dev-signing.key \\
   --out-dir edge-llm/ota/lora-uas-v0.3.1.bundle \\
   --name lora-uas-classifier \\
   --version 0.3.1 \\
   --train-dataset-hash sha256:abc... \\
   --signed-by cupula-modelops \\
   --trust-level staging
```

## Despliegue OTA

1. Bundle se sirve por HTTPS desde MCS (Mission Control Station).
2. Cada Jetson descarga + verifica con su pubkey local antes de aplicar.
3. Rollback automático si `trust_level != production` y métricas degradan.
