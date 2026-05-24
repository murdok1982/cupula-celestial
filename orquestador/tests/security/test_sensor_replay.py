"""sensor-ingest: nonce anti-replay debe rechazar segundo uso."""
from __future__ import annotations

import hashlib
import hmac
import os
import time
import uuid

import httpx
import pytest

SENSOR_INGEST_URL = os.environ.get("SENSOR_INGEST_URL", "http://localhost:9000")
SENSOR_ID = os.environ.get("TEST_SENSOR_ID", "sensor_test_001")
SENSOR_KEY = os.environ.get("TEST_SENSOR_KEY", "dev_sensor_key_change_me")


def _sign(body: bytes, sensor_id: str, ts: int, nonce: str, key: str) -> str:
    body_hash = hashlib.sha256(body).hexdigest()
    msg = f"{sensor_id}:{ts}:{nonce}:{body_hash}".encode()
    sig = hmac.new(key.encode(), msg, hashlib.sha256).hexdigest()
    return f"{sensor_id}:{ts}:{nonce}:{sig}"


def _reading():
    return {
        "sensor_id": SENSOR_ID,
        "timestamp": "2026-05-24T12:00:00Z",
        "lat": 0.0040,
        "lon": 0.0035,
        "alt_m": 200.0,
        "rcs": 0.5,
        "doppler": 0.0,
        "sensor_type": "RADAR",
    }


@pytest.mark.skip(reason="Requiere SENSOR_HMAC_KEYS válido + sensor-ingest arriba")
def test_replay_same_nonce_rejected(client: httpx.Client):
    body = b'{"sensor_id":"sensor_test_001"}'
    ts = int(time.time())
    nonce = uuid.uuid4().hex
    header = _sign(body, SENSOR_ID, ts, nonce, SENSOR_KEY)

    # Primer envío: debería aceptarse (o validar formato body)
    r1 = client.post(
        f"{SENSOR_INGEST_URL}/v1/sensors/reading",
        content=body,
        headers={"X-Sensor-Auth": header, "Content-Type": "application/json"},
    )
    # Replay con mismo nonce: 401
    r2 = client.post(
        f"{SENSOR_INGEST_URL}/v1/sensors/reading",
        content=body,
        headers={"X-Sensor-Auth": header, "Content-Type": "application/json"},
    )
    assert r2.status_code == 401, "replay del mismo nonce no fue rechazado"


def test_missing_auth_header(client: httpx.Client):
    r = client.post(
        f"{SENSOR_INGEST_URL}/v1/sensors/reading",
        json=_reading(),
    )
    assert r.status_code == 401


def test_old_timestamp_rejected(client: httpx.Client):
    body = b'{}'
    old_ts = int(time.time()) - 3600  # 1 hora atrás, fuera de la ventana ±30s
    nonce = uuid.uuid4().hex
    header = _sign(body, SENSOR_ID, old_ts, nonce, SENSOR_KEY)
    r = client.post(
        f"{SENSOR_INGEST_URL}/v1/sensors/reading",
        content=body,
        headers={"X-Sensor-Auth": header, "Content-Type": "application/json"},
    )
    assert r.status_code == 401
