"""Simulador EO/IR gimbal slew-to-cue.

Mejoras incorporadas:
- Modelo de resolución: tamaño aparente = real_size / distancia (radianes)
- Detección condicional: si tamaño aparente < 2 píxeles, Pd = 0.1
- Clasificación visual basada en relación aspecto (target_type)
- Efecto de niebla/visibilidad: afecta SNR
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from .radar_sim import TargetKinematic

# Parámetros del sensor EO/IR
SENSOR_ID = "EOIR-MAD-01"
IFOV_RAD = 0.5e-3  # 0.5 mrad por píxel
VISIBILITY_KM = 15.0  # visibilidad atmosférica por defecto (km)

# Tamaño físico típico por tipo de target
TARGET_SIZE_M = {
    "rotary": 1.2,   # dron multirrotor ~1.2m
    "fixed": 4.0,    # ala fija / Cessna ~4m
}


def reading_for(
    t: TargetKinematic,
    sensor_id: str = SENSOR_ID,
    visibility_km: float = VISIBILITY_KM,
) -> dict:
    # Distancia inclinada desde el sensor al target
    range_km = math.sqrt(
        (t.lat0 - 40.450) ** 2 * (111_111.0) ** 2
        + (t.lon0 + 3.720) ** 2 * (111_111.0 * math.cos(math.radians(40.450))) ** 2
    ) / 1000.0
    alt_diff_m = t.alt0_m - 500.0
    slant_range_m = math.sqrt((range_km * 1000) ** 2 + alt_diff_m ** 2)
    slant_range_km = slant_range_m / 1000.0

    # Tamaño aparente del target en radianes
    size_m = TARGET_SIZE_M.get(t.target_type, 1.0)
    apparent_size_rad = size_m / max(1.0, slant_range_m)
    apparent_pixels = apparent_size_rad / IFOV_RAD

    # Detección condicional por resolución
    if apparent_pixels < 2.0:
        detection_prob = 0.1
    else:
        detection_prob = 1.0

    # Clasificación visual basada en relación aspecto
    if t.target_type == "fixed":
        classification = "FIXED_WING"
        aspect_ratio = 3.0
    else:
        classification = "ROTARY"
        aspect_ratio = 1.2

    # Efecto de niebla/visibilidad (modelo de atenuación de Koschmieder)
    beta = 3.912 / max(0.1, visibility_km)
    attenuation_db = 10.0 * math.log10(math.exp(beta * slant_range_km))
    snr_db = max(1.0, 20.0 - attenuation_db)

    quality = round(detection_prob * 0.92, 3)

    return {
        "sensor_id": sensor_id,
        "sensor_type": "EO_IR",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "position": {
            "latitude": t.lat0,
            "longitude": t.lon0,
            "altitude_msl_m": t.alt0_m,
            "altitude_agl_m": max(0.0, t.alt0_m - 500.0),
        },
        "detection": {
            "range_m": round(slant_range_m, 1),
            "azimuth_deg": (t.bearing_deg + 180.0) % 360.0,
            "elevation_deg": round(math.degrees(math.atan2(alt_diff_m, max(1.0, slant_range_m))), 2),
            "doppler_mps": 0.0,
            "rcs_dbsm": -99.0,
            "spectrum_signature": None,
            "micro_doppler_period_ms": None,
            "feature_vector": [
                {"key": "classification", "value": classification},
                {"key": "apparent_px", "value": round(apparent_pixels, 2)},
                {"key": "aspect_ratio", "value": aspect_ratio},
                {"key": "detection_prob", "value": detection_prob},
            ],
        },
        "snr_db": round(snr_db, 2),
        "quality": quality,
    }
