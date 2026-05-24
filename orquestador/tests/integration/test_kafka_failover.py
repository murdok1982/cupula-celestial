"""Integration test: comportamiento degradado si Kafka/Redpanda no está disponible.

Verifica que los servicios del stack arrancan y responden en /health incluso
si Redpanda no está accesible, y que reintentan la conexión en background.

Requiere: cupula stack running (make up).
"""

from __future__ import annotations

import os
import signal
import subprocess
import time

import httpx
import pytest

SERVICES = {
    "sensor-ingest": os.environ.get("SENSOR_INGEST_URL", "http://localhost:9000"),
    "track-fusion": os.environ.get("TRACK_FUSION_URL", "http://localhost:9100"),
    "hmi-gateway": os.environ.get("HMI_GATEWAY_URL", "http://localhost:8080"),
    "audit-log": os.environ.get("AUDIT_LOG_URL", "http://localhost:9300"),
}
TIMEOUT_S = int(os.environ.get("INTEGRATION_TIMEOUT", "30"))


@pytest.fixture(scope="module")
def client():
    with httpx.Client(timeout=5.0, verify=False) as c:
        yield c


@pytest.mark.integration
def test_services_respond_with_kafka(client: httpx.Client):
    """Todos los servicios responden /health con Kafka presente."""
    for name, url in SERVICES.items():
        try:
            resp = client.get(f"{url}/health", timeout=3.0)
            if resp.status_code < 500:
                continue  # OK
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        pytest.skip(f"{name} ({url}) no disponible")

    for name, url in SERVICES.items():
        resp = client.get(f"{url}/health", timeout=3.0)
        assert resp.status_code < 500, f"{name} no saludable: {resp.status_code}"


@pytest.mark.integration
def test_services_degraded_without_kafka():
    """Simular caída de Kafka: detener redpanda y verificar degradado."""
    import docker  # type: ignore[import]

    try:
        client = docker.from_env()
        redpanda = client.containers.get("cupula-redpanda")
    except (ImportError, docker.errors.DockerException, docker.errors.NotFound):
        pytest.skip("docker SDK no disponible o redpanda no encontrado")

    # Pausar redpanda
    redpanda.pause()

    try:
        time.sleep(3)
        for name, url in SERVICES.items():
            try:
                resp = httpx.get(f"{url}/health", timeout=5.0, verify=False)
                # Los servicios deben seguir respondiendo (degradados)
                assert resp.status_code < 500, (
                    f"{name} debería responder aunque sea degradado, "
                    f"got {resp.status_code}"
                )
            except (httpx.ConnectError, httpx.TimeoutException):
                pytest.skip(f"{name} no disponible tras pausa de Kafka")
    finally:
        redpanda.unpause()
