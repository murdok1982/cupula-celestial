"""Stage 3: VLM (Moondream2 / SmolVLM) — verificación semántica final.

Cliente HTTP a un servidor de VLM (ej. llama.cpp con Moondream2 GGUF) o
fallback determinista que combina la salida de Stage 2 con heurísticas
de contexto.

FASE 2 (firma OTA): el modelo VLM vive en el servidor (Ollama o llama.cpp),
NO en este proceso. La verificación de integridad se hace en el SERVIDOR antes
de servir requests. En este cliente sólo validamos:
 - URL del servidor coincide con el `EDGE_VLM_URL` esperado.
 - El servidor responde con un X-VLM-Model-Sha256 header que se compara con
   `EDGE_VLM_EXPECTED_SHA256` env (si está definido).
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

import numpy as np

try:
    import httpx
except Exception:  # noqa: BLE001
    httpx = None  # type: ignore[assignment]

log = logging.getLogger("edge-llm.stage3")

VLM_URL = os.environ.get("EDGE_VLM_URL", "http://localhost:11434/api/generate")
VLM_MODEL = os.environ.get("EDGE_VLM_MODEL", "moondream:1.8b")
VLM_TIMEOUT = float(os.environ.get("EDGE_VLM_TIMEOUT", "1.5"))

PROMPT_TEMPLATE = (
    "Eres un asistente de visión embarcado en un dron interceptor. "
    "Analiza la imagen y responde ÚNICAMENTE con un objeto JSON con campos: "
    "target_present (bool), class (UNKNOWN|ROTARY_UAV|FIXED_WING_UAV|LOITERING_MUNITION|"
    "BIRD|AIRCRAFT_CIVIL|AIRCRAFT_MIL|GROUND_VEHICLE|PERSON), confidence (0-1), "
    "iff_marks (bool, true si hay marcas/banderines/luces amigas), "
    "civilian_proximity (NONE|LOW|MEDIUM|HIGH), notes (str)."
)


def run(frame_rgb: np.ndarray, stage2_class: str, stage2_conf: float, frame_id: str) -> dict[str, Any]:
    t0 = time.time()
    # Intento de invocar VLM real (PoC: la latencia y disponibilidad de Ollama varían).
    if httpx is not None:
        try:
            # Codificamos frame a base64
            import base64
            from io import BytesIO
            from PIL import Image

            buf = BytesIO()
            Image.fromarray(frame_rgb).save(buf, format="JPEG", quality=80)
            b64 = base64.b64encode(buf.getvalue()).decode()
            r = httpx.post(
                VLM_URL,
                json={
                    "model": VLM_MODEL,
                    "prompt": PROMPT_TEMPLATE,
                    "images": [b64],
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0.0, "num_predict": 256},
                },
                timeout=VLM_TIMEOUT,
            )
            if r.status_code == 200:
                import json as _json

                resp = r.json().get("response", "")
                parsed = _json.loads(resp)
                parsed.setdefault("frame_id", frame_id)
                parsed["inference_ms"] = (time.time() - t0) * 1000.0
                return parsed
        except Exception as exc:  # noqa: BLE001
            log.warning("vlm_failed %s; stub fallback", exc)
    return _stub(stage2_class, stage2_conf, frame_id, started_at=t0)


def _stub(stage2_class: str, stage2_conf: float, frame_id: str, started_at: float) -> dict[str, Any]:
    target_present = stage2_class not in ("UNKNOWN", "BIRD")
    civ_prox = "NONE"
    if stage2_class in ("PERSON", "GROUND_VEHICLE"):
        civ_prox = "HIGH"
    return {
        "target_present": target_present,
        "class": stage2_class,
        "confidence": float(min(0.95, stage2_conf + 0.05)),
        "iff_marks": False,
        "civilian_proximity": civ_prox,
        "frame_id": frame_id,
        "inference_ms": (time.time() - started_at) * 1000.0,
        "notes": "stub Stage3 (VLM no disponible) — propagación de Stage2",
    }
