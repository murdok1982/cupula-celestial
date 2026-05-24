# ===========================================================================
# SPIRE — Makefile para Cúpula Celestial.
# ===========================================================================

.PHONY: help setup teardown healthcheck register-list register-hmi register-swarm tokens

SPIRE_SERVER = cupula-spire-server
SPIRE_SOCK   = /var/lib/spire/spire-server.sock
SPIRE_ADMIN  = spire-server -socketPath $(SPIRE_SOCK)

help:
	@echo "SPIRE targets"
	@echo "  setup            - Arranca SPIRE server + agentes"
	@echo "  teardown         - Detiene todo y limpia datos"
	@echo "  healthcheck      - Verifica estado de server y agentes"
	@echo "  register-list    - Lista entries registradas"
	@echo "  register-hmi     - Registra entry para hmi-gateway"
	@echo "  register-swarm   - Registra entry para swarm-controller"
	@echo "  tokens           - Genera join tokens para agentes"

setup:
	docker compose -f docker-compose.yml up -d --build
	@echo "Esperando que SPIRE server esté listo..."
	@sleep 5
	$(MAKE) register-hmi
	$(MAKE) register-swarm

teardown:
	docker compose -f docker-compose.yml down -v

healthcheck:
	@echo "=== SPIRE Server ==="
	docker exec $(SPIRE_SERVER) spire-server healthcheck -socketPath $(SPIRE_SOCK) || echo "  [FAIL]"
	@echo "=== SPIRE Agent hmi ==="
	docker exec cupula-spire-agent-hmi spire-agent healthcheck -socketPath /var/lib/spire/agent.sock || echo "  [FAIL]"
	@echo "=== SPIRE Agent swarm ==="
	docker exec cupula-spire-agent-swarm spire-agent healthcheck -socketPath /var/lib/spire/agent.sock || echo "  [FAIL]"

register-list:
	docker exec $(SPIRE_SERVER) $(SPIRE_ADMIN) entry show

register-hmi:
	docker exec $(SPIRE_SERVER) $(SPIRE_ADMIN) entry create \
		-parentID "spiffe://cupula.local/spire/agent/join_token/hmi-agent" \
		-spiffeID "spiffe://cupula.local/svc/hmi-gateway" \
		-selector "unix:uid:0" \
		-ttl 3600

register-swarm:
	docker exec $(SPIRE_SERVER) $(SPIRE_ADMIN) entry create \
		-parentID "spiffe://cupula.local/spire/agent/join_token/swarm-agent" \
		-spiffeID "spiffe://cupula.local/svc/swarm-controller" \
		-selector "unix:uid:0" \
		-ttl 3600

tokens:
	@echo "=== Join token para agente hmi ==="
	docker exec $(SPIRE_SERVER) $(SPIRE_ADMIN) token generate -spiffeID spiffe://cupula.local/spire/agent/join_token/hmi-agent
	@echo "=== Join token para agente swarm ==="
	docker exec $(SPIRE_SERVER) $(SPIRE_ADMIN) token generate -spiffeID spiffe://cupula.local/spire/agent/join_token/swarm-agent
