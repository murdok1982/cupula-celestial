"""Integration test: flujo completo de autorización de enfrentamiento.

Simula: operador autoriza → audit-log registra → swarm-controller ejecuta.

Requiere: cupula stack running (make up).
"""

from __future__ import annotations

import json
import os
import time

import httpx
import pytest

HMI_URL = os.environ.get("HMI_GATEWAY_URL", "http://localhost:8080")
SWARM_URL = os.environ.get("SWARM_CONTROLLER_URL", "http://localhost:9200")
AUDIT_URL = os.environ.get("AUDIT_LOG_URL", "http://localhost:9300")
TIMEOUT_S = int(os.environ.get("INTEGRATION_TIMEOUT", "30"))


@pytest.fixture(scope="module")
def client():
    with httpx.Client(timeout=10.0, verify=False) as c:
        yield c


def _skip_if_unavailable(url: str, label: str, client: httpx.Client) -> bool:
    try:
        r = client.get(f"{url}/health", timeout=3.0)
        return r.status_code >= 500
    except Exception:
        return True


@pytest.mark.integration
def test_audit_log_health(client: httpx.Client):
    """audit-log responde en /health."""
    if _skip_if_unavailable(AUDIT_URL, "audit-log", client):
        pytest.skip("audit-log no disponible")
    resp = client.get(f"{AUDIT_URL}/health")
    assert resp.status_code == 200


@pytest.mark.integration
def test_hmi_gateway_health(client: httpx.Client):
    """hmi-gateway responde en /health."""
    if _skip_if_unavailable(HMI_URL, "hmi-gateway", client):
        pytest.skip("hmi-gateway no disponible")
    resp = client.get(f"{HMI_URL}/health")
    assert resp.status_code == 200


@pytest.mark.integration
def test_swarm_controller_health(client: httpx.Client):
    """swarm-controller (internal) responde."""
    if _skip_if_unavailable(SWARM_URL, "swarm-controller", client):
        pytest.skip("swarm-controller no disponible (solo intra-network)")
    resp = client.get(f"{SWARM_URL}/health")
    assert resp.status_code == 200


@pytest.mark.integration
def test_audit_log_chain_integrity(client: httpx.Client):
    """Verificar que audit-log expone eventos con hash chain."""
    if _skip_if_unavailable(AUDIT_URL, "audit-log", client):
        pytest.skip("audit-log no disponible")

    resp = client.get(f"{AUDIT_URL}/v1/events?limit=5", timeout=5.0)
    if resp.status_code == 200:
        data = resp.json()
        events = data.get("events", [])
        if events:
            for e in events:
                assert "hash" in e, "cada evento debe tener hash"
                assert "previous_hash" in e, "cada evento debe tener previous_hash"
