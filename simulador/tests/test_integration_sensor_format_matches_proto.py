from __future__ import annotations

from app.radar_sim import reading_for
from app.eo_ir_sim import reading_for as eo_ir_reading_for
from app.rf_sim import reading_for as rf_reading_for
from app.radar_sim import TargetKinematic


def test_radar_output_has_expected_fields():
    target = TargetKinematic(40.416, -3.704, 800, 225, 60, -15, False)
    reading = reading_for(target)
    required = {"sensor_id", "sensor_type", "timestamp", "position", "detection", "snr_db", "quality"}
    assert required.issubset(reading.keys()), f"campos faltantes: {required - reading.keys()}"
    pos_required = {"latitude", "longitude", "altitude_msl_m", "altitude_agl_m"}
    assert pos_required.issubset(reading["position"].keys())
    det_required = {"range_m", "azimuth_deg", "elevation_deg", "doppler_mps", "rcs_dbsm"}
    assert det_required.issubset(reading["detection"].keys())


def test_eo_ir_output_has_expected_fields():
    target = TargetKinematic(40.416, -3.704, 800.0, 225, 60, -15, "rotary")
    reading = eo_ir_reading_for(target)
    required = {"sensor_id", "sensor_type", "timestamp", "position", "detection", "snr_db", "quality"}
    assert required.issubset(reading.keys()), f"EO/IR campos faltantes: {required - reading.keys()}"


def test_rf_output_has_expected_fields():
    target = TargetKinematic(40.416, -3.704, 800.0, 225, 60, -15, "rotary")
    reading = rf_reading_for(target)
    required = {"sensor_id", "sensor_type", "timestamp", "position", "detection", "snr_db", "quality"}
    assert required.issubset(reading.keys()), f"RF campos faltantes: {required - reading.keys()}"
