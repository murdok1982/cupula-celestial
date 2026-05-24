"""Tests negativos: manipulación del JWT (firma, payload, alg confusion)."""
from __future__ import annotations

import base64
import json

import httpx


def _b64url(d: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")


def test_unsigned_jwt_rejected(hmi_url: str, client: httpx.Client):
    """JWT con alg=none debe ser rechazado."""
    header = _b64url({"alg": "none", "typ": "JWT"})
    payload = _b64url(
        {
            "sub": "attacker",
            "role": "JEFE_FUEGO",
            "mfa_satisfied": True,
            "iss": "cupula-celestial",
            "aud": "hmi-operador",
            "exp": 9999999999,
        }
    )
    token = f"{header}.{payload}."
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
            "mfa_proof": "a" * 64,
            "bearer_token": token,
        },
    )
    assert r.status_code in (400, 401), f"alg=none aceptado: {r.text}"


def test_payload_tampering_rejected(hmi_url: str, client: httpx.Client):
    """Modificar payload sin re-firmar debe invalidar el JWT."""
    # Token "real" hipotético; modificamos role a JEFE_FUEGO
    fake = (
        "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9."
        + _b64url({"sub": "x", "role": "JEFE_FUEGO", "mfa_satisfied": True})
        + ".invalid_signature"
    )
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
            "mfa_proof": "a" * 64,
            "bearer_token": fake,
        },
    )
    assert r.status_code in (400, 401)


def test_alg_confusion_hs256_attack(hmi_url: str, client: httpx.Client):
    """Algoritmo confusion (RS256 → HS256 con pubkey como secret): debe fallar."""
    header = _b64url({"alg": "HS256", "typ": "JWT"})
    payload = _b64url(
        {"sub": "attacker", "role": "JEFE_FUEGO", "mfa_satisfied": True, "exp": 9999999999}
    )
    token = f"{header}.{payload}.AAAA"
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
            "mfa_proof": "a" * 64,
            "bearer_token": token,
        },
    )
    assert r.status_code in (400, 401)
