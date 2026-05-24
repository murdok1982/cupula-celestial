# 07 — Seguridad y criptografía

Este es el documento más sensible del programa. Cumple con:
- **CCN-STIC** (Centro Criptológico Nacional)
- **EU Restricted (R-UE/EU-R)** y **NATO Restricted**
- **Esquema Nacional de Seguridad** categoría ALTA
- **Common Criteria EAL4+** para subsistemas críticos

## Modelo de amenazas

| Actor | Capacidad | Vectores |
|-------|-----------|----------|
| APT estatal | Muy alta | Supply chain, 0-day, criptoanálisis |
| Insider hostil | Media-alta | Exfiltración, manipulación de modelos |
| Hacktivista | Media | DDoS, defacement, OSINT |
| Cibercriminal | Baja-media | Ransomware en redes corporativas adyacentes |
| EW/SIGINT enemigo | Alta | Jamming, spoofing, interceptación |

## Pilares

### 1. Defensa en profundidad
- Segmentación física (red ROJA / VERDE / NEGRA según clasificación).
- Diodo de datos unidireccional entre red operativa y administrativa.
- Zero-Trust internamente: mTLS entre todos los microservicios.
- Microsegmentación por SPIFFE/SPIRE.

### 2. Criptografía
- **AES-256-GCM** para datos en reposo y en tránsito (TLS 1.3).
- **ChaCha20-Poly1305** en enlaces dron-C2 (mejor en hardware sin AES-NI).
- **Curve25519 / X25519** para acuerdo de claves clásico.
- **Post-quantum ready (PQC)**:
  - **CRYSTALS-Kyber** (ML-KEM) — encapsulación.
  - **CRYSTALS-Dilithium** (ML-DSA) — firma.
  - Esquema híbrido X25519+Kyber durante transición.
- **HMAC-SHA-384** integridad.
- **TPM 2.0** en cada nodo C2; **HSM hardware** en cada dron (microchip dedicado:
  ATECC608, OPTIGA TPM, o módulo nacional).

### 3. Firma de firmware y modelos
- Cadena de boot medida (UEFI Secure Boot + IMA/EVM Linux).
- Firmware del dron firmado con certificado del MdD; rechazo de cualquier
  imagen no firmada.
- **Modelos VLM firmados**: hash del binario + metadata. El dron rechaza un
  modelo cuyo certificado no esté en su anillo de confianza.

### 4. Autorización y autenticación
- **FIDO2 / WebAuthn** con tokens hardware (YubiKey 5 FIPS, INCIBE certificado).
- Doble factor obligatorio para cualquier acción cinética.
- Biometría (huella) como segundo factor en HMI.
- Roles separados: vigilante (read-only), operador, oficial táctico, jefe de fuego.

### 5. Auditoría y forensia
- Log inmutable (append-only) con hash chain.
- Replicación a un nodo testigo aislado (write-once).
- Retención: 7 años, política GDPR-equivalente nacional.
- Exportable para juntas de investigación de incidentes.

### 6. Aislamiento del LLM táctico
- Corre en VM aislada (KVM con sVirt) o contenedor con seccomp + AppArmor.
- Sin acceso a red exterior; solo a su base RAG local cifrada.
- Sin capacidad de ejecutar acciones; solo emite JSON estructurado validado.
- Schema enforcement con validador determinista (json-schema, no LLM).

### 7. Anti-tampering en drones
- Carcasa con sensores de apertura.
- Procedimiento de **autodestrucción de claves** (zeroize del HSM) si:
  - Apertura no autorizada.
  - Caída en territorio hostil + tiempo sin comunicación.
  - Comando explícito del operador.
- Modelo VLM y pesos guardados cifrados; descifrado solo en RAM.

### 8. Cadena de suministro
- BOM auditada; componentes críticos con origen europeo/nacional siempre que
  exista alternativa.
- Análisis de firmware (CHIPSEC, fwhunt) de cada componente COTS.
- Reproducible builds del software (Nix / Bazel).

## Pruebas de seguridad obligatorias

- **Red Team**: ejercicio anual con CCN-CERT y CCD-COE.
- **Pentesting** continuo (Indra Cybersecurity, S21sec, Tarlogic).
- **Fuzzing** automatizado de protocolos MAVLink, parsing de mensajes.
- **Modelo adversarial**: ataques de patches físicos contra el VLM (ej. parches
  Eykholt-style sobre drones, camuflaje adversarial). Mitigación con
  certified robustness y ensemble.
