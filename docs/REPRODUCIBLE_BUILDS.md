# Reproducible Builds — Cúpula Celestial

## Objetivo

Garantizar que cualquier persona con el código fuente puede producir un binario
**idéntico bit-a-bit** al desplegado en producción. Esto:
- Permite verificar que la imagen Docker no fue alterada en CI.
- Habilita auditoría externa (CCN-CERT).
- Refuerza supply-chain security (SLSA Level 3+).

## Estado actual (FASE 2)

| Componente | Reproducible? | Bloqueador |
|---|---|---|
| Rust workspace | 🟡 parcial | Timestamps en metadatos. Resolver con `SOURCE_DATE_EPOCH`. |
| Python services | 🟡 | pip resolver no determinista; usar `--require-hashes` |
| Docker images | 🟡 | Capas con timestamps. Usar `buildkit` + `--no-cache` |
| HMI npm bundle | ❌ | Frontend fuera de scope backend |

## Estrategia: Nix flake

Se ha añadido un esqueleto de Nix flake en `orquestador/flake.nix` (ver abajo).

### Beneficios

- Pin completo de versiones (toolchain Rust, libc, openssl).
- Build hermetic (sin acceso a internet en runtime).
- Cache compartido entre devs y CI.

### Uso

```bash
# Instalar Nix (idempotente)
sh <(curl -L https://nixos.org/nix/install) --daemon

# Habilitar flakes (una vez)
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" > ~/.config/nix/nix.conf

# Build
cd orquestador
nix build .#hmi-gateway
nix build .#audit-log

# Run dev shell con toolchain congelada
nix develop

# Verificar reproducibilidad (build dos veces, comparar)
nix build .#hmi-gateway -o result-a
nix build .#hmi-gateway --rebuild -o result-b
diff <(sha256sum result-a/bin/hmi-gateway) <(sha256sum result-b/bin/hmi-gateway)
# Output esperado: vacío (idéntico)
```

## SOURCE_DATE_EPOCH

Para cargo builds fuera de Nix:

```bash
export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)
cargo build --release
```

## Verificación SLSA

```bash
# Generar provenance attestation
slsa-verifier verify-artifact \
    --provenance-path target/release/hmi-gateway.intoto.jsonl \
    --source-uri github.com/cupula-celestial/orquestador \
    target/release/hmi-gateway
```

## Pendientes

- [ ] Completar `flake.nix` con todos los servicios.
- [ ] Pin de Python con `requirements.txt --require-hashes`.
- [ ] BuildKit + `--platform` consistente en CI.
- [ ] Provenance attestation en GitHub Actions (SLSA L3).
- [ ] Verificación cross-build entre CI hosts (Linux/Mac/Windows).
