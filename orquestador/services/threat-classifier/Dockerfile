FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

# H-ALT-006: usuario sin privilegios
RUN useradd -r -u 10001 -m -d /home/cupula cupula \
    && chown -R cupula:cupula /app

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
        fastapi \
        "uvicorn[standard]" \
        "pydantic>=2.8" \
        "pydantic-settings>=2.4" \
        structlog \
        aiokafka \
        asyncpg \
        "sqlalchemy[asyncio]" \
        onnxruntime \
        numpy \
        httpx \
        opentelemetry-api \
        opentelemetry-sdk \
        opentelemetry-exporter-otlp

COPY --chown=cupula:cupula app ./app
COPY --chown=cupula:cupula models_artifacts ./models_artifacts

USER cupula
EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
