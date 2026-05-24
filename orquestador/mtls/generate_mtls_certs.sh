#!/usr/bin/env bash
# ===========================================================================
# generate_mtls_certs.sh — Cúpula Celestial mTLS bootstrap (DEV/PoC)
#
# Genera una CA raíz interna y un par de certs (cert + key) por servicio,
# todos con SAN DNS:<service-name>,DNS:localhost para mTLS bidireccional.
#
# En producción: sustituir por step-ca, Vault PKI o SPIFFE/SPIRE.
# Esta CA root local NO se debe distribuir; revocar tras provisioning.
# ===========================================================================

set -euo pipefail

cd "$(dirname "$0")"

CERTS_DIR="$(pwd)/certs"
mkdir -p "$CERTS_DIR"

SERVICES=(
    "sensor-ingest"
    "track-fusion"
    "swarm-controller"
    "hmi-gateway"
    "audit-log"
    "threat-classifier"
    "decision-engine"
    "policy-engine"
)

CA_KEY="$CERTS_DIR/ca.key"
CA_CRT="$CERTS_DIR/ca.crt"

if [[ ! -f "$CA_KEY" || ! -f "$CA_CRT" ]]; then
    echo "[mtls] Generando CA raíz interna..."
    openssl req -x509 -new -nodes \
        -newkey rsa:4096 \
        -keyout "$CA_KEY" \
        -out "$CA_CRT" \
        -days 3650 \
        -config ca.cnf
    chmod 0600 "$CA_KEY"
else
    echo "[mtls] CA ya existe, reutilizando."
fi

for svc in "${SERVICES[@]}"; do
    KEY="$CERTS_DIR/${svc}.key"
    CSR="$CERTS_DIR/${svc}.csr"
    CRT="$CERTS_DIR/${svc}.crt"
    CFG="$CERTS_DIR/${svc}.cnf"

    if [[ -f "$CRT" ]]; then
        echo "[mtls] cert ${svc} ya existe; skip"
        continue
    fi

    echo "[mtls] Generando cert para ${svc}..."
    sed "s/__SERVICE__/${svc}/g" service.cnf.tmpl > "$CFG"

    openssl req -new -nodes \
        -newkey rsa:4096 \
        -keyout "$KEY" \
        -out "$CSR" \
        -config "$CFG"

    openssl x509 -req \
        -in "$CSR" \
        -CA "$CA_CRT" \
        -CAkey "$CA_KEY" \
        -CAcreateserial \
        -out "$CRT" \
        -days 365 \
        -sha384 \
        -extfile "$CFG" \
        -extensions v3_req

    chmod 0600 "$KEY"
    rm -f "$CSR" "$CFG"
done

echo "[mtls] Certificados generados en $CERTS_DIR"
echo "[mtls] Distribución típica por servicio:"
echo "       TLS_CERT_PATH=/run/mtls/<service>.crt"
echo "       TLS_KEY_PATH=/run/mtls/<service>.key"
echo "       TLS_CA_PATH=/run/mtls/ca.crt"
echo "       MTLS_ENABLED=true"
echo "       MTLS_REQUIRE_CLIENT_CERT=true   # producción"
echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║  TRANSICIÓN A SPIFFE/SPIRE                                              ║"
echo "║                                                                          ║"
echo "║  El proyecto Cúpula Celestial migrará de mTLS manual a identidades      ║"
echo "║  SPIFFE gestionadas por SPIRE. Ver spire/README.md para la guía.        ║"
echo "║                                                                          ║"
echo "║  FASE 0 (actual):  mTLS manual — estos certificados                     ║"
echo "║  FASE 1 (próxima): SPIRE + mTLS coexistiendo                            ║"
echo "║  FASE 2 (futura):  Solo SPIRE — eliminar generate_mtls_certs.sh         ║"
echo "║                                                                          ║"
echo "║  Mapeo SPIFFE (preparado, no activo):                                    ║"
echo "║    spiffe://cupula.local/svc/sensor-ingest                               ║"
echo "║    spiffe://cupula.local/svc/track-fusion                                ║"
echo "║    spiffe://cupula.local/svc/swarm-controller                            ║"
echo "║    spiffe://cupula.local/svc/hmi-gateway                                 ║"
echo "║    spiffe://cupula.local/svc/audit-log                                   ║"
echo "║    spiffe://cupula.local/svc/threat-classifier                           ║"
echo "║    spiffe://cupula.local/svc/decision-engine                             ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
