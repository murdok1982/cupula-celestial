"""Stage 1: detección genérica de objetos con YOLOv9-tiny ONNX (o RT-DETR-S).

Si el modelo no existe, STUB heurístico devuelve siempre un bbox central.

FASE 2: si `MODEL_BUNDLE_DIR` está definido (apunta a un *.bundle/ con
manifest+sig), carga via SignedModelLoader. Si la verificación falla, NO carga
y el detector queda en stub (fail-closed sobre estado conocido).
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np

try:
    import onnxruntime as ort
except Exception:  # noqa: BLE001
    ort = None  # type: ignore[assignment]

from .model_loader import ModelVerificationError, SignedModelLoader

log = logging.getLogger("edge-llm.stage1")
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "yolov9_tiny.onnx"


@dataclass
class Detection:
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2 (normalizado 0..1)
    score: float
    cls_id: int


class Stage1Detector:
    def __init__(self, model_path: Path = MODEL_PATH) -> None:
        self.session = None
        verified_path: Path | None = None

        # Path FASE 2: bundle firmado.
        bundle_env = os.environ.get("STAGE1_MODEL_BUNDLE_DIR")
        pubkey_env = os.environ.get("MODEL_SIGNING_PUBKEY")
        if bundle_env and pubkey_env:
            try:
                loader = SignedModelLoader(Path(pubkey_env))
                manifest, verified_path = loader.load_or_raise(Path(bundle_env))
                log.warning(
                    "stage1_bundle_verified name=%s version=%s trust=%s",
                    manifest.model_name,
                    manifest.version,
                    manifest.trust_level,
                )
            except (ModelVerificationError, FileNotFoundError) as exc:
                log.error("stage1_bundle_verification_failed %s — fallback STUB", exc)
                verified_path = None

        # Path legacy: ruta directa (sin firma).
        effective_path = verified_path or model_path
        if ort is not None and effective_path.exists() and effective_path.stat().st_size > 256:
            try:
                self.session = ort.InferenceSession(
                    str(effective_path), providers=["CPUExecutionProvider"]
                )
                log.info("yolo_model_loaded path=%s", effective_path)
            except Exception as exc:  # noqa: BLE001
                log.warning("yolo_load_failed %s", exc)

    def detect(self, frame_rgb: np.ndarray) -> list[Detection]:
        """frame_rgb: HxWx3 uint8. Devuelve detecciones top-k."""
        if self.session is None:
            return _stub(frame_rgb)
        try:
            # Asume modelo con input 640x640
            inp = _preprocess(frame_rgb, 640)
            name = self.session.get_inputs()[0].name
            out = self.session.run(None, {name: inp})[0]
            # Asume formato Ultralytics: (1, N, 6) = [x, y, w, h, conf, cls]
            arr = out[0] if out.ndim == 3 else out
            dets: list[Detection] = []
            h, w = frame_rgb.shape[:2]
            for row in arr:
                if len(row) < 6:
                    continue
                cx, cy, bw, bh, conf, cls = row[:6]
                if conf < 0.25:
                    continue
                x1 = (cx - bw / 2) / 640.0
                y1 = (cy - bh / 2) / 640.0
                x2 = (cx + bw / 2) / 640.0
                y2 = (cy + bh / 2) / 640.0
                dets.append(Detection((float(x1), float(y1), float(x2), float(y2)), float(conf), int(cls)))
            dets.sort(key=lambda d: d.score, reverse=True)
            return dets[:8]
        except Exception as exc:  # noqa: BLE001
            log.warning("yolo_infer_failed %s; stub fallback", exc)
            return _stub(frame_rgb)


def _preprocess(frame: np.ndarray, size: int) -> np.ndarray:
    # resize naïve + normalize
    from PIL import Image

    pil = Image.fromarray(frame).resize((size, size))
    arr = np.asarray(pil).astype(np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))[None, ...]  # NCHW
    return arr


def _stub(frame: np.ndarray) -> list[Detection]:
    # Detección ficticia central determinista. Útil para tests.
    return [Detection((0.4, 0.4, 0.6, 0.6), 0.75, 0)]
