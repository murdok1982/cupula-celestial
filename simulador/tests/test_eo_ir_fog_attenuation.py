from __future__ import annotations

import math


def test_fog_attenuation_reduces_snr():
    vis_clear_km = 23.0
    vis_foggy_km = 1.0
    range_km = 5.0
    atten_clear = math.exp(-3.912 / vis_clear_km * range_km)
    atten_foggy = math.exp(-3.912 / vis_foggy_km * range_km)
    assert atten_foggy < atten_clear, (
        f"atenuacion en niebla ({atten_foggy}) debe ser mayor que en claro ({atten_clear})"
    )
    snr_reduction = atten_foggy / atten_clear
    assert snr_reduction < 0.5, (
        f"SNR en niebla debe ser <50% del claro: {snr_reduction:.2%}"
    )
