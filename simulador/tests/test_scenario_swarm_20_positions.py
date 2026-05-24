from __future__ import annotations

import pytest


def test_swarm_20_generates_20_unique_positions():
    from app.scenarios import get as get_scenario

    scenario = get_scenario("swarm_20")
    assert scenario is not None, "swarm_20 scenario debe existir"
    targets = scenario.targets
    assert len(targets) >= 20, f"swarm_20 debe tener >=20 targets, tiene {len(targets)}"
    positions = set()
    for t in targets:
        pos = (t.lat0, t.lon0)
        positions.add(pos)
    assert len(positions) >= 20, (
        f"deberian haber 20 posiciones unicas, hay {len(positions)}"
    )
