# Runbook Operacional — Cúpula Celestial

> Procedimientos para operadores SRE / SecOps.
> Estado: FASE 2 — endurecimiento operacional.

## Tabla de contenidos

1. [Arranque](#arranque)
2. [Parada](#parada)
3. [Healthchecks](#healthchecks)
4. [Rotación de certificados mTLS](#rotación-de-certificados-mtls)
5. [Rotación de clave HSM (SoftHSM)](#rotación-de-clave-hsm-softhsm)
6. [Rotación de credenciales SCRAM Redpanda](#rotación-de-credenciales-scram-redpanda)
7. [Recovery del audit-log](#recovery-del-audit-log)
8. [Respuesta a incidentes (high-level)](#respuesta-a-incidentes)
9. [Backup / restore](#backup--restore)

---

## Arranque

```bash
cd cupula-celestial/orquestador
cp .env.example .env       # editar secrets!

# 1) generar JWT keys (RSA 2048, RS256)
make certs

# 2) FASE 2: generar certs mTLS
./mtls/generate_mtls_certs.sh

# 3) arrancar stack
make up
# o
docker compose up -d
```

Tras arrancar:
- HMI gateway disponible en http://localhost:8080 (o https si TLS).
- Prometheus en http://localhost:9090.
- Grafana en http://localhost:3001 (admin / GRAFANA_ADMIN_PASSWORD).
- Audit-log API en http://localhost:9300/v1/verify_chain.

## Parada

```bash
docker compose stop                # detiene preservando datos
docker compose down                # detiene y elimina containers
docker compose down -v             # DESTRUCTIVO: elimina volúmenes
```

## Healthchecks

```bash
curl -fsS http://localhost:8080/health | jq
curl -fsS http://localhost:9300/health | jq
curl -fsS http://localhost:9300/v1/verify_chain | jq '.valid'
```

Comprobación rápida del estado de la cadena Merkle + firmas:
```bash
curl -s http://localhost:9300/v1/verify_chain | jq '{valid, total_events, total_batches, invalid: .invalid_batches | length}'
```

## Rotación de certificados mTLS

### Rotación individual (servicio comprometido o cert expirado)

```bash
rm orquestador/mtls/certs/<servicio>.crt orquestador/mtls/certs/<servicio>.key
./orquestador/mtls/generate_mtls_certs.sh   # regenera sólo lo que falta
docker compose restart <servicio>
```

### Rotación de toda la PKI (CA root comprometida)

```bash
# 1. respaldar
cp -r orquestador/mtls/certs orquestador/mtls/certs.backup.$(date +%s)
# 2. wipe
rm -rf orquestador/mtls/certs/
# 3. regenerar
./orquestador/mtls/generate_mtls_certs.sh
# 4. reiniciar todo el stack
docker compose down && docker compose up -d
```

## Rotación de clave HSM (SoftHSM)

⚠️ **Implica re-firmar el último año de batches** o invalidar la cadena
histórica (decisión política).

```bash
# 1. retirar key actual
docker compose exec audit-log psql $DATABASE_URL -c \
  "UPDATE audit_signing_keys SET retired_at = now() WHERE retired_at IS NULL;"

# 2. eliminar fichero local (el audit-log generará uno nuevo al arrancar)
docker compose stop audit-log
docker volume rm cupula-celestial_audit-hsm    # ATENCIÓN: irreversible

# 3. reiniciar (genera key nueva)
docker compose up -d audit-log

# 4. verificar nueva key registrada
curl -s http://localhost:9300/v1/signing_keys | jq
```

## Rotación de credenciales SCRAM Redpanda

(Solo aplica cuando SASL esté habilitado en Redpanda)

```bash
# 1. cambiar password de un usuario
docker compose exec redpanda rpk security user update sensor-ingest \
   --new-password "$NEW_PWD" \
   --user admin --password "$ADMIN_PWD" --sasl-mechanism SCRAM-SHA-256

# 2. actualizar .env con la nueva password
sed -i 's/^KAFKA_PWD_SENSOR_INGEST=.*/KAFKA_PWD_SENSOR_INGEST='"$NEW_PWD"'/' .env

# 3. reiniciar el servicio cliente
docker compose restart sensor-ingest
```

## Recovery del audit-log

### Si `/v1/verify_chain` reporta `valid:false`

```bash
curl -s http://localhost:9300/v1/verify_chain | jq
# Identifica `broken_at_seq` o `invalid_batches`.
```

Diagnóstico:
1. **Hash chain roto** (`broken_at_seq`): alguien manipuló filas. Los triggers
   PG (`audit_log_no_modify`) deberían haber impedido UPDATE/DELETE, así que
   investigar si BD fue accedida vía superuser.
2. **Firma batch inválida**: el `batch_root` fue recomputado y no coincide.
   Tampering directo a payload. **Incidente CRÍTICO**.

Procedimiento:
```bash
# 1. desconectar audit-log del bus (evita más inserts mientras investigas)
docker compose stop audit-log

# 2. snapshot del schema audit_log
docker compose exec postgres pg_dump -t audit_log -t audit_batches -t audit_signing_keys cupula > forensics_$(date +%s).sql

# 3. abrir incidente (ver INCIDENT_RESPONSE.md)
```

## Backup / restore

```bash
# Backup completo PostgreSQL (todas las tablas Cúpula)
docker compose exec postgres pg_dump cupula > backup-$(date +%Y%m%d).sql

# Backup específico de audit (siempre primero)
docker compose exec postgres pg_dump -t audit_log -t audit_batches -t audit_signing_keys cupula \
    | gzip > audit-backup-$(date +%Y%m%d).sql.gz

# Restore (entorno limpio)
cat backup-20260524.sql | docker compose exec -T postgres psql cupula
```

## Respuesta a incidentes

Ver [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md).
