FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir httpx pydantic structlog numpy typer
COPY app ./app
CMD ["python", "-m", "app.main"]
