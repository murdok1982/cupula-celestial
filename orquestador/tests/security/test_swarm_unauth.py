"""swarm-controller: POST sin HMAC ni JWT → 401."""
from __future__ import annotations

import os
import httpx
import pytest

# Por defecto swarm-controller NO está publicado al host (H-CRIT-001).
# El test asume haber publicado temporalmente o se ejecuta `docker compose exec`.
SWARM_URL = os.environ.get("SWARM_CONTROLLER_URL", "http://swarm-controller:9200")


@pytest.mark.skip(reason="Requiere acceso intra-network. Ejecutar via docker compose exec.")
def test_engage_without_auth(client: httpx.Client):
    r = client.post(
        f"{SWARM_URL}/v1/command/engage",
        json={
            "recommendation_id": "x",
            "track_id": "y",
            "interceptors": [],
            "target_lat": 0,
            "target_lon": 0,
            "target_alt_m": 0,
        },
    )
    assert r.status_code == 401


@pytest.mark.skip(reason="Requiere intra-network access")
def test_engage_with_invalid_hmac(client: httpx.Client):
    r = client.post(
        f"{SWARM_URL}/v1/command/engage",
        headers={"X-Internal-Auth": "deadbeef"},
        json={},
    )
    assert r.status_code == 401


@pytest.mark.skip(reason="Requiere intra-network access")
def test_abort_without_auth(client: httpx.Client):
    r = client.post(f"{SWARM_URL}/v1/command/abort", json={"track_id": "x"})
    assert r.status_code == 401
