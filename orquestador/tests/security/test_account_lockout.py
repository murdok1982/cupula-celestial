"""5 fallos consecutivos → cuenta bloqueada (423 Locked)."""
from __future__ import annotations

import httpx
import pytest


@pytest.mark.skip(
    reason=(
        "Destructivo: bloquearía operador_demo. Ejecutar en entorno test aislado y "
        "resetear `failed_attempts` después."
    )
)
def test_account_lockout_after_5_fails(hmi_url: str, client: httpx.Client):
    user = "operador_demo"
    last = None
    for _ in range(6):
        last = client.post(
            f"{hmi_url}/auth/login",
            json={"username": user, "password": "wrong_pw_for_test"},
        )
    assert last is not None
    assert last.status_code in (
        423,
        429,
    ), f"Expected 423 Locked tras 5 fallos, got {last.status_code}"
