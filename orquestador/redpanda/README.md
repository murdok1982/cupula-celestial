# Redpanda — SASL/SCRAM-SHA-256 + TLS

## Estado actual

Por defecto el stack arranca en **plaintext** (sin autenticación ni cifrado) en
el puerto `9092`, accesible solo intra-network Docker.

## Activar TLS + SASL/SCRAM (producción)

### 1. Generar certificados mTLS

```bash
cd ../mtls
./generate_mtls_certs.sh
```

Asegúrate de que `redpanda.crt`, `redpanda.key`, y `ca.crt` existen en
`mtls/certs/`.

### 2. Configurar `.env`

Añadir al `.env`:

```env
# SASL/SCRAM
KAFKA_SECURITY_PROTOCOL=SASL_SSL
KAFKA_SASL_MECHANISM=SCRAM-SHA-256
KAFKA_SUPERUSER_PWD=<generar password seguro>
KAFKA_PWD_SENSOR_INGEST=<password>
KAFKA_PWD_TRACK_FUSION=<password>
KAFKA_PWD_SWARM_CONTROLLER=<password>
KAFKA_PWD_HMI_GATEWAY=<password>
KAFKA_PWD_AUDIT_LOG=<password>
KAFKA_PWD_THREAT_CLASSIFIER=<password>
KAFKA_PWD_DECISION_ENGINE=<password>
```

### 3. Modificar `docker-compose.yml`

En el servicio `redpanda`:

-   Sustituir `PLAINTEXT://0.0.0.0:9092` por `SASL_SSL://0.0.0.0:9093`
-   Descomentar las líneas `REDPANDA_TLS_*` en `environment`
-   Descomentar las líneas del `command` de producción

### 4. Modificar `bootstrap.yaml`

El archivo `bootstrap.yaml` ya tiene la configuración SASL+TLS activa por
defecto. Si necesitas volver a plaintext PoC, descomentar el bloque PoC y
comentar el bloque de producción.

### 5. Arrancar y aplicar ACLs

```bash
docker compose up -d --build redpanda
# Ejecutar setup-acls.sh dentro del contenedor
docker compose exec redpanda bash /etc/redpanda/setup-acls.sh --activate
```

### 6. Verificar

```bash
# Comprobar health
docker compose exec redpanda rpk cluster health \
  --brokers redpanda:9093 \
  --tls-truststore /etc/redpanda/certs/ca.crt \
  --user admin --password "$KAFKA_SUPERUSER_PWD" \
  --sasl-mechanism SCRAM-SHA-256
```

## Rollback (volver a plaintext)

```bash
# 1. Rollback de ACLs+usuarios
docker compose exec redpanda bash /etc/redpanda/setup-acls.sh --rollback

# 2. Revertir cambios en docker-compose.yml (volver a PLAINTEXT)

# 3. Revertir bootstrap.yaml al bloque PoC

# 4. Re-arrancar
docker compose up -d redpanda
```

## Arquitectura de puertos

| Puerto | Protocolo | Uso |
|--------|-----------|-----|
| 9092   | PLAINTEXT | Dev/PoC (solo intra-network) |
| 9093   | SASL_SSL  | Producción (TLS + SCRAM-SHA-256) |
| 8082   | HTTP      | Pandaproxy (REST proxy) |

## Referencia

- [Redpanda SASL docs](https://docs.redpanda.com/current/manage/security/authentication/)
- [Redpanda ACL docs](https://docs.redpanda.com/current/manage/security/authorization/)
- [Cúpula Celestial — Seguridad](../docs/07-seguridad-criptografia.md)
