"""Simulador de RF spectrum sensing."""
from __future__ import annotations

import random
from datetime import datetime, timezone

from .radar_sim import TargetKinematic


KNOWN_SIGS = ["OcuSync_v3", "ELRS_915", "Skydroid_5G", "TBS_Crossfire"]


def reading_for(t: TargetKinematic, sensor_id: str = "RF-SDR-MAD-02", protocol: str | None = None) -> dict:
    if protocol is not None and protocol not in KNOWN_SIGS:
        return {
            "sensor_id": sensor_id,
            "sensor_type": "RF_SPECTRUM",
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "position": {
                "latitude": t.lat0,
                "longitude": t.lon0,
                "altitude_msl_m": t.alt0_m,
                "altitude_agl_m": max(0.0, t.alt0_m - 500.0),
            },
            "detection": {
                "range_m": 0.0,
                "azimuth_deg": 0.0,
                "elevation_deg": 0.0,
                "doppler_mps": 0.0,
                "rcs_dbsm": -99.0,
                "spectrum_signature": None,
                "micro_doppler_period_ms": None,
                "feature_vector": [],
            },
            "snr_db": 0.0,
            "quality": 0.0,
        }
    return {
        "sensor_id": sensor_id,
        "sensor_type": "RF_SPECTRUM",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "position": {
            "latitude": t.lat0,
            "longitude": t.lon0,
            "altitude_msl_m": t.alt0_m,
            "altitude_agl_m": max(0.0, t.alt0_m - 500.0),
        },
        "detection": {
            "range_m": random.uniform(2500.0, 8000.0),
            "azimuth_deg": random.uniform(0, 359),
            "elevation_deg": random.uniform(2, 20),
            "doppler_mps": 0.0,
            "rcs_dbsm": -99.0,
            "spectrum_signature": random.choice(KNOWN_SIGS),
            "micro_doppler_period_ms": None,
            "feature_vector": [],
        },
        "snr_db": random.uniform(8.0, 18.0),
        "quality": random.uniform(0.6, 0.9),
    }
