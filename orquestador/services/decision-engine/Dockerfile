FROM python:3.12-slim AS runtime
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl \
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
        httpx \
        jsonschema \
        numpy \
        opentelemetry-api \
        opentelemetry-sdk

COPY --chown=cupula:cupula app ./app
COPY --chown=cupula:cupula rag_corpus ./rag_corpus
COPY --chown=cupula:cupula schemas ./schemas

USER cupula
EXPOSE 8002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
