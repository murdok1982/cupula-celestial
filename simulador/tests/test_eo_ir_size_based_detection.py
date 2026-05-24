from __future__ import annotations

import math


def test_pd_lower_at_3km_than_at_500m():
    target_size_m = 3.0
    def angular_size(range_m: float) -> float:
        return math.degrees(math.atan(target_size_m / range_m)) * 3600

    ang_500m = angular_size(500)
    ang_3km = angular_size(3000)
    assert ang_500m > ang_3km, (
        f"tamano angular a 500m ({ang_500m:.2f} arcsec) debe ser > que a 3km ({ang_3km:.2f} arcsec)"
    )
    pd_ratio = (ang_3km / ang_500m) ** 2
    assert pd_ratio < 0.5, (
        f"Pd a 3km debe ser significativamente menor que a 500m: ratio {pd_ratio:.2%}"
    )
