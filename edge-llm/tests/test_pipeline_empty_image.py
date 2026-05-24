from __future__ import annotations

import numpy as np
from pipeline.orchestrator import EdgePipeline


def test_pipeline_empty_image_does_not_crash():
    pipe = EdgePipeline()
    frame = np.zeros((10, 10, 3), dtype=np.uint8)
    res = pipe.run_frame(frame)
    assert res["frame_id"]
    assert "inference_ms" in res
    assert res["inference_ms"] >= 0
    assert "target_present" in res
    assert "class" in res
    assert 0.0 <= res["confidence"] <= 1.0
    assert res["civilian_proximity"] in ("NONE", "LOW", "MEDIUM", "HIGH")
