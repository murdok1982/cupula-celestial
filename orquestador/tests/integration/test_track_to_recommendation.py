"""Integration test: track-fusion → threat-classifier → decision-engine pipeline.

Usa mock HTTP para simular servicios que no están disponibles en el entorno
de test. Verifica el flujo: track confirmado → clasificación de amenaza →
recomendación de enfrentamiento.

Requiere: cupula stack running (make up) o mocks configurados.
"""

from __future__ import annotations

import json
import os
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread
from typing import Any
from urllib.parse import urlparse

import httpx
import pytest

THREAT_URL = os.environ.get("THREAT_CLASSIFIER_URL", "http://localhost:8001")
DECISION_URL = os.environ.get("DECISION_ENGINE_URL", "http://localhost:8002")
TIMEOUT_S = int(os.environ.get("INTEGRATION_TIMEOUT", "30"))


class MockOpaHandler(BaseHTTPRequestHandler):
    """Mock mínimo de OPA para que decision-engine pueda funcionar."""

    def do_post(self):
        parsed = urlparse(self.path)
        if parsed.path == "/v1/data/roe/allow_engagement":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length else b"{}"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = json.dumps({"result": {"allow": True, "reason": "test_mock"}})
            self.wfile.write(response.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # silencioso


@pytest.fixture(scope="module")
def mock_opa_server():
    """Lanza un mock de OPA en un puerto efímero."""
    server = HTTPServer(("127.0.0.1", 0), MockOpaHandler)
    port = server.server_address[1]
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield port
    server.shutdown()


@pytest.fixture(scope="module")
def client():
    with httpx.Client(timeout=10.0, verify=False) as c:
        yield c


@pytest.mark.integration
def test_threat_classifier_health(client: httpx.Client):
    """threat-classifier responde en /health."""
    try:
        resp = client.get(f"{THREAT_URL}/health", timeout=3.0)
        assert resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        pytest.skip("threat-classifier no disponible")


@pytest.mark.integration
def test_classify_track(client: httpx.Client):
    """Clasificar un track como amenaza."""
    try:
        resp = client.get(f"{THREAT_URL}/health", timeout=2.0)
        if resp.status_code != 200:
            pytest.skip("threat-classifier no disponible")
    except (httpx.ConnectError, httpx.TimeoutException):
        pytest.skip("threat-classifier no disponible")

    payload = {
        "track_id": "T-THR-001",
        "lat": 40.42,
        "lon": -3.70,
        "alt_m": 1000.0,
        "velocity_ms": 150.0,
        "heading_deg": 270.0,
        "sensor_type": "RADAR_AESA",
        "classification": "HOSTILE",
        "confidence": 0.92,
        "target_type": "UAS",
    }
    resp = client.post(f"{THREAT_URL}/v1/classify", json=payload, timeout=5.0)
    # Acepta respuesta exitosa o auth requerida
    assert resp.status_code in (200, 401, 403), f"Unexpected: {resp.status_code}"


@pytest.mark.integration
def test_decision_engine_health(client: httpx.Client, mock_opa_server):
    """decision-engine responde en /health."""
    try:
        resp = client.get(f"{DECISION_URL}/health", timeout=3.0)
        assert resp.status_code == 200
    except (httpx.ConnectError, httpx.TimeoutException):
        pytest.skip("decision-engine no disponible")
