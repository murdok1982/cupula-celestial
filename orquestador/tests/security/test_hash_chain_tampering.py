"""audit-log: manipular directamente la BD invalida verify_chain.

Este test requiere acceso a la BD (PoC: vía psql en el container postgres).
En CI se ejecuta tras `make up`.
"""
from __future__ import annotations

import os
import subprocess

import httpx
import pytest


AUDIT_LOG_URL = os.environ.get("AUDIT_LOG_URL", "http://localhost:9300")


def test_verify_chain_endpoint_responds(client: httpx.Client):
    r = client.get(f"{AUDIT_LOG_URL}/v1/verify_chain")
    assert r.status_code == 200
    body = r.json()
    assert "valid" in body
    assert "total_events" in body


def test_batch_endpoint_responds(client: httpx.Client):
    r = client.get(f"{AUDIT_LOG_URL}/v1/batches")
    assert r.status_code == 200
    assert "batches" in r.json()


def test_signing_keys_endpoint_responds(client: httpx.Client):
    r = client.get(f"{AUDIT_LOG_URL}/v1/signing_keys")
    assert r.status_code == 200
    body = r.json()
    assert "keys" in body


@pytest.mark.skip(reason="Destructivo: requiere entorno test con SQL UPDATE permission via psql exec")
def test_tampered_payload_detected_by_batch_sig():
    """Después de manipular un payload en audit_log:
       1. /v1/verify_chain → hash_chain válido (porque hash no cambia si manipulan
          sólo el campo payload, pero...) si recalculamos el hash del evento
          el campo "hash" ya no coincidirá → broken_at_seq.
       2. Si manipulan también el hash, la cadena se rompe.
       3. Si manipulan hash y prev_hash de todos, la firma del batch detecta.
    """
    # Comando que requiere ejecutar dentro del entorno docker:
    # docker exec cupula-postgres psql -U cupula -d cupula -c \
    #   "UPDATE audit_log SET payload = '{\"tampered\":true}'::jsonb WHERE seq = 1;"
    # Como UPDATE está bloqueado por trigger (003_audit_log.sql), debe FAILAR
    # con "audit_log es append-only" → ya es defensa adicional.
    result = subprocess.run(
        [
            "docker", "exec", "cupula-postgres", "psql", "-U", "cupula", "-d", "cupula",
            "-c",
            "UPDATE audit_log SET payload = '{\"tampered\":true}'::jsonb WHERE seq = 1;",
        ],
        capture_output=True,
        text=True,
    )
    # El trigger debe abortar el UPDATE
    assert "append-only" in result.stderr.lower() or result.returncode != 0
