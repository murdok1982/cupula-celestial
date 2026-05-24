"""Escenarios sintéticos."""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.radar_sim import TargetKinematic


@dataclass
class Scenario:
    name: str
    targets: list[TargetKinematic]
    duration_s: int
    tick_hz: float
    rf_enabled: bool = True


def single() -> Scenario:
    """Un Shahed-like a ~6 km al noreste de Madrid, aproximándose al SW."""
    return Scenario(
        name="single",
        targets=[
            TargetKinematic(
                lat0=40.470,
                lon0=-3.640,
                alt0_m=800.0,
                bearing_deg=225.0,
                speed_mps=60.0,
                rcs_dbsm=-15.0,
                has_iff=False,
            )
        ],
        duration_s=45,
        tick_hz=4.0,
    )


def saturation() -> Scenario:
    """12 amenazas mezcladas, varios bearings."""
    import random

    random.seed(42)
    ts: list[TargetKinematic] = []
    for _ in range(12):
        ts.append(
            TargetKinematic(
                lat0=40.41 + random.uniform(-0.04, 0.04),
                lon0=-3.70 + random.uniform(-0.04, 0.04),
                alt0_m=600.0 + random.uniform(-100, 200),
                bearing_deg=random.uniform(0, 359),
                speed_mps=random.choice([25.0, 50.0, 60.0]),
                rcs_dbsm=random.choice([-15.0, -25.0, -10.0]),
                has_iff=False,
            )
        )
    return Scenario(name="saturation", targets=ts, duration_s=60, tick_hz=5.0)


def jammed() -> Scenario:
    s = single()
    s.name = "jammed"
    s.rf_enabled = False
    s.duration_s = 30
    return s


def mixed() -> Scenario:
    """Mezcla: 2 hostiles, 1 amigo (IFF), 1 civil registrado."""
    return Scenario(
        name="mixed",
        targets=[
            TargetKinematic(40.470, -3.640, 800, 225, 60, -15, False),
            TargetKinematic(40.430, -3.650, 600, 200, 55, -18, False),
            TargetKinematic(40.420, -3.700, 1500, 180, 80, -8, True),
            TargetKinematic(40.400, -3.690, 100, 90, 18, -25, False),
        ],
        duration_s=60,
        tick_hz=4.0,
    )


def swarm_20() -> Scenario:
    """20 UAVs en formación de enjambre (5 filas x 4 columnas, separación 50m)."""
    ts: list[TargetKinematic] = []
    for row in range(5):
        for col in range(4):
            lat = 40.450 + row * 50.0 / 111_111.0
            lon = -3.720 + col * 50.0 / (111_111.0 * math.cos(math.radians(40.450)))
            ts.append(
                TargetKinematic(
                    lat0=lat,
                    lon0=lon,
                    alt0_m=300.0 + row * 5.0,
                    bearing_deg=225.0,
                    speed_mps=15.0,
                    rcs_dbsm=-20.0,
                    has_iff=False,
                    target_type="rotary",
                )
            )
    return Scenario(name="swarm_20", targets=ts, duration_s=30, tick_hz=4.0)


def loitering_munition() -> Scenario:
    """1 loitering (Shahed-136) + 3 civiles (Cessna) en espacio aéreo compartido."""
    return Scenario(
        name="loitering_munition",
        targets=[
            TargetKinematic(40.460, -3.650, 700, 270, 50, -12, False, "fixed"),
            TargetKinematic(40.450, -3.630, 1500, 180, 80, -8, True, "fixed"),
            TargetKinematic(40.440, -3.660, 1200, 90, 70, -10, True, "fixed"),
            TargetKinematic(40.470, -3.640, 900, 45, 65, -9, True, "fixed"),
        ],
        duration_s=60,
        tick_hz=4.0,
    )


def low_altitude_terrain() -> Scenario:
    """3 amenazas a 30m AGL siguiendo perfil de terreno simulado."""
    ground_msl = 500.0
    return Scenario(
        name="low_altitude_terrain",
        targets=[
            TargetKinematic(40.430, -3.680, ground_msl + 30, 180, 20, -22, False, "rotary"),
            TargetKinematic(40.420, -3.670, ground_msl + 30, 200, 18, -24, False, "rotary"),
            TargetKinematic(40.440, -3.690, ground_msl + 30, 160, 22, -20, False, "rotary"),
        ],
        duration_s=45,
        tick_hz=5.0,
    )


def electronic_attack() -> Scenario:
    """2 amenazas reales + 5 señuelos RF + 3 drones amigo identificados IFF."""
    ts: list[TargetKinematic] = []
    ts.append(TargetKinematic(40.460, -3.660, 500, 225, 55, -15, False, "fixed"))
    ts.append(TargetKinematic(40.440, -3.680, 600, 210, 60, -18, False, "fixed"))
    for i in range(5):
        ts.append(
            TargetKinematic(
                lat0=40.450 + i * 0.002,
                lon0=-3.670 + i * 0.002,
                alt0_m=550.0,
                bearing_deg=220.0,
                speed_mps=50.0,
                rcs_dbsm=-30.0,
                has_iff=False,
                target_type="rotary",
            )
        )
    for i in range(3):
        ts.append(
            TargetKinematic(
                lat0=40.410 + i * 0.003,
                lon0=-3.710 + i * 0.002,
                alt0_m=2000.0,
                bearing_deg=90.0,
                speed_mps=70.0,
                rcs_dbsm=-8.0,
                has_iff=True,
                target_type="fixed",
            )
        )
    return Scenario(name="electronic_attack", targets=ts, duration_s=60, tick_hz=5.0)


def get(name: str) -> Scenario:
    return {
        "single": single,
        "saturation": saturation,
        "jammed": jammed,
        "mixed": mixed,
        "swarm_20": swarm_20,
        "loitering_munition": loitering_munition,
        "low_altitude_terrain": low_altitude_terrain,
        "electronic_attack": electronic_attack,
    }.get(name, single)()
