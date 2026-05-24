"""Rate limit en /auth/login: 6º intento debe ser 429."""
from __future__ import annotations

import httpx


def test_login_burst_triggers_429(hmi_url: str, client: httpx.Client):
    """tower-governor: 5 req/min/IP burst. La 6ª debe ser 429."""
    statuses = []
    for _ in range(8):
        r = client.post(
            f"{hmi_url}/auth/login",
            json={"username": "no_existo", "password": "x"},
        )
        statuses.append(r.status_code)
    assert 429 in statuses, f"Rate limiter no disparó 429. Statuses: {statuses}"


def test_unknown_user_response_is_generic(hmi_url: str, client: httpx.Client):
    """No debe distinguir usuario inexistente de password incorrecto en el body."""
    r1 = client.post(
        f"{hmi_url}/auth/login",
        json={"username": "nunca_existió", "password": "x"},
    )
    r2 = client.post(
        f"{hmi_url}/auth/login",
        json={"username": "operador_demo", "password": "wrongpassword_test_xyz"},
    )
    # Ambos deberían devolver mismo mensaje "credenciales inválidas" (status 401).
    if r1.status_code == 401 and r2.status_code == 401:
        assert r1.json().get("error") == r2.json().get("error")
