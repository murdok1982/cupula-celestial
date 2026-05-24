from __future__ import annotations

from app.eo_ir_sim import reading_for


class TestEOIRSim:
    def test_reading_for_returns_fixed_snr(self, sample_target):
        reading = reading_for(sample_target, visibility_km=100.0)
        assert reading["snr_db"] > 15.0
        assert reading["snr_db"] <= 25.0

    def test_feature_vectors_not_none(self, sample_target):
        reading = reading_for(sample_target)
        assert reading["detection"]["feature_vector"] is not None
        assert isinstance(reading["detection"]["feature_vector"], list)
