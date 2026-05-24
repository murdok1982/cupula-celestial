from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_DRONE_DIR = Path(__file__).parent.parent / "drone-simulator"
_DRONE_MOD_NAME = "tests_drone_mod"
_spec = importlib.util.spec_from_file_location(_DRONE_MOD_NAME, str(_DRONE_DIR / "app" / "drone.py"))
_drone_mod = importlib.util.module_from_spec(_spec)
sys.modules[_DRONE_MOD_NAME] = _drone_mod
_spec.loader.exec_module(_drone_mod)

DroneState = _drone_mod.DroneState
apply_waypoint = _drone_mod.apply_waypoint
apply_abort = _drone_mod.apply_abort


class TestDroneSim:
    def test_drone_init_default_state(self):
        d = DroneState(sys_id=1, callsign="TEST-01", lat=40.416, lon=-3.704, alt_m=20.0)
        assert d.status == "READY"

    def test_apply_waypoint_updates_position(self):
        d = DroneState(sys_id=1, callsign="TEST-01", lat=40.416, lon=-3.704, alt_m=20.0)
        apply_waypoint(d, lat=40.420, lon=-3.710, alt=100.0)
        assert d.lat == 40.420
        assert d.lon == -3.710
        assert d.alt_m == 100.0
        assert d.status == "ENROUTE"

    def test_apply_abort_sets_aborted_status(self):
        d = DroneState(sys_id=1, callsign="TEST-01", lat=40.416, lon=-3.704, alt_m=20.0)
        apply_abort(d)
        assert d.status == "ABORTED"

    def test_multiple_drones_unique_ids(self, drone_enjambre):
        drones = drone_enjambre(n=10)
        ids = [d.sys_id for d in drones]
        assert len(ids) == len(set(ids))
