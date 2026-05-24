#!/usr/bin/env bash
# ===========================================================================
# setup-acls.sh — bootstrap de usuarios SCRAM + ACLs por servicio.
#
# Modos de uso:
#   ./setup-acls.sh                    → dry-run (solo muestra comandos)
#   ./setup-acls.sh --activate         → ejecuta realmente los comandos
#   ./setup-acls.sh --rollback         → elimina usuarios y ACLs creados
#
# Se ejecuta una vez tras `docker compose up --build`. Idempotente.
#
# Variables esperadas (definidas en .env):
#   KAFKA_SUPERUSER_PWD       — password del superuser 'admin'
#   KAFKA_PWD_SENSOR_INGEST
#   KAFKA_PWD_TRACK_FUSION
#   KAFKA_PWD_SWARM_CONTROLLER
#   KAFKA_PWD_HMI_GATEWAY
#   KAFKA_PWD_AUDIT_LOG
#   KAFKA_PWD_THREAT_CLASSIFIER
#   KAFKA_PWD_DECISION_ENGINE
# ===========================================================================

set -euo pipefail

MODE="${1:-dry-run}"
BROKER="${REDPANDA_BROKER:-redpanda:9093}"

# Si no hay TLS, caer a 9092 plaintext
if [ ! -f /etc/redpanda/certs/ca.crt ]; then
    BROKER="${REDPANDA_BROKER:-redpanda:9092}"
fi

RPK_TLS_OPTS=()
if [ -f /etc/redpanda/certs/ca.crt ]; then
    RPK_TLS_OPTS=(
        --tls-truststore /etc/redpanda/certs/ca.crt
        --tls-cert /etc/redpanda/certs/redpanda.crt
        --tls-key /etc/redpanda/certs/redpanda.key
        --user admin --password "${KAFKA_SUPERUSER_PWD}"
        --sasl-mechanism SCRAM-SHA-256
    )
fi
RPK="rpk --brokers $BROKER ${RPK_TLS_OPTS[*]}"

declare -A USERS=(
    [sensor-ingest]="$KAFKA_PWD_SENSOR_INGEST"
    [track-fusion]="$KAFKA_PWD_TRACK_FUSION"
    [swarm-controller]="$KAFKA_PWD_SWARM_CONTROLLER"
    [hmi-gateway]="$KAFKA_PWD_HMI_GATEWAY"
    [audit-log]="$KAFKA_PWD_AUDIT_LOG"
    [threat-classifier]="$KAFKA_PWD_THREAT_CLASSIFIER"
    [decision-engine]="$KAFKA_PWD_DECISION_ENGINE"
)

run_or_dry() {
    if [ "$MODE" = "--activate" ]; then
        echo "  [exec] $*"
        eval "$@"
    elif [ "$MODE" = "--rollback" ]; then
        # modo rollback: eliminar
        local cmd="$1"
        if [[ "$cmd" == "create" ]]; then
            local u="$2"
            echo "  [rollback] eliminando usuario $u..."
            rpk security user delete "$u" --brokers "$BROKER" ${RPK_TLS_OPTS:+"${RPK_TLS_OPTS[@]}"} 2>/dev/null || true
        fi
        if [[ "$cmd" == "acl" ]]; then
            echo "  [rollback] ACL se elimina en bulk con rpk acl delete"
        fi
    else
        echo "  [dry-run] $*"
    fi
}

echo "[redpanda] Modo: $MODE"
echo "[redpanda] Broker: $BROKER"

if [ "$MODE" = "--rollback" ]; then
    echo "[redpanda] Eliminando usuarios SCRAM..."
    for u in "${!USERS[@]}"; do
        run_or_dry "delete" "$u"
    done
    echo "[redpanda] Rollback completado. Recrear con --activate."
    exit 0
fi

echo "[redpanda] Creando usuarios SCRAM..."
for u in "${!USERS[@]}"; do
    pw="${USERS[$u]}"
    if [ -z "$pw" ]; then
        echo "  [warn] $u sin password definido en .env; skip"
        continue
    fi
    if [ "$MODE" = "--activate" ]; then
        rpk security user create "$u" --password "$pw" --mechanism SCRAM-SHA-256 \
            --brokers "$BROKER" --user admin --password "$KAFKA_SUPERUSER_PWD" \
            --sasl-mechanism SCRAM-SHA-256 \
            ${RPK_TLS_OPTS:+"${RPK_TLS_OPTS[@]}"} 2>/dev/null || \
            echo "  [info] usuario $u ya existe"
    else
        echo "  [dry-run] rpk security user create $u --mechanism SCRAM-SHA-256"
    fi
done

echo "[redpanda] Aplicando ACLs por servicio..."
apply_acl() {
    local user="$1" op="$2" topic="$3" group="${4:-}"
    local cmd="$RPK acl create --allow-principal \"User:$user\" --operation $op --topic $topic"
    [ -n "$group" ] && cmd="$cmd --group $group"
    run_or_dry "$cmd"
}

# sensor-ingest: produce a sensors.raw
apply_acl sensor-ingest produce sensors.raw

# track-fusion: consume sensors.raw, produce tracks.*
apply_acl track-fusion read sensors.raw track-fusion
apply_acl track-fusion produce tracks.confirmed
apply_acl track-fusion produce tracks.candidate

# threat-classifier: consume tracks.confirmed, produce alerts
apply_acl threat-classifier read tracks.confirmed threat-classifier
apply_acl threat-classifier produce alerts

# decision-engine: consume alerts/tracks.confirmed, produce recommendations
apply_acl decision-engine read alerts decision-engine
apply_acl decision-engine read tracks.confirmed decision-engine
apply_acl decision-engine produce recommendations

# hmi-gateway: consume tracks/alerts/recommendations; produce engagement.authorized
apply_acl hmi-gateway read tracks.confirmed hmi-gateway
apply_acl hmi-gateway read alerts hmi-gateway
apply_acl hmi-gateway read recommendations hmi-gateway
apply_acl hmi-gateway produce engagement.authorized

# swarm-controller: consume engagement.authorized
apply_acl swarm-controller read engagement.authorized swarm-controller

# audit-log: consume TODOS los topics + produce audit.events
for t in sensors.raw tracks.confirmed alerts recommendations engagement.authorized; do
    apply_acl audit-log read "$t" audit-log
done
apply_acl audit-log produce audit.events

# Deny all other topics by default — Redpanda enforces deny-by-default
# cuando `auto_create_topics_enabled=false`.

echo "[redpanda] ACLs OK."

if [ "$MODE" != "--activate" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║  DRY-RUN — para aplicar: ejecuta con --activate                ║"
    echo "║  Para revertir: ejecuta con --rollback                         ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
fi
