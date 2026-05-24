"""Tests del pipeline edge-llm (sin modelos reales, sólo STUBs)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from pipeline.orchestrator import EdgePipeline


def test_pipeline_returns_valid_json_for_synthetic_frame():
    pipe = EdgePipeline()
    rng = np.random.default_rng(0)
    frame = rng.integers(0, 255, size=(480, 640, 3), dtype=np.uint8)
    res = pipe.run_frame(frame)
    assert "target_present" in res
    assert "class" in res
    assert "confidence" in res
    assert 0.0 <= res["confidence"] <= 1.0
    assert res["civilian_proximity"] in ("NONE", "LOW", "MEDIUM", "HIGH")


def test_pipeline_handles_empty_image():
    pipe = EdgePipeline()
    # Imagen muy pequeña
    frame = np.zeros((10, 10, 3), dtype=np.uint8)
    res = pipe.run_frame(frame)
    # No debe crashear
    assert res["frame_id"]
    assert "inference_ms" in res
    assert res["inference_ms"] >= 0


def test_schema_loaded_or_validation_skipped():
    from pipeline.orchestrator import SCHEMA

    # Si está cargado, su nombre debe estar bien
    if SCHEMA:
        assert SCHEMA.get("title") in ("VLMOutput", None)
