# Artefactos del clasificador

Coloca aquí los modelos ONNX productivos:

- `cnn_micro_doppler.onnx` — CNN sobre espectrogramas micro-Doppler (radar)
- `efficientnet_eoir.onnx` — EfficientNet-B0 fine-tuned EO/IR
- `mlp_rf_spectrum.onnx`   — MLP sobre firmas espectrales RF (DJI/ELRS/etc.)

## STUB en el PoC

Estos modelos son placeholders. Si no existen ficheros `.onnx` o pesan <256 B,
el ensemble usa solo el motor de reglas determinísticas
(`app/inference/__init__.py::RuleBased`). El sistema sigue produciendo
clasificaciones razonables para el demo end-to-end.

## Entrenamiento

Consulta `../../edge-llm/training/` para el pipeline de entrenamiento real:
DINOv2 backbone → fine-tune supervisado → cuantización Q4/INT8.
