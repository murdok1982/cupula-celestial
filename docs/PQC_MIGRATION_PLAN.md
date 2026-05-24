# Plan de Migración Post-Cuántica — Cúpula Celestial

## Contexto

NIST publicó el primer set de estándares PQC (FIPS 203 ML-KEM, FIPS 204 ML-DSA,
FIPS 205 SLH-DSA) en agosto 2024. La amenaza "harvest now, decrypt later" obliga
a sistemas de defensa críticos a iniciar migración HOY aunque el quantum
relevante esté ~10 años fuera.

## Estado actual (FASE 2)

| Capa | Algoritmo clásico | PQ candidato | Estado |
|---|---|---|---|
| JWT firma | RS256 (RSA 2048) | Dilithium3 / ML-DSA-65 | Stub funcional (`pqc-hybrid` feature) |
| KEM (TLS handshake) | ECDHE (X25519) | Kyber768 / ML-KEM-768 | Stub funcional |
| HMAC | SHA-256 | SHA-3 / SHAKE256 | OK (SHA-256 sigue siendo PQ-resistant) |
| Argon2id | password hashing | — | OK (sin sustituto PQ necesario) |
| Audit batch signing | Ed25519 (HSM) | Dilithium3 (HSM) | Pendiente firmware HSM |

## Estrategia híbrida (no rotura)

Durante la transición:
- Firmas: `output = (sig_classic || sig_pq)`. Verificador acepta si AMBAS validan.
- KEM:   `shared_secret = HKDF-SHA384(ss_classic || ss_pq)`. Si una falla, todo falla.

Esto da:
- Compatibilidad con verificadores legacy (que ignoran el sufijo PQ).
- Defensa retroactiva contra quantum (si clásica cae, PQ queda).
- Reversibilidad (podemos volver sólo clásica si descubren weakness PQ).

## Roadmap (12 meses tras gate FASE 2)

### Fase A (mes 1-3): Foundations
- Feature flag `PQC_HYBRID_ENABLED` en hmi-gateway (LISTO en FASE 2 PoC).
- `crypto/pqc.rs` con funciones helper Kyber768/Dilithium3 (LISTO).
- Tests roundtrip sobre payloads JWT-equivalentes (LISTO).

### Fase B (mes 4-6): Audit-log signing
- Sustituir `ed25519-dalek` por wrapper híbrido en `audit-log/src/hsm/`.
- Migrar `audit_signing_keys` schema para almacenar `public_key_classic`,
  `public_key_pq` separados.
- Re-firmar el último año de batches con clave híbrida (one-time backfill).

### Fase C (mes 7-9): TLS PQC
- Esperar a `rustls` con soporte oficial Kyber (en draft 2026-Q2).
- Habilitar en endpoints internos mTLS PQ-first.
- Fallback ECDHE para clientes legacy (HMI cargados con cert antiguo).

### Fase D (mes 10-12): Drone link
- ChaCha20-Poly1305 + Kyber para enlace C2-dron (radio LoRa / 4G).
- Requiere actualizar firmware Jetson edge nodes con `pqcrypto` (PyPI).

## Dependencias técnicas elegidas

| Componente | Crate Rust | Python pkg |
|---|---|---|
| Kyber768 KEM | `pqcrypto-kyber` 0.8 | `pqcrypto-kyber` |
| Dilithium3 signature | `pqcrypto-dilithium` 0.5 | `pqcrypto-dilithium` |
| `liboqs` low-level | `oqs` (futuro stable) | `oqs-python` |

> NOTA: `pqcrypto-*` crates están basados en PQClean (referencia FIPS). Para
> certificación CC EAL4+ usaremos `liboqs` con audited builds (Open Quantum Safe).

## Limitaciones conocidas

- **Tamaño de firma**: Dilithium3 = 3309 bytes (vs Ed25519 = 64 bytes). Impacto
  en latencia de JWT en redes con MTU bajo (LoRa). Mitigación: usar Falcon-512
  (666 bytes) cuando esté estable.
- **Tamaño de KEM**: Kyber768 ciphertext = 1088 bytes. Impacto en handshake TLS
  por slow-start TCP.
- **HSM compat**: ningún HSM consumer (YubiHSM2) soporta Dilithium a 2026-05.
  Migración A producción requiere PKCS#11 v3.1+ extensiones vendor (Thales,
  Entrust). PENDIENTE-HW.

## TLS post-cuántica

`rustls-pqc` (fork experimental) ya permite handshakes Kyber. Plan:
1. Probar en branch `tls-pqc-experimental` con `cargo update -p rustls --precise <pqc-fork>`.
2. Validar interop con NSS PQC test server (mozilla.org/pqc-interop).
3. Promover cuando rustls upstream merge soporte (target 2026 Q4).

## Decisiones pendientes

- [ ] ¿Adoptar `liboqs` C library o quedarse con `pqcrypto-*` puro Rust?
- [ ] ¿Hardware HSM con extensión PKCS#11 v3.1+ (Thales) o sólo software?
- [ ] ¿Re-firma retroactiva de audit-log (1 año) o sólo eventos nuevos?
- [ ] Política con CCN-CERT sobre certificación PQ (CC EAL).
