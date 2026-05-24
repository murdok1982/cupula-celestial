.PHONY: up down reset logs health

up:
	docker compose up -d

down:
	docker compose down

reset:
	docker compose down -v

logs:
	docker compose logs -f mlflow-server

health:
	@echo "=== MLflow Server ==="
	@curl -sf http://localhost:5000/health | jq . || echo "MLflow not reachable"
	@echo ""
	@echo "=== MinIO Console ==="
	@curl -sf http://localhost:9001/minio/health/live | jq . || echo "MinIO not reachable"
	@echo ""
	@echo "=== MinIO S3 API ==="
	@curl -sf http://localhost:9000/minio/health/live || echo "MinIO S3 not reachable"
