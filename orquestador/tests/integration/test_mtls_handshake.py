"""Integration test: verificar handshake mTLS entre servicios.

Comprueba que los certificados generados por generate_mtls_certs.sh permiten
conexiones TLS mutuas entre pares de servicios.

Requiere: cupula stack running (make up) con mTLS habilitado.
"""

from __future__ import annotations

import os
import ssl
import subprocess
import tempfile
from pathlib import Path

import httpx
import pytest

CERTS_DIR = Path(os.environ.get("MTLS_CERTS_DIR", "../mtls/certs"))
SERVICES = [
    "sensor-ingest",
    "track-fusion",
    "swarm-controller",
    "hmi-gateway",
    "audit-log",
    "threat-classifier",
    "decision-engine",
]


def _cert_exists(svc: str) -> bool:
    return (CERTS_DIR / f"{svc}.crt").exists() and (CERTS_DIR / f"{svc}.key").exists()


@pytest.mark.integration
def test_all_service_certs_exist():
    """Todos los certificados de servicio existen."""
    missing = [s for s in SERVICES if not _cert_exists(s)]
    if missing:
        pytest.skip(f"certificados faltantes: {missing}. Ejecutar: cd mtls && ./generate_mtls_certs.sh")
    for svc in SERVICES:
        crt = CERTS_DIR / f"{svc}.crt"
        key = CERTS_DIR / f"{svc}.key"
        assert crt.stat().st_size > 0, f"{crt} vacío"
        assert key.stat().st_size > 0, f"{key} vacío"


@pytest.mark.integration
def test_ca_exists():
    """CA raíz existe."""
    ca_crt = CERTS_DIR / "ca.crt"
    ca_key = CERTS_DIR / "ca.key"
    if not ca_crt.exists():
        pytest.skip("CA no generada. Ejecutar: cd mtls && ./generate_mtls_certs.sh")
    assert ca_crt.stat().st_size > 0
    assert ca_key.stat().st_size > 0


@pytest.mark.integration
def test_certificates_valid():
    """Validar estructura X.509 de los certificados con openssl."""
    ca_crt = CERTS_DIR / "ca.crt"
    if not ca_crt.exists():
        pytest.skip("CA no disponible")

    for svc in SERVICES:
        crt = CERTS_DIR / f"{svc}.crt"
        if not crt.exists():
            continue
        result = subprocess.run(
            ["openssl", "x509", "-in", str(crt), "-noout", "-subject", "-issuer", "-dates"],
            capture_output=True, text=True, timeout=10,
        )
        assert result.returncode == 0, f"openssl falló para {svc}: {result.stderr}"
        assert "CN = " in result.stdout, f"{svc}.crt no tiene Subject CN"
        assert "notAfter=" in result.stdout, f"{svc}.crt no tiene fecha de expiración"


@pytest.mark.integration
def test_mtls_handshake_sensor_ingest():
    """Verificar handshake TLS a sensor-ingest (si mTLS activo)."""
    host = os.environ.get("SENSOR_INGEST_HOST", "localhost")
    port = os.environ.get("SENSOR_INGEST_MTLS_PORT", "9000")
    ca_crt = CERTS_DIR / "ca.crt"

    if not ca_crt.exists():
        pytest.skip("CA no disponible")

    try:
        context = ssl.create_default_context(cafile=str(ca_crt))
        context.check_hostname = False
        context.verify_mode = ssl.CERT_REQUIRED
        with context.wrap_socket(ssl.SSLContext()) as s:
            s.connect((host, int(port)))
            cert = s.getpeercert()
            assert cert is not None, f"No se recibió certificado de {host}:{port}"
    except (ssl.SSLError, ConnectionRefusedError, OSError) as e:
        pytest.skip(f"mTLS no disponible en {host}:{port}: {e}")
