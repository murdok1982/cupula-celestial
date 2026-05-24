from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest

from app.radar_sim import TargetKinematic, reading_for as radar_reading
from app.scenarios import get as get_scenario

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_INTEGRATION") != "1",
    reason="set RUN_INTEGRATION=1 to run integration tests",
)

_DRONE_DIR = Path(__file__).parent.parent / "drone-simulator"
_DRONE_MOD_NAME = "tests_integration_drone_mod"
_spec = importlib.util.spec_from_file_location(_DRONE_MOD_NAME, str(_DRONE_DIR / "app" / "drone.py"))
_drone_mod = importlib.util.module_from_spec(_spec)
sys.modules[_DRONE_MOD_NAME] = _drone_mod
_spec.loader.exec_module(_drone_mod)

apply_waypoint = _drone_mod.apply_waypoint
DroneState = _drone_mod.DroneState


class TestIntegration:
    def test_sensor_to_ingest_format(self):
        scenario = get_scenario("single")
        target = scenario.targets[0]
        reading = radar_reading(target)
        assert reading["sensor_type"] == "RADAR_AESA"
        assert "sensor_id" in reading
        assert "timestamp" in reading
        assert "position" in reading
        assert "latitude" in reading["position"]
        assert "longitude" in reading["position"]
        assert "detection" in reading
        assert "range_m" in reading["detection"]
        assert "azimuth_deg" in reading["detection"]
        assert "elevation_deg" in reading["detection"]
        assert "doppler_mps" in reading["detection"]
        assert "rcs_dbsm" in reading["detection"]
        assert "snr_db" in reading

    def test_drone_ma_link_loopback(self):
        d = DroneState(sys_id=1, callsign="I-01", lat=40.416, lon=-3.704, alt_m=20.0)
        lat_raw = 404200000
        lon_raw = -371000000
        alt_raw = 100.0
        lat = lat_raw / 1e7
        lon = lon_raw / 1e7
        apply_waypoint(d, lat, lon, alt_raw)
        assert d.lat == 40.42
        assert d.lon == -37.1
        assert d.alt_m == 100.0
        assert d.status == "ENROUTE"
