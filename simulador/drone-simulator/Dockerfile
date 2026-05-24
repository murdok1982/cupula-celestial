FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir structlog pymavlink
COPY app ./app
EXPOSE 14550/udp
CMD ["python", "-m", "app.main"]
