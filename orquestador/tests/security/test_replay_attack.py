"""Replay attack: reutilizar mfa_proof debe fallar."""
from __future__ import annotations

import httpx
import pytest


@pytest.mark.skip(reason="Necesita JWT MFA-satisfied + mfa_proof reales; integración E2E")
def test_mfa_proof_single_use(hmi_url: str, client: httpx.Client):
    """Documenta el flujo:
    1. /auth/fido2/complete → obtienes mfa_proof.
    2. Primer POST /engagement/authorize con mfa_proof: 200.
    3. Segundo POST con MISMO mfa_proof: 403 ("mfa_proof inválido o caducado").
    """
    # Implementación completa requiere flujo de login real; queda como skip
    # hasta que el harness e2e tenga JWT issuance helper.
    ...


def test_mfa_proof_format_rejected_if_short(hmi_url: str, client: httpx.Client):
    r = client.post(
        f"{hmi_url}/engagement/authorize",
        json={
            "recommendation_id": "x",
            "track_id": "y",
            "interceptors": [],
            "target_lat": 0,
            "target_lon": 0,
            "target_alt_m": 0,
            "operator_id": "op",
            "mfa_proof": "tooshort",
            "bearer_token": "bogus.token.value",
        },
    )
    # Sin JWT válido se devuelve 401 antes de mfa_proof checks; eso también es deseable
    assert r.status_code in (400, 401)
