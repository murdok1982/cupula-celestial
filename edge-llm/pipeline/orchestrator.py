"""Orquestador del pipeline en cascada Stage1 → Stage2 → Stage3.

Decide si invocar Stage3 según ambigüedad/contexto. Devuelve JSON validado
con `vlm_output.schema.json`.
"""
from __future__ import annotations

import argparse
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

import numpy as np
import structlog
from jsonschema import Draft202012Validator, ValidationError

from pipeline.stage1_detector import Stage1Detector
from pipeline.stage2_classifier import Stage2Classifier
from pipeline import stage3_vlm

logging.basicConfig(level=logging.INFO)
structlog.configure(processors=[structlog.processors.JSONRenderer()])
log = structlog.get_logger("edge-llm")

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "orquestador" / "shared" / "schemas" / "vlm_output.schema.json"
SCHEMA: dict[str, Any] = {}
if SCHEMA_PATH.exists():
    SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
VALIDATOR = Draft202012Validator(SCHEMA) if SCHEMA else None


class EdgePipeline:
    def __init__(self) -> None:
        self.stage1 = Stage1Detector()
        self.stage2 = Stage2Classifier()

    def run_frame(self, frame_rgb: np.ndarray) -> dict[str, Any]:
        t0 = time.time()
        frame_id = uuid.uuid4().hex[:12]

        # Stage 1
        dets = self.stage1.detect(frame_rgb)
        if not dets:
            res = _no_target(frame_id, t0)
            _validate(res)
            return res

        det = dets[0]
        x1, y1, x2, y2 = det.bbox
        h, w = frame_rgb.shape[:2]
        cx1, cy1, cx2, cy2 = int(x1 * w), int(y1 * h), int(x2 * w), int(y2 * h)
        cx1, cy1 = max(0, cx1), max(0, cy1)
        cx2, cy2 = max(cx1 + 1, cx2), max(cy1 + 1, cy2)
        crop = frame_rgb[cy1:cy2, cx1:cx2]
        if crop.size == 0:
            crop = frame_rgb

        # Stage 2
        s2 = self.stage2.classify(crop)

        # Decisión: si Stage2 es seguro y no es ambiguo, no invocar Stage3
        if not s2.is_ambiguous and s2.cls not in ("UNKNOWN",):
            res = {
                "target_present": s2.cls not in ("BIRD", "UNKNOWN"),
                "class": s2.cls,
                "confidence": s2.confidence,
                "iff_marks": False,
                "civilian_proximity": "NONE",
                "frame_id": frame_id,
                "inference_ms": (time.time() - t0) * 1000.0,
                "bbox": [x1, y1, x2, y2],
                "notes": "decisión Stage2 (Stage3 omitido por confianza)",
            }
            _validate(res)
            return res

        # Stage 3
        s3 = stage3_vlm.run(frame_rgb, s2.cls, s2.confidence, frame_id)
        s3.setdefault("inference_ms", (time.time() - t0) * 1000.0)
        s3["bbox"] = [x1, y1, x2, y2]
        _validate(s3)
        return s3


def _no_target(frame_id: str, t0: float) -> dict[str, Any]:
    return {
        "target_present": False,
        "class": "UNKNOWN",
        "confidence": 0.0,
        "iff_marks": False,
        "civilian_proximity": "NONE",
        "frame_id": frame_id,
        "inference_ms": (time.time() - t0) * 1000.0,
        "notes": "no candidate from Stage1",
    }


def _validate(obj: dict[str, Any]) -> None:
    if not VALIDATOR:
        return
    errors = list(VALIDATOR.iter_errors(obj))
    if errors:
        raise ValidationError("; ".join(e.message for e in errors[:3]))


def _load_image(path: Path) -> np.ndarray:
    from PIL import Image

    return np.asarray(Image.open(path).convert("RGB"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", type=str, help="path a una imagen de prueba")
    parser.add_argument("--loop", action="store_true", help="modo demonio (frames sintéticos)")
    args = parser.parse_args()

    pipe = EdgePipeline()

    if args.image:
        frame = _load_image(Path(args.image))
        out = pipe.run_frame(frame)
        print(json.dumps(out, indent=2))
        return

    if args.loop:
        rng = np.random.default_rng(0)
        while True:
            frame = (rng.integers(0, 255, size=(480, 640, 3), dtype=np.uint8))
            out = pipe.run_frame(frame)
            log.info("frame_done", **{k: v for k, v in out.items() if k != "bbox"})
            time.sleep(0.5)
        return

    # Default: un frame sintético
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 255, size=(480, 640, 3), dtype=np.uint8)
    out = pipe.run_frame(frame)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
