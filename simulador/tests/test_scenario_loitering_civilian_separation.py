from __future__ import annotations


def test_loitering_munition_separates_threat_from_civilians():
    from app.scenarios import get as get_scenario

    scenario = get_scenario("loitering_munition")
    assert scenario is not None, "loitering_munition scenario debe existir"
    targets = scenario.targets
    civilians = getattr(scenario, "civilians", [])
    threats = [t for t in targets if not getattr(t, "has_iff", False)]
    assert len(threats) >= 1, "debe haber al menos 1 amenaza"
    if civilians:
        for t in threats:
            for c in civilians:
                lat_diff = abs(t.lat0 - c.lat0)
                lon_diff = abs(t.lon0 - c.lon0)
                assert not (lat_diff < 0.0005 and lon_diff < 0.0005), (
                    f"amenaza {t} no debe solaparse con civil"
                )
