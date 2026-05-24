from __future__ import annotations

from app.radar_sim import TargetKinematic, step_position, reading_for


class TestRadarSim:
    def test_step_position_updates_coords(self, sample_target):
        t2 = step_position(sample_target, dt=1.0)
        assert t2.lat0 != sample_target.lat0
        assert t2.lon0 != sample_target.lon0
        assert abs(t2.lat0 - sample_target.lat0) < 0.01
        assert abs(t2.lon0 - sample_target.lon0) < 0.01

    def test_reading_for_returns_valid_schema(self, sample_target):
        reading = reading_for(sample_target)
        assert "position" in reading
        for key in ("latitude", "longitude", "altitude_msl_m", "altitude_agl_m"):
            assert key in reading["position"]
        assert "rcs_dbsm" in reading["detection"]
        assert "snr_db" in reading
        assert "micro_doppler_period_ms" in reading["detection"]

    def test_rcs_variation(self, sample_target):
        rcs_vals = [reading_for(sample_target)["detection"]["rcs_dbsm"] for _ in range(20)]
        assert len(set(round(v, 1) for v in rcs_vals)) > 1

    def test_snr_decreases_with_range(self, sample_target):
        near = TargetKinematic(40.449, -3.719, 800, 225, 60, -15, False)
        far = TargetKinematic(41.000, -3.800, 800, 225, 60, -15, False)
        snr_near = reading_for(near)["snr_db"]
        snr_far = reading_for(far)["snr_db"]
        assert snr_near > snr_far

    def test_micro_doppler_periodic(self, sample_target):
        reading = reading_for(sample_target)
        period = reading["detection"]["micro_doppler_period_ms"]
        assert 10.0 <= period <= 30.0
