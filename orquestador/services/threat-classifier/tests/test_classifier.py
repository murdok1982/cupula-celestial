"""Tests del ensemble. No requiere artefactos ONNX (usa stub)."""
from datetime import datetime

import pytest

from app.inference import EnsembleClassifier, RuleBased
from app.models import ThreatClass, TrackFeatures


@pytest.fixture
def clf() -> EnsembleClassifier:
    return EnsembleClassifier()


def _feat(**kwargs) -> TrackFeatures:
    base = dict(
        track_id="T-abcd1234",
        timestamp=datetime.utcnow(),
        speed_mps=50.0,
        altitude_agl_m=300.0,
        rcs_dbsm=-15.0,
        doppler_mps=20.0,
        micro_doppler_period_ms=None,
        spectrum_signature=None,
        has_iff_response=False,
        in_known_corridor=False,
        sensors=["RADAR_AESA"],
    )
    base.update(kwargs)
    return TrackFeatures(**base)


def test_iff_friend_overrides_everything(clf):
    f = _feat(has_iff_response=True, speed_mps=70, altitude_agl_m=400, rcs_dbsm=-15)
    r = clf.classify(f)
    assert r.classification == ThreatClass.MIL_FRIEND


def test_bird_profile(clf):
    f = _feat(speed_mps=10, altitude_agl_m=40, rcs_dbsm=-35)
    r = clf.classify(f)
    assert r.classification in (ThreatClass.BIRD, ThreatClass.UNKNOWN)


def test_civil_corridor(clf):
    f = _feat(in_known_corridor=True, speed_mps=15, altitude_agl_m=80, rcs_dbsm=-20)
    r = clf.classify(f)
    assert r.classification == ThreatClass.CIVIL


def test_loitering_profile_marks_threat(clf):
    f = _feat(speed_mps=60, altitude_agl_m=300, rcs_dbsm=-12, micro_doppler_period_ms=20.0)
    r = clf.classify(f)
    assert r.classification in (ThreatClass.THREAT_PROBABLE, ThreatClass.HOSTILE_CONFIRMED)
    assert r.confidence > 0.2


def test_known_rf_signature_pushes_hostile(clf):
    f = _feat(
        speed_mps=55,
        altitude_agl_m=200,
        rcs_dbsm=-15,
        spectrum_signature="OcuSync_v3",
    )
    r = clf.classify(f)
    assert r.classification in (ThreatClass.HOSTILE_CONFIRMED, ThreatClass.THREAT_PROBABLE)


def test_rule_based_scores_normalized():
    f = _feat(speed_mps=50, altitude_agl_m=200, rcs_dbsm=-15)
    scores, _ = RuleBased.score(f)
    s = sum(scores.values())
    assert 0.99 <= s <= 1.01
