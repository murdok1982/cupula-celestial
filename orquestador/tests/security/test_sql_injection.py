"""SQL injection: payloads en login, sensors, refresh."""
from __future__ import annotations

import httpx


SQLI_PAYLOADS = [
    "' OR '1'='1",
    "admin'--",
    "'; DROP TABLE users;--",
    "' UNION SELECT NULL,NULL,NULL,NULL,NULL--",
    "1' OR sleep(5)--",
    "' OR EXISTS(SELECT 1 FROM pg_user)--",
]


def test_login_sqli_resilient(hmi_url: str, client: httpx.Client):
    for payload in SQLI_PAYLOADS:
        r = client.post(
            f"{hmi_url}/auth/login",
            json={"username": payload, "password": "anything"},
        )
        # NUNCA 200 con SQLi en usuario
        assert r.status_code in (
            400,
            401,
            422,
            429,
        ), f"SQLi en login devolvió {r.status_code} para payload {payload}"
        body = r.text.lower()
        # No debe exponer detalles de BD
        for forbidden in ["postgres", "sqlx", "syntax error", "asyncpg", "psycopg"]:
            assert forbidden not in body, f"BD leak con payload {payload}: {body[:200]}"


def test_login_password_sqli_resilient(hmi_url: str, client: httpx.Client):
    for payload in SQLI_PAYLOADS:
        r = client.post(
            f"{hmi_url}/auth/login",
            json={"username": "operador_demo", "password": payload},
        )
        assert r.status_code in (400, 401, 422, 429)


def test_refresh_sqli_resilient(hmi_url: str, client: httpx.Client):
    for payload in SQLI_PAYLOADS:
        r = client.post(
            f"{hmi_url}/auth/refresh",
            json={"refresh_token": payload},
        )
        assert r.status_code in (400, 401, 422, 429, 503)
