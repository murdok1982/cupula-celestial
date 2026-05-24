"""Fixtures comunes para tests de seguridad."""
from __future__ import annotations

import os
import pytest
import httpx

HMI_GATEWAY_URL = os.environ.get("HMI_GATEWAY_URL", "http://localhost:8080")
SENSOR_INGEST_URL = os.environ.get("SENSOR_INGEST_URL", "http://localhost:9000")
SWARM_CONTROLLER_URL = os.environ.get("SWARM_CONTROLLER_URL", "http://swarm-controller:9200")
AUDIT_LOG_URL = os.environ.get("AUDIT_LOG_URL", "http://localhost:9300")


@pytest.fixture(scope="session")
def hmi_url() -> str:
    return HMI_GATEWAY_URL


@pytest.fixture(scope="session")
def sensor_url() -> str:
    return SENSOR_INGEST_URL


@pytest.fixture(scope="session")
def swarm_url() -> str:
    return SWARM_CONTROLLER_URL


@pytest.fixture(scope="session")
def audit_url() -> str:
    return AUDIT_LOG_URL


@pytest.fixture(scope="session")
def client():
    with httpx.Client(timeout=10.0) as c:
        yield c
