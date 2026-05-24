from __future__ import annotations

import numpy as np
from pipeline.orchestrator import EdgePipeline


def test_pipeline_4k_image_resizes_correctly():
    pipe = EdgePipeline()
    rng = np.random.default_rng(42)
    frame = rng.integers(0, 255, size=(2160, 3840, 3), dtype=np.uint8)
    res = pipe.run_frame(frame)
    assert res["frame_id"]
    assert "inference_ms" in res
    assert res["inference_ms"] >= 0
    assert "target_present" in res
    assert "class" in res
    assert 0.0 <= res["confidence"] <= 1.0
