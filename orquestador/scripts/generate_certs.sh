#!/usr/bin/env bash
# ===========================================================================
# Cúpula Celestial — generación de certificados mTLS y claves JWT (DEV).
# NO USAR EN PRODUCCIÓN. Producción exige PKI con CCN-CERT.
# ===========================================================================
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${DIR}/.secrets"
mkdir -p "${OUT}"
cd "${OUT}"

SUBJ_BASE="/C=ES/ST=Madrid/L=Madrid/O=MinDef-Cupula-Celestial/OU=Dev"

if [[ ! -f ca.key ]]; then
    echo "[certs] Generando CA dev"
    openssl genrsa -out ca.key 4096
    openssl req -x509 -new -key ca.key -days 730 -sha256 \
        -subj "${SUBJ_BASE}/CN=cupula-dev-ca" \
        -out ca.crt
fi

for service in sensor-ingest track-fusion swarm-controller hmi-gateway audit-log threat-classifier decision-engine; do
    if [[ ! -f "${service}.crt" ]]; then
        echo "[certs] Generando cert mTLS para ${service}"
        openssl genrsa -out "${service}.key" 2048
        openssl req -new -key "${service}.key" \
            -subj "${SUBJ_BASE}/CN=${service}" \
            -out "${service}.csr"
        cat > "${service}.ext" <<EOF
subjectAltName=DNS:${service},DNS:localhost,IP:127.0.0.1
extendedKeyUsage=serverAuth,clientAuth
EOF
        openssl x509 -req -in "${service}.csr" -CA ca.crt -CAkey ca.key \
            -CAcreateserial -out "${service}.crt" -days 365 -sha256 \
            -extfile "${service}.ext"
        rm "${service}.csr" "${service}.ext"
    fi
done

# Alias server.crt = primer cert (para servicios que lean genérico)
cp -f sensor-ingest.crt server.crt
cp -f sensor-ingest.key server.key

# Claves JWT RS256
if [[ ! -f jwt_private.pem ]]; then
    echo "[certs] Generando keypair JWT RS256"
    openssl genrsa -out jwt_private.pem 4096
    openssl rsa -in jwt_private.pem -pubout -out jwt_public.pem
fi

chmod 600 ./*.key jwt_private.pem 2>/dev/null || true
chmod 644 ./*.crt jwt_public.pem ca.crt 2>/dev/null || true

echo "[certs] OK. Artefactos en ${OUT}"
echo "[certs] AVISO: estos certificados son SOLO para desarrollo local."
