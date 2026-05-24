from __future__ import annotations

from app.radar_sim import TargetKinematic, reading_for, step_position


def test_radar_swerling_rcs_varies_between_steps():
    target = TargetKinematic(40.416, -3.704, 800, 225, 60, -15, False)
    rcs_values = []
    for _ in range(10):
        target = step_position(target, dt=0.1)
        r = reading_for(target)
        rcs_values.append(r["detection"]["rcs_dbsm"])
    unique_rounded = set(round(v, 1) for v in rcs_values)
    assert len(unique_rounded) > 1, (
        f"RCS deberia variar entre steps (Swerling), valores: {rcs_values}"
    )
