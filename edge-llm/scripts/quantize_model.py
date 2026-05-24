"""Model Quantization Pipeline.

Carga modelo ONNX, calibra con dataset sintético (100 imágenes),
exporta en FP32, FP16 e INT8 (usando onnxruntime quantization).

Uso:
    python scripts/quantize_model.py \\
        --model models/drone_classifier.onnx \\
        --calibration-data /tmp/calib \\
        --output-dir models/quantized \\
        --precision int8
"""
from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path

import numpy as np

log = logging.getLogger("quantize_model")
logging.basicConfig(level=logging.INFO)


def quantize_fp16(model_path: Path, output_path: Path) -> Path:
    """Convierte modelo ONNX a FP16 usando onnxconverter."""
    try:
        import onnx
        from onnxconverter_common import float16
    except ImportError as exc:
        log.error("FP16 quantization requires onnxconverter-common: pip install onnxconverter-common")
        raise SystemExit(1) from exc

    model = onnx.load(str(model_path))
    model_fp16 = float16.convert_float_to_float16(model)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    onnx.save(model_fp16, str(output_path))
    log.info("fp16_quantized size_before=%d size_after=%d", model_path.stat().st_size, output_path.stat().st_size)
    return output_path


def quantize_int8(
    model_path: Path,
    output_path: Path,
    calibration_data: list[np.ndarray],
) -> Path:
    """Cuantización INT8 con onnxruntime quantization."""
    try:
        import onnxruntime as ort
        from onnxruntime.quantization import quantize_dynamic, QuantType
    except ImportError as exc:
        log.error("INT8 quantization requires onnxruntime: pip install onnxruntime")
        raise SystemExit(1) from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Dynamic quantization (no requiere calibración)
    quantize_dynamic(
        str(model_path),
        str(output_path),
        weight_type=QuantType.QInt8,
        op_types_to_quantize=["MatMul", "Add", "Conv"],
    )
    log.info("int8_quantized path=%s", output_path)
    return output_path


def benchmark_accuracy(
    model_path: Path,
    calibration_data: list[np.ndarray],
    calibration_labels: list[int],
) -> float:
    """Evalúa accuracy en dataset de calibración."""
    try:
        import onnxruntime as ort
    except ImportError:
        return 0.0

    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    correct = 0

    for img, label in zip(calibration_data, calibration_labels):
        out = session.run(None, {input_name: img.astype(np.float32)})[0]
        pred = int(np.argmax(out.flatten()))
        if pred == label:
            correct += 1

    return correct / max(1, len(calibration_data))


def generate_calibration_data(
    num_samples: int = 100,
    img_size: int = 224,
    num_classes: int = 9,
) -> tuple[list[np.ndarray], list[int]]:
    """Genera datos sintéticos de calibración."""
    rng = np.random.default_rng(42)
    images = []
    labels = []
    for _ in range(num_samples):
        img = rng.uniform(0, 1, size=(1, 3, img_size, img_size)).astype(np.float32)
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 3, 1, 1)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 3, 1, 1)
        img = (img - mean) / std
        images.append(img)
        labels.append(rng.integers(0, num_classes))
    return images, labels


def main() -> None:
    parser = argparse.ArgumentParser(description="ONNX Model Quantization")
    parser.add_argument("--model", type=Path, required=True, help="ruta al modelo ONNX")
    parser.add_argument("--calibration-data", type=Path, default=None, help="directorio con datos de calibración")
    parser.add_argument("--output-dir", type=Path, default=Path("models/quantized"), help="directorio de salida")
    parser.add_argument(
        "--precision",
        choices=["fp32", "fp16", "int8"],
        default="int8",
        help="precisión objetivo",
    )
    args = parser.parse_args()

    if not args.model.exists():
        log.error("model not found: %s", args.model)
        raise SystemExit(1)

    calib_images, calib_labels = generate_calibration_data(num_samples=100)

    out_name = f"{args.model.stem}_{args.precision}.onnx"
    output_path = args.output_dir / out_name

    if args.precision == "fp16":
        output_path = quantize_fp16(args.model, output_path)
    elif args.precision == "int8":
        output_path = quantize_int8(args.model, output_path, calib_images)
    else:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        import onnx
        model = onnx.load(str(args.model))
        onnx.save(model, str(output_path))

    # Report
    size_mb = output_path.stat().st_size / 1e6
    acc_before = benchmark_accuracy(args.model, calib_images, calib_labels)
    acc_after = benchmark_accuracy(output_path, calib_images, calib_labels)

    print(f"\n=== Quantization Report ===")
    print(f"Model:          {args.model.name}")
    print(f"Precision:      {args.precision}")
    print(f"Output:         {output_path}")
    print(f"Size:           {size_mb:.2f} MB")
    print(f"Accuracy pre:   {acc_before:.4f}")
    print(f"Accuracy post:  {acc_after:.4f}")
    print(f"Delta:          {acc_after - acc_before:+.4f}")


if __name__ == "__main__":
    main()
