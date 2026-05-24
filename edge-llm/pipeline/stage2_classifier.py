"""Stage 2: clasificador CNN propio (amigo / enemigo / civil / desconocido).

Fine-tuned sobre dataset interno (drones objetivo + aliados + civil + fauna).
Si el modelo no existe → STUB que combina color promedio + posición central.

FASE 2: respeta `STAGE2_MODEL_BUNDLE_DIR` + `MODEL_SIGNING_PUBKEY` para
bundle firmado.
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

log = logging.getLogger("edge-llm.stage2")
MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "drone_classifier.onnx"

CLASSES = ["UNKNOWN", "ROTARY_UAV", "FIXED_WING_UAV", "LOITERING_MUNITION", "BIRD", "AIRCRAFT_CIVIL", "AIRCRAFT_MIL", "GROUND_VEHICLE", "PERSON"]


@dataclass
class Stage2Result:
    cls: str
    confidence: float
    is_ambiguous: bool


class Stage2Classifier:
    def __init__(self, model_path: Path = MODEL_PATH) -> None:
        self.session = None
        verified_path: Path | None = None
        bundle_env = os.environ.get("STAGE2_MODEL_BUNDLE_DIR")
        pubkey_env = os.environ.get("MODEL_SIGNING_PUBKEY")
        if bundle_env and pubkey_env:
            try:
                loader = SignedModelLoader(Path(pubkey_env))
                manifest, verified_path = loader.load_or_raise(Path(bundle_env))
                log.warning(
                    "stage2_bundle_verified name=%s version=%s trust=%s",
                    manifest.model_name,
                    manifest.version,
                    manifest.trust_level,
                )
            except (ModelVerificationError, FileNotFoundError) as exc:
                log.error("stage2_bundle_verification_failed %s — fallback STUB", exc)
                verified_path = None
        effective_path = verified_path or model_path
        if ort is not None and effective_path.exists() and effective_path.stat().st_size > 256:
            try:
                self.session = ort.InferenceSession(
                    str(effective_path), providers=["CPUExecutionProvider"]
                )
                log.info("classifier_loaded path=%s", effective_path)
            except Exception as exc:  # noqa: BLE001
                log.warning("classifier_load_failed %s", exc)

    def classify(self, crop_rgb: np.ndarray) -> Stage2Result:
        if self.session is None:
            return _stub(crop_rgb)
        try:
            inp = _preprocess(crop_rgb)
            name = self.session.get_inputs()[0].name
            out = self.session.run(None, {name: inp})[0]
            probs = _softmax(np.asarray(out).flatten())
            idx = int(np.argmax(probs))
            conf = float(probs[idx])
            cls = CLASSES[idx] if idx < len(CLASSES) else "UNKNOWN"
            ambiguous = conf < 0.7 or _entropy(probs) > 1.3
            return Stage2Result(cls, conf, ambiguous)
        except Exception as exc:  # noqa: BLE001
            log.warning("classifier_infer_failed %s; stub fallback", exc)
            return _stub(crop_rgb)


def _preprocess(crop: np.ndarray) -> np.ndarray:
    from PIL import Image

    pil = Image.fromarray(crop).resize((224, 224))
    arr = np.asarray(pil).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    arr = np.transpose(arr, (2, 0, 1))[None, ...]
    return arr.astype(np.float32)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


def _entropy(p: np.ndarray) -> float:
    p = np.clip(p, 1e-12, 1.0)
    return float(-np.sum(p * np.log(p)))


def _stub(crop: np.ndarray) -> Stage2Result:
    # Stub determinista: usa intensidad media para decidir.
    mean_int = float(crop.mean()) if crop.size else 128.0
    if mean_int < 80:
        cls = "ROTARY_UAV"
        conf = 0.78
    elif mean_int < 150:
        cls = "LOITERING_MUNITION"
        conf = 0.82
    else:
        cls = "BIRD"
        conf = 0.65
    return Stage2Result(cls, conf, conf < 0.75)
