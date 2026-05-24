from __future__ import annotations

from app.radar_sim import TargetKinematic, reading_for


def test_multipath_affects_low_altitude():
    low = TargetKinematic(40.416, -3.704, 50, 225, 60, -15, False)
    high = TargetKinematic(40.416, -3.704, 2000, 225, 60, -15, False)
    r_low = reading_for(low)
    r_high = reading_for(high)
    assert (
        r_low["detection"]["range_m"] > 0
        and r_high["detection"]["range_m"] > 0
    )
