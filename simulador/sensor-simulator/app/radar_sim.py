"""Simulador de radar AESA banda X.

Genera detecciones para un objetivo con trayectoria lineal (CV) o con maniobra
sinusoidal. Añade ruido gaussiano y micro-Doppler periódico.

Mejoras físicas:
- Fluctuación Swerling tipo 1 (RCS exponencial entre scans)
- Probabilidad de detección Pd (modelo Shnidman simplificado)
- Error de rango proporcional a distancia (sigma_range = 0.01 * range)
- Error angular (sigma_az = 0.5° + 0.1° * range_km)
- Ruido gaussiano dependiente de SNR real
- Efecto multipath a baja altura (< 50m AGL)
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np


@dataclass
class TargetKinematic:
    lat0: float
    lon0: float
    alt0_m: float
    bearing_deg: float
    speed_mps: float
    rcs_dbsm: float = -15.0
    has_iff: bool = False
    target_type: str = "rotary"


SENSOR_ID = "RAD-AESA-MAD-01"

# Posición fija del radar (Madrid-Barajas, ~500m MSL)
RADAR_LAT = 40.450
RADAR_LON = -3.720
RADAR_ALT_MSL = 500.0

_rng = np.random.default_rng()


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * 6_371.0 * math.asin(math.sqrt(a))


def _bearing_to(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlon = math.radians(lon2 - lon1)
    y = math.sin(dlon) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - math.sin(
        math.radians(lat1)
    ) * math.cos(math.radians(lat2)) * math.cos(dlon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _shnidman_pd(snr_db: float, pfa: float = 1e-6, n_pulses: int = 1) -> float:
    """Probabilidad de detección Shnidman para blanco Swerling 1."""
    snr_50 = 13.5 if n_pulses == 1 else 8.0
    return 1.0 / (1.0 + math.exp(-0.5 * (snr_db - snr_50)))


def step_position(t: TargetKinematic, dt: float) -> TargetKinematic:
    earth_r = 6_378_137.0
    bearing_rad = math.radians(t.bearing_deg)
    dx = t.speed_mps * dt * math.sin(bearing_rad)
    dy = t.speed_mps * dt * math.cos(bearing_rad)
    new_lat = t.lat0 + math.degrees(dy / earth_r)
    new_lon = t.lon0 + math.degrees(
        dx / (earth_r * math.cos(math.radians(t.lat0)))
    )
    return TargetKinematic(
        lat0=new_lat,
        lon0=new_lon,
        alt0_m=t.alt0_m,
        bearing_deg=t.bearing_deg,
        speed_mps=t.speed_mps,
        rcs_dbsm=t.rcs_dbsm,
        has_iff=t.has_iff,
        target_type=t.target_type,
    )


def reading_for(t: TargetKinematic, sensor_id: str = SENSOR_ID) -> dict:
    # Distancia y geometría real desde la posición fija del radar
    range_km = _haversine_km(RADAR_LAT, RADAR_LON, t.lat0, t.lon0)
    alt_diff_m = t.alt0_m - RADAR_ALT_MSL
    slant_range_m = math.sqrt((range_km * 1000) ** 2 + alt_diff_m ** 2)
    azimuth_deg = _bearing_to(RADAR_LAT, RADAR_LON, t.lat0, t.lon0)
    elevation_deg = math.degrees(
        math.atan2(alt_diff_m, max(1.0, range_km * 1000))
    )

    # Fluctuación Swerling tipo 1: RCS exponencial entre scans
    rcs_linear = 10 ** (t.rcs_dbsm / 10.0)
    rcs_swerling = _rng.exponential(rcs_linear)
    rcs_dbsm_inst = 10.0 * math.log10(max(1e-10, rcs_swerling))

    # SNR basada en ecuación de radar simplificada
    snr_ref = 25.0
    snr_db = snr_ref + rcs_dbsm_inst - 20.0 * math.log10(max(1.0, range_km))

    # Probabilidad de detección Shnidman
    pd = _shnidman_pd(snr_db)

    # Error de rango proporcional a la distancia
    sigma_range = 0.01 * slant_range_m

    # Error angular
    sigma_az = math.radians(0.5 + 0.1 * range_km)

    # Ruido dependiente de SNR real
    noise_factor = 10 ** (-snr_db / 20.0)
    sigma_pos_base = max(0.5, 3.0 + noise_factor * 10.0)

    # Multipath a baja altura (< 50m AGL)
    agl_m = t.alt0_m - 500.0
    multipath_factor = 1.0
    if agl_m < 50.0:
        factor = 1.0 + (50.0 - agl_m) / 50.0 * 2.0
        multipath_factor = factor
        snr_db -= 3.0 * (50.0 - agl_m) / 50.0

    noisy_lat = t.lat0 + _rng.normal(
        0.0, sigma_pos_base * multipath_factor / 111_111.0
    )
    noisy_lon = t.lon0 + _rng.normal(
        0.0,
        sigma_pos_base * multipath_factor
        / (111_111.0 * math.cos(math.radians(t.lat0))),
    )
    noisy_range = slant_range_m + _rng.normal(0.0, sigma_range)
    noisy_az = (azimuth_deg + math.degrees(_rng.normal(0.0, sigma_az))) % 360.0

    doppler = t.speed_mps * math.cos(
        math.radians(t.bearing_deg - azimuth_deg)
    )
    micro_d_period = 18.0 + _rng.normal(0, 2.0)

    quality = max(0.1, min(0.99, pd * (snr_db / 30.0)))

    return {
        "sensor_id": sensor_id,
        "sensor_type": "RADAR_AESA",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "position": {
            "latitude": noisy_lat,
            "longitude": noisy_lon,
            "altitude_msl_m": t.alt0_m
            + _rng.normal(0, sigma_pos_base * multipath_factor),
            "altitude_agl_m": max(
                0.0,
                agl_m + _rng.normal(0, sigma_pos_base * multipath_factor),
            ),
        },
        "detection": {
            "range_m": max(1.0, noisy_range),
            "azimuth_deg": noisy_az,
            "elevation_deg": elevation_deg
            + _rng.normal(0, 0.5 * multipath_factor),
            "doppler_mps": doppler + _rng.normal(0, 0.5 * noise_factor),
            "rcs_dbsm": rcs_dbsm_inst,
            "spectrum_signature": None,
            "micro_doppler_period_ms": micro_d_period,
            "feature_vector": [],
        },
        "snr_db": round(snr_db, 2),
        "quality": round(quality, 3),
        "pd": round(pd, 4),
    }
