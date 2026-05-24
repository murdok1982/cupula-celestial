from __future__ import annotations

import sys
from pathlib import Path

import pytest

_SENSOR = str(Path(__file__).parent.parent / "sensor-simulator")
if _SENSOR not in sys.path:
    sys.path.insert(0, _SENSOR)


@pytest.fixture
def sample_target():
    from app.radar_sim import TargetKinematic

    return TargetKinematic(
        lat0=40.416,
        lon0=-3.704,
        alt0_m=800.0,
        bearing_deg=225.0,
        speed_mps=60.0,
        rcs_dbsm=-15.0,
        has_iff=False,
    )


@pytest.fixture
def all_scenarios():
    from app.scenarios import get as get_scenario

    return [get_scenario(n) for n in ["single", "saturation", "jammed", "mixed"]]


@pytest.fixture
def drone_enjambre():
    def _make(n: int = 5):
        import importlib.util

        _d = Path(__file__).parent.parent / "drone-simulator"
        _n = f"conftest_drone_mod_{n}"
        _spec = importlib.util.spec_from_file_location(
            _n, str(_d / "app" / "drone.py")
        )
        _mod = importlib.util.module_from_spec(_spec)
        sys.modules[_n] = _mod
        _spec.loader.exec_module(_mod)
        return [
            _mod.DroneState(
                sys_id=i + 1,
                callsign=f"I-{i + 1:02d}",
                lat=40.416 + i * 0.001,
                lon=-3.704 + i * 0.001,
                alt_m=20.0,
            )
            for i in range(n)
        ]

    return _make
