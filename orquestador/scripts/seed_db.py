"""Seed inicial: añade sensores e interceptores de PoC.

ATENCIÓN OPSEC (H-ALT-010): las coordenadas son ficticias (offsets sobre Null
Island 0,0) — sustituir por catálogo real (carga firmada) en producción.

Ejecutar tras `make up`:
    docker compose exec -T postgres psql -U cupula -d cupula < scripts/seed_db.py.sql
o directo:
    python scripts/seed_db.py
"""
from __future__ import annotations

import asyncio
import os

import asyncpg

DSN = os.environ.get("DATABASE_URL", "postgres://cupula:changeme_dev_only@localhost:5432/cupula")


SEED_SQL = """
-- COORDENADAS FICTICIAS — H-ALT-010 OPSEC.
-- Sensores (ofuscados; offsets sobre 0,0)
INSERT INTO sensors_registered (sensor_code, sensor_type, location, altitude_m, range_km, status)
VALUES
    ('RAD-AESA-EJ-01', 'RADAR_AESA',  ST_GeographyFromText('SRID=4326;POINT(0.0035 0.0030)'), 50, 10, 'ACTIVE'),
    ('RAD-AESA-EJ-02', 'RADAR_AESA',  ST_GeographyFromText('SRID=4326;POINT(0.0050 0.0040)'), 50, 10, 'ACTIVE'),
    ('RF-SDR-EJ-02',   'RF_SPECTRUM', ST_GeographyFromText('SRID=4326;POINT(0.0045 0.0035)'), 30, 8, 'ACTIVE'),
    ('EOIR-EJ-01',     'EO_IR',       ST_GeographyFromText('SRID=4326;POINT(0.0040 0.0033)'), 40, 4, 'ACTIVE')
ON CONFLICT (sensor_code) DO NOTHING;

-- Interceptores
INSERT INTO interceptors (callsign, interceptor_type, payload_type, base_location, battery_pct, status)
VALUES
    ('I-01', 'kinetic-1',  'KINETIC', ST_GeographyFromText('SRID=4326;POINT(0.0035 0.0030)'), 100, 'READY'),
    ('I-02', 'kinetic-1',  'KINETIC', ST_GeographyFromText('SRID=4326;POINT(0.0035 0.0030)'), 100, 'READY'),
    ('I-03', 'net-capture','NET',     ST_GeographyFromText('SRID=4326;POINT(0.0050 0.0040)'), 100, 'READY'),
    ('I-04', 'frag-50g',   'FRAG',    ST_GeographyFromText('SRID=4326;POINT(0.0050 0.0040)'), 100, 'READY'),
    ('I-05', 'kinetic-1',  'KINETIC', ST_GeographyFromText('SRID=4326;POINT(0.0045 0.0035)'), 100, 'READY'),
    ('I-06', 'jammer-rf',  'JAMMER',  ST_GeographyFromText('SRID=4326;POINT(0.0045 0.0035)'), 100, 'READY')
ON CONFLICT (callsign) DO NOTHING;
"""


async def main() -> None:
    conn = await asyncpg.connect(DSN)
    try:
        for stmt in SEED_SQL.strip().split(";\n"):
            stmt = stmt.strip()
            if not stmt:
                continue
            await conn.execute(stmt)
        print("seed OK")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
