from __future__ import annotations

from app.radar_sim import TargetKinematic, reading_for


def test_pd_decreases_with_range():
    near = TargetKinematic(40.416, -3.704, 800, 0, 60, -15, False)
    far = TargetKinematic(41.500, -4.200, 800, 0, 60, -15, False)
    snr_near = reading_for(near)["snr_db"]
    snr_far = reading_for(far)["snr_db"]
    assert snr_near > snr_far, "SNR debe disminuir con la distancia"
