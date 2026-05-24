# SECURITY_GAPS — Declarado vs Implementado vs Pendiente

> Referencia: `docs/07-seguridad-criptografia.md`.
> Estado **FASE 2 (endurecimiento operacional)** — actualizado 2026-05-24.
> Para detalle de las mejoras FASE 2 ver `SECURITY_AUDIT_FASE2.md`.

---

## Leyenda
- ✅ **OK** — declarado e implementado en PoC.
- 🟡 **PARCIAL** — implementado mínimo funcional; queda hardening / sustitución.
- ⛔ **STUB** — sin implementación real; bandera explícita activa.
- ⏳ **PENDIENTE** — sólo documentado; no abordado en PoC.

---

## 1. Defensa en profundidad

| Capacidad declarada | PoC implementación | Estado | Notas |
|---|---|---|---|
| Segmentación física (ROJA/VERDE/NEGRA) | Una sola red Docker `cupula` | ⏳ | Producción: VLANs físicas, firewalls L3/L4, diodo de datos. |
| Diodo de datos | No implementado | ⏳ | Requiere hardware específico (Owl, BAE, Nexor). |
| Zero-Trust mTLS entre microservicios | **F2: mTLS activo** con CA propia + rustls server/client; HMAC + JWT siguen como capa adicional | ✅ | Plan SPIFFE/SPIRE documentado en `MTLS_GUIDE.md`. |
| Microsegmentación SPIFFE/SPIRE | Plan documentado, no implementado | ⏳ | F3. |

## 2. Criptografía

| Algoritmo declarado | PoC implementación | Estado |
|---|---|---|
| TLS 1.3 (AES-256-GCM) | rustls disponible en deps (`reqwest tls-rustls`), TLS terminado por nginx en hmi-operador; certificados auto-firmados generados por `scripts/generate_certs.sh` | 🟡 |
| ChaCha20-Poly1305 dron-C2 | No implementado | ⏳ |
| Curve25519 / X25519 | No implementado | ⏳ |
| PQC híbrido (Kyber + X25519) | **F2: stub funcional** `crypto/pqc.rs` Kyber768+Dilithium3 con tests; feature `pqc-hybrid` off por defecto | 🟡 |
| HMAC-SHA-384 | HMAC-SHA-**256** entre servicios (suficiente para PoC) | 🟡 |
| **Argon2id m=65536/t=3/p=4** | Activo (OWASP 2023). Reseed automático del demo user al arrancar | ✅ |
| TPM 2.0 nodos C2 | No implementado | ⏳ |
| HSM en drones (ATECC608/OPTIGA) | No implementado (PENDIENTE-HW) | ⏳ |
| HSM signing audit-log batches | **F2: SoftHSM Ed25519** + abstracción `HsmSigner` trait + PKCS#11 stub | 🟡 |

## 3. Firma de firmware y modelos

| Capacidad | PoC | Estado |
|---|---|---|
| Secure Boot + IMA/EVM | No implementado | ⏳ |
| Firmware dron firmado | No implementado | ⏳ |
| Modelos VLM firmados | **F2: SignedModelLoader Ed25519** + bundle manifest+sig + scripts; integrado en Stage1/Stage2; LoRA OTA bundles | ✅ |

## 4. Autorización y autenticación

| Capacidad | PoC | Estado |
|---|---|---|
| **FIDO2 / WebAuthn hardware** | **F2: webauthn-rs REAL** (`auth/webauthn.rs`); endpoints `/auth/webauthn/{register,authenticate}/{begin,finish}`; counter rollback detection; tabla `webauthn_credentials`. Default `FIDO2_REAL_VERIFY=true`. Hardware keys (YubiKey FIPS) compatibles. | ✅ |
| **Doble factor obligatorio para acción cinética** | `engagement_authorize` exige JWT con `mfa_satisfied=true` + `mfa_proof` nonce server-side (Redis 60s single-use) | ✅ |
| Biometría 2º factor HMI | No implementado | ⏳ |
| Roles separados (VIGILANTE/OPERADOR/OPS_OFFICER/OFICIAL_TACTICO/JEFE_FUEGO) | Implementado en `roles` table + OPA `authorization.rego` con jerarquía + hmi-gateway `authz::role_rank`/`required_rank` con tests | ✅ |
| Login con consulta a BD + Argon2id + lockout (5 fallos, 15 min) | Activo (sustituye hardcoded del PoC original) | ✅ |
| Refresh token rotation | `/auth/refresh` con sessions BD: revoca anterior, emite nuevo | ✅ |
| Logout con blacklist JWT | `/auth/logout` añade jti a Redis con TTL=exp restante | ✅ |
| Rate limiting | `tower-governor` en login (5/min), fido2 (10/min), authorize (30/min), sensor-ingest (10k/min) | ✅ |
| Headers de seguridad (HSTS, X-Frame, etc.) | Middleware `security_headers` activo en hmi-gateway | ✅ |

## 5. Auditoría y forensia

| Capacidad | PoC | Estado |
|---|---|---|
| Log inmutable con hash chain | `audit-log` service activo. Cadena SHA-256 prev/curr en BD | ✅ |
| Replicación a nodo testigo aislado | No implementado | ⏳ |
| Retención 7 años | No implementado | ⏳ |
| Validación de `recommendation_id` contra audit-log | hmi-gateway y swarm-controller verifican antes de autorizar/ejecutar | ✅ |

## 6. Aislamiento del LLM táctico

| Capacidad | PoC | Estado |
|---|---|---|
| VM/contenedor sandbox | **F2: seccomp + AppArmor** perfiles; `cap_drop:[ALL]`; `no-new-privileges` | ✅ |
| Sin acceso a red exterior | network policies AppArmor (Linux host) | 🟡 |
| Schema enforcement | jsonschema en decision-engine | ✅ |

## 7. Anti-tampering en drones

| Capacidad | PoC | Estado |
|---|---|---|
| Sensores apertura carcasa | No implementado | ⏳ |
| Zeroize HSM | No implementado | ⏳ |
| Cifrado pesos modelo en disco | No implementado | ⏳ |

## 8. Cadena de suministro

| Capacidad | PoC | Estado |
|---|---|---|
| BOM auditada | docs/10-hardware-bom.md (no operativo) | ⏳ |
| Análisis firmware COTS | No implementado | ⏳ |
| Reproducible builds | **F2: Nix flake esqueleto** + docs; build hermetic completo pendiente | 🟡 |
| SBOM CycloneDX | **F2:** workflow GitHub Actions genera SBOM Rust/Python/npm | ✅ |
| Dependency scanning | **F2:** cargo-audit + cargo-deny + pip-audit + npm-audit + OWASP DC en CI | ✅ |

---

## Bloqueos para promover a producción (actualizado FASE 2)

1. ~~Implementar `webauthn-rs`~~ ✅ APLICADA.
2. ~~mTLS entre microservicios~~ ✅ APLICADA. Próximo paso: SPIRE/SPIFFE.
3. SASL_SCRAM + TLS + ACLs en Redpanda — **artefactos listos**, activar `command:` del compose.
4. Hardware HSM/TPM (ATECC608, YubiKey FIPS) — abstracción Rust lista (`HsmSigner`).
5. Diodo de datos red ROJA↔VERDE — PENDIENTE-HW.
6. ~~Firma de modelos VLM~~ ✅ APLICADA.
7. Sustitución del catálogo `geofences.json` por bundle OPA firmado con coordenadas reales — PENDIENTE (requiere dataset MoD clasificado).
8. Article 36 review (Geneva Conv.) y auditoría CCN-CERT — PENDIENTE legal/oficial.
