from __future__ import annotations

from app.rf_sim import reading_for, KNOWN_SIGS


class TestRFSim:
    def test_reading_for_returns_known_signatures(self, sample_target):
        reading = reading_for(sample_target)
        assert reading["detection"]["spectrum_signature"] in KNOWN_SIGS

    def test_snr_random_range(self, sample_target):
        readings = [reading_for(sample_target)["snr_db"] for _ in range(100)]
        assert all(8.0 <= s <= 18.0 for s in readings)
        assert len(set(round(s, 1) for s in readings)) > 1

    def test_unknown_protocol_returns_empty(self, sample_target):
        reading = reading_for(sample_target, protocol="NOT_A_REAL_PROTOCOL_XYZ")
        assert reading["detection"]["spectrum_signature"] is None
        assert reading["detection"]["feature_vector"] == []
        assert reading["quality"] == 0.0
