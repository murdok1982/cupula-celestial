#!/usr/bin/env bash
# ===========================================================================
# Cúpula Celestial — Chaos Engineering Runner Script
# ===========================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

export PYTHONPATH="${PROJECT_DIR}:${PYTHONPATH:-}"

usage() {
    cat <<EOF
Cúpula Celestial — Chaos Engineering Runner

USO:
  ./run.sh                          Ejecuta battery completa (config.yaml)
  ./run.sh --list                   Lista experimentos disponibles
  ./run.sh --dry-run                Muestra plan sin ejecutar
  ./run.sh --experiment <type>      Experimento único
         [--service <name>]
         [--target <service>]
         [--duration <secs>]
         [--latency-ms <ms>]
         [--jitter-ms <ms>]
         [--loss-percent <pct>]
         [--cpu-percent <pct>]
         [--memory-mb <mb>]
  ./run.sh --config <path>          Battery personalizada
  ./run.sh --strategy <strategy>    sequential | random | continuous
  ./run.sh --output <dir>           Directorio para reporte

EJEMPLOS:
  ./run.sh --list
  ./run.sh --dry-run
  ./run.sh --experiment kill_service --service redpanda --duration 30
  ./run.sh --experiment latency_injection --service track-fusion --latency-ms 500
  ./run.sh --config mi-battery.yaml --strategy random
EOF
    exit 0
}

if [[ $# -eq 0 ]]; then
    set -- --config "$SCRIPT_DIR/config.yaml"
fi

if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    usage
fi

install_deps() {
    if ! python -c "import yaml, docker" 2>/dev/null; then
        echo "[chaos] Instalando dependencias Python..."
        pip install pyyaml docker httpx structlog 2>/dev/null || true
    fi
}

install_deps

echo "[chaos] Ejecutando: python -m chaos.runner $*"
exec python -m chaos.runner "$@"
