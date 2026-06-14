from __future__ import annotations

import json
from unittest.mock import patch

import numpy as np

SCHEMA = json.loads("""
{
  "title": "VLMOutput",
  "type": "object",
  "properties": {
    "target_present": {"type": "boolean"},
    "class": {"type": "string"},
    "confidence": {"type": "number"},
    "civilian_proximity": {"type": "string"}
  },
  "required": ["target_present", "class", "confidence", "civilian_proximity"]
}
""")


def test_pipeline_all_stages_produces_valid_output():
    from pipeline.orchestrator import EdgePipeline

    pipe = EdgePipeline()
    rng = np.random.default_rng(1)
    frame = rng.integers(0, 255, size=(480, 640, 3), dtype=np.uint8)
    res = pipe.run_frame(frame)

    assert isinstance(res["target_present"], bool)
    assert isinstance(res["class"], str)
    assert 0.0 <= res["confidence"] <= 1.0
    assert res["civilian_proximity"] in ("NONE", "LOW", "MEDIUM", "HIGH")

    required = {"target_present", "class", "confidence", "civilian_proximity"}
    for field in required:
        assert field in res, f"campo {field} faltante en output"


def test_pipeline_output_matches_json_schema():
    from pipeline.orchestrator import EdgePipeline

    pipe = EdgePipeline()
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    res = pipe.run_frame(frame)

    if SCHEMA:
        props = SCHEMA.get("properties", {})
        for field in SCHEMA.get("required", []):
            assert field in res, f"schema require {field}"
            if field == "confidence":
                assert isinstance(res[field], (int, float))
            elif field == "target_present":
                assert isinstance(res[field], bool)
            elif field == "class":
                assert isinstance(res[field], str)
