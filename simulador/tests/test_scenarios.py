from __future__ import annotations

import pytest

from app.scenarios import get as get_scenario


class TestScenarios:
    def test_single_returns_one_target(self):
        s = get_scenario("single")
        assert len(s.targets) == 1

    def test_saturation_returns_12_targets(self):
        s = get_scenario("saturation")
        assert len(s.targets) == 12

    def test_jammed_has_no_rf(self):
        s = get_scenario("jammed")
        assert s.rf_enabled is False

    def test_mixed_has_iff_and_hostile(self):
        s = get_scenario("mixed")
        hostiles = [t for t in s.targets if not t.has_iff]
        friendlies = [t for t in s.targets if t.has_iff]
        assert len(hostiles) >= 1
        assert len(friendlies) >= 1

    def test_all_scenarios_have_valid_positions(self, all_scenarios):
        for scenario in all_scenarios:
            for t in scenario.targets:
                assert -90.0 <= t.lat0 <= 90.0, f"{scenario.name}: lat {t.lat0} out of range"
                assert -180.0 <= t.lon0 <= 180.0, f"{scenario.name}: lon {t.lon0} out of range"
                assert 0.0 <= t.alt0_m <= 50_000.0, f"{scenario.name}: alt {t.alt0_m} out of range"
