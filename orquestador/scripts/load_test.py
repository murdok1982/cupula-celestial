"""Carga sintética básica contra el sensor-ingest.

Envía N detecciones/s durante T segundos, mide tasa aceptada y latencia.
"""
from __future__ import annotations

import asyncio
import os
import random
import time
from datetime import datetime, timezone

import httpx

URL = os.environ.get("SENSOR_INGEST_URL", "http://localhost:9000")
RATE_HZ = int(os.environ.get("RATE_HZ", "20"))
DURATION_S = int(os.environ.get("DURATION_S", "30"))


def sample() -> dict:
    return {
        "sensor_id": f"LOAD-{random.randint(1,3)}",
        "sensor_type": "RADAR_AESA",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "position": {
            "latitude": 40.4 + random.uniform(-0.02, 0.02),
            "longitude": -3.7 + random.uniform(-0.02, 0.02),
            "altitude_msl_m": 700.0,
            "altitude_agl_m": 300.0,
        },
        "detection": {
            "range_m": random.uniform(1000, 8000),
            "azimuth_deg": random.uniform(0, 359),
            "elevation_deg": random.uniform(2, 30),
            "doppler_mps": random.uniform(-50, 50),
            "rcs_dbsm": random.uniform(-30, -5),
            "spectrum_signature": None,
            "micro_doppler_period_ms": None,
            "feature_vector": [],
        },
        "snr_db": random.uniform(8, 22),
        "quality": random.uniform(0.5, 0.9),
    }


async def run() -> None:
    interval = 1.0 / RATE_HZ
    deadline = time.time() + DURATION_S
    ok = 0
    err = 0
    latencies = []
    async with httpx.AsyncClient(timeout=2.0) as client:
        while time.time() < deadline:
            t0 = time.time()
            try:
                r = await client.post(f"{URL}/v1/sensors/reading", json=sample())
                if r.status_code < 400:
                    ok += 1
                else:
                    err += 1
            except httpx.HTTPError:
                err += 1
            latencies.append((time.time() - t0) * 1000.0)
            await asyncio.sleep(max(0.0, interval - (time.time() - t0)))
    latencies.sort()
    p50 = latencies[len(latencies) // 2] if latencies else 0
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
    print(f"ok={ok} err={err} p50={p50:.1f}ms p95={p95:.1f}ms total={len(latencies)}")


if __name__ == "__main__":
    asyncio.run(run())
