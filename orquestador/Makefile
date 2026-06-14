# Cúpula Celestial — Orquestador C2
# Targets de orquestación local del PoC.

.PHONY: help up down restart logs ps build test test-rust test-python test-opa test-integration test-security test-e2e test-rl simulate clean certs migrate fmt lint spire-up spire-down chaos chaos-list chaos-dry-run chaos-battery

help:
	@echo "Cúpula Celestial — targets"
	@echo "  make certs     - Genera certificados mTLS dev"
	@echo "  make up        - Arranca todo el stack (compose up -d)"
	@echo "  make down      - Detiene el stack"
	@echo "  make logs      - Sigue logs de todos los servicios"
	@echo "  make ps        - Estado de servicios"
	@echo "  make build     - Compila imágenes Docker"
	@echo "  make migrate   - Aplica migraciones SQL"
	@echo "  make test      - Tests unitarios (rust + python + opa)"
	@echo "  make test-rust - Tests unitarios Rust (workspace)"
	@echo "  make test-rl   - Tests RL allocator (swarm-controller)"
	@echo "  make test-python - Tests Python (threat-classifier, decision-engine)"
	@echo "  make test-opa  - Tests de policies OPA"
	@echo "  make test-integration - Tests de integración (pytest)"
	@echo "  make test-security - Tests de seguridad (pytest)"
	@echo "  make test-e2e  - Tests end-to-end con simuladores"
	@echo "  make simulate  - Demo end-to-end con sensor-simulator"
	@echo "  make fmt       - Formatea Rust y Python"
	@echo "  make lint      - Lint Rust (clippy) y Python (ruff)"
	@echo "  make clean     - Borra volúmenes y artefactos"
	@echo "  make spire-up  - Arranca SPIRE identity federation"
	@echo "  make spire-down- Detiene SPIRE"

certs:
	bash scripts/generate_certs.sh

up: certs
	docker compose up -d --build

down:
	docker compose down

restart: down up

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

build:
	docker compose build

migrate:
	docker compose exec postgres psql -U cupula -d cupula -f /migrations/001_initial_schema.sql || true
	docker compose exec postgres psql -U cupula -d cupula -f /migrations/002_tracks_timescale.sql || true
	docker compose exec postgres psql -U cupula -d cupula -f /migrations/003_audit_log.sql || true
	docker compose exec postgres psql -U cupula -d cupula -f /migrations/004_users_roles.sql || true
	docker compose exec postgres psql -U cupula -d cupula -f /migrations/005_session_tokens.sql || true
	docker compose exec postgres psql -U cupula -d cupula -f /migrations/006_webauthn_credentials.sql || true
	docker compose exec postgres psql -U cupula -d cupula -f /migrations/007_audit_batches.sql || true

test-rust:
	cargo test --workspace

test-python:
	cd services/threat-classifier && python -m pytest -q || true
	cd services/decision-engine && python -m pytest -q || true

test-opa:
	opa test services/policy-engine/policies services/policy-engine/tests

test: test-rust test-python test-opa

simulate:
	python tests/e2e/test_demo.py

# === Tests de integración ===
test-integration:
	pytest tests/integration -v --tb=short --timeout=30 || true

test-security:
	pytest tests/security -v --tb=short || true

test-e2e:
	python tests/e2e/test_demo.py

# === Tests RL allocator (swarm-controller) ===
test-rl:
	cargo test -p swarm-controller --test test_rl_allocator -- --nocapture

# === SPIRE ===
spire-up:
	$(MAKE) -C spire setup

spire-down:
	$(MAKE) -C spire teardown

# === Chaos Engineering ===
chaos:
	./chaos/run.sh

chaos-list:
	./chaos/run.sh --list

chaos-dry-run:
	./chaos/run.sh --dry-run

chaos-battery:
	./chaos/run.sh --config chaos/config.yaml

fmt:
	cargo fmt --all
	ruff format services/threat-classifier services/decision-engine || true

lint:
	cargo clippy --workspace --all-targets -- -D warnings
	ruff check services/threat-classifier services/decision-engine || true

clean:
	docker compose down -v
	cargo clean
	rm -rf .secrets/
